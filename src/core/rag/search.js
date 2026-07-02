const { cosineSimilarity } = require('../memory/semantic_memory');
const { getAllChunks } = require('./document_store');

function keywordSearch(query, chunks, topK) {
  const keywords = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (keywords.length === 0) {
    return chunks.slice(0, topK).map(c => ({ ...c, score: 1 }));
  }

  const scored = chunks.map(chunk => {
    const text = chunk.text.toLowerCase();
    const matchCount = keywords.filter(kw => text.includes(kw)).length;
    const score = matchCount / keywords.length;
    return { ...chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const matched = scored.filter(c => c.score > 0).slice(0, topK);
  return matched.length > 0 ? matched : scored.slice(0, topK);
}

/**
 * [Phương án 1+2] Truyền queryText vào getAllChunks() để SQL pre-filter
 * trước khi load vào RAM, giảm tải tính cosine similarity.
 */
function searchDocuments(queryVector, topK = 5, minScore = 0.5, queryText = '') {
  const chunks = getAllChunks(queryText);
  if (chunks.length === 0) return [];

  const hasValidQuery = queryVector && queryVector.length > 0;
  const hasValidChunks = chunks.some(c => c.vector && c.vector.length > 0);

  if (!hasValidQuery || !hasValidChunks) {
    console.log('[RAG] Embedding không khả dụng → dùng keyword search');
    return keywordSearch(queryText, chunks, topK);
  }

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