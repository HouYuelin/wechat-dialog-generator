import { useState } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Check, History, X } from 'lucide-react'
import { avatarNameKey } from '@/lib/user-avatars'
import type { AvatarPreset } from '@/lib/avatar-presets'
import './AvatarPresetDialog.css'

interface AvatarPresetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  presets: AvatarPreset[]
  /** 选中一张。换上谁由调用方决定——弹窗只负责回传。 */
  onPick: (preset: AvatarPreset) => void
  /** 正在给谁挑，只用于文案；不知道时写成通用说法。 */
  targetName?: string
  /** 这一位正在用的头像，用来在列表里标出「正在用」。 */
  currentAvatar?: string | null
}

/**
 * 「用过的头像」选择器。
 *
 * 和「用户头像管理」里那一节的分工：那一节按名字认人，只有当前对话里正好有同名角色时才给
 * 「用上」按钮，否则只能「仅保存」；这里是**给指定的那一位挑**——归档里任何一张都能换给任何
 * 一个人，同一个头像想给谁用就给谁用。
 *
 * 改名与删除仍然留在那一节：这里是「挑一张来用」，把管理动作混进来会让点错就改到归档。
 *
 * 拆成内外两层和素材库弹窗同一个理由：Portal 默认 keepMounted=false，关闭即卸载，
 * 所以筛选词这类临时状态不用写 effect 手动清空，下次打开天然是干净的。
 */
export function AvatarPresetDialog({ open, onOpenChange, presets, onPick, targetName, currentAvatar }: AvatarPresetDialogProps) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="avatar-picker-backdrop" />
      <Dialog.Popup className="avatar-picker-popup" aria-label="从用过的头像里选">
        <AvatarPickerBody presets={presets} onPick={onPick} targetName={targetName} currentAvatar={currentAvatar ?? null} />
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>
}

function AvatarPickerBody({
  presets, onPick, targetName, currentAvatar,
}: Omit<AvatarPresetDialogProps, 'open' | 'onOpenChange'>) {
  const [query, setQuery] = useState('')
  // 归档是一角色一条，用久了能攒出几百条，所以按名字筛一下比一屏一屏翻快。
  const keyword = avatarNameKey(query)
  const list = keyword ? presets.filter(preset => avatarNameKey(preset.name).includes(keyword)) : presets

  return <>
    <div className="avatar-picker-topline">
      <Dialog.Title className="avatar-picker-title"><History size={16} /> 用过的头像</Dialog.Title>
      <Dialog.Close render={<Button variant="ghost" size="icon" aria-label="关闭用过的头像" />}><X size={17} /></Dialog.Close>
    </div>
    <Dialog.Description className="avatar-picker-description">
      {targetName
        ? `给「${targetName}」挑一张：点一下就换上。这里按角色名长期保存，换对话、重新导入都不会丢。`
        : '点一下就把这张换给角色。这里按角色名长期保存，换对话、重新导入都不会丢。'}
    </Dialog.Description>

    {presets.length > 12 && <div className="avatar-picker-toolbar">
      <Input
        className="avatar-picker-search"
        aria-label="按角色名筛选用过的头像"
        placeholder="按角色名筛一下"
        value={query}
        maxLength={60}
        onChange={event => setQuery(event.target.value)}
      />
      <span className="avatar-picker-count">{keyword ? `${list.length} / ${presets.length}` : `${presets.length} 条`}</span>
    </div>}

    {list.length ? <ul className="avatar-picker-grid" aria-label="用过的头像">
      {list.map(preset => {
        const inUse = Boolean(currentAvatar) && preset.avatar === currentAvatar
        return <li key={preset.id} className="avatar-picker-item">
          <button
            type="button"
            className="avatar-picker-thumb"
            data-in-use={inUse}
            title={inUse ? `「${preset.name}」正在用这张` : `换上「${preset.name}」的头像`}
            onClick={() => onPick(preset)}
          >
            <img src={preset.avatar} alt={preset.name} />
            <span className="avatar-picker-badge">{inUse ? <><Check size={13} /> 正在用</> : <><Check size={13} /> 用这张</>}</span>
          </button>
          <span className="avatar-picker-name" title={preset.name}>{preset.name}</span>
        </li>
      })}
    </ul> : <div className="avatar-picker-empty">
      <History size={26} />
      <p>{presets.length
        ? `没有名字里带「${query.trim()}」的记录，换个词试试。`
        : '还没有用过的头像。给任意一位角色上传或换一张，这里就会自动记下来。'}</p>
    </div>}

    <p className="avatar-picker-note">
      这一份按<b>角色名</b>长期保留，只增不删：取消头像、清空编辑器、重新导入都不会动它。改名与删除在「用户头像管理」的「用过的头像」那一节里。
    </p>
  </>
}
