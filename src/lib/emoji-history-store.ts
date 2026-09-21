/**
 * 「最近用过的表情」的持久化与订阅。
 *
 * 和昵称历史同一套写法（见 name-history-store.ts）：就是几十个标签名，要在面板顶部
 * **同步**渲染出来，所以走 localStorage 而不是 IndexedDB；用 useSyncExternalStore 订阅
 * 同一份快照，聊天页、批量页、朋友圈几个面板里的「最近用过」是同一份。
 *
 * 存的是**标签名**而不是 emoji 字符，和文本里存的保持一致；读到不认识的标签（旧版本写过、
 * 手改坏了）由 normalizeRecentEmoji 丢掉。
 *
 * 浏览器禁用了本地存储（隐私模式等）时降级成内存态：这次打开照常能用、只是留不到下次。
 */
import { maxRecentEmoji, normalizeRecentEmoji, touchRecentEmoji } from './wechat-emoji';

const storageKey = 'wechat-dialog-generator:emoji-recent';

/** 读不到东西时固定返回它——useSyncExternalStore 要求快照引用稳定。 */
const emptyList: string[] = [];

let snapshot: string[] | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    // 隐私模式下 localStorage 这个对象是存在的，一碰 getItem 才抛，所以先探一次。
    window.localStorage.getItem(storageKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStored(): string[] {
  const store = storage();
  if (!store) return emptyList;
  try {
    return normalizeRecentEmoji(JSON.parse(store.getItem(storageKey) ?? 'null'));
  } catch {
    return emptyList;
  }
}

export function getRecentEmoji(): string[] {
  if (!snapshot) snapshot = readStored();
  return snapshot;
}

export function subscribeRecentEmoji(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: string[]) {
  // 没变化就连通知带写库一起跳过：点面板里同一个表情会频繁走到这里。
  if (next === snapshot) return;
  snapshot = next;
  const store = storage();
  if (store) {
    try {
      store.setItem(storageKey, JSON.stringify(next));
    } catch {
      // 写满或被禁：留在内存里，这一次打开照常能选。
    }
  }
  for (const listener of listeners) listener();
}

/** 记下刚点的那个表情，排到「最近用过」最前。 */
export function rememberRecentEmoji(name: string) {
  commit(touchRecentEmoji(getRecentEmoji(), name, maxRecentEmoji));
}

/** 本地存储是否可用（不可用时只在这一次会话里有效）。 */
export function recentEmojiAvailable() {
  return storage() !== null;
}
