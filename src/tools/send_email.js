'use strict';

const nodemailer = require('nodemailer');

const definition = {
  type: 'function',
  function: {
    name: 'send_email',
    description: [
      'Gửi email thật qua Gmail. QUY TRÌNH BẮT BUỘC:',
      '1. Soạn nội dung email đầy đủ, chuyên nghiệp dựa trên yêu cầu của user.',
      '2. Hiển thị draft (người nhận, tiêu đề, nội dung) cho user xem TRƯỚC, hỏi user có đồng ý gửi không — KHÔNG gọi tool này ở bước này.',
      '3. CHỈ gọi tool này khi user đã xác nhận đồng ý (ví dụ: "gửi đi", "ok gửi luôn", "đồng ý").',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Địa chỉ email người nhận. Ví dụ: "example@gmail.com"',
        },
        subject: {
          type: 'string',
          description: 'Tiêu đề email',
        },
        body: {
          type: 'string',
          description: 'Nội dung email đầy đủ, đã được user xác nhận',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
};

let _transporter = null;
let _fromEmail = null;
const _fromName = 'Phạm Ngọc Quốc Huy';

function initEmailTransporter(gmailUser, gmailAppPassword) {
  if (!gmailUser || !gmailAppPassword) {
    console.warn('[send_email] GMAIL_USER hoặc GMAIL_APP_PASSWORD chưa cấu hình — tool sẽ báo lỗi khi gọi');
    return;
  }

  _fromEmail = gmailUser;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailAppPassword,
    },
  });
}

async function execute({ to, subject, body }) {
  if (!_transporter) {
    return 'Lỗi: Email chưa được cấu hình. Cần GMAIL_USER và GMAIL_APP_PASSWORD trong .env';
  }

  if (!to || !to.includes('@')) {
    return `Lỗi: Địa chỉ email không hợp lệ: "${to}"`;
  }

  try {
    const info = await _transporter.sendMail({
      from: `"${_fromName}" <${_fromEmail}>`,
      to,
      subject: subject || '(Không có tiêu đề)',
      text: body,
    });

    return `Đã gửi email thành công đến ${to}. Message ID: ${info.messageId}`;
  } catch (err) {
    console.error('[send_email] Lỗi gửi email:', err.message);
    return `Lỗi gửi email: ${err.message}`;
  }
}

module.exports = { definition, execute, initEmailTransporter };