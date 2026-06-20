const express = require('express');
const router = express.Router();
// [FIX] ConvSummary tắt tạm — gây 429 trên Gemini free tier
// Bật lại khi có Gemini paid: uncomment 2 dòng dưới
// const { autoSaveConversation } = require('../../core/memory/conversation_summary');

/**
 * GET /api/chat/stream
 * Server-Sent Events endpoint cho streaming response.
 */
router.get('/chat/stream', async (req, res) => {
  const { message } = req.query;

  if (!message || message.trim() === '') {
    res.status(400).json({
      status: 'error',
      error: { code: 'MISSING_MESSAGE', message: 'Thiếu tham số message' },
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('retry', '86400000');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    const agent = req.agent;

    for await (const event of agent.chatStream(message.trim())) {
      if (closed) break;
      send(event);

      if (event.type === 'done' || event.type === 'error') {
        res.write('retry: 86400000\n\n');

        // [FIX] ConvSummary tắt tạm — uncomment khi có Gemini paid
        // if (event.type === 'done') {
        //   const messages = agent.memory.getMessages();
        //   const { client, model } = agent._resolveProvider();
        //   setImmediate(() => {
        //     autoSaveConversation(
        //       messages, client, model,
        //       agent.embeddingClient,
        //       agent.embeddingConfig.model || 'text-embedding-3-small'
        //     ).catch(err => console.error('[Stream] Auto-save lỗi:', err.message));
        //   });
        // }

        break;
      }
    }
  } catch (err) {
    console.error('[Stream] Lỗi không mong đợi:', err.message);
    if (!closed) {
      send({ type: 'error', error: { code: 'INTERNAL_ERROR', message: err.message } });
      res.write('retry: 86400000\n\n');
    }
  } finally {
    res.end();
  }
});

module.exports = router;