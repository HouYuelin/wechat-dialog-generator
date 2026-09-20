import test from 'node:test'
import assert from 'node:assert/strict'
import {
  customSoundReplaces,
  notifyKindLabels,
  notifySoundDurationMs,
  notifySounds,
  receivedNotifySounds,
  sentNotifySounds,
  type NotifyKind,
  type NotifySound,
  type NotifyTone,
  type NotifyWhoosh,
} from './notify-sound'

const kinds: NotifyKind[] = ['received', 'sent']

function tonesOf(sounds: NotifySound[]) {
  return sounds.filter((sound): sound is NotifyTone => sound.kind !== 'whoosh')
}

function whooshesOf(sounds: NotifySound[]) {
  return sounds.filter((sound): sound is NotifyWhoosh => sound.kind === 'whoosh')
}

test('the received sound is a struck pair of notes, not a plain beep', () => {
  const tones = tonesOf(receivedNotifySounds)
  assert.equal(tones.length, receivedNotifySounds.length, '接收音是两声乐音，不含气流声')
  assert.ok(tones.length >= 2, '来消息是两声，不是一声')
  for (const tone of tones) {
    assert.equal(tone.freqTo, undefined, '接收音不做滑音')
    assert.ok(tone.freq > 0, '频率必须为正，否则振荡器无法起振')
    assert.ok(tone.durationMs > 0)
    assert.ok(tone.gain > 0 && tone.gain <= 1, '增益要落在安全区间')
  }
  assert.ok(receivedNotifySounds[1].offsetMs > 0, '第二声在第一声之后起音')
})

test('the bell partials give a strike its metal, and higher ones die first', () => {
  for (const tone of tonesOf(receivedNotifySounds)) {
    const partials = tone.partials ?? []
    assert.ok(partials.length >= 2, '没有泛音就只是纯正弦，会听成电子蜂鸣')
    partials.forEach((partial, index) => {
      assert.ok(partial.ratio > 1, '泛音必须在基频之上')
      assert.ok(partial.gain > 0 && partial.gain < 1, '泛音不该盖过基音')
      if (index === 0) return
      const previous = partials[index - 1]
      assert.ok(partial.ratio > previous.ratio, '泛音按频率升序排列')
      // 越高越短是敲击音和「和弦」的分水岭，这条最容易在调音时被改坏。
      assert.ok((partial.decay ?? 1) < (previous.decay ?? 1), '越高的泛音收得越快')
    })
  }
})

test('the outgoing sound is a swept whoosh plus a falling blip, and is shorter', () => {
  const whooshes = whooshesOf(sentNotifySounds)
  assert.ok(whooshes.length >= 1, '发送音要有气流声才像「咻」')
  for (const whoosh of whooshes) {
    assert.ok(whoosh.freqFrom > whoosh.freqTo, '气流声是往下扫的')
    // 带通中心频率必须为正，否则 exponentialRampToValueAtTime 会抛错。
    assert.ok(whoosh.freqTo > 0 && whoosh.freqFrom > 0)
    assert.ok(whoosh.gain > 0 && whoosh.gain <= 1)
    assert.ok(whoosh.durationMs > 0)
  }
  const slides = tonesOf(sentNotifySounds).filter(tone => tone.freqTo !== undefined)
  assert.ok(slides.length >= 1, '气流底下要垫一个下滑音，才听成「发出去了一条」')
  for (const slide of slides) assert.ok(slide.freqTo! > 0, '滑音终点必须大于 0')
  assert.notDeepEqual(sentNotifySounds, receivedNotifySounds)
  assert.ok(notifySoundDurationMs.sent < notifySoundDurationMs.received, '发送音比接收音短')
})

test('the two kinds never blur into one sound', () => {
  assert.equal(whooshesOf(receivedNotifySounds).length, 0, '接收音没有气流声')
  assert.ok(whooshesOf(sentNotifySounds).length > 0, '发送音靠气流声与接收音区分')
})

test('every notify kind has sounds, a long enough duration and a label', () => {
  for (const kind of kinds) {
    const sounds = notifySounds[kind]
    assert.ok(sounds.length > 0, `${kind} 必须有音`)
    const longest = Math.max(...sounds.map(sound => sound.offsetMs + sound.durationMs))
    assert.ok(notifySoundDurationMs[kind] >= longest, `${kind} 的时长要盖住最长的一个音`)
    assert.ok(notifyKindLabels[kind].length > 0)
  }
  assert.notEqual(notifyKindLabels.received, notifyKindLabels.sent)
})

test('a custom upload only replaces the incoming sound', () => {
  assert.equal(customSoundReplaces('received', true), true)
  assert.equal(customSoundReplaces('sent', true), false, '发送音效始终用内置合成音')
  assert.equal(customSoundReplaces('received', false), false, '没上传时用内置接收音')
  assert.equal(customSoundReplaces('sent', false), false)
})
