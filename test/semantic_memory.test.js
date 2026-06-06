const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  cosineSimilarity,
  loadVectors,
  saveVectors,
  saveMemoryVector,
  searchRelevant,
  VECTOR_FILE,
} = require('../src/core/memory/semantic_memory');

// --- Cosine Similarity tests ---

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
  // cos([1,0,0], [1,1,0]) = 1/sqrt(2) ≈ 0.7071
  const result = cosineSimilarity([1, 0, 0], [1, 1, 0]);
  assert.ok(Math.abs(result - 0.7071) < 0.001);
});

// --- Vector store save/load/search tests ---

test('saveVectors and loadVectors round-trip', () => {
  const backup = fs.existsSync(VECTOR_FILE) ? fs.readFileSync(VECTOR_FILE, 'utf-8') : null;

  try {
    const data = [
      { id: 'test_1', text: 'hello', vector: [0.1, 0.2], timestamp: '2026-01-01' },
    ];
    saveVectors(data);
    const loaded = loadVectors();
    assert.deepEqual(loaded, data);
  } finally {
    if (backup) {
      fs.writeFileSync(VECTOR_FILE, backup, 'utf-8');
    } else {
      fs.rmSync(VECTOR_FILE, { force: true });
    }
  }
});

test('saveMemoryVector appends entry with id and timestamp', () => {
  const backup = fs.existsSync(VECTOR_FILE) ? fs.readFileSync(VECTOR_FILE, 'utf-8') : null;

  try {
    // Start clean
    saveVectors([]);
    const id = saveMemoryVector('Chủ nhân thích cà phê', [0.5, 0.3, 0.2]);
    const loaded = loadVectors();

    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, id);
    assert.equal(loaded[0].text, 'Chủ nhân thích cà phê');
    assert.deepEqual(loaded[0].vector, [0.5, 0.3, 0.2]);
    assert.ok(loaded[0].timestamp);
  } finally {
    if (backup) {
      fs.writeFileSync(VECTOR_FILE, backup, 'utf-8');
    } else {
      fs.rmSync(VECTOR_FILE, { force: true });
    }
  }
});

test('searchRelevant returns topK sorted by score', () => {
  const backup = fs.existsSync(VECTOR_FILE) ? fs.readFileSync(VECTOR_FILE, 'utf-8') : null;

  try {
    saveVectors([
      { id: 'm1', text: 'thích cà phê', vector: [1, 0, 0], timestamp: '2026-01-01' },
      { id: 'm2', text: 'thích trà', vector: [0, 1, 0], timestamp: '2026-01-01' },
      { id: 'm3', text: 'ghét đồ ngọt', vector: [0.5, 0.5, 0], timestamp: '2026-01-01' },
    ]);

    // Query gần "thích cà phê" nhất
    const results = searchRelevant([0.9, 0.1, 0], 2, 0.3);
    assert.ok(results.length <= 2);
    assert.ok(results.length >= 1);
    // m1 phải đầu tiên vì similarity cao nhất
    assert.equal(results[0].id, 'm1');
    assert.ok(results[0].score > results[1]?.score || 0);
  } finally {
    if (backup) {
      fs.writeFileSync(VECTOR_FILE, backup, 'utf-8');
    } else {
      fs.rmSync(VECTOR_FILE, { force: true });
    }
  }
});

test('searchRelevant filters by minScore', () => {
  const backup = fs.existsSync(VECTOR_FILE) ? fs.readFileSync(VECTOR_FILE, 'utf-8') : null;

  try {
    saveVectors([
      { id: 'm1', text: 'hello', vector: [1, 0], timestamp: '2026-01-01' },
      { id: 'm2', text: 'world', vector: [0, 1], timestamp: '2026-01-01' },
    ]);

    // Query [1,0] — m1 match cao, m2 = 0
    const results = searchRelevant([1, 0], 5, 0.9);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'm1');
  } finally {
    if (backup) {
      fs.writeFileSync(VECTOR_FILE, backup, 'utf-8');
    } else {
      fs.rmSync(VECTOR_FILE, { force: true });
    }
  }
});
