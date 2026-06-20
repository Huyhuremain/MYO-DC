/**
 * src/core/crawler/crawler.js
 *
 * Logic crawl một URL:
 * 1. Fetch HTML → extract text (dùng cheerio)
 * 2. Hash content → so sánh với lần crawl trước
 * 3. Nếu thay đổi:
 * a. Chunk + embed → lưu vào chunks table (RAG)
 * b. Ghi crawl_log status: ok
 * [FIX] Bỏ LLM summarize — tránh tốn token + 429
 * 4. Nếu không đổi → ghi status: unchanged
 */

const crypto = require('crypto');
const cheerio = require('cheerio');
const { getDb } = require('../db');
const { chunkText } = require('../rag/chunker');
const { saveDocument } = require('../rag/document_store');
const { embedText } = require('../memory/semantic_memory');

const MAX_CONTENT_LENGTH = 20000;

function hashContent(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'DaisyClaw-Crawler/1.0' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  $('script, style, noscript, nav, footer, header, aside, iframe, svg, canvas, .ad, .ads, .advertisement').remove();

  // Ưu tiên lấy content chính
  let text = '';
  const contentSelectors = ['article', 'main', '.content', '#content', '.post', '.entry-content'];
  for (const sel of contentSelectors) {
    const el = $(sel);
    if (el.length > 0) {
      text = el.text();
      break;
    }
  }

  // Fallback: lấy body
  if (!text || text.trim().length < 100) {
    text = $('body').text();
  }

  text = text.replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Không tìm thấy nội dung văn bản');
  if (text.length > MAX_CONTENT_LENGTH) text = text.substring(0, MAX_CONTENT_LENGTH);

  return text;
}

function getLastHash(url) {
  const db = getDb();
  const row = db.prepare(`
    SELECT content_hash FROM crawl_logs
    WHERE url = ? AND status = 'ok'
    ORDER BY crawled_at DESC LIMIT 1
  `).get(url);
  return row?.content_hash || null;
}

function writeCrawlLog(url, status, contentHash = null, errorMsg = null) {
  const db = getDb();
  const id = `crawl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO crawl_logs (id, url, crawled_at, content_hash, status, error_msg)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, url, new Date().toISOString(), contentHash, status, errorMsg);
}

// [ĐÃ SỬA]: Thêm Date vào key để giữ lịch sử các ngày khác nhau trong Document Store (RAG)
function makeDocName(url, label) {
  // Bỏ timestamp — saveDocument() tự DELETE + re-insert
  try {
    const hostname = new URL(url).hostname;
    const slug = (label || hostname).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    return `web_${slug}.txt`;
  } catch {
    return `web_${url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.txt`;
  }
}

/**
 * Crawl một URL và xử lý nội dung.
 * [FIX] Không dùng LLM để summarize — chỉ chunk + embed vào RAG.
 * Tiết kiệm 1-2 LLM calls mỗi URL, tránh 429.
 *
 * Khi có Gemini paid, bật lại summarize bằng cách:
 * 1. Thêm lại hàm summarize()
 * 2. Thêm lại clearOldContextMemory()
 * 3. Uncomment phần "b. Tóm tắt + lưu memory" bên dưới
 */
async function crawlUrl(url, label, llmClient, embedModel) {
  console.log(`[Crawler] Đang crawl: ${url}`);

  let text;
  try {
    text = await fetchText(url);
  } catch (err) {
    console.error(`[Crawler] Fetch lỗi (${url}):`, err.message);
    writeCrawlLog(url, 'error', null, err.message);
    return { status: 'error', changed: false, error: err.message };
  }

  const newHash = hashContent(text);
  const lastHash = getLastHash(url);

  if (newHash === lastHash) {
    console.log(`[Crawler] Không thay đổi: ${url}`);
    writeCrawlLog(url, 'unchanged', newHash);
    return { status: 'unchanged', changed: false };
  }

  console.log(`[Crawler] Nội dung thay đổi, đang xử lý: ${url}`);

  const docName = makeDocName(url, label);

  // a. Chunk + embed → RAG (0 LLM calls nếu embed lỗi)
  try {
    const chunks = chunkText(text, { chunkSize: 500 });
    const embeddedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      let vector = [];
      try {
        vector = await embedText(chunks[i].text, llmClient, embedModel);
      } catch {
        // Embed lỗi → chunk vẫn lưu, chỉ không có vector
      }
      embeddedChunks.push({
        id: `${docName}_${i}`,
        text: chunks[i].text,
        vector,
        index: i,
      });
    }

    saveDocument(docName, embeddedChunks);
    console.log(`[Crawler] RAG: lưu ${embeddedChunks.length} chunks cho ${url} với filename: ${docName}`);
  } catch (err) {
    console.error(`[Crawler] RAG lỗi (${url}):`, err.message);
  }

  // b. [TẮT TẠM] Tóm tắt + lưu memory — bật lại khi có Gemini paid
  // try {
  //   const summary = await summarize(text, url, llmClient, llmModel);
  //   if (summary) {
  //     clearOldContextMemory(label, url);
  //     const vector = await embedText(summary, llmClient, embedModel);
  //     saveMemoryVector(`[${label || url}] ${summary}`, vector, 'context');
  //   }
  // } catch (err) {
  //   console.error(`[Crawler] Summarize lỗi (${url}):`, err.message);
  // }

  writeCrawlLog(url, 'ok', newHash);
  return { status: 'ok', changed: true };
}

/**
 * Crawl tất cả URL đang active.
 * [FIX] Bỏ llmModel param — không cần nữa khi không summarize.
 */
async function crawlAll(llmClient, embedModel) {
  const db = getDb();
  const urls = db.prepare('SELECT url, label FROM watched_urls WHERE active = 1').all();

  if (urls.length === 0) {
    console.log('[Crawler] Không có URL nào cần crawl.');
    return;
  }

  console.log(`[Crawler] Bắt đầu crawl ${urls.length} URL...`);

  const results = [];
  for (const { url, label } of urls) {
    const result = await crawlUrl(url, label, llmClient, embedModel);
    results.push({ url, ...result });
    await new Promise(r => setTimeout(r, 2000));
  }

  const changed = results.filter(r => r.changed).length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`[Crawler] Hoàn tất: ${changed} thay đổi, ${errors} lỗi.`);

  return results;
}

module.exports = { crawlUrl, crawlAll, hashContent, makeDocName };