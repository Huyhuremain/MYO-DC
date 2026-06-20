# DaisyClaw — Project Status

> Cập nhật lần cuối: 2026-06-20

---

## Tổng quan

**DaisyClaw** là personal AI agent chạy local, xây dựng bằng Node.js. Single-user, chạy trên Windows local, giao tiếp qua Web UI (React) và Telegram Bot.

**Stack chính**: Node.js (CommonJS) · Express 5 · SQLite (better-sqlite3) · Gemini 2.5 Flash (LLM) · OpenAI text-embedding-3-small (Embedding) · React + Vite

---

## Trạng thái các tính năng

### ✅ Hoàn thành & hoạt động

| Tính năng | Mô tả |
|---|---|
| **ReAct Loop** | Tool execution, streaming SSE, multi-round |
| **SQLite** | Thay thế JSON files, migration an toàn |
| **Memory System** | Short-term (RAM), Long-term (MEMORY.md), Semantic (vectors), Compaction |
| **Memory Types** | fact / preference / behavior / context — LLM tự phân loại |
| **RAG** | Chunk + embed + cosine search, keyword fallback khi embedding tắt |
| **Web Crawler** | node-cron 7h sáng, tool manage_watched_urls (6 actions) |
| **Multi-Agent** | Intent classifier → SearchAgent / AnalysisAgent / Orchestrator |
| **Conversation Summary** | Auto-save sau mỗi session ≥ 4 tin nhắn |
| **Embedding riêng** | OpenAI text-embedding-3-small tách biệt với Gemini LLM |
| **Multi-provider** | ProviderRouter với fallback chain |
| **Web UI** | React + Vite, chat, upload ảnh OCR, health check |

### ⚠️ Hoạt động nhưng có vấn đề

| Tính năng | Vấn đề | Hướng fix |
|---|---|---|
| **SearchAgent** | Không nhất quán — không có Search API thật, chỉ có web_scraper đọc URL cụ thể | Tích hợp Brave/DuckDuckGo/SerpAPI |
| **AnalysisAgent** | Đôi khi hỏi xin phép tìm web thay vì dùng kiến thức nền | Tinh chỉnh system prompt |
| **RAG từ crawler** | Documents bị trùng do makeDocName() còn timestamp | Bỏ timestamp, cleanup DB cũ |
| **Intent classifier** | Câu hỏi về watched URLs bị classify là `search` thay vì `chat` | Đã sửa intent.js |

### ⬜ Chưa làm

| Tính năng | Ghi chú |
|---|---|
| **Retry 429** | agent.js chưa có retry riêng cho status 429 |
| **Search API thật** | Brave/DuckDuckGo/SerpAPI cho SearchAgent |
| **Memory Agent** | Lưu kết quả sub-agents có cấu trúc |
| **Memory deduplication** | Tránh lưu trùng thông tin |
| **Memory cleanup** | Xóa memories cũ/lỗi thời |
| **Discord bot** | Gateway thứ 3 sau Web UI và Telegram |
| **Cache intent** | Skip classify cho message ngắn < 10 từ |

---

## Kiến trúc

```
React UI (5173) / Telegram Bot
        ↓
Express Server (3000) — auth middleware
  POST /api/chat · GET /api/chat/stream · POST /api/upload
        ↓
Agent (Orchestrator)
  ├── Intent Classifier → chat / search / analysis / multi
  ├── SearchAgent (web_scraper, manage_watched_urls, get_current_time)
  ├── AnalysisAgent (LLM only, no tools)
  ├── Short-term memory + Compaction
  ├── Semantic search + RAG inject
  └── ReAct loop (max 10 rounds)
        ↓
Gemini 2.5 Flash (LLM) + OpenAI text-embedding-3-small (Embedding)
```

---

## Cấu trúc thư mục chính

```
src/
├── api/routes/          # chat.js, stream.js, upload.js
├── core/
│   ├── agent.js         # Orchestrator chính
│   ├── base_agent.js    # Base class cho sub-agents
│   ├── search_agent.js  # Web search specialist
│   ├── analysis_agent.js # Analysis specialist
│   ├── intent.js        # Intent classifier
│   ├── prompts.js       # System prompt builder
│   ├── crawler/         # crawler.js + scheduler.js
│   ├── memory/          # short_term, long_term, semantic, compaction, conversation_summary
│   └── rag/             # chunker, document_store, search
└── tools/               # calculator, web_scraper, save_memory, manage_watched_urls, ...
```

---

## Database Schema (SQLite)

```sql
memories    -- id, type, text, vector, timestamp
documents   -- filename, ingested_at, chunk_count
chunks      -- id, filename, text, vector, chunk_index
watched_urls -- url, label, schedule, active, added_at
crawl_logs  -- id, url, crawled_at, content_hash, status, error_msg
```

---

## Config (.env) — cần thiết lập

```env
# LLM
OPENAI_API_KEY=        # Gemini API key
OPENAI_BASE_URL=       # https://generativelanguage.googleapis.com/v1beta/openai/
MODEL=                 # gemini-2.5-flash

# Embedding (riêng biệt)
EMBEDDING_API_KEY=     # OpenAI API key
EMBEDDING_BASE_URL=    # https://api.openai.com/v1
EMBEDDING_MODEL=       # text-embedding-3-small

# Memory
SHORT_TERM_MAX=10
SEMANTIC_MEMORY_TOP_K=3
SEMANTIC_MEMORY_MIN_SCORE=0.5

# Compaction
COMPACTION_THRESHOLD=8
COMPACTION_KEEP_RECENT=2

# RAG
RAG_TOP_K=5
RAG_CHUNK_SIZE=500
RAG_CHUNK_OVERLAP=50
RAG_MIN_SCORE=0.5

# Server
PORT=3000
SECRET_TOKEN=          # Random string để auth API
TELEGRAM_BOT_TOKEN=    # Optional
```

---

## Chạy dự án

```powershell
# Cài dependencies
npm install

# Chạy server
node src/server.js

# Chạy tests
$env:TEST_DB=":memory:"; node --max-old-space-size=4096 --test

# Chạy frontend (terminal khác)
cd client && npm run dev
```

---

## Test

**68 tests pass** — intent (16), base_agent (17), sub_agents (19), orchestrator (16)

```powershell
$env:TEST_DB=":memory:"; node --max-old-space-size=4096 --test
```

---

## Lưu ý quan trọng

- CommonJS throughout — không dùng `import/export`
- `data/` folder bị gitignore — cần tạo lại khi clone (`data/memory/`, `data/uploads/`)
- Backup định kỳ: `data/daisyclaw.db` + `data/memory/MEMORY.md`
- `SECRET_TOKEN` phải random, không commit lên git