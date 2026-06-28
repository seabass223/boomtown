import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import type { NumberController } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import {
  PREFAB_BUILDING_LABELS,
  PREFAB_BUILDINGS,
  type PrefabBuildingKey,
  type PrefabGridPlacement,
  type PrefabRotation,
  createPrefabBuilding,
  createPrefabPlacementPreview,
  getPrefabCellCenter,
  getPrefabCellKey,
  getPrefabDefinition,
  getPrefabDefinitionByLabel,
  getPrefabFootprintCells,
  getPrefabPlacementForWorldPoint,
  getPrefabRotationFromDegrees,
  getPrefabRotationRadians,
  getPrefabWorldCenter,
  getPrefabWorldDimensions,
  getPrefabWorldFootprintCorners,
} from './PrefabBuildings';
import {
  WORKER_CARGO_CAPACITY,
  acceptsAnyCargo,
  canCreateLoop,
  getGatheredResource,
  isResourceSource,
  summarizeResources,
  type WorkerOrderAction,
  type WorkerTaskState,
} from '../simulation/workerLogistics';
import {
  ECONOMY_RECIPES,
  LAUNCH_RACK_SLOTS,
  RESOURCE_TYPES,
  addResource,
  createEmptyInventory,
  getAcceptedResources,
  getSourceResources,
  inventoryToResourceList,
  removeResource,
  resourceListToInventory,
  transferAcceptedResources,
  type ResourceType,
} from '../simulation/economy.ts';
import {
  deliverToLaunchField,
  getConstructionFraction,
  getLaunchCapacity,
  getLaunchableFireworks,
  updateFireworksFactory,
} from '../simulation/buildingProduction.ts';
import { runFixedSimulationSteps } from '../simulation/fixedStep.ts';
import { GAME_RULES } from '../simulation/gameRules.ts';
import { resolveRunResult } from '../simulation/scoring.ts';
import { resolveCrowdOverlaps } from '../simulation/crowdAvoidance.ts';
import {
  createBurstDirections,
  createFireworksShowPlan,
  type FireworkBurstPlan,
  type FireworksShowPlan,
} from '../simulation/fireworksEngine.ts';
import {
  createBoomtownRunState,
  createWorkerRunState,
  getBuildingInventory as getRunBuildingInventory,
  initializeRunBuildings,
  resetBoomtownRunState,
  type BoomtownRunState,
  type WorkerRunState,
} from '../simulation/runState.ts';

type RockVariantType = 'block' | 'wide' | 'trapezoid' | 'narrow';

export type SceneInteractionMode = 'pan' | 'island' | 'build' | 'edit' | 'path' | 'simulate';

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
  edgeFog: boolean;
  fogStart: number;
  fogEnd: number;
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
  outlinePoints?: Array<[number, number]>;
  settings: IslandSettings;
  grassSettings: GrassTextureSettings;
  treeSettings: TreeSettings;
  stoneSettings: StoneSettings;
  waterSettings: WaterSettings;
  vibeSettings: VibeSettings;
  cameraSettings?: CameraPresetSettings;
  prefabSettings?: PrefabPresetSettings;
  prefabPlacements?: PrefabPlacementPreset[];
  walkwayPaths?: WalkwayPathGraph;
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

type PlacedPrefab = {
  key: PrefabBuildingKey;
  group: THREE.Group;
  cells: string[];
  rotation: PrefabRotation;
  placement: PrefabGridPlacement;
};

type PrefabPresetSettings = {
  selected: string;
  placeMode: boolean;
  editMode: boolean;
  rotationDegrees: number;
};

type PrefabPlacementPreset = {
  key: PrefabBuildingKey;
  originX: number;
  originZ: number;
  rotation: PrefabRotation;
};

type CameraPresetSettings = {
  position: [number, number, number];
  target: [number, number, number];
  zoom: number;
};

type NaturalObjectCleanupResult = {
  treesRemoved: number;
  stonesRemoved: number;
};

type WalkwayPathKind = 'trunk' | 'branch';

type WalkwayPathNode = {
  id: string;
  position: [number, number];
  buildingIndex?: number;
};

type WalkwayPathSegment = {
  from: string;
  to: string;
  kind: WalkwayPathKind;
};

type WalkwayPathGraph = {
  nodes: WalkwayPathNode[];
  segments: WalkwayPathSegment[];
};

type SimulationWorker = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  state: WorkerRunState;
  baseColor: number;
  homeBuildingIndex: number;
  currentNodeId: string;
  routeNodeIds: string[];
  routeIndex: number;
  selected: boolean;
  speed: number;
  laneOffset: number;
};

type GrassTexturePathOverlay = {
  bounds: THREE.Box2;
  graph: WalkwayPathGraph | null;
};

type ActiveFireworkBurst = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  plan: FireworkBurstPlan;
  directions: Array<[number, number, number]>;
  startedAtSeconds: number;
};

type FireworksFinaleState = {
  plan: FireworksShowPlan;
  startedAtSeconds: number;
  nextBurstIndex: number;
  origin: THREE.Vector3;
  bursts: ActiveFireworkBurst[];
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
};

const MIN_DRAW_POINT_DISTANCE = 0.08;
const MIN_FINISH_POINTS = 6;
const TOP_LIFT = 0.015;
const GRASS_TEXTURE_SIZE = 512;
const PRESET_STORAGE_KEY = 'boomtown-island-procedural-presets';
const EMPTY_PRESET_OPTION = 'No saved presets';
const PREFAB_NATURAL_OBJECT_CLEARANCE = 0.06;
const OCEAN_PLANE_SIZE = 160;
const SIMULATION_START_HOUR = 8;
const SIMULATION_DAY_MINUTES = GAME_RULES.schedule.workdayMinutes;
const SIMULATION_RETURN_MINUTE = GAME_RULES.schedule.returnMinute;
const SIMULATION_MINUTES_PER_REAL_SECOND = GAME_RULES.schedule.simulationMinutesPerRealSecond;
const SIMULATION_BASE_REALTIME_MULTIPLIER = GAME_RULES.schedule.baselineRealtimeMultiplier;
const SIMULATION_CLOCK_STEP_MINUTES = GAME_RULES.schedule.clockStepMinutes;
const SIMULATION_WORKER_SPEED = 2.46;
const SIMULATION_WORKER_LANE_OFFSET = 0.16;
const SIMULATION_WORKER_MIN_SEPARATION = 0.28;
const SIMULATION_GATHER_SECONDS = GAME_RULES.workers.gatherSeconds;
const SIMULATION_BUILDING_WORK_SECONDS = 0.3;
const SIMULATION_CLICK_DISTANCE = 5;
const SIMULATION_FINAL_DAY = GAME_RULES.schedule.finalDay;
const WORKER_STATE_COLORS: Record<WorkerTaskState, number> = {
  idle: 0xffffff,
  traveling: 0x62a9d8,
  gathering: 0x68bb73,
  delivering: 0xe5a43c,
  'producing-building': 0xba78d1,
  'returning-home': 0x9099a2,
};
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

function getVibeWaterPalette(vibe: VibePreset): {
  deep: THREE.Color;
  clear: THREE.Color;
  light: THREE.Color;
} {
  const background = new THREE.Color(vibe.background);
  const fog = new THREE.Color(vibe.fog);
  const sky = new THREE.Color(vibe.hemiSky);
  const shadow = new THREE.Color(vibe.hemiGround);
  const sunlight = new THREE.Color(vibe.sunColor);

  const deep = new THREE.Color(0x0b3650)
    .lerp(shadow, 0.38)
    .lerp(fog, 0.08)
    .multiplyScalar(THREE.MathUtils.lerp(0.75, 0.58, vibe.waterMood));
  const clear = new THREE.Color(0x3b939d)
    .lerp(fog, 0.26)
    .lerp(background, 0.08)
    .lerp(sunlight, vibe.warmMidtones * 0.07);
  const light = new THREE.Color(0xd6eee8)
    .lerp(sky, 0.32)
    .lerp(fog, 0.16)
    .lerp(sunlight, 0.08 + vibe.warmMidtones * 0.08);

  return { deep, clear, light };
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

function createGrassTexture(settings: GrassTextureSettings, pathOverlay?: GrassTexturePathOverlay): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = GRASS_TEXTURE_SIZE;
  canvas.height = GRASS_TEXTURE_SIZE;
  paintGrassTexture(canvas, settings);
  paintWalkwayPathsIntoGrassTexture(canvas, pathOverlay, settings.seed);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(pathOverlay?.graph ? 1 : settings.textureScale);
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

function paintWalkwayPathsIntoGrassTexture(
  canvas: HTMLCanvasElement,
  overlay: GrassTexturePathOverlay | undefined,
  seed: number,
): void {
  if (!overlay?.graph || overlay.graph.segments.length === 0) {
    return;
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  const { bounds, graph } = overlay;
  const size = bounds.getSize(new THREE.Vector2());
  if (size.x <= 0 || size.y <= 0) {
    return;
  }

  const random = createSeededRandom(seed * 41 + graph.segments.length * 97);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, new THREE.Vector2(node.position[0], node.position[1])]));
  const toCanvas = (point: THREE.Vector2): THREE.Vector2 =>
    new THREE.Vector2(
      THREE.MathUtils.mapLinear(point.x, bounds.min.x, bounds.max.x, 0, canvas.width),
      THREE.MathUtils.mapLinear(point.y, bounds.min.y, bounds.max.y, canvas.height, 0),
    );

  context.save();
  context.globalCompositeOperation = 'source-over';
  context.lineCap = 'round';
  context.lineJoin = 'round';

  graph.segments.forEach((segment, segmentIndex) => {
    const from = nodeById.get(segment.from);
    const to = nodeById.get(segment.to);
    if (!from || !to) {
      return;
    }

    const start = toCanvas(from);
    const end = toCanvas(to);
    const delta = end.clone().sub(start);
    const length = delta.length();
    if (length < 2) {
      return;
    }

    const direction = delta.clone().normalize();
    const normal = new THREE.Vector2(-direction.y, direction.x);
    const baseWidth = segment.kind === 'trunk' ? 34 : 24;
    const steps = Math.max(3, Math.round(length / 34));
    const pathPoints: THREE.Vector2[] = [];
    for (let index = 0; index <= steps; index += 1) {
      const t = index / steps;
      const edgeFade = Math.sin(t * Math.PI);
      const offset =
        (Math.sin((segmentIndex + 1) * 1.73 + t * 8.1) * 0.54 +
          Math.sin((segmentIndex + 3) * 0.92 + t * 16.7) * 0.28) *
        baseWidth *
        0.18 *
        edgeFade;
      pathPoints.push(start.clone().lerp(end, t).addScaledVector(normal, offset));
    }

    context.filter = 'blur(1.4px)';
    for (let pass = 0; pass < 6; pass += 1) {
      const widthJitter = THREE.MathUtils.lerp(0.95, 1.55, random());
      context.strokeStyle = `hsla(${THREE.MathUtils.lerp(32, 39, random())}, ${THREE.MathUtils.lerp(
        36,
        48,
        random(),
      )}%, ${THREE.MathUtils.lerp(45, 55, random())}%, ${THREE.MathUtils.lerp(0.1, 0.2, random())})`;
      context.lineWidth = baseWidth * widthJitter;
      context.beginPath();
      pathPoints.forEach((point, pointIndex) => {
        const edgeNoise = normal.clone().multiplyScalar((random() - 0.5) * baseWidth * 0.22);
        const noisy = point.clone().add(edgeNoise);
        if (pointIndex === 0) {
          context.moveTo(noisy.x, noisy.y);
        } else {
          context.lineTo(noisy.x, noisy.y);
        }
      });
      context.stroke();
    }

    context.filter = 'blur(0.9px)';
    const stainCount = Math.max(2, Math.round(length / 58));
    for (let index = 0; index < stainCount; index += 1) {
      const t = random();
      const center = start
        .clone()
        .lerp(end, t)
        .addScaledVector(normal, (random() - 0.5) * baseWidth * 0.48);
      drawSoftOval(
        context,
        center.x,
        center.y,
        baseWidth * THREE.MathUtils.lerp(0.28, 0.74, random()),
        baseWidth * THREE.MathUtils.lerp(0.1, 0.26, random()),
        Math.atan2(delta.y, delta.x) + (random() - 0.5) * 1.1,
        `hsla(${THREE.MathUtils.lerp(25, 34, random())}, ${THREE.MathUtils.lerp(
          30,
          44,
          random(),
        )}%, ${THREE.MathUtils.lerp(34, 43, random())}%, ${THREE.MathUtils.lerp(0.06, 0.14, random())})`,
      );
    }

    const blobCount = Math.max(3, Math.round(length / 34));
    for (let index = 0; index < blobCount; index += 1) {
      const t = (index + random() * 0.82) / blobCount;
      const center = start
        .clone()
        .lerp(end, t)
        .addScaledVector(normal, (random() - 0.5) * baseWidth * 0.36);
      const rotation = Math.atan2(delta.y, delta.x) + (random() - 0.5) * 0.95;
      drawSoftOval(
        context,
        center.x,
        center.y,
        baseWidth * THREE.MathUtils.lerp(0.34, 0.78, random()),
        baseWidth * THREE.MathUtils.lerp(0.13, 0.3, random()),
        rotation,
        `hsla(${THREE.MathUtils.lerp(33, 41, random())}, ${THREE.MathUtils.lerp(
          38,
          52,
          random(),
        )}%, ${THREE.MathUtils.lerp(48, 58, random())}%, ${THREE.MathUtils.lerp(0.12, 0.24, random())})`,
      );
      if (random() > 0.36) {
        drawSoftOval(
          context,
          center.x + normal.x * (random() - 0.5) * baseWidth * 0.16,
          center.y + normal.y * (random() - 0.5) * baseWidth * 0.16,
          baseWidth * THREE.MathUtils.lerp(0.14, 0.34, random()),
          baseWidth * THREE.MathUtils.lerp(0.05, 0.12, random()),
          rotation + (random() - 0.5) * 0.8,
          `hsla(${THREE.MathUtils.lerp(40, 48, random())}, ${THREE.MathUtils.lerp(
            44,
            58,
            random(),
          )}%, ${THREE.MathUtils.lerp(60, 70, random())}%, ${THREE.MathUtils.lerp(0.09, 0.2, random())})`,
        );
      }
    }

    context.filter = 'blur(0.65px)';
    const dustySpotCount = Math.max(2, Math.round(length / 44));
    for (let index = 0; index < dustySpotCount; index += 1) {
      const t = random();
      const center = start
        .clone()
        .lerp(end, t)
        .addScaledVector(normal, (random() - 0.5) * baseWidth * 0.52);
      drawSoftOval(
        context,
        center.x,
        center.y,
        baseWidth * THREE.MathUtils.lerp(0.13, 0.38, random()),
        baseWidth * THREE.MathUtils.lerp(0.04, 0.12, random()),
        Math.atan2(delta.y, delta.x) + (random() - 0.5) * 0.9,
        `hsla(${THREE.MathUtils.lerp(42, 50, random())}, ${THREE.MathUtils.lerp(
          42,
          56,
          random(),
        )}%, ${THREE.MathUtils.lerp(64, 74, random())}%, ${THREE.MathUtils.lerp(0.08, 0.18, random())})`,
      );
    }

    context.filter = 'blur(0.8px)';
    const borderCount = Math.max(4, Math.round(length / 30));
    for (let index = 0; index < borderCount; index += 1) {
      const side = random() > 0.5 ? 1 : -1;
      const t = random();
      const center = start
        .clone()
        .lerp(end, t)
        .addScaledVector(normal, side * baseWidth * THREE.MathUtils.lerp(0.46, 0.72, random()));
      if (random() > 0.38) {
        drawSoftOval(
          context,
          center.x,
          center.y,
          baseWidth * THREE.MathUtils.lerp(0.08, 0.28, random()),
          baseWidth * THREE.MathUtils.lerp(0.04, 0.13, random()),
          Math.atan2(delta.y, delta.x) + (random() - 0.5) * 1.4,
          `hsla(${THREE.MathUtils.lerp(78, 104, random())}, ${THREE.MathUtils.lerp(
            32,
            48,
            random(),
          )}%, ${THREE.MathUtils.lerp(28, 42, random())}%, ${THREE.MathUtils.lerp(0.08, 0.2, random())})`,
        );
      } else {
        drawSoftOval(
          context,
          center.x,
          center.y,
          baseWidth * THREE.MathUtils.lerp(0.12, 0.32, random()),
          baseWidth * THREE.MathUtils.lerp(0.04, 0.12, random()),
          random() * Math.PI,
          `hsla(${THREE.MathUtils.lerp(26, 36, random())}, 32%, ${THREE.MathUtils.lerp(
            30,
            39,
            random(),
          )}%, ${THREE.MathUtils.lerp(0.04, 0.11, random())})`,
        );
      }
    }
  });

  context.filter = 'none';
  context.restore();
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
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uClarity: { value: settings.clarity },
      uChoppiness: { value: settings.choppiness },
      uAmplitude: { value: THREE.MathUtils.lerp(0.12, 0.62, settings.choppiness) },
      uFrequency: { value: THREE.MathUtils.lerp(0.22, 0.62, settings.choppiness) },
      uSpeed: { value: THREE.MathUtils.lerp(0.55, 1.75, settings.choppiness) },
      uDeepColor: { value: new THREE.Color(0x0d2c48) },
      uClearColor: { value: new THREE.Color(0x4fa7a1) },
      uLightColor: { value: new THREE.Color(0xd6eee8) },
    },
  ]);

  return new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: `
      #include <fog_pars_vertex>

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
        displaced.y += wave * uAmplitude;
        vWave = wave * 0.5 + 0.5;
        vGrid = displaced.xy;
        vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      #include <fog_pars_fragment>

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
        #include <fog_fragment>
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

function isHiddenInstanceMatrix(matrix: THREE.Matrix4): boolean {
  const elements = matrix.elements;
  return elements[0] === 0 && elements[5] === 0 && elements[10] === 0;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function createOutlineVectors(points: Array<[number, number]>): THREE.Vector2[] {
  return points
    .filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(([x, y]) => new THREE.Vector2(x, y));
}

function normalizePrefabPlacementPresets(placements: PrefabPlacementPreset[]): PrefabPlacementPreset[] {
  return placements.flatMap((placement) => {
    const hasDefinition = PREFAB_BUILDINGS.some((definition) => definition.key === placement.key);
    const rotation = Number.isInteger(placement.rotation) ? placement.rotation : 0;
    if (
      !hasDefinition ||
      !Number.isFinite(placement.originX) ||
      !Number.isFinite(placement.originZ) ||
      rotation < 0 ||
      rotation > 7
    ) {
      return [];
    }

    return [
      {
        key: placement.key,
        originX: Math.round(placement.originX),
        originZ: Math.round(placement.originZ),
        rotation: rotation as PrefabRotation,
      },
    ];
  });
}

function normalizeCameraPresetSettings(settings: CameraPresetSettings): CameraPresetSettings | null {
  const { position, target, zoom } = settings;
  const hasPosition = Array.isArray(position) && position.length === 3 && position.every(Number.isFinite);
  const hasTarget = Array.isArray(target) && target.length === 3 && target.every(Number.isFinite);
  if (!hasPosition || !hasTarget || !Number.isFinite(zoom)) {
    return null;
  }

  return {
    position: [position[0], position[1], position[2]],
    target: [target[0], target[1], target[2]],
    zoom,
  };
}

function normalizeWalkwayPathGraph(graph: WalkwayPathGraph): WalkwayPathGraph | null {
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.segments)) {
    return null;
  }

  const nodes = graph.nodes.flatMap((node) => {
    if (
      typeof node.id !== 'string' ||
      !Array.isArray(node.position) ||
      node.position.length !== 2 ||
      !Number.isFinite(node.position[0]) ||
      !Number.isFinite(node.position[1])
    ) {
      return [];
    }

    return [
      {
        id: node.id,
        position: [node.position[0], node.position[1]] as [number, number],
        buildingIndex: Number.isInteger(node.buildingIndex) ? node.buildingIndex : undefined,
      },
    ];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const segments = graph.segments.filter(
    (segment) =>
      nodeIds.has(segment.from) &&
      nodeIds.has(segment.to) &&
      segment.from !== segment.to &&
      (segment.kind === 'trunk' || segment.kind === 'branch'),
  );

  return nodes.length >= 2 && segments.length > 0 ? { nodes, segments } : null;
}

function closestPointOnSegment(point: THREE.Vector2, start: THREE.Vector2, end: THREE.Vector2): THREE.Vector2 {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  if (lengthSq === 0) {
    return start.clone();
  }

  const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  return start.clone().addScaledVector(segment, t);
}

function closestPointOnPolygonBoundary(point: THREE.Vector2, polygon: THREE.Vector2[]): THREE.Vector2 {
  let closest = polygon[0]?.clone() ?? point.clone();
  let closestDistanceSq = Infinity;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const candidate = closestPointOnSegment(point, start, end);
    const distanceSq = candidate.distanceToSquared(point);
    if (distanceSq < closestDistanceSq) {
      closest = candidate;
      closestDistanceSq = distanceSq;
    }
  }
  return closest;
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
  const bounds = new THREE.Box2().setFromPoints(outlinePoints);
  const size = bounds.getSize(new THREE.Vector2());
  const positions = geometry.attributes.position;
  const uvs: number[] = [];
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    uvs.push(
      size.x === 0 ? 0 : (x - bounds.min.x) / size.x,
      size.y === 0 ? 0 : (z - bounds.min.y) / size.y,
    );
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
  const base = new THREE.Color(0xd4a672);
  const accents = [
    new THREE.Color(0x9a7e68),
    new THREE.Color(0x8a7d78),
    new THREE.Color(0xae8969),
    new THREE.Color(0xe9b97d),
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
  private readonly prefabLayer = new THREE.Group();
  private readonly walkwayLayer = new THREE.Group();
  private readonly simulationLayer = new THREE.Group();
  private readonly placedPrefabs: PlacedPrefab[] = [];
  private readonly occupiedPrefabCells = new Set<string>();
  private presetSelectController: GuiOptionController | null = null;
  private prefabStatusController: GuiDisplayController | null = null;
  private pathStatusController: GuiDisplayController | null = null;
  private prefabRotationController: GuiDisplayController | null = null;
  private selectedPlacedPrefab: PlacedPrefab | null = null;
  private selectedPrefabHelper: THREE.BoxHelper | null = null;
  private prefabPlacementsToRestore: PrefabPlacementPreset[] | null = null;
  private walkwayPathsToRestore: WalkwayPathGraph | null = null;
  private cameraSettingsToRestore: CameraPresetSettings | null = null;
  private walkwayPathGraph: WalkwayPathGraph | null = null;
  private presetNames: string[] = [];
  private readonly presetUi = {
    name: 'Island preset',
    selected: EMPTY_PRESET_OPTION,
  };
  private readonly prefabUi = {
    selected: PREFAB_BUILDINGS[0].label,
    placeMode: false,
    editMode: false,
    rotationDegrees: 0,
    status: '',
    pathStatus: '',
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
    edgeFog: true,
    fogStart: 36,
    fogEnd: 58,
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
  private currentIslandOutline: THREE.Vector2[] = [];
  private selectedPrefabRotation: PrefabRotation = 0;
  private previewLine: THREE.Line | null = null;
  private prefabPreview: THREE.Group | null = null;
  private prefabPreviewWorldPosition: THREE.Vector2 | null = null;
  private interactionMode: SceneInteractionMode = 'pan';
  private readonly simulationWorkers: SimulationWorker[] = [];
  private runState: BoomtownRunState = createBoomtownRunState();
  private simulationAccumulatorSeconds = 0;
  private simulationMarqueePointerId: number | null = null;
  private simulationMarqueeStart: THREE.Vector2 | null = null;
  private simulationMarqueeAdditive = false;
  private simulationNoticeClearAt = 0;
  private selectedSimulationBuildingIndex: number | null = null;
  private hoveredSimulationBuildingIndex: number | null = null;
  private readonly simulationTooltipPointer = new THREE.Vector2();
  private readonly simulationBuildingVisuals = new Map<number, THREE.Group>();
  private readonly validTargetHelpers: THREE.BoxHelper[] = [];
  private readonly orderConfirmations: Array<{ root: THREE.Object3D; clearAt: number }> = [];
  private readonly fireworksLayer = new THREE.Group();
  private fireworksFinale: FireworksFinaleState | null = null;
  private lastFrameTime = performance.now();
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
    if (this.canvas.tabIndex < 0) {
      this.canvas.tabIndex = 0;
    }
    this.loadLastSavedPreset(false);
    this.grassTexture = createGrassTexture(this.grassSettings);
    this.waterMaterial = createLowPolyOceanMaterial(this.waterSettings);
    this.prefabLayer.name = 'Placed prefab buildings';
    this.walkwayLayer.name = 'Procedural walking pathways';
    this.simulationLayer.name = 'Simulation workers';
    this.fireworksLayer.name = 'Procedural fireworks finale';
    this.scene.add(this.simulationLayer);
    this.scene.add(this.fireworksLayer);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.4, 0);
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minZoom = 0.25;
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
    this.setInteractionMode(this.interactionMode);
    this.tick();
  }

  public setInteractionMode(mode: SceneInteractionMode): void {
    const leavingSimulation = this.interactionMode === 'simulate' && mode !== 'simulate';
    if (leavingSimulation) {
      this.stopSimulation();
    }

    this.interactionMode = mode;
    this.prefabUi.placeMode = mode === 'build';
    this.prefabUi.editMode = mode === 'edit';

    if (mode !== 'build') {
      this.removePrefabPreview();
    }
    if (mode !== 'edit') {
      this.selectPlacedPrefab(null);
    }
    if (mode === 'path') {
      this.renderWalkwayPathsFromPlacedPrefabs();
    }
    if (mode === 'simulate') {
      this.startSimulation();
    }

    this.controls.enabled = mode === 'pan' || mode === 'path' || mode === 'simulate';
    this.controls.mouseButtons.LEFT = mode === 'simulate' ? (-1 as never) : THREE.MOUSE.ROTATE;
    this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    this.updateCanvasCursor();
    this.updateGuiDisplays();
    this.canvas.dispatchEvent(new CustomEvent<SceneInteractionMode>('scene-mode-change', { detail: mode }));
    this.canvas.focus();
  }

  public continueSimulation(): void {
    if (!this.runState.clock.running || this.runState.clock.day >= SIMULATION_FINAL_DAY) {
      return;
    }

    this.runState.clock.day += 1;
    this.runState.clock.elapsedSimulationSeconds = 0;
    this.runState.clock.clockMinutes = 0;
    this.runState.clock.returnStarted = false;
    this.runState.clock.paused = false;
    this.runState.clock.pauseReason = null;
    this.runState.daily.gathered = createEmptyInventory();
    this.runState.daily.delivered = createEmptyInventory();
    this.runState.daily.produced = 0;
    this.simulationAccumulatorSeconds = 0;
    this.clearSimulationWorkers();
    this.spawnSimulationWorkers();
    this.updateSimulationHud();
    this.updateSimulationPauseButton();
    this.showSimulationNotice(`July ${this.runState.clock.day}: assign fresh duties for the new workday.`);
  }

  public handleDayModalAction(): void {
    if (this.runState.clock.day >= SIMULATION_FINAL_DAY) {
      this.startSimulation();
      return;
    }
    this.continueSimulation();
  }

  public selectIdleWorkers(): void {
    if (this.runState.clock.returnStarted || this.fireworksFinale) {
      return;
    }
    const idleWorkers = this.simulationWorkers.filter(
      (worker) => worker.state.taskState === 'idle' && worker.state.cargo.length < WORKER_CARGO_CAPACITY,
    );
    this.simulationWorkers.forEach((worker) => this.setWorkerSelected(worker, idleWorkers.includes(worker)));
    this.showSimulationNotice(
      idleWorkers.length > 0
        ? `${idleWorkers.length} idle worker${idleWorkers.length === 1 ? '' : 's'} selected.`
        : 'No truly idle workers available.',
    );
  }

  public dismissOnboarding(): void {
    document.querySelector<HTMLElement>('.simulation-onboarding')?.setAttribute('hidden', '');
    window.localStorage.setItem('boomtown-onboarding-seen', '1');
    if (this.runState.clock.pauseReason === 'player') {
      this.runState.clock.paused = false;
      this.runState.clock.pauseReason = null;
      this.updateSimulationPauseButton();
    }
    this.canvas.focus();
  }

  public cycleSimulationSpeed(): void {
    const speed = this.runState.clock.speed;
    this.runState.clock.speed = speed === 1 ? 2 : speed === 2 ? 4 : speed === 4 ? 8 : 1;
    this.updateSimulationSpeedButton();
  }

  public toggleSimulationPause(): void {
    if (
      !this.runState.clock.running ||
      this.runState.clock.returnStarted ||
      !document.querySelector<HTMLElement>('.day-modal')?.hasAttribute('hidden')
    ) {
      return;
    }
    const playerPaused = this.runState.clock.pauseReason === 'player';
    this.runState.clock.paused = !playerPaused;
    this.runState.clock.pauseReason = playerPaused ? null : 'player';
    this.updateSimulationPauseButton();
    this.showSimulationNotice(playerPaused ? 'Simulation resumed.' : 'Paused. Inspect and queue assignments.');
  }

  private startSimulation(): void {
    this.stopSimulation();

    const store = this.readPresetStore();
    if (store.presets['Full Build']) {
      this.loadPreset('Full Build');
    }
    if (!this.walkwayPathGraph && this.hasAllRequiredPrefabBuildings()) {
      this.renderWalkwayPathsFromPlacedPrefabs();
    }

    this.prefabUi.placeMode = false;
    this.prefabUi.editMode = false;
    this.runState = resetBoomtownRunState();
    this.runState.objective.minimumLaunchableFireworks =
      GAME_RULES.objective.minimumLaunchableFireworks;
    const layoutError = this.getGameplayLayoutError();
    if (layoutError) {
      this.canvas.dataset.simulationActive = 'false';
      this.showSimulationNotice(layoutError);
      this.canvas.dispatchEvent(new CustomEvent('simulation-state-change'));
      return;
    }
    this.runState.clock.running = true;
    this.canvas.dataset.simulationActive = 'true';
    this.gui.domElement.hidden = true;
    this.simulationAccumulatorSeconds = 0;
    this.initializeSimulationBuildingInventories();
    this.createSimulationBuildingVisuals();
    this.selectedSimulationBuildingIndex =
      this.placedPrefabs.findIndex((prefab) => prefab.key === 'launchPad');
    this.lastFrameTime = performance.now();
    this.spawnSimulationWorkers();
    this.updateSimulationHud();
    this.updateSimulationSpeedButton();
    this.updateSimulationPauseButton();
    document.querySelector<HTMLElement>('.simulation-hud')?.removeAttribute('hidden');
    document.querySelector<HTMLElement>('.simulation-worker-panel')?.removeAttribute('hidden');
    document.querySelector<HTMLElement>('.simulation-building-panel')?.removeAttribute('hidden');
    document.querySelector<HTMLElement>('.simulation-objective-panel')?.removeAttribute('hidden');
    document.querySelector<HTMLElement>('.simulation-resource-hud')?.removeAttribute('hidden');
    document.querySelector<HTMLElement>('.day-modal')?.setAttribute('hidden', '');
    this.updateSimulationWorkerPanel();
    this.updateSimulationBuildingPanel();
    this.updateResourceHud();
    const onboarding = document.querySelector<HTMLElement>('.simulation-onboarding');
    if (window.localStorage.getItem('boomtown-onboarding-seen') !== '1') {
      this.runState.clock.paused = true;
      this.runState.clock.pauseReason = 'player';
      this.updateSimulationPauseButton();
      onboarding?.removeAttribute('hidden');
      document.querySelector<HTMLButtonElement>('.simulation-onboarding__dismiss')?.focus();
    } else {
      onboarding?.setAttribute('hidden', '');
    }
    this.canvas.dispatchEvent(new CustomEvent('simulation-state-change'));
    this.showSimulationNotice('Select workers, then click a resource building to gather.');
  }

  private stopSimulation(): void {
    this.stopFireworksFinale();
    this.runState.clock.running = false;
    this.runState.clock.paused = false;
    this.runState.clock.pauseReason = null;
    this.simulationAccumulatorSeconds = 0;
    this.simulationMarqueePointerId = null;
    this.simulationMarqueeStart = null;
    this.simulationMarqueeAdditive = false;
    this.clearSimulationWorkers();
    this.clearSimulationBuildingVisuals();
    this.clearValidTargetHighlights();
    this.clearOrderConfirmations();
    this.runState.buildings.clear();
    this.selectedSimulationBuildingIndex = null;
    delete this.canvas.dataset.simulationActive;
    this.gui.domElement.hidden = false;
    document.querySelector<HTMLElement>('.simulation-hud')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-worker-panel')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-building-panel')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-objective-panel')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-resource-hud')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-onboarding')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-notice')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-building-tooltip')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-effects')?.replaceChildren();
    this.hoveredSimulationBuildingIndex = null;
    document.querySelector<HTMLElement>('.selection-marquee')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.day-modal')?.setAttribute('hidden', '');
    this.canvas.dispatchEvent(new CustomEvent('simulation-state-change'));
  }

  private getGameplayLayoutError(): string | null {
    const mismatches = PREFAB_BUILDINGS.flatMap((definition) => {
      const actual = this.getPlacedPrefabCount(definition.key);
      return actual === definition.requiredCount
        ? []
        : [`${definition.label} (${actual}/${definition.requiredCount})`];
    });
    if (mismatches.length > 0) {
      return `Cannot start run. Load the Full Build layout; invalid building counts: ${mismatches.join(', ')}.`;
    }
    if (!this.walkwayPathGraph) {
      return 'Cannot start run. The Full Build layout needs a generated path graph.';
    }
    const connectedBuildings = new Set(
      this.walkwayPathGraph.nodes
        .map((node) => node.buildingIndex)
        .filter((index): index is number => index !== undefined),
    );
    if (this.placedPrefabs.some((_, index) => !connectedBuildings.has(index))) {
      return 'Cannot start run. Regenerate the Full Build paths so every building is connected.';
    }
    return null;
  }

  private initializeSimulationBuildingInventories(): void {
    initializeRunBuildings(this.runState, this.placedPrefabs.length);
  }

  private createSimulationBuildingVisuals(): void {
    this.clearSimulationBuildingVisuals();
    this.placedPrefabs.forEach((prefab, buildingIndex) => {
      if (prefab.key !== 'launchPad' && prefab.key !== 'fireworksFactory') {
        return;
      }
      const definition = getPrefabDefinition(prefab.key);
      const center = getPrefabWorldCenter(definition, prefab.placement);
      const visual = new THREE.Group();
      visual.name = `${definition.label} simulation progress`;
      visual.position.set(center.x, this.settings.rockHeight + definition.dimensions.height + 0.65, center.y);

      const background = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.12, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x26363c }),
      );
      const fill = new THREE.Mesh(
        new THREE.BoxGeometry(1.18, 0.075, 0.09),
        new THREE.MeshBasicMaterial({ color: prefab.key === 'launchPad' ? 0xf4d17a : 0x68bb73 }),
      );
      fill.name = 'Progress fill';
      fill.position.z = 0.01;
      fill.scale.x = 0.001;
      fill.position.x = -0.59;
      visual.add(background, fill);
      this.simulationLayer.add(visual);
      this.simulationBuildingVisuals.set(buildingIndex, visual);
    });
    this.updateSimulationBuildingVisuals();
  }

  private clearSimulationBuildingVisuals(): void {
    this.simulationBuildingVisuals.forEach((visual) => {
      visual.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material) => material.dispose());
        } else {
          mesh.material?.dispose();
        }
      });
      visual.removeFromParent();
    });
    this.simulationBuildingVisuals.clear();
  }

  private updateSimulationBuildingVisuals(): void {
    this.simulationBuildingVisuals.forEach((visual, buildingIndex) => {
      const prefab = this.placedPrefabs[buildingIndex];
      const fill = visual.getObjectByName('Progress fill') as THREE.Mesh | undefined;
      if (!prefab || !fill) {
        return;
      }
      const building = this.runState.buildings.get(buildingIndex);
      const progress = prefab.key === 'launchPad'
        ? this.runState.construction.launchFieldComplete
          ? getConstructionFraction(
            this.runState.construction.launchRackProgress,
            ECONOMY_RECIPES['launch-rack'].inputs,
          )
          : getConstructionFraction(
            this.runState.construction.launchFieldProgress,
            ECONOMY_RECIPES['launch-field'].inputs,
          )
        : Math.min(
          1,
          (building?.productionProgressSeconds ?? 0) /
          ECONOMY_RECIPES.fireworks.durationSeconds,
        );
      fill.scale.x = Math.max(0.001, progress);
      fill.position.x = -0.59 + (1.18 * progress) / 2;

      if (prefab.key === 'launchPad') {
        const rackCount = visual.children.filter((child) => child.name === 'Completed launch rack').length;
        for (let index = rackCount; index < this.runState.construction.launchRacks; index += 1) {
          const rack = new THREE.Group();
          rack.name = 'Completed launch rack';
          const base = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.09, 0.32),
            new THREE.MeshStandardMaterial({ color: 0x6f5741, roughness: 0.8 }),
          );
          rack.add(base);
          for (const offset of [-0.12, 0, 0.12]) {
            const rocket = new THREE.Mesh(
              new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8),
              new THREE.MeshStandardMaterial({ color: offset === 0 ? 0xf4f0df : 0xb9584d }),
            );
            rocket.position.set(offset, 0.2, 0);
            rack.add(rocket);
          }
          rack.position.set((index % 3) * 0.52 - 0.52, -0.5, Math.floor(index / 3) * 0.42);
          visual.add(rack);
        }
      }
    });
  }

  private spawnSimulationWorkers(): void {
    if (!this.walkwayPathGraph) {
      return;
    }

    this.placedPrefabs.forEach((prefab, buildingIndex) => {
      if (prefab.key !== 'house') {
        return;
      }

      const homeNode = this.getBuildingPathNode(buildingIndex);
      if (!homeNode) {
        return;
      }

      const neighborNode = this.getConnectedPathNodes(homeNode.id)[0];
      const homePosition = new THREE.Vector2(homeNode.position[0], homeNode.position[1]);
      const neighborPosition = neighborNode
        ? new THREE.Vector2(neighborNode.position[0], neighborNode.position[1])
        : homePosition.clone();
      const pathDirection = neighborPosition.sub(homePosition).normalize();

      for (let workerIndex = 0; workerIndex < 2; workerIndex += 1) {
        const baseColor = workerIndex === 0 ? 0x3f78a8 : 0xb9584d;
        const workerState = createWorkerRunState(`house-${buildingIndex}-worker-${workerIndex}`);
        const material = new THREE.MeshStandardMaterial({
          color: baseColor,
          roughness: 0.78,
        });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.22), material);
        const offset = 0.38 + workerIndex * 0.2;
        mesh.position.set(
          homePosition.x + pathDirection.x * offset,
          this.settings.rockHeight + TOP_LIFT + 0.2,
          homePosition.y + pathDirection.y * offset,
        );
        mesh.castShadow = true;
        mesh.name = `Worker from house ${buildingIndex + 1}`;
        this.simulationLayer.add(mesh);
        this.runState.workers.push(workerState);
        this.simulationWorkers.push({
          mesh,
          state: workerState,
          baseColor,
          homeBuildingIndex: buildingIndex,
          currentNodeId: homeNode.id,
          routeNodeIds: [],
          routeIndex: 0,
          selected: false,
          speed: SIMULATION_WORKER_SPEED,
          laneOffset: workerIndex === 0
            ? -SIMULATION_WORKER_LANE_OFFSET
            : SIMULATION_WORKER_LANE_OFFSET,
        });
      }
    });
    this.updateSimulationWorkerPanel();
  }

  private clearSimulationWorkers(): void {
    this.simulationWorkers.forEach((worker) => {
      worker.mesh.removeFromParent();
      worker.mesh.geometry.dispose();
      worker.mesh.material.dispose();
    });
    this.simulationWorkers.length = 0;
    this.runState.workers.length = 0;
    this.updateSimulationWorkerPanel();
  }

  private getBuildingPathNode(buildingIndex: number): WalkwayPathNode | null {
    return this.walkwayPathGraph?.nodes.find((node) => node.buildingIndex === buildingIndex) ?? null;
  }

  private getPathNode(nodeId: string): WalkwayPathNode | null {
    return this.walkwayPathGraph?.nodes.find((node) => node.id === nodeId) ?? null;
  }

  private getConnectedPathNodes(nodeId: string): WalkwayPathNode[] {
    if (!this.walkwayPathGraph) {
      return [];
    }

    const connectedIds = this.walkwayPathGraph.segments.flatMap((segment) =>
      segment.from === nodeId ? [segment.to] : segment.to === nodeId ? [segment.from] : [],
    );
    return connectedIds
      .map((connectedId) => this.getPathNode(connectedId))
      .filter((node): node is WalkwayPathNode => Boolean(node));
  }

  private findPathNodeIds(startNodeId: string, endNodeId: string): string[] {
    if (!this.walkwayPathGraph || startNodeId === endNodeId) {
      return [startNodeId];
    }

    const queue = [startNodeId];
    const previous = new Map<string, string | null>([[startNodeId, null]]);
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId) {
        break;
      }
      if (nodeId === endNodeId) {
        break;
      }

      this.getConnectedPathNodes(nodeId).forEach((neighbor) => {
        if (!previous.has(neighbor.id)) {
          previous.set(neighbor.id, nodeId);
          queue.push(neighbor.id);
        }
      });
    }

    if (!previous.has(endNodeId)) {
      return [];
    }

    const path: string[] = [];
    let current: string | null = endNodeId;
    while (current) {
      path.unshift(current);
      current = previous.get(current) ?? null;
    }
    return path;
  }

  private routeWorkerToBuilding(worker: SimulationWorker, buildingIndex: number): boolean {
    const destinationNode = this.getBuildingPathNode(buildingIndex);
    if (!destinationNode) {
      return false;
    }

    const currentTargetId = worker.routeNodeIds[worker.routeIndex];
    const anchorNodeId = currentTargetId ?? worker.currentNodeId;
    const path = this.findPathNodeIds(anchorNodeId, destinationNode.id);
    if (path.length === 0) {
      return false;
    }

    worker.routeNodeIds = currentTargetId || path.length === 1 ? path : path.slice(1);
    worker.routeIndex = 0;
    worker.speed = SIMULATION_WORKER_SPEED;
    return true;
  }

  private setWorkerTaskState(worker: SimulationWorker, state: WorkerTaskState): void {
    worker.state.taskState = state;
    const stateColor = WORKER_STATE_COLORS[state];
    worker.mesh.material.color.setHex(state === 'idle' ? worker.baseColor : stateColor);
    this.updateSimulationWorkerPanel();
  }

  private beginWorkerOrder(
    worker: SimulationWorker,
    buildingIndex: number,
    action: WorkerOrderAction,
    preserveLoop = false,
  ): boolean {
    if (!preserveLoop) {
      worker.state.loop = null;
      worker.state.pendingLoopSourceBuildingIndex = null;
    }
    if (!this.routeWorkerToBuilding(worker, buildingIndex)) {
      worker.state.orderAction = null;
      worker.state.targetBuildingIndex = null;
      this.setWorkerTaskState(worker, 'idle');
      return false;
    }

    worker.state.orderAction = action;
    worker.state.targetBuildingIndex = buildingIndex;
    worker.state.taskProgressSeconds = 0;
    this.setWorkerTaskState(
      worker,
      action === 'return-home' ? 'returning-home' : action === 'deliver' ? 'delivering' : 'traveling',
    );
    return true;
  }

  private getBuildingLabel(buildingIndex: number): string {
    const prefab = this.placedPrefabs[buildingIndex];
    return prefab ? getPrefabDefinition(prefab.key).label : 'building';
  }

  private getBuildingResourceCount(
    buildingIndex: number,
    resource: ResourceType,
    inventoryKind: 'input' | 'output' = 'input',
  ): number {
    return getRunBuildingInventory(this.runState, buildingIndex, inventoryKind)[resource];
  }

  private addBuildingResource(
    buildingIndex: number,
    resource: ResourceType,
    amount: number,
    inventoryKind: 'input' | 'output' = 'input',
  ): void {
    const inventory = getRunBuildingInventory(this.runState, buildingIndex, inventoryKind);
    if (amount >= 0) {
      addResource(inventory, resource, amount);
    } else {
      removeResource(inventory, resource, -amount);
    }
  }

  private canGatherAtBuilding(worker: SimulationWorker, buildingIndex: number): boolean {
    const prefab = this.placedPrefabs[buildingIndex];
    if (!prefab || !isResourceSource(prefab.key) || worker.state.cargo.length >= WORKER_CARGO_CAPACITY) {
      return false;
    }
    return (
      prefab.key !== 'fireworksFactory' ||
      this.getBuildingResourceCount(buildingIndex, 'fireworks', 'output') > 0
    );
  }

  private issueOneShotWorkerOrder(worker: SimulationWorker, buildingIndex: number): 'gather' | 'deliver' | 'invalid' {
    const prefab = this.placedPrefabs[buildingIndex];
    if (!prefab) {
      return 'invalid';
    }
    if (
      prefab.key === 'launchPad' &&
      !this.runState.construction.launchFieldComplete &&
      worker.state.cargo.includes('fireworks') &&
      !worker.state.cargo.some((resource) => resource === 'wood' || resource === 'stone')
    ) {
      return 'invalid';
    }

    if (acceptsAnyCargo(prefab.key, worker.state.cargo)) {
      return this.beginWorkerOrder(worker, buildingIndex, 'deliver') ? 'deliver' : 'invalid';
    }
    if (this.canGatherAtBuilding(worker, buildingIndex)) {
      return this.beginWorkerOrder(worker, buildingIndex, 'gather') ? 'gather' : 'invalid';
    }
    return 'invalid';
  }

  private issueOneShotBuildingOrder(workers: SimulationWorker[], buildingIndex: number): void {
    let gathering = 0;
    let delivering = 0;
    workers.forEach((worker) => {
      const result = this.issueOneShotWorkerOrder(worker, buildingIndex);
      gathering += result === 'gather' ? 1 : 0;
      delivering += result === 'deliver' ? 1 : 0;
    });

    const label = this.getBuildingLabel(buildingIndex);
    if (gathering > 0) {
      this.showOrderConfirmation(workers, buildingIndex);
      this.showSimulationNotice(`${gathering} worker${gathering === 1 ? '' : 's'} gathering at ${label}.`);
    } else if (delivering > 0) {
      this.showOrderConfirmation(workers, buildingIndex);
      this.showSimulationNotice(`${delivering} worker${delivering === 1 ? '' : 's'} delivering to ${label}.`);
    } else {
      const prefab = this.placedPrefabs[buildingIndex];
      const prematureFireworks =
        prefab?.key === 'launchPad' &&
        !this.runState.construction.launchFieldComplete &&
        workers.some((worker) => worker.state.cargo.includes('fireworks'));
      this.showSimulationNotice(
        prematureFireworks
          ? 'Launch Field incomplete: finish wood and stone construction first.'
          : `No compatible or reachable order for ${label}.`,
      );
    }
  }

  private issueShiftBuildingOrder(workers: SimulationWorker[], buildingIndex: number): void {
    const clickedPrefab = this.placedPrefabs[buildingIndex];
    if (!clickedPrefab) {
      return;
    }

    const awaitingDestination = workers.some(
      (worker) => worker.state.pendingLoopSourceBuildingIndex !== null,
    );
    if (!awaitingDestination) {
      if (!isResourceSource(clickedPrefab.key)) {
        this.showSimulationNotice('Shift-loop step 1 must be a resource source.');
        return;
      }
      workers.forEach((worker) => {
        worker.state.pendingLoopSourceBuildingIndex = buildingIndex;
        worker.state.loop = null;
      });
      this.updateSimulationWorkerPanel();
      this.showSimulationNotice(`Loop source set to ${this.getBuildingLabel(buildingIndex)}. Shift-click a destination.`);
      return;
    }

    let created = 0;
    workers.forEach((worker) => {
      const sourceBuildingIndex = worker.state.pendingLoopSourceBuildingIndex;
      const sourcePrefab = sourceBuildingIndex === null ? null : this.placedPrefabs[sourceBuildingIndex];
      worker.state.pendingLoopSourceBuildingIndex = null;
      if (
        sourceBuildingIndex === null ||
        !sourcePrefab ||
        !canCreateLoop(sourcePrefab.key, clickedPrefab.key)
      ) {
        return;
      }

      worker.state.loop = { sourceBuildingIndex, destinationBuildingIndex: buildingIndex };
      if (this.beginWorkerOrder(worker, sourceBuildingIndex, 'gather', true)) {
        created += 1;
      } else {
        worker.state.loop = null;
      }
    });

    this.updateSimulationWorkerPanel();
    if (created > 0) {
      this.showOrderConfirmation(workers, buildingIndex);
      this.showSimulationNotice(
        `${created} harvest loop${created === 1 ? '' : 's'} assigned to ${this.getBuildingLabel(buildingIndex)}.`,
      );
    } else {
      this.showSimulationNotice('That source cannot supply a resource accepted by this destination.');
    }
  }

  private completeWorkerDelivery(worker: SimulationWorker, buildingIndex: number): void {
    const prefab = this.placedPrefabs[buildingIndex];
    if (!prefab) {
      this.finishWorkerOrder(worker);
      return;
    }

    const cargoInventory = resourceListToInventory(worker.state.cargo);
    const transferredAmounts = prefab.key === 'launchPad'
      ? deliverToLaunchField(
        this.runState,
        cargoInventory,
        getRunBuildingInventory(this.runState, buildingIndex, 'input'),
      ).transferred
      : transferAcceptedResources(
        cargoInventory,
        getRunBuildingInventory(this.runState, buildingIndex, 'input'),
        getAcceptedResources(prefab.key),
      );
    const transferred = inventoryToResourceList({
      wood: transferredAmounts.wood ?? 0,
      water: transferredAmounts.water ?? 0,
      ore: transferredAmounts.ore ?? 0,
      stone: transferredAmounts.stone ?? 0,
      fireworks: transferredAmounts.fireworks ?? 0,
    });
    RESOURCE_TYPES.forEach((resource) => {
      addResource(this.runState.daily.delivered, resource, transferredAmounts[resource] ?? 0);
    });
    this.showResourceDeliveryPopups(buildingIndex, transferredAmounts);
    worker.state.cargo = inventoryToResourceList(cargoInventory);
    worker.state.taskProgressSeconds = 0;
    this.setWorkerTaskState(worker, 'producing-building');

    if (transferred.length > 0) {
      this.showSimulationNotice(`Delivered ${summarizeResources(transferred)} to ${this.getBuildingLabel(buildingIndex)}.`);
    } else {
      this.showSimulationNotice(`${this.getBuildingLabel(buildingIndex)} does not accept this worker's cargo.`);
    }
    this.updateSimulationBuildingVisuals();
    this.updateSimulationBuildingPanel();
    this.updateSimulationObjectivePanel();
    this.refreshSimulationBuildingTooltip();
    this.updateValidTargetHighlights();
  }

  private finishWorkerOrder(worker: SimulationWorker): void {
    worker.state.orderAction = null;
    worker.state.targetBuildingIndex = null;
    worker.state.taskProgressSeconds = 0;
    this.setWorkerTaskState(worker, 'idle');
  }

  private clearValidTargetHighlights(): void {
    this.validTargetHelpers.splice(0).forEach((helper) => {
      helper.removeFromParent();
      helper.geometry.dispose();
      helper.material.dispose();
    });
  }

  private updateValidTargetHighlights(): void {
    this.clearValidTargetHighlights();
    if (!this.runState.clock.running || this.runState.clock.returnStarted) {
      return;
    }
    const selectedWorkers = this.simulationWorkers.filter((worker) => worker.selected);
    if (selectedWorkers.length === 0) {
      return;
    }
    this.placedPrefabs.forEach((prefab, buildingIndex) => {
      const valid = selectedWorkers.some(
        (worker) => {
          const launchBlocked =
            prefab.key === 'launchPad' &&
            !this.runState.construction.launchFieldComplete &&
            worker.state.cargo.includes('fireworks') &&
            !worker.state.cargo.some((resource) => resource === 'wood' || resource === 'stone');
          return !launchBlocked && (
            acceptsAnyCargo(prefab.key, worker.state.cargo) ||
            this.canGatherAtBuilding(worker, buildingIndex)
          );
        },
      );
      if (!valid) {
        return;
      }
      const helper = new THREE.BoxHelper(prefab.group, 0x74e58c);
      helper.name = 'Valid worker target';
      this.scene.add(helper);
      this.validTargetHelpers.push(helper);
    });
  }

  private showOrderConfirmation(workers: SimulationWorker[], buildingIndex: number): void {
    const prefab = this.placedPrefabs[buildingIndex];
    if (!prefab) {
      return;
    }
    const root = new THREE.Group();
    root.name = 'Worker order confirmation';
    const definition = getPrefabDefinition(prefab.key);
    const center = getPrefabWorldCenter(definition, prefab.placement);
    const y = this.settings.rockHeight + 0.12;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.36, 24),
      new THREE.MeshBasicMaterial({
        color: 0x74e58c,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, y, center.y);
    root.add(ring);
    workers.slice(0, 8).forEach((worker) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(worker.mesh.position.x, y, worker.mesh.position.z),
          new THREE.Vector3(center.x, y, center.y),
        ]),
        new THREE.LineBasicMaterial({ color: 0x74e58c, transparent: true, opacity: 0.55 }),
      );
      root.add(line);
    });
    this.scene.add(root);
    this.orderConfirmations.push({ root, clearAt: performance.now() + 900 });
  }

  private clearOrderConfirmations(now = Number.POSITIVE_INFINITY): void {
    for (let index = this.orderConfirmations.length - 1; index >= 0; index -= 1) {
      const confirmation = this.orderConfirmations[index];
      if (confirmation.clearAt > now) {
        continue;
      }
      confirmation.root.traverse((object) => {
        const renderable = object as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        renderable.geometry?.dispose();
        if (Array.isArray(renderable.material)) {
          renderable.material.forEach((material) => material.dispose());
        } else {
          renderable.material?.dispose();
        }
      });
      confirmation.root.removeFromParent();
      this.orderConfirmations.splice(index, 1);
    }
  }

  private continueWorkerLoopAfterDelivery(worker: SimulationWorker): void {
    const loop = worker.state.loop;
    if (!loop || this.runState.clock.returnStarted) {
      this.finishWorkerOrder(worker);
      return;
    }
    if (worker.state.cargo.length >= WORKER_CARGO_CAPACITY) {
      worker.state.loop = null;
      this.showSimulationNotice('A worker loop stopped because rejected cargo filled every slot.');
      this.finishWorkerOrder(worker);
      return;
    }
    this.beginWorkerOrder(worker, loop.sourceBuildingIndex, 'gather', true);
  }

  private handleWorkerArrival(worker: SimulationWorker): void {
    const action = worker.state.orderAction;
    const buildingIndex = worker.state.targetBuildingIndex;
    if (action === null || buildingIndex === null) {
      this.finishWorkerOrder(worker);
      return;
    }

    if (action === 'return-home') {
      const homePrefab = this.placedPrefabs[worker.homeBuildingIndex];
      if (homePrefab) {
        const center = getPrefabWorldCenter(
          getPrefabDefinition(homePrefab.key),
          homePrefab.placement,
        );
        worker.mesh.position.x = center.x;
        worker.mesh.position.z = center.y;
      }
      worker.mesh.visible = false;
      this.finishWorkerOrder(worker);
      return;
    }
    if (action === 'deliver') {
      this.setWorkerTaskState(worker, 'delivering');
      this.completeWorkerDelivery(worker, buildingIndex);
      return;
    }

    worker.state.taskProgressSeconds = 0;
    this.setWorkerTaskState(worker, 'gathering');
  }

  private sendWorkersHome(currentMinute: number): void {
    this.runState.clock.returnStarted = true;
    const remainingRealSeconds =
      (SIMULATION_DAY_MINUTES - currentMinute) / SIMULATION_MINUTES_PER_REAL_SECOND;
    let discardedResources = 0;

    this.simulationWorkers.forEach((worker) => {
      discardedResources += worker.state.cargo.length;
      worker.state.cargo = [];
      worker.state.loop = null;
      worker.state.pendingLoopSourceBuildingIndex = null;
      this.beginWorkerOrder(worker, worker.homeBuildingIndex, 'return-home');
      const remainingDistance = this.getWorkerRemainingRouteDistance(worker);
      worker.speed = remainingDistance > 0 ? remainingDistance / Math.max(0.01, remainingRealSeconds) : 0;
      this.setWorkerSelected(worker, false);
    });
    this.runState.daySummaries.push({
      day: this.runState.clock.day,
      discardedCargo: discardedResources,
      gathered: { ...this.runState.daily.gathered },
      delivered: { ...this.runState.daily.delivered },
      produced: this.runState.daily.produced,
      staged: this.runState.fireworks.staged,
      launchCapacity: getLaunchCapacity(this.runState),
      launchFieldProgress: getConstructionFraction(
        this.runState.construction.launchFieldProgress,
        ECONOMY_RECIPES['launch-field'].inputs,
      ),
      launchRacks: this.runState.construction.launchRacks,
    });
    this.updateSimulationWorkerPanel();
    this.showSimulationNotice(
      discardedResources > 0
        ? `Workday ended. ${discardedResources} carried resource${discardedResources === 1 ? '' : 's'} discarded.`
        : 'Workday ended. Workers are returning home.',
    );
  }

  private getWorkerRemainingRouteDistance(worker: SimulationWorker): number {
    let distance = 0;
    const currentPosition = new THREE.Vector2(worker.mesh.position.x, worker.mesh.position.z);
    for (let index = worker.routeIndex; index < worker.routeNodeIds.length; index += 1) {
      const node = this.getPathNode(worker.routeNodeIds[index]);
      if (!node) {
        continue;
      }
      const nodePosition = new THREE.Vector2(node.position[0], node.position[1]);
      distance += currentPosition.distanceTo(nodePosition);
      currentPosition.copy(nodePosition);
    }
    return distance;
  }

  private updateSimulation(deltaSeconds: number): void {
    if (!this.runState.clock.running || this.runState.clock.paused) {
      return;
    }

    this.runState.clock.elapsedSimulationSeconds += deltaSeconds;
    const exactMinutes =
      this.runState.clock.elapsedSimulationSeconds * SIMULATION_MINUTES_PER_REAL_SECOND;
    const steppedMinutes =
      Math.floor(exactMinutes / SIMULATION_CLOCK_STEP_MINUTES) * SIMULATION_CLOCK_STEP_MINUTES;
    const nextClockMinutes = Math.min(SIMULATION_DAY_MINUTES, steppedMinutes);
    if (nextClockMinutes !== this.runState.clock.clockMinutes) {
      this.runState.clock.clockMinutes = nextClockMinutes;
      this.updateSimulationHud();
    }

    if (!this.runState.clock.returnStarted && exactMinutes >= SIMULATION_RETURN_MINUTE) {
      this.sendWorkersHome(exactMinutes);
    }

    this.updateSimulationWorkers(deltaSeconds);
    this.updateBuildingProduction(deltaSeconds);
    if (exactMinutes >= SIMULATION_DAY_MINUTES) {
      this.runState.clock.clockMinutes = SIMULATION_DAY_MINUTES;
      this.updateSimulationHud();
      this.finishSimulationDay();
    }
  }

  private getAssignedWorkerCount(buildingIndex: number, role: 'source' | 'destination'): number {
    return this.simulationWorkers.filter((worker) => {
      if (role === 'source' && worker.state.loop?.sourceBuildingIndex === buildingIndex) {
        return true;
      }
      if (role === 'destination' && worker.state.loop?.destinationBuildingIndex === buildingIndex) {
        return true;
      }
      return worker.state.targetBuildingIndex === buildingIndex &&
        (role === 'source'
          ? worker.state.orderAction === 'gather'
          : worker.state.orderAction === 'deliver' || worker.state.taskState === 'producing-building');
    }).length;
  }

  private updateBuildingProduction(deltaSeconds: number): void {
    this.placedPrefabs.forEach((prefab, buildingIndex) => {
      const building = this.runState.buildings.get(buildingIndex);
      if (!building) {
        return;
      }
      building.activeWorkers = this.getAssignedWorkerCount(
        buildingIndex,
        prefab.key === 'fireworksFactory' ? 'destination' : 'source',
      );
      if (prefab.key !== 'fireworksFactory') {
        return;
      }
      const produced = updateFireworksFactory(
        building,
        deltaSeconds,
        building.activeWorkers,
      );
      if (produced > 0) {
        this.runState.fireworks.produced += produced;
        this.runState.daily.produced += produced;
      }
    });
    this.updateSimulationBuildingVisuals();
    this.updateSimulationBuildingPanel();
    this.updateSimulationObjectivePanel();
    this.refreshSimulationBuildingTooltip();
  }

  private updateSimulationWorkers(deltaSeconds: number): void {
    this.simulationWorkers.forEach((worker) => {
      if (worker.state.taskState === 'gathering') {
        this.updateWorkerGathering(worker, deltaSeconds);
        return;
      }
      if (worker.state.taskState === 'producing-building') {
        worker.state.taskProgressSeconds += deltaSeconds;
        if (worker.state.taskProgressSeconds >= SIMULATION_BUILDING_WORK_SECONDS) {
          this.continueWorkerLoopAfterDelivery(worker);
        }
        return;
      }

      const hadRoute = worker.routeNodeIds.length > 0;
      let remainingMovement = worker.speed * deltaSeconds;
      while (remainingMovement > 0 && worker.routeIndex < worker.routeNodeIds.length) {
        const targetNode = this.getPathNode(worker.routeNodeIds[worker.routeIndex]);
        if (!targetNode) {
          worker.routeIndex += 1;
          continue;
        }

        const target = this.getWorkerRouteTarget(worker, targetNode);
        const position = new THREE.Vector2(worker.mesh.position.x, worker.mesh.position.z);
        const distance = position.distanceTo(target);
        if (distance <= remainingMovement || distance < 0.001) {
          worker.mesh.position.x = target.x;
          worker.mesh.position.z = target.y;
          worker.currentNodeId = targetNode.id;
          worker.routeIndex += 1;
          remainingMovement -= distance;
          continue;
        }

        position.lerp(target, remainingMovement / distance);
        worker.mesh.position.x = position.x;
        worker.mesh.position.z = position.y;
        remainingMovement = 0;
      }

      if (worker.routeIndex >= worker.routeNodeIds.length) {
        worker.routeNodeIds = [];
        worker.routeIndex = 0;
        if (hadRoute) {
          this.handleWorkerArrival(worker);
        }
      }
    });
    this.resolveSimulationWorkerCrowding();
    this.updateSimulationWorkerPanel();
  }

  private getWorkerRouteTarget(
    worker: SimulationWorker,
    targetNode: WalkwayPathNode,
  ): THREE.Vector2 {
    const target = new THREE.Vector2(targetNode.position[0], targetNode.position[1]);
    const currentNode = this.getPathNode(worker.currentNodeId);
    if (!currentNode) {
      return target;
    }

    let direction = target.clone().sub(
      new THREE.Vector2(currentNode.position[0], currentNode.position[1]),
    );
    if (direction.lengthSq() < 0.0001) {
      const nextNodeId = worker.routeNodeIds[worker.routeIndex + 1];
      const nextNode = nextNodeId ? this.getPathNode(nextNodeId) : null;
      if (nextNode) {
        direction = new THREE.Vector2(
          nextNode.position[0] - targetNode.position[0],
          nextNode.position[1] - targetNode.position[1],
        );
      }
    }
    if (direction.lengthSq() < 0.0001) {
      return target;
    }

    direction.normalize();
    target.x += -direction.y * worker.laneOffset;
    target.y += direction.x * worker.laneOffset;
    return target;
  }

  private resolveSimulationWorkerCrowding(): void {
    const visibleWorkers = this.simulationWorkers.filter((worker) => worker.mesh.visible);
    const agents = visibleWorkers.map((worker) => ({
      id: worker.state.id,
      x: worker.mesh.position.x,
      z: worker.mesh.position.z,
    }));
    resolveCrowdOverlaps(agents, SIMULATION_WORKER_MIN_SEPARATION, 4);
    agents.forEach((agent, index) => {
      visibleWorkers[index].mesh.position.x = agent.x;
      visibleWorkers[index].mesh.position.z = agent.z;
    });
  }

  private updateWorkerGathering(worker: SimulationWorker, deltaSeconds: number): void {
    const buildingIndex = worker.state.targetBuildingIndex;
    const prefab = buildingIndex === null ? null : this.placedPrefabs[buildingIndex];
    if (buildingIndex === null || !prefab || !isResourceSource(prefab.key)) {
      this.finishWorkerOrder(worker);
      return;
    }

    worker.state.taskProgressSeconds += deltaSeconds;
    while (
      worker.state.taskProgressSeconds >= SIMULATION_GATHER_SECONDS &&
      worker.state.cargo.length < WORKER_CARGO_CAPACITY
    ) {
      const destinationPrefab = worker.state.loop
        ? this.placedPrefabs[worker.state.loop.destinationBuildingIndex] ?? null
        : null;
      const resource = getGatheredResource(
        prefab.key,
        destinationPrefab?.key ?? null,
        worker.state.quarryFallback,
      );
      if (!resource) {
        this.finishWorkerOrder(worker);
        return;
      }
      if (prefab.key === 'fireworksFactory') {
        const available = this.getBuildingResourceCount(buildingIndex, 'fireworks', 'output');
        if (available <= 0) {
          worker.state.taskProgressSeconds = 0;
          return;
        }
        this.addBuildingResource(buildingIndex, 'fireworks', -1, 'output');
      }

      worker.state.cargo.push(resource);
      addResource(this.runState.daily.gathered, resource, 1);
      worker.state.taskProgressSeconds -= SIMULATION_GATHER_SECONDS;
      if (prefab.key === 'quarry' && !worker.state.loop) {
        worker.state.quarryFallback = worker.state.quarryFallback === 'ore' ? 'stone' : 'ore';
      }
    }

    if (worker.state.cargo.length < WORKER_CARGO_CAPACITY) {
      return;
    }

    const loop = worker.state.loop;
    if (loop) {
      this.beginWorkerOrder(worker, loop.destinationBuildingIndex, 'deliver', true);
    } else {
      const gathered = summarizeResources(worker.state.cargo);
      this.finishWorkerOrder(worker);
      this.updateValidTargetHighlights();
      this.showSimulationNotice(`Worker load full: ${gathered}. Select a destination.`);
    }
  }

  private updateSimulationHud(): void {
    const date = document.querySelector<HTMLElement>('.simulation-hud__date');
    const clock = document.querySelector<HTMLTimeElement>('.simulation-hud__clock');
    if (date) {
      date.textContent = `July ${this.runState.clock.day}`;
    }
    if (clock) {
      const totalMinutes = SIMULATION_START_HOUR * 60 + this.runState.clock.clockMinutes;
      const hour24 = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const hour12 = hour24 % 12 || 12;
      const suffix = hour24 >= 12 ? 'PM' : 'AM';
      clock.textContent = `${hour12}:${minutes.toString().padStart(2, '0')} ${suffix}`;
      clock.dateTime = `2026-07-0${this.runState.clock.day}T${hour24.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}`;
    }
    this.updateSimulationObjectivePanel();
  }

  private updateSimulationSpeedButton(): void {
    const button = document.querySelector<HTMLButtonElement>('.simulation-hud__speed');
    if (button) {
      button.textContent = `${this.runState.clock.speed}×`;
      button.setAttribute('aria-label', `Simulation speed ${this.runState.clock.speed}x`);
    }
  }

  private updateSimulationPauseButton(): void {
    const button = document.querySelector<HTMLButtonElement>('.simulation-hud__pause');
    if (!button) {
      return;
    }
    const paused = this.runState.clock.pauseReason === 'player';
    button.textContent = paused ? '▶' : 'Ⅱ';
    button.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
    button.setAttribute('aria-pressed', String(paused));
  }

  private updateSimulationObjectivePanel(): void {
    const state = document.querySelector<HTMLElement>('.simulation-objective-panel__state');
    const counts = document.querySelector<HTMLElement>('.simulation-objective-panel__counts');
    const deadline = document.querySelector<HTMLElement>('.simulation-objective-panel__deadline');
    if (!state || !counts || !deadline) {
      return;
    }
    const launchable = getLaunchableFireworks(this.runState);
    const capacity = getLaunchCapacity(this.runState);
    const remainingMinutes =
      (SIMULATION_FINAL_DAY - this.runState.clock.day) * SIMULATION_DAY_MINUTES +
      (SIMULATION_DAY_MINUTES - this.runState.clock.clockMinutes);
    const days = Math.floor(remainingMinutes / SIMULATION_DAY_MINUTES);
    const minutesToday = remainingMinutes % SIMULATION_DAY_MINUTES;
    const hours = Math.floor(minutesToday / 60);
    const minutes = minutesToday % 60;
    state.textContent =
      `Launch Field: ${this.runState.construction.launchFieldComplete ? 'Built' : 'Not built'} · ` +
      `Capacity: ${capacity}`;
    counts.textContent =
      `Staged: ${this.runState.fireworks.staged} · Launchable: ${launchable} / ` +
      `${this.runState.objective.minimumLaunchableFireworks} minimum`;
    deadline.textContent =
      `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes.toString().padStart(2, '0')}m remaining`;
  }

  private updateResourceHud(): void {
    const stored = createEmptyInventory();
    this.runState.buildings.forEach((building) => {
      RESOURCE_TYPES.forEach((resource) => {
        stored[resource] += building.input[resource] + building.output[resource];
      });
    });
    for (const progress of [
      this.runState.construction.launchFieldProgress,
      this.runState.construction.launchRackProgress,
    ]) {
      RESOURCE_TYPES.forEach((resource) => {
        stored[resource] += progress[resource];
      });
    }
    const cargo = this.simulationWorkers.flatMap((worker) => worker.state.cargo);
    const values: Record<string, number> = {
      wood: stored.wood,
      water: stored.water,
      ore: stored.ore,
      stone: stored.stone,
      fireworks: this.runState.fireworks.produced,
      staged: this.runState.fireworks.staged,
      launchable: getLaunchableFireworks(this.runState),
    };
    Object.entries(values).forEach(([resource, value]) => {
      const element = document.querySelector<HTMLElement>(
        `.simulation-resource-hud [data-resource="${resource}"] strong`,
      );
      if (element) {
        element.textContent = String(value);
      }
    });
    const cargoElement = document.querySelector<HTMLElement>('.simulation-resource-hud__cargo');
    const capacityElement = document.querySelector<HTMLElement>('.simulation-resource-hud__capacity');
    if (cargoElement) {
      cargoElement.textContent = `In transit: ${cargo.length} (${summarizeResources(cargo)})`;
    }
    if (capacityElement) {
      capacityElement.textContent =
        `Capacity ${getLaunchCapacity(this.runState)} · Minimum ${this.runState.objective.minimumLaunchableFireworks}`;
    }
  }

  private finishSimulationDay(): void {
    this.runState.clock.paused = true;
    this.runState.clock.pauseReason = 'day-end';
    this.updateSimulationPauseButton();
    this.simulationWorkers.forEach((worker) => this.setWorkerSelected(worker, false));
    if (this.runState.clock.day >= SIMULATION_FINAL_DAY) {
      this.runState.result = resolveRunResult(this.runState);
      this.startFireworksFinale(this.runState.result.launched);
      return;
    }
    this.showDayResultModal();
  }

  private showDayResultModal(): void {
    const modal = document.querySelector<HTMLElement>('.day-modal');
    const title = document.querySelector<HTMLElement>('#day-modal-title');
    const summary = document.querySelector<HTMLElement>('.day-modal__summary');
    const metrics = document.querySelector<HTMLElement>('.day-modal__metrics');
    const button = document.querySelector<HTMLButtonElement>('.day-modal__button');
    const daySummary = this.runState.daySummaries.find(
      (entry) => entry.day === this.runState.clock.day,
    );
    if (title) {
      title.textContent = this.runState.result
        ? this.runState.result.success
          ? `Success · Grade ${this.runState.result.grade}`
          : 'Run Failed'
        : "Today's progress";
    }
    if (summary) {
      summary.textContent = this.runState.result
        ? this.runState.result.reaction
        : `July ${this.runState.clock.day} complete. Reassign everyone tomorrow morning.`;
    }
    if (metrics) {
      const entries = this.runState.result
        ? [
          `Produced ${this.runState.result.produced}`,
          `Staged ${this.runState.result.staged}`,
          `Capacity ${this.runState.result.capacity}`,
          `Launched ${this.runState.result.launched}`,
          `Unlaunchable ${this.runState.result.wasted}`,
          `Grade ${this.runState.result.grade}`,
        ]
        : [
          `Gathered ${daySummary ? summarizeResources(inventoryToResourceList(daySummary.gathered)) : '0'}`,
          `Delivered ${daySummary ? summarizeResources(inventoryToResourceList(daySummary.delivered)) : '0'}`,
          `Produced ${daySummary?.produced ?? 0}`,
          `Field ${Math.round((daySummary?.launchFieldProgress ?? 0) * 100)}%`,
          `Racks ${daySummary?.launchRacks ?? 0} · staged ${daySummary?.staged ?? 0}`,
          `Cargo wasted ${daySummary?.discardedCargo ?? 0}`,
        ];
      metrics.replaceChildren(...entries.map((text) => {
        const element = document.createElement('span');
        element.textContent = text;
        return element;
      }));
    }
    if (button) {
      button.textContent = this.runState.result ? 'Restart' : 'Start Next Day';
    }
    modal?.removeAttribute('hidden');
    button?.focus();
  }

  private startFireworksFinale(launchCount: number): void {
    this.stopFireworksFinale();
    const launchIndex = this.placedPrefabs.findIndex((prefab) => prefab.key === 'launchPad');
    const launchPrefab = this.placedPrefabs[launchIndex];
    const launchCenter = launchPrefab
      ? getPrefabWorldCenter(getPrefabDefinition(launchPrefab.key), launchPrefab.placement)
      : new THREE.Vector2();
    this.fireworksFinale = {
      plan: createFireworksShowPlan(launchCount, 40704),
      startedAtSeconds: performance.now() / 1000,
      nextBurstIndex: 0,
      origin: new THREE.Vector3(launchCenter.x, this.settings.rockHeight, launchCenter.y),
      bursts: [],
      cameraPosition: this.camera.position.clone(),
      cameraTarget: this.controls.target.clone(),
    };
    this.scene.background = new THREE.Color(0x071329);
    this.scene.fog = new THREE.Fog(0x071329, 28, 64);
    this.sunLight.intensity = 0.18;
    this.ambientLight.intensity = 0.65;
    this.rimLight.intensity = 0.35;
    this.fillLight.intensity = 0.12;
    this.controls.enabled = false;
    this.controls.target.copy(this.fireworksFinale.origin).add(new THREE.Vector3(0, 3.5, 0));
    this.camera.position.copy(this.fireworksFinale.origin).add(new THREE.Vector3(8, 7.5, 9));
    this.camera.lookAt(this.controls.target);
    document.querySelector<HTMLElement>('.simulation-worker-panel')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-building-panel')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-objective-panel')?.setAttribute('hidden', '');
    document.querySelector<HTMLElement>('.simulation-resource-hud')?.setAttribute('hidden', '');
    this.showSimulationNotice(
      launchCount > 0 ? `${launchCount} fireworks launching!` : 'No fireworks were ready to launch.',
    );
  }

  private spawnFireworkBurst(finale: FireworksFinaleState, plan: FireworkBurstPlan): void {
    const directions = createBurstDirections(plan);
    const positions = new Float32Array(plan.particleCount * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: plan.color,
      size: 0.09 * plan.size,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geometry, material);
    points.name = `Firework burst ${plan.index + 1}`;
    this.fireworksLayer.add(points);
    finale.bursts.push({
      points,
      plan,
      directions,
      startedAtSeconds: finale.startedAtSeconds + plan.launchAtSeconds,
    });
  }

  private updateFireworksFinale(nowSeconds: number): void {
    const finale = this.fireworksFinale;
    if (!finale) {
      return;
    }
    const elapsed = nowSeconds - finale.startedAtSeconds;
    while (
      finale.nextBurstIndex < finale.plan.bursts.length &&
      finale.plan.bursts[finale.nextBurstIndex].launchAtSeconds <= elapsed
    ) {
      this.spawnFireworkBurst(finale, finale.plan.bursts[finale.nextBurstIndex]);
      finale.nextBurstIndex += 1;
    }
    for (let index = finale.bursts.length - 1; index >= 0; index -= 1) {
      const burst = finale.bursts[index];
      const age = nowSeconds - burst.startedAtSeconds;
      const progress = age / burst.plan.lifetimeSeconds;
      if (progress >= 1) {
        burst.points.removeFromParent();
        burst.points.geometry.dispose();
        burst.points.material.dispose();
        finale.bursts.splice(index, 1);
        continue;
      }
      const positions = burst.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      burst.directions.forEach((direction, particleIndex) => {
        const speed = 2.1 * burst.plan.size;
        positions.setXYZ(
          particleIndex,
          finale.origin.x + burst.plan.x + direction[0] * speed * age,
          finale.origin.y + burst.plan.y + direction[1] * speed * age - 1.25 * age * age,
          finale.origin.z + burst.plan.z + direction[2] * speed * age,
        );
      });
      positions.needsUpdate = true;
      burst.points.material.opacity = Math.max(0, 1 - progress * progress);
    }
    if (
      elapsed >= finale.plan.durationSeconds + 1.5 &&
      finale.bursts.length === 0
    ) {
      this.stopFireworksFinale();
      this.showDayResultModal();
    }
  }

  private stopFireworksFinale(): void {
    const finale = this.fireworksFinale;
    if (!finale) {
      return;
    }
    finale.bursts.forEach((burst) => {
      burst.points.removeFromParent();
      burst.points.geometry.dispose();
      burst.points.material.dispose();
    });
    this.fireworksLayer.clear();
    this.camera.position.copy(finale.cameraPosition);
    this.controls.target.copy(finale.cameraTarget);
    this.camera.lookAt(this.controls.target);
    this.fireworksFinale = null;
    this.applyVibe();
    this.controls.enabled = this.interactionMode === 'simulate';
  }

  private setWorkerSelected(worker: SimulationWorker, selected: boolean): void {
    worker.selected = selected;
    worker.mesh.material.emissive.setHex(selected ? 0xf4d17a : 0x000000);
    worker.mesh.material.emissiveIntensity = selected ? 0.65 : 0;
    this.updateSimulationWorkerPanel();
    this.updateValidTargetHighlights();
  }

  private updateSimulationWorkerPanel(): void {
    const panel = document.querySelector<HTMLElement>('.simulation-worker-panel');
    const summary = document.querySelector<HTMLElement>('.simulation-worker-panel__summary');
    const detail = document.querySelector<HTMLElement>('.simulation-worker-panel__detail');
    const idleButton = document.querySelector<HTMLButtonElement>('.simulation-worker-panel__idle');
    if (!panel || !summary || !detail || !idleButton) {
      return;
    }

    const idleCount = this.simulationWorkers.filter(
      (worker) => worker.state.taskState === 'idle' && worker.state.cargo.length < WORKER_CARGO_CAPACITY,
    ).length;
    const loadedCount = this.simulationWorkers.filter(
      (worker) => worker.state.taskState === 'idle' && worker.state.cargo.length >= WORKER_CARGO_CAPACITY,
    ).length;
    idleButton.textContent = `Idle ${idleCount}${loadedCount > 0 ? ` · Loaded ${loadedCount}` : ''}`;
    idleButton.disabled = idleCount === 0 || this.runState.clock.returnStarted || Boolean(this.fireworksFinale);

    const selectedWorkers = this.simulationWorkers.filter((worker) => worker.selected);
    panel.dataset.selectedCount = String(selectedWorkers.length);
    if (selectedWorkers.length === 0) {
      summary.textContent = `${this.simulationWorkers.length} workers · none selected`;
      detail.textContent = this.runState.clock.returnStarted
        ? 'Returning home'
        : 'Click a worker or drag a box to select';
      panel.dataset.condition = this.runState.clock.returnStarted ? 'returning' : 'idle';
      this.updateResourceHud();
      return;
    }

    const stateCounts = new Map<WorkerTaskState, number>();
    const cargo = selectedWorkers.flatMap((worker) => worker.state.cargo);
    selectedWorkers.forEach((worker) => {
      stateCounts.set(worker.state.taskState, (stateCounts.get(worker.state.taskState) ?? 0) + 1);
    });
    const states = [...stateCounts.entries()]
      .map(([state, count]) => `${count} ${state.replace('-', ' ')}`)
      .join(' · ');
    const pendingLoop = selectedWorkers.some(
      (worker) => worker.state.pendingLoopSourceBuildingIndex !== null,
    );
    const activeLoops = selectedWorkers.filter((worker) => worker.state.loop !== null).length;

    summary.textContent = `${selectedWorkers.length} selected · cargo ${cargo.length}/${selectedWorkers.length * WORKER_CARGO_CAPACITY}`;
    if (selectedWorkers.length === 1) {
      const worker = selectedWorkers[0];
      const destination = worker.state.targetBuildingIndex === null
        ? 'none'
        : this.getBuildingLabel(worker.state.targetBuildingIndex);
      const loop = worker.state.loop
        ? `${this.getBuildingLabel(worker.state.loop.sourceBuildingIndex)} → ${this.getBuildingLabel(worker.state.loop.destinationBuildingIndex)}`
        : 'none';
      detail.textContent =
        `${worker.state.taskState.replace('-', ' ')} · ${summarizeResources(cargo)} · target ${destination} · loop ${loop}`;
    } else {
      detail.textContent = pendingLoop
        ? `${states} · choose Shift-loop destination`
        : `${states} · ${summarizeResources(cargo)}${activeLoops > 0 ? ` · ${activeLoops} looping` : ''}`;
    }
    panel.dataset.condition = selectedWorkers.some((worker) => worker.state.taskState === 'returning-home')
      ? 'returning'
      : selectedWorkers.some((worker) => worker.state.cargo.length >= WORKER_CARGO_CAPACITY)
        ? 'full'
        : 'active';
    this.updateResourceHud();
  }

  private updateSimulationBuildingPanel(): void {
    const title = document.querySelector<HTMLElement>('.simulation-building-panel__title');
    const status = document.querySelector<HTMLElement>('.simulation-building-panel__status');
    const detail = document.querySelector<HTMLElement>('.simulation-building-panel__detail');
    const metrics = document.querySelector<HTMLElement>('.simulation-building-panel__metrics');
    const progress = document.querySelector<HTMLElement>('.simulation-building-panel__progress-fill');
    if (!title || !status || !detail || !metrics || !progress) {
      return;
    }

    const buildingIndex = this.selectedSimulationBuildingIndex;
    const prefab = buildingIndex === null ? null : this.placedPrefabs[buildingIndex];
    const building = buildingIndex === null ? null : this.runState.buildings.get(buildingIndex);
    if (!prefab || !building) {
      title.textContent = 'Town production';
      status.textContent = 'Click a building to inspect it';
      detail.textContent = '';
      metrics.textContent = '';
      progress.style.width = '0%';
      return;
    }

    const definition = getPrefabDefinition(prefab.key);
    title.textContent = definition.label;
    if (getSourceResources(prefab.key).length > 0 && prefab.key !== 'fireworksFactory') {
      const sources = getSourceResources(prefab.key).join(' + ');
      status.textContent = `Renewable source · ${building.activeWorkers} assigned`;
      detail.textContent = prefab.key === 'quarry'
        ? 'Shift-loop to Factory gathers ore; Shift-loop to Launch Field gathers stone. One-shot work alternates.'
        : `Workers gather ${sources} until their 3-slot cargo is full.`;
      metrics.textContent = `Output: ${sources} · ${SIMULATION_GATHER_SECONDS.toFixed(1)}s/item`;
      progress.style.width = `${Math.min(100, building.activeWorkers * 25)}%`;
      return;
    }

    if (prefab.key === 'fireworksFactory') {
      const recipe = ECONOMY_RECIPES.fireworks;
      status.textContent = `${building.activeWorkers} assigned · ${building.output.fireworks} ready to haul`;
      detail.textContent = `Consumes ${recipe.inputs.wood} wood + ${recipe.inputs.water} water + ${recipe.inputs.ore} ore per firework.`;
      metrics.textContent =
        `Inputs: ${building.input.wood} wood · ${building.input.water} water · ${building.input.ore} ore`;
      progress.style.width =
        `${Math.min(100, (building.productionProgressSeconds / recipe.durationSeconds) * 100)}%`;
      return;
    }

    if (prefab.key === 'launchPad') {
      const complete = this.runState.construction.launchFieldComplete;
      const recipe = complete ? ECONOMY_RECIPES['launch-rack'] : ECONOMY_RECIPES['launch-field'];
      const current = complete
        ? this.runState.construction.launchRackProgress
        : this.runState.construction.launchFieldProgress;
      const capacity = getLaunchCapacity(this.runState);
      const launchable = getLaunchableFireworks(this.runState);
      const overflow = Math.max(0, this.runState.fireworks.staged - capacity);
      status.textContent = complete
        ? `${this.runState.construction.launchRacks} racks · ${capacity} launch slots`
        : 'Launch Field construction site';
      detail.textContent =
        `Next ${complete ? 'rack' : 'field'}: ${current.wood}/${recipe.inputs.wood ?? 0} wood · ` +
        `${current.stone}/${recipe.inputs.stone ?? 0} stone`;
      metrics.textContent =
        `Staged: ${this.runState.fireworks.staged} · Launchable: ${launchable}` +
        (overflow > 0 ? ` · ${overflow} over capacity` : '') +
        (complete ? ` · ${LAUNCH_RACK_SLOTS} slots/rack` : '');
      progress.style.width =
        `${getConstructionFraction(current, recipe.inputs) * 100}%`;
      return;
    }

    status.textContent = prefab.key === 'house' ? 'Worker home' : 'Town landmark';
    detail.textContent = prefab.key === 'house'
      ? 'Two resident workers.'
      : 'No production role in the v1 economy.';
    if (prefab.key === 'house') {
      const residents = this.simulationWorkers.filter((worker) => worker.homeBuildingIndex === buildingIndex);
      const home = residents.filter((worker) => !worker.mesh.visible).length;
      metrics.textContent = `${home} home · ${residents.length - home} away`;
    } else {
      metrics.textContent = '';
    }
    progress.style.width = '0%';
  }

  private showResourceDeliveryPopups(
    buildingIndex: number,
    transferred: Partial<Record<ResourceType, number>>,
  ): void {
    const effects = document.querySelector<HTMLElement>('.simulation-effects');
    const prefab = this.placedPrefabs[buildingIndex];
    if (!effects || !prefab) {
      return;
    }

    const definition = getPrefabDefinition(prefab.key);
    const center = getPrefabWorldCenter(definition, prefab.placement);
    const world = new THREE.Vector3(
      center.x,
      this.settings.rockHeight + getPrefabWorldDimensions(definition).height * 0.72,
      center.y,
    );
    world.project(this.camera);
    const bounds = this.canvas.getBoundingClientRect();
    const screenX = bounds.left + ((world.x + 1) / 2) * bounds.width;
    const screenY = bounds.top + ((1 - world.y) / 2) * bounds.height;
    let row = 0;

    RESOURCE_TYPES.forEach((resource) => {
      const amount = transferred[resource] ?? 0;
      if (amount <= 0) {
        return;
      }
      const popup = document.createElement('span');
      popup.className = 'simulation-delivery-pop';
      popup.textContent = `+${amount} ${resource[0].toUpperCase()}${resource.slice(1)}`;
      popup.style.left = `${screenX}px`;
      popup.style.top = `${screenY + row * 18}px`;
      popup.addEventListener('animationend', () => popup.remove(), { once: true });
      effects.append(popup);
      row += 1;
    });
  }

  private updateSimulationBuildingHover(event: PointerEvent): void {
    if (!this.runState.clock.running) {
      this.clearSimulationBuildingHover();
      return;
    }
    this.hoveredSimulationBuildingIndex = this.getPrefabIndexAtPointer(event);
    this.simulationTooltipPointer.set(event.clientX, event.clientY);
    this.refreshSimulationBuildingTooltip();
  }

  private refreshSimulationBuildingTooltip(): void {
    const tooltip = document.querySelector<HTMLElement>('.simulation-building-tooltip');
    const title = document.querySelector<HTMLElement>('.simulation-building-tooltip__title');
    const metrics = document.querySelector<HTMLElement>('.simulation-building-tooltip__metrics');
    const fill = document.querySelector<HTMLElement>('.simulation-building-tooltip__fill');
    const progressLabel = document.querySelector<HTMLElement>('.simulation-building-tooltip__progress');
    const buildingIndex = this.hoveredSimulationBuildingIndex;
    const prefab = buildingIndex === null ? null : this.placedPrefabs[buildingIndex];
    const building = buildingIndex === null ? null : this.runState.buildings.get(buildingIndex);
    if (!tooltip || !title || !metrics || !fill || !progressLabel || !prefab || !building) {
      tooltip?.setAttribute('hidden', '');
      return;
    }

    let metricText = 'NO INPUTS';
    let progressText = 'READY';
    let progress = 1;
    if (prefab.key === 'fireworksFactory') {
      const recipe = ECONOMY_RECIPES.fireworks;
      metricText =
        `WOOD ${building.input.wood}/${recipe.inputs.wood ?? 0} · ` +
        `WATER ${building.input.water}/${recipe.inputs.water ?? 0} · ` +
        `ORE ${building.input.ore}/${recipe.inputs.ore ?? 0}`;
      progress = Math.min(1, building.productionProgressSeconds / recipe.durationSeconds);
      progressText = `BATCH ${Math.round(progress * 100)}% · OUT ${building.output.fireworks}`;
    } else if (prefab.key === 'launchPad') {
      const complete = this.runState.construction.launchFieldComplete;
      const recipe = complete ? ECONOMY_RECIPES['launch-rack'] : ECONOMY_RECIPES['launch-field'];
      const current = complete
        ? this.runState.construction.launchRackProgress
        : this.runState.construction.launchFieldProgress;
      metricText =
        `WOOD ${current.wood}/${recipe.inputs.wood ?? 0} · ` +
        `STONE ${current.stone}/${recipe.inputs.stone ?? 0}`;
      progress = getConstructionFraction(current, recipe.inputs);
      progressText = `${complete ? 'RACK' : 'FIELD'} ${Math.round(progress * 100)}%`;
    } else {
      const sources = getSourceResources(prefab.key);
      if (sources.length > 0) {
        metricText = `${sources.map((resource) => resource.toUpperCase()).join(' + ')} ∞`;
        progressText = `ACTIVE ${building.activeWorkers}`;
      }
    }

    title.textContent = getPrefabDefinition(prefab.key).label;
    metrics.textContent = metricText;
    fill.style.width = `${Math.round(progress * 100)}%`;
    progressLabel.textContent = progressText;
    tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - 245, this.simulationTooltipPointer.x + 14))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - 100, this.simulationTooltipPointer.y + 14))}px`;
    tooltip.removeAttribute('hidden');
  }

  private readonly clearSimulationBuildingHover = (): void => {
    this.hoveredSimulationBuildingIndex = null;
    document.querySelector<HTMLElement>('.simulation-building-tooltip')?.setAttribute('hidden', '');
  };

  private showSimulationNotice(message: string): void {
    const notice = document.querySelector<HTMLElement>('.simulation-notice');
    if (!notice) {
      return;
    }
    notice.textContent = message;
    notice.removeAttribute('hidden');
    this.simulationNoticeClearAt = performance.now() + 3200;
  }

  private updateSimulationNotice(now: number): void {
    if (this.simulationNoticeClearAt === 0 || now < this.simulationNoticeClearAt) {
      return;
    }
    this.simulationNoticeClearAt = 0;
    document.querySelector<HTMLElement>('.simulation-notice')?.setAttribute('hidden', '');
  }

  public dispose(): void {
    this.resizeObserver.disconnect();
    cancelAnimationFrame(this.animationId);
    this.canvas.removeEventListener('pointerdown', this.startDrawing);
    this.canvas.removeEventListener('pointermove', this.updateDrawing);
    this.canvas.removeEventListener('pointermove', this.updatePrefabPreview);
    this.canvas.removeEventListener('pointerup', this.finishDrawing);
    this.canvas.removeEventListener('pointercancel', this.finishDrawing);
    this.canvas.removeEventListener('pointerleave', this.clearSimulationBuildingHover);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.stopSimulation();
    this.clearPrefabPlacements(false);
    this.removePrefabPreview();
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
      new THREE.PlaneGeometry(OCEAN_PLANE_SIZE, OCEAN_PLANE_SIZE, 72, 72).toNonIndexed(),
      this.waterMaterial,
    );
    ground.name = 'Procedural ocean water';
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.025;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.camera.position.set(17, 18, 17);
    this.camera.lookAt(0, 0, 0);
    this.applyPendingCameraSettings();
    this.applyVibe();
    if (this.lastGeneratedOutline.length >= 3) {
      this.regenerateIsland();
    } else {
      this.generateDefaultIsland();
    }
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
      outlinePoints: this.lastGeneratedOutline.map((point) => [point.x, point.y]),
      settings: { ...this.settings },
      grassSettings: { ...this.grassSettings },
      treeSettings: { ...this.treeSettings },
      stoneSettings: { ...this.stoneSettings },
      waterSettings: { ...this.waterSettings },
      vibeSettings: { ...this.vibeSettings },
      cameraSettings: this.createCameraPresetSnapshot(),
      prefabSettings: {
        selected: this.prefabUi.selected,
        placeMode: this.prefabUi.placeMode,
        editMode: this.prefabUi.editMode,
        rotationDegrees: this.prefabUi.rotationDegrees,
      },
      prefabPlacements: this.placedPrefabs.map((prefab) => ({
        key: prefab.key,
        originX: prefab.placement.originX,
        originZ: prefab.placement.originZ,
        rotation: prefab.rotation,
      })),
      walkwayPaths: this.walkwayPathGraph ? this.createWalkwayPathPresetSnapshot() : undefined,
    };
  }

  private createWalkwayPathPresetSnapshot(): WalkwayPathGraph | undefined {
    if (!this.walkwayPathGraph) {
      return undefined;
    }

    return {
      nodes: this.walkwayPathGraph.nodes.map((node) => ({
        id: node.id,
        position: [node.position[0], node.position[1]] as [number, number],
        buildingIndex: node.buildingIndex,
      })),
      segments: this.walkwayPathGraph.segments.map((segment) => ({ ...segment })),
    };
  }

  private createCameraPresetSnapshot(): CameraPresetSettings {
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
      zoom: this.camera.zoom,
    };
  }

  private applyCameraSettings(settings: CameraPresetSettings): void {
    this.camera.position.set(...settings.position);
    this.controls.target.set(...settings.target);
    this.camera.zoom = THREE.MathUtils.clamp(settings.zoom, this.controls.minZoom, this.controls.maxZoom);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private applyPendingCameraSettings(): void {
    if (!this.cameraSettingsToRestore) {
      return;
    }

    const settings = this.cameraSettingsToRestore;
    this.cameraSettingsToRestore = null;
    this.applyCameraSettings(settings);
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
    if (preset.outlinePoints) {
      const outlinePoints = createOutlineVectors(preset.outlinePoints);
      if (outlinePoints.length >= 3) {
        this.lastGeneratedOutline = outlinePoints;
      }
    }
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
    this.cameraSettingsToRestore = preset.cameraSettings ? normalizeCameraPresetSettings(preset.cameraSettings) : null;
    if (preset.prefabSettings) {
      if (PREFAB_BUILDING_LABELS.includes(preset.prefabSettings.selected)) {
        this.prefabUi.selected = preset.prefabSettings.selected;
      }
      this.prefabUi.placeMode = Boolean(preset.prefabSettings.placeMode);
      this.prefabUi.editMode = Boolean(preset.prefabSettings.editMode);
      if (this.prefabUi.placeMode && this.prefabUi.editMode) {
        this.prefabUi.editMode = false;
      }
      this.prefabUi.rotationDegrees = getPrefabRotationFromDegrees(preset.prefabSettings.rotationDegrees) * 45;
      this.selectedPrefabRotation = getPrefabRotationFromDegrees(this.prefabUi.rotationDegrees);
    }
    this.prefabPlacementsToRestore = preset.prefabPlacements ? normalizePrefabPlacementPresets(preset.prefabPlacements) : null;
    this.walkwayPathsToRestore = preset.walkwayPaths ? normalizeWalkwayPathGraph(preset.walkwayPaths) : null;

    this.updateGuiDisplays();
    this.updateCanvasCursor();
    if (refreshScene) {
      this.updateGrassTexture();
      this.updateWaterSurface();
      this.regenerateIsland();
      this.applyVibe();
      this.applyPendingCameraSettings();
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

    const prefabFolder = gui.addFolder('Prefab Buildings');
    trackController(
      prefabFolder
        .add(this.prefabUi, 'selected', PREFAB_BUILDING_LABELS)
        .name('Building')
        .onChange(() => this.handlePrefabSelectionChange()),
    );
    trackController(
      prefabFolder
        .add(this.prefabUi, 'placeMode')
        .name('Place mode')
        .onChange((enabled: boolean) => this.setPrefabPlaceMode(enabled)),
    );
    trackController(
      prefabFolder
        .add(this.prefabUi, 'editMode')
        .name('Edit buildings')
        .onChange((enabled: boolean) => this.setPrefabEditMode(enabled)),
    );
    this.prefabRotationController = trackController(
      prefabFolder
        .add(this.prefabUi, 'rotationDegrees', 0, 315, 45)
        .name('Rotation')
        .onChange((degrees: number) => this.setPrefabRotationFromSlider(degrees)),
    );
    this.prefabStatusController = trackController(prefabFolder.add(this.prefabUi, 'status').name('Required'));
    this.pathStatusController = trackController(prefabFolder.add(this.prefabUi, 'pathStatus').name('Pathways'));
    prefabFolder
      .add({ renderPathways: () => this.renderWalkwayPathsFromPlacedPrefabs() }, 'renderPathways')
      .name('Render pathways');
    prefabFolder.add({ clear: () => this.clearPrefabPlacements(true) }, 'clear').name('Clear buildings');
    this.updatePrefabStatus();
    prefabFolder.open();

    const islandEdgeFolder = gui.addFolder('Island Edge');
    regenerateOnMouseUp(
      trackController(islandEdgeFolder.add(this.settings, 'rockSpacing', 0.35, 1.8, 0.01).name('Block spacing')),
    );
    regenerateOnMouseUp(trackController(islandEdgeFolder.add(this.settings, 'rockiness', 0, 1, 0.01).name('Coast shape')));
    regenerateOnMouseUp(
      trackController(islandEdgeFolder.add(this.settings, 'vertexCount', 8, 90, 1).name('Edge vertices')),
    );
    regenerateOnMouseUp(
      trackController(islandEdgeFolder.add(this.settings, 'rockDetail', 0, 1, 0.01).name('Block detail')),
    );
    regenerateOnMouseUp(
      trackController(islandEdgeFolder.add(this.settings, 'rockHeight', 0.45, 2, 0.01).name('Edge height')),
    );
    regenerateOnMouseUp(
      trackController(islandEdgeFolder.add(this.settings, 'rockHeightJitter', 0, 0.55, 0.01).name('Height jitter')),
    );
    regenerateOnMouseUp(
      trackController(islandEdgeFolder.add(this.settings, 'rockDepth', 0.35, 1.8, 0.01).name('Edge depth')),
    );
    regenerateOnMouseUp(
      trackController(islandEdgeFolder.add(this.settings, 'rockDepthJitter', 0, 0.45, 0.01).name('Depth jitter')),
    );
    regenerateOnMouseUp(
      trackController(islandEdgeFolder.add(this.settings, 'rockColorJitter', 0, 1, 0.01).name('Color jitter')),
    );
    regenerateOnMouseUp(
      trackController(islandEdgeFolder.add(this.settings, 'hiddenOverlap', 0.01, 0.08, 0.001).name('Block overlap')),
    );
    regenerateOnMouseUp(trackController(islandEdgeFolder.add(this.settings, 'seed', 1, 9999, 1).name('Seed')));
    islandEdgeFolder.open(false);

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
    trackController(waterFolder.add(this.waterSettings, 'edgeFog').name('Edge fog')).onChange(() => this.updateOceanFog());
    trackController(waterFolder.add(this.waterSettings, 'fogStart', 10, 80, 1).name('Fog start')).onChange(() =>
      this.updateOceanFog(),
    );
    trackController(waterFolder.add(this.waterSettings, 'fogEnd', 20, 120, 1).name('Fog end')).onChange(() =>
      this.updateOceanFog(),
    );
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
    this.grassTexture = createGrassTexture(this.grassSettings, this.createGrassTexturePathOverlay());
    this.applyGrassTextureToIsland();
    previousTexture.dispose();
  }

  private createGrassTexturePathOverlay(): GrassTexturePathOverlay | undefined {
    if (!this.walkwayPathGraph || this.currentIslandOutline.length < 3) {
      return undefined;
    }

    return {
      bounds: new THREE.Box2().setFromPoints(this.currentIslandOutline),
      graph: this.walkwayPathGraph,
    };
  }

  private updateWaterSurface(): void {
    this.waterMaterial.uniforms.uClarity.value = this.waterSettings.clarity;
    this.waterMaterial.uniforms.uChoppiness.value = this.waterSettings.choppiness;
    this.waterMaterial.uniforms.uAmplitude.value = THREE.MathUtils.lerp(0.12, 0.62, this.waterSettings.choppiness);
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

  private updateOceanFog(vibe = this.getCurrentVibe()): void {
    if (!this.waterSettings.edgeFog) {
      this.scene.fog = null;
      return;
    }

    const near = Math.min(this.waterSettings.fogStart, this.waterSettings.fogEnd - 1);
    const far = Math.max(this.waterSettings.fogEnd, near + 1);
    const fogColor = new THREE.Color(vibe.fog);
    this.waterMaterial.uniforms.fogColor?.value.copy(fogColor);
    this.waterMaterial.uniforms.fogNear.value = near;
    this.waterMaterial.uniforms.fogFar.value = far;

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(fogColor);
      this.scene.fog.near = near;
      this.scene.fog.far = far;
      return;
    }

    this.scene.fog = new THREE.Fog(fogColor, near, far);
  }

  private applyVibe(): void {
    const vibe = this.getCurrentVibe();
    const background = new THREE.Color(vibe.background);
    const waterPalette = getVibeWaterPalette(vibe);
    this.scene.background = background;
    this.updateOceanFog(vibe);

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
      if (object.name === 'Shore water ripple') {
        const rippleMaterial = (object as THREE.Line).material;
        if (rippleMaterial instanceof THREE.LineBasicMaterial) {
          rippleMaterial.color.copy(waterPalette.light);
        }
        return;
      }

      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (mesh.name === 'Procedural ocean water' && material instanceof THREE.ShaderMaterial) {
          material.uniforms.uDeepColor.value.copy(waterPalette.deep);
          material.uniforms.uClearColor.value.copy(waterPalette.clear);
          material.uniforms.uLightColor.value.copy(waterPalette.light);
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

  private getSelectedPrefabDefinition() {
    return getPrefabDefinitionByLabel(this.prefabUi.selected);
  }

  private getPlacedPrefabCount(key: PrefabBuildingKey): number {
    return this.placedPrefabs.filter((prefab) => prefab.key === key).length;
  }

  private updatePrefabStatus(): void {
    const selected = this.getSelectedPrefabDefinition();
    const selectedPlaced = this.getPlacedPrefabCount(selected.key);
    const totalPlaced = this.placedPrefabs.length;
    const totalRequired = PREFAB_BUILDINGS.reduce((sum, definition) => sum + definition.requiredCount, 0);
    this.prefabUi.status = `${selected.label}: ${selectedPlaced}/${selected.requiredCount}, Total: ${totalPlaced}/${totalRequired}`;
    this.prefabStatusController?.updateDisplay();
    this.updatePathStatus();
  }

  private updatePathStatus(): void {
    if (!this.hasAllRequiredPrefabBuildings()) {
      const totalRequired = PREFAB_BUILDINGS.reduce((sum, definition) => sum + definition.requiredCount, 0);
      this.prefabUi.pathStatus = `Place all ${totalRequired} buildings`;
    } else if (this.walkwayPathGraph) {
      this.prefabUi.pathStatus = `${this.walkwayPathGraph.segments.length} path segments`;
    } else {
      this.prefabUi.pathStatus = 'Ready to render';
    }
    this.pathStatusController?.updateDisplay();
  }

  private hasAllRequiredPrefabBuildings(): boolean {
    return PREFAB_BUILDINGS.every((definition) => this.getPlacedPrefabCount(definition.key) >= definition.requiredCount);
  }

  private renderWalkwayPathsFromPlacedPrefabs(): void {
    if (!this.hasAllRequiredPrefabBuildings()) {
      this.updatePathStatus();
      return;
    }

    const graph = this.createWalkwayPathGraphFromPlacedPrefabs();
    this.renderWalkwayPathGraph(graph);
  }

  private createWalkwayPathGraphFromPlacedPrefabs(): WalkwayPathGraph {
    const entries = this.placedPrefabs.map((prefab, index) => {
      const definition = getPrefabDefinition(prefab.key);
      const center = getPrefabWorldCenter(definition, prefab.placement);
      const footprint = getPrefabWorldFootprintCorners(definition, prefab.placement);
      return { index, center, footprint };
    });

    const centroid = entries
      .reduce((sum, entry) => sum.add(entry.center), new THREE.Vector2())
      .multiplyScalar(entries.length > 0 ? 1 / entries.length : 1);
    const axis = this.getMainWalkwayAxis(entries.map((entry) => entry.center));
    const ordered = entries
      .map((entry) => {
        const projection = entry.center.clone().sub(centroid).dot(axis);
        const trunkPoint = centroid.clone().addScaledVector(axis, projection);
        const safeTrunkPoint = pointInPolygon(trunkPoint, this.currentIslandOutline) ? trunkPoint : entry.center.clone();
        const edgePoint = closestPointOnPolygonBoundary(safeTrunkPoint, entry.footprint);
        const branchEnd = edgePoint.clone().lerp(entry.center, 0.12);
        return { ...entry, projection, trunkPoint: safeTrunkPoint, branchEnd };
      })
      .sort((first, second) => first.projection - second.projection);

    const nodes: WalkwayPathNode[] = [];
    const segments: WalkwayPathSegment[] = [];
    ordered.forEach((entry, orderIndex) => {
      const trunkId = `trunk-${orderIndex}`;
      const entryId = `building-${entry.index}`;
      nodes.push(
        {
          id: trunkId,
          position: [entry.trunkPoint.x, entry.trunkPoint.y],
        },
        {
          id: entryId,
          position: [entry.branchEnd.x, entry.branchEnd.y],
          buildingIndex: entry.index,
        },
      );
      if (orderIndex > 0) {
        segments.push({ from: `trunk-${orderIndex - 1}`, to: trunkId, kind: 'trunk' });
      }
      if (entry.trunkPoint.distanceTo(entry.branchEnd) > 0.05) {
        segments.push({ from: trunkId, to: entryId, kind: 'branch' });
      }
    });

    return { nodes, segments };
  }

  private getMainWalkwayAxis(points: THREE.Vector2[]): THREE.Vector2 {
    if (points.length < 2) {
      return new THREE.Vector2(1, 0);
    }

    let first = points[0];
    let second = points[1];
    let farthestDistanceSq = first.distanceToSquared(second);
    for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
        const distanceSq = points[firstIndex].distanceToSquared(points[secondIndex]);
        if (distanceSq > farthestDistanceSq) {
          first = points[firstIndex];
          second = points[secondIndex];
          farthestDistanceSq = distanceSq;
        }
      }
    }

    return second.clone().sub(first).normalize();
  }

  private renderWalkwayPathGraph(graph: WalkwayPathGraph): void {
    this.clearWalkwayPaths(false);
    this.walkwayPathGraph = graph;
    this.walkwayLayer.position.set(0, 0, 0);
    this.updateGrassTexture();
    this.updatePathStatus();
  }

  private clearWalkwayPaths(clearGraph: boolean, updateTexture = true): void {
    this.walkwayLayer.children.slice().forEach((child) => {
      child.removeFromParent();
      this.disposeObjectTree(child);
    });
    if (clearGraph) {
      this.walkwayPathGraph = null;
      if (updateTexture && this.island) {
        this.updateGrassTexture();
      }
    }
    this.updatePathStatus();
  }

  private handlePrefabSelectionChange(): void {
    this.removePrefabPreview();
    this.updatePrefabStatus();
  }

  private setPrefabPlaceMode(enabled: boolean): void {
    this.setInteractionMode(enabled ? 'build' : 'pan');
  }

  private setPrefabEditMode(enabled: boolean): void {
    this.setInteractionMode(enabled ? 'edit' : 'pan');
  }

  private updateCanvasCursor(): void {
    this.canvas.style.cursor =
      this.interactionMode === 'build'
        ? 'copy'
        : this.interactionMode === 'edit'
          ? 'pointer'
          : this.interactionMode === 'path' || this.interactionMode === 'island'
            ? 'crosshair'
            : 'grab';
  }

  private setPrefabRotationFromSlider(degrees: number): void {
    const snappedRotation = getPrefabRotationFromDegrees(degrees);
    const snappedDegrees = snappedRotation * 45;
    this.selectedPrefabRotation = snappedRotation;
    this.prefabUi.rotationDegrees = snappedDegrees;
    this.prefabRotationController?.updateDisplay();

    if (this.selectedPlacedPrefab && this.prefabUi.editMode) {
      this.selectedPlacedPrefab.rotation = snappedRotation;
      this.selectedPlacedPrefab.group.rotation.y = getPrefabRotationRadians(snappedRotation);
      this.selectedPrefabHelper?.update();
      this.clearWalkwayPaths(true);
    }

    this.removePrefabPreview(false);
    this.refreshPrefabPreviewAtLastPosition();
  }

  private rotatePlacementPreviewByStep(): void {
    this.setPrefabRotationFromSlider(this.selectedPrefabRotation * 45 + 45);
  }

  private refreshPrefabPreviewAtLastPosition(): void {
    if (!this.prefabUi.placeMode || !this.prefabPreviewWorldPosition) {
      return;
    }

    const definition = this.getSelectedPrefabDefinition();
    const placement = getPrefabPlacementForWorldPoint(definition, this.prefabPreviewWorldPosition, this.selectedPrefabRotation);
    this.refreshPrefabPreview(placement, this.canPlacePrefab(definition, placement));
  }

  private canPlacePrefab(definition: ReturnType<typeof getPrefabDefinitionByLabel>, placement: PrefabGridPlacement): boolean {
    if (this.currentIslandOutline.length < 3) {
      return false;
    }

    if (this.getPlacedPrefabCount(definition.key) >= definition.requiredCount) {
      return false;
    }

    const cells = getPrefabFootprintCells(definition, placement);
    if (cells.some((cell) => this.occupiedPrefabCells.has(getPrefabCellKey(cell)))) {
      return false;
    }

    const footprintPoints = [
      ...cells.map((cell) => getPrefabCellCenter(cell)),
      ...getPrefabWorldFootprintCorners(definition, placement),
    ];

    return footprintPoints.every((point) => pointInPolygon(point, this.currentIslandOutline));
  }

  private placeSelectedPrefab(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const worldPosition = this.getPointerWorldPosition(event);
    if (!worldPosition) {
      return;
    }

    event.preventDefault();
    const definition = this.getSelectedPrefabDefinition();
    const placement = getPrefabPlacementForWorldPoint(definition, worldPosition, this.selectedPrefabRotation);
    const canPlace = this.canPlacePrefab(definition, placement);
    this.refreshPrefabPreview(placement, canPlace);
    if (!canPlace) {
      return;
    }

    const placedPrefab = this.createPlacedPrefab(definition, placement, true);
    this.removePrefabPreview();
    this.selectPlacedPrefab(placedPrefab);
    this.clearWalkwayPaths(true);
    this.applyVibe();
    this.updatePrefabStatus();
  }

  private createPlacedPrefab(
    definition: ReturnType<typeof getPrefabDefinitionByLabel>,
    placement: PrefabGridPlacement,
    clearNaturalObjects: boolean,
  ): PlacedPrefab {
    const group = createPrefabBuilding(
      definition,
      definition.key === 'house' ? this.getPlacedPrefabCount('house') : undefined,
    );
    const center = getPrefabWorldCenter(definition, placement);
    const cells = getPrefabFootprintCells(definition, placement).map((cell) => getPrefabCellKey(cell));
    if (clearNaturalObjects) {
      this.clearNaturalObjectsIntersectingPrefab(definition, placement);
    }
    group.position.set(center.x, this.settings.rockHeight + TOP_LIFT, center.y);
    group.rotation.y = getPrefabRotationRadians(placement.rotation);
    this.prefabLayer.add(group);

    const placedPrefab = { key: definition.key, group, cells, rotation: placement.rotation, placement: { ...placement } };
    this.placedPrefabs.push(placedPrefab);
    cells.forEach((cell) => this.occupiedPrefabCells.add(cell));
    return placedPrefab;
  }

  private restorePrefabPlacements(placements: PrefabPlacementPreset[]): void {
    this.clearPrefabPlacements(false);
    placements.forEach((placement) => {
      const definition = getPrefabDefinition(placement.key);
      this.createPlacedPrefab(definition, placement, true);
    });
    this.updatePrefabStatus();
  }

  private selectPlacedPrefab(prefab: PlacedPrefab | null): void {
    this.removeSelectedPrefabHelper();
    this.selectedPlacedPrefab = prefab;
    if (!prefab) {
      return;
    }

    this.selectedPrefabRotation = prefab.rotation;
    this.prefabUi.rotationDegrees = prefab.rotation * 45;
    this.prefabRotationController?.updateDisplay();

    this.selectedPrefabHelper = new THREE.BoxHelper(prefab.group, 0xffe37a);
    this.selectedPrefabHelper.name = 'Selected prefab outline';
    this.scene.add(this.selectedPrefabHelper);
  }

  private deleteSelectedPrefab(): void {
    const prefab = this.selectedPlacedPrefab;
    if (!prefab) {
      return;
    }

    this.selectPlacedPrefab(null);
    prefab.cells.forEach((cell) => this.occupiedPrefabCells.delete(cell));
    const index = this.placedPrefabs.indexOf(prefab);
    if (index >= 0) {
      this.placedPrefabs.splice(index, 1);
    }
    prefab.group.removeFromParent();
    this.disposeObjectTree(prefab.group);
    this.clearWalkwayPaths(true);
    this.updatePrefabStatus();
  }

  private removeSelectedPrefabHelper(): void {
    if (!this.selectedPrefabHelper) {
      return;
    }

    this.selectedPrefabHelper.removeFromParent();
    this.selectedPrefabHelper.geometry.dispose();
    const material = this.selectedPrefabHelper.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material.dispose();
    }
    this.selectedPrefabHelper = null;
  }

  private selectPrefabAtPointer(event: PointerEvent): boolean {
    if (this.placedPrefabs.length === 0 || (event.pointerType === 'mouse' && event.button !== 0)) {
      return false;
    }

    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.prefabLayer.children, true);
    for (const hit of hits) {
      const prefab = this.getPlacedPrefabFromObject(hit.object);
      if (!prefab) {
        continue;
      }

      event.preventDefault();
      this.selectPlacedPrefab(prefab);
      return true;
    }

    return false;
  }

  private getPlacedPrefabFromObject(object: THREE.Object3D): PlacedPrefab | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      const prefab = this.placedPrefabs.find((entry) => entry.group === current);
      if (prefab) {
        return prefab;
      }
      current = current.parent;
    }
    return null;
  }

  private clearNaturalObjectsIntersectingPrefab(
    definition: ReturnType<typeof getPrefabDefinitionByLabel>,
    placement: PrefabGridPlacement,
  ): NaturalObjectCleanupResult {
    const footprint = this.createPrefabFootprintBox(definition, placement);
    const treesRemoved = this.removeIntersectingTrees(footprint);
    const stonesRemoved = this.hideIntersectingStoneInstances(footprint);
    return { treesRemoved, stonesRemoved };
  }

  private createPrefabFootprintBox(
    definition: ReturnType<typeof getPrefabDefinitionByLabel>,
    placement: PrefabGridPlacement,
  ): THREE.Box3 {
    const corners = getPrefabWorldFootprintCorners(definition, placement);
    const minX = Math.min(...corners.map((corner) => corner.x)) - PREFAB_NATURAL_OBJECT_CLEARANCE;
    const maxX = Math.max(...corners.map((corner) => corner.x)) + PREFAB_NATURAL_OBJECT_CLEARANCE;
    const minZ = Math.min(...corners.map((corner) => corner.y)) - PREFAB_NATURAL_OBJECT_CLEARANCE;
    const maxZ = Math.max(...corners.map((corner) => corner.y)) + PREFAB_NATURAL_OBJECT_CLEARANCE;
    return new THREE.Box3(
      new THREE.Vector3(minX, this.settings.rockHeight - 0.08, minZ),
      new THREE.Vector3(maxX, this.settings.rockHeight + 12, maxZ),
    );
  }

  private removeIntersectingTrees(footprint: THREE.Box3): number {
    if (!this.island) {
      return 0;
    }

    const intersectingTrees: THREE.Object3D[] = [];
    this.island.traverse((object) => {
      if (object.name !== 'Procedural low-poly tree') {
        return;
      }

      const treeBounds = new THREE.Box3().setFromObject(object);
      if (treeBounds.intersectsBox(footprint)) {
        intersectingTrees.push(object);
      }
    });

    intersectingTrees.forEach((tree) => {
      tree.removeFromParent();
      this.disposeObjectTree(tree);
    });
    return intersectingTrees.length;
  }

  private hideIntersectingStoneInstances(footprint: THREE.Box3): number {
    if (!this.island) {
      return 0;
    }

    const instanceMatrix = new THREE.Matrix4();
    const instanceWorldMatrix = new THREE.Matrix4();
    const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    const instanceBounds = new THREE.Box3();
    let stonesRemoved = 0;

    this.island.traverse((object) => {
      const mesh = object as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh || !mesh.name.endsWith('grass stones')) {
        return;
      }

      mesh.geometry.computeBoundingBox();
      const geometryBounds = mesh.geometry.boundingBox;
      if (!geometryBounds) {
        return;
      }

      for (let instanceIndex = 0; instanceIndex < mesh.count; instanceIndex += 1) {
        mesh.getMatrixAt(instanceIndex, instanceMatrix);
        if (isHiddenInstanceMatrix(instanceMatrix)) {
          continue;
        }

        instanceWorldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
        instanceBounds.copy(geometryBounds).applyMatrix4(instanceWorldMatrix);
        if (!instanceBounds.intersectsBox(footprint)) {
          continue;
        }

        mesh.setMatrixAt(instanceIndex, hiddenMatrix);
        stonesRemoved += 1;
      }

      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });

    return stonesRemoved;
  }

  private readonly updatePrefabPreview = (event: PointerEvent): void => {
    if (!this.prefabUi.placeMode) {
      return;
    }

    const worldPosition = this.getPointerWorldPosition(event);
    if (!worldPosition) {
      this.prefabPreviewWorldPosition = null;
      this.removePrefabPreview();
      return;
    }

    this.prefabPreviewWorldPosition = worldPosition;
    const definition = this.getSelectedPrefabDefinition();
    const placement = getPrefabPlacementForWorldPoint(definition, worldPosition, this.selectedPrefabRotation);
    this.refreshPrefabPreview(placement, this.canPlacePrefab(definition, placement));
  };

  private refreshPrefabPreview(placement: PrefabGridPlacement, canPlace: boolean): void {
    this.removePrefabPreview(false);
    const definition = this.getSelectedPrefabDefinition();
    this.prefabPreview = createPrefabPlacementPreview(definition, placement, canPlace);
    this.prefabPreview.position.y = this.settings.rockHeight + TOP_LIFT + 0.025;
    this.scene.add(this.prefabPreview);
  }

  private clearPrefabPlacements(updateStatus: boolean): void {
    this.selectPlacedPrefab(null);
    this.clearWalkwayPaths(true, updateStatus);
    this.placedPrefabs.forEach((prefab) => {
      prefab.group.removeFromParent();
      this.disposeObjectTree(prefab.group);
    });
    this.placedPrefabs.length = 0;
    this.occupiedPrefabCells.clear();
    this.removePrefabPreview();
    if (updateStatus) {
      this.updatePrefabStatus();
    }
  }

  private removePrefabPreview(clearPosition = true): void {
    if (!this.prefabPreview) {
      if (clearPosition) {
        this.prefabPreviewWorldPosition = null;
      }
      return;
    }

    this.prefabPreview.removeFromParent();
    this.disposeObjectTree(this.prefabPreview);
    this.prefabPreview = null;
    if (clearPosition) {
      this.prefabPreviewWorldPosition = null;
    }
  }

  private disposeObjectTree(root: THREE.Object3D): void {
    const disposedGeometries = new Set<THREE.BufferGeometry>();
    const disposedMaterials = new Set<THREE.Material>();
    root.traverse((object) => {
      const renderable = object as THREE.Object3D & {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material | THREE.Material[];
      };

      if (renderable.geometry && !disposedGeometries.has(renderable.geometry)) {
        renderable.geometry.dispose();
        disposedGeometries.add(renderable.geometry);
      }

      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : renderable.material
          ? [renderable.material]
          : [];
      materials.forEach((material) => {
        if (disposedMaterials.has(material)) {
          return;
        }
        const materialWithMap = material as THREE.Material & { map?: THREE.Texture | null };
        materialWithMap.map?.dispose();
        material.dispose();
        disposedMaterials.add(material);
      });
    });
  }

  private handleSimulationPointerDown(event: PointerEvent): void {
    if (
      !this.runState.clock.running ||
      this.runState.clock.returnStarted ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }

    const workerAtPointer = this.getWorkerAtPointer(event);
    if (workerAtPointer) {
      event.preventDefault();
      if (event.shiftKey) {
        this.setWorkerSelected(workerAtPointer, !workerAtPointer.selected);
      } else {
        this.simulationWorkers.forEach((worker) => this.setWorkerSelected(worker, worker === workerAtPointer));
      }
      return;
    }

    const selectedWorkers = this.simulationWorkers.filter((worker) => worker.selected);
    const buildingIndex = this.getPrefabIndexAtPointer(event);
    if (buildingIndex !== null) {
      event.preventDefault();
      this.selectedSimulationBuildingIndex = buildingIndex;
      this.updateSimulationBuildingPanel();
      if (selectedWorkers.length === 0) {
        return;
      }
      if (event.shiftKey) {
        this.issueShiftBuildingOrder(selectedWorkers, buildingIndex);
      } else {
        this.issueOneShotBuildingOrder(selectedWorkers, buildingIndex);
      }
      return;
    }

    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.simulationMarqueePointerId = event.pointerId;
    this.simulationMarqueeStart = new THREE.Vector2(event.clientX, event.clientY);
    this.simulationMarqueeAdditive = event.shiftKey;
    this.updateSimulationMarquee(event);
  }

  private updateSimulationMarquee(event: PointerEvent): void {
    if (!this.simulationMarqueeStart) {
      return;
    }

    const marquee = document.querySelector<HTMLElement>('.selection-marquee');
    if (!marquee) {
      return;
    }

    const left = Math.min(this.simulationMarqueeStart.x, event.clientX);
    const top = Math.min(this.simulationMarqueeStart.y, event.clientY);
    const width = Math.abs(event.clientX - this.simulationMarqueeStart.x);
    const height = Math.abs(event.clientY - this.simulationMarqueeStart.y);
    if (Math.max(width, height) < SIMULATION_CLICK_DISTANCE) {
      marquee.setAttribute('hidden', '');
      return;
    }
    marquee.style.left = `${left}px`;
    marquee.style.top = `${top}px`;
    marquee.style.width = `${width}px`;
    marquee.style.height = `${height}px`;
    marquee.removeAttribute('hidden');
  }

  private finishSimulationMarquee(event: PointerEvent): void {
    if (!this.simulationMarqueeStart) {
      return;
    }

    event.preventDefault();
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    const left = Math.min(this.simulationMarqueeStart.x, event.clientX);
    const right = Math.max(this.simulationMarqueeStart.x, event.clientX);
    const top = Math.min(this.simulationMarqueeStart.y, event.clientY);
    const bottom = Math.max(this.simulationMarqueeStart.y, event.clientY);
    const isClick = Math.max(right - left, bottom - top) < SIMULATION_CLICK_DISTANCE;
    const canvasBounds = this.canvas.getBoundingClientRect();
    const projected = new THREE.Vector3();

    if (isClick) {
      if (!this.simulationMarqueeAdditive) {
        this.simulationWorkers.forEach((worker) => this.setWorkerSelected(worker, false));
      }
    } else {
      this.simulationWorkers.forEach((worker) => {
        worker.mesh.getWorldPosition(projected);
        projected.project(this.camera);
        const screenX = canvasBounds.left + ((projected.x + 1) / 2) * canvasBounds.width;
        const screenY = canvasBounds.top + ((1 - projected.y) / 2) * canvasBounds.height;
        const inside = screenX >= left && screenX <= right && screenY >= top && screenY <= bottom;
        this.setWorkerSelected(
          worker,
          this.simulationMarqueeAdditive ? (inside ? !worker.selected : worker.selected) : inside,
        );
      });
    }

    this.simulationMarqueePointerId = null;
    this.simulationMarqueeStart = null;
    this.simulationMarqueeAdditive = false;
    document.querySelector<HTMLElement>('.selection-marquee')?.setAttribute('hidden', '');
  }

  private getWorkerAtPointer(event: PointerEvent): SimulationWorker | null {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.simulationWorkers.map((worker) => worker.mesh), false);
    const hitMesh = hits[0]?.object;
    return this.simulationWorkers.find((worker) => worker.mesh === hitMesh) ?? null;
  }

  private getPrefabIndexAtPointer(event: PointerEvent): number | null {
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.prefabLayer.children, true);
    for (const hit of hits) {
      const prefab = this.getPlacedPrefabFromObject(hit.object);
      if (!prefab) {
        continue;
      }
      const index = this.placedPrefabs.indexOf(prefab);
      return index >= 0 ? index : null;
    }
    return null;
  }

  private bindDrawingEvents(): void {
    this.canvas.addEventListener('pointerdown', this.startDrawing);
    this.canvas.addEventListener('pointermove', this.updateDrawing);
    this.canvas.addEventListener('pointermove', this.updatePrefabPreview);
    this.canvas.addEventListener('pointerup', this.finishDrawing);
    this.canvas.addEventListener('pointercancel', this.finishDrawing);
    this.canvas.addEventListener('pointerleave', this.clearSimulationBuildingHover);
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (this.interactionMode === 'simulate' && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      this.selectIdleWorkers();
      return;
    }

    if (
      event.key.toLowerCase() === 'r' &&
      (this.prefabUi.placeMode || (this.prefabUi.editMode && this.selectedPlacedPrefab))
    ) {
      event.preventDefault();
      this.rotatePlacementPreviewByStep();
      return;
    }

    if (this.prefabUi.editMode && event.key === 'Delete' && this.selectedPlacedPrefab) {
      event.preventDefault();
      this.deleteSelectedPrefab();
    }
  };

  private readonly startDrawing = (event: PointerEvent): void => {
    this.canvas.focus();

    if (this.interactionMode === 'simulate') {
      this.handleSimulationPointerDown(event);
      return;
    }

    if (this.prefabUi.placeMode) {
      this.placeSelectedPrefab(event);
      return;
    }

    if (this.prefabUi.editMode) {
      if (event.pointerType !== 'mouse' || event.button === 0) {
        event.preventDefault();
        this.selectPrefabAtPointer(event);
      }
      return;
    }

    if (this.interactionMode !== 'island') {
      return;
    }

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
    if (this.interactionMode === 'simulate') {
      this.updateSimulationBuildingHover(event);
      if (event.pointerId === this.simulationMarqueePointerId) {
        this.updateSimulationMarquee(event);
        return;
      }
    }

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
    if (this.interactionMode === 'simulate' && event.pointerId === this.simulationMarqueePointerId) {
      this.finishSimulationMarquee(event);
      return;
    }

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

    this.clearPrefabPlacements(true);
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
    this.currentIslandOutline = build.processedOutline;
    this.prefabLayer.position.set(0, 0, 0);
    this.walkwayLayer.position.set(0, 0, 0);
    this.island.add(this.prefabLayer);
    this.island.add(this.walkwayLayer);
    this.scene.add(this.island);
    if (this.prefabPlacementsToRestore) {
      const placements = this.prefabPlacementsToRestore;
      this.prefabPlacementsToRestore = null;
      this.restorePrefabPlacements(placements);
    }
    if (this.walkwayPathsToRestore) {
      const paths = this.walkwayPathsToRestore;
      this.walkwayPathsToRestore = null;
      this.renderWalkwayPathGraph(paths);
    }
    this.applyVibe();
    this.removePreviewLine();
  }

  private clearIsland(): void {
    this.clearPrefabPlacements(true);
    this.removeIsland();
    this.removePreviewLine();
    this.drawnOutline = [];
    this.lastGeneratedOutline = [];
    this.currentIslandOutline = [];
  }

  private removeIsland(): void {
    if (!this.island) {
      return;
    }

    this.clearPrefabPlacements(false);
    this.scene.remove(this.island);
    this.currentIslandOutline = [];
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
    const now = performance.now();
    const deltaSeconds = Math.max(0, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;
    this.controls.update();
    if (this.runState.clock.running && !this.runState.clock.paused) {
      const fixedStepResult = runFixedSimulationSteps(
        this.simulationAccumulatorSeconds,
        deltaSeconds * SIMULATION_BASE_REALTIME_MULTIPLIER,
        this.runState.clock.speed,
        (stepSeconds) => this.updateSimulation(stepSeconds),
      );
      this.simulationAccumulatorSeconds = fixedStepResult.accumulatorSeconds;
    } else {
      this.simulationAccumulatorSeconds = 0;
    }
    this.updateSimulationNotice(now);
    this.clearOrderConfirmations(now);
    this.updateFireworksFinale(now * 0.001);
    this.updateWaterAnimation(now * 0.001);
    this.renderer.render(this.scene, this.camera);
  };
}
