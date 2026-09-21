import { useRef, useEffect, type CSSProperties } from 'react';
import type { ChatUser, ChatMessage, PhoneSettings } from '@/types';
import { getDefaultAvatar } from '@/lib/parser';
import { defaultScreenSize, designHeightFor, type ScreenSize } from '@/lib/phone-size';
import { normalizeImageMax } from '@/lib/image-size';
import { bubbleMaxWidth, fontScaleRatio, normalizeFontScale } from '@/lib/font-size';
import { WechatPhoneHeader } from '@/components/WechatPhoneHeader';
import { EmojiText } from '@/components/EmojiText';
import './PhonePreview.css';

interface PhonePreviewProps {
  users: ChatUser[];
  messages: ChatMessage[];
  settings: PhoneSettings;
  selfId: number | null;
  phoneRef?: React.RefObject<HTMLDivElement | null>;
  onUpdateMessage?: (msgId: number, content: string) => void;
  /**
   * 点图片消息气泡时改走素材库：传了就用它（素材库里选一张，或从弹窗里现传）。
   * 离屏渲染（视频帧、批量图）不传，行为完全不变。
   */
  onPickSticker?: (msgId: number) => void;
  /** 直接上传一张新图时的处理，交给外层读文件并入素材库；不传则自己读。 */
  onUploadImage?: (msgId: number, file: File) => Promise<string | null>;
  /** 导出分辨率。不改内部坐标系的宽度，只按比例决定它有多高。 */
  screen?: ScreenSize;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function TimeNotice({ content }: { content: string }) {
  return (
    <div className="wc-notice">
      <span className="wc-notice-bg">{content}</span>
    </div>
  );
}

function ChatBubble({ msg, user, userIndex, isSelf, isGroup, selfColor, otherColor, onUpdateMessage, onPickSticker, onUploadImage }: {
  msg: ChatMessage;
  user: ChatUser;
  userIndex: number;
  isSelf: boolean;
  isGroup: boolean;
  selfColor: string;
  otherColor: string;
  onUpdateMessage?: (msgId: number, content: string) => void;
  onPickSticker?: (msgId: number) => void;
  onUploadImage?: (msgId: number, file: File) => Promise<string | null>;
}) {
  const avatarSrc = user.avatar || getDefaultAvatar(userIndex);
  const bubbleColor = isSelf ? selfColor : otherColor;
  const imgInputRef = useRef<HTMLInputElement>(null);

  const applyImage = (content: string) => onUpdateMessage?.(msg.id, content);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUpdateMessage) return;
    // 外层能处理（顺带存进素材库）就交给外层，处理不了再自己读。
    if (onUploadImage) {
      void onUploadImage(msg.id, file).then(url => { if (url) applyImage(url); });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => applyImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleImageClick = () => {
    if (onPickSticker) onPickSticker(msg.id);
    else imgInputRef.current?.click();
  };

  const renderContent = () => {
    switch (msg.type) {
      case 'text':
        return (
          <div className="wc-bubble" style={{ background: bubbleColor }}>
            <span className="wc-arrow" style={{ background: bubbleColor }} />
            <EmojiText text={msg.content} />
          </div>
        );
      case 'image': {
        const hasImage = msg.content && !msg.content.includes('placeholder');
        return (
          <div className="wc-bubble wc-bubble-image" onClick={handleImageClick} style={{ cursor: 'pointer' }}>
            {hasImage ? (
              <img src={msg.content} alt="" />
            ) : (
              <div className="wc-img-placeholder">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" fill="#999" stroke="none" /><path d="M21 15l-5-5L5 21" /></svg>
                <span>{onPickSticker ? '点击从素材库选图' : '点击上传图片'}</span>
              </div>
            )}
            <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
          </div>
        );
      }
      case 'voice': {
        const dur = msg.params.duration || 2;
        // 宽度按秒数算出来，得跟着字号一起缩放，否则「紧凑」档下语音条还是原来那么长。
        const w = 180 + Math.min(dur * 30, 400);
        return (
          <div className="wc-voice-stack">
            <div className="wc-bubble wc-bubble-voice" style={{ background: bubbleColor, width: `calc(${w}px * var(--wc-font-scale, 1))` }}>
              <span className="wc-arrow" style={{ background: bubbleColor }} />
              {isSelf ? (
                <><span className="wc-voice-dur">{dur}&quot;</span><img className="wc-voice-wave" src={`${import.meta.env.BASE_URL}wechat-voice-icon2.png`} alt="" /></>
              ) : (
                <><img className="wc-voice-wave" src={`${import.meta.env.BASE_URL}wechat-voice-icon1.png`} alt="" /><span className="wc-voice-dur">{dur}&quot;</span>{!msg.params.transcript && <i className="wc-voice-unread" />}</>
              )}
            </div>
            {msg.params.transcript && (
              <div className="wc-voice-transcript">{escHtml(msg.params.transcript)}</div>
            )}
          </div>
        );
      }
      case 'redpacket':
        return (
          <div className="wc-bubble wc-bubble-redpacket">
            <span className="wc-arrow" style={{ background: '#f79c46' }} />
            <div className="wc-rp-content">
              <div className="wc-rp-icon wc-rp-icon-redpacket"><img src={`${import.meta.env.BASE_URL}wechat-trans-icon3.png`} alt="" /></div>
              <div className="wc-rp-info">
                {/* 红包备注刻意不认表情标签：微信的红包留言本身就不支持表情，这里跟着它保持一致。 */}
                <span>{escHtml(msg.params.remark || '恭喜发财，大吉大利')}</span>
              </div>
            </div>
            <div className="wc-rp-bottom"><span>微信红包</span></div>
          </div>
        );
      case 'transfer':
        return (
          <div className="wc-bubble wc-bubble-transfer">
            <span className="wc-arrow" style={{ background: '#f79c46' }} />
            <div className="wc-rp-content">
              <div className="wc-rp-icon"><img src={`${import.meta.env.BASE_URL}wechat-trans-icon1.png`} alt="" /></div>
              <div className="wc-rp-info">
                <span>¥{parseFloat(msg.params.amount || '0').toFixed(2)}</span>
                {/* 转账备注在微信里是可以带表情的，所以这里认标签。 */}
                <small><EmojiText text={msg.params.remark || '转账'} /></small>
              </div>
            </div>
            <div className="wc-rp-bottom"><span>微信转账</span></div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`wc-dialog ${isSelf ? 'wc-dialog-right' : ''}`}>
      <div className="wc-face">
        <img src={avatarSrc} alt={user.name} />
      </div>
      <div className="wc-body">
        {!isSelf && isGroup && <div className="wc-nick">{user.name}</div>}
        {renderContent()}
      </div>
    </div>
  );
}

export function PhonePreview({ users, messages, settings, selfId, phoneRef, onUpdateMessage, onPickSticker, onUploadImage, screen }: PhonePreviewProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // 内部坐标系宽度固定 1125（见 PhonePreview.css），只有高度跟着屏幕比例走。
  const designHeight = designHeightFor(screen ?? defaultScreenSize);
  // 图片消息的最长边：读取时兜一次底，老项目里没有这个字段也能正常渲染。
  const imageMax = normalizeImageMax(settings.imageMax);
  // 字号缩放：字号 / 行高 / 内边距 / 头像 / 间距这一整套度量都乘这个系数，
  // 由 PhonePreview.css 消费。气泡可用宽度会跟着收窄，所以一并算出来注入。
  const fontScale = normalizeFontScale(settings.fontScale);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [messages]);

  const isGroup = users.length > 2;

  return (
    <div className="wc-phone-scale-wrap">
      <div className="wc-phone-wrap">
        <div className="wc-phone-content">
          <div className={`wc-phone wc-phone-${settings.platform}`} ref={phoneRef} style={{ '--wc-phone-design-height': `${designHeight}px`, '--wc-image-max': `${imageMax}px`, '--wc-font-scale': String(fontScaleRatio(fontScale)), '--wc-body-max': `${bubbleMaxWidth(fontScale)}px` } as CSSProperties}>
            <div className="wc-phone-top">
              <WechatPhoneHeader settings={settings} />
            </div>

            {/* Chat body */}
            <div
              className={`wc-chat-body${settings.backgroundImage ? ' wc-chat-body-image' : ''}`}
              ref={bodyRef}
              style={{
                backgroundColor: settings.backgroundColor || '#ededed',
                backgroundImage: settings.backgroundImage ? `url(${settings.backgroundImage})` : undefined,
              }}
            >
              <div className="wc-chat-content">
                {messages.map((msg) => {
                  if (msg.type === 'time') {
                    return <TimeNotice key={msg.id} content={msg.content} />;
                  }
                  const userIndex = users.findIndex(u => u.id === msg.senderId);
                  const user = users[userIndex] || users[0];
                  const isSelf = msg.senderId === selfId;
                  return (
                    <ChatBubble
                      key={msg.id}
                      msg={msg}
                      user={user}
                      userIndex={userIndex >= 0 ? userIndex : 0}
                      isSelf={isSelf}
                      isGroup={isGroup}
                      selfColor={settings.selfBubbleColor}
                      otherColor={settings.otherBubbleColor}
                      onUpdateMessage={onUpdateMessage}
                      onPickSticker={onPickSticker}
                      onUploadImage={onUploadImage}
                    />
                  );
                })}
              </div>
            </div>

            {/* Bottom bar */}
            <div className="wc-bottom">
              <div className="wc-bottom-chat">
                <div className="wc-bottom-inner">
                  {/* 语音按钮 */}
                  <div className="wc-bottom-icon">
                    <img src={`${import.meta.env.BASE_URL}wechat-bottom-icon1.png`} alt="语音" />
                  </div>
                  {/* 输入框 */}
                  <div className="wc-input-box">
                    <svg className="wc-input-mic" viewBox="0 0 48 48" fill="none" stroke="#999" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 20v9a5 5 0 0 0 10 0v-9a5 5 0 0 0-10 0z" />
                      <path d="M14 28c0 5.5 4.5 10 10 10s10-4.5 10-10" />
                      <line x1="24" y1="38" x2="24" y2="42" />
                    </svg>
                  </div>
                  {/* 表情按钮 */}
                  <div className="wc-bottom-icon">
                    <img src={`${import.meta.env.BASE_URL}wechat-bottom-icon2.png`} alt="表情" />
                  </div>
                  {/* 加号按钮 */}
                  <div className="wc-bottom-icon">
                    <img src={`${import.meta.env.BASE_URL}wechat-bottom-icon3.png`} alt="加号" />
                  </div>
                </div>
              </div>
              <div className="wc-home-indicator"><i /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
