const fs = require('fs');
const path = require('path');
const { MEMORY_FILE } = require('../../config/paths');

// Giới hạn ký tự memory inject vào prompt (tránh quá dài)
const MAX_MEMORY_CHARS = 2000;

/**
 * Đọc trí nhớ dài hạn từ MEMORY.md, giới hạn độ dài.
 * Nếu file quá dài, chỉ lấy phần cuối (gần nhất).
 */
function readMemory() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      return '';
    }
    const content = fs.readFileSync(MEMORY_FILE, 'utf-8');

    // Nếu nội dung quá dài, chỉ lấy phần cuối
    if (content.length > MAX_MEMORY_CHARS) {
      const truncated = content.slice(-MAX_MEMORY_CHARS);
      return `...(đã cắt bớt)\n${truncated}`;
    }

    return content;
  } catch (err) {
    console.error('[LongTermMemory] Lỗi đọc file:', err.message);
    return '';
  }
}

/**
 * Ghi thêm một mục trí nhớ mới vào MEMORY.md
 */
function appendMemory(content) {
  try {
    const dir = path.dirname(MEMORY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const timestamp = new Date().toLocaleString('vi-VN');
    const entry = `\n- [${timestamp}] ${content}\n`;
    fs.appendFileSync(MEMORY_FILE, entry, 'utf-8');
    return true;
  } catch (err) {
    console.error('[LongTermMemory] Lỗi ghi file:', err.message);
    return false;
  }
}

module.exports = { readMemory, appendMemory };
