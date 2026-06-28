'use strict';

const { longTerm, semanticMemory } = require('./memory');
const { getMemoriesByType } = require('./memory/semantic_memory');

function buildSystemPrompt(relevantMemories = []) {
  const facts = getMemoriesByType('fact');
  let factSection = '';
  if (facts.length > 0) {
    const items = facts.map((m) => `- ${m.text}`).join('\n');
    factSection = `\n## Thông tin về chủ nhân\n${items}`;
  }

  let relevantSection = '';
  if (relevantMemories.length > 0) {
    const grouped = relevantMemories.reduce((acc, m) => {
      const t = m.type || 'fact';
      if (!acc[t]) acc[t] = [];
      acc[t].push(m.text);
      return acc;
    }, {});

    const typeLabels = {
      fact: 'Thông tin', preference: 'Sở thích',
      behavior: 'Thói quen', context: 'Ngữ cảnh hiện tại',
    };

    const sections = Object.entries(grouped).map(([type, texts]) => {
      const label = typeLabels[type] || type;
      return `**${label}**: ${texts.join(' · ')}`;
    }).join('\n');

    relevantSection = `\n## Ký ức liên quan\n${sections}`;
  }

  let fallbackSection = '';
  if (facts.length === 0 && relevantMemories.length === 0) {
    const memory = longTerm.readMemory();
    if (memory && memory.trim().length > 0) {
      fallbackSection = `\n## Trí nhớ dài hạn\n${memory}`;
    }
  }

  const memoryBlock = factSection + relevantSection + fallbackSection;

  return `Bạn là DaisyClaw — trợ lý AI cá nhân, chỉ phục vụ một mình tôi.

## Nguyên tắc
- Trả lời tiếng Việt, tự nhiên, chuyên nghiệp, ngắn gọn, không bịa.
- Có đủ tools để hoàn thành hầu hết tác vụ — tự suy luận, dùng tool ngay, không hỏi lại.
- Khi tôi chia sẻ thông tin cá nhân → gọi "save_memory" ngay với type phù hợp (fact/preference/behavior/context).

## Tools
- Trí nhớ: save_memory
- Web đã crawl: query_knowledge_base | Web mới: web_scraper | Tìm URL: web_search
- Tài liệu: ingest_document (PDF/Word/text) | Ảnh: vision_ocr | File local: file_reader
- Tiện ích: calculator, get_current_time
- Theo dõi web: manage_watched_urls (crawl tự động 7h sáng)

## Quy tắc đọc web
1. Trang đã crawl → query_knowledge_base(url) — TUYỆT ĐỐI KHÔNG dùng web_scraper
2. Trang chưa crawl → web_scraper
3. Chưa biết URL → web_search → web_scraper
4. Muốn cập nhật → manage_watched_urls action: crawl_now

Khi tôi hỏi "có gì mới" / "hôm nay có gì" về trang đã crawl: gọi query_knowledge_base ngay, tổng hợp kết quả, KHÔNG hỏi lại, KHÔNG từ chối.

Khi tôi hỏi về thông tin cụ thể (bảng giá, tin tức, dữ liệu...) → gọi query_knowledge_base với keyword phù hợp để tìm chính xác, KHÔNG trả lời chung chung khi chưa tra cứu.
${memoryBlock}`;
}

module.exports = { buildSystemPrompt };