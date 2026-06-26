import * as THREE from 'three';

export class LightingController {
  public addTo(scene: THREE.Scene): void {
    const ambient = new THREE.HemisphereLight(0xfff2d0, 0x2c4f69, 2.1);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffd59a, 4.2);
    sun.position.set(-12, 22, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x7cc9ff, 1.3);
    rim.position.set(14, 10, -16);
    scene.add(rim);
  }
}
