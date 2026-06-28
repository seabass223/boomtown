import { getLaunchCapacity, getLaunchableFireworks } from './buildingProduction.ts';
import { GAME_RULES } from './gameRules.ts';
import type { BoomtownRunState, RunResult } from './runState.ts';

export function resolveRunResult(state: BoomtownRunState): RunResult {
  const capacity = getLaunchCapacity(state);
  const launched = getLaunchableFireworks(state);
  const minimum = state.objective.minimumLaunchableFireworks;
  const fieldComplete = state.construction.launchFieldComplete;
  const success = fieldComplete && launched >= minimum;
  const gradeRule = GAME_RULES.scoring.grades.find(
    (candidate) => launched >= candidate.minimumLaunched,
  );

  const failureReason = !fieldComplete
    ? 'The Launch Field was not completed.'
    : launched < minimum
      ? `Only ${launched} of the required ${minimum} fireworks could launch.`
      : null;

  return {
    success,
    produced: state.fireworks.produced,
    staged: state.fireworks.staged,
    capacity,
    launched,
    wasted: Math.max(0, state.fireworks.produced - launched),
    grade: success ? gradeRule?.grade ?? 'C' : 'No Show',
    reaction: success
      ? gradeRule?.reaction ?? 'The town enjoys its Independence Day celebration.'
      : failureReason ?? 'The town waits for next year.',
    failureReason,
  };
}
