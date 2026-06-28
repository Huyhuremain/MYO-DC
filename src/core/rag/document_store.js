'use strict';

const { getDb } = require('../db');
const { DATA_DIR } = require('../../config/paths');
const path = require('path');
const crypto = require('crypto');

const DOC_STORE_DIR = path.join(DATA_DIR, 'documents');

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000;

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

/**
 * Lưu document mới — KHÔNG ghi đè record cũ.
 * Mỗi lần crawl/ingest = 1 record riêng biệt.
 *
 * @param {string} filename
 * @param {Array<{ id, text, vector, index }>} chunks
 * @param {object} meta - { url, label, crawl_date }
 * @returns {number} số chunks đã lưu
 */
function saveDocument(filename, chunks, meta = {}) {
  const db = getDb();
  const docId = crypto.randomUUID();
  const now = new Date().toISOString();
  const crawlDate = meta.crawl_date || now.slice(0, 10); // 'YYYY-MM-DD'
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
        docId,
        filename,
        url,
        label,
        crawlDate,
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
 * Lấy chunks cho RAG — chỉ lấy crawl_date MỚI NHẤT của mỗi URL.
 * Fallback: nếu URL trống (ingest_document) → lấy tất cả.
 */
function getAllChunks() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;

  const db = getDb();

  const rows = db.prepare(`
    SELECT c.id, c.text, c.filename, c.url, c.label, c.crawl_date, c.vector
    FROM chunks c
    INNER JOIN documents d ON c.doc_id = d.id
    WHERE
      -- Với web documents: chỉ lấy crawl_date mới nhất của mỗi URL
      (c.url = '' OR d.crawl_date = (
        SELECT MAX(d2.crawl_date)
        FROM documents d2
        WHERE d2.url = d.url
      ))
    ORDER BY c.filename, c.chunk_index
  `).all();

  _cache = rows.map(row => ({
    id: row.id,
    text: row.text,
    filename: row.filename,
    url: row.url,
    label: row.label,
    crawl_date: row.crawl_date,
    vector: JSON.parse(row.vector),
  }));
  _cacheTime = now;

  return _cache;
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
  DOC_STORE_DIR, _invalidateCache,
};