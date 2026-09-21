import test from 'node:test'
import assert from 'node:assert/strict'

import { videoFrameLabel, videoFrameLayout, videoFrameReady } from './video-frame'
import { defaultScreenSize, phoneDisplayHeight } from './phone-size'
import { defaultVideoSidePad, maxVideoSidePad, videoContentScreen } from './video-padding'

const vertical = { width: 1080, height: 1920 }
const phoneCanvas = { width: 1125, height: 2436 }

test('取景框按画布比例给出高，手机铺满上下、只左右留白并居中', () => {
  const layout = videoFrameLayout(340, vertical, defaultScreenSize, defaultVideoSidePad)
  assert.equal(layout.canvasWidth, 340)
  assert.equal(layout.canvasHeight, 604) // 340 / 1080 × 1920
  assert.equal(layout.phoneWidth, 264)
  assert.equal(layout.phoneHeight, layout.canvasHeight)
  assert.equal(layout.sidePadding, 38)
  assert.ok(videoFrameReady(layout))
  // 手机居中：两侧边带加起来正好是画布比手机多出来的那部分。
  assert.equal(layout.canvasWidth - layout.phoneWidth, layout.sidePadding * 2)
})

test('留白生效时上下一定铺满：手机比例换成「画布去掉两侧留白」，而不是整体缩小', () => {
  // 9:16 画布自然留边约 97px，120 已经越过它——换成等比缩小的话上下会各空 50px。
  const padded = videoFrameLayout(340, vertical, defaultScreenSize, defaultVideoSidePad)
  assert.equal(padded.phoneHeight, padded.canvasHeight, '上下不留白')
  // 手机只让出两侧：宽度 = 画布宽 - 2 × 留白（预览像素）。
  assert.equal(340 - padded.sidePadding * 2 - padded.phoneWidth, 0)

  // 满屏画布（与手机同比例）更明显：自然留边为 0，留白一开就必须换比例。
  const phone = videoFrameLayout(285, phoneCanvas, defaultScreenSize, defaultVideoSidePad)
  assert.equal(phone.phoneHeight, phone.canvasHeight)
  assert.ok(phone.phoneWidth < phone.canvasWidth)
})

test('留白越多手机越窄、边带越宽，二者此消彼长；高度始终铺满', () => {
  const none = videoFrameLayout(340, vertical, defaultScreenSize, 0)
  const standard = videoFrameLayout(340, vertical, defaultScreenSize, defaultVideoSidePad)
  const wide = videoFrameLayout(340, vertical, defaultScreenSize, maxVideoSidePad)
  assert.ok(none.phoneWidth > standard.phoneWidth)
  assert.ok(standard.phoneWidth > wide.phoneWidth)
  assert.ok(none.sidePadding < standard.sidePadding)
  assert.ok(standard.sidePadding < wide.sidePadding)
  for (const layout of [none, standard, wide]) {
    assert.ok(layout.phoneWidth <= layout.canvasWidth)
    assert.equal(layout.phoneHeight, layout.canvasHeight, '不管留白多少，上下都不空')
  }
})

test('留白是「至少」：小于画布自然留边时不改变画面', () => {
  // 9:16 画布比手机窄，手机按高度铺满后两侧自然留边换算到输出像素约 97px，60 够不着。
  const none = videoFrameLayout(340, vertical, defaultScreenSize, 0)
  const slim = videoFrameLayout(340, vertical, defaultScreenSize, 60)
  assert.equal(slim.phoneWidth, none.phoneWidth)
  assert.equal(slim.phoneHeight, none.phoneHeight)
  assert.equal(slim.sidePadding, none.sidePadding)
})

test('画布与手机同比例时，留白直接吃掉两侧宽度', () => {
  const none = videoFrameLayout(285, phoneCanvas, defaultScreenSize, 0)
  const padded = videoFrameLayout(285, phoneCanvas, defaultScreenSize, defaultVideoSidePad)
  assert.equal(none.phoneWidth, 285, '不额外留白时手机铺满画布')
  assert.equal(none.phoneHeight, none.canvasHeight)
  assert.equal(none.sidePadding, 0)
  assert.ok(padded.phoneWidth < none.phoneWidth)
  assert.equal(padded.phoneHeight, padded.canvasHeight, '留白只吃宽度，上下仍然铺满')
  assert.equal(padded.sidePadding, Math.round(defaultVideoSidePad * (285 / phoneCanvas.width)))
})

test('屏幕尺寸换了，手机在画布里的比例跟着换', () => {
  const tall = videoFrameLayout(300, vertical, { width: 1080, height: 2340 }, 0)
  const squat = videoFrameLayout(300, vertical, { width: 1080, height: 1280 }, 0)
  // 扁屏幕按宽度铺满画布，竖长屏幕按高度铺满，两侧留边更宽。
  assert.equal(squat.phoneWidth, 300)
  assert.equal(squat.sidePadding, 0)
  assert.ok(squat.phoneHeight < tall.phoneHeight)
  assert.ok(tall.phoneWidth < 300)
})

test('非法尺寸不抛错，全部退回 0，预览那边据此不画', () => {
  const blank = { canvasWidth: 0, canvasHeight: 0, phoneWidth: 0, phoneHeight: 0, sidePadding: 0, scale: 0 }
  const cases = [
    videoFrameLayout(0, vertical),
    videoFrameLayout(340, { width: 0, height: 1920 }),
    videoFrameLayout(340, null),
    videoFrameLayout(Number.NaN, vertical),
    videoFrameLayout(340, { width: Number.NaN, height: Number.NaN }),
  ]
  for (const layout of cases) {
    assert.deepEqual(layout, blank)
    assert.equal(videoFrameReady(layout), false)
  }
})

test('说明文案带上画布尺寸与留白值', () => {
  assert.equal(videoFrameLabel(vertical, 120), '视频取景框 1080×1920 · 两侧各留 120px')
  assert.equal(videoFrameLabel(vertical, 0), '视频取景框 1080×1920 · 不额外留白')
  assert.equal(videoFrameLabel(vertical, 9999), `视频取景框 1080×1920 · 两侧各留 ${maxVideoSidePad}px`)
})

test('预览里手机容器的高度必须按「成片那一份屏幕尺寸」换算，否则上下会各空一块', () => {
  // 预览那边用 phoneDisplayHeight(手机宽, 屏幕尺寸) 定容器高度。这里盯住这两件事必须同源：
  // 容器高度用的屏幕尺寸 = 录制时用的（videoContentScreen），手机宽 = 取景框算出来的。
  // 只有留白真的越过自然留边（9:16 下 97px）时才有内容比例可换，所以从 120 起测。
  for (const pad of [defaultVideoSidePad, 200, maxVideoSidePad]) {
    const layout = videoFrameLayout(340, vertical, defaultScreenSize, pad)
    const content = videoContentScreen(defaultScreenSize, vertical, pad)
    const container = phoneDisplayHeight(layout.phoneWidth, content)
    // 1080 宽的画布缩到 340px 显示，取整误差最多 1px；要紧的是别差出一大截。
    assert.ok(Math.abs(container - layout.canvasHeight) <= 1, `留白 ${pad}：容器该和取景框等高，手机才铺满上下`)
    // 拿原始屏幕尺寸去换算就会矮一大截 —— 那正是「怎么还是四周留白」的原因。
    assert.ok(
      layout.canvasHeight - phoneDisplayHeight(layout.phoneWidth, defaultScreenSize) >= 30,
      `留白 ${pad}：按原始屏幕换算会矮一大截`,
    )
  }
  // 9:16 画布 + 120：手机 264 宽、取景框 604 高，两处算出来必须都是 604。
  const layout = videoFrameLayout(340, vertical, defaultScreenSize, defaultVideoSidePad)
  assert.equal(phoneDisplayHeight(layout.phoneWidth, videoContentScreen(defaultScreenSize, vertical, defaultVideoSidePad)), 604)
})
