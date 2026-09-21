import test from 'node:test'
import assert from 'node:assert/strict'
import { batchVideoDurationMs, batchVideoEstimateMs, batchVideoPlan, batchVideoTask, frameRenderCostMs, scrollRenderCostMs, type BatchVideoChoice } from './batch-video'
import { buildPlaybackTimeline, defaultPaceMs, maxPaceMs, minPaceMs, notifyEvents } from './chat-playback'
import { scrollVideoPlan } from './chat-scroll-video'
import { videoSizeOption } from './chat-video'
import { defaultVideoSidePad, maxVideoSidePad } from './video-padding'
import { defaultScreenSize } from './phone-size'
import type { ChatMessage } from '../types'

const chat = (...senders: number[]): Pick<ChatMessage, 'type' | 'senderId'>[] =>
  senders.map(senderId => ({ type: 'text' as const, senderId }))

const choice = (patch: Partial<BatchVideoChoice> = {}): BatchVideoChoice => ({
  mode: 'flip',
  sizeId: 'vertical',
  paceMs: 1500,
  soundEnabled: true,
  soundReceive: true,
  soundSend: false,
  scrollDurationSeconds: 15,
  sidePad: 0,
  ...patch,
})

test('画面尺寸按屏幕尺寸现算：固定档不看屏幕，「跟随屏幕」跟着屏幕走', () => {
  const screen = { width: 1080, height: 1920 }
  assert.equal(batchVideoPlan(choice({ sizeId: 'vertical' }), screen).size.width, 1080)
  assert.equal(batchVideoPlan(choice({ sizeId: 'vertical' }), screen).size.height, 1920)

  const follow = batchVideoPlan(choice({ sizeId: 'screen' }), screen).size
  assert.equal(follow.width, 1080)
  assert.equal(follow.height, 1920)
  assert.equal(follow.id, 'screen')
  assert.deepEqual(videoSizeOption('screen', screen), follow, '与聊天页取到的是同一档')

  const fallback = batchVideoPlan(choice({ sizeId: 'screen' })).size
  assert.equal(fallback.width, defaultScreenSize.width, '不传屏幕就用默认屏幕')
  assert.equal(fallback.height, defaultScreenSize.height)
})

test('滚动时长与聊天页同一套规划，秒数换算成毫秒', () => {
  const plan = batchVideoPlan(choice({ mode: 'scroll', scrollDurationSeconds: 30 }))
  assert.deepEqual(plan.scroll, scrollVideoPlan(30_000))
  assert.equal(plan.scroll.durationMs, 30_000)
})

test('两侧留白整批共用一份，落到录制方案里还会再夹一次', () => {
  assert.equal(batchVideoPlan(choice({ sidePad: 0 })).sidePad, 0)
  assert.equal(batchVideoPlan(choice({ sidePad: 120 })).sidePad, 120)
  // 脏值（手改存储、旧数据）不会把画面挤出画布。
  assert.equal(batchVideoPlan(choice({ sidePad: 99_999 })).sidePad, maxVideoSidePad)
  assert.equal(batchVideoPlan(choice({ sidePad: Number.NaN })).sidePad, defaultVideoSidePad)
  assert.equal(batchVideoPlan(choice({ sidePad: -80 })).sidePad, 0)
})

test('逐条播放的间隔整批只有统一一档，落到录制方案里还会再夹一次', () => {
  assert.equal(batchVideoPlan(choice({ paceMs: 800 })).paceMs, 800)
  assert.equal(batchVideoPlan(choice({ paceMs: 100 })).paceMs, minPaceMs, '比下限还密的值夹回下限')
  assert.equal(batchVideoPlan(choice({ paceMs: 99_999 })).paceMs, maxPaceMs)
  assert.equal(batchVideoPlan(choice({ paceMs: Number.NaN })).paceMs, defaultPaceMs)
  // 整批没有逐条间隔这回事：每条消息之间就是同一个值。
  const task = batchVideoTask(chat(1, 2, 1), batchVideoPlan(choice({ paceMs: 800 })), 1)
  assert.deepEqual(task.timeline!.steps.map(step => step.atMs), [1200, 2000, 2800])
})

test('逐条模式：时间轴、时长与提示音都由同一个方案算出来', () => {
  const plan = batchVideoPlan(choice())
  const messages = chat(1, 2, 1)
  const task = batchVideoTask(messages, plan, 1)
  const timeline = buildPlaybackTimeline(messages, { paceMs: 1500, selfId: 1, notifyReceived: true, notifySent: false })

  assert.deepEqual(task.timeline, timeline)
  assert.equal(task.totalMs, timeline.totalMs, '视频时长就是时间轴总长')
  assert.equal(task.totalMs, task.timeline!.totalMs)
  assert.equal(task.messageCount, 3)
  assert.deepEqual(task.notifyAt, notifyEvents(timeline))
  assert.deepEqual(task.notifyAt.map(event => event.kind), ['received'], '自己发的那条不发声')
  assert.equal(task.estimateMs, timeline.totalMs + 4 * frameRenderCostMs)
})

test('关掉提示音总开关就整段无声，关掉某一边只影响那一边', () => {
  const messages = chat(1, 2, 1, 2)
  const off = batchVideoTask(messages, batchVideoPlan(choice({ soundEnabled: false })), 1)
  assert.deepEqual(off.notifyAt, [])
  assert.ok(off.timeline, '不发声不影响时间轴，节奏照旧')

  const both = batchVideoTask(messages, batchVideoPlan(choice({ soundSend: true })), 1)
  assert.deepEqual(both.notifyAt.map(event => event.kind), ['sent', 'received', 'sent', 'received'])

  const sentOnly = batchVideoTask(messages, batchVideoPlan(choice({ soundReceive: false, soundSend: true })), 1)
  assert.deepEqual(sentOnly.notifyAt.map(event => event.kind), ['sent', 'sent'])
})

test('滚动模式不用时间轴，整段无声，时长就是用户设的那个数', () => {
  const plan = batchVideoPlan(choice({ mode: 'scroll', scrollDurationSeconds: 8 }))
  const task = batchVideoTask(chat(1, 2), plan, 1)
  assert.equal(task.timeline, null)
  assert.deepEqual(task.notifyAt, [], '滚动模式没有「收到消息」这一刻')
  assert.equal(task.totalMs, 8000)
  assert.equal(task.estimateMs, 8000 + scrollRenderCostMs)
  assert.equal(task.messageCount, 2)
})

test('整批的耗时会与时长都是逐组相加', () => {
  const plan = batchVideoPlan(choice())
  const tasks = [batchVideoTask(chat(1, 2), plan, 1), batchVideoTask(chat(1, 2, 2), plan, 1)]
  assert.equal(batchVideoEstimateMs(tasks), tasks[0].estimateMs + tasks[1].estimateMs)
  assert.equal(batchVideoDurationMs(tasks), tasks[0].totalMs + tasks[1].totalMs)
  assert.equal(batchVideoEstimateMs([]), 0)
  assert.equal(batchVideoDurationMs([]), 0)
})
