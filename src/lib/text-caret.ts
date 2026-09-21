/**
 * 在输入框的光标处插入一段文本。
 *
 * 只读 `value` / `selectionStart` / `selectionEnd` 三个字段，不碰 DOM，
 * 所以单测里可以直接喂一个普通对象。调用方拿到 `value` 写回自己的 state，
 * 再用 `caret` 把光标放回插入内容之后——连着点几个表情时不用手动移光标。
 */
export interface CaretTarget {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

export interface CaretInsertResult {
  /** 插入之后的整串内容。 */
  value: string;
  /** 插入内容之后的光标位置。 */
  caret: number;
}

export function insertAtCaret(target: CaretTarget, snippet: string): CaretInsertResult {
  const end = target.value.length;
  // 从没聚焦过的输入框里 selection 是 null，这时追加到末尾最符合预期。
  const rawStart = target.selectionStart ?? end;
  const rawEnd = target.selectionEnd ?? rawStart;
  // 越界（读取时值已经变短）与反选都收敛成一个合法区间。
  const start = Math.min(Math.max(0, Math.min(rawStart, rawEnd)), end);
  const stop = Math.min(Math.max(0, Math.max(rawStart, rawEnd)), end);
  return {
    value: target.value.slice(0, start) + snippet + target.value.slice(stop),
    caret: start + snippet.length,
  };
}
