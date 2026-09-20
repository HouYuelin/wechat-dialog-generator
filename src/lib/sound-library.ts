/**
 * 音效库：把上传过的自定义提示音留下来，下次直接从库里选，不用再翻本地文件。
 *
 * 和素材库（media-library.ts）同一套思路：这里只管「怎么记、怎么挑、怎么淘汰」，
 * 不碰浏览器存储（落库见 project-store 的 sound-assets store），也不碰音频解码
 * （读文件、解码见 notify-sound.ts 的 loadNotifySoundFile）。所有函数都是纯的，
 * 方便直接跑单测。
 *
 * 与素材库的一点差异：音效是音频，不是图片。所以存储用的是 audio data URL
 * （`data:audio/...;base64,...`），而不是 image data URL；使用时再 decodeAudioData
 * 还原成 AudioBuffer。自定义音效目前只替换「收到消息」那一声，发送音效始终用内置合成音。
 */
export interface SoundAsset {
  id: string
  name: string
  /** audio data URL。既作为去重依据，也是下次使用时 decode 回 AudioBuffer 的原料。 */
  dataUrl: string
  /** 音频时长（秒），decode 时拿到，列表里显示用；读不到时是 0。 */
  durationSeconds: number
  /** 文件实际字节数（压缩前的原始大小，只用于列表里显示体积）。 */
  bytes: number
  createdAt: string
  /** 最近一次被用到的时刻，只用于排序。 */
  usedAt: string
}

export interface NewSoundAsset {
  name?: string
  dataUrl: string
  durationSeconds?: number
  bytes?: number
}

/** 每一类最多留这么多条。到顶之后只是不再收录新的，库里已有的永远不被自动清掉。 */
export const maxSoundAssets = 2000

function positiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function positiveInt(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function isSoundDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:audio/')
}

let fallbackIdSeed = 0

function newSoundAssetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  fallbackIdSeed += 1
  return `sound-${Date.now().toString(36)}-${fallbackIdSeed}`
}

/** 造一条音效记录。时间与 id 可注入，测试里才能断言确定的排序结果。 */
export function createSoundAsset(input: NewSoundAsset, options: { now?: Date; id?: string } = {}): SoundAsset {
  const now = options.now ?? new Date()
  const stamp = now.toISOString()
  return {
    id: options.id ?? newSoundAssetId(),
    name: (input.name ?? '').trim().slice(0, 60) || '未命名音效',
    dataUrl: input.dataUrl,
    durationSeconds: positiveNumber(input.durationSeconds),
    bytes: positiveInt(input.bytes),
    createdAt: stamp,
    usedAt: stamp,
  }
}

/**
 * 读回来的数据不能全信：字段缺失、被改坏的记录直接丢掉，读不成的一条不影响其余音效。
 */
export function normalizeSoundAsset(raw: unknown): SoundAsset | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<SoundAsset>
  if (typeof value.id !== 'string' || !value.id) return null
  if (!isSoundDataUrl(value.dataUrl)) return null
  const createdAt = typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : new Date(0).toISOString()
  const usedAt = typeof value.usedAt === 'string' && value.usedAt ? value.usedAt : createdAt
  return {
    id: value.id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 60) : '未命名音效',
    dataUrl: value.dataUrl,
    durationSeconds: positiveNumber(value.durationSeconds),
    bytes: positiveInt(value.bytes),
    createdAt,
    usedAt,
  }
}

/** 网格顺序：新上传的排前面。 */
export function sortSoundAssets(assets: SoundAsset[]): SoundAsset[] {
  return [...assets].sort((left, right) => {
    const diff = Date.parse(right.createdAt) - Date.parse(left.createdAt)
    return Number.isFinite(diff) && diff !== 0 ? diff : left.id.localeCompare(right.id)
  })
}

/** 规范化整个库：丢掉坏记录、按 dataUrl 去重，再按网格顺序排好。 */
export function normalizeSoundLibrary(raw: unknown): SoundAsset[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const assets: SoundAsset[] = []
  for (const item of raw) {
    const asset = normalizeSoundAsset(item)
    if (!asset || seen.has(asset.dataUrl)) continue
    seen.add(asset.dataUrl)
    assets.push(asset)
  }
  return sortSoundAssets(assets)
}

export interface AddSoundAssetsResult {
  /** 加完之后的整个库（仍是网格顺序）。 */
  library: SoundAsset[]
  /** 真正落库的新音效，顺序与入参一致。 */
  added: SoundAsset[]
  /** 库里已经有一模一样的音效，跳过的数量。 */
  duplicated: number
  /** 库已经满了、这一批没能入库的数量。库里原有的音效不受影响。 */
  rejected: number
}

/**
 * 往库里加音效：先按 dataUrl 去重（同一个文件传两次不该变两条），再按上限收录。
 * 上限是「不许再进」，不是「进来就把旧的挤出去」；入参与返回值都是新数组，不改原库。
 */
export function addSoundAssets(
  library: SoundAsset[],
  incoming: SoundAsset[],
  { max = maxSoundAssets }: { max?: number } = {},
): AddSoundAssetsResult {
  const limit = Math.max(1, Math.round(max))
  const known = new Set(library.map(asset => asset.dataUrl))
  const fresh: SoundAsset[] = []
  let duplicated = 0
  for (const asset of incoming) {
    if (known.has(asset.dataUrl)) {
      duplicated += 1
      continue
    }
    known.add(asset.dataUrl)
    fresh.push(asset)
  }
  if (!fresh.length) return { library, added: [], duplicated, rejected: 0 }

  const room = limit - library.length
  if (room <= 0) return { library, added: [], duplicated, rejected: fresh.length }

  const added = fresh.slice(0, room)
  const rejected = fresh.length - added.length
  return { library: sortSoundAssets([...library, ...added]), added, duplicated, rejected }
}

/** 记一次「用了这条音效」，只影响列表顺序。 */
export function touchSoundAsset(library: SoundAsset[], id: string, now: Date = new Date()): SoundAsset[] {
  const stamp = now.toISOString()
  let changed = false
  const next = library.map(asset => {
    if (asset.id !== id) return asset
    changed = true
    return { ...asset, usedAt: stamp }
  })
  return changed ? next : library
}

export function renameSoundAsset(library: SoundAsset[], id: string, name: string): SoundAsset[] {
  const trimmed = name.trim().slice(0, 60)
  let changed = false
  const next = library.map(asset => {
    if (asset.id !== id) return asset
    const nextName = trimmed || '未命名音效'
    if (nextName === asset.name) return asset
    changed = true
    return { ...asset, name: nextName }
  })
  return changed ? next : library
}

export function removeSoundAsset(library: SoundAsset[], id: string): SoundAsset[] {
  const next = library.filter(asset => asset.id !== id)
  return next.length === library.length ? library : next
}

export function findSoundAssetById(library: SoundAsset[], id: string) {
  return library.find(asset => asset.id === id) ?? null
}

/** 单条音效在列表里显示的说明文字（时长 + 体积）。 */
export function soundAssetMeta(asset: SoundAsset) {
  const duration = asset.durationSeconds > 0 ? `${asset.durationSeconds.toFixed(1)} 秒` : ''
  const bytes = asset.bytes > 0 ? formatBytes(asset.bytes) : ''
  return [duration, bytes].filter(Boolean).join(' · ')
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
