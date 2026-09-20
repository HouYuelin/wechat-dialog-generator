import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampImageMax,
  defaultImageMax,
  imagePresetIdFor,
  imageSizeLabel,
  imageSizePreset,
  imageSizePresets,
  maxImageMax,
  minImageMax,
  normalizeImageMax,
  resolveImageMax,
} from './image-size'

test('presets ascend and stay inside the selectable range', () => {
  const sizes = imageSizePresets.map(preset => preset.max)
  assert.deepEqual(sizes, [...sizes].sort((left, right) => left - right))
  for (const preset of imageSizePresets) {
    assert.ok(preset.max >= minImageMax && preset.max <= maxImageMax, `${preset.label} 超出可选范围`)
    assert.ok(preset.note.length > 0)
  }
  // 默认档必须真的存在，否则弹层打开时会选不中任何一项。
  assert.ok(sizes.includes(defaultImageMax))
})

test('the largest allowed image still fits inside a bubble', () => {
  // PhonePreview.css：.wc-chat-content 左右各 36px 内边距，.wc-body 的 max-width 是
  // calc(100% - 340px)，所以在 1125 的坐标系里气泡最宽 1125 − 36×2 − 340 = 713px，
  // 再减去 .wc-bubble-image 自己 1px 的双边边框，图片实际可用 711px。
  assert.ok(maxImageMax <= 711, '上限超过气泡可用宽度，图片会被裁掉')
})

test('clamp saturates, rounds, and falls back to the default on NaN', () => {
  assert.equal(clampImageMax(420), 420)
  assert.equal(clampImageMax(456.6), 457)
  assert.equal(clampImageMax(minImageMax - 100), minImageMax)
  assert.equal(clampImageMax(maxImageMax + 5_000), maxImageMax)
  assert.equal(clampImageMax(Number.POSITIVE_INFINITY), maxImageMax)
  assert.equal(clampImageMax(Number.NEGATIVE_INFINITY), minImageMax)
  // 大小不是位置，NaN 退回默认值而不是最小值，否则图片会突然缩得很小。
  assert.equal(clampImageMax(Number.NaN), defaultImageMax)
})

test('normalize keeps old projects and broken share links usable', () => {
  assert.equal(normalizeImageMax(undefined), defaultImageMax)
  assert.equal(normalizeImageMax(null), defaultImageMax)
  assert.equal(normalizeImageMax('540'), defaultImageMax)
  assert.equal(normalizeImageMax(Number.NaN), defaultImageMax)
  assert.equal(normalizeImageMax(540), 540)
  assert.equal(normalizeImageMax(1e9), maxImageMax)
})

test('resolve uses the preset value and only clamps the custom one', () => {
  assert.equal(resolveImageMax('standard', 999), 420)
  assert.equal(resolveImageMax('xlarge', 0), 700)
  assert.equal(resolveImageMax('custom', 500), 500)
  assert.equal(resolveImageMax('custom', 12), minImageMax)
  // 旧草稿里可能存着已经不存在的档位名。
  assert.equal(resolveImageMax('nonsense' as never, 500), defaultImageMax)
})

test('preset lookup round trips and unknown values read as custom', () => {
  for (const preset of imageSizePresets) assert.equal(imagePresetIdFor(preset.max), preset.id)
  assert.equal(imagePresetIdFor(456), 'custom')
  assert.equal(imagePresetIdFor(0), 'custom')
})

test('labels read naturally for preset and custom sizes', () => {
  assert.equal(imageSizeLabel('standard', 420), '标准 420px')
  assert.equal(imageSizeLabel('xlarge', 700), '超大 700px')
  assert.equal(imageSizeLabel('custom', 456), '自定义 456px')
  assert.equal(imageSizePreset('custom'), null)
})
