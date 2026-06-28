import test from 'node:test';
import assert from 'node:assert/strict';

import { GAME_RULES, getFullRunRealtimeMinutes } from '../src/simulation/gameRules.ts';
import { resolveRunResult } from '../src/simulation/scoring.ts';
import { createBoomtownRunState } from '../src/simulation/runState.ts';

function finalState({ fieldComplete = true, produced = 0, staged = 0, racks = 0 } = {}) {
  const state = createBoomtownRunState();
  state.objective.minimumLaunchableFireworks =
    GAME_RULES.objective.minimumLaunchableFireworks;
  state.construction.launchFieldComplete = fieldComplete;
  state.construction.launchRacks = racks;
  state.fireworks.produced = produced;
  state.fireworks.staged = staged;
  return state;
}

test('an incomplete field fails even with staged fireworks and rack capacity', () => {
  const result = resolveRunResult(finalState({
    fieldComplete: false,
    produced: 24,
    staged: 24,
    racks: 4,
  }));
  assert.equal(result.success, false);
  assert.equal(result.grade, 'No Show');
  assert.match(result.failureReason, /not completed/i);
});

test('launchable fireworks are capped by racks and minimum determines success', () => {
  const failure = resolveRunResult(finalState({ produced: 20, staged: 20, racks: 1 }));
  assert.equal(failure.launched, 6);
  assert.equal(failure.wasted, 14);
  assert.equal(failure.success, false);

  const success = resolveRunResult(finalState({ produced: 16, staged: 15, racks: 2 }));
  assert.equal(success.launched, 12);
  assert.equal(success.success, true);
  assert.equal(success.grade, 'C');
});

test('higher launchable totals earn deterministic higher show grades', () => {
  const state = finalState({ produced: 42, staged: 40, racks: 6 });
  const first = resolveRunResult(state);
  const second = resolveRunResult(state);
  assert.deepEqual(first, second);
  assert.equal(first.launched, 36);
  assert.equal(first.grade, 'S');
});

test('documented displayed-speed run durations reflect the doubled baseline', () => {
  assert.deepEqual(
    [1, 2, 4, 8].map((speed) => getFullRunRealtimeMinutes(speed)),
    [8, 4, 2, 1],
  );
});
