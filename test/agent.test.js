const test = require('node:test');
const assert = require('node:assert/strict');

const Agent = require('../src/core/agent');
const { ErrorCodes } = require('../src/protocol/errors');

function createAgentWithMockClient(createResponse) {
  const agent = new Agent({
    llm: {
      apiKey: 'test-key',
      baseURL: 'http://localhost:1234/v1',
      model: 'test-model',
    },
    memory: {
      shortTermMax: 10,
    },
  });

  agent.client = {
    chat: {
      completions: {
        create: createResponse,
      },
    },
  };

  return agent;
}

test('Agent.chat rejects empty user message', async () => {
  const agent = createAgentWithMockClient(async () => {
    throw new Error('should not call LLM');
  });

  const response = await agent.chat('   ');

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, ErrorCodes.MISSING_MESSAGE);
});

test('Agent.chat handles missing choices[0].message', async () => {
  const agent = createAgentWithMockClient(async () => ({ choices: [] }));

  const response = await agent.chat('hello');

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, ErrorCodes.LLM_ERROR);
});

test('Agent.chat handles invalid tool JSON arguments gracefully', async () => {
  // Sau khi fix: parse error KHÔNG crash session — agent báo lỗi cho LLM
  // và tiếp tục loop đến MAX_ROUNDS_EXCEEDED thay vì dừng lại với TOOL_ERROR.
  // Mock luôn trả tool_call với JSON lỗi → agent chạy hết 10 rounds.
  const agent = createAgentWithMockClient(async () => ({
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: {
            name: 'calculator',
            arguments: '{bad json',
          },
        }],
      },
    }],
  }));

  const response = await agent.chat('calculate');

  // Agent không crash — chạy hết rounds rồi mới dừng
  assert.equal(response.status, 'error');
  assert.equal(response.error.code, ErrorCodes.MAX_ROUNDS_EXCEEDED);
});

test('Agent.chat handles max rounds exceeded', async () => {
  const agent = createAgentWithMockClient(async () => ({
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: `call_${Math.random()}`,
          type: 'function',
          function: {
            name: 'calculator',
            arguments: '{"expression":"1+1"}',
          },
        }],
      },
    }],
  }));

  const response = await agent.chat('loop forever');

  assert.equal(response.status, 'error');
  assert.equal(response.error.code, ErrorCodes.MAX_ROUNDS_EXCEEDED);
});