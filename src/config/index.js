const paths = require('./paths');
const { parseProviders } = require('../core/provider_router');

/**
 * Parse số an toàn từ env var
 */
function parseIntSafe(value, defaultValue, varName) {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`[Config] ${varName} phải là số hợp lệ, nhận được: "${value}"`);
  }
  return parsed;
}

/**
 * Load và validate toàn bộ config từ environment variables.
 * Gọi sau khi dotenv.config() đã chạy.
 *
 * @returns {AppConfig}
 */
function loadConfig() {
  // Validate required fields
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      '[Config] OPENAI_API_KEY chưa được cấu hình trong .env\n' +
      'Hướng dẫn: Tạo file .env và thêm dòng:\n' +
      'OPENAI_API_KEY=your-api-key-here'
    );
  }

  // Parse numbers safely
  const shortTermMax = parseIntSafe(process.env.SHORT_TERM_MAX, 10, 'SHORT_TERM_MAX');
  const port = parseIntSafe(process.env.PORT, 3000, 'PORT');

  // Validate ranges
  if (shortTermMax < 1 || shortTermMax > 100) {
    throw new Error('[Config] SHORT_TERM_MAX phải trong khoảng 1-100');
  }
  if (port < 1 || port > 65535) {
    throw new Error('[Config] PORT phải trong khoảng 1-65535');
  }

  return {
    // LLM settings
    llm: {
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.MODEL || 'gpt-4o-mini',
    },

    // Multi-provider settings (DL4)
    providers: parseProviders(),

    // Memory settings
    memory: {
      shortTermMax,
      memoryFile: paths.MEMORY_FILE,
    },

    // Semantic memory / Embedding settings (DL1)
    // [FIX] Thêm apiKey + baseURL riêng cho embedding.
    // Nếu không set EMBEDDING_API_KEY/EMBEDDING_BASE_URL, fallback dùng
    // chung với LLM (giữ backward compat cho provider hỗ trợ cả 2 qua 1 endpoint).
    embedding: {
      apiKey: process.env.EMBEDDING_API_KEY || apiKey,
      baseURL: process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      topK: parseIntSafe(process.env.SEMANTIC_MEMORY_TOP_K, 3, 'SEMANTIC_MEMORY_TOP_K'),
      minScore: parseFloat(process.env.SEMANTIC_MEMORY_MIN_SCORE || '0.5'),
    },

    // Context compaction settings (DL2)
    compaction: {
      threshold: parseIntSafe(process.env.COMPACTION_THRESHOLD, 8, 'COMPACTION_THRESHOLD'),
      keepRecent: parseIntSafe(process.env.COMPACTION_KEEP_RECENT, 2, 'COMPACTION_KEEP_RECENT'),
    },

    // Document RAG settings (DL5)
    rag: {
      topK: parseIntSafe(process.env.RAG_TOP_K, 5, 'RAG_TOP_K'),
      chunkSize: parseIntSafe(process.env.RAG_CHUNK_SIZE, 500, 'RAG_CHUNK_SIZE'),
      chunkOverlap: parseIntSafe(process.env.RAG_CHUNK_OVERLAP, 50, 'RAG_CHUNK_OVERLAP'),
      minScore: parseFloat(process.env.RAG_MIN_SCORE || '0.5'),
    },

    // Server settings (Phase 2)
    server: {
      port,
      secretToken: process.env.SECRET_TOKEN || '',
    },

    // Telegram (Phase 2)
    telegram: {
      token: process.env.TELEGRAM_BOT_TOKEN || '',
    },

    // Discord (Phase 3)
    discord: {
      token: process.env.DISCORD_BOT_TOKEN || '',
    },

// Gmail SMTP — gửi email thật
    gmail: {
      user: process.env.GMAIL_USER || '',
      appPassword: process.env.GMAIL_APP_PASSWORD || '',
    },

    // Paths
    paths,

    // App info
    app: {
      name: 'DaisyClaw',
      version: '1.0.0',
    },
  };
}

module.exports = { loadConfig };