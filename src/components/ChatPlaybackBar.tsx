import { Button } from './ui/button'
import { Disclosure, SegmentedControl, Switch } from './ui/controls'
import { Eye, Music, Pause, Play, RotateCcw, Timer } from 'lucide-react'
import {
  playbackPaceLabels,
  playbackPaces,
  type PlaybackPace,
} from '@/lib/chat-playback'
import type { NotifyKind } from '@/lib/notify-sound'

interface ChatPlaybackBarProps {
  /** 是否处于定时发送模式（预览只显示到第 revealed 条）。 */
  active: boolean
  playing: boolean
  revealed: number
  total: number
  pace: PlaybackPace
  /** 提示音总开关。 */
  soundEnabled: boolean
  /** 收到对方消息时是否响一声。 */
  soundReceive: boolean
  /** 自己发出消息时是否响一声（音效与接收不同）。 */
  soundSend: boolean
  /** 音源：内置合成音，还是「我的音频」。 */
  soundSource: 'synth' | 'custom'
  /** 正在使用的自定义音效名（收/发各自一条），没选就是 null。 */
  customSoundNames: { received: string | null; sent: string | null }
  /** 生成视频期间锁定，避免播放与录制抢同一份状态。 */
  busy?: boolean
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onExit: () => void
  onPaceChange: (pace: PlaybackPace) => void
  onSoundToggle: (enabled: boolean) => void
  onSoundReceiveChange: (enabled: boolean) => void
  onSoundSendChange: (enabled: boolean) => void
  onSoundSourceChange: (source: 'synth' | 'custom') => void
  /** 打开音效库挑一条：挑给收到还是发送由 kind 决定；浏览器存储不可用时不传。 */
  onPickSound?: (kind: NotifyKind) => void
}

function soundSummary(enabled: boolean, receive: boolean, send: boolean) {
  if (!enabled) return '提示音关'
  const picks: string[] = []
  if (receive) picks.push('收到')
  if (send) picks.push('发送')
  return picks.length ? picks.join(' + ') : '未选音效'
}

/**
 * 定时发送控制条：让消息逐条出现，方便用系统录屏软件录一段“真人聊天”的过程。
 * 这里选定的节奏与提示音会作为导出视频的默认值。默认只占一行，设置收在折叠面板里，
 * 避免把预览区的手机画面挤小。
 */
export function ChatPlaybackBar({
  active, playing, revealed, total, pace, soundEnabled, soundReceive, soundSend, soundSource, customSoundNames, busy,
  onPlay, onPause, onReset, onExit, onPaceChange, onSoundToggle, onSoundReceiveChange, onSoundSendChange, onSoundSourceChange, onPickSound,
}: ChatPlaybackBarProps) {
  const started = revealed > 0
  return <div className="chat-playback" data-active={active}>
    <div className="chat-playback-main">
      <span className="chat-playback-title"><Timer size={14} /> 定时发送</span>
      <span className="chat-playback-progress" aria-live="polite">{active ? `${revealed} / ${total} 条` : `共 ${total} 条`}</span>
      <Button
        type="button"
        className="btn btn-primary chat-playback-primary"
        disabled={!total || busy}
        aria-label={playing ? '暂停定时发送' : started ? '继续定时发送' : '开始定时发送'}
        onClick={playing ? onPause : onPlay}
      >
        {playing ? <><Pause size={15} /> 暂停</> : <><Play size={15} /> {started ? '继续' : '开始'}</>}
      </Button>
      <Button type="button" className="btn btn-outline" disabled={!active || busy} aria-label="重播定时发送" onClick={onReset}><RotateCcw size={14} /></Button>
      <Button type="button" className="btn btn-outline" disabled={!active || busy} aria-label="显示全部消息" onClick={onExit}><Eye size={14} /></Button>
    </div>
    <Disclosure title={<span className="chat-playback-settings-title">节奏与音效<span>{playbackPaceLabels[pace]} · {soundSummary(soundEnabled, soundReceive, soundSend)}</span></span>}>
      <div className="chat-playback-field">
        <span>节奏</span>
        <SegmentedControl
          aria-label="消息出现节奏"
          value={pace}
          disabled={busy}
          onValueChange={value => onPaceChange(value as PlaybackPace)}
          options={playbackPaces.map(item => ({ value: item, label: playbackPaceLabels[item] }))}
        />
      </div>
      <div className="chat-playback-field">
        <span>提示音</span>
        <Switch aria-label="播放消息提示音" checked={soundEnabled} disabled={busy} onCheckedChange={onSoundToggle} />
      </div>
      <div className="chat-playback-field">
        <span>音源</span>
        <SegmentedControl
          aria-label="提示音音源"
          value={soundSource}
          disabled={busy || !soundEnabled}
          onValueChange={value => onSoundSourceChange(value as 'synth' | 'custom')}
          options={[{ value: 'synth', label: '内置' }, { value: 'custom', label: '我的音频' }]}
        />
      </div>
      <div className="chat-playback-field">
        <span>收到</span>
        <Switch aria-label="收到消息时响一声" checked={soundReceive} disabled={busy || !soundEnabled} onCheckedChange={onSoundReceiveChange} />
        {soundSource === 'custom'
          ? <PickSoundButton kind="received" name={customSoundNames.received} disabled={busy || !soundEnabled} onPick={onPickSound} fallbackHint="两声「叮咚」" />
          : <span className="chat-playback-hint">对方的消息，两声「叮咚」</span>}
      </div>
      <div className="chat-playback-field">
        <span>发送</span>
        <Switch aria-label="发送消息时响一声" checked={soundSend} disabled={busy || !soundEnabled} onCheckedChange={onSoundSendChange} />
        {soundSource === 'custom'
          ? <PickSoundButton kind="sent" name={customSoundNames.sent} disabled={busy || !soundEnabled} onPick={onPickSound} fallbackHint="微信式「咻」" />
          : <span className="chat-playback-hint">自己的消息，微信式「咻」</span>}
      </div>
      <p className="chat-playback-note">开始后预览逐条出现，可用录屏软件直接录制（播放不消耗额度）。播放期间图片导出会暂停，点“显示全部”即恢复；要一键导出带提示音的视频，用下方“生成视频”。音源选「我的音频」后，收发两声都能换成自己上传的音效。</p>
    </Disclosure>
  </div>
}

/** 「我的音频」音源下，收/发各一个选音效按钮：显示当前用的名字，点了去音效库挑。 */
function PickSoundButton({ kind, name, disabled, onPick, fallbackHint }: {
  kind: NotifyKind
  name: string | null
  disabled?: boolean
  onPick?: (kind: NotifyKind) => void
  fallbackHint: string
}) {
  if (!onPick) return <span className="chat-playback-hint">{fallbackHint}</span>
  return <Button
    type="button"
    variant="ghost"
    size="sm"
    className="chat-playback-pick-sound"
    disabled={disabled}
    title={name ? `更换「${kind === 'received' ? '收到' : '发送'}」用的音效（当前：${name}）` : '从音效库挑一条音效'}
    onClick={() => onPick(kind)}
  ><Music size={13} /> {name ?? '选择音频'}</Button>
}
