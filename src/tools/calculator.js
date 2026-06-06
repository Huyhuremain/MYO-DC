const { evaluate } = require('mathjs');

const definition = {
  type: 'function',
  function: {
    name: 'calculator',
    description: 'Tính toán biểu thức toán học một cách an toàn. Ví dụ: "2 + 3 * 4", "sqrt(16)", "sin(pi/2)"',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Biểu thức toán học cần tính (ví dụ: "2 + 3 * 4")'
        }
      },
      required: ['expression']
    }
  }
};

async function execute({ expression }) {
  try {
    const result = evaluate(expression);
    return `Kết quả: ${expression} = ${result}`;
  } catch (err) {
    return `Lỗi tính toán: ${err.message}`;
  }
}

module.exports = { definition, execute };
