import * as THREE from 'three';

type WorkerRig = {
  root: THREE.Object3D;
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftUpperArm: THREE.Object3D | null;
  leftForearm: THREE.Object3D | null;
  rightUpperArm: THREE.Object3D | null;
  rightForearm: THREE.Object3D | null;
  leftUpperLeg: THREE.Object3D | null;
  leftLowerLeg: THREE.Object3D | null;
  leftFoot: THREE.Object3D | null;
  rightUpperLeg: THREE.Object3D | null;
  rightLowerLeg: THREE.Object3D | null;
  rightFoot: THREE.Object3D | null;
};

type RestTransform = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

function findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
  return root.getObjectByName(name) ?? null;
}

function getWorkerRig(root: THREE.Object3D): WorkerRig {
  return {
    root,
    hips: findNode(root, 'Hips'),
    spine: findNode(root, 'Spine'),
    head: findNode(root, 'Head'),
    leftUpperArm: findNode(root, 'LeftUpperArm'),
    leftForearm: findNode(root, 'LeftForearm'),
    rightUpperArm: findNode(root, 'RightUpperArm'),
    rightForearm: findNode(root, 'RightForearm'),
    leftUpperLeg: findNode(root, 'LeftUpperLeg'),
    leftLowerLeg: findNode(root, 'LeftLowerLeg'),
    leftFoot: findNode(root, 'LeftFoot'),
    rightUpperLeg: findNode(root, 'RightUpperLeg'),
    rightLowerLeg: findNode(root, 'RightLowerLeg'),
    rightFoot: findNode(root, 'RightFoot'),
  };
}

export class WorkerCharacterDriver {
  private readonly rig: WorkerRig;
  private readonly restPose = new Map<THREE.Object3D, RestTransform>();

  public constructor(root: THREE.Object3D) {
    this.rig = getWorkerRig(root);
    Object.values(this.rig).forEach((node) => {
      if (node && !this.restPose.has(node)) {
        this.restPose.set(node, {
          position: node.position.clone(),
          quaternion: node.quaternion.clone(),
          scale: node.scale.clone(),
        });
      }
    });
  }

  public reset(): void {
    this.restPose.forEach((rest, node) => {
      node.position.copy(rest.position);
      node.quaternion.copy(rest.quaternion);
      node.scale.copy(rest.scale);
    });
  }

  public applyWalkCycle(walkT: number): void {
    this.reset();
    const phase = (((walkT % 1) + 1) % 1) * Math.PI * 2;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    const doubleStep = Math.abs(Math.sin(phase * 2));

    if (this.rig.leftUpperLeg) this.rig.leftUpperLeg.rotation.x += sine * 0.45;
    if (this.rig.rightUpperLeg) this.rig.rightUpperLeg.rotation.x -= sine * 0.45;
    if (this.rig.leftLowerLeg) this.rig.leftLowerLeg.rotation.x += Math.max(0, -sine) * 0.35;
    if (this.rig.rightLowerLeg) this.rig.rightLowerLeg.rotation.x += Math.max(0, sine) * 0.35;
    if (this.rig.leftFoot) this.rig.leftFoot.rotation.x += Math.sin(phase + Math.PI * 0.5) * 0.2;
    if (this.rig.rightFoot) this.rig.rightFoot.rotation.x += Math.sin(phase + Math.PI * 1.5) * 0.2;
    if (this.rig.leftUpperArm) this.rig.leftUpperArm.rotation.x -= sine * 0.35;
    if (this.rig.rightUpperArm) this.rig.rightUpperArm.rotation.x += sine * 0.35;
    if (this.rig.leftForearm) this.rig.leftForearm.rotation.x += 0.1 + Math.max(0, sine) * 0.08;
    if (this.rig.rightForearm) this.rig.rightForearm.rotation.x += 0.1 + Math.max(0, -sine) * 0.08;
    if (this.rig.hips) this.rig.hips.position.y += doubleStep * 0.04;
    if (this.rig.spine) {
      this.rig.spine.rotation.x += 0.1;
      this.rig.spine.rotation.z += cosine * 0.025;
    }
    if (this.rig.head) {
      this.rig.head.rotation.x -= 0.06;
      this.rig.head.rotation.z -= cosine * 0.018;
      this.rig.head.position.y += (1 - doubleStep) * 0.008;
    }
  }
}
