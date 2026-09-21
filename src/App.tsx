import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/controls';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useConfirm } from '@/lib/use-confirm';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { captureChatPhone } from '@/lib/capture-chat';
import { ArrowLeft, ArrowRight, BellRing, BookOpen, Check, ChevronRight, Download, Copy, FolderOpen, History, Image as ImageIcon, LayoutGrid, MessageSquare, Settings2, Share2, ShieldCheck, UserRound, UsersRound, Video } from 'lucide-react';
import { ImportPanel } from '@/components/ImportPanel';
import { UserAvatarManager } from '@/components/UserAvatarManager';
import { MessageEditor } from '@/components/MessageEditor';
import { MediaLibraryDialog } from '@/components/MediaLibraryDialog';
import { SoundLibraryDialog } from '@/components/SoundLibraryDialog';
import { SettingsPanel } from '@/components/SettingsPanel';
import { PhonePreview } from '@/components/PhonePreview';
import { GrowthContent } from '@/components/GrowthContent';
import { ProjectPanel } from '@/components/ProjectPanel';
import { MomentsEditor } from '@/components/MomentsEditor';
import { WechatSceneEditor } from '@/components/WechatSceneEditor';
import { AccountDialog } from '@/components/AccountDialog';
import { PaymentDialog } from '@/components/PaymentDialog';
import { UpdateAnnouncement } from '@/components/UpdateAnnouncement';
import { ShareDialog } from '@/components/ShareDialog';
import { BatchStudio } from '@/components/BatchStudio';
import { ExportLogPage } from '@/components/ExportLogPage';
import { beginExportLog, exportLogError } from '@/lib/export-log';
import { WorkspacePanels } from '@/components/WorkspacePanels';
import { ChatPlaybackBar } from '@/components/ChatPlaybackBar';
import { VideoExportDialog, VideoProgressOverlay, type VideoCaptureMode, type VideoExportSettings } from '@/components/VideoExportDialog';
import { renderChatFrames, renderChatScrollFrame } from '@/components/chat-video-render';
import {
  buildPlaybackTimeline,
  frameIndexAt,
  maxVideoMessages,
  notifyEvents,
  playbackDurationLabel,
  type PlaybackPace,
} from '@/lib/chat-playback';
import { pickVideoMimeType, videoContainerLabel, videoExportSupported, videoFileExtension, videoSizeOption, type VideoSizeId } from '@/lib/chat-video';
import { screenSizeLabel, type ScreenSize } from '@/lib/phone-size';
import { recordChatVideo, recordScrollingChatVideo } from '@/lib/chat-video-recorder';
import { videoContentScreen } from '@/lib/video-padding';
import { scrollVideoPlan } from '@/lib/chat-scroll-video';
import { loadNotifySoundFile, notifyAudioContext, playNotify, resumeNotifyAudio, type NotifyCustomBuffers, type NotifyKind } from '@/lib/notify-sound';
import {
  addSoundAssets,
  createSoundAsset,
  findSoundAssetById,
  removeSoundAsset,
  renameSoundAsset,
  touchSoundAsset,
  type SoundAsset,
} from '@/lib/sound-library';
import { StudioLink, ToolHome } from '@/components/ToolHome';
import { workspaceTools } from '@/lib/workspace-tools';
import { readWorkspaceRoute, workspaceHref, type WorkspaceRoute } from '@/lib/workspace-route';
import { trackGrowthEvent } from '@/lib/growth-analytics';
import { RewardHeaderButton, RewardPromotion } from '@/components/RewardPromotion';
import {
  OfficialAccountDialog,
  officialAccountId,
  type OfficialAccountPlacement,
} from '@/components/OfficialAccountDialog';
import { appendMessageToRecord, parseChatRecord } from '@/lib/parser';
import { avatarNameKey, carryOverAvatars, carryOverSelfId, isSelfAlias } from '@/lib/user-avatars';
import { rememberNameHistory } from '@/lib/name-history-store';
import {
  applyPresetsToUsers,
  removeAvatarPreset,
  renameAvatarPreset,
  rememberUserAvatars,
  touchAvatarPreset,
  type AvatarPreset,
} from '@/lib/avatar-presets';
import {
  activeProjectStorageKey,
  copyProject,
  deleteAvatarPresetRecord,
  deleteMediaAssetRecord,
  deleteSoundAssetRecord,
  deleteProject,
  listProjects,
  loadAvatarPresets,
  loadMediaAssets,
  loadSoundAssets,
  projectHasContent,
  projectName,
  putAvatarPresets,
  putMediaAssets,
  putSoundAssets,
  saveProject,
  type ChatProject,
  type ChatProjectSnapshot,
} from '@/lib/project-store';
import {
  messageCountBucket,
  participantCountBucket,
  trackProductEvent,
  type WechatTool,
} from '@/lib/product-analytics';
import {
  AccountApiError,
  captureExportIdentity, assertExportIdentity, isExportIdentityCurrent,
  type ExportIdentity,
  verifyAccountEmail, pendingInvite, visitInvite, completeAccountExport,
  consumeAccountExport,
  consumeGuestExport,
  guestQuota,
  loginAccount,
  logoutAccount,
  redeemFollowBonus,
  registerAccount,
  restoreAccount,
  type AccountSession,
  type ExportQuota,
} from '@/lib/account-api';
import { createSameTemplateUrl, readSameTemplateHash } from '@/lib/share-link';
import { readImageFile } from '@/lib/image-file';
import {
  addMediaAssets,
  assignAvatars,
  createMediaAsset,
  findAssetByDataUrl,
  isImageMessageKind,
  mediaAssetsOfKind,
  removeMediaAsset,
  renameMediaAsset,
  touchMediaAsset,
  type MediaAsset,
  type MediaImportOutcome,
  type MediaKind,
} from '@/lib/media-library';
import type { ChatUser, ChatMessage, PhoneSettings } from '@/types';
import {
  defaultPhoneSettings,
  settingsWithStyle,
  stylePrefsFromSettings,
  type PlaybackPrefs,
} from '@/lib/workspace-prefs';
import { getWorkspacePrefs, patchWorkspacePrefs } from '@/lib/workspace-prefs-store';

/** 背景图有两个用处：聊天背景写进手机样式，朋友圈封面写进朋友圈草稿。 */
type BackgroundTarget = 'chat' | 'moments';

/**
 * 以偏好为底的一份设置：首屏用它，套用同款模板链接时也拿它当底。
 *
 * 内容是**不带样式**的 —— 打开草稿只换内容，样式继续用偏好（见 restoreWorkspace 里的注释），
 * 只有同款模板链接会把样式一起带过来，那是用户显式点了「套用这个样式」。链接里没有的字段
 * （比如旧链接没有字号）用我现在的偏好补上，而不是产品默认值。
 */
function preferredSettingsBase(): PhoneSettings {
  return settingsWithStyle(defaultPhoneSettings, getWorkspacePrefs().style);
}

/** 正在使用的自定义提示音：buffer 只在内存里，id 指回音效库记录（改名 / 删除时要跟着同步）。 */
interface CustomSoundEntry {
  id?: string
  name: string
  durationSeconds: number
  buffer: AudioBuffer
}

function App() {
  const [officialAccountPrompt, setOfficialAccountPrompt] = useState<OfficialAccountPlacement | null>(null);
  const [accountPrompt, setAccountPrompt] = useState(false);
  const [paymentPrompt, setPaymentPrompt] = useState(false);
  const [accountSession, setAccountSession] = useState<AccountSession | null>(null);
  const accountSessionRef = useRef(accountSession);
  useEffect(() => { accountSessionRef.current = accountSession }, [accountSession]);
  const [visibleQuota, setVisibleQuota] = useState<ExportQuota>(() => guestQuota());
  const unlimited = Boolean(visibleQuota.membership?.active && Date.parse(visibleQuota.membership.expires_at || '') > Date.now());
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [redeemMessage, setRedeemMessage] = useState('');
  const [route, setRoute] = useState<WorkspaceRoute>(() => readWorkspaceRoute(window.location.href));
  const isWorking = route !== 'home' && route !== 'resources' && route !== 'exports';
  const activeTool: WechatTool = isWorking ? route : 'chat';
  const { request: confirmation, confirm, resolve: resolveConfirmation } = useConfirm();
  const [chatSection, setChatSection] = useState<'content' | 'people' | 'settings' | 'projects'>('content');
  const navigate = useCallback((next: WorkspaceRoute) => {
    window.history.pushState(null, '', workspaceHref(next, window.location.href));
    setRoute(next);
  }, []);
  useEffect(() => {
    const syncRoute = () => setRoute(readWorkspaceRoute(window.location.href));
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => { window.removeEventListener('popstate', syncRoute); window.removeEventListener('hashchange', syncRoute); };
  }, []);
  useEffect(() => {
    // Each independently addressable work page gets its own browser-tab title.
    const title = workspaceTools.find(tool => tool.id === route)?.title || (route === 'exports' ? '导出日志' : route === 'resources' ? '模板与指南' : '工具概览');
    document.title = `${title} · 微信创作工具箱`;
  }, [route]);
  const [importText, setImportText] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // 样式同样从偏好起步：这个浏览器里上次设置的样子，而不是产品默认值。
  const [settings, setSettings] = useState<PhoneSettings>(() => preferredSettingsBase());
  const [selfId, setSelfId] = useState<number | null>(null);
  // 素材库：上传过的头像与表情都留在这里，下次直接点选，不用再翻本地文件。
  const [library, setLibrary] = useState<MediaAsset[]>([]);
  // 只有真的读出来了才放出口；浏览器不给 IndexedDB 时这几个入口整体隐藏。
  const [libraryReady, setLibraryReady] = useState(false);
  // 用过的头像归档：按角色名长期留着，只增不删，换对话 / 重新导入 / 清空编辑器都不影响。
  const [avatarPresets, setAvatarPresets] = useState<AvatarPreset[]>([]);
  const [presetsReady, setPresetsReady] = useState(false);
  /** 「添加消息 → 图片」里选中的那张，放在这里是为了素材库和快捷条都能往里写。 */
  const [draftImage, setDraftImage] = useState<string | null>(null);
  /** 素材库弹窗这次是为谁打开的：某位角色的头像 / 某条消息的图 / 待发送的草稿 / 某一处背景。 */
  const [libraryPicker, setLibraryPicker] = useState<{ kind: MediaKind; userId?: number; msgId?: number; draft?: boolean; background?: BackgroundTarget } | null>(null);
  /**
   * 朋友圈编辑器的封面在它自己的草稿里，弹窗却在 App 这边，所以「选一张封面」用一次性的
   * Promise 接：调用方 await 到 data URL，中途关掉弹窗就拿到 null。同一时刻只可能有一个等待者。
   */
  const pendingBackgroundPick = useRef<((dataUrl: string | null) => void) | null>(null);
  const [toast, setToast] = useState('');
  // 定时发送播放与视频导出共用同一套节奏 / 提示音设置，保证预览里看到的速度就是导出的速度。
  const [playbackActive, setPlaybackActive] = useState(false);
  const [playbackPlaying, setPlaybackPlaying] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  // 播放与导出这一组也全部从偏好取初值：它们原先只活在内存里，刷新一次就回默认。
  const [playbackPace, setPlaybackPace] = useState<PlaybackPace>(() => getWorkspacePrefs().playback.pace);
  const [soundEnabled, setSoundEnabled] = useState(() => getWorkspacePrefs().playback.soundEnabled);
  // 收到与发送是两种不同的音效，各自可选：默认只响「收到」，发送音效按需打开。
  const [soundReceive, setSoundReceive] = useState(() => getWorkspacePrefs().playback.soundReceive);
  const [soundSend, setSoundSend] = useState(() => getWorkspacePrefs().playback.soundSend);
  const revealedCountRef = useRef(0);
  useEffect(() => { revealedCountRef.current = revealedCount }, [revealedCount]);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoSize, setVideoSize] = useState<VideoSizeId>(() => getWorkspacePrefs().playback.videoSize);
  // 录制方式决定后面几项设置怎么用：逐条播放调出现节奏，滚动到底调视频总时长。
  const [videoMode, setVideoMode] = useState<VideoCaptureMode>(() => getWorkspacePrefs().playback.videoMode);
  const [scrollDuration, setScrollDuration] = useState(() => getWorkspacePrefs().playback.scrollDuration);
  // 视频两侧的安全留白：给抖音这类平台的裁切与浮层让位，见 lib/video-padding.ts。
  const [videoSidePad, setVideoSidePad] = useState(() => getWorkspacePrefs().playback.videoSidePad);
  // 屏幕尺寸就是导出分辨率：图片、视频帧都按它渲染。
  const [screenSize, setScreenSize] = useState<ScreenSize>(() => getWorkspacePrefs().playback.screenSize);
  const [soundSource, setSoundSource] = useState<'synth' | 'custom'>(() => getWorkspacePrefs().playback.soundSource);
  // 视频渲染与取景框该用的「屏幕尺寸」：留白越过画面自然留边时，换成「画布去掉两侧留白」的比例，
  // 手机才会铺满上下、只左右留白（见 lib/video-padding.ts 的 videoContentScreen）。留白不越线时
  // 它原样返回 screenSize。图片导出不经过它——截图与长截图仍然用 screenSize，一个像素都不变。
  const videoScreen = videoContentScreen(screenSize, videoSizeOption(videoSize, screenSize), videoSidePad);
  /** 上次选的音效是否已经尝试恢复过：恢复是异步的（要先把音效库读出来），见下面那个 effect。 */
  const soundRestored = useRef(false);
  // 自定义提示音按收/发各存一条：收到替换「叮咚」，发送替换「咻」，互不影响。
  // buffer 不可序列化，只留内存；音效库里存的是可持久化的 data URL（见 SoundAsset）。
  const [customSounds, setCustomSounds] = useState<{ received: CustomSoundEntry | null; sent: CustomSoundEntry | null }>({ received: null, sent: null });
  const [soundError, setSoundError] = useState('');
  // 音效库：上传过的自定义提示音长期留着，换对话、重新导入都不影响。
  const [soundLibrary, setSoundLibrary] = useState<SoundAsset[]>([]);
  const [soundLibraryReady, setSoundLibraryReady] = useState(false);
  const [soundLibraryOpen, setSoundLibraryOpen] = useState(false);
  // 这次从音效库挑音效是给谁用的：收到那一声还是发送那一声。
  const [soundPickTarget, setSoundPickTarget] = useState<NotifyKind>('received');
  const [videoProgress, setVideoProgress] = useState<{ stage: 'render' | 'record'; current: number; total: number; elapsedMs: number; totalMs: number; renderHint?: string } | null>(null);
  const videoToken = useRef({ cancelled: false });
  const [projects, setProjects] = useState<ChatProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState('');
  const [activeProjectCreatedAt, setActiveProjectCreatedAt] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const phoneRef = useRef<HTMLDivElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dialogTracked = useRef(false);
  const inviteLandingTracked = useRef(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const restoredProjectTracked = useRef(false);
  const skipNextSave = useRef(false);

  useEffect(() => {
    void trackProductEvent('page_view');
    if (!inviteLandingTracked.current && /^[\w-]{16}$/.test(new URLSearchParams(window.location.search).get('invite') || '')) {
      inviteLandingTracked.current = true; trackGrowthEvent('invite_landing_viewed');
    }
    void restoreAccount().then(session => {
      if (session) {
        setAccountSession(session);
        setVisibleQuota(session.quota);
      }
    }).catch(() => {
      // The editor remains usable when the account service is temporarily unavailable.
    });
  }, []);

  useEffect(() => {
    if (!isWorking) return;
    try {
      localStorage.setItem('wechat-dialog-generator:active-tool', activeTool);
    } catch {
      // Tool switching still works for the current page session.
    }
    void trackProductEvent('tool_selected', { tool: activeTool });
  }, [activeTool, isWorking]);

  // 素材库、头像归档和音效库都独立于项目：换项目、重新导入、清空编辑器都不该影响它们，所以各自单独读一次。
  // 各读各的，一边失败不拖累另一边（读不出来就只藏掉对应的入口，编辑和导出照常可用）。
  useEffect(() => {
    if (!('indexedDB' in window)) return;
    let cancelled = false;
    void loadMediaAssets().then(assets => {
      if (cancelled) return;
      setLibrary(assets);
      setLibraryReady(true);
    }).catch(() => {});
    void loadAvatarPresets().then(presets => {
      if (cancelled) return;
      setAvatarPresets(presets);
      setPresetsReady(true);
    }).catch(() => {});
    void loadSoundAssets().then(assets => {
      if (cancelled) return;
      setSoundLibrary(assets);
      setSoundLibraryReady(true);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /**
   * 恢复上次选的音效：偏好里只存得下音效库的 id，得等库读出来才知道那一条还在不在，
   * 所以放在库就绪之后。id 对应不上（音效被删了）就什么都不做 —— 播放侧本来就会退回内置合成音。
   */
  useEffect(() => {
    if (!soundLibraryReady || soundRestored.current) return;
    soundRestored.current = true;
    // 这里只解码不播放，音频上下文处于 suspended 也没关系：decodeAudioData 与上下文状态无关。
    const context = notifyAudioContext();
    if (!context) return;
    const ids = getWorkspacePrefs().playback.soundIds;
    void (async () => {
      const restored: { kind: NotifyKind; entry: CustomSoundEntry }[] = [];
      for (const kind of ['received', 'sent'] as NotifyKind[]) {
        const asset = ids[kind] ? findSoundAssetById(soundLibrary, ids[kind]!) : null;
        if (!asset) continue;
        try {
          const blob = await (await fetch(asset.dataUrl)).blob();
          const buffer = await loadNotifySoundFile(context, blob);
          restored.push({ kind, entry: { id: asset.id, name: asset.name, durationSeconds: buffer.duration, buffer } });
        } catch {
          // 这一条读不出来就跳过，另一条照常恢复。
        }
      }
      if (!restored.length) return;
      setCustomSounds(previous => {
        const next = { ...previous };
        for (const { kind, entry } of restored) next[kind] = entry;
        return next;
      });
    })();
  }, [soundLibrary, soundLibraryReady]);

  /**
   * 偏好：把「这次用的设置」沉淀成「下次的起点」。导入新聊天内容、新建空白对话、刷新页面
   * 都从这里取值，不再恢复成产品默认值。聊天标题不在其中 —— 它跟着内容走。
   */
  useEffect(() => {
    const playback: PlaybackPrefs = {
      pace: playbackPace,
      soundEnabled,
      soundReceive,
      soundSend,
      soundSource,
      // 音效是异步恢复的：还没恢复完就写，会把上次选的那两条 id 抹掉。
      soundIds: soundRestored.current
        ? { received: customSounds.received?.id ?? null, sent: customSounds.sent?.id ?? null }
        : getWorkspacePrefs().playback.soundIds,
      screenSize,
      videoSize,
      videoMode,
      scrollDuration,
      videoSidePad,
      // 批量页的「导出内容」（聊天图 / 聊天视频）由批量页自己写：它不在这个组件的状态里，
      // 这里把当前值原样带回去，免得一次无关的设置变化把它冲掉。
      batchOutput: getWorkspacePrefs().playback.batchOutput,
    };
    // 只写样式与播放导出这一半：预览的窗口宽度是 display 那一半，由尺寸弹层自己写，别在这里覆盖掉。
    patchWorkspacePrefs({ style: stylePrefsFromSettings(settings), playback });
  }, [customSounds, playbackPace, screenSize, scrollDuration, settings, soundEnabled, soundReceive, soundSend, soundSource, videoMode, videoSize, videoSidePad]);

  /**
   * 记档：只要某位角色身上挂着头像，就把「角色名 + 头像」写进归档。
   * 这里只增不删——取消头像、换一张新的、角色离开对话都不会清掉记录，
   * 删除只发生在用户点「用过的头像」里那个删除按钮的时候。
   * 聊天页的 effect 与批量页（在批量页里给某组换头像）都调它，规则只有一份。
   */
  const rememberUsersForPresets = useCallback((list: ChatUser[]) => {
    if (!presetsReady || !list.length) return;
    const result = rememberUserAvatars(avatarPresets, list);
    if (!result.changed.length) return;
    setAvatarPresets(result.list);
    void putAvatarPresets(result.changed).catch(() => {});
  }, [avatarPresets, presetsReady]);

  useEffect(() => { rememberUsersForPresets(users); }, [rememberUsersForPresets, users]);

  useEffect(() => {
    let cancelled = false;

    async function restoreWorkspace() {
      if (!('indexedDB' in window)) {
        setStorageAvailable(false);
        setStorageReady(true);
        return;
      }
      try {
        const storedProjects = await listProjects();
        if (cancelled) return;
        setProjects(storedProjects);

        let sharedSnapshot: ChatProjectSnapshot | null = null;
        try {
          sharedSnapshot = await readSameTemplateHash(window.location.hash);
        } catch {
          if (!cancelled) setToast('分享模板已失效或内容格式不正确');
        }
        if (sharedSnapshot) {
          setRoute('chat');
          setImportText(sharedSnapshot.importText);
          setUsers(sharedSnapshot.users);
          setMessages(sharedSnapshot.messages);
          setSettings({ ...preferredSettingsBase(), ...sharedSnapshot.settings });
          setSelfId(sharedSnapshot.selfId);
          setActiveProjectId(null);
          setActiveProjectName(`${projectName(sharedSnapshot)} 同款`);
          setActiveProjectCreatedAt(null);
          setSaveState('idle');
          dialogTracked.current = sharedSnapshot.messages.length > 0;
          window.history.replaceState(null, '', workspaceHref('chat', window.location.href));
          void trackProductEvent('shared_template_opened');
          return;
        }

        let storedId: string | null = null;
        try {
          storedId = localStorage.getItem(activeProjectStorageKey);
        } catch {
          storedId = null;
        }
        const active = storedProjects.find(project => project.id === storedId);
        if (active) {
          skipNextSave.current = true;
          setImportText(active.importText);
          setUsers(active.users);
          setMessages(active.messages);
          // 草稿只带内容：样式（配色、字号、图片大小、气泡……）一律用我现在的偏好，
          // 只有聊天标题按草稿里存的恢复。否则打开一份旧草稿就会把我设好的样式冲回默认值。
          setSettings(current => ({ ...current, contactName: active.settings?.contactName || '' }));
          setSelfId(active.selfId);
          setActiveProjectId(active.id);
          setActiveProjectName(active.name);
          setActiveProjectCreatedAt(active.createdAt);
          setSaveState('saved');
          dialogTracked.current = active.messages.length > 0;
          if (!restoredProjectTracked.current) {
            restoredProjectTracked.current = true;
            void trackProductEvent('project_reopened', {
              message_count_bucket: messageCountBucket(active.messages.length),
            });
          }
        }
      } catch {
        if (!cancelled) {
          setStorageAvailable(false);
          setSaveState('error');
        }
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    }

    void restoreWorkspace();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!storageReady || !storageAvailable) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }

    const snapshot: ChatProjectSnapshot = { importText, users, messages, settings, selfId };
    if (!projectHasContent(snapshot)) return;

    setSaveState('saving');
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      const isNewProject = activeProjectId === null;
      const id = activeProjectId ?? crypto.randomUUID();
      const name = activeProjectName.trim() || projectName(snapshot);
      const project: ChatProject = {
        ...snapshot,
        id,
        name,
        createdAt: activeProjectCreatedAt ?? now,
        updatedAt: now,
        version: 1,
      };

      void saveProject(project).then(() => {
        if (isNewProject) skipNextSave.current = true;
        setActiveProjectId(id);
        setActiveProjectName(name);
        setActiveProjectCreatedAt(project.createdAt);
        setProjects(current => [project, ...current.filter(item => item.id !== id)]);
        setSaveState('saved');
        try {
          localStorage.setItem(activeProjectStorageKey, id);
        } catch {
          // IndexedDB remains the source of truth when localStorage is unavailable.
        }
        if (isNewProject) {
          void trackProductEvent('project_created', {
            creation_source: messages.length > 0 ? 'editor' : 'import_draft',
          });
        }
      }).catch(() => {
        setStorageAvailable(false);
        setSaveState('error');
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    activeProjectCreatedAt,
    activeProjectId,
    activeProjectName,
    importText,
    messages,
    selfId,
    settings,
    storageAvailable,
    storageReady,
    users,
  ]);

  useEffect(() => {
    if (dialogTracked.current || messages.length === 0) return;
    dialogTracked.current = true;
    void trackProductEvent('dialog_created', {
      message_count_bucket: messageCountBucket(messages.length),
      participant_count_bucket: participantCountBucket(users.length),
    });
  }, [messages.length, users.length]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  }, []);

  useEffect(() => {
    const warn = () => showToast('导出日志保存失败，不影响本次导出；请检查浏览器存储权限或剩余空间。');
    window.addEventListener(exportLogError, warn);
    return () => window.removeEventListener(exportLogError, warn);
  }, [showToast]);

  const openOfficialAccountPrompt = useCallback((placement: OfficialAccountPlacement) => {
    if (placement === 'export') {
      try {
        if (localStorage.getItem('wechat-dialog-generator:official-account-export-prompted')) return;
        localStorage.setItem('wechat-dialog-generator:official-account-export-prompted', '1');
      } catch {
        // The prompt still works when browser storage is unavailable.
      }
    }
    setRedeemMessage('');
    setOfficialAccountPrompt(placement);
    void trackProductEvent('official_account_prompt_viewed', { placement });
  }, []);

  const closeOfficialAccountPrompt = useCallback(() => setOfficialAccountPrompt(null), []);

  const copyOfficialAccountId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(officialAccountId);
      void trackProductEvent('official_account_id_copied', {
        placement: officialAccountPrompt ?? 'header',
      });
      showToast('公众号 ID 已复制，请到微信搜索关注');
    } catch {
      showToast(`请在微信搜索：${officialAccountId}`);
    }
  }, [officialAccountPrompt, showToast]);

  const promptAfterExport = useCallback(() => {
    window.setTimeout(() => openOfficialAccountPrompt('export'), 700);
  }, [openOfficialAccountPrompt]);

  const handleLogin = useCallback(async (email: string, password: string) => {
    setAccountBusy(true);
    setAccountError('');
    try {
      const session = await loginAccount(email, password);
      setAccountSession(session);
      setVisibleQuota(session.quota);
      setAccountPrompt(false);
      showToast('登录成功');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : '登录失败，请稍后重试');
    } finally {
      setAccountBusy(false);
    }
  }, [showToast]);

  const handleRegister = useCallback(async (email: string, password: string, displayName: string, challengeId: string, code: string) => {
    setAccountBusy(true);
    setAccountError('');
    try {
      const session = await registerAccount(email, password, displayName, challengeId, code);
      setAccountSession(session);
      setVisibleQuota(session.quota);
      setAccountPrompt(false);
      showToast('邮箱已验证，20 次奖励已到账');
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : '注册失败，请稍后重试');
    } finally {
      setAccountBusy(false);
    }
  }, [showToast]);

  const handleLogout = useCallback(async () => {
    setAccountBusy(true);
    try {
      await logoutAccount();
      setAccountSession(null);
      setVisibleQuota(guestQuota());
      setAccountPrompt(false);
      showToast('已退出登录');
    } finally {
      setAccountBusy(false);
    }
  }, [showToast]);

  const [shareOpen, setShareOpen] = useState(false);
  const closeAccount = useCallback(() => setAccountPrompt(false), []);
  const closeShare = useCallback(() => setShareOpen(false), []);
  useEffect(() => {
    const code = pendingInvite();
    if (code && accountSession?.user.email_verified_at) void visitInvite(code).catch(() => {});
  }, [accountSession?.user.email_verified_at]);
  const handleVerify = useCallback(async (email: string, challengeId: string, code: string) => {
    setAccountBusy(true); setAccountError('');
    try { const result = await verifyAccountEmail(email, challengeId, code); setAccountSession(result); setVisibleQuota(result.quota); showToast(`验证成功，${result.granted} 次奖励已到账`); }
    catch (error) { setAccountError(error instanceof Error ? error.message : '验证失败'); }
    finally { setAccountBusy(false); }
  }, [showToast]);
  const exportIdentities = useRef(new Map<string, ExportIdentity>());
  const completeExport = useCallback((ticket: string | boolean | undefined) => {
    if (typeof ticket === 'string') {
      const identity = exportIdentities.current.get(ticket);
      if (!identity || !isExportIdentityCurrent(identity)) return;
      void completeAccountExport(ticket, identity).catch(() => showToast('图片已生成，但奖励确认失败；请稍后再次导出以重试邀请结算'));
    }
  }, [showToast]);

  const applyExportQuota = useCallback((identity: ExportIdentity, quota: ExportQuota) => {
    if (!isExportIdentityCurrent(identity) || (accountSessionRef.current?.user.id ?? null) !== identity.userId) return;
    setVisibleQuota(quota);
    setAccountSession(current => current?.user.id === identity.userId ? { ...current, quota } : current);
  }, []);
  const exportIdentity = captureExportIdentity(accountSession);

  const authorizeExport = useCallback(async () => {
    try {
      const identity = exportIdentity;
      assertExportIdentity(identity);
      const reservation = identity.userId ? await consumeAccountExport(crypto.randomUUID(), identity) : null;
      const quota = reservation ? reservation.quota : consumeGuestExport();
      if (reservation) exportIdentities.current.set(reservation.action_id, identity);
      applyExportQuota(identity, quota);
      return reservation?.action_id || true;
    } catch (error) {
      const message = error instanceof Error ? error.message : '暂时无法确认导出额度';
      showToast(message);
      if (error instanceof AccountApiError && error.code === 'quota_exhausted') {
        if (accountSession) openOfficialAccountPrompt('export');
        else {
          setAccountError('今日免费额度已用完，登录后可继续使用并领取关注奖励。');
          setAccountPrompt(true);
        }
      }
      return false;
    }
  }, [accountSession, exportIdentity, applyExportQuota, openOfficialAccountPrompt, showToast]);

  const batchOwners = useRef(new Map<string, string>());
  const batchGuestDebits = useRef(new Set<string>());
  const debitBatchExport = useCallback(async (id: string) => {
    const identity = exportIdentity;
    assertExportIdentity(identity);
    const owner = identity.userId || 'guest';
    const previousOwner = batchOwners.current.get(id);
    if (previousOwner && previousOwner !== owner) throw new Error('账号已切换，请回到原账号重试这张卡片，避免重复扣费。');
    batchOwners.current.set(id, owner);
    if (!identity.userId && batchGuestDebits.current.has(id)) return;
    const result = identity.userId ? await consumeAccountExport(id, identity) : null;
    const quota = result ? result.quota : consumeGuestExport();
    if (!identity.userId) batchGuestDebits.current.add(id);
    else exportIdentities.current.set(id, identity);
    applyExportQuota(identity, quota);
  }, [exportIdentity, applyExportQuota]);

  const handleRedeem = useCallback(async (code: string) => {
    setAccountBusy(true);
    setRedeemMessage('');
    try {
      const result = await redeemFollowBonus(code);
      setVisibleQuota(result.quota);
      setAccountSession(current => current ? { ...current, quota: result.quota } : current);
      setRedeemMessage(`领取成功，已增加 ${result.granted} 次导出额度。`);
      showToast(`已领取 ${result.granted} 次额外导出额度`);
    } catch (error) {
      setRedeemMessage(error instanceof Error ? error.message : '兑换失败，请稍后重试');
    } finally {
      setAccountBusy(false);
    }
  }, [showToast]);

  const persistCurrentProject = useCallback(async () => {
    if (!storageAvailable) return;
    const snapshot: ChatProjectSnapshot = { importText, users, messages, settings, selfId };
    if (!projectHasContent(snapshot)) return;
    const now = new Date().toISOString();
    const id = activeProjectId ?? crypto.randomUUID();
    const project: ChatProject = {
      ...snapshot,
      id,
      name: activeProjectName.trim() || projectName(snapshot),
      createdAt: activeProjectCreatedAt ?? now,
      updatedAt: now,
      version: 1,
    };
    await saveProject(project);
    setProjects(current => [project, ...current.filter(item => item.id !== id)]);
    if (!activeProjectId) {
      void trackProductEvent('project_created', {
        creation_source: messages.length > 0 ? 'editor' : 'import_draft',
      });
    }
  }, [
    activeProjectCreatedAt,
    activeProjectId,
    activeProjectName,
    importText,
    messages,
    selfId,
    settings,
    storageAvailable,
    users,
  ]);

  const resetEditor = useCallback(() => {
    skipNextSave.current = true;
    setImportText('');
    setUsers([]);
    setMessages([]);
    // 样式、音效、屏幕尺寸这些是「我的偏好」，不跟着内容走：新建空白对话时继续沿用，
    // 只把跟着内容的那一项（聊天标题）清掉，不再恢复成产品默认值。
    setSettings(current => ({ ...current, contactName: '' }));
    setSelfId(null);
    // 待添加的那张图属于刚才那份内容，换项目/新建时一起清掉。
    setDraftImage(null);
    setActiveProjectId(null);
    setActiveProjectName('');
    setActiveProjectCreatedAt(null);
    setSaveState('idle');
    dialogTracked.current = false;
    try {
      localStorage.removeItem(activeProjectStorageKey);
    } catch {
      // The editor can still start a new in-memory project.
    }
  }, []);

  const handleCreateProject = useCallback(async () => {
    try {
      await persistCurrentProject();
      resetEditor();
      showToast('已新建空白对话，上一份内容已自动保存');
    } catch {
      showToast('保存当前项目失败，请稍后重试');
    }
  }, [persistCurrentProject, resetEditor, showToast]);

  const handleOpenProject = useCallback(async (project: ChatProject) => {
    if (project.id === activeProjectId) return;
    try {
      await persistCurrentProject();
    } catch {
      showToast('当前项目保存失败，暂未切换');
      return;
    }
    skipNextSave.current = true;
    setImportText(project.importText);
    setUsers(project.users);
    setMessages(project.messages);
    // 同打开草稿：只把内容换过来，样式仍是我现在的偏好（下方注释同 restoreWorkspace）。
    setSettings(current => ({ ...current, contactName: project.settings?.contactName || '' }));
    setSelfId(project.selfId);
    setDraftImage(null);
    setActiveProjectId(project.id);
    setActiveProjectName(project.name);
    setActiveProjectCreatedAt(project.createdAt);
    setSaveState('saved');
    dialogTracked.current = project.messages.length > 0;
    try {
      localStorage.setItem(activeProjectStorageKey, project.id);
    } catch {
      // Project switching still works for the current page session.
    }
    void trackProductEvent('project_reopened', {
      message_count_bucket: messageCountBucket(project.messages.length),
    });
    showToast(`已打开“${project.name}”`);
  }, [activeProjectId, persistCurrentProject, showToast]);

  const handleDuplicateProject = useCallback(async (source: ChatProject) => {
    try {
      const duplicate = copyProject(source);
      await saveProject(duplicate);
      setProjects(current => [duplicate, ...current]);
      void trackProductEvent('project_duplicated');
      showToast(`已复制“${source.name}”`);
    } catch {
      showToast('复制项目失败');
    }
  }, [showToast]);

  const handleDeleteProject = useCallback(async (project: ChatProject) => {
    if (!await confirm({ title: '删除本地草稿？', description: `确定删除“${project.name}”吗？此操作无法撤销。`, confirmText: '删除草稿' })) return;
    try {
      await deleteProject(project.id);
      setProjects(current => current.filter(item => item.id !== project.id));
      if (project.id === activeProjectId) resetEditor();
      showToast('项目已从本机删除');
    } catch {
      showToast('删除项目失败');
    }
  }, [activeProjectId, confirm, resetEditor, showToast]);

  const handleUseTemplate = useCallback((content: string, templateId: string) => {
    setImportText(content);
    navigate('chat');
    setChatSection('content');
    void trackProductEvent('template_used', { tool: 'chat', template_id: templateId });
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('模板已载入，点击“解析并导入”即可预览');
  }, [showToast, navigate]);

  const handleShareSame = useCallback(async () => {
    if (!messages.length) {
      showToast('请先创建对话内容');
      return;
    }
    if (!await confirm({ title: '生成同款分享链接？', description: '链接会包含当前对话文字和样式，不包含已上传的头像与图片。请确认内容适合公开分享。', confirmText: '生成链接' })) return;
    try {
      const snapshot: ChatProjectSnapshot = { importText, users, messages, settings, selfId };
      const url = await createSameTemplateUrl(snapshot, window.location.href);
      void trackProductEvent('shared_template_created');
      if (navigator.share) {
        await navigator.share({
          title: `${activeProjectName.trim() || settings.contactName || '微信对话'}同款模板`,
          text: '打开链接即可复用这份对话排版，头像和图片需要自行重新上传。',
          url,
        });
        showToast('同款模板分享面板已打开');
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast('同款模板链接已复制');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      showToast(error instanceof Error ? error.message : '生成同款链接失败');
    }
  }, [activeProjectName, confirm, importText, messages, selfId, settings, showToast, users]);

  const handleImport = useCallback(() => {
    if (!importText.trim()) {
      showToast('请先输入聊天记录文本');
      return;
    }
    const result = parseChatRecord(importText);
    if (result.messages.length === 0) {
      showToast('未解析到任何消息');
      return;
    }
    // 重新解析会把用户 id 从 1 重排，所以按名字续上之前上传的头像和自己身份，
    // 别让用户每换一段聊天记录就重传一次头像。
    const carriedOver = carryOverAvatars(result.users, users, selfId);
    // 上一轮对话里没有的角色（换过草稿、换过聊天记录）再从归档里找一遍，
    // 归档比当前编辑状态活得久，这才是「我用过的头像都还在」的那一层。
    const restored = applyPresetsToUsers(carriedOver, avatarPresets);
    const nextUsers = restored.users;
    const carried = nextUsers.filter((user, index) => !result.users[index].avatar && user.avatar).length;
    setUsers(nextUsers);
    setMessages(result.messages);
    setSelfId(carryOverSelfId(nextUsers, users, selfId));
    // 导入过的角色名收进「最近用过的昵称」：换聊天标题、发朋友圈、做场景页时能直接点选。
    // 「我」是解析器给自己起的别名，不算用户用过的昵称，不塞进历史。
    rememberNameHistory(result.users.map(user => user.name).filter(name => !isSelfAlias(name)));
    if (result.users.length >= 3) {
      const otherNames = result.users.slice(1).map(u => u.name);
      const nameStr = result.users.length <= 4
        ? otherNames.join('、')
        : otherNames.slice(0, 2).join('、') + '等';
      setSettings(s => ({ ...s, contactName: nameStr + '(' + result.users.length + ')' }));
    } else if (result.users.length === 2) {
      setSettings(s => ({ ...s, contactName: result.users[1].name }));
    } else if (result.users.length === 1) {
      setSettings(s => ({ ...s, contactName: result.users[0].name }));
    }
    const kept = carried > 0 ? `，已沿用 ${carried} 个头像` : '';
    const fromArchive = restored.applied > 0 ? `，其中 ${restored.applied} 个来自用过的头像` : '';
    showToast(`成功导入 ${result.messages.length} 条消息（${result.users.length} 个用户）${kept}${fromArchive}`);
  }, [avatarPresets, importText, selfId, showToast, users]);

  const handleUpdateAvatar = useCallback((userId: number, avatar: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, avatar } : u));
  }, []);

  const handleRemoveAvatar = useCallback((userId: number) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, avatar: null } : u));
  }, []);

  // ===================== 用过的头像（归档） =====================
  // 归档里的一条是「某个名字用过的某张头像」。它能做的只有两件事：还给同名的那位角色，
  // 或者被手动删掉。取消头像、换新头像都不会动它，所以用户的头像不会莫名其妙消失。

  /** 记一次使用：让归档里的这一条排到最前并落盘。聊天页与批量页换头像都走这里。 */
  const touchPreset = useCallback((preset: AvatarPreset) => {
    const tapped = touchAvatarPreset(avatarPresets, preset.id);
    if (tapped === avatarPresets) return;
    setAvatarPresets(tapped);
    const touched = tapped.find(item => item.id === preset.id);
    if (touched) void putAvatarPresets([touched]).catch(() => {});
  }, [avatarPresets]);

  /** 把归档里的头像还给同名的角色；这个角色不在当前对话里就只记一次使用，不做别的。 */
  const handleUsePreset = useCallback((preset: AvatarPreset) => {
    const owner = users.find(user => avatarNameKey(user.name) === avatarNameKey(preset.name));
    if (!owner) {
      showToast(`当前对话里没有「${preset.name}」这个角色，这张头像先留在用过的头像里。`);
      return;
    }
    touchPreset(preset);
    setUsers(prev => prev.map(user => user.id === owner.id ? { ...user, avatar: preset.avatar } : user));
    showToast(`已为「${owner.name}」换上这张头像。`);
  }, [showToast, touchPreset, users]);

  const handleRemovePreset = useCallback((preset: AvatarPreset) => {
    setAvatarPresets(prev => removeAvatarPreset(prev, preset.id));
    void deleteAvatarPresetRecord(preset.id).catch(() => {});
    showToast(`已从用过的头像里删除「${preset.name}」，对话里已经用上的头像不受影响。`);
  }, [showToast]);

  /**
   * 给归档里的一条改名。名字就是这套归档的键，所以改名等于把它重新归到新名字下：
   * 主键跟着一起换，旧的那一行必须删掉，否则库里会留下一条同名同头像的孤儿。
   */
  const handleRenamePreset = useCallback((preset: AvatarPreset, name: string) => {
    const result = renameAvatarPreset(avatarPresets, preset.id, name);
    if (result.error) {
      showToast(result.error);
      return false;
    }
    // 只差空白或大小写：当没改，不写库也不提示。
    if (!result.preset) return true;
    setAvatarPresets(result.list);
    if (result.previousId) void deleteAvatarPresetRecord(result.previousId).catch(() => {});
    void putAvatarPresets([result.preset]).catch(() => {});
    // 旧名字还在当前对话里的话，同步那一遍会照旧给它记一条——这不是 bug，先说清楚。
    const stillInChat = users.some(user => avatarNameKey(user.name) === avatarNameKey(preset.name));
    showToast(`已把「${preset.name}」改名为「${result.preset.name}」。${stillInChat ? `当前对话里还有一位叫「${preset.name}」的角色，它用着的头像会照旧另记一条。` : ''}`);
    return true;
  }, [avatarPresets, showToast, users]);

  const handleUpdateMessage = useCallback((msgId: number, content: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content } : m));
  }, []);

  const handleAddMessage = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => {
      const maxId = prev.reduce((max, m) => Math.max(max, m.id), 0);
      return [...prev, { ...msg, id: maxId + 1 }];
    });
    // 同时把这一条按记录格式写回导入框。文本是唯一能改到消息的地方
    // （预览里只支持换图），只存进 messages 的话，这条新消息就再也没法改了。
    const senderName = users.find(user => user.id === msg.senderId)?.name ?? users[0]?.name;
    if (!senderName) return;
    setImportText(prev => appendMessageToRecord(prev, msg, senderName));
  }, [users]);

  // ===================== 素材库 =====================
  // 上传过的头像和图片都要留在素材库里，所以读文件这件事统一走这里：
  // 上传、批量上传、给某条消息换图，最终都是「读成 data URL → 进库 → 返回可用的素材」。
  const importMedia = useCallback(async (files: File[], kind: MediaKind): Promise<MediaImportOutcome> => {
    const picked: MediaAsset[] = [];
    let failed = 0;
    for (const file of files) {
      try {
        const image = await readImageFile(file);
        picked.push(createMediaAsset({ kind, name: image.name, dataUrl: image.dataUrl, width: image.width, height: image.height }));
      } catch {
        failed += 1;
      }
    }
    const { library: next, added, duplicated, rejected } = addMediaAssets(library, picked);
    // 库里已经有同一张图时复用旧记录，不然选中的素材会是一条库里不存在的“影子”。
    const usable = picked.map(item => added.find(asset => asset.dataUrl === item.dataUrl) ?? findAssetByDataUrl(next, item.dataUrl) ?? item);
    if (next !== library) {
      setLibrary(next);
      // 存储不可用（或读库失败）时只在内存里攒着：上传照样能用，只是留不到下次，
      // 所以这里不去提示「保存失败」，免得每次传图都弹一条没用的警告。
      if (libraryReady) void putMediaAssets(added).catch(() => showToast('素材库保存失败（可能是浏览器存储空间不足），本次图片仍可正常使用。'));
    }
    if (added.length) void trackProductEvent('media_assets_imported', { kind, count: String(added.length) });
    return { picked: usable, added: added.length, duplicated, failed, rejected };
  }, [library, libraryReady, showToast]);

  /** 记一次使用：只为了让它在快捷条里排前面，不影响库里的任何一条素材。 */
  const markAssetUsed = useCallback((id: string) => {
    const next = touchMediaAsset(library, id);
    if (next === library) return;
    setLibrary(next);
    const touched = next.find(asset => asset.id === id);
    if (touched) void putMediaAssets([touched]).catch(() => {});
  }, [library]);

  const applyAvatar = useCallback((userId: number, asset: MediaAsset) => {
    setUsers(prev => prev.map(user => user.id === userId ? { ...user, avatar: asset.dataUrl } : user));
    markAssetUsed(asset.id);
  }, [markAssetUsed]);

  /** 读一张图并入库，返回可直接渲染的 data URL；读不出来返回 null 并提示。 */
  const uploadImageFile = useCallback(async (file: File) => {
    const outcome = await importMedia([file], 'sticker');
    const asset = outcome.picked[0];
    if (!asset) {
      showToast('这张图片读取失败，请换一张。');
      return null;
    }
    return asset.dataUrl;
  }, [importMedia, showToast]);

  /**
   * 读一张背景图并入库，返回可直接用的 data URL。聊天背景和朋友圈封面共用这一个入口，
   * 所以「上传过一次，下次还能从素材库点选」对两处都成立。
   */
  const uploadBackgroundFile = useCallback(async (file: File) => {
    const outcome = await importMedia([file], 'background');
    const asset = outcome.picked[0];
    if (!asset) {
      showToast('这张背景图读取失败，请换一张。');
      return null;
    }
    // 入库失败只可能是这一类到上限了，如实说一声；正常入库不打扰。
    if (outcome.rejected) showToast('素材库的背景图已到上限，这张没能存进去（可先删几张再传），本次仍可直接使用。');
    return asset.dataUrl;
  }, [importMedia, showToast]);

  const handleUploadAvatar = useCallback(async (userId: number, file: File) => {
    const outcome = await importMedia([file], 'avatar');
    const asset = outcome.picked[0];
    if (!asset) {
      showToast('这张图片读取失败，请换一张。');
      return;
    }
    applyAvatar(userId, asset);
  }, [applyAvatar, importMedia, showToast]);

  /** 批量上传头像：按选择顺序发给角色，多出来的只留在素材库里。 */
  const handleBatchAvatars = useCallback(async (files: File[]) => {
    const outcome = await importMedia(files, 'avatar');
    if (!outcome.picked.length) {
      showToast('这些文件都读不出来，请确认选的是图片。');
      return;
    }
    const { users: nextUsers, assigned } = assignAvatars(users, outcome.picked);
    if (assigned) setUsers(nextUsers);
    const parts = [`已上传 ${outcome.picked.length} 张`];
    if (assigned) parts.push(`按顺序换上 ${assigned} 位角色的头像`);
    if (outcome.picked.length > assigned) parts.push(`多出的 ${outcome.picked.length - assigned} 张已存进素材库`);
    if (outcome.duplicated) parts.push(`其中 ${outcome.duplicated} 张库里已有`);
    if (outcome.rejected) parts.push(`${outcome.rejected} 张超出每类上限未入库`);
    if (outcome.failed) parts.push(`${outcome.failed} 张读取失败`);
    showToast(`${parts.join('，')}。`);
  }, [importMedia, showToast, users]);

  /** 关掉素材库弹窗。还等着选背景的调用方必须收到 null，否则那个 await 会一直挂着。 */
  const closeLibraryPicker = useCallback(() => {
    const resolve = pendingBackgroundPick.current;
    pendingBackgroundPick.current = null;
    setLibraryPicker(null);
    resolve?.(null);
  }, []);

  const openBackgroundLibrary = useCallback((target: BackgroundTarget) => {
    setLibraryPicker({ kind: 'background', background: target });
  }, []);

  /**
   * 给朋友圈编辑器用的「选一张封面」：打开素材库，选中的图通过 Promise 回传。
   * 连点两次时先把上一个等待者兑现成 null，避免前一个 await 永远不结束。
   */
  const pickMomentCover = useCallback(() => new Promise<string | null>(resolve => {
    pendingBackgroundPick.current?.(null);
    pendingBackgroundPick.current = resolve;
    setLibraryPicker({ kind: 'background', background: 'moments' });
  }), []);

  /** 把一张素材用成背景。聊天背景直接写进手机样式，朋友圈封面交给等着的那位调用方。 */
  const applyBackground = useCallback((target: BackgroundTarget, asset: MediaAsset) => {
    markAssetUsed(asset.id);
    if (target === 'chat') {
      setSettings(current => ({ ...current, backgroundImage: asset.dataUrl }));
      closeLibraryPicker();
      showToast(`聊天背景已换成「${asset.name}」`);
      return;
    }
    const resolve = pendingBackgroundPick.current;
    pendingBackgroundPick.current = null;
    closeLibraryPicker();
    resolve?.(asset.dataUrl);
    showToast(`朋友圈背景已换成「${asset.name}」`);
  }, [closeLibraryPicker, markAssetUsed, showToast]);

  /**
   * 素材库弹窗里的批量上传。只传了一张、又明确知道是给谁用的时候直接换上，
   * 省掉「传完再点一次使用」这一步；一次传多张就只入库，让用户自己挑。
   */
  const handleLibraryUpload = useCallback(async (files: File[], kind: MediaKind) => {
    const outcome = await importMedia(files, kind);
    const target = libraryPicker;
    if (outcome.picked.length === 1 && target) {
      const asset = outcome.picked[0];
      if (target.userId !== undefined && kind === 'avatar') {
        applyAvatar(target.userId, asset);
        closeLibraryPicker();
      } else if (target.msgId !== undefined && isImageMessageKind(kind)) {
        handleUpdateMessage(target.msgId, asset.dataUrl);
        markAssetUsed(asset.id);
        closeLibraryPicker();
      } else if (target.draft && isImageMessageKind(kind)) {
        setDraftImage(asset.dataUrl);
        markAssetUsed(asset.id);
        closeLibraryPicker();
      } else if (target.background && kind === 'background') {
        applyBackground(target.background, asset);
      }
    }
    return outcome;
  }, [applyAvatar, applyBackground, closeLibraryPicker, handleUpdateMessage, importMedia, libraryPicker, markAssetUsed]);

  const handlePickFromLibrary = useCallback((asset: MediaAsset) => {
    const target = libraryPicker;
    if (target?.userId !== undefined && asset.kind === 'avatar') {
      applyAvatar(target.userId, asset);
      closeLibraryPicker();
      showToast(`已换上「${asset.name}」`);
      return;
    }
    if (target?.msgId !== undefined && isImageMessageKind(asset.kind)) {
      handleUpdateMessage(target.msgId, asset.dataUrl);
      markAssetUsed(asset.id);
      closeLibraryPicker();
      showToast('这条消息的图片已更换');
      return;
    }
    if (target?.draft && isImageMessageKind(asset.kind)) {
      setDraftImage(asset.dataUrl);
      markAssetUsed(asset.id);
      closeLibraryPicker();
      showToast('已放入待添加的图片');
      return;
    }
    if (target?.background && asset.kind === 'background') {
      applyBackground(target.background, asset);
      return;
    }
    // 从「素材库」入口进来、没有具体目标时，只是记一次使用。
    markAssetUsed(asset.id);
  }, [applyAvatar, applyBackground, closeLibraryPicker, handleUpdateMessage, libraryPicker, markAssetUsed, showToast]);

  const handleRemoveAsset = useCallback((asset: MediaAsset) => {
    setLibrary(prev => removeMediaAsset(prev, asset.id));
    void deleteMediaAssetRecord(asset.id).catch(() => {});
    // 已经用上的头像、图片和背景是抄进项目里的副本，删素材不会把它从对话里抹掉。
    showToast(`已从素材库删除「${asset.name}」，用上的头像、图片与背景不受影响。`);
  }, [showToast]);

  const handleRenameAsset = useCallback((asset: MediaAsset, name: string) => {
    const next = renameMediaAsset(library, asset.id, name);
    if (next === library) return;
    setLibrary(next);
    const renamed = next.find(item => item.id === asset.id);
    if (renamed) void putMediaAssets([renamed]).catch(() => {});
  }, [library]);

  // 生成图片 / 长截图 / 复制都走这里：两侧留白对图片同样生效，直接补在导出图的左右
  // （视频那边由录制合成时加，所以 chat-video-render 传的是 0）。
  const capturePhone = useCallback(async (longshot = false) => {
    return phoneRef.current
      ? captureChatPhone(phoneRef.current, longshot, screenSize, { sidePad: videoSidePad, background: settings.backgroundColor })
      : null;
  }, [screenSize, videoSidePad, settings.backgroundColor]);

  // ===================== 定时发送播放 =====================
  // 播放与导出视频共用这条时间轴：预览里看到的速度就是导出视频的速度。
  const playbackTimeline = useMemo(
    () => buildPlaybackTimeline(messages, { pace: playbackPace, selfId, notifyReceived: soundReceive, notifySent: soundSend }),
    [messages, playbackPace, selfId, soundReceive, soundSend],
  );
  // 整条时间轴上每一次发声的时刻与音效类型，预览播放和视频录制都用这一份。
  const notifyAt = useMemo(
    () => (soundEnabled ? notifyEvents(playbackTimeline) : []),
    [soundEnabled, playbackTimeline],
  );
  const previewMessages = useMemo(
    () => (playbackActive ? messages.slice(0, Math.min(revealedCount, messages.length)) : messages),
    [playbackActive, messages, revealedCount],
  );
  const videoSupported = videoExportSupported();
  const videoTooLong = messages.length > maxVideoMessages;
  const videoContainer = videoSupported ? videoContainerLabel(pickVideoMimeType(type => MediaRecorder.isTypeSupported(type))) : '不支持';
  // 滚动视频的时间轴只跟用户设的时长有关，与消息条数无关，所以单独算一份。
  const scrollPlan = useMemo(() => scrollVideoPlan(scrollDuration * 1000), [scrollDuration]);

  const unlockAudio = useCallback(() => {
    // 浏览器要求音频上下文在用户手势里解锁，否则播放和录制都会是静音。
    const context = notifyAudioContext();
    if (context) void resumeNotifyAudio(context);
    return context;
  }, []);

  useEffect(() => {
    if (!playbackPlaying) return;
    const timeline = playbackTimeline;
    if (!timeline.messageCount) { setPlaybackPlaying(false); return; }
    // 从当前进度继续：暂停再播放不会从头开始。
    const base = Math.min(revealedCountRef.current, timeline.messageCount);
    const offsetMs = timeline.frameAtMs[base] ?? 0;
    const startedAt = performance.now();
    const audio = soundEnabled ? notifyAudioContext() : null;
    if (audio) void resumeNotifyAudio(audio);
    const pending = notifyAt.filter(event => event.atMs > offsetMs);
    const remaining = Math.max(0, timeline.totalMs - offsetMs);
    // 上传过自定义提示音时，预览播放也用同一套音源（收/发各自替换），保证录屏和导出视频听感一致。
    const soundBuffers: NotifyCustomBuffers = soundSource === 'custom'
      ? { received: customSounds.received?.buffer ?? null, sent: customSounds.sent?.buffer ?? null }
      : {};
    let notified = 0;
    let lastIndex = -1;
    let handle = requestAnimationFrame(function tick() {
      const elapsed = performance.now() - startedAt;
      const index = frameIndexAt(timeline.frameAtMs, elapsed + offsetMs);
      // 每帧都 setState 会让整棵预览重渲染，只有画面真的换帧时才更新。
      if (index !== lastIndex) {
        lastIndex = index;
        setRevealedCount(index);
      }
      while (notified < pending.length && pending[notified].atMs - offsetMs <= elapsed) {
        playNotify(pending[notified].kind, audio, { buffers: soundBuffers });
        notified += 1;
      }
      if (elapsed >= remaining) {
        setRevealedCount(timeline.messageCount);
        setPlaybackPlaying(false);
        return;
      }
      handle = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(handle);
  }, [playbackPlaying, playbackTimeline, notifyAt, soundEnabled, soundSource, customSounds]);

  useEffect(() => {
    if (!playbackActive) return;
    // 编辑消息后进度不能超过总条数，否则预览会空白。
    setRevealedCount(current => Math.min(current, messages.length));
  }, [messages.length, playbackActive]);

  useEffect(() => {
    if (route === 'chat' || !playbackActive) return;
    setPlaybackPlaying(false);
    setPlaybackActive(false);
  }, [route, playbackActive]);

  const handlePlayStart = useCallback(() => {
    if (!messages.length) return;
    unlockAudio();
    setPlaybackActive(true);
    if (revealedCountRef.current >= messages.length) setRevealedCount(0);
    setPlaybackPlaying(true);
  }, [messages.length, unlockAudio]);

  const handlePlayPause = useCallback(() => setPlaybackPlaying(false), []);

  const handlePlayReset = useCallback(() => {
    unlockAudio();
    setPlaybackActive(true);
    setRevealedCount(0);
    revealedCountRef.current = 0;
    setPlaybackPlaying(true);
  }, [unlockAudio]);

  const handlePlayExit = useCallback(() => {
    setPlaybackPlaying(false);
    setPlaybackActive(false);
    setRevealedCount(messages.length);
  }, [messages.length]);

  // ===================== 视频导出 =====================
  /**
   * 收一个音频文件：转 data URL → 解码取时长 → 入音效库 → 返回可以直接用的那一条。
   * 两条上传入口（播放条上直接选文件、音效库弹窗里上传）共用它，所以是「上传即入库」：
   * 直接选的那段音频下次不在本地找了也能在音效库里翻到，和素材库是同一条规矩。
   */
  const ingestSoundFile = useCallback(async (context: AudioContext, file: File): Promise<{ asset: SoundAsset; buffer: AudioBuffer }> => {
    // 先转 data URL 存起来，再解码取时长；解码失败则不入库。
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('音频读取失败'));
      reader.readAsDataURL(file);
    });
    const buffer = await loadNotifySoundFile(context, file);
    const created = createSoundAsset({
      name: file.name,
      dataUrl,
      durationSeconds: buffer.duration,
      bytes: file.size,
    });
    const { library: next, added } = addSoundAssets(soundLibrary, [created]);
    if (added.length) {
      setSoundLibrary(next);
      if (soundLibraryReady) void putSoundAssets(added).catch(() => {});
      return { asset: created, buffer };
    }
    // 库里已经有同一段音频（同一个文件传了两次）：复用旧记录的 id，
    // 别让偏好指向一条不存在的音效。库满时不收录，返回的这条只活这一次。
    const existing = next.find(asset => asset.dataUrl === created.dataUrl) ?? created;
    return { asset: existing, buffer };
  }, [soundLibrary, soundLibraryReady]);

  // 直接上传音频：kind 决定这次传的是收到音还是发送音。
  const handleSoundFile = useCallback(async (file: File, kind: NotifyKind) => {
    setSoundError('');
    const context = unlockAudio();
    if (!context) { setSoundError('当前浏览器不支持音频处理，请改用 Chrome 或 Edge。'); return; }
    try {
      const { asset, buffer } = await ingestSoundFile(context, file);
      setCustomSounds(prev => ({ ...prev, [kind]: { id: asset.id, name: asset.name, durationSeconds: buffer.duration, buffer } }));
      setSoundSource('custom');
    } catch (error) {
      setCustomSounds(prev => ({ ...prev, [kind]: null }));
      setSoundError(error instanceof Error ? error.message : '音频读取失败，请换一个文件。');
    }
  }, [ingestSoundFile, unlockAudio]);

  // 音效库弹窗里的上传：同一条链路，回执用音效名。
  const handleSoundLibraryUpload = useCallback(async (file: File): Promise<string | null> => {
    const context = unlockAudio();
    if (!context) throw new Error('当前浏览器不支持音频处理，请改用 Chrome 或 Edge。');
    const { asset } = await ingestSoundFile(context, file);
    return asset.name;
  }, [ingestSoundFile, unlockAudio]);

  // 从音效库选一条：把它的 data URL 解码回 AudioBuffer，填进当前目标（收/发）那一声，并记一次使用。
  const handlePickSound = useCallback(async (asset: SoundAsset) => {
    const context = unlockAudio();
    if (!context) { setSoundError('当前浏览器不支持音频处理，请改用 Chrome 或 Edge。'); return; }
    setSoundError('');
    try {
      const blob = await (await fetch(asset.dataUrl)).blob();
      const buffer = await loadNotifySoundFile(context, blob);
      setCustomSounds(prev => ({ ...prev, [soundPickTarget]: { id: asset.id, name: asset.name, durationSeconds: buffer.duration, buffer } }));
      setSoundSource('custom');
      const touched = touchSoundAsset(soundLibrary, asset.id);
      if (touched !== soundLibrary) {
        setSoundLibrary(touched);
        const record = touched.find(item => item.id === asset.id);
        if (record) void putSoundAssets([record]).catch(() => {});
      }
      setSoundLibraryOpen(false);
    } catch (error) {
      setSoundError(error instanceof Error ? error.message : '音频读取失败，请换一个文件。');
    }
  }, [unlockAudio, soundLibrary, soundPickTarget]);

  const handleRemoveSound = useCallback((asset: SoundAsset) => {
    setSoundLibrary(prev => removeSoundAsset(prev, asset.id));
    // 正在用的那一条被删掉时，对应的提示音退回内置合成音，不能留着一个播不出来的 buffer。
    setCustomSounds(prev => {
      const next = { ...prev };
      for (const kind of ['received', 'sent'] as const) {
        if (next[kind]?.id === asset.id) next[kind] = null;
      }
      return next;
    });
    void deleteSoundAssetRecord(asset.id).catch(() => {});
  }, []);

  const handleRenameSound = useCallback((asset: SoundAsset, name: string) => {
    const next = renameSoundAsset(soundLibrary, asset.id, name);
    if (next === soundLibrary) return;
    setSoundLibrary(next);
    // 正在用的那条改名了，界面上的「已选：xxx」要跟着变。
    setCustomSounds(prev => {
      let changed = false;
      const result = { ...prev };
      for (const kind of ['received', 'sent'] as const) {
        if (result[kind]?.id === asset.id && result[kind]!.name !== name.trim()) {
          result[kind] = { ...result[kind]!, name: name.trim() || '未命名音效' };
          changed = true;
        }
      }
      return changed ? result : prev;
    });
    const renamed = next.find(item => item.id === asset.id);
    if (renamed) void putSoundAssets([renamed]).catch(() => {});
  }, [soundLibrary]);

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, []);

  const handleExportVideo = useCallback(async () => {
    if (!messages.length || videoTooLong || !videoSupported) return;
    const size = videoSizeOption(videoSize, screenSize);
    // 录进画布的那一份：留白生效时手机的画面比例换成「画布去掉两侧留白」，这样它铺满上下、
    // 两侧正好让出留白，而不是整体缩小后在上下也空出底色。采样密度（宽度 / 1125）不变。
    const renderScreen = videoContentScreen(screenSize, size, videoSidePad);
    const mimeType = pickVideoMimeType(type => MediaRecorder.isTypeSupported(type));
    const scrolling = videoMode === 'scroll';
    const filename = (scrolling ? '微信聊天滚动视频_' : '微信聊天视频_') + Date.now() + '.' + videoFileExtension(mimeType);
    const log = beginExportLog({ tool: 'chat', mode: 'video', filename });
    const timeline = playbackTimeline;
    // 滚动模式整段对话一开始就都在画面里，没有「收到消息」这一刻，所以整段无声；
    // 逐条模式则在音效总开关关掉时按空数组处理，同样不发声。
    const soundEvents = scrolling ? [] : notifyAt;
    const audioContext = soundEvents.length ? unlockAudio() : null;
    // 声音与节奏只属于逐条模式，这里先把两条时间轴算清楚，后面按模式取用。
    const scrollRecording = scrollPlan;
    const totalMs = scrolling ? scrollRecording.durationMs : timeline.totalMs;
    const renderTotal = scrolling ? 1 : messages.length + 1;
    const renderHint = scrolling ? '正在把整段对话合成为一张长图，内容越多越慢，请不要切换标签页…' : undefined;
    setVideoOpen(false);
    videoToken.current = { cancelled: false };
    setVideoProgress({ stage: 'render', current: 0, total: renderTotal, elapsedMs: 0, totalMs, renderHint });
    showToast('正在生成视频，请保持本页在前台…');
    try {
      // 先做一次本地额度预检，避免白渲染一遍才发现没有额度。
      if (!unlimited && visibleQuota.total_remaining <= 0) {
        void log.finish('cancelled', '额度不足');
        if (accountSession) openOfficialAccountPrompt('export');
        else {
          setAccountError('今日免费额度已用完，登录后可继续使用并领取关注奖励。');
          setAccountPrompt(true);
        }
        return;
      }
      // 两条路径各自先把画面准备好：滚动模式是一张长图，逐条模式是每多一条消息一帧。
      let record: () => Promise<Awaited<ReturnType<typeof recordChatVideo>>>;
      if (scrolling) {
        const frame = await renderChatScrollFrame({ users, messages, settings, selfId, screen: renderScreen }, { token: videoToken.current });
        record = () => recordScrollingChatVideo({
          image: frame.blob,
          viewport: frame.viewport,
          topChromeHeight: frame.topChromeHeight,
          bottomChromeHeight: frame.bottomChromeHeight,
          size: { width: size.width, height: size.height },
          background: settings.backgroundColor || '#ededed',
          sidePadding: videoSidePad,
          plan: scrollRecording,
          token: videoToken.current,
          onProgress: (elapsedMs, recordMs) => setVideoProgress({ stage: 'record', current: 0, total: messages.length, elapsedMs, totalMs: recordMs }),
        });
      } else {
        const frames = await renderChatFrames({ users, messages, settings, selfId, screen: renderScreen }, {
          token: videoToken.current,
          onProgress: (current, total) => setVideoProgress({ stage: 'render', current, total, elapsedMs: 0, totalMs }),
        });
        record = () => recordChatVideo({
          frames: frames.blobs,
          frameWidth: frames.width,
          frameHeight: frames.height,
          frameAtMs: timeline.frameAtMs,
          totalMs: timeline.totalMs,
          size: { width: size.width, height: size.height },
          background: settings.backgroundColor || '#ededed',
          sidePadding: videoSidePad,
          notifyAt: soundEvents,
          audio: audioContext ? {
            context: audioContext,
            buffers: soundSource === 'custom'
              ? { received: customSounds.received?.buffer ?? null, sent: customSounds.sent?.buffer ?? null }
              : {},
          } : null,
          token: videoToken.current,
          onProgress: (elapsedMs, recordMs) => setVideoProgress({ stage: 'record', current: 0, total: messages.length, elapsedMs, totalMs: recordMs }),
        });
      }
      // 真正的扣次放在渲染之后：渲染过程中取消不消耗额度，只有开始录制才算一次导出。
      const ticket = await authorizeExport();
      if (!ticket) { void log.finish('cancelled', '额度校验未通过'); return; }
      setVideoProgress({ stage: 'record', current: 0, total: messages.length, elapsedMs: 0, totalMs });
      const recorded = await record();
      downloadBlob(recorded.blob, filename);
      void log.finish('download_requested');
      completeExport(ticket);
      void trackProductEvent('video_exported', {
        capture_mode: videoSize,
        // 两种录制方式的效果差得远，分开统计才知道该往哪边投精力。
        render_mode: videoMode,
        message_count_bucket: messageCountBucket(messages.length),
        tool: 'chat',
      });
      showToast(`视频已生成并下载（${videoContainerLabel(recorded.mimeType)}）。`);
      promptAfterExport();
    } catch (error) {
      const cancelled = videoToken.current.cancelled;
      const message = error instanceof Error ? error.message : '生成视频失败';
      void log.finish(cancelled ? 'cancelled' : 'failed', message);
      showToast(cancelled ? '已取消生成。' : message);
    } finally {
      setVideoProgress(null);
    }
  }, [users, messages, settings, selfId, videoSize, videoMode, scrollPlan, screenSize, videoSidePad, videoTooLong, videoSupported, playbackTimeline, notifyAt, soundSource, customSounds, showToast, authorizeExport, completeExport, promptAfterExport, downloadBlob, unlockAudio, unlimited, visibleQuota.total_remaining, accountSession, openOfficialAccountPrompt]);

  const handleGenerateImage = useCallback(async () => {
    if (!phoneRef.current) return;
    const filename = '微信聊天记录_' + Date.now() + '.png';
    const log = beginExportLog({ tool: 'chat', mode: 'standard', filename });
    showToast('正在生成图片...');
    try {
      const canvas = await capturePhone(false);
      if (!canvas) { void log.finish('failed', '未能获取聊天预览'); return; }
      const ticket = await authorizeExport();
      if (!ticket) { void log.finish('cancelled', '额度校验未通过'); return; }
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      void log.finish('download_requested');
      completeExport(ticket);
      void trackProductEvent('image_exported', {
        capture_mode: 'standard',
        message_count_bucket: messageCountBucket(messages.length),
        tool: 'chat',
      });
      showToast('图片已生成并下载！');
      promptAfterExport();
    } catch (e: unknown) {
      void log.finish('failed', '图片生成或下载操作失败');
      showToast('生成失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }, [showToast, capturePhone, messages.length, promptAfterExport, authorizeExport, completeExport]);

  const handleCopyImage = useCallback(async () => {
    if (!phoneRef.current) return;
    const log = beginExportLog({ tool: 'chat', mode: 'clipboard' });
    showToast('正在生成图片...');
    try {
      const canvas = await capturePhone(false);
      if (!canvas) { void log.finish('failed', '未能获取聊天预览'); return; }
      canvas.toBlob(async (blob) => {
        if (!blob) { void log.finish('failed', '图片转换失败'); return; }
        try {
          const ticket = await authorizeExport();
          if (!ticket) { void log.finish('cancelled', '额度校验未通过'); return; }
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          void log.finish('copied');
          completeExport(ticket);
          void trackProductEvent('image_exported', {
            capture_mode: 'clipboard',
            message_count_bucket: messageCountBucket(messages.length),
            tool: 'chat',
          });
          showToast('图片已复制到剪贴板！');
          promptAfterExport();
        } catch {
          void log.finish('failed', '图片复制失败，请检查剪贴板权限');
          showToast('复制失败，请使用下载功能');
        }
      });
    } catch {
      void log.finish('failed', '图片生成失败');
      showToast('操作失败');
    }
  }, [showToast, capturePhone, messages.length, promptAfterExport, authorizeExport, completeExport]);

  const handleGenerateLongImage = useCallback(async () => {
    if (!phoneRef.current) return;
    const filename = '微信聊天记录_长截图_' + Date.now() + '.png';
    const log = beginExportLog({ tool: 'chat', mode: 'long', filename });
    showToast('正在生成长截图...');
    try {
      const canvas = await capturePhone(true);
      if (!canvas) { void log.finish('failed', '未能获取聊天预览'); return; }
      const ticket = await authorizeExport();
      if (!ticket) { void log.finish('cancelled', '额度校验未通过'); return; }
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
      void log.finish('download_requested');
      completeExport(ticket);
      void trackProductEvent('image_exported', {
        capture_mode: 'long',
        message_count_bucket: messageCountBucket(messages.length),
        tool: 'chat',
      });
      showToast('长截图已生成并下载！');
      promptAfterExport();
    } catch (e: unknown) {
      void log.finish('failed', '长图生成或下载操作失败');
      showToast('生成失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }, [showToast, capturePhone, messages.length, promptAfterExport, authorizeExport, completeExport]);

  const hasMessages = messages.length > 0;
  // 播放期间预览只渲染了一部分消息，此时截图会导出一段被截断的对话。
  const captureDisabledHint = playbackActive ? '定时发送进行中：先点“显示全部”再导出图片' : undefined;
  // 同一个素材库弹窗服务四个入口：换头像、换某条消息的图、给待发送的草稿挑一张、挑一张背景。
  const backgroundLabel = libraryPicker?.background === 'chat' ? '聊天背景' : libraryPicker?.background === 'moments' ? '朋友圈背景' : '';
  const libraryTitle = libraryPicker?.background
    ? `从素材库选${backgroundLabel}`
    : libraryPicker?.userId !== undefined
      ? '从素材库选头像'
      : libraryPicker?.msgId !== undefined || libraryPicker?.draft ? '从素材库选图片' : '我的素材库';
  const libraryDescription = libraryPicker?.background
    ? `点一张即可用作${backgroundLabel}；也可以现在传几张新的，传一张就直接换上，之后一直留在库里。`
    : libraryPicker?.userId !== undefined
      ? '点一张即可换上这位角色的头像；也可以现在传几张新的，传一张就直接换上。'
      : libraryPicker?.msgId !== undefined
        ? '点一张即可换到这条消息上；新上传的图也会留在库里。'
        : libraryPicker?.draft
          ? '点一张放进「添加消息 → 图片」，再点添加即可。'
          : '上传过的头像、表情、背景图和商品图都会留在这里，下次直接点选即可，不用再翻本地文件。';

  // 视频设置只有一份（都来自「我的偏好」）：聊天页的生成视频弹窗与批量页的视频设置共用它，
  // 在任一页改过，另一页打开就是同一个值。
  const videoSettings: VideoExportSettings = {
    mode: videoMode,
    size: videoSize,
    pace: playbackPace,
    scrollDurationSeconds: scrollDuration,
    sidePad: videoSidePad,
    soundEnabled,
    soundReceive,
    soundSend,
    soundSource,
    customSounds: {
      received: customSounds.received ? { name: customSounds.received.name, durationSeconds: customSounds.received.durationSeconds } : null,
      sent: customSounds.sent ? { name: customSounds.sent.name, durationSeconds: customSounds.sent.durationSeconds } : null,
    },
  };
  const patchVideoSettings = (patch: Partial<VideoExportSettings>) => {
    if (patch.mode) setVideoMode(patch.mode);
    if (patch.size) setVideoSize(patch.size);
    if (patch.pace) setPlaybackPace(patch.pace);
    if (patch.scrollDurationSeconds !== undefined) setScrollDuration(patch.scrollDurationSeconds);
    if (patch.sidePad !== undefined) setVideoSidePad(patch.sidePad);
    if (patch.soundEnabled !== undefined) setSoundEnabled(patch.soundEnabled);
    if (patch.soundReceive !== undefined) setSoundReceive(patch.soundReceive);
    if (patch.soundSend !== undefined) setSoundSend(patch.soundSend);
    if (patch.soundSource) setSoundSource(patch.soundSource);
  };

  return (
    <>
      <div className={`studio-app ${isWorking ? 'is-working' : ''}`}>
        <header className="studio-header">
          <StudioLink route="home" onNavigate={navigate} className="studio-brand"><span><MessageSquare size={19} /></span><strong>微信创作工具箱</strong></StudioLink>
          <div className="studio-breadcrumb"><span>/</span><span>{isWorking ? '工作空间' : '创作中心'}</span><ChevronRight size={14} /><b>{workspaceTools.find(tool => tool.id === route)?.title || (route === 'exports' ? '导出日志' : route === 'resources' ? '模板与指南' : '工具概览')}</b></div>
          <div className="studio-header-actions">
            <UpdateAnnouncement blocked={accountPrompt || paymentPrompt || shareOpen || officialAccountPrompt !== null || Boolean(confirmation)} />
            <Button className="studio-icon-action" type="button" aria-label="关注公众号" title="关注公众号" onClick={() => openOfficialAccountPrompt('header')}><BellRing size={17} /></Button>
            <RewardHeaderButton onClick={() => setShareOpen(true)} />
            <Button className="account-trigger" type="button" aria-label={`账户：${accountSession?.user.display_name ?? '未登录'}，${unlimited ? '会员不限次' : `剩余 ${visibleQuota.total_remaining} 次`}`} onClick={() => { setAccountError(''); setAccountPrompt(true) }}><UserRound size={15} /><span>{accountSession ? accountSession.user.display_name : '登录'}</span><small>{unlimited ? '会员' : `${visibleQuota.total_remaining} 次`}</small></Button>
          </div>
        </header>
        <div className="studio-layout">
          <aside className="studio-sidebar" aria-label="工作空间导航">
            <StudioLink route="home" onNavigate={navigate} aria-label="工具概览" title="工具概览" className={`studio-overview-link ${route === 'home' ? 'is-active' : ''}`} aria-current={route === 'home' ? 'page' : undefined}><LayoutGrid size={17} /><span>工具概览</span></StudioLink>
            <div className="studio-nav-label">创作工具 <span>07</span></div>
            <nav className="studio-tool-nav" aria-label="微信创作工具箱">{workspaceTools.map(tool => <StudioLink key={tool.id} route={tool.id} onNavigate={navigate} className={route === tool.id ? 'is-active' : ''} aria-label={tool.title} title={tool.title} aria-current={route === tool.id ? 'page' : undefined}><tool.icon size={17} /><span>{tool.title}</span>{tool.id === 'batch' && <small>批量</small>}</StudioLink>)}</nav>
            <StudioLink route="exports" onNavigate={navigate} aria-label="导出日志" title="导出日志" className={`studio-overview-link ${route === 'exports' ? 'is-active' : ''}`} aria-current={route === 'exports' ? 'page' : undefined}><History size={17} /><span>导出日志</span></StudioLink>
            <div className="studio-sidebar-bottom">
              <StudioLink route="resources" onNavigate={navigate} aria-label="模板与指南" title="模板与指南" className={`studio-overview-link ${route === 'resources' ? 'is-active' : ''}`} aria-current={route === 'resources' ? 'page' : undefined}><BookOpen size={17} /> 模板与指南</StudioLink>
              <Button variant="outline" className="studio-quota-card" type="button" onClick={() => { setAccountError(''); setAccountPrompt(true) }}><span>{unlimited ? '会员导出权益' : '可用导出额度'} <ArrowRight size={14} /></span><strong>{unlimited ? '不限次' : visibleQuota.total_remaining}{!unlimited && <small> 次</small>}</strong><p>{unlimited ? '次数包与奖励余额保留' : accountSession ? '查看账户与额度明细' : '每日免费额度 · 登录领取奖励'}</p></Button>
              <p className="studio-sidebar-note"><ShieldCheck size={13} /> 本地创作 · 隐私优先</p>
            </div>
          </aside>
          <div className="studio-stage">
            {route === 'exports' && <ExportLogPage onNavigate={navigate} />}
            {route === 'home' && <div className="studio-page-scroll"><ToolHome onNavigate={navigate} hasDraft={hasMessages} promotion={<RewardPromotion session={accountSession} refreshKey={`${accountPrompt}:${shareOpen}`} onShare={() => setShareOpen(true)} onAccount={() => { setAccountError(''); setAccountPrompt(true); }} />} /></div>}
            {route === 'resources' && <main className="studio-page-scroll studio-resources"><StudioLink route="home" onNavigate={navigate} className="studio-back-link"><ArrowLeft size={15} /> 返回工具概览</StudioLink><h1>模板与使用指南</h1><p className="studio-page-description">挑选一个示例，在独立工作页中继续编辑。</p><GrowthContent onUseTemplate={handleUseTemplate} onOpenEditor={() => { setChatSection('content'); navigate('chat'); }} /><footer className="analytics-note">创作内容和图片在本地处理；主动分享同款时，对话文字会写入分享链接。账号服务保存邮箱、验证和额度 / 邀请记录，访问统计使用匿名标识。</footer></main>}
            {isWorking && <h1 className="studio-work-title sr-only">{workspaceTools.find(tool => tool.id === activeTool)?.title}</h1>}
            <div className="studio-tool-page" hidden={route !== 'batch'}><BatchStudio currentChat={{ users, messages, settings, selfId }} remaining={visibleQuota.total_remaining} unlimited={unlimited} onDebit={debitBatchExport} screen={screenSize} onScreenChange={setScreenSize} mediaAssets={library} libraryReady={libraryReady} onImportMedia={importMedia} onMarkAssetUsed={markAssetUsed} onRemoveAsset={handleRemoveAsset} onRenameAsset={handleRenameAsset} avatarPresets={avatarPresets} presetsReady={presetsReady} onTouchPreset={touchPreset} onRenamePreset={handleRenamePreset} onRemovePreset={handleRemovePreset} onRememberUsers={rememberUsersForPresets} video={{
              settings: videoSettings,
              onSettingsChange: patchVideoSettings,
              supported: videoSupported,
              containerLabel: videoContainer,
              soundLibraryCount: soundLibrary.length,
              onSoundFile: (file, kind) => void handleSoundFile(file, kind),
              onOpenSoundLibrary: soundLibraryReady ? kind => { setSoundPickTarget(kind); setSoundError(''); setSoundLibraryOpen(true); } : undefined,
              soundError,
              // 音频上下文必须在用户手势里解锁，批量页会在点「导出所选视频」时调它。
              resolveAudio: () => {
                const context = unlockAudio();
                return context ? {
                  context,
                  buffers: soundSource === 'custom'
                    ? { received: customSounds.received?.buffer ?? null, sent: customSounds.sent?.buffer ?? null }
                    : {},
                } : null;
              },
            }} onComplete={(id, output) => {
              if (batchOwners.current.get(id) !== 'guest') completeExport(id);
              if (output === 'video') void trackProductEvent('video_exported', { capture_mode: videoSize, render_mode: videoMode, tool: 'batch' });
              else void trackProductEvent('image_exported', { capture_mode: 'standard', tool: 'batch' });
            }} /></div>
            <div className="studio-tool-page" hidden={route !== 'chat'} id="editor" ref={editorRef}>
              <WorkspacePanels previewTitle="聊天效果预览" previewDescription={`可滚动查看消息 · 导出 ${screenSizeLabel(screenSize)}${videoSidePad > 0 ? `，图片左右各留 ${videoSidePad}px` : ''}`} screen={screenSize} onScreenChange={setScreenSize} imageMax={settings.imageMax} onImageMaxChange={value => setSettings(current => ({ ...current, imageMax: value }))} fontScale={settings.fontScale} onFontScaleChange={value => setSettings(current => ({ ...current, fontScale: value }))} videoSidePad={videoSidePad} onVideoSidePadChange={setVideoSidePad} videoFrame={{ output: videoSizeOption(videoSize, screenSize), background: settings.backgroundColor || '#ededed' }} preview={<PhonePreview users={users} messages={previewMessages} settings={settings} selfId={selfId} phoneRef={phoneRef} onUpdateMessage={handleUpdateMessage} screen={videoScreen} onPickSticker={libraryReady ? msgId => setLibraryPicker({ kind: 'sticker', msgId }) : undefined} onUploadImage={libraryReady ? (_msgId, file) => uploadImageFile(file) : undefined} />}
                previewActions={<div className="chat-export-actions">
                  <ChatPlaybackBar
                    active={playbackActive}
                    playing={playbackPlaying}
                    revealed={previewMessages.length}
                    total={messages.length}
                    pace={playbackPace}
                    soundEnabled={soundEnabled}
                    soundReceive={soundReceive}
                    soundSend={soundSend}
                    soundSource={soundSource}
                    customSoundNames={{
                      received: customSounds.received?.name ?? null,
                      sent: customSounds.sent?.name ?? null,
                    }}
                    busy={videoProgress !== null}
                    onPlay={handlePlayStart}
                    onPause={handlePlayPause}
                    onReset={handlePlayReset}
                    onExit={handlePlayExit}
                    onPaceChange={setPlaybackPace}
                    onSoundToggle={setSoundEnabled}
                    onSoundReceiveChange={setSoundReceive}
                    onSoundSendChange={setSoundSend}
                    onSoundSourceChange={setSoundSource}
                    onPickSound={soundLibraryReady ? kind => { setSoundPickTarget(kind); setSoundError(''); setSoundLibraryOpen(true); } : undefined}
                  />
                  <div className="chat-export-summary"><span>{messages.length} 条消息 · {users.length} 个角色</span><span>{unlimited ? '会员不限次' : `剩余 ${visibleQuota.total_remaining} 次`}</span></div>
                  <div className="chat-export-primary-row">
                    <Button type="button" className="btn btn-primary chat-export-primary" disabled={!hasMessages || playbackActive} title={captureDisabledHint} onClick={handleGenerateImage}><Download size={16} /> 生成图片</Button>
                    <Button type="button" className="btn btn-primary chat-export-primary" disabled={!hasMessages || videoTooLong || !videoSupported} title={videoTooLong ? `一次最多导出 ${maxVideoMessages} 条消息的视频` : videoSupported ? '录制成视频：逐条播放并带提示音，或整段对话滚动到底' : '当前浏览器不支持本地生成视频'} onClick={() => { setSoundError(''); setVideoOpen(true); }}><Video size={16} /> 生成视频</Button>
                  </div>
                  <div className="chat-export-secondary"><Button type="button" className="btn btn-outline" disabled={!hasMessages || playbackActive} title={captureDisabledHint} onClick={handleGenerateLongImage}><ImageIcon size={15} /> 长截图</Button><Button type="button" className="btn btn-outline" disabled={!hasMessages || playbackActive} title={captureDisabledHint} onClick={handleCopyImage}><Copy size={15} /> 复制</Button><Button type="button" className="btn btn-outline" disabled={!hasMessages} onClick={handleShareSame}><Share2 size={15} /> 同款链接</Button></div>
                </div>}>
                <div className="chat-project-bar"><label><span>当前对话</span><Input aria-label="工作页项目名称" placeholder="未命名对话" value={activeProjectName} maxLength={48} onChange={event => setActiveProjectName(event.target.value)} /></label><span className={`studio-save-state is-${saveState}`}>{saveState === 'saved' ? <><Check size={13} /> 已自动保存</> : saveState === 'saving' ? '保存中…' : saveState === 'error' ? '本地保存失败' : '仅保存在本机'}</span></div>
                <Tabs value={chatSection} onValueChange={value => setChatSection(value as typeof chatSection)}>
                <TabsList variant="line" className="studio-section-tabs" aria-label="聊天编辑面板">{([{ id: 'content', label: '聊天内容', icon: MessageSquare }, { id: 'people', label: '角色头像', icon: UsersRound }, { id: 'settings', label: '手机样式', icon: Settings2 }, { id: 'projects', label: '本地草稿', icon: FolderOpen }] as const).map(item => <TabsTrigger key={item.id} value={item.id}><item.icon size={15} />{item.label}</TabsTrigger>)}</TabsList>
                <TabsContent className="chat-section-content" value="content" keepMounted>
                  <ImportPanel text={importText} onTextChange={setImportText} onImport={handleImport} />
                  {users.length > 0 && <MessageEditor
                    users={users}
                    selfId={selfId}
                    onAddMessage={handleAddMessage}
                    imagePreview={draftImage}
                    onImagePreviewChange={setDraftImage}
                    onUploadImage={uploadImageFile}
                    mediaAssets={library}
                    libraryEnabled={libraryReady}
                    onAssetUsed={asset => markAssetUsed(asset.id)}
                    onOpenImageLibrary={kind => setLibraryPicker({ kind, draft: true })}
                  />}
                  {!hasMessages && <div className="workspace-getting-started"><span>第一次使用？</span><p>按“姓名：消息”逐行输入，点击解析即可预览。也可以从模板开始。</p><StudioLink route="resources" onNavigate={navigate}>选择对话模板 <ArrowRight size={14} /></StudioLink></div>}
                </TabsContent>
                <TabsContent className="chat-section-content" value="people" keepMounted>{users.length ? <UserAvatarManager
                  users={users}
                  selfId={selfId}
                  onUpdateAvatar={handleUpdateAvatar}
                  onRemoveAvatar={handleRemoveAvatar}
                  onSetSelf={setSelfId}
                  onUploadAvatar={handleUploadAvatar}
                  onBatchUpload={handleBatchAvatars}
                  onOpenLibrary={userId => setLibraryPicker({ kind: 'avatar', userId })}
                  onManageLibrary={() => setLibraryPicker({ kind: 'avatar' })}
                  libraryAvatarCount={mediaAssetsOfKind(library, 'avatar').length}
                  libraryEnabled={libraryReady}
                  avatarPresets={avatarPresets}
                  presetsEnabled={presetsReady}
                  onUsePreset={handleUsePreset}
                  onRenamePreset={handleRenamePreset}
                  onRemovePreset={handleRemovePreset}
                /> : <div className="workspace-empty"><UsersRound size={30} /><h2>先添加聊天角色</h2><p>导入对话后，即可在这里设置头像和“我”的身份。</p><Button type="button" className="btn btn-outline" onClick={() => setChatSection('content')}>编辑聊天内容</Button></div>}</TabsContent>
                <TabsContent className="chat-section-content" value="settings" keepMounted><SettingsPanel
                  settings={settings}
                  onSettingsChange={setSettings}
                  onUploadBackground={uploadBackgroundFile}
                  onOpenBackgroundLibrary={libraryReady ? () => openBackgroundLibrary('chat') : undefined}
                  backgroundAssets={mediaAssetsOfKind(library, 'background')}
                  onBackgroundUsed={asset => markAssetUsed(asset.id)}
                  libraryEnabled={libraryReady}
                /></TabsContent>
                <TabsContent className="chat-section-content" value="projects" keepMounted><ProjectPanel projects={projects} activeProjectId={activeProjectId} activeProjectName={activeProjectName} saveState={saveState} storageAvailable={storageAvailable} onCreate={() => { void handleCreateProject().then(() => setChatSection('content')); }} onOpen={project => { void handleOpenProject(project).then(() => setChatSection('content')); }} onRename={setActiveProjectName} onDuplicate={project => { void handleDuplicateProject(project); }} onDelete={project => { void handleDeleteProject(project); }} />{!projects.length && <p className="workspace-muted">暂无本地草稿。开始编辑后会自动保存到当前浏览器。</p>}</TabsContent>
                </Tabs>
              </WorkspacePanels>
            </div>
            <div className="studio-tool-page" hidden={route !== 'moments'}><MomentsEditor
              onToast={showToast}
              onBeforeExport={authorizeExport}
              onUploadCover={uploadBackgroundFile}
              onPickCover={libraryReady ? pickMomentCover : undefined}
              backgroundAssets={mediaAssetsOfKind(library, 'background')}
              onBackgroundUsed={asset => markAssetUsed(asset.id)}
              libraryEnabled={libraryReady}
              onExportSuccess={ticket => {
                completeExport(ticket); void trackProductEvent('image_exported', { capture_mode: 'standard', tool: 'moments' }); promptAfterExport();
              }}
            /></div>
            {(['payment', 'redpacket', 'profile', 'group'] as const).map(kind => <div className="studio-tool-page" key={kind} hidden={route !== kind}><WechatSceneEditor kind={kind} onToast={showToast} onBeforeExport={authorizeExport} onExportSuccess={ticket => {
              completeExport(ticket); void trackProductEvent('image_exported', { capture_mode: 'standard', tool: kind }); promptAfterExport();
            }} /></div>)}
          </div>
        </div>
      </div>

      <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title ?? ""} description={confirmation?.description ?? ""} confirmText={confirmation?.confirmText} onOpenChange={open => { if (!open) resolveConfirmation(false); }} onConfirm={() => resolveConfirmation(true)} />
      {toast && <div className="toast-msg">{toast}</div>}
      <OfficialAccountDialog
        open={officialAccountPrompt !== null}
        placement={officialAccountPrompt ?? 'header'}
        authenticated={accountSession !== null}
        busy={accountBusy}
        redeemMessage={redeemMessage}
        onClose={closeOfficialAccountPrompt}
        onCopyId={copyOfficialAccountId}
        onLogin={() => { closeOfficialAccountPrompt(); setAccountError(''); setAccountPrompt(true) }}
        onRedeem={handleRedeem}
      />
      <AccountDialog
        key={accountSession?.user.id || 'guest'}
        open={accountPrompt}
        session={accountSession}
        busy={accountBusy}
        error={accountError}
        onClose={closeAccount}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onVerify={handleVerify}
        onLogout={handleLogout}
        onRecharge={() => { setAccountPrompt(false); setPaymentPrompt(true); }}
      />
      {paymentPrompt && <PaymentDialog key={accountSession?.user.id || 'guest'} session={accountSession} onClose={() => setPaymentPrompt(false)} onAccount={() => { setPaymentPrompt(false); setAccountError(''); setAccountPrompt(true); }} onQuota={(userId, quota) => { setAccountSession(current => current?.user.id === userId ? { ...current, quota } : current); if (accountSession?.user.id === userId) setVisibleQuota(quota); }} />}
      {shareOpen && <ShareDialog session={accountSession} onClose={closeShare} onAccount={() => { setShareOpen(false); setAccountError(''); setAccountPrompt(true); }} />}
      <MediaLibraryDialog
        open={libraryPicker !== null}
        onOpenChange={open => { if (!open) closeLibraryPicker() }}
        assets={library}
        kind={libraryPicker?.kind ?? 'sticker'}
        onKindChange={kind => setLibraryPicker(current => !current ? { kind } : {
          // 换类目通常等于换了用途，旧目标（某位角色 / 某条消息 / 某处背景）不再适用就清掉。
          // 例外是表情图片与商品图：两者都是往「图片」消息里塞一张图，来回切时目标留着，
          // 不然在弹窗里换个类目挑图，选完就不知道该发给哪条消息了。
          kind,
          userId: kind === 'avatar' ? current.userId : undefined,
          msgId: isImageMessageKind(kind) ? current.msgId : undefined,
          draft: isImageMessageKind(kind) ? current.draft : undefined,
          background: kind === 'background' ? current.background : undefined,
        })}
        enabled={libraryReady}
        title={libraryTitle}
        description={libraryDescription}
        pickLabel={libraryPicker?.background ? '用作背景' : libraryPicker?.userId !== undefined ? '设为头像' : libraryPicker?.msgId !== undefined ? '换这张' : libraryPicker?.draft ? '用这张' : '使用'}
        onPick={handlePickFromLibrary}
        onUpload={handleLibraryUpload}
        onRemove={handleRemoveAsset}
        onRename={handleRenameAsset}
      />
      <VideoExportDialog
        open={videoOpen}
        onOpenChange={open => { setVideoOpen(open); if (!open) setSoundError(''); }}
        settings={videoSettings}
        onChange={patchVideoSettings}
        messageCount={messages.length}
        soundCount={notifyAt.length}
        // 两种模式的耗时构成完全不同：逐条模式是「每帧渲染 + 按节奏录制」，
        // 滚动模式是一次长图合成 + 按设定时长录制。
        estimatedMs={videoMode === 'scroll'
          ? scrollPlan.durationMs + 3000
          : playbackTimeline.totalMs + (messages.length + 1) * 300}
        durationLabel={playbackDurationLabel(playbackTimeline.totalMs)}
        containerLabel={videoContainer}
        screen={screenSize}
        supported={videoSupported && !videoTooLong}
        soundError={soundError}
        onSoundFile={(file, kind) => void handleSoundFile(file, kind)}
        onOpenSoundLibrary={soundLibraryReady ? kind => { setSoundPickTarget(kind); setSoundLibraryOpen(true); } : undefined}
        soundLibraryCount={soundLibrary.length}
        onConfirm={() => void handleExportVideo()}
      />
      <SoundLibraryDialog
        open={soundLibraryOpen}
        onOpenChange={setSoundLibraryOpen}
        assets={soundLibrary}
        enabled={soundLibraryReady}
        pickTargetLabel={soundPickTarget === 'received' ? '「收到消息」那一声' : '「发送消息」那一声'}
        onPick={asset => void handlePickSound(asset)}
        onUpload={handleSoundLibraryUpload}
        onRemove={handleRemoveSound}
        onRename={handleRenameSound}
      />
      {videoProgress && <VideoProgressOverlay
        stage={videoProgress.stage}
        current={videoProgress.current}
        total={videoProgress.total}
        elapsedMs={videoProgress.elapsedMs}
        totalMs={videoProgress.totalMs}
        renderHint={videoProgress.renderHint}
        onCancel={() => { videoToken.current.cancelled = true; }}
      />}
    </>
  );
}

export default App;
