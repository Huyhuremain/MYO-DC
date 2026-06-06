const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const ShortTermMemory = require('../src/core/memory/short_term');
const longTerm = require('../src/core/memory/long_term');
const { MEMORY_FILE } = require('../src/config/paths');

test('ShortTermMemory keeps only the newest messages', () => {
  const memory = new ShortTermMemory(2);

  memory.add({ role: 'user', content: 'one' });
  memory.add({ role: 'assistant', content: 'two' });
  memory.add({ role: 'user', content: 'three' });

  assert.deepEqual(memory.getMessages(), [
    { role: 'assistant', content: 'two' },
    { role: 'user', content: 'three' },
  ]);
});

test('longTerm appendMemory creates readable entries', () => {
  const before = fs.existsSync(MEMORY_FILE) ? fs.readFileSync(MEMORY_FILE, 'utf-8') : null;

  try {
    assert.equal(longTerm.appendMemory('test memory entry'), true);
    const content = fs.readFileSync(MEMORY_FILE, 'utf-8');
    assert.match(content, /test memory entry/);
    assert.match(content, /- \[.*\] test memory entry/);
  } finally {
    if (before === null) {
      fs.rmSync(MEMORY_FILE, { force: true });
    } else {
      fs.writeFileSync(MEMORY_FILE, before, 'utf-8');
    }
  }
});

test('longTerm readMemory limits long content', () => {
  const before = fs.existsSync(MEMORY_FILE) ? fs.readFileSync(MEMORY_FILE, 'utf-8') : null;

  try {
    fs.mkdirSync(require('node:path').dirname(MEMORY_FILE), { recursive: true });
    fs.writeFileSync(MEMORY_FILE, 'x'.repeat(2500), 'utf-8');

    const content = longTerm.readMemory();
    assert.ok(content.length <= 2020);
    assert.match(content, /đã cắt bớt/);
  } finally {
    if (before === null) {
      fs.rmSync(MEMORY_FILE, { force: true });
    } else {
      fs.writeFileSync(MEMORY_FILE, before, 'utf-8');
    }
  }
});
