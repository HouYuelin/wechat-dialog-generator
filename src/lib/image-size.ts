/**
 * 聊天里图片消息的大小。
 *
 * 单位是内部坐标系的 px（`.wc-phone` 固定宽 1125），描述的是「图片占屏幕多大比例」，
 * 所以它跟导出分辨率无关——换屏幕尺寸时图片占比不变，不需要再乘一次采样倍率。
 *
 * 上限 700px 是被 CSS 卡出来的，不是随手定的：`.wc-chat-content` 左右各 36px 内边距、
 * `.wc-body` 的 max-width 是 calc(100% - 340px)，所以在 1125 的坐标系里气泡最宽
 * 1125 − 36×2 − 340 = 713px，再减去图片气泡自己的双边边框只剩 711px。
 */

export type ImageSizeId = 'small' | 'standard' | 'large' | 'xlarge' | 'custom'
export type ImagePresetId = Exclude<ImageSizeId, 'custom'>

/** 手填值必须夹在可用范围内：再小看不清，再大会被气泡裁掉。 */
export const minImageMax = 160
export const maxImageMax = 700
/** 默认值和改动前写死的 420px 一致，切档位不会让已有草稿的观感突然变样。 */
export const defaultImageMax = 420

export interface ImageSizePreset {
  id: ImagePresetId
  label: string
  /** 图片最长边的上限；等比缩放，长图按长边算。 */
  max: number
  note: string
}

/** 由小到大排列，弹层直接按顺序铺成筹码。 */
export const imageSizePresets: ImageSizePreset[] = [
  { id: 'small', label: '小', max: 300, note: '约占屏幕四分之一，多条图片时列表更紧凑' },
  { id: 'standard', label: '标准', max: 420, note: '微信里图片消息的常见观感，默认档' },
  { id: 'large', label: '大', max: 540, note: '约占屏幕一半，细节更容易看清' },
  { id: 'xlarge', label: '超大', max: 700, note: '接近气泡允许的最大宽度，适合做主图' },
]

export const imageSizeIdLabels: Record<ImageSizeId, string> = {
  small: '小',
  standard: '标准',
  large: '大',
  xlarge: '超大',
  custom: '自定义',
}

export function imageSizePreset(id: ImageSizeId) {
  return imageSizePresets.find(preset => preset.id === id) ?? null
}

export function clampImageMax(value: number) {
  // 这里给的是「大小」而不是「位置」，NaN 退回最小档会莫名其妙缩得很小，所以退回默认值。
  if (Number.isNaN(value)) return defaultImageMax
  return Math.min(maxImageMax, Math.max(minImageMax, Math.round(value)))
}

/**
 * 读取项目或分享链接里存的值。旧项目没有这个字段、链接被改坏、手改了存储都会走到这里，
 * 统一退回默认值而不是抛错。
 */
export function normalizeImageMax(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return defaultImageMax
  return clampImageMax(value)
}

/** 预设直接用定义好的值，只有自定义才夹取。 */
export function resolveImageMax(id: ImageSizeId, custom: number) {
  if (id === 'custom') return clampImageMax(custom)
  return imageSizePreset(id)?.max ?? defaultImageMax
}

/** 反查当前值落在哪个档位上，用来在弹层里选中对应的筹码。 */
export function imagePresetIdFor(max: number): ImageSizeId {
  const hit = imageSizePresets.find(preset => preset.max === max)
  return hit?.id ?? 'custom'
}

export function imageSizeLabel(id: ImageSizeId, max: number) {
  if (id === 'custom') return `自定义 ${max}px`
  return `${imageSizeIdLabels[id]} ${max}px`
}
