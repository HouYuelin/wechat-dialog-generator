import { frameIndexAt, type NotifyEvent } from './chat-playback'
import { fitRect, pickVideoMimeType, suggestedVideoBitrate, videoExportSupported, type FitRect } from './chat-video'
import { scrollOffsetAt, scrollVideoLayout, type ScrollVideoLayout, type ScrollVideoPlan } from './chat-scroll-video'
import { createNotifyPlayer, resumeNotifyAudio, type NotifyCustomBuffers, type NotifyPlayer } from './notify-sound'

export interface ChatVideoAudioOptions {
  /** 与实时播放共用的音频上下文；调用方需在任何用户手势里先 resume 过。 */
  context: AudioContext
  /** 收/发各自的自定义提示音；没给的那类用内置合成音。 */
  buffers?: NotifyCustomBuffers
  volume?: number
}

export interface RecordedChatVideo {
  blob: Blob
  mimeType: string
}

/**
 * 录制外壳：两种录制方式（逐条播放 / 滚动到底）共用同一套画布、编码器、进度、取消与
 * 可见性检查——这些逻辑只跟「录一段固定时长的视频」有关，跟画面怎么来无关，所以
 * 由调用方把「每一刻该画什么」交进来（`draw`），外壳只管按 60fps 调它。
 */
interface VideoSession {
  size: { width: number; height: number }
  /** 竖屏画布两侧的留底色，通常取对话背景色。 */
  background: string
  totalMs: number
  /** 提示音出现的时刻与音效类型；空数组即整段无声。 */
  notifyAt: NotifyEvent[]
  audio?: ChatVideoAudioOptions | null
  token?: { cancelled: boolean }
  onProgress?: (elapsedMs: number, totalMs: number) => void
  /**
   * 画出 elapsedMs 时刻的画面。画布上仍是上一帧的内容，所以「这一帧还没准备好」时
   * 什么都不做就等于保持上一帧，不会闪黑。
   */
  draw: (context: CanvasRenderingContext2D, elapsedMs: number) => void
  /** 录制前的一次性准备（解码素材等）；抛错就中止，且一定会调到 release。 */
  prepare?: () => Promise<void>
  /** 收尾释放：无论录制成功、失败还是取消都会调到。 */
  release?: () => void
}

/**
 * 把画面按时间轴实时录制成视频。
 *
 * 用逐帧预渲染 + 实时合成，而不是边播 DOM 边录屏：DOM 每帧重新栅格化的开销会让
 * 掉帧和音画不同步变得不可控，而这里每帧最多几次 drawImage。
 */
async function runVideoSession(session: VideoSession): Promise<RecordedChatVideo> {
  if (!videoExportSupported()) throw new Error('当前浏览器不支持本地生成视频，请改用 Chrome 或 Edge 后重试。')
  const { size, background, totalMs } = session
  if (!(totalMs > 0)) throw new Error('视频时长为 0，请检查对话内容。')

  try {
    await session.prepare?.()
  } catch (error) {
    // 准备阶段失败时画布都还没建，只需要放掉素材自己占的东西。
    session.release?.()
    throw error
  }

  const mimeType = pickVideoMimeType(type => MediaRecorder.isTypeSupported(type))
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) {
    session.release?.()
    throw new Error('无法创建视频画布，请重试。')
  }
  context.fillStyle = background
  context.fillRect(0, 0, size.width, size.height)

  let stream: MediaStream | null = null
  let destination: MediaStreamAudioDestinationNode | null = null
  let player: NotifyPlayer | null = null
  let frameHandle = 0
  let onVisibility: (() => void) | null = null
  const chunks: Blob[] = []
  // 用容器保存失败原因：跨 rAF 与事件回调共享可变状态，避免类型收窄带来的歧义。
  const state: { failure: Error | null } = { failure: null }

  try {
    stream = canvas.captureStream(30)
    if (session.audio && session.notifyAt.length) {
      const audioContext = session.audio.context
      await resumeNotifyAudio(audioContext)
      destination = audioContext.createMediaStreamDestination()
      const track = destination.stream.getAudioTracks()[0]
      if (track) stream.addTrack(track)
      player = createNotifyPlayer(audioContext, {
        destination,
        buffers: session.audio.buffers ?? {},
        volume: session.audio.volume,
      })
    }

    const recorderOptions: MediaRecorderOptions = { videoBitsPerSecond: suggestedVideoBitrate(size.width, size.height) }
    if (mimeType) recorderOptions.mimeType = mimeType
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, recorderOptions)
    } catch {
      recorder = new MediaRecorder(stream)
    }

    const stopped = new Promise<void>(resolve => {
      recorder.onstop = () => resolve()
      recorder.onerror = () => resolve()
    })
    recorder.ondataavailable = event => {
      if (event.data && event.data.size) chunks.push(event.data)
    }

    let settled = false
    // 进度按 0.2 秒粒度上报：每帧都回调会让调用方整页重渲染。
    let lastReport = -1000
    onVisibility = () => {
      if (!settled && document.visibilityState === 'hidden') state.failure = new Error('录制过程中页面被切换到了后台，请保持当前标签页在前台后重试。')
    }
    document.addEventListener('visibilitychange', onVisibility)

    // 第一帧先画好再开录，否则视频开头会闪一下纯底色。
    session.draw(context, 0)
    recorder.start(1000)
    const startedAt = performance.now()
    // 音频与视频共用同一条时间轴：先启动录制，再按当前音频时钟排期。
    if (player && session.audio) {
      const audioStart = session.audio.context.currentTime
      session.notifyAt.forEach(event => player!.schedule(audioStart + event.atMs / 1000, event.kind))
    }

    await new Promise<void>(resolve => {
      const tick = () => {
        if (settled) return resolve()
        if (session.token?.cancelled) {
          state.failure = new Error('已取消生成。')
          settled = true
          return resolve()
        }
        if (state.failure) {
          settled = true
          return resolve()
        }
        const elapsed = performance.now() - startedAt
        session.draw(context, elapsed)
        if (elapsed - lastReport >= 200) {
          lastReport = elapsed
          session.onProgress?.(Math.min(elapsed, totalMs), totalMs)
        }
        if (elapsed >= totalMs) {
          settled = true
          return resolve()
        }
        frameHandle = requestAnimationFrame(tick)
      }
      frameHandle = requestAnimationFrame(tick)
    })

    try {
      if (recorder.state !== 'inactive') recorder.stop()
    } catch {
      // 已经停止的录制再次 stop 会抛错，这里不必处理。
    }
    await stopped
  } finally {
    cancelAnimationFrame(frameHandle)
    if (onVisibility) document.removeEventListener('visibilitychange', onVisibility)
    player?.dispose()
    stream?.getTracks().forEach(track => track.stop())
    try {
      destination?.disconnect()
    } catch {
      // 断开已断开的节点同样忽略。
    }
    session.release?.()
    canvas.width = 0
    canvas.height = 0
  }

  if (state.failure) throw state.failure
  const blob = new Blob(chunks, { type: mimeType || 'video/webm' })
  if (!blob.size) throw new Error('录制没有产生有效视频，请重试。')
  return { blob, mimeType: blob.type || 'video/webm' }
}

export interface RecordChatVideoOptions {
  /** blobs[k] = 只显示前 k 条消息的画面。 */
  frames: Blob[]
  frameWidth: number
  frameHeight: number
  /** frameAtMs[k] = 第 k 个画面从何时开始显示。 */
  frameAtMs: number[]
  totalMs: number
  size: { width: number; height: number }
  /** 竖屏画布两侧的留底色，通常取对话背景色。 */
  background: string
  /** 两侧安全留白（输出像素）：画面再缩一点给平台的裁切与浮层让位，见 lib/video-padding.ts。 */
  sidePadding?: number
  /** 提示音出现的时刻与音效类型，与 frameAtMs 同一条时间轴。 */
  notifyAt: NotifyEvent[]
  audio?: ChatVideoAudioOptions | null
  token?: { cancelled: boolean }
  onProgress?: (elapsedMs: number, totalMs: number) => void
}

/** 逐条播放：画面随着消息一条条出现而整屏替换。 */
export async function recordChatVideo(options: RecordChatVideoOptions): Promise<RecordedChatVideo> {
  const { frames, frameAtMs, totalMs } = options
  if (!frames.length) throw new Error('缺少画面帧，请重新生成。')

  const rect = fitRect(options.frameWidth, options.frameHeight, options.size.width, options.size.height, options.sidePadding ?? 0)
  const paintBackground = (context: CanvasRenderingContext2D) => {
    context.fillStyle = options.background
    context.fillRect(0, 0, options.size.width, options.size.height)
  }

  // 全尺寸位图很占内存，任何时刻只保留当前帧和下一帧。
  const cache = new Map<number, ImageBitmap>()
  const loading = new Map<number, Promise<void>>()
  let currentIndex = -1

  const releaseFar = () => {
    for (const [key, bitmap] of Array.from(cache.entries())) {
      if (Math.abs(key - currentIndex) > 1) {
        cache.delete(key)
        bitmap.close()
      }
    }
  }
  const load = (target: number) => {
    const index = Math.max(0, Math.min(target, frames.length - 1))
    if (cache.has(index)) return Promise.resolve()
    const pending = loading.get(index)
    if (pending) return pending
    const task = createImageBitmap(frames[index])
      .then(bitmap => {
        loading.delete(index)
        cache.set(index, bitmap)
        releaseFar()
      })
      .catch(() => {
        // 单帧解码失败时保留上一帧，不中断整段录制。
        loading.delete(index)
      })
    loading.set(index, task)
    return task
  }

  return runVideoSession({
    size: options.size,
    background: options.background,
    totalMs,
    notifyAt: options.notifyAt,
    audio: options.audio,
    token: options.token,
    onProgress: options.onProgress,
    prepare: () => load(0),
    release: () => {
      cache.forEach(bitmap => bitmap.close())
      cache.clear()
    },
    draw: (context, elapsedMs) => {
      const index = frameIndexAt(frameAtMs, elapsedMs)
      if (index !== currentIndex) {
        currentIndex = index
        // 当前帧解好码后的下一帧 rAF 就会画出来；同时提前解下一帧，换帧时不空等。
        void load(index)
        void load(index + 1)
      }
      const bitmap = cache.get(currentIndex)
      if (!bitmap || rect.width <= 0 || rect.height <= 0) return
      paintBackground(context)
      context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height)
    },
  })
}

export interface RecordScrollingChatVideoOptions {
  /** 整段对话（顶栏 + 全部消息 + 底栏）的一张长图。 */
  image: Blob
  /** 一屏的大小（输出像素），录制时按它切窗口。 */
  viewport: { width: number; height: number }
  /** 顶栏 / 底栏在长图里的像素高度；这两段在窗口里固定不动。 */
  topChromeHeight: number
  bottomChromeHeight: number
  size: { width: number; height: number }
  background: string
  /** 两侧安全留白（输出像素），与逐条模式同一套，见 lib/video-padding.ts。 */
  sidePadding?: number
  plan: ScrollVideoPlan
  token?: { cancelled: boolean }
  onProgress?: (elapsedMs: number, totalMs: number) => void
}

function positiveInt(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

/**
 * 滚动到底：窗口不动，长图往上走——等价于「手指把聊天记录从顶部滚到底部」。
 *
 * 只有一张长图要解码，所以录制阶段不吃内存也没多少 CPU：每帧最多三次 drawImage
 * （顶栏、聊天区、底栏）。滚到底之后偏移不再变，连这三次都跳过——画布保留着上一帧，
 * 编码器会继续采同样的画面，结尾那段停留是零成本的。
 */
export async function recordScrollingChatVideo(options: RecordScrollingChatVideoOptions): Promise<RecordedChatVideo> {
  const viewport = {
    width: positiveInt(options.viewport.width),
    height: positiveInt(options.viewport.height),
  }
  let source: HTMLImageElement | null = null
  let objectUrl = ''
  let layout: ScrollVideoLayout | null = null
  let viewportCanvas: HTMLCanvasElement | null = null
  let viewportContext: CanvasRenderingContext2D | null = null
  let target: FitRect = { x: 0, y: 0, width: 0, height: 0, scale: 0 }
  let lastOffset = Number.NaN

  const drawViewport = (offset: number) => {
    if (!source || !layout || !viewportContext || !viewportCanvas) return
    const { imageWidth, imageHeight, topChromeHeight, bottomChromeHeight, bodyViewportHeight, bodySourceHeight } = layout
    const width = viewportCanvas.width
    const height = viewportCanvas.height
    viewportContext.fillStyle = options.background
    viewportContext.fillRect(0, 0, width, height)
    // 顶栏固定在顶部。
    if (topChromeHeight > 0) {
      viewportContext.drawImage(source, 0, 0, imageWidth, topChromeHeight, 0, 0, width, topChromeHeight)
    }
    // 聊天区：从长图里裁一段，位置跟着时间往上走。裁剪高度取「露出的高度」与「图里聊天区的实际高度」
    // 的较小值，内容不足一屏时才不会把底栏那一带也裁进来。
    const sample = Math.min(bodyViewportHeight, bodySourceHeight)
    if (sample > 0) {
      viewportContext.drawImage(source, 0, topChromeHeight + offset, imageWidth, sample, 0, topChromeHeight, width, sample)
    }
    // 底栏锚在画面的最底部，而不是「聊天区下方」：这样即使换算带进 1 像素的舍入，
    // 也只会体现在聊天区的高度上，不会在底栏上沿露出一条缝。
    if (bottomChromeHeight > 0) {
      viewportContext.drawImage(source, 0, imageHeight - bottomChromeHeight, imageWidth, bottomChromeHeight, 0, height - bottomChromeHeight, width, bottomChromeHeight)
    }
  }

  return runVideoSession({
    size: options.size,
    background: options.background,
    totalMs: options.plan.durationMs,
    // 滚动模式整段对话一开始就都在画面里，没有「收到消息」这一刻，所以整段无声。
    notifyAt: [],
    audio: null,
    token: options.token,
    onProgress: options.onProgress,
    prepare: async () => {
      objectUrl = URL.createObjectURL(options.image)
      const element = new Image()
      element.src = objectUrl
      await element.decode()
      source = element
      layout = scrollVideoLayout(
        { width: element.naturalWidth, height: element.naturalHeight },
        { top: options.topChromeHeight, bottom: options.bottomChromeHeight },
        viewport,
      )
      viewportCanvas = document.createElement('canvas')
      viewportCanvas.width = viewport.width
      viewportCanvas.height = viewport.height
      viewportContext = viewportCanvas.getContext('2d')
      if (!viewportContext) throw new Error('无法创建视频画布，请重试。')
      target = fitRect(viewport.width, viewport.height, options.size.width, options.size.height, options.sidePadding ?? 0)
    },
    release: () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
        objectUrl = ''
      }
      source = null
      if (viewportCanvas) {
        viewportCanvas.width = 0
        viewportCanvas.height = 0
      }
      viewportCanvas = null
      viewportContext = null
      layout = null
    },
    draw: (context, elapsedMs) => {
      if (!layout || !viewportCanvas) return
      const offset = scrollOffsetAt(elapsedMs, options.plan, layout.maxOffset)
      // 偏移没变就整帧跳过：定在顶部的开头与停在底部的结尾都不必重复合成。
      if (offset === lastOffset) return
      lastOffset = offset
      drawViewport(offset)
      context.fillStyle = options.background
      context.fillRect(0, 0, options.size.width, options.size.height)
      if (target.width > 0 && target.height > 0) {
        context.drawImage(viewportCanvas, target.x, target.y, target.width, target.height)
      }
    },
  })
}
