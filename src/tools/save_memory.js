const { longTerm, semanticMemory } = require('../core/memory');
const { MEMORY_TYPES } = require('../core/memory/semantic_memory');

const definition = {
  type: 'function',
  function: {
    name: 'save_memory',
    description: 'Lưu thông tin quan trọng về chủ nhân vào trí nhớ dài hạn. Phân loại đúng type để tìm kiếm chính xác hơn sau này.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Nội dung cần ghi nhớ. Viết rõ ràng, đầy đủ ngữ cảnh. Ví dụ: "Chủ nhân tên Huy, làm AI Engineer tại TP.HCM"',
        },
        type: {
          type: 'string',
          enum: ['fact', 'preference', 'behavior', 'context'],
          description: [
            'Phân loại memory:',
            '- fact: thông tin cố định (tên, tuổi, nghề nghiệp, nơi sống)',
            '- preference: sở thích, thứ thích/không thích (thích cà phê, không thích họp sáng)',
            '- behavior: thói quen, cách làm việc (hay làm việc đêm, dùng VS Code)',
            '- context: ngữ cảnh hiện tại, mục tiêu đang làm (đang xây dự án DaisyClaw, học Rust)',
          ].join('\n'),
        },
      },
      required: ['content', 'type'],
    },
  },
};

let embedClient = null;
let embedModel = 'text-embedding-3-small';

function initSemanticSave(client, model) {
  embedClient = client;
  embedModel = model;
}

async function execute({ content, type = 'fact' }) {
  // Validate type
  const validTypes = Object.values(MEMORY_TYPES);
  const memType = validTypes.includes(type) ? type : 'fact';

  // 1. Luôn lưu text vào MEMORY.md (backward compat)
  const success = longTerm.appendMemory(`[${memType}] ${content}`);
  if (!success) {
    return 'Lỗi: Không thể lưu trí nhớ.';
  }

  // 2. Lưu semantic vector với type
  if (embedClient) {
    try {
      const vector = await semanticMemory.embedText(content, embedClient, embedModel);
      semanticMemory.saveMemoryVector(content, vector, memType);
      return `Đã ghi nhớ (${memType}): "${content}"`;
    } catch (err) {
      console.error('[save_memory] Semantic embed lỗi:', err.message);
      return `Đã ghi nhớ text (${memType}): "${content}"`;
    }
  }

  return `Đã ghi nhớ: "${content}"`;
}

module.exports = { definition, execute, initSemanticSave };