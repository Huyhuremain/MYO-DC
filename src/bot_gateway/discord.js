'use strict';

const { Client, GatewayIntentBits, Partials } = require('discord.js');

const MAX_DISCORD_MESSAGE_LENGTH = 2000;

/**
 * Tạo và khởi chạy Discord bot.
 * Bot nhận tin nhắn → gọi Agent trực tiếp → trả reply.
 *
 * @param {object} config - App config từ loadConfig()
 * @param {import('../core/agent')} agent - Agent instance
 * @returns {Client|null} Bot client instance
 */
function createDiscordBot(config, agent) {
  const token = config.discord && config.discord.token;
  if (!token) {
    console.warn('[Discord] DISCORD_BOT_TOKEN chưa được cấu hình — bỏ qua');
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  client.once('ready', () => {
    console.log(`[Discord] Đăng nhập thành công: ${client.user.tag}`);
  });

  client.on('messageCreate', async (message) => {
    // Bỏ qua tin nhắn từ bot khác (kể cả chính nó)
    if (message.author.bot) return;
    if (!message.content || message.content.trim() === '') return;

    const userMessage = message.content.trim();
    console.log(`[Discord] ${message.author.username}: ${userMessage}`);

    try {
      // Hiện trạng thái "đang gõ..." trong lúc xử lý
      await message.channel.sendTyping();

      const response = await agent.chat(userMessage);

      let replyText;
      if (response.status === 'success') {
        replyText = typeof response.data === 'string'
          ? response.data
          : (response.data?.reply_text || JSON.stringify(response.data));
      } else {
        replyText = `Lỗi: ${response.error?.message || 'Không xác định'}`;
      }

      // Discord giới hạn 2000 ký tự/tin nhắn — cắt thành nhiều tin nếu cần
      await sendChunked(message, replyText);
    } catch (err) {
      console.error('[Discord] Lỗi xử lý tin nhắn:', err.message);
      await message.reply('Xin lỗi, có lỗi xảy ra. Thử lại sau nhé!');
    }
  });

  return client;
}

/**
 * Gửi tin nhắn dài bằng cách chia nhỏ theo giới hạn Discord (2000 ký tự).
 */
async function sendChunked(message, text) {
  if (!text) {
    await message.reply('(Không có nội dung trả lời)');
    return;
  }

  if (text.length <= MAX_DISCORD_MESSAGE_LENGTH) {
    await message.reply(text);
    return;
  }

  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, MAX_DISCORD_MESSAGE_LENGTH));
    remaining = remaining.slice(MAX_DISCORD_MESSAGE_LENGTH);
  }

  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      await message.reply(chunks[i]);
    } else {
      await message.channel.send(chunks[i]);
    }
  }
}

/**
 * Start Discord bot.
 *
 * @param {object} config - App config
 * @param {import('../core/agent')} agent - Agent instance
 */
async function startDiscordBot(config, agent) {
  const client = createDiscordBot(config, agent);
  if (!client) return null;

  await client.login(config.discord.token);

  process.once('SIGINT', () => client.destroy());
  process.once('SIGTERM', () => client.destroy());

  return client;
}

module.exports = { createDiscordBot, startDiscordBot };