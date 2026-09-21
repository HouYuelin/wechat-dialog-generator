import type { ChatUser, ChatMessage, MessageType } from '@/types';

const SELF_ALIASES = new Set(['我', '自己', 'me', 'Me', 'ME', 'myself', '本人']);
const MD_MSG_REG = /^\*\*(.+?)\*\*\s*[：:]\s*(.+)$/;
const MD_TIME_REG = /^\*{0,2}【(.+?)】\*{0,2}$/;
const TIME_REG = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(\s+\d{1,2}:\d{2})?$/;
const TIME_REG2 = /^\d{1,2}:\d{2}$/;
const TIME_REG3 = /^(\d{4}年)?\d{1,2}月\d{1,2}日/;
const TIME_REG4 = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+(上午|下午|凌晨)$/;

// 特殊消息类型正则
const IMG_REG = /^\[图片\]\s*(.*)$/;
const IMG_MD_REG = /^!\[.*?\]\((.+?)\)$/;
const RP_REG = /^\[红包\]\s*(.*)$/;
const TRANSFER_REG = /^\[转账\]\s*(.*)$/;
const VOICE_REG = /^\[语音\]\s*(\d+)?(?:\s*[:：]\s*(.+))?$/;

function parseSpecialContent(content: string): { type: MessageType; content: string; params: ChatMessage['params'] } | null {
  // [图片]url 或 ![alt](url)
  let m = content.match(IMG_REG);
  if (m) return { type: 'image', content: m[1] || '/placeholder-image.png', params: {} };
  m = content.match(IMG_MD_REG);
  if (m) return { type: 'image', content: m[1], params: {} };
  // [红包]备注
  m = content.match(RP_REG);
  if (m) return { type: 'redpacket', content: '', params: { remark: m[1] || '恭喜发财，大吉大利' } };
  // [转账]金额 或 [转账]金额:备注
  m = content.match(TRANSFER_REG);
  if (m) {
    // 只按第一个冒号切：备注里再出现冒号（「还你的，备注：带冒号」）不该被当成第三段丢掉。
    const raw = m[1] || '0';
    const split = raw.search(/[:：]/);
    return {
      type: 'transfer',
      content: '',
      params: {
        amount: (split < 0 ? raw : raw.slice(0, split)) || '0',
        remark: (split < 0 ? '' : raw.slice(split + 1)) || '转账',
      },
    };
  }
  // [语音]秒数 或 [语音]秒数:转写内容
  m = content.match(VOICE_REG);
  if (m) return {
    type: 'voice',
    content: '',
    params: {
      duration: parseInt(m[1] || '3', 10),
      transcript: m[2]?.trim() || undefined,
    },
  };
  return null;
}

const AVATAR_FILES = [
  'avatar_1.png',
  'avatar_2.png',
  'avatar_3.png',
  'avatar_4.png',
];

export function getDefaultAvatar(index: number): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${AVATAR_FILES[index % AVATAR_FILES.length]}`;
}

/** 一行没被识别成消息、因而没进对话时的记录。导入回执会把它报出来。 */
export interface SkippedRecordLine {
  /** 行号从 1 数，和用户在文本框里数出来的一致。 */
  line: number;
  /** 这一行的原文（已去掉列表符号与首尾空白）。 */
  text: string;
}

export interface ParseResult {
  users: ChatUser[];
  messages: ChatMessage[];
  /**
   * 「写了名字和冒号、却没写内容」的行（例如 `**李四**：`）。
   * 这是唯一一种真的留不下东西的半行：留不下内容，也不能像以前那样悄悄消失。
   */
  skipped: SkippedRecordLine[];
  /**
   * 没写「名字：」、按「接着上一句往下说」收进来的行数。
   *
   * 聊天页对这个宽进：用户在这个框里写的每一行都是他想看到的内容。
   * 但批量导出要拦住「整组都没按格式写」的输入（否则一整段散文会被当成「我」说的话出一张废卡，
   * 而每组都要扣一次额度），所以这个数字要暴露出去给 `validateChat` 用。
   */
  unlabeled: number;
}

/**
 * 一行的预处理与「整行跳过」判定。
 * 收名字那一趟和出消息那一趟必须得出完全一样的结果，所以抽成一处，别在两趟里各写一遍。
 * 标题行（#）、引用行（>）、分隔线（---）是记录文本里的排版标记，不是消息；
 * 时间行由两趟各自单独处理（第一趟只是跳过，第二趟要出一个时间节点）。
 */
function prepareRecordLine(rawLine: string): string | null {
  const line = rawLine.trim();
  if (!line) return null;
  if (/^#+\s/.test(line) || /^>/.test(line) || /^[-=*]{3,}$/.test(line)) return null;
  return line.replace(/^[-*]\s+/, '');
}

function isTimeLine(value: string) {
  return TIME_REG.test(value) || TIME_REG2.test(value) || TIME_REG3.test(value) || TIME_REG4.test(value);
}

export function parseChatRecord(text: string): ParseResult {
  const lines = text.split('\n');
  const orderedNames: string[] = [];
  const seenNames = new Set<string>();
  let hasExplicitSelf = false;

  /** 记下一个说话人（第一趟用）。显式自称只留标记，不进名单。 */
  const registerName = (name: string) => {
    if (!name) return;
    const nameLower = name.toLowerCase();
    if (SELF_ALIASES.has(name) || SELF_ALIASES.has(nameLower)) {
      hasExplicitSelf = true;
    } else if (!seenNames.has(name)) {
      seenNames.add(name);
      orderedNames.push(name);
    }
  };

  // First pass: collect all unique sender names in order
  lines.forEach(rawLine => {
    const line = prepareRecordLine(rawLine);
    if (line === null) return;
    if (MD_TIME_REG.test(line)) return;
    if (isTimeLine(line.replace(/\*\*/g, '').trim())) return;

    const mdMatch = line.match(MD_MSG_REG);
    if (mdMatch) {
      registerName(mdMatch[1].replace(/\s+/g, '').trim());
      return;
    }
    const colonIdx = line.search(/[：:]/);
    if (colonIdx > 0) {
      registerName(line.slice(0, colonIdx).trim().replace(/\*\*/g, ''));
    }
  });

  // Explicit aliases always represent self. Without an alias, preserve the
  // original behavior where the first sender is treated as self.
  const users: ChatUser[] = [];
  let nextId = 1;
  if (hasExplicitSelf) {
    users.push({ id: nextId++, name: '我', avatar: null });
    for (const name of orderedNames) {
      users.push({ id: nextId++, name, avatar: null });
    }
  } else if (orderedNames.length > 0) {
    users.push({ id: nextId++, name: orderedNames[0], avatar: null });
    for (let i = 1; i < orderedNames.length; i++) {
      users.push({ id: nextId++, name: orderedNames[i], avatar: null });
    }
  }

  const nameMap: Record<string, number> = {};
  const selfUser = users[0];
  if (selfUser) {
    SELF_ALIASES.forEach(a => (nameMap[a.toLowerCase()] = selfUser.id));
    nameMap[selfUser.name.toLowerCase()] = selfUser.id;
    for (let i = 1; i < users.length; i++) {
      nameMap[users[i].name.toLowerCase()] = users[i].id;
    }
  }

  // Second pass: parse messages
  const messages: ChatMessage[] = [];
  const skipped: SkippedRecordLine[] = [];
  let unlabeled = 0;
  let msgId = 1;

  /** 名字映射到用户 id：认识的用老的，新名字就地建一位（与解析器一贯的规则一致）。 */
  const senderIdFor = (rawName: string): number => {
    const nameLower = rawName.toLowerCase();
    if (SELF_ALIASES.has(rawName) || SELF_ALIASES.has(nameLower) || nameLower === selfUser?.name.toLowerCase()) {
      return selfUser?.id ?? 1;
    }
    const known = nameMap[nameLower];
    if (known !== undefined) return known;
    const newUser: ChatUser = { id: nextId++, name: rawName, avatar: null };
    users.push(newUser);
    nameMap[nameLower] = newUser.id;
    return newUser.id;
  };

  /** 特殊消息（图片 / 红包 / 转账 / 语音）走各自的类型，其余都是文字。 */
  const pushMessage = (senderId: number, content: string) => {
    const special = parseSpecialContent(content);
    if (special) {
      messages.push({ id: msgId++, type: special.type, senderId, content: special.content, params: special.params });
    } else {
      messages.push({ id: msgId++, type: 'text', senderId, content, params: {} });
    }
  };

  /**
   * 没写「名字：」的那一行该算谁说的：接着上一句的说话人往下说。
   * 时间节点没有真正的说话人（解析器一律记成自己），所以要往回找到最近的一条真实消息。
   * 整段还没人说过话时退回「自己」。
   */
  const fallbackSpeakerId = (): number => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type !== 'time') return messages[i].senderId;
    }
    return selfUser?.id ?? 1;
  };

  lines.forEach((rawLine, index) => {
    const line = prepareRecordLine(rawLine);
    if (line === null) return;

    // Markdown time: **【xxx】**
    const mdTimeMatch = line.match(MD_TIME_REG);
    if (mdTimeMatch) {
      messages.push({ id: msgId++, type: 'time', senderId: selfUser?.id ?? 1, content: mdTimeMatch[1], params: {} });
      return;
    }

    // Plain time
    const stripped = line.replace(/\*\*/g, '').trim();
    if (isTimeLine(stripped)) {
      messages.push({ id: msgId++, type: 'time', senderId: selfUser?.id ?? 1, content: stripped, params: {} });
      return;
    }

    // Markdown message: **Name**：content
    const mdMsgMatch = line.match(MD_MSG_REG);
    if (mdMsgMatch) {
      const rawName = mdMsgMatch[1].replace(/\s+/g, '').trim();
      const rawContent = mdMsgMatch[2].trim();
      // 只 @ 了某个人、别的一个字都没有时不要把整条抹掉：记录文本里的 @ 是顺带的称呼，
      // 不该成为「明明写了一条，导入后却什么都没有」的理由。
      const content = rawContent.replace(/@\S+/g, '').trim() || rawContent;
      pushMessage(senderIdFor(rawName), content);
      return;
    }

    // Plain format: Name：content
    const colonIdx = line.search(/[：:]/);
    if (colonIdx > 0) {
      const rawName = line.slice(0, colonIdx).trim().replace(/\*\*/g, '');
      const content = line.slice(colonIdx + 1).trim();
      // 「写了名字和冒号、却没写内容」是唯一一种真的留不下东西的半行。以前它被静默丢掉，
      // 回执却照样说「导入成功」，所以这里单独记一笔，让回执能说清是哪一行。
      if (!content) {
        skipped.push({ line: index + 1, text: line });
        return;
      }
      pushMessage(senderIdFor(rawName), content);
      return;
    }

    // 剩下的行：没写「名字：」的正文。认不出格式 **不等于** 这一行不该存在——
    // 「在末尾手动加了一条、提示导入成功、可它就是不出现」就是这么来的：
    // 只要这一行里没有冒号，以前整行直接消失。现在按上一句的说话人收进对话里。
    unlabeled += 1;
    messages.push({ id: msgId++, type: 'text', senderId: fallbackSpeakerId(), content: line, params: {} });
  });

  // 整段文本里一个名字都没出现（比如只写了一行不带「名字：」的正文）时 users 是空的，
  // 而消息总得有个说话人：按「第一个出现的用户是自己」的同一套规则补一个「我」，
  // 免得消息指向一个不存在的用户，预览里找不到人。
  if (messages.length > 0 && users.length === 0) {
    users.push({ id: 1, name: '我', avatar: null });
  }

  return { users, messages, skipped, unlabeled };
}

/** 解析按行切，文本消息里带换行会被拆成两条，所以写回时压成一行。 */
function oneLine(value: string) {
  return value.replace(/\s*\r?\n\s*/g, ' ').trim();
}

/**
 * 记录文本里的图片只写 `[图片]` 标记，不写本地 data URL：
 * 一张压缩过的图也有几十万字符，塞进输入框会直接卡住。
 */
function recordImageContent(content: string) {
  const url = content.trim();
  if (!url || url.startsWith('data:') || url.includes('placeholder')) return '[图片]';
  return `[图片]${url}`;
}

/**
 * 把一条消息写回聊天记录的文本格式。规则与上面那组正则一一对应，
 * 所以「写回文本 → 再解析」得到的是同一条消息（见 parser.test.ts 的回环用例）。
 *
 * 加消息的时候顺手把它追加到导入框里：文本是用户唯一能改到消息的地方，
 * 只存进 messages 的话，这条新加的消息就再也改不动了。
 */
export function messageToRecordLine(msg: Omit<ChatMessage, 'id'>, senderName: string): string {
  // 时间节点是居中提示，记录里不带发送人。
  if (msg.type === 'time') return `**【${oneLine(msg.content)}】**`;

  const head = `**${oneLine(senderName) || '我'}**：`;
  if (msg.type === 'image') return head + recordImageContent(msg.content);
  if (msg.type === 'redpacket') return head + `[红包]${oneLine(msg.params.remark || '恭喜发财，大吉大利')}`;
  if (msg.type === 'transfer') return head + `[转账]${oneLine(msg.params.amount || '0')}:${oneLine(msg.params.remark || '转账')}`;
  if (msg.type === 'voice') {
    // 解析端用 parseInt 取秒数，写不出数字就等于这条语音掉回普通文字，所以这里兜到 3 秒。
    const duration = Number.isFinite(msg.params.duration) ? Math.max(1, Math.round(msg.params.duration as number)) : 3;
    const transcript = msg.params.transcript ? oneLine(msg.params.transcript) : '';
    return head + `[语音]${duration}${transcript ? `:${transcript}` : ''}`;
  }
  return head + oneLine(msg.content);
}

/**
 * 新加的一条消息写回记录文本：接到末尾。原来文本是空的就只用这一行，
 * 末尾多余的空行先削掉，免得连点几次「添加」就在文本里堆出一串空白。
 */
export function appendMessageToRecord(text: string, msg: Omit<ChatMessage, 'id'>, senderName: string): string {
  const line = messageToRecordLine(msg, senderName);
  const trimmed = text.replace(/\s+$/, '');
  return trimmed ? `${trimmed}\n${line}` : line;
}

export const EXAMPLE_TEXT = `**【3月1日 14:32】**

**张三**：你好，在忙不？有个事想请你帮个忙[微笑]

**李四**：不忙，怎么了？

**张三**：有个项目需要你帮忙处理下数据

**李四**：你说，尽管开口

**【3月1日 20:18】**

**张三**：资料都发你了，麻烦查收一下

**张三**：[图片]https://picsum.photos/400/300

**李四**：收到，我晚上看看[OK]

**李四**：[红包]辛苦费

**张三**：太感谢了兄弟！[呲牙][强]`;
