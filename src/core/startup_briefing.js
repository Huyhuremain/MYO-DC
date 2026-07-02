'use strict';

const crypto = require('crypto');
const { getDb } = require('./db');

function getLastStartTime() {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM app_state WHERE key = 'last_start_time'`).get();
  return row?.value || null;
}

function setLastStartTime(isoString) {
  const db = getDb();
  db.prepare(`
    INSERT INTO app_state (key, value) VALUES ('last_start_time', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(isoString);
}

function getNewDocumentsSince(sinceIso) {
  const db = getDb();
  return db.prepare(`
    SELECT filename, url, label, crawl_date, ingested_at, chunk_count
    FROM documents
    WHERE ingested_at > ?
    ORDER BY ingested_at ASC
  `).all(sinceIso);
}

/**
 * Tạo briefing tóm tắt tin tức mới — gọi agent.chat() nội bộ.
 * @param {import('./agent')} agent
 */
async function generateStartupBriefing(agent) {
  const now = new Date().toISOString();
  const lastStart = getLastStartTime();

  setLastStartTime(now);

  if (!lastStart) {
    console.log('[Briefing] Lần đầu khởi động — bỏ qua briefing.');
    return null;
  }

  const newDocs = getNewDocumentsSince(lastStart);

  if (newDocs.length === 0) {
    console.log('[Briefing] Không có tài liệu mới kể từ lần khởi động trước.');
    return null;
  }

  console.log(`[Briefing] Tìm thấy ${newDocs.length} tài liệu mới — đang tóm tắt...`);

  const sourceList = newDocs
    .map(d => `- [${d.crawl_date}] ${d.label || d.url} (${d.chunk_count} đoạn)`)
    .join('\n');

  const internalPrompt = [
    `Đây là yêu cầu hệ thống (không phải từ user trực tiếp).`,
    `Trong lúc server tắt, đã crawl được ${newDocs.length} tài liệu mới sau:`,
    sourceList,
    ``,
    `Hãy dùng query_knowledge_base để đọc nội dung các nguồn trên (lọc theo date_from="${lastStart.slice(0, 10)}"),`,
    `sau đó viết một bản tóm tắt ngắn gọn (5-8 dòng) những tin tức/thông tin đáng chú ý nhất.`,
    `Trình bày súc tích, không lặp lại danh sách nguồn, tập trung vào nội dung.`,
  ].join('\n');

  try {
    const response = await agent.chat(internalPrompt);

    if (response.status !== 'success') {
      console.error('[Briefing] Agent trả lỗi khi tóm tắt:', response.error?.message);
      return null;
    }

    const summary = response.data;
    const db = getDb();
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO startup_briefings (id, created_at, summary, doc_count, seen)
      VALUES (?, ?, ?, ?, 0)
    `).run(id, now, summary, newDocs.length);

    console.log('[Briefing] Đã tạo briefing mới.');
    return { id, summary, doc_count: newDocs.length };
  } catch (err) {
    console.error('[Briefing] Lỗi tạo briefing:', err.message);
    return null;
  }
}

module.exports = { generateStartupBriefing, getLastStartTime, setLastStartTime };