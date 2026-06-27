import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ECONOMY_RECIPES,
  RESOURCE_TYPES,
  applyRecipe,
  createEmptyInventory,
  getAcceptedResources,
  inventoryTotal,
  transferAcceptedResources,
} from '../src/simulation/economy.ts';
import {
  SIMULATION_FIXED_STEP_SECONDS,
  runFixedSimulationSteps,
} from '../src/simulation/fixedStep.ts';
import {
  createWorkerRunState,
  getBuildingInventory,
  initializeRunBuildings,
  resetBoomtownRunState,
} from '../src/simulation/runState.ts';

test('defines the complete v1 resource set and central recipes', () => {
  assert.deepEqual(RESOURCE_TYPES, ['wood', 'water', 'ore', 'stone', 'fireworks']);
  assert.deepEqual(ECONOMY_RECIPES.fireworks.inputs, { wood: 1, water: 1, ore: 1 });
  assert.deepEqual(ECONOMY_RECIPES.fireworks.outputs, { fireworks: 1 });
  assert.deepEqual(ECONOMY_RECIPES['launch-field'].inputs, { wood: 1, stone: 1 });
  assert.deepEqual(ECONOMY_RECIPES['launch-rack'].inputs, { wood: 1, stone: 1 });
  assert.deepEqual(getAcceptedResources('fireworksFactory'), ['wood', 'water', 'ore']);
  assert.deepEqual(getAcceptedResources('launchPad'), ['wood', 'stone', 'fireworks']);
});

test('transfers only accepted resources without loss, duplication, or negatives', () => {
  const worker = createEmptyInventory({ wood: 1, water: 1, stone: 1 });
  const factory = createEmptyInventory();
  const transferred = transferAcceptedResources(
    worker,
    factory,
    getAcceptedResources('fireworksFactory'),
  );

  assert.deepEqual(transferred, { wood: 1, water: 1 });
  assert.deepEqual(worker, createEmptyInventory({ stone: 1 }));
  assert.deepEqual(factory, createEmptyInventory({ wood: 1, water: 1 }));
  assert.equal(inventoryTotal(worker) + inventoryTotal(factory), 3);
});

function runGatherDeliverProduceScenario(speed) {
  const worker = createEmptyInventory();
  const factoryInput = createEmptyInventory();
  const factoryOutput = createEmptyInventory();
  const gatherOrder = ['wood', 'water', 'ore'];
  let gatherProgress = 0;
  let productionProgress = 0;
  let nextGatherIndex = 0;
  let accumulator = 0;
  const realFrameSeconds = 1 / 60;
  const targetSimulationSeconds = 8;
  const frames = Math.round(targetSimulationSeconds / speed / realFrameSeconds);

  for (let frame = 0; frame < frames; frame += 1) {
    const result = runFixedSimulationSteps(
      accumulator,
      realFrameSeconds,
      speed,
      (stepSeconds) => {
        if (nextGatherIndex < gatherOrder.length) {
          gatherProgress += stepSeconds;
          if (gatherProgress + Number.EPSILON >= 1) {
            worker[gatherOrder[nextGatherIndex]] += 1;
            nextGatherIndex += 1;
            gatherProgress -= 1;
          }
        } else if (inventoryTotal(worker) > 0) {
          transferAcceptedResources(
            worker,
            factoryInput,
            getAcceptedResources('fireworksFactory'),
          );
        } else if (factoryOutput.fireworks === 0) {
          productionProgress += stepSeconds;
          if (
            productionProgress + Number.EPSILON >= ECONOMY_RECIPES.fireworks.durationSeconds
          ) {
            applyRecipe(factoryInput, factoryOutput, ECONOMY_RECIPES.fireworks);
          }
        }
      },
    );
    accumulator = result.accumulatorSeconds;
  }

  return { worker, factoryInput, factoryOutput };
}

test('gather, deliver, and production results match at every simulation speed', () => {
  const baseline = runGatherDeliverProduceScenario(1);
  for (const speed of [2, 4, 8]) {
    assert.deepEqual(runGatherDeliverProduceScenario(speed), baseline);
  }
  assert.deepEqual(baseline.factoryOutput, createEmptyInventory({ fireworks: 1 }));
});

test('large frame deltas are consumed as fixed steps without skipping time', () => {
  let elapsed = 0;
  const result = runFixedSimulationSteps(0, 2, 8, (stepSeconds) => {
    elapsed += stepSeconds;
  });
  assert.equal(result.steps, 480);
  assert.ok(Math.abs(elapsed - 16) < SIMULATION_FIXED_STEP_SECONDS);
  assert.ok(result.accumulatorSeconds < SIMULATION_FIXED_STEP_SECONDS);
});

test('reset creates a clean run after every mutable subsystem has changed', () => {
  const dirty = resetBoomtownRunState();
  dirty.clock.day = 4;
  dirty.clock.elapsedSimulationSeconds = 100;
  dirty.clock.running = true;
  dirty.clock.speed = 8;
  initializeRunBuildings(dirty, 2);
  getBuildingInventory(dirty, 0, 'input').wood = 12;
  const worker = createWorkerRunState('worker-1');
  worker.cargo.push('ore');
  worker.taskState = 'gathering';
  dirty.workers.push(worker);
  dirty.construction.launchFieldProgress.stone = 4;
  dirty.construction.launchRacks = 2;
  dirty.fireworks.produced = 8;
  dirty.fireworks.staged = 6;
  dirty.objective.minimumLaunchableFireworks = 5;
  dirty.result = { success: true, launchableFireworks: 6 };

  const restarted = resetBoomtownRunState();
  assert.deepEqual(restarted, resetBoomtownRunState());
  assert.equal(restarted.workers.length, 0);
  assert.equal(restarted.buildings.size, 0);
});
