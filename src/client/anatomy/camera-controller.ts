import { Box3, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class CameraController {
  readonly controls: OrbitControls;
  private readonly camera: PerspectiveCamera;
  private readonly target = new Vector3(0, 0, 0);

  constructor(camera: PerspectiveCamera, element: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, element);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = true;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 8;
    this.controls.target.copy(this.target);
  }

  setTarget(target: Vector3): void {
    this.target.copy(target);
    this.controls.target.copy(target);
  }

  preset(view: 'front' | 'back' | 'left' | 'right' = 'front', distance = 3.2): void {
    const positions: Record<string, Vector3> = {
      front: new Vector3(0, 0.2, distance),
      back: new Vector3(0, 0.2, -distance),
      left: new Vector3(-distance, 0.2, 0),
      right: new Vector3(distance, 0.2, 0)
    };
    this.camera.position.copy(positions[view] || positions.front);
    this.controls.target.copy(this.target);
    this.controls.update();
  }

  focus(object: Object3D, padding = 1.8): void {
    const bounds = new Box3().setFromObject(object);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const radius = Math.max(size.length() * 0.5, 0.08);
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 0.0001) direction.set(0, 0, 1);
    direction.normalize();
    const fovRadians = (this.camera.fov * Math.PI) / 180;
    const distance = Math.max(radius * padding / Math.tan(fovRadians / 2), this.controls.minDistance);
    this.target.copy(center);
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(direction.multiplyScalar(Math.min(distance, this.controls.maxDistance)));
    this.controls.update();
  }

  update(): void { this.controls.update(); }
  dispose(): void { this.controls.dispose(); }
}
