'use strict';

/**
 * SearchAgent — Sub-agent chuyên tìm kiếm thông tin từ web.
 *
 * Tools được phép:
 *   - web_scraper          — crawl nội dung từ URL cụ thể
 *   - manage_watched_urls  — crawl danh sách URL đang theo dõi
 *   - get_current_time     — biết ngày giờ hiện tại để filter thông tin cũ/mới
 *
 * Không có: calculator, vision_ocr, file_reader, ingest_document, save_memory
 */

const { BaseAgent } = require('./base_agent');

const SEARCH_TOOLS = ['web_scraper', 'manage_watched_urls', 'get_current_time'];

const SEARCH_SYSTEM_PROMPT = `Bạn là Search Agent — chuyên thu thập thông tin từ web một cách chính xác và hiệu quả.

Nhiệm vụ: Tìm kiếm và trích xuất thông tin theo yêu cầu.

Nguyên tắc:
- Ưu tiên crawl các nguồn uy tín, có nội dung cụ thể
- Nếu một URL không có thông tin hữu ích, thử URL khác
- Kiểm tra ngày giờ hiện tại trước khi đánh giá thông tin có "mới" hay không
- Trả về nội dung thô, trung thực — không tự suy luận hay thêm thông tin ngoài những gì tìm được
- Nếu không tìm được thông tin, báo rõ lý do thay vì đoán mò`;

class SearchAgent extends BaseAgent {
  /**
   * @param {object} client - OpenAI-compatible client
   * @param {string} model  - Tên model
   * @param {object} [opts] - Tuỳ chọn (agentName, maxRounds, _toolsModule)
   */
  constructor(client, model, opts = {}) {
    super(client, model, SEARCH_TOOLS, {
      agentName: opts.agentName || 'SearchAgent',
      maxRounds: opts.maxRounds || 6,
      _toolsModule: opts._toolsModule,
    });
  }

  /**
   * Override system prompt — inject search-specific instructions + context.
   */
  _buildSystemPrompt(context) {
    return context
      ? `${SEARCH_SYSTEM_PROMPT}\n\nNgữ cảnh:\n${context}`
      : SEARCH_SYSTEM_PROMPT;
  }
}

module.exports = { SearchAgent, SEARCH_TOOLS };