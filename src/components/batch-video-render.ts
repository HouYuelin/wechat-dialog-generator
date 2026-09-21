/**
 * 批量视频的两个浏览器阶段：先把画面渲染好，扣次之后再录。
 *
 * 拆成两步是因为额度必须卡在中间——渲染阶段取消不扣次，只有真要录了才算一次导出，
 * 与聊天页的 handleExportVideo 是同一条规则。`runBatch` 的 render / deliver 正好对应这两步。
 *
 * 这里不写任何录制逻辑：画面怎么来（逐帧还是一张长图）与怎么录（MediaRecorder、滚动窗口、
 * 提示音混音）都沿用聊天页那两套模块，批量只是把它们按组串起来。
 */
import { renderChatFrames, renderChatScrollFrame, type ChatVideoSnapshot, type RenderedChatFrames, type RenderedChatScrollFrame } from './chat-video-render'
import { recordChatVideo, recordScrollingChatVideo, type ChatVideoAudioOptions, type RecordedChatVideo } from '@/lib/chat-video-recorder'
import type { BatchVideoTask } from '@/lib/batch-video'

/** 渲染好的画面：逐条模式是一叠帧，滚动模式是一张长图。 */
export type BatchVideoMedia =
  | { mode: 'flip'; frames: RenderedChatFrames }
  | { mode: 'scroll'; long: RenderedChatScrollFrame }

export interface BatchVideoRenderOptions {
  token?: { cancelled: boolean }
  /** 渲染进度：逐条模式是帧数（第 k / 全部 + 1 帧），滚动模式不报进度。 */
  onProgress?: (step: number, total: number) => void
}

/** 转录之前的画面准备。滚动模式会在这里量高度，超限时报错。 */
export async function prepareBatchVideo(task: BatchVideoTask, snapshot: ChatVideoSnapshot, options: BatchVideoRenderOptions = {}): Promise<BatchVideoMedia> {
  if (task.plan.mode === 'scroll') {
    if (options.token?.cancelled) throw new Error('已取消生成。')
    return { mode: 'scroll', long: await renderChatScrollFrame(snapshot, { token: options.token }) }
  }
  return { mode: 'flip', frames: await renderChatFrames(snapshot, { token: options.token, onProgress: options.onProgress }) }
}

export interface BatchVideoRecordOptions {
  /** 竖屏画布两侧的留底色，取这一组的聊天背景色。 */
  background: string
  /** 两侧安全留白（输出像素）：整批共用一份，见 lib/video-padding.ts。 */
  sidePadding?: number
  audio?: ChatVideoAudioOptions | null
  token?: { cancelled: boolean }
  onProgress?: (elapsedMs: number, totalMs: number) => void
}

/** 按时间轴把这一组录成视频。 */
export async function recordBatchVideo(task: BatchVideoTask, media: BatchVideoMedia, options: BatchVideoRecordOptions): Promise<RecordedChatVideo> {
  const size = { width: task.plan.size.width, height: task.plan.size.height }
  if (media.mode === 'scroll') {
    return recordScrollingChatVideo({
      image: media.long.blob,
      viewport: media.long.viewport,
      topChromeHeight: media.long.topChromeHeight,
      bottomChromeHeight: media.long.bottomChromeHeight,
      size,
      background: options.background,
      sidePadding: options.sidePadding ?? 0,
      plan: task.plan.scroll,
      token: options.token,
      onProgress: options.onProgress,
    })
  }
  if (!task.timeline) throw new Error('这一组缺少消息时间轴，请重试。')
  return recordChatVideo({
    frames: media.frames.blobs,
    frameWidth: media.frames.width,
    frameHeight: media.frames.height,
    frameAtMs: task.timeline.frameAtMs,
    totalMs: task.timeline.totalMs,
    size,
    background: options.background,
    sidePadding: options.sidePadding ?? 0,
    notifyAt: task.notifyAt,
    audio: options.audio ?? null,
    token: options.token,
    onProgress: options.onProgress,
  })
}
