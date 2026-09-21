import test from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultDisplayPrefs,
  defaultPhoneSettings,
  defaultPlaybackPrefs,
  defaultStylePrefs,
  defaultWorkspacePrefs,
  normalizeWorkspacePrefs,
  settingsWithStyle,
  stylePrefsFromSettings,
  workspacePrefsEqual,
  type WorkspacePrefs,
} from './workspace-prefs'
import { defaultImageMax, maxImageMax } from './image-size'
import { defaultFontScale, maxFontScale } from './font-size'
import { defaultScreenSize } from './phone-size'

test('出厂默认值只有一处：样式偏好 + 空标题就是默认设置', () => {
  assert.equal(defaultPhoneSettings.contactName, '')
  assert.deepEqual(stylePrefsFromSettings(defaultPhoneSettings), defaultStylePrefs)
  assert.deepEqual(normalizeWorkspacePrefs(defaultWorkspacePrefs()), defaultWorkspacePrefs())
})

test('每次取默认值都是新对象，改它不会污染下一次的新建对话', () => {
  const first = defaultWorkspacePrefs()
  first.style.backgroundColor = '#000000'
  first.playback.soundIds.received = 'sound-1'
  first.playback.screenSize.width = 1080
  first.display.customPhoneWidth = 200
  const second = defaultWorkspacePrefs()
  assert.equal(second.style.backgroundColor, defaultStylePrefs.backgroundColor)
  assert.equal(second.playback.soundIds.received, null)
  assert.equal(second.playback.screenSize.width, defaultScreenSize.width)
  assert.equal(second.display.customPhoneWidth, defaultDisplayPrefs.customPhoneWidth)
})

test('聊天标题属于内容，不进偏好；盖样式时也不会被偏好改掉', () => {
  const mine = stylePrefsFromSettings({ ...defaultPhoneSettings, contactName: '张伟' })
  assert.ok(!('contactName' in mine), '偏好里不该有聊天标题')

  const style = { ...defaultStylePrefs, fontScale: 80, backgroundColor: '#101010' }
  const applied = settingsWithStyle({ ...defaultPhoneSettings, contactName: '张伟' }, style)
  assert.equal(applied.contactName, '张伟', '标题跟着内容走')
  assert.equal(applied.fontScale, 80)
  assert.equal(applied.backgroundColor, '#101010')
})

test('脏数据整份兜底，逐字段校验', () => {
  assert.deepEqual(normalizeWorkspacePrefs(null), defaultWorkspacePrefs())
  assert.deepEqual(normalizeWorkspacePrefs('nonsense'), defaultWorkspacePrefs())
  assert.deepEqual(normalizeWorkspacePrefs([1, 2, 3]), defaultWorkspacePrefs())

  const washed = normalizeWorkspacePrefs({
    style: {
      platform: 'symbian',
      time: '',
      signal: 99,
      secondarySignal: 0,
      simMode: 'triple',
      wifiEnabled: 'yes',
      battery: 300,
      unreadCount: -5,
      selfBubbleColor: '',
      otherBubbleColor: '#'.repeat(70),
      backgroundColor: '#123456',
      backgroundImage: 'data:text/plain;base64,AAAA',
      imageMax: 99999,
      fontScale: 999,
    },
    playback: {
      pace: 'zoom',
      soundEnabled: 'off',
      soundReceive: null,
      soundSend: true,
      soundSource: 'mic',
      soundIds: { received: 42, sent: 'sound-9' },
      screenSize: { width: 300, height: 300 },
      videoSize: 'square',
      videoMode: 'loop',
      scrollDuration: 999,
    },
  })

  assert.equal(washed.style.platform, defaultStylePrefs.platform)
  assert.equal(washed.style.time, defaultStylePrefs.time)
  assert.equal(washed.style.signal, 4)
  assert.equal(washed.style.secondarySignal, 1)
  assert.equal(washed.style.simMode, defaultStylePrefs.simMode)
  assert.equal(washed.style.wifiEnabled, defaultStylePrefs.wifiEnabled)
  assert.equal(washed.style.battery, 100)
  assert.equal(washed.style.unreadCount, 0)
  assert.equal(washed.style.selfBubbleColor, defaultStylePrefs.selfBubbleColor)
  assert.equal(washed.style.otherBubbleColor, defaultStylePrefs.otherBubbleColor)
  assert.equal(washed.style.backgroundColor, '#123456', '合法值原样保留')
  assert.equal(washed.style.backgroundImage, null, '只认图片 data URL')
  assert.equal(washed.style.imageMax, maxImageMax)
  assert.equal(washed.style.fontScale, maxFontScale)

  assert.equal(washed.playback.pace, defaultPlaybackPrefs.pace)
  assert.equal(washed.playback.soundEnabled, defaultPlaybackPrefs.soundEnabled)
  assert.equal(washed.playback.soundReceive, defaultPlaybackPrefs.soundReceive)
  assert.equal(washed.playback.soundSend, true, '合法的布尔值保留')
  assert.equal(washed.playback.soundSource, 'synth')
  assert.deepEqual(washed.playback.soundIds, { received: null, sent: 'sound-9' })
  assert.deepEqual(washed.playback.screenSize, { width: 720, height: 1280 }, '太小的屏幕被夹到下限')
  assert.equal(washed.playback.videoSize, defaultPlaybackPrefs.videoSize)
  assert.equal(washed.playback.videoMode, defaultPlaybackPrefs.videoMode)
  assert.equal(washed.playback.scrollDuration, 60)

  const washedDisplay = normalizeWorkspacePrefs({
    display: { phoneSize: 'huge', customPhoneWidth: 99999 },
  })
  assert.equal(washedDisplay.display.phoneSize, defaultDisplayPrefs.phoneSize)
  assert.equal(washedDisplay.display.customPhoneWidth, 720, '越界的宽度夹到上限')
  assert.equal(normalizeWorkspacePrefs({ display: { phoneSize: 'custom', customPhoneWidth: 12 } }).display.customPhoneWidth, 200)
})

test('缺字段的旧数据只丢那一项，其余照常读出来', () => {
  const partial = normalizeWorkspacePrefs({
    style: { backgroundImage: 'data:image/png;base64,AAAA', fontScale: 80 },
    playback: { screenSize: { width: 1080, height: 1920 }, soundSource: 'custom', soundIds: { received: 'sound-1' } },
  })
  assert.equal(partial.style.fontScale, 80, '字号没被别的字段带跑')
  assert.equal(partial.style.imageMax, defaultImageMax)
  assert.deepEqual(partial.playback.screenSize, { width: 1080, height: 1920 })
  assert.equal(partial.playback.soundSource, 'custom')
  assert.deepEqual(partial.playback.soundIds, { received: 'sound-1', sent: null })
  assert.equal(partial.playback.pace, defaultPlaybackPrefs.pace)
})

test('键序不同也算同一份偏好，避免每渲染一次就写一遍存储', () => {
  const prefs = defaultWorkspacePrefs()
  const reordered: WorkspacePrefs = {
    playback: {
      scrollDuration: prefs.playback.scrollDuration,
      soundIds: { sent: null, received: null },
      screenSize: { height: prefs.playback.screenSize.height, width: prefs.playback.screenSize.width },
      pace: prefs.playback.pace,
      soundEnabled: prefs.playback.soundEnabled,
      soundReceive: prefs.playback.soundReceive,
      soundSend: prefs.playback.soundSend,
      soundSource: prefs.playback.soundSource,
      videoSize: prefs.playback.videoSize,
      videoMode: prefs.playback.videoMode,
    },
    style: stylePrefsFromSettings({ ...defaultPhoneSettings, contactName: '张伟' }),
    display: { customPhoneWidth: prefs.display.customPhoneWidth, phoneSize: prefs.display.phoneSize },
  }
  assert.equal(workspacePrefsEqual(prefs, reordered), true)
  assert.equal(workspacePrefsEqual(prefs, defaultWorkspacePrefs()), true)

  // 任何一个字段真的变了都必须认出来，否则用户改的设置会写不进去。
  const slower = { ...prefs, playback: { ...prefs.playback, pace: 'slow' as const } }
  assert.equal(workspacePrefsEqual(prefs, slower), false)
  const bigger = { ...prefs, style: { ...prefs.style, fontScale: defaultFontScale + 15 } }
  assert.equal(workspacePrefsEqual(prefs, bigger), false)
  const soundPicked = { ...prefs, playback: { ...prefs.playback, soundIds: { received: 'sound-1', sent: null } } }
  assert.equal(workspacePrefsEqual(prefs, soundPicked), false)
  const screenChanged = { ...prefs, playback: { ...prefs.playback, screenSize: { width: 1080, height: 1920 } } }
  assert.equal(workspacePrefsEqual(prefs, screenChanged), false)
  const windowResized = { ...prefs, display: { ...prefs.display, phoneSize: 'large' as const } }
  assert.equal(workspacePrefsEqual(prefs, windowResized), false)
  const widthTyped = { ...prefs, display: { ...prefs.display, customPhoneWidth: 600 } }
  assert.equal(workspacePrefsEqual(prefs, widthTyped), false)
})

test('偏好与设置互转后仍是完整的设置对象', () => {
  const prefs = normalizeWorkspacePrefs({
    style: { fontScale: 80, imageMax: 700, platform: 'android', backgroundImage: null },
    playback: { screenSize: { width: 1080, height: 1920 } },
  })
  const settings = settingsWithStyle(defaultPhoneSettings, prefs.style)
  assert.equal(settings.platform, 'android')
  assert.equal(settings.fontScale, 80)
  assert.equal(settings.imageMax, 700)
  assert.equal(settings.contactName, '')
  assert.deepEqual(stylePrefsFromSettings(settings), prefs.style)
})
