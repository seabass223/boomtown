import * as THREE from 'three';
import { box, cylinder, groupAt } from './helpers';
import { materials } from './materials';

export class TownsfolkFactory {
  public createWorker(x: number, z: number, shirt: THREE.Material = materials.blue, rotation = 0): THREE.Group {
    const worker = groupAt(x, 0.7, z);
    worker.rotation.y = rotation;

    const legs = box(0.24, 0.42, 0.18, materials.black, 0, 0.2, 0);
    const body = cylinder(0.18, 0.2, 0.5, shirt, 8);
    body.position.y = 0.66;
    const head = cylinder(0.15, 0.15, 0.18, materials.cream, 10);
    head.position.y = 1.0;
    const hat = cylinder(0.24, 0.18, 0.12, materials.yellow, 10);
    hat.position.y = 1.13;

    worker.add(legs, body, head, hat);

    const tool = box(0.08, 0.7, 0.08, materials.woodDark, 0.26, 0.56, 0);
    tool.rotation.z = -0.5;
    worker.add(tool);

    return worker;
  }

  public createGroup(): THREE.Group {
    const people = new THREE.Group();
    people.name = 'Townsfolk';
    const placements: Array<[number, number, THREE.Material, number]> = [
      [-7.8, 2.3, materials.blue, 0.4],
      [-4.4, -2.1, materials.navy, -0.8],
      [-1.2, -1.3, materials.blue, 0.2],
      [2.8, -4.9, materials.red, 1.4],
      [4.2, -5.1, materials.blue, 1.6],
      [5.4, -5.0, materials.blue, 1.5],
      [7.5, 2.2, materials.blue, -0.6],
      [8.7, -3.1, materials.yellow, 0.4],
      [-9.8, -3.0, materials.navy, -0.1],
      [5.4, 5.6, materials.blue, 1.1],
    ];

    placements.forEach(([x, z, shirt, rotation]) => people.add(this.createWorker(x, z, shirt, rotation)));
    return people;
  }
}
