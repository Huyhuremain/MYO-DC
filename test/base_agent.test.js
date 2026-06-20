'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { BaseAgent } = require('../src/core/base_agent');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mock client trả final answer ngay (không có tool_calls).
 */
function makeTextClient(replyText) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { role: 'assistant', content: replyText, tool_calls: null } }],
        }),
      },
    },
  };
}

/**
 * Mock client trả tool_calls ở round đầu, rồi final answer ở round sau.
 */
function makeToolClient(toolName, toolArgs, finalReply) {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: async () => {
          callCount++;
          if (callCount === 1) {
            return {
              choices: [{
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [{
                    id: 'call_001',
                    type: 'function',
                    function: { name: toolName, arguments: JSON.stringify(toolArgs) },
                  }],
                },
              }],
            };
          }
          // Round 2: final answer
          return {
            choices: [{ message: { role: 'assistant', content: finalReply, tool_calls: null } }],
          };
        },
      },
    },
  };
}

/**
 * Mock client throw error ngay lần đầu.
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

/**
 * Mock client trả tool_calls mãi mãi → trigger maxRounds.
 */
function makeInfiniteToolClient(toolName) {
  return {
    chat: {
      completions: {
        create: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: `call_${Date.now()}`,
                type: 'function',
                function: { name: toolName, arguments: '{}' },
              }],
            },
          }],
        }),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests: constructor
// ---------------------------------------------------------------------------

test('BaseAgent: khởi tạo với đúng properties', () => {
  const client = makeTextClient('hi');
  const agent = new BaseAgent(client, 'test-model', ['web_scraper'], { agentName: 'TestAgent' });

  assert.equal(agent.model, 'test-model');
  assert.deepEqual(agent.toolNames, ['web_scraper']);
  assert.equal(agent.agentName, 'TestAgent');
});

test('BaseAgent: agentName mặc định là "BaseAgent"', () => {
  const agent = new BaseAgent(makeTextClient('hi'), 'model', []);
  assert.equal(agent.agentName, 'BaseAgent');
});

test('BaseAgent: maxRounds mặc định là 8', () => {
  const agent = new BaseAgent(makeTextClient('hi'), 'model', []);
  assert.equal(agent.maxRounds, 8);
});

test('BaseAgent: maxRounds có thể override', () => {
  const agent = new BaseAgent(makeTextClient('hi'), 'model', [], { maxRounds: 3 });
  assert.equal(agent.maxRounds, 3);
});

// ---------------------------------------------------------------------------
// Tests: run() — no tools
// ---------------------------------------------------------------------------

test('BaseAgent.run: trả kết quả string khi LLM reply ngay', async () => {
  const agent = new BaseAgent(makeTextClient('Kết quả tìm kiếm'), 'model', []);
  const result = await agent.run('Tìm kiếm X');

  assert.equal(result, 'Kết quả tìm kiếm');
});

test('BaseAgent.run: task được đưa vào user message', async () => {
  let capturedMessages;
  const client = {
    chat: { completions: { create: async ({ messages }) => {
      capturedMessages = messages;
      return { choices: [{ message: { content: 'ok', tool_calls: null } }] };
    }}},
  };

  const agent = new BaseAgent(client, 'model', []);
  await agent.run('Phân tích dữ liệu này');

  const userMsg = capturedMessages.find((m) => m.role === 'user');
  assert.equal(userMsg.content, 'Phân tích dữ liệu này');
});

test('BaseAgent.run: context được inject vào system prompt', async () => {
  let capturedMessages;
  const client = {
    chat: { completions: { create: async ({ messages }) => {
      capturedMessages = messages;
      return { choices: [{ message: { content: 'ok', tool_calls: null } }] };
    }}},
  };

  const agent = new BaseAgent(client, 'model', []);
  await agent.run('task', 'context quan trọng');

  const systemMsg = capturedMessages.find((m) => m.role === 'system');
  assert.ok(systemMsg.content.includes('context quan trọng'), 'context phải có trong system prompt');
});

test('BaseAgent.run: không có context → system prompt không có "Ngữ cảnh"', async () => {
  let capturedMessages;
  const client = {
    chat: { completions: { create: async ({ messages }) => {
      capturedMessages = messages;
      return { choices: [{ message: { content: 'ok', tool_calls: null } }] };
    }}},
  };

  const agent = new BaseAgent(client, 'model', []);
  await agent.run('task');

  const systemMsg = capturedMessages.find((m) => m.role === 'system');
  assert.ok(!systemMsg.content.includes('Ngữ cảnh:'), 'không có context thì không nên có label');
});

test('BaseAgent.run: không truyền tools vào API call khi toolNames rỗng', async () => {
  let capturedParams;
  const client = {
    chat: { completions: { create: async (params) => {
      capturedParams = params;
      return { choices: [{ message: { content: 'ok', tool_calls: null } }] };
    }}},
  };

  const agent = new BaseAgent(client, 'model', []);
  await agent.run('task');

  assert.equal(capturedParams.tools, undefined, 'tools không được truyền khi toolNames rỗng');
  assert.equal(capturedParams.tool_choice, undefined);
});

test('BaseAgent.run: throw khi LLM error', async () => {
  const agent = new BaseAgent(makeErrorClient('timeout'), 'model', []);

  await assert.rejects(
    () => agent.run('task'),
    (err) => {
      assert.match(err.message, /LLM call failed/);
      assert.match(err.message, /timeout/);
      return true;
    }
  );
});

test('BaseAgent.run: throw khi LLM trả response không hợp lệ', async () => {
  const client = {
    chat: { completions: { create: async () => ({ choices: [] }) } },
  };
  const agent = new BaseAgent(client, 'model', []);

  await assert.rejects(
    () => agent.run('task'),
    /response không hợp lệ/
  );
});

// ---------------------------------------------------------------------------
// Tests: run() — với tools (mock executeTool qua module mock)
// ---------------------------------------------------------------------------

test('BaseAgent.run: tool_calls được thực thi và kết quả đưa vào messages', async () => {
  const fakeToolsModule = () => ({
    getToolDefinitions: () => [{
      type: 'function',
      function: { name: 'web_scraper', description: 'scrape', parameters: {} },
    }],
    executeTool: async (name) => `result_of_${name}`,
  });

  const client = makeToolClient('web_scraper', { url: 'http://example.com' }, 'Đã tìm thấy kết quả');
  const agent = new BaseAgent(client, 'model', ['web_scraper'], {
    agentName: 'TestSearch',
    _toolsModule: fakeToolsModule,
  });

  const result = await agent.run('Tìm thông tin về X');
  assert.equal(result, 'Đã tìm thấy kết quả');
});

// ---------------------------------------------------------------------------
// Tests: _executeToolCall — permission check
// ---------------------------------------------------------------------------

test('BaseAgent._executeToolCall: từ chối tool không có trong toolNames', async () => {
  const agent = new BaseAgent(makeTextClient('hi'), 'model', ['web_scraper']);

  const fakeToolCall = {
    id: 'call_001',
    function: { name: 'calculator', arguments: '{}' },
  };

  const result = await agent._executeToolCall(fakeToolCall);
  assert.match(result, /Permission error/);
  assert.match(result, /calculator/);
});

test('BaseAgent._executeToolCall: trả parse error khi arguments invalid JSON', async () => {
  const agent = new BaseAgent(makeTextClient('hi'), 'model', ['web_scraper']);

  const fakeToolCall = {
    id: 'call_001',
    function: { name: 'web_scraper', arguments: 'not-valid-json{{{' },
  };

  const result = await agent._executeToolCall(fakeToolCall);
  assert.match(result, /Parse error/);
});

// ---------------------------------------------------------------------------
// Tests: maxRounds exceeded
// ---------------------------------------------------------------------------

test('BaseAgent.run: throw khi vượt maxRounds', async () => {
  const fakeToolsModule = () => ({
    getToolDefinitions: () => [{
      type: 'function',
      function: { name: 'web_scraper', description: '', parameters: {} },
    }],
    executeTool: async () => 'some result',
  });

  const client = makeInfiniteToolClient('web_scraper');
  const agent = new BaseAgent(client, 'model', ['web_scraper'], {
    maxRounds: 2,
    _toolsModule: fakeToolsModule,
  });

  await assert.rejects(
    () => agent.run('task'),
    /Vượt quá 2 rounds/
  );
});

// ---------------------------------------------------------------------------
// Tests: _buildSystemPrompt
// ---------------------------------------------------------------------------

test('BaseAgent._buildSystemPrompt: không có context', () => {
  const agent = new BaseAgent(makeTextClient(''), 'model', []);
  const prompt = agent._buildSystemPrompt('');

  assert.ok(prompt.length > 0);
  assert.ok(!prompt.includes('Ngữ cảnh:'));
});

test('BaseAgent._buildSystemPrompt: có context thì append vào cuối', () => {
  const agent = new BaseAgent(makeTextClient(''), 'model', []);
  const prompt = agent._buildSystemPrompt('thông tin quan trọng');

  assert.ok(prompt.includes('Ngữ cảnh:'));
  assert.ok(prompt.includes('thông tin quan trọng'));
});