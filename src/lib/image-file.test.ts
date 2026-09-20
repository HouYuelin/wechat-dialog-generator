import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeMimeType, isImageFile, mediaImageMaxSide, needsReencode, readImageFile, scaledImageSize, shouldKeepOriginal } from './image-file'

const file = (name: string, type: string) => ({ name, type }) as File

test('等比缩放到最长边以内，只缩不放', () => {
  assert.deepEqual(scaledImageSize(4000, 3000), { width: 1280, height: 960 })
  // 竖图按高算最长边。
  assert.deepEqual(scaledImageSize(3000, 4000), { width: 960, height: 1280 })
  // 本来就够小就原样返回，不做无意义的放大。
  assert.deepEqual(scaledImageSize(800, 600), { width: 800, height: 600 })
  assert.deepEqual(scaledImageSize(1280, 300), { width: 1280, height: 300 })
})

test('宽高不可信时返回 0×0，让调用方退回原图', () => {
  assert.deepEqual(scaledImageSize(0, 100), { width: 0, height: 0 })
  assert.deepEqual(scaledImageSize(100, -5), { width: 0, height: 0 })
  assert.deepEqual(scaledImageSize(Number.NaN, Number.NaN), { width: 0, height: 0 })
  assert.deepEqual(scaledImageSize(100.4, 200.6), { width: 100, height: 201 })
})

test('够小且不胖的图不重编码', () => {
  const tiny = 'data:image/png;base64,AAAA'
  assert.equal(needsReencode(800, 600, tiny), false)
  // 尺寸超标要压。
  assert.equal(needsReencode(2000, 1000, tiny), true)
  // 尺寸没超但体积偏大也要压一次。
  assert.equal(needsReencode(800, 600, `data:image/png;base64,${'A'.repeat(900000)}`), true)
  // 尺寸读不出来时不压，避免拿半个尺寸算出怪结果。
  assert.equal(needsReencode(0, 0, tiny), false)
})

test('动图和矢量图原样保留，其余按原格式或 jpeg 编码', () => {
  assert.equal(shouldKeepOriginal('image/gif'), true)
  assert.equal(shouldKeepOriginal('image/svg+xml'), true)
  assert.equal(shouldKeepOriginal('image/png'), false)
  assert.equal(encodeMimeType('image/png'), 'image/png')
  assert.equal(encodeMimeType('image/webp'), 'image/webp')
  assert.equal(encodeMimeType('image/bmp'), 'image/jpeg')
  assert.equal(encodeMimeType(''), 'image/jpeg')
})

test('只认图片文件，拖进来的任何东西都要先筛一遍', () => {
  assert.equal(isImageFile(file('a.png', 'image/png')), true)
  // 有些系统给不出 mime，退回看扩展名。
  assert.equal(isImageFile(file('photo.JPEG', '')), true)
  assert.equal(isImageFile(file('note.txt', 'text/plain')), false)
  assert.equal(isImageFile(file('archive.zip', 'application/zip')), false)
})

test('环境不支持解码时以失败告终，由调用方决定怎么提示', async () => {
  // node 里没有 Image / canvas，这个用例只钉住「读不出来要抛错」这条契约：
  // 调用方靠它统计失败张数，不能静默返回空图。
  await assert.rejects(() => readImageFile(new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' })))
  assert.equal(mediaImageMaxSide, 1280)
})
