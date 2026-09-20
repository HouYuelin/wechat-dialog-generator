/**
 * 手机画面的尺寸：预览里显示多大，以及导出成多少像素。
 *
 * 内部坐标系（`.wc-phone`）永远按 1125 宽布局——PhonePreview.css 里上千个尺寸都是
 * 按这个宽度调的，不能跟着分辨率一起变。所以「屏幕尺寸」只做两件事：
 * 1. `designHeightFor()` 换算出这个坐标系该有多高，决定屏幕比例（9:16 还是 19.5:9）；
 * 2. `outputScaleFor()` 换算出导出时的采样倍率，决定最终输出多少像素。
 *
 * 预览的显示宽度（下面那段）跟分辨率无关，纯粹是页面上的缩放。
 */

/** 内部坐标系宽度，不要改。 */
export const phoneFrameWidth = 1125
/** 默认屏幕高度，也就是内部坐标系在默认屏幕下的高度。 */
export const phoneFrameHeight = 2436

/* ============================ 屏幕尺寸（导出分辨率） ============================ */

export interface ScreenSize {
  width: number
  height: number
}

export type ScreenPresetId = 'fhd' | 'android-fhd' | 'iphone-x' | 'iphone-13' | 'iphone-max' | 'qhd'
export type ScreenSizeId = ScreenPresetId | 'custom'

export const defaultScreenSize: ScreenSize = { width: phoneFrameWidth, height: phoneFrameHeight }

export const minScreenWidth = 720
export const maxScreenWidth = 2400
export const minScreenHeight = 1280
export const maxScreenHeight = 4000
/**
 * 最扁也保持 1.3:1。
 * 再扁下去，固定的顶栏与底栏会在屏幕上占掉大半，聊天区被挤成一条缝。
 */
export const minScreenAspect = 1.3

export interface ScreenSizePreset {
  id: ScreenPresetId
  label: string
  width: number
  height: number
  note: string
}

/** 按常见机型分辨率从低到高排列，默认档是 1125×2436。 */
export const screenSizePresets: ScreenSizePreset[] = [
  { id: 'fhd', label: '1080×1920', width: 1080, height: 1920, note: '9:16 竖屏，1080P，通用性最好' },
  { id: 'android-fhd', label: '1080×2340', width: 1080, height: 2340, note: '常见安卓 19.5:9 全面屏' },
  { id: 'iphone-x', label: '1125×2436', width: 1125, height: 2436, note: 'iPhone X / 11 Pro，默认档' },
  { id: 'iphone-13', label: '1170×2532', width: 1170, height: 2532, note: 'iPhone 12 / 13 / 14' },
  { id: 'iphone-max', label: '1290×2796', width: 1290, height: 2796, note: 'iPhone Plus / Pro Max 大屏' },
  { id: 'qhd', label: '1440×3120', width: 1440, height: 3120, note: '2K 安卓，细节最足、导出最慢' },
]

export function screenSizePreset(id: ScreenSizeId) {
  return screenSizePresets.find(item => item.id === id) ?? null
}

function clampRange(value: number, min: number, max: number) {
  // 只有 NaN 需要兜底；±Infinity 交给 clamp 自然饱和到上下界。
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * 手填的宽高必须夹在可用范围内：太小导出模糊，太大既慢又可能超出浏览器画布上限。
 * 高度还要额外守住最小比例，避免宽高各填各的导致聊天区消失。
 */
export function clampScreenSize(size: ScreenSize): ScreenSize {
  const width = clampRange(size.width, minScreenWidth, maxScreenWidth)
  const heightFloor = Math.max(minScreenHeight, Math.ceil(width * minScreenAspect))
  const height = clampRange(size.height, heightFloor, Math.max(heightFloor, maxScreenHeight))
  return { width, height }
}

/** 解析出最终使用的屏幕尺寸：预设直接用，自定义才夹取。 */
export function resolveScreenSize(id: ScreenSizeId, custom: ScreenSize): ScreenSize {
  if (id === 'custom') return clampScreenSize(custom)
  const preset = screenSizePreset(id)
  return preset ? { width: preset.width, height: preset.height } : clampScreenSize(custom)
}

/** 反查某个尺寸对应哪个预设，用来在弹层里选中正确的档位。 */
export function screenPresetIdFor(size: ScreenSize): ScreenSizeId {
  const hit = screenSizePresets.find(item => item.width === size.width && item.height === size.height)
  return hit?.id ?? 'custom'
}

function positive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** 屏幕的高宽比。任一方向非法就整体退回默认屏幕，避免半个合法值凑出荒唐的比例。 */
export function phoneAspect(screen: ScreenSize = defaultScreenSize) {
  const width = positive(screen.width)
  const height = positive(screen.height)
  if (!width || !height) return phoneFrameHeight / phoneFrameWidth
  return height / width
}

/** 内部坐标系该有多高：宽度恒为 1125，按屏幕比例换算。 */
export function designHeightFor(screen: ScreenSize = defaultScreenSize) {
  return Math.max(1, Math.round(phoneFrameWidth * phoneAspect(screen)))
}

/** 导出采样倍率：分辨率越大，栅格化密度越高，文字边缘越干净。 */
export function outputScaleFor(screen: ScreenSize = defaultScreenSize) {
  const width = positive(screen.width)
  return width ? width / phoneFrameWidth : 1
}

export function screenSizeLabel(screen: ScreenSize = defaultScreenSize) {
  return `${screen.width}×${screen.height}`
}

/** 规范化屏幕尺寸：非法值退回默认屏幕，避免导出时算出 0 像素。 */
function normalizedScreen(screen: ScreenSize = defaultScreenSize): ScreenSize {
  const width = positive(screen.width)
  const height = positive(screen.height)
  return width && height ? { width: Math.round(width), height: Math.round(height) } : { ...defaultScreenSize }
}

/** 一屏截图的导出像素，就是屏幕尺寸本身。 */
export function screenOutputSize(screen: ScreenSize = defaultScreenSize): ScreenSize {
  return normalizedScreen(screen)
}

/** 长截图的导出像素：宽度同上，高度按同样的采样倍率换算。 */
export function longshotOutputSize(screen: ScreenSize, contentHeight: number) {
  return {
    width: normalizedScreen(screen).width,
    height: Math.max(1, Math.round(Math.max(0, contentHeight) * outputScaleFor(screen))),
  }
}

/* ============================ 预览显示尺寸 ============================ */

export type PhoneSizeId = 'auto' | 'small' | 'standard' | 'large' | 'xlarge' | 'custom'
export type PhonePresetId = Exclude<PhoneSizeId, 'auto' | 'custom'>

export const minPhoneWidth = 200
export const maxPhoneWidth = 720

export interface PhoneSizePreset {
  id: PhonePresetId
  label: string
  width: number
  note: string
}

/** 常用的几个手机宽度，覆盖窄屏到超宽屏。 */
export const phoneSizePresets: PhoneSizePreset[] = [
  { id: 'small', label: '小', width: 320, note: '约 iPhone SE 宽度，适合窄窗口并排对照' },
  { id: 'standard', label: '标准', width: 375, note: '常见 6.1 英寸手机宽度，默认' },
  { id: 'large', label: '大', width: 430, note: '大屏手机宽度，字更大更好读' },
  { id: 'xlarge', label: '超大', width: 500, note: '接近导出画面在桌面上的观感' },
]

export const phoneSizeIdLabels: Record<PhoneSizeId, string> = {
  auto: '自适应',
  small: '小',
  standard: '标准',
  large: '大',
  xlarge: '超大',
  custom: '自定义',
}

export function phoneSizePreset(id: PhonePresetId) {
  return phoneSizePresets.find(item => item.id === id) ?? null
}

/** 手填的宽度必须夹在可用范围内，否则会大到看不全或小到看不清。 */
export function clampPhoneWidth(value: number) {
  // 只有 NaN 需要兜底；±Infinity 交给 clamp 自然饱和到上下界。
  if (Number.isNaN(value)) return minPhoneWidth
  return Math.min(maxPhoneWidth, Math.max(minPhoneWidth, Math.round(value)))
}

/**
 * 显示高度。故意从 `designHeightFor()` 换算，而不是直接乘屏幕比例：
 * 预览容器的高度和缩放后的画面高度必须来自同一个数，否则会有 1px 的缝。
 */
export function phoneDisplayHeight(width: number, screen: ScreenSize = defaultScreenSize) {
  return Math.round(width * designHeightFor(screen) / phoneFrameWidth)
}

export function phoneDisplayScale(width: number) {
  return width / phoneFrameWidth
}

/**
 * 决定最终使用的显示宽度：
 * - auto 直接用容器量出来的自适应宽度（可以很小，必须能塞进面板）；
 * - 其余档位用固定宽度，并夹在 minPhoneWidth..maxPhoneWidth 之间。
 */
export function resolvePhoneWidth(size: PhoneSizeId, customWidth: number, autoWidth: number) {
  if (size === 'auto') return Math.max(1, Math.round(autoWidth))
  if (size === 'custom') return clampPhoneWidth(customWidth)
  return clampPhoneWidth(phoneSizePreset(size)?.width ?? customWidth)
}

/** 给按钮和设置面板用的说明文字。 */
export function phoneSizeLabel(size: PhoneSizeId, width: number) {
  if (size === 'auto') return `自适应 ${width}px`
  if (size === 'custom') return `自定义 ${width}px`
  return `${phoneSizeIdLabels[size]} ${width}px`
}
