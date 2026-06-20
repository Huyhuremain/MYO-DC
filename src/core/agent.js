'use strict';

const OpenAI = require('openai');
const { ShortTermMemory } = require('./memory');
const { semanticMemory } = require('./memory');
const { getToolDefinitions, executeTool } = require('../tools');
const { buildSystemPrompt } = require('./prompts');
const { createSuccessResponse, createErrorResponse } = require('../protocol/types');
const { ErrorCodes } = require('../protocol/errors');
const { initSemanticSave } = require('../tools/save_memory');
const { initDocumentEmbed } = require('../tools/ingest_document');
const { compaction } = require('./memory');
const { ProviderRouter } = require('./provider_router');
const { searchDocuments } = require('./rag/search');

// [MULTI-AGENT] Import sub-agents và intent classifier
const { classifyIntent } = require('./intent');
const { SearchAgent } = require('./search_agent');
const { AnalysisAgent } = require('./analysis_agent');

const MAX_TOOL_ROUNDS = 10;

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

    // Embedding client riêng biệt
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
  // [MULTI-AGENT] Classify intent + build context string cho sub-agents
  // ---------------------------------------------------------------------------

  /**
   * Tóm tắt ngắn conversation history để truyền vào intent classifier.
   * Chỉ lấy 3 turn gần nhất để tránh prompt quá dài.
   * @returns {string}
   */
  _buildConversationContext() {
    const messages = this.memory.getMessages();
    if (messages.length === 0) return '';

    return messages
      .slice(-6) // 3 turns = 6 messages (user + assistant)
      .map((m) => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.content}`)
      .join('\n');
  }

  /**
   * Delegate task sang sub-agents dựa trên intent.
   * Trả về kết quả tổng hợp dạng string.
   *
   * @param {string} intent   - 'search' | 'analysis' | 'multi'
   * @param {string} message  - Tin nhắn gốc của user
   * @param {string} context  - Conversation context
   * @returns {Promise<string>}
   */
  async _delegateToSubAgents(intent, message, context) {
    if (intent === 'search') {
      console.log('[Orchestrator] Delegate → SearchAgent');
      return await this.searchAgent.run(message, context);
    }

    if (intent === 'analysis') {
      console.log('[Orchestrator] Delegate → AnalysisAgent');
      return await this.analysisAgent.run(message, context);
    }

    if (intent === 'multi') {
      console.log('[Orchestrator] Delegate → SearchAgent + AnalysisAgent (parallel)');

      // Chạy song song
      const [searchResult, analysisResult] = await Promise.all([
        this.searchAgent.run(message, context),
        this.analysisAgent.run(message, context),
      ]);

      // Orchestrator tổng hợp bằng LLM
      return await this._synthesize(message, { search: searchResult, analysis: analysisResult });
    }

    throw new Error(`[Orchestrator] Intent không hợp lệ: ${intent}`);
  }

  /**
   * Tổng hợp kết quả từ nhiều sub-agents bằng LLM.
   * Chỉ dùng khi intent === 'multi'.
   *
   * @param {string} originalMessage
   * @param {{ search: string, analysis: string }} results
   * @returns {Promise<string>}
   */
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
      const response = await provider.client.chat.completions.create({
        model: provider.model,
        messages: [
          { role: 'user', content: synthesizePrompt },
        ],
      });
      return response.choices?.[0]?.message?.content || results.search;
    } catch (err) {
      console.error('[Orchestrator] Synthesize lỗi:', err.message);
      // Fallback: ghép thủ công nếu LLM lỗi
      return `**Kết quả tìm kiếm:**\n${results.search}\n\n**Phân tích:**\n${results.analysis}`;
    }
  }

  // ---------------------------------------------------------------------------
  // chat() — thêm intent classification, giữ nguyên flow cũ cho 'chat'
  // ---------------------------------------------------------------------------

  async chat(userMessage) {
    try {
      // 1. Validate
      if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
        return createErrorResponse(
          ErrorCodes.MISSING_MESSAGE,
          'Tin nhắn không hợp lệ hoặc rỗng'
        );
      }

      // [MULTI-AGENT] 1b. Classify intent trước khi xử lý
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

      // [MULTI-AGENT] 1c. Nếu cần sub-agents, delegate và trả kết quả
      if (intentResult.intent !== 'chat') {
        this.memory.add({ role: 'user', content: userMessage });
        try {
          const result = await this._delegateToSubAgents(intentResult.intent, userMessage, context);
          this.memory.add({ role: 'assistant', content: result });
          return createSuccessResponse(result, [`${intentResult.intent}_agent`]);
        } catch (err) {
          console.error('[Orchestrator] Sub-agent lỗi, fallback về chat flow:', err.message);
          // Fallback về chat flow bên dưới nếu sub-agent fail
          this.memory.getMessages(); // memory.add đã chạy ở trên, không add lại
        }
      }

      // 2. Thêm tin nhắn user vào bộ nhớ ngắn hạn (chỉ khi chưa add ở trên)
      if (intentResult.intent === 'chat') {
        this.memory.add({ role: 'user', content: userMessage });
      }

      // 2b. Context compaction nếu memory gần đầy
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

      // 3. Build context cho LLM
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

      // 3b. Document RAG
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

      // 4. Vòng lặp ReAct (không đổi)
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        console.log(`[Agent] Round ${round + 1}/${MAX_TOOL_ROUNDS}`);

        const provider = this._resolveProvider();
        const currentProvider = provider.providerName;

        let response;
        try {
          response = await provider.client.chat.completions.create({
            model: provider.model,
            messages,
            tools: getToolDefinitions(),
            tool_choice: 'auto',
          });
        } catch (llmError) {
          console.error('[Agent] LLM API Error:', llmError.message);
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
  // chatStream() — thêm intent classification, giữ nguyên stream flow cũ
  // ---------------------------------------------------------------------------

  async *chatStream(userMessage) {
    // 1. Validate
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
      yield { type: 'error', error: { code: ErrorCodes.MISSING_MESSAGE, message: 'Tin nhắn không hợp lệ hoặc rỗng' } };
      return;
    }

    // [MULTI-AGENT] 1b. Classify intent
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

    // [MULTI-AGENT] 1c. Nếu cần sub-agents, delegate
    // Stream giả lập bằng cách yield token từ kết quả string
    if (intentResult.intent !== 'chat') {
      this.memory.add({ role: 'user', content: userMessage });
      try {
        const result = await this._delegateToSubAgents(intentResult.intent, userMessage, context);
        this.memory.add({ role: 'assistant', content: result });
        // Yield kết quả như 1 token duy nhất + done — client không phân biệt được nguồn
        yield { type: 'token', text: result };
        yield { type: 'done', reply: result, tools_used: [`${intentResult.intent}_agent`] };
        return;
      } catch (err) {
        console.error('[Orchestrator] Sub-agent lỗi, fallback về stream flow:', err.message);
        // Fallback: tiếp tục stream flow bên dưới
        // memory đã có user message, không add lại
      }
    }

    // 2. Add to memory + compaction (chỉ khi intent === 'chat' hoặc sub-agent fallback)
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

    // 3. Semantic search + RAG
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

    // 3b. Document RAG
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

    // 4. ReAct loop with streaming (không đổi)
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      console.log(`[Agent] Stream Round ${round + 1}/${MAX_TOOL_ROUNDS}`);

      let stream;
      try {
        stream = await this.client.chat.completions.create({
          model: this.model,
          messages,
          tools: getToolDefinitions(),
          tool_choice: 'auto',
          stream: true,
        });
      } catch (llmError) {
        console.error('[Agent] LLM API Error:', llmError.message);
        yield { type: 'error', error: { code: ErrorCodes.LLM_ERROR, message: `Lỗi gọi LLM API: ${llmError.message}` } };
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