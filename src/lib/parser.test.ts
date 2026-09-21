import assert from 'node:assert/strict';
import test from 'node:test';
import { appendMessageToRecord, messageToRecordLine, parseChatRecord } from './parser';

test('keeps explicit self aliases separate from other participants', () => {
  const result = parseChatRecord(`**【8月12日 上午10:20】**
**我**：周末有空吗
**小林**：有空
**我**：[语音]4`);

  assert.deepEqual(result.users.map((user) => user.name), ['我', '小林']);
  const self = result.users[0];
  const other = result.users[1];
  assert.equal(result.messages[1].senderId, self.id);
  assert.equal(result.messages[2].senderId, other.id);
  assert.equal(result.messages[3].senderId, self.id);
});

test('preserves first-sender-as-self behavior without an explicit alias', () => {
  const result = parseChatRecord(`**张三**：你好
**李四**：你好`);

  assert.deepEqual(result.users.map((user) => user.name), ['张三', '李四']);
  assert.equal(result.messages[0].senderId, result.users[0].id);
  assert.equal(result.messages[1].senderId, result.users[1].id);
});

test('parses optional voice transcription without changing plain voice messages', () => {
  const result = parseChatRecord(`**我**：[语音]5
**小林**：[语音]50:我一会儿找一下他那个平台`);

  assert.equal(result.messages[0].params.duration, 5);
  assert.equal(result.messages[0].params.transcript, undefined);
  assert.equal(result.messages[1].params.duration, 50);
  assert.equal(result.messages[1].params.transcript, '我一会儿找一下他那个平台');
});

const msg = (
  type: 'time' | 'text' | 'image' | 'redpacket' | 'transfer' | 'voice',
  name: string,
  content = '',
  params: { duration?: number; transcript?: string; amount?: string; remark?: string } = {},
) => {
  const message = { id: 1, type, senderId: 1, content, params };
  return messageToRecordLine(message, name);
};

test('每种消息都写回对应的记录格式', () => {
  assert.equal(msg('time', '张三', '3月15日 下午14:00'), '**【3月15日 下午14:00】**');
  assert.equal(msg('text', '李四', '在的，稍等'), '**李四**：在的，稍等');
  assert.equal(msg('image', '李四'), '**李四**：[图片]');
  assert.equal(msg('image', '李四', 'https://a.com/1.png'), '**李四**：[图片]https://a.com/1.png');
  assert.equal(msg('redpacket', '李四', '', { remark: '辛苦费' }), '**李四**：[红包]辛苦费');
  assert.equal(msg('redpacket', '李四'), '**李四**：[红包]恭喜发财，大吉大利');
  assert.equal(msg('transfer', '李四', '', { amount: '88', remark: '还你的' }), '**李四**：[转账]88:还你的');
  assert.equal(msg('voice', '李四', '', { duration: 5 }), '**李四**：[语音]5');
  assert.equal(msg('voice', '李四', '', { duration: 12, transcript: '一会儿说' }), '**李四**：[语音]12:一会儿说');
  // 秒数写不出数字的话，解析端会认成普通文字，所以兜一个默认值。
  assert.equal(msg('voice', '李四', '', { duration: Number.NaN }), '**李四**：[语音]3');
});

test('本地图片只写 [图片] 标记，不把整张图塞进文本框', () => {
  const line = msg('image', '张三', 'data:image/png;base64,AAAA');
  assert.equal(line, '**张三**：[图片]');
  // 解析回来仍是图片消息（占位），用户可以在预览里再点一次选图。
  assert.equal(parseChatRecord(line).messages[0].type, 'image');
});

test('新加的消息接在文本末尾，空文本就直接当整段', () => {
  const added = { id: 1, type: 'text' as const, senderId: 1, content: '再加一句', params: {} };

  assert.equal(appendMessageToRecord('**张三**：你好', added, '李四'), '**张三**：你好\n**李四**：再加一句');
  // 末尾本来就有空行时不会越积越多。
  assert.equal(appendMessageToRecord('**张三**：你好\n\n  ', added, '李四'), '**张三**：你好\n**李四**：再加一句');
  // 文本是空的（刚清空过），这一行就是整段文本。
  assert.equal(appendMessageToRecord('', added, '李四'), '**李四**：再加一句');
  // 接上去的文本仍然能被解析成消息，这是「能改」的前提。
  const parsed = parseChatRecord(appendMessageToRecord('**张三**：你好', added, '李四'));
  assert.deepEqual(parsed.messages.map(item => [item.type, item.content]), [['text', '你好'], ['text', '再加一句']]);
});

test('写回文本再解析，还是同一批消息', () => {
  const source = `**【3月15日 下午14:00】**
**张三**：这周末有空吗
**李四**：[图片]https://a.com/1.png
**李四**：[红包]辛苦费
**李四**：[转账]88:还你的，备注：带冒号
**张三**：[语音]7:我一会儿到
**张三**：那就这么定了`;

  const first = parseChatRecord(source);
  const text = first.messages
    .map(item => messageToRecordLine(item, first.users.find(user => user.id === item.senderId)?.name ?? ''))
    .join('\n');
  const second = parseChatRecord(text);

  assert.deepEqual(second.messages, first.messages);
  assert.deepEqual(second.users.map(user => user.name), first.users.map(user => user.name));
});

test('末尾补一行没写「名字：」的正文不会消失，按上一句的说话人收下', () => {
  const result = parseChatRecord('**张三**：你好\n**李四**：不忙，怎么了？\n谢谢老板');

  assert.deepEqual(result.messages.map(item => [item.type, item.content]), [
    ['text', '你好'],
    ['text', '不忙，怎么了？'],
    ['text', '谢谢老板'],
  ]);
  // 接在「李四」后面，所以这句也算李四说的。
  assert.equal(result.messages[2].senderId, result.messages[1].senderId);
  assert.equal(result.unlabeled, 1);
  assert.deepEqual(result.skipped, []);
});

test('一行里没有冒号也不会丢：加粗名字、只有空格分隔这些写法都保留下来', () => {
  const result = parseChatRecord('**张三**：你好\n**李四** 好的\n【王五】收到');

  assert.deepEqual(result.messages.map(item => item.content), ['你好', '**李四** 好的', '【王五】收到']);
  assert.equal(result.unlabeled, 2);
});

test('只 @ 了某个人也要留下这一条，不因为过滤 @ 就整条没了', () => {
  const result = parseChatRecord('**李四**：@张三');

  assert.deepEqual(result.messages.map(item => [item.type, item.content]), [['text', '@张三']]);
  assert.equal(result.unlabeled, 0);
  // @ 后面还有正文时，@ 这个称呼仍然按老规矩去掉。
  assert.equal(parseChatRecord('**李四**：@张三 你看下').messages[0].content, '你看下');
});

test('只写了名字没写内容的半行记进 skipped，并带上行号（行号从 1 数）', () => {
  const result = parseChatRecord('**张三**：你好\n\n**李四**：\n**张三**：在的');

  assert.deepEqual(result.skipped, [{ line: 3, text: '**李四**：' }]);
  assert.deepEqual(result.messages.map(item => item.content), ['你好', '在的']);
});

test('整段只有一行正文时补出一个说话人，消息不会指向不存在的用户', () => {
  const result = parseChatRecord('大家好，我先说一句');

  assert.deepEqual(result.users.map(user => user.name), ['我']);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].senderId, result.users[0].id);
});

test('时间节点不算说话人：兜底的那行接在它前面最近的一条真实消息上', () => {
  const result = parseChatRecord('**张三**：你好\n**【3月1日 14:32】**\n接着聊');

  assert.equal(result.messages[1].type, 'time');
  assert.equal(result.messages[2].senderId, result.messages[0].senderId);
});

test('认不出格式的行不影响本来就认得出的那些：文字、图片、时间各归各位', () => {
  const result = parseChatRecord('**【3月1日 14:32】**\n**张三**：你好\n随手写的一句\n**李四**：[图片]\n再说一句');

  assert.deepEqual(result.messages.map(item => [item.type, item.content]), [
    ['time', '3月1日 14:32'],
    ['text', '你好'],
    ['text', '随手写的一句'],
    ['image', '/placeholder-image.png'],
    ['text', '再说一句'],
  ]);
  assert.equal(result.unlabeled, 2);
  // 兜底那两行分别接在张三与李四后面。
  assert.equal(result.messages[2].senderId, result.messages[1].senderId);
  assert.equal(result.messages[4].senderId, result.messages[3].senderId);
});
