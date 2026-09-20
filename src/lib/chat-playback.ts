import type { ChatMessage } from '@/types'
import type { NotifyKind } from './notify-sound'

/**
 * 逐条出现的节奏档位。定时发送、录屏播放和视频导出共用同一条时间轴，
 * 保证「预览里看到的速度」和「导出视频里的速度」完全一致。
 */
export type PlaybackPace = 'fast' | 'normal' | 'slow'

export const playbackPaceMs: Record<PlaybackPace, number> = { fast: 800, normal: 1500, slow: 2500 }
export const playbackPaceLabels: Record<PlaybackPace, string> = { fast: '快 0.8 秒', normal: '标准 1.5 秒', slow: '慢 2.5 秒' }
export const playbackPaces: PlaybackPace[] = ['fast', 'normal', 'slow']

/** 收到消息与发送消息的音效各自可选，默认只响「收到」那一声。 */
export interface PlaybackNotifyOptions {
  /** 对方来消息时是否响一声。 */
  notifyReceived?: boolean
  /** 自己发出消息时是否响一声（音效与接收不同）。 */
  notifySent?: boolean
}

/** 首条消息出现前的静置时长（保留一小段空对话，剪辑时更好接）。 */
export const playbackLeadInMs = 1200
/**
 * 末条消息之后的留白，也就是「结尾那一帧」的停留时间。
 * 3 秒是录屏和导出视频都够用的收尾时间：视频的最后一帧正好停这么久，
 * 手动录屏时也有余量按下停止键。预览播放与导出一致，只改这一处。
 */
export const playbackTailMs = 3000
export const minPlaybackPaceMs = 200
/** 逐帧预渲染的开销随条数线性增长，超过这个条数请拆分成多个对话导出。 */
export const maxVideoMessages = 120

export interface PlaybackStep {
  /** 消息在 messages 中的下标。 */
  index: number
  /** 该消息出现的时刻（相对播放起点，毫秒）。 */
  atMs: number
  /** 该消息出现时播放哪种音效；null 表示不发声。 */
  notify: NotifyKind | null
}

export interface PlaybackTimeline {
  steps: PlaybackStep[]
  /** frameAtMs[k] = 只显示前 k 条消息的画面从何时开始；长度恒为 messages.length + 1。 */
  frameAtMs: number[]
  totalMs: number
  messageCount: number
}

export interface PlaybackOptions extends PlaybackNotifyOptions {
  pace?: PlaybackPace
  /** 直接给毫秒，优先级高于 pace。 */
  paceMs?: number
  leadInMs?: number
  tailMs?: number
  selfId?: number | null
}

export function playbackPaceDuration(pace: PlaybackPace, overrideMs?: number) {
  const value = overrideMs ?? playbackPaceMs[pace] ?? playbackPaceMs.normal
  return Number.isFinite(value) ? Math.max(minPlaybackPaceMs, Math.round(value)) : playbackPaceMs.normal
}

/** 时间戳分隔条只换行不发声；selfId 未设置时无法判断方向，一律按「收到」处理。 */
export function shouldPlayNotify(
  msg: Pick<ChatMessage, 'type' | 'senderId'>,
  selfId: number | null,
  options: PlaybackNotifyOptions = {},
): NotifyKind | null {
  if (msg.type === 'time') return null
  const notifyReceived = options.notifyReceived ?? true
  const notifySent = options.notifySent ?? false
  const isSelf = selfId !== null && msg.senderId === selfId
  if (isSelf) return notifySent ? 'sent' : null
  return notifyReceived ? 'received' : null
}

export function buildPlaybackTimeline(messages: Pick<ChatMessage, 'type' | 'senderId'>[], options: PlaybackOptions = {}): PlaybackTimeline {
  const paceMs = playbackPaceDuration(options.pace ?? 'normal', options.paceMs)
  const leadInMs = Math.max(0, options.leadInMs ?? playbackLeadInMs)
  const tailMs = Math.max(0, options.tailMs ?? playbackTailMs)
  const selfId = options.selfId ?? null

  const steps: PlaybackStep[] = []
  let atMs = leadInMs
  messages.forEach((msg, index) => {
    steps.push({ index, atMs, notify: shouldPlayNotify(msg, selfId, options) })
    atMs += paceMs
  })

  // 末条消息之后只留 tailMs：一条消息占一个节奏槽，最后一条后面不再空转。
  const lastAtMs = steps.length ? steps[steps.length - 1].atMs : leadInMs

  return {
    steps,
    frameAtMs: [0, ...steps.map(step => step.atMs)],
    totalMs: lastAtMs + tailMs,
    messageCount: messages.length,
  }
}

/** 某个时刻应该显示多少条消息（0 = 只有空白对话）。 */
export function frameIndexAt(frameAtMs: number[], elapsedMs: number) {
  if (!frameAtMs.length) return 0
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  let index = 0
  for (let i = 1; i < frameAtMs.length; i++) {
    if (elapsedMs >= frameAtMs[i]) index = i
    else break
  }
  return Math.min(index, frameAtMs.length - 1)
}

export interface NotifyEvent {
  atMs: number
  kind: NotifyKind
}

/** 时间轴上每一次发声的时刻与音效类型，预览播放和视频录制共用。 */
export function notifyEvents(timeline: PlaybackTimeline): NotifyEvent[] {
  const events: NotifyEvent[] = []
  for (const step of timeline.steps) {
    if (step.notify) events.push({ atMs: step.atMs, kind: step.notify })
  }
  return events
}

/** 给界面用的时长描述，向上取整到 0.5 秒。 */
export function playbackDurationSeconds(totalMs: number) {
  return Math.max(0, Math.ceil(Math.max(0, totalMs) / 500) / 2)
}

export function playbackDurationLabel(totalMs: number) {
  return `约 ${playbackDurationSeconds(totalMs)} 秒`
}
