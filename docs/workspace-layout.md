# 独立创作工作页

> v0.1.0 发布准备：本文件保留 2026-09-10 的本地验收记录，历史测试数量与「未部署」描述仅指当时状态。整套新版正在发布，实际线上完成情况以发布工作流和生产验收为准。

## 页面结构

- `/`：工具概览与奖励入口，不嵌入编辑器。
- `/?tool=chat`：聊天工作页。
- `/?tool=batch`：批量聊天工作页。
- `/?tool=moments|payment|redpacket|profile|group`：各自独立工作页。
- `/?page=resources`：模板、指南、常见问题。
- `/?page=exports`：当前浏览器的全局导出日志，不提供图片备份或工程恢复。

采用 query 路由，保留部署子路径与邀请参数；无需静态托管服务添加深路径重写。导航可后退、前进、刷新；旧分享模板 hash 仍兼容。通过同页导航切换工具时保留已挂载编辑器的状态。

## 组件分工

- `WorkspacePanels`：中间独立滚动编辑区、右侧固定预览与操作区；小屏切换编辑/预览，短窗口可在预览内部滚动。
- `Workspace.css`：统一浅绿语义色、细边框、紧凑导航、分组工具栏及响应式规则。采用指定 Vercel 结构规律，不套用暗色皮肤。
- `ToolHome` / `workspace-tools`：工具入口与一致的导航定义。
- 聊天面板：内容、角色、样式、本地草稿分组；解析格式说明按需展开。
- `BatchStudio`：导入和编辑队列分视图，预览与额度确认在右侧。
- 朋友圈：动态内容、发布身份、点赞与评论三个保留状态的编辑分栏。
- 其他场景：桌面双列表单，窄容器转单列；统一预览与导出位置。
- `ScenePreviewFrame`：截图内容固定 390px 宽，缩放只发生在截图节点外，避免右栏宽度影响导出。

当前浏览器中的聊天草稿保存在 IndexedDB；批量任务仍仅当前页面暂存，刷新前需下载。工作页的响应式预览缩放不应改变实际导出分辨率。

## 验收

- `npm test`：包含 URL 兼容和原有业务规则测试。
- `npm run build` / `npm run lint`。
- `scripts/workspace-smoke.mjs`：独立路由/刷新/历史、模板导入、固定预览、7 工具 × 3 视口、跨工具保留内容。
- `scripts/batch-chat-smoke.mjs`：真实 PNG/ZIP、重复下载不扣费、dirty 修改不扣费、单图与副本隔离回归。
- `scripts/scene-workspace-smoke.mjs`：朋友圈与场景桌面/手机实际导出及保存检查。

浏览器脚本使用新建隔离环境并阻断非本地请求，不使用用户登录态、不调用生产支付或额度接口。业务导出测试只消耗该隔离浏览器内的游客额度。

以下为当时的本地验收范围：未部署线上，生产账号验证/充值不在该次端到端验收范围。

2026-09-10 本地结果：31 项单测、构建、lint、27 项布局浏览器检查通过；批量 PNG 均为 1125px 宽，单图为 1125×2436；朋友圈桌面/手机均为 780×1608，支付场景均为 780×1548。生成文件已看图确认，水印保留。

## 2026-09-10 工作页密度修订

延续浅绿色与 Base UI 组件，不采用整体缩放或隐藏溢出。删除重复整行页标题（保留可访问 h1）、主导航由 62px 压缩为 52px，编辑内边距改为 12–24px；预览标题与导出操作采用紧凑间距。手机缩放按实际可用内容尺寸计算，预览可完整显示，导出分辨率不变。

批量页将名称、切换栏和数量放入同一工具栏；导出方式与输入标题并排。文本区填满可用高度，导入按钮无需滚动寻找。大屏队列与当前项并排；中窄屏用局部横向队列。高级头像/手机设置仍按需展开，长任务列表仍在列表内部滚动。聊天的追加消息按需展开；朋友圈拆分编辑分栏；支付等场景用双列承载字段。

`scripts/workspace-density-smoke.mjs --verify` 在隔离本地浏览器验证并保存前后度量：

- 1366×768 批量导入的编辑区溢出由 278px 降为 0，默认队列编辑由 377px 降为 0；文本区由约 353px 增至约 446px。
- 1280×720、1024×768 的默认批量导入/编辑同样无编辑区滚动；390×844 的导入按钮保持首屏可达，复杂编辑仍允许必要滚动。
- 1366×768 的聊天导入/手机样式、朋友圈三个分栏、支付、红包、个人资料、群信息默认表单可一屏显示。
- 50 组任务验证局部队列滚动。更多内容、展开高级项、低高度窗口不强制塞入一屏，不裁剪操作或错误。

证据目录：`C:/Users/Administrator/Documents/test/outputs/workspace-density/`。组件行为、31 项单测、27 项工作页检查及真实 PNG/ZIP 回归通过；未部署线上，未使用真实账号和支付接口。

## 2026-09-20 预览尺寸、屏幕尺寸与消息音效

聊天工作页的预览弹层按「预览显示 / 屏幕尺寸 / 图片大小」三段组织：上面管「看得多大」，中间管「导出多少像素」，下面管聊天内容里的图片占多大（见下一节）。

预览显示把「自适应」从唯一行为改成默认档位之一，并新增手动尺寸：

- `WorkspacePanels` 用 ResizeObserver 量出的宽度只作为 `auto` 档使用；选中固定档位后不再受面板宽度影响。
- 档位为 自适应 / 小 320 / 标准 375 / 大 430 / 超大 500 / 自定义（200–720px，步进 10）。宽度与高度换算成 `--workspace-phone-width` / `--workspace-phone-height` / `--workspace-phone-scale` 三个 CSS 变量。
- 显示尺寸只影响观感，成片像素由下面的屏幕尺寸决定，两者互不干扰。

### 屏幕尺寸（导出分辨率）

- 预设 1080×1920 / 1080×2340 / 1125×2436 / 1170×2532 / 1290×2796 / 1440×3120，另有自定义宽高（720–2400 × 1280–4000）。**高度至少是宽度的 1.3 倍**：内部坐标系里上下两条固定栏要占 533px，再扁下去聊天区会被挤没。
- **内部坐标系宽度恒为 1125**（`PhonePreview.css` 上千个尺寸都按这个宽度调过），屏幕尺寸只决定它的高度与导出采样倍率，即 `designHeightFor()` 与 `outputScaleFor()`。`.wc-phone` 的高度改由 `--wc-phone-design-height` 注入，未注入时仍是 2436px。
- `captureChatPhone(phone, longshot, screen)` 用 `canvasWidth/canvasHeight` 让输出正好等于屏幕尺寸：**非长截图的导出像素 = 屏幕尺寸本身**（坐标系高度是取整过的，乘回去会差 1px，所以不这么做）；长截图宽度不变、高度按同一倍率换算。屏幕比 1125 宽时提高栅格化密度，而不是把 1125 的图放大。
- 视频帧按同样的屏幕尺寸渲染，`VideoExportDialog` 的画面尺寸新增「跟随屏幕」档；与屏幕一致时即为满屏导出，不一致时按 `fitRect` 居中留边。
- 不传 `screen` 的工作区（场景 / 朋友圈 / 批量）行为完全不变，批量导出仍是 1125×2436，`scripts/batch-*-smoke.mjs` 的尺寸断言继续成立。

消息音效由「一个音量开关 + 仅接收/每条」改为「收到」与「发送」两个独立开关，两者音色不同：

- `received`：两声「叮咚」，`sent`：一声「咻」；都在 `src/lib/notify-sound.ts` 里用 Web Audio 实时合成，不引入第三方音频文件。具体取音见下面「对齐微信提示音」一节。
- 时间轴的 `notify` 字段由布尔值改为 `NotifyKind | null`，`notifyEvents()` 同时给出时刻与音效类型，预览播放和视频录制共用这一份排期。
- 上传的自定义音频只替换「收到」那一声，发送音效始终用内置合成音，避免两者混成同一个声音（`customSoundReplaces()` 覆盖该规则）。

## 2026-09-20 导入复用头像与微信风格提示音

重新解析聊天记录时不再清空用户上传的头像与指定的「自己」。

- **头像按名字复用，不按 id。** 每次 `parseChatRecord` 都从 1 重新编号，id 不稳定；解析器对同一份记录里的同名发送者只建一个用户，所以名字才是身份。规则集中在 `src/lib/user-avatars.ts`：`carryOverAvatars()` 先按名字取旧头像（归一化后比较，容忍首尾空白与大小写），名字是「我」时改用原来「自己」那张；用户自带的头像优先，不会被覆盖。`carryOverSelfId()` 按名字找回原来那位「自己」，找不到（换了另一段对话）才退回解析器的默认——第一个发言者。**归档比当前编辑状态活得久**：同样的按名字认人，长期那一份存在 `src/lib/avatar-presets.ts`（见「用过的头像」一节）。
- `batch.ts` 的 `chatSnapshot()` 原本内联了同一套规则，现已改为调用这两个函数，单聊导入与批量导出共用一个实现。`batch.test.ts` 里「reuse same-name avatars」那条继续通过，等于给这次抽取加了回归保护。
- 唯一会主动写 `avatar: null` 的地方是「移除自定义头像」按钮（`handleRemoveAvatar`，用户显式操作）；解析器产出的 `avatar: null` 只是新建用户的初始值，由上面的规则负责补齐。

内置提示音由纯正弦升级为加法合成，听感贴近微信的收发音：

- 新增 `NotifyPartial` 泛音列：接收音的每一声都是基音 + 2 / 3 / 4.76 倍泛音。4.76 是刻意取的非整数倍，用来做出敲击的金属光泽；增益依次减半，衰减系数依次变小——**越高的泛音收得越快**，这是敲击音与和弦的分水岭，调音时最容易改坏（`notify-sound.test.ts` 有断言守着）。
- `NotifyWhoosh`：白噪声经带通滤波扫频，做出「咻」的气流声。噪声缓冲区按采样率缓存复用，不每次重算。
- 发送音 = 气流声 + 一个快速下滑音，只堆气流会听成一阵风，垫下滑音才听成「发出去了一条」。
- 依然**不打包任何第三方音频文件**：微信那段音频属于第三方，嵌进产物有版权风险。想要原声走「我的音频」上传。

#### 对齐微信提示音（2026-09-20 调音）

起因是「收发提示音要改成和微信一致」。这里有个绕不开的前提：**合成的只能逼近，不可能与原始录音逐样本一致**——原始音频是第三方的，项目不打包（见上一条）。所以做的是按公开资料把听感往微信那一声上调，并把「换原声」的口子留好。

调音依据（是公开描述，不是原始录音的频谱，因此只落在保守的区间上）：

- 微信官方口径反复形容这声是「圆润柔和」「温润通透」「不刺耳」，并有「和谐大三度音程」的说法；第三方对同一体系做的声学报告给的能量集中在 800 Hz–2.5 kHz。
- 「叮咚」这个名字本身就是**高→低**；iOS 上微信长期沿用系统 Tri-tone，也是下行。所以保留两声下行，而不是改成上行的三音。
- 旧值是 1318.51 → 987.77 Hz 的**正四度**，又高又亮，听感更像电子门铃。

改动：

- 接收音改为 **987.77 → 783.99 Hz（B5 → G5）的下行大三度**，间隔 110ms，第二声留 430ms 让有余韵；最上面那条非整数泛音从 0.07 压到 0.05、衰减从 0.26 收到 0.22，木质感更重、玻璃感更轻。
- 发送音收紧到 130ms，带通从 2200 扫到 760 Hz，下滑音 1650 → 1050 Hz——更短更干脆，和接收音离得更开。
- `notifySoundDurationMs.received` 480 → 580（必须盖住最后一个音的收声时刻，否则 `playNotify` 会在尾巴上把节点 `stop()` 掉；测试里有这条断言）。

`notify-sound.test.ts` 新增一条把上述意图钉住的用例：高→低、频率比近似大三度（±0.01）、两声都低于 1100 Hz、间隔小于 200ms。**以后谁改音高，只要破坏了「微信那一声」的听感特征，这条会先红。**

备注：本机既没有浏览器也没有耳朵可用，所以另做了一次**调度层核查**——用记账式 Web Audio 桩跑真实的 `createNotifyPlayer`，把排下去的振荡器频率、增益斜坡、滤波扫频逐条断言（8 个振荡器 = 2 声 × 4 条泛音、泛音是基音的 1/2/3/4.76 倍、第二声晚 110ms 起音、**没有任何指数斜坡指向 0**——那会让浏览器直接抛错）。这只能证明「排期正确、不会炸」，好不好听得靠人耳。

## 2026-09-20 图片消息大小与视频结尾留白

### 图片消息大小

图片消息此前固定 `max-width / max-height: 420px`（`PhonePreview.css`），长图和主图会显得偏小。现在改为可调：

- 档位 小 300 / 标准 420 / 大 540 / 超大 700（**内部坐标系 px**，不是导出像素），另有自定义最长边 160–700。计算集中在 `src/lib/image-size.ts`，弹层只维护档位与草稿。
- **上限 700px 是被 CSS 卡出来的**，不是随手定的：`.wc-chat-content` 左右各 36px 内边距、`.wc-body` 的 max-width 减 340px，所以在 1125 的坐标系里气泡最宽 `1125 − 36×2 − 340 = 713px`，再减去图片气泡 1px 的双边边框只剩 711px。`image-size.test.ts` 有一条断言守着这个跨文件不变量。**字号放大时这个可用宽度会跟着收窄**（见「对话字体大小」一节），所以图片与红包的上限额外与 `--wc-body-max` 取了一次 min。
- 取值存进 `PhoneSettings.imageMax`，由 `PhonePreview` 注入 `--wc-image-max`。所以预览、单图导出、长截图、视频帧、批量导出拿到的是**同一个值**，导出链路（`captureChatPhone` / `renderChatFrames` / `batch.ts`）一行都不用改。
- 图片按最长边等比缩放，不改比例。空图片占位框按同一比例缩放，否则选了「超大」后占位框还是原来 300×240，看着像没生效。
- 旧项目与老分享链接没有这个字段，读取时由 `normalizeImageMax()` 退回默认 420；`sanitizeSettings()` 会把分享链接里的值夹进合法范围。

### 视频结尾留白 3 秒

`playbackTailMs` 由 1600 改为 3000。预览播放与视频导出共用同一条时间线，只改这一处两边同步：导出视频的最后一帧停留 3 秒，手动录屏也留出按停止键的余量。`chat-playback.test.ts` 直接断言 `playbackTailMs === 3000`，并检查最后一帧在整段留白里都保持可见。

### 弹层里的档位是本地状态

预览弹层内的档位（窗口大小 / 屏幕尺寸 / 图片大小）都是**本地 state，按打开时传入的 props 初始化**，不做额外的同步 effect。依据是 `Popover.Portal` 默认 `keepMounted=false`（`node_modules/@base-ui/react/popover/portal/PopoverPortal.js`：`shouldRender = mounted || keepMounted`，关闭即 `return null`），弹层关闭会卸载整棵子树，重新打开时自然是新值；而切项目、套模板这类会换掉 `settings` 的操作都发生在弹层之外，点击时会先把弹层关掉。这样也绕开了 `react-hooks/set-state-in-effect`（在 effect 里同步 setState 会被判定为级联渲染）。

## 2026-09-20 素材库（头像 / 表情图片 / 背景图）

上传过的头像、表情图片和背景图不再是一次性的：它们会存进这台浏览器的素材库，下次直接点选复用。

### 分层

- `src/lib/media-library.ts`：纯逻辑，不碰存储也不碰 DOM——去重、分类、上限收录、批量分配头像、体积统计都在这里，`media-library.test.ts` 全部覆盖。
- `src/lib/image-file.ts`：读文件与压缩（`readImageFile`），其中 `scaledImageSize` / `needsReencode` / `encodeMimeType` 是纯函数，另有单测。
- `src/lib/project-store.ts`：IndexedDB。**数据库版本 3 → 4** 新增 `media-assets` store（keyPath `id`，索引 `kind`），**4 → 5** 再加 `avatar-presets` store（keyPath `id`，见下一节）。升版本号时必须在这里把新 store 一起建出来，否则老用户升级上来会打开一个缺 store 的库，读它直接抛错。写入走增量 `putMediaAssets()`，不整库重写（恢复一次几十张、每张几百 KB 的库全量重写会明显卡顿）；`store.count()` 只是用来等事务提交的收尾请求。
- `src/components/MediaLibraryDialog.tsx`：弹窗（批量上传 / 选取 / 改名 / 删除）与编辑区快捷条 `MediaLibraryStrip`。

### 规则

- **去重按 data URL**：同一个文件读出来必然一模一样，所以 data URL 本身就是唯一键。重复上传只留一条，弹窗回执会说明跳过了几张。
- **只增不删**：曾经按「最久没用过」自动淘汰超上限的素材，用户攒的头像会莫名其妙少几张，还查不出是谁删的，这条规则整个去掉了。现在 `maxAssetsPerKind`（每类 2000 张）只用来**拒收**新图：额度用完就是这一批多出来的收不下，`addMediaAssets()` 如实返回 `rejected` 张数转成回执，**库里已有的素材一张都不会被自动清掉**。删除只有两个入口，都在用户手里：素材库列表的删除按钮，和「用过的头像」里的删除按钮。
- 两套排序各管一件事：网格用 `createdAt` 倒序（列表稳定，点选时不会在光标底下跳）；快捷条用 `usedAt` 倒序（最近用过的靠前）。
- **按最长边 1280px 预压**：素材库存的是 data URL，手机照片 3–5 MB 会让浏览器存储很快见底，而聊天里图片最宽只显示到内坐标系 700px（导出 2K 时约 896px）、头像更小。GIF / SVG 与本来就很小的图原样保留，避免二次压缩丢动画、丢矢量、磨画质。
- 素材库独立于项目：换项目、重新导入、清空编辑器都不影响它，所以 App 单独加载一次，不入 `ChatProjectSnapshot`。
- 头像与图片消息用的是**素材库里那份 data URL 的副本**，所以删素材不会把已经用上的头像或图片从对话里抹掉。
- 存储不可用（隐私模式 / 禁用本地存储 / 读库失败）时，素材库入口整体隐藏，但上传与导出照常——只是留不到下次，App 会跳过落库而不再报错。

### 入口

- 「角色头像」：每张卡片有「素材库」按钮换现成头像；面板顶部「批量上传头像」按选择顺序覆盖前 N 位角色；单文件上传（点卡片头像）同样会入库。面板下半部分是用过的头像归档（见下一节）。
- 「聊天内容 → 添加消息 → 图片」：图片下方是最近用过的素材快捷条，点一张即设为待添加的图片；「上传 / 管理」打开完整弹窗。
- 预览里点图片消息气泡：打开素材库选一张，弹窗里也能现传；只传一张时直接换上，省掉再点一次「使用」。
- 弹窗按「为什么打开」给出不同标题与按钮文案（设为头像 / 用作背景 / 使用），换类目时会清掉旧目标（某位角色 / 某条消息 / 某处背景）。
- 弹窗拆成内外两层：`Dialog.Popup` 关闭会卸载整棵子树，`busy` / 回执 / 改名草稿这些临时状态随之消失，不需要额外 effect 清空（同上一条弹层约定）。
- 「手机样式 → 聊天背景」与「朋友圈 → 发布身份 → 朋友圈背景」各有一行与表情图同样的快捷条，点一张直接换上去；「上传 / 管理」打开完整弹窗。两处的上传都走同一条入库链路，详见下一节。

## 2026-09-20 用过的头像（按角色名归档）

需求是「我用过的头像都要保留，不要每次导入聊天记录就删掉；导入时遇到同名角色自动匹配，否则新建一条；这些记录要能手动删除和重命名」。要做到这一点，光靠素材库不够：素材库按文件名叫「头像」，而用户记的是「这张脸是给谁的」。

### 为什么单开一份归档

项目里的 `users` 是 `parseChatRecord` 的产物，**换一段聊天记录、开一份别的草稿，整份数组就被替换掉了**，之前给某个角色配的头像跟着消失。所以另存一份以「角色名」为键的归档，和素材库一样独立于项目。

- `src/lib/avatar-presets.ts`：纯逻辑，`avatar-presets.test.ts` 全部覆盖。
- **归档 id 由角色名推导**（`avatarPresetId(name)` → `avatar-preset:<归一化名字>`）：名字是唯一键，id 跟着走就不会出现「同一个名字存了两条」。重复渲染、严格模式跑两遍 effect 都只是把同一条写第二遍；删掉的那条也不会因为库里还留着同名的另一条而复活。
- **改名必须连主键一起换**（`renameAvatarPreset()`）。这是最容易埋雷的一处：如果只改 `name` 而留着旧 id，等旧名字（比如「小林」）以后被重新导入的角色用上时，`upsertAvatarPreset()` 会照旧推出主键 `avatar-preset:小林`，和那条改过名的记录撞同一个键，写库时直接把它覆盖掉。换键之后 `id === avatar-preset:<名字>` 这个不变量一直成立。改名到别人已经占着的名字上**拒绝而不是合并**（返回 `error`），免得把另一条的头像悄悄吃掉；只差空白或大小写视作没改，返回 `preset: null` 让调用方跳过写库。`cleanAvatarName()` 统一做「去首尾空白 + 压内部连续空白 + 截 60 字」，改名与 upsert 共用，免得显示的名字和认人用的键不一致。
- **只增不删**：`upsertAvatarPreset()` 在头像没变时原样返回 `{ list, preset: null }`，调用方据此跳过写库——否则每次渲染都算一次改动，会白白写一遍 IndexedDB。`rememberUserAvatars()` / `applyPresetsToUsers()` 都只在真有改动时才返回新数组。
- 取消某位角色的头像（卡片上的 ✕）、换一张新的、角色离开对话，**都不动归档**；只有面板里的改名与删除按钮会动一条，物理删除走 `deleteAvatarPresetRecord()`。
- 头像是 data URL 的副本，和素材库那份一样：删归档里的一条不会把已经用上的头像从对话里抹掉。

### 接线

- App 单独加载一次归档（`loadAvatarPresets()`，与素材库各读各的，一边失败不拖累另一边）。
- **一个只增不删的同步 effect**：`users` 一变就把「角色名 + 头像」写进归档。上传、批量上传、从素材库选、重新导入补回来的头像走的都是这条，不必在每个入口各记一次。
- `handleImport` 里，`carryOverAvatars()`（认当前编辑状态）之后再过一道 `applyPresetsToUsers()`（认归档）：换过草稿、换过聊天记录时，上一段对话里根本没有的角色也能从归档里找回自己的头像。回执会分开说明「已沿用 N 个头像」与「其中 M 个来自用过的头像」。
- 面板里每条能做三件事：「用上」把头像还给同名的那位角色（角色不在当前对话里就只标「仅保存」，不做别的）；铅笔进入行内改名（Enter 提交、Escape 取消，重名或空名会提示并把输入框留在原地，不用重新点一次）；垃圾桶删掉这一条。
- 改名有个能预期的副作用：如果旧名字此刻还挂在当前对话的某位角色身上，同步 effect 会照旧给它记一条（那位角色确实还在用这张头像）。`handleRenamePreset` 会检测到这点并在提示里说明，免得用户以为改名生出了一条重复记录。

## 2026-09-20 对话字体大小

需求是「内容多的时候想一屏看到更多，把字体调小一点」。所以这里调整的不是一个字号，而是一整套排版度量。

### 一个系数管一整套度量

- `--wc-font-scale`（由 `PhonePreview` 注入，取值为 70–140 的百分比除以 100）乘在 `PhonePreview.css` 里所有**属于聊天内容**的度量上：气泡字号与内边距、行高（无单位，天然跟随）、头像尺寸与圆角、头像与气泡的间距、消息之间的留白、昵称与时间戳字号、语音条与红包内部的比例。
- **只改字号是不够的**：气泡的 `padding: 28px 38px` 加一行 48px × 1.4 的文字恰好凑出 123px，与头像的 123px 齐平；只缩字号的话框还是原来那么大，一屏多放不下几条，看着也像「字小了、框空了」。所以整套度量一起缩，比例关系保持不变。
- **手机外壳不缩放**：状态栏、导航栏、底部输入栏（`.wc-status-bar` / `.wc-nav` / `.wc-bottom`）与「对话内容」无关；聊天区高度（`top: 264px / bottom: 269px`）也不变——正是这个固定高度配上更小的字号，才换来一屏能放下更多内容。
- 系数为 100% 时所有 `calc(Npx * 1)` 的结果与改动前的字面值完全一致，老草稿打开后一个像素都不变。

### 放大时会挤窄气泡，所以宽度也要跟着收

- `.wc-body` 的 `max-width` 改由 `--wc-body-max` 给出，而这个值**由 JS 计算并注入**（`bubbleMaxWidth(scale)`，`src/lib/font-size.ts`），CSS 不再自己写 `calc(100% - 340px)`。理由是它同时被 `.wc-body`、图片的 `max-width`、红包与语音条宽度引用，写在 JS 里能用单测守住，写四遍 `calc` 一定会走偏（另外 340 并不是两侧 margin 之和 300，CSS 里另留了 40px 余量，别按 margin 反推）。
- 100% 时它等于 713px（`1125 − 36×2 − 340`），与 `image-size.ts` 里「图片上限 700 是被 CSS 卡出来的」是同一个数。字号放大到 140% 时缩到 548px，所以 `.wc-bubble-image img`、`.wc-bubble-redpacket / -transfer`、`.wc-voice-stack`、`.wc-voice-transcript` 的上限都写成 `min(原上限, var(--wc-body-max, 713px))`——不收窄的话图片会被 `overflow: hidden` 裁掉一块，红包会顶出屏幕。
- 语音条宽度是按秒数算出来的内联样式（`180 + min(时长 × 30, 400)`），一并改成 `calc(Npx * var(--wc-font-scale, 1))`，否则「紧凑」档下语音条还是原来那么长。

### 与图片大小、屏幕尺寸的关系

- 取值存进 `PhoneSettings.fontScale`（百分比整数），和 `imageMax` 一样由 `PhonePreview` 注入 CSS 变量，所以**预览 / 单图导出 / 长截图 / 视频帧 / 批量导出用的是同一个值**，导出链路一行没改。
- 单位是内部坐标系 px，与导出分辨率（屏幕尺寸）无关：换分辨率时字号占屏幕的比例不变。
- 新增字段要同步 `App.tsx` 的 `defaultSettings`、`share-link.ts` 的 `sanitizeSettings`，以及 `project-store.test.ts` / `share-link.test.ts` / `WechatPhoneChrome.tsx` 三处字面量；旧项目缺字段由 `normalizeFontScale()` 兜底。
- 档位：紧凑 80 / 偏小 90 / 标准 100 / 偏大 115 / 特大 130，自定义 70–140。真值域在 `clampFontScale` / `normalizeFontScale` / `fontScaleRatio` 里收口，`font-size.test.ts` 9 条断言覆盖（含「100% 时气泡可用宽度恰为 713」这条跨文件不变量）。

## 2026-09-20 背景图进素材库

需求是「上传过的背景图，也要保存到素材库，和头像、表情包一样，支持从素材库选」。背景图此前是**一次性**的：`settings.backgroundImage` 与朋友圈草稿的 `coverImage` 各存一份 data URL，换项目、换草稿就得重传，而且与素材库毫无关系。

### 加一个类目，而不是新开一套存储

- `MediaKind` 增加 `background`，`mediaKinds` / `mediaKindLabels`（背景图）/ `mediaKindUnits`（张背景）跟着补。存储层一行没改：`media-assets` 本来就是按 `kind` 分区的通用 store，**不需要再升数据库版本**（上一节说过，升版本只为新建 store）。
- `isMediaKind()` 是入库与读库两条路径共用的白名单。放宽它，旧库里本来就有的记录才能被认出来；反过来，认不出的 `kind` 记录照旧丢弃——`media-library.test.ts` 里有一条断言专门守着这个边界。
- 上限按类目各算各的：背景图满了不影响头像，回执照旧如实说明几张没进来。
- `MediaLibrarySummary` 顺手从 `{ avatar, sticker, total, bytes }` 改成 `counts: Record<MediaKind, number>`，`mediaLibrarySummaryLabel()` 遍历 `mediaKinds` 拼文案。原来的写法每加一个类目就要回来补两处，正是这次差点漏掉的地方。

### 两处背景共用一个上传入口

- `uploadBackgroundFile()`（App）就是背景版的 `uploadImageFile()`：读图 → 入库 → 返回 data URL。聊天背景（`SettingsPanel`）与朋友圈封面（`MomentsEditor`）都传它，所以「传一次，两处都能从库里选」。
- 入库失败只可能是这一类到上限，这时会提示一句但仍返回 data URL——**本次照样用得上**，只是留不到下次，与素材库不可用时的降级口径一致（单张正常入库不打扰，免得每传一次图弹一条没用的提示）。
- 两个面板都不直接依赖素材库状态：`onUploadBackground` / `onUploadCover` 不传就退回本地 `FileReader`，所以 `BatchStudio` 复用 `SettingsPanel` 时不需要知道素材库的存在（那里的背景图跟着批量项目走）。
- 素材库不可用时 `onOpenBackgroundLibrary` / `onPickCover` 传 `undefined`，`MediaLibraryStrip` 自己会渲染成 `null` ——入口整体隐藏，而不是留一个点进去空手而归的按钮。

### 弹窗仍然只有一个实例

朋友圈封面在 `MomentsEditor` 的草稿里，弹窗在 App 里。为了不复制出第二个 `MediaLibraryDialog`，「选一张封面」用一次性的 Promise 接：`pickMomentCover()` 把 resolver 存进 `pendingBackgroundPick` 再打开弹窗，选中时兑现成 data URL。

- 关掉弹窗没选东西，也必须兑现 `null` —— 否则调用方那个 `await` 永远挂着，之后再选一次也不会生效。所以关闭统一走 `closeLibraryPicker()`，它会先取出 resolver 再关。
- 连点两次时先兑现上一个（`pendingBackgroundPick.current?.(null)`），同一时刻只留一个等待者。
- 兑现前先把 ref 清空，这样 App 自己调 `closeLibraryPicker()` 时不会重复兑现一次（base-ui 在受控 `open` 变 false 时也可能回调 `onOpenChange`）。
- 另一条路是**不上弹窗也能直选**：快捷条里点缩略图，`SettingsPanel` / `MomentsEditor` 直接写进 `settings` / `draft`，再调 `onBackgroundUsed` 记一次使用，让它排到快捷条最前面。只有走弹窗那条才会经过 Promise。

### 行为变化

- 背景图现在与其它素材一样**按最长边 1280px 预压**（此前聊天背景是原样存 8MB 的原始文件）。预览用的手机宽度按 500px、导出 2K 计约 1000px，1280 仍有余量，体积却能降一个数量级。
- 背景图同样受「每类 2000 张」上限约束，且**不会被自动清除**。
- 「删素材不会影响已经用上的头像与图片」这句现在也包含背景图：用上去的是副本。

## 2026-09-20 添加消息写回聊天记录文本

### 问题

「聊天内容」页有两个入口：上面的导入框（`importText`）和下面的「添加消息」面板（直接往 `messages` 里塞）。文本是**唯一能改到内容的地方**——预览里点文字气泡没有任何反应，图片气泡也只支持换图。于是从面板加进去的消息只活在内存里：改不了，而且下一次点「解析并导入」，整份对话会按文本重建，这条消息连同它的改动一起消失。

### 做法：写回，而不是再开一套编辑界面

- `parser.ts` 新增 `messageToRecordLine(msg, senderName)`：把一条消息还原成记录文本的一行。规则与文件顶部那组解析正则一一对应，所以「写回文本 → 再解析」拿到的是同一条消息；`parser.test.ts` 有一条来回走的用例把这件事钉住。
- `parser.ts` 新增 `appendMessageToRecord(text, msg, senderName)`：先削掉原文本末尾的空白，空文本就直接用这一行，免得连点几次「添加」在文本里堆出一串空行。
- `App.tsx` 的 `handleAddMessage` 在写入 `messages` 的同时把这一行追加进 `importText`。发送人名字按 `senderId` 从 `users` 取（此时 `users` 一定有值，否则「添加消息」面板根本不渲染）。
- 文本框下方补了一句说明，讲清「新加的消息会追加到这段文本、改完点解析并导入即重建」。

### 三个刻意的取舍

- **换行压成一行**：解析按行切分，文本消息里带换行会让这一条被拆成两条，所以写回时把换行换成空格。
- **图片只写 `[图片]` 标记**：本地图片是几十万字符的 data URL，塞进输入框会直接卡死；带 http(s) 地址的图仍按原样写地址。代价是重新解析后图片回到占位状态，需要在预览里点一下从素材库再选一张——这一步本来就有，且素材库现在是持久的。
- **顺带修了转账的解析**：改成只按第一个冒号切分，「`[转账]88:还你的，备注：带冒号`」不再把备注截断成「还你的」；否则写回再解析就不等于原消息了。

### 边界

文本与 `messages` 仍是两份状态。删除某条消息的做法是：在文本框里删掉对应那行，再点「解析并导入」。面板加消息走的是同一条链路，所以顺序与内容都对得上。

## 2026-09-20 音效库（自定义提示音）

需求是「上传过的节奏音效要留起来，能自己选、能改名、能手动删除，和头像表情包一样」。此前自定义提示音只存在当前页面的 `customSound` 状态里（`AudioBuffer` 不可序列化），刷新、换对话就丢，也没有管理入口。

### 存储：audio data URL，而不是 image data URL

音效是音频不是图片，所以新开一个 `sound-assets` store（数据库版本 5 → 6），而不是塞进 `media-assets`（那里按 `kind` 分区、且只认 `data:image/`）。

- `src/lib/sound-library.ts`：纯逻辑，`SoundAsset` 含 `dataUrl`（`data:audio/...;base64`）、`durationSeconds`、`bytes`，配套 `createSoundAsset` / `normalizeSoundLibrary`（按 dataUrl 去重）/ `addSoundAssets`（每类上限 `maxSoundAssets = 2000`，只拒收不清旧）/ `touchSoundAsset` / `renameSoundAsset` / `removeSoundAsset` / `soundAssetMeta`。`sound-library.test.ts` 12 条断言全部覆盖。
- 音频比图片大，但提示音通常只有几百 KB，且上传入口本来就限 4 MB，data URL 存 IndexedDB 与现有素材库口径一致。
- 音频解码仍走 `notify-sound.ts` 的 `loadNotifySoundFile()`：上传时 decode 一次拿时长，选用时从 data URL 还原成 Blob 再 decode 成 `AudioBuffer` 填进 `customSound`。

### 弹窗：SoundLibraryDialog

`src/components/SoundLibraryDialog.tsx`，复用 `MediaLibraryDialog` 的样式类（音频没有图片，缩略图用音符图标占位）。入口在视频导出弹窗「我的音频」音源那一行：「音效库（N）」按钮，只在浏览器存储可用时显示。

- `onUpload`：外层 App 负责「FileReader 转 data URL → decode 取时长 → createSoundAsset → 入库」，返回落库后的名字用于回执。
- `onPick`：选中后 decode 填 `customSound`，并 `touchSoundAsset` 记一次使用，然后关弹窗。
- 改名、删除与素材库同款：行内 `Input` 改名（Enter 提交 / Escape 取消），`putSoundAssets` / `deleteSoundAssetRecord` 增量写库。

### 行为变化

- 自定义提示音现在跨会话持久：换对话、刷新、重新导入都不丢，从「音效库」点一下就能再用。
- 「发送音效始终用内置合成音」这条规则不变：选中的音效只替换「收到消息」那一声（`customSoundReplaces` 仍是 `received` 专属）。
- 音效库独立于项目，和素材库、头像归档一样在 App 里单独加载一次，一边失败不拖累另一边；存储不可用时入口整体隐藏，但「选择音频」这个一次性上传仍照常可用。

## 2026-09-20 收发提示音都可替换 + 预览音效替换

需求是「收发消息音效都可以选择上传的音效，音效上传以后要保存下来，可手动删除改名，预览时的节奏音效也要能支持替换」。上一节的音效库已经覆盖「保存 / 改名 / 删除」，这一轮把「只能替换收到那一声」的限制拆掉，并让预览播放条也能直接选音效。

### 逻辑层：按类各自替换（notify-sound.ts）

- `NotifyPlayerOptions.buffer` 升级为 `buffers?: Partial<Record<NotifyKind, AudioBuffer | null>>`：给了哪类就替换哪类，没给的退回内置合成音。旧的 `buffer` 字段保留为兼容别名（等价 `buffers.received`），由 `resolveCustomBuffers()` 归并，新旧同时给时新的优先。
- `customSoundReplaces(kind, buffers)` 语义随之从「received 专属」改为「这一类给没给」；`chat-video-recorder` 的 `ChatVideoAudioOptions.buffer` 同步改为 `buffers`。

### 状态：customSound → customSounds（App.tsx）

`customSounds: { received: CustomSoundEntry | null; sent: CustomSoundEntry | null }`，每条带 `id?` 指回音效库记录：

- 选用（`handlePickSound`）：按 `soundPickTarget`（received / sent）填进对应那一条，`AudioBuffer` 由音效库的 data URL 现场解码。
- 删除（`handleRemoveSound`）：正在用的那条被删时，对应提示音退回内置合成音，不留播不出来的 buffer。
- 改名（`handleRenameSound`）：正在用的那条改名时，界面上的「已选：xxx」同步更新。
- 预览播放与视频导出走同一份 `customSounds`，`soundSource === 'custom'` 时收/发各自替换。

### 入口：预览播放条 + 视频导出弹窗

- `ChatPlaybackBar`（预览侧）折叠面板新增「音源」段控（内置 / 我的音频）；选「我的音频」后，「收到」「发送」两行的说明文字各变成一个选音效按钮（显示当前音效名，点击打开音效库，挑给对应那一声）。
- `VideoExportDialog` 的提示音区改为按收/发两行各给「选择音频 / 更换」+「音效库」按钮（`SoundKindActions`），隐藏 file input 用 `fileKindRef` 记住这次传给谁；哪一类开了开关又选了「我的音频」但没挑音频，才阻止生成（`customReady`）。
- `SoundLibraryDialog` 增加 `pickTargetLabel`，弹窗说明会写明「这次选中的音效会替换『收到/发送消息』那一声」。

### 行为变化

- 「发送音效始终用内置合成音」的旧规则废止：现在发送那一声也可以换成自己的音频；没选的那类仍自动退回内置合成音，收发不会混成同一个声音。
- 预览播放（定时发送）现在与导出视频用同一套自定义音源，录屏听感一致。
- 单测从 189 增至 190：`customSoundReplaces` 按新语义重写，另加 `resolveCustomBuffers` 的新旧入参归并用例。

## 2026-09-21 昵称记忆（输入过的名字直接点选）

需求：昵称输入过一次之后要能缓存下来，下次直接选，不用重打。

### 为什么单开一份「名字历史」，而不是从现有数据推导

- `users`（聊天角色）是解析聊天记录的结果：换一段记录整份被替换，而且那里的名字来自导入文本、不是用户敲的。
- 头像归档（`avatar-presets`）只记住**配过头像**的名字，朋友圈的评论人、场景页的收款方都不在里面。

所以需要一个只装名字的通用历史，四个工具的输入处共用：`SettingsPanel` 的聊天标题、`MomentsEditor` 的昵称 / 评论人 / 点赞用户、`WechatSceneEditor` 的 `names` 字段、`UserAvatarManager` 的头像归档改名。另外 `App.tsx` 的 `handleImport` 会把解析出的角色名一并记进去（排除解析器给自己起的「我」），这样导入过一次之后，那些名字在朋友圈、场景页里都能直接点选。

### 分层与存储

- `src/lib/name-history.ts`：纯逻辑（测试友好）。`nameHistoryKey`（复用 `user-avatars` 的 `avatarNameKey`，与头像归档认人同一套归一化规则，免得「小林」「小林 」各占一格）、`cleanDisplayName`、`splitNameText`、`normalizeNameHistory`、`sortNameHistory`、`rememberNames`、`forgetName`；上限 `maxNameHistory = 100`。
- `src/lib/name-history-store.ts`：localStorage（键 `wechat-dialog-generator:name-history`）+ 订阅 + 快照，供 `useSyncExternalStore` 使用。**不跟着素材库走 IndexedDB**：这份数据就是几十个字符串，而它要在输入框旁边同步渲染出筹码行，IndexedDB 的异步读取会先闪一帧空白。读写全部包 try/catch，隐私模式下退化成「只在本次会话有效」，不影响输入。
- `src/components/NameSuggest.tsx` + `NameSuggest.css`：筹码行。历史为空时返回 null（不占位），名字点一下回填 / 追加，右侧 × 从历史里删掉。

### 两条容易踩的规则

- **新记录的时间戳取「当前时刻」与「已有最新 + 1ms」的较大者**（`rememberNames` 里的 `base`）。否则调用方给同一时刻时（同一毫秒连记两个名字、系统时钟被往回拨），新名字会被塞到列表中间——单测「超出上限时丢掉最久没用过的」一开始就是这样挂掉的。
- **一格多人的输入，点筹码是追加而不是覆盖**：`members`（群成员昵称）与 `likes`（点赞用户）会先拆开现有值（`splitNameText`，中英文逗号 / 顿号 / 分号 / 换行都认），同名的跳过，再用「，」接上；单个名字的字段则直接回填。
- `rememberNames` 在「已经排最前、写法也没变」时**原数组返回**，调用方（store 的 `commit`）据此跳过写库与通知——输入框 blur 会频繁走到这里。

### 接入点

- `SettingsPanel`：聊天标题的输入框失焦时记录，下面一行筹码点选即改标题（`disabled` 的批量工作页里不显示）。
- `MomentsEditor`：昵称（失焦记录 + 点选回填）、评论人（同上，添加评论时也记一次）、点赞用户（点筹码**直接加进点赞列表**，不用再点「添加」）。
- `WechatSceneEditor`：`FieldDefinition` 新增 `names?: 'single' | 'multi'`，标在收款方 / 发送人 / 昵称 / 群聊名称（single）与成员昵称（multi）上；`multi` 的失焦记录会把整串拆开逐个记住。
- `UserAvatarManager`：给归档改名成功时才记入历史（重名被拒时不记），这里不加筹码行——改名要求名字唯一，铺一排在下面反而容易点出重名。改名的输入本来就可以直接用档案里已有的名字。

### 行为变化

- 单测从 190 增至 201：新增 `name-history.test.ts` 11 条（归一化去重、排序、上限淘汰、脏数据清洗、分隔符拆分等）。

## 2026-09-21 商品图（素材库第四个类目）

需求是「素材库除了头像、表情包、背景图，再加一栏商品图，功能和其他的一致」。母婴 / 带货内容里商品图会越攒越多，混在表情图片里找不着，所以单独一类。

### 加类目，不动存储

- `MediaKind` 增加 `product`，`mediaKinds` / `mediaKindLabels`（商品图）/ `mediaKindUnits`（张商品图）/ `isMediaKind()` 跟着补。分页控件（`MediaLibraryDialog` 的 `kindOptions`）、统计文案（`mediaLibrarySummaryLabel`）、上限与去重（`addMediaAssets`）全是从 `mediaKinds` 与 `counts: Record<MediaKind, number>` 推出来的，**存储层与弹窗组件一行没改**，`media-assets` store 也不必再升数据库版本（升版本只为新建 store）。
- 「功能一致」在代码里的落点是这三条共用规则：同一张图重复上传只留一条（按 data URL 去重）、每类各自 2000 张上限且只拒收不自动删、网格按 `createdAt` 倒序而快捷条按 `usedAt` 倒序。它们都在 `media-library.ts` 里，与类目数量无关。
- 旧记录不会被这次改动影响：`isMediaKind()` 是入库与读库共用的白名单，放宽它只影响认得出什么；认不出的 `kind` 照旧丢弃（`media-library.test.ts` 有断言守着）。

### 「能发进对话」是一个共用的判断

表情图片与商品图分两个类目只是为了好找，**用起来是同一件事**——往「图片」消息里塞一张图。所以这条规则收敛成 `imageMessageKinds` / `isImageMessageKind()` 一处：

- `MessageEditor` 的「图片」一栏改为遍历 `imageMessageKinds` 渲染快捷条，加类目时这里自动多一条，不用再写一个 `MediaLibraryStrip`。商品图通常比表情攒得多，快捷条给到 12 格（表情仍是 8 格）。
- `App` 里两条选图链路（`handlePickFromLibrary` 弹窗选取、`handleLibraryUpload` 弹窗内单张直传）原先是 `kind === 'sticker'` 硬编码，现在都改问 `isImageMessageKind()`，否则在商品图页签里选中的图会被静默忽略。
- 弹窗的 `onKindChange` 原先「换类目就清掉旧目标」，现在对表情图片与商品图**例外地保留目标**：来回切类目挑图时目标得留着，不然选完就不知道该发给哪条消息。

### 入口与边界

- 素材库弹窗多一个「商品图」页签：批量上传（多选 / 拖拽）、改名、删除、数量与体积统计都与其它三类一致。
- 「聊天内容 → 添加消息 → 图片」下多一行商品图快捷条，点一张即设为待添加的图片；「上传 / 管理」打开弹窗并停在该页签。
- 「选择图片」直接上传的散图仍入 `sticker` 类——那是一次性的随手传，不该反过来污染商品图货架；要归到商品图就在弹窗里传。
- 素材库的入口按钮文案由 `pickLabel` 决定，现在按目标细分：设为头像 / 用作背景 / 换这张（换某条消息的图）/ 用这张（放进待添加的图片）/ 使用。

### 行为变化

- 单测从 201 增至 204：`media-library.test.ts` 新增 3 条（类目标签与量词齐全、商品图独立上限与去重与快捷条、`imageMessageKinds` 判定），原有的容量统计断言改写为覆盖四个类目。

## 2026-09-21 设置记忆（我的偏好）

### 为什么单开一层

用户的原话是「我设置过的音效，选过的屏幕尺寸这些，每次导入新聊天内容不要给我复原，还继续用上次的」。
翻代码时发现「复原」有两个来源，都不在导入那一步：

1. **音效（节奏、提示音开关、音源、上次选的音效）、屏幕尺寸、视频画面与滚动时长、预览窗口宽度
   从来就没有被保存过**——它们只是 `App.tsx` 里的 `useState`，刷新页面就回到默认值。
2. **新建空白对话会把整套样式重置**（`resetEditor` 里 `setSettings(defaultSettings)`），
   而「新建后导入」正是最常用的流程。

所以做了一份跨项目、跨会话的偏好：`src/lib/workspace-prefs.ts`（纯逻辑）+ `workspace-prefs-store.ts`（落盘）。

### 存储：localStorage，且背景图单独一条

- 设置要在**首屏同步**拿出来。走 IndexedDB 的话每次打开都会先闪一帧产品默认样式（默认灰底、
  绿色气泡）再跳回你的配色，所以和昵称历史一样用 localStorage + 进程内缓存。
- **背景图单独存一条**（`...:prefs-background`）：它可能是几百 KB 到几 MB 的 data URL，
  而其余字段合起来才几百字节。混在一起写的话，拖动颜色选择器每动一下就同步写一次整块字符串；
  分开之后只有背景真的换了才写它。
- 写入前先 `workspacePrefsEqual` 比较（**固定字段顺序**再比，不同来源拼出来的对象键序可能不同，
  直接 stringify 会假报变化、每次渲染都写一遍存储）。
- 配额满或被禁时只留在内存里，并删掉旧记录，避免下次读回一份过期的设置。

### 语义：内容是「不带样式」的

这是这次改动里唯一需要判断的地方，结论是**样式不再跟着内容走**：

| 动作 | 样式来源 |
| --- | --- |
| 刷新页面 / 新建空白对话 / 导入新聊天内容 | 偏好 |
| 打开已保存的草稿 | 偏好（草稿只换内容，**不再携带样式**） |
| 套用同款模板链接 | 链接里的样式（显式的「套用」动作），缺的字段用偏好补 |

为什么打开草稿也不能用草稿里存的样式：**旧草稿里存的就是产品默认值**。照它渲染的结果就是
「一开草稿，我设好的配色字号全回默认」——正是用户抱怨的那个现象。项目快照里仍然照常保存整份
`settings`（同款分享链接要用它），只是打开草稿时不再读它当样式来源。

唯一跟着内容走的字段是**聊天标题**（`contactName`）：导入时按聊天记录里的角色名生成，
打开草稿时按那份草稿里存的标题恢复。它被排除在 `StylePrefs` 之外（`stylePrefsFromSettings`
用 `delete` 拿掉，以后给 `PhoneSettings` 加字段不用回来补一行）。

### 分区写入：两处各自管自己那一半

`patchWorkspacePrefs(patch)` 以当前快照为基准合并，所以两边先后写不会互相覆盖：

- `App.tsx` 的 effect 写 `style` 与 `playback`（它的状态就在那儿）；
- `WorkspacePanels.tsx` 的尺寸弹层写 `display`（窗口宽度档位与自定义值，状态在组件里）。

### 音效恢复为什么要等音效库就绪

偏好里存不下 `AudioBuffer`，只存了音效库的 id，所以要等 `loadSoundAssets()` 读完才知道那条还在不在，
之后再 `fetch(dataUrl)` → `decodeAudioData`（上下文此时是 suspended 也没关系，解码与状态无关）。
`App.tsx` 里用一个 `soundRestored` ref 标记「是否已经尝试过恢复」：**在它变真之前，
写偏好时不动 `soundIds`**——否则首屏那一次写入会把上次选的音效 id 抹掉。

顺带把「播放条上直接选文件」也接到同一条入库链路（原先那条只作用于当前页面，下次就找不到了）。
同一段音频传两次仍只留一条，并复用原记录的 id，偏好才指得准。

### 行为变化

- `App.tsx` 里的 `defaultSettings` 字面量删掉了，默认值收敛到 `workspace-prefs.ts` 的
  `defaultStylePrefs` / `defaultPhoneSettings`（改默认值只改这一处）。
- 单测从 204 增至 211：新增 `workspace-prefs.test.ts` 7 条（默认值单一来源与不可被污染、
  标题不进偏好、脏数据逐字段兜底、缺字段互不影响、键序无关的比较、偏好与设置互转）。

## 2026-09-21 批量聊天图对齐聊天生成器

需求：「批量聊天图中，也加一下这两天在聊天生成器里添加的那些功能。」

### 先查缺口，再动手

批量页与聊天页**用的是同一批组件**，缺的不是功能而是**接线**：`BatchStudio.tsx` 调用
`UserAvatarManager` / `PhonePreview` / `SettingsPanel` / `WorkspacePanels` 时只传了必填 props，
而这些组件的新入口全部是**可选 prop**——不传就等于关闭。逐项对完之后，真正要写的只有三类：

1. 素材库（整块没接）：头像与图片的选取、上传入库、用过的头像归档、聊天背景管理、弹窗本体。
2. 尺寸入口：`WorkspacePanels` 的「屏幕尺寸 / 图片大小 / 字体大小」三段。
3. 昵称记忆：批量页自己的「聊天名称」输入框、以及导入时记角色名。

已经自动跟着走的**不用动**：解析规则（转账备注含冒号、时间消息）与头像按名字复用——
批量页走的是同一套 `parseChatRecord` / `carryOverAvatars`。

### 素材库：目标留在批量页，数据与写库动作留在 App

`App.tsx` 里那份 `libraryPicker` 的目标是**聊天页的 state**（`setUsers` / `setSettings` /
`setDraftImage`），搬到批量页会很别扭：批量的目标是「第几组的第几条消息 / 哪一位角色 / 哪一组的背景」。
所以拆成两层：

- **App 提供数据与跨页共用的写库动作**：`mediaAssets` / `libraryReady` / `onImportMedia` /
  `onMarkAssetUsed` / `onRemoveAsset` / `onRenameAsset`——两边共用同一份库，谁传的图对方都看得见。
- **`BatchStudio` 自己管 `picker` 与 `MediaLibraryDialog`**：`type LibraryTarget = { kind, jobId, msgId?, userId?, background? }`，
  按目标决定用到哪里。`onKindChange` **保留 jobId 与目标**（表情 ↔ 商品图来回切着挑同一张图时目标不能丢，
  与聊天页弹窗同一条规则）。

顺手做的一致性收口：

- `MediaImportOutcome` 从 `App.tsx` 挪到 `src/lib/media-library.ts`（原来是 App 内的局部 interface），
  两个工作区共用同一个返回类型。
- `UserAvatarManager` 的「用过的头像」**还给同名角色**这件事，批量页自己做不了：
  它需要 `touchAvatarPreset` + 落盘。所以 App 只暴露 `onTouchPreset(preset)`（记一次使用），
  **换到哪一组由批量页自己决定**（`applyPresetToJob` 按 `avatarNameKey` 在本组找同名角色，找不到就只提示）。
- 归档的「记档」逻辑抽成 App 的 `rememberUsersForPresets(list)`，聊天页的 effect 与批量页共用——
  在批量页换的头像同样会进「用过的头像」。留意：**函数名不能以 `use` 开头**，
  `eslint` 的 `react-hooks/rules-of-hooks` 会把它当 Hook 报错（`usePresetForJob` 已改名 `applyPresetToJob`）。

### 尺寸：屏幕尺寸是工作区级，图片大小与字号按组

三个尺寸里只有 `screenSize` 不在 `PhoneSettings` 里（它在偏好 `playback` 组），语义上是工作区级的：

- **屏幕尺寸**：App 把 `screenSize` / `setScreenSize` 直接传下去，批量页与聊天页是**同一个值**，
  导出图片时 `renderBatchChat(job, screen)` 一路带到 `captureChatPhone`。
  **这是这次唯一改变批量既有行为的地方**：此前批量恒定 1125×2436（`scripts/batch-*-smoke.mjs`
  有按这个尺寸写的断言，改分辨率后那些断言不再代表默认行为）。
- **图片大小 / 字体大小**：写进**该组**的 `snapshot.settings`（`patchJobSettings`）。
  新建的组仍按 `currentChat.settings`（= 偏好）初始化，所以批量页的改动**不会回流到偏好**，
  也不会影响其他组——这是「按组生效」的直接后果，若日后想让它同时被记住，
  在 `patchJobSettings` 里补一次偏好写入即可。
- 弹层里的档位是**非受控本地 state、按打开时传入的值初始化**（见前文那条规则），
  所以换组之后要重新打开弹层才是新值；弹层关闭即卸载，重新打开天然是干净的。

### 昵称记忆

- 「聊天名称」输入框接 `NameSuggest`，`onBlur` 记一条（与 `SettingsPanel` 的聊天标题同一套）。
- `addChats` 解析完把角色名一并 `rememberNameHistory(...)`，**排除「我」**（`isSelfAlias`），
  与 App 的 `handleImport` 完全一致——批量导入完再回聊天页，不用重打名字。
- 手机样式里的「聊天标题」本来就走共用的 `SettingsPanel`，这一项**批量页早就有**。

### 行为变化

- 批量页的「导入聊天」页脚文案改为说明会沿用「我的偏好」的样式与导出分辨率。
- 批量页弹窗（素材库）的标题与按钮文案按目标细分，与聊天页同一套措辞。
- 聊天页侧行为不变：`handleUsePreset` 抽出了 `touchPreset`，逻辑等价。

## 2026-09-21 微信表情（存标签，显示表情）

### 核心约定：文本里存标签，渲染时才变成表情

`[呲牙]` 在文本里就是这几个字符，渲染时换成 😁。这一个决定把后面几件事都解决了：

- 导入的记录里带标签**不用先转换**就显示成表情（这就是「自动识别」）；
- 记录文本、项目文件、分享链接里存的都是几个字节，不会因为表情膨胀——图片消息在记录里
  只写 `[图片]` 而不写 data URL，是同一条理由（一张压缩图几十万字符，塞进输入框会直接卡住）；
- 「写回文本 → 再解析」原样往返，导入导出之间不改用户写的字（`parser.test.ts` 的回环用例覆盖）。

要改的是「表情长什么样」，只动 `src/lib/wechat-emoji.ts` 那张表，别在渲染层另建一套。

### 字形用系统自带的通用 emoji，不打包微信的表情图

微信那套表情图是它的美术素材，不能进仓库——和提示音刻意不引入第三方音频文件是同一条底线。
所以这里做的是**按语义对齐**的翻译（`[呲牙]` → 😁），标签名沿用微信的叫法方便照着写。
副作用：同一个 emoji 会挂在两三个标签下（`[得意]` / `[坏笑]` 都是 😏），
个别标签只能取最接近的一个（`[差劲]` 的勾手指、`[太极]` 的姿势），这是刻意的，不是漏配。
表里 136 条按「表情 / 手势 / 物件 / 新表情」四组，顺序沿用微信面板，改表时保持这个顺序。

### 解析：只认已知标签，认不出来的原样留着

`splitEmoji()` 用 `\[([^[\]]{1,8})\]` 找方括号对，再拿里面的名字查表——**查不到就整段留在文字里**。
所以 `[待办]`、`[链接](url)`、`[这是一个很长的说明]`、`[]`、`[ 微笑]`（带空格）都不会被吃掉。
`[图片]` / `[红包]` / `[转账]` / `[语音]` 是记录格式的特殊消息前缀，**刻意不收进表情表**，
免得两套语义打架；测试里有一条专门盯着这个。

### 渲染：EmojiText 走 React 元素，不再拼 innerHTML

新增 `components/EmojiText.tsx`，把 `splitEmoji` 的结果渲染成 `<span class="wc-emoji">`，
换行照旧渲染成 `<br>`（气泡的 `white-space` 是 normal，不换行会折成空格）。

原来的写法是 `dangerouslySetInnerHTML={{ __html: escHtml(...) }}`——每个调用点都得自己记得转义，
漏一处就是一个 XSS 口子。改成 React 元素之后标签里的尖括号天然是纯文本，调用点只传字符串。

`.wc-emoji` 的样式在 `PhonePreview.css`：`font-size: 1.2em` + `line-height: 1` + 负 `vertical-align`。
1.2em 的行盒仍小于气泡的 1.4 行高，所以一条消息里混表情**不会把气泡撑高**；字号用 em，
「字体大小」档位一动它也跟着缩。

### 面板：EmojiPicker

按钮 + 展开的分组网格，顶部「最近用过」。点一个表情做两件事：

1. `rememberRecentEmoji(name)`（localStorage 的 `wechat-dialog-generator:emoji-recent`，
   沿用 `name-history-store.ts` 那套同步快照写法，几个面板共用一份）；
2. 把**标签**插到目标输入框的光标处——插入的是 `[呲牙]` 不是 😁，这样手写标签和从面板点
   最后得到的文本完全一样。

光标计算抽成纯函数 `lib/text-caret.ts` 的 `insertAtCaret()`（只读 `value` / `selection`，
不碰 DOM，所以能在单测里喂普通对象）；插入后等一帧再把光标放回插入内容之后，
连着点几个表情不用手动挪光标。

`target` 是一个 ref，不是值：批量页的「逐条消息」是一列输入框共用一个面板，
在 `onFocus` 里把 `ref.current` 指向当前那一个、同时记住是哪条消息，插入时才找得到人。

### 刻意不认标签的地方

- **红包备注**：微信的红包留言本身就不支持表情，保持写什么显示什么（`escHtml` 那一路）；
- **语音转写**：微信语音转文字的产物里不会带表情，保持原样。

转账备注则认标签（微信里转账备注可以带表情），所以它和红包备注在 `PhonePreview` 里走的是两条路。

### 接入点

`MessageEditor`（文字、转账备注）、`ImportPanel`（聊天记录文本）、
`BatchStudio`（批量文本框、本组聊天记录、逐条消息编辑）、
`MomentsEditor`（朋友圈正文，正文与评论的渲染也都过了 `EmojiText`）。

### 单测

新增 `wechat-emoji.test.ts`（10 条）与 `text-caret.test.ts`（5 条），另外
`batch-prompt.test.ts` 的示例消息数与 `parser.test.ts` 的回环用例都仍然通过。

## 2026-09-21 批量页的视频导出

批量页此前只能导出图片（每组一张 PNG，最后打成一个 ZIP）。这一节记的是把聊天页那套
视频链路复用到批量页：**每组一段视频，逐条录、录完立即下载**。

### 复用而不是重写：批量页只做「调度」

录制本身一行都没重写。`BatchStudio` 的 `video` prop 由 App 注入，直接复用聊天页同一套：

- 排期与耗时：`chat-playback.ts`（时间线）、`chat-scroll-video.ts`（滚动计划）；
- 渲染与录制：`chat-video-render.tsx` / `chat-video-recorder.ts`
  （`renderChatFrames` / `renderChatScrollFrame` / `recordChatVideo` / `recordScrollingChatVideo`）；
- 画面尺寸：`chat-video.ts`；提示音：`notify-sound.ts`；
- 设置面板：`VideoExportDialog`（见下）。

批量页自己新增的只有两处：纯计算 `src/lib/batch-video.ts`，和浏览器侧粘合
`src/components/batch-video-render.ts`。前者把「一组 + 设置」算成可断言的
`BatchVideoTask`（`mode` / `timeline` / `notifyAt` / `totalMs` / `estimateMs`），
后者按 `mode` 分发到 flip（逐条播放）或 scroll（长截图滚动）两条渲染路径。
**要改录制节奏、首尾停顿、提示音时机，仍然只改 `chat-playback.ts`，批量与聊天、预览与导出会一起变。**

### 为什么是逐条下载，不是打成一个 ZIP

图片那套是「渲染 → 存进 `job.bytes` → 全部跑完 → 打成 ZIP 一次下载」。视频体积是图片的
百倍量级，一批几十组全留在内存里再打包必然 OOM（本机 340MB 可用内存下连 `vite build`
都会崩）。所以视频模式**不往内存里囤**：每组录完立刻触发一次浏览器下载，随即释放 blob 引用；
视频模式也没有「重新下载 ZIP」这一步。

### 调度骨架 `runBatch` 泛化出 `deliver` 阶段

`src/lib/batch.ts` 的 `runBatch` 从「图片专用」改成两段式：

```
render（离屏渲染）→ 取消检查 → job.locked=true → debit（扣额度）→
  ├─ 图片：把 bytes 存进 job，最后统一打 ZIP
  └─ 视频：调 deliver(job, payload) —— 录制 + 立即下载，不存 bytes
```

关键约束没变：**额度在渲染完成之后才扣**，渲染阶段取消不扣次；重试复用原 `action_id`
（`consumeAccountExport` 幂等），不会重复扣。视频的产物记在 `job.video`（`{name, bytes}`），
队列行显示「视频 · N MB」。

### 产出模式记进「我的偏好」

`BatchOutput = 'image' | 'video'` 写进偏好的 `playback.batchOutput`（默认 `image`），
刷新或重新导入后仍是上次选的那项。切换模式时会把「产物类型对不上」的已完成组标记为待重做
（视频与图片的字节不能互相复用）。`workspace-prefs.ts` 的归一化与 `canonical()` 比较串
都补了这个字段，老偏好缺字段时按默认值兜底（`workspace-prefs.test.ts` 覆盖）。

### 共用设置面板与进度浮层

`VideoExportDialog` 新增 `groupCount?: number` 与 `description?: ReactNode`：给了
`groupCount` 就切到批量措辞——标题「批量视频设置」、计数以「组」为单位、主按钮「完成」、
摘要写「每组视频使用 1 次导出额度，本批共 N 次」。`VideoProgressOverlay` 新增
`jobLabel?: string`，在录制文案里补一句「这一条录完会立即下载」。聊天页不传这两个 prop，
行为完全不变。

### 额度与埋点

额度仍按组扣（`debitBatchExport`，每组 1 次），与图片模式一致。App 的 `onComplete`
签名从 `(id)` 扩成 `(id, output: BatchOutput)`，据此发对应埋点：
视频发 `video_exported`，图片发 `image_exported`；导出日志用 `beginExportLog({ mode })` 记类型。

### 验证边界

纯逻辑有单测兜底（`batch-video.test.ts`：尺寸解析、滚动时长映射、flip 时间线与提示音、
收发开关、滚动无时间线、整批耗时求和、两侧留白夹取）。但**本机没有任何浏览器**，涉及 MediaRecorder、
Web Audio 与真实下载的录制过程无法在这里端到端跑，需在 Chrome / Edge 里手工确认。

## 2026-09-21 导出两侧留白（安全区）

> 这份留白**图片与视频共用**。图片（生成图片 / 长截图 / 复制 / 批量聊天图）在 `capture-chat.ts`
> 里直接把底色补在导出图左右；视频的画布尺寸固定，走 `fitRect` + `videoContentScreen()` 那一套。
> 两边的像素口径是同一个（输出像素），所以「左右各留 120px」在两种产出里指的是同一件事。

### 问题：9:16 发抖音，两边被裁 + 被浮层压住

9:16 的视频在 iPhone Pro Max 这类 **19.5:9** 的屏幕上会被「铺满」播放——平台先把视频等比
放大到填满屏幕，再裁掉溢出的部分。算一下：1080×1920 放进 1290×2796，放大倍率取高那一侧
（2796 / 1920 = 1.456 → 1573×2796），两侧各裁掉 (1573 − 1290) / 2 = 141.5 屏幕像素，
换回视频坐标就是**每侧 97px**。再加上右侧那排按钮、左下角昵称与简介这些浮层，贴着边缘的
内容就看不到了。

### 取舍：在导出这一层解决，不碰手机渲染

两条路可选：把手机内容本身左右内缩（背景露出来），或者把画面往画布里摆、两侧补底色。
选了后者，因为：

- 留白是「画布上的空白带」，语义直白，用户调大调小立刻能算出画面占多少；
- 手机内容内缩要连顶栏底栏一起改（否则上下栏满宽、中间内缩很怪），而且约束会渗进
  `PhonePreview.css` 与 `captureChatPhone` 这些共用代码里，图片、长截图、预览都得跟着动。

后者又分成两种做法，**图片与视频各用各的**：

- **图片**没有画布，一张截图就是手机本身 → 输出宽度各加 N，高度与画面比例一个像素不动
  （`paddedImageSize()` + `capture-chat.ts` 的补边）。长截图同一条路，只是高度本来就是内容决定的。
- **视频**的画布是固定的（1080×1920 这种）→ 见下一节。

但视频这条路上，**「等比缩小」会连高度一起缩**——这是第一版踩的坑：宽度从 887 收到 840，高度也跟着从 1920 掉到
1819，上下各空出 50px；画布若与手机同比例（「1125×2436 满屏」），上下各空 260px，比两侧还宽，
看上去就成了「四周留白」。所以真正落地的规则是：

- 留白**不超过**画布自然留边（9:16 约 97px）：手机保持原比例铺满上下，自然留边本身就是留白（「至少 N」）；
- 留白**超过**它：把手机的画面比例换成「画布去掉两侧留白」那一份，手机仍然铺满上下、两侧正好让出 N 像素。

「只左右留白、上下不空」只有这样才成立。等比缩放做不到，是几何决定的：平台按高度铺满后，可见
宽度恒为 `画布高 × 屏宽 / 屏高`（1080×1920 就是 886px），而手机按高度铺满时的宽度是
`画布高 × 1125 / 2436 = 887px` —— 两者几乎相等，所以「上下铺满」与「左右有边」不可能同时由等比
缩放得到，必须换掉手机自己的画面比例。

### 实现：`fitRect` 的第五个参数

`chat-video.ts` 的 `fitRect(sourceW, sourceH, targetW, targetH, sidePadding = 0)`：可用宽度
先收窄 `2 × sidePadding`，再按等比缩放居中，x 从留白之后起算。`sidePadding` 传 0 或省略时
结果与改动前**完全一致**（`chat-video.test.ts` 有一条专门断言这点），所以老的调用点不用动。

两条录制路径都接了这个参数（`recordChatVideo` / `recordScrollingChatVideo`），批量走的是同一份
（`BatchVideoRecordOptions.sidePadding` → `BatchVideoPlan.sidePad`，落到录制前再 clamp 一次）。

**语义是「至少 N 像素」，不是「正好 N 像素」**：因为公式是「先收窄再等比缩放」，当留白比画布
本来就会产生的留边还小时（9:16 下自然留边约 97px），起作用的是后者。所以「少量 60」在 9:16 上
等于没效果，这条写进了单测与界面文案。留白上限 300，且内部再夹一层 `(targetW − 1) / 2`，
避免极端值把画面压成 0 尺寸。

### 只左右留白：`videoContentScreen()`

`video-padding.ts` 里的 `videoContentScreen(screen, canvas, sidePad)` 返回**视频渲染该用的
「屏幕尺寸」**：留白没越过自然留边时原样返回 `screen`（于是 0 与不带这个参数完全一致）；越过了就
返回「宽度不变、高度按比例拉长」的那一份，比例 = `(画布宽 − 2×留白) / 画布高`，高度 `Math.ceil`
（取整偏大，让**高度**成为那个卡住的约束：上下一定铺满，两侧只会多不会少，最多 1px）。
`videoNaturalSideGap()` 是判定的那条线，也是「至少 N」里的 N。

为什么返回值是 `ScreenSize`：下游全都认这个形状，于是**一行都不用改**——

- `PhonePreview` 由它算 `--wc-phone-design-height`（坐标系高度就是画面比例），手机按新比例布局；
- `captureChatPhone` 由它算坐标系高度与导出像素，采样密度 `宽度 / 1125` 不变，栅格化不会变糊；
- `renderChatFrames` / `renderChatScrollFrame` 的 `snapshot.screen`，帧尺寸与手机比例天然自洽；
- `videoFrameLayout` 由它算取景框，预览与成片同源。

接线三处（都只改传参，逻辑一行没动）：App 的 `videoScreen`（预览）与 `renderScreen`（导出）、
`BatchStudio` 的 `videoScreen`（预览 + 传给 `prepareBatchVideo` 的 snapshot）。

**图片导出不走它**：截图、长截图、批量聊天图仍然用 `screenSize` 渲染。而 `captureChatPhone`
本来就会在截图期间把 `--wc-phone-design-height` 强制写成自己那份 `designHeightFor(screen)`
（`capture-chat.ts`，截完再还原），所以即使预览里的手机被换过比例，导出的 PNG 依旧是手机原本的
比例——这条约束由那次强制写回兜住，不需要额外挡。图片的留白是**另一条路**：

### 图片：留白直接加在导出图的左右

`captureChatPhone(phone, longshot, screen, options)` 新增第四个参数
（`{ sidePad, background }`，见 `capture-chat.ts`）：

- 截完图之后，如果 `sidePad > 0`，`withSidePadding()` 新建一张
  `(宽 + 2×N) × 原高` 的画布，先用 `background`（对话底色，调用方传 `settings.backgroundColor`）
  铺满，再把原图 `drawImage` 到 x = N 的位置，然后立刻把原画布尺寸清零释放掉
  （长截图动辄 16000px 高，早释放一次省几十 MB）。
- 宽度由 `paddedImageSize()` 算（纯函数，含夹取与非法尺寸兜底：算不出正数就原样返回，不建 0 宽的画布）。
- **手机的比例一个像素都不动**，只是外面多了两条底色带——这正是「图片没有画布」的意思。
  1125×2436 的截图、左右各留 120 → 输出 1365×2436。

接线两处、两条链路的图片路径：

- App 的 `capturePhone()`（生成图片 / 长截图 / 复制共用）传 `{ sidePad: videoSidePad, background }`；
- 批量的 `renderBatchChat(job, screen, sidePad)`，底色取**各组自己的** `snapshot.settings.backgroundColor`
  （批量里每组背景可能不同，所以底色不能像视频那样整批共用一个）。

**视频帧两条路径（`chat-video-render.tsx`）传 0**：视频的留白是在合成到画布时加的，帧本身要
保持手机原始比例，否则会二次缩窄。

### 档位与默认值：`src/lib/video-padding.ts`

沿用 `image-size.ts` / `font-size.ts` 那套形状（预设 + `clamp` / `normalize` / `resolve` /
`idFor` / `label` / `note`）。

- 档位：关闭 0 / 少量 60 / **标准 120（默认）** / 多留 200，另有自由输入 0–300。
- **默认 120** 是抖音安全区的推荐值：97px 的裁切量之上再留一点给右侧按钮栏。也就是说这次
  改动会**改变既有用户的导出画面**（原先等于 0），所以界面上把「关闭」放在第一档，随时可退回。
- 单位是**输出画布的像素**，不是内部坐标系那套 1125。因为它挡的是平台按比例裁掉的那一段，
  固定像素最直观；换画布尺寸时（1080 / 1125 / 跟随屏幕）留白占比会略有不同，这是有意的。
- `clampVideoSidePad(NaN)` 退回**默认值**而不是最小值：这里给的是「留多少」，退回 0 会悄悄把
  安全区关掉。同理 `normalizePlaybackPrefs` 里缺字段时给默认值——旧偏好没有这一项，不能当成
  用户主动关闭。

### 偏好与界面接线

- 偏好 `playback.videoSidePad`（`workspace-prefs.ts` 的默认值 / 归一化 / `canonical()` 三处都补了），
  与其它视频设置一样，单聊页与批量页**共用同一份**（App 的 `videoSettings` / `patchVideoSettings`）。
- 界面在 `VideoExportDialog` 里新开一段「两侧留白」，紧跟在「画面尺寸」之后：上面几个筹码做
  快捷档，下面一个数字输入框填任意值。**同一个控件也出现在预览右上角的尺寸弹层里**（见下面
  「预览里的取景框」），两处共用 `SidePadOption`、写的是同一个值。
- 这段抽成了子组件 `SidePadOption`（`src/components/SidePadOption.tsx`），**因为它的输入草稿
  要跟着弹层打开时的值走**：它挂在 `Dialog.Popup` / `Popover.Popup` 内部，而 base-ui 的
  `DialogPortal` 默认 `keepMounted = false`（关闭即 `return null`，见 `portal/DialogPortal.js`），
  所以每次打开都会重新挂载，`useState` 的初始值天然是最新值，**不需要同步 effect**（沿用
  「预览弹层那条规则」）。它有个 `variant`：对话框里写全，预览弹层里只留一句——那边本来就窄，
  而且旁边就是实时画面。
- 输入框沿用「只在失焦 / 回车提交」的约定：输到一半的「1」不会被立刻夹成别的数。
  档位高亮用 `videoSidePadIdFor()` **反查**（不是另存一个 mode）——它只看数值，落在档位之间
  就是自定义，没有「档位与数值不一致」的状态可维护。

### 预览里的取景框（`src/lib/video-frame.ts`）

留白原本只体现在成片里：调完得导一遍、发出去、在手机上看。所以**开着留白时，预览直接换成
「导出成视频的那一帧」**——手机按导出比例缩进画布、铺满上下居中，两侧露出来的底色就是成片里的
边带，调多少当场变多少。

- `videoFrameLayout(画布显示宽度, 输出尺寸, 屏幕尺寸, 留白)` 只算数字，不碰 DOM：先把屏幕尺寸过一遍
  `videoContentScreen()`（留白生效时手机的比例跟着框走），再
  `fitRect(1125, designHeightFor(content), 输出宽, 输出高, 留白)`，和录制时**同一套几何**
  （滚动模式放进去的也是「一屏」那个窗口，见 `recordScrollingChatVideo` 的 `target`），
  再把结果整体乘一个「预览像素 ÷ 输出像素」的系数。
- 摆位交给 CSS：画布是 `display:flex` + 居中，手机尺寸由 `WorkspacePanels` 注入
  `--workspace-phone-width/height/scale`。因为 `fitRect` 的 x / y 本来就是居中算的，
  flex 居中与它逐像素一致，不用绝对定位。
- 手机高度**一律用 `phoneDisplayHeight(phoneWidth, 屏幕尺寸)` 从宽度换算**，不直接用
  `fitRect` 的高度：容器高度与缩放后的画面高度必须来自同一个数，否则会露出一条 1px 的缝
  （`phone-size.ts` 里那条老约定的延续）。**这里的「屏幕尺寸」必须是 `videoContentScreen()`
  那一份**，也就是录制时用的那份——父级渲染 `PhonePreview` 时传的是同一个值（App 的
  `videoScreen`、`BatchStudio` 的 `videoScreen`）。第一版漏了这一步：容器高度仍旧按原始屏幕
  比例算（手机 264×572），而手机本身已经被渲染成 264×604，于是框里上下各空 16px、底部还被
  `overflow: hidden` 切掉一截——看着就是「怎么还是四周留白」。`video-frame.test.ts` 里有一条
  专门盯这个（容器高度与框高最多差 1px 的取整误差，且按原始屏幕算会矮 30px 以上）。
- 取景框里的手机**去掉机身外框与投影**，只留一条虚线标出内容边界——手机边缘常常与边带同色
  （都是对话背景），不标就分不出留白有多少。那条虚线是「导览」，不在成片里。
- 边带颜色取 `settings.backgroundColor`，与录制时 `background` 是同一个值；**故意不跟着
  背景图走**，因为成片里拿的也是这个纯色。
- 只读、不写：`videoFrame` 与 `videoSidePad` 都由 App / BatchStudio 传进来，`WorkspacePanels`
  不改任何导出设置，也不碰 `phoneRef`（画布是 `phoneRef` 外面的壳，离屏渲染与截图完全不受影响）。
- 关掉留白（0）就不画取景框，预览回到原来的手机视图——所以这项功能对不用它的人是零影响。
- 开着取景框时「窗口大小」这一档调的是**取景框的宽度**（不是手机的宽度），自适应宽度也改按
  画布比例算，宽度上限从 340 放宽到 380 把面板的宽度用满。代价是预览会比原来小一点
  （9:16 画布下手机只占画布宽度的约 78%），看细节用右上角的专注模式放大。

### 顺带改掉的文案

`chat-video.ts` 里「1125×2436 满屏」与「跟随屏幕」两档的说明原先写着「手机铺满整个画面 /
不额外留边」，现在留白是独立一项，所以改成「分辨率跟屏幕走，留白按那一项设置」。

`VideoExportDialog` 里「画面尺寸」下面那句原写「…再等比放进这个画布，四周留对话底色」——
留白越过后手机其实是铺满上下的，所以改成「…居中；两侧让出多少看下面的『两侧留白』」。
`SidePadOption` 的两处说明也都改成了「图片…；视频…」两句并列，取景框下面那行同样补上
「图片与长截图会照同样的像素加在左右两头」；聊天页预览区右上那行的副标题会写
「，图片左右各留 120px」，不用点开弹层也知道图片会变宽。

### 单测

`video-frame.test.ts`（9 条）：画布比例与手机居中、**留白生效时上下一定铺满**（比例换成「画布去掉
两侧留白」，而不是整体缩小）、留白越多手机越窄而高度始终铺满、**留白是「至少」**（调到画布自然
留边以下不改画面）、画布与手机同比例时留白直接吃宽度、换屏幕尺寸后比例跟着变、非法尺寸全部退回 0
（预览据此不画）、文案带画布尺寸与留白值、**容器高度必须按成片那一份屏幕尺寸换算**（差 1px 以内，
盯住「怎么还是四周留白」那个坑）。

`video-padding.test.ts`（11 条）：除档位与推荐值、夹取 / 归一化 / 反查 / 文案之外，
**自然留边**（同比例画布与非法尺寸都是 0）、**没越过自然留边时原样返回**、**越过时换成内容框比例**
（宽度不变、高度取整偏大以保证铺满）、**留白越大手机越细长且只会变高**（含画布比手机还窄的情况）、
**图片补边只加宽度**（0 与不传参数完全一致、长截图算法同一条、越界夹取、非法尺寸给 0 好让调用方跳过）。

## 2026-09-21 导入不再静默丢行

### 问题

「在聊天记录文本最后手动加了一条，点解析并导入，提示成功了，可这条就是没进来。」

先按输入形状把解析器跑了一遍（几十种写法的矩阵），结论是**解析器不是「最后一行」有问题，
而是「没有冒号的行」整行会被丢掉**：

| 写进文本框的样子 | 改之前 |
| --- | --- |
| `**李四**：好的` / `李四：好的` | 正常 |
| `谢谢老板`（没写名字） | **整行消失** |
| `**李四** 好的`（名字与内容用空格） | **整行消失** |
| `【李四】收到` | **整行消失** |
| `**李四**：@张三`（只 @ 了一个人） | **整行消失**（内容被 `@\S+` 过滤成空） |
| `**李四**：`（名字和冒号都写了，内容空着） | **整行消失** |

原因是第二趟解析里，「Markdown 消息」和「`名字：内容`」两条分支都要求冒号 + 非空内容，
剩下的行直接落到函数末尾——没有 `else`，于是悄无声息地没了。而回执报的是
「成功导入 N 条消息」，N 里当然也不含它，所以在用户看来就是「说成功、东西没进来」。
这类丢法最坏的地方在于**它不报错**：文本里明明躺着那一行，导完就再也看不见了。

### 做法：认不出格式 ≠ 这一行不该存在

把「跳过」这件事收敛成一条明确规则（`prepareRecordLine`，两趟共用，避免收名字那趟和出消息那趟走样）：

- **排版标记照旧跳过、且保持沉默**：空行、`#` 标题行、`>` 引用行、`---` 分隔线。
  这些在界面上的格式说明里写明了「自动跳过」，不属于「用户写的内容」。
- **没写「名字：」的行收进对话**，按**上一句的说话人**接着往下说（时间节点不算说话人，
  要往回找到最近的一条真实消息；整段还没人说过话就退回「自己」）。**原文一个字都不改**，
  只有开头用于列表的 `- ` / `* ` 会被去掉。这类行数记在 `unlabeled` 上。
- **「名字和冒号都写了、内容空着」是唯一真正的半行**：它确实留不下任何东西（空气泡不算消息），
  所以照旧跳过，但**记进 `skipped` 并带上行号**，由导入回执说出来：
  「第 3 行只写了名字没写内容，已跳过」。
- **只 @ 了一个人的消息不再被清空**：过滤 `@称呼` 的规则（给 AI 生成的记录去掉顺带的 @）改成
  「过滤后为空就用原文」，所以 `**李四**：@张三` 仍是张三说的「@张三」。
  `@` 后面还有正文时（`@张三 你看下` → `你看下`）行为不变。

### 整段没有人名时补一个「我」

宽松规则带来一个新边界：整段只有一行没写名字的正文时，`users` 会是空的，而消息总得有个说话人
——否则消息指向一个不存在的用户，预览里找不到人。所以两趟都跑完后加一道兜底：
**有消息但一个用户都没有**就补一个 `{ name: '我' }`，用的是和「第一个出现的用户默认为自己」
同一套规则（id 也用同一个 `nextId`，不会撞号）。

### 批量这边刻意不跟着放宽

批量导出用的是同一个解析器，但**不能**一起宽：整组都没按格式写的输入如果被当成消息，
出来的是一张「我」在念散文的废卡，而**每组都要扣一次导出额度**。
所以 `validateChat` 的判据从「至少有一条非时间消息」改成「至少有一条**标了说话人**的消息」
（`非时间消息数 − unlabeled > 0`）。行为上只有一处变化：整组是散行的情况照旧报
「第 N 组没有有效对话，请按『姓名：消息内容』填写」；正常组里夹一两行散行则是收下。
顺带把 `chatSnapshot` 从 `{ ...parsed }` 改成显式取四个字段，别把 `skipped` / `unlabeled`
这两本内账带进快照里。

### 单测

`parser.test.ts`（新增 7 条）：末尾补一行没写名字的正文不会消失且说话人接上一位、
没有冒号的几种写法都留下、只 @ 一个人的消息保住、`名字：` 空内容的半行进 `skipped` 且带行号、
整段只有一行正文时补出「我」且消息指向存在的用户、时间节点不算说话人、
认不出格式的行不影响本来就认得出的那些（文字 / 图片 / 时间各归各位）。

`batch.test.ts`（新增 1 条）：整组散行仍报「没有有效对话」，正常组里的散行则跟着上一位说话人，
并逐字比对快照的字段只有 `messages / selfId / settings / users` 四项。

