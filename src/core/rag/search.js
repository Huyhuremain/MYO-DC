const { cosineSimilarity } = require('../memory/semantic_memory');
const { getAllChunks } = require('./document_store');

/**
 * Semantic Search — Tìm chunks liên quan trong document store.
 *
 * Fallback logic:
 * - Nếu embedding hoạt động → cosine similarity search
 * - Nếu embedding tắt (vector rỗng) → keyword search đơn giản
 */

/**
 * Keyword search đơn giản — dùng khi không có vector.
 * Tìm chunks có chứa từ khóa từ query.
 */
function keywordSearch(query, chunks, topK) {
  const keywords = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2); // bỏ từ quá ngắn

  if (keywords.length === 0) {
    // Không có keyword → trả topK chunks đầu tiên
    return chunks.slice(0, topK).map(c => ({ ...c, score: 1 }));
  }

  const scored = chunks.map(chunk => {
    const text = chunk.text.toLowerCase();
    const matchCount = keywords.filter(kw => text.includes(kw)).length;
    const score = matchCount / keywords.length;
    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Trả về chunks có ít nhất 1 keyword match, hoặc topK đầu nếu không có match
  const matched = scored.filter(c => c.score > 0).slice(0, topK);
  return matched.length > 0 ? matched : scored.slice(0, topK);
}

/**
 * Tìm topK chunks liên quan nhất đến query vector.
 * Tự động fallback về keyword search nếu embedding không hoạt động.
 *
 * @param {number[]} queryVector - Vector của câu hỏi (có thể rỗng)
 * @param {number} topK
 * @param {number} minScore
 * @param {string} [queryText] - Text gốc để dùng cho keyword search fallback
 * @returns {Array<{ text, filename, score }>}
 */
function searchDocuments(queryVector, topK = 5, minScore = 0.5, queryText = '') {
  const chunks = getAllChunks();
  if (chunks.length === 0) return [];

  // Kiểm tra embedding có hoạt động không
  // Embedding hoạt động khi: queryVector có giá trị VÀ chunks có vector thật
  const hasValidQuery = queryVector && queryVector.length > 0;
  const hasValidChunks = chunks.some(c => c.vector && c.vector.length > 0);

  if (!hasValidQuery || !hasValidChunks) {
    // Fallback: keyword search
    console.log('[RAG] Embedding không khả dụng → dùng keyword search');
    return keywordSearch(queryText, chunks, topK);
  }

  // Vector search bình thường
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