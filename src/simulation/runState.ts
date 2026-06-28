import {
  createEmptyInventory,
  type ResourceInventory,
  type ResourceType,
} from './economy.ts';
import type { WorkerLoop, WorkerOrderAction, WorkerTaskState } from './workerLogistics.ts';

export type SimulationSpeed = 1 | 2 | 4 | 8;
export type PauseReason = 'player' | 'day-end' | null;

export type DaySummary = {
  day: number;
  discardedCargo: number;
  produced: number;
  staged: number;
  launchCapacity: number;
};

export type RunResult = {
  success: boolean;
  produced: number;
  staged: number;
  capacity: number;
  launched: number;
  wasted: number;
  grade: string;
  reaction: string;
  failureReason: string | null;
};

export type WorkerRunState = {
  id: string;
  cargo: ResourceType[];
  taskState: WorkerTaskState;
  orderAction: WorkerOrderAction | null;
  targetBuildingIndex: number | null;
  taskProgressSeconds: number;
  loop: WorkerLoop | null;
  pendingLoopSourceBuildingIndex: number | null;
  quarryFallback: 'ore' | 'stone';
};

export type BuildingRunState = {
  input: ResourceInventory;
  output: ResourceInventory;
  productionProgressSeconds: number;
  activeWorkers: number;
};

export type BoomtownRunState = {
  clock: {
    day: number;
    elapsedSimulationSeconds: number;
    clockMinutes: number;
    running: boolean;
    paused: boolean;
    pauseReason: PauseReason;
    returnStarted: boolean;
    speed: SimulationSpeed;
  };
  buildings: Map<number, BuildingRunState>;
  workers: WorkerRunState[];
  construction: {
    launchFieldProgress: ResourceInventory;
    launchFieldComplete: boolean;
    launchRackProgress: ResourceInventory;
    launchRacks: number;
  };
  fireworks: {
    produced: number;
    staged: number;
  };
  objective: {
    minimumLaunchableFireworks: number;
  };
  daySummaries: DaySummary[];
  result: RunResult | null;
};

export function createWorkerRunState(id: string): WorkerRunState {
  return {
    id,
    cargo: [],
    taskState: 'idle',
    orderAction: null,
    targetBuildingIndex: null,
    taskProgressSeconds: 0,
    loop: null,
    pendingLoopSourceBuildingIndex: null,
    quarryFallback: 'ore',
  };
}

export function createBuildingRunState(): BuildingRunState {
  return {
    input: createEmptyInventory(),
    output: createEmptyInventory(),
    productionProgressSeconds: 0,
    activeWorkers: 0,
  };
}

export function createBoomtownRunState(): BoomtownRunState {
  return {
    clock: {
      day: 1,
      elapsedSimulationSeconds: 0,
      clockMinutes: 0,
      running: false,
      paused: false,
      pauseReason: null,
      returnStarted: false,
      speed: 1,
    },
    buildings: new Map(),
    workers: [],
    construction: {
      launchFieldProgress: createEmptyInventory(),
      launchFieldComplete: false,
      launchRackProgress: createEmptyInventory(),
      launchRacks: 0,
    },
    fireworks: {
      produced: 0,
      staged: 0,
    },
    objective: {
      minimumLaunchableFireworks: 0,
    },
    daySummaries: [],
    result: null,
  };
}

export function resetBoomtownRunState(): BoomtownRunState {
  return createBoomtownRunState();
}

export function initializeRunBuildings(state: BoomtownRunState, buildingCount: number): void {
  state.buildings.clear();
  for (let index = 0; index < buildingCount; index += 1) {
    state.buildings.set(index, createBuildingRunState());
  }
}

export function getBuildingInventory(
  state: BoomtownRunState,
  buildingIndex: number,
  inventoryKind: 'input' | 'output',
): ResourceInventory {
  let building = state.buildings.get(buildingIndex);
  if (!building) {
    building = createBuildingRunState();
    state.buildings.set(buildingIndex, building);
  }
  return building[inventoryKind];
}

export function getWorkerCargoCount(worker: WorkerRunState, resource?: ResourceType): number {
  if (resource) {
    return worker.cargo.filter((cargoResource) => cargoResource === resource).length;
  }
  return worker.cargo.length;
}
