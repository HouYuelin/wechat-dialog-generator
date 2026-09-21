import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emojiCharOf,
  emojiGroupOrder,
  emojiTag,
  emojisOfGroup,
  emojiGroupLabels,
  hasEmoji,
  isEmojiTag,
  maxRecentEmoji,
  normalizeRecentEmoji,
  splitEmoji,
  touchRecentEmoji,
  wechatEmoji,
} from './wechat-emoji';
import { messageToRecordLine, parseChatRecord } from './parser';

const charsOf = (emojis: { char: string }[]) => emojis.map(entry => entry.char);

test('表情表：标签名唯一、字符都是 emoji，分组覆盖整张表', () => {
  const names = wechatEmoji.map(entry => entry.name);
  assert.equal(new Set(names).size, names.length, '同一个标签名不能出现两次');
  assert.ok(names.length >= 120, '微信那套表情大部分都能认，表不该只有几十条');
  // 同一张脸出现在两三个标签下是允许的（见模块注释），但整张表不该塌成十几个字符。
  assert.ok(new Set(charsOf(wechatEmoji)).size > 90, '表情字符的区分度过低，多半是复制粘贴时串了');

  for (const entry of wechatEmoji) {
    assert.ok(entry.name.length > 0 && entry.name.length <= 8, `标签名长度异常：${entry.name}`);
    assert.ok(entry.char.length > 0, `${entry.name} 没有配表情`);
    assert.ok(!/[\n\r]/.test(entry.char), `${entry.name} 的表情里混进了换行`);
    // 表情字符必须以 emoji 开头——写错成汉字或字母时要在这里露出来。
    assert.ok(/^\p{Emoji}/u.test(entry.char), `${entry.name} 配的不是 emoji：${entry.char}`);
  }

  const grouped = emojiGroupOrder.flatMap(group => emojisOfGroup(group));
  assert.equal(grouped.length, wechatEmoji.length, '每个表情都应当落在某个分组里');
  for (const group of emojiGroupOrder) assert.ok(emojiGroupLabels[group], `${group} 缺分组名`);
});

test('记录格式的特殊前缀不会被当成表情', () => {
  // 这四个是 parser 的特殊消息语法，收进表情表会两套语义打架。
  for (const reserved of ['图片', '红包', '转账', '语音']) {
    assert.equal(isEmojiTag(reserved), false, `${reserved} 不该出现在表情表里`);
  }
  assert.deepEqual(splitEmoji('[图片]https://example.com/a.png'), [
    { type: 'text', value: '[图片]https://example.com/a.png' },
  ]);
});

test('splitEmoji：认得出标签，也认得和文字混排、连续多个标签', () => {
  assert.deepEqual(splitEmoji('[微笑]'), [{ type: 'emoji', name: '微笑', char: '😊' }]);
  assert.deepEqual(splitEmoji('今天真开心[呲牙]'), [
    { type: 'text', value: '今天真开心' },
    { type: 'emoji', name: '呲牙', char: '😁' },
  ]);
  assert.deepEqual(splitEmoji('[微笑][微笑]你好'), [
    { type: 'emoji', name: '微笑', char: '😊' },
    { type: 'emoji', name: '微笑', char: '😊' },
    { type: 'text', value: '你好' },
  ]);
  // 标签在结尾、在开头、夹在中间，都要能切干净（不能把前后文字吞掉或多切一段空的）。
  assert.deepEqual(splitEmoji('先[偷笑]后'), [
    { type: 'text', value: '先' },
    { type: 'emoji', name: '偷笑', char: '🤭' },
    { type: 'text', value: '后' },
  ]);
  assert.deepEqual(splitEmoji('「[OK]」'), [
    { type: 'text', value: '「' },
    { type: 'emoji', name: 'OK', char: '👌' },
    { type: 'text', value: '」' },
  ]);
  assert.equal(hasEmoji('没表情的一句话'), false);
  assert.equal(hasEmoji('这句话是[憨笑]的'), true);
});

test('splitEmoji：认不出来的方括号原样留在文字里', () => {
  const cases = [
    '[待办]记得回款',
    '[这是一个很长的说明]',
    '[]',
    '[微笑 ]',
    '[ 微笑]',
    '[微笑',
    '看看[链接](https://example.com)',
    '[某个新标签]',
  ];
  for (const value of cases) {
    assert.deepEqual(splitEmoji(value), [{ type: 'text', value }], `${value} 不该被改写`);
  }
  assert.deepEqual(splitEmoji(''), []);
});

test('splitEmoji：文本里的尖括号原样保留，不承担转义职责', () => {
  // 转义交给渲染层（EmojiText 走 React 元素），这里不能顺手把 < > 换掉，
  // 否则「文本 → 解析」的回环会把用户写的字符改掉。
  const parts = splitEmoji('<b>加粗</b>[嘘]');
  assert.deepEqual(parts, [
    { type: 'text', value: '<b>加粗</b>' },
    { type: 'emoji', name: '嘘', char: '🤫' },
  ]);
});

test('表情标签写回记录文本后能原样解析回来', () => {
  const line = messageToRecordLine({ type: 'text', senderId: 1, content: '好的[OK]', params: {} }, '张三');
  assert.equal(line, '**张三**：好的[OK]');
  const parsed = parseChatRecord(line);
  assert.equal(parsed.messages.length, 1);
  assert.equal(parsed.messages[0].type, 'text');
  assert.equal(parsed.messages[0].content, '好的[OK]');
});

test('表情标签不会抢走特殊消息：一行里带标签的转账仍是转账', () => {
  const parsed = parseChatRecord('**张三**：[转账]88.88:还你[呲牙]');
  assert.equal(parsed.messages[0].type, 'transfer');
  assert.equal(parsed.messages[0].params.amount, '88.88');
  assert.equal(parsed.messages[0].params.remark, '还你[呲牙]');
});

test('normalizeRecentEmoji：不是数组、脏数据、重复项、超长都要收拾干净', () => {
  assert.deepEqual(normalizeRecentEmoji(null), []);
  assert.deepEqual(normalizeRecentEmoji('微笑'), []);
  assert.deepEqual(normalizeRecentEmoji([1, '微笑', '', null, '不存在的标签']), ['微笑']);
  assert.deepEqual(normalizeRecentEmoji(['呲牙', '微笑', '呲牙']), ['呲牙', '微笑']);
  assert.equal(normalizeRecentEmoji(wechatEmoji.map(entry => entry.name), 5).length, 5);
  assert.equal(normalizeRecentEmoji(wechatEmoji.map(entry => entry.name)).length, maxRecentEmoji);
});

test('touchRecentEmoji：点过的排最前，同一引用用于跳过写库', () => {
  const list = ['微笑', '呲牙'];
  assert.deepEqual(touchRecentEmoji(list, 'OK'), ['OK', '微笑', '呲牙']);
  assert.deepEqual(touchRecentEmoji(list, '呲牙'), ['呲牙', '微笑']);
  // 已经在最前面：原数组原样返回，调用方据此不写本地存储。
  assert.equal(touchRecentEmoji(list, '微笑'), list);
  // 不认识的标签一个字都不动。
  assert.equal(touchRecentEmoji(list, '不存在'), list);

  const grown = Array.from({ length: maxRecentEmoji }, (_, index) => wechatEmoji[index].name);
  const next = touchRecentEmoji(grown, '旺柴');
  assert.equal(next.length, maxRecentEmoji);
  assert.equal(next[0], '旺柴');
  assert.ok(!next.includes(grown[grown.length - 1]), '超上限时从尾部删');
});

test('emojiTag / emojiCharOf / isEmojiTag 三处口径一致', () => {
  assert.equal(emojiTag('微笑'), '[微笑]');
  assert.equal(emojiCharOf('微笑'), '😊');
  assert.equal(emojiCharOf('不存在'), undefined);
  assert.equal(isEmojiTag('旺柴'), true);
  assert.equal(isEmojiTag('旺财'), false);
});
