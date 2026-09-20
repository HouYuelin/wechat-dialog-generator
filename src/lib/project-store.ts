import type { ChatMessage, ChatUser, PhoneSettings } from '@/types'
import { normalizeMediaLibrary, type MediaAsset } from './media-library'

const databaseName = 'wechat-dialog-generator'
// 素材库（media-assets）是版本 4 新加的 store；升版本号时记得在这里把新 store 一并建出来，
// 否则老用户升级上来会打开一个缺 store 的库，读素材直接抛错。
const databaseVersion = 4
const projectStore = 'projects'
const momentStore = 'moment-projects'
const sceneStore = 'scene-projects'
const mediaAssetStore = 'media-assets'

export const activeProjectStorageKey = 'wechat-dialog-generator:active-project'

export interface ChatProjectSnapshot {
  importText: string
  users: ChatUser[]
  messages: ChatMessage[]
  settings: PhoneSettings
  selfId: number | null
}

export interface ChatProject extends ChatProjectSnapshot {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  version: 1
}

export interface MomentComment {
  id: string
  author: string
  content: string
}

export interface MomentProject {
  id: 'active'
  author: string
  avatar: string | null
  coverColor: string
  coverImage: string | null
  content: string
  images: string[]
  location: string
  timeLabel: string
  likes: string[]
  comments: MomentComment[]
  updatedAt: string
  version: 1
}

export type WechatSceneKind = 'payment' | 'redpacket' | 'profile' | 'group'

export interface WechatSceneProject {
  id: WechatSceneKind
  fields: Record<string, string>
  updatedAt: string
  version: 1
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(projectStore)) {
        const store = database.createObjectStore(projectStore, { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
      }
      if (!database.objectStoreNames.contains(momentStore)) {
        database.createObjectStore(momentStore, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(sceneStore)) {
        database.createObjectStore(sceneStore, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(mediaAssetStore)) {
        const store = database.createObjectStore(mediaAssetStore, { keyPath: 'id' })
        store.createIndex('kind', 'kind')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'))
  })
}

export async function loadMomentProject() {
  return withNamedStore<MomentProject | undefined>(momentStore, 'readonly', store => store.get('active'))
}

export async function saveMomentProject(project: MomentProject) {
  await withNamedStore(momentStore, 'readwrite', store => store.put(project))
  return project
}

export async function loadWechatScene(kind: WechatSceneKind) {
  return withNamedStore<WechatSceneProject | undefined>(sceneStore, 'readonly', store => store.get(kind))
}

export async function saveWechatScene(project: WechatSceneProject) {
  await withNamedStore(sceneStore, 'readwrite', store => store.put(project))
  return project
}

/**
 * 读出素材库。存进去的每条都过了 normalizeMediaAsset 才落库，但浏览器里的老数据、
 * 手工改过的记录仍然可能不干净，所以读的时候再规范一遍并按图去重。
 */
export async function loadMediaAssets() {
  const stored = await withNamedStore<unknown[]>(mediaAssetStore, 'readonly', store => store.getAll())
  return normalizeMediaLibrary(stored)
}

/**
 * 增量写入：只 put 这一批新素材，不重写整个库。恢复一次几十张、每张几百 KB 的库如果每次
 * 全量重写，光是序列化就够卡一下。`store.count()` 只是用来等事务提交完成的收尾请求。
 */
export async function putMediaAssets(assets: MediaAsset[]) {
  if (!assets.length) return
  await withNamedStore(mediaAssetStore, 'readwrite', store => {
    for (const asset of assets) store.put(asset)
    return store.count()
  })
}

export async function deleteMediaAssetRecord(id: string) {
  await withNamedStore(mediaAssetStore, 'readwrite', store => store.delete(id))
}

async function withNamedStore<T>(
  name: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase()
  try {
    return await requestResult(operation(database.transaction(name, mode).objectStore(name)))
  } finally {
    database.close()
  }
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase()
  try {
    return await requestResult(operation(database.transaction(projectStore, mode).objectStore(projectStore)))
  } finally {
    database.close()
  }
}

export async function listProjects() {
  const projects = await withStore('readonly', store => store.getAll()) as ChatProject[]
  return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function saveProject(project: ChatProject) {
  await withStore('readwrite', store => store.put(project))
  return project
}

export async function deleteProject(projectId: string) {
  await withStore('readwrite', store => store.delete(projectId))
}

export function projectName(snapshot: ChatProjectSnapshot, date = new Date()) {
  const contact = snapshot.settings.contactName.trim()
  if (contact) return `${contact}的对话`
  const participant = snapshot.users.find(user => user.id !== snapshot.selfId)?.name
  if (participant) return `${participant}的对话`
  const stamp = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `未命名对话 ${stamp}`
}

export function projectHasContent(snapshot: ChatProjectSnapshot) {
  return snapshot.messages.length > 0 || snapshot.users.length > 0 || snapshot.importText.trim().length > 0
}

export function copyProject(project: ChatProject, now = new Date()) {
  const timestamp = now.toISOString()
  return {
    ...structuredClone(project),
    id: crypto.randomUUID(),
    name: `${project.name} 副本`,
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies ChatProject
}
