import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPlaybackTimeline,
  clampLeadInMs,
  clampPaceGapMs,
  clampPaceMs,
  defaultLeadInMs,
  defaultPaceMs,
  frameIndexAt,
  maxGapMs,
  maxLeadInMs,
  maxPaceMs,
  messageGapLabel,
  minGapMs,
  minPaceMs,
  normalizeMessageGaps,
  normalizePaceMs,
  normalizePaceSetting,
  notifyEvents,
  paceGapLabel,
  paceMsFromLegacy,
  paceSettingLabel,
  playbackDurationSeconds,
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
  // 时间分隔条紧跟其上一条消息出现（同一时刻），不占间隔，也不推进后面那条消息的等待。
  assert.deepEqual(notifyEvents(timeline), [{ atMs: 2200, kind: 'received' }, { atMs: 3200, kind: 'received' }])
  assert.deepEqual(timeline.steps.map(step => step.notify), [null, 'received', null, 'received'])
})

test('时间分隔条不占等待：紧跟其上一条消息，不推进也不消耗间隔', () => {
  const timeline = buildPlaybackTimeline([message('text', 1), message('time', 2), message('text', 2)], { paceMs: 1000, selfId: 1 })
  // 三条：首条 text(1200)、time 紧跟(1200)、下一条 text(2200)。
  assert.deepEqual(timeline.steps.map(step => step.atMs), [1200, 1200, 2200])

  // 逐条模式下 gap 数按「非时间消息条数」算：2 条真实消息只有 1 个 gap。
  const per = buildPlaybackTimeline([message('text', 1), message('time', 2), message('text', 2), message('text', 1)], { paceMode: 'perMessage', messageGaps: [500, 4000], paceMs: 1000, selfId: 1 })
  // text(1200)、time(1200)、text(1200+500=1700)、text(1700+4000=5700)。
  assert.deepEqual(per.steps.map(step => step.atMs), [1200, 1200, 1700, 5700])

  // 开场静置设成 0，第一条立刻出现。
  const zero = buildPlaybackTimeline([message('text', 1), message('text', 2)], { paceMs: 1000, leadInMs: 0 })
  assert.deepEqual(zero.steps.map(step => step.atMs), [0, 1000])
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

test('统一间隔夹在 0.5–3 秒、逐条间隔夹在 0.2–10 秒，都对齐到 0.1 秒', () => {
  assert.equal(clampPaceMs(1500), 1500)
  assert.equal(clampPaceMs(80), minPaceMs)
  assert.equal(clampPaceMs(9999), maxPaceMs)
  assert.equal(clampPaceMs(1246), 1200, '不是整格的值对齐到最近的一格')
  assert.equal(clampPaceMs(Number.NaN), defaultPaceMs, 'NaN 退回默认值而不是 0，否则消息会挤成一团')
  assert.equal(clampPaceGapMs(1500), 1500)
  assert.equal(clampPaceGapMs(50), minGapMs, '逐条这一档能压到 0.2 秒，同一个人连发两条才做得出来')
  assert.equal(clampPaceGapMs(60_000), maxGapMs)
  assert.equal(normalizePaceMs('1200'), defaultPaceMs, '只认数字')
  assert.equal(clampLeadInMs(0), 0, '开场静置可以压到 0')
  assert.equal(clampLeadInMs(1500), 1500)
  assert.equal(clampLeadInMs(9999), maxLeadInMs)
  assert.equal(clampLeadInMs(Number.NaN), defaultLeadInMs, 'NaN 退回默认值')
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

test('逐条间隔：每条按自己的间隔出现，首条仍然是开场静置', () => {
  const messages = [message('text', 1), message('text', 2), message('text', 1), message('text', 2)]
  const timeline = buildPlaybackTimeline(messages, { paceMode: 'perMessage', messageGaps: [1000, 300, 5000], paceMs: 1500 })
  assert.deepEqual(timeline.steps.map(step => step.atMs), [1200, 2200, 2500, 7500])
  assert.equal(timeline.totalMs, 7500 + playbackTailMs)
})

test('统一模式不看逐条间隔；逐条模式缺的按统一间隔补齐、多的截掉', () => {
  const messages = [message('text', 1), message('text', 2), message('text', 1)]
  const uniform = buildPlaybackTimeline(messages, { paceMs: 1000, messageGaps: [4000, 4000] })
  assert.deepEqual(uniform.steps.map(step => step.atMs), [1200, 2200, 3200], '统一模式下逐条间隔整份不生效')

  const short = buildPlaybackTimeline(messages, { paceMode: 'perMessage', paceMs: 1000, messageGaps: [300] })
  assert.deepEqual(short.steps.map(step => step.atMs), [1200, 1500, 2500], '缺的那一处按统一间隔出现')

  const long = buildPlaybackTimeline(messages, { paceMode: 'perMessage', paceMs: 1000, messageGaps: [300, 400, 500, 600] })
  assert.deepEqual(long.steps.map(step => step.atMs), [1200, 1500, 1900], '多出来的那些消息已经不在对话里，直接截掉')

  const single = buildPlaybackTimeline([message('text', 1)], { paceMode: 'perMessage', messageGaps: [900] })
  assert.deepEqual(single.steps.map(step => step.atMs), [1200], '只有一条消息时没有间隔可用')
})

test('逐条间隔列表按消息条数补齐：越界夹取、脏值按统一间隔兜底、只有一条时为空', () => {
  assert.deepEqual(normalizeMessageGaps([500, 900], 4, 1500), [500, 900, 1500])
  assert.deepEqual(normalizeMessageGaps([500, 900, 1500, 2500], 2, 1500), [500])
  assert.deepEqual(normalizeMessageGaps([10, 99_000, 'x', Number.NaN], 5, 800), [minGapMs, maxGapMs, 800, 800])
  assert.deepEqual(normalizeMessageGaps([500], 1, 1500), [], '只有一条消息就没有间隔')
  assert.deepEqual(normalizeMessageGaps('nope', 3, 1000), [1000, 1000])
})

test('节奏设置读回来时逐项清洗', () => {
  assert.deepEqual(normalizePaceSetting(undefined), { mode: 'uniform', paceMs: defaultPaceMs, gaps: [], leadInMs: 1200 })
  assert.deepEqual(normalizePaceSetting({ mode: 'perMessage', paceMs: 2460, gaps: [0, 60_000] }), { mode: 'perMessage', paceMs: 2500, gaps: [minGapMs, maxGapMs], leadInMs: 1200 })
  assert.deepEqual(normalizePaceSetting({ mode: 'fast' }), { mode: 'uniform', paceMs: defaultPaceMs, gaps: [], leadInMs: 1200 }, '旧的档位字符串在这一层读不出来，由偏好那一层折算成毫秒')
  assert.deepEqual(normalizePaceSetting({ mode: 'perMessage' }).gaps, [], '逐条列表缺失就是空的，等按消息条数补齐')
  assert.equal(normalizePaceSetting({ leadInMs: 0 }).leadInMs, 0, '开场静置可设成 0')
  assert.equal(normalizePaceSetting({ leadInMs: 9999 }).leadInMs, maxLeadInMs, '开场静置夹到上限')
  assert.equal(normalizePaceSetting({ leadInMs: Number.NaN }).leadInMs, defaultLeadInMs, 'NaN 退回默认值')
})

test('旧的快 / 标准 / 慢三档折算成毫秒', () => {
  assert.equal(paceMsFromLegacy('fast'), 800)
  assert.equal(paceMsFromLegacy('normal'), 1500)
  assert.equal(paceMsFromLegacy('slow'), 2500)
  assert.equal(paceMsFromLegacy('zoom'), null)
  assert.equal(paceMsFromLegacy(1500), null)
})

test('摘要文案：统一写秒数，逐条写处数', () => {
  assert.equal(paceSettingLabel({ mode: 'uniform', paceMs: 1500, gaps: [], leadInMs: 1200 }), '统一 1.5 秒')
  assert.equal(paceSettingLabel({ mode: 'uniform', paceMs: 800, gaps: [], leadInMs: 1200 }), '统一 0.8 秒')
  assert.equal(paceSettingLabel({ mode: 'perMessage', paceMs: 1500, gaps: [800, 800, 800], leadInMs: 1200 }, 3), '逐条 3 处间隔')
  assert.equal(paceSettingLabel({ mode: 'perMessage', paceMs: 1500, gaps: [800, 800, 800], leadInMs: 1200 }), '逐条 3 处间隔', '没给条数时按列表长度说')
  assert.equal(paceSettingLabel({ mode: 'perMessage', paceMs: 1500, gaps: [], leadInMs: 1200 }, 0), '逐条设置')
  assert.equal(paceGapLabel(2400), '2.4 秒')
})

test('逐条列表里那一行认得出是哪条消息', () => {
  assert.equal(messageGapLabel({ type: 'text', content: '好的，明天见' }, '李四'), '李四：好的，明天见')
  assert.equal(messageGapLabel({ type: 'image', content: '' }, '李四'), '李四：[图片]')
  assert.equal(messageGapLabel({ type: 'text', content: 'x'.repeat(30) }, null), 'x'.repeat(16) + '…')
  assert.equal(messageGapLabel({ type: 'time', content: '上午 9:12' }), '上午 9:12')
})
