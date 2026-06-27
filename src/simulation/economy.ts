import type { PrefabBuildingKey } from '../scene/PrefabBuildings';

export const RESOURCE_TYPES = ['wood', 'water', 'ore', 'stone', 'fireworks'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export type ResourceInventory = Record<ResourceType, number>;
export type ResourceAmounts = Partial<ResourceInventory>;

export type EconomyRecipe = {
  id: 'fireworks' | 'launch-field' | 'launch-rack';
  inputs: ResourceAmounts;
  outputs: ResourceAmounts;
  durationSeconds: number;
};

export type BuildingEconomyDefinition = {
  accepts: readonly ResourceType[];
  sourceOutputs: readonly ResourceType[];
};

export const ECONOMY_RECIPES: Record<EconomyRecipe['id'], EconomyRecipe> = {
  fireworks: {
    id: 'fireworks',
    inputs: { wood: 1, water: 1, ore: 1 },
    outputs: { fireworks: 1 },
    durationSeconds: 4,
  },
  'launch-field': {
    id: 'launch-field',
    inputs: { wood: 1, stone: 1 },
    outputs: {},
    durationSeconds: 1,
  },
  'launch-rack': {
    id: 'launch-rack',
    inputs: { wood: 1, stone: 1 },
    outputs: {},
    durationSeconds: 1,
  },
};

export const BUILDING_ECONOMY: Record<PrefabBuildingKey, BuildingEconomyDefinition> = {
  waterTower: { accepts: [], sourceOutputs: ['water'] },
  lumberMill: { accepts: [], sourceOutputs: ['wood'] },
  launchPad: { accepts: ['wood', 'stone', 'fireworks'], sourceOutputs: [] },
  house: { accepts: [], sourceOutputs: [] },
  fireworksFactory: { accepts: ['wood', 'water', 'ore'], sourceOutputs: ['fireworks'] },
  quarry: { accepts: [], sourceOutputs: ['ore', 'stone'] },
  plaza: { accepts: [], sourceOutputs: [] },
};

export function createEmptyInventory(initial: ResourceAmounts = {}): ResourceInventory {
  return {
    wood: Math.max(0, initial.wood ?? 0),
    water: Math.max(0, initial.water ?? 0),
    ore: Math.max(0, initial.ore ?? 0),
    stone: Math.max(0, initial.stone ?? 0),
    fireworks: Math.max(0, initial.fireworks ?? 0),
  };
}

export function inventoryTotal(inventory: ResourceInventory): number {
  return RESOURCE_TYPES.reduce((total, resource) => total + inventory[resource], 0);
}

export function addResource(inventory: ResourceInventory, resource: ResourceType, amount: number): number {
  const safeAmount = Math.max(0, Math.floor(amount));
  inventory[resource] += safeAmount;
  return safeAmount;
}

export function removeResource(inventory: ResourceInventory, resource: ResourceType, amount: number): number {
  const removed = Math.min(inventory[resource], Math.max(0, Math.floor(amount)));
  inventory[resource] -= removed;
  return removed;
}

export function hasResources(inventory: ResourceInventory, amounts: ResourceAmounts): boolean {
  return RESOURCE_TYPES.every((resource) => inventory[resource] >= (amounts[resource] ?? 0));
}

export function applyRecipe(
  inputInventory: ResourceInventory,
  outputInventory: ResourceInventory,
  recipe: EconomyRecipe,
): boolean {
  if (!hasResources(inputInventory, recipe.inputs)) {
    return false;
  }

  RESOURCE_TYPES.forEach((resource) => {
    removeResource(inputInventory, resource, recipe.inputs[resource] ?? 0);
    addResource(outputInventory, resource, recipe.outputs[resource] ?? 0);
  });
  return true;
}

export function getAcceptedResources(key: PrefabBuildingKey): readonly ResourceType[] {
  return BUILDING_ECONOMY[key].accepts;
}

export function getSourceResources(key: PrefabBuildingKey): readonly ResourceType[] {
  return BUILDING_ECONOMY[key].sourceOutputs;
}

export function transferAcceptedResources(
  source: ResourceInventory,
  destination: ResourceInventory,
  accepted: readonly ResourceType[],
  limit = Number.POSITIVE_INFINITY,
): ResourceAmounts {
  const transferred: ResourceAmounts = {};
  let remainingCapacity = Math.max(0, limit);

  for (const resource of RESOURCE_TYPES) {
    if (!accepted.includes(resource) || remainingCapacity <= 0) {
      continue;
    }
    const amount = removeResource(source, resource, Math.min(source[resource], remainingCapacity));
    if (amount > 0) {
      addResource(destination, resource, amount);
      transferred[resource] = amount;
      remainingCapacity -= amount;
    }
  }
  return transferred;
}

export function inventoryToResourceList(inventory: ResourceInventory): ResourceType[] {
  return RESOURCE_TYPES.flatMap((resource) =>
    Array.from({ length: inventory[resource] }, () => resource),
  );
}

export function resourceListToInventory(resources: readonly ResourceType[]): ResourceInventory {
  const inventory = createEmptyInventory();
  resources.forEach((resource) => addResource(inventory, resource, 1));
  return inventory;
}
