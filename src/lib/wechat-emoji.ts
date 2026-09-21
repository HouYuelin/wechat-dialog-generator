/**
 * 微信表情标签 ↔ 通用 emoji。
 *
 * **文本里存标签，渲染时才变成表情。** 这是这个模块唯一的约定：
 * - `**张三**：今天真开心[呲牙]` 这种记录导进来就能直接显示成表情，不需要先做一次转换；
 * - 记录文本、项目文件、分享链接里躺的是 `[呲牙]` 这几个字符（几个字节），和手打的一模一样。
 *   反过来，如果往文本里塞 base64 图片，一条消息就能把输入框撑到几十万字符——
 *   图片消息在记录里只写 `[图片]` 标记，是同一个道理；
 * - 标签「写回文本 → 再解析」原样往返，导入导出之间不会被改写（见 parser.test.ts 的回环用例）。
 *
 * **字形用的是系统自带的通用 emoji，不是微信那套表情图。** 那套图是微信的美术素材，
 * 不能打包进仓库（和提示音刻意不引第三方音频文件是同一条理由）。所以这里做的是
 * 一件「按语义对齐」的翻译：`[呲牙]` 显示成 😁。标签名沿用了微信的叫法，
 * 方便照着微信的习惯写——但别指望像素级还原微信的表情图。
 *
 * 两个刻意的例外：
 * - `[红包]` / `[图片]` / `[转账]` / `[语音]` 是记录格式里的特殊消息前缀（见 parser.ts），
 *   不作为表情收录，免得两套语义打架；
 * - 部分标签的语义在通用 emoji 里没有精确对应（`[差劲]` 的勾手指、`[太极]` 的姿势），
 *   取了最接近的一个，同一个 emoji 出现在两三个标签下是正常的。
 */

export type EmojiGroupId = 'face' | 'gesture' | 'thing' | 'extra';

export interface EmojiEntry {
  /** 微信里的标签名，例如「微笑」；写进文本时是 `[微笑]`。 */
  name: string;
  /** 按语义对应的通用 emoji。 */
  char: string;
  group: EmojiGroupId;
}

/** `[标签名, 表情]`。顺序沿用微信表情面板的排列，面板里也按这个顺序铺。 */
type EmojiPair = [name: string, char: string];

const faceList: EmojiPair[] = [
  ['微笑', '😊'],
  ['撇嘴', '🙁'],
  ['色', '😍'],
  ['发呆', '😑'],
  ['得意', '😏'],
  ['流泪', '😢'],
  ['害羞', '😊'],
  ['闭嘴', '😶'],
  ['睡', '😴'],
  ['大哭', '😭'],
  ['尴尬', '😅'],
  ['发怒', '😡'],
  ['调皮', '😜'],
  ['呲牙', '😁'],
  ['惊讶', '😲'],
  ['难过', '😞'],
  ['酷', '😎'],
  ['冷汗', '😓'],
  ['抓狂', '😫'],
  ['吐', '🤮'],
  ['偷笑', '🤭'],
  ['可爱', '🥰'],
  ['白眼', '🙄'],
  ['傲慢', '😤'],
  ['饥饿', '🤤'],
  ['困', '😪'],
  ['惊恐', '😱'],
  ['流汗', '😰'],
  ['憨笑', '😄'],
  ['大兵', '😎'],
  ['奋斗', '😣'],
  ['咒骂', '🤬'],
  ['疑问', '❓'],
  ['嘘', '🤫'],
  ['晕', '😵'],
  ['折磨', '😖'],
  ['衰', '😔'],
  ['骷髅', '💀'],
  ['糗大了', '😳'],
  ['坏笑', '😏'],
  ['左哼哼', '😤'],
  ['右哼哼', '😤'],
  ['哈欠', '😩'],
  ['鄙视', '😒'],
  ['委屈', '🥺'],
  ['快哭了', '😢'],
  ['阴险', '😈'],
  ['亲亲', '😘'],
  ['吓', '😱'],
  ['可怜', '🥺'],
  ['示爱', '😘'],
];

const gestureList: EmojiPair[] = [
  ['敲打', '🔨'],
  ['再见', '👋'],
  ['擦汗', '😅'],
  ['抠鼻', '🤏'],
  ['鼓掌', '👏'],
  ['拥抱', '🤗'],
  ['强', '👍'],
  ['弱', '👎'],
  ['握手', '🤝'],
  ['胜利', '✌️'],
  ['抱拳', '🙏'],
  ['勾引', '👉'],
  ['拳头', '✊'],
  ['差劲', '👎'],
  ['爱你', '🤟'],
  ['NO', '🙅'],
  ['OK', '👌'],
  ['爱情', '💑'],
  ['飞吻', '😘'],
  ['跳跳', '🤸'],
  ['发抖', '🥶'],
  ['怄火', '😤'],
  ['转圈', '💫'],
  ['磕头', '🙇'],
  ['回头', '👀'],
  ['跳绳', '🏃'],
  ['挥手', '👋'],
  ['激动', '🤩'],
  ['街舞', '🕺'],
  ['献吻', '😘'],
  ['左太极', '👊'],
  ['右太极', '🤘'],
];

const thingList: EmojiPair[] = [
  ['菜刀', '🔪'],
  ['西瓜', '🍉'],
  ['啤酒', '🍺'],
  ['篮球', '🏀'],
  ['乒乓', '🏓'],
  ['咖啡', '☕'],
  ['饭', '🍚'],
  ['猪头', '🐷'],
  ['玫瑰', '🌹'],
  ['凋谢', '🥀'],
  ['爱心', '❤️'],
  ['心碎', '💔'],
  ['蛋糕', '🎂'],
  ['闪电', '⚡'],
  ['炸弹', '💣'],
  ['刀', '🗡️'],
  ['足球', '⚽'],
  ['瓢虫', '🐞'],
  ['便便', '💩'],
  ['月亮', '🌙'],
  ['太阳', '☀️'],
  ['礼物', '🎁'],
];

/** 2019 年前后补进来的那一批。 */
const extraList: EmojiPair[] = [
  ['皱眉', '😟'],
  ['破涕为笑', '😂'],
  ['嘿哈', '😆'],
  ['捂脸', '🤦'],
  ['奸笑', '😏'],
  ['机智', '🤓'],
  ['耶', '✌️'],
  ['茶', '🍵'],
  ['旺柴', '🐶'],
  ['吃瓜', '🍉'],
  ['社会社会', '🤝'],
  ['打脸', '🤕'],
  ['哇', '😮'],
  ['翻白眼', '🙄'],
  ['666', '👏'],
  ['让我看看', '👀'],
  ['叹气', '😔'],
  ['苦涩', '😖'],
  ['裂开', '🤯'],
  ['合十', '🙏'],
  ['嘴唇', '💋'],
  ['心', '❤️'],
  ['加油', '💪'],
  ['汗', '😅'],
  ['天啊', '😱'],
  ['發', '🀄'],
  ['福', '🧧'],
  ['鸡', '🐔'],
  ['小狗', '🐶'],
  ['囧', '😳'],
  ['老虎', '🐯'],
];

function build(list: EmojiPair[], group: EmojiGroupId): EmojiEntry[] {
  return list.map(([name, char]) => ({ name, char, group }));
}

/** 全部表情，按「表情 → 手势 → 物件 → 新表情」分组、组内保持上面的顺序。 */
export const wechatEmoji: EmojiEntry[] = [
  ...build(faceList, 'face'),
  ...build(gestureList, 'gesture'),
  ...build(thingList, 'thing'),
  ...build(extraList, 'extra'),
];

export const emojiGroupOrder: EmojiGroupId[] = ['face', 'gesture', 'thing', 'extra'];

export const emojiGroupLabels: Record<EmojiGroupId, string> = {
  face: '表情',
  gesture: '手势',
  thing: '物件',
  extra: '新表情',
};

export function emojisOfGroup(group: EmojiGroupId): EmojiEntry[] {
  return wechatEmoji.filter(entry => entry.group === group);
}

/** 标签名 → 表情。渲染与查找都走它，别在别处另建一份表。 */
const charByTag = new Map(wechatEmoji.map(entry => [entry.name, entry.char]));

/** 面板里显示一个表情时要展示的标签文本。 */
export function emojiTag(name: string): string {
  return `[${name}]`;
}

export function isEmojiTag(name: string): boolean {
  return charByTag.has(name);
}

export function emojiCharOf(name: string): string | undefined {
  return charByTag.get(name);
}

/** 标签的样子：一对方括号里放 1–8 个字，中间不再套方括号。 */
const TAG_PATTERN = '\\[([^[\\]]{1,8})\\]';

export type EmojiPart =
  | { type: 'text'; value: string }
  | { type: 'emoji'; name: string; char: string };

/**
 * 把一段文本拆成「普通文字」与「表情」两种片段。**认不出来的方括号原样留在文字里**，
 * 所以 `[图片]`、`[待办]`、`[链接](url)` 这类写法不会被这里的表情识别吃掉。
 *
 * 匹配的是一对方括号，不是单个方括号字符：`[微笑]` 认，`[ 微笑 ]`（带空格）不认，
 * 免得把正常的行文中括号也吃掉。
 */
export function splitEmoji(text: string): EmojiPart[] {
  if (!text) return [];
  const pattern = new RegExp(TAG_PATTERN, 'g');
  const parts: EmojiPart[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const char = charByTag.get(match[1]);
    if (!char) continue;
    if (match.index > cursor) parts.push({ type: 'text', value: text.slice(cursor, match.index) });
    parts.push({ type: 'emoji', name: match[1], char });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });
  return parts;
}

/** 这段文本里有没有能认出来的表情标签（编辑器用它提示「有几个表情」）。 */
export function hasEmoji(text: string): boolean {
  return splitEmoji(text).some(part => part.type === 'emoji');
}

/** 面板顶部「最近用过」最多留几个。 */
export const maxRecentEmoji = 24;

/**
 * 读取「最近用过」时兜底：丢掉不认识的标签、去重（保留靠前的）、截断。
 * 数据来自本地存储，可能是上一个版本写的、也可能被手改坏了。
 */
export function normalizeRecentEmoji(raw: unknown, max = maxRecentEmoji): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (seen.size >= max) break;
    if (typeof item !== 'string' || !charByTag.has(item)) continue;
    seen.add(item);
  }
  return [...seen];
}

/**
 * 记一次使用：刚点的排到最前，去掉旧的同名记录，超出上限的从尾部删掉。
 * 已经在最前面时**原数组原样返回**，调用方可以据此跳过写库。
 */
export function touchRecentEmoji(list: string[], name: string, max = maxRecentEmoji): string[] {
  if (!charByTag.has(name)) return list;
  if (list[0] === name && list.length <= max && new Set(list).size === list.length) return list;
  return [name, ...list.filter(item => item !== name)].slice(0, max);
}
