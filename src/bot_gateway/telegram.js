const { Telegraf } = require('telegraf');

/**
 * Tạo và khởi chạy Telegram bot.
 * Bot nhận tin nhắn → gọi Agent trực tiếp → trả reply.
 *
 * @param {object} config - App config từ loadConfig()
 * @param {import('../core/agent')} agent - Agent instance
 * @returns {Telegraf} Bot instance
 */
function createTelegramBot(config, agent) {
  const token = config.telegram && config.telegram.token;
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN chưa được cấu hình — bỏ qua');
    return null;
  }

  const bot = new Telegraf(token);

  bot.on('text', async (ctx) => {
    try {
      const userMessage = ctx.message.text;
      console.log(`[Telegram] ${ctx.from.first_name}: ${userMessage}`);

      // Gọi Agent trực tiếp (không qua HTTP)
      const response = await agent.chat(userMessage);

      if (response.status === 'success') {
        await ctx.reply(response.data.reply_text);
      } else {
        await ctx.reply(`Lỗi: ${response.error.message}`);
      }
    } catch (err) {
      console.error('[Telegram] Lỗi xử lý tin nhắn:', err.message);
      await ctx.reply('Xin lỗi, có lỗi xảy ra. Thử lại sau nhé!');
    }
  });

  return bot;
}

/**
 * Start Telegram bot (long polling).
 *
 * @param {object} config - App config
 * @param {import('../core/agent')} agent - Agent instance
 */
async function startTelegramBot(config, agent) {
  const bot = createTelegramBot(config, agent);
  if (!bot) return null;

  await bot.launch();
  console.log('[Telegram] Bot đã khởi chạy — đang lắng nghe tin nhắn...');

  // Graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  return bot;
}

module.exports = { createTelegramBot, startTelegramBot };
