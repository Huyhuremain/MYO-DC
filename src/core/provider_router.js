const OpenAI = require('openai');

/**
 * Provider Router — Quản lý nhiều LLM provider với fallback tự động.
 *
 * Inspired by OpenClaw: model-fallback.ts, auth-profiles.ts
 *
 * Config format trong .env:
 *   PROVIDERS=openai,anthropic   (comma-separated, thứ tự = ưu tiên)
 *   OPENAI_API_KEY=...
 *   OPENAI_BASE_URL=...
 *   OPENAI_MODEL=gpt-4o-mini
 *   ANTHROPIC_API_KEY=...
 *   ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
 *   ANTHROPIC_MODEL=claude-sonnet-4-6
 */

class ProviderRouter {
  /**
   * @param {Array} providers - Danh sách provider configs, thứ tự = ưu tiên
   */
  constructor(providers) {
    this.providers = providers;
    this.clients = new Map();
    this.failures = new Map(); // provider name -> last failure time

    // Khởi tạo OpenAI client cho mỗi provider
    for (const provider of providers) {
      this.clients.set(provider.name, new OpenAI({
        apiKey: provider.apiKey,
        baseURL: provider.baseURL,
      }));
    }
  }

  /**
   * Lấy client + model cho provider ưu tiên cao nhất khả dụng.
   * Bỏ qua provider đã fail gần đây (cooldown 60s).
   */
  resolve() {
    const now = Date.now();
    const COOLDOWN_MS = 60_000;

    for (const provider of this.providers) {
      const lastFail = this.failures.get(provider.name) || 0;
      if (now - lastFail < COOLDOWN_MS) {
        continue; // Provider trong cooldown
      }

      const client = this.clients.get(provider.name);
      if (client) {
        return {
          client,
          model: provider.model,
          providerName: provider.name,
        };
      }
    }

    // Fallback: trả provider đầu tiên dù đã fail
    const primary = this.providers[0];
    return {
      client: this.clients.get(primary.name),
      model: primary.model,
      providerName: primary.name,
    };
  }

  /**
   * Đánh dấu provider fail → cooldown, thử provider tiếp theo.
   */
  markFailure(providerName) {
    this.failures.set(providerName, Date.now());
    console.error(`[ProviderRouter] ${providerName} fail, chuyển sang provider khác`);
    return this.resolve();
  }

  /**
   * Reset failure cho provider (khi thành công).
   */
  markSuccess(providerName) {
    this.failures.delete(providerName);
  }

  /**
   * Lấy primary client (cho embedding, compaction, v.v.).
   */
  getPrimaryClient() {
    const primary = this.providers[0];
    return this.clients.get(primary.name);
  }

  /**
   * Lấy primary model name.
   */
  getPrimaryModel() {
    return this.providers[0].model;
  }
}

/**
 * Parse provider config từ environment variables.
 */
function parseProviders() {
  const providerList = (process.env.PROVIDERS || '').split(',').map((s) => s.trim()).filter(Boolean);

  // Nếu không config PROVIDERS → dùng config cũ (single provider)
  if (providerList.length === 0) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return [];

    return [{
      name: 'openai',
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.MODEL || 'gpt-4o-mini',
    }];
  }

  // Parse từng provider từ env vars
  return providerList.map((name) => {
    const upperName = name.toUpperCase();
    const apiKey = process.env[`${upperName}_API_KEY`];
    if (!apiKey) {
      console.warn(`[Config] Thiếu ${upperName}_API_KEY cho provider "${name}"`);
      return null;
    }

    return {
      name,
      apiKey,
      baseURL: process.env[`${upperName}_BASE_URL`] || 'https://api.openai.com/v1',
      model: process.env[`${upperName}_MODEL`] || 'gpt-4o-mini',
    };
  }).filter(Boolean);
}

module.exports = { ProviderRouter, parseProviders };
