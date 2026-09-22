/**
 * 头像与「自己」身份在多次解析之间的复用。
 *
 * 每次重新解析聊天记录，用户 id 都会从 1 重新编号，所以**不能按 id 认人**——
 * 名字才是稳定的身份（解析器对同一份记录里的同名发送者只建一个用户）。
 * 批量导出早就在按这套规则复用头像（见 batch.ts 的 chatSnapshot），
 * 这里把它抽出来共用，避免单聊导入和批量导出各写一套、日久走样。
 *
 * 除了「续上旧头像」，这里还有「换了一段新对话就从头像库里随手抽几张」——
 * 两件事都发生在导入那一刻，而且都要按名字判断是不是同一个人，放在一起才不会走样。
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

/**
 * 两次解析出来的角色名单是否一模一样（归一化名字，**不看顺序**）。
 *
 * 用来回答「这次导入的是不是同一段对话」：名单没变就说明还是原来那几个人，
 * 头像保持原样；名单变了才轮到从头像库里随机补。
 * 顺序不算变化是因为记录里谁先开口并不影响「这是同一拨人」；
 * 只多了一个人、少了一个人同样算变了——那一位的头像本来也没得续，得重新给。
 */
export function sameRoster(previous: AvatarCarrier[], next: AvatarCarrier[]): boolean {
  if (previous.length !== next.length) return false
  if (!next.length) return true
  const sorted = (list: AvatarCarrier[]) => list.map(user => avatarNameKey(user.name)).sort()
  const left = sorted(previous)
  const right = sorted(next)
  return left.every((name, index) => name === right[index])
}

function isAvatarImage(value: string) {
  return typeof value === 'string' && value.startsWith('data:image/')
}

/** Fisher-Yates。随机源可注入，测试里才能断言确定的结果。 */
function shuffle(values: string[], random: () => number) {
  const next = [...values]
  for (let i = next.length - 1; i > 0; i -= 1) {
    // 夹一下：注入的随机源返回 1 或负数时也不该越界拿到 undefined。
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))))
    const swap = next[i]
    next[i] = next[j]
    next[j] = swap
  }
  return next
}

export interface DrawAvatarsResult {
  users: ChatUser[]
  /** 真正抽到新头像的角色数；池子是空的、或所有角色都已有头像时为 0。 */
  assigned: number
}

/**
 * 从头像库里给**还没有头像**的角色随机抽一张。
 *
 * - 已经有头像的一位都不动：续上的旧头像、用户自己指定的头像，优先级都在随机之上。
 * - 同一次里尽量不重复：池子够分就人人不同，不够分才会转第二圈重复使用。
 *   这正是「从我的头像库里挑几张」想要的效果——库里攒了二十张，一次对话里几个角色
 *   应该是各不相同的脸。
 * - **已经有人用着的先让开**：续上的旧头像、用户自己指定的都算在内。只避开「这次抽出来的」
 *   是不够的——「我」接住了上一段对话的自拍，新角色又抽到同一张，一屏里就出现两张一样的脸。
 * - 只挑真图片（`data:image/` 开头）与去重，脏数据不该被抽中。
 */
export function drawAvatars(users: ChatUser[], pool: string[], options: { random?: () => number } = {}): DrawAvatarsResult {
  const random = options.random ?? Math.random
  const candidates = [...new Set(pool.filter(isAvatarImage))]
  if (!candidates.length || !users.length) return { users, assigned: 0 }

  const taken = new Set(users.map(user => user.avatar).filter((url): url is string => Boolean(url)))
  const spare = candidates.filter(url => !taken.has(url))

  const remaining: string[] = []
  let round = 0
  let assigned = 0
  const next = users.map(user => {
    if (user.avatar) return user
    // 第一圈只用「还没人用着的」；发完了再洗一轮（这一圈只能从整池里拿），
    // 池子比角色少时也保证每个角色都拿得到一张。
    if (!remaining.length) {
      remaining.push(...shuffle(round === 0 && spare.length ? spare : candidates, random))
      round += 1
    }
    const avatar = remaining.pop()
    if (!avatar) return user
    assigned += 1
    return { ...user, avatar }
  })
  return assigned ? { users: next, assigned } : { users, assigned: 0 }
}
