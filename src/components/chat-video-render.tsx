import { createRef, type RefObject } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { PhonePreview } from './PhonePreview'
import { captureChatPhone } from '@/lib/capture-chat'
import {
  estimatedScrollImageHeight,
  maxScrollImageHeight,
  scrollImageTooTallMessage,
} from '@/lib/chat-scroll-video'
import { defaultScreenSize, outputScaleFor, screenOutputSize, type ScreenSize } from '@/lib/phone-size'
import type { ChatMessage, ChatUser, PhoneSettings } from '@/types'

export interface ChatVideoSnapshot {
  users: ChatUser[]
  messages: ChatMessage[]
  settings: PhoneSettings
  selfId: number | null
  /** 每帧的渲染分辨率，与屏幕尺寸一致；不传按默认屏幕。 */
  screen?: ScreenSize
}

export interface RenderedChatFrames {
  /** blobs[k] = 只显示前 k 条消息的画面，长度恒为 messages.length + 1。 */
  blobs: Blob[]
  width: number
  height: number
}

function nextPaint() {
  return new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

function toBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(value => resolve(value), type))
}

interface OffscreenPhone {
  root: ReturnType<typeof createRoot>
  host: HTMLDivElement
  phone: HTMLDivElement
  /** 同一个 ref 必须一直挂在 phoneRef 上，重渲染后 ref.current 才还是那个节点。 */
  phoneRef: RefObject<HTMLDivElement | null>
}

/**
 * 把 PhonePreview 挂到屏幕外跑一段活儿，结束再拆掉。两种录制方式都要走这一遭：
 * 逐条播放要反复改 messages 重渲染，滚动到底只要渲染一次。
 * 沿用 batch-chat-render 的离屏挂载写法：不干扰用户正在编辑的预览，也不触发页面闪烁。
 */
async function withOffscreenPhone<T>(
  snapshot: ChatVideoSnapshot,
  run: (mount: OffscreenPhone) => Promise<T>,
): Promise<T> {
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:375px;pointer-events:none;'
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host)
  const root = createRoot(host)
  const ref = createRef<HTMLDivElement>()

  try {
    await document.fonts.ready
    flushSync(() => root.render(<PhonePreview {...snapshot} phoneRef={ref} />))
    await nextPaint()
    const phone = ref.current
    if (!phone) throw new Error('聊天预览尚未就绪，请重试。')
    // 头像和消息图片必须先解码完成，否则截出来是空白。
    const images = Array.from(host.querySelectorAll('img'))
    await Promise.all(images.map(image => image.decode().catch(() => {
      throw new Error('头像或消息图片加载失败，请替换为本地上传图片后重试。')
    })))
    return await run({ root, host, phone, phoneRef: ref })
  } finally {
    root.unmount()
    host.remove()
  }
}

/**
 * 逐条渲染对话并截成画面帧，供视频合成使用。
 */
export async function renderChatFrames(
  snapshot: ChatVideoSnapshot,
  options: { onProgress?: (step: number, total: number) => void; token?: { cancelled: boolean } } = {},
): Promise<RenderedChatFrames> {
  const total = snapshot.messages.length
  const screen = snapshot.screen ?? defaultScreenSize
  // 帧的像素尺寸跟屏幕尺寸一致，录制时再等比放进视频画布。
  const output = screenOutputSize(screen)
  const blobs: Blob[] = []

  await withOffscreenPhone(snapshot, async ({ root, host, phone, phoneRef }) => {
    for (let step = 0; step <= total; step++) {
      if (options.token?.cancelled) throw new Error('已取消生成。')
      flushSync(() => root.render(<PhonePreview {...snapshot} messages={snapshot.messages.slice(0, step)} phoneRef={phoneRef} />))
      await nextPaint()
      // 头像和消息图片必须先解码完成，否则截出来是空白。
      const images = Array.from(host.querySelectorAll('img'))
      await Promise.all(images.map(image => image.decode().catch(() => {
        throw new Error('头像或消息图片加载失败，请替换为本地上传图片后重试。')
      })))
      // 视频里的对话始终贴底，和真实聊天窗口一致。
      const body = phone.querySelector('.wc-chat-body') as HTMLElement | null
      if (body) body.scrollTop = body.scrollHeight
      const canvas = await captureChatPhone(phone, false, screen)
      if (!canvas) throw new Error('画面截取失败，请重试。')
      const blob = await toBlob(canvas, 'image/png')
      canvas.width = 0
      canvas.height = 0
      if (!blob) throw new Error('画面编码失败，请重试。')
      blobs.push(blob)
      options.onProgress?.(step + 1, total + 1)
      // 让出主线程，进度条才能刷新。
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  })
  return { blobs, width: output.width, height: output.height }
}

export interface RenderedChatScrollFrame {
  /** 整段对话（顶栏 + 全部消息 + 底栏）的一张长图。 */
  blob: Blob
  width: number
  height: number
  /** 顶栏 / 底栏在长图里的像素高度：滚动时这两段固定不动。 */
  topChromeHeight: number
  bottomChromeHeight: number
  /** 一屏的大小（输出像素），录制时按它切窗口。 */
  viewport: { width: number; height: number }
}

/**
 * 把整段对话铺成一张长图，供滚动视频使用。
 *
 * 走的是长截图那条路径（`captureChatPhone(phone, true)`）：顶栏、全部消息、底栏一次拍完。
 * 录制阶段只是在这张图上裁一个窗口让它往上走，所以渲染只发生这一次——这也是几十秒的
 * 滚动视频还能录得稳的原因：每帧的开销只有几次 drawImage。
 *
 * 代价是长图有 16000 像素的栅格化上限（与长截图同一条限制），所以这里先量一遍内容高度，
 * 超了就趁早给出可操作的说法，而不是让用户等一场注定失败的截图。
 */
export async function renderChatScrollFrame(
  snapshot: ChatVideoSnapshot,
  options: { token?: { cancelled: boolean } } = {},
): Promise<RenderedChatScrollFrame> {
  const screen = snapshot.screen ?? defaultScreenSize
  const output = screenOutputSize(screen)

  return withOffscreenPhone(snapshot, async ({ phone }) => {
    if (options.token?.cancelled) throw new Error('已取消生成。')
    const top = phone.querySelector('.wc-phone-top') as HTMLElement | null
    const bottom = phone.querySelector('.wc-bottom') as HTMLElement | null
    const content = phone.querySelector('.wc-chat-content') as HTMLElement | null
    if (!top || !bottom) throw new Error('聊天预览结构异常，请刷新页面后重试。')

    // 顶栏 / 底栏的高度量出来是内部坐标（1125 宽那一套），换算成输出像素才能拿去切长图。
    const scale = outputScaleFor(screen)
    const topChromeHeight = Math.round(top.offsetHeight * scale)
    const bottomChromeHeight = Math.round(bottom.offsetHeight * scale)

    const designHeight = top.offsetHeight + (content?.scrollHeight ?? 0) + bottom.offsetHeight
    const estimated = estimatedScrollImageHeight(designHeight, screen)
    if (estimated > maxScrollImageHeight) throw new Error(scrollImageTooTallMessage(estimated, screen))

    // 估算可能比真实高度低几个像素，长图那条路径自己也有同一个上限的保护；
    // 真漏过去了就把它的报错换成滚动视频的说法，别拿「请拆分为多组导出」去说滚动视频。
    const canvas = await captureChatPhone(phone, true, screen).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : ''
      if (message.includes(String(maxScrollImageHeight))) throw new Error(scrollImageTooTallMessage(estimated, screen))
      throw error instanceof Error ? error : new Error('画面截取失败，请重试。')
    })
    if (!canvas) throw new Error('画面截取失败，请重试。')
    const width = canvas.width
    const height = canvas.height
    const blob = await toBlob(canvas, 'image/png')
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('画面编码失败，请重试。')
    if (options.token?.cancelled) throw new Error('已取消生成。')

    return {
      blob,
      width,
      height,
      topChromeHeight,
      bottomChromeHeight,
      viewport: { width: output.width, height: output.height },
    }
  })
}
