import { useState, useSyncExternalStore, type RefObject } from 'react';
import { Smile } from 'lucide-react';
import { Button } from './ui/button';
import { emojiCharOf, emojiGroupLabels, emojiGroupOrder, emojiTag, emojisOfGroup, type EmojiGroupId } from '@/lib/wechat-emoji';
import { getRecentEmoji, rememberRecentEmoji, subscribeRecentEmoji } from '@/lib/emoji-history-store';
import { insertAtCaret } from '@/lib/text-caret';
import './EmojiPicker.css';

interface EmojiPickerProps {
  /**
   * 插到哪个输入框的光标处。不传就只在面板里看（点了不动任何东西）。
   * 批量页那种「一列输入框共用一个面板」的用法，把 ref.current 在聚焦时指向当前那一个即可。
   */
  target?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  /** 插入后的整串文本交回来，由调用方写进自己的 state。 */
  onInsert?: (value: string) => void;
  disabled?: boolean;
  /** 按钮文案，默认「表情」。 */
  label?: string;
}

/**
 * 微信表情面板：点一个表情，就把它的标签（`[呲牙]`）插到输入框光标处。
 *
 * **插的是标签不是 emoji 字符**，这是整个表情功能的地基（见 lib/wechat-emoji.ts）：
 * 记录文本里躺的是几个字节的 `[呲牙]`，导入导出原样往返，渲染时才变成表情。
 * 所以手写 `[呲牙]` 和从面板里点，最后得到的文本完全一样。
 */
export function EmojiPicker({ target, onInsert, disabled = false, label = '表情' }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<EmojiGroupId>('face');
  const recent = useSyncExternalStore(subscribeRecentEmoji, getRecentEmoji, getRecentEmoji);

  function pick(name: string) {
    rememberRecentEmoji(name);
    const input = target?.current;
    if (!input || !onInsert) return;
    const { value, caret } = insertAtCaret({ value: input.value, selectionStart: input.selectionStart, selectionEnd: input.selectionEnd }, emojiTag(name));
    onInsert(value);
    // 光标放到插入内容之后：连着点几个表情不用手动把光标挪回来。
    // 等一帧是因为上面那次 setState 要等 React 提交完，输入框里才是新值。
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  }

  /** 最近用过的可能来自任何一组，取字符得按标签查全表，不能只在自己那一组里找。 */
  const items = (names: string[]) => names.map(name => (
    <button type="button" className="emoji-picker-item" key={name} title={emojiTag(name)} aria-label={`插入表情 ${name}`} onClick={() => pick(name)}>
      {emojiCharOf(name) ?? name}
    </button>
  ));

  return (
    <div className="emoji-picker">
      <Button type="button" variant="outline" size="sm" className="emoji-picker-toggle" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}>
        <Smile size={15} /> {label}
      </Button>
      {open && (
        <div className="emoji-picker-panel">
          {recent.length > 0 && (
            <>
              <span className="emoji-picker-label">最近用过</span>
              <div className="emoji-picker-grid">{items(recent)}</div>
            </>
          )}
          <div className="emoji-picker-tabs" role="tablist" aria-label="表情分组">
            {emojiGroupOrder.map(id => (
              <button
                type="button"
                role="tab"
                aria-selected={group === id}
                className={`emoji-picker-tab${group === id ? ' is-active' : ''}`}
                key={id}
                onClick={() => setGroup(id)}
              >
                {emojiGroupLabels[id]}
              </button>
            ))}
          </div>
          <div className="emoji-picker-grid">
            {emojisOfGroup(group).map(entry => (
              <button type="button" className="emoji-picker-item" key={entry.name} title={emojiTag(entry.name)} aria-label={`插入表情 ${entry.name}`} onClick={() => pick(entry.name)}>
                {entry.char}
              </button>
            ))}
          </div>
          <p className="emoji-picker-hint">文本里直接写 <code>[呲牙]</code> 这样的标签，导入时也会自动变成表情；<code>[图片]</code>、<code>[红包]</code>、<code>[转账]</code>、<code>[语音]</code> 是消息格式，不当表情。</p>
        </div>
      )}
    </div>
  );
}
