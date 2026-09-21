/**
 * 昵称历史的持久化与订阅。
 *
 * 为什么存 localStorage 而不是跟着素材库走 IndexedDB：这份数据就是几十个字符串，
 * 而它要在输入框旁边**同步**渲染出「最近用过」的筹码行，IndexedDB 的异步读取会先闪一帧空白。
 * 用 useSyncExternalStore 订阅同一份快照，聊天 / 朋友圈 / 场景几个工具页里的输入框
 * 共享这一份历史，谁记了一个新名字，别处的筹码行立刻能看到。
 *
 * 浏览器禁用了本地存储（隐私模式等）时整体降级成内存态：这次打开照常能用、只是留不到下次。
 * 因此这里的读写全部包在 try/catch 里，任何一步失败都不该影响用户正在敲的输入。
 */
import { forgetName, normalizeNameHistory, rememberNames, type NameHistoryEntry } from './name-history'

const storageKey = 'wechat-dialog-generator:name-history'

/** 读不到东西时固定返回它——useSyncExternalStore 要求快照引用稳定。 */
const emptyHistory: NameHistoryEntry[] = []

let snapshot: NameHistoryEntry[] | null = null
const listeners = new Set<() => void>()

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    // 隐私模式下 localStorage 这个对象是存在的，一碰 getItem 才抛，所以先探一次。
    window.localStorage.getItem(storageKey)
    return window.localStorage
  } catch {
    return null
  }
}

function readStored(): NameHistoryEntry[] {
  const store = storage()
  if (!store) return emptyHistory
  try {
    return normalizeNameHistory(JSON.parse(store.getItem(storageKey) ?? 'null'))
  } catch {
    return emptyHistory
  }
}

/** 当前快照。第一次调用时从本地存储读一遍，之后一直复用同一个数组引用。 */
export function getNameHistory(): NameHistoryEntry[] {
  if (!snapshot) snapshot = readStored()
  return snapshot
}

export function subscribeNameHistory(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function commit(next: NameHistoryEntry[]) {
  // 没变化就不要通知订阅者，更不要写库：输入框 blur 会频繁走到这里。
  if (next === snapshot) return
  snapshot = next
  const store = storage()
  if (store) {
    try {
      store.setItem(storageKey, JSON.stringify(next))
    } catch {
      // 写满或被禁：留在内存里，这一次打开照常能选。
    }
  }
  for (const listener of listeners) listener()
}

/** 记下用过的名字，可以一次传一批（比如导入了一份聊天记录）。 */
export function rememberNameHistory(input: string | readonly string[]) {
  commit(rememberNames(getNameHistory(), input))
}

export function forgetNameHistory(name: string) {
  commit(forgetName(getNameHistory(), name))
}

/** 本地存储是否可用（不可用时历史只在这一次会话里有效）。 */
export function nameHistoryAvailable() {
  return storage() !== null
}
