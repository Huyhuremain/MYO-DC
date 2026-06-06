const definition = {
  type: 'function',
  function: {
    name: 'get_current_time',
    description: 'Lấy ngày giờ hiện tại (múi giờ Việt Nam UTC+7)',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
};

async function execute() {
  const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  return `Thời gian hiện tại: ${now}`;
}

module.exports = { definition, execute };
