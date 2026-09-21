/**
 * 批量视频导出：把「这一批怎么录」和「这一组录多久」算清楚。
 *
 * 这里只有纯计算，不碰浏览器 API —— 渲染画面与录制在 components/batch-video-render.ts。
 *
 * 之所以不另起一套节奏：批量和聊天页共用同一条时间轴（chat-playback）、同一套画面尺寸
 * （chat-video）与同一套滚动规划（chat-scroll-video）。所以「在批量页录的那一段」和
 * 「在聊天页把同一组录一遍」是同一个东西，只是这里一次算很多组。
 *
 * 视频模式的设置整批共用一份，来自「我的偏好」：录制方式、画面尺寸、节奏、提示音
 * 在批量页改过之后，回聊天页录单个视频也是同一套。
 */
import type { ChatMessage } from '@/types'
import { buildPlaybackTimeline, normalizePaceMs, notifyEvents, type NotifyEvent, type PlaybackTimeline } from './chat-playback'
import { scrollVideoPlan, type ScrollVideoPlan } from './chat-scroll-video'
import { videoSizeOption, type VideoSizeId, type VideoSizeOption } from './chat-video'
import { clampVideoSidePad } from './video-padding'
import { defaultScreenSize, type ScreenSize } from './phone-size'
import type { PrefVideoMode } from './workspace-prefs'

/** 逐条播放时渲染一帧的粗略开销；滚动模式合成一张长图的粗略开销。口径与聊天页的耗时提示一致。 */
export const frameRenderCostMs = 300
export const scrollRenderCostMs = 3000

/** 视频模式下「这一批怎么录」：整批共用一份。 */
export interface BatchVideoPlan {
  mode: PrefVideoMode
  /** 画面尺寸：已按当前屏幕尺寸解析成具体宽高（「跟随屏幕」那一档也在这里落地）。 */
  size: VideoSizeOption
  /** 两侧安全留白（输出像素），整批共用。见 lib/video-padding.ts。 */
  sidePad: number
  /**
   * 逐条播放的间隔（毫秒），整批共用。
   *
   * 这里只有**统一间隔**，没有聊天页那套逐条间隔：逐条间隔是按「第几条」排的，
   * 而每一组是另一段对话、条数也不一样，把它套过来只会让每一组都变得莫名其妙。
   * 批量页的视频设置弹窗因此只给统一间隔（见 VideoExportDialog 的 groupCount 分支）。
   */
  paceMs: number
  soundEnabled: boolean
  soundReceive: boolean
  soundSend: boolean
  /** 滚动模式的时长规划；逐条模式用不到，但一并算好，切回去时不用再问一次。 */
  scroll: ScrollVideoPlan
}

export interface BatchVideoChoice {
  mode: PrefVideoMode
  sizeId: VideoSizeId
  /** 统一间隔（毫秒）。逐条间隔在批量页不适用，理由见 BatchVideoPlan.paceMs 的注释。 */
  paceMs: number
  soundEnabled: boolean
  soundReceive: boolean
  soundSend: boolean
  scrollDurationSeconds: number
  sidePad: number
}

/** 组装一份整批共用的录制方案。 */
export function batchVideoPlan(choice: BatchVideoChoice, screen: ScreenSize = defaultScreenSize): BatchVideoPlan {
  return {
    mode: choice.mode,
    size: videoSizeOption(choice.sizeId, screen),
    // 与聊天页共用同一份偏好，落到录制前再夹一次，脏值不会把画面挤出画布。
    sidePad: clampVideoSidePad(choice.sidePad),
    // 与聊天页共用同一份偏好的统一间隔，落到录制前再夹一次，脏值不会把节奏算成负数。
    paceMs: normalizePaceMs(choice.paceMs),
    soundEnabled: choice.soundEnabled,
    soundReceive: choice.soundReceive,
    soundSend: choice.soundSend,
    scroll: scrollVideoPlan(choice.scrollDurationSeconds * 1000),
  }
}

/** 某一组的录制任务。 */
export interface BatchVideoTask {
  plan: BatchVideoPlan
  /** 逐条模式的消息时间轴；滚动模式不用时间轴，为 null。 */
  timeline: PlaybackTimeline | null
  /** 逐条模式要发声的时刻；滚动模式恒为空。 */
  notifyAt: NotifyEvent[]
  /** 这段视频的时长（毫秒），也就是录制要花掉的实时时长。 */
  totalMs: number
  /** 预计耗时 = 渲染 + 实时录制，用于在开始之前给出整批的完成时间。 */
  estimateMs: number
  messageCount: number
}

/**
 * 某一组的录制任务。
 *
 * 逐条模式的提示音开关直接进时间轴：关掉的类别在这一组里根本不排期，
 * 所以 notifyAt 天然是空的，不必在录制阶段再筛一次。
 */
export function batchVideoTask(messages: Pick<ChatMessage, 'type' | 'senderId'>[], plan: BatchVideoPlan, selfId: number | null): BatchVideoTask {
  const messageCount = messages.length
  if (plan.mode === 'scroll') {
    // 滚动模式整段对话一开始就都在画面里，没有「收到消息」这一刻，所以整段无声。
    return {
      plan,
      timeline: null,
      notifyAt: [],
      totalMs: plan.scroll.durationMs,
      estimateMs: plan.scroll.durationMs + scrollRenderCostMs,
      messageCount,
    }
  }
  const timeline = buildPlaybackTimeline(messages, {
    paceMs: plan.paceMs,
    selfId,
    notifyReceived: plan.soundEnabled && plan.soundReceive,
    notifySent: plan.soundEnabled && plan.soundSend,
  })
  return {
    plan,
    timeline,
    notifyAt: notifyEvents(timeline),
    totalMs: timeline.totalMs,
    estimateMs: timeline.totalMs + (messageCount + 1) * frameRenderCostMs,
    messageCount,
  }
}

/** 整批的预计耗时：每组先渲染画面，再按各自的时长实时录制。 */
export function batchVideoEstimateMs(tasks: readonly BatchVideoTask[]) {
  return tasks.reduce((sum, task) => sum + task.estimateMs, 0)
}

/** 整批的成片总时长（与预计耗时的区别：不含渲染开销）。 */
export function batchVideoDurationMs(tasks: readonly BatchVideoTask[]) {
  return tasks.reduce((sum, task) => sum + task.totalMs, 0)
}
