const test = require('node:test');
const assert = require('node:assert/strict');

const ShortTermMemory = require('../src/core/memory/short_term');
const { compactMessages, runCompaction } = require('../src/core/memory/compaction');

test('runCompaction skips when below threshold', async () => {
  const memory = new ShortTermMemory(20);
  memory.add({ role: 'user', content: 'hello' });
  memory.add({ role: 'assistant', content: 'hi' });

  const result = await runCompaction(memory, null, null, 8, 2);
  assert.equal(result, false);
  // Memory không đổi
  assert.equal(memory.getMessages().length, 2);
});

test('runCompaction compacts when at threshold', async () => {
  const memory = new ShortTermMemory(20);

  // Thêm 10 messages (>= threshold 8)
  for (let i = 0; i < 10; i++) {
    memory.add({ role: 'user', content: `Message ${i}` });
    memory.add({ role: 'assistant', content: `Reply ${i}` });
  }

  // Mock LLM client
  const mockClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: 'Tóm tắt: user hỏi 10 câu về các chủ đề khác nhau.' } }],
        }),
      },
    },
  };

  const result = await runCompaction(memory, mockClient, 'test-model', 8, 2);
  assert.equal(result, true);

  const messages = memory.getMessages();
  // 1 summary + 2 recent kept
  assert.ok(messages.length <= 3);
  // Message đầu là summary
  assert.ok(messages[0].content.includes('[Tóm tắt hội thoại trước]'));
});

test('runCompaction keeps recent messages', async () => {
  const memory = new ShortTermMemory(20);

  for (let i = 0; i < 5; i++) {
    memory.add({ role: 'user', content: `Old message ${i}` });
  }
  memory.add({ role: 'user', content: 'Recent 1' });
  memory.add({ role: 'assistant', content: 'Recent 2' });

  const mockClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: 'Summary of old messages.' } }],
        }),
      },
    },
  };

  await runCompaction(memory, mockClient, 'test-model', 6, 2);

  const messages = memory.getMessages();
  // Recent messages được giữ
  assert.equal(messages[messages.length - 1].content, 'Recent 2');
  assert.equal(messages[messages.length - 2].content, 'Recent 1');
});

test('runCompaction handles LLM error gracefully', async () => {
  const memory = new ShortTermMemory(20);

  for (let i = 0; i < 10; i++) {
    memory.add({ role: 'user', content: `Message ${i}` });
  }

  const mockClient = {
    chat: {
      completions: {
        create: async () => { throw new Error('LLM down'); },
      },
    },
  };

  const result = await runCompaction(memory, mockClient, 'test-model', 8, 2);
  assert.equal(result, false);
  // Memory không đổi
  assert.equal(memory.getMessages().length, 10);
});

test('runCompaction handles empty summary', async () => {
  const memory = new ShortTermMemory(20);

  for (let i = 0; i < 10; i++) {
    memory.add({ role: 'user', content: `Message ${i}` });
  }

  const mockClient = {
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: '' } }],
        }),
      },
    },
  };

  const result = await runCompaction(memory, mockClient, 'test-model', 8, 2);
  assert.equal(result, false);
});
