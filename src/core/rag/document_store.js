const { getDb } = require('../db');
const { DATA_DIR } = require('../../config/paths');
const path = require('path');

// Giữ lại DOC_STORE_DIR để không break code nào đang import nó
const DOC_STORE_DIR = path.join(DATA_DIR, 'documents');

// ─── Cache layer ────────────────────────────────────────────────────────────
// Giữ nguyên pattern cache từ bản JSON cũ — tránh đọc DB mỗi lần search.

let _cache = null;      // Array<{ id, text, filename, chunk_index }>
let _cacheTime = 0;
const CACHE_TTL = 60_000; // 1 phút

function _invalidateCache() {
  _cache = null;
  _cacheTime = 0;
}

// ─── Compatibility shims (loadStore / saveStore) ─────────────────────────────
// Hai hàm này từng dùng để đọc/ghi toàn bộ JSON.
// Giờ không còn cần thiết nhưng giữ lại để không break import ở nơi khác.

/**
 * @deprecated Dùng nội bộ — không cần gọi từ bên ngoài nữa.
 */
function loadStore() {
  const db = getDb();
  const documents = db.prepare('SELECT * FROM documents').all();
  for (const doc of documents) {
    doc.chunks = db
      .prepare('SELECT * FROM chunks WHERE filename = ? ORDER BY chunk_index')
      .all(doc.filename)
      .map((c) => ({ ...c, vector: JSON.parse(c.vector) }));
  }
  return { documents };
}

/**
 * @deprecated Không dùng nữa — SQLite tự quản lý persistence.
 */
function saveStore(_store) {
  // No-op: SQLite tự persist, không cần làm gì thêm.
  console.warn('[DocumentStore] saveStore() không còn cần thiết với SQLite.');
}

// ─── Core API ────────────────────────────────────────────────────────────────

/**
 * Lưu tài liệu đã chunk + vector vào store.
 * Nếu tài liệu đã tồn tại → xóa và ingest lại (re-ingest).
 *
 * @param {string} filename
 * @param {Array<{ id: string, text: string, vector: number[], index: number }>} chunks
 * @returns {number} Số chunks đã lưu
 */
function saveDocument(filename, chunks) {
  const db = getDb();

  // Dùng transaction — tất cả thành công hoặc không có gì thay đổi
  const upsert = db.transaction(() => {
    // Xóa document cũ nếu re-ingest (ON DELETE CASCADE tự xóa chunks)
    db.prepare('DELETE FROM documents WHERE filename = ?').run(filename);

    // Insert document metadata
    db.prepare(`
      INSERT INTO documents (filename, ingested_at, chunk_count)
      VALUES (?, ?, ?)
    `).run(filename, new Date().toISOString(), chunks.length);

    // Insert từng chunk
    const insertChunk = db.prepare(`
      INSERT INTO chunks (id, filename, text, vector, chunk_index)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const chunk of chunks) {
      insertChunk.run(
        chunk.id,
        filename,
        chunk.text,
        JSON.stringify(chunk.vector),
        chunk.index ?? 0
      );
    }
  });

  upsert();
  _invalidateCache();

  return chunks.length;
}

/**
 * Lấy tất cả chunks từ mọi tài liệu (dùng cho RAG search).
 * Có cache TTL 1 phút để tránh đọc DB mỗi request.
 *
 * @returns {Array<{ id, text, filename, vector: number[] }>}
 */
function getAllChunks() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) {
    return _cache;
  }

  const db = getDb();
  const rows = db.prepare(`
    SELECT c.id, c.text, c.filename, c.vector
    FROM chunks c
    ORDER BY c.filename, c.chunk_index
  `).all();

  _cache = rows.map((row) => ({
    id: row.id,
    text: row.text,
    filename: row.filename,
    vector: JSON.parse(row.vector),
  }));
  _cacheTime = now;

  return _cache;
}

/**
 * Liệt kê tài liệu đã ingest (không kèm chunks/vectors).
 *
 * @returns {Array<{ filename, ingestedAt, chunkCount }>}
 */
function listDocuments() {
  const db = getDb();
  return db.prepare('SELECT filename, ingested_at, chunk_count FROM documents').all()
    .map((d) => ({
      filename: d.filename,
      ingestedAt: d.ingested_at,
      chunkCount: d.chunk_count,
    }));
}

/**
 * Xóa tài liệu khỏi store (chunks tự xóa theo CASCADE).
 *
 * @param {string} filename
 * @returns {boolean} true nếu xóa thành công
 */
function removeDocument(filename) {
  const db = getDb();
  const result = db.prepare('DELETE FROM documents WHERE filename = ?').run(filename);
  _invalidateCache();
  return result.changes > 0;
}

module.exports = {
  loadStore,
  saveStore,
  saveDocument,
  getAllChunks,
  listDocuments,
  removeDocument,
  DOC_STORE_DIR,
  _invalidateCache, // dùng cho test
};