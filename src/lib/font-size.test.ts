import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bubbleInsetPx,
  bubbleMaxWidth,
  clampFontScale,
  defaultFontScale,
  fontScaleIdFor,
  fontScaleLabel,
  fontScalePreset,
  fontScalePresets,
  fontScaleRatio,
  maxFontScale,
  minFontScale,
  normalizeFontScale,
  resolveFontScale,
} from './font-size'

test('presets ascend and stay inside the selectable range', () => {
  const scales = fontScalePresets.map(preset => preset.scale)
  assert.deepEqual(scales, [...scales].sort((left, right) => left - right))
  for (const preset of fontScalePresets) {
    assert.ok(preset.scale >= minFontScale && preset.scale <= maxFontScale, `${preset.label} 超出可选范围`)
    assert.ok(preset.note.length > 0)
  }
  // 默认档必须真的存在，否则弹层打开时会选不中任何一项。
  assert.ok(scales.includes(defaultFontScale))
})

test('a smaller scale really means more messages per screen', () => {
  // 每段消息占的高度由字号、行高与内边距决定，三者乘的是同一个系数，
  // 所以「紧凑」档下同一条消息只占标准档的八成高。
  assert.equal(fontScaleRatio(80) / fontScaleRatio(100), 0.8)
  assert.equal(fontScaleRatio(130), 1.3)
  assert.ok(fontScaleRatio(80) < fontScaleRatio(100))
  assert.ok(fontScaleRatio(130) > fontScaleRatio(100))
})

test('bubble width shrinks as the font grows', () => {
  // 与 PhonePreview.css 的 --wc-body-max 同式：100% 时 1125 − 412 = 713，
  // 正是 image-size.ts 里图片上限 700 所依托的那个宽度。
  assert.equal(bubbleInsetPx, 412)
  assert.equal(bubbleMaxWidth(100), 713)
  assert.ok(bubbleMaxWidth(140) < bubbleMaxWidth(100))
  assert.ok(bubbleMaxWidth(70) > bubbleMaxWidth(100))
  // 放大到极限时仍要留出正数宽度，否则红包和图片会被挤成一条。
  assert.ok(bubbleMaxWidth(maxFontScale) > 400)
})

test('clamp saturates, rounds, and falls back to the default on NaN', () => {
  assert.equal(clampFontScale(100), 100)
  assert.equal(clampFontScale(96.4), 96)
  assert.equal(clampFontScale(minFontScale - 50), minFontScale)
  assert.equal(clampFontScale(maxFontScale + 500), maxFontScale)
  assert.equal(clampFontScale(Number.POSITIVE_INFINITY), maxFontScale)
  assert.equal(clampFontScale(Number.NEGATIVE_INFINITY), minFontScale)
  // 大小不是位置，NaN 退回默认值而不是最小值，否则字会突然小到看不清。
  assert.equal(clampFontScale(Number.NaN), defaultFontScale)
})

test('normalize keeps old projects and broken share links usable', () => {
  assert.equal(normalizeFontScale(undefined), defaultFontScale)
  assert.equal(normalizeFontScale(null), defaultFontScale)
  assert.equal(normalizeFontScale('90'), defaultFontScale)
  assert.equal(normalizeFontScale(Number.NaN), defaultFontScale)
  assert.equal(normalizeFontScale(90), 90)
  assert.equal(normalizeFontScale(1e9), maxFontScale)
})

test('ratio always stays inside the clamped range', () => {
  // 传给 CSS 的是比例，越界值必须先夹住，否则 --wc-font-scale 会把布局撑破。
  assert.equal(fontScaleRatio(9999), maxFontScale / 100)
  assert.equal(fontScaleRatio(Number.NaN), defaultFontScale / 100)
})

test('resolve uses the preset value and only clamps the custom one', () => {
  assert.equal(resolveFontScale('standard', 20), 100)
  assert.equal(resolveFontScale('compact', 500), 80)
  assert.equal(resolveFontScale('custom', 95), 95)
  assert.equal(resolveFontScale('custom', 2), minFontScale)
  // 旧草稿里可能存着已经不存在的档位名。
  assert.equal(resolveFontScale('nonsense' as never, 95), defaultFontScale)
})

test('preset lookup round trips and unknown values read as custom', () => {
  for (const preset of fontScalePresets) assert.equal(fontScaleIdFor(preset.scale), preset.id)
  assert.equal(fontScaleIdFor(96), 'custom')
  assert.equal(fontScaleIdFor(0), 'custom')
})

test('labels read naturally for preset and custom scales', () => {
  assert.equal(fontScaleLabel('standard', 100), '标准 100%')
  assert.equal(fontScaleLabel('compact', 80), '紧凑 80%')
  assert.equal(fontScaleLabel('custom', 95), '自定义 95%')
  assert.equal(fontScalePreset('custom'), null)
})
