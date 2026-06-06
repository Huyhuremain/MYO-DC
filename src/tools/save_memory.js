const { longTerm, semanticMemory } = require('../core/memory');

const definition = {
  type: 'function',
  function: {
    name: 'save_memory',
    description: 'Lưu thông tin quan trọng về chủ nhân vào trí nhớ dài hạn (tên, sở thích, thói quen, yêu cầu đặc biệt...)',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Nội dung cần ghi nhớ (ví dụ: "Chủ nhân tên Long, thích cà phê đen")'
        }
      },
      required: ['content']
    }
  }
};

/**
 * Embedding client — sẽ được inject qua init().
 */
let embedClient = null;
let embedModel = 'text-embedding-3-small';

/**
 * Khởi tạo embedding client cho save_memory.
 * Gọi sau khi Agent khởi tạo.
 */
function initSemanticSave(client, model) {
  embedClient = client;
  embedModel = model;
}

async function execute({ content }) {
  // 1. Luôn lưu text vào MEMORY.md
  const success = longTerm.appendMemory(content);
  if (!success) {
    return 'Lỗi: Không thể lưu trí nhớ.';
  }

  // 2. Thử lưu semantic vector (nếu embedding client sẵn)
  if (embedClient) {
    try {
      const vector = await semanticMemory.embedText(content, embedClient, embedModel);
      semanticMemory.saveMemoryVector(content, vector);
      return `Đã ghi nhớ (text + semantic): "${content}"`;
    } catch (err) {
      console.error('[save_memory] Semantic embed lỗi:', err.message);
      // Vẫn trả success vì text đã lưu
      return `Đã ghi nhớ (text only): "${content}"`;
    }
  }

  return `Đã ghi nhớ: "${content}"`;
}

module.exports = { definition, execute, initSemanticSave };
