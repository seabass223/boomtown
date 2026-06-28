import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCrowdOverlaps } from '../src/simulation/crowdAvoidance.ts';

test('coincident workers receive deterministic separation', () => {
  const workers = [
    { id: 'worker-a', x: 0, z: 0 },
    { id: 'worker-b', x: 0, z: 0 },
  ];
  resolveCrowdOverlaps(workers, 0.3);
  assert.ok(Math.hypot(
    workers[1].x - workers[0].x,
    workers[1].z - workers[0].z,
  ) >= 0.299);

  const repeated = [
    { id: 'worker-a', x: 0, z: 0 },
    { id: 'worker-b', x: 0, z: 0 },
  ];
  resolveCrowdOverlaps(repeated, 0.3);
  assert.deepEqual(repeated, workers);
});

test('a crowded group resolves without overlapping neighbors', () => {
  const workers = Array.from({ length: 6 }, (_, index) => ({
    id: `worker-${index}`,
    x: (index % 2) * 0.02,
    z: Math.floor(index / 2) * 0.02,
  }));
  resolveCrowdOverlaps(workers, 0.28, 8);

  for (let first = 0; first < workers.length; first += 1) {
    for (let second = first + 1; second < workers.length; second += 1) {
      assert.ok(
        Math.hypot(
          workers[second].x - workers[first].x,
          workers[second].z - workers[first].z,
        ) >= 0.27,
      );
    }
  }
});
