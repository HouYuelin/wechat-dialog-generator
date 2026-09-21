import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampVideoSidePad,
  defaultVideoSidePad,
  maxVideoSidePad,
  minVideoSidePad,
  normalizeVideoSidePad,
  paddedImageSize,
  resolveVideoSidePad,
  videoContentScreen,
  videoNaturalSideGap,
  videoSidePadIdFor,
  videoSidePadLabel,
  videoSidePadNote,
  videoSidePadPresets,
} from './video-padding'
import { designHeightFor, phoneFrameWidth, type ScreenSize } from './phone-size'

const vertical = { width: 1080, height: 1920 }
const phoneCanvas = { width: 1125, height: 2436 }

test('档位由小到大排列，关闭是 0，标准档就是抖音安全区的推荐值', () => {
  assert.deepEqual(videoSidePadPresets.map(preset => preset.pad), [0, 60, 120, 200])
  assert.equal(videoSidePadPresets[0].id, 'off')
  assert.equal(videoSidePadPresets[0].pad, minVideoSidePad)
  const standard = videoSidePadPresets.find(preset => preset.id === 'standard')
  assert.equal(standard?.pad, defaultVideoSidePad)
  // 推荐值必须真的能挡住平台裁掉的那一段（9:16 在 19.5:9 机型上每侧约 97px）。
  assert.ok(defaultVideoSidePad > 97, '默认留白要大于平台裁切量')
  assert.ok(videoSidePadPresets.every(preset => preset.note.length > 0))
})

test('夹取：NaN 退回默认值（而不是悄悄关掉安全区），超出范围饱和', () => {
  assert.equal(clampVideoSidePad(Number.NaN), defaultVideoSidePad)
  assert.equal(clampVideoSidePad(-50), minVideoSidePad)
  assert.equal(clampVideoSidePad(9999), maxVideoSidePad)
  assert.equal(clampVideoSidePad(77.6), 78)
  assert.equal(clampVideoSidePad(0), 0)
})

test('读回来的值只认数字，其余一律退回默认值', () => {
  assert.equal(normalizeVideoSidePad(undefined), defaultVideoSidePad)
  assert.equal(normalizeVideoSidePad(null), defaultVideoSidePad)
  assert.equal(normalizeVideoSidePad('120'), defaultVideoSidePad)
  assert.equal(normalizeVideoSidePad(Number.NaN), defaultVideoSidePad)
  assert.equal(normalizeVideoSidePad(9999), maxVideoSidePad)
  assert.equal(normalizeVideoSidePad(0), 0)
})

test('预设直接用定义好的值，自定义才夹取传入的当前值', () => {
  assert.equal(resolveVideoSidePad('off', 200), 0)
  assert.equal(resolveVideoSidePad('standard', 0), defaultVideoSidePad)
  assert.equal(resolveVideoSidePad('wide', 0), 200)
  assert.equal(resolveVideoSidePad('custom', 250), 250)
  assert.equal(resolveVideoSidePad('custom', 9999), maxVideoSidePad)
  // 未知档位退回默认值，旧草稿里的脏值不会把导出打挂。
  assert.equal(resolveVideoSidePad('nonsense' as never, 0), defaultVideoSidePad)
})

test('反查档位：命中预设给预设 id，落在档位之间就是自定义', () => {
  assert.equal(videoSidePadIdFor(0), 'off')
  assert.equal(videoSidePadIdFor(120), 'standard')
  assert.equal(videoSidePadIdFor(200), 'wide')
  assert.equal(videoSidePadIdFor(77), 'custom')
  assert.equal(videoSidePadIdFor(Number.NaN), 'standard')
})

test('文案：0 说「不额外留白」，其余写清留多少', () => {
  assert.equal(videoSidePadLabel('off', 0), '不额外留白')
  assert.equal(videoSidePadLabel('standard', 120), '标准 120px')
  assert.equal(videoSidePadLabel('custom', 77), '自定义 77px')
  // 档位与数值不一致时以数值为准（自定义退成 0 也要说成不额外留白）。
  assert.equal(videoSidePadLabel('custom', 0), '不额外留白')
  assert.ok(videoSidePadNote('standard', 120).includes('抖音'))
  assert.ok(videoSidePadNote('custom', 0).length > 0)
  assert.ok(videoSidePadNote('custom', 150).length > 0)
})

test('自然留边：就是「至少 N」的那条线，同比例画布与非法尺寸都是 0', () => {
  // 9:16 画布比手机窄，手机按高度铺满后两侧自然各留约 97px。
  assert.equal(Math.round(videoNaturalSideGap(undefined, vertical)), 97)
  // 画布与手机同比例：不额外留白时正好铺满，自然留边为 0。
  assert.equal(videoNaturalSideGap(undefined, phoneCanvas), 0)
  assert.equal(videoNaturalSideGap(undefined, { width: 0, height: 1920 }), 0)
  assert.equal(videoNaturalSideGap(undefined, { width: 1080, height: Number.NaN }), 0)
})

test('留白没越过自然留边时原样返回：0 与不传这个参数完全一致', () => {
  const screen: ScreenSize = { width: 1125, height: 2436 }
  assert.deepEqual(videoContentScreen(screen, vertical, 0), screen)
  assert.deepEqual(videoContentScreen(screen, vertical, 96), screen)
  assert.deepEqual(videoContentScreen(screen, vertical, Number.NaN), videoContentScreen(screen, vertical, defaultVideoSidePad))
  assert.deepEqual(videoContentScreen(screen, { width: 0, height: 0 }, 200), screen)
})

test('留白越过自然留边时换成「画布去掉两侧留白」的比例：宽度不变，只把高度拉长', () => {
  const screen: ScreenSize = { width: 1125, height: 2436 }
  const content = videoContentScreen(screen, vertical, defaultVideoSidePad)
  // 采样密度跟着宽度走，宽度必须原样保留。
  assert.equal(content.width, screen.width)
  // 比例 = (1080 - 2×120) / 1920，取整偏大，让高度成为卡住的那个约束（上下铺满）。
  assert.equal(content.height, Math.ceil((1125 * 1920) / 840))
  assert.ok(designHeightFor(content) >= (phoneFrameWidth * 1920) / 840, '高度不能取小，否则上下会留缝')
  assert.ok(content.height > screen.height, '只是变高，不会变矮')
  // 满屏画布自然留边是 0，留白一开就必须换比例。
  assert.equal(videoContentScreen(screen, phoneCanvas, defaultVideoSidePad).height, Math.ceil((1125 * 2436) / 885))
})

test('留白越大手机越细长，但永远只会变高：画布比手机还窄也一样', () => {
  const screen: ScreenSize = { width: 1125, height: 2436 }
  let previous = screen.height
  for (const pad of [60, 100, 120, 200, maxVideoSidePad]) {
    const content = videoContentScreen(screen, vertical, pad)
    assert.ok(content.height >= previous, `留白 ${pad} 不该让手机变矮`)
    previous = content.height
  }
  // 画布比手机还窄时本来就有上下空白，留白一开照样按比例铺满。
  const squatCanvas = { width: 1080, height: 2400 }
  const squat = videoContentScreen(screen, squatCanvas, 60)
  assert.equal(squat.height, Math.ceil((1125 * 2400) / 960))
  assert.ok(squat.height > screen.height)
  // 留白比画布一半还宽时没有意义，退回原尺寸，别算出 0 或负数。
  assert.deepEqual(videoContentScreen(screen, { width: 500, height: 1920 }, maxVideoSidePad), screen)
})

test('图片的留白直接加在左右：宽度各加 N，高度与手机比例一个像素都不动', () => {
  const shot = { width: 1125, height: 2436 }
  assert.deepEqual(paddedImageSize(shot, defaultVideoSidePad), { width: 1125 + 240, height: 2436 })
  // 关闭（0）与不传参数完全一致——这就是「图片不受影响」的那条保证。
  assert.deepEqual(paddedImageSize(shot, 0), shot)
  assert.deepEqual(paddedImageSize(shot), shot)
  // 长截图只是高度更大，算法同一条：横向照加，纵向不动。
  assert.deepEqual(paddedImageSize({ width: 1080, height: 9600 }, 60), { width: 1200, height: 9600 })
  // 越界值照旧夹取，不会把画布拉爆。
  assert.equal(paddedImageSize(shot, 9999).width, 1125 + maxVideoSidePad * 2)
  assert.equal(paddedImageSize(shot, -80).width, 1125)
  assert.equal(paddedImageSize(shot, Number.NaN).width, 1125 + defaultVideoSidePad * 2)
  // 尺寸非法时给 0，调用方据此跳过补边，不要建一张 0 宽的画布。
  assert.deepEqual(paddedImageSize({ width: 0, height: 2436 }, 120), { width: 0, height: 0 })
  assert.deepEqual(paddedImageSize({ width: Number.NaN, height: Number.NaN }, 120), { width: 0, height: 0 })
})
