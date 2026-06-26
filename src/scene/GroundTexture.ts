import * as THREE from 'three';

export type TerrainBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type GroundPathSegment = readonly [x: number, z: number, length: number, width: number, rotation: number];

type CanvasPoint = {
  x: number;
  y: number;
};

const textureWidth = 1024;
const textureHeight = 768;

export function applyPlanarTerrainUvs(geometry: THREE.BufferGeometry, bounds: TerrainBounds): void {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;

  if (!(position instanceof THREE.BufferAttribute) || !(uv instanceof THREE.BufferAttribute)) {
    return;
  }

  for (let i = 0; i < position.count; i += 1) {
    uv.setXY(i, (position.getX(i) - bounds.minX) / spanX, (position.getZ(i) - bounds.minZ) / spanZ);
  }

  uv.needsUpdate = true;
}

export function createGroundMaterial(bounds: TerrainBounds, pathSegments: GroundPathSegment[]): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = textureWidth;
  canvas.height = textureHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create ground texture canvas.');
  }

  const random = seededRandom(7429);
  fillBase(ctx);
  drawLowPolyPatchwork(ctx, random);
  drawSandyWear(ctx, bounds, pathSegments, random);
  drawGrassFlecks(ctx, random);
  drawFlowerFlecks(ctx, random);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;

  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.02,
    flatShading: true,
  });
}

function fillBase(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, textureWidth, textureHeight);
  gradient.addColorStop(0, '#9ac451');
  gradient.addColorStop(0.45, '#88b642');
  gradient.addColorStop(1, '#78a139');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, textureWidth, textureHeight);
}

function drawLowPolyPatchwork(ctx: CanvasRenderingContext2D, random: () => number): void {
  const colors = ['#a2ca58', '#91bd49', '#7faa3c', '#6f9835', '#b0c95d', '#93aa38'];
  const step = 96;

  for (let y = -step; y < textureHeight + step; y += step) {
    for (let x = -step; x < textureWidth + step; x += step) {
      const jitter = step * 0.28;
      const corners = [
        point(x + randomRange(random, -jitter, jitter), y + randomRange(random, -jitter, jitter)),
        point(x + step + randomRange(random, -jitter, jitter), y + randomRange(random, -jitter, jitter)),
        point(x + step + randomRange(random, -jitter, jitter), y + step + randomRange(random, -jitter, jitter)),
        point(x + randomRange(random, -jitter, jitter), y + step + randomRange(random, -jitter, jitter)),
      ];
      const center = point(
        x + step * 0.5 + randomRange(random, -jitter, jitter),
        y + step * 0.5 + randomRange(random, -jitter, jitter),
      );

      for (let i = 0; i < corners.length; i += 1) {
        const next = (i + 1) % corners.length;
        ctx.fillStyle = withAlpha(colors[Math.floor(random() * colors.length)], randomRange(random, 0.14, 0.3));
        polygon(ctx, [corners[i], corners[next], center]);
        ctx.fill();
      }
    }
  }

  for (let i = 0; i < 58; i += 1) {
    const x = random() * textureWidth;
    const y = random() * textureHeight;
    const radius = randomRange(random, 34, 92);
    const sides = 5 + Math.floor(random() * 3);
    ctx.fillStyle = withAlpha(random() > 0.5 ? '#c3b661' : '#5f8c33', randomRange(random, 0.09, 0.18));
    polygon(ctx, irregularBlob(random, x, y, radius, sides));
    ctx.fill();
  }
}

function drawSandyWear(
  ctx: CanvasRenderingContext2D,
  bounds: TerrainBounds,
  pathSegments: GroundPathSegment[],
  random: () => number,
): void {
  for (const [x, z, length, width, rotation] of pathSegments) {
    const center = worldToCanvas(bounds, x, z);
    const pathLength = (length / (bounds.maxX - bounds.minX)) * textureWidth;
    const pathWidth = (width / (bounds.maxZ - bounds.minZ)) * textureHeight;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rotation);

    drawRoundedBand(ctx, pathLength, pathWidth * 2.25, '#b58f52', 0.16);
    drawRoundedBand(ctx, pathLength, pathWidth * 1.52, '#d1a764', 0.27);
    drawRoundedBand(ctx, pathLength * 0.96, pathWidth * 0.94, '#dfbb73', 0.36);

    for (let i = 0; i < Math.floor(length * 11); i += 1) {
      const px = randomRange(random, -pathLength * 0.48, pathLength * 0.48);
      const py = randomRange(random, -pathWidth * 0.74, pathWidth * 0.74);
      const r = randomRange(random, 1.2, 4.2);
      ctx.fillStyle = withAlpha(random() > 0.45 ? '#9d713e' : '#efd08a', randomRange(random, 0.18, 0.34));
      ctx.beginPath();
      ctx.ellipse(px, py, r * 1.7, r, randomRange(random, -0.8, 0.8), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawGrassFlecks(ctx: CanvasRenderingContext2D, random: () => number): void {
  const colors = ['#4f7e2a', '#6f9632', '#aec94e', '#d4bc5f', '#956f3a'];

  for (let i = 0; i < 1350; i += 1) {
    const x = random() * textureWidth;
    const y = random() * textureHeight;
    const length = randomRange(random, 2, 7);
    const angle = randomRange(random, 0, Math.PI);
    ctx.strokeStyle = withAlpha(colors[Math.floor(random() * colors.length)], randomRange(random, 0.18, 0.45));
    ctx.lineWidth = randomRange(random, 0.8, 1.8);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }
}

function drawFlowerFlecks(ctx: CanvasRenderingContext2D, random: () => number): void {
  const colors = ['#f0d85b', '#f06a9f', '#f5f1e6', '#6eb4ff'];

  for (let cluster = 0; cluster < 46; cluster += 1) {
    const cx = random() * textureWidth;
    const cy = random() * textureHeight;
    const count = 3 + Math.floor(random() * 5);

    for (let i = 0; i < count; i += 1) {
      const radius = randomRange(random, 1.7, 3.4);
      ctx.fillStyle = withAlpha(colors[Math.floor(random() * colors.length)], randomRange(random, 0.54, 0.86));
      ctx.beginPath();
      ctx.arc(cx + randomRange(random, -18, 18), cy + randomRange(random, -14, 14), radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRoundedBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  alpha: number,
): void {
  const radius = height * 0.5;
  ctx.fillStyle = withAlpha(color, alpha);
  ctx.beginPath();
  ctx.moveTo(-width * 0.5 + radius, -height * 0.5);
  ctx.lineTo(width * 0.5 - radius, -height * 0.5);
  ctx.quadraticCurveTo(width * 0.5, -height * 0.5, width * 0.5, 0);
  ctx.quadraticCurveTo(width * 0.5, height * 0.5, width * 0.5 - radius, height * 0.5);
  ctx.lineTo(-width * 0.5 + radius, height * 0.5);
  ctx.quadraticCurveTo(-width * 0.5, height * 0.5, -width * 0.5, 0);
  ctx.quadraticCurveTo(-width * 0.5, -height * 0.5, -width * 0.5 + radius, -height * 0.5);
  ctx.closePath();
  ctx.fill();
}

function worldToCanvas(bounds: TerrainBounds, x: number, z: number): CanvasPoint {
  return {
    x: ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * textureWidth,
    y: textureHeight - ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * textureHeight,
  };
}

function irregularBlob(
  random: () => number,
  centerX: number,
  centerY: number,
  radius: number,
  sides: number,
): CanvasPoint[] {
  const points: CanvasPoint[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2 + randomRange(random, -0.16, 0.16);
    const r = radius * randomRange(random, 0.55, 1.1);
    points.push(point(centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r));
  }
  return points;
}

function polygon(ctx: CanvasRenderingContext2D, points: CanvasPoint[]): void {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function point(x: number, y: number): CanvasPoint {
  return { x, y };
}

function withAlpha(hex: string, alpha: number): string {
  const color = new THREE.Color(hex);
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function randomRange(random: () => number, min: number, max: number): number {
  return min + (max - min) * random();
}

function seededRandom(seed: number): () => number {
  let value = seed;

  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}
