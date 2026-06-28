'use strict';

/**
 * src/tools/web_search.js
 *
 * Tool tìm kiếm web thật — dùng DuckDuckGo HTML endpoint (không cần API key).
 * Trả về danh sách { title, url, snippet } để SearchAgent tự chọn URL
 * rồi gọi tiếp web_scraper nếu cần đọc full content.
 */

const cheerio = require('cheerio');

const MAX_RESULTS = 8;

const definition = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Tìm kiếm thông tin trên internet theo từ khóa, trả về danh sách kết quả gồm tiêu đề, URL và đoạn trích ngắn. Dùng tool này TRƯỚC khi gọi web_scraper khi chưa biết URL cụ thể.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Từ khóa tìm kiếm. Ví dụ: "tin tức AI hôm nay", "so sánh React và Vue 2026"',
        },
      },
      required: ['query'],
    },
  },
};

async function execute({ query }) {
  console.log(`\n[DEBUG TOOL] 🔎 Đang tìm kiếm: "${query}"`);

  if (!query || query.trim() === '') {
    return 'Lỗi: Cần cung cấp từ khóa tìm kiếm.';
  }

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DaisyClawBot/1.0',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.log(`[DEBUG TOOL] ❌ Lỗi HTTP: ${response.status}`);
      return `Lỗi tìm kiếm: HTTP ${response.status}`;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const results = [];

    $('.result').each((i, el) => {
      if (results.length >= MAX_RESULTS) return;

      const titleEl = $(el).find('.result__title a');
      const title = titleEl.text().trim();
      // DuckDuckGo HTML wraps URL trong redirect param "uddg"
      let href = titleEl.attr('href') || '';
      const snippet = $(el).find('.result__snippet').text().trim();

      // Decode URL thật từ redirect link của DuckDuckGo
      let realUrl = href;
      try {
        if (href.includes('uddg=')) {
          const match = href.match(/uddg=([^&]+)/);
          if (match) realUrl = decodeURIComponent(match[1]);
        } else if (href.startsWith('//')) {
          realUrl = 'https:' + href;
        }
      } catch {
        realUrl = href;
      }

      if (title && realUrl && realUrl.startsWith('http')) {
        results.push({ title, url: realUrl, snippet });
      }
    });

    if (results.length === 0) {
      console.log(`[DEBUG TOOL] ⚠️ Không tìm thấy kết quả nào.`);
      return `Không tìm thấy kết quả nào cho từ khóa: "${query}". Hãy thử từ khóa khác.`;
    }

    console.log(`[DEBUG TOOL] ✅ Tìm thấy ${results.length} kết quả.`);

    const formatted = results
      .map((r, i) => `${i + 1}. **${r.title}**\n   URL: ${r.url}\n   ${r.snippet}`)
      .join('\n\n');

    return `Kết quả tìm kiếm cho "${query}":\n\n${formatted}\n\n(Dùng tool web_scraper với URL cụ thể ở trên để đọc nội dung đầy đủ.)`;

  } catch (err) {
    console.log(`[DEBUG TOOL] 💥 LỖI: ${err.message}`);
    if (err.name === 'TimeoutError') {
      return 'Lỗi: Thời gian tìm kiếm quá lâu (vượt quá 15 giây).';
    }
    return `Lỗi khi tìm kiếm: ${err.message}`;
  }
}

module.exports = { definition, execute };