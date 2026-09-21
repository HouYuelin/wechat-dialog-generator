import { useRef, useState } from 'react';
import { Users, Upload, X, UserCheck, Images, History, RotateCcw, Trash2, PencilLine } from 'lucide-react';
import { getDefaultAvatar } from '@/lib/parser';
import { avatarNameKey } from '@/lib/user-avatars';
import { rememberNameHistory } from '@/lib/name-history-store';
import type { AvatarPreset } from '@/lib/avatar-presets';
import type { ChatUser } from '@/types';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface UserAvatarManagerProps {
  users: ChatUser[];
  selfId: number | null;
  onUpdateAvatar: (userId: number, avatar: string) => void;
  onRemoveAvatar: (userId: number) => void;
  onSetSelf: (userId: number) => void;
  /** 上传单个头像：交给外层读文件并顺手存进素材库。不传则自己读。 */
  onUploadAvatar?: (userId: number, file: File) => void;
  /** 批量上传头像，按顺序发给角色。 */
  onBatchUpload?: (files: File[]) => void;
  /** 打开素材库（在这一位角色上选一张已有头像）。 */
  onOpenLibrary?: (userId: number) => void;
  /** 打开素材库做管理（上传 / 删除 / 改名）。 */
  onManageLibrary?: () => void;
  /** 素材库里现有的头像数量，显示在按钮上。 */
  libraryAvatarCount?: number;
  libraryEnabled?: boolean;
  /** 用过的头像归档：按角色名长期留着，只增不删。 */
  avatarPresets?: AvatarPreset[];
  /** 归档读出来了才放出这一段的入口。 */
  presetsEnabled?: boolean;
  /** 把归档里的这张头像还给同名的角色。 */
  onUsePreset?: (preset: AvatarPreset) => void;
  /** 给归档里的某一条改名字。返回 false 表示没改成（外层已经提示过原因），输入框留在原地让用户接着改。 */
  onRenamePreset?: (preset: AvatarPreset, name: string) => boolean;
  /** 从归档里删掉一条，只手动触发。 */
  onRemovePreset?: (preset: AvatarPreset) => void;
}

function AvatarCard({ user, index, isSelf, onUpdateAvatar, onRemoveAvatar, onSetSelf, onUploadAvatar, onOpenLibrary }: {
  user: ChatUser;
  index: number;
  isSelf: boolean;
  onUpdateAvatar: (userId: number, avatar: string) => void;
  onRemoveAvatar: (userId: number) => void;
  onSetSelf: (userId: number) => void;
  onUploadAvatar?: (userId: number, file: File) => void;
  onOpenLibrary?: (userId: number) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarSrc = user.avatar || getDefaultAvatar(index);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (onUploadAvatar) {
      onUploadAvatar(user.id, file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      onUpdateAvatar(user.id, ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="avatar-card">
      <div className="avatar-img-wrap">
        <img src={avatarSrc} alt={user.name} />
        <Button variant="ghost" size="icon" type="button" className="avatar-overlay" style={{ width: '100%', height: '100%', padding: 0, border: 0, borderRadius: 16, background: 'rgba(0,0,0,.35)' }} aria-label={`上传${user.name}的头像`} onClick={() => fileRef.current?.click()}>
          <Upload size={20} color="#fff" />
        </Button>
        {user.avatar && (
          <Button variant="destructive" size="icon" type="button" className="avatar-remove" style={{ width: 20, height: 20, padding: 0, borderRadius: '50%' }} aria-label={`移除${user.name}的自定义头像`} onClick={() => onRemoveAvatar(user.id)}>
            <X size={12} />
          </Button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleUpload} />
      </div>
      <span className="avatar-name">{user.name}</span>
      <div className="avatar-card-tools">
        {onOpenLibrary && (
          <Button variant="outline" size="sm" type="button" className="avatar-mini-btn" aria-label={`从素材库选择${user.name}的头像`} title="从素材库选择" onClick={() => onOpenLibrary(user.id)}>
            <Images size={12} /> 素材库
          </Button>
        )}
        {isSelf
          ? <span className="avatar-tag">自己</span>
          : <Button variant="outline" size="sm" type="button" className="avatar-mini-btn" onClick={() => onSetSelf(user.id)}><UserCheck size={12} /> 设为自己</Button>
        }
      </div>
    </div>
  );
}

export function UserAvatarManager({
  users, selfId, onUpdateAvatar, onRemoveAvatar, onSetSelf,
  onUploadAvatar, onBatchUpload, onOpenLibrary, onManageLibrary, libraryAvatarCount = 0, libraryEnabled = false,
  avatarPresets = [], presetsEnabled = false, onUsePreset, onRenamePreset, onRemovePreset,
}: UserAvatarManagerProps) {
  const batchRef = useRef<HTMLInputElement>(null);
  // 改名用的是行内输入框，正在改哪一条、草稿是什么都放在这里；换一条点就是换一个 id。
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  if (users.length === 0) return null;

  const commitRename = (preset: AvatarPreset) => {
    const accepted = onRenamePreset?.(preset, renameDraft);
    // 没改成（重名、空名字）就把输入框留着，用户不用重新点一次铅笔。
    if (accepted !== false) {
      // 改成功的新名字也收进「最近用过的昵称」，聊天标题、朋友圈里能直接点选。
      rememberNameHistory(renameDraft);
      setRenamingId(null);
    }
  };

  return (
    <div className="s-card">
      <div className="s-card-header">
        <h2><Users size={20} /> 用户头像管理</h2>
        <span className="s-card-badge">{users.length} 个用户</span>
      </div>
      <div className="s-card-body">
        <p style={{ fontSize: 12, color: 'var(--control-muted)', marginBottom: 14 }}>点击头像可上传自定义图片；上传过的都会留在素材库，用过的头像还会按角色名单独存一份，换对话也不会丢。</p>
        {(onBatchUpload || (libraryEnabled && onManageLibrary)) && (
          <div className="avatar-toolbar">
            <input
              ref={batchRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              aria-label="批量上传头像"
              onChange={event => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                if (files.length) onBatchUpload?.(files);
              }}
            />
            {onBatchUpload && <Button variant="outline" size="sm" type="button" onClick={() => batchRef.current?.click()}><Upload size={14} /> 批量上传头像</Button>}
            {libraryEnabled && onManageLibrary && <Button variant="outline" size="sm" type="button" onClick={onManageLibrary}><Images size={14} /> 素材库（{libraryAvatarCount}）</Button>}
            <small>
              批量上传按选择顺序覆盖前 {users.length} 位角色的头像，多出的存进素材库。
              {libraryEnabled ? '上传过的头像随时能在这里换回来。' : '当前浏览器无法保存素材库，这些头像只在本次编辑有效。'}
            </small>
          </div>
        )}        <div className="avatar-grid">
          {users.map((user, index) => (
            <AvatarCard
              key={user.id}
              user={user}
              index={index}
              isSelf={user.id === selfId}
              onUpdateAvatar={onUpdateAvatar}
              onRemoveAvatar={onRemoveAvatar}
              onSetSelf={onSetSelf}
              onUploadAvatar={onUploadAvatar}
              onOpenLibrary={libraryEnabled ? onOpenLibrary : undefined}
            />
          ))}
        </div>
      </div>
      {presetsEnabled && avatarPresets.length > 0 && <div className="avatar-preset-section">
        <div className="avatar-preset-head">
          <h3><History size={15} /> 用过的头像<span className="avatar-preset-count">{avatarPresets.length}</span></h3>
          <small>按角色名长期保留：换对话、重新导入、清空编辑器都不会自动清掉，重新导入时同名的角色还会自动对回来。可以在每一条上改名或删除。</small>
        </div>
        <ul className="avatar-preset-list">
          {avatarPresets.map(preset => {
            const owner = users.find(user => avatarNameKey(user.name) === avatarNameKey(preset.name));
            const inUse = Boolean(owner) && owner?.avatar === preset.avatar;
            if (renamingId === preset.id) return <li key={preset.id} className="avatar-preset-item avatar-preset-item-editing">
              <span className="avatar-preset-thumb"><img src={preset.avatar} alt={preset.name} /></span>
              <Input
                className="avatar-preset-rename"
                aria-label={`重命名用过的头像 ${preset.name}`}
                autoFocus
                value={renameDraft}
                maxLength={60}
                onChange={event => setRenameDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') { event.preventDefault(); commitRename(preset); }
                  if (event.key === 'Escape') { event.preventDefault(); setRenamingId(null); }
                }}
                onBlur={() => commitRename(preset)}
              />
            </li>;
            return <li key={preset.id} className="avatar-preset-item">
              <span className="avatar-preset-thumb"><img src={preset.avatar} alt={preset.name} /></span>
              <span className="avatar-preset-name" title={preset.name}>{preset.name}</span>
              {owner && onUsePreset
                ? <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="avatar-mini-btn"
                  aria-label={`把这张头像还给${owner.name}`}
                  title={`把这张头像还给「${owner.name}」`}
                  onClick={() => onUsePreset(preset)}
                ><RotateCcw size={12} /> {inUse ? '已用' : '用上'}</Button>
                : <span className="avatar-preset-tag" title="当前对话里没有这个角色，这张头像先留在归档里">仅保存</span>}
              {onRenamePreset && <Button
                variant="ghost"
                size="icon"
                type="button"
                className="avatar-preset-rename-btn"
                aria-label={`重命名用过的头像 ${preset.name}`}
                title="给这条记录改名"
                onClick={() => { setRenamingId(preset.id); setRenameDraft(preset.name); }}
              ><PencilLine size={14} /></Button>}
              {onRemovePreset && <Button
                variant="ghost"
                size="icon"
                type="button"
                className="avatar-preset-delete"
                aria-label={`删除用过的头像 ${preset.name}`}
                title="从用过的头像里删除"
                onClick={() => onRemovePreset(preset)}
              ><Trash2 size={14} /></Button>}
            </li>;
          })}
        </ul>
      </div>}
    </div>
  );
}
