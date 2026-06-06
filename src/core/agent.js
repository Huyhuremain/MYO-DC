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
      });
      this.model = config.llm.model;
    }

    // Inject embedding client vào save_memory tool
    initSemanticSave(this.client, this.embeddingConfig.model || 'text-embedding-3-small');

    // Inject embedding client vào ingest_document tool (DL5)
    initDocumentEmbed(this.client, this.embeddingConfig.model || 'text-embedding-3-small');
  }

  /**
   * Resolve provider hiện tại (cho fallback).
   */
  _resolveProvider() {
    if (!this.router) {
      return { client: this.client, model: this.model, providerName: 'default' };
    }
    return this.router.resolve();
  }

  /**
   * Đánh dấu provider fail và thử provider tiếp theo.
   */
  _handleProviderFailure(providerName) {
    if (!this.router) return;
    const next = this.router.markFailure(providerName);
    this.client = next.client;
    this.model = next.model;
  }

  /**
   * Xử lý một tin nhắn từ người dùng.
   * Chạy vòng lặp ReAct: LLM -> Tool Call -> LLM -> ... -> Final Answer
   *
   * @param {string} userMessage - Tin nhắn từ người dùng
   * @returns {AgentResponse} - Response theo chuẩn protocol
   */
  async chat(userMessage) {
    try {
      // 1. Validate user message
      if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
        return createErrorResponse(
          ErrorCodes.MISSING_MESSAGE,
          'Tin nhắn không hợp lệ hoặc rỗng'
        );
      }

      // 2. Thêm tin nhắn user vào bộ nhớ ngắn hạn
      this.memory.add({ role: 'user', content: userMessage });

      // 2b. Context compaction nếu memory gần đầy
      const compactionConfig = this.config.compaction || {};
      try {
        await compaction.runCompaction(
          this.memory,
          this.client,
          this.model,
          compactionConfig.threshold || 8,
          compactionConfig.keepRecent || 2
        );
      } catch (err) {
        console.error('[Agent] Compaction lỗi:', err.message);
        // Không crash, tiếp tục bình thường
      }

      // 3. Build context cho LLM
      // Semantic search: tìm memories liên quan đến user message
      let relevantMemories = [];
      let queryVector = null;
      try {
        queryVector = await semanticMemory.embedText(
          userMessage, this.client, this.embeddingConfig.model || 'text-embedding-3-small'
        );
        relevantMemories = semanticMemory.searchRelevant(
          queryVector,
          this.embeddingConfig.topK || 3,
          this.embeddingConfig.minScore || 0.5
        );
      } catch (err) {
        console.error('[Agent] Semantic search lỗi:', err.message);
        // Fallback: dùng toàn bộ memory như cũ
      }

      const systemPrompt = buildSystemPrompt(relevantMemories);

      // 3b. Document RAG: tìm relevant document chunks
      let relevantDocs = [];
      try {
        if (queryVector) {
          relevantDocs = searchDocuments(
            queryVector,
            config.rag?.topK || 5,
            config.rag?.minScore || 0.5
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

      // 4. Vòng lặp ReAct
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        console.log(`[Agent] Round ${round + 1}/${MAX_TOOL_ROUNDS}`);

        // Resolve provider hiện tại (có thể đổi do fallback)
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
          // Try fallback provider
          if (this.router) {
            this._handleProviderFailure(currentProvider);
            console.log('[Agent] Fallback sang provider:', this.router.resolve()?.providerName);
            // Retry with new provider
            continue;
          }
          return createErrorResponse(
            ErrorCodes.LLM_ERROR,
            `Lỗi gọi LLM API: ${llmError.message}`
          );
        }

        // Kiểm tra response có choices[0] không
        if (!response.choices || !response.choices[0] || !response.choices[0].message) {
          console.error('[Agent] LLM response thiếu choices[0].message');
          return createErrorResponse(
            ErrorCodes.LLM_ERROR,
            'LLM trả về response không hợp lệ'
          );
        }

        const assistantMsg = response.choices[0].message;
        messages.push(assistantMsg);

        // Nếu không có tool_calls -> đây là câu trả lời cuối
        if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
          const reply = assistantMsg.content || '';
          this.memory.add({ role: 'assistant', content: reply });
          return createSuccessResponse(reply, toolsUsed);
        }

        // Thực thi từng tool call
        for (const toolCall of assistantMsg.tool_calls) {
          const fnName = toolCall.function.name;

          // Parse tool arguments an toàn
          let fnArgs;
          try {
            fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (parseError) {
            console.error(`[Agent] JSON parse error for tool ${fnName}:`, parseError.message);
            return createErrorResponse(
              ErrorCodes.TOOL_ERROR,
              `Lỗi parse arguments cho tool ${fnName}: ${parseError.message}`
            );
          }

          console.log(`  [Tool] ${fnName}(${JSON.stringify(fnArgs)})`);

          // Execute tool an toàn
          let result;
          try {
            result = await executeTool(fnName, fnArgs);
            toolsUsed.push(fnName);
          } catch (toolError) {
            console.error(`[Agent] Tool execution error for ${fnName}:`, toolError.message);
            return createErrorResponse(
              ErrorCodes.TOOL_ERROR,
              `Lỗi thực thi tool ${fnName}: ${toolError.message}`
            );
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: String(result),
          });
        }
      }

      // Fallback nếu vượt quá số vòng lặp
      const fallback = 'Xin lỗi, tôi đã thử nhiều lần nhưng chưa thể hoàn thành. Hãy thử lại nhé!';
      this.memory.add({ role: 'assistant', content: fallback });
      return createErrorResponse(ErrorCodes.MAX_ROUNDS_EXCEEDED, fallback);

    } catch (err) {
      // Catch-all cho các lỗi không mong đợi
      console.error('[Agent] Unexpected error:', err.message);
      return createErrorResponse(ErrorCodes.AGENT_ERROR, `Lỗi không mong đợi: ${err.message}`);
    }
  }

  /**
   * Streaming version của chat().
   * Trả về async generator — mỗi yield là 1 token.
   * Tool calls được thực thi tự động, text được yield realtime.
   *
   * @param {string} userMessage - Tin nhắn từ người dùng
   * @yields {object} Stream event: { type: 'token'|'tool_call'|'tool_result'|'done'|'error', ... }
   */
  async *chatStream(userMessage) {
    // 1. Validate
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim() === '') {
      yield { type: 'error', error: { code: ErrorCodes.MISSING_MESSAGE, message: 'Tin nhắn không hợp lệ hoặc rỗng' } };
      return;
    }

    // 2. Add to memory + compaction
    this.memory.add({ role: 'user', content: userMessage });

    const compactionConfig = this.config.compaction || {};
    try {
      await compaction.runCompaction(
        this.memory, this.client, this.model,
        compactionConfig.threshold || 8,
        compactionConfig.keepRecent || 2
      );
    } catch (err) {
      console.error('[Agent] Compaction lỗi:', err.message);
    }

    // 3. Semantic search
    let relevantMemories = [];
    try {
      const queryVector = await semanticMemory.embedText(
        userMessage, this.client, this.embeddingConfig.model || 'text-embedding-3-small'
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
    const messages = [
      { role: 'system', content: systemPrompt },
      ...this.memory.getMessages(),
    ];

    const toolsUsed = [];

    // 4. ReAct loop with streaming
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

      // Accumulate streaming response
      let fullContent = '';
      let toolCalls = [];
      let currentToolCall = null;

      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          if (!delta) continue;

          // Accumulate text content
          if (delta.content) {
            fullContent += delta.content;
            yield { type: 'token', text: delta.content };
          }

          // Accumulate tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.index !== undefined) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = {
                    id: tc.id || '',
                    type: 'function',
                    function: { name: '', arguments: '' },
                  };
                }
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].function.name += tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
              }
            }
          }
        }
      } catch (streamError) {
        console.error('[Agent] Stream error:', streamError.message);
        yield { type: 'error', error: { code: ErrorCodes.LLM_ERROR, message: `Stream lỗi: ${streamError.message}` } };
        return;
      }

      // Build assistant message from accumulated data
      const assistantMsg = { role: 'assistant', content: fullContent || null };
      if (toolCalls.length > 0) {
        assistantMsg.tool_calls = toolCalls.filter(Boolean);
      }
      messages.push(assistantMsg);

      // No tool calls → final answer
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const reply = fullContent || '';
        this.memory.add({ role: 'assistant', content: reply });
        yield { type: 'done', reply, tools_used: toolsUsed };
        return;
      }

      // Execute tool calls
      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function.name;

        let fnArgs;
        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch (parseError) {
          yield { type: 'error', error: { code: ErrorCodes.TOOL_ERROR, message: `Lỗi parse arguments: ${parseError.message}` } };
          return;
        }

        yield { type: 'tool_call', name: fnName, args: fnArgs };

        let result;
        try {
          result = await executeTool(fnName, fnArgs);
          toolsUsed.push(fnName);
        } catch (toolError) {
          yield { type: 'error', error: { code: ErrorCodes.TOOL_ERROR, message: `Lỗi tool ${fnName}: ${toolError.message}` } };
          return;
        }

        yield { type: 'tool_result', name: fnName, result };

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: String(result),
        });
      }
    }

    // Max rounds exceeded
    const fallback = 'Xin lỗi, tôi đã thử nhiều lần nhưng chưa thể hoàn thành. Hãy thử lại nhé!';
    this.memory.add({ role: 'assistant', content: fallback });
    yield { type: 'error', error: { code: ErrorCodes.MAX_ROUNDS_EXCEEDED, message: fallback } };
  }
}

module.exports = Agent;
