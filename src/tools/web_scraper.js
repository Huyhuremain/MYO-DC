const cheerio = require('cheerio');

// Tương thích với Node < 18 (chưa có built-in fetch)
const fetchFn = globalThis.fetch ?? (() => {
  try {
    return require('node-fetch');
  } catch {
    throw new Error('Thiếu module "node-fetch". Chạy: npm install node-fetch, hoặc nâng Node.js lên v18+.');
  }
})();

const MAX_CONTENT_LENGTH = 8000;
const TIMEOUT_MS = 15000;

const definition = {
  type: 'function',
  function: {
    name: 'web_scraper',
    description: 'Trích xuất nội dung văn bản thuần túy từ một đường link (URL). Hữu ích khi cần đọc bài báo, tài liệu, bài viết tin tức hoặc thông tin từ một trang web bất kỳ.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Đường dẫn URL của trang web cần đọc (ví dụ: "https://example.com")'
        }
      },
      required: ['url']
    }
  }
};

async function execute({ url }) {
  console.log(`\n[DEBUG TOOL] 🔍 Agent đang yêu cầu đọc URL: ${url}`);

  try {
    // Validate URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.log(`[DEBUG TOOL] ❌ URL sai định dạng: ${url}`);
      return 'Lỗi: URL phải bắt đầu bằng http:// hoặc https://';
    }

    // Validate URL có parse được không
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return `Lỗi: URL không hợp lệ — "${url}"`;
    }

    console.log(`[DEBUG TOOL] 🌐 Đang gửi yêu cầu tải trang: ${parsedUrl.hostname}`);

    const response = await fetchFn(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DaisyClawBot/1.0'
      },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });

    if (!response.ok) {
      console.log(`[DEBUG TOOL] ❌ Lỗi tải trang: HTTP ${response.status}`);
      return `Lỗi tải trang: Mã HTTP ${response.status} — ${response.statusText}`;
    }

    // Kiểm tra Content-Type — tránh download file nhị phân
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      console.log(`[DEBUG TOOL] ⚠️ Content-Type không hỗ trợ: ${contentType}`);
      return `Lỗi: URL này trả về kiểu nội dung "${contentType}", không phải trang HTML có thể đọc được.`;
    }

    console.log(`[DEBUG TOOL] ✅ Tải HTML thành công. Đang phân tích cú pháp...`);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Xóa các thẻ không chứa nội dung hữu ích
    $('script, style, noscript, nav, footer, header, aside, iframe, svg, canvas, [aria-hidden="true"]').remove();

    let text = $('body').text();

    // Dọn dẹp whitespace: giữ xuống dòng, collapse space/tab thừa
    text = text
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text) {
      console.log(`[DEBUG TOOL] ⚠️ Trang web không có nội dung văn bản.`);
      return 'Lỗi: Không tìm thấy nội dung văn bản hữu ích trên trang web này.';
    }

    console.log(`[DEBUG TOOL] 📝 Đã trích xuất được ${text.length} ký tự văn bản.`);

    // Cắt gọn nếu vượt giới hạn
    if (text.length > MAX_CONTENT_LENGTH) {
      text = text.substring(0, MAX_CONTENT_LENGTH) + '\n\n...[NỘI DUNG ĐÃ ĐƯỢC CẮT NGẮN DO GIỚI HẠN BỘ NHỚ]...';
      console.log(`[DEBUG TOOL] ✂️ Nội dung quá dài, đã cắt bớt còn ${MAX_CONTENT_LENGTH} ký tự.`);
    }

    console.log(`[DEBUG TOOL] 🚀 Đang gửi dữ liệu về cho Agent xử lý...\n`);
    return `Nội dung trích xuất từ ${url}:\n\n${text}`;

  } catch (err) {
    console.log(`[DEBUG TOOL] 💥 LỖI: ${err.message}`);
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return `Lỗi: Kết nối tới trang web quá chậm (vượt quá ${TIMEOUT_MS / 1000} giây).`;
    }
    return `Lỗi khi cào dữ liệu từ URL: ${err.message}`;
  }
}

module.exports = { definition, execute };