'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Chỉ import _parseResponse để test logic offline — không cần LLM
const { classifyIntent, _parseResponse } = require('../src/core/intent');

// ---------------------------------------------------------------------------
// _parseResponse — unit tests (không cần LLM, không cần network)
// ---------------------------------------------------------------------------

test('_parseResponse: parse "chat" intent thành công', () => {
  const raw = JSON.stringify({ intent: 'chat', reason: 'hỏi thông thường', agents: [] });
  const result = _parseResponse(raw);

  assert.equal(result.intent, 'chat');
  assert.equal(result.reason, 'hỏi thông thường');
  assert.deepEqual(result.agents, []);
});

test('_parseResponse: parse "search" intent thành công', () => {
  const raw = JSON.stringify({ intent: 'search', reason: 'tìm thông tin mới', agents: [] });
  const result = _parseResponse(raw);

  assert.equal(result.intent, 'search');
  assert.deepEqual(result.agents, []);
});

test('_parseResponse: parse "analysis" intent thành công', () => {
  const raw = JSON.stringify({ intent: 'analysis', reason: 'phân tích dữ liệu có sẵn', agents: [] });
  const result = _parseResponse(raw);

  assert.equal(result.intent, 'analysis');
  assert.deepEqual(result.agents, []);
});

test('_parseResponse: "multi" luôn trả agents ["search","analysis"]', () => {
  // Dù model trả agents rỗng, vẫn tự điền đúng
  const raw = JSON.stringify({ intent: 'multi', reason: 'vừa tìm vừa phân tích', agents: [] });
  const result = _parseResponse(raw);

  assert.equal(result.intent, 'multi');
  assert.deepEqual(result.agents, ['search', 'analysis']);
});

test('_parseResponse: strip markdown fences trước khi parse', () => {
  const raw = '```json\n{"intent":"chat","reason":"ok","agents":[]}\n```';
  const result = _parseResponse(raw);

  assert.equal(result.intent, 'chat');
});

test('_parseResponse: fallback về chat khi JSON lỗi', () => {
  const result = _parseResponse('invalid json {{{');

  assert.equal(result.intent, 'chat');
  assert.equal(result.reason, 'parse error');
  assert.deepEqual(result.agents, []);
});

test('_parseResponse: fallback về chat khi intent không hợp lệ', () => {
  const raw = JSON.stringify({ intent: 'unknown_intent', reason: 'lạ', agents: [] });
  const result = _parseResponse(raw);

  assert.equal(result.intent, 'chat');
  assert.equal(result.reason, 'invalid intent');
});

test('_parseResponse: fallback về chat khi thiếu intent field', () => {
  const raw = JSON.stringify({ reason: 'không có intent', agents: [] });
  const result = _parseResponse(raw);

  assert.equal(result.intent, 'chat');
});

test('_parseResponse: reason bị thiếu → trả chuỗi rỗng', () => {
  const raw = JSON.stringify({ intent: 'search', agents: [] });
  const result = _parseResponse(raw);

  assert.equal(result.intent, 'search');
  assert.equal(result.reason, '');
});

// ---------------------------------------------------------------------------
// classifyIntent — integration tests với mock LLM client
// ---------------------------------------------------------------------------

/**
 * Tạo mock client trả về response cố định.
 */
function makeMockClient(intentObj) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [
            { message: { content: JSON.stringify(intentObj) } },
          ],
        }),
      },
    },
  };
}

/**
 * Tạo mock client throw error.
 */
function makeErrorClient(message = 'API error') {
  return {
    chat: {
      completions: {
        create: async () => { throw new Error(message); },
      },
    },
  };
}

test('classifyIntent: trả "chat" từ mock LLM', async () => {
  const client = makeMockClient({ intent: 'chat', reason: 'hỏi thông thường', agents: [] });
  const result = await classifyIntent('xin chào', '', client, 'test-model');

  assert.equal(result.intent, 'chat');
  assert.equal(result.reason, 'hỏi thông thường');
});

test('classifyIntent: trả "search" từ mock LLM', async () => {
  const client = makeMockClient({ intent: 'search', reason: 'cần tìm tin tức', agents: [] });
  const result = await classifyIntent('tin tức AI hôm nay', '', client, 'test-model');

  assert.equal(result.intent, 'search');
  assert.deepEqual(result.agents, []);
});

test('classifyIntent: trả "multi" với agents đầy đủ', async () => {
  const client = makeMockClient({ intent: 'multi', reason: 'tìm và phân tích', agents: [] });
  const result = await classifyIntent(
    'tìm và so sánh các framework JS phổ biến hiện nay',
    '',
    client,
    'test-model'
  );

  assert.equal(result.intent, 'multi');
  assert.deepEqual(result.agents, ['search', 'analysis']);
});

test('classifyIntent: fallback về chat khi LLM throw error', async () => {
  const client = makeErrorClient('network timeout');
  const result = await classifyIntent('test', '', client, 'test-model');

  assert.equal(result.intent, 'chat');
  assert.match(result.reason, /LLM error/);
});

test('classifyIntent: truyền context vào user message', async () => {
  // Kiểm tra client nhận được đúng message chứa context
  let capturedMessages;
  const client = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          capturedMessages = messages;
          return {
            choices: [{ message: { content: JSON.stringify({ intent: 'chat', reason: 'ok', agents: [] }) } }],
          };
        },
      },
    },
  };

  await classifyIntent('câu hỏi mới', 'user hỏi về Node.js trước đó', client, 'test-model');

  const userMsg = capturedMessages.find((m) => m.role === 'user');
  assert.ok(userMsg.content.includes('user hỏi về Node.js trước đó'), 'context phải có trong user message');
  assert.ok(userMsg.content.includes('câu hỏi mới'), 'message gốc phải có trong user message');
});

test('classifyIntent: không truyền context → user message chỉ chứa message gốc', async () => {
  let capturedMessages;
  const client = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          capturedMessages = messages;
          return {
            choices: [{ message: { content: JSON.stringify({ intent: 'chat', reason: 'ok', agents: [] }) } }],
          };
        },
      },
    },
  };

  await classifyIntent('xin chào', '', client, 'test-model');

  const userMsg = capturedMessages.find((m) => m.role === 'user');
  assert.equal(userMsg.content, 'xin chào');
});

test('classifyIntent: model được truyền đúng vào API call', async () => {
  let capturedModel;
  const client = {
    chat: {
      completions: {
        create: async ({ model }) => {
          capturedModel = model;
          return {
            choices: [{ message: { content: JSON.stringify({ intent: 'chat', reason: 'ok', agents: [] }) } }],
          };
        },
      },
    },
  };

  await classifyIntent('test', '', client, 'gemini-2.5-flash');

  assert.equal(capturedModel, 'gemini-2.5-flash');
});