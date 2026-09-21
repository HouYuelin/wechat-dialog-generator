import { SegmentedControl } from './ui/controls'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Popover } from '@base-ui/react/popover'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Eye, Maximize2, Minimize2, PencilLine, Smartphone } from 'lucide-react'
import {
  clampPhoneWidth,
  clampScreenSize,
  defaultScreenSize,
  maxPhoneWidth,
  maxScreenHeight,
  maxScreenWidth,
  minPhoneWidth,
  minScreenAspect,
  minScreenHeight,
  minScreenWidth,
  phoneAspect,
  phoneDisplayHeight,
  phoneDisplayScale,
  phoneSizePresets,
  resolvePhoneWidth,
  resolveScreenSize,
  screenPresetIdFor,
  screenSizeLabel,
  screenSizePreset,
  screenSizePresets,
  type PhoneSizeId,
  type ScreenSize,
  type ScreenSizeId,
} from '@/lib/phone-size'
import {
  clampImageMax,
  imagePresetIdFor,
  imageSizeLabel,
  imageSizePreset,
  imageSizePresets,
  maxImageMax,
  minImageMax,
  normalizeImageMax,
  resolveImageMax,
  type ImageSizeId,
} from '@/lib/image-size'
import {
  clampFontScale,
  fontScaleIdFor,
  fontScaleLabel,
  fontScalePreset,
  fontScalePresets,
  maxFontScale,
  minFontScale,
  normalizeFontScale,
  resolveFontScale,
  type FontScaleId,
} from '@/lib/font-size'
import { videoFrameLabel, videoFrameLayout, videoFrameReady, type VideoFrameOutput } from '@/lib/video-frame'
import { videoContentScreen } from '@/lib/video-padding'
import { SidePadOption } from './SidePadOption'
import { getWorkspacePrefs, patchWorkspacePrefs } from '@/lib/workspace-prefs-store'
import './Workspace.css'

/** 视频取景框：把预览换成「导出成视频的那一帧」。 */
export interface WorkspaceVideoFrame {
  /** 视频画布尺寸，与导出用的那个一致。 */
  output: VideoFrameOutput
  /** 画布底色，与录制时填充的是同一个（对话背景色）。 */
  background: string
}

interface WorkspacePanelsProps {
  children: ReactNode
  preview: ReactNode
  previewActions?: ReactNode
  previewTitle?: string
  previewDescription?: string
  /** 传了才显示「屏幕尺寸（导出分辨率）」这一段；不传的工作区行为完全不变。 */
  screen?: ScreenSize
  onScreenChange?: (screen: ScreenSize) => void
  /** 传了才显示「图片大小」这一段，取值来自 PhoneSettings.imageMax。 */
  imageMax?: number
  onImageMaxChange?: (value: number) => void
  /** 传了才显示「字体大小」这一段，取值来自 PhoneSettings.fontScale。 */
  fontScale?: number
  onFontScaleChange?: (value: number) => void
  /** 两侧安全留白的当前值（输出像素，见 lib/video-padding.ts）。 */
  videoSidePad?: number
  /** 传了才在尺寸弹层里出现「两侧留白」那一段。 */
  onVideoSidePadChange?: (value: number) => void
  /** 给了、并且留白不为 0，预览就换成视频取景框（见 lib/video-frame.ts）。 */
  videoFrame?: WorkspaceVideoFrame | null
}

interface SizeChoice {
  id: PhoneSizeId
  label: string
  detail: string
  note: string
}

const sizeChoices: SizeChoice[] = [
  { id: 'auto', label: '自适应', detail: '跟随面板', note: '跟随面板剩余空间自动缩放，窗口变化时会跟着变。' },
  ...phoneSizePresets.map(preset => ({ id: preset.id as PhoneSizeId, label: preset.label, detail: `${preset.width}px`, note: preset.note })),
  { id: 'custom', label: '自定义', detail: `${minPhoneWidth}–${maxPhoneWidth}px`, note: '手动输入宽度，高度按屏幕比例自动换算。' },
]

const screenRangeNote = `可填 ${minScreenWidth}–${maxScreenWidth} × ${minScreenHeight}–${maxScreenHeight}，高度至少是宽度的 ${minScreenAspect} 倍。`

const imageCustomNote = `可填 ${minImageMax}–${maxImageMax}px；超过上限气泡会把图片裁掉。`

const fontCustomNote = `可填 ${minFontScale}–${maxFontScale}%；调小能让一屏放下更多消息。`

function draftText(size: ScreenSize) {
  return { width: String(size.width), height: String(size.height) }
}

/** Shared editor/preview layout. Only the editor scrolls; export actions stay in reach. */
export function WorkspacePanels({ children, preview, previewActions, previewTitle = '实时预览', previewDescription = '画面随编辑更新，导出保留原始清晰度', screen, onScreenChange, imageMax, onImageMaxChange, fontScale, onFontScaleChange, videoSidePad, onVideoSidePadChange, videoFrame }: WorkspacePanelsProps) {
  const screenSize = screen ?? defaultScreenSize
  const screenLabel = screenSizeLabel(screenSize)
  const aspect = phoneAspect(screenSize)
  const imageMaxValue = normalizeImageMax(imageMax)
  const fontScaleValue = normalizeFontScale(fontScale)
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  // autoWidth 是量出来的自适应宽度；sizeMode 是用户手动选定的档位，选 auto 时才会用前者。
  // 档位与自定义宽度跟着偏好长期留着：录屏取景时这几个数选过一次就不想再调。
  const [autoWidth, setAutoWidth] = useState(300)
  const [sizeMode, setSizeMode] = useState<PhoneSizeId>(() => getWorkspacePrefs().display.phoneSize)
  const [customWidth, setCustomWidth] = useState(() => getWorkspacePrefs().display.customPhoneWidth)
  const [customDraft, setCustomDraft] = useState(() => String(getWorkspacePrefs().display.customPhoneWidth))
  // 屏幕尺寸的最终值由父级保存（导出要用），这里只维护弹层里的档位和草稿。
  const [screenMode, setScreenMode] = useState<ScreenSizeId>(() => screenPresetIdFor(screen ?? defaultScreenSize))
  const [screenDraft, setScreenDraft] = useState<ScreenSize>(screen ?? defaultScreenSize)
  const [screenDraftText, setScreenDraftText] = useState(() => draftText(screen ?? defaultScreenSize))
  // 图片大小的真值同样由父级存进 settings，这里只维护弹层里的档位与草稿。
  // 弹层关闭时整棵子树会被卸载（Popover 的 Portal 默认 keepMounted=false），每次打开都按
  // 当前值重新初始化，所以不需要额外监听外部变化——切项目、套模板后重新打开就是新值。
  const [imageMode, setImageMode] = useState<ImageSizeId>(() => imagePresetIdFor(imageMaxValue))
  const [imageDraft, setImageDraft] = useState(imageMaxValue)
  const [imageDraftText, setImageDraftText] = useState(() => String(imageMaxValue))
  // 字体大小的真值同样由父级存进 settings，这里只维护弹层里的档位与草稿。
  const [fontMode, setFontMode] = useState<FontScaleId>(() => fontScaleIdFor(fontScaleValue))
  const [fontDraft, setFontDraft] = useState(fontScaleValue)
  const [fontDraftText, setFontDraftText] = useState(() => String(fontScaleValue))
  // 专注模式：隐藏编辑区，给手机画面更大的显示区域，方便录屏时取景更干净。
  const [focus, setFocus] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  // 「窗口大小」这个档位管的是画面占多宽的槽位。开着取景框时，这个槽位给的是取景框
  // （= 视频画布）的宽度：手机在画布里占多大由导出比例决定，不再是这个数。
  const slotWidth = resolvePhoneWidth(sizeMode, customWidth, autoWidth)
  const frame = videoFrame && (videoSidePad ?? 0) > 0
    ? videoFrameLayout(slotWidth, videoFrame.output, screenSize, videoSidePad)
    : null
  const frameLayout = frame && videoFrameReady(frame) ? frame : null
  const phoneWidth = frameLayout ? frameLayout.phoneWidth : slotWidth
  // 取景框开着时，手机的画面比例要换成成片那一份（铺满上下、只左右留白），否则它会按原始
  // 屏幕比例渲染——比框矮一截，上下各空一块，看着就成了「四周留白」。父级渲染 PhonePreview
  // 时传的是同一个值（见 App.tsx 的 videoScreen、BatchStudio 的 videoScreen），两边必须一致。
  const frameScreen = frameLayout && videoFrame
    ? videoContentScreen(screenSize, { width: videoFrame.output.width, height: videoFrame.output.height }, videoSidePad)
    : screenSize
  // 高度一律从宽度换算（见 phoneDisplayHeight）：容器高度与缩放后的画面高度必须来自
  // 同一个数，否则取景框里会露出一条 1px 的缝。
  const phoneHeight = phoneDisplayHeight(phoneWidth, frameScreen)
  const sizeChoice = sizeChoices.find(choice => choice.id === sizeMode) ?? sizeChoices[0]
  const screenChoice = screenSizePreset(screenMode)
  const imageChoice = imageSizePreset(imageMode)
  const fontChoice = fontScalePreset(fontMode)
  // 自适应宽度按「实际要放进去的那个框」算比例：开着取景框时框是视频画布，它比手机宽，
  // 拿手机比例去算会让取景框顶到面板两边。宽度上限一并放宽——多出来的宽度全给取景框，
  // 手机在里面的相对大小不变，但整体更接近成片的观感。
  const layoutAspect = frameLayout ? frameLayout.canvasHeight / frameLayout.canvasWidth : aspect
  const layoutLimit = focus ? 620 : frameLayout ? 380 : 340

  useEffect(() => {
    const node = bodyRef.current
    if (!node) return
    const apply = (width: number, height: number) => {
      if (width < 1) return
      // 高度才是竖屏手机的主要约束，宽度上限只兜住极宽的窗口。
      setAutoWidth(Math.min(layoutLimit, width, Math.max(160, height / layoutAspect)))
    }
    const observer = new ResizeObserver(([entry]) => apply(entry.contentRect.width, entry.contentRect.height))
    observer.observe(node)
    // 切换专注模式时容器宽度可能不变（窄屏），这里主动量一次，保证上限立即生效。
    const style = getComputedStyle(node)
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    apply(node.clientWidth - horizontalPadding, node.clientHeight - horizontalPadding)
    return () => observer.disconnect()
  }, [layoutAspect, layoutLimit])

  /** 记住窗口宽度的档位与自定义值（只改 display 那一半，其余偏好不动）。 */
  const rememberDisplay = (next: { phoneSize?: PhoneSizeId; customPhoneWidth?: number }) => {
    patchWorkspacePrefs({ display: { ...getWorkspacePrefs().display, ...next } })
  }

  const chooseSize = (id: PhoneSizeId) => {
    setSizeMode(id)
    // 从别的档位切过来时，先把草稿对齐到当前实际宽度，免得输入框里是上一次的旧值。
    if (id === 'custom') {
      const next = clampPhoneWidth(slotWidth)
      setCustomWidth(next)
      setCustomDraft(String(next))
      rememberDisplay({ phoneSize: id, customPhoneWidth: next })
      return
    }
    rememberDisplay({ phoneSize: id })
  }

  // 输入过程中不夹取，否则输到一半的「4」会被立刻顶成 200，和用户抢输入。
  const commitCustom = (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    const next = clampPhoneWidth(Number.isNaN(parsed) ? customWidth : parsed)
    setCustomWidth(next)
    setCustomDraft(String(next))
    rememberDisplay({ customPhoneWidth: next })
  }

  const chooseScreen = (id: ScreenSizeId) => {
    setScreenMode(id)
    if (id === 'custom') {
      const next = clampScreenSize(screenSize)
      setScreenDraft(next)
      setScreenDraftText(draftText(next))
      onScreenChange?.(next)
      return
    }
    onScreenChange?.(resolveScreenSize(id, screenDraft))
  }

  // 同样只在失焦 / 回车时夹取，宽高一起提交。
  const commitScreen = () => {
    const width = Number.parseInt(screenDraftText.width, 10)
    const height = Number.parseInt(screenDraftText.height, 10)
    const next = clampScreenSize({
      width: Number.isNaN(width) ? screenDraft.width : width,
      height: Number.isNaN(height) ? screenDraft.height : height,
    })
    setScreenDraft(next)
    setScreenDraftText(draftText(next))
    onScreenChange?.(next)
  }

  const chooseImage = (id: ImageSizeId) => {
    setImageMode(id)
    // 切到自定义时先把草稿对齐到当前实际值，免得输入框里留着上一次的旧数字。
    const next = resolveImageMax(id, imageMaxValue)
    if (id === 'custom') {
      setImageDraft(next)
      setImageDraftText(String(next))
    }
    onImageMaxChange?.(next)
  }

  // 和窗口宽度一样只在失焦 / 回车时夹取，输到一半的「5」不会被立刻顶成最小值。
  const commitImage = () => {
    const parsed = Number.parseInt(imageDraftText, 10)
    const next = clampImageMax(Number.isNaN(parsed) ? imageDraft : parsed)
    setImageDraft(next)
    setImageDraftText(String(next))
    onImageMaxChange?.(next)
  }

  const chooseFont = (id: FontScaleId) => {
    setFontMode(id)
    // 切到自定义时先把草稿对齐到当前实际值，免得输入框里留着上一次的旧数字。
    const next = resolveFontScale(id, fontScaleValue)
    if (id === 'custom') {
      setFontDraft(next)
      setFontDraftText(String(next))
    }
    onFontScaleChange?.(next)
  }

  // 同样是失焦 / 回车才提交，输到一半的「8」不会被立刻顶成下限。
  const commitFont = () => {
    const parsed = Number.parseInt(fontDraftText, 10)
    const next = clampFontScale(Number.isNaN(parsed) ? fontDraft : parsed)
    setFontDraft(next)
    setFontDraftText(String(next))
    onFontScaleChange?.(next)
  }

  const sizeTriggerLabel = [
    `${frameLayout ? '取景框宽度' : '聊天窗口大小'}：${sizeChoice.label} ${slotWidth}px`,
    screen ? `屏幕 ${screenLabel}` : '',
    imageMax === undefined ? '' : `图片 ${imageSizeLabel(imageMode, imageMaxValue)}`,
    fontScale === undefined ? '' : `字体 ${fontScaleLabel(fontMode, fontScaleValue)}`,
    videoSidePad === undefined ? '' : `两侧留白 ${videoSidePad}px`,
  ].filter(Boolean).join('；')

  return <div className="workspace-panels" data-mobile-view={view} data-focus={focus}>
    <SegmentedControl className="workspace-mobile-views" aria-label="工作区视图" value={view} onValueChange={value => setView(value as typeof view)} options={[{value: 'edit', label: <><PencilLine size={15} /> 编辑内容</>}, {value: 'preview', label: <><Eye size={15} /> 预览与导出</>}]} />
    <section className="workspace-editor-scroll" aria-label="内容编辑区" tabIndex={0}>{children}</section>
    <aside className="workspace-preview" aria-label="固定预览区">
      <header className="workspace-preview-header"><div><Smartphone size={16} /><h2>{previewTitle}</h2></div><p>{previewDescription}</p>
        {/* 取景框开着的时候，预览看到的不是手机本身而是导出成视频的那一帧，这里说清楚。 */}
        {frameLayout && videoFrame && <p className="workspace-preview-frame">{videoFrameLabel(videoFrame.output, videoSidePad ?? 0)} · 手机铺满上下，两侧那两条就是被平台裁掉或浮层压住的部分；图片与长截图会照同样的像素加在左右两头。</p>}
        <div className="workspace-preview-tools">
          <Popover.Root modal={false}>
            <Popover.Trigger render={<Button variant="ghost" size="icon" type="button" className="workspace-size-toggle" aria-label={sizeTriggerLabel} title={sizeTriggerLabel} />}><Smartphone size={14} /></Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner sideOffset={6} align="end" className="workspace-size-positioner">
                <Popover.Popup className="workspace-size-popup" aria-label={`聊天窗口${screen ? '、屏幕' : ''}${imageMax === undefined ? '' : '、图片'}${fontScale === undefined ? '' : '、字体'}${onVideoSidePadChange === undefined ? '' : '、两侧留白'}的大小设置`}>
                  <div className="workspace-size-head"><span>{frameLayout ? '取景框宽度' : '预览显示'}</span><small>当前 {slotWidth}px</small></div>
                  <div className="workspace-size-list" role="radiogroup" aria-label="窗口大小档位">
                    {sizeChoices.map(choice => <button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={sizeMode === choice.id}
                      className="workspace-size-item"
                      data-active={sizeMode === choice.id}
                      onClick={() => chooseSize(choice.id)}
                    >
                      <span className="workspace-size-item-label">{choice.label}</span>
                      <span className="workspace-size-item-detail">{choice.detail}</span>
                    </button>)}
                  </div>
                  {sizeMode === 'custom' && <div className="workspace-size-custom">
                    <label htmlFor="workspace-size-custom-input">宽度</label>
                    <Input
                      id="workspace-size-custom-input"
                      type="number"
                      inputMode="numeric"
                      min={minPhoneWidth}
                      max={maxPhoneWidth}
                      step={10}
                      value={customDraft}
                      onChange={event => setCustomDraft(event.target.value)}
                      onBlur={() => commitCustom(customDraft)}
                      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitCustom(customDraft) } }}
                    />
                    <span>px</span>
                  </div>}
                  <p className="workspace-size-note">{sizeChoice.note}</p>
                  <p className="workspace-size-note">
                    {frameLayout
                      ? '取景框开着的时候，这里调的是取景框（视频画布）的宽度；手机在画布里占多大由导出比例决定。图片导出不受影响。'
                      : screen ? '只影响这里的显示大小，导出分辨率看下面的屏幕尺寸。' : '只影响这里的显示大小，导出的图片尺寸不变。'}
                  </p>
                  {screen && <div className="workspace-size-section">
                    <div className="workspace-size-head"><span>屏幕尺寸</span><small>导出 {screenLabel}</small></div>
                    <div className="workspace-size-grid" role="radiogroup" aria-label="屏幕分辨率">
                      {screenSizePresets.map(preset => <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={screenMode === preset.id}
                        className="workspace-size-chip"
                        data-active={screenMode === preset.id}
                        onClick={() => chooseScreen(preset.id)}
                      >{preset.label}</button>)}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={screenMode === 'custom'}
                        className="workspace-size-chip workspace-size-chip-wide"
                        data-active={screenMode === 'custom'}
                        onClick={() => chooseScreen('custom')}
                      >自定义宽高</button>
                    </div>
                    {screenMode === 'custom' && <div className="workspace-size-custom workspace-size-custom-row">
                      <label htmlFor="workspace-screen-width">宽</label>
                      <Input
                        id="workspace-screen-width"
                        type="number"
                        inputMode="numeric"
                        min={minScreenWidth}
                        max={maxScreenWidth}
                        step={10}
                        aria-label="屏幕宽度"
                        value={screenDraftText.width}
                        onChange={event => setScreenDraftText(text => ({ ...text, width: event.target.value }))}
                        onBlur={commitScreen}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitScreen() } }}
                      />
                      <span>×</span>
                      <label htmlFor="workspace-screen-height">高</label>
                      <Input
                        id="workspace-screen-height"
                        type="number"
                        inputMode="numeric"
                        min={minScreenHeight}
                        max={maxScreenHeight}
                        step={10}
                        aria-label="屏幕高度"
                        value={screenDraftText.height}
                        onChange={event => setScreenDraftText(text => ({ ...text, height: event.target.value }))}
                        onBlur={commitScreen}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitScreen() } }}
                      />
                      <span>px</span>
                    </div>}
                    <p className="workspace-size-note">{screenChoice ? screenChoice.note : screenRangeNote}</p>
                    <p className="workspace-size-note">导出的图片和视频按这个分辨率输出，预览里的画面比例也会跟着变。</p>
                  </div>}
                  {imageMax !== undefined && <div className="workspace-size-section">
                    <div className="workspace-size-head"><span>图片大小</span><small>当前 {imageMaxValue}px</small></div>
                    <div className="workspace-size-grid" role="radiogroup" aria-label="图片消息大小">
                      {imageSizePresets.map(preset => <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={imageMode === preset.id}
                        className="workspace-size-chip"
                        data-active={imageMode === preset.id}
                        onClick={() => chooseImage(preset.id)}
                      >{preset.label} {preset.max}</button>)}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={imageMode === 'custom'}
                        className="workspace-size-chip workspace-size-chip-wide"
                        data-active={imageMode === 'custom'}
                        onClick={() => chooseImage('custom')}
                      >自定义最长边</button>
                    </div>
                    {imageMode === 'custom' && <div className="workspace-size-custom">
                      <label htmlFor="workspace-image-max">最长边</label>
                      <Input
                        id="workspace-image-max"
                        type="number"
                        inputMode="numeric"
                        min={minImageMax}
                        max={maxImageMax}
                        step={10}
                        value={imageDraftText}
                        onChange={event => setImageDraftText(event.target.value)}
                        onBlur={commitImage}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitImage() } }}
                      />
                      <span>px</span>
                    </div>}
                    <p className="workspace-size-note">{imageChoice ? imageChoice.note : imageCustomNote}</p>
                    <p className="workspace-size-note">图片按最长边等比缩放，不改比例；预览、导出图片和视频用的是同一个值。</p>
                  </div>}
                  {fontScale !== undefined && <div className="workspace-size-section">
                    <div className="workspace-size-head"><span>字体大小</span><small>当前 {fontScaleValue}%</small></div>
                    <div className="workspace-size-grid" role="radiogroup" aria-label="对话字体大小">
                      {fontScalePresets.map(preset => <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={fontMode === preset.id}
                        className="workspace-size-chip"
                        data-active={fontMode === preset.id}
                        onClick={() => chooseFont(preset.id)}
                      >{preset.label} {preset.scale}%</button>)}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={fontMode === 'custom'}
                        className="workspace-size-chip workspace-size-chip-wide"
                        data-active={fontMode === 'custom'}
                        onClick={() => chooseFont('custom')}
                      >自定义比例</button>
                    </div>
                    {fontMode === 'custom' && <div className="workspace-size-custom">
                      <label htmlFor="workspace-font-scale">比例</label>
                      <Input
                        id="workspace-font-scale"
                        type="number"
                        inputMode="numeric"
                        min={minFontScale}
                        max={maxFontScale}
                        step={5}
                        value={fontDraftText}
                        onChange={event => setFontDraftText(event.target.value)}
                        onBlur={commitFont}
                        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitFont() } }}
                      />
                      <span>%</span>
                    </div>}
                    <p className="workspace-size-note">{fontChoice ? fontChoice.note : fontCustomNote}</p>
                    <p className="workspace-size-note">字号、行高、气泡留白与头像会一起缩放，一屏能放下的消息条数跟着变；预览与导出用的是同一个值。</p>
                  </div>}
                  {/* 留白放在预览这边调：弹层不挡画面，调多少预览里的取景框就变多少。 */}
                  {onVideoSidePadChange !== undefined && <div className="workspace-size-section">
                    <SidePadOption variant="popover" value={videoSidePad ?? 0} onChange={onVideoSidePadChange} />
                  </div>}
                  <p className="workspace-size-note">这一段里的几项（窗口大小、屏幕尺寸、图片大小、字号、两侧留白）都会被记住：刷新页面、新建空白对话、导入新的聊天内容都继续沿用，不会回到默认值。</p>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
          <Button variant="ghost" size="icon" type="button" className="workspace-focus-toggle" aria-pressed={focus} aria-label={focus ? '退出专注模式' : '专注模式（隐藏编辑区，放大预览）'} title={focus ? '退出专注模式' : '专注模式：隐藏编辑区，放大预览'} onClick={() => setFocus(value => !value)}>{focus ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</Button>
        </div>
      </header>
      <div className="workspace-preview-body" ref={bodyRef} style={{ '--workspace-phone-width': `${phoneWidth}px`, '--workspace-phone-scale': phoneDisplayScale(phoneWidth), '--workspace-phone-height': `${phoneHeight}px` } as CSSProperties}>
        {/* 取景框：手机按导出比例缩进画布居中，露出来的底色就是成片里那两条边带。 */}
        {frameLayout && videoFrame
          ? <div className="workspace-video-frame" style={{ width: frameLayout.canvasWidth, height: frameLayout.canvasHeight, background: videoFrame.background }}>{preview}</div>
          : preview}
      </div>
      {previewActions && <footer className="workspace-preview-actions">{previewActions}</footer>}
    </aside>
  </div>
}
