/**
 * 聊天内容的字号缩放。
 *
 * 存的不是字号，而是「百分比尺度」（100 = 改动前的观感）。因为要一起走的是一整套
 * 排版度量：气泡字号与行高、气泡内边距、头像尺寸、头像与气泡的间距、消息之间的留白、
 * 昵称与时间戳的字号、语音条与红包内部的比例……只把字号改小的话，框还是原来那么大，
 * 一屏并放不下更多东西——而「一屏看到更多内容」正是这个设置的目的。
 *
 * 具体由 PhonePreview.css 里的 --wc-font-scale 消费，单位仍是内部坐标系 px，
 * 与导出分辨率无关（换屏幕尺寸时字号占比不变，跟图片大小是一个道理）。
 *
 * 注意比例会反向影响可用宽度：字号放大时两侧留白跟着变宽，气泡能用的宽度就变窄，
 * 所以 CSS 里图片与红包的宽度都用 --wc-body-max 兜了一道（见 PhonePreview.css）。
 */

export type FontScaleId = 'compact' | 'small' | 'standard' | 'large' | 'xlarge' | 'custom'
export type FontScalePresetId = Exclude<FontScaleId, 'custom'>

/** 下限保证再小也看得清；上限是排版能撑住的范围，再大气泡里就放不下几个字了。 */
export const minFontScale = 70
export const maxFontScale = 140
/** 100 = 改动前的观感。默认档不做任何缩放，老草稿打开后一个像素都不变。 */
export const defaultFontScale = 100

export interface FontScalePreset {
  id: FontScalePresetId
  label: string
  /** 百分比尺度，100 为不缩放。 */
  scale: number
  note: string
}

/** 由小到大排列，弹层直接按顺序铺成筹码。 */
export const fontScalePresets: FontScalePreset[] = [
  { id: 'compact', label: '紧凑', scale: 80, note: '一屏能多放三到四条消息，长对话不容易截断' },
  { id: 'small', label: '偏小', scale: 90, note: '比默认略小，更接近手机上聊天的实际观感' },
  { id: 'standard', label: '标准', scale: 100, note: '默认档，与原来的效果完全一致' },
  { id: 'large', label: '偏大', scale: 115, note: '字更清楚，但一屏能放下的消息会少一些' },
  { id: 'xlarge', label: '特大', scale: 130, note: '适合演示或当封面主图，一屏放不下几条消息' },
]

export const fontScaleIdLabels: Record<FontScaleId, string> = {
  compact: '紧凑',
  small: '偏小',
  standard: '标准',
  large: '偏大',
  xlarge: '特大',
  custom: '自定义',
}

export function fontScalePreset(id: FontScaleId) {
  return fontScalePresets.find(preset => preset.id === id) ?? null
}

export function clampFontScale(value: number) {
  // 和图片大小同理：这里给的是「大小」而不是「位置」，NaN 退回最小档会缩到看不清，所以退回默认值。
  if (Number.isNaN(value)) return defaultFontScale
  return Math.min(maxFontScale, Math.max(minFontScale, Math.round(value)))
}

/**
 * 读取项目或分享链接里存的值。旧项目没有这个字段、链接被改坏、手改了存储都会走到这里，
 * 统一退回默认值而不是抛错。
 */
export function normalizeFontScale(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return defaultFontScale
  return clampFontScale(value)
}

/** 预设直接用定义好的值，只有自定义才夹取。 */
export function resolveFontScale(id: FontScaleId, custom: number) {
  if (id === 'custom') return clampFontScale(custom)
  return fontScalePreset(id)?.scale ?? defaultFontScale
}

/** 反查当前值落在哪个档位上，用来在弹层里选中对应的筹码。 */
export function fontScaleIdFor(scale: number): FontScaleId {
  const hit = fontScalePresets.find(preset => preset.scale === scale)
  return hit?.id ?? 'custom'
}

export function fontScaleLabel(id: FontScaleId, scale: number) {
  if (id === 'custom') return `自定义 ${scale}%`
  return `${fontScaleIdLabels[id]} ${scale}%`
}

/** 交给 CSS 的系数，即 --wc-font-scale 的值。 */
export function fontScaleRatio(scale: number) {
  return clampFontScale(scale) / 100
}

/**
 * 聊天区两侧被留白吃掉的宽度：`.wc-chat-content` 左右各 36px 内边距，加上
 * `.wc-body` 的 `max-width` 扣减量 340px。注意 340 并不是两侧 margin 之和
 * （160 + 140 = 300），CSS 里另留了 40px 余量，别按 margin 去反推。
 * 这两处在 PhonePreview.css 里同样按 --wc-font-scale 缩放，改任何一处都要回来改这里。
 */
export const bubbleInsetPx = 36 * 2 + 340

/**
 * 某个缩放档下气泡能用的最大宽度，也就是 PhonePreview.css 里 --wc-body-max 的值
 * （由 PhonePreview 注入，CSS 不再自己算，避免两处各写一套）。
 *
 * 100% 时是 1125 − 412 = 713px，正是 image-size.ts 里「图片上限 700 是被 CSS 卡出来的」
 * 那个 713：字号放大后这个值会变小，所以图片与红包还要再跟它取一次 min。
 */
export function bubbleMaxWidth(scale: number, coordinateWidth = 1125) {
  return Math.round(coordinateWidth - bubbleInsetPx * fontScaleRatio(scale))
}
