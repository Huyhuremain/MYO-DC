const calculator = require('./calculator');
const getCurrentTime = require('./get_current_time');
const saveMemory = require('./save_memory');
const ingestDocument = require('./ingest_document');
const webScraper = require('./web_scraper');
const fileReader = require('./file_reader');
const visionOcr = require('./vision_ocr');
const manageWatchedUrls = require('./manage_watched_urls');

// Map tên tool -> module
const tools = {
  calculator,
  get_current_time: getCurrentTime,
  save_memory: saveMemory,
  ingest_document: ingestDocument,
  web_scraper: webScraper,
  file_reader: fileReader,
  vision_ocr: visionOcr,
  manage_watched_urls: manageWatchedUrls,
};

function getToolDefinitions() {
  return Object.values(tools).map(t => t.definition);
}

async function executeTool(name, args) {
  const tool = tools[name];
  if (!tool) {
    return `Lỗi: Không tìm thấy tool "${name}"`;
  }
  try {
    return await tool.execute(args);
  } catch (err) {
    return `Lỗi khi chạy tool "${name}": ${err.message}`;
  }
}

module.exports = { getToolDefinitions, executeTool, tools };