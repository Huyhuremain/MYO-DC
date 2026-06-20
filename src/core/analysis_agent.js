'use strict';

/**
 * AnalysisAgent — Sub-agent chuyên phân tích, tổng hợp, đánh giá.
 *
 * Không có tools — chỉ dùng LLM thuần.
 * Nhận data đã có (từ context hoặc task) và trả ra phân tích.
 *
 * Dùng khi:
 *   - Phân tích nội dung user cung cấp
 *   - Tổng hợp kết quả từ SearchAgent
 *   - So sánh, đánh giá các phương án dựa trên kiến thức tổng quát
 */

const { BaseAgent } = require('./base_agent');

const ANALYSIS_SYSTEM_PROMPT = `Bạn là Analysis Agent — chuyên phân tích, tổng hợp và đánh giá thông tin.

Nhiệm vụ: Phân tích câu hỏi/yêu cầu của người dùng và đưa ra nhận xét có chiều sâu.

Nguyên tắc:
- Nếu có "Dữ liệu tham khảo" được cung cấp bên dưới, ưu tiên dùng nó làm nguồn chính,
  kết hợp với kiến thức tổng quát của bạn để phân tích đầy đủ hơn.
- Nếu KHÔNG có dữ liệu tham khảo, hoặc dữ liệu đó không liên quan đến câu hỏi,
  hãy dùng kiến thức nền sẵn có của bạn để trả lời — đây là hành vi bình thường,
  không phải "bịa thêm". Chỉ nêu rõ giới hạn khi câu hỏi đòi hỏi dữ liệu
  thời gian thực/cụ thể (giá cổ phiếu hôm nay, tin tức mới nhất...) mà bạn không có.
- "Lịch sử hội thoại trước" (nếu có) chỉ để hiểu ngữ cảnh giao tiếp,
  KHÔNG phải là dữ liệu bắt buộc phải phân tích — bỏ qua nếu không liên quan
  đến câu hỏi hiện tại.
- Trình bày rõ ràng: điểm chính, ưu/nhược, kết luận
- Ngắn gọn và có cấu trúc — ưu tiên chất lượng hơn số lượng`;

class AnalysisAgent extends BaseAgent {
  /**
   * @param {object} client - OpenAI-compatible client
   * @param {string} model  - Tên model
   * @param {object} [opts] - Tuỳ chọn (agentName, maxRounds)
   */
  constructor(client, model, opts = {}) {
    // toolNames = [] — không có tools
    super(client, model, [], {
      agentName: opts.agentName || 'AnalysisAgent',
      maxRounds: opts.maxRounds || 3, // Không cần nhiều rounds vì không có tools
    });
  }

  /**
   * Override system prompt.
   *
   * [FIX] Phân biệt rõ 2 loại context:
   *   - referenceData: dữ liệu thực sự cần phân tích (kết quả SearchAgent, tài liệu...)
   *   - conversationHistory: lịch sử chat cũ, chỉ để hiểu ngữ cảnh, KHÔNG bắt buộc dùng
   *
   * @param {string|object} context - String (conversation history, behavior cũ)
   *                                  hoặc { referenceData, conversationHistory }
   */
  _buildSystemPrompt(context) {
    // Backward compat: nếu context là string thuần (cách gọi cũ),
    // coi nó là conversation history — KHÔNG ép buộc làm data phân tích.
    if (typeof context === 'string') {
      return context
        ? `${ANALYSIS_SYSTEM_PROMPT}\n\nLịch sử hội thoại trước (chỉ để hiểu ngữ cảnh, không bắt buộc phân tích):\n${context}`
        : ANALYSIS_SYSTEM_PROMPT;
    }

    // Cách gọi mới: context = { referenceData, conversationHistory }
    let prompt = ANALYSIS_SYSTEM_PROMPT;

    if (context?.referenceData) {
      prompt += `\n\nDữ liệu tham khảo (nguồn chính để phân tích):\n${context.referenceData}`;
    }

    if (context?.conversationHistory) {
      prompt += `\n\nLịch sử hội thoại trước (chỉ để hiểu ngữ cảnh, không bắt buộc phân tích):\n${context.conversationHistory}`;
    }

    return prompt;
  }
}

module.exports = { AnalysisAgent };