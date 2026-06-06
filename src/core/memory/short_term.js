const MAX_MESSAGES = 10;

class ShortTermMemory {
  /**
   * @param {number} maxMessages - Số tin nhắn tối đa trong sliding window
   */
  constructor(maxMessages) {
    this.maxMessages = maxMessages || MAX_MESSAGES;
    this.messages = [];
  }

  /**
   * Thêm message vào bộ nhớ ngắn hạn.
   * Tự động cắt nếu vượt quá sliding window.
   */
  add(message) {
    this.messages.push(message);
    this._trim();
  }

  /**
   * Thêm nhiều messages cùng lúc (dùng sau khi tool call hoàn tất)
   */
  addBatch(messages) {
    this.messages.push(...messages);
    this._trim();
  }

  /**
   * Lấy toàn bộ messages trong window hiện tại
   */
  getMessages() {
    return [...this.messages];
  }

  /**
   * Sliding window: giữ tối đa maxMessages tin nhắn gần nhất
   */
  _trim() {
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  /**
   * Xóa toàn bộ bộ nhớ ngắn hạn (reset phiên)
   */
  clear() {
    this.messages = [];
  }
}

module.exports = ShortTermMemory;
