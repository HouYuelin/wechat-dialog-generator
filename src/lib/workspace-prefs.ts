/**
 * 「我的偏好」：属于用户本人、不属于某一份内容的那些设置。
 *
 * 为什么单开这一层：音效（收到 / 发送那两声）、屏幕尺寸（导出分辨率）、播放节奏、
 * 导出画面与时长原先只活在组件 state 里，刷新页面就回到默认值；而「新建空白对话」
 * 还会把气泡颜色、字号、图片大小这一整套样式一起重置。用户的心智是「我设置过一次
 * 的东西，别每次导入新内容都还给我默认值」。
 *
 * 所以这里把「样式（PhoneSettings 去掉聊天标题）+ 播放与导出 + 预览窗口宽度」合成一份偏好：
 * 它就是这台浏览器上「我现在的设置」，运行中任何时刻都从它取值。
 *  - 刷新页面、导入新聊天内容、新建空白对话 ⇒ 从偏好取值，不再恢复产品默认值；
 *  - 打开已保存的草稿 ⇒ **只换内容，样式仍用偏好**。草稿不再携带样式：旧草稿里存的
 *    往往就是产品默认值，用它等于「一开草稿就把我设好的样式冲掉」，正是这次要修的东西；
 *  - 套用同款模板链接 ⇒ 链接里的样式优先（这就是「套用」的意思），同样以偏好兜底。
 *
 * 唯一跟着内容走的字段是**聊天标题**（contactName）：它由导入的聊天记录决定，所以被排除在
 * style 之外，不进偏好，打开草稿时按那份草稿里存的标题恢复。项目快照里仍然照常保存整份
 * settings（同款分享链接要用它），只是打开草稿时不再拿它当样式来源。
 *
 * 这个文件只有纯逻辑（默认值、清洗、互转、比较），落盘见 workspace-prefs-store.ts。
 */
import type { PhoneSettings } from '@/types'
import type { BatchOutput } from './batch'
import { defaultFontScale, normalizeFontScale } from './font-size'
import { defaultImageMax, normalizeImageMax } from './image-size'
import { clampPhoneWidth, clampScreenSize, defaultScreenSize, phoneSizeIdLabels, type PhoneSizeId, type ScreenSize } from './phone-size'
import { defaultPaceSetting, normalizePaceSetting, paceMsFromLegacy, type PaceSetting } from './chat-playback'
import { videoSizeOptionsFor, type VideoSizeId } from './chat-video'
import { clampScrollDurationSeconds, defaultScrollDurationSeconds } from './chat-scroll-video'
import { clampVideoSidePad, defaultVideoSidePad } from './video-padding'

/** 自定义音效来自内置合成音，还是用户自己选的音频。 */
export type SoundSource = 'synth' | 'custom'

/**
 * 视频的录制方式。取值与 components/VideoExportDialog 的 VideoCaptureMode 一致；
 * lib 不该反向依赖组件，所以在这里独立声明，App 里靠结构类型自动对上。
 */
export type PrefVideoMode = 'flip' | 'scroll'

/** 样式偏好：PhoneSettings 去掉「聊天标题」。 */
export type StylePrefs = Omit<PhoneSettings, 'contactName'>

export interface PlaybackPrefs {
  /** 消息出现的节奏：统一间隔一个值，或逐条各设一个。见 lib/chat-playback.ts 的 PaceSetting。 */
  pace: PaceSetting
  soundEnabled: boolean
  /** 收到 / 发送是两种不同的音效，各自可开关。 */
  soundReceive: boolean
  soundSend: boolean
  soundSource: SoundSource
  /** 上次为「收到 / 发送」各自选中的音效库 id。库里那条被删掉时自动退回内置合成音。 */
  soundIds: { received: string | null; sent: string | null }
  /** 导出分辨率（也决定预览画面的比例）。 */
  screenSize: ScreenSize
  videoSize: VideoSizeId
  videoMode: PrefVideoMode
  /** 滚动模式的时长（秒）。 */
  scrollDuration: number
  /** 视频两侧的安全留白（输出像素）：发抖音等平台时给裁切与浮层让位，见 video-padding.ts。 */
  videoSidePad: number
  /** 批量聊天制作这一批产出什么：聊天图还是聊天视频。 */
  batchOutput: BatchOutput
}

/**
 * 预览显示相关的档位。窗口宽度只影响你在屏幕上看到的预览，不影响导出，但同样是
 * 「选过一次就不想再选」的参数，所以一并记住。
 */
export interface DisplayPrefs {
  /** 聊天窗口宽度档位，'auto' 是跟着面板量出来的自适应宽度。 */
  phoneSize: PhoneSizeId
  /** phoneSize 为 'custom' 时的宽度（内部坐标系之外的显示宽度，单位 px）。 */
  customPhoneWidth: number
}

export interface WorkspacePrefs {
  style: StylePrefs
  playback: PlaybackPrefs
  display: DisplayPrefs
}

/**
 * 样式的出厂默认值。App 里的 `defaultSettings` 就是它加上空的聊天标题——
 * 默认值只此一处，改这里等于同时改「新建对话的初始样子」与「偏好读坏时的兜底」。
 */
export const defaultStylePrefs: StylePrefs = {
  platform: 'ios',
  time: '12:02',
  signal: 4,
  secondarySignal: 3,
  simMode: 'single',
  wifiEnabled: true,
  battery: 60,
  unreadCount: 1,
  selfBubbleColor: '#95ec69',
  otherBubbleColor: '#ffffff',
  backgroundColor: '#ededed',
  backgroundImage: null,
  imageMax: defaultImageMax,
  fontScale: defaultFontScale,
}

export const defaultPlaybackPrefs: PlaybackPrefs = {
  pace: defaultPaceSetting(),
  soundEnabled: true,
  soundReceive: true,
  soundSend: false,
  soundSource: 'synth',
  soundIds: { received: null, sent: null },
  screenSize: { ...defaultScreenSize },
  videoSize: 'vertical',
  videoMode: 'flip',
  scrollDuration: defaultScrollDurationSeconds,
  videoSidePad: defaultVideoSidePad,
  batchOutput: 'image',
}

export const defaultDisplayPrefs: DisplayPrefs = {
  phoneSize: 'auto',
  customPhoneWidth: 430,
}

/** 出厂默认的全量设置，含聊天标题（标题属于内容，默认是空的）。 */
export const defaultPhoneSettings: PhoneSettings = { ...defaultStylePrefs, contactName: '' }

export function defaultWorkspacePrefs(): WorkspacePrefs {
  return {
    style: { ...defaultStylePrefs },
    // 嵌套的那几项各给一份新对象：偏好是长期活着的，别让两处共享同一个数组/对象。
    playback: { ...defaultPlaybackPrefs, pace: defaultPaceSetting(), soundIds: { received: null, sent: null }, screenSize: { ...defaultScreenSize } },
    display: { ...defaultDisplayPrefs },
  }
}

/** 从一份完整设置里取出属于偏好的那部分（丢掉聊天标题）。 */
export function stylePrefsFromSettings(settings: PhoneSettings): StylePrefs {
  // 用 delete 而不是解构 + 忽略变量：这里的字段列表就是 PhoneSettings 本身，
  // 以后加字段不必回来补一行，也不会漏掉。
  const style: Partial<PhoneSettings> = { ...settings }
  delete style.contactName
  return style as StylePrefs
}

/** 把偏好样式盖到一份设置上；聊天标题保持传入的那份不动。 */
export function settingsWithStyle(settings: PhoneSettings, style: StylePrefs): PhoneSettings {
  return { ...settings, ...style }
}

// 取值集合直接问各自的定义方要，免得在这里再抄一份、以后加档位漏掉。
const videoSizeIds = videoSizeOptionsFor().map(option => option.id)
const phoneSizeIds = Object.keys(phoneSizeIdLabels) as PhoneSizeId[]

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function flag(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function color(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() && value.length <= 64 ? value : fallback
}

function text(value: unknown, fallback: string, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.slice(0, maxLength) : fallback
}

/** 背景图只认图片 data URL：别的字符串塞进来渲染不出东西，不如退回无背景。 */
function backgroundImage(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('data:image/') ? value : null
}

function screenSize(value: unknown): ScreenSize {
  const source = record(value)
  const width = Number(source.width)
  const height = Number(source.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ...defaultScreenSize }
  }
  return clampScreenSize({ width, height })
}

function soundId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function normalizeStylePrefs(raw: unknown): StylePrefs {
  const source = record(raw)
  return {
    platform: oneOf(source.platform, ['ios', 'android'] as const, defaultStylePrefs.platform),
    time: text(source.time, defaultStylePrefs.time, 12),
    signal: boundedInt(source.signal, defaultStylePrefs.signal, 1, 4),
    secondarySignal: boundedInt(source.secondarySignal, defaultStylePrefs.secondarySignal, 1, 4),
    simMode: oneOf(source.simMode, ['single', 'dual'] as const, defaultStylePrefs.simMode),
    wifiEnabled: flag(source.wifiEnabled, defaultStylePrefs.wifiEnabled),
    battery: boundedInt(source.battery, defaultStylePrefs.battery, 1, 100),
    unreadCount: boundedInt(source.unreadCount, defaultStylePrefs.unreadCount, 0, 999),
    selfBubbleColor: color(source.selfBubbleColor, defaultStylePrefs.selfBubbleColor),
    otherBubbleColor: color(source.otherBubbleColor, defaultStylePrefs.otherBubbleColor),
    backgroundColor: color(source.backgroundColor, defaultStylePrefs.backgroundColor),
    backgroundImage: backgroundImage(source.backgroundImage),
    imageMax: normalizeImageMax(source.imageMax),
    fontScale: normalizeFontScale(source.fontScale),
  }
}

/**
 * 节奏偏好。新格式是 `pace: { mode, paceMs, gaps }`；更早的版本把节奏存成
 * `pace: 'fast' | 'normal' | 'slow'` 一个字符串，这里折算成毫秒读回来，
 * 老用户不会因为这次改版被打回默认节奏。
 */
function pacePrefs(value: unknown): PaceSetting {
  const legacy = paceMsFromLegacy(value)
  if (legacy === null) return normalizePaceSetting(value)
  return normalizePaceSetting({ ...record(value), paceMs: legacy })
}

function normalizePlaybackPrefs(raw: unknown): PlaybackPrefs {
  const source = record(raw)
  const ids = record(source.soundIds)
  return {
    pace: pacePrefs(source.pace),
    soundEnabled: flag(source.soundEnabled, defaultPlaybackPrefs.soundEnabled),
    soundReceive: flag(source.soundReceive, defaultPlaybackPrefs.soundReceive),
    soundSend: flag(source.soundSend, defaultPlaybackPrefs.soundSend),
    soundSource: oneOf(source.soundSource, ['synth', 'custom'] as const, defaultPlaybackPrefs.soundSource),
    soundIds: { received: soundId(ids.received), sent: soundId(ids.sent) },
    screenSize: screenSize(source.screenSize),
    videoSize: oneOf(source.videoSize, videoSizeIds, defaultPlaybackPrefs.videoSize),
    videoMode: oneOf(source.videoMode, ['flip', 'scroll'] as const, defaultPlaybackPrefs.videoMode),
    scrollDuration: source.scrollDuration === undefined
      ? defaultScrollDurationSeconds
      : clampScrollDurationSeconds(Number(source.scrollDuration)),
    // 旧偏好没有这一项：缺字段时给默认值（开着安全区），而不是当成 0 把安全区关掉。
    videoSidePad: source.videoSidePad === undefined
      ? defaultVideoSidePad
      : clampVideoSidePad(Number(source.videoSidePad)),
    batchOutput: oneOf(source.batchOutput, ['image', 'video'] as const, defaultPlaybackPrefs.batchOutput),
  }
}

function normalizeDisplayPrefs(raw: unknown): DisplayPrefs {
  const source = record(raw)
  return {
    phoneSize: oneOf(source.phoneSize, phoneSizeIds, defaultDisplayPrefs.phoneSize),
    customPhoneWidth: source.customPhoneWidth === undefined
      ? defaultDisplayPrefs.customPhoneWidth
      : clampPhoneWidth(Number(source.customPhoneWidth)),
  }
}

/**
 * 读回来的数据不能全信：存储被手改过、字段缺失、版本变化都会走到这里，
 * 统一按字段兜底，缺一项只影响那一项，不让整份偏好失效。
 */
export function normalizeWorkspacePrefs(raw: unknown): WorkspacePrefs {
  const source = record(raw)
  return {
    style: normalizeStylePrefs(source.style),
    playback: normalizePlaybackPrefs(source.playback),
    display: normalizeDisplayPrefs(source.display),
  }
}

/**
 * 固定字段顺序后再比较。对象是从几条不同的路径拼出来的（默认值、存储、界面状态），
 * 键的顺序可能不同，直接 JSON.stringify 会假报「有变化」，于是每渲染一次都写一遍存储。
 */
function canonical(prefs: WorkspacePrefs) {
  const { style, playback, display } = prefs
  return JSON.stringify([
    style.platform, style.time, style.signal, style.secondarySignal, style.simMode,
    style.wifiEnabled, style.battery, style.unreadCount,
    style.selfBubbleColor, style.otherBubbleColor, style.backgroundColor, style.backgroundImage,
    style.imageMax, style.fontScale,
    playback.pace.mode, playback.pace.paceMs, playback.pace.gaps.join('|'), playback.pace.leadInMs, playback.soundEnabled, playback.soundReceive, playback.soundSend,
    playback.soundSource, playback.soundIds.received, playback.soundIds.sent,
    playback.screenSize.width, playback.screenSize.height,
    playback.videoSize, playback.videoMode, playback.scrollDuration, playback.videoSidePad, playback.batchOutput,
    display.phoneSize, display.customPhoneWidth,
  ])
}

export function workspacePrefsEqual(left: WorkspacePrefs, right: WorkspacePrefs) {
  return canonical(left) === canonical(right)
}
