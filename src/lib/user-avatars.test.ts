import test from 'node:test'
import assert from 'node:assert/strict'
import { avatarNameKey, carryOverAvatars, carryOverSelfId, drawAvatars, isSelfAlias, sameRoster } from './user-avatars'
import type { ChatUser } from '../types'

const png = (label: string) => `data:image/png;base64,${label}`

function previousUsers(): ChatUser[] {
  return [
    { id: 1, name: '张三', avatar: png('zhangsan') },
    { id: 2, name: '李四', avatar: png('lisi') },
    { id: 3, name: '王五', avatar: null },
  ]
}

test('re-importing looks avatars up by name, not by the renumbered id', () => {
  // 第二次解析把「李四」排到了第一位，id 全变了；头像必须跟着名字走。
  const next: ChatUser[] = [
    { id: 1, name: '李四', avatar: null },
    { id: 2, name: '张三', avatar: null },
  ]
  const merged = carryOverAvatars(next, previousUsers(), 1)
  assert.equal(merged.find(u => u.name === '李四')?.avatar, png('lisi'))
  assert.equal(merged.find(u => u.name === '张三')?.avatar, png('zhangsan'))
  // 顺序与 id 保持解析器给出的样子，复用头像不该打乱任何东西。
  assert.deepEqual(merged.map(u => [u.id, u.name]), [[1, '李四'], [2, '张三']])
})

test('a new participant simply has no avatar instead of borrowing someone else’s', () => {
  const merged = carryOverAvatars([{ id: 1, name: '赵六', avatar: null }], previousUsers(), 1)
  assert.equal(merged[0].avatar, null)
})

test('an explicit self keeps the avatar previously uploaded for self', () => {
  // 上一份对话里「自己」是张三；这一份改用了显式自称「我」，头像要接过来。
  const merged = carryOverAvatars([{ id: 1, name: '我', avatar: null }, { id: 2, name: '李四', avatar: null }], previousUsers(), 1)
  assert.equal(merged.find(u => u.name === '我')?.avatar, png('zhangsan'))
  assert.equal(merged.find(u => u.name === '李四')?.avatar, png('lisi'))
})

test('name matching tolerates spacing and casing so a typo does not drop the avatar', () => {
  const merged = carryOverAvatars([{ id: 1, name: ' Li Si ', avatar: null }], [{ id: 9, name: 'li si', avatar: png('lisi') }], null)
  assert.equal(merged[0].avatar, png('lisi'))
  assert.equal(avatarNameKey('  张 三 '), '张 三')
  assert.equal(isSelfAlias(' 我 '), true)
  assert.equal(isSelfAlias('me'), false, '解析器会把 me 归一成「我」，这里只看归一后的结果')
})

test('a user who already carries an avatar is never overwritten', () => {
  const merged = carryOverAvatars([{ id: 1, name: '张三', avatar: png('fresh') }], previousUsers(), 1)
  assert.equal(merged[0].avatar, png('fresh'))
})

test('no uploaded avatars anywhere leaves the freshly parsed users untouched', () => {
  const next: ChatUser[] = [{ id: 1, name: '张三', avatar: null }]
  assert.equal(carryOverAvatars(next, [{ id: 1, name: '张三', avatar: null }], 1), next)
})

test('the chosen self survives re-import while a different conversation falls back', () => {
  // 「自己」是张三，重新导入后仍是张三，哪怕他已经不在第一位。
  const next: ChatUser[] = [
    { id: 1, name: '李四', avatar: null },
    { id: 2, name: '张三', avatar: null },
  ]
  assert.equal(carryOverSelfId(next, previousUsers(), 1), 2)
  // 换成另一段对话，旧的自称不在其中，退回第一个发言者。
  const other: ChatUser[] = [{ id: 1, name: '甲', avatar: null }, { id: 2, name: '乙', avatar: null }]
  assert.equal(carryOverSelfId(other, previousUsers(), 1), 1)
  assert.equal(carryOverSelfId([], previousUsers(), 1), null)
  assert.equal(carryOverSelfId(next, previousUsers(), null), 1, '没设过自己就用解析器的默认')
})

test('sameRoster ignores order and spacing but notices anyone new', () => {
  const before: ChatUser[] = [{ id: 1, name: '张三', avatar: null }, { id: 2, name: '李四', avatar: null }]
  // 顺序不同、空白与大小写不同，还是同一拨人。
  assert.equal(sameRoster(before, [{ id: 1, name: '李四', avatar: null }, { id: 2, name: ' 张三 ', avatar: null }]), true)
  // 少一位、多一位、换一位都算变了。
  assert.equal(sameRoster(before, [{ id: 1, name: '张三', avatar: null }]), false)
  assert.equal(sameRoster(before, [
    { id: 1, name: '张三', avatar: null },
    { id: 2, name: '李四', avatar: null },
    { id: 3, name: '王五', avatar: null },
  ]), false)
  assert.equal(sameRoster(before, [{ id: 1, name: '张三', avatar: null }, { id: 2, name: '王五', avatar: null }]), false)
  // 第一次导入之前是空的，要算「变了」——新对话的头像才抽得出来。
  assert.equal(sameRoster([], before), false)
  assert.equal(sameRoster([], []), true)
})

test('drawAvatars only fills the roles that have no avatar, without repeating while the pool lasts', () => {
  const pool = [png('a'), png('b'), png('c')]
  const users: ChatUser[] = [
    { id: 1, name: '张三', avatar: null },
    { id: 2, name: '李四', avatar: png('mine') },
    { id: 3, name: '王五', avatar: null },
  ]
  const { users: next, assigned } = drawAvatars(users, pool, { random: () => 0 })
  assert.equal(assigned, 2)
  assert.equal(next[1].avatar, png('mine'), '用户自己指定的头像不会被随机覆盖')
  const picked = [next[0].avatar, next[2].avatar]
  assert.equal(new Set(picked).size, 2, '池子够分时两个角色拿到不同的脸')
  assert.ok(picked.every(url => url !== null && pool.includes(url)))
})

test('drawAvatars wraps around the pool when there are more roles than avatars', () => {
  const users: ChatUser[] = [1, 2, 3].map(id => ({ id, name: `角色${id}`, avatar: null }))
  const { users: next, assigned } = drawAvatars(users, [png('only'), png('other')], { random: () => 0 })
  assert.equal(assigned, 3)
  assert.ok(next.every(user => typeof user.avatar === 'string'))
  assert.equal(new Set(next.map(user => user.avatar)).size, 2, '不够分的才会重复')
})

test('drawAvatars bails out on an empty or dirty pool instead of assigning nothing', () => {
  const users: ChatUser[] = [{ id: 1, name: '张三', avatar: null }]
  assert.equal(drawAvatars(users, []).assigned, 0)
  // 非图片的脏数据不算候选；全是脏数据时原样返回，连数组都不重建。
  const dirty = drawAvatars(users, ['', 'not-a-data-url', 'data:text/plain,hi'])
  assert.equal(dirty.assigned, 0)
  assert.equal(dirty.users, users)
  // 同一个池子里重复的图去重后只算一张。
  assert.equal(drawAvatars(users, [png('same'), png('same')], { random: () => 0 }).assigned, 1)
  // 角色都有头像时一个人也不动。
  const full: ChatUser[] = [{ id: 1, name: '张三', avatar: png('mine') }]
  assert.equal(drawAvatars(full, [png('a')]).assigned, 0)
})

test('drawAvatars steers clear of avatars already in use', () => {
  // 「我」接住了上一段对话的自拍（=池子里的 a），新角色不该再抽到同一张。
  const users: ChatUser[] = [
    { id: 1, name: '我', avatar: png('a') },
    { id: 2, name: '王五', avatar: null },
  ]
  for (const value of [0, 0.25, 0.5, 0.75, 0.99]) {
    const { users: next } = drawAvatars(users, [png('a'), png('b'), png('c')], { random: () => value })
    assert.notEqual(next[1].avatar, png('a'), `random=${value} 时不该撞上已在用的那张`)
  }
  // 池子里只剩已经在用的那一张时，只能重复，不能空着不发。
  const tight: ChatUser[] = [
    { id: 1, name: '我', avatar: png('a') },
    { id: 2, name: '王五', avatar: null },
  ]
  assert.equal(drawAvatars(tight, [png('a')], { random: () => 0 }).users[1].avatar, png('a'))
})

test('drawAvatars tolerates a random source that returns 1 or a negative number', () => {
  const users: ChatUser[] = [{ id: 1, name: '甲', avatar: null }, { id: 2, name: '乙', avatar: null }]
  for (const value of [1, 1.5, -1]) {
    const { users: next, assigned } = drawAvatars(users, [png('a'), png('b')], { random: () => value })
    assert.equal(assigned, 2, `random 返回 ${value} 时仍要发满头像`)
    assert.ok(next.every(user => typeof user.avatar === 'string' && user.avatar.startsWith('data:image/')))
  }
})
