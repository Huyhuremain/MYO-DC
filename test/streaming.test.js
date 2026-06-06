const test = require('node:test');
const assert = require('node:assert/strict');

const Agent = require('../src/core/agent');
const { ErrorCodes } = require('../src/protocol/errors');

function createAgentWithMockStream(mockStream) {
  const agent = new Agent({
    llm: { apiKey: 'test-key', baseURL: 'http://localhost:1234/v1', model: 'test-model' },
    memory: { shortTermMax: 10 },
    embedding: {},
    compaction: { threshold: 100 },
  });

  agent.client = {
    chat: {
      completions: { create: mockStream },
    },
    embeddings: { create: async () => { throw new Error('no embedding'); } },
  };

  return agent;
}

function mockTextStream(tokens) {
  return async function*() {
    for (const token of tokens) {
      yield { choices: [{ delta: { content: token } }] };
    }
  };
}

test('chatStream yields tokens for simple reply', async () => {
  const agent = createAgentWithMockStream(async () => ({
    // Simulate async iterable for stream mode
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: 'Xin' } }] };
      yield { choices: [{ delta: { content: ' chào' } }] };
      yield { choices: [{ delta: { content: ' bạn!' } }] };
      yield { choices: [{ delta: {} }] };
    },
  }));

  const events = [];
  for await (const event of agent.chatStream('hello')) {
    events.push(event);
  }

  const tokens = events.filter((e) => e.type === 'token');
  const done = events.find((e) => e.type === 'done');

  assert.equal(tokens.length, 3);
  assert.equal(tokens[0].text, 'Xin');
  assert.equal(tokens[1].text, ' chào');
  assert.equal(tokens[2].text, ' bạn!');
  assert.ok(done);
  assert.equal(done.reply, 'Xin chào bạn!');
});

test('chatStream yields error for empty message', async () => {
  const agent = createAgentWithMockStream(async () => {
    throw new Error('should not call');
  });

  const events = [];
  for await (const event of agent.chatStream('   ')) {
    events.push(event);
  }

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'error');
  assert.equal(events[0].error.code, ErrorCodes.MISSING_MESSAGE);
});

test('chatStream yields error when LLM fails', async () => {
  const agent = createAgentWithMockStream(async () => {
    throw new Error('API rate limit');
  });

  const events = [];
  for await (const event of agent.chatStream('hello')) {
    events.push(event);
  }

  const err = events.find((e) => e.type === 'error');
  assert.ok(err);
  assert.equal(err.error.code, ErrorCodes.LLM_ERROR);
  assert.ok(err.error.message.includes('API rate limit'));
});

test('chatStream yields tool_call and tool_result events', async () => {
  const agent = createAgentWithMockStream(async function*() {
    // First: LLM returns tool call
    yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'calculator', arguments: '' } }] } }] };
    yield { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"expr' } }] } }] };
    yield { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ession":"1+1"}' } }] } }] };
    // Second call returns text (no stream — need second invocation)
    // For simplicity, we return after tool call
  });

  // Mock second LLM call (after tool result) to return text
  let callCount = 0;
  const originalCreate = agent.client.chat.completions.create;
  agent.client.chat.completions.create = async function*() {
    callCount++;
    if (callCount === 1) {
      yield { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'calculator', arguments: '' } }] } }] };
      yield { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"expression":"1+1"}' } }] } }] };
    } else {
      yield { choices: [{ delta: { content: 'Kết quả là 2' } }] };
    }
  };

  const events = [];
  for await (const event of agent.chatStream('tính 1+1')) {
    events.push(event);
  }

  const toolCall = events.find((e) => e.type === 'tool_call');
  const toolResult = events.find((e) => e.type === 'tool_result');
  const done = events.find((e) => e.type === 'done');

  assert.ok(toolCall);
  assert.equal(toolCall.name, 'calculator');
  assert.ok(toolResult);
  assert.ok(done);
  assert.ok(done.reply.includes('2'));
});
