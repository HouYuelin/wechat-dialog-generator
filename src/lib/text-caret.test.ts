import test from 'node:test';
import assert from 'node:assert/strict';
import { insertAtCaret } from './text-caret';

test('光标在中间：插进去，光标落到插入内容之后', () => {
  assert.deepEqual(insertAtCaret({ value: '你好呀', selectionStart: 2, selectionEnd: 2 }, '[微笑]'), {
    value: '你好[微笑]呀',
    caret: 6,
  });
});

test('选中一段时被替换掉', () => {
  assert.deepEqual(insertAtCaret({ value: '你好呀', selectionStart: 1, selectionEnd: 3 }, '[OK]'), {
    value: '你[OK]',
    caret: 5,
  });
});

test('没聚焦过（selection 为 null）时追加到末尾', () => {
  assert.deepEqual(insertAtCaret({ value: '你好', selectionStart: null, selectionEnd: null }, '[呲牙]'), {
    value: '你好[呲牙]',
    caret: 6,
  });
  assert.deepEqual(insertAtCaret({ value: '你好', selectionStart: 1, selectionEnd: null }, '[呲牙]'), {
    value: '你[呲牙]好',
    caret: 5,
  });
});

test('空输入框与越界的 selection 都不会切坏内容', () => {
  assert.deepEqual(insertAtCaret({ value: '', selectionStart: 0, selectionEnd: 0 }, '[微笑]'), {
    value: '[微笑]',
    caret: 4,
  });
  assert.deepEqual(insertAtCaret({ value: '你好', selectionStart: 99, selectionEnd: 99 }, '[微笑]'), {
    value: '你好[微笑]',
    caret: 6,
  });
  assert.deepEqual(insertAtCaret({ value: '你好', selectionStart: -5, selectionEnd: 1 }, '[微笑]'), {
    value: '[微笑]好',
    caret: 4,
  });
});

test('反选（起点大于终点）按正常区间处理，不会丢字', () => {
  assert.deepEqual(insertAtCaret({ value: 'abcd', selectionStart: 3, selectionEnd: 1 }, 'X'), {
    value: 'aXd',
    caret: 2,
  });
});
