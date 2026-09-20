import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPresetsToUsers,
  avatarPresetId,
  findAvatarPreset,
  normalizeAvatarPresets,
  rememberUserAvatars,
  removeAvatarPreset,
  renameAvatarPreset,
  sortAvatarPresets,
  upsertAvatarPreset,
  type AvatarPreset,
} from './avatar-presets'
import type { ChatUser } from '../types'

const png = (label: string) => `data:image/png;base64,${label}`

function preset(id: string, name: string, avatar: string, day: number): AvatarPreset {
  const stamp = new Date(Date.UTC(2026, 8, day)).toISOString()
  return { id, name, avatar: png(avatar), createdAt: stamp, usedAt: stamp }
}

test('同一个角色名只留一条记录，头像没变就不算改动', () => {
  const first = upsertAvatarPreset([], { name: '张三', avatar: png('one') }, { id: 'a' })
  assert.equal(first.list.length, 1)
  assert.equal(first.preset?.id, 'a')

  // 头像一模一样：原样返回，调用方据此跳过写库，不会每次渲染都写一遍。
  const again = upsertAvatarPreset(first.list, { name: '张三', avatar: png('one') })
  assert.equal(again.list, first.list)
  assert.equal(again.preset, null)

  // 名字只差空白和大小写也算同一个人。
  assert.equal(upsertAvatarPreset([preset('a', 'Li Si', 'one', 1)], { name: ' li si ', avatar: png('one') }).preset, null)
})

test('同名换了头像就更新那一条，并刷新它的使用时间', () => {
  const list = [preset('a', '张三', 'one', 1), preset('b', '李四', 'two', 5)]
  const result = upsertAvatarPreset(list, { name: '张三', avatar: png('three') }, { now: new Date(Date.UTC(2026, 8, 9)) })
  assert.equal(result.list.length, 2)
  assert.equal(result.preset?.id, 'a', '复用原记录的 id，删素材时不会认错人')
  assert.equal(findAvatarPreset(result.list, '张三')?.avatar, png('three'))
  assert.deepEqual(result.list.map(item => item.name), ['张三', '李四'], '刚用过的排前面')
  // 名字原样保留，界面显示不会变成小写或去空格后的样子。
  assert.equal(findAvatarPreset(result.list, '张三')?.name, '张三')
})

test('重新导入聊天记录后按名字把头像一个一个补回来，已有的不覆盖', () => {
  const presets = [preset('a', '张三', 'zhangsan', 1), preset('b', '李四', 'lisi', 2)]
  const users: ChatUser[] = [
    { id: 1, name: '李四', avatar: null },
    { id: 2, name: '张三', avatar: png('fresh') },
    { id: 3, name: '王五', avatar: null },
  ]
  const result = applyPresetsToUsers(users, presets)
  assert.equal(result.applied, 1)
  assert.equal(result.users.find(u => u.name === '李四')?.avatar, png('lisi'))
  assert.equal(result.users.find(u => u.name === '张三')?.avatar, png('fresh'), '角色自带的头像优先')
  assert.equal(result.users.find(u => u.name === '王五')?.avatar, null, '归档里没有的新角色不会被安上别人的脸')
  // 一位都对不上时原数组原样返回。
  const none = applyPresetsToUsers([{ id: 1, name: '赵六', avatar: null }], presets)
  assert.equal(none.users.length, 1)
  assert.equal(none.applied, 0)
})

test('同步整份角色列表只增不删：取消头像、移除角色都不动归档', () => {
  const users: ChatUser[] = [
    { id: 1, name: '张三', avatar: png('one') },
    { id: 2, name: '李四', avatar: null },
  ]
  const first = rememberUserAvatars([], users)
  assert.deepEqual(first.changed.map(item => item.name), ['张三'])

  // 张三取消了头像、李四也离开了对话，归档里那条仍在（只有手动删除才会消失）。
  const after = rememberUserAvatars(first.list, [{ id: 1, name: '张三', avatar: null }])
  assert.equal(after.list, first.list)
  assert.deepEqual(after.changed, [])
  assert.equal(findAvatarPreset(after.list, '张三')?.avatar, png('one'))
})

test('删除只清掉指定的一条，找不到 id 时原数组原样返回', () => {
  const list = [preset('a', '张三', 'one', 1), preset('b', '李四', 'two', 2)]
  assert.deepEqual(removeAvatarPreset(list, 'a').map(item => item.id), ['b'])
  assert.equal(removeAvatarPreset(list, 'missing'), list)
})

test('改名连主键一起换，旧名字以后再出现也不会串到这一条上', () => {
  const list = [preset('a', '张三', 'one', 1), preset('b', '李四', 'two', 2)]
  const result = renameAvatarPreset(list, 'a', '张三丰')
  assert.equal(result.error, null)
  assert.equal(result.preset?.name, '张三丰')
  assert.equal(result.preset?.id, avatarPresetId('张三丰'), '主键跟着名字走')
  assert.equal(result.previousId, 'a', '旧行得删掉，否则库里留下一条同名同头像的孤儿')
  // 头像、创建时间原样带过来；usedAt 不刷新，排序不因改名而跳。
  assert.equal(result.preset?.avatar, png('one'))
  assert.equal(result.preset?.createdAt, list[0].createdAt)
  assert.equal(result.preset?.usedAt, list[0].usedAt)

  // 关键回归：改名之后，旧名字「张三」被重新导入的角色用上时，
  // 新记录的主键不会再和改过名的那条撞上（撞了就会被写库覆盖掉）。
  const back = upsertAvatarPreset(result.list, { name: '张三', avatar: png('new') })
  assert.equal(back.preset?.id, avatarPresetId('张三'))
  assert.notEqual(back.preset?.id, result.preset?.id)
  assert.equal(back.list.length, 3)
  assert.equal(findAvatarPreset(back.list, '张三丰')?.avatar, png('one'))
})

test('改名的几种改不动：空名字、撞上已有的名字、找不到那一条', () => {
  const list = [preset('a', '张三', 'one', 1), preset('b', '李四', 'two', 2)]
  assert.match(renameAvatarPreset(list, 'a', '   ').error ?? '', /不能为空/)
  // 撞名字时拒绝而不是合并，免得把另一条的头像悄悄吃掉。
  assert.match(renameAvatarPreset(list, 'a', '李四').error ?? '', /李四/)
  assert.equal(renameAvatarPreset(list, 'a', '李四').list, list)
  assert.equal(renameAvatarPreset(list, 'missing', '王五').list, list)
  assert.equal(renameAvatarPreset(list, 'missing', '王五').preset, null)
})

test('只差空白或大小写的改名按没改处理，调用方跳过写库', () => {
  const list = [preset('a', 'Li Si', 'one', 1)]
  const same = renameAvatarPreset(list, 'a', ' li  si ')
  assert.equal(same.preset, null)
  assert.equal(same.error, null)
  assert.equal(same.list, list)

  // 真改了的时候，名字里连续的空白压成一个，和认人用的键保持一致。
  const cleaned = renameAvatarPreset(list, 'a', '  Li   Si  ')
  assert.equal(cleaned.preset, null, '压完还是同一个名字')
  assert.equal(renameAvatarPreset(list, 'a', '  Si  Li ').preset?.name, 'Si Li')
})

test('读回来的归档丢掉坏记录，同名只留最近用过的那条', () => {
  const list = normalizeAvatarPresets([
    preset('a', '张三', 'old', 1),
    preset('b', '张三', 'new', 8),
    { id: 'no-avatar', name: '李四', avatar: 'not-an-image' },
    { id: 'no-name', name: '   ', avatar: png('x') },
    { name: '李四', avatar: png('y') },
    null,
    'nonsense',
  ])
  assert.deepEqual(list.map(item => item.id), ['b'])
  assert.equal(list[0].name, '张三')
})

test('排序按最近用过的排前面，时间相同时不出现随机顺序', () => {
  const list = [preset('a', '甲', 'one', 1), preset('b', '乙', 'two', 9), preset('c', '丙', 'three', 9)]
  assert.deepEqual(sortAvatarPresets(list).map(item => item.id), ['b', 'c', 'a'])
  assert.deepEqual(sortAvatarPresets([...list].reverse()).map(item => item.id), ['b', 'c', 'a'])
})

test('归档 id 跟着角色名走，同一个名字存不出第二条', () => {
  const first = upsertAvatarPreset([], { name: '张三', avatar: png('one') })
  assert.equal(first.preset?.id, avatarPresetId('张三'))
  // 同一个名字换一张头像只更新那一条；重复跑一遍同步也不会多出记录。
  const again = upsertAvatarPreset(first.list, { name: ' 张三 ', avatar: png('two') })
  assert.equal(again.list.length, 1)
  assert.equal(again.preset?.id, first.preset?.id)
  assert.equal(avatarPresetId('Li Si'), avatarPresetId(' li si '))
})

test('名字为空或头像不是图片时不新建记录', () => {
  const result = upsertAvatarPreset([], { name: '  ', avatar: png('x') })
  assert.equal(result.list.length, 0)
  assert.equal(result.preset, null)
  assert.equal(upsertAvatarPreset([], { name: '张三', avatar: 'https://example.com/a.png' }).preset, null)
})
