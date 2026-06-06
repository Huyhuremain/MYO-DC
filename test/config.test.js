const test = require('node:test');
const assert = require('node:assert/strict');

const { loadConfig } = require('../src/config');

function withEnv(overrides, fn) {
  const before = { ...process.env };
  process.env = { ...before, ...overrides };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
  }

  try {
    fn();
  } finally {
    process.env = before;
  }
}

test('loadConfig requires OPENAI_API_KEY', () => {
  withEnv({ OPENAI_API_KEY: undefined }, () => {
    assert.throws(() => loadConfig(), /OPENAI_API_KEY/);
  });
});

test('loadConfig rejects invalid PORT', () => {
  withEnv({ OPENAI_API_KEY: 'test-key', PORT: 'abc' }, () => {
    assert.throws(() => loadConfig(), /PORT phải là số hợp lệ/);
  });
});

test('loadConfig rejects out-of-range SHORT_TERM_MAX', () => {
  withEnv({ OPENAI_API_KEY: 'test-key', SHORT_TERM_MAX: '0' }, () => {
    assert.throws(() => loadConfig(), /SHORT_TERM_MAX phải trong khoảng 1-100/);
  });
});

test('loadConfig applies defaults', () => {
  withEnv({
    OPENAI_API_KEY: 'test-key',
    OPENAI_BASE_URL: undefined,
    MODEL: undefined,
    SHORT_TERM_MAX: undefined,
    PORT: undefined,
  }, () => {
    const config = loadConfig();
    assert.equal(config.llm.baseURL, 'https://api.openai.com/v1');
    assert.equal(config.llm.model, 'gpt-4o-mini');
    assert.equal(config.memory.shortTermMax, 10);
    assert.equal(config.server.port, 3000);
  });
});
