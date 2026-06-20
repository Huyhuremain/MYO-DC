const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('./middleware/auth');
const chatRoute = require('./routes/chat');
const streamRoute = require('./routes/stream');
const uploadRoute = require('./routes/upload');

/**
 * Khởi tạo và start Express API server.
 */
function startServer(config, agent) {
  const app = express();

  // ── CORS ──
  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json());

  // ── Inject agent ──
  app.use((req, res, next) => {
    req.agent = agent;
    next();
  });

  // ── Multer — lưu file upload vào data/uploads/ ──
  const uploadDir = path.join(process.cwd(), 'data', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`[API] Tạo thư mục upload: ${uploadDir}`);
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      // Tên file: timestamp + tên gốc để tránh trùng
      const timestamp = Date.now();
      const ext = path.extname(file.originalname).toLowerCase();
      const safeName = `${timestamp}${ext}`;
      cb(null, safeName);
    },
  });

  const fileFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Định dạng không hỗ trợ: ${ext}`), false);
    }
  };

  const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  });

  // Inject multer vào upload route
  app.use('/api', upload.single('image'), uploadRoute);

  // ── Health check ──
  app.get('/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      name: config.app.name,
      version: config.app.version,
      model: config.llm.model,
    });
  });

  // ── Stream route — không cần auth ──
  app.use('/api', streamRoute);

  // ── Chat route — có auth ──
  app.use('/api', authMiddleware(config), chatRoute(agent));

  // ── Global error handler ──
  app.use((err, req, res, next) => {
    console.error('[API] Unhandled error:', err.message);
    res.status(500).json({
      status: 'error',
      error: { code: 'INTERNAL_ERROR', message: err.message },
    });
  });

  // ── Start ──
  return new Promise((resolve) => {
    const server = app.listen(config.server.port, () => {
      console.log(`[API] ${config.app.name} API server on http://localhost:${config.server.port}`);
      console.log(`[API] POST /api/chat         — gửi tin nhắn (JSON)`);
      console.log(`[API] GET  /api/chat/stream  — streaming SSE`);
      console.log(`[API] POST /api/upload       — upload ảnh`);
      console.log(`[API] GET  /health           — kiểm tra server`);
      resolve(server);
    });
  });
}

module.exports = { startServer };