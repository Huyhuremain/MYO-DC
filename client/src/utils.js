// src/utils.js — shared helpers

export function formatTime(date) {
  return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const TOOL_ICONS = {
  web_search: "🔍",
  web_scraper: "🌐",
  manage_watched_urls: "📡",
  save_memory: "💾",
  calculator: "🧮",
  get_current_time: "🕐",
  ingest_document: "📄",
  file_reader: "📂",
  vision_ocr: "👁",
  query_knowledge_base: "🗄️",
};

export const API_BASE = "http://localhost:3000";
export const ACCEPTED_IMAGE_TYPES = ".jpg,.jpeg,.png,.bmp,.tiff,.webp,.gif";

// Tính token + cost từ event done
export function parseUsage(event, inputText, outputText) {
  const u = event.usage || event || {};
  let inputTokens = u.input_tokens || u.prompt_tokens || u.promptTokenCount || 0;
  let outputTokens = u.output_tokens || u.completion_tokens || u.candidatesTokenCount || 0;
  if (inputTokens === 0 && inputText) inputTokens = Math.ceil(inputText.length / 2.3);
  if (outputTokens === 0 && outputText) outputTokens = Math.ceil(outputText.length / 2.3);
  let costVnd = u.cost_vnd || u.cost || 0;
  if (costVnd === 0 && (inputTokens > 0 || outputTokens > 0)) {
    costVnd = (inputTokens * 0.001875) + (outputTokens * 0.0075);
  }
  return { input_tokens: inputTokens, output_tokens: outputTokens, cost_vnd: costVnd };
}