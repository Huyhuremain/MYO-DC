const Database = require('better-sqlite3');
const fs = require('fs');
const { DB_FILE, DATA_DIR } = require('../config/paths');

let _db = null;

const DB_PATH = process.env.TEST_DB || DB_FILE;

function getDb() {
  if (_db) return _db;

  if (DB_PATH !== ':memory:') {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _initSchema(_db);
  _migrate(_db);

  return _db;
}

function _initSchema(db) {
  db.exec(`
    -- Semantic memory (không có type ở đây — để _migrate xử lý an toàn)
    CREATE TABLE IF NOT EXISTS memories (
      id        TEXT PRIMARY KEY,
      text      TEXT NOT NULL,
      vector    TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    -- Document metadata
    CREATE TABLE IF NOT EXISTS documents (
      filename     TEXT PRIMARY KEY,
      ingested_at  TEXT NOT NULL,
      chunk_count  INTEGER NOT NULL DEFAULT 0
    );

    -- Document chunks + vectors
    CREATE TABLE IF NOT EXISTS chunks (
      id          TEXT PRIMARY KEY,
      filename    TEXT NOT NULL REFERENCES documents(filename) ON DELETE CASCADE,
      text        TEXT NOT NULL,
      vector      TEXT NOT NULL,
      chunk_index INTEGER NOT NULL
    );

    -- Danh sách URL cần theo dõi
    CREATE TABLE IF NOT EXISTS watched_urls (
      url      TEXT PRIMARY KEY,
      label    TEXT NOT NULL DEFAULT '',
      schedule TEXT NOT NULL DEFAULT 'daily',
      active   INTEGER NOT NULL DEFAULT 1,
      added_at TEXT NOT NULL
    );

    -- Lịch sử crawl
    CREATE TABLE IF NOT EXISTS crawl_logs (
      id           TEXT PRIMARY KEY,
      url          TEXT NOT NULL,
      crawled_at   TEXT NOT NULL,
      content_hash TEXT,
      status       TEXT NOT NULL,
      error_msg    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_filename ON chunks(filename);
    CREATE INDEX IF NOT EXISTS idx_crawl_logs_url ON crawl_logs(url);
    CREATE INDEX IF NOT EXISTS idx_crawl_logs_crawled_at ON crawl_logs(crawled_at);
  `);
}

function _migrate(db) {
  // Migration 1: thêm column type vào memories nếu chưa có
  try {
    db.exec(`ALTER TABLE memories ADD COLUMN type TEXT NOT NULL DEFAULT 'fact'`);
    console.log('[DB] Migration: thêm column type vào memories ✓');
  } catch {
    // Column đã tồn tại — bình thường
  }

  // Migration 2: tạo index cho type sau khi đảm bảo column đã tồn tại
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type)`);
  } catch {
    // Index đã tồn tại — bình thường
  }
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function cleanDb() {
  const db = getDb();
  db.prepare('DELETE FROM crawl_logs').run();
  db.prepare('DELETE FROM watched_urls').run();
  db.prepare('DELETE FROM chunks').run();
  db.prepare('DELETE FROM documents').run();
  db.prepare('DELETE FROM memories').run();
}

function resetDb() {
  closeDb();
}

module.exports = { getDb, closeDb, cleanDb, resetDb };