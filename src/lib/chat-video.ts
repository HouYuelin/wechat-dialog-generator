/**
 * 视频导出的纯计算部分：画面尺寸档位、编码格式探测、等比缩放居中、码率估算。
 * 与浏览器 API 的交互（MediaRecorder / canvas）放在 chat-video-recorder.ts。
 */

import { defaultScreenSize, type ScreenSize } from './phone-size'

export type VideoSizeId = 'vertical' | 'phone' | 'screen'

export interface VideoSizeOption {
  id: VideoSizeId
  width: number
  height: number
  label: string
  note: string
}

export const videoSizeOptions: VideoSizeOption[] = [
  {
    id: 'vertical',
    width: 1080,
    height: 1920,
    label: '1080×1920 竖屏',
    note: '标准 9:16，抖音 / 视频号 / 剪映可直接用；手机画面居中，两侧留对话底色。',
  },
  {
    id: 'phone',
    width: 1125,
    height: 2436,
    label: '1125×2436 满屏',
    note: '与导出的长截图一致，手机铺满整个画面；发到竖屏平台通常会被裁切，可以靠下面的「两侧留白」让开。',
  },
]

/**
 * 画面尺寸候选。前两档是固定画布，「跟随屏幕」按当前的屏幕尺寸现算——
 * 屏幕调成 9:16 时选它就等于满屏导出，不用先算好该选哪个固定档。
 */
export function videoSizeOptionsFor(screen: ScreenSize = defaultScreenSize): VideoSizeOption[] {
  return [...videoSizeOptions, {
    id: 'screen',
    width: screen.width,
    height: screen.height,
    label: '跟随屏幕',
    note: `与屏幕尺寸一致（当前 ${screen.width}×${screen.height}）：分辨率跟着屏幕走，「两侧留白」照旧生效。`,
  }]
}

export function videoSizeOption(id: VideoSizeId, screen: ScreenSize = defaultScreenSize): VideoSizeOption {
  const options = videoSizeOptionsFor(screen)
  return options.find(option => option.id === id) ?? options[0]
}

export interface FitRect {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

/**
 * 源画面等比缩放到目标画布并居中，保证不裁切、不变形。
 *
 * `sidePadding` 是给平台留的安全区（见 lib/video-padding.ts）：可用宽度先收窄
 * 2×sidePadding，画面再按比例缩一点、整体居中，两侧留出来的空白由调用方用底色填充。
 * 因为是「先收窄再等比缩放」，留白只会变大不会变小——9:16 这种比手机更窄的画布本来
 * 就会左右留边，两者取较大者。传 0（默认）时结果与不带这个参数完全一致。
 *
 * 注意：**宽度收窄会连高度一起缩**。要让画面在留白之后仍然铺满上下，得让源画面本身的比例
 * 跟上——那是 `videoContentScreen()` 的事（见 lib/video-padding.ts），这里只管等比摆放。
 */
export function fitRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number, sidePadding = 0): FitRect {
  const positive = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0)
  const sourceW = positive(sourceWidth)
  const sourceH = positive(sourceHeight)
  const targetW = positive(targetWidth)
  const targetH = positive(targetHeight)
  if (!sourceW || !sourceH || !targetW || !targetH) return { x: 0, y: 0, width: 0, height: 0, scale: 0 }
  // 留白最多吃掉「除中间一列之外」的全部宽度，避免可用宽度归零后算出 0 尺寸的画面。
  const pad = Math.min(Math.max(positive(sidePadding), 0), (targetW - 1) / 2)
  const availWidth = Math.max(1, targetW - pad * 2)
  const scale = Math.min(availWidth / sourceW, targetH / sourceH)
  const width = Math.round(sourceW * scale)
  const height = Math.round(sourceH * scale)
  return { x: Math.round(pad + (availWidth - width) / 2), y: Math.round((targetH - height) / 2), width, height, scale }
}

/** 优先 MP4（剪辑软件与社交平台兼容性最好），不支持时逐级回落到 WebM。 */
export const videoMimeCandidates = [
  'video/mp4;codecs="avc1.4d002a,mp4a.40.2"',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

export function pickVideoMimeType(supported: (mimeType: string) => boolean) {
  for (const candidate of videoMimeCandidates) {
    try {
      if (supported(candidate)) return candidate
    } catch {
      // 个别浏览器对异常串会直接抛错，跳过继续尝试下一档。
    }
  }
  return ''
}

export function videoFileExtension(mimeType: string) {
  return mimeType.includes('mp4') ? 'mp4' : 'webm'
}

export function videoContainerLabel(mimeType: string) {
  if (mimeType.includes('mp4')) return 'MP4'
  if (mimeType.includes('webm')) return 'WebM'
  return '视频'
}

/** 聊天画面大面积纯色，不需要太高的码率，但也要保证气泡文字边缘干净。 */
export function suggestedVideoBitrate(width: number, height: number) {
  const pixels = Math.max(0, (Number.isFinite(width) ? width : 0) * (Number.isFinite(height) ? height : 0))
  const raw = Math.min(12_000_000, Math.max(3_000_000, pixels * 3.2))
  return Math.round(raw / 250_000) * 250_000
}

export function videoExportSupported() {
  if (typeof window === 'undefined') return false
  return typeof window.MediaRecorder === 'function' && typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
}
