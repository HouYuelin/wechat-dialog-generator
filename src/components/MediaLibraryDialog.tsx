import { useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { SegmentedControl } from './ui/controls'
import { Check, Images, PencilLine, Plus, Trash2, Upload, X } from 'lucide-react'
import { isImageFile } from '@/lib/image-file'
import {
  maxAssetsPerKind,
  mediaAssetMeta,
  mediaAssetsOfKind,
  mediaImportSummaryText,
  mediaKindLabels,
  mediaKindUnits,
  mediaKinds,
  mediaLibrarySummary,
  mediaLibrarySummaryLabel,
  recentMediaAssets,
  type MediaAsset,
  type MediaImportSummary,
  type MediaKind,
} from '@/lib/media-library'
import './MediaLibrary.css'

const kindOptions = mediaKinds.map(kind => ({ value: kind, label: mediaKindLabels[kind] }))

interface MediaLibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assets: MediaAsset[]
  kind: MediaKind
  onKindChange: (kind: MediaKind) => void
  /** 选中一张素材。用它做什么由调用方决定（设头像 / 发图片），弹窗只负责回传。 */
  onPick?: (asset: MediaAsset, kind: MediaKind) => void
  pickLabel?: string
  /** 批量上传：可多选，也可以把一堆图直接拖进来。 */
  onUpload: (files: File[], kind: MediaKind) => Promise<MediaImportSummary>
  onRemove?: (asset: MediaAsset) => void
  onRename?: (asset: MediaAsset, name: string) => void
  /** 浏览器存储不可用时只说明情况，不给上传入口——传了也留不住。 */
  enabled: boolean
  title?: string
  description?: string
}

/**
 * 素材库弹窗。拆成内外两层是有意的：Popup 关闭时整棵子树会被卸载
 * （Portal 默认 keepMounted=false），所以「正在读取」「刚加入几张」「正在改名」
 * 这些临时状态跟着一起消失，不需要再写一个 effect 手动清空，下次打开天然是干净的。
 */
export function MediaLibraryDialog({ open, onOpenChange, title = '我的素材库', ...rest }: MediaLibraryDialogProps) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="media-library-backdrop" />
      <Dialog.Popup className="media-library-popup" aria-label={title}>
        <MediaLibraryBody title={title} {...rest} />
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}

function MediaLibraryBody({
  assets, kind, onKindChange, onPick, pickLabel = '使用',
  onUpload, onRemove, onRename, enabled, title = '我的素材库', description,
}: Omit<MediaLibraryDialogProps, 'open' | 'onOpenChange' | 'title'> & { title?: string }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const list = mediaAssetsOfKind(assets, kind)
  const summary = mediaLibrarySummary(assets)

  // 一次可能几百张，读图是异步的，串行跑完再回执，中间拿 busy 挡住重复提交。
  const handleFiles = async (files: File[]) => {
    if (!enabled || busy || !files.length) return
    const images = files.filter(isImageFile)
    setNotice('')
    if (!images.length) {
      setNotice('只能上传图片文件。')
      return
    }
    setBusy(true)
    try {
      const result = await onUpload(images, kind)
      setNotice(mediaImportSummaryText({ ...result, failed: result.failed + (files.length - images.length) }))
    } catch {
      setNotice('保存到素材库失败：可能是浏览器存储空间不足，删掉一些旧素材再试。')
    } finally {
      setBusy(false)
    }
  }

  const commitRename = (asset: MediaAsset) => {
    onRename?.(asset, renameDraft)
    setRenamingId(null)
  }

  return <>
    <div className="media-library-topline">
      <Dialog.Title className="media-library-title"><Images size={16} /> {title}</Dialog.Title>
      <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="关闭素材库" />}><X size={17} /></Dialog.Close>
    </div>
    <Dialog.Description className="media-library-description">
      {description ?? '上传过的头像、表情、背景图和商品图都会留在这里，下次直接点选即可，不用再翻本地文件。'}
    </Dialog.Description>

    <div className="media-library-toolbar">
      <SegmentedControl
        aria-label="素材类型"
        value={kind}
        // 换类目时把临时状态一起收掉，免得回执里还写着上一类的张数。
        onValueChange={value => { setNotice(''); setRenamingId(null); onKindChange(value as MediaKind) }}
        options={kindOptions}
      />
      <span className="media-library-stats">{mediaLibrarySummaryLabel(summary)}</span>
    </div>

    {enabled ? <div
      className="media-library-drop"
      data-dragging={dragging}
      onDragEnter={event => { event.preventDefault(); setDragging(true) }}
      onDragOver={event => { event.preventDefault(); setDragging(true) }}
      onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false) }}
      onDrop={event => {
        event.preventDefault()
        setDragging(false)
        void handleFiles(Array.from(event.dataTransfer?.files ?? []))
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label={`批量上传${mediaKindLabels[kind]}`}
        onChange={event => {
          void handleFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <Upload size={16} />
      <span>把图片拖到这里，或</span>
      <Button variant="outline" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? '正在读取…' : `批量上传${mediaKindLabels[kind]}`}
      </Button>
      <small>可一次选多张；超过最长边 1280px 的图会自动压到 1280，动图和矢量图原样保留。</small>
    </div> : <p className="media-library-warning" role="alert">当前浏览器无法保存素材库（可能禁用了本地存储或处于隐私模式），上传的图片只在本次编辑时有效。</p>}

    {notice && <p className="media-library-notice" role="status">{notice}</p>}

    {list.length ? <ul className="media-library-grid" aria-label={`${mediaKindLabels[kind]}素材`}>
      {list.map(asset => <li key={asset.id} className="media-library-item">
        {renamingId === asset.id
          ? <Input
            className="media-library-rename"
            aria-label={`重命名 ${asset.name}`}
            autoFocus
            value={renameDraft}
            maxLength={60}
            onChange={event => setRenameDraft(event.target.value)}
            onBlur={() => commitRename(asset)}
            onKeyDown={event => {
              if (event.key === 'Enter') { event.preventDefault(); commitRename(asset) }
              if (event.key === 'Escape') { event.preventDefault(); setRenamingId(null) }
            }}
          />
          : <button
            type="button"
            className="media-library-thumb"
            title={onPick ? `${pickLabel}：${asset.name}` : asset.name}
            onClick={() => onPick?.(asset, kind)}
          >
            <img src={asset.dataUrl} alt={asset.name} />
            {onPick && <span className="media-library-thumb-badge"><Check size={13} /> {pickLabel}</span>}
          </button>}
        <span className="media-library-name" title={asset.name}>{asset.name}</span>
        <span className="media-library-meta">{mediaAssetMeta(asset)}</span>
        <div className="media-library-item-actions">
          {onPick && <Button size="sm" type="button" onClick={() => onPick(asset, kind)}><Check size={13} /> {pickLabel}</Button>}
          {onRename && <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label={`重命名 ${asset.name}`}
            title="重命名"
            onClick={() => { setRenamingId(asset.id); setRenameDraft(asset.name) }}
          ><PencilLine size={14} /></Button>}
          {onRemove && <Button
            variant="ghost"
            size="icon"
            type="button"
            className="media-library-delete"
            aria-label={`删除 ${asset.name}`}
            title="从素材库删除"
            onClick={() => onRemove(asset)}
          ><Trash2 size={14} /></Button>}
        </div>
      </li>)}
    </ul> : <div className="media-library-empty">
      <Images size={26} />
      <p>{enabled
        ? `还没有${mediaKindLabels[kind]}素材。上传过的${mediaKindLabels[kind]}会自动留在这里，下次点一下就能用。`
        : '素材库暂时不可用，图片仍可以正常上传和使用，只是留不到下次。'}</p>
    </div>}

    <p className="media-library-note">
      素材只存在这台浏览器里（IndexedDB），不会上传到服务器；每类最多留 {maxAssetsPerKind} 张，到顶后只拒收新图，<b>已保存的素材永远不会自动删除</b>，只有你在这里点删除才会清掉。删素材不会影响已经用上的头像、图片、背景与商品图。
    </p>
  </>
}

interface MediaLibraryStripProps {
  assets: MediaAsset[]
  kind: MediaKind
  limit?: number
  onPick: (asset: MediaAsset) => void
  onManage: () => void
  /** 存储不可用时不给入口，只留提示。 */
  enabled: boolean
}

/**
 * 编辑区里的一行「最近用过的素材」。做成横向缩略图而不是再点开一次弹窗，
 * 是因为换一张表情图这种操作一天可能做十几次，多一层弹窗就多一次等待。
 */
export function MediaLibraryStrip({ assets, kind, limit = 8, onPick, onManage, enabled }: MediaLibraryStripProps) {
  if (!enabled) return null
  const recent = recentMediaAssets(assets, kind, limit)
  const total = mediaAssetsOfKind(assets, kind).length
  return <div className="media-library-strip">
    <div className="media-library-strip-head">
      <span>素材库{total ? ` · 最近用过` : ''}</span>
      <button type="button" className="media-library-strip-manage" onClick={onManage}>
        <Plus size={12} /> 上传 / 管理（{total} {mediaKindUnits[kind]}）
      </button>
    </div>
    {recent.length
      ? <div className="media-library-strip-list">
        {recent.map(asset => <button
          key={asset.id}
          type="button"
          className="media-library-strip-item"
          title={asset.name}
          onClick={() => onPick(asset)}
        ><img src={asset.dataUrl} alt={asset.name} /></button>)}
      </div>
      : <p className="media-library-strip-empty">还没有素材，上传过的{mediaKindLabels[kind]}会自动留在这里。</p>}
  </div>
}
