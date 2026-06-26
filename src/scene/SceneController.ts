import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import type { NumberController } from 'three/examples/jsm/libs/lil-gui.module.min.js';

type RockVariantType = 'block' | 'wide' | 'trapezoid' | 'narrow';

type IslandSettings = {
  rockSpacing: number;
  rockiness: number;
  vertexCount: number;
  rockDetail: number;
  rockHeight: number;
  rockHeightJitter: number;
  rockDepth: number;
  rockDepthJitter: number;
  rockColorJitter: number;
  hiddenOverlap: number;
  seed: number;
};

type GrassTextureSettings = {
  patchScale: number;
  colorVariation: number;
  bladeDensity: number;
  dryFlecks: number;
  textureScale: number;
  seed: number;
};

type TreeSettings = {
  heightJitter: number;
  distribution: number;
  colorJitter: number;
  minDiameter: number;
  maxDiameter: number;
  diameterJitter: number;
  densityJitter: number;
};

type StoneSettings = {
  density: number;
  borderBias: number;
  minDiameter: number;
  maxDiameter: number;
  sizeJitter: number;
  colorJitter: number;
  detail: number;
};

type WaterSettings = {
  clarity: number;
  choppiness: number;
};

type VibePresetName =
  | 'Soft Morning'
  | 'Bright Happy Noon'
  | 'July 4th Golden Hour'
  | 'Cozy Late Afternoon'
  | 'Cotton Candy Dusk'
  | 'Blue Hour Fireworks'
  | 'Warm Lantern Night'
  | 'Overcast Cozy';

type VibeSettings = {
  preset: VibePresetName;
  blend: number;
  sunHeight: number;
  sunWarmth: number;
  sunBrightness: number;
  ambientWarmth: number;
  shadowLift: number;
  contrastSoftness: number;
  saturation: number;
  warmMidtones: number;
  blueShadowTint: number;
  waterMood: number;
  grassWarmth: number;
  rockWarmth: number;
};

type VibePreset = Omit<VibeSettings, 'preset' | 'blend'> & {
  background: number;
  fog: number;
  sunColor: number;
  hemiSky: number;
  hemiGround: number;
  rimColor: number;
  exposure: number;
};

type IslandBuild = {
  root: THREE.Group;
  processedOutline: THREE.Vector2[];
};

type ProceduralPreset = {
  settings: IslandSettings;
  grassSettings: GrassTextureSettings;
  treeSettings: TreeSettings;
  stoneSettings: StoneSettings;
  waterSettings: WaterSettings;
  vibeSettings: VibeSettings;
};

type PresetStore = {
  version: 1;
  lastPresetName: string;
  presets: Record<string, ProceduralPreset>;
};

type GuiDisplayController = {
  updateDisplay: () => unknown;
};

type GuiOptionController = GuiDisplayController & {
  options: (options: string[]) => GuiOptionController;
};

const MIN_DRAW_POINT_DISTANCE = 0.08;
const MIN_FINISH_POINTS = 6;
const TOP_LIFT = 0.015;
const GRASS_TEXTURE_SIZE = 512;
const PRESET_STORAGE_KEY = 'boomtown-island-procedural-presets';
const EMPTY_PRESET_OPTION = 'No saved presets';
const ROCK_GEOMETRIES = new Map<string, THREE.BufferGeometry>();
const TREE_GEOMETRIES = new Map<string, THREE.BufferGeometry>();
const VIBE_PRESET_NAMES: VibePresetName[] = [
  'Soft Morning',
  'Bright Happy Noon',
  'July 4th Golden Hour',
  'Cozy Late Afternoon',
  'Cotton Candy Dusk',
  'Blue Hour Fireworks',
  'Warm Lantern Night',
  'Overcast Cozy',
];
const VIBE_PRESETS: Record<VibePresetName, VibePreset> = {
  'Soft Morning': {
    sunHeight: 0.62,
    sunWarmth: 0.7,
    sunBrightness: 1,
    ambientWarmth: 0.62,
    shadowLift: 0.58,
    contrastSoftness: 0.72,
    saturation: 0.72,
    warmMidtones: 0.38,
    blueShadowTint: 0.18,
    waterMood: 0.22,
    grassWarmth: 0.42,
    rockWarmth: 0.44,
    background: 0xaed2e1,
    fog: 0xaed2e1,
    sunColor: 0xffdfaa,
    hemiSky: 0xf6edd5,
    hemiGround: 0x6b8fa3,
    rimColor: 0xa6d9ff,
    exposure: 1.02,
  },
  'Bright Happy Noon': {
    sunHeight: 0.92,
    sunWarmth: 0.5,
    sunBrightness: 1,
    ambientWarmth: 0.5,
    shadowLift: 0.48,
    contrastSoftness: 0.56,
    saturation: 0.82,
    warmMidtones: 0.28,
    blueShadowTint: 0.12,
    waterMood: 0.14,
    grassWarmth: 0.38,
    rockWarmth: 0.34,
    background: 0x9bcfe5,
    fog: 0xa9d8e9,
    sunColor: 0xffedc7,
    hemiSky: 0xffffed,
    hemiGround: 0x6ea5b8,
    rimColor: 0xc5ecff,
    exposure: 1.08,
  },
  'July 4th Golden Hour': {
    sunHeight: 0.46,
    sunWarmth: 0.95,
    sunBrightness: 1,
    ambientWarmth: 0.72,
    shadowLift: 0.62,
    contrastSoftness: 0.54,
    saturation: 0.82,
    warmMidtones: 0.62,
    blueShadowTint: 0.28,
    waterMood: 0.38,
    grassWarmth: 0.58,
    rockWarmth: 0.68,
    background: 0xf2b878,
    fog: 0xe7bc82,
    sunColor: 0xffb85e,
    hemiSky: 0xffe0a6,
    hemiGround: 0x5f7fa0,
    rimColor: 0x8fc8ff,
    exposure: 1.06,
  },
  'Cozy Late Afternoon': {
    sunHeight: 0.5,
    sunWarmth: 0.82,
    sunBrightness: 1,
    ambientWarmth: 0.7,
    shadowLift: 0.68,
    contrastSoftness: 0.74,
    saturation: 0.68,
    warmMidtones: 0.58,
    blueShadowTint: 0.2,
    waterMood: 0.3,
    grassWarmth: 0.54,
    rockWarmth: 0.62,
    background: 0xd9b587,
    fog: 0xd7bd91,
    sunColor: 0xffc777,
    hemiSky: 0xffd8a2,
    hemiGround: 0x788a9a,
    rimColor: 0x9ed5ff,
    exposure: 1,
  },
  'Cotton Candy Dusk': {
    sunHeight: 0.38,
    sunWarmth: 0.78,
    sunBrightness: 1,
    ambientWarmth: 0.52,
    shadowLift: 0.78,
    contrastSoftness: 0.86,
    saturation: 0.62,
    warmMidtones: 0.5,
    blueShadowTint: 0.54,
    waterMood: 0.56,
    grassWarmth: 0.34,
    rockWarmth: 0.5,
    background: 0xd7a7d8,
    fog: 0xc5a8d8,
    sunColor: 0xff9d82,
    hemiSky: 0xffc0c8,
    hemiGround: 0x656b99,
    rimColor: 0xb0b9ff,
    exposure: 0.98,
  },
  'Blue Hour Fireworks': {
    sunHeight: 0.34,
    sunWarmth: 0.42,
    sunBrightness: 1,
    ambientWarmth: 0.36,
    shadowLift: 0.84,
    contrastSoftness: 0.82,
    saturation: 0.76,
    warmMidtones: 0.32,
    blueShadowTint: 0.72,
    waterMood: 0.82,
    grassWarmth: 0.18,
    rockWarmth: 0.34,
    background: 0x5c77a4,
    fog: 0x647da5,
    sunColor: 0xffc37c,
    hemiSky: 0x98b6db,
    hemiGround: 0x394c70,
    rimColor: 0x8dbdff,
    exposure: 0.94,
  },
  'Warm Lantern Night': {
    sunHeight: 0.28,
    sunWarmth: 0.88,
    sunBrightness: 1,
    ambientWarmth: 0.42,
    shadowLift: 0.9,
    contrastSoftness: 0.88,
    saturation: 0.58,
    warmMidtones: 0.64,
    blueShadowTint: 0.62,
    waterMood: 0.92,
    grassWarmth: 0.2,
    rockWarmth: 0.58,
    background: 0x53617f,
    fog: 0x5b6682,
    sunColor: 0xffa95f,
    hemiSky: 0x8aa0bf,
    hemiGround: 0x3e4965,
    rimColor: 0x8eacd8,
    exposure: 0.88,
  },
  'Overcast Cozy': {
    sunHeight: 0.72,
    sunWarmth: 0.42,
    sunBrightness: 1,
    ambientWarmth: 0.68,
    shadowLift: 0.82,
    contrastSoftness: 0.9,
    saturation: 0.5,
    warmMidtones: 0.42,
    blueShadowTint: 0.24,
    waterMood: 0.34,
    grassWarmth: 0.3,
    rockWarmth: 0.48,
    background: 0xb7c4c1,
    fog: 0xb7c4c1,
    sunColor: 0xffdfbe,
    hemiSky: 0xe6e1d4,
    hemiGround: 0x7b8f92,
    rimColor: 0xb7d4dc,
    exposure: 0.98,
  },
};
const ROCK_VARIANT_DIMENSIONS: Record<
  RockVariantType,
  { width: number; height: number; depth: number; skew: number }
> = {
  block: { width: 1, height: 1, depth: 1, skew: 0.03 },
  wide: { width: 1.32, height: 0.92, depth: 0.92, skew: -0.08 },
  trapezoid: { width: 1.04, height: 1.08, depth: 0.98, skew: 0.16 },
  narrow: { width: 0.74, height: 1.02, depth: 0.9, skew: -0.12 },
};

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashNoise(index: number, seed: number): number {
  const random = createSeededRandom(seed + index * 1013);
  return random() * 2 - 1;
}

function getNextVibePresetName(name: VibePresetName): VibePresetName {
  const index = VIBE_PRESET_NAMES.indexOf(name);
  return VIBE_PRESET_NAMES[(index + 1) % VIBE_PRESET_NAMES.length];
}

function lerpHexColor(first: number, second: number, alpha: number): THREE.Color {
  return new THREE.Color(first).lerp(new THREE.Color(second), alpha);
}

function resolveVibe(settings: VibeSettings): VibePreset {
  const first = VIBE_PRESETS[settings.preset];
  const second = VIBE_PRESETS[getNextVibePresetName(settings.preset)];
  const alpha = settings.blend;
  return {
    sunHeight: THREE.MathUtils.lerp(first.sunHeight, second.sunHeight, alpha),
    sunWarmth: THREE.MathUtils.lerp(first.sunWarmth, second.sunWarmth, alpha),
    sunBrightness: THREE.MathUtils.lerp(first.sunBrightness, second.sunBrightness, alpha),
    ambientWarmth: THREE.MathUtils.lerp(first.ambientWarmth, second.ambientWarmth, alpha),
    shadowLift: THREE.MathUtils.lerp(first.shadowLift, second.shadowLift, alpha),
    contrastSoftness: THREE.MathUtils.lerp(first.contrastSoftness, second.contrastSoftness, alpha),
    saturation: THREE.MathUtils.lerp(first.saturation, second.saturation, alpha),
    warmMidtones: THREE.MathUtils.lerp(first.warmMidtones, second.warmMidtones, alpha),
    blueShadowTint: THREE.MathUtils.lerp(first.blueShadowTint, second.blueShadowTint, alpha),
    waterMood: THREE.MathUtils.lerp(first.waterMood, second.waterMood, alpha),
    grassWarmth: THREE.MathUtils.lerp(first.grassWarmth, second.grassWarmth, alpha),
    rockWarmth: THREE.MathUtils.lerp(first.rockWarmth, second.rockWarmth, alpha),
    background: lerpHexColor(first.background, second.background, alpha).getHex(),
    fog: lerpHexColor(first.fog, second.fog, alpha).getHex(),
    sunColor: lerpHexColor(first.sunColor, second.sunColor, alpha).getHex(),
    hemiSky: lerpHexColor(first.hemiSky, second.hemiSky, alpha).getHex(),
    hemiGround: lerpHexColor(first.hemiGround, second.hemiGround, alpha).getHex(),
    rimColor: lerpHexColor(first.rimColor, second.rimColor, alpha).getHex(),
    exposure: THREE.MathUtils.lerp(first.exposure, second.exposure, alpha),
  };
}

function gradeMaterialColor(baseColor: THREE.Color, vibe: VibePreset, role: string): THREE.Color {
  const color = baseColor.clone();
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const roleWarmth =
    role.includes('Grass') || role.includes('foliage')
      ? vibe.grassWarmth
      : role.includes('rock') || role.includes('Rock') || role.includes('wall')
        ? vibe.rockWarmth
        : vibe.warmMidtones;

  hsl.s = THREE.MathUtils.clamp(hsl.s * THREE.MathUtils.lerp(0.64, 1.16, vibe.saturation), 0, 0.82);
  hsl.l = THREE.MathUtils.clamp(
    THREE.MathUtils.lerp(0.16 + vibe.shadowLift * 0.12, hsl.l, 1 - vibe.contrastSoftness * 0.22),
    0.12,
    0.88,
  );
  color.setHSL(hsl.h, hsl.s, hsl.l);
  color.lerp(new THREE.Color(0xffd18a), roleWarmth * 0.18);
  color.lerp(new THREE.Color(0x7b9cc9), vibe.blueShadowTint * 0.08);
  return color;
}

function polygonArea(points: THREE.Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function ensureClockwise(points: THREE.Vector2[]): THREE.Vector2[] {
  return polygonArea(points) > 0 ? [...points].reverse() : points;
}

function pathLength(points: THREE.Vector2[]): number {
  let length = 0;
  for (let i = 0; i < points.length; i += 1) {
    length += points[i].distanceTo(points[(i + 1) % points.length]);
  }
  return length;
}

function getPointAtClosedDistance(points: THREE.Vector2[], distance: number): THREE.Vector2 {
  const total = pathLength(points);
  let remaining = THREE.MathUtils.euclideanModulo(distance, total);

  for (let i = 0; i < points.length; i += 1) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    const segmentLength = start.distanceTo(end);
    if (remaining <= segmentLength) {
      return start.clone().lerp(end, segmentLength === 0 ? 0 : remaining / segmentLength);
    }
    remaining -= segmentLength;
  }

  return points[0].clone();
}

function cleanDrawnPath(points: THREE.Vector2[], minDistance: number): THREE.Vector2[] {
  const cleaned: THREE.Vector2[] = [];
  for (const point of points) {
    if (cleaned.length === 0 || cleaned[cleaned.length - 1].distanceTo(point) >= minDistance) {
      cleaned.push(point.clone());
    }
  }

  if (cleaned.length > 2 && cleaned[0].distanceTo(cleaned[cleaned.length - 1]) < minDistance * 1.5) {
    cleaned.pop();
  }

  return cleaned;
}

function perpendicularDistance(point: THREE.Vector2, start: THREE.Vector2, end: THREE.Vector2): number {
  const span = end.clone().sub(start);
  const lengthSq = span.lengthSq();
  if (lengthSq === 0) {
    return point.distanceTo(start);
  }

  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(span) / lengthSq, 0, 1);
  return point.distanceTo(start.clone().addScaledVector(span, t));
}

function ramerDouglasPeucker(points: THREE.Vector2[], tolerance: number): THREE.Vector2[] {
  if (points.length <= 2) {
    return points.map((point) => point.clone());
  }

  let maxDistance = 0;
  let splitIndex = 0;
  const lastIndex = points.length - 1;

  for (let i = 1; i < lastIndex; i += 1) {
    const distance = perpendicularDistance(points[i], points[0], points[lastIndex]);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = i;
    }
  }

  if (maxDistance <= tolerance) {
    return [points[0].clone(), points[lastIndex].clone()];
  }

  const left = ramerDouglasPeucker(points.slice(0, splitIndex + 1), tolerance);
  const right = ramerDouglasPeucker(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

function simplifyPath(points: THREE.Vector2[], tolerance: number): THREE.Vector2[] {
  if (points.length < 4) {
    return points.map((point) => point.clone());
  }

  const closed = [...points, points[0]];
  const simplified = ramerDouglasPeucker(closed, tolerance).slice(0, -1);
  return simplified.length >= 3 ? simplified : points.map((point) => point.clone());
}

function resampleClosedPath(points: THREE.Vector2[], spacing: number): THREE.Vector2[] {
  const total = pathLength(points);
  const count = Math.max(3, Math.round(total / Math.max(0.1, spacing)));
  return resampleClosedPathByCount(points, count);
}

function resampleClosedPathByCount(points: THREE.Vector2[], count: number): THREE.Vector2[] {
  const total = pathLength(points);
  const safeCount = Math.max(3, Math.round(count));
  const spacing = total / safeCount;
  const resampled: THREE.Vector2[] = [];

  for (let i = 0; i < safeCount; i += 1) {
    resampled.push(getPointAtClosedDistance(points, i * spacing));
  }

  return resampled;
}

function applyRockiness(points: THREE.Vector2[], amount: number, seed: number): THREE.Vector2[] {
  if (amount <= 0) {
    return points.map((point) => point.clone());
  }

  const centroid = points.reduce((sum, point) => sum.add(point), new THREE.Vector2()).multiplyScalar(1 / points.length);
  const wobbleScale = amount * 0.32;

  return points.map((point, index) => {
    const fromCenter = point.clone().sub(centroid);
    if (fromCenter.lengthSq() === 0) {
      return point.clone();
    }

    const blendedNoise =
      hashNoise(index, seed) * 0.58 + hashNoise(index + points.length, seed * 17 + 91) * 0.42;
    return point.clone().addScaledVector(fromCenter.normalize(), blendedNoise * wobbleScale);
  });
}

function createGrassTexture(settings: GrassTextureSettings): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = GRASS_TEXTURE_SIZE;
  canvas.height = GRASS_TEXTURE_SIZE;
  paintGrassTexture(canvas, settings);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(settings.textureScale);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function paintGrassTexture(canvas: HTMLCanvasElement, settings: GrassTextureSettings): void {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const random = createSeededRandom(settings.seed);
  const width = canvas.width;
  const height = canvas.height;
  const base = new THREE.Color(0x7da538);
  const image = context.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const largeNoise =
        Math.sin((x + settings.seed * 13) * 0.028) * 0.5 +
        Math.cos((y - settings.seed * 7) * 0.023) * 0.5 +
        Math.sin((x + y) * 0.014) * 0.35;
      const smallNoise = random() - 0.5;
      const shade = 1 + (largeNoise * 0.08 + smallNoise * 0.08) * settings.colorVariation;

      image.data[index] = Math.round(base.r * 255 * shade);
      image.data[index + 1] = Math.round(base.g * 255 * shade);
      image.data[index + 2] = Math.round(base.b * 255 * shade);
      image.data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  context.globalCompositeOperation = 'source-over';

  const patchCount = Math.round(30 + settings.patchScale * 72);
  for (let i = 0; i < patchCount; i += 1) {
    const radiusX = THREE.MathUtils.lerp(18, 72, random()) * settings.patchScale;
    const radiusY = radiusX * THREE.MathUtils.lerp(0.28, 0.72, random());
    const x = random() * width;
    const y = random() * height;
    const rotation = random() * Math.PI;
    const hue = THREE.MathUtils.lerp(72, 103, random());
    const lightness = THREE.MathUtils.lerp(25, 47, random());
    const alpha = THREE.MathUtils.lerp(0.08, 0.24, random()) * settings.colorVariation;
    drawSoftOval(context, x, y, radiusX, radiusY, rotation, `hsla(${hue}, 48%, ${lightness}%, ${alpha})`);
  }

  const dryPatchCount = Math.round(settings.dryFlecks * 58);
  for (let i = 0; i < dryPatchCount; i += 1) {
    const radiusX = THREE.MathUtils.lerp(8, 34, random());
    const radiusY = radiusX * THREE.MathUtils.lerp(0.2, 0.5, random());
    drawSoftOval(
      context,
      random() * width,
      random() * height,
      radiusX,
      radiusY,
      random() * Math.PI,
      `hsla(${THREE.MathUtils.lerp(38, 52, random())}, 48%, 38%, ${THREE.MathUtils.lerp(0.1, 0.28, random())})`,
    );
  }

  context.lineCap = 'round';
  const bladeCount = Math.round(settings.bladeDensity * 720);
  for (let i = 0; i < bladeCount; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const length = THREE.MathUtils.lerp(5, 20, random());
    const angle = -0.75 + (random() - 0.5) * 0.95;
    const brightness = THREE.MathUtils.lerp(30, 58, random());
    context.strokeStyle = `hsla(${THREE.MathUtils.lerp(75, 112, random())}, 42%, ${brightness}%, ${THREE.MathUtils.lerp(0.12, 0.32, random())})`;
    context.lineWidth = THREE.MathUtils.lerp(1, 2.6, random());
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    context.stroke();
  }
}

function drawSoftOval(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  rotation: number,
  color: string,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function createLowPolyOceanMaterial(settings: WaterSettings): THREE.ShaderMaterial {
  const uniforms = {
    uTime: { value: 0 },
    uClarity: { value: settings.clarity },
    uChoppiness: { value: settings.choppiness },
    uAmplitude: { value: THREE.MathUtils.lerp(0.04, 0.28, settings.choppiness) },
    uFrequency: { value: THREE.MathUtils.lerp(0.22, 0.62, settings.choppiness) },
    uSpeed: { value: THREE.MathUtils.lerp(0.55, 1.75, settings.choppiness) },
    uDeepColor: { value: new THREE.Color(0x0d2c48) },
    uClearColor: { value: new THREE.Color(0x4fa7a1) },
    uLightColor: { value: new THREE.Color(0xd6eee8) },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float uTime;
      uniform float uAmplitude;
      uniform float uFrequency;
      uniform float uSpeed;
      uniform float uChoppiness;
      varying float vWave;
      varying vec2 vGrid;

      void main() {
        vec3 displaced = position;
        float rolling = sin(uTime * uSpeed + displaced.x * uFrequency + displaced.y * uFrequency * 0.42);
        float cross = sin(uTime * uSpeed * 0.73 - displaced.x * uFrequency * 0.36 + displaced.y * uFrequency * 0.92);
        float small = sin(uTime * uSpeed * 1.41 + displaced.x * uFrequency * 1.8 + displaced.y * uFrequency * 0.28);
        float wave = rolling * 0.68 + cross * 0.22 + small * 0.1 * uChoppiness;
        displaced.z += wave * uAmplitude;
        vWave = wave * 0.5 + 0.5;
        vGrid = displaced.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uClarity;
      uniform float uChoppiness;
      uniform vec3 uDeepColor;
      uniform vec3 uClearColor;
      uniform vec3 uLightColor;
      varying float vWave;
      varying vec2 vGrid;

      void main() {
        vec3 base = mix(uDeepColor, uClearColor, uClarity);
        float facetedWave = floor(vWave * 5.0) / 5.0;
        float ridge = smoothstep(0.7, 1.0, vWave) * mix(0.18, 0.42, uChoppiness);
        float trough = smoothstep(0.38, 0.0, vWave) * mix(0.16, 0.3, 1.0 - uClarity);
        float gridShade = (mod(floor(vGrid.x * 0.35) + floor(vGrid.y * 0.35), 2.0) - 0.5) * 0.025;
        vec3 color = base * (0.78 + facetedWave * 0.34 + gridShade - trough);
        color = mix(color, uLightColor, ridge);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

function createShoreRippleGenerator(
  outlinePoints: THREE.Vector2[],
  topY: number,
  islandSettings: IslandSettings,
  waterSettings: WaterSettings,
): THREE.Group {
  const ripples = new THREE.Group();
  ripples.name = 'Procedural shore water ripples';

  const random = createSeededRandom(islandSettings.seed + 12979);
  const loopCount = 3;
  for (let loop = 0; loop < loopCount; loop += 1) {
    const points = resampleClosedPath(outlinePoints, THREE.MathUtils.lerp(0.22, 0.42, waterSettings.choppiness));
    const positions: number[] = [];
    const loopOffset = islandSettings.rockDepth * (0.46 + loop * 0.12) + 0.08;

    for (let i = 0; i <= points.length; i += 1) {
      const current = points[i % points.length];
      const next = points[(i + 1) % points.length];
      const previous = points[(i - 1 + points.length) % points.length];
      const tangent = next.clone().sub(previous).normalize();
      const outward = new THREE.Vector2(-tangent.y, tangent.x);
      const wave = Math.sin(i * 0.83 + loop * 1.7 + islandSettings.seed * 0.03) * 0.045 * waterSettings.choppiness;
      const brokenEdge = random() > THREE.MathUtils.lerp(0.24, 0.08, waterSettings.choppiness) ? 1 : 0.72;
      const ripplePoint = current
        .clone()
        .addScaledVector(outward, loopOffset + wave * brokenEdge)
        .addScaledVector(tangent, (random() - 0.5) * 0.035 * waterSettings.choppiness);
      positions.push(ripplePoint.x, TOP_LIFT + 0.004 + loop * 0.003, ripplePoint.y);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xcfe8df,
      transparent: true,
      opacity: THREE.MathUtils.lerp(0.13, 0.34, waterSettings.choppiness) * (1 - loop * 0.22),
      depthWrite: false,
    });
    const ripple = new THREE.Line(geometry, material);
    ripple.name = 'Shore water ripple';
    ripples.add(ripple);
  }

  ripples.position.y = Math.max(0.018, topY * 0.018);
  return ripples;
}

function pointInPolygon(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const current = polygon[i];
    const previous = polygon[j];
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(point: THREE.Vector2, start: THREE.Vector2, end: THREE.Vector2): number {
  const span = end.clone().sub(start);
  const lengthSq = span.lengthSq();
  if (lengthSq === 0) {
    return point.distanceTo(start);
  }

  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(span) / lengthSq, 0, 1);
  return point.distanceTo(start.clone().addScaledVector(span, t));
}

function distanceToOutline(point: THREE.Vector2, outlinePoints: THREE.Vector2[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < outlinePoints.length; i += 1) {
    nearest = Math.min(nearest, distanceToSegment(point, outlinePoints[i], outlinePoints[(i + 1) % outlinePoints.length]));
  }
  return nearest;
}

function getTreeGeometry(name: 'trunk' | 'foliage'): THREE.BufferGeometry {
  const cached = TREE_GEOMETRIES.get(name);
  if (cached) {
    return cached;
  }

  const geometry =
    name === 'trunk'
      ? new THREE.CylinderGeometry(0.42, 0.58, 1, 5, 1)
      : new THREE.ConeGeometry(1, 1, 5, 1);
  geometry.computeVertexNormals();
  geometry.userData.sharedTreeGeometry = name;
  TREE_GEOMETRIES.set(name, geometry);
  return geometry;
}

function createLowPolyTree(
  position: THREE.Vector2,
  topY: number,
  settings: TreeSettings,
  random: () => number,
): THREE.Group {
  const tree = new THREE.Group();
  tree.name = 'Procedural low-poly tree';
  tree.position.set(position.x, topY + TOP_LIFT, position.y);
  tree.rotation.y = random() * Math.PI * 2;

  const heightScale = THREE.MathUtils.lerp(1 - settings.heightJitter * 0.55, 1 + settings.heightJitter * 0.75, random());
  const minDiameter = Math.min(settings.minDiameter, settings.maxDiameter);
  const maxDiameter = Math.max(settings.minDiameter, settings.maxDiameter);
  const diameterRoll = THREE.MathUtils.lerp(0.5, random(), settings.diameterJitter);
  const diameterScale = THREE.MathUtils.lerp(minDiameter, maxDiameter, diameterRoll);
  const trunkHeight = 0.42 * heightScale;
  const foliageColor = new THREE.Color(0x5f9f2d);
  const hueShift = (random() - 0.5) * settings.colorJitter * 0.18;
  const lightShift = (random() - 0.5) * settings.colorJitter * 0.34;
  foliageColor.offsetHSL(hueShift, 0, lightShift);

  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4328,
    roughness: 0.88,
    flatShading: true,
  });
  const foliageMaterial = new THREE.MeshStandardMaterial({
    color: foliageColor,
    roughness: 0.9,
    flatShading: true,
  });

  const trunk = new THREE.Mesh(getTreeGeometry('trunk'), trunkMaterial);
  trunk.name = 'Tree trunk';
  trunk.position.y = trunkHeight * 0.5;
  trunk.scale.set(0.18 * diameterScale, trunkHeight, 0.18 * diameterScale);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  const tierCount = random() > 0.72 ? 4 : 3;
  for (let tier = 0; tier < tierCount; tier += 1) {
    const tierProgress = tier / Math.max(1, tierCount - 1);
    const tierRadius = THREE.MathUtils.lerp(0.82, 0.36, tierProgress) * diameterScale;
    const tierHeight = THREE.MathUtils.lerp(0.58, 0.46, tierProgress) * heightScale;
    const foliage = new THREE.Mesh(getTreeGeometry('foliage'), foliageMaterial);
    foliage.name = 'Tree foliage tier';
    foliage.position.y = trunkHeight + 0.26 * heightScale + tier * 0.36 * heightScale;
    foliage.rotation.y = random() * Math.PI * 2;
    foliage.scale.set(tierRadius, tierHeight, tierRadius);
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    tree.add(foliage);
  }

  tree.scale.setScalar(THREE.MathUtils.lerp(0.82, 1.16, random()));
  return tree;
}

function createTreeGenerator(outlinePoints: THREE.Vector2[], topY: number, settings: TreeSettings, seed: number): THREE.Group {
  const trees = new THREE.Group();
  trees.name = 'Procedural tree generator';

  const bounds = new THREE.Box2().setFromPoints(outlinePoints);
  const area = Math.abs(polygonArea(outlinePoints));
  const random = createSeededRandom(seed + 4819);
  const count = Math.round(THREE.MathUtils.clamp(area * THREE.MathUtils.lerp(0.12, 0.72, settings.densityJitter), 3, 64));
  const minSpacing = THREE.MathUtils.lerp(1.35, 0.68, settings.densityJitter);
  const placed: THREE.Vector2[] = [];
  let attempts = 0;

  while (placed.length < count && attempts < count * 80) {
    attempts += 1;
    const candidate = new THREE.Vector2(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, random()),
      THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, random()),
    );

    if (!pointInPolygon(candidate, outlinePoints)) {
      continue;
    }

    const edgeDistance = distanceToOutline(candidate, outlinePoints);
    const borderBandWidth = THREE.MathUtils.lerp(0.72, 4.6, settings.distribution);
    if (edgeDistance > borderBandWidth) {
      continue;
    }

    const coastlineWeight = 1 - THREE.MathUtils.smoothstep(edgeDistance, borderBandWidth * 0.35, borderBandWidth);
    const desiredWeight = THREE.MathUtils.lerp(coastlineWeight, 1, settings.distribution);
    if (random() > THREE.MathUtils.clamp(desiredWeight, 0, 1)) {
      continue;
    }

    if (placed.some((point) => point.distanceTo(candidate) < minSpacing * THREE.MathUtils.lerp(0.82, 1.25, random()))) {
      continue;
    }

    placed.push(candidate);
    trees.add(createLowPolyTree(candidate, topY, settings, random));
  }

  return trees;
}

function createStoneMaterialPalette(settings: StoneSettings): THREE.MeshStandardMaterial[] {
  const base = new THREE.Color(0xd5a773);
  const accents = [
    new THREE.Color(0xe4bc84),
    new THREE.Color(0xc8945f),
    new THREE.Color(0xb98454),
  ];

  return accents.map((accent, index) => {
    const color = base.clone().lerp(accent, settings.colorJitter);
    color.offsetHSL(
      0.01 * (index - 1) * settings.colorJitter,
      0.035 * settings.colorJitter,
      0.028 * (index % 2 === 0 ? 1 : -1) * settings.colorJitter,
    );
    return new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
  });
}

function createStoneGenerator(
  outlinePoints: THREE.Vector2[],
  topY: number,
  settings: StoneSettings,
  seed: number,
): THREE.Group {
  const stones = new THREE.Group();
  stones.name = 'Procedural grass stone generator';

  const area = Math.abs(polygonArea(outlinePoints));
  const count = Math.round(THREE.MathUtils.clamp(area * THREE.MathUtils.lerp(0, 3.2, settings.density), 0, 180));
  if (count <= 0) {
    return stones;
  }

  const bounds = new THREE.Box2().setFromPoints(outlinePoints);
  const random = createSeededRandom(seed + 8927);
  const variants: RockVariantType[] = ['wide', 'block', 'narrow'];
  const groupedStones = new Map<RockVariantType, Array<{ position: THREE.Vector2; diameter: number; height: number }>>();
  variants.forEach((variant) => groupedStones.set(variant, []));

  const minDiameter = Math.min(settings.minDiameter, settings.maxDiameter);
  const maxDiameter = Math.max(settings.minDiameter, settings.maxDiameter);
  const placed: THREE.Vector2[] = [];
  let attempts = 0;

  while (placed.length < count && attempts < count * 90) {
    attempts += 1;
    const candidate = new THREE.Vector2(
      THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, random()),
      THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, random()),
    );

    if (!pointInPolygon(candidate, outlinePoints)) {
      continue;
    }

    const edgeDistance = distanceToOutline(candidate, outlinePoints);
    if (edgeDistance < 0.28) {
      continue;
    }

    const edgeWeight = 1 - THREE.MathUtils.smoothstep(edgeDistance, 0.48, 3.4);
    const desiredWeight = THREE.MathUtils.lerp(1, edgeWeight, settings.borderBias);
    if (random() > THREE.MathUtils.clamp(desiredWeight, 0.05, 1)) {
      continue;
    }

    const sizeRoll = THREE.MathUtils.lerp(0.5, random(), settings.sizeJitter);
    const diameter = THREE.MathUtils.lerp(minDiameter, maxDiameter, sizeRoll);
    const spacing = diameter * THREE.MathUtils.lerp(1.05, 1.75, settings.density);
    if (placed.some((point) => point.distanceTo(candidate) < spacing)) {
      continue;
    }

    const variant = variants[Math.floor(random() * variants.length) % variants.length];
    const height = diameter * THREE.MathUtils.lerp(0.16, 0.38, random());
    placed.push(candidate);
    groupedStones.get(variant)?.push({ position: candidate, diameter, height });
  }

  const materials = createStoneMaterialPalette(settings);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  variants.forEach((variant, variantIndex) => {
    const entries = groupedStones.get(variant) ?? [];
    if (entries.length === 0) {
      return;
    }

    const geometry = createRockGeometryVariant(variant, settings.detail);
    const mesh = new THREE.InstancedMesh(geometry, materials[variantIndex], entries.length);
    mesh.name = `${variant} grass stones`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    entries.forEach((entry, instanceIndex) => {
      const widthSquash = THREE.MathUtils.lerp(0.76, 1.28, random());
      const depthSquash = THREE.MathUtils.lerp(0.72, 1.18, random());
      matrix.compose(
        new THREE.Vector3(entry.position.x, topY + TOP_LIFT + 0.006, entry.position.y),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, random() * Math.PI * 2, 0)),
        new THREE.Vector3(entry.diameter * widthSquash, entry.height, entry.diameter * depthSquash),
      );
      mesh.setMatrixAt(instanceIndex, matrix);

      const brightness = THREE.MathUtils.lerp(
        1 - settings.colorJitter * 0.18,
        1 + settings.colorJitter * 0.16,
        random(),
      );
      color.set(materials[variantIndex].color).multiplyScalar(brightness);
      mesh.setColorAt(instanceIndex, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    stones.add(mesh);
  });

  return stones;
}

function createIslandTop(outlinePoints: THREE.Vector2[], topY: number, grassTexture: THREE.Texture): THREE.Mesh {
  const shape = new THREE.Shape();
  outlinePoints.forEach((point, index) => {
    const x = point.x;
    const y = -point.y;
    if (index === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  });
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, topY + TOP_LIFT, 0);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: grassTexture,
    roughness: 0.9,
    metalness: 0.02,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Grass top';
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

function createRockWall(outlinePoints: THREE.Vector2[], height: number, settings: IslandSettings): THREE.Mesh {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < outlinePoints.length; i += 1) {
    const current = outlinePoints[i];
    const next = outlinePoints[(i + 1) % outlinePoints.length];
    const baseIndex = positions.length / 3;

    positions.push(current.x, 0, current.y);
    positions.push(next.x, 0, next.y);
    positions.push(current.x, height, current.y);
    positions.push(next.x, height, next.y);
    indices.push(baseIndex, baseIndex + 2, baseIndex + 1, baseIndex + 1, baseIndex + 2, baseIndex + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const baseColor = new THREE.Color(0xd5a773);
  const jitterColor = new THREE.Color(0xb98554);
  const material = new THREE.MeshStandardMaterial({
    color: baseColor.lerp(jitterColor, settings.rockColorJitter * 0.45),
    roughness: 0.86,
    metalness: 0.03,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Continuous perimeter wall';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRockGeometryVariant(type: RockVariantType, detail: number): THREE.BufferGeometry {
  const detailLevel = Math.round(THREE.MathUtils.clamp(detail, 0, 1) * 16) / 16;
  const cacheKey = `${type}:${detailLevel.toFixed(4)}`;
  const cached = ROCK_GEOMETRIES.get(cacheKey);
  if (cached) {
    return cached;
  }

  const segments = detailLevel <= 0.01 ? 1 : 1 + Math.round(detailLevel * 4);
  const geometry = new THREE.BoxGeometry(1, 1, 1, segments, segments, segments);
  const position = geometry.attributes.position as THREE.BufferAttribute;

  const config = ROCK_VARIANT_DIMENSIONS[type];
  const variantSeed = ['block', 'wide', 'trapezoid', 'narrow'].indexOf(type) * 1097 + 311;
  const random = createSeededRandom(variantSeed + Math.round(detailLevel * 1000));

  for (let i = 0; i < position.count; i += 1) {
    const localX = position.getX(i);
    const localY = position.getY(i);
    const localZ = position.getZ(i);
    const topFactor = localY > 0 ? 1 : 0;
    const depthTaper = THREE.MathUtils.lerp(1, localY > 0 ? 0.86 : 1.05, detailLevel);
    const cornerAmount =
      (Math.abs(localX) / 0.5 + Math.abs(localY) / 0.5 + Math.abs(localZ) / 0.5) / 3;
    const sideRoundness = 1 - detailLevel * 0.16 * cornerAmount;
    const dent = (random() - 0.62) * detailLevel * 0.16;
    const dentDirection = new THREE.Vector3(localX, localY * 0.55, localZ).normalize();

    const x = localX * config.width * sideRoundness + config.skew * topFactor * detailLevel;
    const y = localY * config.height + 0.5;
    const z = localZ * config.depth * depthTaper * sideRoundness;

    position.setXYZ(
      i,
      x + dentDirection.x * dent * config.width,
      y + dentDirection.y * dent * config.height,
      z + dentDirection.z * dent * config.depth,
    );
  }

  geometry.computeVertexNormals();
  const rockGeometry = geometry.toNonIndexed();
  rockGeometry.computeVertexNormals();
  rockGeometry.userData.sharedRockVariant = cacheKey;
  geometry.dispose();
  ROCK_GEOMETRIES.set(cacheKey, rockGeometry);
  return rockGeometry;
}

function createRockMaterialPalette(settings: IslandSettings): THREE.MeshStandardMaterial[] {
  const base = new THREE.Color(0xd5a773);
  const accents = [
    new THREE.Color(0xe8bf87),
    new THREE.Color(0xc8945f),
    new THREE.Color(0xb77f4e),
    new THREE.Color(0xdfb27d),
  ];

  return accents.map((accent, index) => {
    const color = base.clone().lerp(accent, settings.rockColorJitter);
    color.offsetHSL(
      0.012 * (index - 1.5) * settings.rockColorJitter,
      0.04 * settings.rockColorJitter,
      0.035 * (index % 2 === 0 ? 1 : -1) * settings.rockColorJitter,
    );
    return new THREE.MeshStandardMaterial({ color, roughness: 0.88 + index * 0.01, flatShading: true });
  });
}

function placeRockRingAroundIsland(outlinePoints: THREE.Vector2[], settings: IslandSettings): THREE.Group {
  const ring = new THREE.Group();
  ring.name = 'Instanced rock ring';

  const perimeterPoints = resampleClosedPath(outlinePoints, settings.rockSpacing);
  const variants: RockVariantType[] = ['block', 'wide', 'trapezoid', 'narrow'];
  const groupedSegments = new Map<RockVariantType, Array<{ index: number; start: THREE.Vector2; end: THREE.Vector2 }>>();
  variants.forEach((variant) => groupedSegments.set(variant, []));

  for (let i = 0; i < perimeterPoints.length; i += 1) {
    const segment = {
      index: i,
      start: perimeterPoints[i],
      end: perimeterPoints[(i + 1) % perimeterPoints.length],
    };
    const variant = variants[(i + Math.abs(settings.seed)) % variants.length];
    groupedSegments.get(variant)?.push(segment);
  }

  const materials = createRockMaterialPalette(settings);
  const random = createSeededRandom(settings.seed);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();

  variants.forEach((variant, variantIndex) => {
    const segments = groupedSegments.get(variant) ?? [];
    if (segments.length === 0) {
      return;
    }

    const geometry = createRockGeometryVariant(variant, settings.rockDetail);
    const mesh = new THREE.InstancedMesh(geometry, materials[variantIndex], segments.length);
    mesh.name = `${variant} rocks`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    segments.forEach((segment, instanceIndex) => {
      const tangent = segment.end.clone().sub(segment.start);
      const segmentLength = tangent.length();
      tangent.normalize();

      const outward = new THREE.Vector2(-tangent.y, tangent.x);
      const center = segment.start
        .clone()
        .add(segment.end)
        .multiplyScalar(0.5)
        .addScaledVector(outward, settings.rockDepth * 0.5 - settings.hiddenOverlap);

      const baseWidth = ROCK_VARIANT_DIMENSIONS[variant].width;
      const widthScale = (segmentLength + settings.hiddenOverlap * 6) / baseWidth;
      const depthJitter = settings.rockDepthJitter;
      const depthScale =
        settings.rockDepth *
        THREE.MathUtils.lerp(1 - depthJitter, 1 + depthJitter, random());
      const heightScale =
        settings.rockHeight *
        THREE.MathUtils.lerp(1 - settings.rockHeightJitter, 1 + settings.rockHeightJitter, random());
      const rotationJitter = (random() - 0.5) * 0.004;
      const rotation = Math.atan2(-tangent.y, tangent.x) + rotationJitter;

      matrix.compose(
        new THREE.Vector3(center.x, 0, center.y),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotation, 0)),
        new THREE.Vector3(widthScale, heightScale, depthScale),
      );
      mesh.setMatrixAt(instanceIndex, matrix);

      const brightness = THREE.MathUtils.lerp(
        1 - settings.rockColorJitter * 0.16,
        1 + settings.rockColorJitter * 0.16,
        random(),
      );
      color.set(materials[variantIndex].color).multiplyScalar(brightness);
      mesh.setColorAt(instanceIndex, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    ring.add(mesh);
  });

  return ring;
}

function generateIslandFromOutline(
  outlinePoints: THREE.Vector2[],
  settings: IslandSettings,
  grassTexture: THREE.Texture,
  treeSettings: TreeSettings,
  stoneSettings: StoneSettings,
  waterSettings: WaterSettings,
): IslandBuild {
  const cleaned = cleanDrawnPath(outlinePoints, MIN_DRAW_POINT_DISTANCE);
  const bounds = new THREE.Box2().setFromPoints(cleaned);
  const diagonal = bounds.getSize(new THREE.Vector2()).length();
  const tolerance = THREE.MathUtils.clamp(diagonal / Math.max(20, settings.vertexCount * 2.8), 0.03, 0.35);
  const simplified = simplifyPath(cleaned, tolerance);
  const sampled = resampleClosedPathByCount(simplified, settings.vertexCount);
  const rockyOutline = ensureClockwise(applyRockiness(sampled, settings.rockiness, settings.seed));

  const root = new THREE.Group();
  root.name = 'Generated low-poly island';
  root.add(createRockWall(rockyOutline, settings.rockHeight, settings));
  root.add(placeRockRingAroundIsland(rockyOutline, settings));
  root.add(createShoreRippleGenerator(rockyOutline, settings.rockHeight, settings, waterSettings));
  root.add(createIslandTop(rockyOutline, settings.rockHeight, grassTexture));
  root.add(createStoneGenerator(rockyOutline, settings.rockHeight, stoneSettings, settings.seed));
  root.add(createTreeGenerator(rockyOutline, settings.rockHeight, treeSettings, settings.seed));

  return {
    root,
    processedOutline: rockyOutline,
  };
}

export class SceneController {
  private readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly controls: OrbitControls;
  private readonly ambientLight = new THREE.HemisphereLight(0xf5efd7, 0x4c7e94, 2.4);
  private readonly sunLight = new THREE.DirectionalLight(0xffdfa3, 4.2);
  private readonly rimLight = new THREE.DirectionalLight(0xa6d9ff, 1.2);
  private readonly fillLight = new THREE.AmbientLight(0xffd5ad, 0.45);
  private readonly waterMaterial: THREE.ShaderMaterial;
  private readonly baseMaterialColors = new WeakMap<THREE.Material, THREE.Color>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly gui: GUI;
  private readonly guiControllers: GuiDisplayController[] = [];
  private presetSelectController: GuiOptionController | null = null;
  private presetNames: string[] = [];
  private readonly presetUi = {
    name: 'Island preset',
    selected: EMPTY_PRESET_OPTION,
  };
  private readonly settings: IslandSettings = {
    rockSpacing: 0.78,
    rockiness: 0.32,
    vertexCount: 34,
    rockDetail: 0.35,
    rockHeight: 1,
    rockHeightJitter: 0.12,
    rockDepth: 0.78,
    rockDepthJitter: 0.12,
    rockColorJitter: 0.22,
    hiddenOverlap: 0.035,
    seed: 42,
  };
  private readonly grassSettings: GrassTextureSettings = {
    patchScale: 0.78,
    colorVariation: 0.82,
    bladeDensity: 0.62,
    dryFlecks: 0.34,
    textureScale: 0.36,
    seed: 217,
  };
  private readonly treeSettings: TreeSettings = {
    heightJitter: 0.38,
    distribution: 0.62,
    colorJitter: 0.28,
    minDiameter: 0.75,
    maxDiameter: 1.25,
    diameterJitter: 0.3,
    densityJitter: 0.45,
  };
  private readonly stoneSettings: StoneSettings = {
    density: 0.34,
    borderBias: 0.42,
    minDiameter: 0.1,
    maxDiameter: 0.34,
    sizeJitter: 0.68,
    colorJitter: 0.24,
    detail: 0.45,
  };
  private readonly waterSettings: WaterSettings = {
    clarity: 0.52,
    choppiness: 0.36,
  };
  private readonly vibeSettings: VibeSettings = {
    preset: 'Soft Morning',
    blend: 0,
    sunHeight: 0.62,
    sunWarmth: 0.7,
    sunBrightness: 1,
    ambientWarmth: 0.62,
    shadowLift: 0.58,
    contrastSoftness: 0.72,
    saturation: 0.72,
    warmMidtones: 0.38,
    blueShadowTint: 0.18,
    waterMood: 0.22,
    grassWarmth: 0.42,
    rockWarmth: 0.44,
  };

  private island: THREE.Group | null = null;
  private grassTexture: THREE.CanvasTexture;
  private animationId = 0;
  private isDrawing = false;
  private activePointerId: number | null = null;
  private drawnOutline: THREE.Vector2[] = [];
  private lastGeneratedOutline: THREE.Vector2[] = [];
  private previewLine: THREE.Line | null = null;
  private readonly resizeObserver: ResizeObserver;

  public constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.loadLastSavedPreset(false);
    this.grassTexture = createGrassTexture(this.grassSettings);
    this.waterMaterial = createLowPolyOceanMaterial(this.waterSettings);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.4, 0);
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minZoom = 0.7;
    this.controls.maxZoom = 2.4;

    this.gui = this.createGui();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.composeScene();
    this.bindDrawingEvents();
    this.updateGrassTexture();
  }

  public start(): void {
    this.resize();
    this.resizeObserver.observe(this.canvas);
    this.tick();
  }

  public dispose(): void {
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.animationId);
    this.canvas.removeEventListener('pointerdown', this.startDrawing);
    this.canvas.removeEventListener('pointermove', this.updateDrawing);
    this.canvas.removeEventListener('pointerup', this.finishDrawing);
    this.canvas.removeEventListener('pointercancel', this.finishDrawing);
    this.controls.dispose();
    this.gui.destroy();
    this.grassTexture.dispose();
    this.waterMaterial.dispose();
    this.renderer.dispose();
  }

  private composeScene(): void {
    this.scene.background = new THREE.Color(0x9bc7dd);
    this.scene.fog = new THREE.Fog(0x9bc7dd, 42, 78);

    this.sunLight.position.set(-14, 22, 9);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -20;
    this.sunLight.shadow.camera.right = 20;
    this.sunLight.shadow.camera.top = 20;
    this.sunLight.shadow.camera.bottom = -20;
    this.rimLight.position.set(12, 9, -15);
    this.fillLight.name = 'Cozy fill light';
    this.scene.add(this.ambientLight, this.sunLight, this.rimLight, this.fillLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70, 34, 34).toNonIndexed(),
      this.waterMaterial,
    );
    ground.name = 'Procedural ocean water';
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.025;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.camera.position.set(17, 18, 17);
    this.camera.lookAt(0, 0, 0);
    this.applyVibe();
    this.generateDefaultIsland();
  }

  private readPresetStore(): PresetStore {
    if (typeof window === 'undefined') {
      return { version: 1, lastPresetName: '', presets: {} };
    }

    try {
      const rawStore = window.localStorage.getItem(PRESET_STORAGE_KEY);
      if (!rawStore) {
        return { version: 1, lastPresetName: '', presets: {} };
      }

      const parsed = JSON.parse(rawStore) as Partial<PresetStore> | null;
      if (!parsed || typeof parsed !== 'object' || !parsed.presets || typeof parsed.presets !== 'object') {
        return { version: 1, lastPresetName: '', presets: {} };
      }

      return {
        version: 1,
        lastPresetName: typeof parsed.lastPresetName === 'string' ? parsed.lastPresetName : '',
        presets: parsed.presets as Record<string, ProceduralPreset>,
      };
    } catch {
      return { version: 1, lastPresetName: '', presets: {} };
    }
  }

  private writePresetStore(store: PresetStore): void {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // localStorage can fail in private windows or quota-limited contexts.
    }
  }

  private createPresetSnapshot(): ProceduralPreset {
    return {
      settings: { ...this.settings },
      grassSettings: { ...this.grassSettings },
      treeSettings: { ...this.treeSettings },
      stoneSettings: { ...this.stoneSettings },
      waterSettings: { ...this.waterSettings },
      vibeSettings: { ...this.vibeSettings },
    };
  }

  private refreshPresetNames(store = this.readPresetStore()): void {
    this.presetNames = Object.keys(store.presets).sort((first, second) => first.localeCompare(second));
  }

  private getPresetOptions(): string[] {
    return this.presetNames.length > 0 ? this.presetNames : [EMPTY_PRESET_OPTION];
  }

  private updatePresetSelectionController(): void {
    if (!this.presetNames.includes(this.presetUi.selected)) {
      this.presetUi.selected = this.presetNames[0] ?? EMPTY_PRESET_OPTION;
    }
    this.presetSelectController?.options(this.getPresetOptions());
    this.presetSelectController?.updateDisplay();
  }

  private updateGuiDisplays(): void {
    this.guiControllers.forEach((controller) => controller.updateDisplay());
  }

  private applyProceduralPreset(preset: Partial<ProceduralPreset>, refreshScene: boolean): void {
    if (preset.settings) {
      Object.assign(this.settings, preset.settings);
    }
    if (preset.grassSettings) {
      Object.assign(this.grassSettings, preset.grassSettings);
    }
    if (preset.treeSettings) {
      Object.assign(this.treeSettings, preset.treeSettings);
    }
    if (preset.stoneSettings) {
      Object.assign(this.stoneSettings, preset.stoneSettings);
    }
    if (preset.waterSettings) {
      Object.assign(this.waterSettings, preset.waterSettings);
    }
    if (preset.vibeSettings) {
      Object.assign(this.vibeSettings, preset.vibeSettings);
      if (!VIBE_PRESET_NAMES.includes(this.vibeSettings.preset)) {
        this.vibeSettings.preset = 'Soft Morning';
      }
    }

    this.updateGuiDisplays();
    if (refreshScene) {
      this.updateGrassTexture();
      this.updateWaterSurface();
      this.regenerateIsland();
      this.applyVibe();
    }
  }

  private loadLastSavedPreset(refreshScene: boolean): void {
    const store = this.readPresetStore();
    this.refreshPresetNames(store);
    const presetName =
      store.lastPresetName && store.presets[store.lastPresetName] ? store.lastPresetName : this.presetNames[0];
    if (!presetName) {
      this.updatePresetSelectionController();
      return;
    }

    this.presetUi.name = presetName;
    this.presetUi.selected = presetName;
    this.applyProceduralPreset(store.presets[presetName], refreshScene);
  }

  private saveCurrentPreset(): void {
    const store = this.readPresetStore();
    const presetName = this.presetUi.name.trim() || `Preset ${Object.keys(store.presets).length + 1}`;
    store.presets[presetName] = this.createPresetSnapshot();
    store.lastPresetName = presetName;

    this.writePresetStore(store);
    this.refreshPresetNames(store);
    this.presetUi.name = presetName;
    this.presetUi.selected = presetName;
    this.updatePresetSelectionController();
    this.updateGuiDisplays();
  }

  private loadPreset(presetName = this.presetUi.selected): void {
    if (!presetName || presetName === EMPTY_PRESET_OPTION) {
      return;
    }

    const store = this.readPresetStore();
    const preset = store.presets[presetName];
    if (!preset) {
      this.refreshPresetNames(store);
      this.updatePresetSelectionController();
      return;
    }

    store.lastPresetName = presetName;
    this.writePresetStore(store);
    this.presetUi.name = presetName;
    this.presetUi.selected = presetName;
    this.applyProceduralPreset(preset, true);
  }

  private createGui(): GUI {
    const gui = new GUI({ title: 'Island Generator' });
    this.refreshPresetNames();
    const trackController = <T extends GuiDisplayController>(controller: T): T => {
      this.guiControllers.push(controller);
      return controller;
    };
    const regenerateOnMouseUp = <K extends keyof IslandSettings>(
      controller: NumberController<IslandSettings, K>,
    ): void => {
      controller.onFinishChange(() => this.regenerateIsland());
    };

    const presetFolder = gui.addFolder('Presets');
    trackController(presetFolder.add(this.presetUi, 'name').name('Preset name'));
    const selectedPresetController = trackController(
      presetFolder.add(this.presetUi, 'selected', this.getPresetOptions()).name('Saved presets'),
    );
    selectedPresetController.onChange((presetName: string) => this.loadPreset(presetName));
    this.presetSelectController = selectedPresetController as unknown as GuiOptionController;
    this.updatePresetSelectionController();
    presetFolder.add({ savePreset: () => this.saveCurrentPreset() }, 'savePreset').name('Save preset');
    presetFolder.add({ loadPreset: () => this.loadPreset() }, 'loadPreset').name('Load preset');
    presetFolder.open();

    regenerateOnMouseUp(trackController(gui.add(this.settings, 'rockSpacing', 0.35, 1.8, 0.01).name('Rock spacing')));
    regenerateOnMouseUp(trackController(gui.add(this.settings, 'rockiness', 0, 1, 0.01).name('Rockiness')));
    regenerateOnMouseUp(trackController(gui.add(this.settings, 'vertexCount', 8, 90, 1).name('Island vertices')));
    regenerateOnMouseUp(trackController(gui.add(this.settings, 'rockDetail', 0, 1, 0.01).name('Rock detail')));
    regenerateOnMouseUp(trackController(gui.add(this.settings, 'rockHeight', 0.45, 2, 0.01).name('Rock height')));
    regenerateOnMouseUp(
      trackController(gui.add(this.settings, 'rockHeightJitter', 0, 0.55, 0.01).name('Height jitter')),
    );
    regenerateOnMouseUp(trackController(gui.add(this.settings, 'rockDepth', 0.35, 1.8, 0.01).name('Rock depth')));
    regenerateOnMouseUp(
      trackController(gui.add(this.settings, 'rockDepthJitter', 0, 0.45, 0.01).name('Depth jitter')),
    );
    regenerateOnMouseUp(
      trackController(gui.add(this.settings, 'rockColorJitter', 0, 1, 0.01).name('Rock color jitter')),
    );
    regenerateOnMouseUp(
      trackController(gui.add(this.settings, 'hiddenOverlap', 0.01, 0.08, 0.001).name('Hidden overlap')),
    );
    regenerateOnMouseUp(trackController(gui.add(this.settings, 'seed', 1, 9999, 1).name('Seed')));

    const grassFolder = gui.addFolder('Grass Texture');
    const updateGrassOnChange = <K extends keyof GrassTextureSettings>(
      controller: NumberController<GrassTextureSettings, K>,
    ): void => {
      controller.onChange(() => this.updateGrassTexture());
    };
    const seedController = trackController(grassFolder.add(this.grassSettings, 'seed', 1, 999, 1).name('Seed'));
    updateGrassOnChange(
      trackController(grassFolder.add(this.grassSettings, 'patchScale', 0.25, 1.4, 0.01).name('Patch size')),
    );
    updateGrassOnChange(
      trackController(grassFolder.add(this.grassSettings, 'colorVariation', 0.15, 1.3, 0.01).name('Variation')),
    );
    updateGrassOnChange(
      trackController(grassFolder.add(this.grassSettings, 'bladeDensity', 0, 1, 0.01).name('Strokes')),
    );
    updateGrassOnChange(
      trackController(grassFolder.add(this.grassSettings, 'dryFlecks', 0, 1, 0.01).name('Dry flecks')),
    );
    updateGrassOnChange(
      trackController(grassFolder.add(this.grassSettings, 'textureScale', 0.12, 0.85, 0.01).name('Scale')),
    );
    updateGrassOnChange(seedController);
    grassFolder
      .add(
        {
          newTexture: () => {
            this.grassSettings.seed = (this.grassSettings.seed % 999) + 1;
            seedController.updateDisplay();
            this.updateGrassTexture();
          },
        },
        'newTexture',
      )
      .name('New texture');
    grassFolder.open();

    const stoneFolder = gui.addFolder('Stone Generator');
    const regenerateStonesOnMouseUp = <K extends keyof StoneSettings>(
      controller: NumberController<StoneSettings, K>,
    ): void => {
      controller.onFinishChange(() => this.regenerateIsland());
    };
    regenerateStonesOnMouseUp(trackController(stoneFolder.add(this.stoneSettings, 'density', 0, 1, 0.01).name('Density')));
    regenerateStonesOnMouseUp(
      trackController(stoneFolder.add(this.stoneSettings, 'borderBias', 0, 1, 0.01).name('Border bias')),
    );
    regenerateStonesOnMouseUp(
      trackController(stoneFolder.add(this.stoneSettings, 'minDiameter', 0.05, 0.5, 0.01).name('Min diameter')),
    );
    regenerateStonesOnMouseUp(
      trackController(stoneFolder.add(this.stoneSettings, 'maxDiameter', 0.08, 0.85, 0.01).name('Max diameter')),
    );
    regenerateStonesOnMouseUp(
      trackController(stoneFolder.add(this.stoneSettings, 'sizeJitter', 0, 1, 0.01).name('Size jitter')),
    );
    regenerateStonesOnMouseUp(
      trackController(stoneFolder.add(this.stoneSettings, 'colorJitter', 0, 1, 0.01).name('Color jitter')),
    );
    regenerateStonesOnMouseUp(trackController(stoneFolder.add(this.stoneSettings, 'detail', 0, 1, 0.01).name('Stone detail')));
    stoneFolder.open();

    const waterFolder = gui.addFolder('Ocean Water');
    const clarityController = trackController(waterFolder.add(this.waterSettings, 'clarity', 0, 1, 0.01).name('Clarity'));
    clarityController.onChange(() => this.updateWaterSurface());
    const choppinessController = trackController(
      waterFolder.add(this.waterSettings, 'choppiness', 0, 1, 0.01).name('Smooth / choppy'),
    );
    choppinessController.onChange(() => this.updateWaterSurface());
    choppinessController.onFinishChange(() => this.regenerateIsland());
    waterFolder.open();

    const treeFolder = gui.addFolder('Tree Generator');
    const regenerateTreesOnMouseUp = <K extends keyof TreeSettings>(
      controller: NumberController<TreeSettings, K>,
    ): void => {
      controller.onFinishChange(() => this.regenerateIsland());
    };
    regenerateTreesOnMouseUp(
      trackController(treeFolder.add(this.treeSettings, 'heightJitter', 0, 1, 0.01).name('Height jitter')),
    );
    regenerateTreesOnMouseUp(
      trackController(treeFolder.add(this.treeSettings, 'distribution', 0, 1, 0.01).name('Border / full')),
    );
    regenerateTreesOnMouseUp(
      trackController(treeFolder.add(this.treeSettings, 'colorJitter', 0, 1, 0.01).name('Color jitter')),
    );
    regenerateTreesOnMouseUp(
      trackController(treeFolder.add(this.treeSettings, 'minDiameter', 0.35, 2, 0.01).name('Min diameter')),
    );
    regenerateTreesOnMouseUp(
      trackController(treeFolder.add(this.treeSettings, 'maxDiameter', 0.35, 2.4, 0.01).name('Max diameter')),
    );
    regenerateTreesOnMouseUp(
      trackController(treeFolder.add(this.treeSettings, 'diameterJitter', 0, 1, 0.01).name('Diameter jitter')),
    );
    regenerateTreesOnMouseUp(
      trackController(treeFolder.add(this.treeSettings, 'densityJitter', 0, 1, 0.01).name('Density jitter')),
    );
    treeFolder.open();

    const vibeFolder = gui.addFolder('Vibe of Day');
    const vibeControllers: Array<{ updateDisplay: () => unknown }> = [];
    const syncVibePreset = (): void => {
      const preset = resolveVibe(this.vibeSettings);
      this.vibeSettings.sunHeight = preset.sunHeight;
      this.vibeSettings.sunWarmth = preset.sunWarmth;
      this.vibeSettings.sunBrightness = preset.sunBrightness;
      this.vibeSettings.ambientWarmth = preset.ambientWarmth;
      this.vibeSettings.shadowLift = preset.shadowLift;
      this.vibeSettings.contrastSoftness = preset.contrastSoftness;
      this.vibeSettings.saturation = preset.saturation;
      this.vibeSettings.warmMidtones = preset.warmMidtones;
      this.vibeSettings.blueShadowTint = preset.blueShadowTint;
      this.vibeSettings.waterMood = preset.waterMood;
      this.vibeSettings.grassWarmth = preset.grassWarmth;
      this.vibeSettings.rockWarmth = preset.rockWarmth;
      vibeControllers.forEach((controller) => controller.updateDisplay());
      this.applyVibe();
    };
    trackController(vibeFolder.add(this.vibeSettings, 'preset', VIBE_PRESET_NAMES).name('Vibe preset').onChange(syncVibePreset));
    trackController(vibeFolder.add(this.vibeSettings, 'blend', 0, 1, 0.01).name('Vibe blend').onChange(syncVibePreset));
    vibeControllers.push(
      trackController(
        vibeFolder.add(this.vibeSettings, 'sunHeight', 0.24, 0.95, 0.01).name('Sun height').onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder.add(this.vibeSettings, 'sunWarmth', 0, 1, 0.01).name('Sun warmth').onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder
          .add(this.vibeSettings, 'sunBrightness', 0, 2, 0.01)
          .name('Sun brightness')
          .onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder
          .add(this.vibeSettings, 'ambientWarmth', 0, 1, 0.01)
          .name('Ambient warmth')
          .onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder
          .add(this.vibeSettings, 'shadowLift', 0.35, 0.95, 0.01)
          .name('Shadow lift')
          .onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder
          .add(this.vibeSettings, 'contrastSoftness', 0.35, 0.95, 0.01)
          .name('Contrast softness')
          .onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder.add(this.vibeSettings, 'saturation', 0.35, 0.95, 0.01).name('Saturation').onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder
          .add(this.vibeSettings, 'warmMidtones', 0, 1, 0.01)
          .name('Warm midtones')
          .onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder
          .add(this.vibeSettings, 'blueShadowTint', 0, 1, 0.01)
          .name('Blue shadows')
          .onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder.add(this.vibeSettings, 'waterMood', 0, 1, 0.01).name('Water mood').onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder.add(this.vibeSettings, 'grassWarmth', 0, 1, 0.01).name('Grass warmth').onChange(() => this.applyVibe()),
      ),
      trackController(
        vibeFolder.add(this.vibeSettings, 'rockWarmth', 0, 1, 0.01).name('Rock warmth').onChange(() => this.applyVibe()),
      ),
    );
    vibeFolder.open(false);

    gui.add({ regenerate: () => this.regenerateIsland() }, 'regenerate').name('Regenerate');
    gui.add({ clear: () => this.clearIsland() }, 'clear').name('Clear');
    return gui;
  }

  private updateGrassTexture(): void {
    const previousTexture = this.grassTexture;
    this.grassTexture = createGrassTexture(this.grassSettings);
    this.applyGrassTextureToIsland();
    previousTexture.dispose();
  }

  private updateWaterSurface(): void {
    this.waterMaterial.uniforms.uClarity.value = this.waterSettings.clarity;
    this.waterMaterial.uniforms.uChoppiness.value = this.waterSettings.choppiness;
    this.waterMaterial.uniforms.uAmplitude.value = THREE.MathUtils.lerp(0.04, 0.28, this.waterSettings.choppiness);
    this.waterMaterial.uniforms.uFrequency.value = THREE.MathUtils.lerp(0.22, 0.62, this.waterSettings.choppiness);
    this.waterMaterial.uniforms.uSpeed.value = THREE.MathUtils.lerp(0.55, 1.75, this.waterSettings.choppiness);
    this.applyVibe();
  }

  private applyGrassTextureToIsland(): void {
    if (!this.island) {
      return;
    }

    const grassTop = this.island.getObjectByName('Grass top') as THREE.Mesh | undefined;
    const material = grassTop?.material as THREE.MeshStandardMaterial | undefined;
    if (!material) {
      return;
    }

    material.map = this.grassTexture;
    material.needsUpdate = true;
    this.applyVibe();
  }

  private getCurrentVibe(): VibePreset {
    const presetVibe = resolveVibe(this.vibeSettings);
    return {
      ...presetVibe,
      sunHeight: this.vibeSettings.sunHeight,
      sunWarmth: this.vibeSettings.sunWarmth,
      sunBrightness: this.vibeSettings.sunBrightness,
      ambientWarmth: this.vibeSettings.ambientWarmth,
      shadowLift: this.vibeSettings.shadowLift,
      contrastSoftness: this.vibeSettings.contrastSoftness,
      saturation: this.vibeSettings.saturation,
      warmMidtones: this.vibeSettings.warmMidtones,
      blueShadowTint: this.vibeSettings.blueShadowTint,
      waterMood: this.vibeSettings.waterMood,
      grassWarmth: this.vibeSettings.grassWarmth,
      rockWarmth: this.vibeSettings.rockWarmth,
    };
  }

  private updateShoreRippleVibe(vibe: VibePreset): void {
    const rippleColor = new THREE.Color(0xd6ece5)
      .lerp(new THREE.Color(vibe.background), vibe.blueShadowTint * 0.12)
      .lerp(new THREE.Color(0xffdfaa), vibe.warmMidtones * 0.08);
    let rippleIndex = 0;
    this.scene.traverse((object) => {
      if (object.name !== 'Shore water ripple') {
        return;
      }
      const material = (object as THREE.Line).material;
      if (!(material instanceof THREE.LineBasicMaterial)) {
        return;
      }
      const baseOpacity =
        THREE.MathUtils.lerp(0.11, 0.35, this.waterSettings.choppiness) *
        THREE.MathUtils.lerp(0.72, 1.08, this.waterSettings.clarity) *
        (1 - rippleIndex * 0.18);
      material.color.copy(rippleColor);
      material.opacity = THREE.MathUtils.clamp(baseOpacity, 0.06, 0.38);
      material.userData.baseOpacity = material.opacity;
      material.needsUpdate = true;
      rippleIndex += 1;
    });
  }

  private updateWaterAnimation(elapsed: number): void {
    this.waterMaterial.uniforms.uTime.value = elapsed;

    let rippleIndex = 0;
    this.scene.traverse((object) => {
      if (object.name !== 'Shore water ripple') {
        return;
      }
      const material = (object as THREE.Line).material;
      if (!(material instanceof THREE.LineBasicMaterial)) {
        return;
      }
      const baseOpacity =
        typeof material.userData.baseOpacity === 'number' ? material.userData.baseOpacity : material.opacity;
      const pulse =
        0.82 +
        Math.sin(elapsed * THREE.MathUtils.lerp(1.35, 3.8, this.waterSettings.choppiness) + rippleIndex * 1.3) * 0.18;
      material.opacity = baseOpacity * pulse;
      object.position.y = Math.sin(elapsed * 1.8 + rippleIndex) * 0.006 * this.waterSettings.choppiness;
      rippleIndex += 1;
    });
  }

  private applyVibe(): void {
    const vibe = this.getCurrentVibe();
    const background = new THREE.Color(vibe.background);
    const fog = new THREE.Color(vibe.fog);
    this.scene.background = background;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(fog);
      this.scene.fog.near = THREE.MathUtils.lerp(34, 48, vibe.shadowLift);
      this.scene.fog.far = THREE.MathUtils.lerp(54, 84, vibe.shadowLift);
    }

    const sunDistance = 25;
    const sunElevation = THREE.MathUtils.lerp(0.28, 1.12, vibe.sunHeight);
    const sunHorizontal = Math.cos(sunElevation) * sunDistance;
    this.sunLight.position.set(-sunHorizontal * 0.72, Math.sin(sunElevation) * sunDistance, sunHorizontal * 0.48);
    this.sunLight.color.copy(new THREE.Color(vibe.sunColor).lerp(new THREE.Color(0xfff0d3), 1 - vibe.sunWarmth));
    this.sunLight.intensity =
      THREE.MathUtils.lerp(2.45, 4.35, vibe.sunHeight) *
      THREE.MathUtils.lerp(0.82, 1.08, vibe.sunWarmth) *
      vibe.sunBrightness;
    this.sunLight.shadow.radius = THREE.MathUtils.lerp(5, 12, vibe.contrastSoftness);
    this.sunLight.shadow.bias = -0.00008;

    this.ambientLight.color.copy(new THREE.Color(vibe.hemiSky).lerp(new THREE.Color(0xffe4bd), vibe.ambientWarmth * 0.18));
    this.ambientLight.groundColor.copy(new THREE.Color(vibe.hemiGround).lerp(new THREE.Color(0x8fa8c9), vibe.blueShadowTint * 0.24));
    this.ambientLight.intensity = THREE.MathUtils.lerp(1.75, 3.35, vibe.shadowLift);

    this.rimLight.color.copy(new THREE.Color(vibe.rimColor));
    this.rimLight.intensity = THREE.MathUtils.lerp(0.55, 1.55, vibe.blueShadowTint + vibe.shadowLift * 0.25);
    this.fillLight.color.copy(new THREE.Color(0xffd9aa).lerp(new THREE.Color(0x9db8df), vibe.blueShadowTint * 0.34));
    this.fillLight.intensity = THREE.MathUtils.lerp(0.24, 1.05, vibe.shadowLift);
    this.renderer.toneMappingExposure = THREE.MathUtils.clamp(
      vibe.exposure + vibe.shadowLift * 0.08 - vibe.contrastSoftness * 0.04,
      0.78,
      1.16,
    );

    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (mesh.name === 'Procedural ocean water' && material instanceof THREE.ShaderMaterial) {
          const deepColor = new THREE.Color(0x0d2c48)
            .lerp(new THREE.Color(0x061727), vibe.waterMood * 0.58)
            .lerp(new THREE.Color(vibe.background), vibe.blueShadowTint * 0.08);
          const clearColor = new THREE.Color(0x4fa7a1)
            .lerp(new THREE.Color(0x6bbcc1), 1 - vibe.waterMood * 0.25)
            .lerp(new THREE.Color(0xffd18a), vibe.warmMidtones * 0.045);
          const lightColor = new THREE.Color(0xd6eee8)
            .lerp(new THREE.Color(vibe.background), vibe.blueShadowTint * 0.12)
            .lerp(new THREE.Color(0xffdfaa), vibe.warmMidtones * 0.1);
          material.uniforms.uDeepColor.value.copy(deepColor);
          material.uniforms.uClearColor.value.copy(clearColor);
          material.uniforms.uLightColor.value.copy(lightColor);
          material.uniforms.uClarity.value = this.waterSettings.clarity;
          material.uniforms.uChoppiness.value = this.waterSettings.choppiness;
          return;
        }

        if (!(material instanceof THREE.MeshStandardMaterial)) {
          return;
        }
        if (!this.baseMaterialColors.has(material)) {
          this.baseMaterialColors.set(material, material.color.clone());
        }

        if (mesh.name === 'Grass top') {
          material.color.copy(new THREE.Color(0xffffff).lerp(new THREE.Color(0xffe7aa), vibe.grassWarmth * 0.14));
        } else {
          const baseColor = this.baseMaterialColors.get(material) ?? material.color;
          material.color.copy(gradeMaterialColor(baseColor, vibe, mesh.name));
        }
        material.roughness = THREE.MathUtils.clamp(0.78 + vibe.contrastSoftness * 0.16, 0.72, 0.96);
        material.needsUpdate = true;
      });
    });
    this.updateShoreRippleVibe(vibe);
  }

  private bindDrawingEvents(): void {
    this.canvas.addEventListener('pointerdown', this.startDrawing);
    this.canvas.addEventListener('pointermove', this.updateDrawing);
    this.canvas.addEventListener('pointerup', this.finishDrawing);
    this.canvas.addEventListener('pointercancel', this.finishDrawing);
  }

  private readonly startDrawing = (event: PointerEvent): void => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || this.isDrawing) {
      return;
    }

    const worldPosition = this.getPointerWorldPosition(event);
    if (!worldPosition) {
      return;
    }

    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.activePointerId = event.pointerId;
    this.controls.enabled = false;
    this.isDrawing = true;
    this.drawnOutline = [worldPosition];
    this.removePreviewLine();
    this.previewLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xfff3b0, linewidth: 2 }),
    );
    this.previewLine.name = 'Live outline preview';
    this.scene.add(this.previewLine);
    this.updatePreviewLine(false);
  };

  private readonly updateDrawing = (event: PointerEvent): void => {
    if (!this.isDrawing || event.pointerId !== this.activePointerId) {
      return;
    }

    const worldPosition = this.getPointerWorldPosition(event);
    if (!worldPosition) {
      return;
    }

    event.preventDefault();
    const lastPoint = this.drawnOutline[this.drawnOutline.length - 1];
    if (lastPoint.distanceTo(worldPosition) >= MIN_DRAW_POINT_DISTANCE) {
      this.drawnOutline.push(worldPosition);
      this.updatePreviewLine(false);
    }
  };

  private readonly finishDrawing = (event: PointerEvent): void => {
    if (!this.isDrawing || event.pointerId !== this.activePointerId) {
      return;
    }

    event.preventDefault();
    this.canvas.releasePointerCapture(event.pointerId);
    this.activePointerId = null;
    this.controls.enabled = true;
    this.isDrawing = false;

    const finalPoint = this.getPointerWorldPosition(event);
    if (finalPoint) {
      this.drawnOutline.push(finalPoint);
    }
    this.updatePreviewLine(true);

    const cleaned = cleanDrawnPath(this.drawnOutline, MIN_DRAW_POINT_DISTANCE);
    if (cleaned.length >= MIN_FINISH_POINTS && Math.abs(polygonArea(cleaned)) > 0.8) {
      this.lastGeneratedOutline = cleaned;
      this.regenerateIsland();
    }
  };

  private getPointerWorldPosition(event: PointerEvent): THREE.Vector2 | null {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
      return null;
    }

    return new THREE.Vector2(hit.x, hit.z);
  }

  private updatePreviewLine(closed: boolean): void {
    if (!this.previewLine) {
      return;
    }

    const points = closed && this.drawnOutline.length > 1 ? [...this.drawnOutline, this.drawnOutline[0]] : this.drawnOutline;
    const positions = points.flatMap((point) => [point.x, 0.08, point.y]);
    this.previewLine.geometry.dispose();
    this.previewLine.geometry = new THREE.BufferGeometry();
    this.previewLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  }

  private removePreviewLine(): void {
    if (!this.previewLine) {
      return;
    }

    this.scene.remove(this.previewLine);
    this.previewLine.geometry.dispose();
    const material = this.previewLine.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material.dispose();
    }
    this.previewLine = null;
  }

  private generateDefaultIsland(): void {
    const defaultOutline = Array.from({ length: 32 }, (_, index) => {
      const angle = (index / 32) * Math.PI * 2;
      const radius = 4.4 + Math.sin(angle * 3) * 0.55 + Math.cos(angle * 5) * 0.28;
      return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.78);
    });
    this.lastGeneratedOutline = defaultOutline;
    this.regenerateIsland();
  }

  private regenerateIsland(): void {
    if (this.lastGeneratedOutline.length < 3) {
      return;
    }

    this.removeIsland();
    const build = generateIslandFromOutline(
      this.lastGeneratedOutline,
      this.settings,
      this.grassTexture,
      this.treeSettings,
      this.stoneSettings,
      this.waterSettings,
    );
    this.island = build.root;
    this.scene.add(this.island);
    this.applyVibe();
    this.removePreviewLine();
  }

  private clearIsland(): void {
    this.removeIsland();
    this.removePreviewLine();
    this.drawnOutline = [];
    this.lastGeneratedOutline = [];
  }

  private removeIsland(): void {
    if (!this.island) {
      return;
    }

    this.scene.remove(this.island);
    const disposedMaterials = new Set<THREE.Material>();
    this.island.traverse((object) => {
      const renderable = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };
      if (renderable.geometry && !renderable.geometry.userData.sharedRockVariant && !renderable.geometry.userData.sharedTreeGeometry) {
        renderable.geometry.dispose();
      }
      const material = renderable.material;
      if (!material) {
        return;
      }
      if (Array.isArray(material)) {
        material.forEach((entry) => {
          if (!disposedMaterials.has(entry)) {
            entry.dispose();
            disposedMaterials.add(entry);
          }
        });
      } else if (!disposedMaterials.has(material)) {
        material.dispose();
        disposedMaterials.add(material);
      }
    });
    this.island = null;
  }

  private readonly resize = (): void => {
    const { clientWidth, clientHeight } = this.canvas;
    const width = Math.max(1, clientWidth);
    const height = Math.max(1, clientHeight);
    const aspect = width / height;
    const viewSize = 15;

    this.camera.left = (-viewSize * aspect) / 2;
    this.camera.right = (viewSize * aspect) / 2;
    this.camera.top = viewSize / 2;
    this.camera.bottom = -viewSize / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private readonly tick = (): void => {
    this.animationId = requestAnimationFrame(this.tick);
    this.controls.update();
    this.updateWaterAnimation(performance.now() * 0.001);
    this.renderer.render(this.scene, this.camera);
  };
}
