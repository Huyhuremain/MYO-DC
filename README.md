# DaisyClaw — Tác tử AI Cá nhân

DaisyClaw là một AI Agent framework xây dựng trên Node.js, sử dụng kiến trúc **ReAct loop** (Reasoning + Acting) với OpenAI function calling. Agent có khả năng suy luận, gọi công cụ, ghi nhớ ngữ cảnh và kết nối với nhiều kênh giao tiếp (API, Telegram, Discord).

Dự án được thiết kế theo kiến trúc tham chiếu [OpenClaw](OpenClawClone.md), tối ưu cho việc phát triển nhóm 3 người với domain tách biệt hoàn toàn.

---

## Tính năng

- **ReAct Loop** — Vòng lặp suy luận tối đa 10 vòng, tự động chọn và gọi tool
- **Function Calling** — Tương thích OpenAI API (hỗ trợ provider thay thế qua `OPENAI_BASE_URL`)
- **Bộ nhớ kép** — Short-term (sliding window) + Long-term (persistent file)
- **Tool Registry** — Hệ thống plugin, thêm tool mới chỉ cần tạo file + đăng ký
- **API Server** — Express.js REST API với auth middleware
- **Bot Gateway** — Telegram bot (Telegraf), mở rộng Discord
- **Protocol chuẩn** — Request/Response format thống nhất, 9 mã lỗi

---

## Cài đặt

```bash
git clone <repo-url>
cd DA-DaisyClaw
npm install
```

### Cấu hình môi trường

```bash
cp .env.example .env
```

Mở `.env` và điền các giá trị:

```env
# Bắt buộc
OPENAI_API_KEY=sk-your-api-key-here

# Tùy chọn — dùng provider khác (chiasegpu.vn, groq, ...)
# OPENAI_BASE_URL=https://api.openai.com/v1
# MODEL=gpt-4o-mini

# Tùy chọn — điều chỉnh bộ nhớ ngắn hạn
# SHORT_TERM_MAX=10

# Server mode (Phase 2)
# PORT=3000
# SECRET_TOKEN=your-secret-token

# Telegram bot (Phase 2)
# TELEGRAM_BOT_TOKEN=123456:ABC-DEF...

# Discord bot (Phase 3)
# DISCORD_BOT_TOKEN=your-discord-bot-token
```

---

## Sử dụng

### Chế độ Terminal (phát triển & test)

```bash
npm start
```

Mở terminal, gõ câu hỏi, Agent sẽ suy luận và trả lời. Gõ `exit` để thoát.

```
🤖 DaisyClaw sẵn sàng! Gõ "exit" để thoát.
Bạn: Bây giờ là mấy giờ?
Agent: [gọi get_current_time] → Bây giờ là 15:30 (UTC+7).
Bạn: Tính 15% thuế trên 2.500.000
Agent: [gọi calculator] → 15% của 2,500,000 = 375,000 VNĐ.
```

### Chế độ Server (API + Bot)

```bash
npm run server
```

Khởi chạy Express API server (mặc định port 3000) và các bot đã cấu hình.

```bash
# Test API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-token" \
  -d '{"message": "xin chào", "source": "curl"}'
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "reply_text": "Xin chào! Tôi là DaisyClaw...",
    "tools_used": []
  }
}
```

> Nếu `SECRET_TOKEN` để trống trong `.env`, auth middleware sẽ bỏ qua (dev mode).

---

## Cấu trúc dự án

```
DA-DaisyClaw/
├── .env.example                      # Template cấu hình môi trường
├── package.json
├── README.md                         # << File này
├── PROJECT_STATUS.md                 # Trạng thái & tiến độ dự án
├── TEAM_PLAN.md                      # Kế hoạch phân công nhóm
├── OpenClawClone.md                  # Tài liệu tham chiếu kiến trúc
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
    │   ├── index.js                  #   loadConfig() — validate env
    │   └── paths.js                  #   Path constants (ROOT, DATA, MEMORY, LOGS)
    │
    ├── protocol/                     # API Contract — dùng chung giữa các module
    │   ├── types.js                  #   createRequest / createSuccessResponse / createErrorResponse
    │   └── errors.js                 #   ErrorCodes (9 mã lỗi chuẩn)
    │
    ├── core/                         # Lõi AI
    │   ├── agent.js                  #   Class Agent — ReAct loop, OpenAI function calling
    │   ├── prompts.js                #   buildSystemPrompt() — inject long-term memory
    │   └── memory/
    │       ├── index.js              #   Export { ShortTermMemory, longTerm }
    │       ├── short_term.js         #   Sliding window (mặc định 10 tin nhắn)
    │       └── long_term.js          #   readMemory() / appendMemory() → MEMORY.md
    │
    ├── api/                          # API Server (Express)
    │   ├── index.js                  #   Re-export { startServer }
    │   ├── server.js                 #   Express app + startServer()
    │   ├── middleware/
    │   │   └── auth.js               #   Bearer token authentication
    │   └── routes/
    │       └── chat.js               #   POST /api/chat handler
    │
    ├── bot_gateway/                  # Bot Gateway
    │   ├── index.js                  #   startBots() — boot tất cả bot
    │   └── telegram.js               #   Telegraf bot — nhận tin → gọi Agent
    │
    └── tools/                        # Hệ thống công cụ (plugin)
        ├── index.js                  #   Re-export registry
        ├── registry.js               #   Tool map + getToolDefinitions() + executeTool()
        ├── calculator.js             #   mathjs evaluate — tính toán an toàn
        ├── get_current_time.js       #   Thời gian VN (Asia/Ho_Chi_Minh)
        └── save_memory.js            #   Ghi thông tin vào long-term memory
```

---

## Kiến trúc

### ReAct Loop

Agent sử dụng vòng lặp ReAct (Reasoning + Acting) với OpenAI function calling:

```
User Message
    ↓
┌─────────────────────────────────┐
│  LLM nhận: system prompt       │
│           + conversation history│
│           + tool definitions    │
│                                 │
│  LLM quyết định:               │
│    → Gọi tool?  ──► executeTool() ──► kết quả ──► quay lại LLM
│    → Trả lời?   ──► Final Answer ──► trả về user
│                                 │
│  (Tối đa 10 vòng)              │
└─────────────────────────────────┘
```

### Bộ nhớ

| Loại | Cơ chế | Lưu trữ |
|------|--------|---------|
| **Short-term** | Sliding window, giữ N tin nhắn gần nhất | RAM (mất khi restart) |
| **Long-term** | Đọc/ghi file Markdown | `data/memory/MEMORY.md` (persistent) |

Agent tự động inject nội dung long-term memory vào system prompt mỗi lượt hội thoại.

### API Contract

Tất cả module giao tiếp qua format chuẩn định nghĩa trong `src/protocol/`:

```
Gateway (API/Bot) ──request──► Core Agent ──response──► Gateway
                                  ↕
                              Tool Registry
```

**Mã lỗi chuẩn** (`src/protocol/errors.js`):

| Code | Ý nghĩa |
|------|---------|
| `INVALID_REQUEST` | Request sai format |
| `UNAUTHORIZED` | Thiếu/sai token |
| `MISSING_MESSAGE` | Không có message |
| `AGENT_ERROR` | Lỗi Agent |
| `TOOL_ERROR` | Lỗi tool |
| `LLM_ERROR` | Lỗi API LLM |
| `MAX_ROUNDS_EXCEEDED` | Vượt 10 vòng ReAct |
| `CONFIG_ERROR` | Lỗi cấu hình |
| `INTERNAL_ERROR` | Lỗi hệ thống |

---

## Thêm Tool mới

Mỗi tool là một file trong `src/tools/`, export `{ definition, execute }`:

**1. Tạo file** `src/tools/my_tool.js`:

```js
const definition = {
  type: 'function',
  function: {
    name: 'my_tool',
    description: 'Mô tả tool làm gì',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'Mô tả param' }
      },
      required: ['param1']
    }
  }
};

async function execute({ param1 }) {
  // Logic xử lý
  return 'Kết quả trả về cho Agent';
}

module.exports = { definition, execute };
```

**2. Đăng ký** trong `src/tools/registry.js`:

```js
const myTool = require('./my_tool');
const tools = {
  // ... tools hiện có
  my_tool: myTool,
};
```

**3. Xong.** Agent tự động nhận tool mới qua `getToolDefinitions()`.

---

## File quản lý dự án

Dự án sử dụng 3 file Markdown để theo dõi trạng thái và phối hợp nhóm:

### `PROJECT_STATUS.md` — Trạng thái dự án

File trung tâm ghi lại toàn bộ trạng thái hiện tại:
- Tiến độ roadmap (Phase 1/2/3 và checklist chi tiết)
- Cấu trúc thư mục cập nhật
- Phân vùng làm việc của từng dev
- API Contract (format request/response, mã lỗi)
- Dependencies và NPM scripts
- Vấn đề đã biết (known issues)

> Cập nhật file này mỗi khi hoàn thành task hoặc thay đổi kiến trúc.

### `TEAM_PLAN.md` — Kế hoạch nhóm

File phân công và phối hợp giữa 3 thành viên:
- Phân tích khối lượng công việc và lý do phân chia
- Bảng phân công chi tiết: ai làm gì, file nào, độ phức tạp
- Quy tắc Git (branch naming, merge, xử lý conflict)
- API Contract giữa các module
- Lộ trình Phase 1 → 2 → 3 với status từng task
- Quick Start riêng cho từng thành viên
- Milestone kiểm tra

> Dùng file này để onboard thành viên mới và theo dõi tiến độ nhóm.

### `OpenClawClone.md` — Tài liệu tham chiếu

Spec đầy đủ của kiến trúc OpenClaw (1219 dòng), dùng làm blueprint cho DaisyClaw. Tham khảo khi cần hiểu thiết kế gốc hoặc mở rộng tính năng.

---

## Phân công nhóm

```
Long  (Core AI)           → src/core/  + src/config/  + src/protocol/  + src/index.js
Khoẻ  (API + Bot Gateway) → src/api/   + src/bot_gateway/  + src/server.js
Huy   (Tools)             → src/tools/
```

Mỗi dev chỉ sửa trong domain của mình. Giao tiếp giữa module qua `src/protocol/`. Chi tiết xem [TEAM_PLAN.md](TEAM_PLAN.md).

---

## Dependencies

| Package | Mô tả |
|---------|-------|
| `openai` | Gọi LLM API (function calling) |
| `dotenv` | Load biến môi trường từ `.env` |
| `mathjs` | Calculator tool — evaluate an toàn |
| `express` | API Server |
| `cors` | CORS middleware |
| `telegraf` | Telegram bot |

---

## License

ISC
