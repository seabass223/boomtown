import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deliverToLaunchField,
  getConstructionFraction,
  getLaunchCapacity,
  getLaunchableFireworks,
  updateFireworksFactory,
} from '../src/simulation/buildingProduction.ts';
import {
  ECONOMY_RECIPES,
  createEmptyInventory,
} from '../src/simulation/economy.ts';
import {
  createBoomtownRunState,
  createBuildingRunState,
} from '../src/simulation/runState.ts';

test('factory pauses without inputs and scales throughput with assigned workers', () => {
  const factory = createBuildingRunState();
  factory.productionProgressSeconds = 1;
  assert.equal(updateFireworksFactory(factory, 10, 2), 0);
  assert.equal(factory.productionProgressSeconds, 1);

  Object.assign(factory.input, { wood: 3, water: 3, ore: 3 });
  assert.equal(updateFireworksFactory(factory, 2, 2), 1);
  assert.deepEqual(factory.output, createEmptyInventory({ fireworks: 1 }));
  assert.deepEqual(factory.input, createEmptyInventory({ wood: 2, water: 2, ore: 2 }));
  assert.equal(factory.productionProgressSeconds, 1);
});

test('launch field rejects invalid cargo until construction is complete', () => {
  const state = createBoomtownRunState();
  const launchInventory = createEmptyInventory();
  const firstCargo = createEmptyInventory({ wood: 6, water: 2, fireworks: 1 });
  const first = deliverToLaunchField(state, firstCargo, launchInventory);

  assert.equal(first.fieldCompleted, false);
  assert.equal(firstCargo.water, 2);
  assert.equal(firstCargo.fireworks, 1);
  assert.equal(getConstructionFraction(
    state.construction.launchFieldProgress,
    ECONOMY_RECIPES['launch-field'].inputs,
  ), 0.5);

  const secondCargo = createEmptyInventory({ stone: 6 });
  const second = deliverToLaunchField(state, secondCargo, launchInventory);
  assert.equal(second.fieldCompleted, true);
  assert.equal(state.construction.launchFieldComplete, true);
});

test('completed launch field builds repeatable racks and stages launchable fireworks', () => {
  const state = createBoomtownRunState();
  state.construction.launchFieldComplete = true;
  const launchInventory = createEmptyInventory();

  deliverToLaunchField(
    state,
    createEmptyInventory({ wood: 3, stone: 1 }),
    launchInventory,
  );
  assert.equal(state.construction.launchRacks, 0);
  assert.deepEqual(
    state.construction.launchRackProgress,
    createEmptyInventory({ wood: 3, stone: 1 }),
  );

  const result = deliverToLaunchField(
    state,
    createEmptyInventory({ stone: 1, fireworks: 9 }),
    launchInventory,
  );
  assert.equal(result.racksCompleted, 1);
  assert.equal(state.construction.launchRacks, 1);
  assert.equal(state.fireworks.staged, 9);
  assert.equal(getLaunchCapacity(state), 6);
  assert.equal(getLaunchableFireworks(state), 6);
});
