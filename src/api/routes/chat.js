const { Router } = require('express');
const { createErrorResponse } = require('../../protocol/types');
const { ErrorCodes } = require('../../protocol/errors');

/**
 * Tạo router xử lý POST /chat
 *
 * Request body:  { "message": "...", "source": "telegram" }
 * Response:      { "status": "success", "data": { "reply_text": "...", "tools_used": [] } }
 *             or { "status": "error", "error": { "code": "...", "message": "..." } }
 *
 * @param {import('../../core/agent')} agent - Agent instance
 * @returns {Router} Express router
 */
function chatRoute(agent) {
  const router = Router();

  router.post('/chat', async (req, res) => {
    try {
      const { message, source } = req.body;

      // Validate
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json(
          createErrorResponse(ErrorCodes.MISSING_MESSAGE, 'Thiếu trường "message" trong body')
        );
      }

      // Gọi Agent
      const response = await agent.chat(message.trim());

      // Trả kết quả theo protocol
      const statusCode = response.status === 'success' ? 200 : 500;
      return res.status(statusCode).json(response);

    } catch (err) {
      console.error('[API] Lỗi xử lý /chat:', err.message);
      return res.status(500).json(
        createErrorResponse(ErrorCodes.INTERNAL_ERROR, err.message)
      );
    }
  });

  return router;
}

module.exports = chatRoute;
