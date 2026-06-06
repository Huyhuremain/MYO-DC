const test = require('node:test');
const assert = require('node:assert/strict');

// Test parseProviders only (no OpenAI client creation = no memory issue)
const { parseProviders } = require('../src/core/provider_router');

test('parseProviders returns single provider when PROVIDERS not set', () => {
  const backup = process.env;
  process.env = { ...backup, OPENAI_API_KEY: 'test-key', PROVIDERS: '' };

  try {
    const providers = parseProviders();
    assert.equal(providers.length, 1);
    assert.equal(providers[0].name, 'openai');
    assert.equal(providers[0].apiKey, 'test-key');
  } finally {
    process.env = backup;
  }
});

test('parseProviders parses multiple providers', () => {
  const backup = process.env;
  process.env = {
    ...backup,
    PROVIDERS: 'openai,anthropic',
    OPENAI_API_KEY: 'key1',
    OPENAI_BASE_URL: 'http://a',
    OPENAI_MODEL: 'gpt-4o-mini',
    ANTHROPIC_API_KEY: 'key2',
    ANTHROPIC_BASE_URL: 'http://b',
    ANTHROPIC_MODEL: 'claude-sonnet',
  };

  try {
    const providers = parseProviders();
    assert.equal(providers.length, 2);
    assert.equal(providers[0].name, 'openai');
    assert.equal(providers[0].model, 'gpt-4o-mini');
    assert.equal(providers[1].name, 'anthropic');
    assert.equal(providers[1].model, 'claude-sonnet');
  } finally {
    process.env = backup;
  }
});

test('parseProviders skips provider without API key', () => {
  const backup = process.env;
  process.env = {
    ...backup,
    PROVIDERS: 'openai,missing',
    OPENAI_API_KEY: 'key1',
  };

  try {
    const providers = parseProviders();
    assert.equal(providers.length, 1);
    assert.equal(providers[0].name, 'openai');
  } finally {
    process.env = backup;
  }
});

// Test ProviderRouter logic (mock clients to avoid OpenAI constructor)
test('ProviderRouter resolves primary provider first', () => {
  const { ProviderRouter } = require('../src/core/provider_router');
  const router = new ProviderRouter([
    { name: 'openai', apiKey: 'key1', baseURL: 'http://a', model: 'gpt-4o-mini' },
    { name: 'fallback', apiKey: 'key2', baseURL: 'http://b', model: 'fb-model' },
  ]);

  const resolved = router.resolve();
  assert.equal(resolved.providerName, 'openai');
  assert.equal(resolved.model, 'gpt-4o-mini');
});

test('ProviderRouter falls back after failure', () => {
  const { ProviderRouter } = require('../src/core/provider_router');
  const router = new ProviderRouter([
    { name: 'openai', apiKey: 'k1', baseURL: 'http://a', model: 'm1' },
    { name: 'fallback', apiKey: 'k2', baseURL: 'http://b', model: 'm2' },
  ]);

  const next = router.markFailure('openai');
  assert.equal(next.providerName, 'fallback');
});

test('ProviderRouter markSuccess clears failure', () => {
  const { ProviderRouter } = require('../src/core/provider_router');
  const router = new ProviderRouter([
    { name: 'openai', apiKey: 'k1', baseURL: 'http://a', model: 'm1' },
  ]);

  router.markFailure('openai');
  router.markSuccess('openai');
  assert.equal(router.resolve().providerName, 'openai');
});
