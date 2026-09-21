import { Fragment } from 'react';
import { splitEmoji } from '@/lib/wechat-emoji';

/**
 * 渲染带表情标签的文本：`[呲牙]` → 😁，换行 → `<br>`。
 *
 * 为什么用 React 元素而不是 `dangerouslySetInnerHTML` 拼字符串：
 * 拼 HTML 就得自己记得转义（原来每个调用点都配一遍 `escHtml`），漏一处就是一个 XSS；
 * 交给 React 之后标签里的尖括号天然是纯文本，调用点只需要传字符串。
 *
 * 换行仍然渲染成 `<br>` 而不是依赖 `white-space: pre-wrap`：气泡里原来就是这么做
 * （换行折叠成空格再看不出断行），保持同一套行为，导出的图才不会和以前不一样。
 */
export function EmojiText({ text, className }: { text: string; className?: string }) {
  const parts = splitEmoji(text);
  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (part.type === 'emoji') {
          return (
            <span className="wc-emoji" role="img" aria-label={part.name} key={`e${index}`}>
              {part.char}
            </span>
          );
        }
        const lines = part.value.split('\n');
        return (
          <Fragment key={`t${index}`}>
            {lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </Fragment>
        );
      })}
    </span>
  );
}
