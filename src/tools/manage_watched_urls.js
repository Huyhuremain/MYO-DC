/**
 * src/tools/manage_watched_urls.js
 */

const { getDb } = require('../core/db');
const { crawlUrl, crawlAll } = require('../core/crawler/crawler');

const definition = {
  type: 'function',
  function: {
    name: 'manage_watched_urls',
    description: 'Quản lý danh sách trang web cần theo dõi tự động và trigger crawl thủ công. Dùng để thêm/xóa URL, xem danh sách, hoặc crawl ngay lập tức.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove', 'list', 'crawl_now', 'crawl_all', 'history'],
          description: [
            'Hành động cần thực hiện:',
            '- add: thêm URL mới vào danh sách theo dõi',
            '- remove: xóa URL khỏi danh sách',
            '- list: xem tất cả URL đang theo dõi',
            '- crawl_now: crawl một URL ngay lập tức',
            '- crawl_all: crawl tất cả URL trong danh sách ngay',
            '- history: xem lịch sử crawl của một URL',
          ].join('\n'),
        },
        url: {
          type: 'string',
          description: 'URL cần thao tác (bắt buộc với add, remove, crawl_now, history)',
        },
        label: {
          type: 'string',
          description: 'Tên gợi nhớ cho URL (dùng với action: add). Ví dụ: "VnExpress Công nghệ"',
        },
      },
      required: ['action'],
    },
  },
};

let _llmClient = null;
let _embedModel = 'text-embedding-3-small';
// [FIX] Bỏ _llmModel — crawler không cần LLM nữa

function initCrawler(llmClient, embedModel) {
  _llmClient = llmClient;
  _embedModel = embedModel;
}

async function execute({ action, url, label }) {
  const db = getDb();

  switch (action) {

    case 'add': {
      if (!url) return 'Lỗi: Cần cung cấp URL để thêm.';
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return 'Lỗi: URL phải bắt đầu bằng http:// hoặc https://';
      }

      const existing = db.prepare('SELECT url FROM watched_urls WHERE url = ?').get(url);
      if (existing) return `URL này đã có trong danh sách theo dõi rồi: ${url}`;

      db.prepare(`
        INSERT INTO watched_urls (url, label, schedule, active, added_at)
        VALUES (?, ?, 'daily', 1, ?)
      `).run(url, label || '', new Date().toISOString());

      return `Đã thêm vào danh sách theo dõi:\n- URL: ${url}\n- Nhãn: ${label || '(không có)'}\n- Lịch: mỗi ngày lúc 7:00 sáng`;
    }

    case 'remove': {
      if (!url) return 'Lỗi: Cần cung cấp URL để xóa.';

      const existing = db.prepare('SELECT url FROM watched_urls WHERE url = ?').get(url);
      if (!existing) return `Không tìm thấy URL này trong danh sách: ${url}`;

      db.prepare('DELETE FROM watched_urls WHERE url = ?').run(url);
      return `Đã xóa khỏi danh sách theo dõi: ${url}`;
    }

    case 'list': {
      const rows = db.prepare('SELECT url, label, active, added_at FROM watched_urls ORDER BY added_at DESC').all();

      if (rows.length === 0) return 'Danh sách theo dõi đang trống. Dùng action: add để thêm URL.';

      const lines = rows.map((r, i) => {
        const status = r.active ? '🟢' : '⏸️';
        const lbl = r.label ? ` (${r.label})` : '';
        return `${i + 1}. ${status} ${r.url}${lbl}`;
      });

      return `Danh sách URL đang theo dõi (${rows.length} URL):\n${lines.join('\n')}`;
    }

    case 'crawl_now': {
      if (!url) return 'Lỗi: Cần cung cấp URL để crawl.';
      if (!_llmClient) return 'Lỗi: Crawler chưa được khởi tạo.';

      const row = db.prepare('SELECT label FROM watched_urls WHERE url = ?').get(url);
      const urlLabel = label || row?.label || '';

      // [FIX] Bỏ _llmModel
      const result = await crawlUrl(url, urlLabel, _llmClient, _embedModel);

      if (result.status === 'error') return `Lỗi crawl ${url}: ${result.error}`;
      if (result.status === 'unchanged') return `Trang không có thay đổi so với lần trước: ${url}`;

      return `Đã crawl thành công: ${url}\n- Trạng thái: nội dung mới\n- Đã lưu vào RAG knowledge base`;
    }

    case 'crawl_all': {
      if (!_llmClient) return 'Lỗi: Crawler chưa được khởi tạo.';

      const activeCount = db.prepare('SELECT COUNT(*) as n FROM watched_urls WHERE active = 1').get().n;
      if (activeCount === 0) return 'Không có URL nào đang active để crawl.';

      // [FIX] Bỏ _llmModel
      const results = await crawlAll(_llmClient, _embedModel);
      if (!results) return 'Không có URL nào để crawl.';

      // [FIX] Trả về chi tiết các URL thay vì chỉ đếm số lượng
      const okUrls = results.filter(r => r.status === 'ok').map(r => r.url);
      const unchangedUrls = results.filter(r => r.status === 'unchanged').map(r => r.url);
      const errorUrls = results.filter(r => r.status === 'error').map(r => r.url);

      let report = `Hoàn tất crawl ${results.length} URL:\n`;
      report += `- ✅ Cập nhật mới (${okUrls.length}): ${okUrls.length > 0 ? okUrls.join(', ') : 'Không có'}\n`;
      report += `- ⏭️ Không thay đổi (${unchangedUrls.length}): ${unchangedUrls.length > 0 ? unchangedUrls.join(', ') : 'Không có'}\n`;
      report += `- ❌ Lỗi (${errorUrls.length}): ${errorUrls.length > 0 ? errorUrls.join(', ') : 'Không có'}`;

      return report;
    }

    case 'history': {
      if (!url) return 'Lỗi: Cần cung cấp URL để xem lịch sử.';

      const rows = db.prepare(`
        SELECT crawled_at, status, error_msg FROM crawl_logs
        WHERE url = ? ORDER BY crawled_at DESC LIMIT 10
      `).all(url);

      if (rows.length === 0) return `Chưa có lịch sử crawl cho: ${url}`;

      const lines = rows.map((r) => {
        const time = new Date(r.crawled_at).toLocaleString('vi-VN');
        const icon = r.status === 'ok' ? '✅' : r.status === 'unchanged' ? '⏭️' : '❌';
        const err = r.error_msg ? ` — ${r.error_msg}` : '';
        return `${icon} ${time}: ${r.status}${err}`;
      });

      return `Lịch sử crawl gần nhất cho ${url}:\n${lines.join('\n')}`;
    }

    default:
      return `Lỗi: action không hợp lệ: "${action}"`;
  }
}

module.exports = { definition, execute, initCrawler };