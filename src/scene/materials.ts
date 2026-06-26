import * as THREE from 'three';

export const palette = {
  grass: 0x86b943,
  grassDark: 0x5c8f36,
  water: 0x1b6d93,
  waterDeep: 0x0f3654,
  sand: 0xd7bd73,
  dirt: 0xc28d52,
  path: 0xdbad6a,
  stone: 0x9d9d8e,
  stoneDark: 0x6f7168,
  wood: 0x9a6538,
  woodDark: 0x634126,
  red: 0xc9433b,
  blue: 0x2d6f9f,
  navy: 0x26384b,
  cream: 0xf8dfb5,
  yellow: 0xf3bf43,
  white: 0xf5f1e6,
  black: 0x24262d,
  flowerPink: 0xf06a9f,
  flowerBlue: 0x6eb4ff,
  spark: 0xffd36e,
};

export function mat(color: number, roughness = 0.78): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0.04,
    flatShading: true,
  });
}

export const materials = {
  grass: mat(palette.grass),
  grassDark: mat(palette.grassDark),
  water: mat(palette.water, 0.55),
  waterDeep: mat(palette.waterDeep, 0.5),
  sand: mat(palette.sand),
  dirt: mat(palette.dirt),
  path: mat(palette.path),
  stone: mat(palette.stone),
  stoneDark: mat(palette.stoneDark),
  wood: mat(palette.wood),
  woodDark: mat(palette.woodDark),
  red: mat(palette.red),
  blue: mat(palette.blue),
  navy: mat(palette.navy),
  cream: mat(palette.cream),
  yellow: mat(palette.yellow),
  white: mat(palette.white),
  black: mat(palette.black),
  flowerPink: mat(palette.flowerPink),
  flowerBlue: mat(palette.flowerBlue),
  spark: mat(palette.spark, 0.35),
};
