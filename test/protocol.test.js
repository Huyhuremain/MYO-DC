const test = require('node:test');
const assert = require('node:assert/strict');

const { createSuccessResponse, createErrorResponse } = require('../src/protocol/types');
const { ErrorCodes } = require('../src/protocol/errors');

test('createSuccessResponse returns standard success format', () => {
  assert.deepEqual(createSuccessResponse('ok', ['calculator']), {
    status: 'success',
    data: {
      reply_text: 'ok',
      tools_used: ['calculator'],
    },
  });
});

test('createErrorResponse returns standard error format', () => {
  assert.deepEqual(createErrorResponse(ErrorCodes.LLM_ERROR, 'failed'), {
    status: 'error',
    error: {
      code: ErrorCodes.LLM_ERROR,
      message: 'failed',
    },
  });
});
