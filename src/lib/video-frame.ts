/**
 * 视频取景框：把「导出成视频的那一帧」按比例缩到预览里，好让两侧留白当场看得见。
 *
 * 为什么需要：留白本来只体现在成片里——调完得导一遍、发出去、在手机上看，才知道够不够。
 * 预览里把整块画布画出来（手机居中、两侧留白就是底色边带），调多少就当场变多少。
 *
 * 几何和录制时**同一套**：`chat-video-recorder` 拿 `fitRect(屏幕尺寸, 画布尺寸, sidePadding)`
 * 把手机放进画布，逐条播放与滚动到底都是这一句（滚动模式放进去的也是「一屏」那个窗口，
 * 长图只是在窗口里往上走）。这里用内部坐标系的 1125×设计高度代替屏幕尺寸——两者比例相同，
 * 只差几个像素的舍入，所以预览里看到的边带宽度就是成片里的边带宽度。
 *
 * 「屏幕尺寸」在留白超过自然留边时会换成 `videoContentScreen()` 给出的那一份（比例 = 画布
 * 去掉两侧留白），所以预览里的手机同样铺满上下、只左右留白，与成片一致。
 *
 * 只算数字，不碰 DOM；预览那边拿结果去设 CSS 变量。
 */

import { fitRect } from './chat-video'
import { clampVideoSidePad, videoContentScreen } from './video-padding'
import { defaultScreenSize, designHeightFor, phoneFrameWidth, type ScreenSize } from './phone-size'

export interface VideoFrameOutput {
  width: number
  height: number
}

export interface VideoFrameLayout {
  /** 取景框（= 视频画布）在预览里显示多大。 */
  canvasWidth: number
  canvasHeight: number
  /** 手机画面在取景框里显示多大，始终居中。 */
  phoneWidth: number
  phoneHeight: number
  /** 两侧实际留出的预览像素。含画布本来就有的留边，所以只会 ≥ 设置值。 */
  sidePadding: number
  /** 预览像素 ÷ 输出像素。 */
  scale: number
}

const emptyLayout: VideoFrameLayout = {
  canvasWidth: 0,
  canvasHeight: 0,
  phoneWidth: 0,
  phoneHeight: 0,
  sidePadding: 0,
  scale: 0,
}

function positive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * 取景框的显示尺寸。
 *
 * `canvasWidth` 是外层给的目标宽度（预览里那个「窗口大小」档位现在指的是取景框的宽度），
 * 高度按画布比例算出来；手机按 `fitRect` 等比放进画布再整体乘同一个系数，所以
 * 「手机占画布的比例」与成片完全一致——留白多一分，手机就窄一分（高度仍然是铺满的，
 * 因为留白生效时手机的比例已经换成了「画布去掉两侧留白」那份）。
 */
export function videoFrameLayout(
  canvasWidth: number,
  output: VideoFrameOutput | null | undefined,
  screen: ScreenSize = defaultScreenSize,
  sidePad = 0,
): VideoFrameLayout {
  const targetWidth = positive(canvasWidth)
  const outputWidth = positive(output?.width ?? 0)
  const outputHeight = positive(output?.height ?? 0)
  if (!targetWidth || !outputWidth || !outputHeight) return { ...emptyLayout }

  const pad = clampVideoSidePad(sidePad)
  const content = videoContentScreen(screen, { width: outputWidth, height: outputHeight }, pad)
  const rect = fitRect(phoneFrameWidth, designHeightFor(content), outputWidth, outputHeight, pad)
  const scale = targetWidth / outputWidth

  return {
    canvasWidth: Math.round(targetWidth),
    canvasHeight: Math.round(outputHeight * scale),
    phoneWidth: Math.round(rect.width * scale),
    phoneHeight: Math.round(rect.height * scale),
    sidePadding: Math.round(rect.x * scale),
    scale,
  }
}

/** 取景框有没有内容可画：尺寸全为 0 时预览那边就别画了。 */
export function videoFrameReady(layout: VideoFrameLayout) {
  return layout.canvasWidth > 0 && layout.canvasHeight > 0 && layout.phoneWidth > 0 && layout.phoneHeight > 0
}

/** 取景框下面那行说明，例如「视频取景框 1080×1920 · 两侧各留 120px」。 */
export function videoFrameLabel(output: VideoFrameOutput, sidePad: number) {
  const width = Math.round(positive(output.width))
  const height = Math.round(positive(output.height))
  const pad = clampVideoSidePad(sidePad)
  return pad > 0
    ? `视频取景框 ${width}×${height} · 两侧各留 ${pad}px`
    : `视频取景框 ${width}×${height} · 不额外留白`
}
