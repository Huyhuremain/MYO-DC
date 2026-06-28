'use strict';

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
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

  const html = await response.text();
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, footer, header, aside, iframe, svg, canvas, .ad, .ads, .advertisement').remove();

  let text = '';
  for (const sel of ['article', 'main', '.content', '#content', '.post', '.entry-content']) {
    const el = $(sel);
    if (el.length > 0) { text = el.text(); break; }
  }
  if (!text || text.trim().length < 100) text = $('body').text();

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

function makeDocName(url, label, crawlDate) {
  try {
    const hostname = new URL(url).hostname;
    const slug = (label || hostname).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    // Thêm crawl_date vào filename để phân biệt các ngày
    return `web_${slug}_${crawlDate}.txt`;
  } catch {
    return `web_${url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}_${crawlDate}.txt`;
  }
}

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

  // Dedup: nội dung không đổi → bỏ qua
  if (newHash === lastHash) {
    console.log(`[Crawler] Không thay đổi: ${url}`);
    writeCrawlLog(url, 'unchanged', newHash);
    return { status: 'unchanged', changed: false };
  }

  console.log(`[Crawler] Nội dung thay đổi, đang xử lý: ${url}`);

  const crawlDate = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const docName = makeDocName(url, label, crawlDate);

  try {
    const chunks = chunkText(text, { chunkSize: 500 });
    const embeddedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      let vector = [];
      try {
        vector = await embedText(chunks[i].text, llmClient, embedModel);
      } catch { }
      embeddedChunks.push({ id: `${docName}_${i}`, text: chunks[i].text, vector, index: i });
    }

    // Truyền meta: url, label, crawl_date
    saveDocument(docName, embeddedChunks, { url, label, crawl_date: crawlDate });
    console.log(`[Crawler] RAG: lưu ${embeddedChunks.length} chunks cho ${url} (${crawlDate})`);
  } catch (err) {
    console.error(`[Crawler] RAG lỗi (${url}):`, err.message);
  }

  writeCrawlLog(url, 'ok', newHash);
  return { status: 'ok', changed: true };
}

async function crawlAll(llmClient, embedModel) {
  const db = getDb();
  const urls = db.prepare('SELECT url, label FROM watched_urls WHERE active = 1').all();
  if (urls.length === 0) { console.log('[Crawler] Không có URL nào cần crawl.'); return; }

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