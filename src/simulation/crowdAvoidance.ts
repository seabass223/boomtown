export type CrowdAgent = {
  id: string;
  x: number;
  z: number;
};

function stableDirection(firstId: string, secondId: string): { x: number; z: number } {
  const text = `${firstId}:${secondId}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const angle = ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

export function resolveCrowdOverlaps(
  agents: CrowdAgent[],
  minimumSeparation: number,
  iterations = 3,
): void {
  const safeSeparation = Math.max(0, minimumSeparation);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let firstIndex = 0; firstIndex < agents.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < agents.length; secondIndex += 1) {
        const first = agents[firstIndex];
        const second = agents[secondIndex];
        let deltaX = second.x - first.x;
        let deltaZ = second.z - first.z;
        let distance = Math.hypot(deltaX, deltaZ);
        if (distance >= safeSeparation) {
          continue;
        }
        if (distance < 0.0001) {
          const direction = stableDirection(first.id, second.id);
          deltaX = direction.x;
          deltaZ = direction.z;
          distance = 1;
        }

        const correction = (safeSeparation - distance) * 0.5;
        const normalX = deltaX / distance;
        const normalZ = deltaZ / distance;
        first.x -= normalX * correction;
        first.z -= normalZ * correction;
        second.x += normalX * correction;
        second.z += normalZ * correction;
      }
    }
  }
}
