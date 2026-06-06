const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.js', '.html', '.pdf', '.docx'];
const MAX_FILE_SIZE_MB = 20;
const MAX_CONTENT_LENGTH = 8000;

const definition = {
  type: 'function',
  function: {
    name: 'file_reader',
    description: `Đọc và trích xuất nội dung văn bản từ các file cục bộ trên hệ thống. Hỗ trợ các định dạng: ${SUPPORTED_EXTENSIONS.join(', ')}.`,
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Đường dẫn (tuyệt đối hoặc tương đối) đến file cần đọc (ví dụ: "./tai-lieu/bao-cao.pdf" hoặc "C:/data/note.txt")'
        }
      },
      required: ['filePath']
    }
  }
};

async function execute({ filePath }) {
  console.log(`\n[DEBUG TOOL] 📂 Agent đang yêu cầu đọc file: ${filePath}`);

  try {
    const absolutePath = path.resolve(filePath);

    // Kiểm tra file có tồn tại không
    if (!fs.existsSync(absolutePath)) {
      console.log(`[DEBUG TOOL] ❌ Không tìm thấy file tại: ${absolutePath}`);
      return `Lỗi: File không tồn tại tại đường dẫn "${filePath}"`;
    }

    // Kiểm tra kích thước file trước khi đọc
    const stats = fs.statSync(absolutePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      console.log(`[DEBUG TOOL] ❌ File quá lớn: ${fileSizeMB.toFixed(1)}MB`);
      return `Lỗi: File quá lớn (${fileSizeMB.toFixed(1)}MB). Giới hạn cho phép là ${MAX_FILE_SIZE_MB}MB.`;
    }

    const ext = path.extname(absolutePath).toLowerCase();

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      console.log(`[DEBUG TOOL] ⚠️ Định dạng không được hỗ trợ: ${ext}`);
      return `Lỗi: Định dạng "${ext}" chưa được hỗ trợ. Các định dạng hợp lệ: ${SUPPORTED_EXTENSIONS.join(', ')}`;
    }

    console.log(`[DEBUG TOOL] ⚙️ Đang phân tích file định dạng: ${ext} (${fileSizeMB.toFixed(2)}MB)`);

    let text = '';

    if (['.txt', '.md', '.csv', '.json', '.js', '.html'].includes(ext)) {
      text = fs.readFileSync(absolutePath, 'utf8');
    }
    else if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(absolutePath);
      const pdfData = await pdf(dataBuffer);
      text = pdfData.text;
    }
    else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ path: absolutePath });
      text = result.value;
    }

    // Dọn dẹp whitespace: giữ nguyên xuống dòng, chỉ collapse space/tab thừa
    text = text
      .replace(/[ \t]+/g, ' ')       // nhiều space/tab -> 1 space
      .replace(/\n{3,}/g, '\n\n')     // nhiều dòng trống -> tối đa 2
      .trim();

    if (!text) {
      console.log(`[DEBUG TOOL] ⚠️ File rỗng hoặc không chứa văn bản.`);
      return 'Lỗi: File rỗng hoặc không chứa nội dung văn bản nào có thể đọc được.';
    }

    console.log(`[DEBUG TOOL] 📝 Đã đọc được ${text.length} ký tự từ file.`);

    // Cắt gọn nếu vượt giới hạn
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.substring(0, MAX_CONTENT_LENGTH) + '\n\n...[NỘI DUNG ĐÃ ĐƯỢC CẮT NGẮN DO GIỚI HẠN BỘ NHỚ]...';
      console.log(`[DEBUG TOOL] ✂️ File quá dài, đã cắt bớt còn ${MAX_CONTENT_LENGTH} ký tự.`);
    }

    console.log(`[DEBUG TOOL] 🚀 Đang gửi dữ liệu về cho Agent xử lý...\n`);
    return `Nội dung trích xuất từ file "${path.basename(filePath)}":\n\n${text}`;

  } catch (err) {
    console.log(`[DEBUG TOOL] 💥 LỖI khi đọc file: ${err.message}`);
    return `Lỗi khi đọc file: ${err.message}`;
  }
}

module.exports = { definition, execute };