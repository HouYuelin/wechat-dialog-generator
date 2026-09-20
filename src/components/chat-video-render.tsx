import { createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { PhonePreview } from './PhonePreview'
import { captureChatPhone } from '@/lib/capture-chat'
import { defaultScreenSize, screenOutputSize, type ScreenSize } from '@/lib/phone-size'
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

/**
 * 逐条渲染对话并截成画面帧，供视频合成使用。
 * 沿用 batch-chat-render 的离屏挂载写法：不干扰用户正在编辑的预览，也不触发页面闪烁。
 */
export async function renderChatFrames(
  snapshot: ChatVideoSnapshot,
  options: { onProgress?: (step: number, total: number) => void; token?: { cancelled: boolean } } = {},
): Promise<RenderedChatFrames> {
  const total = snapshot.messages.length
  const screen = snapshot.screen ?? defaultScreenSize
  // 帧的像素尺寸跟屏幕尺寸一致，录制时再等比放进视频画布。
  const output = screenOutputSize(screen)
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:375px;pointer-events:none;'
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host)
  const root = createRoot(host)
  const ref = createRef<HTMLDivElement>()
  const blobs: Blob[] = []

  try {
    await document.fonts.ready
    for (let step = 0; step <= total; step++) {
      if (options.token?.cancelled) throw new Error('已取消生成。')
      flushSync(() => root.render(<PhonePreview {...snapshot} messages={snapshot.messages.slice(0, step)} phoneRef={ref} />))
      await nextPaint()
      // 头像和消息图片必须先解码完成，否则截出来是空白。
      const images = Array.from(host.querySelectorAll('img'))
      await Promise.all(images.map(image => image.decode().catch(() => {
        throw new Error('头像或消息图片加载失败，请替换为本地上传图片后重试。')
      })))
      const phone = ref.current
      if (!phone) throw new Error('聊天预览尚未就绪，请重试。')
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
    return { blobs, width: output.width, height: output.height }
  } finally {
    root.unmount()
    host.remove()
  }
}
