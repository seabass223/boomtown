import * as THREE from 'three';
import { box, cone, cylinder, groupAt, labelSprite } from './helpers';
import { materials } from './materials';

export class BuildingFactory {
  public createHouse(x: number, z: number, color: THREE.Material, rotation = 0): THREE.Group {
    const house = groupAt(x, 0.64, z);
    house.rotation.y = rotation;
    house.add(box(1.85, 1.15, 1.5, color, 0, 0.58, 0));

    const roof = this.createGableRoof(2.15, 0.75, 1.78, materials.navy);
    roof.position.y = 1.42;
    house.add(roof);

    house.add(box(0.42, 0.62, 0.06, materials.woodDark, 0, 0.38, 0.78));
    house.add(box(0.34, 0.34, 0.07, materials.yellow, -0.58, 0.74, 0.78));
    house.add(box(0.34, 0.34, 0.07, materials.yellow, 0.58, 0.74, 0.78));
    return house;
  }

  public createFireworksFactory(): THREE.Group {
    const factory = groupAt(8.8, 0.6, 1.3);
    factory.rotation.y = -0.12;
    factory.add(box(3.8, 2.0, 2.7, materials.red, 0, 1, 0));
    factory.add(box(3.2, 1.55, 2.9, materials.cream, -0.15, 1.2, -0.12));
    factory.add(box(4.25, 0.52, 3.05, materials.navy, 0, 2.28, 0));

    const tower = box(1.1, 2.7, 1.05, materials.red, -1.58, 1.35, 0.52);
    factory.add(tower);
    factory.add(box(1.28, 0.38, 1.22, materials.navy, -1.58, 2.9, 0.52));

    for (const x of [-0.8, 0.05, 0.9]) {
      factory.add(box(0.42, 0.55, 0.08, materials.blue, x, 1.35, 1.5));
    }

    const door = box(0.92, 1.1, 0.08, materials.woodDark, 1.3, 0.62, 1.5);
    factory.add(door);

    const chimney = cylinder(0.34, 0.42, 2.45, materials.white, 18);
    chimney.position.set(2.2, 1.8, -0.7);
    factory.add(chimney);
    for (const y of [1.25, 1.85, 2.45]) {
      factory.add(box(0.78, 0.16, 0.08, materials.red, 2.2, y, -0.35));
    }

    for (const x of [-1.25, -0.75, -0.25]) {
      const rocket = cylinder(0.12, 0.12, 0.95, materials.blue, 10);
      rocket.position.set(x, 0.8, 1.72);
      factory.add(rocket);
      const nose = cone(0.14, 0.28, materials.red, 10);
      nose.position.set(x, 1.42, 1.72);
      factory.add(nose);
    }

    const label = labelSprite('Fireworks Factory');
    label.position.set(0.55, 3.5, 1.7);
    factory.add(label);
    return factory;
  }

  public createWaterTower(): THREE.Group {
    const tower = groupAt(-2.4, 0.55, -2.6);
    for (const x of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        const leg = cylinder(0.05, 0.06, 2.5, materials.woodDark, 6);
        leg.position.set(x, 1.25, z);
        tower.add(leg);
      }
    }
    tower.add(box(1.55, 0.1, 1.55, materials.wood, 0, 2.2, 0));

    const tank = cylinder(0.88, 0.88, 1.08, materials.white, 18);
    tank.position.y = 3.0;
    tower.add(tank);
    tower.add(box(1.8, 0.2, 0.08, materials.red, 0, 3.0, 0.86));

    const cap = cone(0.98, 0.42, materials.cream, 18);
    cap.position.y = 3.76;
    tower.add(cap);

    const star = box(0.35, 0.35, 0.08, materials.blue, 0, 3.05, 0.91);
    star.rotation.z = Math.PI / 4;
    tower.add(star);
    return tower;
  }

  public createLumberMill(): THREE.Group {
    const mill = groupAt(-8.3, 0.58, 4.1);
    mill.rotation.y = 0.18;
    mill.add(box(3.2, 0.28, 2.2, materials.wood, 0, 0.12, 0));
    mill.add(box(2.45, 1.25, 1.65, materials.wood, -0.15, 0.78, 0));
    mill.add(this.createGableRoof(2.8, 0.65, 1.95, materials.blue).translateY(1.56));

    for (const z of [-1.25, -0.95, -0.65]) {
      const log = cylinder(0.16, 0.16, 2.0, materials.wood, 10);
      log.rotation.z = Math.PI / 2;
      log.position.set(-1.9, 0.42, z);
      mill.add(log);
    }

    const label = labelSprite('Lumber Mill');
    label.position.set(0.3, 2.5, 1.4);
    mill.add(label);
    return mill;
  }

  public createQuarry(): THREE.Group {
    const quarry = groupAt(3.7, 0.58, -6.7);
    quarry.rotation.y = -0.25;

    for (const [x, z, s] of [
      [-1.4, -0.7, 1.15],
      [-0.5, 0.4, 1.35],
      [0.7, -0.35, 1.1],
      [1.3, 0.8, 0.9],
    ]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), materials.stoneDark);
      rock.position.set(x, s * 0.55, z);
      rock.scale.y = 0.75;
      rock.castShadow = true;
      rock.receiveShadow = true;
      quarry.add(rock);
    }

    quarry.add(box(2.4, 0.18, 1.65, materials.wood, 0, 0.9, 0));
    quarry.add(box(0.16, 1.25, 0.16, materials.woodDark, -1.1, 0.65, -0.72));
    quarry.add(box(0.16, 1.25, 0.16, materials.woodDark, 1.1, 0.65, -0.72));
    quarry.add(box(0.16, 1.25, 0.16, materials.woodDark, -1.1, 0.65, 0.72));
    quarry.add(box(0.16, 1.25, 0.16, materials.woodDark, 1.1, 0.65, 0.72));

    const cart = box(0.85, 0.42, 0.65, materials.woodDark, -1.6, 0.35, 1.25);
    quarry.add(cart);

    const railA = box(3.7, 0.07, 0.07, materials.woodDark, -0.3, 0.16, 1.25);
    const railB = box(3.7, 0.07, 0.07, materials.woodDark, -0.3, 0.16, 1.58);
    quarry.add(railA, railB);

    const label = labelSprite('Quarry');
    label.position.set(0.55, 2.55, 0.95);
    quarry.add(label);
    return quarry;
  }

  private createGableRoof(width: number, height: number, depth: number, material: THREE.Material): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(0, height);
    shape.lineTo(width / 2, 0);
    shape.lineTo(-width / 2, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(geometry, material);
    roof.castShadow = true;
    roof.receiveShadow = true;
    return roof;
  }
}
