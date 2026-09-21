import { createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { PhonePreview } from './PhonePreview'
import { captureChatPhone } from '@/lib/capture-chat'
import { defaultScreenSize, type ScreenSize } from '@/lib/phone-size'
import type { BatchJob } from '@/lib/batch'

/**
 * 离屏渲染一组聊天。`screen` 是导出分辨率，只决定输出像素与画面高度，
 * 不改内部坐标系宽度；不传就是默认的 1125×2436。
 * `sidePad` 是两侧留白（输出像素，图片同样支持），底色取这一组自己的聊天背景色。
 */
export async function renderBatchChat(job: BatchJob, screen: ScreenSize = defaultScreenSize, sidePad = 0) {
  if (!job.snapshot?.messages.length) throw new Error('请先解析本组对话。')
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:375px;pointer-events:none;'
  host.setAttribute('aria-hidden', 'true'); document.body.append(host)
  const root = createRoot(host), ref = createRef<HTMLDivElement>()
  let canvas: HTMLCanvasElement | null = null
  try {
    flushSync(() => root.render(<PhonePreview {...job.snapshot!} screen={screen} phoneRef={ref} />))
    await document.fonts.ready
    await Promise.all(Array.from(host.querySelectorAll('img')).map(async image => {
      await image.decode().catch(() => { throw new Error('头像或消息图片加载失败，请替换为本地上传图片后重试。') })
    }))
    if (!ref.current) throw new Error('聊天预览尚未就绪。')
    const body = ref.current.querySelector('.wc-chat-body')
    if (body) body.scrollTop = 0
    canvas = await captureChatPhone(ref.current, job.mode === 'long', screen, {
      sidePad,
      background: job.snapshot.settings.backgroundColor,
    })
    if (!canvas) throw new Error('截图失败，请重试。')
    const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(value => value ? resolve(value) : reject(new Error('图片编码失败。')), 'image/png'))
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    root.unmount(); host.remove()
  }
}
