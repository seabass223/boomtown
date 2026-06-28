export const GAME_RULES = {
  schedule: {
    finalDay: 4,
    workdayMinutes: 12 * 60,
    returnMinute: 11 * 60 + 50,
    clockStepMinutes: 10,
    simulationMinutesPerRealSecond: 3,
    baselineRealtimeMultiplier: 2,
  },
  workers: {
    gatherSeconds: 1.4,
    cargoCapacity: 3,
  },
  objective: {
    minimumLaunchableFireworks: 12,
  },
  scoring: {
    grades: [
      { minimumLaunched: 36, grade: 'S', reaction: 'The town will talk about this show for years!' },
      { minimumLaunched: 24, grade: 'A', reaction: 'The crowd is dazzled by a spectacular finale!' },
      { minimumLaunched: 18, grade: 'B', reaction: 'The town cheers a bright, memorable celebration.' },
      { minimumLaunched: 12, grade: 'C', reaction: 'A scrappy hometown show wins plenty of smiles.' },
    ],
  },
} as const;

export function getFullRunRealtimeMinutes(speed: 1 | 2 | 4 | 8): number {
  const simulationMinutes =
    GAME_RULES.schedule.workdayMinutes * GAME_RULES.schedule.finalDay;
  return simulationMinutes /
    GAME_RULES.schedule.simulationMinutesPerRealSecond /
    GAME_RULES.schedule.baselineRealtimeMultiplier /
    speed /
    60;
}
