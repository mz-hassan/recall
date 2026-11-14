import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexingErrorMessage } from './errors.js';
test('older saved schema failures show a readable relationship error instead of validator JSON', () => {
  const error = JSON.stringify([{ code: 'invalid_value', values: ['uses'], path: ['edges', 1, 'relation'], message: 'Invalid option' }]);
  assert.match(indexingErrorMessage(error), /unsupported relationship type/);
  assert.ok(!indexingErrorMessage(error).includes('invalid_value'));
  assert.equal(indexingErrorMessage('DeepSeek request failed (401).'), 'DeepSeek request failed (401).');
});
