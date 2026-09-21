import { useEffect, useRef, useState } from 'react'
import { Download, FileInput, Layers3, ListChecks, Plus, RotateCcw, Square, Trash2, Video } from 'lucide-react'
import { Button } from './ui/button'
import { Checkbox, SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger } from './ui/controls'
import { ConfirmDialog } from './ui/confirm-dialog'
import { Input } from './ui/input'
import { Progress } from './ui/progress'
import { SelectField } from './ui/select'
import { Textarea } from './ui/textarea'
import { MediaLibraryDialog } from './MediaLibraryDialog'
import { NameSuggest } from './NameSuggest'
import { PhonePreview } from './PhonePreview'
import { SettingsPanel } from './SettingsPanel'
import { UserAvatarManager } from './UserAvatarManager'
import { WorkspacePanels } from './WorkspacePanels'
import { BatchPromptDialog } from './BatchPromptDialog'
import { EmojiPicker } from './EmojiPicker'
import { VideoExportDialog, VideoProgressOverlay, type VideoExportSettings } from './VideoExportDialog'
import { renderBatchChat } from './batch-chat-render'
import { prepareBatchVideo, recordBatchVideo, type BatchVideoMedia } from './batch-video-render'
import { batchVideoDurationMs, batchVideoEstimateMs, batchVideoPlan, batchVideoTask } from '@/lib/batch-video'
import { cardFilename, chatSnapshot, parseBatch, runBatch, videoFilename, zipImages, type BatchJob, type BatchOutput, type CaptureMode, type ChatSnapshot } from '@/lib/batch'
import { BATCH_CHAT_EXAMPLE } from '@/lib/batch-prompt'
import { maxVideoMessages, playbackDurationLabel } from '@/lib/chat-playback'
import { videoFileExtension } from '@/lib/chat-video'
import type { ChatVideoAudioOptions } from '@/lib/chat-video-recorder'
import { videoContentScreen } from '@/lib/video-padding'
import { beginExportLog } from '@/lib/export-log'
import { assignAvatars, formatBytes, isImageMessageKind, mediaAssetsOfKind, type MediaAsset, type MediaImportOutcome, type MediaKind } from '@/lib/media-library'
import { rememberNameHistory } from '@/lib/name-history-store'
import type { NotifyKind } from '@/lib/notify-sound'
import { defaultScreenSize, screenSizeLabel, type ScreenSize } from '@/lib/phone-size'
import { avatarNameKey, isSelfAlias } from '@/lib/user-avatars'
import type { AvatarPreset } from '@/lib/avatar-presets'
import { getWorkspacePrefs, patchWorkspacePrefs } from '@/lib/workspace-prefs-store'
import './BatchStudio.css'

/** 素材库弹窗这次是「为谁打开」的：某一组的某条消息 / 某位角色 / 那一组的聊天背景。 */
type LibraryTarget = { kind: MediaKind; jobId: string; msgId?: number; userId?: number; background?: boolean }

/**
 * 视频导出由 App 提供的那一半：设置与音频都在聊天页那一份状态里，
 * 批量页只负责按组跑队列，所以这里只收「怎么录」和「从哪儿取声音」。
 */
export interface BatchVideoOptions {
  /** 录制方式、画面尺寸、节奏、提示音；与聊天页共用「我的偏好」里的同一份。 */
  settings: VideoExportSettings
  onSettingsChange: (patch: Partial<VideoExportSettings>) => void
  /** 当前浏览器是否支持本地录制视频。 */
  supported: boolean
  /** 编码容器名（MP4 / WebM），只用于显示。 */
  containerLabel: string
  soundLibraryCount: number
  onSoundFile: (file: File, kind: NotifyKind) => void
  onOpenSoundLibrary?: (kind: NotifyKind) => void
  soundError: string
  /** 取音频上下文与自定义提示音；这一批不需要发声时返回 null。必须在用户手势里调用。 */
  resolveAudio: () => ChatVideoAudioOptions | null
}

/** 批量录制时的进度：比单个视频多一个「第几组」的说明。 */
type BatchVideoProgress = {
  label: string
  stage: 'render' | 'record'
  current: number
  total: number
  elapsedMs: number
  totalMs: number
  renderHint?: string
}

export function BatchStudio({
  remaining, unlimited = false, onDebit, onComplete, currentChat,
  // 屏幕尺寸是工作区级偏好（和聊天页同一个值），图片大小与字号按组存进该组的设置里。
  screen = defaultScreenSize, onScreenChange,
  // 素材库：数据与写库动作都由 App 提供，弹窗与选取目标由这里自己管。
  mediaAssets, libraryReady = false, onImportMedia, onMarkAssetUsed, onRemoveAsset, onRenameAsset,
  avatarPresets = [], presetsReady = false, onTouchPreset, onRenamePreset, onRemovePreset, onRememberUsers,
  video,
}: {
  remaining: number; unlimited?: boolean; onDebit: (id: string) => Promise<void>; onComplete: (id: string, output: BatchOutput) => void; currentChat: ChatSnapshot
  screen?: ScreenSize; onScreenChange?: (screen: ScreenSize) => void
  mediaAssets: MediaAsset[]; libraryReady?: boolean
  onImportMedia: (files: File[], kind: MediaKind) => Promise<MediaImportOutcome>
  onMarkAssetUsed: (id: string) => void
  onRemoveAsset?: (asset: MediaAsset) => void
  onRenameAsset?: (asset: MediaAsset, name: string) => void
  avatarPresets?: AvatarPreset[]; presetsReady?: boolean
  /** 让「用过的头像」里的一条排到最前并落盘；具体换到哪一组由批量页自己决定。 */
  onTouchPreset?: (preset: AvatarPreset) => void
  onRenamePreset?: (preset: AvatarPreset, name: string) => boolean
  onRemovePreset?: (preset: AvatarPreset) => void
  onRememberUsers?: (users: ChatSnapshot['users']) => void
  video?: BatchVideoOptions
}) {
  const [text, setText] = useState(BATCH_CHAT_EXAMPLE)
  const [mode, setMode] = useState<CaptureMode>('long')
  const [jobs, setJobs] = useState<BatchJob[]>([])
  const [activeId, setActiveId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [view, setView] = useState<'import' | 'edit'>('import')
  const [editSection, setEditSection] = useState<'content' | 'people' | 'settings'>('content')
  const [picker, setPicker] = useState<LibraryTarget | null>(null)
  // 导出内容（聊天图 / 聊天视频）是整批的开关，记进「我的偏好」：刷新、重新导入都还是上次那个。
  const [output, setOutput] = useState<BatchOutput>(() => getWorkspacePrefs().playback.batchOutput)
  const [videoOpen, setVideoOpen] = useState(false)
  const [videoProgress, setVideoProgress] = useState<BatchVideoProgress | null>(null)
  const stop = useRef(false), running = useRef(false)
  /** 录制阶段的中断标记：停止按钮要同时掐掉正在录的那一条，所以单独留一个令牌给录制链路。 */
  const videoToken = useRef({ cancelled: false })
  // 表情面板要用：批量页有三个地方能插标签，各自记着自己的输入框。
  const batchInputRef = useRef<HTMLTextAreaElement>(null)
  const bodyInputRef = useRef<HTMLTextAreaElement>(null)
  // 逐条消息是一列输入框，共用一个面板：记住「最后聚焦的那一条」，插入时才找得到人。
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
  const [focusedMessageId, setFocusedMessageId] = useState<number | null>(null)
  const active = jobs.find(j => j.id === activeId)
  const selected = jobs.filter(j => j.selected), pending = selected.filter(j => j.state !== 'done')
  const successes = jobs.filter(j => j.state === 'done'), failed = jobs.filter(j => j.state === 'error')

  // ===================== 视频模式（整批共用一份方案） =====================
  // 录制方式、画面尺寸、节奏、提示音都取自「我的偏好」里那一份，所以批量录出来的视频
  // 和聊天页单独录的是同一种东西；这里只把「这一批」的口径算出来给界面看。
  const videoPlan = video ? batchVideoPlan({
    mode: video.settings.mode,
    sizeId: video.settings.size,
    pace: video.settings.pace,
    soundEnabled: video.settings.soundEnabled,
    soundReceive: video.settings.soundReceive,
    soundSend: video.settings.soundSend,
    scrollDurationSeconds: video.settings.scrollDurationSeconds,
    sidePad: video.settings.sidePad,
  }, screen) : null
  // 视频渲染与取景框该用的「屏幕尺寸」：留白越过画面自然留边时，换成「画布去掉两侧留白」的比例，
  // 手机才会铺满上下、只左右留白（见 lib/video-padding.ts）。只有「聊天视频」用它；聊天图仍按
  // 原始屏幕尺寸渲染，与聊天页截图完全一致。
  const videoScreen = output === 'video' && videoPlan
    ? videoContentScreen(screen, { width: videoPlan.size.width, height: videoPlan.size.height }, videoPlan.sidePad)
    : screen
  // 待导出那些组的录制任务：弹窗里的条数、发声数与预计耗时都按这一份口径算。
  // 队列最多 50 组、每组最多 150 条，每次渲染重算一遍比记住它再操心失效更省事；
  // 录制期间进度每 0.2 秒就重渲染一次，那段时间不用算（弹窗也关着），所以跳过。
  const videoTasks = videoPlan && output === 'video' && !busy
    ? pending.map(job => batchVideoTask(job.snapshot?.messages ?? [], videoPlan, job.snapshot?.selfId ?? null))
    : []
  const videoEstimateMs = batchVideoEstimateMs(videoTasks)
  const videoDurationMs = batchVideoDurationMs(videoTasks)
  const videoModeLabel = videoPlan ? (videoPlan.mode === 'scroll' ? '滚动到底' : '逐条播放') : ''
  const videoSizeLabel = videoPlan ? `${videoPlan.size.width}×${videoPlan.size.height}` : ''
  const confirmLabel = output === 'video'
    ? (unlimited ? '确认导出所选聊天视频' : '我确认本批按视频组数使用额度')
    : (unlimited ? '确认导出所选聊天图片' : '我确认本批按聊天图片张数使用额度')
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (jobs.length) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [jobs.length])
  useEffect(() => () => { stop.current = true }, [])
  function updateJob(id: string, patch: Partial<BatchJob>) {
    setJobs(current => current.map(j => j.id === id && !(j.locked && ('snapshot' in patch || 'content' in patch || 'mode' in patch)) ? { ...j, ...patch } : j)); setConfirmed(false)
  }

  /**
   * 换一种产出（聊天图 ↔ 聊天视频）。
   *
   * 已经完成的那一批必须按新产出重来：图片的字节和视频的成片互相不能复用，否则切过去会看到
   * 一排「已完成」却什么也导不出来。所以只保留与新模式匹配的完成状态（视频看 job.video、
   * 图片看 job.bytes），其余退回待生成；重来时用的还是原编号，不会重复扣费。
   */
  function chooseOutput(next: BatchOutput) {
    if (busy || next === output) return
    setOutput(next)
    setConfirmed(false)
    setJobs(current => current.map(job => {
      const matches = next === 'video' ? Boolean(job.video) : Boolean(job.bytes)
      if (job.state !== 'done' || matches) return job
      return { ...job, state: 'ready', locked: false, error: undefined, bytes: undefined, video: undefined }
    }))
    patchWorkspacePrefs({ playback: { ...getWorkspacePrefs().playback, batchOutput: next } })
    setMessage(next === 'video' ? '已切到聊天视频：每组录完立即下载，不打包 ZIP。' : '已切到聊天图：完成后打包成一个 ZIP。')
  }

  /** 把一段成片交给浏览器下载。 */
  function saveVideo(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = filename
    link.href = url
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  // ===================== 素材库（只作用于「当前这一组」） =====================
  // 批量页的选取目标必须落到某一组上，所以弹窗与 picker 都留在本组件里；
  // 库数据与写库动作（上传、删、改名、记使用）由 App 传进来，与聊天页共用同一份。

  /** 只改某一组的样式（图片大小 / 字号 / 聊天背景），不动内容、也不算「已修改」。 */
  function patchJobSettings(id: string, patch: Partial<ChatSnapshot['settings']>) {
    const job = jobs.find(j => j.id === id)
    if (!job?.snapshot || job.locked) return
    setJobs(current => current.map(j => j.id === id ? { ...j, snapshot: { ...j.snapshot!, settings: { ...j.snapshot!.settings, ...patch } } } : j))
  }

  /** 改一条消息的正文：逐条编辑框和表情面板插标签共用；走 updateJob 是为了照样清掉「已确认」。 */
  function patchMessageContent(msgId: number, content: string) {
    const job = jobs.find(j => j.id === activeId)
    if (!job?.snapshot || job.locked) return
    updateJob(job.id, { snapshot: { ...job.snapshot, messages: job.snapshot.messages.map(m => m.id === msgId ? { ...m, content } : m) } })
  }

  /** 改「本组聊天记录」整段文本。逐条编辑框没出现时才走这里，标记为待更新预览。 */
  function patchJobBody(value: string) {
    const job = jobs.find(j => j.id === activeId)
    if (!job || job.locked) return
    updateJob(job.id, { content: { ...job.content, body: value }, dirty: true, error: '对话已修改，请先点击“更新本组预览”。', state: 'error' })
  }

  /** 把一张素材换到某一组的某条消息上，并记一次使用（只影响快捷条排序）。 */
  function applyImageToJob(jobId: string, msgId: number, asset: MediaAsset) {
    onMarkAssetUsed(asset.id)
    setJobs(current => current.map(j => j.id === jobId && j.snapshot ? { ...j, snapshot: { ...j.snapshot, messages: j.snapshot.messages.map(m => m.id === msgId ? { ...m, content: asset.dataUrl } : m) } } : j))
    setMessage(`这条消息的图片已换成「${asset.name}」。`)
  }

  /**
   * 给某一组的某位角色换头像，顺手把「角色名 + 头像」记进用过的头像归档。
   * 记使用（排序）与归档都由调用方决定，这里只管这一组的数据。
   */
  function setJobAvatar(jobId: string, userId: number, avatar: string) {
    const job = jobs.find(j => j.id === jobId)
    if (!job?.snapshot) return
    const users = job.snapshot.users.map(u => u.id === userId ? { ...u, avatar } : u)
    setJobs(current => current.map(j => j.id === jobId ? { ...j, snapshot: { ...j.snapshot!, users } } : j))
    onRememberUsers?.(users)
    const name = users.find(u => u.id === userId)?.name
    setMessage(name ? `已为「${name}」换上这张头像。` : '已换上这张头像。')
  }

  /** 用素材库里的一张当头像。 */
  function applyAvatarToJob(jobId: string, userId: number, asset: MediaAsset) {
    onMarkAssetUsed(asset.id)
    setJobAvatar(jobId, userId, asset.dataUrl)
  }

  /** 把「用过的头像」里的一张还给这一组的同名角色；本组没有这个名字就只记一次使用。 */
  function applyPresetToJob(jobId: string, preset: AvatarPreset) {
    const job = jobs.find(j => j.id === jobId)
    if (!job?.snapshot) return
    const owner = job.snapshot.users.find(user => avatarNameKey(user.name) === avatarNameKey(preset.name))
    if (!owner) { setMessage(`本组里没有「${preset.name}」这个角色，这张头像先留在用过的头像里。`); return }
    onTouchPreset?.(preset)
    setJobAvatar(jobId, owner.id, preset.avatar)
  }

  function applyBackgroundToJob(jobId: string, asset: MediaAsset) {
    onMarkAssetUsed(asset.id)
    patchJobSettings(jobId, { backgroundImage: asset.dataUrl })
    setMessage(`本组聊天背景已换成「${asset.name}」。`)
  }

  /** 在素材库里点一张：按这次弹窗是「为谁打开」决定用到哪里。 */
  function pickAsset(asset: MediaAsset) {
    const target = picker
    if (target?.userId !== undefined && asset.kind === 'avatar') { applyAvatarToJob(target.jobId, target.userId, asset); setPicker(null); return }
    if (target?.msgId !== undefined && isImageMessageKind(asset.kind)) { applyImageToJob(target.jobId, target.msgId, asset); setPicker(null); return }
    if (target?.background && asset.kind === 'background') { applyBackgroundToJob(target.jobId, asset); setPicker(null); return }
    // 从「管理素材库」进来、没有具体目标时，只记一次使用。
    onMarkAssetUsed(asset.id)
  }

  /**
   * 弹窗里现传一张、又明确知道给谁用时直接换上，省掉「传完再点一次使用」；
   * 一次传多张就只入库，让用户自己挑——与聊天页同一条规则。
   */
  async function handleLibraryUpload(files: File[], kind: MediaKind) {
    const outcome = await onImportMedia(files, kind)
    const target = picker
    if (outcome.picked.length === 1 && target) {
      const asset = outcome.picked[0]
      if (target.userId !== undefined && kind === 'avatar') { applyAvatarToJob(target.jobId, target.userId, asset); setPicker(null) }
      else if (target.msgId !== undefined && isImageMessageKind(kind)) { applyImageToJob(target.jobId, target.msgId, asset); setPicker(null) }
      else if (target.background && kind === 'background') { applyBackgroundToJob(target.jobId, asset); setPicker(null) }
    }
    return outcome
  }

  /**
   * 点图片气泡后直接选文件：读图并入素材库，返回可渲染的 data URL。
   * 写回某条消息由 PhonePreview 自己走 onUpdateMessage，这里不用知道是哪一组。
   */
  async function uploadImageFile(file: File) {
    const outcome = await onImportMedia([file], 'sticker')
    const asset = outcome.picked[0]
    if (!asset) { setMessage('这张图片读取失败，请换一张。'); return null }
    return asset.dataUrl
  }

  /** 批量上传头像：按选择顺序发给这一组的角色，多出来的只留在素材库里。 */
  async function batchUploadAvatars(jobId: string, files: File[]) {
    const job = jobs.find(j => j.id === jobId)
    if (!job?.snapshot) return
    const outcome = await onImportMedia(files, 'avatar')
    if (!outcome.picked.length) { setMessage('这些文件都读不出来，请确认选的是图片。'); return }
    const { users, assigned } = assignAvatars(job.snapshot.users, outcome.picked)
    if (assigned) {
      setJobs(current => current.map(j => j.id === jobId ? { ...j, snapshot: { ...j.snapshot!, users } } : j))
      onRememberUsers?.(users)
    }
    const parts = [`已上传 ${outcome.picked.length} 张`]
    if (assigned) parts.push(`按顺序换上 ${assigned} 位角色的头像`)
    if (outcome.picked.length > assigned) parts.push(`多出的 ${outcome.picked.length - assigned} 张已存进素材库`)
    if (outcome.duplicated) parts.push(`其中 ${outcome.duplicated} 张库里已有`)
    if (outcome.rejected) parts.push(`${outcome.rejected} 张超出每类上限未入库`)
    if (outcome.failed) parts.push(`${outcome.failed} 张读取失败`)
    setMessage(`${parts.join('，')}。`)
  }

  /** 给这一组的某一位角色单独传一张头像。 */
  async function batchUploadOneAvatar(jobId: string, userId: number, file: File) {
    const outcome = await onImportMedia([file], 'avatar')
    const asset = outcome.picked[0]
    if (!asset) { setMessage('这张图片读取失败，请换一张。'); return }
    applyAvatarToJob(jobId, userId, asset)
  }

  /** 给某一组换聊天背景：读图入库，返回可直接用的 data URL 给手机样式面板回填。 */
  function uploadBackgroundForJob(jobId: string) {
    return async (file: File) => {
      const outcome = await onImportMedia([file], 'background')
      const asset = outcome.picked[0]
      if (!asset) { setMessage('这张背景图读取失败，请换一张。'); return null }
      // 入库失败只可能是这一类到上限了，如实说一声；正常入库不打扰。
      if (outcome.rejected) setMessage('素材库的背景图已到上限，这张没能存进去（可先删几张再传），本次仍可直接使用。')
      patchJobSettings(jobId, { backgroundImage: asset.dataUrl })
      return asset.dataUrl
    }
  }

  function addChats() {
    try {
      const contents = parseBatch(text)
      if (jobs.length + contents.length > 50) throw new Error('每批最多 50 组，请先下载并清空。')
      const added: BatchJob[] = contents.map(content => ({ id: crypto.randomUUID(), content, mode, snapshot: chatSnapshot(content, currentChat.settings, currentChat.users, currentChat.selfId), selected: true, state: 'ready' }))
      setJobs(current => [...current, ...added]); setActiveId(added[0].id); setConfirmed(false)
      setView('edit'); setEditSection('content')
      // 导入过的角色名一并进昵称历史：从批量页导入完再回聊天页，不用重打名字（与 App 的 handleImport 同一条规则）。
      rememberNameHistory(added.flatMap(job => job.snapshot?.users.map(user => user.name) ?? []).filter(name => !isSelfAlias(name)))
      setMessage(`已添加 ${added.length} 组聊天到队列，原有 ${jobs.length} 组保持不变。`)
    } catch (e) { setMessage(e instanceof Error ? e.message : '对话解析失败') }
  }
  function applySource() {
    if (!active || active.locked || busy) return
    try {
      updateJob(active.id, { snapshot: chatSnapshot(active.content, active.snapshot!.settings, active.snapshot!.users, active.snapshot!.selfId), state: 'ready', error: undefined, dirty: false })
      setMessage('本组对话已更新到预览。')
    } catch (e) { updateJob(active.id, { error: e instanceof Error ? e.message : '解析失败', state: 'error' }) }
  }
  async function generate() {
    if (running.current || !selected.length) return
    if (output === 'video') { await generateVideos(); return }
    if (!pending.length) { download(); return }
    if (!confirmed) return
    running.current = true; stop.current = false; setBusy(true); setMessage('正在导出，完成后自动下载 ZIP，请保留此页。')
    try {
      await runBatch(jobs, { render: async job => {
        if (job.dirty) throw new Error('对话已修改，请先更新本组预览。')
        // 两侧留白对图片同样生效：整批共用「我的偏好」里那一份，底色取各组自己的聊天背景。
        return renderBatchChat(job, screen, video?.settings.sidePad ?? 0)
      }, debit: onDebit, cancelled: () => stop.current, update: () => setJobs([...jobs]), complete: job => onComplete(job.id, 'image') })
      const unfinished = jobs.filter(j => j.selected && j.state !== 'done').length
      const note = unfinished ? `${stop.current ? '已停止后续任务，' : ''}${unfinished} 组未完成，可在原队列查看原因并重试。` : ''
      if (jobs.some(j => j.selected && j.state === 'done' && j.bytes)) download(note)
      else {
        void beginExportLog({ tool: 'batch', mode: 'zip', count: selected.length }).finish(stop.current ? 'cancelled' : 'failed', '没有可下载的图片。' + note)
        setMessage('本次没有可下载的图片。' + note)
      }
    } finally { running.current = false; setBusy(false); setConfirmed(false) }
  }

  /**
   * 视频模式：一组一组「准备好画面 → 扣次 → 录完立刻下载」。
   *
   * 与图片模式最大的区别是**不打包**：一条视频就有十几兆，几十条塞进内存 ZIP 会直接把标签页
   * 拖垮。所以每录完一条就交给浏览器下载，并立刻放开对成片的引用——队列多长，内存都不涨。
   * 代价是本页不保留成片，视频模式下也就没有「重新下载」这件事。
   */
  async function generateVideos() {
    if (!video) { setMessage('视频导出还没准备好，请刷新页面后重试。'); return }
    if (!video.supported) { setMessage('当前浏览器不支持在本地生成视频，请改用 Chrome 或 Edge 打开本站。'); return }
    if (!videoPlan) return
    if (!pending.length) { setMessage('这一批的视频都已经录过了。成片在录完时就已经下载，本页不保留。'); return }
    if (!confirmed) return
    const plan = videoPlan
    running.current = true; stop.current = false; setBusy(true); setConfirmed(false)
    videoToken.current = { cancelled: false }
    // 音频上下文必须在用户手势里解锁，所以放在这里（点「导出所选视频」的那一下）而不是录制时。
    const audio = plan.mode === 'flip' && plan.soundEnabled ? video.resolveAudio() : null
    const labelOf = (job: BatchJob) => `第 ${jobs.indexOf(job) + 1} / ${jobs.length} 组 · ${job.content.title}`
    setMessage(`正在逐组录制视频，每组录完立即下载；预计约 ${Math.max(1, Math.round(videoEstimateMs / 1000))} 秒，请保持本页在前台。`)
    try {
      await runBatch<BatchVideoMedia>(jobs, {
        render: async job => {
          const snapshot = job.snapshot
          if (job.dirty) throw new Error('对话已修改，请先更新本组预览。')
          if (!snapshot?.messages.length) throw new Error('请先解析本组对话。')
          if (snapshot.messages.length > maxVideoMessages) throw new Error(`本组有 ${snapshot.messages.length} 条消息，超过单条视频的上限（${maxVideoMessages} 条），请删减内容或改用聊天图导出。`)
          const task = batchVideoTask(snapshot.messages, plan, snapshot.selfId)
          return prepareBatchVideo(task, { ...snapshot, screen: videoScreen }, {
            token: videoToken.current,
            onProgress: (current, total) => setVideoProgress({
              label: labelOf(job), stage: 'render', current, total, elapsedMs: 0, totalMs: task.totalMs,
              renderHint: plan.mode === 'scroll' ? '正在把整段对话合成为一张长图，内容越多越慢，请不要切换标签页…' : undefined,
            }),
          })
        },
        deliver: async (job, media) => {
          const snapshot = job.snapshot!
          const task = batchVideoTask(snapshot.messages, plan, snapshot.selfId)
          const recorded = await recordBatchVideo(task, media, {
            background: snapshot.settings.backgroundColor || '#ededed',
            sidePadding: plan.sidePad,
            audio,
            token: videoToken.current,
            onProgress: (elapsedMs, totalMs) => setVideoProgress({ label: labelOf(job), stage: 'record', current: 0, total: snapshot.messages.length, elapsedMs, totalMs }),
          })
          const name = videoFilename(jobs.indexOf(job), job.content.title, videoFileExtension(recorded.mimeType))
          const log = beginExportLog({ tool: 'batch', mode: 'video', filename: name })
          saveVideo(recorded.blob, name)
          void log.finish('download_requested', `${job.content.title} · ${formatBytes(recorded.blob.size)}`)
          // 成片已经交给浏览器，这里立刻放手：队列再长也不会把几十条视频堆在内存里。
          job.video = { name, bytes: recorded.blob.size }
        },
        debit: onDebit, cancelled: () => stop.current, update: () => setJobs([...jobs]),
        complete: job => onComplete(job.id, 'video'),
      })
      const done = jobs.filter(j => j.selected && j.video).length
      const unfinished = jobs.filter(j => j.selected && j.state !== 'done').length
      setMessage(`${stop.current ? '已停止后续任务，' : ''}本次导出 ${done} 条视频，每条都在录完后立即下载。${unfinished ? `还有 ${unfinished} 组未完成，可在队列里查看原因后重试。` : ''}`)
    } finally { running.current = false; setBusy(false); setVideoProgress(null) }
  }
  function download(note = '') {
    const files = jobs.flatMap((j, index) => j.selected && j.state === 'done' && j.bytes ? [{ name: cardFilename(index, j.content.title), bytes: j.bytes }] : [])
    if (!files.length) return
    const filename = `聊天截图_${files.length}组.zip`
    const log = beginExportLog({ tool: 'batch', mode: 'zip', filename, count: files.length })
    try {
      const url = URL.createObjectURL(zipImages(files)); const link = document.createElement('a')
      link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
      void log.finish('download_requested', note || '重复下载不扣额度')
      setMessage(`已发起 ZIP 下载，包含 ${files.length} 张聊天图。${note}若浏览器拦截下载，请点击“重新下载已完成 ZIP”，不再扣额度。`)
    } catch { void log.finish('failed', 'ZIP 打包或下载操作失败'); setMessage('打包失败，图片仍保留在本页。请减少勾选后重试，不会重复扣费。') }
  }
  const locked = busy || !!active?.locked
  const activeSettings = active?.snapshot?.settings
  const preview = active?.snapshot ? <div className="batch-chat-preview">
    <PhonePreview key={active.id} {...active.snapshot} screen={videoScreen} onUpdateMessage={locked ? undefined : (id, content) => updateJob(active.id, { snapshot: { ...active.snapshot!, messages: active.snapshot!.messages.map(m => m.id === id ? { ...m, content } : m) } })} onPickSticker={libraryReady && !locked ? msgId => setPicker({ kind: 'sticker', jobId: active.id, msgId }) : undefined} onUploadImage={libraryReady && !locked ? (_msgId, file) => uploadImageFile(file) : undefined} />
  </div> : <div className="batch-empty batch-preview-empty"><Layers3 size={32} /><h3>{output === 'video' ? '聊天视频将在这里预览' : '聊天图将在这里预览'}</h3><p>导入后逐组检查效果，使用与单张聊天相同的手机界面。</p><Button variant="outline" disabled={busy} onClick={addChats}>预览示例聊天</Button></div>
  const exportActions = <div className="batch-export" aria-label="聊天预览与导出">
    <div className="batch-export-mode"><span>导出内容</span>
      <SegmentedControl aria-label="批量导出内容" value={output} onValueChange={value => chooseOutput(value as BatchOutput)} disabled={busy} options={[{ value: 'image', label: '聊天图' }, { value: 'video', label: '聊天视频' }]} />
      {output === 'video' && <Button variant="outline" size="sm" type="button" disabled={busy} onClick={() => setVideoOpen(true)}><Video size={14} /> 视频设置</Button>}
    </div>
    <div className="batch-progress"><span>已完成 <strong>{successes.length} / {jobs.length}</strong> 组{failed.length ? ` · ${failed.length} 待重试` : ''}</span><span>{unlimited ? '会员不限次' : <>可用 <strong>{remaining}</strong> 次</>}</span><Progress max={Math.max(jobs.length, 1)} value={successes.length} aria-label="批量生成进度" className="batch-progress-bar" /></div>
    {output === 'video' && <p className="batch-export-note">{videoModeLabel} · {videoSizeLabel}{videoPlan?.mode === 'flip' && videoPlan.soundEnabled ? ' · 带提示音' : ' · 无声'}{videoTasks.length ? ` · 预计约 ${Math.max(1, Math.round(videoEstimateMs / 1000))} 秒，成片共约 ${Math.max(1, Math.round(videoDurationMs / 1000))} 秒` : ''}</p>}
    <p>已选 {selected.length} 组，{unlimited ? '会员有效期内不扣次数包及奖励额度。' : <>本轮最多使用 <strong>{pending.length} 次</strong>额度。</>}</p>
    {!unlimited && pending.length > remaining && <p className="batch-error">额度不足以完成全部任务，请减少勾选或补充额度。原编号重试仍可进行。</p>}
    <label className="batch-confirm"><Checkbox checked={confirmed} disabled={busy || !pending.length} onCheckedChange={setConfirmed} aria-label={confirmLabel} /> {confirmLabel}</label>
    <div className="batch-actions batch-export-actions">{busy
      ? <Button variant="outline" onClick={() => { stop.current = true; videoToken.current.cancelled = true }}><Square size={15} /> 停止后续任务</Button>
      : output === 'video'
        ? <Button disabled={!selected.length || !pending.length || !confirmed || !video?.supported} onClick={() => void generate()}>{failed.length ? <RotateCcw size={16} /> : <Video size={16} />}{pending.length ? (failed.length ? '重试并导出视频' : '导出所选视频') : '视频已导出'}</Button>
        : <><Button disabled={!selected.length || (!!pending.length && !confirmed)} onClick={() => void generate()}>{pending.length && failed.length ? <RotateCcw size={16} /> : <Download size={16} />}{!pending.length && selected.length ? '重新下载已完成 ZIP' : failed.length ? '重试并导出 ZIP' : '导出所选 ZIP'}</Button>{pending.length > 0 && selected.some(j => j.state === 'done') && <Button variant="outline" disabled={busy} onClick={() => download()}><Download size={16} /> 重新下载已完成 ZIP</Button>}</>}</div>
    <p className="batch-export-note">{output === 'video' ? '逐组录制、每条录完立即下载，不打包 ZIP；成片不留在本页，录制期间请保持本页在前台。' : '一键生成并自动下载。未完成项保留，重新下载不扣额度。'}</p>
    {message && <p className="batch-message" role="status">{message}</p>}
  </div>
  return <div className="batch-studio" id="batch-studio">
    <WorkspacePanels preview={preview} previewActions={exportActions} previewTitle={active ? active.content.title : '聊天预览'} previewDescription={active
      ? output === 'video'
        ? `${active.snapshot?.messages.length || 0} 条消息 · 视频 ${videoSizeLabel} · 屏幕 ${screenSizeLabel(screen)}`
        : `${active.mode === 'long' ? '完整长截图' : '标准截图 · 顶部一屏'} · ${active.snapshot?.messages.length || 0} 条消息 · 导出 ${screenSizeLabel(screen)}${video?.settings.sidePad ? `（左右各留 ${video.settings.sidePad}px）` : ''}`
      : '选择一组聊天，查看导出效果'} screen={screen} onScreenChange={onScreenChange} imageMax={activeSettings?.imageMax} onImageMaxChange={value => { if (active && !locked) patchJobSettings(active.id, { imageMax: value }) }} fontScale={activeSettings?.fontScale} onFontScaleChange={value => { if (active && !locked) patchJobSettings(active.id, { fontScale: value }) }} videoSidePad={video?.settings.sidePad} onVideoSidePadChange={video ? value => video.onSettingsChange({ sidePad: value }) : undefined} videoFrame={output === 'video' && videoPlan ? { output: { width: videoPlan.size.width, height: videoPlan.size.height }, background: activeSettings?.backgroundColor || '#ededed' } : undefined}>
      <Tabs className="batch-workspace" value={view} onValueChange={value => setView(value as 'import' | 'edit')}>
      <header className="batch-heading"><h2>批量聊天制作</h2>
      <TabsList className="batch-view-switch" aria-label="批量制作工作视图">
        <TabsTrigger value="import"><FileInput size={16} /> 导入聊天</TabsTrigger>
        <TabsTrigger value="edit"><ListChecks size={16} /> 编辑与队列 <span className="batch-tab-count">{jobs.length}</span></TabsTrigger>
      </TabsList><span className="batch-count">{jobs.length} / 50 组</span></header>
      <TabsContent value="import" id="batch-import-panel" className="batch-compose" keepMounted aria-label="导入多组聊天">
        <div className="batch-import-toolbar"><label htmlFor="batch-input">聊天记录</label><div className="batch-import-options">{output === 'video'
          ? <><label>录制方式</label><span className="batch-hint">{videoModeLabel} · {videoSizeLabel} · 在右侧「预览与导出」里改</span></>
          : <><label htmlFor="batch-mode">默认导出方式</label><SelectField id="batch-mode" value={mode} disabled={busy} onValueChange={value => setMode(value as CaptureMode)} options={[{ value: 'long', label: '完整长截图（全部消息）' }, { value: 'standard', label: '标准截图（顶部一屏）' }]} /></>}<Button size="sm" variant="ghost" disabled={busy} onClick={() => setText(BATCH_CHAT_EXAMPLE)}>填入示例</Button><BatchPromptDialog disabled={busy} /></div></div>
        <p id="batch-format-hint" className="batch-hint">每行“姓名：消息”，用独立一行 <code>---</code> 分组。<code># 聊天标题</code> 可设置联系人名称。正文里写 <code>[呲牙]</code> 这样的标签会显示成表情。</p>
        <Textarea id="batch-input" aria-describedby="batch-format-hint" rows={8} ref={batchInputRef} value={text} maxLength={100000} disabled={busy} onChange={e => setText(e.target.value)} />
        <EmojiPicker target={batchInputRef} onInsert={setText} disabled={busy} />
        <div className="batch-actions"><Button disabled={busy || !text.trim() || jobs.length >= 50} onClick={addChats}><Plus size={16} /> 添加到批量队列</Button><span className="batch-hint">仅添加上方文本，不覆盖已有对话。</span></div>
        <div className="batch-import-notes"><p>自动沿用「我的偏好」里的样式（配色、字号、图片大小、导出分辨率）与同名角色头像，支持时间、语音、图片、商品图与表情标签。</p><p>导出聊天图会打包成一个 ZIP；导出聊天视频则逐组录制、每条录完立即下载。两种在右侧「预览与导出」里切换。</p><p>刷新前请下载；仅用于授权素材与内容创作，禁止伪造凭证。</p></div>
      </TabsContent>
      <TabsContent value="edit" id="batch-edit-panel" className="batch-editor" keepMounted aria-label="逐组编辑与队列">
        <div className="batch-queue-area"><div className="batch-toolbar"><h3>聊天列表 <span>{jobs.length} 组</span></h3><div className="batch-actions"><Button size="sm" variant="ghost" disabled={busy || !jobs.length} onClick={() => { setJobs(jobs.map(j => ({ ...j, selected: true }))); setConfirmed(false) }}>全选</Button><Button size="sm" variant="ghost" disabled={busy || !jobs.length} onClick={() => { setJobs(jobs.map(j => ({ ...j, selected: false }))); setConfirmed(false) }}>取消选择</Button><Button size="sm" variant="ghost" disabled={busy || !jobs.length} onClick={() => setClearOpen(true)}><Trash2 size={14} /> 清空</Button></div></div>
        {!jobs.length ? <div className="batch-empty"><ListChecks size={28} /><h3>队列还是空的</h3><p>先导入聊天记录，再逐组编辑内容与手机样式。</p><Button onClick={() => setView('import')}><Plus size={16} /> 添加聊天</Button></div> : <div className="batch-queue-content">
          <div className="batch-chat-list" aria-label="本批聊天队列">{jobs.map((job, index) => <div className={`batch-chat-row ${job.id === activeId ? 'is-active' : ''}`} key={job.id}><Checkbox aria-label={`选择第 ${index + 1} 组`} checked={job.selected} disabled={busy} onCheckedChange={checked => updateJob(job.id, { selected: checked })} /><Button variant="ghost" className="batch-chat-open" aria-pressed={job.id === activeId} onClick={() => setActiveId(job.id)}><span className="batch-row-content"><strong>{index + 1}. {job.content.title}</strong><small>{job.snapshot?.messages.length || 0} 条消息 · {output === 'video' ? `视频${job.video ? ` · ${formatBytes(job.video.bytes)}` : ''}` : job.mode === 'long' ? '长截图' : '标准截图'}</small></span><span className={`batch-status batch-status-${job.state}`}>{({ ready: '待生成', working: '处理中', done: '已完成', error: '待重试' })[job.state]}</span></Button></div>)}</div>
          <div className="batch-queue-footer"><span className="batch-hint">勾选导出范围，点击名称编辑。</span><Button variant="ghost" size="sm" disabled={busy || jobs.length >= 50} onClick={() => setView('import')}><Plus size={14} /> 继续添加</Button></div>
        </div>}
        </div>
          {active?.snapshot && <div className="batch-chat-controls">
            <div className="batch-section-heading"><h3>编辑当前聊天</h3><span className="batch-count">第 {jobs.findIndex(job => job.id === active.id) + 1} 组</span></div>
            {active.error && <p className="batch-error" role="alert">{active.error}</p>}{active.locked && <p className="batch-notice">已发起额度确认，内容已锁定，保证原编号重试不会重复扣费。</p>}
            <Tabs className="batch-detail-tabs" value={editSection} onValueChange={value => setEditSection(value as typeof editSection)}>
              <TabsList className="batch-detail-switch" variant="line" aria-label="批量聊天编辑面板">
                <TabsTrigger value="content">聊天内容</TabsTrigger>
                <TabsTrigger value="people">头像与角色</TabsTrigger>
                <TabsTrigger value="settings">手机样式</TabsTrigger>
              </TabsList>
              <TabsContent value="content" className="batch-content-panel" keepMounted>
            <div className="batch-fields-row"><label>聊天名称<Input className="batch-field-control" aria-label="当前组聊天名称" value={active.content.title} disabled={locked} maxLength={40} onBlur={() => { if (!locked) rememberNameHistory(active.content.title) }} onChange={e => updateJob(active.id, { content: { ...active.content, title: e.target.value }, snapshot: { ...active.snapshot!, settings: { ...active.snapshot!.settings, contactName: e.target.value } } })} />{!locked && <NameSuggest exclude={[active.content.title]} onPick={name => { rememberNameHistory(name); updateJob(active.id, { content: { ...active.content, title: name }, snapshot: { ...active.snapshot!, settings: { ...active.snapshot!.settings, contactName: name } } }) }} />}</label>{output === 'image' && <label>导出方式<SelectField className="batch-field-control" aria-label="当前组导出方式" disabled={locked} value={active.mode} onValueChange={value => updateJob(active.id, { mode: value as CaptureMode })} options={[{ value: 'long', label: '完整长截图' }, { value: 'standard', label: '标准截图（顶部一屏）' }]} /></label>}</div>
            {(active.content.body || active.dirty) && <><label>本组聊天记录<Textarea className="batch-field-control" aria-label="本组聊天记录" rows={8} maxLength={10000} disabled={locked} ref={bodyInputRef} value={active.content.body} onChange={e => patchJobBody(e.target.value)} /></label><EmojiPicker target={bodyInputRef} onInsert={patchJobBody} disabled={locked} /><Button variant="outline" disabled={locked} onClick={applySource}>更新本组预览</Button></>}
            {!active.content.body && !active.dirty && <><div className="batch-message-edit" aria-label="本组已有文字消息">{active.snapshot.messages.filter(m => m.type === 'text' || m.type === 'time').map(m => <label key={m.id}>{active.snapshot!.users.find(u => u.id === m.senderId)?.name || '时间'}<Textarea className="batch-field-control" rows={2} aria-label={`消息 ${m.id}`} disabled={locked} value={m.content} onFocus={event => { messageInputRef.current = event.currentTarget; setFocusedMessageId(m.id) }} onChange={e => patchMessageContent(m.id, e.target.value)} /></label>)}</div>{!locked && <EmojiPicker target={messageInputRef} onInsert={value => { if (focusedMessageId !== null) patchMessageContent(focusedMessageId, value) }} />}</>}
              </TabsContent>
              <TabsContent value="people" keepMounted><fieldset disabled={locked} className="batch-shared-controls"><UserAvatarManager users={active.snapshot.users} selfId={active.snapshot.selfId} onUpdateAvatar={(id, avatar) => { if (!locked) updateJob(active.id, { snapshot: { ...active.snapshot!, users: active.snapshot!.users.map(u => u.id === id ? { ...u, avatar } : u) } }) }} onRemoveAvatar={id => { if (!locked) updateJob(active.id, { snapshot: { ...active.snapshot!, users: active.snapshot!.users.map(u => u.id === id ? { ...u, avatar: null } : u) } }) }} onSetSelf={selfId => { if (!locked) updateJob(active.id, { snapshot: { ...active.snapshot!, selfId } }) }} onUploadAvatar={(id, file) => { void batchUploadOneAvatar(active.id, id, file) }} onBatchUpload={files => { void batchUploadAvatars(active.id, files) }} onOpenLibrary={userId => setPicker({ kind: 'avatar', jobId: active.id, userId })} onManageLibrary={() => setPicker({ kind: 'avatar', jobId: active.id })} libraryAvatarCount={mediaAssetsOfKind(mediaAssets, 'avatar').length} libraryEnabled={libraryReady} avatarPresets={avatarPresets} presetsEnabled={presetsReady} onUsePreset={preset => applyPresetToJob(active.id, preset)} onRenamePreset={onRenamePreset} onRemovePreset={onRemovePreset} /></fieldset></TabsContent>
              <TabsContent value="settings" keepMounted><fieldset disabled={locked} className="batch-shared-controls"><SettingsPanel disabled={locked} settings={active.snapshot.settings} onSettingsChange={settings => { if (!locked) updateJob(active.id, { content: { ...active.content, title: settings.contactName }, snapshot: { ...active.snapshot!, settings } }) }} onUploadBackground={uploadBackgroundForJob(active.id)} onOpenBackgroundLibrary={libraryReady ? () => setPicker({ kind: 'background', jobId: active.id, background: true }) : undefined} backgroundAssets={mediaAssetsOfKind(mediaAssets, 'background')} onBackgroundUsed={asset => applyBackgroundToJob(active.id, asset)} libraryEnabled={libraryReady} /></fieldset></TabsContent>
            </Tabs>
          </div>}
      </TabsContent>
      </Tabs>
    </WorkspacePanels>
    <ConfirmDialog open={clearOpen} onOpenChange={setClearOpen} title="清空本批聊天？" description="清空会丢失本页图片与任务记录，请确认已经下载。重新导入会作为新任务使用额度。" confirmText="已下载，清空队列" onConfirm={() => { if (busy) return; setJobs([]); setActiveId(''); setConfirmed(false); setView('import'); setClearOpen(false) }} />
    <MediaLibraryDialog
      open={picker !== null}
      onOpenChange={open => { if (!open) setPicker(null) }}
      assets={mediaAssets}
      kind={picker?.kind ?? 'sticker'}
      // 换类目时保留「这一组 + 这个目标」：表情与商品图来回切着挑同一张图，不该丢掉目标。
      onKindChange={kind => setPicker(current => current ? { ...current, kind } : { kind, jobId: activeId })}
      onPick={pickAsset}
      pickLabel={picker?.background ? '用作背景' : picker?.userId !== undefined ? '设为头像' : picker?.msgId !== undefined ? '换这张' : '使用'}
      onUpload={handleLibraryUpload}
      onRemove={onRemoveAsset}
      onRename={onRenameAsset}
      enabled={libraryReady}
      title={picker?.background ? '从素材库选聊天背景' : picker?.userId !== undefined ? '从素材库选头像' : picker?.msgId !== undefined ? '从素材库选图片' : '我的素材库'}
      description={picker?.background
        ? '点一张即可换成本组的聊天背景；新上传的图也会留在库里。'
        : picker?.userId !== undefined
          ? '点一张即可换上本组这位角色的头像；也可以现在传几张新的，传一张就直接换上。'
          : picker?.msgId !== undefined
            ? '点一张即可换到本组这条消息上；表情图片与商品图都能用。'
            : '上传过的头像、表情、背景图和商品图都会留在这里，下次直接点选即可，不用再翻本地文件。'}
    />
    {video && <VideoExportDialog
      open={videoOpen}
      onOpenChange={setVideoOpen}
      settings={video.settings}
      onChange={video.onSettingsChange}
      // 批量是一次录很多组：这里的条数、发声数与耗时都是「勾选待导出那些组」的总和。
      messageCount={videoTasks.reduce((sum, task) => sum + task.messageCount, 0)}
      groupCount={pending.length}
      soundCount={videoTasks.reduce((sum, task) => sum + task.notifyAt.length, 0)}
      estimatedMs={videoEstimateMs}
      durationLabel={playbackDurationLabel(videoDurationMs)}
      containerLabel={video.containerLabel}
      screen={screen}
      supported={video.supported}
      soundError={video.soundError}
      onSoundFile={video.onSoundFile}
      onOpenSoundLibrary={video.onOpenSoundLibrary}
      soundLibraryCount={video.soundLibraryCount}
      description="把勾选的每一组分别录成视频，逐组下载到本机。逐条播放会一条条出现并带提示音，滚动到底适合把一段长对话完整展示出来。这里改的是整批共用的设置，与聊天页那份是同一套。"
      onConfirm={() => setVideoOpen(false)}
    />}
    {videoProgress && <VideoProgressOverlay stage={videoProgress.stage} current={videoProgress.current} total={videoProgress.total} elapsedMs={videoProgress.elapsedMs} totalMs={videoProgress.totalMs} renderHint={videoProgress.renderHint} jobLabel={videoProgress.label} onCancel={() => { videoToken.current.cancelled = true; stop.current = true }} />}
  </div>
}
