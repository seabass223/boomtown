import * as THREE from 'three';
import {
  GroundPathSegment,
  TerrainBounds,
  applyPlanarTerrainUvs,
  createGroundMaterial,
} from './GroundTexture';
import { box, cylinder } from './helpers';
import { mat, materials } from './materials';

const landHeight = 0.52;
const cliffBottom = -0.48;
const waterHeight = -0.9;

const baseIslandPoints: Array<readonly [number, number]> = [
  [-13.5, -8.5],
  [-11, -10.5],
  [-5, -11.2],
  [1, -10.4],
  [7.8, -10.7],
  [13.2, -8.2],
  [14.4, -3.8],
  [13.4, 2.8],
  [11.3, 7.7],
  [6.2, 9.7],
  [0.4, 10.5],
  [-6.8, 9.2],
  [-12.5, 6.2],
  [-14.5, 1.1],
  [-14, -4.9],
];

const islandPoints = createJaggedIslandPoints(baseIslandPoints);

const pathSegments: GroundPathSegment[] = [
  [0, 0, 15, 0.82, 0],
  [-5.2, 1.4, 7.6, 0.75, -0.55],
  [5.8, 2.1, 9.2, 0.74, 0.58],
  [-6.1, -3.8, 8.5, 0.72, 0.34],
  [5.4, -4.2, 8.2, 0.72, -0.42],
  [-2.5, 5.3, 7.3, 0.65, 0.9],
  [2.8, 5.5, 8.3, 0.65, -0.65],
];

const islandBounds = boundsFromPoints(islandPoints);

export class TerrainBuilder {
  public build(): THREE.Group {
    const terrain = new THREE.Group();
    terrain.name = 'Terrain';

    terrain.add(this.createWater());
    terrain.add(this.createIsland());
    terrain.add(this.createTownSquare());

    return terrain;
  }

  private createWater(): THREE.Mesh {
    const water = new THREE.Mesh(new THREE.BoxGeometry(48, 0.28, 38), materials.waterDeep);
    water.position.y = waterHeight;
    water.receiveShadow = true;
    return water;
  }

  private createIsland(): THREE.Group {
    const island = new THREE.Group();
    const shape = createIslandShape();

    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    applyPlanarTerrainUvs(geometry, islandBounds);

    const groundMaterial = createGroundMaterial(islandBounds, pathSegments);
    const mesh = new THREE.Mesh(geometry, groundMaterial);
    mesh.position.y = landHeight;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    island.add(mesh);

    island.add(this.createCliffWalls());
    island.add(this.createCliffFooting());

    return island;
  }

  private createCliffWalls(): THREE.Group {
    const cliffs = new THREE.Group();
    cliffs.name = 'Blocky Cliff Walls';

    const wallMaterials = [
      mat(0xd9b36f, 0.86),
      mat(0xc99d5d, 0.88),
      mat(0xe0bf7c, 0.84),
      mat(0xb98d56, 0.9),
    ];
    const seamMaterial = mat(0x9d7448, 0.92);
    const waterlineMaterial = mat(0x8d7658, 0.9);
    const center = islandCenter(islandPoints);

    islandPoints.forEach((start, index) => {
      const end = islandPoints[(index + 1) % islandPoints.length];
      const edge = new THREE.Vector2(end[0] - start[0], end[1] - start[1]);
      const length = edge.length();
      const chunks = Math.max(1, Math.ceil(length / 1.35));

      for (let chunk = 0; chunk < chunks; chunk += 1) {
        const t0 = chunk / chunks;
        const t1 = (chunk + 1) / chunks;
        const mid = interpolatePoint(start, end, (t0 + t1) * 0.5);
        const outward = new THREE.Vector2(mid[0] - center.x, mid[1] - center.y).normalize();
        const seed = index * 17 + chunk * 5;
        const blockLength = length / chunks * (0.92 + seededWave(seed + 3) * 0.16);
        const blockHeight = landHeight - cliffBottom + randomSigned(seed + 7) * 0.11;
        const blockDepth = 0.44 + seededWave(seed + 11) * 0.34;
        const blockYOffset = randomSigned(seed + 13) * 0.05;
        const blockOutset = 0.12 + seededWave(seed + 17) * 0.28;
        const rotation = -Math.atan2(edge.y, edge.x);

        const wall = box(
          blockLength,
          blockHeight,
          blockDepth,
          wallMaterials[(index + chunk) % wallMaterials.length],
          mid[0] + outward.x * blockOutset,
          cliffBottom + blockHeight * 0.5 + blockYOffset,
          mid[1] + outward.y * blockOutset,
        );
        wall.rotation.y = rotation;
        cliffs.add(wall);

        const seam = box(
          0.045,
          blockHeight * 0.82,
          0.035,
          seamMaterial,
          mid[0] + outward.x * (blockOutset + blockDepth * 0.52),
          cliffBottom + blockHeight * 0.5 - 0.02,
          mid[1] + outward.y * (blockOutset + blockDepth * 0.52),
        );
        seam.rotation.y = rotation;
        cliffs.add(seam);

        if ((index + chunk) % 3 === 1) {
          const inset = box(
            blockLength * 0.58,
            blockHeight * 0.45,
            0.08,
            wallMaterials[(index + chunk + 2) % wallMaterials.length],
            mid[0] + outward.x * (blockOutset + blockDepth * 0.58),
            cliffBottom + blockHeight * 0.38,
            mid[1] + outward.y * (blockOutset + blockDepth * 0.58),
          );
          inset.rotation.y = rotation;
          cliffs.add(inset);
        }

        if ((index + chunk) % 4 === 0) {
          const waterline = box(
            blockLength * 0.76,
            0.08,
            0.12,
            waterlineMaterial,
            mid[0] + outward.x * (blockOutset + blockDepth * 0.54),
            cliffBottom + 0.03,
            mid[1] + outward.y * (blockOutset + blockDepth * 0.54),
          );
          waterline.rotation.y = rotation;
          cliffs.add(waterline);
        }
      }
    });

    return cliffs;
  }

  private createCliffFooting(): THREE.Group {
    const footing = new THREE.Group();
    footing.name = 'Waterline Rocks';
    const center = islandCenter(islandPoints);

    islandPoints.forEach((point, index) => {
      if (index % 3 !== 0) {
        return;
      }

      const outward = new THREE.Vector2(point[0] - center.x, point[1] - center.y).normalize();
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + seededWave(index * 31) * 0.18, 0), materials.stone);
      rock.position.set(point[0] + outward.x * 0.48, waterHeight + 0.2, point[1] + outward.y * 0.48);
      rock.scale.y = 0.28 + seededWave(index * 37) * 0.18;
      rock.rotation.set(seededWave(index) * 0.4, seededWave(index + 2) * Math.PI, seededWave(index + 4) * 0.3);
      rock.castShadow = true;
      rock.receiveShadow = true;
      footing.add(rock);
    });

    return footing;
  }

  private createTownSquare(): THREE.Group {
    const square = new THREE.Group();
    square.position.set(0, 0.54, -0.8);

    const plaza = box(4.3, 0.08, 3.6, materials.stone, 0, 0.02, 0);
    plaza.rotation.y = Math.PI / 4;
    square.add(plaza);

    const base = cylinder(0.45, 0.55, 0.28, materials.stoneDark, 8);
    base.position.y = 0.23;
    square.add(base);

    const pole = cylinder(0.045, 0.045, 2.3, materials.white, 8);
    pole.position.y = 1.45;
    square.add(pole);

    const flag = box(0.92, 0.48, 0.04, materials.red, 0.5, 2.08, 0);
    square.add(flag);

    const flagStripe = box(0.92, 0.12, 0.045, materials.white, 0.5, 2.08, 0.035);
    square.add(flagStripe);

    for (const x of [-1.8, 1.8]) {
      const bench = box(1.0, 0.16, 0.25, materials.wood, x, 0.28, -1.1);
      bench.rotation.y = x < 0 ? -0.35 : 0.35;
      square.add(bench);
    }

    for (const x of [-1.25, 1.25]) {
      for (const z of [-1.15, 1.15]) {
        const bed = box(0.8, 0.12, 0.45, materials.grassDark, x, 0.22, z);
        square.add(bed);
        for (let i = 0; i < 4; i += 1) {
          const flower = cylinder(0.045, 0.055, 0.1, i % 2 ? materials.flowerBlue : materials.flowerPink, 6);
          flower.position.set(x - 0.25 + i * 0.16, 0.35, z);
          square.add(flower);
        }
      }
    }

    return square;
  }
}

function boundsFromPoints(points: Array<readonly [number, number]>): TerrainBounds {
  return points.reduce<TerrainBounds>(
    (bounds, [x, z]) => ({
      minX: Math.min(bounds.minX, x),
      maxX: Math.max(bounds.maxX, x),
      minZ: Math.min(bounds.minZ, z),
      maxZ: Math.max(bounds.maxZ, z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  );
}

function createIslandShape(): THREE.Shape {
  const shape = new THREE.Shape();
  islandPoints.forEach(([x, z], index) => {
    if (index === 0) {
      shape.moveTo(x, -z);
    } else {
      shape.lineTo(x, -z);
    }
  });
  shape.closePath();
  return shape;
}

function createJaggedIslandPoints(points: Array<readonly [number, number]>): Array<readonly [number, number]> {
  const center = islandCenter(points);
  const jagged: Array<readonly [number, number]> = [];

  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const edge = new THREE.Vector2(end[0] - start[0], end[1] - start[1]);
    const length = edge.length();
    const steps = Math.max(2, Math.ceil(length / 2.1));

    for (let step = 0; step < steps; step += 1) {
      const amount = step / steps;
      const point = interpolatePoint(start, end, amount);
      const outward = new THREE.Vector2(point[0] - center.x, point[1] - center.y).normalize();
      const seed = index * 41 + step * 13;
      const bite = randomSigned(seed) * 0.42 + randomSigned(seed + 5) * 0.16;
      const tangent = edge.clone().normalize();
      jagged.push([
        point[0] + outward.x * bite + tangent.x * randomSigned(seed + 9) * 0.18,
        point[1] + outward.y * bite + tangent.y * randomSigned(seed + 15) * 0.18,
      ]);
    }
  });

  return jagged;
}

function islandCenter(points: Array<readonly [number, number]>): THREE.Vector2 {
  const total = points.reduce(
    (sum, [x, z]) => {
      sum.x += x;
      sum.y += z;
      return sum;
    },
    new THREE.Vector2(),
  );
  return total.divideScalar(points.length);
}

function interpolatePoint(
  start: readonly [number, number],
  end: readonly [number, number],
  amount: number,
): readonly [number, number] {
  return [start[0] + (end[0] - start[0]) * amount, start[1] + (end[1] - start[1]) * amount];
}

function seededWave(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function randomSigned(seed: number): number {
  return seededWave(seed) * 2 - 1;
}
