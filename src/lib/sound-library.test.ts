import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addSoundAssets,
  createSoundAsset,
  findSoundAssetById,
  formatBytes,
  maxSoundAssets,
  normalizeSoundLibrary,
  removeSoundAsset,
  renameSoundAsset,
  sortSoundAssets,
  soundAssetMeta,
  touchSoundAsset,
  type SoundAsset,
} from './sound-library'

const audio = (label: string) => `data:audio/mpeg;base64,${label}`

/** 只关心时间顺序时，用固定日期造音效；payload 同时充当去重依据。 */
function asset(payload: string, day: number, options: { id?: string; name?: string; usedDay?: number; duration?: number; bytes?: number } = {}): SoundAsset {
  const created = createSoundAsset(
    { dataUrl: audio(payload), name: options.name, durationSeconds: options.duration ?? 1.5, bytes: options.bytes ?? 2048 },
    { now: new Date(Date.UTC(2026, 8, day)), id: options.id ?? payload },
  )
  return options.usedDay === undefined ? created : { ...created, usedAt: new Date(Date.UTC(2026, 8, options.usedDay)).toISOString() }
}

test('新音效默认命名，名字过长会被截断，时长与体积取正数', () => {
  assert.equal(createSoundAsset({ dataUrl: audio('a') }).name, '未命名音效')
  assert.equal(createSoundAsset({ dataUrl: audio('a'), name: '  提示音  ' }).name, '提示音')
  assert.equal(createSoundAsset({ dataUrl: audio('a'), name: 'x'.repeat(120) }).name.length, 60)
  assert.equal(createSoundAsset({ dataUrl: audio('a'), durationSeconds: -1 }).durationSeconds, 0)
  assert.equal(createSoundAsset({ dataUrl: audio('a'), bytes: 2.7 }).bytes, 3)
  assert.equal(createSoundAsset({ dataUrl: audio('a'), bytes: Number.NaN }).bytes, 0)
})

test('体积文案按量级切换单位，非正数返回空串', () => {
  assert.equal(formatBytes(0), '')
  assert.equal(formatBytes(900), '900 B')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB')
  assert.equal(formatBytes(Number.NaN), '')
})

test('网格顺序：新上传的排前面，时间相同时按 id 兜底', () => {
  const list = [asset('a', 3), asset('b', 1), asset('c', 2)]
  const sorted = sortSoundAssets(list)
  assert.deepEqual(sorted.map(item => item.id), ['a', 'c', 'b'])
})

test('规范化整个库：丢掉非音频、坏记录、缺字段，并按 dataUrl 去重', () => {
  const good = asset('a', 1, { name: '叮咚' })
  const dup = asset('a', 2, { name: '重复' })
  const raw = [
    good,
    dup,
    { id: 'no-dataurl', name: 'x' },
    { id: 'not-object', dataUrl: 123 },
    null,
    { id: 'img', name: 'x', dataUrl: 'data:image/png;base64,abc' },
    { ...good, id: 'missing-fields' },
  ]
  const library = normalizeSoundLibrary(raw)
  assert.equal(library.length, 1)
  assert.equal(library[0].id, good.id)
})

test('按 dataUrl 去重后再按上限收录，超出部分只拒收不清旧', () => {
  const base = [asset('existing', 1)]
  const incoming = [asset('existing', 1), asset('n1', 1), asset('n2', 2)]
  const result = addSoundAssets(base, incoming, { max: 2 })
  assert.equal(result.duplicated, 1)
  assert.equal(result.added.length, 1, '额度只剩 1，只收 1 条')
  assert.equal(result.rejected, 1, '第二条新音效超出上限被拒收')
  assert.equal(result.library.length, 2)
  assert.ok(result.library.some(item => item.id === 'existing'), '原有音效仍在')
})

test('库满时新音效全部被拒收，原有音效一条不动', () => {
  const base = [asset('a', 1), asset('b', 2)]
  const result = addSoundAssets(base, [asset('c', 3)], { max: 2 })
  assert.equal(result.added.length, 0)
  assert.equal(result.rejected, 1)
  assert.equal(result.library.length, 2)
})

test('记一次使用只刷新 usedAt，不改变其它字段', () => {
  const target = asset('a', 1, { usedDay: 1 })
  const list = [target, asset('b', 2)]
  const next = touchSoundAsset(list, target.id, new Date(Date.UTC(2026, 8, 10)))
  assert.notEqual(next, list)
  const touched = next.find(item => item.id === target.id)!
  assert.equal(touched.usedAt, new Date(Date.UTC(2026, 8, 10)).toISOString())
  assert.equal(touched.createdAt, target.createdAt)
})

test('改名清空则退回默认名，找不到 id 时原样返回', () => {
  const list = [asset('a', 1, { name: '叮咚' })]
  const renamed = renameSoundAsset(list, 'a', '  新的名字  ')
  assert.equal(renamed[0].name, '新的名字')
  assert.deepEqual(renameSoundAsset(list, 'missing', 'x'), list)
  assert.equal(renameSoundAsset(list, 'a', '   ')[0].name, '未命名音效')
})

test('删除指定的这条，找不到 id 时原样返回', () => {
  const list = [asset('a', 1), asset('b', 2)]
  assert.equal(removeSoundAsset(list, 'a').length, 1)
  assert.deepEqual(removeSoundAsset(list, 'missing'), list)
})

test('按 id 找音效', () => {
  const list = [asset('a', 1)]
  assert.equal(findSoundAssetById(list, 'a')?.id, 'a')
  assert.equal(findSoundAssetById(list, 'missing'), null)
})

test('列表说明文字拼出时长与体积', () => {
  const withAll = asset('a', 1, { duration: 1.5, bytes: 2048 })
  const noBytes = asset('b', 1, { duration: 0, bytes: 0 })
  assert.equal(soundAssetMeta(withAll), '1.5 秒 · 2 KB')
  assert.equal(soundAssetMeta(noBytes), '')
})

test('每类上限是一个正数常量', () => {
  assert.ok(maxSoundAssets > 0)
})
