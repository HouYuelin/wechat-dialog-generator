import { useRef, useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Music, PencilLine, Trash2, Upload, X } from 'lucide-react'
import {
  maxSoundAssets,
  soundAssetMeta,
  sortSoundAssets,
  type SoundAsset,
} from '@/lib/sound-library'
import './MediaLibrary.css'

interface SoundLibraryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assets: SoundAsset[]
  /** 选中一条音效。用它做什么由调用方决定，弹窗只负责回传。 */
  onPick?: (asset: SoundAsset) => void
  pickLabel?: string
  /** 这次挑的音效要替换哪一声（如「收到消息」那一声），写进说明文案。 */
  pickTargetLabel?: string
  /** 上传单个音频文件：交给外层转 data URL、解码取时长并入库。 */
  onUpload: (file: File) => Promise<string | null>
  onRemove?: (asset: SoundAsset) => void
  onRename?: (asset: SoundAsset, name: string) => void
  /** 浏览器存储不可用时只说明情况，不给上传入口。 */
  enabled: boolean
}

/**
 * 音效库弹窗：上传过的自定义提示音留在这里，下次直接点选。和素材库一样拆成内外两层，
 * 关闭时整棵子树卸载，临时状态（读文件、刚上传、正在改名）跟着一起消失。
 */
export function SoundLibraryDialog({ open, onOpenChange, ...rest }: SoundLibraryDialogProps) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="media-library-backdrop" />
      <Dialog.Popup className="media-library-popup" aria-label="我的音效库">
        <SoundLibraryBody {...rest} />
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}

function SoundLibraryBody({
  assets, onPick, pickLabel = '使用', pickTargetLabel, onUpload, onRemove, onRename, enabled,
}: Omit<SoundLibraryDialogProps, 'open' | 'onOpenChange'>) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const list = sortSoundAssets(assets)

  const handleFile = async (file: File) => {
    if (!enabled || busy || !file) return
    setNotice('')
    if (!file.type.startsWith('audio/')) {
      setNotice('只能上传音频文件。')
      return
    }
    setBusy(true)
    try {
      const result = await onUpload(file)
      setNotice(result ? `已加入音效库：${result}` : '音频读取失败，请换一个文件。')
    } catch {
      setNotice('保存到音效库失败：可能是浏览器存储空间不足，删掉一些旧音效再试。')
    } finally {
      setBusy(false)
    }
  }

  const commitRename = (asset: SoundAsset) => {
    onRename?.(asset, renameDraft)
    setRenamingId(null)
  }

  return <>
    <div className="media-library-topline">
      <Dialog.Title className="media-library-title"><Music size={16} /> 我的音效库</Dialog.Title>
      <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="关闭音效库" />}><X size={17} /></Dialog.Close>
    </div>
    <Dialog.Description className="media-library-description">
      上传过的自定义提示音会留在这里，下次直接点选即可，不用再翻本地文件。{pickTargetLabel
        ? `这次选中的音效会替换${pickTargetLabel}。`
        : '收发两声提示音都能换成库里挑的音效，各管各的。'}
    </Dialog.Description>

    {enabled ? <div className="media-library-drop">
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        aria-label="上传自定义提示音"
        onChange={event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void handleFile(file)
        }}
      />
      <Upload size={16} />
      <span>从本机选一个音频文件，或</span>
      <Button variant="outline" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? '正在读取…' : '上传音效'}
      </Button>
      <small>支持 mp3、wav、m4a 等常见格式，单个建议不超过 4 MB。</small>
    </div> : <p className="media-library-warning" role="alert">当前浏览器无法保存音效库（可能禁用了本地存储或处于隐私模式），上传的音效只在本次编辑时有效。</p>}

    {notice && <p className="media-library-notice" role="status">{notice}</p>}

    {list.length ? <ul className="media-library-grid" aria-label="音效列表">
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
            className="media-library-thumb sound-library-thumb"
            title={onPick ? `${pickLabel}：${asset.name}` : asset.name}
            onClick={() => onPick?.(asset)}
          >
            <span className="sound-library-thumb-icon"><Music size={22} /></span>
            {onPick && <span className="media-library-thumb-badge">{pickLabel}</span>}
          </button>}
        <span className="media-library-name" title={asset.name}>{asset.name}</span>
        <span className="media-library-meta">{soundAssetMeta(asset)}</span>
        <div className="media-library-item-actions">
          {onPick && <Button size="sm" type="button" onClick={() => onPick(asset)}>{pickLabel}</Button>}
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
            title="从音效库删除"
            onClick={() => onRemove(asset)}
          ><Trash2 size={14} /></Button>}
        </div>
      </li>)}
    </ul> : <div className="media-library-empty">
      <Music size={26} />
      <p>{enabled
        ? '还没有音效。上传过的提示音会自动留在这里，下次点一下就能用。'
        : '音效库暂时不可用，音效仍可以正常上传和使用，只是留不到下次。'}</p>
    </div>}

    <p className="media-library-note">
      音效只存在这台浏览器里（IndexedDB），不会上传到服务器；最多留 {maxSoundAssets} 条，到顶后只拒收新的，<b>已保存的音效永远不会自动删除</b>，只有你在这里点删除才会清掉。
    </p>
  </>
}
