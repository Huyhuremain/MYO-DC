/**
 * ===================================================
 * DAISYCLAW — Server Entry Point (API + Bot Gateway)
 * ===================================================
 *
 * Chạy: npm run server
 *
 * Entry point này khởi động:
 *   1. Express API server (POST /api/chat)
 *   2. Telegram bot (nếu có TELEGRAM_BOT_TOKEN)
 *   3. Discord bot (Phase 3, nếu có DISCORD_BOT_TOKEN)
 *
 * Khác với src/index.js (terminal mode), file này dành cho
 * production và bot gateway.
 */

require('dotenv').config();

const { loadConfig } = require('./config');
const Agent = require('./core/agent');
const { startServer } = require('./api');
const { startBots } = require('./bot_gateway');

async function main() {
  // 1. Load config
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // 2. Khởi tạo Agent (dùng chung cho API + Bot)
  const agent = new Agent(config);

  console.log('=================================');
  console.log(`  ${config.app.name} v${config.app.version}`);
  console.log(`  Model: ${config.llm.model}`);
  console.log('  Mode: Server (API + Bot)');
  console.log('=================================\n');

  // 3. Start API server
  await startServer(config, agent);

  // 4. Start bot gateway
  await startBots(config, agent);
}

main().catch((err) => {
  console.error('[Server] Lỗi khởi động:', err.message);
  process.exit(1);
});
