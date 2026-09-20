/**
 * 消息提示音。用 Web Audio 现场合成微信风格的收/发两种音效：
 *  - received：收到消息的两音「叮咚」，敲击类音色（基音 + 钟琴式泛音）。
 *  - sent：发出消息的「咻」，带通扫频气流声叠一个快速下滑音。
 *
 * 刻意只做**现场合成**，不打包微信原始音频文件——那段音频属于第三方，
 * 嵌进产物会有版权问题。想用原声请走「我的音频」自行上传。
 *
 * 两处用途：
 *  - 定时发送播放：直接输出到扬声器，便于用系统录屏软件连声音一起录。
 *  - 导出视频：输出到 MediaStreamAudioDestinationNode，混进视频的音轨。
 */
export type NotifyKind = 'received' | 'sent'

/** 泛音：敲击类音色靠它才有「叮」的金属感，纯正弦只会听成电子蜂鸣。 */
export interface NotifyPartial {
  /** 相对基频的倍数。非整数倍数会让音色更偏金属。 */
  ratio: number
  /** 相对本音的增益，应小于 1，否则泛音会盖过基音。 */
  gain: number
  /** 衰减速度：相对本音时长的倍数，越小收得越快；默认 1。 */
  decay?: number
}

/** 一段频率恒定的乐音，可选滑音与泛音。 */
export interface NotifyTone {
  kind?: 'tone'
  freq: number
  /** 有值时做频率滑音：从 freq 滑到 freqTo；不填则保持恒定频率。 */
  freqTo?: number
  offsetMs: number
  durationMs: number
  gain: number
  partials?: NotifyPartial[]
}

/** 带通扫频的白噪声，用来做「咻」的气流声。 */
export interface NotifyWhoosh {
  kind: 'whoosh'
  offsetMs: number
  durationMs: number
  gain: number
  freqFrom: number
  freqTo: number
  /** 带通的品质因数：越大越尖，越小越像一阵风。 */
  q?: number
}

export type NotifySound = NotifyTone | NotifyWhoosh

/**
 * 「叮」的泛音列。三处都是刻意选的：
 *  - 2 倍泛音给厚度，3 倍补亮度，4.76 倍刻意取非整数，做出敲击的金属光泽；
 *  - 增益依次减半，基音始终最响；
 *  - 衰减系数递减，越高的泛音收得越快——这是敲击音与和弦的分水岭。
 */
const bellPartials: NotifyPartial[] = [
  { ratio: 2, gain: 0.32, decay: 0.62 },
  { ratio: 3, gain: 0.15, decay: 0.42 },
  { ratio: 4.76, gain: 0.07, decay: 0.26 },
]

/** 收到消息：先高后低两声「叮咚」。 */
export const receivedNotifySounds: NotifySound[] = [
  { freq: 1318.51, offsetMs: 0, durationMs: 200, gain: 0.25, partials: bellPartials },
  { freq: 987.77, offsetMs: 104, durationMs: 300, gain: 0.23, partials: bellPartials },
]

/**
 * 发出消息：一声「咻」。气流声占主体，底下垫一个快速下滑音，
 * 让它听成「发出去了一条」而不是单纯一阵风。
 */
export const sentNotifySounds: NotifySound[] = [
  { kind: 'whoosh', offsetMs: 0, durationMs: 150, gain: 0.17, freqFrom: 2600, freqTo: 820, q: 1.1 },
  { freq: 1560, freqTo: 520, offsetMs: 6, durationMs: 110, gain: 0.1 },
]

export const notifySounds: Record<NotifyKind, NotifySound[]> = {
  received: receivedNotifySounds,
  sent: sentNotifySounds,
}

/** 单次提示音的大致时长，用于决定何时拆掉音频节点。 */
export const notifySoundDurationMs: Record<NotifyKind, number> = { received: 480, sent: 240 }

export const notifyKindLabels: Record<NotifyKind, string> = { received: '收到消息', sent: '发送消息' }

export const maxCustomSoundBytes = 4 * 1024 * 1024

type AudioContextConstructor = typeof AudioContext

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

export function notifySoundSupported() {
  return audioContextConstructor() !== null
}

let sharedContext: AudioContext | null = null

/** 浏览器要求音频上下文在用户手势后才能出声，调用方应在点击事件里先 resume。 */
export function notifyAudioContext(): AudioContext | null {
  const Constructor = audioContextConstructor()
  if (!Constructor) return null
  if (!sharedContext || sharedContext.state === 'closed') {
    try {
      sharedContext = new Constructor()
    } catch {
      sharedContext = null
    }
  }
  return sharedContext
}

export async function resumeNotifyAudio(context: AudioContext | null) {
  if (!context || context.state !== 'suspended') return
  try {
    await context.resume()
  } catch {
    // 用户拒绝或浏览器限制自动播放时静默放弃，不影响视频画面。
  }
}

/**
 * 白噪声只生成一次并复用：每次发声都重算几万个随机数会拖慢播放，
 * 而且噪声本身听不出差别。采样率变了（换了音频设备）才重建。
 */
let sharedNoiseBuffer: AudioBuffer | null = null

function noiseBufferFor(context: AudioContext) {
  if (sharedNoiseBuffer && sharedNoiseBuffer.sampleRate === context.sampleRate) return sharedNoiseBuffer
  const frames = Math.ceil(context.sampleRate)
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) channel[i] = Math.random() * 2 - 1
  sharedNoiseBuffer = buffer
  return buffer
}

/** 指数衰减不能从 0 起步，所以用一个极小值做起点。 */
const silentGain = 0.0001
/** 起音时间：太短会听见「啪」的爆音，太长就失了敲击感。 */
const attackSeconds = 0.006

function scheduleTone(context: AudioContext, destination: AudioNode, atSeconds: number, volume: number, tone: NotifyTone) {
  const sources: AudioScheduledSourceNode[] = []
  const start = atSeconds + tone.offsetMs / 1000
  const end = start + tone.durationMs / 1000
  // 基音就是 ratio 为 1、增益为满的那一条泛音，和其余泛音走同一套流程。
  const partials: NotifyPartial[] = [{ ratio: 1, gain: 1 }, ...(tone.partials ?? [])]
  for (const partial of partials) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(tone.freq * partial.ratio, start)
    if (tone.freqTo) oscillator.frequency.exponentialRampToValueAtTime(tone.freqTo * partial.ratio, end)
    // 泛音按各自系数提前收声，且至少留出 20ms，避免过短的斜坡被浏览器忽略。
    const partialEnd = Math.max(start + 0.02, start + (tone.durationMs / 1000) * (partial.decay ?? 1))
    gain.gain.setValueAtTime(silentGain, start)
    gain.gain.linearRampToValueAtTime(tone.gain * partial.gain * volume, start + attackSeconds)
    gain.gain.exponentialRampToValueAtTime(silentGain, partialEnd)
    oscillator.connect(gain)
    gain.connect(destination)
    oscillator.start(start)
    oscillator.stop(partialEnd + 0.03)
    sources.push(oscillator)
  }
  return sources
}

function scheduleWhoosh(context: AudioContext, destination: AudioNode, atSeconds: number, volume: number, whoosh: NotifyWhoosh) {
  const start = atSeconds + whoosh.offsetMs / 1000
  const end = start + whoosh.durationMs / 1000
  const source = context.createBufferSource()
  source.buffer = noiseBufferFor(context)
  // 带通中心频率往下扫，就是「咻」的由来：起始尖锐、收尾闷下去。
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = whoosh.q ?? 1
  filter.frequency.setValueAtTime(whoosh.freqFrom, start)
  filter.frequency.exponentialRampToValueAtTime(whoosh.freqTo, end)
  const gain = context.createGain()
  gain.gain.setValueAtTime(silentGain, start)
  gain.gain.linearRampToValueAtTime(whoosh.gain * volume, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(silentGain, end)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  source.start(start)
  source.stop(end + 0.03)
  return [source] as AudioScheduledSourceNode[]
}

function scheduleSounds(context: AudioContext, destination: AudioNode, atSeconds: number, volume: number, sounds: NotifySound[]) {
  return sounds.flatMap(sound => sound.kind === 'whoosh'
    ? scheduleWhoosh(context, destination, atSeconds, volume, sound)
    : scheduleTone(context, destination, atSeconds, volume, sound))
}

export function playNotify(kind: NotifyKind = 'received', context?: AudioContext | null, options: NotifyPlayerOptions = {}) {
  const target = context ?? notifyAudioContext()
  if (!target) return
  void resumeNotifyAudio(target)
  const player = createNotifyPlayer(target, options)
  player.schedule(target.currentTime + 0.02, kind)
  // 音频图里的节点会被上下文一直持有，播完就断开，避免长时间播放堆积节点。
  const holdMs = customSoundReplaces(kind, Boolean(options.buffer)) ? (options.buffer!.duration * 1000) + 250 : notifySoundDurationMs[kind] + 150
  window.setTimeout(() => player.dispose(), holdMs)
}

export interface NotifyPlayer {
  /** atSeconds 使用 AudioContext 的时间轴（秒）。 */
  schedule(atSeconds: number, kind?: NotifyKind): void
  dispose(): void
}

export interface NotifyPlayerOptions {
  /** 不传则直接出声；视频导出时传入 MediaStreamAudioDestinationNode。 */
  destination?: AudioNode
  /** 用户上传的提示音，只替换「收到消息」那一声；发送音效始终用内置合成音。 */
  buffer?: AudioBuffer | null
  volume?: number
}

/** 自定义音频只作用于接收音，保证发送音效永远和它不一样。 */
export function customSoundReplaces(kind: NotifyKind, hasCustomSound: boolean) {
  return kind === 'received' && hasCustomSound
}

export function createNotifyPlayer(context: AudioContext, options: NotifyPlayerOptions = {}): NotifyPlayer {
  const destination = options.destination ?? context.destination
  const volume = options.volume ?? 1
  const pending = new Set<AudioScheduledSourceNode>()
  const master = context.createGain()
  master.gain.value = volume
  master.connect(destination)

  const track = (nodes: AudioScheduledSourceNode[]) => {
    nodes.forEach(node => {
      pending.add(node)
      node.addEventListener('ended', () => pending.delete(node))
    })
  }

  return {
    schedule(atSeconds: number, kind: NotifyKind = 'received') {
      const start = Math.max(atSeconds, context.currentTime)
      if (customSoundReplaces(kind, Boolean(options.buffer))) {
        const source = context.createBufferSource()
        source.buffer = options.buffer!
        source.connect(master)
        source.start(start)
        track([source])
        return
      }
      track(scheduleSounds(context, master, start, 1, notifySounds[kind] ?? receivedNotifySounds))
    },
    dispose() {
      pending.forEach(node => {
        try {
          node.stop()
        } catch {
          // 已停止的音源再 stop 会抛错，忽略即可。
        }
      })
      pending.clear()
      try {
        master.disconnect()
      } catch {
        // 断开已断开的节点同样忽略。
      }
    },
  }
}

export async function loadNotifySoundFile(context: AudioContext, file: Blob): Promise<AudioBuffer> {
  if (!file.size) throw new Error('这个音频文件是空的，请换一个。')
  if (file.size > maxCustomSoundBytes) throw new Error('音频文件建议不超过 4 MB，请先压缩后再上传。')
  const data = await file.arrayBuffer()
  try {
    return await context.decodeAudioData(data)
  } catch {
    throw new Error('无法识别这个音频文件，请使用 mp3、wav、m4a 等常见格式。')
  }
}
