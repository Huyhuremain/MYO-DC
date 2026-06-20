/**
 * src/core/memory/conversation_summary.js
 *
 * Auto-save conversation summary sau khi session kết thúc.
 * Chạy ngầm sau khi reply đã gửi — không làm chậm chat.
 *
 * Logic:
 * 1. Chỉ chạy khi session có đủ MIN_MESSAGES tin nhắn
 * 2. Gọi LLM tóm tắt nội dung đã bàn + rút ra thông tin mới về user
 * 3. Lưu summary → memories (type: context)
 * 4. Lưu từng fact/preference/behavior mới → memories (type tương ứng)
 */

const { saveMemoryVector, embedText } = require('./semantic_memory');
const { longTerm } = require('./index');

// Chỉ auto-save khi có đủ tin nhắn — tránh lưu những session quá ngắn
const MIN_MESSAGES = 4;

const SUMMARY_PROMPT = `Phân tích cuộc hội thoại sau và trả về JSON với format:
{
  "summary": "tóm tắt ngắn 1-2 câu về chủ đề đã bàn",
  "new_facts": ["thông tin cố định mới về user: tên, nghề, nơi sống..."],
  "new_preferences": ["sở thích/không thích mới phát hiện"],
  "new_behaviors": ["thói quen/cách làm việc mới phát hiện"],
  "new_contexts": ["mục tiêu/dự án/ngữ cảnh hiện tại mới"]
}

Chỉ điền những mục thực sự có thông tin mới. Mảng rỗng nếu không có.
Chỉ trả về JSON, không có text khác.

Hội thoại:`;

/**
 * Tóm tắt session và lưu vào memory.
 * Chạy bất đồng bộ — không await ở caller.
 *
 * @param {Array<{role, content}>} messages - Lịch sử tin nhắn trong session
 * @param {object} llmClient - OpenAI client
 * @param {string} llmModel - Model LLM
 * @param {object} embedClient - Embedding client
 * @param {string} embedModel - Embedding model
 */
async function autoSaveConversation(messages, llmClient, llmModel, embedClient, embedModel) {
  // Lọc chỉ user + assistant messages, bỏ system
  const conversation = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );

  if (conversation.length < MIN_MESSAGES) {
    return; // Session quá ngắn — không đáng lưu
  }

  const conversationText = conversation
    .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content || ''}`)
    .filter((line) => line.length > 10) // bỏ dòng rỗng
    .join('\n');

  let parsed;
  try {
    const response = await llmClient.chat.completions.create({
      model: llmModel,
      messages: [
        {
          role: 'user',
          content: `${SUMMARY_PROMPT}\n\n${conversationText.slice(0, 4000)}`,
        },
      ],
      max_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content?.trim() || '{}';
    // Strip markdown code block nếu có
    const clean = raw.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(clean);
  } catch (err) {
    console.error('[ConvSummary] LLM/parse lỗi:', err.message);
    return;
  }

  const { summary, new_facts = [], new_preferences = [], new_behaviors = [], new_contexts = [] } = parsed;

  // Lưu summary chính (type: context)
  if (summary && summary.trim()) {
    try {
      const vector = await embedText(summary, embedClient, embedModel);
      saveMemoryVector(`[Session] ${summary}`, vector, 'context');
      // Cũng ghi vào MEMORY.md để có backup text
      longTerm.appendMemory(`[session-summary] ${summary}`);
      console.log('[ConvSummary] Đã lưu summary:', summary.slice(0, 60) + '...');
    } catch (err) {
      // Embed lỗi (ví dụ Gemini 404) — vẫn lưu text vào MEMORY.md
      longTerm.appendMemory(`[session-summary] ${summary}`);
      console.error('[ConvSummary] Embed lỗi, chỉ lưu text:', err.message);
    }
  }

  // Lưu từng thông tin mới theo type
  const toSave = [
    ...new_facts.map((t) => ({ text: t, type: 'fact' })),
    ...new_preferences.map((t) => ({ text: t, type: 'preference' })),
    ...new_behaviors.map((t) => ({ text: t, type: 'behavior' })),
    ...new_contexts.map((t) => ({ text: t, type: 'context' })),
  ];

  for (const { text, type } of toSave) {
    if (!text || !text.trim()) continue;
    try {
      const vector = await embedText(text, embedClient, embedModel);
      saveMemoryVector(text, vector, type);
      console.log(`[ConvSummary] Lưu ${type}: ${text.slice(0, 50)}`);
    } catch {
      // Embed lỗi — lưu text thôi
      longTerm.appendMemory(`[${type}] ${text}`);
    }
  }
}

module.exports = { autoSaveConversation };