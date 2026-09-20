/**
 * 素材库：把上传过的头像、表情图片和背景图留下来，下次直接从库里选，不用再翻本地文件。
 *
 * 这里只管「怎么记、怎么挑、怎么淘汰」，不碰浏览器存储（落库见 project-store 的
 * media-assets store）也不碰 DOM（读文件、压缩见 image-file.ts）。所有函数都是纯的，
 * 方便直接跑单测；也正因为纯，淘汰规则这类容易出错的逻辑才守得住。
 *
 * 两条排序各管一件事，别混用：
 * - `sortMediaAssets`（createdAt 倒序）给素材库网格用，列表稳定，点选时不会在光标底下跳来跳去；
 * - `recentMediaAssets`（usedAt 倒序）给编辑区的快捷条用，最近用过的排前面。
 */
import type { ChatUser } from '../types'

export type MediaKind = 'avatar' | 'sticker' | 'background'

export const mediaKinds: MediaKind[] = ['avatar', 'sticker', 'background']

export const mediaKindLabels: Record<MediaKind, string> = {
  avatar: '头像',
  sticker: '表情图片',
  background: '背景图',
}

export const mediaKindUnits: Record<MediaKind, string> = {
  avatar: '个头像',
  sticker: '张表情',
  background: '张背景',
}

export interface MediaAsset {
  id: string
  kind: MediaKind
  name: string
  /** data URL。既直接塞进 <img src>，也是去重的依据（同一个文件读出来必然一模一样）。 */
  dataUrl: string
  /** 压缩后的实际像素，用来在列表里显示尺寸；读不到时是 0。 */
  width: number
  height: number
  createdAt: string
  /** 最近一次被使用的时刻，只用于排序。 */
  usedAt: string
}

/**
 * 每一类最多留这么多张。到顶之后只是不再收录新图，**库里已有的素材永远不会被自动清掉**——
 * 删除只有一个入口：用户在列表里点删除。曾经按「最久没用过」自动淘汰，结果用户攒的
 * 头像会莫名其妙少几张，找不回来也说不清是谁删的，所以这条规则整个去掉了。
 */
export const maxAssetsPerKind = 2000

export function isMediaKind(value: unknown): value is MediaKind {
  return value === 'avatar' || value === 'sticker' || value === 'background'
}

/**
 * data URL 的实际字节数。base64 每 4 个字符装 3 字节，末尾的 `=` 是补位不算数据。
 * 只用于「大概多大」的提示和体积控制，不做精确统计。
 */
export function dataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding)
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function positiveInt(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0
}

function timestampOf(asset: MediaAsset) {
  const used = Date.parse(asset.usedAt)
  if (Number.isFinite(used)) return used
  const created = Date.parse(asset.createdAt)
  return Number.isFinite(created) ? created : 0
}

let fallbackIdSeed = 0

function newMediaAssetId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  fallbackIdSeed += 1
  return `media-${Date.now().toString(36)}-${fallbackIdSeed}`
}

export interface NewMediaAsset {
  kind: MediaKind
  name?: string
  dataUrl: string
  width?: number
  height?: number
}

/** 造一条素材记录。时间与 id 可注入，测试里才能断言确定的排序结果。 */
export function createMediaAsset(input: NewMediaAsset, options: { now?: Date; id?: string } = {}): MediaAsset {
  const now = options.now ?? new Date()
  const stamp = now.toISOString()
  return {
    id: options.id ?? newMediaAssetId(),
    kind: input.kind,
    name: (input.name ?? '').trim().slice(0, 60) || mediaKindLabels[input.kind],
    dataUrl: input.dataUrl,
    width: positiveInt(input.width),
    height: positiveInt(input.height),
    createdAt: stamp,
    usedAt: stamp,
  }
}

/**
 * 读回来的数据不能全信：旧版本写的记录、被手工改坏的存储、字段缺失的半条记录都要挡住，
 * 挡不住的话渲染时才会炸，离出错现场很远。读不成的一条直接丢掉，不影响其余素材。
 */
export function normalizeMediaAsset(raw: unknown): MediaAsset | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<MediaAsset>
  if (typeof value.id !== 'string' || !value.id) return null
  if (!isMediaKind(value.kind)) return null
  if (typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith('data:image/')) return null
  const createdAt = typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : new Date(0).toISOString()
  const usedAt = typeof value.usedAt === 'string' && value.usedAt ? value.usedAt : createdAt
  return {
    id: value.id,
    kind: value.kind,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 60) : mediaKindLabels[value.kind],
    dataUrl: value.dataUrl,
    width: positiveInt(value.width),
    height: positiveInt(value.height),
    createdAt,
    usedAt,
  }
}

/** 网格顺序：新上传的排前面。 */
export function sortMediaAssets(assets: MediaAsset[]): MediaAsset[] {
  return [...assets].sort((left, right) => {
    const diff = Date.parse(right.createdAt) - Date.parse(left.createdAt)
    return Number.isFinite(diff) && diff !== 0 ? diff : left.id.localeCompare(right.id)
  })
}

/** 规范化整个库：丢掉坏记录、按 dataUrl 去重，再按网格顺序排好。 */
export function normalizeMediaLibrary(raw: unknown): MediaAsset[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const assets: MediaAsset[] = []
  for (const item of raw) {
    const asset = normalizeMediaAsset(item)
    if (!asset || seen.has(asset.dataUrl)) continue
    seen.add(asset.dataUrl)
    assets.push(asset)
  }
  return sortMediaAssets(assets)
}

export function mediaAssetsOfKind(library: MediaAsset[], kind: MediaKind) {
  return library.filter(asset => asset.kind === kind)
}

/** 最近用过的排在前面，放不下时只显示前 limit 张。 */
export function recentMediaAssets(library: MediaAsset[], kind: MediaKind, limit = 12) {
  return mediaAssetsOfKind(library, kind)
    .sort((left, right) => timestampOf(right) - timestampOf(left))
    .slice(0, Math.max(0, limit))
}

export function findAssetByDataUrl(library: MediaAsset[], dataUrl: string) {
  return library.find(asset => asset.dataUrl === dataUrl) ?? null
}

export interface AddMediaAssetsResult {
  /** 加完之后的整个库（仍是网格顺序）。 */
  library: MediaAsset[]
  /** 真正落库的新素材，顺序与入参一致。 */
  added: MediaAsset[]
  /** 库里已经有一模一样的图，跳过的数量。 */
  duplicated: number
  /** 这一类已经满了、这一批没能入库的数量。库里原有的素材不受影响。 */
  rejected: number
}

/**
 * 往库里加素材：先按 dataUrl 去重（同一张图传两次不该变两条），再按上限收录。
 *
 * 上限是「不许再进」，不是「进来就把旧的挤出去」：库里已有的素材一张都不会被自动删掉，
 * 满了就是这一批多出来的收不下，如实回报张数。这样用户攒的头像只会因为自己点删除而消失。
 * 入参与返回值都是新数组，不改原库；一张都收不下时原库原样返回。
 */
export function addMediaAssets(
  library: MediaAsset[],
  incoming: MediaAsset[],
  { maxPerKind = maxAssetsPerKind }: { maxPerKind?: number } = {},
): AddMediaAssetsResult {
  const limit = Math.max(1, Math.round(maxPerKind))
  const known = new Set(library.map(asset => asset.dataUrl))
  const fresh: MediaAsset[] = []
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

  // 只数「已经有了多少」，不看新旧、不看用过没用过：存量永远全留，额度才轮到新图。
  const room = new Map<MediaKind, number>()
  for (const kind of mediaKinds) {
    room.set(kind, limit - library.filter(asset => asset.kind === kind).length)
  }
  const added: MediaAsset[] = []
  let rejected = 0
  for (const asset of fresh) {
    const left = room.get(asset.kind) ?? 0
    if (left <= 0) {
      rejected += 1
      continue
    }
    room.set(asset.kind, left - 1)
    added.push(asset)
  }
  if (!added.length) return { library, added: [], duplicated, rejected }

  return { library: sortMediaAssets([...library, ...added]), added, duplicated, rejected }
}

/** 记一次「用了这张」，只影响 recentMediaAssets 的顺序。 */
export function touchMediaAsset(library: MediaAsset[], id: string, now: Date = new Date()): MediaAsset[] {
  const stamp = now.toISOString()
  let changed = false
  const next = library.map(asset => {
    if (asset.id !== id) return asset
    changed = true
    return { ...asset, usedAt: stamp }
  })
  return changed ? next : library
}

export function renameMediaAsset(library: MediaAsset[], id: string, name: string): MediaAsset[] {
  const trimmed = name.trim().slice(0, 60)
  let changed = false
  const next = library.map(asset => {
    // 名字清空就退回类目名，列表里不会出现一行空白。
    if (asset.id !== id) return asset
    const nextName = trimmed || mediaKindLabels[asset.kind]
    if (nextName === asset.name) return asset
    changed = true
    return { ...asset, name: nextName }
  })
  return changed ? next : library
}

export function removeMediaAsset(library: MediaAsset[], id: string): MediaAsset[] {
  const next = library.filter(asset => asset.id !== id)
  return next.length === library.length ? library : next
}

/**
 * 批量上传时把素材按顺序发给角色：第 1 张给第 1 位，第 2 张给第 2 位……
 * 素材比角色少就只发前几个，比角色多就忽略多余的——不做循环覆盖，那会让人看不懂谁拿到了哪张。
 */
export function assignAvatars(users: ChatUser[], assets: MediaAsset[]): { users: ChatUser[]; assigned: number } {
  const assigned = Math.min(users.length, assets.length)
  if (!assigned) return { users, assigned: 0 }
  return {
    users: users.map((user, index) => (index < assigned ? { ...user, avatar: assets[index].dataUrl } : user)),
    assigned,
  }
}

export interface MediaLibrarySummary {
  /** 每个类目的张数。按 MediaKind 取值，加类目时不用再回来改这里。 */
  counts: Record<MediaKind, number>
  total: number
  bytes: number
}

export function mediaLibrarySummary(assets: MediaAsset[]): MediaLibrarySummary {
  const counts = Object.fromEntries(mediaKinds.map(kind => [kind, 0])) as Record<MediaKind, number>
  let bytes = 0
  for (const asset of assets) {
    counts[asset.kind] += 1
    bytes += dataUrlBytes(asset.dataUrl)
  }
  return { counts, total: assets.length, bytes }
}

/** 一行式的库容量说明，弹窗头部和按钮提示共用。 */
export function mediaLibrarySummaryLabel(summary: MediaLibrarySummary) {
  if (!summary.total) return '还没有素材'
  // 顺序跟着 mediaKinds 走，加类目时文案自动跟上。
  const parts = mediaKinds
    .filter(kind => summary.counts[kind] > 0)
    .map(kind => `${summary.counts[kind]} ${mediaKindUnits[kind]}`)
  return `${parts.join(' · ')} · ${formatBytes(summary.bytes)}`
}

/** 单张素材在列表里显示的说明文字。 */
export function mediaAssetMeta(asset: MediaAsset) {
  const size = asset.width && asset.height ? `${asset.width}×${asset.height} · ` : ''
  return `${size}${formatBytes(dataUrlBytes(asset.dataUrl))}`
}

export interface MediaImportSummary {
  /** 真正进库的张数。 */
  added: number
  /** 库里已有同图，跳过的张数。 */
  duplicated: number
  /** 读不出来的张数（不是图片、文件损坏）。 */
  failed: number
  /** 这一类已经到上限、没能入库的张数。库里原有的素材不会被清掉。 */
  rejected: number
}

/** 批量上传后的一句回执：吞掉任何一项都会让人以为「我明明传了 20 张」。 */
export function mediaImportSummaryText(summary: MediaImportSummary) {
  const parts: string[] = []
  if (summary.added) parts.push(`已加入 ${summary.added} 张`)
  if (summary.duplicated) parts.push(`跳过 ${summary.duplicated} 张库里已有的`)
  if (summary.failed) parts.push(`${summary.failed} 张读取失败`)
  if (summary.rejected) parts.push(`${summary.rejected} 张超出每类上限未入库（原素材不会被自动清掉，可先手动删几张再传）`)
  return parts.length ? `${parts.join('；')}。` : '没有可加入的图片。'
}
