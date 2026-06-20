const test = require('node:test');
const assert = require('node:assert/strict');

const { chunkText } = require('../src/core/rag/chunker');
const { saveDocument, getAllChunks, listDocuments, removeDocument, _invalidateCache } = require('../src/core/rag/document_store');
const { searchDocuments } = require('../src/core/rag/search');
const { closeDb, getDb } = require('../src/core/db');

// ── Helper: xóa sạch data test sau mỗi test ──────────────────────────────────
// Dùng DELETE thay vì backup/restore file JSON cũ.
// Thứ tự: chunks trước (FK), documents sau.
function cleanDb() {
  const db = getDb();
  db.prepare('DELETE FROM chunks').run();
  db.prepare('DELETE FROM documents').run();
  _invalidateCache(); // xóa cache ngay, không chờ TTL
}

// ── Chunker tests ─────────────────────────────────────────────────────────────

test('chunkText splits text into chunks by paragraph', () => {
  const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
  const chunks = chunkText(text, { chunkSize: 20 });
  assert.ok(chunks.length >= 2);
  assert.equal(chunks[0].text, 'First paragraph.');
});

test('chunkText merges small paragraphs', () => {
  const text = 'A\nB\nC';
  const chunks = chunkText(text, { chunkSize: 100 });
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

// ── Document store tests ──────────────────────────────────────────────────────

test('saveDocument and getAllChunks round-trip', () => {
  cleanDb();
  const chunks = [
    { id: 'doc_0', text: 'Hello world', vector: [0.1, 0.2], index: 0 },
    { id: 'doc_1', text: 'Goodbye world', vector: [0.3, 0.4], index: 1 },
  ];
  const count = saveDocument('test.txt', chunks);
  assert.equal(count, 2);

  const all = getAllChunks();
  assert.equal(all.length, 2);
  assert.equal(all[0].filename, 'test.txt');
  cleanDb();
});

test('listDocuments returns document info', () => {
  cleanDb();
  saveDocument('report.md', [
    { id: 'doc_0', text: 'chunk 1', vector: [0.5], index: 0 },
  ]);

  const docs = listDocuments();
  assert.ok(docs.length >= 1);
  const found = docs.find((d) => d.filename === 'report.md');
  assert.ok(found);
  assert.equal(found.chunkCount, 1);
  cleanDb();
});

test('removeDocument deletes from store', () => {
  cleanDb();
  saveDocument('to-delete.txt', [
    { id: 'doc_0', text: 'gone', vector: [], index: 0 },
  ]);

  const removed = removeDocument('to-delete.txt');
  assert.equal(removed, true);

  const all = getAllChunks();
  assert.equal(all.filter((c) => c.filename === 'to-delete.txt').length, 0);
  cleanDb();
});

test('saveDocument replaces existing document with same name', () => {
  cleanDb();
  saveDocument('same.txt', [{ id: 'doc_0', text: 'v1', vector: [], index: 0 }]);
  saveDocument('same.txt', [
    { id: 'doc_0', text: 'v2', vector: [], index: 0 },
    { id: 'doc_1', text: 'v3', vector: [], index: 1 },
  ]);

  const all = getAllChunks();
  const sameChunks = all.filter((c) => c.filename === 'same.txt');
  assert.equal(sameChunks.length, 2);
  assert.equal(sameChunks[0].text, 'v2');
  cleanDb();
});

// ── Search tests ──────────────────────────────────────────────────────────────

test('searchDocuments returns relevant chunks by cosine similarity', () => {
  cleanDb();
  saveDocument('docs.txt', [
    { id: 'doc_0', text: 'AI and deep learning', vector: [1, 0, 0], index: 0 },
    { id: 'doc_1', text: 'Cooking recipes', vector: [0, 1, 0], index: 1 },
    { id: 'doc_2', text: 'AI applications', vector: [0.9, 0.1, 0], index: 2 },
  ]);

  const results = searchDocuments([1, 0, 0], 2, 0.5);
  assert.ok(results.length >= 1);
  assert.equal(results[0].text, 'AI and deep learning');
  cleanDb();
});

test('searchDocuments returns empty when no documents', () => {
  cleanDb();
  const results = searchDocuments([1, 0, 0], 5, 0.5);
  assert.deepEqual(results, []);
});