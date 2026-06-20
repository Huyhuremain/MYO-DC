require('dotenv').config();

const { loadConfig } = require('./config');
const Agent = require('./core/agent');
const { startServer } = require('./api');
const { startBots } = require('./bot_gateway');
const { startScheduler } = require('./core/crawler/scheduler');
const { initCrawler } = require('./tools/manage_watched_urls');

async function main() {
  // 1. Load config
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 2. Khởi tạo Agent
  const agent = new Agent(config);

  console.log('=================================');
  console.log(`  ${config.app.name} v${config.app.version}`);
  console.log(`  Model: ${config.llm.model}`);
  console.log('  Mode: Server (API + Bot)');
  console.log('=================================\n');

  // 3. Inject crawler client vào manage_watched_urls tool
  // [FIX] Bỏ config.llm.model — crawler không dùng LLM nữa
  initCrawler(
    agent.embeddingClient,
    config.embedding?.model || 'text-embedding-3-small'
  );

  // 4. Khởi động scheduler crawl tự động (7 sáng mỗi ngày)
  // [FIX] Bỏ config.llm.model — crawler không dùng LLM nữa
  startScheduler(
    agent.embeddingClient,
    config.embedding?.model || 'text-embedding-3-small',
    '0 7 * * *'
  );

  // 5. Start API server
  await startServer(config, agent);

  // 6. Start bot gateway
  await startBots(config, agent);
}

main().catch((err) => {
  console.error('[Server] Lỗi khởi động:', err.message);
  process.exit(1);
});