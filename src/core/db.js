'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const { DB_FILE, DATA_DIR } = require('../config/paths');

let _db = null;
const DB_PATH = process.env.TEST_DB || DB_FILE;

function getDb() {
  if (_db) return _db;
  if (DB_PATH !== ':memory:') fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _initSchema(_db);
  _migrate(_db);

  return _db;
}

function _initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id        TEXT PRIMARY KEY,
      text      TEXT NOT NULL,
      vector    TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    -- [v2] documents: mỗi lần crawl = 1 record, không ghi đè
    CREATE TABLE IF NOT EXISTS documents (
      id          TEXT PRIMARY KEY,
      filename    TEXT NOT NULL,
      url         TEXT NOT NULL DEFAULT '',
      label       TEXT NOT NULL DEFAULT '',
      crawl_date  TEXT NOT NULL DEFAULT '',
      ingested_at TEXT NOT NULL,
      chunk_count INTEGER NOT NULL DEFAULT 0
    );

    -- [v2] chunks: FK trỏ vào documents.id
    CREATE TABLE IF NOT EXISTS chunks (
      id          TEXT PRIMARY KEY,
      doc_id      TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      filename    TEXT NOT NULL,
      url         TEXT NOT NULL DEFAULT '',
      label       TEXT NOT NULL DEFAULT '',
      crawl_date  TEXT NOT NULL DEFAULT '',
      text        TEXT NOT NULL,
      vector      TEXT NOT NULL,
      chunk_index INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watched_urls (
      url      TEXT PRIMARY KEY,
      label    TEXT NOT NULL DEFAULT '',
      schedule TEXT NOT NULL DEFAULT 'daily',
      active   INTEGER NOT NULL DEFAULT 1,
      added_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crawl_logs (
      id           TEXT PRIMARY KEY,
      url          TEXT NOT NULL,
      crawled_at   TEXT NOT NULL,
      content_hash TEXT,
      status       TEXT NOT NULL,
      error_msg    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_doc_id     ON chunks(doc_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_url_date   ON chunks(url, crawl_date);
    CREATE INDEX IF NOT EXISTS idx_chunks_filename   ON chunks(filename);
    CREATE INDEX IF NOT EXISTS idx_documents_url     ON documents(url);
    CREATE INDEX IF NOT EXISTS idx_documents_date    ON documents(crawl_date);
    CREATE INDEX IF NOT EXISTS idx_crawl_logs_url        ON crawl_logs(url);
    CREATE INDEX IF NOT EXISTS idx_crawl_logs_crawled_at ON crawl_logs(crawled_at);

    -- Token usage tracking
    CREATE TABLE IF NOT EXISTS token_logs (
      id            TEXT PRIMARY KEY,
      timestamp     TEXT NOT NULL,
      model         TEXT NOT NULL DEFAULT '',
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_vnd      REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_token_logs_timestamp ON token_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_token_logs_model ON token_logs(model);
  `);
}

function _migrate(db) {
  // memories.type
  try {
    db.exec(`ALTER TABLE memories ADD COLUMN type TEXT NOT NULL DEFAULT 'fact'`);
    console.log('[DB] Migration: thêm column type vào memories ✓');
  } catch { }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`);
  } catch { }

  // documents v1 → v2: thêm các column mới nếu thiếu
  for (const col of ['id TEXT', 'url TEXT', 'label TEXT', 'crawl_date TEXT']) {
    try {
      db.exec(`ALTER TABLE documents ADD COLUMN ${col} NOT NULL DEFAULT ''`);
      console.log(`[DB] Migration: thêm column ${col.split(' ')[0]} vào documents ✓`);
    } catch { }
  }

  // chunks v1 → v2: thêm doc_id + metadata columns
  for (const col of ['doc_id TEXT', 'url TEXT', 'label TEXT', 'crawl_date TEXT']) {
    try {
      db.exec(`ALTER TABLE chunks ADD COLUMN ${col} NOT NULL DEFAULT ''`);
      console.log(`[DB] Migration: thêm column ${col.split(' ')[0]} vào chunks ✓`);
    } catch { }
  }
}

function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

function cleanDb() {
  const db = getDb();
  db.prepare('DELETE FROM crawl_logs').run();
  db.prepare('DELETE FROM watched_urls').run();
  db.prepare('DELETE FROM chunks').run();
  db.prepare('DELETE FROM documents').run();
  db.prepare('DELETE FROM memories').run();
}

function resetDb() { closeDb(); }

module.exports = { getDb, closeDb, cleanDb, resetDb };