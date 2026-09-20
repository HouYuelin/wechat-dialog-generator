import { useRef } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from './ui/button'
import { SegmentedControl, Slider, Switch } from './ui/controls'
import { AlertTriangle, Download, FolderOpen, Music, Timer, Video, X } from 'lucide-react'
import {
  playbackPaceLabels,
  playbackPaces,
  type PlaybackPace,
} from '@/lib/chat-playback'
import { videoSizeOptionsFor, type VideoSizeId } from '@/lib/chat-video'
import {
  clampScrollDurationSeconds,
  maxScrollDurationSeconds,
  minScrollDurationSeconds,
  scrollPlanLabel,
  scrollVideoPlan,
} from '@/lib/chat-scroll-video'
import { defaultScreenSize, screenSizeLabel, type ScreenSize } from '@/lib/phone-size'
import type { NotifyKind } from '@/lib/notify-sound'

export type VideoSoundSource = 'synth' | 'custom'

/**
 * 录制方式：
 * - flip：消息一条条出现，画面整屏替换，可以带提示音；
 * - scroll：整段对话一开始就都在画面里，窗口从顶部滚到底部，适合展示长对话。
 */
export type VideoCaptureMode = 'flip' | 'scroll'

const videoCaptureModeLabels: Record<VideoCaptureMode, string> = {
  flip: '逐条播放',
  scroll: '滚动到底',
}

export interface VideoExportSettings {
  mode: VideoCaptureMode
  size: VideoSizeId
  pace: PlaybackPace
  /** 滚动模式的视频总时长（秒）。 */
  scrollDurationSeconds: number
  /** 提示音总开关。 */
  soundEnabled: boolean
  /** 收到对方消息时是否响一声。 */
  soundReceive: boolean
  /** 自己发出消息时是否响一声（音效与接收不同）。 */
  soundSend: boolean
  soundSource: VideoSoundSource
  /** 收/发各自正在使用的自定义音效（只显示名字和时长）；没选的那一类用内置合成音。 */
  customSounds: { received: { name: string; durationSeconds: number } | null; sent: { name: string; durationSeconds: number } | null }
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
  /** 直接上传一个音频文件：kind 说明这是给收到还是发送的那一声。 */
  onSoundFile: (file: File, kind: NotifyKind) => void
  /** 打开音效库（上传 / 选一条 / 改名 / 删除）：kind 说明这次挑给谁用。 */
  onOpenSoundLibrary?: (kind: NotifyKind) => void
  /** 音效库里已有几条，显示在按钮上；不传则只在有回调时显示一个纯入口。 */
  soundLibraryCount?: number
  onConfirm: () => void
}

/**
 * 下载前的视频选项：画面尺寸、消息节奏、提示音的范围与音源都放在这里选，
 * 默认值沿用播放条上的设置，避免两处各调一遍。
 */
export function VideoExportDialog({
  open, onOpenChange, settings, onChange, messageCount, soundCount, estimatedMs, durationLabel, containerLabel,
  screen = defaultScreenSize, supported, soundError, onSoundFile, onOpenSoundLibrary, soundLibraryCount = 0, onConfirm,
}: VideoExportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const fileKindRef = useRef<NotifyKind>('received')
  const sizeOptions = videoSizeOptionsFor(screen)
  const activeSize = sizeOptions.find(option => option.id === settings.size) ?? sizeOptions[0]
  const scrolling = settings.mode === 'scroll'
  const scrollPlan = scrollVideoPlan(settings.scrollDurationSeconds * 1000)
  // 自定义音频按收/发各自检查：哪一类开了、又选了「我的音频」，就得给它挑一条音频；
  // 没挑的那一类自动退回内置合成音，不会静音。滚动模式根本不发声，不要求任何音频。
  const customSource = !scrolling && settings.soundEnabled && settings.soundSource === 'custom'
  const needsReceiveAudio = customSource && settings.soundReceive
  const needsSendAudio = customSource && settings.soundSend
  const customReady = (!needsReceiveAudio || Boolean(settings.customSounds.received)) && (!needsSendAudio || Boolean(settings.customSounds.sent))
  const anySoundPicked = Boolean(settings.customSounds.received || settings.customSounds.sent)

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="video-dialog-backdrop" />
      <Dialog.Popup className="video-dialog-popup" aria-label="生成视频">
        <div className="video-dialog-topline">
          <Dialog.Title className="video-dialog-title"><Video size={16} /> 生成聊天视频</Dialog.Title>
          <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="关闭" />}><X size={17} /></Dialog.Close>
        </div>
        <Dialog.Description className="video-dialog-description">把这段对话录制成视频文件下载到本机。逐条播放会一条条出现并带提示音，滚动到底适合把一段长对话完整展示出来。</Dialog.Description>

        <div className="video-option">
          <h3>录制方式 <small>{videoCaptureModeLabels[settings.mode]}</small></h3>
          <SegmentedControl
            aria-label="视频录制方式"
            value={settings.mode}
            onValueChange={value => onChange({ mode: value as VideoCaptureMode })}
            options={[{ value: 'flip', label: '逐条播放' }, { value: 'scroll', label: '滚动到底' }]}
          />
          <p className="video-option-note">
            {scrolling
              ? '整段对话一开始就都在画面里，画面从顶部平滑滚到底部，视频不带提示音；适合把一段长对话完整展示出来。'
              : '消息一条条出现，节奏与提示音都能单独调；适合做「正在聊天」的效果。'}
          </p>
        </div>

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

        {scrolling
          ? <div className="video-option">
            <h3>滚动时长 <small>整段对话滚完用这么久</small></h3>
            <div className="video-duration-row">
              <Slider
                aria-label="滚动视频时长"
                min={minScrollDurationSeconds}
                max={maxScrollDurationSeconds}
                value={settings.scrollDurationSeconds}
                onValueChange={value => onChange({ scrollDurationSeconds: clampScrollDurationSeconds(value) })}
              />
              <span className="video-duration-value">{settings.scrollDurationSeconds} 秒</span>
            </div>
            <p className="video-option-note">{scrollPlanLabel(scrollPlan)}</p>
            <p className="video-option-note">时长就是这个视频的长度。导出分辨率越低，同样内容占的像素越少，能装下的对话越长。</p>
          </div>
          : <div className="video-option">
            <h3>消息出现节奏 <small>{messageCount} 条 · {durationLabel}</small></h3>
            <SegmentedControl
              aria-label="视频消息节奏"
              value={settings.pace}
              onValueChange={value => onChange({ pace: value as PlaybackPace })}
              options={playbackPaces.map(item => ({ value: item, label: playbackPaceLabels[item] }))}
            />
          </div>}

        {scrolling && <div className="video-option">
          <h3>提示音 <small>滚动模式不适用</small></h3>
          <p className="video-option-note">滚动模式里整段对话一开始就都在画面里，没有「收到消息」这一刻，所以导出的视频不带提示音。想要一声声的提示音，把上面的录制方式改回「逐条播放」。</p>
        </div>}

        {!scrolling && <div className="video-option">
          <h3>提示音 <small>{messageCount ? `共 ${soundCount} 声` : '暂无消息'}</small></h3>
          <div className="video-sound-row">
            <Switch aria-label="视频带提示音" checked={settings.soundEnabled} onCheckedChange={checked => onChange({ soundEnabled: checked })} />
            <span className="video-option-note">打开后按下面两项分别选择</span>
          </div>
          <div className="video-sound-row" style={{ marginTop: 9 }}>
            <SegmentedControl
              aria-label="提示音音源"
              value={settings.soundSource}
              disabled={!settings.soundEnabled || (!settings.soundReceive && !settings.soundSend)}
              onValueChange={value => onChange({ soundSource: value as VideoSoundSource })}
              options={[{ value: 'synth', label: '内置提示音' }, { value: 'custom', label: '我的音频' }]}
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            hidden
            aria-label="上传自定义提示音"
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) onSoundFile(file, fileKindRef.current)
              event.target.value = ''
            }}
          />
          <div className="video-sound-row" style={{ marginTop: 9 }}>
            <Switch aria-label="收到消息时响一声" checked={settings.soundReceive} disabled={!settings.soundEnabled} onCheckedChange={checked => onChange({ soundReceive: checked })} />
            <span className="video-option-note"><b>收到消息</b>{describeKind('received', settings, customSource)}</span>
            {settings.soundReceive && customSource && <SoundKindActions
              kind="received" current={settings.customSounds.received}
              onPickFile={() => { fileKindRef.current = 'received'; fileRef.current?.click() }}
              onOpenLibrary={onOpenSoundLibrary} libraryCount={soundLibraryCount}
            />}
          </div>
          <div className="video-sound-row" style={{ marginTop: 9 }}>
            <Switch aria-label="发送消息时响一声" checked={settings.soundSend} disabled={!settings.soundEnabled} onCheckedChange={checked => onChange({ soundSend: checked })} />
            <span className="video-option-note"><b>发送消息</b>{describeKind('sent', settings, customSource)}</span>
            {settings.soundSend && customSource && <SoundKindActions
              kind="sent" current={settings.customSounds.sent}
              onPickFile={() => { fileKindRef.current = 'sent'; fileRef.current?.click() }}
              onOpenLibrary={onOpenSoundLibrary} libraryCount={soundLibraryCount}
            />}
          </div>
          <p className="video-option-note">
            {settings.soundSource === 'custom'
              ? anySoundPicked
                ? '哪一项选了音频就替换哪一项：没选的那一类仍用内置合成音，收发不会混成同一个声音。'
                : '支持 mp3、wav、m4a 等常见格式，建议不超过 4 MB。给「收到消息」或「发送消息」各挑一条音频，也可以两条用同一条。'
              : settings.soundSend
                ? '两种音效都按微信的收发提示音现场合成：收到是下行大三度的「叮咚」，发送是短促的「咻」。不打包任何第三方音频文件；想换成自己的声音，把音源改成「我的音频」。'
                : '内置音按微信的接收提示音现场合成，不打包任何第三方音频文件；想换成自己的声音，改选「我的音频」。'}
          </p>
          {soundError && <p className="video-option-note" role="alert" style={{ color: '#a4382c' }}><AlertTriangle size={12} /> {soundError}</p>}
        </div>}

        <p className="video-summary">
          <b>预计约 {Math.max(1, Math.round(estimatedMs / 1000))} 秒</b>完成：{scrolling ? '先把整段对话合成为一张长图，再按设定的时长实时录制' : '先逐条渲染画面，再实时录制'}，两段耗时相加。<br />
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

/** 某一类提示音在当前音源下的说明：内置音写声样，「我的音频」写已选的哪一条。 */
function describeKind(kind: NotifyKind, settings: VideoExportSettings, customSource: boolean) {
  if (!customSource) return kind === 'received' ? ' 两声「叮咚」（下行大三度）' : ' 微信式「咻」，和接收的不一样'
  const picked = settings.customSounds[kind]
  return picked ? ` 已选：${picked.name}（${picked.durationSeconds.toFixed(1)} 秒）` : ' 未选择，仍用内置合成音'
}

/** 「我的音频」音源下，某一类提示音的两个入口：直接传文件，或去音效库挑。 */
function SoundKindActions({ kind, current, onPickFile, onOpenLibrary, libraryCount }: {
  kind: NotifyKind
  current: { name: string; durationSeconds: number } | null
  onPickFile: () => void
  onOpenLibrary?: (kind: NotifyKind) => void
  libraryCount: number
}) {
  return <>
    <Button type="button" className="btn btn-outline" title={current ? `更换「${kind === 'received' ? '收到' : '发送'}消息」的音效` : '上传一条音频'} onClick={onPickFile}><Music size={14} /> {current ? '更换' : '选择音频'}</Button>
    {onOpenLibrary && <Button type="button" className="btn btn-outline" title="从音效库挑一条（可管理已上传的音效）" onClick={() => onOpenLibrary(kind)}><FolderOpen size={14} /> 音效库{libraryCount > 0 ? `（${libraryCount}）` : ''}</Button>}
  </>
}

interface VideoProgressOverlayProps {
  stage: 'render' | 'record'
  current: number
  total: number
  elapsedMs: number
  totalMs: number
  /**
   * 渲染阶段的说明。滚动视频是「一次性合成一张长图」，没有逐帧的进度可报，
   * 这时候沿用逐帧的文案会让人以为卡住了。
   */
  renderHint?: string
  onCancel: () => void
}

/** 渲染与录制合成一条进度条，避免用户以为卡住。 */
export function VideoProgressOverlay({ stage, current, total, elapsedMs, totalMs, renderHint, onCancel }: VideoProgressOverlayProps) {
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
          ? renderHint ?? `第 ${Math.min(current, total)} / ${total} 帧，正在逐条生成对话画面…`
          : `已录制 ${seconds(elapsedMs)} / ${seconds(totalMs)} 秒，请不要切换标签页。`}
      </p>
      <div className="video-progress-actions"><Button type="button" variant="outline" onClick={onCancel}>取消生成</Button></div>
    </div>
  </div>
}
