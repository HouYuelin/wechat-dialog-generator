import { useRef } from 'react';
import { Users, Upload, X, UserCheck, Images } from 'lucide-react';
import { getDefaultAvatar } from '@/lib/parser';
import type { ChatUser } from '@/types';
import { Button } from './ui/button';

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
}: UserAvatarManagerProps) {
  const batchRef = useRef<HTMLInputElement>(null);
  if (users.length === 0) return null;

  return (
    <div className="s-card">
      <div className="s-card-header">
        <h2><Users size={20} /> 用户头像管理</h2>
        <span className="s-card-badge">{users.length} 个用户</span>
      </div>
      <div className="s-card-body">
        <p style={{ fontSize: 12, color: 'var(--control-muted)', marginBottom: 14 }}>点击头像可上传自定义图片；上传过的都会留在素材库，下次直接点选。</p>
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
    </div>
  );
}
