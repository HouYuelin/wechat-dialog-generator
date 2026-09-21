import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fitRect,
  pickVideoMimeType,
  suggestedVideoBitrate,
  videoContainerLabel,
  videoFileExtension,
  videoMimeCandidates,
  videoSizeOption,
  videoSizeOptions,
  videoSizeOptionsFor,
} from './chat-video'
import { defaultScreenSize } from './phone-size'

test('a phone-shaped frame is letterboxed inside the 9:16 canvas without distortion', () => {
  const rect = fitRect(1125, 2436, 1080, 1920)
  assert.equal(rect.height, 1920)
  assert.equal(rect.width, 887)
  assert.equal(rect.y, 0)
  assert.equal(rect.x, 97)
  // 居中允许 1 像素的舍入余量，但不能明显偏左或偏右。
  assert.ok(Math.abs(rect.x * 2 + rect.width - 1080) <= 1)
  assert.ok(rect.width / rect.height < 1125 / 2436 + 0.002 && rect.width / rect.height > 1125 / 2436 - 0.002)
})

test('an identical canvas keeps the frame pixel perfect and centered', () => {
  assert.deepEqual(fitRect(1125, 2436, 1125, 2436), { x: 0, y: 0, width: 1125, height: 2436, scale: 1 })
})

test('a wider target still letterboxes instead of cropping', () => {
  const rect = fitRect(1125, 2436, 1080, 1080)
  assert.equal(rect.height, 1080)
  assert.equal(rect.width, 499)
  assert.equal(rect.y, 0)
  assert.equal(rect.x, 291)
})

test('invalid dimensions degrade to an empty rect instead of NaN', () => {
  const empty = { x: 0, y: 0, width: 0, height: 0, scale: 0 }
  assert.deepEqual(fitRect(0, 2436, 1080, 1920), empty)
  assert.deepEqual(fitRect(1125, 2436, 0, 0), empty)
  assert.deepEqual(fitRect(Number.NaN, 2436, 1080, 1920), empty)
  assert.deepEqual(fitRect(-10, 2436, 1080, 1920), empty)
})

test('a side padding guarantee squeezes the frame inward, keeping the ratio', () => {
  const rect = fitRect(1125, 2436, 1080, 1920, 120)
  assert.equal(rect.width, 840)
  // 两侧各留出的空白正好是设定的像素值。
  assert.equal(rect.x, 120)
  assert.equal(1080 - rect.x - rect.width, 120)
  assert.equal(rect.height, 1819)
  assert.equal(rect.y, 51)
  // 仍然不裁切、不变形。
  assert.ok(rect.width / rect.height < 1125 / 2436 + 0.002 && rect.width / rect.height > 1125 / 2436 - 0.002)
  assert.ok(rect.x + rect.width <= 1080 && rect.width <= 1080 - 120 * 2)
})

test('留白是「至少 N」：比画布本来就会留的边还小时不生效', () => {
  // 9:16 画布下手机画面本来就左右各留 97px，调到它以下不会把画面再放大回去。
  assert.deepEqual(fitRect(1125, 2436, 1080, 1920, 50), fitRect(1125, 2436, 1080, 1920))
  assert.deepEqual(fitRect(1125, 2436, 1080, 1920, 0), fitRect(1125, 2436, 1080, 1920))
  // 非法留白当作 0 处理，不能因此算出 NaN 或负尺寸。
  assert.deepEqual(fitRect(1125, 2436, 1080, 1920, Number.NaN), fitRect(1125, 2436, 1080, 1920))
  assert.deepEqual(fitRect(1125, 2436, 1080, 1920, -200), fitRect(1125, 2436, 1080, 1920))
})

test('满屏画布加留白后仍然是一份合法矩形', () => {
  // 1125×2436 的画布本来就与手机同比例，只有留白这一条会改变画面大小。
  const rect = fitRect(1125, 2436, 1125, 2436, 120)
  assert.equal(rect.width, 885)
  assert.equal(rect.x, 120)
  assert.equal(1125 - rect.x - rect.width, 120)
  assert.ok(rect.height > 0 && rect.height < 2436)
  // 留白大到夸张时也不会把画面压成 0。
  const extreme = fitRect(1125, 2436, 1080, 1920, 99_999)
  assert.ok(extreme.width > 0 && extreme.height > 0)
  assert.ok(Number.isFinite(extreme.x) && Number.isFinite(extreme.y))
})

test('mp4 is preferred and webm is the fallback', () => {
  assert.equal(pickVideoMimeType(() => true), videoMimeCandidates[0])
  assert.ok(pickVideoMimeType(() => true).includes('mp4'))
  assert.equal(pickVideoMimeType(type => type.startsWith('video/webm')), 'video/webm;codecs=vp9,opus')
  assert.equal(pickVideoMimeType(type => type === 'video/webm'), 'video/webm')
  // 老浏览器对个别 codec 串会直接抛错，不能因此中断整条降级链。
  const picky = pickVideoMimeType(type => {
    if (type.includes('mp4')) throw new Error('unsupported')
    return type === 'video/webm'
  })
  assert.equal(picky, 'video/webm')
})

test('no recorder support yields an empty mime type rather than a crash', () => {
  assert.equal(pickVideoMimeType(() => false), '')
  assert.equal(videoFileExtension(''), 'webm')
  assert.equal(videoContainerLabel(''), '视频')
})

test('file extension and container label match the chosen codec', () => {
  assert.equal(videoFileExtension('video/mp4'), 'mp4')
  assert.equal(videoFileExtension('video/webm;codecs=vp8,opus'), 'webm')
  assert.equal(videoContainerLabel('video/mp4;codecs=avc1'), 'MP4')
  assert.equal(videoContainerLabel('video/webm;codecs=vp9,opus'), 'WebM')
})

test('bitrate stays inside a sane range for every canvas size', () => {
  assert.equal(suggestedVideoBitrate(1125, 2436), 8_750_000)
  assert.equal(suggestedVideoBitrate(1080, 1920), 6_750_000)
  assert.equal(suggestedVideoBitrate(100, 100), 3_000_000)
  assert.equal(suggestedVideoBitrate(4000, 4000), 12_000_000)
  assert.equal(suggestedVideoBitrate(Number.NaN, 1920), 3_000_000)
})

test('size options expose the two documented canvases', () => {
  assert.deepEqual(videoSizeOptions.map(option => [option.width, option.height]), [[1080, 1920], [1125, 2436]])
  assert.equal(videoSizeOption('phone').width, 1125)
  // 未知档位回落到第一档，避免旧草稿里的脏值把导出打挂。
  assert.equal(videoSizeOption('nonsense' as never).id, 'vertical')
})

test('the follow-screen canvas tracks the current screen size', () => {
  assert.deepEqual(videoSizeOptionsFor().map(option => option.id), ['vertical', 'phone', 'screen'])
  assert.deepEqual(
    [videoSizeOption('screen').width, videoSizeOption('screen').height],
    [defaultScreenSize.width, defaultScreenSize.height],
  )
  const screen = { width: 1080, height: 1920 }
  const follow = videoSizeOption('screen', screen)
  assert.deepEqual([follow.width, follow.height], [1080, 1920])
  assert.ok(follow.note.includes('1080×1920'), '说明里要写清当前分辨率')
  // 固定档位不受屏幕尺寸影响。
  assert.deepEqual([videoSizeOption('phone', screen).width, videoSizeOption('phone', screen).height], [1125, 2436])
})
