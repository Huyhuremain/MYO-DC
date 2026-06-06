/**
 * Mã lỗi chuẩn cho DaisyClaw.
 * Tất cả module phải dùng các mã này khi tạo error response.
 */
const ErrorCodes = {
  // Client errors
  INVALID_REQUEST: 'INVALID_REQUEST',       // Request sai format
  UNAUTHORIZED: 'UNAUTHORIZED',             // Thiếu hoặc sai SECRET_TOKEN
  MISSING_MESSAGE: 'MISSING_MESSAGE',       // Không có message trong request

  // Agent errors
  AGENT_ERROR: 'AGENT_ERROR',              // Lỗi xử lý trong Agent
  TOOL_ERROR: 'TOOL_ERROR',                // Lỗi khi chạy tool
  LLM_ERROR: 'LLM_ERROR',                  // Lỗi gọi API LLM (timeout, 402, v.v.)
  MAX_ROUNDS_EXCEEDED: 'MAX_ROUNDS_EXCEEDED', // Vượt quá số vòng lặp ReAct

  // System errors
  CONFIG_ERROR: 'CONFIG_ERROR',             // Lỗi cấu hình
  INTERNAL_ERROR: 'INTERNAL_ERROR',         // Lỗi hệ thống không xác định
};

module.exports = { ErrorCodes };
