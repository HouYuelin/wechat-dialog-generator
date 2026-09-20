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
