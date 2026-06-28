import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deliverToLaunchField,
  updateFireworksFactory,
} from '../src/simulation/buildingProduction.ts';
import { createEmptyInventory } from '../src/simulation/economy.ts';
import { runScriptedFourDaySimulation } from '../src/simulation/headlessRun.ts';
import {
  createBuildingRunState,
  getBuildingInventory,
  initializeRunBuildings,
} from '../src/simulation/runState.ts';

function runSuccess(speed) {
  return runScriptedFourDaySimulation(speed, (state, day) => {
    if (day === 1) {
      initializeRunBuildings(state, 2);
      const launch = getBuildingInventory(state, 1, 'input');
      deliverToLaunchField(state, createEmptyInventory({ wood: 6, stone: 6 }), launch);
      deliverToLaunchField(state, createEmptyInventory({ wood: 6, stone: 4 }), launch);
    }
    if (day === 2) {
      const factory = createBuildingRunState();
      Object.assign(factory.input, { wood: 12, water: 12, ore: 12 });
      const produced = updateFireworksFactory(factory, 8, 6);
      state.fireworks.produced += produced;
      deliverToLaunchField(
        state,
        createEmptyInventory({ fireworks: factory.output.fireworks }),
        getBuildingInventory(state, 1, 'input'),
      );
    }
  });
}

test('scripted July 1-4 success is identical at every speed', () => {
  const results = [1, 2, 4, 8].map(runSuccess);
  results.forEach(({ state, mornings, cutoffs }) => {
    assert.equal(mornings, 4);
    assert.equal(cutoffs, 4);
    assert.equal(state.daySummaries.length, 4);
    assert.equal(state.clock.day, 4);
    assert.equal(state.clock.clockMinutes, 720);
    assert.equal(state.result.success, true);
    assert.equal(state.result.launched, 12);
  });
  assert.deepEqual(
    results.map(({ state }) => state.result),
    Array(4).fill(results[0].state.result),
  );
});

test('scripted four-day failure still reaches the deadline', () => {
  const { state, mornings, cutoffs } = runScriptedFourDaySimulation(8, () => {});
  assert.equal(mornings, 4);
  assert.equal(cutoffs, 4);
  assert.equal(state.clock.day, 4);
  assert.equal(state.result.success, false);
  assert.match(state.result.failureReason, /not completed/i);
});
