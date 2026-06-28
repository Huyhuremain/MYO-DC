'use strict';

const express = require('express');
const router = express.Router();
const { autoSaveConversation } = require('../../core/memory/conversation_summary');
const { getDb } = require('../../core/db');
const crypto = require('crypto');

// ── Helper ghi token log ──────────────────────────────────────────────────────

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

// ── Estimate tokens từ text (fallback khi API không trả về usage) ─────────────

function estimateTokens(text) {
  return Math.ceil((text || '').length / 2.3);
}

// ── GET /api/chat/stream ──────────────────────────────────────────────────────

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

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let closed = false;
  req.on('close', () => { closed = true; });

  try {
    const agent = req.agent;
    const model = agent.model || 'unknown';

    for await (const event of agent.chatStream(message.trim())) {
      if (closed) break;
      send(event);

      if (event.type === 'done') {
        res.write('retry: 86400000\n\n');

        // Ghi token log
        const u = event.usage || {};
        const inputTokens = u.input_tokens || u.prompt_tokens || estimateTokens(message);
        const outputTokens = u.output_tokens || u.completion_tokens || estimateTokens(event.reply);
        writeTokenLog(model, inputTokens, outputTokens);

        // Auto-save conversation
        const messages = agent.memory.getMessages();
        const { client, model: resolvedModel } = agent._resolveProvider();
        setImmediate(() => {
          autoSaveConversation(
            messages, client, resolvedModel,
            agent.embeddingClient,
            agent.embeddingConfig.model || 'text-embedding-3-small'
          ).catch(err => console.error('[Stream] Auto-save lỗi:', err.message));
        });

        break;
      }

      if (event.type === 'error') {
        res.write('retry: 86400000\n\n');
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

// ── GET /api/kb ───────────────────────────────────────────────────────────────

router.get('/kb', (req, res) => {
  try {
    const db = getDb();
    const { doc_id, date } = req.query;

    if (doc_id) {
      const doc = db.prepare(
        'SELECT id, filename, url, label, crawl_date, ingested_at, chunk_count FROM documents WHERE id = ?'
      ).get(doc_id);
      if (!doc) return res.status(404).json({ status: 'error', message: 'Document không tồn tại' });

      const chunks = db.prepare(
        'SELECT chunk_index, text FROM chunks WHERE doc_id = ? ORDER BY chunk_index'
      ).all(doc_id);
      return res.json({ status: 'ok', doc, chunks });
    }

    let query = `
      SELECT id, filename, url, label, crawl_date, ingested_at, chunk_count
      FROM documents
    `;
    const params = [];
    if (date) { query += ` WHERE crawl_date = ?`; params.push(date); }
    query += ` ORDER BY ingested_at DESC`;

    const docs = db.prepare(query).all(...params);
    const dates = db.prepare(
      `SELECT DISTINCT crawl_date FROM documents ORDER BY crawl_date DESC`
    ).all().map(r => r.crawl_date);

    return res.json({ status: 'ok', docs, dates });
  } catch (err) {
    console.error('[API/kb] Lỗi:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── GET /api/stats ────────────────────────────────────────────────────────────

router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const { period = 'month' } = req.query;

    // Xác định khoảng thời gian
    const now = new Date();
    let dateFrom;
    if (period === 'today') {
      dateFrom = now.toISOString().slice(0, 10); // YYYY-MM-DD
    } else if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      dateFrom = d.toISOString().slice(0, 10);
    } else if (period === 'month') {
      dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else if (period === 'year') {
      dateFrom = `${now.getFullYear()}-01-01`;
    } else {
      dateFrom = '2000-01-01'; // all time
    }

    // Tổng theo period
    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(input_tokens)  as total_input,
        SUM(output_tokens) as total_output,
        SUM(cost_vnd)      as total_cost
      FROM token_logs
      WHERE timestamp >= ?
    `).get(`${dateFrom}T00:00:00.000Z`);

    // Theo ngày (30 ngày gần nhất)
    const daily = db.prepare(`
      SELECT
        substr(timestamp, 1, 10) as date,
        SUM(input_tokens)        as input_tokens,
        SUM(output_tokens)       as output_tokens,
        SUM(cost_vnd)            as cost_vnd,
        COUNT(*)                 as calls
      FROM token_logs
      WHERE timestamp >= ?
      GROUP BY substr(timestamp, 1, 10)
      ORDER BY date DESC
      LIMIT 30
    `).all(`${dateFrom}T00:00:00.000Z`);

    // Theo tháng (12 tháng gần nhất)
    const monthly = db.prepare(`
      SELECT
        substr(timestamp, 1, 7) as month,
        SUM(input_tokens)       as input_tokens,
        SUM(output_tokens)      as output_tokens,
        SUM(cost_vnd)           as cost_vnd,
        COUNT(*)                as calls
      FROM token_logs
      GROUP BY substr(timestamp, 1, 7)
      ORDER BY month DESC
      LIMIT 12
    `).all();

    return res.json({
      status: 'ok',
      period,
      date_from: dateFrom,
      summary: {
        total_calls: summary?.total_calls || 0,
        total_input: summary?.total_input || 0,
        total_output: summary?.total_output || 0,
        total_cost: summary?.total_cost || 0,
      },
      daily,
      monthly,
    });
  } catch (err) {
    console.error('[API/stats] Lỗi:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;