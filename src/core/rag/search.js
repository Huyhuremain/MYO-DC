const { cosineSimilarity } = require('../memory/semantic_memory');
const { getAllChunks } = require('./document_store');

/**
 * Semantic Search — Tìm chunks liên quan trong document store.
 * Dùng cosine similarity (reuse từ semantic_memory).
 */

/**
 * Tìm topK chunks liên quan nhất đến query vector.
 *
 * @param {number[]} queryVector - Vector của câu hỏi
 * @param {number} topK - Số kết quả trả về
 * @param {number} minScore - Điểm tối thiểu
 * @returns {Array<{ text, filename, score }>}
 */
function searchDocuments(queryVector, topK = 5, minScore = 0.5) {
  const chunks = getAllChunks();

  if (chunks.length === 0) return [];

  const scored = chunks.map((chunk) => ({
    text: chunk.text,
    filename: chunk.filename,
    id: chunk.id,
    score: cosineSimilarity(queryVector, chunk.vector),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored
    .filter((entry) => entry.score >= minScore)
    .slice(0, topK);
}

module.exports = { searchDocuments };
