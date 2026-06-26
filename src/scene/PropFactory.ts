import * as THREE from 'three';
import { box, cone, cylinder, groupAt, labelSprite } from './helpers';
import { mat, materials } from './materials';

export class PropFactory {
  private readonly pineMaterials = [
    mat(0x4f7f2e),
    mat(0x638f30),
    mat(0x789f32),
    mat(0x3f7030),
  ];

  public createPineTree(x: number, z: number, scale = 1, variant = 0): THREE.Group {
    const tree = groupAt(x, 0.52, z);
    const heightVariation = 0.9 + (variant % 5) * 0.055;
    const widthVariation = 0.94 + ((variant * 3) % 5) * 0.035;
    const trunkHeight = 0.72 * scale * heightVariation;
    const foliageHeight = 0.95 * scale * heightVariation;
    const foliageWidth = scale * widthVariation;
    const branchCount = variant % 3 === 0 ? 3 : 2;
    const lowerMaterial = this.pineMaterials[variant % this.pineMaterials.length];
    const upperMaterial = this.pineMaterials[(variant + 1) % this.pineMaterials.length];

    tree.rotation.y = (variant * 0.73) % (Math.PI * 2);

    const trunk = cylinder(0.12 * scale, 0.16 * scale, trunkHeight, materials.woodDark, 7);
    trunk.position.y = trunkHeight / 2;
    tree.add(trunk);

    const lower = cone(0.72 * foliageWidth, foliageHeight * 1.12, lowerMaterial, 7);
    lower.position.y = trunkHeight + foliageHeight * 0.36;
    lower.rotation.y = 0.22 + variant * 0.17;
    tree.add(lower);

    if (branchCount === 3) {
      const middle = cone(0.58 * foliageWidth, foliageHeight, upperMaterial, 7);
      middle.position.y = trunkHeight + foliageHeight * 0.84;
      middle.rotation.y = -0.12 + variant * 0.11;
      tree.add(middle);
    }

    const upper = cone(0.43 * foliageWidth, foliageHeight * 0.86, upperMaterial, 7);
    upper.position.y = trunkHeight + foliageHeight * (branchCount === 3 ? 1.26 : 1.02);
    upper.rotation.y = 0.36 + variant * 0.13;
    tree.add(upper);
    return tree;
  }

  public createRock(x: number, z: number, scale = 1): THREE.Mesh {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38 * scale, 0), materials.stone);
    rock.position.set(x, 0.76, z);
    rock.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
    rock.scale.y = 0.65;
    rock.castShadow = true;
    rock.receiveShadow = true;
    return rock;
  }

  public createCrate(x: number, z: number, scale = 1): THREE.Group {
    const crate = groupAt(x, 0.7, z);
    crate.add(box(0.55 * scale, 0.55 * scale, 0.55 * scale, materials.wood));
    crate.add(box(0.65 * scale, 0.08 * scale, 0.08 * scale, materials.woodDark, 0, 0.16 * scale, 0));
    crate.add(box(0.08 * scale, 0.08 * scale, 0.65 * scale, materials.woodDark, 0, -0.12 * scale, 0));
    return crate;
  }

  public createBarrel(x: number, z: number): THREE.Group {
    const barrel = groupAt(x, 0.82, z);
    const body = cylinder(0.26, 0.26, 0.58, materials.wood, 10);
    body.rotation.z = Math.PI / 2;
    barrel.add(body);
    barrel.add(box(0.08, 0.6, 0.08, materials.woodDark, -0.16, 0, 0));
    barrel.add(box(0.08, 0.6, 0.08, materials.woodDark, 0.16, 0, 0));
    return barrel;
  }

  public createFence(startX: number, startZ: number, length: number, rotation = 0): THREE.Group {
    const fence = groupAt(startX, 0.72, startZ);
    fence.rotation.y = rotation;

    for (let i = 0; i <= length; i += 1) {
      const post = box(0.12, 0.75, 0.12, materials.woodDark, i - length / 2, 0.12, 0);
      fence.add(post);
    }

    const railA = box(length + 0.4, 0.11, 0.08, materials.wood, 0, 0.25, 0);
    const railB = box(length + 0.4, 0.11, 0.08, materials.wood, 0, -0.05, 0);
    fence.add(railA, railB);
    return fence;
  }

  public createLaunchRack(x: number, z: number): THREE.Group {
    const rack = groupAt(x, 0.65, z);
    rack.add(box(2.6, 0.22, 2.2, materials.stoneDark, 0, 0.04, 0));
    rack.add(box(1.8, 0.12, 1.55, materials.wood, 0, 0.25, 0));

    for (const offset of [-0.45, 0.1, 0.62]) {
      const rocket = cylinder(0.18, 0.18, 1.45, offset < 0 ? materials.red : materials.white, 12);
      rocket.position.set(offset, 1.0, 0);
      rack.add(rocket);
      const nose = cone(0.21, 0.42, offset < 0 ? materials.white : materials.red, 12);
      nose.position.set(offset, 1.95, 0);
      rack.add(nose);
    }

    const label = labelSprite('Launch Field');
    label.position.set(1.5, 2.0, 1.4);
    rack.add(label);
    return rack;
  }
}
