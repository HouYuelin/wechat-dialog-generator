/**
 * 滚动视频：整段对话从顶部滚到底部，时长由用户设定。
 *
 * 和「逐条播放」的区别在于画面怎么来。逐条播放是「每多一条消息换一帧」，
 * 这里反过来：**一次性把整段对话铺成一张长图**，再让一个和手机屏幕一样大的窗口
 * 从长图顶部匀速滑到底部。长图里顶栏（状态栏 + 会话标题）与底栏（输入框）在窗口里
 * 始终固定不动，只有中间那段聊天区在动——和真机上滚聊天记录看到的一样。
 *
 * 这个文件只有纯计算：时长规划、滚动位置、画面切分、超限提示。浏览器 API 在
 * chat-video-recorder.ts，DOM 在 chat-video-render.tsx。
 */

import { outputScaleFor, type ScreenSize } from './phone-size'

/** 滚动视频能设置的时长（秒）。太短来不及看清，太长没人看完。 */
export const minScrollDurationSeconds = 3
export const maxScrollDurationSeconds = 60
export const defaultScrollDurationSeconds = 15

/** 长图超过这个高度浏览器就画不出来，与长截图共用同一个上限。 */
export const maxScrollImageHeight = 16000

export function clampScrollDurationSeconds(value: number) {
  // 只有 NaN 需要兜底；±Infinity 交给 clamp 自然饱和到上下界（同 lib/phone-size.ts 的约定）。
  if (Number.isNaN(value)) return defaultScrollDurationSeconds
  return Math.min(maxScrollDurationSeconds, Math.max(minScrollDurationSeconds, Math.round(value)))
}

export interface ScrollVideoPlan {
  /** 用户设定的总时长：视频就是这个长度，不是「总时长 + 结尾停留」。 */
  durationMs: number
  /** 开头静止，让人看清第一条消息再开始滚。 */
  leadInMs: number
  scrollMs: number
  /** 结尾停在底部，最后一条消息留出读的时间。 */
  holdMs: number
}

function clampRange(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/**
 * 把用户设定的时长拆成三段：开头静止 / 滚动 / 结尾停留。
 *
 * 前后两段都按时长取比例并夹在区间内，所以 3 秒的短视频不会把一半时间花在停留上，
 * 一分钟的长视频也不会让结尾突兀地定住。三段之和恒等于用户设定的总时长——
 * 界面上写「15 秒」，导出的视频就该是 15 秒。
 */
export function scrollVideoPlan(valueMs: number): ScrollVideoPlan {
  const durationMs = Math.round(clampScrollDurationSeconds(valueMs / 1000) * 1000)
  const leadInMs = clampRange(Math.round(durationMs * 0.08), 250, 800)
  const holdMs = clampRange(Math.round(durationMs * 0.15), 400, 1500)
  // 时长下限是 3 秒，减去上面两段最多 2.3 秒，这里不会真的兜到下限。
  const scrollMs = Math.max(400, durationMs - leadInMs - holdMs)
  return { durationMs, leadInMs, scrollMs, holdMs }
}

/** 缓入缓出：起步和收尾柔和一点，中段接近匀速，比生硬的匀速滑更像手指滚屏。 */
export function scrollEase(progress: number) {
  if (!Number.isFinite(progress)) return 0
  const p = clampRange(progress, 0, 1)
  return p * p * (3 - 2 * p)
}

/** 某个时刻滚了多少（0 = 停在顶部，1 = 已经到底）。 */
export function scrollProgressAt(elapsedMs: number, plan: ScrollVideoPlan) {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= plan.leadInMs) return 0
  const scrolled = elapsedMs - plan.leadInMs
  if (scrolled >= plan.scrollMs) return 1
  return scrollEase(scrolled / plan.scrollMs)
}

/**
 * 某个时刻长图该往上挪多少像素。
 * 取整是有意的：整数偏移不会让长图被重新采样，气泡文字边缘始终干净。
 */
export function scrollOffsetAt(elapsedMs: number, plan: ScrollVideoPlan, maxOffset: number) {
  const max = Number.isFinite(maxOffset) && maxOffset > 0 ? maxOffset : 0
  if (!max) return 0
  return Math.round(scrollProgressAt(elapsedMs, plan) * max)
}

export interface ScrollVideoLayout {
  imageWidth: number
  imageHeight: number
  /** 顶栏在长图里的高度：滚动时固定不动。 */
  topChromeHeight: number
  /** 底栏同上。 */
  bottomChromeHeight: number
  /** 聊天区在画面里露出的高度。 */
  bodyViewportHeight: number
  /** 聊天区在长图里的总高度；它比露出的部分高多少，就能滚多少。 */
  bodySourceHeight: number
  /** 能滚动的最大距离。内容不足一屏时为 0，此时画面完全静止。 */
  maxOffset: number
}

/**
 * 长图怎么切片：顶栏、聊天区、底栏各占哪一段。
 *
 * 底栏锚在长图**最底部**而不是「聊天区下方」，这样即使换算带进了 1 像素的舍入误差，
 * 也只会体现在聊天区的高度上，不会在底栏上方露出缝。
 */
export function scrollVideoLayout(
  image: { width: number; height: number },
  chrome: { top: number; bottom: number },
  viewport: { width: number; height: number },
): ScrollVideoLayout {
  const imageHeight = Math.max(0, Math.round(Number.isFinite(image.height) ? image.height : 0))
  const imageWidth = Math.max(0, Math.round(Number.isFinite(image.width) ? image.width : 0))
  const top = clampRange(Math.round(Number.isFinite(chrome.top) ? chrome.top : 0), 0, imageHeight)
  const bottom = clampRange(Math.round(Number.isFinite(chrome.bottom) ? chrome.bottom : 0), 0, imageHeight - top)
  const viewportHeight = Math.max(0, Math.round(Number.isFinite(viewport.height) ? viewport.height : 0))
  const bodySourceHeight = Math.max(0, imageHeight - top - bottom)
  const bodyViewportHeight = Math.max(0, viewportHeight - top - bottom)
  return {
    imageWidth,
    imageHeight,
    topChromeHeight: top,
    bottomChromeHeight: bottom,
    bodyViewportHeight,
    bodySourceHeight,
    maxOffset: Math.max(0, bodySourceHeight - bodyViewportHeight),
  }
}

/**
 * 长图在输出像素下的高度估算，用来在真的截图之前判断会不会超上限。
 * 换算是「内部坐标 × 输出倍率」，与长截图完全一致。
 */
export function estimatedScrollImageHeight(designHeight: number, screen: ScreenSize) {
  if (!Number.isFinite(designHeight) || designHeight <= 0) return 0
  return Math.round(designHeight * outputScaleFor(screen))
}

/** 内容高到画不出来时的提示：说清超了多少，并给出真能落地的两条出路。 */
export function scrollImageTooTallMessage(outputHeight: number, screen: ScreenSize) {
  const scale = outputScaleFor(screen) || 1
  const fitDesign = Math.floor(maxScrollImageHeight / scale)
  return `对话展开后有约 ${Math.round(outputHeight)} 像素高，超过单张画布上限（${maxScrollImageHeight} 像素），没法生成滚动视频。`
    + `删掉一些消息，或把「屏幕尺寸」调小——导出分辨率越低，同样内容占的像素越少，`
    + `例如当前的 ${screen.width}×${screen.height} 最多装约 ${fitDesign} 像素（内部尺寸）的内容。`
}

function formatSeconds(ms: number) {
  const value = Math.max(0, ms) / 1000
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)))
}

/** 时长拆分的白话说明，显示在滑杆下面。 */
export function scrollPlanLabel(plan: ScrollVideoPlan) {
  return `视频共 ${formatSeconds(plan.durationMs)} 秒：开头静止 ${formatSeconds(plan.leadInMs)} 秒，`
    + `中间 ${formatSeconds(plan.scrollMs)} 秒滚动，最后 ${formatSeconds(plan.holdMs)} 秒停在底部。`
}
