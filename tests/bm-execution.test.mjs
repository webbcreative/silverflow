import test from 'node:test';
import assert from 'node:assert/strict';
import { executionCopy, fillGapPct } from '../src/bm-execution.js';

test('fill gap measures list target relative to current top buy', () => {
  assert.equal(fillGapPct(25_000, 32_000), 0.28);
  assert.equal(fillGapPct(32_000, 32_000), 0);
  assert.equal(fillGapPct(0, 32_000), null);
});

test('execution wording distinguishes conditional list fills from top-quote sell now', () => {
  const listed = executionCopy('order');
  const instant = executionCopy('instant');
  assert.match(listed.netLabel, /if filled/i);
  assert.match(listed.profitLabel, /fully filled/i);
  assert.match(instant.netLabel, /top quote/i);
  assert.match(instant.scannerNote, /order-book depth/i);
});
