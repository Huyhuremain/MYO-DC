const fs = require('fs');
const path = require('path');
const { MEMORY_DIR } = require('../../config/paths');

const VECTOR_FILE = path.join(MEMORY_DIR, 'vectors.json');

/**
 * Cosine similarity giữa 2 vector.
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Đọc vector store từ file.
 */
function loadVectors() {
  try {
    if (!fs.existsSync(VECTOR_FILE)) return [];
    return JSON.parse(fs.readFileSync(VECTOR_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Ghi vector store vào file.
 */
function saveVectors(vectors) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(VECTOR_FILE, JSON.stringify(vectors, null, 2), 'utf-8');
}

/**
 * Embed text thành vector qua API.
 * Hỗ trợ OpenAI-compatible embeddings endpoint.
 */
async function embedText(text, client, model) {
  const response = await client.embeddings.create({
    model,
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * Lưu memory mới vào vector store.
 */
function saveMemoryVector(text, vector) {
  const vectors = loadVectors();
  const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  vectors.push({
    id,
    text,
    vector,
    timestamp: new Date().toISOString(),
  });
  saveVectors(vectors);
  return id;
}

/**
 * Tìm topK memories liên quan nhất đến query vector.
 */
function searchRelevant(queryVector, topK = 3, minScore = 0.5) {
  const vectors = loadVectors();
  const scored = vectors.map((entry) => ({
    ...entry,
    score: cosineSimilarity(queryVector, entry.vector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((entry) => entry.score >= minScore)
    .slice(0, topK);
}

module.exports = {
  cosineSimilarity,
  loadVectors,
  saveVectors,
  embedText,
  saveMemoryVector,
  searchRelevant,
  VECTOR_FILE,
};
