/**
 * 用过的头像：把「角色名 + 头像」这一对长期记下来，只增不删。
 *
 * 为什么单独建这一份，而不是直接用项目里的 `users`：`users` 是解析聊天记录的结果，
 * 换一段记录、开一份别的草稿，整份数组就被替换掉了，之前给某个角色配的头像跟着消失。
 * 名字才是稳定的身份（解析器对同名发送者只建一个用户，见 user-avatars.ts），所以这里
 * 以「名字」为键存一份归档，重新导入、切换草稿都不受影响。
 *
 * 归档只会被用户手动改：取消某个角色的头像、换一张新的、清空编辑器都不动它，
 * 要动只能在「用过的头像」里手动改名或删除。
 * 从前素材库还会按「最久没用过」自动淘汰，用户攒的头像会莫名其妙少几张，那条规则已经去掉了。
 */
import type { ChatUser } from '../types'
import { avatarNameKey } from './user-avatars'

export interface AvatarPreset {
  id: string
  /** 角色名，原样保留用于显示；认人时按 avatarNameKey 归一化再比。 */
  name: string
  /** data URL，和项目里那份一样，直接塞进 <img src>。 */
  avatar: string
  createdAt: string
  /** 最近一次被用到的时刻，只用于排序。 */
  usedAt: string
}

export interface NewAvatarPreset {
  name: string
  avatar: string
}

/**
 * 归档的 id 直接由角色名推导：名字是这套归档的唯一键，id 跟着它走就不会出现
 * 「同一个名字存了两条」——重复渲染、严格模式跑两遍 effect 都只是把同一条写第二遍。
 * 调用前名字都已经过非空校验，所以这里不会推出空 id。
 */
export function avatarPresetId(name: string) {
  return `avatar-preset:${avatarNameKey(name)}`
}

function isAvatarDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/')
}

/**
 * 名字落库前的统一清洗：去掉首尾空白、把内部连续空白压成一个、截到 60 字。
 * 因为认人用的是 avatarNameKey（也压空白），这里不压的话就会出现「显示是『小  林』、
 * 认人按『小 林』」这种名字与键看着不一致的情况，改名时尤其容易撞上。
 */
function cleanAvatarName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 60)
}

function timestampOf(preset: AvatarPreset) {
  const used = Date.parse(preset.usedAt)
  if (Number.isFinite(used)) return used
  const created = Date.parse(preset.createdAt)
  return Number.isFinite(created) ? created : 0
}

/** 最近用过的排前面；时间相同时新的在上，最后用 id 兜底让顺序不随运行次数漂移。 */
export function sortAvatarPresets(presets: AvatarPreset[]): AvatarPreset[] {
  return [...presets].sort((left, right) => {
    const used = timestampOf(right) - timestampOf(left)
    if (used) return used
    const created = Date.parse(right.createdAt) - Date.parse(left.createdAt)
    if (Number.isFinite(created) && created) return created
    return left.id.localeCompare(right.id)
  })
}

/**
 * 读回来的数据不能全信：字段缺失、被改坏的记录直接丢掉，同名（归一化后）的只留最近用过的一条。
 */
export function normalizeAvatarPresets(raw: unknown): AvatarPreset[] {
  if (!Array.isArray(raw)) return []
  const byName = new Map<string, AvatarPreset>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const value = item as Partial<AvatarPreset>
    if (typeof value.id !== 'string' || !value.id) continue
    if (typeof value.name !== 'string' || !value.name.trim()) continue
    if (!isAvatarDataUrl(value.avatar)) continue
    const createdAt = typeof value.createdAt === 'string' && value.createdAt ? value.createdAt : new Date(0).toISOString()
    const usedAt = typeof value.usedAt === 'string' && value.usedAt ? value.usedAt : createdAt
    const preset: AvatarPreset = {
      id: value.id,
      name: cleanAvatarName(value.name),
      avatar: value.avatar,
      createdAt,
      usedAt,
    }
    const key = avatarNameKey(preset.name)
    const kept = byName.get(key)
    if (!kept || timestampOf(preset) > timestampOf(kept)) byName.set(key, preset)
  }
  return sortAvatarPresets([...byName.values()])
}

export function findAvatarPreset(presets: AvatarPreset[], name: string) {
  const key = avatarNameKey(name)
  return presets.find(preset => avatarNameKey(preset.name) === key) ?? null
}

/**
 * 记一次「这个名字用上了这张头像」。
 *
 * 头像没变就原样返回（`preset` 为 null），调用方可以据此跳过写库——否则每次渲染都算一次改动，
 * 会白白往 IndexedDB 里写一遍。头像变了才更新并刷新 usedAt。
 */
export function upsertAvatarPreset(
  presets: AvatarPreset[],
  input: NewAvatarPreset,
  options: { now?: Date; id?: string } = {},
): { list: AvatarPreset[]; preset: AvatarPreset | null } {
  const name = cleanAvatarName(input.name)
  if (!name || !isAvatarDataUrl(input.avatar)) return { list: presets, preset: null }
  const existing = findAvatarPreset(presets, name)
  const now = options.now ?? new Date()
  const stamp = now.toISOString()

  if (existing) {
    if (existing.avatar === input.avatar) return { list: presets, preset: null }
    const updated: AvatarPreset = { ...existing, avatar: input.avatar, usedAt: stamp }
    return {
      list: sortAvatarPresets(presets.map(preset => (preset.id === existing.id ? updated : preset))),
      preset: updated,
    }
  }

  const created: AvatarPreset = {
    id: options.id ?? avatarPresetId(name),
    name,
    avatar: input.avatar,
    createdAt: stamp,
    usedAt: stamp,
  }
  return { list: sortAvatarPresets([...presets, created]), preset: created }
}

/** 从归档里挑一张用上时记一次，只影响列表顺序。 */
export function touchAvatarPreset(presets: AvatarPreset[], id: string, now: Date = new Date()): AvatarPreset[] {
  const stamp = now.toISOString()
  let changed = false
  const next = presets.map(preset => {
    if (preset.id !== id) return preset
    changed = true
    return { ...preset, usedAt: stamp }
  })
  return changed ? sortAvatarPresets(next) : presets
}

/** 同步一整份角色列表：只增不删，返回真正改动过的记录，供调用方写库。 */export function rememberUserAvatars(
  presets: AvatarPreset[],
  users: ChatUser[],
  options: { now?: Date } = {},
): { list: AvatarPreset[]; changed: AvatarPreset[] } {
  let list = presets
  const changed: AvatarPreset[] = []
  for (const user of users) {
    if (!user.avatar) continue
    const result = upsertAvatarPreset(list, { name: user.name, avatar: user.avatar }, options)
    if (!result.preset) continue
    list = result.list
    changed.push(result.preset)
  }
  return { list, changed }
}

/** 只删指定的这一条；找不到 id 时原数组原样返回。 */
export function removeAvatarPreset(presets: AvatarPreset[], id: string): AvatarPreset[] {
  const next = presets.filter(preset => preset.id !== id)
  return next.length === presets.length ? presets : next
}

export interface RenameAvatarPresetResult {
  /** 改完之后的整份归档；没改成（失败、或名字没变）时原样返回。 */
  list: AvatarPreset[]
  /** 改成功的那一条，供调用方写库；没改动时为 null。 */
  preset: AvatarPreset | null
  /** 改名前那一行的主键。和 `preset.id` 不同就说明键也跟着名字变了，得把旧行删掉。 */
  previousId: string | null
  /** 改不动的原因，可直接显示给用户；能改时为 null。 */
  error: string | null
}

/**
 * 给归档里的某一条改名字。
 *
 * 名字是这套归档的键，所以「改名」等于把它重新归到新名字下——连主键一起换。
 * 必须换键，不然会出事：旧名字（比如「小林」）以后被重新导入的角色用上时，
 * upsertAvatarPreset 会照旧按名字推出主键 `avatar-preset:小林`，和这条改过名的记录撞同一个键，
 * 写库时直接把人家覆盖掉。换键之后「id === avatar-preset:<名字>」这个不变量一直成立。
 *
 * 改到别人已经占着的名字上会拒绝而不是合并，避免把另一条的头像悄悄吃掉。
 * 只差空白和大小写（归一化后同一个键）视作没改，返回 preset 为 null 让调用方跳过写库。
 */
export function renameAvatarPreset(presets: AvatarPreset[], id: string, rawName: string): RenameAvatarPresetResult {
  const target = presets.find(preset => preset.id === id)
  if (!target) return { list: presets, preset: null, previousId: null, error: null }

  const name = cleanAvatarName(rawName)
  if (!name) return { list: presets, preset: null, previousId: null, error: '名字不能为空' }

  const key = avatarNameKey(name)
  if (key === avatarNameKey(target.name)) return { list: presets, preset: null, previousId: null, error: null }

  const taken = presets.find(preset => preset.id !== id && avatarNameKey(preset.name) === key)
  if (taken) return { list: presets, preset: null, previousId: null, error: `已经有一条叫「${taken.name}」的头像了，换个名字再试` }

  // usedAt 不刷新：改名不是「用上了」，排序不该因此跳动。
  const renamed: AvatarPreset = { ...target, id: avatarPresetId(name), name }
  return {
    list: sortAvatarPresets(presets.map(preset => (preset.id === id ? renamed : preset))),
    preset: renamed,
    previousId: renamed.id === id ? null : id,
    error: null,
  }
}

/**
 * 重新导入聊天记录后，用归档把头像补回来：按名字认人，用户自己已经带头像的不覆盖。
 * 一处都补不上时原数组原样返回。
 */
export function applyPresetsToUsers(users: ChatUser[], presets: AvatarPreset[]): { users: ChatUser[]; applied: number } {
  if (!presets.length || !users.length) return { users, applied: 0 }
  let applied = 0
  const next = users.map(user => {
    if (user.avatar) return user
    const preset = findAvatarPreset(presets, user.name)
    if (!preset) return user
    applied += 1
    return { ...user, avatar: preset.avatar }
  })
  return applied ? { users: next, applied } : { users, applied: 0 }
}
