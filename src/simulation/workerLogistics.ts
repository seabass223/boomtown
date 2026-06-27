import type { PrefabBuildingKey } from '../scene/PrefabBuildings';
import {
  getAcceptedResources,
  getSourceResources,
  type ResourceType,
} from './economy.ts';

export type { ResourceType } from './economy.ts';

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

export function isResourceSource(key: PrefabBuildingKey): boolean {
  return getSourceResources(key).length > 0;
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

export function acceptsAnyCargo(key: PrefabBuildingKey, cargo: readonly ResourceType[]): boolean {
  const accepted = getAcceptedResources(key);
  return cargo.some((resource) => accepted.includes(resource));
}

export function canCreateLoop(sourceKey: PrefabBuildingKey, destinationKey: PrefabBuildingKey): boolean {
  const gatheredResource = getGatheredResource(sourceKey, destinationKey, 'ore');
  return gatheredResource !== null && getAcceptedResources(destinationKey).includes(gatheredResource);
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
