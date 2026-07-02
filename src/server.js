require('dotenv').config();

const { loadConfig } = require('./config');
const Agent = require('./core/agent');
const { startServer } = require('./api');
const { startBots } = require('./bot_gateway');
const { startScheduler } = require('./core/crawler/scheduler');
const { initCrawler } = require('./tools/manage_watched_urls');
const { initEmailTransporter } = require('./tools/send_email');
const { generateStartupBriefing } = require('./core/startup_briefing');

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
  initCrawler(
    agent.embeddingClient,
    config.embedding?.model || 'text-embedding-3-small'
  );

  // 3b. Khởi tạo Gmail SMTP transporter cho send_email tool
  initEmailTransporter(config.gmail?.user, config.gmail?.appPassword);

  // 4. Khởi động scheduler crawl tự động (7 sáng mỗi ngày)
  startScheduler(
    agent.embeddingClient,
    config.embedding?.model || 'text-embedding-3-small',
    '0 7 * * *'
  );

  // 5. Start API server
  await startServer(config, agent);

  // 6. Start bot gateway
  await startBots(config, agent);

  // 7. Tạo briefing tóm tắt tin tức mới (chạy ngầm, không block startup)
  setImmediate(() => {
    generateStartupBriefing(agent).catch(err =>
      console.error('[Briefing] Lỗi không mong đợi:', err.message)
    );
  });
}

main().catch((err) => {
  console.error('[Server] Lỗi khởi động:', err.message);
  process.exit(1);
});