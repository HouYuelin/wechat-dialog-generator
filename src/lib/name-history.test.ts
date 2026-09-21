import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanDisplayName,
  forgetName,
  maxNameHistory,
  maxNameLength,
  nameHistoryKey,
  normalizeNameHistory,
  rememberNames,
  sortNameHistory,
  splitNameText,
  type NameHistoryEntry,
} from './name-history'

const at = (iso: string) => new Date(iso)

test('记一个新名字会排在最前面', () => {
  const list = rememberNames([], '小林', at('2026-09-21T10:00:00Z'))
  assert.deepEqual(list, [{ name: '小林', usedAt: '2026-09-21T10:00:00.000Z' }])
})

test('已经排在最前、写法也没变，就原数组返回，调用方可以跳过写库', () => {
  const list = rememberNames([], '小林', at('2026-09-21T10:00:00Z'))
  const again = rememberNames(list, '小林', at('2026-09-21T11:00:00Z'))
  assert.equal(again, list)
  // 空白差异只影响归一化后的键，写法一致时同样不动。
  assert.equal(rememberNames(list, ' 小林 ', at('2026-09-21T11:00:00Z')), list)
})

test('同名不同写法只留一条，显示跟着最新一次输入走', () => {
  let list = rememberNames([], 'Alice', at('2026-09-21T10:00:00Z'))
  list = rememberNames(list, '  alice  ', at('2026-09-21T11:00:00Z'))
  assert.equal(list.length, 1)
  assert.equal(list[0].name, 'alice')
  assert.equal(list[0].usedAt, '2026-09-21T11:00:00.000Z')
  assert.equal(nameHistoryKey('ALICE'), nameHistoryKey(' alice '))
})

test('最近用过的排前面；同一批里按传入顺序靠前', () => {
  let list = rememberNames([], ['A', 'B'], at('2026-09-21T10:00:00Z'))
  assert.deepEqual(list.map(item => item.name), ['B', 'A'])
  list = rememberNames(list, 'A', at('2026-09-21T10:00:05Z'))
  assert.deepEqual(list.map(item => item.name), ['A', 'B'])
})

test('超出上限时丢掉最久没用过的', () => {
  let list: NameHistoryEntry[] = []
  for (let index = 0; index < maxNameHistory + 5; index += 1) {
    list = rememberNames(list, `名字${index}`, at('2026-09-21T10:00:00Z'))
  }
  assert.equal(list.length, maxNameHistory)
  assert.equal(list[0].name, `名字${maxNameHistory + 4}`)
  assert.equal(list.some(item => item.name === '名字0'), false)
})

test('被淘汰出去的名字还能重新记回来', () => {
  let list: NameHistoryEntry[] = []
  for (let index = 0; index < maxNameHistory; index += 1) {
    list = rememberNames(list, `名字${index}`, at('2026-09-21T10:00:00Z'))
  }
  list = rememberNames(list, '名字0', at('2026-09-21T12:00:00Z'))
  assert.equal(list.length, maxNameHistory)
  assert.equal(list[0].name, '名字0')
})

test('空名字与纯空白不进历史', () => {
  const list = rememberNames([], ['', '   ', '\n'], at('2026-09-21T10:00:00Z'))
  assert.deepEqual(list, [])
  assert.equal(rememberNames(list, ''), list)
})

test('删除一个名字；历史里没有它时原数组返回', () => {
  const list = rememberNames([], ['A', 'B'], at('2026-09-21T10:00:00Z'))
  assert.deepEqual(forgetName(list, 'a').map(item => item.name), ['B'])
  assert.equal(forgetName(list, 'C'), list)
})

test('读回来的脏数据被清洗掉，归一化同名的只留最近用过的一条', () => {
  const restored = normalizeNameHistory([
    { name: '小林', usedAt: '2026-09-21T10:00:00.000Z' },
    { name: ' 小林 ', usedAt: '2026-09-21T09:00:00.000Z' },
    { name: '', usedAt: '2026-09-21T10:00:00.000Z' },
    { name: 123 },
    null,
    'x',
    { name: '阿强' },
  ])
  assert.deepEqual(restored.map(item => item.name), ['小林', '阿强'])
  assert.equal(restored[1].usedAt, new Date(0).toISOString())
  assert.deepEqual(normalizeNameHistory('nope'), [])
  assert.deepEqual(normalizeNameHistory(undefined), [])
})

test('排序用不上的时间戳不会把条目挤掉', () => {
  const list = sortNameHistory([
    { name: '坏时间', usedAt: 'not-a-date' },
    { name: '正常', usedAt: '2026-09-21T10:00:00.000Z' },
  ])
  assert.deepEqual(list.map(item => item.name), ['正常', '坏时间'])
})

test('名字清洗与分隔符拆分', () => {
  assert.equal(cleanDisplayName('  小   林  '), '小 林')
  assert.equal(cleanDisplayName('长'.repeat(50)).length, maxNameLength)
  assert.deepEqual(splitNameText('小林，阿强、老王;小李\n小张'), ['小林', '阿强', '老王', '小李', '小张'])
  assert.deepEqual(splitNameText(' , ，'), [])
  assert.deepEqual(splitNameText(''), [])
})
