/**
 * src/core/crawler/scheduler.js
 */

const cron = require('node-cron');
const { crawlAll } = require('./crawler');

let _scheduledTask = null;

/**
 * Khởi động scheduler.
 * [FIX] Bỏ llmModel param — crawler không cần LLM nữa
 *
 * @param {object} llmClient - OpenAI client (dùng cho embed)
 * @param {string} embedModel - Model embedding
 * @param {string} schedule - Cron expression
 */
function startScheduler(llmClient, embedModel, schedule = '0 7 * * *') {
  if (_scheduledTask) {
    console.log('[Scheduler] Đã chạy rồi, bỏ qua.');
    return;
  }

  if (!cron.validate(schedule)) {
    console.error(`[Scheduler] Cron expression không hợp lệ: "${schedule}"`);
    return;
  }

  _scheduledTask = cron.schedule(schedule, async () => {
    console.log(`[Scheduler] Bắt đầu crawl tự động lúc ${new Date().toLocaleString('vi-VN')}...`);
    try {
      // [FIX] Bỏ llmModel
      await crawlAll(llmClient, embedModel);
    } catch (err) {
      console.error('[Scheduler] Lỗi crawl:', err.message);
    }
  }, {
    timezone: 'Asia/Ho_Chi_Minh',
  });

  console.log(`[Scheduler] Đã đặt lịch crawl: "${schedule}" (Asia/Ho_Chi_Minh)`);
}

function stopScheduler() {
  if (_scheduledTask) {
    _scheduledTask.stop();
    _scheduledTask = null;
    console.log('[Scheduler] Đã dừng.');
  }
}

module.exports = { startScheduler, stopScheduler };