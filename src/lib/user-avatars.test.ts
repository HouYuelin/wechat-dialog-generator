import test from 'node:test'
import assert from 'node:assert/strict'
import { avatarNameKey, carryOverAvatars, carryOverSelfId, isSelfAlias } from './user-avatars'
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
