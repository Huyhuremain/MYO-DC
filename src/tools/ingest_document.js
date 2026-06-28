const fs = require('fs');
const path = require('path');
const { chunkText } = require('../core/rag/chunker');
const { saveDocument, listDocuments, removeDocument } = require('../core/rag/document_store');
const { embedText } = require('../core/memory/semantic_memory');

const definition = {
  type: 'function',
  function: {
    name: 'ingest_document',
    description: 'Nạp tài liệu (TXT/MD) vào knowledge base để Agent có thể tìm kiếm và trả lời dựa trên nội dung tài liệu',
    parameters: {
      type: 'object',
      properties: {
        filepath: {
          type: 'string',
          description: 'Đường dẫn đến file tài liệu cần nạp (TXT hoặc MD)'
        },
        chunk_size: {
          type: 'number',
          description: 'Kích thước mỗi chunk (mặc định: 500 ký tự)'
        }
      },
      required: ['filepath']
    }
  }
};

/**
 * Embedding client — inject qua init().
 */
let embedClient = null;
let embedModel = 'text-embedding-3-small';

function initDocumentEmbed(client, model) {
  embedClient = client;
  embedModel = model;
}

async function execute({ filepath, chunk_size }) {
  // Kiểm tra file tồn tại
  if (!fs.existsSync(filepath)) {
    return `Lỗi: File không tồn tại: ${filepath}`;
  }

  // Chỉ hỗ trợ text files
  const ext = path.extname(filepath).toLowerCase();
  if (!['.txt', '.md', '.text', '.markdown'].includes(ext)) {
    return `Lỗi: Chỉ hỗ trợ file TXT/MD. Nhận được: ${ext}`;
  }

  // Đọc nội dung
  const content = fs.readFileSync(filepath, 'utf-8');
  if (!content || content.trim().length === 0) {
    return 'Lỗi: File rỗng.';
  }

  // Chunk
  const chunks = chunkText(content, { chunkSize: chunk_size || 500 });

  // Embed từng chunk
  if (!embedClient) {
    return `Lỗi: Embedding client chưa khởi tạo. Lưu ${chunks.length} chunks (không embedding).`;
  }

  const embeddedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const vector = await embedText(chunks[i].text, embedClient, embedModel);
      embeddedChunks.push({
        id: `doc_${i}`,
        text: chunks[i].text,
        vector,
      });
    } catch (err) {
      console.error(`[ingest_document] Embed chunk ${i} lỗi:`, err.message);
      // Vẫn giữ chunk nhưng không vector
      embeddedChunks.push({
        id: `doc_${i}`,
        text: chunks[i].text,
        vector: [],
      });
    }
  }

  // Save vào store
  const filename = path.basename(filepath);
const savedCount = saveDocument(filename, embeddedChunks, {
  url: '',
  label: filename,
  crawl_date: new Date().toISOString().slice(0, 10),
});

  return `Đã nạp "${filename}": ${chunks.length} chunks, ${savedCount} đã lưu vào knowledge base.`;
}

module.exports = { definition, execute, initDocumentEmbed };
