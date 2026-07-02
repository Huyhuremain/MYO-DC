'use strict';

const calculator = require('./calculator');
const getCurrentTime = require('./get_current_time');
const saveMemory = require('./save_memory');
const ingestDocument = require('./ingest_document');
const webScraper = require('./web_scraper');
const webSearch = require('./web_search');
const queryKnowledgeBase = require('./query_knowledge_base');
const fileReader = require('./file_reader');
const visionOcr = require('./vision_ocr');
const manageWatchedUrls = require('./manage_watched_urls');
const sendEmail = require('./send_email');

const tools = {
  calculator,
  get_current_time: getCurrentTime,
  save_memory: saveMemory,
  ingest_document: ingestDocument,
  web_scraper: webScraper,
  web_search: webSearch,
  query_knowledge_base: queryKnowledgeBase,
  file_reader: fileReader,
  vision_ocr: visionOcr,
  manage_watched_urls: manageWatchedUrls,
  send_email: sendEmail,
};

// Tools nhẹ — dùng cho intent=chat
const CHAT_TOOL_NAMES = new Set([
  'save_memory',
  'calculator',
  'get_current_time',
  'manage_watched_urls',
  'query_knowledge_base',
  'send_email',
]);

function getToolDefinitions() {
  return Object.values(tools).map((t) => t.definition);
}

function getChatToolDefinitions() {
  return Object.entries(tools)
    .filter(([name]) => CHAT_TOOL_NAMES.has(name))
    .map(([, t]) => t.definition);
}

async function executeTool(name, args) {
  const tool = tools[name];
  if (!tool) return `Lỗi: Không tìm thấy tool "${name}"`;
  try {
    return await tool.execute(args);
  } catch (err) {
    return `Lỗi khi chạy tool "${name}": ${err.message}`;
  }
}

module.exports = { getToolDefinitions, getChatToolDefinitions, executeTool, tools };