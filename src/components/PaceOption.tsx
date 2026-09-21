import { SegmentedControl, Slider } from './ui/controls'
import {
  clampLeadInMs,
  clampPaceGapMs,
  clampPaceMs,
  clampTailMs,
  gapStepMs,
  leadInStepMs,
  maxGapMs,
  maxLeadInMs,
  maxPaceMs,
  maxTailMs,
  minGapMs,
  minLeadInMs,
  minPaceMs,
  minTailMs,
  normalizeMessageGaps,
  paceGapLabel,
  paceModeLabels,
  paceModes,
  paceSecondsLabel,
  paceStepMs,
  tailStepMs,
  type PaceMode,
  type PaceSetting,
} from '@/lib/chat-playback'
import { Button } from './ui/button'

interface PaceOptionProps {
  setting: PaceSetting
  /** 消息条数：逐条列表的行数 = 条数 - 1（首条消息前面是开场静置，不算间隔）。 */
  messageCount: number
  /** 每条消息的摘要，长度与消息条数一致；逐条列表用它标出「这是在设哪一条前面」。 */
  labels?: readonly string[]
  disabled?: boolean
  /** dialog 把说明写全（导出弹窗），bar 只说一句（预览上方那一栏本来就窄）。 */
  variant?: 'dialog' | 'bar'
  /** 只给统一间隔：批量页整批共用一份设置，逐条间隔属于某一段具体的对话。 */
  uniformOnly?: boolean
  onChange: (next: PaceSetting) => void
}

/**
 * 消息出现的节奏：**统一间隔**与**逐条设置**两种设法，用户自己挑。
 *
 * 为什么这么改：原来是「快 0.8 秒 / 标准 1.5 秒 / 慢 2.5 秒」三个档，0.8 与 1.5 之间跨度太大，
 * 想做 1 秒上下的效果没有地方可选；而有些对话就是要一两条停顿特别长（对方「正在输入」），
 * 三档也表达不了。现在：
 * - 统一间隔用滑杆，0.5–3 秒，每格 0.1 秒；
 * - 逐条设置给 N-1 个间隔（N 条消息），每行一个滑杆，范围 0.2–10 秒，
 *   既能压到「连着发」的密度，也能做出「隔了很久才回」的停顿；行上带消息摘要，一眼看出在设哪一条；
 * - 两种模式的取值各自留着，来回切不会把另一份冲掉。逐条模式里的统一间隔还兼作
 *   「新消息的默认间隔」——导入更长的对话后，多出来的间隔就按它出现，改起来才有起点。
 *
 * 这个值同时决定预览播放与导出视频（同一条时间轴，见 lib/chat-playback.ts），
 * 所以在这里调完，导出就是看到的那一版。导出弹窗与预览上方的控制条共用本组件。
 */
export function PaceOption({
  setting, messageCount, labels, disabled, variant = 'dialog', uniformOnly = false, onChange,
}: PaceOptionProps) {
  const uniform = clampPaceMs(setting.paceMs)
  const leadIn = clampLeadInMs(setting.leadInMs)
  const tail = clampTailMs(setting.tailMs)
  const gapCount = Math.max(0, messageCount - 1)
  const perMessage = !uniformOnly && setting.mode === 'perMessage'
  const gaps = perMessage ? normalizeMessageGaps(setting.gaps, messageCount, uniform) : []
  const noteClass = variant === 'dialog' ? 'video-option-note' : 'chat-playback-hint'

  const setMode = (mode: PaceMode) => onChange({ ...setting, mode })
  const setUniform = (ms: number) => onChange({ ...setting, paceMs: clampPaceMs(ms) })
  const setLeadIn = (ms: number) => onChange({ ...setting, leadInMs: clampLeadInMs(ms) })
  const setTail = (ms: number) => onChange({ ...setting, tailMs: clampTailMs(ms) })
  const setGap = (index: number, ms: number) => {
    const next = normalizeMessageGaps(setting.gaps, messageCount, uniform)
    next[index] = clampPaceGapMs(ms)
    onChange({ ...setting, gaps: next })
  }

  return <>
    {!uniformOnly && <SegmentedControl
      aria-label="消息间隔怎么设"
      value={setting.mode}
      disabled={disabled}
      onValueChange={value => setMode(value as PaceMode)}
      options={paceModes.map(mode => ({ value: mode, label: paceModeLabels[mode] }))}
    />}

    {/* 逐条模式下这一条是「新间隔的默认值」：导入更长的对话时，多出来的间隔按它来。 */}
    <div className="pace-uniform">
      <span className="pace-uniform-label">{perMessage ? '默认' : '每条间隔'}</span>
      <Slider
        aria-label={perMessage ? '新增间隔的默认值（秒）' : '消息之间的间隔（秒）'}
        min={minPaceMs}
        max={maxPaceMs}
        step={paceStepMs}
        disabled={disabled}
        value={uniform}
        onValueChange={setUniform}
      />
      <span className="pace-value">{paceSecondsLabel(uniform)} 秒</span>
    </div>

    {/* 首条消息出现前的静置：可设成 0 让第一条立刻出来。 */}
    <div className="pace-uniform">
      <span className="pace-uniform-label">开场静置</span>
      <Slider
        aria-label="首条消息出现前的等待（秒）"
        min={minLeadInMs}
        max={maxLeadInMs}
        step={leadInStepMs}
        disabled={disabled}
        value={leadIn}
        onValueChange={setLeadIn}
      />
      <span className="pace-value">{paceSecondsLabel(leadIn)} 秒</span>
    </div>

    {/* 末条消息之后的留白：结尾那一帧停多久，可设成 0 让最后一条发完立刻收尾。 */}
    <div className="pace-uniform">
      <span className="pace-uniform-label">结尾时长</span>
      <Slider
        aria-label="末条消息之后的结尾留白（秒）"
        min={minTailMs}
        max={maxTailMs}
        step={tailStepMs}
        disabled={disabled}
        value={tail}
        onValueChange={setTail}
      />
      <span className="pace-value">{paceSecondsLabel(tail)} 秒</span>
    </div>

    <p className={noteClass}>
      {perMessage
        ? `统一间隔留作默认值——新加进来的消息按它出现，也可以把下面所有间隔一键设成 ${paceSecondsLabel(uniform)} 秒。逐条列表每行是“这一条比上一条晚多久出现”，可调 0.2–10 秒；开场静置是第一条消息出现前的等待，结尾时长是末条消息之后的留白，都可设成 0 秒。`
        : '所有消息之间都等这么久（0.5–3 秒）。想让个别几条单独不一样，切到「逐条设置」。开场静置与结尾时长分别控制首条之前、末条之后的留白。这套节奏同时决定预览播放与导出视频，预览里看到的就是导出后的那一版。'}
    </p>

    {perMessage && <div className="pace-gaps">
      <div className="pace-gaps-head">
        <span>逐条间隔{gapCount ? <small>{gapCount} 处</small> : null}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="pace-gaps-fill"
          disabled={disabled || !gapCount}
          title={`把所有间隔都设成 ${paceSecondsLabel(uniform)} 秒`}
          onClick={() => onChange({ ...setting, gaps: Array.from({ length: gapCount }, () => uniform) })}
        >全部设为 {paceSecondsLabel(uniform)} 秒</Button>
      </div>
      {gapCount
        ? <div className="pace-gaps-list">
          {gaps.map((gap, index) => <div className="pace-gap-row" key={index}>
            <span className="pace-gap-label" title={labels?.[index + 1] ?? undefined}>
              <b>{index + 2}</b>{labels?.[index + 1] ?? `第 ${index + 2} 条消息`}
            </span>
            <Slider
              aria-label={`第 ${index + 2} 条消息出现前的间隔（秒）`}
              min={minGapMs}
              max={maxGapMs}
              step={gapStepMs}
              disabled={disabled}
              value={gap}
              onValueChange={value => setGap(index, value)}
            />
            <span className="pace-value">{paceGapLabel(gap)}</span>
          </div>)}
        </div>
        : <p className={noteClass}>只有一条消息，没有间隔可设。</p>}
    </div>}

    {uniformOnly && <p className="video-option-note">批量页整批共用一份设置，而逐条间隔是按某一段对话的第几条排的，套到别的组上就不成立了，所以这里只给统一间隔。要在某一组里逐条设，单独打开那一段对话录。</p>}
  </>
}
