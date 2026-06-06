const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', '.gif'];
const MAX_FILE_SIZE_MB = 10;

const definition = {
  type: 'function',
  function: {
    name: 'vision_ocr',
    description: `Nhận dạng và trích xuất văn bản từ file ảnh cục bộ bằng OCR. Hữu ích khi cần đọc hóa đơn, tài liệu scan, ảnh chứa chữ viết. Hỗ trợ định dạng: ${SUPPORTED_EXTENSIONS.join(', ')}.`,
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Đường dẫn (tuyệt đối hoặc tương đối) đến file ảnh cần nhận dạng chữ (ví dụ: "./hoadon.jpg" hoặc "C:/scans/document.png")'
        },
        language: {
          type: 'string',
          description: 'Ngôn ngữ cần nhận dạng. Mặc định "vie+eng" (tiếng Việt + tiếng Anh). Ví dụ khác: "eng", "vie".'
        }
      },
      required: ['filePath']
    }
  }
};

async function execute({ filePath, language = 'vie+eng' }) {
  console.log(`\n[DEBUG TOOL] 🖼️  Agent đang yêu cầu OCR file ảnh: ${filePath}`);

  let worker = null;

  try {
    const absolutePath = path.resolve(filePath);

    // Kiểm tra file tồn tại
    if (!fs.existsSync(absolutePath)) {
      console.log(`[DEBUG TOOL] ❌ Không tìm thấy file tại: ${absolutePath}`);
      return `Lỗi: File không tồn tại tại đường dẫn "${filePath}"`;
    }

    // Kiểm tra định dạng
    const ext = path.extname(absolutePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      console.log(`[DEBUG TOOL] ⚠️ Định dạng không được hỗ trợ: ${ext}`);
      return `Lỗi: Định dạng "${ext}" không được hỗ trợ. Các định dạng hợp lệ: ${SUPPORTED_EXTENSIONS.join(', ')}`;
    }

    // Kiểm tra kích thước file
    const stats = fs.statSync(absolutePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      console.log(`[DEBUG TOOL] ❌ File quá lớn: ${fileSizeMB.toFixed(1)}MB`);
      return `Lỗi: File quá lớn (${fileSizeMB.toFixed(1)}MB). Giới hạn cho phép là ${MAX_FILE_SIZE_MB}MB.`;
    }

    console.log(`[DEBUG TOOL] ⚙️  Khởi tạo Tesseract engine, ngôn ngữ: "${language}"...`);

    worker = await createWorker(language);

    console.log(`[DEBUG TOOL] 🔍 Đang nhận dạng văn bản từ ảnh (${fileSizeMB.toFixed(2)}MB)...`);

    const { data } = await worker.recognize(absolutePath);
    let text = data.text ?? '';
    const confidence = data.confidence ?? 0;

    // Dọn dẹp whitespace — giữ xuống dòng, collapse space/tab thừa
    text = text
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text) {
      console.log(`[DEBUG TOOL] ⚠️ Không nhận dạng được văn bản nào trong ảnh.`);
      return 'Lỗi: Không tìm thấy văn bản nào trong ảnh. Ảnh có thể quá mờ, độ phân giải thấp, hoặc không chứa chữ.';
    }

    console.log(`[DEBUG TOOL] 📝 Nhận dạng được ${text.length} ký tự, độ tin cậy: ${confidence.toFixed(1)}%`);

    // Cảnh báo nếu độ tin cậy thấp
    const confidenceNote = confidence < 60
      ? `\n⚠️ Lưu ý: Độ tin cậy OCR thấp (${confidence.toFixed(1)}%) — kết quả có thể không chính xác. Ảnh nên rõ nét, đủ sáng và không bị nghiêng.`
      : '';

    console.log(`[DEBUG TOOL] 🚀 Đang gửi dữ liệu về cho Agent xử lý...\n`);
    return `Văn bản nhận dạng từ ảnh "${path.basename(filePath)}" (độ tin cậy: ${confidence.toFixed(1)}%):${confidenceNote}\n\n${text}`;

  } catch (err) {
    console.log(`[DEBUG TOOL] 💥 LỖI OCR: ${err.message}`);

    // Gợi ý cài package nếu thiếu
    if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('tesseract.js')) {
      return 'Lỗi: Thiếu package "tesseract.js". Chạy lệnh: npm install tesseract.js';
    }

    return `Lỗi khi thực hiện OCR: ${err.message}`;

  } finally {
    // Luôn giải phóng worker dù thành công hay lỗi
    if (worker) {
      await worker.terminate();
      console.log(`[DEBUG TOOL] 🧹 Tesseract worker đã được giải phóng.`);
    }
  }
}

module.exports = { definition, execute };