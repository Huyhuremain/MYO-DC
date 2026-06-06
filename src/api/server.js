const express = require('express');
const cors = require('cors');
const authMiddleware = require('./middleware/auth');
const chatRoute = require('./routes/chat');

/**
 * Khởi tạo và start Express API server.
 *
 * @param {object} config - App config từ loadConfig()
 * @param {import('../core/agent')} agent - Agent instance
 * @returns {Promise<import('http').Server>} HTTP server instance
 */
function startServer(config, agent) {
  const app = express();

  // Middleware cơ bản
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', name: config.app.name, version: config.app.version });
  });

  // API routes — auth + chat
  app.use('/api', authMiddleware(config), chatRoute(agent));

  // Start server
  return new Promise((resolve) => {
    const server = app.listen(config.server.port, () => {
      console.log(`[API] ${config.app.name} API server on http://localhost:${config.server.port}`);
      console.log(`[API] POST /api/chat — gửi tin nhắn`);
      console.log(`[API] GET  /health    — kiểm tra server`);
      resolve(server);
    });
  });
}

module.exports = { startServer };
