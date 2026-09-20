import test from 'node:test'
import assert from 'node:assert/strict'
import {
  customSoundReplaces,
  notifyKindLabels,
  notifySoundDurationMs,
  notifySounds,
  receivedNotifySounds,
  resolveCustomBuffers,
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

test('the received pair matches 微信「叮咚」: 高→低、下行大三度、落在温润的频段', () => {
  const tones = tonesOf(receivedNotifySounds)
  // 「叮咚」这个名字本身就是高→低；上行会听成「咚叮」。
  assert.ok(tones[0].freq > tones[1].freq, '先高后低')

  // 大三度 = 4 个半音，也就是 2^(4/12) ≈ 1.2599 的频率比。这是公开描述里给出的音程。
  const ratio = tones[0].freq / tones[1].freq
  const majorThird = 2 ** (4 / 12)
  assert.ok(Math.abs(ratio - majorThird) < 0.01, `音程要近似大三度，实际比值 ${ratio.toFixed(4)}`)

  // 早先那对 1318/988 Hz 又高又亮，听感更像电子门铃；微信那声是温润的木质感。
  for (const tone of tones) assert.ok(tone.freq < 1100, `${tone.freq} Hz 偏高，会失去「温润通透」的听感`)

  // 两声之间的间隔要短到听成一个「叮咚」，而不是两个独立的音。
  const gap = tones[1].offsetMs - tones[0].offsetMs
  assert.ok(gap > 0 && gap < 200, `两声间隔 ${gap}ms 超出「短促双音」的范围`)
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

test('a custom upload replaces whichever kind it was picked for', () => {
  const both = { received: {} as AudioBuffer, sent: {} as AudioBuffer }
  assert.equal(customSoundReplaces('received', both), true)
  assert.equal(customSoundReplaces('sent', both), true, '发送音效也可以换成自己的音频')
  assert.equal(customSoundReplaces('received', { received: {} as AudioBuffer }), true)
  assert.equal(customSoundReplaces('sent', { received: {} as AudioBuffer }), false, '只选了接收音时，发送仍用内置合成音')
  assert.equal(customSoundReplaces('received', { sent: {} as AudioBuffer }), false)
  assert.equal(customSoundReplaces('received', {}), false, '没选任何音频时两类都用内置音')
  assert.equal(customSoundReplaces('sent', null), false)
  assert.equal(customSoundReplaces('received', undefined), false)
})

test('the legacy buffer option still maps to the received sound', () => {
  const received = {} as AudioBuffer
  const sent = {} as AudioBuffer
  assert.equal(resolveCustomBuffers({}).received, undefined, '什么都没给时两类都用内置音')
  assert.equal(resolveCustomBuffers({ buffer: received }).received, received, '旧字段只作用于接收音')
  assert.deepEqual(resolveCustomBuffers({ buffers: { received: null, sent } }), { received: null, sent })
  // 新旧同时给时，新的 buffers 优先，旧字段不再覆盖。
  assert.equal(resolveCustomBuffers({ buffer: received, buffers: { received: null } }).received, null)
})
