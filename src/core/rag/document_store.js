const fs = require('fs');
const path = require('path');

// Direct path resolution — avoid importing config chain (causes OOM in tests)
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DOC_STORE_DIR = path.join(DATA_DIR, 'documents');
const DOC_STORE_FILE = path.join(DOC_STORE_DIR, 'store.json');

/**
 * Document Store — Quản lý tài liệu đã chunk + embed.
 *
 * Format store.json:
 * {
 *   "documents": [
 *     {
 *       "filename": "report.pdf",
 *       "ingestedAt": "2026-05-09T...",
 *       "chunkCount": 12,
 *       "chunks": [
 *         { "id": "doc_0", "text": "...", "vector": [...] }
 *       ]
 *     }
 *   ]
 * }
 */

/**
 * Đọc document store.
 */
function loadStore() {
  try {
    if (!fs.existsSync(DOC_STORE_FILE)) return { documents: [] };
    return JSON.parse(fs.readFileSync(DOC_STORE_FILE, 'utf-8'));
  } catch {
    return { documents: [] };
  }
}

/**
 * Ghi document store.
 */
function saveStore(store) {
  fs.mkdirSync(DOC_STORE_DIR, { recursive: true });
  fs.writeFileSync(DOC_STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

/**
 * Lưu tài liệu đã chunk + vector vào store.
 */
function saveDocument(filename, chunks) {
  const store = loadStore();

  // Xóa bản cũ nếu re-ingest
  store.documents = store.documents.filter((d) => d.filename !== filename);

  store.documents.push({
    filename,
    ingestedAt: new Date().toISOString(),
    chunkCount: chunks.length,
    chunks,
  });

  saveStore(store);
  return chunks.length;
}

/**
 * Lấy tất cả chunks từ mọi tài liệu (dùng cho search).
 */
function getAllChunks() {
  const store = loadStore();
  const allChunks = [];
  for (const doc of store.documents) {
    for (const chunk of doc.chunks) {
      allChunks.push({
        ...chunk,
        filename: doc.filename,
      });
    }
  }
  return allChunks;
}

/**
 * Liệt kê tài liệu đã ingest.
 */
function listDocuments() {
  const store = loadStore();
  return store.documents.map((d) => ({
    filename: d.filename,
    ingestedAt: d.ingestedAt,
    chunkCount: d.chunkCount,
  }));
}

/**
 * Xóa tài liệu khỏi store.
 */
function removeDocument(filename) {
  const store = loadStore();
  const before = store.documents.length;
  store.documents = store.documents.filter((d) => d.filename !== filename);
  saveStore(store);
  return store.documents.length < before;
}

module.exports = { loadStore, saveStore, saveDocument, getAllChunks, listDocuments, removeDocument, DOC_STORE_DIR };
