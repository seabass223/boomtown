import type { PrefabBuildingKey } from '../scene/PrefabBuildings';

export type ResourceType = 'wood' | 'water' | 'ore' | 'stone' | 'fireworks';

export type WorkerTaskState =
  | 'idle'
  | 'traveling'
  | 'gathering'
  | 'delivering'
  | 'producing-building'
  | 'returning-home';

export type WorkerLoop = {
  sourceBuildingIndex: number;
  destinationBuildingIndex: number;
};

export type WorkerOrderAction = 'gather' | 'deliver' | 'return-home';

export const WORKER_CARGO_CAPACITY = 3;

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  wood: 'wood',
  water: 'water',
  ore: 'ore',
  stone: 'stone',
  fireworks: 'fireworks',
};

const BUILDING_ACCEPTS: Partial<Record<PrefabBuildingKey, readonly ResourceType[]>> = {
  fireworksFactory: ['wood', 'water', 'ore'],
  launchPad: ['wood', 'stone', 'fireworks'],
};

export function isResourceSource(key: PrefabBuildingKey): boolean {
  return key === 'lumberMill' || key === 'waterTower' || key === 'quarry' || key === 'fireworksFactory';
}

export function getGatheredResource(
  sourceKey: PrefabBuildingKey,
  destinationKey: PrefabBuildingKey | null,
  quarryFallback: 'ore' | 'stone',
): ResourceType | null {
  switch (sourceKey) {
    case 'lumberMill':
      return 'wood';
    case 'waterTower':
      return 'water';
    case 'fireworksFactory':
      return 'fireworks';
    case 'quarry':
      if (destinationKey === 'fireworksFactory') {
        return 'ore';
      }
      if (destinationKey === 'launchPad') {
        return 'stone';
      }
      return quarryFallback;
    default:
      return null;
  }
}

export function getAcceptedResources(key: PrefabBuildingKey): readonly ResourceType[] {
  return BUILDING_ACCEPTS[key] ?? [];
}

export function acceptsAnyCargo(key: PrefabBuildingKey, cargo: readonly ResourceType[]): boolean {
  const accepted = getAcceptedResources(key);
  return cargo.some((resource) => accepted.includes(resource));
}

export function canCreateLoop(sourceKey: PrefabBuildingKey, destinationKey: PrefabBuildingKey): boolean {
  const gatheredResource = getGatheredResource(sourceKey, destinationKey, 'ore');
  return gatheredResource !== null && getAcceptedResources(destinationKey).includes(gatheredResource);
}

export function transferAcceptedCargo(
  cargo: readonly ResourceType[],
  destinationKey: PrefabBuildingKey,
): { remaining: ResourceType[]; transferred: ResourceType[] } {
  const accepted = getAcceptedResources(destinationKey);
  const remaining: ResourceType[] = [];
  const transferred: ResourceType[] = [];

  cargo.forEach((resource) => {
    if (accepted.includes(resource)) {
      transferred.push(resource);
    } else {
      remaining.push(resource);
    }
  });

  return { remaining, transferred };
}

export function summarizeResources(resources: readonly ResourceType[]): string {
  if (resources.length === 0) {
    return 'empty';
  }

  const counts = new Map<ResourceType, number>();
  resources.forEach((resource) => counts.set(resource, (counts.get(resource) ?? 0) + 1));
  return [...counts.entries()]
    .map(([resource, count]) => `${count} ${RESOURCE_LABELS[resource]}`)
    .join(', ');
}
