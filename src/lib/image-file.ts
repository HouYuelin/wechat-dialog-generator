/**
 * 把用户选中的图片文件读成素材库能存的 data URL。
 *
 * 为什么要压一道：素材库存的是 data URL，直接塞原图的话手机拍的照片动辄 3–5 MB，
 * 几十张就能把浏览器存储顶到上限，而聊天里最宽也只显示到内坐标系 700px（导出 2K 时
 * 约 896px）、头像更小。所以先把最长边压到 1280——导出到最大分辨率仍然够清晰，
 * 体积却能降一个数量级。
 *
 * 两种图刻意不重编码：动图（GIF）和矢量图（SVG）过一遍 canvas 会丢动画、丢矢量，
 * 不如原样存。已经很小的图也原样保留，避免无意义的二次压缩把画质磨掉。
 */
import { dataUrlBytes } from './media-library'

/** 存进素材库前的最长边上限。 */
export const mediaImageMaxSide = 1280
/** 超过这个体积的图即使尺寸不大也重编码一次，免得一条素材占掉几 MB。 */
export const mediaImageSoftBytes = 512 * 1024
export const mediaImageQuality = 0.9

export interface PickedImage {
  dataUrl: string
  /** 实际存下来的像素；读不到尺寸时是 0。 */
  width: number
  height: number
  name: string
}

/** 动图与矢量图重编码会丢内容，原样保留。 */
export function shouldKeepOriginal(mime: string) {
  return mime === 'image/gif' || mime === 'image/svg+xml'
}

/**
 * 等比缩放到最长边不超过 maxSide；只缩不放。
 * 宽高任一无意义（0、负数、NaN）时返回 0×0，调用方据此退回原图，别拿半个合法值算出怪尺寸。
 */
export function scaledImageSize(width: number, height: number, maxSide = mediaImageMaxSide) {
  const w = Number.isFinite(width) && width > 0 ? Math.round(width) : 0
  const h = Number.isFinite(height) && height > 0 ? Math.round(height) : 0
  if (!w || !h) return { width: 0, height: 0 }
  const longest = Math.max(w, h)
  if (longest <= maxSide) return { width: w, height: h }
  const ratio = maxSide / longest
  return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)) }
}

/** 尺寸已经够小、体积也不大，就没必要再编码一次。 */
export function needsReencode(width: number, height: number, dataUrl: string, maxSide = mediaImageMaxSide) {
  const scaled = scaledImageSize(width, height, maxSide)
  if (!scaled.width || !scaled.height) return false
  if (scaled.width !== Math.round(width) || scaled.height !== Math.round(height)) return true
  return dataUrlBytes(dataUrl) > mediaImageSoftBytes
}

/** 重编码时用的格式：png / webp 保原样（可能有透明），其余一律转 jpeg。 */
export function encodeMimeType(mime: string) {
  if (mime === 'image/png' || mime === 'image/webp') return mime
  return 'image/jpeg'
}

function readAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取图片失败，请重试或换一个文件。'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片解码失败，请换一张图片。'))
    image.src = dataUrl
  })
}

export async function imagePixelSize(dataUrl: string) {
  const image = await loadImage(dataUrl)
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }
}

/**
 * 读一个图片文件。文件本身有问题（不是图片、读不出来）会抛错，由调用方决定提示谁；
 * 只是压不动（canvas 不可用之类）则退回原始 data URL，宁可大一点也别让用户传不上去。
 */
export async function readImageFile(file: File, options: { maxSide?: number } = {}): Promise<PickedImage> {
  const maxSide = options.maxSide ?? mediaImageMaxSide
  const original = await readAsDataUrl(file)
  if (shouldKeepOriginal(file.type)) {
    const size = await imagePixelSize(original).catch(() => ({ width: 0, height: 0 }))
    return { dataUrl: original, ...size, name: file.name }
  }
  try {
    const image = await loadImage(original)
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!needsReencode(width, height, original, maxSide)) {
      return { dataUrl: original, width: Math.round(width), height: Math.round(height), name: file.name }
    }
    const scaled = scaledImageSize(width, height, maxSide)
    if (!scaled.width || !scaled.height) return { dataUrl: original, width: 0, height: 0, name: file.name }
    const canvas = document.createElement('canvas')
    canvas.width = scaled.width
    canvas.height = scaled.height
    const context = canvas.getContext('2d')
    if (!context) return { dataUrl: original, width: 0, height: 0, name: file.name }
    context.drawImage(image, 0, 0, scaled.width, scaled.height)
    const type = encodeMimeType(file.type)
    const dataUrl = canvas.toDataURL(type, type === 'image/jpeg' ? mediaImageQuality : undefined)
    // 压完反而更大（小图转 jpeg 的常见情况）就用原图。
    if (!dataUrl || dataUrlBytes(dataUrl) >= dataUrlBytes(original)) {
      return { dataUrl: original, width: Math.round(width), height: Math.round(height), name: file.name }
    }
    return { dataUrl, ...scaled, name: file.name }
  } catch {
    return { dataUrl: original, width: 0, height: 0, name: file.name }
  }
}

/** 只接受图片文件；拖拽进来的东西什么都可能是。 */
export function isImageFile(file: File) {
  if (file.type.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name)
}
