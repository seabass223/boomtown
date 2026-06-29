export const MAX_FIREWORKS_SHOW_COUNT = 120;

export type FireworkPattern = 'ring' | 'chrysanthemum' | 'willow' | 'star';

export type FireworkBurstPlan = {
  index: number;
  launchAtSeconds: number;
  x: number;
  y: number;
  z: number;
  color: number;
  size: number;
  pattern: FireworkPattern;
  particleCount: number;
  lifetimeSeconds: number;
};

export type FireworksShowPlan = {
  seed: number;
  launchedCount: number;
  durationSeconds: number;
  bursts: FireworkBurstPlan[];
};

function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function createFireworksShowPlan(
  launchableCount: number,
  seed: number,
): FireworksShowPlan {
  const launchedCount = Math.min(
    MAX_FIREWORKS_SHOW_COUNT,
    Math.max(0, Math.floor(launchableCount)),
  );
  const random = createRandom(seed);
  const durationSeconds = launchedCount === 0
    ? 2
    : Math.min(28, 5 + launchedCount * 0.32);
  const colors = [0xffd166, 0xef476f, 0x67d8ff, 0xffffff, 0x9b7bff, 0x71e39a];
  const patterns: FireworkPattern[] = ['ring', 'chrysanthemum', 'willow', 'star'];
  const bursts = Array.from({ length: launchedCount }, (_, index): FireworkBurstPlan => {
    const progress = launchedCount <= 1 ? 0.45 : index / (launchedCount - 1);
    return {
      index,
      launchAtSeconds: 0.7 + progress * Math.max(0.5, durationSeconds - 3) + random() * 0.32,
      x: (random() - 0.5) * 9.5,
      y: 4 + random() * 4.8,
      z: (random() - 0.5) * 3.6,
      color: colors[Math.floor(random() * colors.length)],
      size: 0.95 + random() * 1.15,
      pattern: patterns[Math.floor(random() * patterns.length)],
      particleCount: 34 + Math.floor(random() * 32),
      lifetimeSeconds: 1.45 + random() * 1.05,
    };
  });
  return { seed, launchedCount, durationSeconds, bursts };
}

export function createBurstDirections(burst: FireworkBurstPlan): Array<[number, number, number]> {
  const random = createRandom(burst.index * 8191 + burst.particleCount * 131 + burst.color);
  return Array.from({ length: burst.particleCount }, (_, index) => {
    const angle = (index / burst.particleCount) * Math.PI * 2;
    const elevation = burst.pattern === 'ring'
      ? (random() - 0.5) * 0.18
      : (random() - 0.32) * Math.PI * 0.72;
    const radial = burst.pattern === 'star'
      ? (index % 2 === 0 ? 1 : 0.48)
      : 0.72 + random() * 0.38;
    const horizontal = Math.cos(elevation) * radial;
    const fall = burst.pattern === 'willow' ? -0.2 : 0;
    return [
      Math.cos(angle) * horizontal,
      Math.sin(elevation) * radial + fall,
      Math.sin(angle) * horizontal,
    ];
  });
}
