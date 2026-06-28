'use strict';

const OpenAI = require('openai');
const { ShortTermMemory } = require('./memory');
const { semanticMemory } = require('./memory');
const { getToolDefinitions, getChatToolDefinitions, executeTool } = require('../tools');
const { buildSystemPrompt } = require('./prompts');
const { createSuccessResponse, createErrorResponse } = require('../protocol/types');
const { ErrorCodes } = require('../protocol/errors');
const { initSemanticSave } = require('../tools/save_memory');
const { initDocumentEmbed } = require('../tools/ingest_document');
const { compaction } = require('./memory');
const { ProviderRouter } = require('./provider_router');
const { searchDocuments } = require('./rag/search');

const { classifyIntent } = require('./intent');
const { SearchAgent } = require('./search_agent');
const { AnalysisAgent } = require('./analysis_agent');

const MAX_TOOL_ROUNDS = 10;

// [FIX RETRY 429] Cấu hình retry riêng cho rate limit
const RETRY_429_MAX_ATTEMPTS = 3;
const RETRY_429_BASE_DELAY_MS = 5000; // 5s, 10s, 20s (exponential backoff)

/**
 * Kiểm tra xem error có phải do rate limit (429) không.
 * Hỗ trợ nhiều cách OpenAI SDK / Gemini báo lỗi 429.
 *
 * @param {Error} err
 * @returns {boolean}
 */
function is429Error(err) {
  if (!err) return false;
  if (err.status === 429) return true;
  if (err.response?.status === 429) return true;
  if (typeof err.message === 'string' && err.message.includes('429')) return true;
  return false;
}

/**
 * Đợi với thời gian tăng dần theo số lần thử (exponential backoff).
 * @param {number} attempt - Lần thử thứ mấy (0-based)
 */
function delay429(attempt) {
  const ms = RETRY_429_BASE_DELAY_MS * Math.pow(2, attempt);
  console.log(`[Agent] Rate limited (429) — đợi ${ms / 1000}s rồi thử lại (lần ${attempt + 1}/${RETRY_429_MAX_ATTEMPTS})...`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Inject document context vào system prompt.
 */
function injectDocumentContext(systemPrompt, relevantDocs) {
  if (!relevantDocs || relevantDocs.length === 0) return systemPrompt;

  const docItems = relevantDocs.map((d) => `[${d.filename}] ${d.text}`).join('\n---\n');
  return systemPrompt + `

## Tài liệu liên quan
Dưới đây là đoạn tài liệu liên quan đến câu hỏi:
---
${docItems}
---
Sử dụng thông tin này để trả lời chính xác. Nếu câu hỏi không liên quan đến tài liệu, bỏ qua phần này.`;
}

class Agent {
  /**
   * @param {object} config - Config object từ loadConfig()
   */
  constructor(config) {
    this.config = config;
    this.memory = new ShortTermMemory(config.memory.shortTermMax);
    this.embeddingConfig = config.embedding || {};

    // Multi-provider router (DL4)
    const providers = config.providers || [];
    if (providers.length > 0) {
      this.router = new ProviderRouter(providers);
      this.client = this.router.getPrimaryClient();
      this.model = this.router.getPrimaryModel();
    } else {
      // Fallback: single provider (backward compat)
      this.router = null;
      this.client = new OpenAI({
        apiKey: config.llm.apiKey,
        baseURL: config.llm.baseURL,
        timeout: 15000,
        maxRetries: 1,
      });
      this.model = config.llm.model;
    }

    // Embedding client riêng biệt — dùng config.embedding (key + baseURL riêng)
    this.embeddingClient = new OpenAI({
      apiKey: config.embedding.apiKey,
      baseURL: config.embedding.baseURL,
      timeout: 15000,
      maxRetries: 1,
    });

    // Inject embedding client vào tools
    initSemanticSave(
      this.embeddingClient,
      this.embeddingConfig.model || 'text-embedding-3-small'
    );
    initDocumentEmbed(
      this.embeddingClient,
      this.embeddingConfig.model || 'text-embedding-3-small'
    );

    // [MULTI-AGENT] Khởi tạo sub-agents — dùng chung client/model với Orchestrator
    this.searchAgent = new SearchAgent(this.client, this.model);
    this.analysisAgent = new AnalysisAgent(this.client, this.model);
  }

  // ---------------------------------------------------------------------------
  // Provider helpers (không đổi)
  // ---------------------------------------------------------------------------

  _resolveProvider() {
    if (!this.router) {
      return { client: this.client, model: this.model, providerName: 'default' };
    }
    return this.router.resolve();
  }

  _handleProviderFailure(providerName) {
    if (!this.router) return;
    const next = this.router.markFailure(providerName);
    this.client = next.client;
    this.model = next.model;
  }

  // ---------------------------------------------------------------------------
  // [FIX RETRY 429] Wrapper gọi LLM non-streaming với retry riêng cho 429.
  // Dùng chung cho ReAct loop trong chat().
  // ---------------------------------------------------------------------------

  /**
   * Gọi LLM completion với retry tự động khi gặp 429.
   * Khác với provider fallback (đổi provider khác) — đây retry CÙNG provider
   * sau khi đợi, vì 429 thường là tạm thời (rate limit theo phút).
   *
   * @param {object} client
   * @param {object} params - Params truyền vào client.chat.completions.create()
   * @returns {Promise<object>} response
   * @throws {Error} nếu vượt quá số lần retry hoặc lỗi không phải 429
   */
  async _callLLMWithRetry429(client, params) {
    let lastErr = null;
    for (let attempt = 0; attempt < RETRY_429_MAX_ATTEMPTS; attempt++) {
      try {
        return await client.chat.completions.create(params);
      } catch (err) {
        lastErr = err;
        if (is429Error(err) && attempt < RETRY_429_MAX_ATTEMPTS - 1) {
          await delay429(attempt);
          continue;
        }
        throw err; // Không phải 429, hoặc đã hết lượt retry
      }
    }
    throw lastErr;
  }

  // ---------------------------------------------------------------------------
  // [MULTI-AGENT] Classify intent + build context string cho sub-agents
  // ---------------------------------------------------------------------------

  _buildConversationContext() {
    const messages = this.memory.getMessages();
    if (messages.length === 0) return '';

    return messages
      .slice(-6)
      .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
      .join('\n');
  }

  async _delegateToSubAgents(intent, message, context) {
    // Sub-agents trả về string — wrap thành object có toolEvents để stream.js yield
    if (intent === 'search') {
      console.log('[Orchestrator] Delegate → SearchAgent');
      const result = await this.searchAgent.run(message, context);
      return { text: result, agentName: 'search_agent' };
    }

    if (intent === 'analysis') {
      console.log('[Orchestrator] Delegate → AnalysisAgent');
      const result = await this.analysisAgent.run(message, context);
      return { text: result, agentName: 'analysis_agent' };
    }

    if (intent === 'multi') {
      console.log('[Orchestrator] Delegate → SearchAgent + AnalysisAgent (parallel)');
      const [searchResult, analysisResult] = await Promise.all([
        this.searchAgent.run(message, context),
        this.analysisAgent.run(message, context),
      ]);
      const text = await this._synthesize(message, { search: searchResult, analysis: analysisResult });
      return { text, agentName: 'multi_agent' };
    }

    throw new Error(`[Orchestrator] Intent không hợp lệ: ${intent}`);
  }

  async _synthesize(originalMessage, results) {
    console.log('[Orchestrator] Synthesizing results...');

    const provider = this._resolveProvider();

    const synthesizePrompt = `Bạn là AI assistant. Dưới đây là kết quả từ 2 agent chuyên biệt cho câu hỏi của user.

Câu hỏi gốc: ${originalMessage}

Kết quả tìm kiếm (Search Agent):
${results.search}

Kết quả phân tích (Analysis Agent):
${results.analysis}

Hãy tổng hợp thành câu trả lời hoàn chỉnh, loại bỏ thông tin trùng lặp, trình bày rõ ràng.`;

    try {
      // [FIX RETRY 429] Dùng wrapper retry cho synthesize call
      const response = await this._callLLMWithRetry429(provider.client, {
        model: provider.model,
        messages: [{ role: 'user', content: synthesizePrompt }],
      });
      return response.choices?.[0]?.message?.content || results.search;
    } catch (err) {
      console.error('[Orchestrator] Synthesize lỗi:', err.message);
      return `**Kết quả tìm kiếm:**\n${results.search}\n\n**Phân tích:**\n${results.analysis}`;
    }
  }

  // ---------------------------------------------------------------------------
  // chat() — thêm intent classification + retry 429
  // ---------------------------------------------------------------------------

  async chat(userMessage) {
    try {
      if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
        return createErrorResponse(
          ErrorCodes.MISSING_MESSAGE,
          'Tin nhắn không hợp lệ hoặc rỗng'
        );
      }

      const context = this._buildConversationContext();
      const provider = this._resolveProvider();
      let intentResult;
      try {
        intentResult = await classifyIntent(userMessage, context, provider.client, provider.model);
        console.log(`[Orchestrator] Intent: ${intentResult.intent} — ${intentResult.reason}`);
      } catch (err) {
        console.error('[Orchestrator] Intent classify lỗi, fallback về chat:', err.message);
        intentResult = { intent: 'chat', reason: 'classify error', agents: [] };
      }

      if (intentResult.intent !== 'chat') {
        this.memory.add({ role: 'user', content: userMessage });
        try {
          const { text, agentName } = await this._delegateToSubAgents(intentResult.intent, userMessage, context);
          this.memory.add({ role: 'assistant', content: text });
          return createSuccessResponse(text, [agentName]);
        } catch (err) {
          console.error('[Orchestrator] Sub-agent lỗi, fallback về chat flow:', err.message);
        }
      }

      if (intentResult.intent === 'chat') {
        this.memory.add({ role: 'user', content: userMessage });
      }

      const compactionConfig = this.config.compaction || {};
      try {
        const compactionProvider = this._resolveProvider();
        await compaction.runCompaction(
          this.memory,
          compactionProvider.client,
          compactionProvider.model,
          compactionConfig.threshold || 8,
          compactionConfig.keepRecent || 2
        );
      } catch (err) {
        console.error('[Agent] Compaction lỗi:', err.message);
      }

      let queryVector = null;
      let relevantMemories = [];
      try {
        queryVector = await semanticMemory.embedText(
          userMessage,
          this.embeddingClient,
          this.embeddingConfig.model || 'text-embedding-3-small'
        );
        relevantMemories = semanticMemory.searchRelevant(
          queryVector,
          this.embeddingConfig.topK || 3,
          this.embeddingConfig.minScore || 0.5
        );
      } catch (err) {
        console.error('[Agent] Semantic search lỗi:', err.message);
      }

      const systemPrompt = buildSystemPrompt(relevantMemories);

      let relevantDocs = [];
      try {
        if (queryVector) {
          relevantDocs = searchDocuments(
            queryVector,
            this.config.rag?.topK || 5,
            this.config.rag?.minScore || 0.5,
            userMessage
          );
        }
      } catch (err) {
        console.error('[Agent] Document RAG search lỗi:', err.message);
      }

      const finalSystemPrompt = injectDocumentContext(systemPrompt, relevantDocs);

      const messages = [
        { role: 'system', content: finalSystemPrompt },
        ...this.memory.getMessages(),
      ];

      const toolsUsed = [];

      // 4. Vòng lặp ReAct — [FIX RETRY 429] dùng _callLLMWithRetry429
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        console.log(`[Agent] Round ${round + 1}/${MAX_TOOL_ROUNDS}`);

        const provider = this._resolveProvider();
        const currentProvider = provider.providerName;

        let response;
        try {
          const isChat = intentResult.intent === 'chat';
          const toolDefs = isChat ? getChatToolDefinitions() : getToolDefinitions();
          response = await this._callLLMWithRetry429(provider.client, {
            model: provider.model,
            messages,
            tools: toolDefs,
            tool_choice: 'auto',
          });
        } catch (llmError) {
          console.error('[Agent] LLM API Error:', llmError.message);
          // 429 đã retry hết lượt ở trên — giờ thử fallback provider nếu có
          if (this.router) {
            this._handleProviderFailure(currentProvider);
            console.log('[Agent] Fallback sang provider:', this.router.resolve()?.providerName);
            continue;
          }
          return createErrorResponse(
            ErrorCodes.LLM_ERROR,
            `Lỗi gọi LLM API: ${llmError.message}`
          );
        }

        if (!response.choices || !response.choices[0] || !response.choices[0].message) {
          console.error('[Agent] LLM response thiếu choices[0].message');
          return createErrorResponse(ErrorCodes.LLM_ERROR, 'LLM trả về response không hợp lệ');
        }

        const assistantMsg = response.choices[0].message;
        messages.push(assistantMsg);

        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          const reply = assistantMsg.content || '';
          this.memory.add({ role: 'assistant', content: reply });
          return createSuccessResponse(reply, toolsUsed);
        }

        for (const toolCall of assistantMsg.tool_calls) {
          const fnName = toolCall.function.name;

          let fnArgs;
          try {
            fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (parseError) {
            console.error(`[Agent] JSON parse error for tool ${fnName}:`, parseError.message);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `[Parse error] Arguments không hợp lệ cho ${fnName}: ${parseError.message}`,
            });
            continue;
          }

          console.log(`  [Tool] ${fnName}(${JSON.stringify(fnArgs)})`);

          let result;
          try {
            result = await executeTool(fnName, fnArgs);
            toolsUsed.push(fnName);
          } catch (toolError) {
            console.error(`[Agent] Tool execution error for ${fnName}:`, toolError.message);
            result = `[Tool error] ${fnName} thất bại: ${toolError.message}`;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: String(result),
          });
        }
      }

      const fallback = 'Xin lỗi, tôi đã thử nhiều lần nhưng chưa thể hoàn thành. Hãy thử lại nhé!';
      this.memory.add({ role: 'assistant', content: fallback });
      return createErrorResponse(ErrorCodes.MAX_ROUNDS_EXCEEDED, fallback);

    } catch (err) {
      console.error('[Agent] Unexpected error:', err.message);
      return createErrorResponse(ErrorCodes.AGENT_ERROR, `Lỗi không mong đợi: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // chatStream() — thêm intent classification + retry 429 (không streaming khi retry)
  // ---------------------------------------------------------------------------

  async *chatStream(userMessage) {
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
      yield { type: 'error', error: { code: ErrorCodes.MISSING_MESSAGE, message: 'Tin nhắn không hợp lệ hoặc rỗng' } };
      return;
    }

    const context = this._buildConversationContext();
    const provider = this._resolveProvider();
    let intentResult;
    try {
      intentResult = await classifyIntent(userMessage, context, provider.client, provider.model);
      console.log(`[Orchestrator] Stream Intent: ${intentResult.intent} — ${intentResult.reason}`);
    } catch (err) {
      console.error('[Orchestrator] Intent classify lỗi, fallback về chat:', err.message);
      intentResult = { intent: 'chat', reason: 'classify error', agents: [] };
    }

    if (intentResult.intent !== 'chat') {
      this.memory.add({ role: 'user', content: userMessage });
      try {
          // Yield tool_call event để AgentPanel hiển thị sub-agent đang chạy
yield { type: 'tool_call', name: `${intentResult.intent}_agent`, args: { message: userMessage } };
          const { text, agentName } = await this._delegateToSubAgents(intentResult.intent, userMessage, context);
          yield { type: 'tool_result', name: agentName, result: text.slice(0, 300) + (text.length > 300 ? '…' : '') };
          this.memory.add({ role: 'assistant', content: text });
          yield { type: 'token', text };
          yield { type: 'done', reply: text, tools_used: [agentName] };
          return;
        } catch (err) {
        console.error('[Orchestrator] Sub-agent lỗi, fallback về stream flow:', err.message);
      }
    }

    if (intentResult.intent === 'chat') {
      this.memory.add({ role: 'user', content: userMessage });
    }

    const compactionConfig = this.config.compaction || {};
    try {
      const compactionProvider = this._resolveProvider();
      await compaction.runCompaction(
        this.memory,
        compactionProvider.client,
        compactionProvider.model,
        compactionConfig.threshold || 8,
        compactionConfig.keepRecent || 2
      );
    } catch (err) {
      console.error('[Agent] Compaction lỗi:', err.message);
    }

    let queryVector = null;
    let relevantMemories = [];
    try {
      queryVector = await semanticMemory.embedText(
        userMessage,
        this.embeddingClient,
        this.embeddingConfig.model || 'text-embedding-3-small'
      );
      relevantMemories = semanticMemory.searchRelevant(
        queryVector,
        this.embeddingConfig.topK || 3,
        this.embeddingConfig.minScore || 0.5
      );
    } catch (err) {
      console.error('[Agent] Semantic search lỗi:', err.message);
    }

    const systemPrompt = buildSystemPrompt(relevantMemories);

    let relevantDocs = [];
    try {
      if (queryVector) {
        relevantDocs = searchDocuments(
          queryVector,
          this.config.rag?.topK || 5,
          this.config.rag?.minScore || 0.5,
          userMessage
        );
      }
    } catch (err) {
      console.error('[Agent] Document RAG search lỗi:', err.message);
    }

    const finalSystemPrompt = injectDocumentContext(systemPrompt, relevantDocs);

    const messages = [
      { role: 'system', content: finalSystemPrompt },
      ...this.memory.getMessages(),
    ];

    const toolsUsed = [];

    // 4. ReAct loop with streaming — [FIX RETRY 429]
    // Streaming không thể "retry" giữa stream — nên khi gặp 429 lúc TẠO stream
    // (trước khi token nào được yield), ta đợi rồi tạo lại stream mới.
    // Nếu 429 xảy ra GIỮA lúc đang nhận chunk (hiếm, nhưng có thể), ta dừng
    // round đó và báo lỗi — không thể "tiếp tục" 1 stream đã vỡ giữa đường.
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      console.log(`[Agent] Stream Round ${round + 1}/${MAX_TOOL_ROUNDS}`);

      let stream = null;
      let streamCreateErr = null;

      for (let attempt = 0; attempt < RETRY_429_MAX_ATTEMPTS; attempt++) {
        try {
          const isChat = intentResult.intent === 'chat';
          const toolDefs = isChat ? getChatToolDefinitions() : getToolDefinitions();
          stream = await this.client.chat.completions.create({
            model: this.model,
            messages,
            tools: toolDefs,
            tool_choice: 'auto',
            stream: true,
          });
          streamCreateErr = null;
          break;
        } catch (llmError) {
          streamCreateErr = llmError;
          if (is429Error(llmError) && attempt < RETRY_429_MAX_ATTEMPTS - 1) {
            await delay429(attempt);
            continue;
          }
          break; // Không phải 429, hoặc hết lượt retry
        }
      }

      if (streamCreateErr) {
        console.error('[Agent] LLM API Error:', streamCreateErr.message);
        yield { type: 'error', error: { code: ErrorCodes.LLM_ERROR, message: `Lỗi gọi LLM API: ${streamCreateErr.message}` } };
        return;
      }

      let fullContent = '';
      let toolCalls = [];
      let finishReason = null;

      try {
        for await (const chunk of stream) {
          const choice = chunk.choices[0];
          if (!choice) continue;

          const delta = choice.delta;

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }

          if (!delta) continue;

          if (delta.content) {
            fullContent += delta.content;
            yield { type: 'token', text: delta.content };
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? toolCalls.length;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id || '',
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              if (tc.id) toolCalls[idx].id = tc.id;
              if (tc.function?.name) toolCalls[idx].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
            }
          }
        }
      } catch (streamError) {
        console.error('[Agent] Stream error:', streamError.message);
        yield { type: 'error', error: { code: ErrorCodes.LLM_ERROR, message: `Stream lỗi: ${streamError.message}` } };
        return;
      }

      const validToolCalls = toolCalls.filter(Boolean);

      const assistantMsg = {
        role: 'assistant',
        content: fullContent || null,
      };
      if (validToolCalls.length > 0) {
        assistantMsg.tool_calls = validToolCalls;
      }
      messages.push(assistantMsg);

      const needsTool = finishReason === 'tool_calls' || validToolCalls.length > 0;

      if (!needsTool) {
        const reply = fullContent || '';
        this.memory.add({ role: 'assistant', content: reply });
        yield { type: 'done', reply, tools_used: toolsUsed };
        return;
      }

      for (const toolCall of validToolCalls) {
        const fnName = toolCall.function.name;

        let fnArgs;
        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (parseError) {
          console.error(`[Agent] JSON parse error for tool ${fnName}:`, parseError.message);
          const errResult = `[Parse error] Arguments không hợp lệ cho ${fnName}: ${parseError.message}`;
          yield { type: 'tool_result', name: fnName, result: errResult };
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: errResult,
          });
          continue;
        }

        console.log(`  [Tool] ${fnName}(${JSON.stringify(fnArgs)})`);
        yield { type: 'tool_call', name: fnName, args: fnArgs };

        let result;
        try {
          result = await executeTool(fnName, fnArgs);
          toolsUsed.push(fnName);
        } catch (toolError) {
          console.error(`[Agent] Tool execution error for ${fnName}:`, toolError.message);
          result = `[Tool error] ${fnName} thất bại: ${toolError.message}`;
        }

        console.log(`  [Tool] ${fnName} → ${String(result).substring(0, 80)}...`);
        yield { type: 'tool_result', name: fnName, result };

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: String(result),
        });
      }
    }

    const fallback = 'Xin lỗi, tôi đã thử nhiều lần nhưng chưa thể hoàn thành. Hãy thử lại nhé!';
    this.memory.add({ role: 'assistant', content: fallback });
    yield { type: 'error', error: { code: ErrorCodes.MAX_ROUNDS_EXCEEDED, message: fallback } };
  }
}

module.exports = Agent;