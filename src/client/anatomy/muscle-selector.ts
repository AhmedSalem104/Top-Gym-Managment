import { Raycaster, Vector2, type Camera, type Mesh, type Object3D, type WebGLRenderer } from 'three';

export class MuscleSelector {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly camera: Camera;
  private readonly renderer: WebGLRenderer;
  private readonly root: Object3D;
  private readonly onSelect: (mesh: Mesh | null) => void;
  private readonly onHover: (mesh: Mesh | null) => void;

  constructor(renderer: WebGLRenderer, camera: Camera, root: Object3D, onSelect: (mesh: Mesh | null) => void, onHover: (mesh: Mesh | null) => void) {
    this.renderer = renderer;
    this.camera = camera;
    this.root = root;
    this.onSelect = onSelect;
    this.onHover = onHover;
    renderer.domElement.addEventListener('pointerup', this.pointerUp);
    renderer.domElement.addEventListener('pointermove', this.pointerMove);
  }

  private pick(event: PointerEvent): Mesh | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.root, true).find((item) => item.object.userData?.muscle);
    return (hit?.object as Mesh) || null;
  }

  private readonly pointerUp = (event: PointerEvent): void => this.onSelect(this.pick(event));
  private readonly pointerMove = (event: PointerEvent): void => this.onHover(this.pick(event));

  dispose(): void {
    this.renderer.domElement.removeEventListener('pointerup', this.pointerUp);
    this.renderer.domElement.removeEventListener('pointermove', this.pointerMove);
  }
}
