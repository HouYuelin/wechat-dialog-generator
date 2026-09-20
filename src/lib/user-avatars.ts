/**
 * 头像与「自己」身份在多次解析之间的复用。
 *
 * 每次重新解析聊天记录，用户 id 都会从 1 重新编号，所以**不能按 id 认人**——
 * 名字才是稳定的身份（解析器对同一份记录里的同名发送者只建一个用户）。
 * 批量导出早就在按这套规则复用头像（见 batch.ts 的 chatSnapshot），
 * 这里把它抽出来共用，避免单聊导入和批量导出各写一套、日久走样。
 */
import type { ChatUser } from '../types'

/** 复用头像时只需要这几个字段，不要求调用方传入完整的 ChatUser。 */
export interface AvatarCarrier {
  id: number
  name: string
  avatar: string | null
}

/** 名字归一化：忽略首尾空白、内部连续空白与大小写，避免「小林 」被当成另一个人。 */
export function avatarNameKey(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** 解析器会把显式自称（我／自己／me…）统一成「我」，所以这一位就是「自己」。 */
export function isSelfAlias(name: string) {
  return avatarNameKey(name) === '我'
}

function avatarByName(previous: AvatarCarrier[], name: string) {
  const key = avatarNameKey(name)
  return previous.find(user => avatarNameKey(user.name) === key)?.avatar ?? null
}

/**
 * 给新解析出来的用户续上之前上传过的头像：先按名字认人；
 * 若这一位是「我」，则沿用原来「自己」那张头像。
 * 用户自带的头像优先，不会被覆盖。
 */
export function carryOverAvatars(next: ChatUser[], previous: AvatarCarrier[], previousSelfId: number | null): ChatUser[] {
  // 一张自定义头像都没有时不必重建数组，批量导入几十组对话时省一笔分配。
  if (!previous.some(user => user.avatar)) return next
  const selfAvatar = previous.find(user => user.id === previousSelfId)?.avatar ?? null
  return next.map(user => {
    if (user.avatar) return user
    return { ...user, avatar: avatarByName(previous, user.name) ?? (isSelfAlias(user.name) ? selfAvatar : null) }
  })
}

/**
 * 保住用户之前指定的「自己」：按名字在新用户里找回那一位。
 * 找不到（换了另一段对话）就退回解析器的默认——第一个发言者。
 */
export function carryOverSelfId(next: ChatUser[], previous: AvatarCarrier[], previousSelfId: number | null): number | null {
  const previousSelfName = previous.find(user => user.id === previousSelfId)?.name
  if (previousSelfName) {
    const key = avatarNameKey(previousSelfName)
    const match = next.find(user => avatarNameKey(user.name) === key)
    if (match) return match.id
  }
  return next[0]?.id ?? null
}
