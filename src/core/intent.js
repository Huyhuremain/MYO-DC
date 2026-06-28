'use strict';

const { callLLMWithRetry429 } = require('./retry429');

const INTENT_SYSTEM_PROMPT = `Bạn là intent classifier cho một AI agent. Phân loại tin nhắn của user vào đúng 1 trong 4 intent sau:

- chat: Hỏi đáp thông thường, chào hỏi, câu hỏi kiến thức tổng quát. Ví dụ: "xin chào", "giải thích REST API là gì", "viết email cho tôi".
  QUAN TRỌNG: Nếu câu hỏi liên quan đến nội dung các trang web đang theo dõi (TechMeme, TechCrunch, The Verge, Hacker News...) → dùng "chat" vì thông tin đã được lưu vào knowledge base rồi, KHÔNG cần search thêm.
  Ví dụ "chat": "tin tức TechCrunch hôm nay", "Hacker News có gì mới", "nội dung The Verge tuần này".

- search: Cần tìm kiếm thông tin từ URL cụ thể chưa có trong danh sách theo dõi, hoặc thông tin rất mới chưa được crawl. Từ khóa: "tìm trên web", "tra cứu URL này", "crawl trang này", "giá Bitcoin hôm nay", "thời tiết".
  KHÔNG dùng "search" cho các trang đã theo dõi (TechMeme, TechCrunch, The Verge, Hacker News).

- analysis: Cần phân tích, so sánh, tổng hợp dữ liệu đã có. Ví dụ: "phân tích đoạn code này", "so sánh 2 phương án", "tóm tắt nội dung sau".

- multi: Cần cả search lẫn analysis — vừa tìm thông tin mới từ URL chưa biết vừa phân tích tổng hợp. Ví dụ: "tìm và so sánh các framework JS phổ biến nhất hiện nay".

Trả về JSON hợp lệ, không có markdown, không có giải thích bên ngoài JSON:
{"intent": "chat" | "search" | "analysis" | "multi", "reason": "lý do ngắn gọn", "agents": []}`;

async function classifyIntent(message, context, client, model) {
  const wordCount = message.trim().split(/\s+/).length;
  if (wordCount < 3) {
    console.log('[Intent] Short message — skip classify, fallback chat');
    return _fallback('chat', 'short message');
  }

  const userContent = context
    ? `Ngữ cảnh hội thoại gần đây: ${context}\n\nTin nhắn mới: ${message}`
    : message;

  let raw;
  try {
    const response = await callLLMWithRetry429(client, {
      model,
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0,
      max_tokens: 1024,
      stream: false,
    });

    raw = response.choices?.[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('[Intent] LLM call failed:', err.message);
    return _fallback('chat', `LLM error: ${err.message}`);
  }

  return _parseResponse(raw);
}

function _parseResponse(raw) {
  const VALID_INTENTS = new Set(['chat', 'search', 'analysis', 'multi']);
  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: extract intent trực tiếp nếu JSON bị truncate
    const intentMatch = raw.match(/"intent"\s*:\s*"(chat|search|analysis|multi)"/);
    if (intentMatch) {
      console.warn('[Intent] JSON truncated — extracted intent:', intentMatch[1]);
      return { intent: intentMatch[1], reason: 'extracted', agents: [] };
    }
    console.error('[Intent] JSON parse failed. Raw:', raw);
    return _fallback('chat', 'parse error');
  }

  const intent = parsed.intent;
  if (!VALID_INTENTS.has(intent)) {
    console.error('[Intent] Invalid intent value:', intent);
    return _fallback('chat', 'invalid intent');
  }

  const agents = intent === 'multi'
    ? ['search', 'analysis']
    : (Array.isArray(parsed.agents) ? parsed.agents : []);

  return {
    intent,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    agents,
  };
}

function _fallback(intent, reason) {
  return { intent, reason, agents: [] };
}

module.exports = { classifyIntent, _parseResponse };