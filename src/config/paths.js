const path = require('path');

// Root directory của project
const ROOT_DIR = path.resolve(__dirname, '..', '..');

// Paths cho data
const DATA_DIR = path.join(ROOT_DIR, 'data');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'MEMORY.md');

// Paths cho logs (Phase 3)
const LOGS_DIR = path.join(DATA_DIR, 'logs');

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  MEMORY_DIR,
  MEMORY_FILE,
  LOGS_DIR,
};
