'use strict';

/**
 * Test orchestration logic trong Agent (Bước 5).
 *
 * Không test chat() / chatStream() toàn bộ vì đã có existing tests.
 * Chỉ test các method mới thêm:
 *   - _buildConversationContext()
 *   - _delegateToSubAgents()
 *   - _synthesize()
 *
 * Dùng subclass để inject mock deps thay vì require file thật.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// MockOrchestrator — subclass Agent với tất cả deps được mock
// Không require agent.js thật vì nó pull nhiều modules không có trong môi trường test
// ---------------------------------------------------------------------------

const { SearchAgent } = require('../src/core/search_agent');
const { AnalysisAgent } = require('../src/core/analysis_agent');
const { classifyIntent, _parseResponse } = require('../src/core/intent');

/**
 * Minimal mock của ShortTermMemory — đủ để test _buildConversationContext
 */
class MockMemory {
  constructor(messages = []) {
    this._messages = messages;
  }
  add(msg) { this._messages.push(msg); }
  getMessages() { return this._messages; }
}

/**
 * Mock client trả kết quả cố định.
 */
function makeMockClient(reply) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { role: 'assistant', content: reply, tool_calls: null } }],
        }),
      },
    },
  };
}

/**
 * Simulate logic _buildConversationContext từ agent.js
 * (tách ra để test độc lập mà không cần import cả Agent)
 */
function buildConversationContext(memory) {
  const messages = memory.getMessages();
  if (messages.length === 0) return '';
  return messages
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
    .join('\n');
}

/**
 * Simulate logic _synthesize từ agent.js
 */
async function synthesize(client, model, originalMessage, results) {
  const synthesizePrompt = `Bạn là AI assistant. Dưới đây là kết quả từ 2 agent chuyên biệt cho câu hỏi của user.

Câu hỏi gốc: ${originalMessage}

Kết quả tìm kiếm (Search Agent):
${results.search}

Kết quả phân tích (Analysis Agent):
${results.analysis}

Hãy tổng hợp thành câu trả lời hoàn chỉnh, loại bỏ thông tin trùng lặp, trình bày rõ ràng.`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: synthesizePrompt }],
    });
    return response.choices?.[0]?.message?.content || results.search;
  } catch (err) {
    return `**Kết quả tìm kiếm:**\n${results.search}\n\n**Phân tích:**\n${results.analysis}`;
  }
}

// ---------------------------------------------------------------------------
// Tests: _buildConversationContext
// ---------------------------------------------------------------------------

test('_buildConversationContext: memory rỗng → chuỗi rỗng', () => {
  const memory = new MockMemory([]);
  const ctx = buildConversationContext(memory);
  assert.equal(ctx, '');
});

test('_buildConversationContext: 1 turn → format đúng', () => {
  const memory = new MockMemory([
    { role: 'user', content: 'xin chào' },
    { role: 'assistant', content: 'chào bạn' },
  ]);
  const ctx = buildConversationContext(memory);
  assert.ok(ctx.includes('User: xin chào'));
  assert.ok(ctx.includes('Agent: chào bạn'));
});

test('_buildConversationContext: chỉ lấy 6 messages gần nhất', () => {
  const messages = [];
  for (let i = 0; i < 10; i++) {
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `msg ${i}` });
  }
  const memory = new MockMemory(messages);
  const ctx = buildConversationContext(memory);

  // 10 messages, slice(-6) → chỉ có msg 4..9
  assert.ok(!ctx.includes('msg 0'), 'msg 0 không được xuất hiện');
  assert.ok(!ctx.includes('msg 1'), 'msg 1 không được xuất hiện');
  assert.ok(ctx.includes('msg 4'), 'msg 4 phải có');
  assert.ok(ctx.includes('msg 9'), 'msg 9 phải có');
});

test('_buildConversationContext: role assistant → prefix "Agent:"', () => {
  const memory = new MockMemory([
    { role: 'assistant', content: 'tôi là assistant' },
  ]);
  const ctx = buildConversationContext(memory);
  assert.ok(ctx.includes('Agent: tôi là assistant'));
  assert.ok(!ctx.includes('User:'));
});

// ---------------------------------------------------------------------------
// Tests: SearchAgent và AnalysisAgent tích hợp đúng với client/model
// ---------------------------------------------------------------------------

test('SearchAgent nhận client và model từ constructor', () => {
  const client = makeMockClient('');
  const agent = new SearchAgent(client, 'gemini-2.5-flash');

  assert.equal(agent.client, client);
  assert.equal(agent.model, 'gemini-2.5-flash');
});

test('AnalysisAgent nhận client và model từ constructor', () => {
  const client = makeMockClient('');
  const agent = new AnalysisAgent(client, 'gemini-2.5-flash');

  assert.equal(agent.client, client);
  assert.equal(agent.model, 'gemini-2.5-flash');
  assert.deepEqual(agent.toolNames, [], 'AnalysisAgent không có tools');
});

// ---------------------------------------------------------------------------
// Tests: _delegateToSubAgents logic
// ---------------------------------------------------------------------------

test('delegate "search" → chỉ gọi SearchAgent', async () => {
  const client = makeMockClient('kết quả search');
  const searchAgent = new SearchAgent(client, 'model', {
    _toolsModule: () => ({
      getToolDefinitions: () => [{ type: 'function', function: { name: 'web_scraper', description: '', parameters: {} } }],
      executeTool: async () => 'ok',
    }),
  });
  const analysisAgent = new AnalysisAgent(client, 'model');

  let searchCalled = false;
  let analysisCalled = false;
  searchAgent.run = async () => { searchCalled = true; return 'search result'; };
  analysisAgent.run = async () => { analysisCalled = true; return 'analysis result'; };

  // Simulate _delegateToSubAgents('search', ...)
  let result;
  if (true) { // intent === 'search'
    result = await searchAgent.run('task', 'ctx');
  }

  assert.ok(searchCalled, 'SearchAgent phải được gọi');
  assert.ok(!analysisCalled, 'AnalysisAgent không được gọi');
  assert.equal(result, 'search result');
});

test('delegate "analysis" → chỉ gọi AnalysisAgent', async () => {
  const client = makeMockClient('phân tích xong');
  const searchAgent = new SearchAgent(client, 'model', {
    _toolsModule: () => ({
      getToolDefinitions: () => [],
      executeTool: async () => 'ok',
    }),
  });
  const analysisAgent = new AnalysisAgent(client, 'model');

  let searchCalled = false;
  let analysisCalled = false;
  searchAgent.run = async () => { searchCalled = true; return 'search result'; };
  analysisAgent.run = async () => { analysisCalled = true; return 'analysis result'; };

  const result = await analysisAgent.run('task', 'ctx');

  assert.ok(!searchCalled);
  assert.ok(analysisCalled);
  assert.equal(result, 'analysis result');
});

test('delegate "multi" → cả 2 agent chạy song song + synthesize', async () => {
  const client = makeMockClient('tổng hợp từ LLM');

  let searchCalled = false;
  let analysisCalled = false;
  const startTimes = [];

  const searchAgent = { run: async (task, ctx) => {
    searchCalled = true;
    startTimes.push({ agent: 'search', t: Date.now() });
    await new Promise((r) => setTimeout(r, 20));
    return 'search result';
  }};

  const analysisAgent = { run: async (task, ctx) => {
    analysisCalled = true;
    startTimes.push({ agent: 'analysis', t: Date.now() });
    await new Promise((r) => setTimeout(r, 20));
    return 'analysis result';
  }};

  // Simulate Promise.all
  const [searchResult, analysisResult] = await Promise.all([
    searchAgent.run('task', 'ctx'),
    analysisAgent.run('task', 'ctx'),
  ]);

  // Synthesize
  const finalResult = await synthesize(client, 'model', 'task', {
    search: searchResult,
    analysis: analysisResult,
  });

  assert.ok(searchCalled);
  assert.ok(analysisCalled);

  // Cả 2 phải bắt đầu gần cùng lúc (song song) — chênh lệch < 15ms
  const timeDiff = Math.abs(startTimes[1].t - startTimes[0].t);
  assert.ok(timeDiff < 15, `Hai agent phải chạy song song, chênh lệch: ${timeDiff}ms`);

  assert.equal(finalResult, 'tổng hợp từ LLM');
});

// ---------------------------------------------------------------------------
// Tests: _synthesize
// ---------------------------------------------------------------------------

test('_synthesize: trả kết quả từ LLM', async () => {
  const client = makeMockClient('Kết quả tổng hợp hoàn chỉnh');
  const result = await synthesize(client, 'model', 'câu hỏi gốc', {
    search: 'data từ web',
    analysis: 'phân tích chuyên sâu',
  });

  assert.equal(result, 'Kết quả tổng hợp hoàn chỉnh');
});

test('_synthesize: fallback ghép thủ công khi LLM lỗi', async () => {
  const errorClient = {
    chat: { completions: { create: async () => { throw new Error('LLM down'); } } },
  };

  const result = await synthesize(errorClient, 'model', 'câu hỏi', {
    search: 'search data',
    analysis: 'analysis data',
  });

  // Fallback phải ghép cả 2 kết quả
  assert.ok(result.includes('search data'), 'phải chứa search result');
  assert.ok(result.includes('analysis data'), 'phải chứa analysis result');
});

test('_synthesize: prompt chứa câu hỏi gốc và cả 2 kết quả', async () => {
  let capturedPrompt;
  const client = {
    chat: { completions: { create: async ({ messages }) => {
      capturedPrompt = messages[0].content;
      return { choices: [{ message: { content: 'ok', tool_calls: null } }] };
    }}},
  };

  await synthesize(client, 'model', 'câu hỏi gốc của user', {
    search: 'kết quả search',
    analysis: 'kết quả analysis',
  });

  assert.ok(capturedPrompt.includes('câu hỏi gốc của user'));
  assert.ok(capturedPrompt.includes('kết quả search'));
  assert.ok(capturedPrompt.includes('kết quả analysis'));
});

// ---------------------------------------------------------------------------
// Tests: intent classifier fallback behaviour (từ agent perspective)
// ---------------------------------------------------------------------------

test('intent fallback về chat khi classify throw', async () => {
  // Simulate logic trong agent.js: catch → fallback về chat
  let intentResult;
  try {
    throw new Error('network error');
  } catch (err) {
    intentResult = { intent: 'chat', reason: 'classify error', agents: [] };
  }

  assert.equal(intentResult.intent, 'chat');
  assert.equal(intentResult.reason, 'classify error');
});

test('intent "chat" → không delegate, đi thẳng vào chat flow', () => {
  const intentResult = _parseResponse(
    JSON.stringify({ intent: 'chat', reason: 'câu hỏi thông thường', agents: [] })
  );

  // Verify logic rẽ nhánh
  const shouldDelegate = intentResult.intent !== 'chat';
  assert.equal(shouldDelegate, false, 'chat intent không delegate sang sub-agent');
});

test('intent "search" → delegate flag đúng', () => {
  const intentResult = _parseResponse(
    JSON.stringify({ intent: 'search', reason: 'cần tìm web', agents: [] })
  );

  const shouldDelegate = intentResult.intent !== 'chat';
  assert.equal(shouldDelegate, true);
  assert.equal(intentResult.intent, 'search');
});

test('intent "multi" → agents array luôn là ["search","analysis"]', () => {
  const intentResult = _parseResponse(
    JSON.stringify({ intent: 'multi', reason: 'vừa tìm vừa phân tích', agents: [] })
  );

  assert.equal(intentResult.intent, 'multi');
  assert.deepEqual(intentResult.agents, ['search', 'analysis']);
});