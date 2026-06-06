/**
 * ===================================================
 * DAISYCLAW — API CONTRACT (Hợp đồng giao tiếp)
 * ===================================================
 *
 * File này định nghĩa format chuẩn để 3 module giao tiếp:
 *   Gateway → Core (Input)
 *   Core → Gateway (Output)
 *
 * Mọi thành viên trong nhóm PHẢI tuân thủ contract này.
 * Không ai được tự ý thay đổi format mà không thông báo.
 */

/**
 * Tạo request từ Gateway/Terminal gửi vào Core Agent.
 *
 * @param {string} message - Tin nhắn của người dùng
 * @param {string} source  - Nguồn gửi: "terminal" | "telegram" | "discord"
 * @returns {AgentRequest}
 */
function createRequest(message, source = 'terminal') {
  return {
    message,
    source,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Tạo response thành công từ Core Agent.
 *
 * @param {string} replyText  - Câu trả lời của Agent
 * @param {string[]} toolsUsed - Danh sách tools đã dùng
 * @returns {AgentResponse}
 */
function createSuccessResponse(replyText, toolsUsed = []) {
  return {
    status: 'success',
    data: {
      reply_text: replyText,
      tools_used: toolsUsed,
    },
  };
}

/**
 * Tạo response lỗi từ Core Agent.
 *
 * @param {string} code    - Mã lỗi (từ errors.js)
 * @param {string} message - Mô tả lỗi
 * @returns {AgentResponse}
 */
function createErrorResponse(code, message) {
  return {
    status: 'error',
    error: {
      code,
      message,
    },
  };
}

module.exports = { createRequest, createSuccessResponse, createErrorResponse };
