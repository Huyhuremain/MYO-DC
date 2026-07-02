'use strict';

const { getDb } = require('../db');
const { DATA_DIR } = require('../../config/paths');
const path = require('path');
const crypto = require('crypto');

const DOC_STORE_DIR = path.join(DATA_DIR, 'documents');

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000;

// [Phương án 1] Giới hạn RAG chỉ search trong N ngày gần nhất
const RAG_WINDOW_DAYS = 30;

function _invalidateCache() { _cache = null; _cacheTime = 0; }

function loadStore() {
  const db = getDb();
  const documents = db.prepare('SELECT * FROM documents').all();
  for (const doc of documents) {
    doc.chunks = db.prepare(
      'SELECT * FROM chunks WHERE doc_id = ? ORDER BY chunk_index'
    ).all(doc.id).map(c => ({ ...c, vector: JSON.parse(c.vector) }));
  }
  return { documents };
}

function saveStore(_store) {
  console.warn('[DocumentStore] saveStore() không còn cần thiết với SQLite.');
}

function saveDocument(filename, chunks, meta = {}) {
  const db = getDb();
  const docId = crypto.randomUUID();
  const now = new Date().toISOString();
  const crawlDate = meta.crawl_date || now.slice(0, 10);
  const url = meta.url || '';
  const label = meta.label || '';

  const upsert = db.transaction(() => {
    db.prepare(`
      INSERT INTO documents (id, filename, url, label, crawl_date, ingested_at, chunk_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(docId, filename, url, label, crawlDate, now, chunks.length);

    const insertChunk = db.prepare(`
      INSERT INTO chunks (id, doc_id, filename, url, label, crawl_date, text, vector, chunk_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const chunk of chunks) {
      insertChunk.run(
        `${docId}_${chunk.index ?? chunk.id}`,
        docId, filename, url, label, crawlDate,
        chunk.text,
        JSON.stringify(chunk.vector || []),
        chunk.index ?? 0
      );
    }
  });

  upsert();
  _invalidateCache();
  return chunks.length;
}

/**
 * Lấy chunks cho RAG search.
 * [Phương án 1] Chỉ lấy chunks trong RAG_WINDOW_DAYS ngày gần nhất.
 * [Phương án 2] SQL-first filter — chỉ lấy crawl_date mới nhất của mỗi URL,
 * giới hạn theo date window TRONG SQL trước khi load vào RAM.
 *
 * @param {string} [queryText] - Text câu hỏi, dùng để pre-filter bằng LIKE (Phương án 2)
 */
function getAllChunks(queryText = '') {
  const cacheKey = queryText ? `kw:${queryText.slice(0, 50)}` : 'default';
  const now = Date.now();

  if (_cache && _cache.key === cacheKey && now - _cacheTime < CACHE_TTL) {
    return _cache.data;
  }

  const db = getDb();
  const windowDate = new Date();
  windowDate.setDate(windowDate.getDate() - RAG_WINDOW_DAYS);
  const dateFrom = windowDate.toISOString().slice(0, 10);

  // [Phương án 2] Pre-filter bằng keyword trong SQL nếu có queryText đủ dài
  // Giảm số rows phải load vào RAM trước khi tính cosine similarity
  const keywords = (queryText || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 5); // tối đa 5 keyword để tránh query quá dài

  let rows;

  if (keywords.length > 0) {
    // Build OR conditions cho từng keyword — match càng nhiều keyword, càng có khả năng liên quan
    const likeConditions = keywords.map(() => `lower(c.text) LIKE lower(?)`).join(' OR ');
    const likeParams = keywords.map(kw => `%${kw}%`);

    rows = db.prepare(`
      SELECT c.id, c.text, c.filename, c.url, c.label, c.crawl_date, c.vector
      FROM chunks c
      INNER JOIN documents d ON c.doc_id = d.id
      WHERE
        (c.url = '' OR c.crawl_date >= ?)
        AND (c.url = '' OR d.crawl_date = (
          SELECT MAX(d2.crawl_date) FROM documents d2 WHERE d2.url = d.url
        ))
        AND (${likeConditions})
      ORDER BY c.filename, c.chunk_index
      LIMIT 1000
    `).all(dateFrom, ...likeParams);

    // Fallback: nếu keyword filter quá hẹp (ít hơn topK cần), nới ra lấy theo date window thôi
    if (rows.length < 20) {
      rows = db.prepare(`
        SELECT c.id, c.text, c.filename, c.url, c.label, c.crawl_date, c.vector
        FROM chunks c
        INNER JOIN documents d ON c.doc_id = d.id
        WHERE
          (c.url = '' OR c.crawl_date >= ?)
          AND (c.url = '' OR d.crawl_date = (
            SELECT MAX(d2.crawl_date) FROM documents d2 WHERE d2.url = d.url
          ))
        ORDER BY c.filename, c.chunk_index
        LIMIT 2000
      `).all(dateFrom);
    }
  } else {
    // Không có query text — chỉ áp dụng date window (Phương án 1)
    rows = db.prepare(`
      SELECT c.id, c.text, c.filename, c.url, c.label, c.crawl_date, c.vector
      FROM chunks c
      INNER JOIN documents d ON c.doc_id = d.id
      WHERE
        (c.url = '' OR c.crawl_date >= ?)
        AND (c.url = '' OR d.crawl_date = (
          SELECT MAX(d2.crawl_date) FROM documents d2 WHERE d2.url = d.url
        ))
      ORDER BY c.filename, c.chunk_index
      LIMIT 2000
    `).all(dateFrom);
  }

  const data = rows.map(row => ({
    id: row.id,
    text: row.text,
    filename: row.filename,
    url: row.url,
    label: row.label,
    crawl_date: row.crawl_date,
    vector: JSON.parse(row.vector),
  }));

  _cache = { key: cacheKey, data };
  _cacheTime = now;

  return data;
}

function listDocuments() {
  const db = getDb();
  return db.prepare(
    'SELECT id, filename, url, label, crawl_date, ingested_at, chunk_count FROM documents ORDER BY ingested_at DESC'
  ).all();
}

function removeDocument(filename) {
  const db = getDb();
  const result = db.prepare('DELETE FROM documents WHERE filename = ?').run(filename);
  _invalidateCache();
  return result.changes > 0;
}

module.exports = {
  loadStore, saveStore, saveDocument,
  getAllChunks, listDocuments, removeDocument,
  DOC_STORE_DIR, _invalidateCache, RAG_WINDOW_DAYS,
};