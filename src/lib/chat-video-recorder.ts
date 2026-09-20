import { frameIndexAt, type NotifyEvent } from './chat-playback'
import { fitRect, pickVideoMimeType, suggestedVideoBitrate, videoExportSupported } from './chat-video'
import { createNotifyPlayer, resumeNotifyAudio, type NotifyPlayer } from './notify-sound'

export interface ChatVideoAudioOptions {
  /** 与实时播放共用的音频上下文；调用方需在任何用户手势里先 resume 过。 */
  context: AudioContext
  buffer?: AudioBuffer | null
  volume?: number
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
  /** 提示音出现的时刻与音效类型，与 frameAtMs 同一条时间轴。 */
  notifyAt: NotifyEvent[]
  audio?: ChatVideoAudioOptions | null
  token?: { cancelled: boolean }
  onProgress?: (elapsedMs: number, totalMs: number) => void
}

export interface RecordedChatVideo {
  blob: Blob
  mimeType: string
}

/**
 * 把预渲染好的画面帧按时间轴实时录制成视频。
 *
 * 用逐帧预渲染 + 实时合成，而不是边播 DOM 边录屏：DOM 每帧重新栅格化的开销会让
 * 掉帧和音画不同步变得不可控，而这里每帧只是一次 drawImage。
 */
export async function recordChatVideo(options: RecordChatVideoOptions): Promise<RecordedChatVideo> {
  if (!videoExportSupported()) throw new Error('当前浏览器不支持本地生成视频，请改用 Chrome 或 Edge 后重试。')
  const { frames, frameAtMs, totalMs, size, background } = options
  if (!frames.length) throw new Error('缺少画面帧，请重新生成。')
  if (!(totalMs > 0)) throw new Error('视频时长为 0，请检查对话内容。')

  const mimeType = pickVideoMimeType(type => MediaRecorder.isTypeSupported(type))
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建视频画布，请重试。')

  const rect = fitRect(options.frameWidth, options.frameHeight, size.width, size.height)
  const paintBackground = () => {
    context.fillStyle = background
    context.fillRect(0, 0, size.width, size.height)
  }
  paintBackground()

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
  const paint = (index: number) => {
    const bitmap = cache.get(index)
    if (!bitmap || rect.width <= 0 || rect.height <= 0) return
    paintBackground()
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height)
  }
  const show = (index: number) => {
    currentIndex = index
    void load(index).then(() => {
      if (currentIndex === index) paint(index)
    })
    void load(index + 1)
  }

  const stream = canvas.captureStream(30)
  let audioContext: AudioContext | null = null
  let destination: MediaStreamAudioDestinationNode | null = null
  let player: NotifyPlayer | null = null
  if (options.audio && options.notifyAt.length) {
    audioContext = options.audio.context
    await resumeNotifyAudio(audioContext)
    destination = audioContext.createMediaStreamDestination()
    const track = destination.stream.getAudioTracks()[0]
    if (track) stream.addTrack(track)
    player = createNotifyPlayer(audioContext, {
      destination,
      buffer: options.audio.buffer ?? null,
      volume: options.audio.volume,
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

  const chunks: Blob[] = []
  const stopped = new Promise<void>(resolve => {
    recorder.onstop = () => resolve()
    recorder.onerror = () => resolve()
  })
  recorder.ondataavailable = event => {
    if (event.data && event.data.size) chunks.push(event.data)
  }

  let frameHandle = 0
  let settled = false
  // 进度按 0.2 秒粒度上报：每帧都回调会让调用方整页重渲染。
  let lastReport = -1000
  // 用容器保存失败原因：跨 rAF 与事件回调共享可变状态，避免类型收窄带来的歧义。
  const state: { failure: Error | null } = { failure: null }
  const onVisibility = () => {
    if (!settled && document.visibilityState === 'hidden') state.failure = new Error('录制过程中页面被切换到了后台，请保持当前标签页在前台后重试。')
  }
  document.addEventListener('visibilitychange', onVisibility)

  recorder.start(1000)
  const startedAt = performance.now()
  // 音频与视频共用同一条时间轴：先启动录制，再按当前音频时钟排期。
  if (player && audioContext) {
    const audioStart = audioContext.currentTime
    options.notifyAt.forEach(event => player!.schedule(audioStart + event.atMs / 1000, event.kind))
  }
  show(0)

  await new Promise<void>(resolve => {
    const tick = () => {
      if (settled) return resolve()
      if (options.token?.cancelled) {
        state.failure = new Error('已取消生成。')
        settled = true
        return resolve()
      }
      if (state.failure) {
        settled = true
        return resolve()
      }
      const elapsed = performance.now() - startedAt
      const index = frameIndexAt(frameAtMs, elapsed)
      if (index !== currentIndex) show(index)
      if (elapsed - lastReport >= 200) {
        lastReport = elapsed
        options.onProgress?.(Math.min(elapsed, totalMs), totalMs)
      }
      if (elapsed >= totalMs) {
        settled = true
        return resolve()
      }
      frameHandle = requestAnimationFrame(tick)
    }
    frameHandle = requestAnimationFrame(tick)
  })

  cancelAnimationFrame(frameHandle)
  try {
    if (recorder.state !== 'inactive') recorder.stop()
  } catch {
    // 已经停止的录制再次 stop 会抛错，这里不必处理。
  }
  await stopped

  document.removeEventListener('visibilitychange', onVisibility)
  player?.dispose()
  stream.getTracks().forEach(track => track.stop())
  try {
    destination?.disconnect()
  } catch {
    // 断开已断开的节点同样忽略。
  }
  cache.forEach(bitmap => bitmap.close())
  cache.clear()
  canvas.width = 0
  canvas.height = 0

  if (state.failure) throw state.failure
  const blob = new Blob(chunks, { type: mimeType || 'video/webm' })
  if (!blob.size) throw new Error('录制没有产生有效视频，请重试。')
  return { blob, mimeType: blob.type || 'video/webm' }
}
