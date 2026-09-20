import { Button } from './ui/button'
import { Disclosure, SegmentedControl, Switch } from './ui/controls'
import { Eye, Pause, Play, RotateCcw, Timer } from 'lucide-react'
import {
  playbackPaceLabels,
  playbackPaces,
  type PlaybackPace,
} from '@/lib/chat-playback'

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
  active, playing, revealed, total, pace, soundEnabled, soundReceive, soundSend, busy,
  onPlay, onPause, onReset, onExit, onPaceChange, onSoundToggle, onSoundReceiveChange, onSoundSendChange,
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
        <span>收到</span>
        <Switch aria-label="收到消息时响一声" checked={soundReceive} disabled={busy || !soundEnabled} onCheckedChange={onSoundReceiveChange} />
        <span className="chat-playback-hint">对方的消息，两音「叮咚」</span>
      </div>
      <div className="chat-playback-field">
        <span>发送</span>
        <Switch aria-label="发送消息时响一声" checked={soundSend} disabled={busy || !soundEnabled} onCheckedChange={onSoundSendChange} />
        <span className="chat-playback-hint">自己的消息，微信式「咻」</span>
      </div>
      <p className="chat-playback-note">开始后预览逐条出现，可用录屏软件直接录制（播放不消耗额度）。播放期间图片导出会暂停，点“显示全部”即恢复；要一键导出带提示音的视频，用下方“生成视频”。</p>
    </Disclosure>
  </div>
}
