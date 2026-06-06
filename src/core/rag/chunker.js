const fs = require('fs');
const path = require('path');

/**
 * Text Chunker — Chia tài liệu thành các đoạn nhỏ để embed.
 *
 * Strategy: split by paragraphs, merge nhỏ, cắt lớn.
 */

/**
 * Chia text thành chunks.
 *
 * @param {string} text - Nội dung tài liệu
 * @param {object} opts - { chunkSize: 500, overlap: 50 }
 * @returns {Array<{ text: string, index: number }>}
 */
function chunkText(text, opts = {}) {
  const chunkSize = opts.chunkSize || 500;
  const overlap = opts.overlap || 50;

  if (!text || text.trim() === '') return [];

  // Chia theo đoạn (double newline hoặc single newline)
  const paragraphs = text.split(/\n{1,2}/).filter((p) => p.trim().length > 0);

  const chunks = [];
  let current = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();

    // Nếu paragraph vừa thêm vào current không vượt chunkSize
    if ((current + '\n' + trimmed).length <= chunkSize) {
      current = current ? current + '\n' + trimmed : trimmed;
    } else {
      // Lưu chunk hiện tại
      if (current) {
        chunks.push({ text: current, index: chunkIndex++ });
      }

      // Nếu paragraph đơn lẻ > chunkSize → cắt nhỏ
      if (trimmed.length > chunkSize) {
        const subChunks = splitLargeText(trimmed, chunkSize, overlap);
        for (const sc of subChunks) {
          chunks.push({ text: sc, index: chunkIndex++ });
        }
        current = '';
      } else {
        current = trimmed;
      }
    }
  }

  // Chunk cuối cùng
  if (current) {
    chunks.push({ text: current, index: chunkIndex });
  }

  return chunks;
}

/**
 * Cắt text lớn thành các đoạn nhỏ có overlap.
 */
function splitLargeText(text, chunkSize, overlap) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break; // reached end — avoid infinite loop
    start = end - overlap;
  }

  return chunks;
}

module.exports = { chunkText };
