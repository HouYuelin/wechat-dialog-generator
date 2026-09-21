/**
 * 用过的昵称：把用户输过的名字记下来，下次直接点选，不用重打。
 *
 * 为什么不从现有数据里推导，而要单独存一份：
 * - `users`（聊天角色）是解析聊天记录的结果，换一段记录整份就被替换了，而且那里的名字
 *   来自导入文本、不是用户自己敲的；
 * - 头像归档（avatar-presets）只记住「配过头像」的名字，聊天标题、朋友圈的评论人、
 *   场景页的收款方都不会进去。
 * 所以需要一个只装名字的通用历史，供聊天标题、头像归档改名、朋友圈、场景页共用。
 *
 * 去重按 `avatarNameKey` 归一化（忽略大小写与内部空白），和头像归档认人是同一套规则，
 * 免得「小林」「小林 」「 小林」在历史里各占一格。
 */
import { avatarNameKey } from './user-avatars'

/** 历史上限。名字很小，但导入一份几十人的聊天记录就会灌进来一批，得有个头。 */
export const maxNameHistory = 100
/** 单个名字的显示长度上限，与头像归档的清洗规则保持一致。 */
export const maxNameLength = 40

export interface NameHistoryEntry {
  /** 名字原文（已清洗），点选时原样回填。 */
  name: string
  /** 最近一次用到的时刻（ISO），只用于排序。 */
  usedAt: string
}

export function nameHistoryKey(name: string) {
  return avatarNameKey(name)
}

/** 落库前的统一清洗：去首尾空白、压内部连续空白、截断。 */
export function cleanDisplayName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxNameLength)
}

/**
 * 把「多个昵称用逗号分隔」的一段文本拆成名字数组。
 * 朋友圈的点赞用户、场景页的群成员昵称都用它，分隔符中英文都认。
 */
export function splitNameText(text: string) {
  return text
    .split(/[,，、;；\r\n]+/)
    .map(cleanDisplayName)
    .filter(Boolean)
}

function timestampOf(entry: NameHistoryEntry) {
  const time = Date.parse(entry.usedAt)
  return Number.isFinite(time) ? time : 0
}

/** 最近用过的排前面；同一时刻（批量记下的那批）保持原有先后，`sort` 是稳定排序。 */
export function sortNameHistory(list: NameHistoryEntry[]): NameHistoryEntry[] {
  return [...list].sort((left, right) => timestampOf(right) - timestampOf(left))
}

/**
 * 读回来的数据不能全信：字段缺失、被改坏的记录直接丢掉，归一化后同名的只留最近用过的一条。
 */
export function normalizeNameHistory(raw: unknown): NameHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  const byKey = new Map<string, NameHistoryEntry>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const value = item as Partial<NameHistoryEntry>
    if (typeof value.name !== 'string') continue
    const name = cleanDisplayName(value.name)
    if (!name) continue
    const usedAt = typeof value.usedAt === 'string' && value.usedAt ? value.usedAt : new Date(0).toISOString()
    const entry: NameHistoryEntry = { name, usedAt }
    const key = nameHistoryKey(name)
    const kept = byKey.get(key)
    if (!kept || timestampOf(entry) > timestampOf(kept)) byKey.set(key, entry)
  }
  return sortNameHistory([...byKey.values()]).slice(0, maxNameHistory)
}

/**
 * 记下一批「用过的名字」。
 *
 * - 已经存在（归一化后同名）的会带着最新写法提到最前，所以「最近用过的」始终排在前面；
 * - 一条都没变时**原数组原样返回**，调用方可以据此跳过写库；输入框 blur 会频繁走到这里，
 *   这个判断就是为了让它几乎零成本；
 * - 一批多条时按传入顺序给递增的时间戳，保证同一次操作里后传的更靠前，
 *   结果不随运行次数漂移（否则同一毫秒内的排序会依赖引擎实现）。
 */
export function rememberNames(
  list: NameHistoryEntry[],
  input: string | readonly string[],
  now: Date = new Date(),
): NameHistoryEntry[] {
  const names = (typeof input === 'string' ? [input] : input).map(cleanDisplayName).filter(Boolean)
  if (!names.length) return list

  const entries = new Map<string, NameHistoryEntry>()
  let latest = 0
  for (const entry of list) {
    entries.set(nameHistoryKey(entry.name), entry)
    latest = Math.max(latest, timestampOf(entry))
  }

  // 新记录的时间戳取「当前时刻」与「已有最新 + 1ms」的较大者：这样「刚记的一定排最前」
  // 是硬保证，不依赖调用方每次给出互不相同的 now（同一毫秒里连记两个名字也不会颠倒），
  // 时钟被往回拨时也不会把新名字塞到列表中间。
  const base = Math.max(now.getTime(), latest + 1)

  let changed = false
  names.forEach((name, index) => {
    const key = nameHistoryKey(name)
    const current = entries.get(key)
    if (current && current.name === name && list[0] === current) return
    entries.set(key, { name, usedAt: new Date(base + index).toISOString() })
    changed = true
  })
  if (!changed) return list
  return normalizeNameHistory([...entries.values()])
}

/** 只删指定的这一个名字；历史里没有它时原数组原样返回。 */
export function forgetName(list: NameHistoryEntry[], name: string): NameHistoryEntry[] {
  const key = nameHistoryKey(name)
  const next = list.filter(entry => nameHistoryKey(entry.name) !== key)
  return next.length === list.length ? list : next
}
