/**
 * Migration script: JSON → SQLite
 * Chạy 1 lần: node migrate.js
 * Sau đó có thể xóa file này.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// Paths JSON cũ
const ROOT_DIR = path.resolve(__dirname);
const OLD_VECTORS  = path.join(ROOT_DIR, 'data', 'memory', 'vectors.json');
const OLD_STORE    = path.join(ROOT_DIR, 'data', 'documents', 'store.json');

// Import modules mới (đã dùng SQLite)
const { saveMemoryVector } = require('./src/core/memory/semantic_memory');
const { saveDocument }     = require('./src/core/rag/document_store');
const { closeDb }          = require('./src/core/db');

async function migrate() {
  let migratedMemories = 0;
  let migratedDocs = 0;
  let migratedChunks = 0;

  // ── 1. Migrate vectors.json ──────────────────────────────────────────────
  if (fs.existsSync(OLD_VECTORS)) {
    console.log('📦 Đang migrate vectors.json...');
    const vectors = JSON.parse(fs.readFileSync(OLD_VECTORS, 'utf-8'));

    for (const entry of vectors) {
      try {
        saveMemoryVector(entry.text, entry.vector);
        migratedMemories++;
      } catch (err) {
        console.error(`  ❌ Bỏ qua memory "${entry.id}": ${err.message}`);
      }
    }
    console.log(`  ✅ ${migratedMemories} memories đã migrate`);
  } else {
    console.log('ℹ️  Không tìm thấy vectors.json — bỏ qua');
  }

  // ── 2. Migrate store.json ────────────────────────────────────────────────
  if (fs.existsSync(OLD_STORE)) {
    console.log('📦 Đang migrate store.json...');
    const store = JSON.parse(fs.readFileSync(OLD_STORE, 'utf-8'));

    for (const doc of store.documents || []) {
      try {
        // Đảm bảo chunks có đúng format mà saveDocument() cần
        const chunks = (doc.chunks || []).map((c, i) => ({
          id:     c.id || `chunk_${doc.filename}_${i}`,
          text:   c.text,
          vector: c.vector,
          index:  i,
        }));

        saveDocument(doc.filename, chunks);
        migratedDocs++;
        migratedChunks += chunks.length;
      } catch (err) {
        console.error(`  ❌ Bỏ qua document "${doc.filename}": ${err.message}`);
      }
    }
    console.log(`  ✅ ${migratedDocs} tài liệu, ${migratedChunks} chunks đã migrate`);
  } else {
    console.log('ℹ️  Không tìm thấy store.json — bỏ qua');
  }

  closeDb();

  console.log('\n🎉 Migration hoàn tất!');
  console.log('   → Bạn có thể backup rồi xóa vectors.json và store.json cũ.');
}

migrate().catch((err) => {
  console.error('❌ Migration thất bại:', err.message);
  process.exit(1);
});