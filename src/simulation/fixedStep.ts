export const SIMULATION_FIXED_STEP_SECONDS = 1 / 30;

export type FixedStepResult = {
  accumulatorSeconds: number;
  steps: number;
};

export function runFixedSimulationSteps(
  accumulatorSeconds: number,
  realDeltaSeconds: number,
  speed: 1 | 2 | 4 | 8,
  onStep: (stepSeconds: number) => void,
  fixedStepSeconds = SIMULATION_FIXED_STEP_SECONDS,
): FixedStepResult {
  let availableSeconds = accumulatorSeconds + Math.max(0, realDeltaSeconds) * speed;
  let steps = 0;

  while (availableSeconds + Number.EPSILON >= fixedStepSeconds) {
    onStep(fixedStepSeconds);
    availableSeconds -= fixedStepSeconds;
    steps += 1;
  }

  return {
    accumulatorSeconds: Math.max(0, availableSeconds),
    steps,
  };
}
