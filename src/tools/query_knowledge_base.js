'use strict';

const { getDb } = require('../core/db');

const MAX_CHUNKS = 12;
const MAX_CHUNK_LEN = 800;

const definition = {
  type: 'function',
  function: {
    name: 'query_knowledge_base',
    description: [
      'Đọc trực tiếp nội dung đã lưu trong knowledge base theo URL, keyword, hoặc khoảng thời gian.',
      'Dùng khi muốn đọc nội dung trang đã crawl, tìm kiếm theo từ khóa, hoặc xem dữ liệu theo ngày.',
      'KHÔNG dùng web_scraper nếu trang đã được crawl — dùng tool này thay thế.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL trang web muốn đọc.' },
        keyword: { type: 'string', description: 'Từ khóa tìm kiếm trong toàn bộ knowledge base.' },
        date_from: { type: 'string', description: 'Lọc từ ngày (YYYY-MM-DD). Ví dụ: "2026-06-01"' },
        date_to: { type: 'string', description: 'Lọc đến ngày (YYYY-MM-DD). Ví dụ: "2026-06-28"' },
        limit: { type: 'number', description: `Số đoạn tối đa (mặc định: ${MAX_CHUNKS}, tối đa: 20)` },
      },
      required: [],
    },
  },
};

async function execute({ url = '', keyword = '', date_from = '', date_to = '', limit = MAX_CHUNKS }) {
  const db = getDb();
  const maxLimit = Math.min(Number(limit) || MAX_CHUNKS, 20);

  // Không có filter → liệt kê documents
  if (!url && !keyword && !date_from && !date_to) {
    const docs = db.prepare(`
      SELECT url, label, crawl_date, chunk_count, ingested_at
      FROM documents
      ORDER BY ingested_at DESC
    `).all();

    if (docs.length === 0) return 'Knowledge base đang trống.';

    const list = docs.map(d =>
      `- [${d.crawl_date}] ${d.label || d.url} (${d.chunk_count} đoạn)`
    ).join('\n');
    return `Knowledge base có ${docs.length} bản ghi:\n${list}`;
  }

  // Build WHERE conditions
  const conditions = [];
  const params = [];

  if (url && url.trim()) {
    try {
      const hostname = new URL(url.trim()).hostname.replace(/^www\./, '').replace(/\./g, '_');
      conditions.push(`(c.url = ? OR c.filename LIKE ?)`);
      params.push(url.trim(), `%${hostname}%`);
    } catch {
      conditions.push(`c.url LIKE ?`);
      params.push(`%${url.trim()}%`);
    }
  }

  if (keyword && keyword.trim()) {
    conditions.push(`lower(c.text) LIKE lower(?)`);
    params.push(`%${keyword.trim()}%`);
  }

  if (date_from) {
    conditions.push(`c.crawl_date >= ?`);
    params.push(date_from);
  }

  if (date_to) {
    conditions.push(`c.crawl_date <= ?`);
    params.push(date_to);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT c.text, c.filename, c.url, c.label, c.crawl_date, c.chunk_index
    FROM chunks c
    ${where}
    ORDER BY c.crawl_date DESC, c.chunk_index
    LIMIT ?
  `).all(...params, maxLimit);

  if (!rows || rows.length === 0) {
    return `Không tìm thấy nội dung nào khớp với điều kiện tìm kiếm.`;
  }

  const chunks = rows.map((r, i) => {
    const text = r.text.length > MAX_CHUNK_LEN ? r.text.slice(0, MAX_CHUNK_LEN) + '…' : r.text;
    return `[${i + 1}] [${r.crawl_date}] ${r.label || r.url}\n${text}`;
  });

  return [
    `Tìm thấy ${rows.length} đoạn văn:`,
    '',
    chunks.join('\n\n'),
  ].join('\n');
}

module.exports = { definition, execute };