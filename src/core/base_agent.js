'use strict';

/**
 * BaseAgent — Sub-agent nhẹ, không stateful.
 *
 * Chỉ làm 1 task rồi trả kết quả (string).
 * Không có short-term memory, compaction, RAG — đó là trách nhiệm của Orchestrator.
 *
 * Dùng làm base class cho SearchAgent, AnalysisAgent, v.v.
 *
 * run(task, context) → string
 */

const MAX_TOOL_ROUNDS = 8;

class BaseAgent {
  /**
   * @param {object}   client     - OpenAI-compatible client
   * @param {string}   model      - Tên model
   * @param {string[]} toolNames  - Danh sách tool name được phép dùng ([] = không có tool nào)
   * @param {object}   [opts]
   * @param {string}   [opts.agentName]   - Tên agent dùng cho logging
   * @param {number}   [opts.maxRounds]   - Override MAX_TOOL_ROUNDS
   */
  constructor(client, model, toolNames = [], opts = {}) {
    this.client = client;
    this.model = model;
    this.toolNames = toolNames;
    this.agentName = opts.agentName || 'BaseAgent';
    this.maxRounds = opts.maxRounds || MAX_TOOL_ROUNDS;
    // Cho phép inject tools module khi test (tránh require path thật)
    this._toolsModule = opts._toolsModule || (() => require('../tools'));
  }

  /**
   * Chạy 1 task và trả về kết quả dạng string.
   *
   * @param {string} task    - Task cụ thể (từ Orchestrator)
   * @param {string} context - Ngữ cảnh bổ sung (optional)
   * @returns {Promise<string>} - Kết quả hoàn chỉnh
   */
  async run(task, context = '') {
    const systemPrompt = this._buildSystemPrompt(context);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ];

    // Lazy-load tools chỉ khi có toolNames — tránh load tools không cần thiết
    const tools = this.toolNames.length > 0 ? this._getToolDefinitions() : [];

    for (let round = 0; round < this.maxRounds; round++) {
      this._log(`Round ${round + 1}/${this.maxRounds}`);

      // Build request params
      const params = {
        model: this.model,
        messages,
      };
      if (tools.length > 0) {
        params.tools = tools;
        params.tool_choice = 'auto';
      }

      let response;
      try {
        response = await this.client.chat.completions.create(params);
      } catch (err) {
        this._log(`LLM error: ${err.message}`);
        throw new Error(`[${this.agentName}] LLM call failed: ${err.message}`);
      }

      const assistantMsg = response.choices?.[0]?.message;
      if (!assistantMsg) {
        throw new Error(`[${this.agentName}] LLM trả response không hợp lệ`);
      }

      messages.push(assistantMsg);

      // Không có tool_calls → final answer
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        return assistantMsg.content || '';
      }

      // Thực thi từng tool call
      for (const toolCall of assistantMsg.tool_calls) {
        const result = await this._executeToolCall(toolCall);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: String(result),
        });
      }
    }

    throw new Error(`[${this.agentName}] Vượt quá ${this.maxRounds} rounds`);
  }

  /**
   * Thực thi một tool call — parse args, gọi executeTool, handle errors.
   * @private
   */
  async _executeToolCall(toolCall) {
    const fnName = toolCall.function.name;

    // Kiểm tra tool có được phép không
    if (this.toolNames.length > 0 && !this.toolNames.includes(fnName)) {
      const msg = `Tool "${fnName}" không được phép với ${this.agentName}`;
      this._log(msg);
      return `[Permission error] ${msg}`;
    }

    // Parse arguments
    let fnArgs;
    try {
      fnArgs = JSON.parse(toolCall.function.arguments || '{}');
    } catch (err) {
      const msg = `Arguments không hợp lệ cho ${fnName}: ${err.message}`;
      this._log(`Parse error: ${msg}`);
      return `[Parse error] ${msg}`;
    }

    this._log(`Tool: ${fnName}(${JSON.stringify(fnArgs)})`);

    // Execute
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

  /**
   * Lấy tool definitions, lọc theo toolNames.
   * @private
   */
  _getToolDefinitions() {
    const { getToolDefinitions } = this._toolsModule();
    const allTools = getToolDefinitions();
    return allTools.filter((t) => this.toolNames.includes(t.function.name));
  }

  /**
   * Build system prompt cho sub-agent.
   * Override trong subclass nếu cần prompt riêng.
   * @param {string} context
   * @returns {string}
   */
  _buildSystemPrompt(context) {
    const base = `Bạn là một AI sub-agent chuyên biệt. Hãy hoàn thành task được giao một cách ngắn gọn, chính xác.
Trả về kết quả trực tiếp — không cần giải thích thêm trừ khi được yêu cầu.`;

    return context ? `${base}\n\nNgữ cảnh:\n${context}` : base;
  }

  /**
   * @private
   */
  _log(msg) {
    console.log(`[${this.agentName}] ${msg}`);
  }
}

module.exports = { BaseAgent };