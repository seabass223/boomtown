import {
  ECONOMY_RECIPES,
  LAUNCH_RACK_SLOTS,
  RESOURCE_TYPES,
  addResource,
  applyRecipe,
  hasResources,
  removeResource,
  type ResourceAmounts,
  type ResourceInventory,
  type ResourceType,
} from './economy.ts';
import type { BoomtownRunState, BuildingRunState } from './runState.ts';

export type LaunchDeliveryResult = {
  transferred: ResourceAmounts;
  fieldCompleted: boolean;
  racksCompleted: number;
};

function requirementRemaining(
  progress: ResourceInventory,
  requirements: ResourceAmounts,
  resource: ResourceType,
): number {
  return Math.max(0, (requirements[resource] ?? 0) - progress[resource]);
}

export function getConstructionFraction(
  progress: ResourceInventory,
  requirements: ResourceAmounts,
): number {
  let delivered = 0;
  let required = 0;
  RESOURCE_TYPES.forEach((resource) => {
    const amount = requirements[resource] ?? 0;
    required += amount;
    delivered += Math.min(progress[resource], amount);
  });
  return required > 0 ? delivered / required : 1;
}

export function isConstructionComplete(
  progress: ResourceInventory,
  requirements: ResourceAmounts,
): boolean {
  return hasResources(progress, requirements);
}

function transferUpToRequirement(
  cargo: ResourceInventory,
  progress: ResourceInventory,
  requirements: ResourceAmounts,
  transferred: ResourceAmounts,
): void {
  RESOURCE_TYPES.forEach((resource) => {
    const amount = removeResource(
      cargo,
      resource,
      Math.min(cargo[resource], requirementRemaining(progress, requirements, resource)),
    );
    if (amount > 0) {
      addResource(progress, resource, amount);
      transferred[resource] = (transferred[resource] ?? 0) + amount;
    }
  });
}

export function deliverToLaunchField(
  state: BoomtownRunState,
  cargo: ResourceInventory,
  launchInventory: ResourceInventory,
): LaunchDeliveryResult {
  const transferred: ResourceAmounts = {};
  const result: LaunchDeliveryResult = {
    transferred,
    fieldCompleted: false,
    racksCompleted: 0,
  };

  if (!state.construction.launchFieldComplete) {
    transferUpToRequirement(
      cargo,
      state.construction.launchFieldProgress,
      ECONOMY_RECIPES['launch-field'].inputs,
      transferred,
    );
    if (
      isConstructionComplete(
        state.construction.launchFieldProgress,
        ECONOMY_RECIPES['launch-field'].inputs,
      )
    ) {
      state.construction.launchFieldComplete = true;
      result.fieldCompleted = true;
    }
  }

  if (!state.construction.launchFieldComplete) {
    return result;
  }

  const staged = removeResource(cargo, 'fireworks', cargo.fireworks);
  if (staged > 0) {
    addResource(launchInventory, 'fireworks', staged);
    transferred.fireworks = (transferred.fireworks ?? 0) + staged;
  }

  while (cargo.wood > 0 || cargo.stone > 0) {
    const before = cargo.wood + cargo.stone;
    transferUpToRequirement(
      cargo,
      state.construction.launchRackProgress,
      ECONOMY_RECIPES['launch-rack'].inputs,
      transferred,
    );
    if (
      isConstructionComplete(
        state.construction.launchRackProgress,
        ECONOMY_RECIPES['launch-rack'].inputs,
      )
    ) {
      RESOURCE_TYPES.forEach((resource) => {
        state.construction.launchRackProgress[resource] = 0;
      });
      state.construction.launchRacks += 1;
      result.racksCompleted += 1;
      continue;
    }
    if (cargo.wood + cargo.stone === before) {
      break;
    }
  }

  state.fireworks.staged = launchInventory.fireworks;
  return result;
}

export function updateFireworksFactory(
  building: BuildingRunState,
  deltaSeconds: number,
  activeWorkers: number,
): number {
  building.activeWorkers = Math.max(0, Math.floor(activeWorkers));
  if (
    building.activeWorkers === 0 ||
    !hasResources(building.input, ECONOMY_RECIPES.fireworks.inputs)
  ) {
    return 0;
  }

  building.productionProgressSeconds += Math.max(0, deltaSeconds) * building.activeWorkers;
  let produced = 0;
  while (
    building.productionProgressSeconds >= ECONOMY_RECIPES.fireworks.durationSeconds &&
    hasResources(building.input, ECONOMY_RECIPES.fireworks.inputs)
  ) {
    applyRecipe(building.input, building.output, ECONOMY_RECIPES.fireworks);
    building.productionProgressSeconds -= ECONOMY_RECIPES.fireworks.durationSeconds;
    produced += ECONOMY_RECIPES.fireworks.outputs.fireworks ?? 0;
  }
  return produced;
}

export function getLaunchCapacity(state: BoomtownRunState): number {
  return state.construction.launchRacks * LAUNCH_RACK_SLOTS;
}

export function getLaunchableFireworks(state: BoomtownRunState): number {
  return Math.min(state.fireworks.staged, getLaunchCapacity(state));
}
