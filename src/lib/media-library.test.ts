import test from 'node:test'
import assert from 'node:assert/strict'
import type { ChatUser } from '../types'
import {
  addMediaAssets,
  assignAvatars,
  createMediaAsset,
  dataUrlBytes,
  findAssetByDataUrl,
  formatBytes,
  mediaAssetMeta,
  mediaImportSummaryText,
  mediaLibrarySummary,
  mediaLibrarySummaryLabel,
  normalizeMediaLibrary,
  recentMediaAssets,
  removeMediaAsset,
  renameMediaAsset,
  sortMediaAssets,
  touchMediaAsset,
  type MediaAsset,
  type MediaKind,
} from './media-library'

const png = (label: string) => `data:image/png;base64,${label}`

/** 只关心时间顺序时，用固定日期造素材；payload 同时充当去重依据。 */
function asset(kind: MediaKind, payload: string, day: number, options: { id?: string; name?: string; usedDay?: number } = {}): MediaAsset {
  const created = createMediaAsset(
    { kind, dataUrl: png(payload), name: options.name, width: 90, height: 90 },
    { now: new Date(Date.UTC(2026, 8, day)), id: options.id ?? payload },
  )
  return options.usedDay === undefined ? created : { ...created, usedAt: new Date(Date.UTC(2026, 8, options.usedDay)).toISOString() }
}

test('data URL 的字节数按 base64 规则估算', () => {
  // base64 每 4 个字符装 3 字节；补位的 `=` 不算数据。
  assert.equal(dataUrlBytes('data:image/png;base64,AAAA'), 3)
  assert.equal(dataUrlBytes('data:image/png;base64,AAA='), 2)
  assert.equal(dataUrlBytes('data:image/png;base64,AA=='), 1)
  // 没有逗号的脏数据也不该算出负数。
  assert.equal(dataUrlBytes('nonsense'), 6)
  assert.equal(dataUrlBytes(''), 0)
})

test('体积文案按量级切换单位', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(900), '900 B')
  assert.equal(formatBytes(2048), '2 KB')
  assert.equal(formatBytes(1.5 * 1024 * 1024), '1.5 MB')
  assert.equal(formatBytes(Number.NaN), '0 B')
})

test('新素材默认按类目命名，名字过长会被截断', () => {
  assert.equal(createMediaAsset({ kind: 'avatar', dataUrl: png('a') }).name, '头像')
  assert.equal(createMediaAsset({ kind: 'sticker', dataUrl: png('a') }).name, '表情图片')
  assert.equal(createMediaAsset({ kind: 'avatar', dataUrl: png('a'), name: '  我的头像  ' }).name, '我的头像')
  assert.equal(createMediaAsset({ kind: 'avatar', dataUrl: png('a'), name: 'x'.repeat(120) }).name.length, 60)
})

test('读回来的库会丢掉坏记录并按图去重', () => {
  const library = normalizeMediaLibrary([
    asset('avatar', 'one', 1),
    { id: 'broken', kind: 'avatar', dataUrl: 'not-an-image' },
    { id: 'no-kind', dataUrl: png('two') },
    null,
    'nonsense',
    asset('avatar', 'one', 2, { id: 'duplicate-payload' }),
    { ...asset('sticker', 'three', 3), name: '', width: -5, usedAt: 42 },
  ])
  assert.deepEqual(library.map(item => item.dataUrl), [png('three'), png('one')])
  // 名字空了退回类目名，非法宽高归零，坏的 usedAt 退回 createdAt。
  assert.equal(library[0].name, '表情图片')
  assert.equal(library[0].width, 0)
  assert.equal(library[0].usedAt, library[0].createdAt)
})

test('加入素材时同一张图不会变成两条', () => {
  const library = [asset('avatar', 'one', 1)]
  const result = addMediaAssets(library, [asset('avatar', 'one', 2, { id: 'again' }), asset('avatar', 'two', 2)])
  assert.equal(result.duplicated, 1)
  assert.deepEqual(result.added.map(item => item.id), ['two'])
  assert.equal(result.library.length, 2)
  // 一条新素材都没有时原库原样返回，不白建数组。
  assert.equal(addMediaAssets(library, [asset('avatar', 'one', 3)]).library, library)
})

test('到了单类上限就不再收新图，但一张旧素材都不会被自动清掉', () => {
  const library = [
    asset('avatar', 'oldest', 1, { usedDay: 1 }),
    asset('avatar', 'recent', 2, { usedDay: 10 }),
    asset('sticker', 'sticker-1', 3),
  ]
  const result = addMediaAssets(library, [asset('avatar', 'newest', 4, { usedDay: 11 })], { maxPerKind: 2 })
  assert.equal(result.rejected, 1)
  assert.equal(result.added.length, 0)
  // 曾经会按「最久没用过」淘汰 oldest；现在旧素材一律留住，收不下的是刚传进来的那张。
  assert.deepEqual(result.library.map(item => item.id).sort(), ['oldest', 'recent', 'sticker-1'])
  // 一张都收不下时原库原样返回，界面不会白刷新一轮。
  assert.equal(result.library, library)
})

test('上限没满时新图照收，收满之后多出来的才拒收', () => {
  const library = [asset('avatar', 'a', 1), asset('avatar', 'b', 2)]
  const result = addMediaAssets(library, [asset('avatar', 'c', 3), asset('avatar', 'd', 4)], { maxPerKind: 3 })
  assert.deepEqual(result.added.map(item => item.id), ['c'])
  assert.equal(result.rejected, 1)
  assert.deepEqual(result.library.filter(item => item.kind === 'avatar').map(item => item.id).sort(), ['a', 'b', 'c'])
  // 另一类目有各自独立的额度，不被头像占满牵连。
  assert.equal(addMediaAssets(result.library, [asset('sticker', 'e', 5)], { maxPerKind: 3 }).rejected, 0)
})

test('网格顺序是新上传的排前面，不受使用时间影响', () => {
  const library = [asset('avatar', 'a', 5), asset('avatar', 'b', 8)]
  assert.deepEqual(sortMediaAssets(library).map(item => item.id), ['b', 'a'])
  assert.deepEqual(sortMediaAssets([...library].reverse()).map(item => item.id), ['b', 'a'])
})

test('用过之后会排到快捷条前面，但不动网格顺序', () => {
  const library = [asset('avatar', 'a', 5), asset('avatar', 'b', 8)]
  const touched = touchMediaAsset(library, 'a', new Date(Date.UTC(2026, 8, 20)))
  assert.deepEqual(recentMediaAssets(touched, 'avatar').map(item => item.id), ['a', 'b'])
  assert.deepEqual(sortMediaAssets(touched).map(item => item.id), ['b', 'a'])
  // 找不到的 id 不产生新数组。
  assert.equal(touchMediaAsset(library, 'missing'), library)
})

test('快捷条只挑当前类目，并且尊重条数上限', () => {
  const library = [asset('avatar', 'a', 1), asset('avatar', 'b', 2), asset('sticker', 'c', 3), asset('sticker', 'd', 4)]
  assert.deepEqual(recentMediaAssets(library, 'sticker', 1).map(item => item.id), ['d'])
  assert.deepEqual(recentMediaAssets(library, 'avatar', 5).map(item => item.id), ['b', 'a'])
})

test('改名与删除都不动别的素材', () => {
  const library = [asset('avatar', 'a', 1), asset('avatar', 'b', 2)]
  assert.equal(renameMediaAsset(library, 'a', ' 大客户 ')[0].name, '大客户')
  // 名字清空退回类目名，列表里不会出现空白的一行。
  assert.equal(renameMediaAsset(library, 'a', '   ')[0].name, '头像')
  assert.deepEqual(removeMediaAsset(library, 'a').map(item => item.id), ['b'])
  assert.equal(removeMediaAsset(library, 'missing'), library)
  assert.equal(renameMediaAsset(library, 'missing', 'x'), library)
})

test('批量上传按顺序把头像发给角色，多出来的忽略', () => {
  const users: ChatUser[] = [
    { id: 1, name: '我', avatar: null },
    { id: 2, name: '张三', avatar: png('keep') },
    { id: 3, name: '李四', avatar: null },
  ]
  const result = assignAvatars(users, [asset('avatar', 'one', 1), asset('avatar', 'two', 1)])
  assert.equal(result.assigned, 2)
  assert.equal(result.users[0].avatar, png('one'))
  // 第二位本来就有头像，批量上传是「按顺序覆盖」，这里就是它该拿到的第二张。
  assert.equal(result.users[1].avatar, png('two'))
  assert.equal(result.users[2].avatar, null)
  // 没有素材时原数组原样返回。
  assert.equal(assignAvatars(users, []).users, users)
})

test('按 dataUrl 能找到库里已有的同图，用来复用同一条记录', () => {
  const library = [asset('avatar', 'a', 1)]
  assert.equal(findAssetByDataUrl(library, png('a'))?.id, 'a')
  assert.equal(findAssetByDataUrl(library, png('missing')), null)
})

test('库容量说明按类目给数量与总体积', () => {
  const library = [asset('avatar', 'a', 1), asset('sticker', 'b', 2), asset('sticker', 'c', 3), asset('background', 'd', 4)]
  const summary = mediaLibrarySummary(library)
  assert.deepEqual(summary.counts, { avatar: 1, sticker: 2, background: 1 })
  assert.equal(summary.total, 4)
  assert.match(mediaLibrarySummaryLabel(summary), /^1 个头像 · 2 张表情 · 1 张背景 · /)
  assert.equal(mediaLibrarySummaryLabel(mediaLibrarySummary([])), '还没有素材')
})

test('背景图是独立类目：上限、去重、快捷条都各算各的', () => {
  const library = [asset('background', 'bg-1', 1), asset('background', 'bg-2', 2), asset('avatar', 'a', 3)]
  // 上限按类目单独算：背景满了就不再收新背景，但不会牵连头像。
  const filled = addMediaAssets(library, [asset('background', 'bg-3', 4)], { maxPerKind: 2 })
  assert.equal(filled.rejected, 1)
  assert.equal(filled.library, library)
  assert.equal(addMediaAssets(library, [asset('avatar', 'b', 4)], { maxPerKind: 2 }).rejected, 0)
  // 同一张背景图传第二次只算重复。
  assert.equal(addMediaAssets(library, [asset('background', 'bg-1', 4)]).duplicated, 1)
  // 快捷条只挑背景图，不会混进头像。
  assert.deepEqual(recentMediaAssets(library, 'background').map(item => item.id), ['bg-2', 'bg-1'])
  assert.equal(createMediaAsset({ kind: 'background', dataUrl: png('bg') }).name, '背景图')
  // 读库时认得这一类；认不出的类目仍然照旧丢掉。
  assert.equal(normalizeMediaLibrary([asset('background', 'bg', 1)]).length, 1)
  assert.equal(normalizeMediaLibrary([{ id: 'x', kind: 'cover', dataUrl: png('x') }]).length, 0)
})

test('列表里的单张说明带尺寸和体积，尺寸读不到时只显示体积', () => {
  assert.equal(mediaAssetMeta(asset('avatar', 'a', 1)), '90×90 · 0 B')
  assert.equal(mediaAssetMeta(asset('sticker', 'x'.repeat(48), 1)), '90×90 · 36 B')
  assert.equal(mediaAssetMeta({ ...asset('avatar', 'a', 1), width: 0, height: 0 }), '0 B')
})

test('批量上传的回执把每一项都交代清楚', () => {
  assert.equal(mediaImportSummaryText({ added: 3, duplicated: 0, failed: 0, rejected: 0 }), '已加入 3 张。')
  assert.equal(
    mediaImportSummaryText({ added: 2, duplicated: 1, failed: 1, rejected: 4 }),
    '已加入 2 张；跳过 1 张库里已有的；1 张读取失败；4 张超出每类上限未入库（原素材不会被自动清掉，可先手动删几张再传）。',
  )
  // 全被跳过也不能说「成功」，要说清为什么一张都没进来。
  assert.equal(mediaImportSummaryText({ added: 0, duplicated: 0, failed: 0, rejected: 0 }), '没有可加入的图片。')
})
