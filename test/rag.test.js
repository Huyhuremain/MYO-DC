const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { chunkText } = require('../src/core/rag/chunker');
const { saveDocument, getAllChunks, listDocuments, removeDocument, DOC_STORE_DIR } = require('../src/core/rag/document_store');
const { searchDocuments } = require('../src/core/rag/search');

// --- Chunker tests ---

test('chunkText splits text into chunks by paragraph', () => {
  const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
  const chunks = chunkText(text, { chunkSize: 20 });
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].text, 'First paragraph.');
});

test('chunkText merges small paragraphs', () => {
  const text = 'A\nB\nC';
  const chunks = chunkText(text, { chunkSize: 100 });
  // All 3 short paragraphs should merge into 1 chunk
  assert.equal(chunks.length, 1);
  assert.ok(chunks[0].text.includes('A'));
  assert.ok(chunks[0].text.includes('C'));
});

test('chunkText splits large paragraphs', () => {
  const text = 'x'.repeat(1200);
  const chunks = chunkText(text, { chunkSize: 500, overlap: 50 });
  assert.ok(chunks.length >= 2);
  assert.ok(chunks[0].text.length <= 500);
});

test('chunkText returns empty for empty input', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('   '), []);
});

// --- Document store tests ---

const STORE_FILE = path.join(DOC_STORE_DIR, 'store.json');

function backupStore() {
  return fs.existsSync(STORE_FILE) ? fs.readFileSync(STORE_FILE, 'utf-8') : null;
}

function restoreStore(backup) {
  if (backup) {
    fs.writeFileSync(STORE_FILE, backup, 'utf-8');
  } else {
    fs.rmSync(STORE_FILE, { force: true });
  }
}

test('saveDocument and getAllChunks round-trip', () => {
  const backup = backupStore();
  try {
    const chunks = [
      { id: 'doc_0', text: 'Hello world', vector: [0.1, 0.2] },
      { id: 'doc_1', text: 'Goodbye world', vector: [0.3, 0.4] },
    ];
    const count = saveDocument('test.txt', chunks);
    assert.equal(count, 2);

    const all = getAllChunks();
    assert.equal(all.length, 2);
    assert.equal(all[0].filename, 'test.txt');
  } finally {
    restoreStore(backup);
  }
});

test('listDocuments returns document info', () => {
  const backup = backupStore();
  try {
    saveDocument('report.md', [
      { id: 'doc_0', text: 'chunk 1', vector: [0.5] },
    ]);

    const docs = listDocuments();
    assert.ok(docs.length >= 1);
    const found = docs.find((d) => d.filename === 'report.md');
    assert.ok(found);
    assert.equal(found.chunkCount, 1);
  } finally {
    restoreStore(backup);
  }
});

test('removeDocument deletes from store', () => {
  const backup = backupStore();
  try {
    saveDocument('to-delete.txt', [
      { id: 'doc_0', text: 'gone', vector: [] },
    ]);

    const removed = removeDocument('to-delete.txt');
    assert.equal(removed, true);

    const all = getAllChunks();
    assert.equal(all.filter((c) => c.filename === 'to-delete.txt').length, 0);
  } finally {
    restoreStore(backup);
  }
});

test('saveDocument replaces existing document with same name', () => {
  const backup = backupStore();
  try {
    saveDocument('same.txt', [{ id: 'doc_0', text: 'v1', vector: [] }]);
    saveDocument('same.txt', [{ id: 'doc_0', text: 'v2', vector: [] }, { id: 'doc_1', text: 'v3', vector: [] }]);

    const all = getAllChunks();
    const sameChunks = all.filter((c) => c.filename === 'same.txt');
    assert.equal(sameChunks.length, 2);
    assert.equal(sameChunks[0].text, 'v2');
  } finally {
    restoreStore(backup);
  }
});

// --- Search tests ---

test('searchDocuments returns relevant chunks by cosine similarity', () => {
  const backup = backupStore();
  try {
    saveDocument('docs.txt', [
      { id: 'doc_0', text: 'AI and deep learning', vector: [1, 0, 0] },
      { id: 'doc_1', text: 'Cooking recipes', vector: [0, 1, 0] },
      { id: 'doc_2', text: 'AI applications', vector: [0.9, 0.1, 0] },
    ]);

    // Query gần "AI"
    const results = searchDocuments([1, 0, 0], 2, 0.5);
    assert.ok(results.length >= 1);
    assert.equal(results[0].text, 'AI and deep learning');
  } finally {
    restoreStore(backup);
  }
});

test('searchDocuments returns empty when no documents', () => {
  const backup = backupStore();
  try {
    fs.rmSync(STORE_FILE, { force: true });
    const results = searchDocuments([1, 0, 0], 5, 0.5);
    assert.deepEqual(results, []);
  } finally {
    restoreStore(backup);
  }
});
