const { startTelegramBot } = require('./telegram');

/**
 * Khởi chạy tất cả bot đã cấu hình.
 * Hiện tại hỗ trợ: Telegram.
 * Phase 3 sẽ thêm: Discord.
 *
 * @param {object} config - App config
 * @param {import('../core/agent')} agent - Agent instance
 */
async function startBots(config, agent) {
  const bots = {};

  // Telegram
  const telegramBot = await startTelegramBot(config, agent);
  if (telegramBot) {
    bots.telegram = telegramBot;
  }

  // Discord — Phase 3
  // const discordBot = await startDiscordBot(config, agent);
  // if (discordBot) bots.discord = discordBot;

  const count = Object.keys(bots).length;
  if (count === 0) {
    console.log('[BotGateway] Không có bot nào được cấu hình — chỉ chạy API server');
  } else {
    console.log(`[BotGateway] Đã khởi chạy ${count} bot: ${Object.keys(bots).join(', ')}`);
  }

  return bots;
}

module.exports = { startBots };
