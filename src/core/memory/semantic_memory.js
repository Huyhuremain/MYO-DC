const { getDb } = require('../db');
const { MEMORY_DIR } = require('../../config/paths');
const path = require('path');

// Giữ lại để không break import cũ
const VECTOR_FILE = path.join(MEMORY_DIR, 'vectors.json');

// ── Các loại memory hợp lệ ───────────────────────────────────────────────────
const MEMORY_TYPES = {
  PREFERENCE: 'preference', // sở thích, thói quen — "thích cà phê", "không thích họp sáng"
  BEHAVIOR:   'behavior',   // cách làm việc, phong cách — "hay làm việc đêm", "thích code bằng Vim"
  FACT:       'fact',       // thông tin cố định — tên, nghề nghiệp, nơi sống
  CONTEXT:    'context',    // ngữ cảnh tạm thời — dự án đang làm, mục tiêu hiện tại
};

// ── Math ─────────────────────────────────────────────────────────────────────

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Compatibility shims ───────────────────────────────────────────────────────

/** @deprecated */
function loadVectors() {
  const db = getDb();
  return db.prepare('SELECT * FROM memories').all().map((row) => ({
    id: row.id,
    type: row.type,
    text: row.text,
    vector: JSON.parse(row.vector),
    timestamp: row.timestamp,
  }));
}

/** @deprecated */
function saveVectors(_vectors) {
  console.warn('[SemanticMemory] saveVectors() không còn cần thiết với SQLite.');
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Embed text thành vector qua API.
 */
async function embedText(text, client, model) {
  const response = await client.embeddings.create({ model, input: text });
  return response.data[0].embedding;
}

/**
 * Lưu memory mới vào SQLite.
 *
 * @param {string} text
 * @param {number[]} vector
 * @param {string} type — 'preference' | 'behavior' | 'fact' | 'context'
 * @returns {string} id
 */
function saveMemoryVector(text, vector, type = 'fact') {
  const db = getDb();
  const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const validType = Object.values(MEMORY_TYPES).includes(type) ? type : 'fact';

  db.prepare(`
    INSERT INTO memories (id, type, text, vector, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, validType, text, JSON.stringify(vector), new Date().toISOString());

  return id;
}

/**
 * Tìm topK memories liên quan nhất đến query vector.
 * Có thể filter theo type.
 *
 * @param {number[]} queryVector
 * @param {number} topK
 * @param {number} minScore
 * @param {string|null} type — filter theo loại, null = tất cả
 * @returns {Array<{ id, type, text, timestamp, score }>}
 */
function searchRelevant(queryVector, topK = 3, minScore = 0.5, type = null) {
  const db = getDb();

  const rows = type
    ? db.prepare('SELECT id, type, text, vector, timestamp FROM memories WHERE type = ?').all(type)
    : db.prepare('SELECT id, type, text, vector, timestamp FROM memories').all();

  const scored = rows.map((row) => ({
    id: row.id,
    type: row.type,
    text: row.text,
    timestamp: row.timestamp,
    score: cosineSimilarity(queryVector, JSON.parse(row.vector)),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((entry) => entry.score >= minScore)
    .slice(0, topK);
}

/**
 * Lấy tất cả memories theo type (không cần vector search).
 * Dùng để inject toàn bộ fact/preference vào prompt.
 *
 * @param {string} type
 * @returns {Array<{ id, type, text, timestamp }>}
 */
function getMemoriesByType(type) {
  const db = getDb();
  return db.prepare(
    'SELECT id, type, text, timestamp FROM memories WHERE type = ? ORDER BY timestamp DESC'
  ).all(type);
}

module.exports = {
  MEMORY_TYPES,
  cosineSimilarity,
  loadVectors,
  saveVectors,
  embedText,
  saveMemoryVector,
  searchRelevant,
  getMemoriesByType,
  VECTOR_FILE,
};