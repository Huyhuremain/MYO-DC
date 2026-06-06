# DAISYCLAW — PROJECT STATUS

> File này lưu lại trạng thái, tiến độ và kiến trúc hiện tại của dự án.
> Cập nhật lần cuối: 2026-04-11

---

## 1. Tổng quan

| Mục | Giá trị |
|-----|---------|
| Tên dự án | DaisyClaw — Tác tử AI cá nhân |
| Phiên bản | 1.0.0 |
| Runtime | Node.js (CommonJS) |
| LLM Provider | OpenAI-compatible API (`chiasegpu.vn`) |
| Model hiện tại | `gemma-4-31b-it` |
| Entry point (terminal) | `src/index.js` |
| Entry point (server) | `src/server.js` |
| Chạy terminal | `npm start` |
| Chạy server | `npm run server` |

---

## 2. Tiến độ Roadmap

| Phase | Mô tả | Trạng thái |
|-------|--------|------------|
| **Phase 1** | Lõi AI: ReAct loop + Tools cơ bản + Terminal | **DONE** |
| **Phase 2** | Express API Server + Bot Telegram Gateway | **SKELETON DONE** |
| **Phase 3** | Tools nâng cao (Vision, Web Scraping) + QA | TODO |

### Phase 1 — Chi tiết hoàn thành

- [x] Centralized config system (`src/config/`)
- [x] API Contract / Protocol (`src/protocol/`)
- [x] ReAct loop với OpenAI function calling (`src/core/agent.js`)
- [x] System prompt + inject long-term memory (`src/core/prompts.js`)
- [x] Short-term memory — sliding window 10 msg (`src/core/memory/short_term.js`)
- [x] Long-term memory — đọc/ghi `data/memory/MEMORY.md` (`src/core/memory/long_term.js`)
- [x] Tool: `calculator` — mathjs safe eval
- [x] Tool: `get_current_time` — UTC+7
- [x] Tool: `save_memory` — ghi vào MEMORY.md
- [x] Tool registry + executor (`src/tools/registry.js`)
- [x] Terminal runner (`src/index.js`)

### Phase 2 — Skeleton done, Khoẻ tiếp tục phát triển

- [x] Tạo `src/api/server.js` — Express.js wrap Agent (skeleton)
- [x] Endpoint `POST /api/chat` — nhận `{ message, source }`, trả `{ status, data }` (skeleton)
- [x] Middleware auth: `Authorization: Bearer <SECRET_TOKEN>` (skeleton)
- [x] Tạo `src/bot_gateway/telegram.js` — Telegraf bot (skeleton)
- [x] Tạo `src/server.js` — Entry point server mode
- [x] Config: thêm telegram/discord token vào loadConfig()
- [ ] Khoẻ: Test API server với `npm run server` + `curl`
- [ ] Khoẻ: Cấu hình TELEGRAM_BOT_TOKEN trong `.env` + test bot
- [ ] Khoẻ: Thêm error handling middleware (`src/api/middleware/error.js`)
- [ ] Khoẻ: Rate limiting + security hardening
- [ ] Khoẻ: Discord bot (`src/bot_gateway/discord.js`)

### Phase 3 — Việc cần làm

- [ ] Tool: Vision/OCR — xử lý ảnh hóa đơn, tài liệu
- [ ] Tool: File Reader — đọc .pdf, .docx
- [ ] Tool: Web Scraper — trích xuất nội dung từ URL
- [ ] Kiểm thử tự động (test suite)
- [ ] Tinh chỉnh System Prompt chống ảo giác
- [ ] Báo cáo bảo vệ

---

## 3. Cấu trúc thư mục hiện tại

```
DA-DaisyClaw/
├── .env                              # API keys (gitignored)
├── .gitignore
├── package.json
├── OpenClawClone.md                  # Tài liệu tham khảo OpenClaw
├── TEAM_PLAN.md                      # Kế hoạch nhóm
├── PROJECT_STATUS.md                 # << FILE NÀY
│
├── data/
│   └── memory/
│       └── MEMORY.md                 # Trí nhớ dài hạn (persistent)
│
└── src/
    ├── index.js                      # Entry: terminal mode (npm start)
    ├── server.js                     # Entry: API + Bot mode (npm run server)
    │
    ├── config/                       # Cấu hình tập trung
    │   ├── index.js                  #   loadConfig() — validate env, trả object
    │   └── paths.js                  #   Path constants: ROOT, DATA, MEMORY, LOGS
    │
    ├── protocol/                     # API Contract — 3 dev dùng chung
    │   ├── types.js                  #   createRequest / createSuccessResponse / createErrorResponse
    │   └── errors.js                 #   ErrorCodes (9 mã lỗi chuẩn)
    │
    ├── core/                         # DOMAIN: Lõi AI (Long)
    │   ├── agent.js                  #   Class Agent — ReAct loop, OpenAI function calling
    │   ├── prompts.js                #   buildSystemPrompt() — inject MEMORY.md
    │   └── memory/
    │       ├── index.js              #   Export { ShortTermMemory, longTerm }
    │       ├── short_term.js         #   Sliding window (configurable, mặc định 10)
    │       └── long_term.js          #   readMemory() / appendMemory() -> MEMORY.md
    │
    ├── api/                          # DOMAIN: API Server (Khoẻ)
    │   ├── index.js                  #   Re-export { startServer }
    │   ├── server.js                 #   Express app + startServer()
    │   ├── middleware/
    │   │   └── auth.js               #   Bearer token authentication
    │   └── routes/
    │       └── chat.js               #   POST /api/chat handler
    │
    ├── bot_gateway/                  # DOMAIN: Bot Gateway (Khoẻ)
    │   ├── index.js                  #   startBots() — boot tất cả bot
    │   └── telegram.js              #   Telegraf bot — nhận tin → gọi Agent
    │
    └── tools/                        # DOMAIN: Tools (Huy)
        ├── index.js                  #   Re-export registry
        ├── registry.js               #   Tool map + getToolDefinitions() + executeTool()
        ├── calculator.js             #   mathjs evaluate — tính toán an toàn
        ├── get_current_time.js       #   Thời gian VN (Asia/Ho_Chi_Minh)
        └── save_memory.js            #   Ghi thông tin vào long-term memory
```

---

## 4. Phân vùng làm việc (3 Dev)

```
Long (Trùm Lõi AI)         -> src/core/  +  src/config/  +  src/protocol/  +  src/index.js
Khoẻ (Trùm Giao Tiếp)     -> src/api/   +  src/bot_gateway/  +  src/server.js
Huy  (Trùm Công Cụ)       -> src/tools/
```

**Quy tắc tránh xung đột:**
- Mỗi dev chỉ sửa trong domain của mình
- Giao tiếp giữa module qua `protocol/` (types.js + errors.js)
- Khoẻ import Agent qua `require('../core/agent')` — không sửa core
- Huy thêm tool mới: tạo file + đăng ký trong `registry.js` — không sửa core

---

## 5. API Contract

### Request (Gateway -> Core)

```json
{
  "message": "Tính dùm cái hóa đơn này",
  "source": "telegram",
  "timestamp": "2026-04-10T12:00:00.000Z"
}
```

### Response thành công (Core -> Gateway)

```json
{
  "status": "success",
  "data": {
    "reply_text": "Tổng hóa đơn là 500k nhé sếp!",
    "tools_used": ["vision_ocr", "calculator"]
  }
}
```

### Response lỗi

```json
{
  "status": "error",
  "error": {
    "code": "LLM_ERROR",
    "message": "402 Insufficient credits"
  }
}
```

### Mã lỗi (ErrorCodes)

| Code | Ý nghĩa |
|------|---------|
| INVALID_REQUEST | Request sai format |
| UNAUTHORIZED | Thiếu/sai SECRET_TOKEN |
| MISSING_MESSAGE | Không có message |
| AGENT_ERROR | Lỗi xử lý Agent |
| TOOL_ERROR | Lỗi chạy tool |
| LLM_ERROR | Lỗi API LLM |
| MAX_ROUNDS_EXCEEDED | Vượt quá 10 vòng ReAct |
| CONFIG_ERROR | Lỗi cấu hình |
| INTERNAL_ERROR | Lỗi hệ thống |

---

## 6. Cấu hình (.env)

```env
OPENAI_API_KEY=sk-...              # Bắt buộc
OPENAI_BASE_URL=https://...        # Tùy chọn (mặc định: api.openai.com)
MODEL=gemma-4-31b-it               # Tùy chọn (mặc định: gpt-4o-mini)
SHORT_TERM_MAX=10                  # Tùy chọn (sliding window)
PORT=3000                          # Phase 2
SECRET_TOKEN=                      # Phase 2
```

---

## 7. Dependencies

| Package | Version | Dùng cho |
|---------|---------|----------|
| openai | ^6.33.0 | Gọi LLM API (function calling) |
| dotenv | ^17.3.1 | Load .env |
| mathjs | ^15.1.1 | Calculator tool |
| express | ^5.2.1 | API Server |
| cors | ^2.8.6 | CORS middleware |
| telegraf | ^4.16.3 | Telegram bot |

---

## 8. NPM Scripts

| Script | Lệnh | Mô tả |
|--------|-------|-------|
| `npm start` | `node src/index.js` | Chế độ terminal (dev/test) |
| `npm run server` | `node src/server.js` | Chế độ server (API + Bot) |
| `npm test` | — | Chưa có test suite |

---

## 9. Hướng dẫn thêm Tool mới (cho Huy)

1. Tạo file `src/tools/<ten_tool>.js`:

```js
const definition = {
  type: 'function',
  function: {
    name: 'ten_tool',
    description: 'Mô tả tool làm gì',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: '...' }
      },
      required: ['param1']
    }
  }
};

async function execute({ param1 }) {
  // Logic xử lý
  return 'Kết quả';
}

module.exports = { definition, execute };
```

2. Đăng ký trong `src/tools/registry.js`:

```js
const tenTool = require('./ten_tool');
const tools = {
  // ... tools hiện có
  ten_tool: tenTool,
};
```

3. Xong. Agent tự động nhận tool mới.

---

## 10. Vấn đề đã biết

| # | Vấn đề | Mức độ | Ghi chú |
|---|--------|--------|---------|
| 1 | API trả 402 (hết credits) | Chặn | Cần nạp credits cho chiasegpu.vn |
| 2 | Chưa có test suite | Thấp | Phase 3 sẽ bổ sung |
| 3 | Chưa có logging ra file | Thấp | config/paths.js đã có LOGS_DIR sẵn |
