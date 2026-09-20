import { useRef } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from './ui/button'
import { SegmentedControl, Switch } from './ui/controls'
import { AlertTriangle, Download, Music, Timer, Video, X } from 'lucide-react'
import {
  playbackPaceLabels,
  playbackPaces,
  type PlaybackPace,
} from '@/lib/chat-playback'
import { videoSizeOptionsFor, type VideoSizeId } from '@/lib/chat-video'
import { defaultScreenSize, screenSizeLabel, type ScreenSize } from '@/lib/phone-size'

export type VideoSoundSource = 'synth' | 'custom'

export interface VideoExportSettings {
  size: VideoSizeId
  pace: PlaybackPace
  /** 提示音总开关。 */
  soundEnabled: boolean
  /** 收到对方消息时是否响一声。 */
  soundReceive: boolean
  /** 自己发出消息时是否响一声（音效与接收不同）。 */
  soundSend: boolean
  soundSource: VideoSoundSource
  customSound: { name: string; durationSeconds: number } | null
}

interface VideoExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: VideoExportSettings
  onChange: (patch: Partial<VideoExportSettings>) => void
  messageCount: number
  /** 按当前音效开关算出的发声次数。 */
  soundCount: number
  estimatedMs: number
  durationLabel: string
  containerLabel: string
  /** 当前屏幕尺寸（导出分辨率），决定「跟随屏幕」这一档的实际大小。 */
  screen?: ScreenSize
  /** 当前浏览器是否支持本地录制视频。 */
  supported: boolean
  soundError: string
  onSoundFile: (file: File) => void
  onConfirm: () => void
}

/**
 * 下载前的视频选项：画面尺寸、消息节奏、提示音的范围与音源都放在这里选，
 * 默认值沿用播放条上的设置，避免两处各调一遍。
 */
export function VideoExportDialog({
  open, onOpenChange, settings, onChange, messageCount, soundCount, estimatedMs, durationLabel, containerLabel,
  screen = defaultScreenSize, supported, soundError, onSoundFile, onConfirm,
}: VideoExportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const sizeOptions = videoSizeOptionsFor(screen)
  const activeSize = sizeOptions.find(option => option.id === settings.size) ?? sizeOptions[0]
  // 自定义音频只影响「收到消息」那一声，所以关掉接收音时不必强求先上传文件。
  const needsCustomSound = settings.soundEnabled && settings.soundReceive && settings.soundSource === 'custom'
  const customReady = !needsCustomSound || Boolean(settings.customSound)

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="video-dialog-backdrop" />
      <Dialog.Popup className="video-dialog-popup" aria-label="生成视频">
        <div className="video-dialog-topline">
          <Dialog.Title className="video-dialog-title"><Video size={16} /> 生成聊天视频</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="关闭" />}><X size={17} /></Dialog.Close>
        </div>
        <Dialog.Description className="video-dialog-description">把这段对话按顺序播放并录制成视频文件，收到消息时带提示音，下载到本机。</Dialog.Description>

        <div className="video-option">
          <h3>画面尺寸 <small>{activeSize.width}×{activeSize.height} · {containerLabel}</small></h3>
          <SegmentedControl
            aria-label="视频画面尺寸"
            value={settings.size}
            onValueChange={value => onChange({ size: value as VideoSizeId })}
            options={sizeOptions.map(option => ({ value: option.id, label: option.label }))}
          />
          <p className="video-option-note">{activeSize.note}</p>
          {settings.size !== 'screen' && <p className="video-option-note">手机画面按 <b>{screenSizeLabel(screen)}</b> 渲染，再等比放进这个画布，四周留对话底色。</p>}
        </div>

        <div className="video-option">
          <h3>消息出现节奏 <small>{messageCount} 条 · {durationLabel}</small></h3>
          <SegmentedControl
            aria-label="视频消息节奏"
            value={settings.pace}
            onValueChange={value => onChange({ pace: value as PlaybackPace })}
            options={playbackPaces.map(item => ({ value: item, label: playbackPaceLabels[item] }))}
          />
        </div>

        <div className="video-option">
          <h3>提示音 <small>{messageCount ? `共 ${soundCount} 声` : '暂无消息'}</small></h3>
          <div className="video-sound-row">
            <Switch aria-label="视频带提示音" checked={settings.soundEnabled} onCheckedChange={checked => onChange({ soundEnabled: checked })} />
            <span className="video-option-note">打开后按下面两项分别选择</span>
          </div>
          <div className="video-sound-row" style={{ marginTop: 9 }}>
            <Switch aria-label="收到消息时响一声" checked={settings.soundReceive} disabled={!settings.soundEnabled} onCheckedChange={checked => onChange({ soundReceive: checked })} />
            <span className="video-option-note"><b>收到消息</b> 两音「叮咚」</span>
          </div>
          <div className="video-sound-row" style={{ marginTop: 9 }}>
            <Switch aria-label="发送消息时响一声" checked={settings.soundSend} disabled={!settings.soundEnabled} onCheckedChange={checked => onChange({ soundSend: checked })} />
            <span className="video-option-note"><b>发送消息</b> 微信式「咻」，和接收的不一样</span>
          </div>
          <div className="video-sound-row" style={{ marginTop: 9 }}>
            <SegmentedControl
              aria-label="提示音音源"
              value={settings.soundSource}
              disabled={!settings.soundEnabled || !settings.soundReceive}
              onValueChange={value => onChange({ soundSource: value as VideoSoundSource })}
              options={[{ value: 'synth', label: '内置提示音' }, { value: 'custom', label: '我的音频' }]}
            />
            {settings.soundSource === 'custom' && settings.soundReceive && <>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                hidden
                aria-label="上传自定义提示音"
                onChange={event => {
                  const file = event.target.files?.[0]
                  if (file) onSoundFile(file)
                  event.target.value = ''
                }}
              />
              <Button type="button" className="btn btn-outline" disabled={!settings.soundEnabled} onClick={() => fileRef.current?.click()}><Music size={14} /> {settings.customSound ? '更换音频' : '选择音频'}</Button>
            </>}
          </div>
          <p className="video-option-note">
            {settings.soundSource === 'custom'
              ? settings.customSound
                ? `已选择：${settings.customSound.name}（${settings.customSound.durationSeconds.toFixed(1)} 秒）。它只替换「收到消息」那一声，发送音效仍用内置合成音，两者不会混成一个。`
                : '支持 mp3、wav、m4a 等常见格式，建议不超过 4 MB。上传的音频只替换「收到消息」那一声。'
              : settings.soundSend
                ? '两种音效都按微信的收发提示音现场合成：收到是「叮咚」，发送是「咻」。不打包任何第三方音频文件。'
                : '内置音按微信的接收提示音现场合成，不打包任何第三方音频文件；想换成自己的声音，改选「我的音频」。'}
          </p>
          {soundError && <p className="video-option-note" role="alert" style={{ color: '#a4382c' }}><AlertTriangle size={12} /> {soundError}</p>}
        </div>

        <p className="video-summary">
          <b>预计约 {Math.max(1, Math.round(estimatedMs / 1000))} 秒</b>完成：先逐条渲染画面，再实时录制，两段耗时相加。<br />
          录制期间请保持当前标签页在前台，切到后台会中断。生成视频会使用 <b>1 次</b>导出额度。
        </p>

        {!supported && <p className="video-option-note" role="alert" style={{ color: '#a4382c' }}><AlertTriangle size={12} /> 当前浏览器不支持在本地生成视频，请改用 Chrome 或 Edge 打开本站。</p>}

        <div className="video-dialog-actions">
          <Dialog.Close render={<Button variant="outline" />}>取消</Dialog.Close>
          <Button type="button" disabled={!supported || !messageCount || !customReady} onClick={onConfirm}><Download size={15} /> 开始生成视频</Button>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}

interface VideoProgressOverlayProps {
  stage: 'render' | 'record'
  current: number
  total: number
  elapsedMs: number
  totalMs: number
  onCancel: () => void
}

/** 渲染与录制合成一条进度条，避免用户以为卡住。 */
export function VideoProgressOverlay({ stage, current, total, elapsedMs, totalMs, onCancel }: VideoProgressOverlayProps) {
  const renderRatio = total ? Math.min(1, current / total) : 1
  const recordRatio = totalMs ? Math.min(1, elapsedMs / totalMs) : 1
  const percent = stage === 'render' ? renderRatio * 45 : 45 + recordRatio * 55
  const seconds = (value: number) => Math.max(0, Math.round(value / 1000))
  return <div className="video-progress-backdrop" role="dialog" aria-modal="true" aria-label="正在生成视频">
    <div className="video-progress-panel">
      <p className="video-progress-title">
        {stage === 'render' ? <><Video size={16} /> 正在渲染画面</> : <><Timer size={16} /> 正在录制视频</>}
      </p>
      <div className="video-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-label="视频生成进度"><i style={{ width: `${percent}%` }} /></div>
      <p className="video-progress-text">
        {stage === 'render'
          ? `第 ${Math.min(current, total)} / ${total} 帧，正在逐条生成对话画面…`
          : `已录制 ${seconds(elapsedMs)} / ${seconds(totalMs)} 秒，请不要切换标签页。`}
      </p>
      <div className="video-progress-actions"><Button type="button" variant="outline" onClick={onCancel}>取消生成</Button></div>
    </div>
  </div>
}
