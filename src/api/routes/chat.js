'use strict';

const { Router } = require('express');
const { createErrorResponse } = require('../../protocol/types');
const { ErrorCodes } = require('../../protocol/errors');
const { autoSaveConversation } = require('../../core/memory/conversation_summary');
const { getDb } = require('../../core/db');
const crypto = require('crypto');

function writeTokenLog(model, inputTokens, outputTokens) {
  if (!inputTokens && !outputTokens) return;
  try {
    const db = getDb();
    const costVnd = (inputTokens * 0.001875) + (outputTokens * 0.0075);
    db.prepare(`
      INSERT INTO token_logs (id, timestamp, model, input_tokens, output_tokens, cost_vnd)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      new Date().toISOString(),
      model || 'unknown',
      inputTokens || 0,
      outputTokens || 0,
      costVnd
    );
  } catch (err) {
    console.error('[TokenLog] Lỗi ghi log:', err.message);
  }
}

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

      if (response.status === 'success') {
        const model = agent.model || 'unknown';
        const u = response.usage || {};
        const inputTokens = u.input_tokens || Math.ceil(message.length / 2.3);
        const outputTokens = u.output_tokens || Math.ceil((response.data || '').length / 2.3);
        writeTokenLog(model, inputTokens, outputTokens);

        const messages = agent.memory.getMessages();
        const { client, model: resolvedModel } = agent._resolveProvider();
        setImmediate(() => {
          autoSaveConversation(
            messages, client, resolvedModel,
            agent.embeddingClient,
            agent.embeddingConfig.model || 'text-embedding-3-small'
          ).catch(err => console.error('[Chat] Auto-save lỗi:', err.message));
        });
      }
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