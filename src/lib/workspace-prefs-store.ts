/**
 * 偏好的持久化：把「这次用的设置」记成「下次的起点」。
 *
 * 为什么存 localStorage 而不是跟着素材库走 IndexedDB：这些设置要在**首屏同步**拿出来，
 * 否则每次打开页面都会先闪一帧产品默认样式（默认灰底、绿色气泡）再跳回你的配色。
 * IndexedDB 没有同步接口，所以和昵称历史一样走 localStorage + 进程内缓存。
 *
 * 背景图单独存一条：它可能是几百 KB 到几 MB 的 data URL，而其余字段只有几百字节。
 * 混在一起写的话，每次拖动颜色选择器都要把整块字符串重新落盘一次（localStorage 是同步
 * 写，会卡主线程），配额也更容易被一张图吃光。分开之后，读写各走各的，互不牵连。
 *
 * 浏览器禁用了本地存储（隐私模式等）时整体降级成内存态：这一次打开照常能用，只是留不到
 * 下次。因此这里的读写全部包在 try/catch 里，任何一步失败都不该影响正在编辑的内容。
 */
import { defaultWorkspacePrefs, normalizeWorkspacePrefs, workspacePrefsEqual, type WorkspacePrefs } from './workspace-prefs'

const storageKey = 'wechat-dialog-generator:prefs'
const backgroundKey = 'wechat-dialog-generator:prefs-background'

let snapshot: WorkspacePrefs | null = null

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

function readStored(): WorkspacePrefs {
  const store = storage()
  if (!store) return defaultWorkspacePrefs()
  try {
    const prefs = normalizeWorkspacePrefs(JSON.parse(store.getItem(storageKey) ?? 'null'))
    // 背景图在另一条里；读不到就按「没有背景」处理，不影响其余字段。
    const background = store.getItem(backgroundKey)
    return {
      ...prefs,
      style: { ...prefs.style, backgroundImage: background && background.startsWith('data:image/') ? background : null },
    }
  } catch {
    return defaultWorkspacePrefs()
  }
}

/** 当前偏好。第一次调用时从本地存储读一遍，之后一直复用同一个对象。 */
export function getWorkspacePrefs(): WorkspacePrefs {
  if (!snapshot) snapshot = readStored()
  return snapshot
}

function writeBackground(store: Storage, previous: string | null, next: string | null) {
  if (previous === next) return
  try {
    if (next) store.setItem(backgroundKey, next)
    else store.removeItem(backgroundKey)
  } catch {
    // 背景图太大写不进去：这一次留在内存里，其余设置不受影响。
  }
}

/**
 * 写入一份完整偏好，返回是否真的写了。
 *
 * 没变化就不写：这个函数会被设置变化的 effect 频繁调用（拖动颜色、改音量都会触发），
 * 而 localStorage 是同步写。比较走 workspacePrefsEqual（固定字段顺序），不会假报变化。
 */
function commit(next: WorkspacePrefs): boolean {
  const current = getWorkspacePrefs()
  if (workspacePrefsEqual(current, next)) return false
  snapshot = next

  const store = storage()
  if (!store) return false

  writeBackground(store, current.style.backgroundImage, next.style.backgroundImage)
  const scalars: WorkspacePrefs = { ...next, style: { ...next.style, backgroundImage: null } }
  try {
    store.setItem(storageKey, JSON.stringify(scalars))
    return true
  } catch {
    // 配额满或被策略拒绝：清掉这条旧记录，避免下次读回一份过期的设置，这一次只留在内存里。
    try {
      store.removeItem(storageKey)
    } catch {
      // 连删除都不行就什么都不做。
    }
    return false
  }
}

/**
 * 更新偏好的一部分，其余字段沿用当前值。
 *
 * 为什么要「一部分」：不同来源各自管自己那一半——App 管样式与播放导出（它的状态就在那儿），
 * 尺寸弹层管预览的窗口宽度（状态在组件里）。合并的基准是当前快照，所以两边先后写入不会互相
 * 覆盖，谁也不必知道对方改了什么。
 */
export function patchWorkspacePrefs(patch: Partial<WorkspacePrefs>): boolean {
  return commit({ ...getWorkspacePrefs(), ...patch })
}
