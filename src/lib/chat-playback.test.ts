import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPlaybackTimeline,
  frameIndexAt,
  notifyEvents,
  playbackDurationSeconds,
  playbackPaceDuration,
  playbackTailMs,
  shouldPlayNotify,
  type PlaybackTimeline,
} from './chat-playback'

const message = (type: 'text' | 'time', senderId: number) => ({ type, senderId })

test('timeline staggers every message from the lead-in and keeps a tail', () => {
  const timeline = buildPlaybackTimeline([message('text', 1), message('text', 2), message('text', 1)], { paceMs: 1000 })
  assert.deepEqual(timeline.steps.map(step => step.atMs), [1200, 2200, 3200])
  assert.deepEqual(timeline.frameAtMs, [0, 1200, 2200, 3200])
  assert.equal(timeline.totalMs, 3200 + playbackTailMs)
  assert.equal(timeline.messageCount, 3)
  // 结尾那一帧要停够 3 秒：导出视频靠它收尾，手动录屏也靠它留出按停止键的余量。
  assert.equal(playbackTailMs, 3000)
})

test('an empty conversation still has one blank frame', () => {
  const timeline = buildPlaybackTimeline([])
  assert.deepEqual(timeline.frameAtMs, [0])
  assert.equal(timeline.steps.length, 0)
  assert.equal(timeline.totalMs, 1200 + playbackTailMs)
  assert.equal(frameIndexAt(timeline.frameAtMs, 9999), 0)
})

test('notification kind follows self, the two toggles and time notices', () => {
  // 默认只响接收那一声，发送音效要显式打开。
  assert.equal(shouldPlayNotify(message('text', 2), 1), 'received')
  assert.equal(shouldPlayNotify(message('text', 1), 1), null)
  assert.equal(shouldPlayNotify(message('text', 1), 1, { notifySent: true }), 'sent')
  assert.equal(shouldPlayNotify(message('text', 2), 1, { notifySent: true }), 'received')
  // 关掉接收音后只剩自己发出的那一声。
  assert.equal(shouldPlayNotify(message('text', 2), 1, { notifyReceived: false, notifySent: true }), null)
  assert.equal(shouldPlayNotify(message('text', 1), 1, { notifyReceived: false, notifySent: true }), 'sent')
  // 两个开关都关就没有任何音效。
  assert.equal(shouldPlayNotify(message('text', 2), 1, { notifyReceived: false, notifySent: false }), null)
  // 时间分隔条永远不发声。
  assert.equal(shouldPlayNotify(message('time', 2), 1, { notifyReceived: true, notifySent: true }), null)
  // 未指定「我」的身份时无法判断方向，保守地按收到消息处理。
  assert.equal(shouldPlayNotify(message('text', 2), null), 'received')
})

test('notify events line up with the frame changes of the messages that make the sound', () => {
  const timeline = buildPlaybackTimeline([message('text', 1), message('text', 2), message('time', 2), message('text', 2)], { paceMs: 1000, selfId: 1 })
  assert.deepEqual(notifyEvents(timeline), [{ atMs: 2200, kind: 'received' }, { atMs: 4200, kind: 'received' }])
  assert.deepEqual(timeline.steps.map(step => step.notify), [null, 'received', null, 'received'])
})

test('the outgoing sound is a different kind and only fires when enabled', () => {
  const messages = [message('text', 2), message('text', 1), message('text', 2)]
  const silent = buildPlaybackTimeline(messages, { paceMs: 1000, selfId: 1 })
  assert.deepEqual(silent.steps.map(step => step.notify), ['received', null, 'received'])
  const both = buildPlaybackTimeline(messages, { paceMs: 1000, selfId: 1, notifySent: true })
  assert.deepEqual(both.steps.map(step => step.notify), ['received', 'sent', 'received'])
  assert.deepEqual(notifyEvents(both), [
    { atMs: 1200, kind: 'received' },
    { atMs: 2200, kind: 'sent' },
    { atMs: 3200, kind: 'received' },
  ])
})

test('frame lookup is monotonic, clamps both ends and survives the tail', () => {
  const timeline = buildPlaybackTimeline([message('text', 1), message('text', 2)], { paceMs: 1000 })
  assert.deepEqual([-500, 0, 1199, 1200, 2199, 2200, 99999].map(ms => frameIndexAt(timeline.frameAtMs, ms)), [0, 0, 0, 1, 1, 2, 2])
  // 最后一帧在整段留白里都保持可见，不会提前收尾。
  const lastIndex = timeline.frameAtMs.length - 1
  assert.equal(frameIndexAt(timeline.frameAtMs, timeline.totalMs), lastIndex)
  assert.equal(frameIndexAt(timeline.frameAtMs, timeline.totalMs - playbackTailMs + 1), lastIndex)
  assert.equal(frameIndexAt([], 1000), 0)
  assert.equal(frameIndexAt(timeline.frameAtMs, Number.NaN), 0)
})

test('the tail can be overridden without touching the default', () => {
  // 1 条消息：1200 的首帧静置 + 500 的结尾留白。
  const timeline = buildPlaybackTimeline([message('text', 1)], { paceMs: 1000, tailMs: 500 })
  assert.equal(timeline.totalMs, 1700)
  assert.equal(playbackTailMs, 3000)
})

test('pace is clamped so a bad value cannot spin the preview too fast', () => {
  assert.equal(playbackPaceDuration('fast'), 800)
  assert.equal(playbackPaceDuration('normal'), 1500)
  assert.equal(playbackPaceDuration('slow'), 2500)
  assert.equal(playbackPaceDuration('normal', 10), 200)
  assert.equal(playbackPaceDuration('normal', 640), 640)
  assert.equal(playbackPaceDuration('normal', Number.NaN), 1500)
})

test('duration label rounds up to the next half second', () => {
  assert.equal(playbackDurationSeconds(0), 0)
  assert.equal(playbackDurationSeconds(1400), 1.5)
  assert.equal(playbackDurationSeconds(1001), 1.5)
  assert.equal(playbackDurationSeconds(-100), 0)
  const timeline: PlaybackTimeline = buildPlaybackTimeline([message('text', 1), message('text', 2)], { paceMs: 1500 })
  assert.equal(timeline.totalMs, 1200 + 1500 + playbackTailMs)
  assert.equal(playbackDurationSeconds(timeline.totalMs), 6)
})
