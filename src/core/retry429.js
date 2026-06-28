'use strict';

/**
 * src/core/retry429.js — Helper dùng chung, tránh duplicate logic
 * giữa agent.js, base_agent.js, intent.js
 */

const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 5000;

// 429 = rate limit → đợi lâu (5s, 10s, 20s)
// 502/503 = overload tạm thời → đợi nhanh hơn (1s, 2s, 4s)
const RETRY_502_503_BASE_DELAY_MS = 1000;

function is429Error(err) {
  if (!err) return false;
  if (err.status === 429) return true;
  if (err.response?.status === 429) return true;
  if (typeof err.message === 'string' && err.message.includes('429')) return true;
  return false;
}

function isRetryableError(err) {
  if (!err) return false;
  const status = err.status ?? err.response?.status;
  if (status === 429 || status === 502 || status === 503) return true;
  if (typeof err.message === 'string' && err.message.includes('429')) return true;
  return false;
}

function getRetryDelay(err, attempt) {
  const status = err.status ?? err.response?.status;
  const baseMs = (status === 502 || status === 503)
    ? RETRY_502_503_BASE_DELAY_MS
    : RETRY_BASE_DELAY_MS;
  return baseMs * Math.pow(2, attempt);
}

function delay429(attempt) {
  const ms = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
  console.log(`[Retry] Rate limited — đợi ${ms / 1000}s (lần ${attempt + 1}/${RETRY_MAX_ATTEMPTS})...`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayRetry(err, attempt) {
  const ms = getRetryDelay(err, attempt);
  const status = err.status ?? err.response?.status;
  const reason = status === 429 ? 'Rate limited (429)' : `Server error (${status})`;
  console.log(`[Retry] ${reason} — đợi ${ms / 1000}s (lần ${attempt + 1}/${RETRY_MAX_ATTEMPTS})...`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrapper retry chung cho mọi LLM call non-streaming.
 * Handle: 429 (rate limit), 502/503 (server overload).
 */
async function callLLMWithRetry429(client, params) {
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await client.chat.completions.create(params);
    } catch (err) {
      const isLast = attempt === RETRY_MAX_ATTEMPTS - 1;
      if (!isRetryableError(err) || isLast) throw err;
      await delayRetry(err, attempt);
    }
  }
}

module.exports = {
  is429Error,
  isRetryableError,
  delay429,
  delayRetry,
  callLLMWithRetry429,
  RETRY_MAX_ATTEMPTS,
  // backward compat
  RETRY_429_MAX_ATTEMPTS: RETRY_MAX_ATTEMPTS,
};