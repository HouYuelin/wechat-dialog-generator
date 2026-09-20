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

interface ParseResult {
  users: ChatUser[];
  messages: ChatMessage[];
}

export function parseChatRecord(text: string): ParseResult {
  const lines = text.split('\n');
  const orderedNames: string[] = [];
  const seenNames = new Set<string>();
  let hasExplicitSelf = false;

  // First pass: collect all unique sender names in order
  lines.forEach(rawLine => {
    let line = rawLine.trim();
    if (!line) return;
    if (/^#+\s/.test(line) || /^>/.test(line) || /^[-=*]{3,}$/.test(line)) return;
    line = line.replace(/^[-*]\s+/, '');
    if (MD_TIME_REG.test(line)) return;
    const stripped = line.replace(/\*\*/g, '').trim();
    if (TIME_REG.test(stripped) || TIME_REG2.test(stripped) || TIME_REG3.test(stripped) || TIME_REG4.test(stripped)) return;

    const mdMatch = line.match(MD_MSG_REG);
    if (mdMatch) {
      const name = mdMatch[1].replace(/\s+/g, '').trim();
      const nameLower = name.toLowerCase();
      if (SELF_ALIASES.has(name) || SELF_ALIASES.has(nameLower)) {
        hasExplicitSelf = true;
      } else if (!seenNames.has(name)) {
        seenNames.add(name);
        orderedNames.push(name);
      }
      return;
    }
    const colonIdx = line.search(/[：:]/);
    if (colonIdx > 0) {
      const name = line.slice(0, colonIdx).trim().replace(/\*\*/g, '');
      const nameLower = name.toLowerCase();
      if (SELF_ALIASES.has(name) || SELF_ALIASES.has(nameLower)) {
        hasExplicitSelf = true;
      } else if (!seenNames.has(name)) {
        seenNames.add(name);
        orderedNames.push(name);
      }
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
  let msgId = 1;

  lines.forEach(rawLine => {
    let line = rawLine.trim();
    if (!line) return;
    if (/^#+\s/.test(line)) return;
    if (/^>/.test(line)) return;
    if (/^[-=*]{3,}$/.test(line)) return;
    line = line.replace(/^[-*]\s+/, '');

    // Markdown time: **【xxx】**
    const mdTimeMatch = line.match(MD_TIME_REG);
    if (mdTimeMatch) {
      messages.push({ id: msgId++, type: 'time', senderId: selfUser?.id ?? 1, content: mdTimeMatch[1], params: {} });
      return;
    }

    // Plain time
    const stripped = line.replace(/\*\*/g, '').trim();
    if (TIME_REG.test(stripped) || TIME_REG2.test(stripped) || TIME_REG3.test(stripped) || TIME_REG4.test(stripped)) {
      messages.push({ id: msgId++, type: 'time', senderId: selfUser?.id ?? 1, content: stripped, params: {} });
      return;
    }

    // Markdown message: **Name**：content
    const mdMsgMatch = line.match(MD_MSG_REG);
    if (mdMsgMatch) {
      const rawName = mdMsgMatch[1].replace(/\s+/g, '').trim();
      let content = mdMsgMatch[2].trim();
      content = content.replace(/@\S+/g, '').trim();
      if (!content) return;
      const nameLower = rawName.toLowerCase();
      let senderId: number;
      if (SELF_ALIASES.has(rawName) || SELF_ALIASES.has(nameLower) || nameLower === selfUser?.name.toLowerCase()) {
        senderId = selfUser?.id ?? 1;
      } else if (nameMap[nameLower] !== undefined) {
        senderId = nameMap[nameLower];
      } else {
        const newUser: ChatUser = { id: nextId++, name: rawName, avatar: null };
        users.push(newUser);
        nameMap[nameLower] = newUser.id;
        senderId = newUser.id;
      }
      const special = parseSpecialContent(content);
      if (special) {
        messages.push({ id: msgId++, type: special.type, senderId, content: special.content, params: special.params });
      } else {
        messages.push({ id: msgId++, type: 'text', senderId, content, params: {} });
      }
      return;
    }

    // Plain format: Name：content
    const colonIdx = line.search(/[：:]/);
    if (colonIdx > 0) {
      const rawName = line.slice(0, colonIdx).trim().replace(/\*\*/g, '');
      const content = line.slice(colonIdx + 1).trim();
      if (!content) return;
      const nameLower = rawName.toLowerCase();
      let senderId: number;
      if (SELF_ALIASES.has(rawName) || SELF_ALIASES.has(nameLower) || nameLower === selfUser?.name.toLowerCase()) {
        senderId = selfUser?.id ?? 1;
      } else if (nameMap[nameLower] !== undefined) {
        senderId = nameMap[nameLower];
      } else {
        const newUser: ChatUser = { id: nextId++, name: rawName, avatar: null };
        users.push(newUser);
        nameMap[nameLower] = newUser.id;
        senderId = newUser.id;
      }
      const special2 = parseSpecialContent(content);
      if (special2) {
        messages.push({ id: msgId++, type: special2.type, senderId, content: special2.content, params: special2.params });
      } else {
        messages.push({ id: msgId++, type: 'text', senderId, content, params: {} });
      }
    }
  });

  return { users, messages };
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

**张三**：你好，在忙不？有个事想请你帮个忙

**李四**：不忙，怎么了？

**张三**：有个项目需要你帮忙处理下数据

**李四**：你说，尽管开口

**【3月1日 20:18】**

**张三**：资料都发你了，麻烦查收一下

**张三**：[图片]https://picsum.photos/400/300

**李四**：收到，我晚上看看

**李四**：[红包]辛苦费

**张三**：太感谢了兄弟！`;
