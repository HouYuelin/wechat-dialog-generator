import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampPhoneWidth,
  clampScreenSize,
  defaultScreenSize,
  designHeightFor,
  longshotOutputSize,
  maxPhoneWidth,
  maxScreenHeight,
  maxScreenWidth,
  minPhoneWidth,
  minScreenAspect,
  minScreenWidth,
  outputScaleFor,
  phoneAspect,
  phoneDisplayHeight,
  phoneDisplayScale,
  phoneFrameHeight,
  phoneFrameWidth,
  phoneSizeIdLabels,
  phoneSizeLabel,
  phoneSizePreset,
  phoneSizePresets,
  resolvePhoneWidth,
  resolveScreenSize,
  screenOutputSize,
  screenPresetIdFor,
  screenSizeLabel,
  screenSizePreset,
  screenSizePresets,
  type PhoneSizeId,
} from './phone-size'

test('presets are unique, ordered and inside the clamp range', () => {
  const ids = phoneSizePresets.map(item => item.id)
  assert.equal(new Set(ids).size, ids.length, '预设 id 不能重复')
  const widths = phoneSizePresets.map(item => item.width)
  assert.deepEqual(widths, [...widths].sort((a, b) => a - b), '预设按从窄到宽排列')
  for (const preset of phoneSizePresets) {
    assert.equal(clampPhoneWidth(preset.width), preset.width, `${preset.id} 的宽度必须在可用范围内`)
    assert.ok(preset.label.length > 0 && preset.note.length > 0)
  }
  assert.equal(phoneSizePresets.length, 4)
})

test('every size id has a label', () => {
  const ids: PhoneSizeId[] = ['auto', 'small', 'standard', 'large', 'xlarge', 'custom']
  for (const id of ids) assert.ok(phoneSizeIdLabels[id]?.length, `${id} 缺少文案`)
})

test('custom widths are clamped, and a bad value degrades to the minimum', () => {
  assert.equal(clampPhoneWidth(375), 375)
  assert.equal(clampPhoneWidth(99), minPhoneWidth)
  assert.equal(clampPhoneWidth(9999), maxPhoneWidth)
  assert.equal(clampPhoneWidth(320.4), 320)
  assert.equal(clampPhoneWidth(Number.NaN), minPhoneWidth)
  assert.equal(clampPhoneWidth(Number.POSITIVE_INFINITY), maxPhoneWidth)
})

test('auto keeps the measured width so it can always fit the panel', () => {
  // 自适应模式必须原样尊重量出来的宽度，窄面板下不能被最小宽度顶出去。
  assert.equal(resolvePhoneWidth('auto', 400, 268), 268)
  assert.equal(resolvePhoneWidth('auto', 400, 120), 120)
  assert.equal(resolvePhoneWidth('auto', 400, 0), 1)
  assert.equal(resolvePhoneWidth('auto', 400, 375.6), 376)
})

test('fixed presets ignore the auto width, custom honours the typed value', () => {
  assert.equal(resolvePhoneWidth('standard', 600, 268), 375)
  assert.equal(resolvePhoneWidth('xlarge', 600, 268), 500)
  assert.equal(resolvePhoneWidth('custom', 456, 268), 456)
  assert.equal(resolvePhoneWidth('custom', 9999, 268), maxPhoneWidth)
  assert.equal(resolvePhoneWidth('custom', 1, 268), minPhoneWidth)
})

test('an unknown preset id falls back instead of blowing up', () => {
  assert.equal(resolvePhoneWidth('nope' as PhoneSizeId, 420, 300), 420)
})

test('height and scale keep the 1125x2436 aspect ratio', () => {
  assert.equal(phoneDisplayHeight(375), 812)
  assert.equal(phoneDisplayHeight(1125), 2436)
  assert.equal(phoneDisplayHeight(0), 0)
  assert.equal(phoneDisplayScale(375), 1 / 3)
  assert.equal(phoneDisplayScale(1125), 1)
  // 四舍五入不能把比例带偏太多。
  for (const width of [200, 320, 375, 430, 500, 720]) {
    assert.ok(Math.abs(phoneDisplayHeight(width) - width * 2436 / 1125) < 1)
  }
})

test('a preset lookup returns null for unknown ids', () => {
  assert.equal(phoneSizePreset('standard')?.width, 375)
  assert.equal(phoneSizePreset('nope' as never), null)
})

test('labels read naturally for auto, preset and custom', () => {
  assert.equal(phoneSizeLabel('auto', 300), '自适应 300px')
  assert.equal(phoneSizeLabel('standard', 375), '标准 375px')
  assert.equal(phoneSizeLabel('custom', 456), '自定义 456px')
})

/* ============================ 屏幕尺寸 ============================ */

test('screen presets are unique, sorted by width and inside the clamp range', () => {
  const ids = screenSizePresets.map(item => item.id)
  assert.equal(new Set(ids).size, ids.length, '预设 id 不能重复')
  const widths = screenSizePresets.map(item => item.width)
  assert.deepEqual(widths, [...widths].sort((a, b) => a - b), '预设按从窄到宽排列')
  for (const preset of screenSizePresets) {
    const size = { width: preset.width, height: preset.height }
    assert.deepEqual(clampScreenSize(size), size, `${preset.id} 的尺寸必须在可用范围内`)
    assert.ok(preset.label.length > 0 && preset.note.length > 0)
    assert.equal(preset.label, screenSizeLabel(size), `${preset.id} 的文案要和尺寸一致`)
  }
  assert.equal(screenSizePresets.length, 6)
})

test('the default screen is one of the presets, so the popover can select it', () => {
  assert.deepEqual(defaultScreenSize, { width: 1125, height: 2436 })
  assert.equal(screenPresetIdFor(defaultScreenSize), 'iphone-x')
  assert.equal(screenSizePreset('iphone-x')?.height, 2436)
})

test('custom screen sizes are clamped on both axes', () => {
  assert.deepEqual(clampScreenSize({ width: 1170, height: 2532 }), { width: 1170, height: 2532 })
  assert.equal(clampScreenSize({ width: 100, height: 2532 }).width, minScreenWidth)
  assert.equal(clampScreenSize({ width: 9999, height: 2532 }).width, maxScreenWidth)
  assert.equal(clampScreenSize({ width: 1170, height: 100 }).height, Math.ceil(1170 * minScreenAspect))
  assert.equal(clampScreenSize({ width: 1170, height: 99999 }).height, maxScreenHeight)
  assert.equal(clampScreenSize({ width: Number.NaN, height: Number.NaN }).width, minScreenWidth)
  assert.equal(clampScreenSize({ width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY }).width, maxScreenWidth)
})

test('a too-flat screen keeps enough room for the chat area', () => {
  // 上下两条固定栏在内部坐标系里要占 533px，屏幕太扁聊天区就没了。
  const flat = clampScreenSize({ width: 1080, height: 1080 })
  assert.equal(flat.height, Math.ceil(1080 * minScreenAspect))
  assert.ok(designHeightFor(flat) > 1125, '坐标系高度必须大于固定栏之和')
})

test('resolveScreenSize trusts presets and clamps custom values', () => {
  assert.deepEqual(resolveScreenSize('qhd', { width: 1, height: 1 }), { width: 1440, height: 3120 })
  assert.deepEqual(resolveScreenSize('custom', { width: 1000, height: 2200 }), { width: 1000, height: 2200 })
  assert.deepEqual(resolveScreenSize('custom', { width: 10, height: 2200 }), { width: minScreenWidth, height: 2200 })
  assert.deepEqual(resolveScreenSize('nope' as never, { width: 1000, height: 2200 }), { width: 1000, height: 2200 })
})

test('design height and output scale follow the chosen screen', () => {
  assert.equal(designHeightFor(), 2436)
  assert.equal(designHeightFor({ width: 1080, height: 1920 }), 2000)
  assert.equal(designHeightFor({ width: 1080, height: 2340 }), 2438)
  assert.equal(outputScaleFor(), 1)
  assert.equal(outputScaleFor({ width: 1080, height: 1920 }), 0.96)
  assert.equal(outputScaleFor({ width: 1440, height: 3120 }), 1.28)
  // 采样倍率 × 坐标系宽度 = 导出宽度。
  for (const screen of [defaultScreenSize, { width: 1080, height: 1920 }, { width: 1440, height: 3120 }]) {
    assert.equal(Math.round(phoneFrameWidth * outputScaleFor(screen)), screen.width)
  }
})

test('aspect and display height fall back safely on broken input', () => {
  assert.equal(phoneAspect({ width: 0, height: 0 }), phoneFrameHeight / phoneFrameWidth)
  assert.equal(phoneAspect({ width: Number.NaN, height: 2 }), phoneFrameHeight / phoneFrameWidth)
  assert.equal(designHeightFor({ width: 0, height: 0 }), phoneFrameHeight)
  assert.equal(outputScaleFor({ width: 0, height: 0 }), 1)
  assert.equal(screenSizeLabel({ width: 1170, height: 2532 }), '1170×2532')
  // 换成 9:16 屏幕后，同样的显示宽度要按新比例换算高度。
  assert.equal(phoneDisplayHeight(375, { width: 1080, height: 1920 }), 667)
  assert.equal(phoneDisplayHeight(375), 812)
})

test('an exported screenshot is exactly the chosen screen size', () => {
  assert.deepEqual(screenOutputSize(), { width: 1125, height: 2436 })
  for (const preset of screenSizePresets) {
    const screen = { width: preset.width, height: preset.height }
    assert.deepEqual(screenOutputSize(screen), screen, `${preset.id} 导出尺寸必须分毫不差`)
  }
  assert.deepEqual(screenOutputSize({ width: 0, height: Number.NaN }), { width: 1125, height: 2436 })
})

test('a long screenshot keeps the width and scales the content height by the same ratio', () => {
  assert.deepEqual(longshotOutputSize(defaultScreenSize, 10000), { width: 1125, height: 10000 })
  assert.deepEqual(longshotOutputSize({ width: 1080, height: 1920 }, 10000), { width: 1080, height: 9600 })
  assert.deepEqual(longshotOutputSize({ width: 1440, height: 3120 }, 10000), { width: 1440, height: 12800 })
  assert.equal(longshotOutputSize(defaultScreenSize, -5).height, 1)
})
