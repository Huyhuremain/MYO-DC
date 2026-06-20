const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MEMORY_TYPES,
  cosineSimilarity,
  loadVectors,
  saveMemoryVector,
  searchRelevant,
  getMemoriesByType,
} = require('../src/core/memory/semantic_memory');
const { getDb } = require('../src/core/db');

function cleanMemories() {
  getDb().prepare('DELETE FROM memories').run();
}

// ── Cosine Similarity ─────────────────────────────────────────────────────────

test('cosineSimilarity returns 1 for identical vectors', () => {
  const v = [1, 2, 3];
  assert.equal(cosineSimilarity(v, v), 1);
});

test('cosineSimilarity returns 0 for orthogonal vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test('cosineSimilarity returns -1 for opposite vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
});

test('cosineSimilarity returns 0 for zero vectors', () => {
  assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
});

test('cosineSimilarity handles partial similarity', () => {
  const result = cosineSimilarity([1, 0, 0], [1, 1, 0]);
  assert.ok(Math.abs(result - 0.7071) < 0.001);
});

// ── MEMORY_TYPES ──────────────────────────────────────────────────────────────

test('MEMORY_TYPES has correct values', () => {
  assert.equal(MEMORY_TYPES.FACT, 'fact');
  assert.equal(MEMORY_TYPES.PREFERENCE, 'preference');
  assert.equal(MEMORY_TYPES.BEHAVIOR, 'behavior');
  assert.equal(MEMORY_TYPES.CONTEXT, 'context');
});

// ── saveMemoryVector + loadVectors ────────────────────────────────────────────

test('saveVectors and loadVectors round-trip', () => {
  cleanMemories();
  saveMemoryVector('hello', [0.1, 0.2], 'fact');
  const loaded = loadVectors();

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].text, 'hello');
  assert.equal(loaded[0].type, 'fact');
  assert.deepEqual(loaded[0].vector, [0.1, 0.2]);
  assert.ok(loaded[0].id);
  assert.ok(loaded[0].timestamp);
  cleanMemories();
});

test('saveMemoryVector appends entry with id, type and timestamp', () => {
  cleanMemories();
  const id = saveMemoryVector('Chủ nhân thích cà phê', [0.5, 0.3, 0.2], 'preference');
  const loaded = loadVectors();

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, id);
  assert.equal(loaded[0].type, 'preference');
  assert.equal(loaded[0].text, 'Chủ nhân thích cà phê');
  assert.deepEqual(loaded[0].vector, [0.5, 0.3, 0.2]);
  cleanMemories();
});

test('saveMemoryVector defaults to fact for invalid type', () => {
  cleanMemories();
  saveMemoryVector('test', [0.1], 'invalid_type');
  const loaded = loadVectors();
  assert.equal(loaded[0].type, 'fact');
  cleanMemories();
});

// ── searchRelevant ────────────────────────────────────────────────────────────

test('searchRelevant returns topK sorted by score', () => {
  cleanMemories();
  const db = getDb();
  db.prepare('INSERT INTO memories (id, type, text, vector, timestamp) VALUES (?, ?, ?, ?, ?)').run(
    'm1', 'preference', 'thích cà phê', JSON.stringify([1, 0, 0]), '2026-01-01'
  );
  db.prepare('INSERT INTO memories (id, type, text, vector, timestamp) VALUES (?, ?, ?, ?, ?)').run(
    'm2', 'preference', 'thích trà', JSON.stringify([0, 1, 0]), '2026-01-01'
  );
  db.prepare('INSERT INTO memories (id, type, text, vector, timestamp) VALUES (?, ?, ?, ?, ?)').run(
    'm3', 'fact', 'tên Huy', JSON.stringify([0.5, 0.5, 0]), '2026-01-01'
  );

  const results = searchRelevant([0.9, 0.1, 0], 2, 0.3);
  assert.ok(results.length <= 2);
  assert.ok(results.length >= 1);
  assert.equal(results[0].id, 'm1');
  assert.ok(results[0].score > (results[1]?.score ?? 0));
  cleanMemories();
});

test('searchRelevant filters by minScore', () => {
  cleanMemories();
  const db = getDb();
  db.prepare('INSERT INTO memories (id, type, text, vector, timestamp) VALUES (?, ?, ?, ?, ?)').run(
    'm1', 'fact', 'hello', JSON.stringify([1, 0]), '2026-01-01'
  );
  db.prepare('INSERT INTO memories (id, type, text, vector, timestamp) VALUES (?, ?, ?, ?, ?)').run(
    'm2', 'fact', 'world', JSON.stringify([0, 1]), '2026-01-01'
  );

  const results = searchRelevant([1, 0], 5, 0.9);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'm1');
  cleanMemories();
});

test('searchRelevant filters by type', () => {
  cleanMemories();
  const db = getDb();
  db.prepare('INSERT INTO memories (id, type, text, vector, timestamp) VALUES (?, ?, ?, ?, ?)').run(
    'm1', 'preference', 'thích cà phê', JSON.stringify([1, 0]), '2026-01-01'
  );
  db.prepare('INSERT INTO memories (id, type, text, vector, timestamp) VALUES (?, ?, ?, ?, ?)').run(
    'm2', 'fact', 'tên Huy', JSON.stringify([0.9, 0.1]), '2026-01-01'
  );

  // Chỉ search trong preference — không trả về fact dù score cao
  const results = searchRelevant([1, 0], 5, 0.5, 'preference');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'm1');
  assert.equal(results[0].type, 'preference');
  cleanMemories();
});

// ── getMemoriesByType ─────────────────────────────────────────────────────────

test('getMemoriesByType returns only matching type', () => {
  cleanMemories();
  saveMemoryVector('tên Huy', [0.1], 'fact');
  saveMemoryVector('thích cà phê', [0.2], 'preference');
  saveMemoryVector('hay làm việc đêm', [0.3], 'behavior');

  const facts = getMemoriesByType('fact');
  assert.equal(facts.length, 1);
  assert.equal(facts[0].text, 'tên Huy');
  assert.equal(facts[0].type, 'fact');
  cleanMemories();
});

test('getMemoriesByType returns empty for type with no entries', () => {
  cleanMemories();
  saveMemoryVector('tên Huy', [0.1], 'fact');

  const contexts = getMemoriesByType('context');
  assert.equal(contexts.length, 0);
  cleanMemories();
});