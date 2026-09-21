/**
 * 导出时左右两侧的安全留白（图片与视频共用同一份）。
 *
 * 为什么需要：9:16 的视频发到抖音，在 iPhone Pro Max 这类 19.5:9 的屏幕上会被「铺满」
 * 播放——视频先等比放大到填满屏幕，左右两边各被裁掉约 9%（1080 宽的视频就是各 97px）；
 * 右侧那排按钮、左下角的昵称与简介这些浮层又压在画面两侧，靠边的内容就看不到了。
 * 图文发出去被裁掉、被压住的同样是左右两头。
 *
 * 做法：左右各让出 N 像素的空白，用对话底色填充。平台裁掉的和浮层压住的都落在这两条空白上，
 * 聊天内容本身不受影响。单位是**输出像素**（不是内部坐标系那套 1125）：要挡的是平台按比例
 * 裁掉的那一段，给一个固定的像素值最直观。
 *
 * 两种产出的落地方式不一样，别搞混：
 * - **图片**（截图 / 长截图 / 批量聊天图）：手机的比例一个像素都不动，输出宽度各加 N，
 *   高度照旧由内容决定（`paddedImageSize`，配 `capture-chat.ts` 的补边）；
 * - **视频**：画布是固定的（比如 1080×1920），只缩宽度会让上下也跟着空出来。所以留白一旦
 *   越过画面自然留边，就用 `videoContentScreen()` 把手机的比例换成「画布去掉两侧留白」
 *   那一份，手机铺满上下、两侧正好 N 像素，多出来的高度落在聊天区（消息一条不动）。
 *
 * 视频这条链路的实际落地在 `chat-video.ts` 的 `fitRect(..., sidePadding)`，这里只管档位、
 * 范围、文案，以及上面那两个换算。
 *
 * 语义是「**至少** N 像素」：9:16 这种比手机更窄的画布本来就会左右留边（等比放进画布时
 * 自然产生，9:16 下约 97px），两者取较大者。所以调到自然留边以下不会再有效果。
 */

import { defaultScreenSize, designHeightFor, phoneFrameWidth, type ScreenSize } from './phone-size'

export type VideoSidePadId = 'off' | 'slim' | 'standard' | 'wide' | 'custom'
export type VideoSidePadPresetId = Exclude<VideoSidePadId, 'custom'>

/** 再大画面就只剩中间一条了；0 表示不额外留白。 */
export const minVideoSidePad = 0
export const maxVideoSidePad = 300
/**
 * 抖音安全区的推荐值，默认就开，开箱即用。
 * 依据：9:16 的视频在 19.5:9 的机型上被裁掉约 9%（1080 宽即每侧 97px），
 * 120px 在这之上再留一点给右侧按钮栏，用户嫌不够可以往上调。
 */
export const defaultVideoSidePad = 120

export interface VideoSidePadPreset {
  id: VideoSidePadPresetId
  label: string
  /** 两侧各留多少输出像素。 */
  pad: number
  note: string
}

/** 由小到大排列，弹层直接按顺序铺成筹码。 */
export const videoSidePadPresets: VideoSidePadPreset[] = [
  { id: 'off', label: '关闭', pad: 0, note: '不留：画面尽量占满。图片原样导出；视频里手机按画布铺满，平台裁切时会直接切到内容边缘。' },
  { id: 'slim', label: '少量', pad: 60, note: '刚好挡掉平台裁切的那一点，内容损失最小；9:16 画布本来就有的留边比它还宽，所以看不出变化。' },
  { id: 'standard', label: '标准', pad: defaultVideoSidePad, note: '抖音安全区推荐值：9:16 发抖音时左右被裁掉的大约就是这么多，还能顺带让开右侧那排按钮。默认档。' },
  { id: 'wide', label: '多留', pad: 200, note: '给右侧按钮栏与左下角文字留更大空间，但内容会明显变窄，适合重点本来就靠中间的对话。' },
]

export const videoSidePadIdLabels: Record<VideoSidePadId, string> = {
  off: '关闭',
  slim: '少量',
  standard: '标准',
  wide: '多留',
  custom: '自定义',
}

export function videoSidePadPreset(id: VideoSidePadId) {
  return videoSidePadPresets.find(preset => preset.id === id) ?? null
}

export function clampVideoSidePad(value: number) {
  // 这里给的是「留多少」而不是「位置」，NaN 退回 0 会悄悄关掉安全区，所以退回默认值。
  if (Number.isNaN(value)) return defaultVideoSidePad
  return Math.min(maxVideoSidePad, Math.max(minVideoSidePad, Math.round(value)))
}

/** 读回来的值不能全信：旧偏好没有这个字段、存储被手改过都会走到这里。 */
export function normalizeVideoSidePad(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return defaultVideoSidePad
  return clampVideoSidePad(value)
}

/** 预设直接用定义好的值；只有自定义才夹取传入的当前值。 */
export function resolveVideoSidePad(id: VideoSidePadId, current: number) {
  if (id === 'custom') return clampVideoSidePad(current)
  return videoSidePadPreset(id)?.pad ?? defaultVideoSidePad
}

/** 反查当前值落在哪个档位上，用来在弹层里选中对应的筹码。 */
export function videoSidePadIdFor(pad: number): VideoSidePadId {
  const hit = videoSidePadPresets.find(preset => preset.pad === clampVideoSidePad(pad))
  return hit?.id ?? 'custom'
}

export function videoSidePadLabel(id: VideoSidePadId, pad: number) {
  const value = clampVideoSidePad(pad)
  if (value <= 0) return '不额外留白'
  if (id === 'custom') return `自定义 ${value}px`
  return `${videoSidePadIdLabels[id]} ${value}px`
}

/** 当前档位的说明：预设用它自己的，自定义给一句通用的。 */
export function videoSidePadNote(id: VideoSidePadId, pad: number) {
  const preset = videoSidePadPreset(id)
  if (preset) return preset.note
  return clampVideoSidePad(pad) <= 0
    ? '填 0 等于关闭，画面尽量占满。'
    : '自己填的两侧留白：给多少就留多少，平台裁切与浮层压住的就是这两条。'
}

/* ============================ 留白怎么落进画面 ============================ */

/** 输出画布的尺寸（视频最终是多少像素）。 */
export interface VideoCanvas {
  width: number
  height: number
}

function positive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * 图片导出加上两侧留白后的输出尺寸。
 *
 * 图片没有「画布」这个概念——一张截图就是手机本身，所以留白直接加在左右两头：宽度各加 N，
 * 高度不变，手机的比例一个像素都不动（视频那边画布固定，才需要换比例去铺满高度）。
 * 长截图走同一条路，只是它的高度本来就由内容决定。
 */
export function paddedImageSize(size: VideoCanvas, sidePad = 0): VideoCanvas {
  const width = positive(size.width)
  const height = positive(size.height)
  if (!width || !height) return { width: 0, height: 0 }
  return { width: width + clampVideoSidePad(sidePad) * 2, height }
}

/**
 * 不额外留白时，手机等比放进画布自然产生的两侧留边（输出像素）。
 *
 * 「留白至少 N」就是跟它比：N 不超过它，画面一个像素都不变（9:16 画布约 97px）。
 */
export function videoNaturalSideGap(screen: ScreenSize = defaultScreenSize, canvas: VideoCanvas): number {
  const width = positive(canvas.width)
  const height = positive(canvas.height)
  if (!width || !height) return 0
  const scale = Math.min(width / phoneFrameWidth, height / designHeightFor(screen))
  return Math.max(0, (width - phoneFrameWidth * scale) / 2)
}

/**
 * 视频渲染该用的「屏幕尺寸」。
 *
 * 为什么需要它：留白一旦超过自然留边，手机再等比缩下去就是**宽高一起缩**——两侧是让出来了，
 * 上下也跟着空出一截，看上去就成了「四周留白」。所以这里把手机的画面比例换成
 * 「画布去掉两侧留白」的比例：手机铺满上下、两侧正好让出 N 像素，多出来的高度落在聊天区
 * （消息一条不动，只是窗口更高一点，像一台更细长的手机）。
 *
 * 返回值仍是一个 `ScreenSize`，因为下游全都认这个形状：`PhonePreview` 由它算坐标系高度、
 * `captureChatPhone` 由它算导出像素、`videoFrameLayout` 由它算取景框。换算成
 * 「宽度不变、高度按比例拉长」之后，采样密度（= 宽度 / 1125）与原来一模一样，
 * 所以下游一行都不用改就照着画。
 *
 * 留白在自然留边以内时原样返回，于是 0（默认）与不带这个参数完全一致。
 */
export function videoContentScreen(screen: ScreenSize = defaultScreenSize, canvas: VideoCanvas, sidePad = 0): ScreenSize {
  const pad = clampVideoSidePad(sidePad)
  if (pad <= 0) return screen
  const canvasHeight = positive(canvas.height)
  const contentWidth = positive(canvas.width) - pad * 2
  if (!canvasHeight || contentWidth <= 0) return screen
  if (pad <= videoNaturalSideGap(screen, canvas)) return screen
  const width = positive(screen.width) || defaultScreenSize.width
  const height = positive(screen.height) || defaultScreenSize.height
  // 取整方向偏大：让「高度」成为那个卡住的约束，于是上下一定铺满，两侧只会多不会少（最多 1px）。
  return { width, height: Math.max(height, Math.ceil((width * canvasHeight) / contentWidth)) }
}
