/**
 * Context Compaction — Tóm tắt hội thoại tự động.
 *
 * Khi short-term memory gần đầy, thay vì bỏ messages cũ,
 * gọi LLM tạo summary → thay thế lịch sử cũ bằng 1 summary message.
 *
 * Inspired by OpenClaw: src/agents/pi-embedded-runner/compact.ts
 */

const COMPACTION_PROMPT = `Tóm tắt cuộc hội thoại sau thành 1 đoạn ngắn, giữ lại các thông tin quan trọng (quyết định, sở thích, tên, số liệu, ngữ cảnh). Viết bằng tiếng Việt, ngắn gọn, không mất thông tin chính.

Hội thoại:`;

/**
 * Tạo summary từ danh sách messages bằng cách gọi LLM.
 *
 * @param {Array} messages - Messages cần tóm tắt
 * @param {object} client - OpenAI client
 * @param {string} model - Model name
 * @returns {string} Summary text
 */
async function compactMessages(messages, client, model) {
  const conversationText = messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n');

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: COMPACTION_PROMPT },
      { role: 'user', content: conversationText },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || '';
}

/**
 * Chạy compaction trên short-term memory.
 * Giữ lại `keepRecent` messages gần nhất,
 * compact phần còn lại thành 1 summary message.
 *
 * @param {ShortTermMemory} memory - Short-term memory instance
 * @param {object} client - OpenAI client
 * @param {string} model - Model name
 * @param {number} threshold - Compact khi messages >= threshold
 * @param {number} keepRecent - Số messages gần nhất giữ lại
 * @returns {boolean} true nếu compaction chạy
 */
async function runCompaction(memory, client, model, threshold = 8, keepRecent = 2) {
  const messages = memory.getMessages();

  if (messages.length < threshold) {
    return false;
  }

  // Tách: messages cũ cần compact + messages gần nhất giữ lại
  const splitIndex = messages.length - keepRecent;
  const oldMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  console.log(`[Compaction] Compacting ${oldMessages.length} old messages...`);

  try {
    const summary = await compactMessages(oldMessages, client, model);

    if (!summary || summary.trim() === '') {
      console.error('[Compaction] Summary rỗng, bỏ qua');
      return false;
    }

    // Thay thế memory: [summary] + recent messages
    memory.clear();
    memory.add({
      role: 'system',
      content: `[Tóm tắt hội thoại trước]: ${summary}`,
    });
    for (const msg of recentMessages) {
      memory.add(msg);
    }

    console.log('[Compaction] Done. Memory compacted.');
    return true;
  } catch (err) {
    console.error('[Compaction] Lỗi:', err.message);
    return false;
  }
}

module.exports = { compactMessages, runCompaction };
