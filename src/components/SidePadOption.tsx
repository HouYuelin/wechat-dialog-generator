import { useId, useState } from 'react'
import { Input } from './ui/input'
import {
  clampVideoSidePad,
  maxVideoSidePad,
  minVideoSidePad,
  resolveVideoSidePad,
  videoSidePadIdFor,
  videoSidePadLabel,
  videoSidePadNote,
  videoSidePadPresets,
  type VideoSidePadPresetId,
} from '@/lib/video-padding'

interface SidePadOptionProps {
  value: number
  onChange: (next: number) => void
  /**
   * 同一个控件出现在两处：导出弹窗（dialog）说明写全，预览右上角那个尺寸弹层（popover）
   * 只留一句——它本来就窄，而且旁边就是实时画面。
   */
  variant?: 'dialog' | 'popover'
}

/**
 * 两侧安全留白：上面几个筹码是快捷档，下面的输入框可以填任意像素值。
 *
 * 为什么需要它：9:16 的视频发到抖音，在 iPhone Pro Max 这类 19.5:9 的屏幕上会被「铺满」
 * 播放，左右两边各被裁掉约 9%，右侧按钮栏、左下角文字这些浮层也压在两侧；图文被裁掉、
 * 被压住的同样是左右两头。左右各让出一段底色，被裁掉和被压住的就是这两条空白。
 *
 * 图片与视频的落地方式不一样（见 lib/video-padding.ts）：图片直接在导出图左右各加 N 像素、
 * 比例不变；视频的画布尺寸固定，留白越过画面自然留边时会把手机的比例换成「画布去掉两侧
 * 留白」那一份，于是手机铺满上下、只左右留白（多出来的高度落在聊天区，消息一条不动）。
 * 等比缩小做不到这件事——那样宽高一起缩，上下也会空出来。
 *
 * 草稿只在失焦 / 回车时提交（输到一半的「1」不会被立刻夹成 10）。草稿状态放在这个子组件
 * 里，而它挂在会随开关卸载的弹层内部，所以草稿天然跟着打开时的当前值走，不需要同步 effect。
 * 两处共用同一个值（见 VideoExportDialog 与 WorkspacePanels），在哪调都一样。
 */
export function SidePadOption({ value, onChange, variant = 'dialog' }: SidePadOptionProps) {
  const [draft, setDraft] = useState(() => String(value))
  const inputId = useId()
  const active = videoSidePadIdFor(value)
  const choose = (id: VideoSidePadPresetId) => {
    const next = resolveVideoSidePad(id, value)
    setDraft(String(next))
    onChange(next)
  }
  const commit = () => {
    const parsed = Number.parseInt(draft, 10)
    const next = clampVideoSidePad(Number.isNaN(parsed) ? value : parsed)
    setDraft(String(next))
    onChange(next)
  }
  const label = videoSidePadLabel(active, value)

  return <>
    {variant === 'popover'
      ? <div className="workspace-size-head"><span>两侧留白</span><small>{label}</small></div>
      : <h3>两侧留白 <small>{label}</small></h3>}
    <div className="video-safety-grid" role="radiogroup" aria-label="两侧留白档位">
      {videoSidePadPresets.map(preset => <button
        key={preset.id}
        type="button"
        role="radio"
        aria-checked={active === preset.id}
        className="video-safety-chip"
        data-active={active === preset.id}
        onClick={() => choose(preset.id)}
      >{preset.label} {preset.pad}</button>)}
    </div>
    <div className="video-pad-row">
      <label htmlFor={inputId}>左右各</label>
      <Input
        id={inputId}
        type="number"
        inputMode="numeric"
        aria-label="两侧留白像素"
        min={minVideoSidePad}
        max={maxVideoSidePad}
        step={10}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } }}
      />
      <span>px</span>
    </div>
    {variant === 'popover'
      ? <>
        <p className="workspace-size-note">{videoSidePadNote(active, value)}</p>
        <p className="workspace-size-note">图片直接在导出图左右各加这么多（比例不变）；视频里手机铺满上下，只在左右各让出这么多，留白越大手机越细长。留白是「至少」这么多，调到画面本来就有的留边以下不再有效果。</p>
      </>
      : <>
        <p className="video-option-note">{videoSidePadNote(active, value)}</p>
        <p className="video-option-note">图片（截图 / 长截图）直接在导出图左右各加这么多像素，画面比例一个像素都不动；视频里手机铺满画布的上下，只在左右各让出这么多，让出来的空白用对话底色填充——平台裁掉的和浮层压住的就是这两条。留白是「至少」这么多：9:16 这种比手机窄的画布本来就有的左右留边会一起算进去，调到它以下不会再有效果；越过它之后手机的画面比例会跟着框变（聊天区变高，消息一条不动）。</p>
      </>}
  </>
}
