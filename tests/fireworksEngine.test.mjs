import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_FIREWORKS_SHOW_COUNT,
  createBurstDirections,
  createFireworksShowPlan,
} from '../src/simulation/fireworksEngine.ts';

test('fireworks plans are deterministic and never exceed launched inventory', () => {
  const first = createFireworksShowPlan(24, 40704);
  const second = createFireworksShowPlan(24, 40704);
  assert.deepEqual(first, second);
  assert.equal(first.launchedCount, 24);
  assert.equal(first.bursts.length, 24);
  assert.deepEqual(createBurstDirections(first.bursts[0]), createBurstDirections(second.bursts[0]));
});

test('small, medium, and maximum shows scale duration and density safely', () => {
  const small = createFireworksShowPlan(3, 1);
  const medium = createFireworksShowPlan(30, 1);
  const large = createFireworksShowPlan(10_000, 1);
  assert.ok(small.durationSeconds < medium.durationSeconds);
  assert.ok(medium.durationSeconds <= large.durationSeconds);
  assert.equal(large.launchedCount, MAX_FIREWORKS_SHOW_COUNT);
  assert.equal(large.bursts.length, MAX_FIREWORKS_SHOW_COUNT);
  assert.ok(large.bursts.every((burst) => burst.particleCount <= 48));
});
