# DAISYCLAW — KẾ HOẠCH NHÓM

> Cập nhật: 2026-04-17
> Thành viên: Long (Core & AI) · Khoẻ (API & Bot Gateway) · Huy (Tools)
> Tham chiếu: OpenClawClone.md

---

## 1. Phân công nhiệm vụ

Nhằm đảm bảo hiệu suất và tiến độ dự án, công việc được phân chia theo từng phạm vi (domain) cụ thể cho các thành viên.

### 1.1. Core & AI Logic (Long)
- **Phạm vi quản lý:** `src/core/`, `src/config/`, `src/protocol/`
- **Vai trò chính:** Xử lý luồng suy luận của AI, quản lý trí nhớ và cấu hình hệ thống.
- **Trách nhiệm chi tiết:**
  - Vòng lặp ReAct và xây dựng lớp `Agent`.
  - Hệ thống bộ nhớ ngắn hạn và dài hạn (`src/core/memory/`).
  - Xây dựng System Prompt.
  - Quản lý cấu hình tập trung (`src/config/`) và hệ thống Protocol/API Contract (`src/protocol/`).
  - Terminal Runner cho môi trường kiểm thử (`src/index.js`).

### 1.2. API & Bot Gateway (Khoẻ)
- **Phạm vi quản lý:** `src/api/`, `src/bot_gateway/`, `src/server.js`
- **Vai trò chính:** Quản lý giao tiếp API và tích hợp với các kênh ứng dụng (Bots).
- **Trách nhiệm chi tiết:**
  - Viết Express API Server (`src/api/server.js`).
  - Xử lý xác thực người dùng (Auth Middleware).
  - Phân luồng dữ liệu (Routing) và cơ chế xử lý lỗi (Error Handling).
  - Tích hợp Gateway cho bot Telegram và Discord (`bot_gateway/`).
  
  *(Lưu ý: Chỉ thực hiện việc import `Agent` và `Protocol`, không can thiệp vào logic của `core` hoặc `tools`)*

### 1.3. Tool Integration (Huy)
- **Phạm vi quản lý:** `src/tools/`
- **Vai trò chính:** Xây dựng và mở rộng hệ thống công cụ hỗ trợ cho chức năng của Agent.
- **Trách nhiệm chi tiết:**
  - Xây dựng Tool Registry (`src/tools/registry.js`).
  - Phát triển các nhóm công cụ từ cơ bản đến cấu trúc nâng cao (Web Scraper, File Reader, OCR, Calculator, get_current_time, save_memory).
  
  *(Lưu ý: Các module tool hoạt động độc lập và được hệ thống Agent gọi thông qua registry)*

---

## 2. Quy trình làm việc và Quản lý mã nguồn

### 2.1. Phân vùng chỉnh sửa
- `src/config/`, `src/protocol/`, `src/core/`: Do Long chịu trách nhiệm.
- `src/api/`, `src/bot_gateway/`: Do Khoẻ chịu trách nhiệm.
- `src/tools/`: Do Huy chịu trách nhiệm.

### 2.2. Quy tắc sử dụng Git
- **Cách đặt tên Branch:** Theo định dạng `<tên_thành_viên>/<tên_chức_năng>` (VD: `long/update-agent`, `khoe/api-auth`, `huy/pdf-reader`).
- **Merge Code:** Mọi thiết lập hoặc cập nhật đẩy vào nhánh chính (main) yêu cầu tạo Pull Request (PR) và cần có ít nhất một thành viên khác đánh giá (Review).
- **Xử lý xung đột:** Tránh chỉnh sửa các tệp không nằm trong phạm vi được giao. Người quản lý module có quyền quyết định khi xuất hiện xung đột đoạn mã tại khu vực đó.

---

## 3. Giao thức giao tiếp (API Contract)

### 3.1. Giao tiếp API ứng dụng (Gateway → Core)
- Bắt buộc đính kèm Header: `Authorization: Bearer <SECRET_TOKEN>`.
- Định dạng Response khi thành công: `{"status": "success", "data": {...}}`.
- Định dạng Response khi có lỗi: `{"status": "error", "error": {...}}`.
- Bảng mã lỗi chuẩn nội bộ bao gồm: `INVALID_REQUEST`, `UNAUTHORIZED`, `MISSING_MESSAGE`, `AGENT_ERROR`, `TOOL_ERROR`, `LLM_ERROR`, `MAX_ROUNDS_EXCEEDED`, `CONFIG_ERROR`, `INTERNAL_ERROR`. Gateway tiếp nhận việc rà soát xác thực; trong khi đó Core sẽ phản hồi các lỗi logic hoặc hạ tầng LLM.

### 3.2. Cấu trúc tích hợp Công cụ (Tool → Core)
Mỗi tệp tin công cụ (Tool) cần xuất (export) hai thành phần chính:
1. `definition`: Khai báo OpenAPI schema cho function.
2. `execute`: Hàm async để xử lý luồng logic công việc và trả về định dạng văn bản (String).

---

## 4. Lộ trình triển khai (Roadmap)

### Giai đoạn 1: Xây dựng khung hệ thống — [ĐÃ HOÀN THÀNH]
- Xây dựng Core backend (ReAct loop, Protocol, System Prompt).
- Hoàn thiện hệ thống ghi nhớ (Memory System).
- Tích hợp thành công các công cụ cơ bản (Calculator, Timestamp, Memory Saver).
- Thực thi CLI Terminal thử nghiệm luồng hỏi đáp chuẩn.

### Giai đoạn 2: Tích hợp Kết nối — [ĐANG TIẾN HÀNH]
- Thiết lập hoàn tất khung API Server (Phụ trách: Khoẻ - Đã chạy cấu trúc Skeleton).
- Tích hợp Auth Middleware và bảo mật cơ bản.
- Kết nối thành công bot Telegram nội bộ.
- Xây dựng khung cấu trúc cho các tool dạng Web/File Reader (Phụ trách: Huy).

### Giai đoạn 3: Tối ưu khả năng mở rộng — [KẾ HOẠCH TRONG TƯƠNG LAI]
- Bổ sung Vision OCR, xử lý phân tích tệp DOCX/PDF.
- Triển khai Discord Bot Gateway, hoàn thiện Rate Limiter API.
- Tinh chỉnh System Prompt, tối ưu để giảm triệt để tỷ lệ Hallucination của nội dung AI.
- Thực hiện kiểm thử toàn hệ thống và thiết lập hoàn thiện tài liệu dự án.

---

## 5. Hướng dẫn khởi động dự án dành cho thành viên

### 5.1. Dành cho người phát triển API & Bot (Khoẻ)
1. Cài đặt các gói phụ thuộc hệ thống qua lệnh `npm install`.
2. Tạo và cấu hình tệp `.env` (`OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SECRET_TOKEN`, v.v.).
3. Kiểm tra tính năng nội hạt bằng việc chạy server `npm run server`. Đánh giá phản hồi cơ sở qua lệnh CURL qua URL `/api/chat`.
4. Phát triển và hoàn thành phần Middleware Error Handling và xử lý Rate Limiting.

### 5.2. Dành cho người phát triển Tool (Huy)
1. Thao tác trên tệp chuẩn tại `src/tools/calculator.js` để hiểu hệ thống hiện hành.
2. Thiết kế tệp mới có cấu trúc Schema OpenAPI có chứa biến `definition` cùng phương thức `execute`.
3. Động bộ đăng ký tại `src/tools/registry.js`.
4. Kiểm thử tool thông qua chế độ dòng lệnh với lệnh `npm start`.

---

## 6. Tiêu chí nghiệm thu (Milestones)

- **M1 (Hoàn tất):** Trải nghiệm Terminal CLI trả về phản hồi suy luận và gọi thành công công cụ cơ bản.
- **M2 (Tiếp theo):** API Server trả lời đúng đinh dạng JSON Protocol (thực hiện qua CURL/Postman).
- **M3 (Tiếp theo):** API trả về cảnh báo `401 Unauthorized` đối với các luồng yêu cầu thiếu Token hợp lệ.
- **M4:** Nhắn tin thông qua ứng dụng Telegram sẽ hồi đáp chính xác logic từ khối Core AI.
- **M5:** Khởi chạy thành công chức năng Web Scraper để đưa nội dung trang về hệ thống.
- **M6:** Khởi chạy thành công chức năng kiểm chứng ảnh có chứa chữ của khối Tool (OCR).
- **M7:** Đánh giá chung quy trình vòng tròn từ khi người dùng Telegram đặt lệnh ➔ API Server ➔ Agent ➔ Tools ➔ Người dùng nhận kết quả.
