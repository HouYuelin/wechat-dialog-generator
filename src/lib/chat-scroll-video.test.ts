import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampScrollDurationSeconds,
  defaultScrollDurationSeconds,
  estimatedScrollImageHeight,
  maxScrollDurationSeconds,
  maxScrollImageHeight,
  minScrollDurationSeconds,
  scrollEase,
  scrollImageTooTallMessage,
  scrollOffsetAt,
  scrollPlanLabel,
  scrollProgressAt,
  scrollVideoLayout,
  scrollVideoPlan,
} from './chat-scroll-video'

const defaultScreen = { width: 1125, height: 2436 }

test('时长被夹进可用区间，非法值退回默认档', () => {
  assert.equal(clampScrollDurationSeconds(1), minScrollDurationSeconds)
  assert.equal(clampScrollDurationSeconds(999), maxScrollDurationSeconds)
  assert.equal(clampScrollDurationSeconds(12.4), 12)
  assert.equal(clampScrollDurationSeconds(Number.NaN), defaultScrollDurationSeconds)
  assert.equal(clampScrollDurationSeconds(Number.POSITIVE_INFINITY), maxScrollDurationSeconds)
})

test('三段时长之和恒等于用户设定的总时长', () => {
  // 界面写「15 秒」，导出的视频就该是 15 秒，不能变成「15 秒 + 结尾停留」。
  for (const seconds of [3, 5, 15, 32, 60]) {
    const plan = scrollVideoPlan(seconds * 1000)
    assert.equal(plan.durationMs, seconds * 1000)
    assert.equal(plan.leadInMs + plan.scrollMs + plan.holdMs, plan.durationMs, `${seconds} 秒`)
    assert.ok(plan.leadInMs >= 250 && plan.leadInMs <= 800, `${seconds} 秒的开头静止落在区间内`)
    assert.ok(plan.holdMs >= 400 && plan.holdMs <= 1500, `${seconds} 秒的结尾停留落在区间内`)
    assert.ok(plan.scrollMs > 0)
  }
})

test('最短与最长两端的拆分不会把时间都花在停留上', () => {
  const shortest = scrollVideoPlan(3000)
  // 3 秒的视频里，滚动仍占七成以上。
  assert.ok(shortest.scrollMs / shortest.durationMs > 0.7)
  const longest = scrollVideoPlan(60000)
  assert.equal(longest.leadInMs, 800)
  assert.equal(longest.holdMs, 1500)
  assert.equal(longest.scrollMs, 57700)
})

test('缓动在两端精确取到 0 与 1，中点为 0.5', () => {
  assert.equal(scrollEase(0), 0)
  assert.equal(scrollEase(1), 1)
  assert.equal(scrollEase(0.5), 0.5)
  // 越界与非法值都夹回 [0,1]，不会把长图拖到画面外。
  assert.equal(scrollEase(-3), 0)
  assert.equal(scrollEase(4), 1)
  assert.equal(scrollEase(Number.NaN), 0)
})

test('滚动进度：开头静止、结尾到底、中途单调不减', () => {
  const plan = scrollVideoPlan(15000)
  assert.equal(plan.leadInMs, 800)
  assert.equal(scrollProgressAt(0, plan), 0)
  assert.equal(scrollProgressAt(799, plan), 0)
  // 刚过静置时刻仍接近 0：缓入段不快。
  assert.ok(scrollProgressAt(plan.leadInMs + 100, plan) < 0.02)
  assert.ok(Math.abs(scrollProgressAt(plan.leadInMs + plan.scrollMs / 2, plan) - 0.5) < 1e-9)
  assert.equal(scrollProgressAt(plan.leadInMs + plan.scrollMs, plan), 1)
  assert.equal(scrollProgressAt(999999, plan), 1)
  let previous = -1
  for (let t = 0; t <= plan.durationMs; t += 250) {
    const current = scrollProgressAt(t, plan)
    assert.ok(current >= previous, `t=${t} 时进度不该回退`)
    previous = current
  }
})

test('滚动偏移取整并夹在可滚范围内', () => {
  const plan = scrollVideoPlan(15000)
  const mid = plan.leadInMs + plan.scrollMs / 2
  assert.equal(scrollOffsetAt(mid, plan, 5000), 2500)
  assert.equal(scrollOffsetAt(0, plan, 5000), 0)
  assert.equal(scrollOffsetAt(plan.durationMs, plan, 5000), 5000)
  // 取整是有意的：整数偏移不会让长图被重新采样，文字边缘才干净。
  assert.equal(Number.isInteger(scrollOffsetAt(mid + 1, plan, 3333)), true)
  // 没有可滚范围（内容不足一屏）时画面完全静止，而不是算出负数或 NaN。
  assert.equal(scrollOffsetAt(mid, plan, 0), 0)
  assert.equal(scrollOffsetAt(mid, plan, -100), 0)
  assert.equal(scrollOffsetAt(mid, plan, Number.NaN), 0)
})

test('长图切分：聊天区露出的高度就是屏幕减去顶栏与底栏', () => {
  const layout = scrollVideoLayout(
    { width: 1125, height: 20000 },
    { top: 264, bottom: 269 },
    { width: 1125, height: 2436 },
  )
  assert.equal(layout.bodySourceHeight, 20000 - 264 - 269)
  assert.equal(layout.bodyViewportHeight, 2436 - 264 - 269)
  assert.equal(layout.maxOffset, layout.bodySourceHeight - layout.bodyViewportHeight)
})

test('内容不足一屏时没有可滚范围，也不会算出负高度', () => {
  const oneScreen = scrollVideoLayout({ width: 1125, height: 2436 }, { top: 264, bottom: 269 }, { width: 1125, height: 2436 })
  assert.equal(oneScreen.maxOffset, 0)

  // 长图比一屏还短：聊天区可读高度不能超过它在图里的高度。
  const shorter = scrollVideoLayout({ width: 1125, height: 2000 }, { top: 264, bottom: 269 }, { width: 1125, height: 2436 })
  assert.equal(shorter.bodySourceHeight, 2000 - 264 - 269)
  assert.equal(shorter.maxOffset, 0)

  // 顶栏比整张图还高：一律夹到 0 高度，不能出现负值。
  const tiny = scrollVideoLayout({ width: 1125, height: 100 }, { top: 264, bottom: 269 }, { width: 1125, height: 2436 })
  assert.equal(tiny.topChromeHeight, 100)
  assert.equal(tiny.bottomChromeHeight, 0)
  assert.equal(tiny.bodySourceHeight, 0)
  assert.equal(tiny.maxOffset, 0)
})

test('切分函数的非法输入退化成 0 而不是 NaN', () => {
  const layout = scrollVideoLayout(
    { width: Number.NaN, height: Number.NaN },
    { top: Number.NaN, bottom: Number.NaN },
    { width: Number.NaN, height: Number.NaN },
  )
  assert.deepEqual(layout, {
    imageWidth: 0,
    imageHeight: 0,
    topChromeHeight: 0,
    bottomChromeHeight: 0,
    bodyViewportHeight: 0,
    bodySourceHeight: 0,
    maxOffset: 0,
  })
})

test('长图高度估算与长截图用同一套换算', () => {
  // 内部坐标 20000 高，在默认屏幕（1125 宽）下 1:1。
  assert.equal(estimatedScrollImageHeight(20000, defaultScreen), 20000)
  // 1080 宽时倍率 0.96，同样的内容占用更少像素——所以调小屏幕尺寸能装下更长的对话。
  assert.equal(estimatedScrollImageHeight(20000, { width: 1080, height: 1920 }), 19200)
  assert.equal(estimatedScrollImageHeight(Number.NaN, defaultScreen), 0)
  assert.equal(estimatedScrollImageHeight(-5, defaultScreen), 0)
})

test('内容过高时的提示说清超了多少，并给出两条出路', () => {
  const message = scrollImageTooTallMessage(19200, { width: 1080, height: 1920 })
  assert.ok(message.includes('19200'), '要报出实际估算高度')
  assert.ok(message.includes(String(maxScrollImageHeight)), '要说明上限是多少')
  assert.ok(message.includes('删掉一些消息'), '要给出减少内容的出路')
  assert.ok(message.includes('1080×1920'), '要提到当前屏幕尺寸')
  // 1080 宽下 16000 / 0.96 = 16666 像素的内部坐标内容能装下。
  assert.ok(message.includes('16666'), '要给出当前分辨率下的可容纳高度')
})

test('时长说明把三段都讲清楚', () => {
  const label = scrollPlanLabel(scrollVideoPlan(15000))
  assert.ok(label.startsWith('视频共 15 秒：'))
  assert.ok(label.includes('开头静止 0.8 秒'))
  assert.ok(label.includes('中间 12.7 秒滚动'))
  assert.ok(label.includes('最后 1.5 秒停在底部'))
  // 整数秒不带多余的 .0。
  assert.ok(!label.includes('15.0'))
})
