import { getConstructionFraction, getLaunchCapacity } from './buildingProduction.ts';
import { ECONOMY_RECIPES, createEmptyInventory } from './economy.ts';
import { runFixedSimulationSteps } from './fixedStep.ts';
import { GAME_RULES } from './gameRules.ts';
import {
  createBoomtownRunState,
  createWorkerRunState,
  type BoomtownRunState,
  type SimulationSpeed,
} from './runState.ts';
import { resolveRunResult } from './scoring.ts';

export type ScriptedRunResult = {
  state: BoomtownRunState;
  mornings: number;
  cutoffs: number;
};

export function runScriptedFourDaySimulation(
  speed: SimulationSpeed,
  onMorning: (state: BoomtownRunState, day: number) => void,
): ScriptedRunResult {
  const state = createBoomtownRunState();
  state.clock.running = true;
  state.clock.speed = speed;
  state.objective.minimumLaunchableFireworks =
    GAME_RULES.objective.minimumLaunchableFireworks;
  let mornings = 0;
  let cutoffs = 0;

  for (let day = 1; day <= GAME_RULES.schedule.finalDay; day += 1) {
    state.clock.day = day;
    state.clock.clockMinutes = 0;
    state.clock.returnStarted = false;
    state.workers = Array.from({ length: 8 }, (_, index) =>
      createWorkerRunState(`day-${day}-worker-${index}`));
    mornings += 1;
    onMorning(state, day);

    let accumulator = 0;
    let elapsedSimulationSeconds = 0;
    while (
      elapsedSimulationSeconds * GAME_RULES.schedule.simulationMinutesPerRealSecond <
      GAME_RULES.schedule.workdayMinutes
    ) {
      const result = runFixedSimulationSteps(
        accumulator,
        1 / 30,
        speed,
        (stepSeconds) => {
          elapsedSimulationSeconds += stepSeconds;
          const minute =
            elapsedSimulationSeconds * GAME_RULES.schedule.simulationMinutesPerRealSecond;
          if (!state.clock.returnStarted && minute >= GAME_RULES.schedule.returnMinute) {
            state.clock.returnStarted = true;
            cutoffs += 1;
            state.workers.forEach((worker) => {
              worker.cargo = [];
              worker.loop = null;
              worker.orderAction = 'return-home';
              worker.taskState = 'returning-home';
            });
          }
        },
      );
      accumulator = result.accumulatorSeconds;
    }
    state.clock.clockMinutes = GAME_RULES.schedule.workdayMinutes;
    state.daySummaries.push({
      day,
      discardedCargo: 0,
      gathered: createEmptyInventory(),
      delivered: createEmptyInventory(),
      produced: state.daily.produced,
      staged: state.fireworks.staged,
      launchCapacity: getLaunchCapacity(state),
      launchFieldProgress: getConstructionFraction(
        state.construction.launchFieldProgress,
        ECONOMY_RECIPES['launch-field'].inputs,
      ),
      launchRacks: state.construction.launchRacks,
    });
  }

  state.result = resolveRunResult(state);
  return { state, mornings, cutoffs };
}
