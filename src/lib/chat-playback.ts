import type { ChatMessage } from '@/types'
import type { NotifyKind } from './notify-sound'

/**
 * 消息出现的节奏。定时发送、录屏播放和视频导出共用同一条时间轴，
 * 保证「预览里看到的速度」和「导出视频里的速度」完全一致。
 *
 * 两种设法，用户自己挑：
 * - `uniform`：所有消息之间用同一个间隔，取值范围 0.5–3 秒（滑杆）；
 * - `perMessage`：逐条自己设，第 i 项是「第 i+1 条出现前等多久」，N 条消息对应 N-1 个间隔。
 *
 * 逐条的范围是 0–3 秒：比统一间隔低到 0，能把两条压到「连着发」，上限与统一一致。
 */
export type PaceMode = 'uniform' | 'perMessage'

/** 统一间隔的范围与步长（毫秒）：0.5–3 秒，每格 0.1 秒。 */
export const minPaceMs = 500
export const maxPaceMs = 3000
export const paceStepMs = 100
export const defaultPaceMs = 1500

/** 逐条间隔的范围与步长（毫秒）：0–3 秒，每格 0.1 秒。 */
export const minGapMs = 0
export const maxGapMs = 3000
export const gapStepMs = 100
/** 逐条间隔列表的长度上限：没人会一条条设到几百条，只是别让存储里堆一个长数组。 */
export const maxMessageGaps = 400

export const paceModeLabels: Record<PaceMode, string> = { uniform: '统一间隔', perMessage: '逐条设置' }
export const paceModes: PaceMode[] = ['uniform', 'perMessage']

/**
 * 旧的「快 / 标准 / 慢」三档。界面已经不再暴露它们，只用来把存过的偏好读成毫秒，
 * 保证老用户的设置不会因为这次改版被打回默认值。
 */
export const legacyPaceMs: Record<'fast' | 'normal' | 'slow', number> = { fast: 800, normal: 1500, slow: 2500 }

export function paceMsFromLegacy(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const hit = legacyPaceMs[value as keyof typeof legacyPaceMs]
  return hit === undefined ? null : hit
}

/** 一套节奏设置：统一间隔的值 + 逐条间隔的列表，两个都留着，切模式时不丢。 */
export interface PaceSetting {
  mode: PaceMode
  /** 统一间隔（毫秒）。逐条模式里它是新间隔的默认值，也是缺项的兜底值。 */
  paceMs: number
  /** 逐条间隔（毫秒）：gaps[i] 是第 i+1 条出现前等到第 i 条的时长。 */
  gaps: number[]
  /** 首条消息出现前的静置时长（毫秒），可设成 0 让第一条立刻出来。 */
  leadInMs: number
  /** 末条消息之后的结尾留白时长（毫秒），也就是最后那一帧停多久。 */
  tailMs: number
}

export function defaultPaceSetting(): PaceSetting {
  return { mode: 'uniform', paceMs: defaultPaceMs, gaps: [], leadInMs: defaultLeadInMs, tailMs: defaultTailMs }
}

/** 收到消息与发送消息的音效各自可选，默认只响「收到」那一声。 */
export interface PlaybackNotifyOptions {
  /** 对方来消息时是否响一声。 */
  notifyReceived?: boolean
  /** 自己发出消息时是否响一声（音效与接收不同）。 */
  notifySent?: boolean
}

/**
 * 首条消息出现前的静置时长。它原本是写死的 1200，现在放进节奏设置里让用户自己调：
 * 有人想第一条消息立刻出来（设为 0），有人想留一小段空对话（剪辑时更好接）。
 */
export const defaultLeadInMs = 1200
/** 开场静置的范围与步长（毫秒）：0–3 秒，每格 0.1 秒。 */
export const minLeadInMs = 0
export const maxLeadInMs = 3000
export const leadInStepMs = 100
/** 兼容旧字段名：老代码与旧偏好里用的都是这个名字，保留作别名。 */
export const playbackLeadInMs = defaultLeadInMs
/**
 * 末条消息之后的留白，也就是「结尾那一帧」的停留时间。
 * 3 秒是录屏和导出视频都够用的收尾时间：视频的最后一帧正好停这么久，
 * 手动录屏时也有余量按下停止键。预览播放与导出一致，只改这一处。
 *
 * 现在这个值不再写死：它作为 `tailMs` 收进了节奏设置（PaceSetting），
 * 用户可以在「结尾时长」滑杆里调。3 秒仍然是出厂默认值与兼容别名，
 * 老偏好里没有这个字段时退回它。
 */
export const playbackTailMs = 3000
/** 结尾留白的范围与步长（毫秒）：0–10 秒，每格 0.1 秒。 */
export const minTailMs = 0
export const maxTailMs = 10000
export const tailStepMs = 100
/** 结尾时长的出厂默认值，等于 playbackTailMs，供 defaultPaceSetting 与清洗共用。 */
export const defaultTailMs = playbackTailMs
/** 逐帧预渲染的开销随条数线性增长，超过这个条数请拆分成多个对话导出。 */
export const maxVideoMessages = 120

/* ============================ 取值与清洗 ============================ */

function roundToStep(value: number, step: number) {
  return Math.round(value / step) * step
}

/** 统一间隔：超出范围就夹回来，NaN 退回默认值（不是 0，那会让消息挤成一团）。 */
export function clampPaceMs(value: number) {
  if (!Number.isFinite(value)) return defaultPaceMs
  return Math.min(maxPaceMs, Math.max(minPaceMs, roundToStep(value, paceStepMs)))
}

/** 逐条间隔：同上，范围是 0–3 秒，NaN 退回默认值。 */
export function clampPaceGapMs(value: number) {
  if (!Number.isFinite(value)) return defaultPaceMs
  return Math.min(maxGapMs, Math.max(minGapMs, roundToStep(value, gapStepMs)))
}

/** 开场静置：0–3 秒，NaN 退回默认值（0 表示第一条消息立刻出现）。 */
export function clampLeadInMs(value: number) {
  if (!Number.isFinite(value)) return defaultLeadInMs
  return Math.min(maxLeadInMs, Math.max(minLeadInMs, roundToStep(value, leadInStepMs)))
}

/** 结尾时长：0–10 秒，NaN 退回默认值（0 表示最后一条消息之后立刻收尾）。 */
export function clampTailMs(value: number) {
  if (!Number.isFinite(value)) return defaultTailMs
  return Math.min(maxTailMs, Math.max(minTailMs, roundToStep(value, tailStepMs)))
}

/** 读回来的值不能全信：存储被手改过、旧版本没有这个字段都会走到这里。 */
export function normalizePaceMs(value: unknown) {
  return typeof value === 'number' ? clampPaceMs(value) : defaultPaceMs
}

export function normalizePaceGapList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, maxMessageGaps).map(item => (typeof item === 'number' ? clampPaceGapMs(item) : defaultPaceMs))
}

export function normalizePaceMode(value: unknown): PaceMode {
  return value === 'perMessage' ? 'perMessage' : 'uniform'
}

export function normalizePaceSetting(raw: unknown): PaceSetting {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  return {
    mode: normalizePaceMode(source.mode),
    paceMs: normalizePaceMs(source.paceMs),
    gaps: normalizePaceGapList(source.gaps),
    leadInMs: typeof source.leadInMs === 'number' ? clampLeadInMs(source.leadInMs) : defaultLeadInMs,
    tailMs: typeof source.tailMs === 'number' ? clampTailMs(source.tailMs) : defaultTailMs,
  }
}

/**
 * 逐条间隔补齐到当前消息条数：多出来的截掉（那些消息已经不在对话里了）、
 * 缺的用统一间隔兜底（新加进来的消息按统一间隔出现，改起来才有起点）。
 * 返回长度恒为 max(0, count - 1)。
 */
export function normalizeMessageGaps(value: unknown, count: number, fallbackMs = defaultPaceMs): number[] {
  const target = Math.max(0, Math.min(maxMessageGaps, Math.floor(count) - 1))
  if (!target) return []
  const source = Array.isArray(value) ? value : []
  const fallback = clampPaceGapMs(fallbackMs)
  return Array.from({ length: target }, (_, index) => {
    const item = source[index]
    return typeof item === 'number' && Number.isFinite(item) ? clampPaceGapMs(item) : fallback
  })
}

/* ============================ 文案 ============================ */

/** 秒数写成「1.5」「0.8」这种，末尾的 .0 去掉，滑杆旁边和摘要里都用它。 */
export function paceSecondsLabel(ms: number) {
  return (Math.round(ms) / 1000).toFixed(1).replace(/\.0$/, '')
}

/** 折叠面板与控制条上的那句摘要：「统一 1.5 秒」/「逐条 8 处间隔」。 */
export function paceSettingLabel(setting: PaceSetting, gapCount?: number) {
  if (setting.mode === 'perMessage') {
    // 调用方知道当前对话有几条消息，优先用它的口径；没传就退回列表自己的长度。
    const count = gapCount ?? setting.gaps.length
    return count > 0 ? `逐条 ${count} 处间隔` : '逐条设置'
  }
  return `统一 ${paceSecondsLabel(clampPaceMs(setting.paceMs))} 秒`
}

/** 逐条列表里某一项的间隔摘要：「比上一条晚 1.5 秒」。 */
export function paceGapLabel(ms: number) {
  return `${paceSecondsLabel(clampPaceGapMs(ms))} 秒`
}

/**
 * 逐条列表里某一行的消息摘要：让人认出「这是在设哪一条前面的等待」。
 * 看不到内容的类型给个词代替，聊天记录里最常见的还是文字。
 */
export function messageGapLabel(msg: Pick<ChatMessage, 'type' | 'content'>, sender?: string | null) {
  const byType: Record<ChatMessage['type'], string> = {
    text: '',
    time: '',
    image: '[图片]',
    voice: '[语音]',
    redpacket: '[红包]',
    transfer: '[转账]',
  }
  const body = byType[msg.type] ?? ''
  const own = (body || msg.content || '').replace(/\s+/g, ' ').trim() || '（空）'
  const trimmed = own.length > 16 ? `${own.slice(0, 16)}…` : own
  if (msg.type === 'time') return trimmed
  return sender ? `${sender}：${trimmed}` : trimmed
}

/* ============================ 时间轴 ============================ */

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
  /** 统一间隔（毫秒），也是逐条模式里缺项与新增消息的兜底值。 */
  paceMs?: number
  /** 间隔从哪来：默认统一间隔。 */
  paceMode?: PaceMode
  /** 逐条模式的间隔列表，长度不够时按 paceMs 补齐。 */
  messageGaps?: readonly number[]
  leadInMs?: number
  tailMs?: number
  selfId?: number | null
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
  const uniformMs = normalizePaceMs(options.paceMs)
  // 逐条模式下 gaps[i] 是「第 i+1 条真实消息出现前等的时长」。时间分隔条不算真实消息——
  // 它只换行不占等待，所以 gap 数按「非时间消息条数」算，而不是 messages.length。
  const realCount = messages.filter(msg => msg.type !== 'time').length
  const gaps = options.paceMode === 'perMessage' ? normalizeMessageGaps(options.messageGaps, realCount, uniformMs) : null
  const leadInMs = Math.max(0, options.leadInMs ?? defaultLeadInMs)
  const tailMs = Math.max(0, options.tailMs ?? playbackTailMs)
  const selfId = options.selfId ?? null

  const steps: PlaybackStep[] = []
  let atMs = leadInMs
  // 时间分隔条紧跟其上一条消息出现（同一个 atMs），既不推进间隔、也不占逐条间隔的槽位。
  let gapCursor = 0
  messages.forEach((msg, index) => {
    if (msg.type !== 'time') {
      // 第一条真实消息与播放起点之间是开场静置，不算「两条消息之间的间隔」。
      if (gapCursor > 0) atMs += gaps ? gaps[gapCursor - 1] : uniformMs
      gapCursor += 1
    }
    steps.push({ index, atMs, notify: shouldPlayNotify(msg, selfId, options) })
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
