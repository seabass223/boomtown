import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fireworksFactoryModelUrl from '../assets/models/fireworks_factory.glb?url';
import plazaModelUrl from '../assets/models/plaza.glb?url';
import waterTowerModelUrl from '../assets/models/water_tower.glb?url';
import { box, cylinder, labelSprite } from './helpers';
import { mat, palette } from './materials';

export type PrefabBuildingKey =
  | 'waterTower'
  | 'lumberMill'
  | 'launchPad'
  | 'house'
  | 'fireworksFactory'
  | 'quarry'
  | 'plaza';

export type PrefabRotation = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type PrefabDimensions = {
  width: number;
  length: number;
  height: number;
};

export type PrefabBuildingDefinition = {
  key: PrefabBuildingKey;
  label: string;
  requiredCount: number;
  dimensions: PrefabDimensions;
  color: number;
  accentColor: number;
};

export type PrefabGridPlacement = {
  originX: number;
  originZ: number;
  rotation: PrefabRotation;
};

export type PrefabGridCell = {
  x: number;
  z: number;
};

export const PREFAB_GRID_CELL_SIZE = 0.55;
const prefabModelLoader = new GLTFLoader();
const prefabModelCache = new Map<string, Promise<THREE.Group>>();

const PREFAB_MODEL_URLS: Partial<Record<PrefabBuildingKey, string>> = {
  waterTower: waterTowerModelUrl,
  fireworksFactory: fireworksFactoryModelUrl,
  plaza: plazaModelUrl,
};
const HOUSE_MODEL_URLS = import.meta.glob<string>(
  '../assets/models/house_*.glb',
  { eager: true, query: '?url', import: 'default' },
);

export const PREFAB_BUILDINGS: readonly PrefabBuildingDefinition[] = [
  {
    key: 'waterTower',
    label: 'Water Tower',
    requiredCount: 1,
    dimensions: { width: 3, length: 3, height: 8 },
    color: palette.white,
    accentColor: palette.blue,
  },
  {
    key: 'lumberMill',
    label: 'Lumber Mill',
    requiredCount: 1,
    dimensions: { width: 10, length: 4, height: 4 },
    color: palette.wood,
    accentColor: palette.woodDark,
  },
  {
    key: 'launchPad',
    label: 'Launch Pad',
    requiredCount: 1,
    dimensions: { width: 3, length: 3, height: 1 },
    color: palette.stoneDark,
    accentColor: palette.yellow,
  },
  {
    key: 'house',
    label: 'House',
    requiredCount: 4,
    dimensions: { width: 4, length: 3, height: 4 },
    color: palette.cream,
    accentColor: palette.red,
  },
  {
    key: 'fireworksFactory',
    label: 'Fireworks Factory',
    requiredCount: 1,
    dimensions: { width: 5, length: 4, height: 8 },
    color: palette.red,
    accentColor: palette.navy,
  },
  {
    key: 'quarry',
    label: 'Quarry',
    requiredCount: 1,
    dimensions: { width: 4, length: 4, height: 3 },
    color: palette.stone,
    accentColor: palette.stoneDark,
  },
  {
    key: 'plaza',
    label: 'Plaza',
    requiredCount: 1,
    dimensions: { width: 4, length: 4, height: 1 },
    color: palette.path,
    accentColor: palette.white,
  },
] as const;

export const PREFAB_BUILDING_KEYS = PREFAB_BUILDINGS.map((definition) => definition.key);
export const PREFAB_BUILDING_LABELS = PREFAB_BUILDINGS.map((definition) => definition.label);

export function getPrefabDefinition(key: PrefabBuildingKey): PrefabBuildingDefinition {
  const definition = PREFAB_BUILDINGS.find((entry) => entry.key === key);
  if (!definition) {
    throw new Error(`Unknown prefab building: ${key}`);
  }
  return definition;
}

export function getPrefabDefinitionByLabel(label: string): PrefabBuildingDefinition {
  const definition = PREFAB_BUILDINGS.find((entry) => entry.label === label);
  if (!definition) {
    throw new Error(`Unknown prefab building label: ${label}`);
  }
  return definition;
}

export function getPrefabWorldDimensions(definition: PrefabBuildingDefinition): PrefabDimensions {
  return {
    width: definition.dimensions.width * PREFAB_GRID_CELL_SIZE,
    length: definition.dimensions.length * PREFAB_GRID_CELL_SIZE,
    height: definition.dimensions.height * PREFAB_GRID_CELL_SIZE,
  };
}

export function getRotatedPrefabDimensions(
  definition: PrefabBuildingDefinition,
  rotation: PrefabRotation,
): PrefabDimensions {
  const { width, length, height } = definition.dimensions;
  if (rotation % 2 === 0) {
    return rotation % 4 === 0 ? { width, length, height } : { width: length, length: width, height };
  }

  const radians = getPrefabRotationRadians(rotation);
  return {
    width: Math.ceil(Math.abs(width * Math.cos(radians)) + Math.abs(length * Math.sin(radians))),
    length: Math.ceil(Math.abs(width * Math.sin(radians)) + Math.abs(length * Math.cos(radians))),
    height,
  };
}

export function getPrefabPlacementForWorldPoint(
  definition: PrefabBuildingDefinition,
  point: THREE.Vector2,
  rotation: PrefabRotation,
): PrefabGridPlacement {
  const dimensions = getRotatedPrefabDimensions(definition, rotation);
  return {
    originX: Math.round(point.x / PREFAB_GRID_CELL_SIZE - dimensions.width / 2),
    originZ: Math.round(point.y / PREFAB_GRID_CELL_SIZE - dimensions.length / 2),
    rotation,
  };
}

export function getPrefabFootprintCells(
  definition: PrefabBuildingDefinition,
  placement: PrefabGridPlacement,
): PrefabGridCell[] {
  const dimensions = getRotatedPrefabDimensions(definition, placement.rotation);
  const cells: PrefabGridCell[] = [];
  for (let x = 0; x < dimensions.width; x += 1) {
    for (let z = 0; z < dimensions.length; z += 1) {
      cells.push({ x: placement.originX + x, z: placement.originZ + z });
    }
  }
  return cells;
}

export function getPrefabCellKey(cell: PrefabGridCell): string {
  return `${cell.x}:${cell.z}`;
}

export function getPrefabCellCenter(cell: PrefabGridCell): THREE.Vector2 {
  return new THREE.Vector2((cell.x + 0.5) * PREFAB_GRID_CELL_SIZE, (cell.z + 0.5) * PREFAB_GRID_CELL_SIZE);
}

export function getPrefabWorldCenter(
  definition: PrefabBuildingDefinition,
  placement: PrefabGridPlacement,
): THREE.Vector2 {
  const dimensions = getRotatedPrefabDimensions(definition, placement.rotation);
  return new THREE.Vector2(
    (placement.originX + dimensions.width / 2) * PREFAB_GRID_CELL_SIZE,
    (placement.originZ + dimensions.length / 2) * PREFAB_GRID_CELL_SIZE,
  );
}

export function getPrefabWorldFootprintCorners(
  definition: PrefabBuildingDefinition,
  placement: PrefabGridPlacement,
): THREE.Vector2[] {
  const center = getPrefabWorldCenter(definition, placement);
  const width = definition.dimensions.width * PREFAB_GRID_CELL_SIZE;
  const length = definition.dimensions.length * PREFAB_GRID_CELL_SIZE;
  const radians = getPrefabRotationRadians(placement.rotation);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return [
    new THREE.Vector2(-width / 2, -length / 2),
    new THREE.Vector2(width / 2, -length / 2),
    new THREE.Vector2(width / 2, length / 2),
    new THREE.Vector2(-width / 2, length / 2),
  ].map(
    (corner) =>
      new THREE.Vector2(
        center.x + corner.x * cos - corner.y * sin,
        center.y + corner.x * sin + corner.y * cos,
      ),
  );
}

export function getPrefabRotationDegrees(rotation: PrefabRotation): number {
  return rotation * 45;
}

export function getPrefabRotationRadians(rotation: PrefabRotation): number {
  return THREE.MathUtils.degToRad(getPrefabRotationDegrees(rotation));
}

export function getPrefabRotationFromDegrees(degrees: number): PrefabRotation {
  return (THREE.MathUtils.euclideanModulo(Math.round(degrees / 45), 8) as PrefabRotation);
}

export function createPrefabBuilding(
  definition: PrefabBuildingDefinition,
  houseOrdinal?: number,
): THREE.Group {
  const group = new THREE.Group();
  const dimensions = getPrefabWorldDimensions(definition);
  const material = mat(definition.color);
  const accentMaterial = mat(definition.accentColor);
  const darkMaterial = mat(palette.woodDark);

  group.name = `${definition.label} prefab`;
  group.userData.prefabKey = definition.key;
  group.userData.dimensions = { ...definition.dimensions };

  group.add(box(dimensions.width, 0.08, dimensions.length, accentMaterial, 0, 0.04, 0));
  const label = labelSprite(`${definition.label} ${definition.dimensions.width}x${definition.dimensions.length}x${definition.dimensions.height}`);
  label.name = `${definition.label} label`;
  label.position.set(0, dimensions.height + 0.45, dimensions.length * 0.38);
  group.add(label);

  switch (definition.key) {
    case 'waterTower': {
      const fallback = new THREE.Group();
      fallback.name = 'Water Tower primitive fallback';
      addWaterTowerPrimitive(fallback, dimensions, material, accentMaterial, darkMaterial);
      group.add(fallback);
      void replaceFallbackWithModel(group, fallback, definition, label);
      break;
    }
    case 'lumberMill':
      addBlockBuilding(group, dimensions, material, accentMaterial, 0.76);
      addStackedLogs(group, dimensions, darkMaterial);
      break;
    case 'launchPad':
      addLaunchPadPrimitive(group, dimensions, material, accentMaterial);
      break;
    case 'house': {
      const fallback = new THREE.Group();
      fallback.name = 'House primitive fallback';
      addHousePrimitive(fallback, dimensions, material, accentMaterial);
      group.add(fallback);
      void replaceFallbackWithModel(group, fallback, definition, label, houseOrdinal);
      break;
    }
    case 'fireworksFactory': {
      const fallback = new THREE.Group();
      fallback.name = 'Fireworks Factory primitive fallback';
      addBlockBuilding(fallback, dimensions, material, accentMaterial, 0.72);
      fallback.add(box(dimensions.width * 0.26, dimensions.height * 0.58, dimensions.length * 0.28, accentMaterial, -dimensions.width * 0.28, dimensions.height * 0.56, 0));
      group.add(fallback);
      void replaceFallbackWithModel(group, fallback, definition, label);
      break;
    }
    case 'quarry':
      addQuarryPrimitive(group, dimensions, material, accentMaterial);
      break;
    case 'plaza': {
      const fallback = new THREE.Group();
      fallback.name = 'Plaza primitive fallback';
      addPlazaPrimitive(fallback, dimensions, material, accentMaterial);
      group.add(fallback);
      void replaceFallbackWithModel(group, fallback, definition, label);
      break;
    }
  }

  return group;
}

function getPrefabModel(url: string): Promise<THREE.Group> {
  let model = prefabModelCache.get(url);
  if (!model) {
    model = prefabModelLoader.loadAsync(url).then((gltf) => gltf.scene);
    prefabModelCache.set(url, model);
  }
  return model;
}

function cloneModelForPrefab(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
  clone.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    mesh.geometry = mesh.geometry.clone();
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return clone;
}

function disposeDetachedObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => material.dispose());
    } else {
      mesh.material?.dispose();
    }
  });
}

async function replaceFallbackWithModel(
  prefab: THREE.Group,
  fallback: THREE.Group,
  definition: PrefabBuildingDefinition,
  label: THREE.Sprite,
  houseOrdinal?: number,
): Promise<void> {
  const url = definition.key === 'house' && houseOrdinal !== undefined
    ? HOUSE_MODEL_URLS[`../assets/models/house_${houseOrdinal}.glb`]
    : PREFAB_MODEL_URLS[definition.key];
  if (!url) {
    return;
  }

  try {
    const source = await getPrefabModel(url);
    const model = cloneModelForPrefab(source);
    if (!prefab.parent) {
      disposeDetachedObject(model);
      return;
    }

    const sourceBounds = new THREE.Box3().setFromObject(model);
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
    const dimensions = getPrefabWorldDimensions(definition);
    const modelScaleMultiplier =
      definition.key === 'plaza' || definition.key === 'house' ? 3 : 2;
    const scale = Math.min(
      (dimensions.width * 0.94) / Math.max(0.001, sourceSize.x),
      (dimensions.length * 0.94) / Math.max(0.001, sourceSize.z),
    ) * modelScaleMultiplier;

    model.name = `${definition.label} GLB model`;
    model.scale.setScalar(scale);
    model.position.set(
      -sourceCenter.x * scale,
      -sourceBounds.min.y * scale + 0.08,
      -sourceCenter.z * scale,
    );
    model.userData.assetUrl = url;

    fallback.removeFromParent();
    disposeDetachedObject(fallback);
    prefab.add(model);
    label.position.y = sourceSize.y * scale + 0.53;
  } catch (error) {
    console.warn(`Could not load ${definition.label} model; keeping primitive fallback.`, error);
  }
}

export function createPrefabPlacementPreview(
  definition: PrefabBuildingDefinition,
  placement: PrefabGridPlacement,
  canPlace: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const dimensions = getPrefabWorldDimensions(definition);
  const color = canPlace ? 0x64d26f : 0xe55353;
  const center = getPrefabWorldCenter(definition, placement);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const footprintMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
  });

  const footprint = box(dimensions.width, 0.06, dimensions.length, footprintMaterial, 0, 0.03, 0);
  const volume = box(dimensions.width, dimensions.height, dimensions.length, material, 0, dimensions.height * 0.5, 0);
  volume.name = canPlace ? 'Valid prefab placement preview' : 'Invalid prefab placement preview';
  group.add(footprint, volume);
  group.position.set(center.x, 0, center.y);
  group.rotation.y = getPrefabRotationRadians(placement.rotation);
  return group;
}

function addWaterTowerPrimitive(
  group: THREE.Group,
  dimensions: PrefabDimensions,
  tankMaterial: THREE.Material,
  accentMaterial: THREE.Material,
  legMaterial: THREE.Material,
): void {
  const legHeight = dimensions.height * 0.56;
  for (const x of [-0.34, 0.34]) {
    for (const z of [-0.34, 0.34]) {
      const leg = cylinder(0.035, 0.045, legHeight, legMaterial, 6);
      leg.position.set(x * dimensions.width, legHeight * 0.5 + 0.08, z * dimensions.length);
      group.add(leg);
    }
  }

  const tank = cylinder(dimensions.width * 0.34, dimensions.width * 0.36, dimensions.height * 0.26, tankMaterial, 16);
  tank.position.y = legHeight + dimensions.height * 0.16;
  group.add(tank);
  group.add(box(dimensions.width * 0.78, dimensions.height * 0.04, dimensions.length * 0.08, accentMaterial, 0, tank.position.y, dimensions.length * 0.36));
}

function addBlockBuilding(
  group: THREE.Group,
  dimensions: PrefabDimensions,
  material: THREE.Material,
  accentMaterial: THREE.Material,
  bodyHeightRatio: number,
): void {
  const bodyHeight = dimensions.height * bodyHeightRatio;
  group.add(box(dimensions.width * 0.9, bodyHeight, dimensions.length * 0.84, material, 0, bodyHeight * 0.5 + 0.08, 0));
  group.add(box(dimensions.width, dimensions.height * 0.12, dimensions.length * 0.94, accentMaterial, 0, bodyHeight + dimensions.height * 0.14, 0));
}

function addStackedLogs(group: THREE.Group, dimensions: PrefabDimensions, material: THREE.Material): void {
  for (let index = 0; index < 3; index += 1) {
    const log = cylinder(0.055, 0.055, dimensions.width * 0.42, material, 8);
    log.rotation.z = Math.PI * 0.5;
    log.position.set(-dimensions.width * 0.2, 0.18 + index * 0.11, dimensions.length * 0.34);
    group.add(log);
  }
}

function addLaunchPadPrimitive(
  group: THREE.Group,
  dimensions: PrefabDimensions,
  material: THREE.Material,
  accentMaterial: THREE.Material,
): void {
  group.add(cylinder(dimensions.width * 0.36, dimensions.width * 0.42, dimensions.height * 0.46, material, 18));
  const stripeA = box(dimensions.width * 0.82, dimensions.height * 0.08, dimensions.length * 0.08, accentMaterial, 0, dimensions.height * 0.28, 0);
  const stripeB = stripeA.clone();
  stripeB.rotation.y = Math.PI * 0.5;
  group.add(stripeA, stripeB);
}

function addHousePrimitive(
  group: THREE.Group,
  dimensions: PrefabDimensions,
  material: THREE.Material,
  roofMaterial: THREE.Material,
): void {
  const bodyHeight = dimensions.height * 0.65;
  group.add(box(dimensions.width * 0.82, bodyHeight, dimensions.length * 0.78, material, 0, bodyHeight * 0.5 + 0.08, 0));
  group.add(box(dimensions.width * 0.95, dimensions.height * 0.22, dimensions.length * 0.9, roofMaterial, 0, bodyHeight + dimensions.height * 0.16, 0));
}

function addQuarryPrimitive(
  group: THREE.Group,
  dimensions: PrefabDimensions,
  material: THREE.Material,
  accentMaterial: THREE.Material,
): void {
  group.add(box(dimensions.width * 0.92, dimensions.height * 0.18, dimensions.length * 0.92, material, 0, dimensions.height * 0.16, 0));
  for (const [x, z, scale] of [
    [-0.28, -0.24, 0.3],
    [0.18, -0.08, 0.38],
    [0.3, 0.26, 0.24],
  ] as const) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(dimensions.width * scale, 0), accentMaterial);
    rock.position.set(x * dimensions.width, dimensions.height * 0.34, z * dimensions.length);
    rock.scale.y = 0.58;
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
  }
}

function addPlazaPrimitive(
  group: THREE.Group,
  dimensions: PrefabDimensions,
  material: THREE.Material,
  accentMaterial: THREE.Material,
): void {
  group.add(box(dimensions.width * 0.92, dimensions.height * 0.18, dimensions.length * 0.92, material, 0, dimensions.height * 0.14, 0));
  group.add(cylinder(dimensions.width * 0.12, dimensions.width * 0.14, dimensions.height * 0.42, accentMaterial, 8));
}
