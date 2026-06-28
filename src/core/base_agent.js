'use strict';
const { callLLMWithRetry429 } = require('./retry429');
const MAX_TOOL_ROUNDS = 8;

class BaseAgent {
  constructor(client, model, toolNames = [], opts = {}) {
    this.client = client;
    this.model = model;
    this.toolNames = toolNames;
    this.agentName = opts.agentName || 'BaseAgent';
    this.maxRounds = opts.maxRounds || MAX_TOOL_ROUNDS;
    this._toolsModule = opts._toolsModule || (() => require('../tools'));
  }

  async run(task, context = '') {
    const systemPrompt = this._buildSystemPrompt(context);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ];
    const tools = this.toolNames.length > 0 ? this._getToolDefinitions() : [];

    for (let round = 0; round < this.maxRounds; round++) {
      this._log(`Round ${round + 1}/${this.maxRounds}`);
      const params = { model: this.model, messages };
      if (tools.length > 0) {
        params.tools = tools;
        params.tool_choice = 'auto';
      }

      let response;
      try {
        // [FIX RETRY 429]
        response = await callLLMWithRetry429(this.client, params);
      } catch (err) {
        this._log(`LLM error: ${err.message}`);
        throw new Error(`[${this.agentName}] LLM call failed: ${err.message}`);
      }

      const assistantMsg = response.choices?.[0]?.message;
      if (!assistantMsg) {
        throw new Error(`[${this.agentName}] LLM trả response không hợp lệ`);
      }
      messages.push(assistantMsg);

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        return assistantMsg.content || '';
      }

      for (const toolCall of assistantMsg.tool_calls) {
        const result = await this._executeToolCall(toolCall);
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: String(result) });
      }
    }
    throw new Error(`[${this.agentName}] Vượt quá ${this.maxRounds} rounds`);
  }

  async _executeToolCall(toolCall) {
    const fnName = toolCall.function.name;
    if (this.toolNames.length > 0 && !this.toolNames.includes(fnName)) {
      const msg = `Tool "${fnName}" không được phép với ${this.agentName}`;
      this._log(msg);
      return `[Permission error] ${msg}`;
    }
    let fnArgs;
    try {
      fnArgs = JSON.parse(toolCall.function.arguments || '{}');
    } catch (err) {
      const msg = `Arguments không hợp lệ cho ${fnName}: ${err.message}`;
      this._log(`Parse error: ${msg}`);
      return `[Parse error] ${msg}`;
    }
    this._log(`Tool: ${fnName}(${JSON.stringify(fnArgs)})`);
    try {
      const { executeTool } = this._toolsModule();
      const result = await executeTool(fnName, fnArgs);
      this._log(`Tool ${fnName} → ${String(result).substring(0, 80)}...`);
      return result;
    } catch (err) {
      this._log(`Tool error ${fnName}: ${err.message}`);
      return `[Tool error] ${fnName} thất bại: ${err.message}`;
    }
  }

  _getToolDefinitions() {
    const { getToolDefinitions } = this._toolsModule();
    return getToolDefinitions().filter((t) => this.toolNames.includes(t.function.name));
  }

  _buildSystemPrompt(context) {
    const base = `Bạn là một AI sub-agent chuyên biệt. Hãy hoàn thành task được giao một cách ngắn gọn, chính xác.
Trả về kết quả trực tiếp — không cần giải thích thêm trừ khi được yêu cầu.`;
    return context ? `${base}\n\nNgữ cảnh:\n${context}` : base;
  }

  _log(msg) {
    console.log(`[${this.agentName}] ${msg}`);
  }
}

module.exports = { BaseAgent };