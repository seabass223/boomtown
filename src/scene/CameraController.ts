import * as THREE from 'three';

export class CameraController {
  public readonly camera: THREE.OrthographicCamera;

  private readonly target = new THREE.Vector3(0, 0, 0);
  private readonly canvas: HTMLCanvasElement;
  private readonly orbitDistance = 31;
  private readonly activePointers = new Map<number, THREE.Vector2>();
  private readonly pointerButtons = new Map<number, number>();
  private aspect = 1;
  private azimuth = Math.PI / 4;
  private elevation = 0.62;
  private viewSize = 24;
  private lastPinchDistance: number | null = null;
  private lastPinchCenter: THREE.Vector2 | null = null;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.bindControls();
    this.applyCamera();
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('lostpointercapture', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('auxclick', this.onAuxClick);
  }

  public resize(width: number, height: number): void {
    this.aspect = width / height;
    this.updateProjection();
  }

  public update(): void {
    this.applyCamera();
  }

  private bindControls(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('lostpointercapture', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('auxclick', this.onAuxClick);
  }

  private updateProjection(): void {
    this.camera.left = (-this.viewSize * this.aspect) / 2;
    this.camera.right = (this.viewSize * this.aspect) / 2;
    this.camera.top = this.viewSize / 2;
    this.camera.bottom = -this.viewSize / 2;
    this.camera.updateProjectionMatrix();
  }

  private applyCamera(): void {
    const horizontalDistance = Math.cos(this.elevation) * this.orbitDistance;
    this.camera.position.set(
      Math.sin(this.azimuth) * horizontalDistance,
      Math.sin(this.elevation) * this.orbitDistance,
      Math.cos(this.azimuth) * horizontalDistance,
    );
    this.camera.position.add(this.target);
    this.camera.lookAt(this.target);
  }

  private zoomBy(multiplier: number): void {
    this.viewSize = THREE.MathUtils.clamp(this.viewSize * multiplier, 10, 38);
    this.updateProjection();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.activePointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    this.pointerButtons.set(event.pointerId, event.button);
    this.lastPinchDistance = this.getPinchDistance();
    this.lastPinchCenter = this.getPinchCenter();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.activePointers.get(event.pointerId);
    if (!previous) {
      return;
    }

    const current = new THREE.Vector2(event.clientX, event.clientY);
    this.activePointers.set(event.pointerId, current);

    if (this.activePointers.size === 1) {
      const delta = current.clone().sub(previous);
      if (this.pointerButtons.get(event.pointerId) === 1 || (event.buttons & 4) === 4) {
        this.panByScreenDelta(delta);
        return;
      }

      this.azimuth -= delta.x * 0.008;
      this.elevation = THREE.MathUtils.clamp(this.elevation + delta.y * 0.0045, 0.38, 1.08);
      this.lastPinchDistance = null;
      this.lastPinchCenter = null;
      return;
    }

    const pinchDistance = this.getPinchDistance();
    const pinchCenter = this.getPinchCenter();
    if (pinchCenter && this.lastPinchCenter) {
      this.panByScreenDelta(pinchCenter.clone().sub(this.lastPinchCenter));
    }

    if (pinchDistance && this.lastPinchDistance) {
      this.zoomBy(this.lastPinchDistance / pinchDistance);
    }
    this.lastPinchDistance = pinchDistance;
    this.lastPinchCenter = pinchCenter;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    this.activePointers.delete(event.pointerId);
    this.pointerButtons.delete(event.pointerId);
    this.lastPinchDistance = this.getPinchDistance();
    this.lastPinchCenter = this.getPinchCenter();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoomBy(1 + event.deltaY * 0.001);
  };

  private readonly onAuxClick = (event: MouseEvent): void => {
    if (event.button === 1) {
      event.preventDefault();
    }
  };

  private panByScreenDelta(delta: THREE.Vector2): void {
    const worldUnitsPerPixel = this.viewSize / Math.max(1, this.canvas.clientHeight);
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const forward = new THREE.Vector3(Math.sin(this.azimuth), 0, Math.cos(this.azimuth));
    this.target.addScaledVector(right, -delta.x * worldUnitsPerPixel);
    this.target.addScaledVector(forward, delta.y * worldUnitsPerPixel);
  }

  private getPinchDistance(): number | null {
    if (this.activePointers.size < 2) {
      return null;
    }

    const [first, second] = [...this.activePointers.values()];
    return first.distanceTo(second);
  }

  private getPinchCenter(): THREE.Vector2 | null {
    if (this.activePointers.size < 2) {
      return null;
    }

    const [first, second] = [...this.activePointers.values()];
    return first.clone().add(second).multiplyScalar(0.5);
  }
}
