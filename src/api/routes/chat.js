const { Router } = require('express');
const { createErrorResponse } = require('../../protocol/types');
const { ErrorCodes } = require('../../protocol/errors');
// [FIX] ConvSummary tắt tạm — gây 429 trên Gemini free tier
// Bật lại khi có Gemini paid: uncomment 2 dòng dưới
// const { autoSaveConversation } = require('../../core/memory/conversation_summary');

/**
 * POST /api/chat
 */
function chatRoute(agent) {
  const router = Router();

  router.post('/chat', async (req, res) => {
    try {
      const { message } = req.body;

      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json(
          createErrorResponse(ErrorCodes.MISSING_MESSAGE, 'Thiếu trường "message" trong body')
        );
      }

      const response = await agent.chat(message.trim());

      const statusCode = response.status === 'success' ? 200 : 500;
      res.status(statusCode).json(response);

      // [FIX] ConvSummary tắt tạm — uncomment khi có Gemini paid
      // if (response.status === 'success') {
      //   const messages = agent.memory.getMessages();
      //   const { client, model } = agent._resolveProvider();
      //   setImmediate(() => {
      //     autoSaveConversation(
      //       messages, client, model,
      //       agent.embeddingClient,
      //       agent.embeddingConfig.model || 'text-embedding-3-small'
      //     ).catch(err => console.error('[Chat] Auto-save lỗi:', err.message));
      //   });
      // }

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