const express = require('express');
const path = require('path');
const router = express.Router();

/**
 * POST /api/upload
 * Nhận file ảnh từ UI, lưu vào data/uploads/, trả về đường dẫn.
 *
 * Form field: "image" (file)
 * Response: { status: 'ok', filePath: 'data/uploads/xxx.jpg', filename: 'xxx.jpg' }
 */
router.post('/upload', (req, res) => {
  // multer đã xử lý file, truy cập qua req.file
  if (!req.file) {
    return res.status(400).json({
      status: 'error',
      error: { code: 'NO_FILE', message: 'Không có file nào được gửi lên' },
    });
  }

  const filename = req.file.filename;
  const filePath = path.join('data', 'uploads', filename).replace(/\\/g, '/');

  console.log(`[Upload] Đã nhận file: ${filename} (${(req.file.size / 1024).toFixed(1)}KB)`);

  res.json({
    status: 'ok',
    filePath,       // đường dẫn để agent dùng
    filename,       // tên file để hiển thị
    originalName: req.file.originalname,
    size: req.file.size,
  });
});

module.exports = router;