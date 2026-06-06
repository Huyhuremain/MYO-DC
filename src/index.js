require('dotenv').config();

const readline = require('readline');
const { loadConfig } = require('./config');
const Agent = require('./core/agent');

// 1. Load config với error handling rõ ràng
let config;
try {
  config = loadConfig();
} catch (err) {
  console.error('\n❌ Lỗi cấu hình:\n');
  console.error(err.message);
  console.error('\nVui lòng kiểm tra file .env và thử lại.\n');
  process.exit(1);
}

// 2. Khởi tạo Agent
const agent = new Agent(config);

// 3. Terminal UI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('=================================');
console.log(`  ${config.app.name} v${config.app.version}`);
console.log(`  Model: ${config.llm.model}`);
console.log('  Gõ "exit" hoặc "quit" để thoát');
console.log('=================================\n');

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nTạm biệt!');
  rl.close();
  process.exit(0);
});

rl.on('close', () => {
  console.log('\nTạm biệt!');
  process.exit(0);
});

function prompt() {
  rl.question('Bạn: ', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return prompt();

    const lowerInput = trimmed.toLowerCase();
    if (lowerInput === 'exit' || lowerInput === 'quit') {
      console.log('\nTạm biệt!');
      rl.close();
      return;
    }

    // Use streaming by default
    const toolsUsed = [];
    let fullReply = '';

    try {
      process.stdout.write('DaisyClaw: ');
      for await (const event of agent.chatStream(trimmed)) {
        if (event.type === 'token') {
          process.stdout.write(event.text);
          fullReply += event.text;
        } else if (event.type === 'tool_call') {
          console.log(`  [Tool: ${event.name}]`);
        } else if (event.type === 'tool_result') {
          toolsUsed.push(event.name);
        } else if (event.type === 'done') {
          if (toolsUsed.length > 0) {
            console.log(`  [Tools: ${toolsUsed.join(', ')}]`);
          }
          console.log('\n');
        } else if (event.type === 'error') {
          console.error(`\n❌ [${event.error.code}] ${event.error.message}\n`);
        }
      }
    } catch (err) {
      console.error(`\n❌ Stream error: ${err.message}\n`);
    }

    prompt();
  });
}

prompt();
