import { AmbientLight, Box3, Color, DirectionalLight, Group, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Mesh } from 'three';
import type { AnatomyViewerOptions, MuscleRecord } from './types';
import { AnatomyModelLoader } from './anatomy-model-loader';
import { CameraController } from './camera-controller';
import { loadMuscleMapping, MuscleMapping } from './muscle-mapping';
import { MuscleHighlighter } from './muscle-highlighter';
import { MuscleSelector } from './muscle-selector';

export class AnatomyViewer {
  private readonly container: HTMLElement;
  private readonly options: AnatomyViewerOptions;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly cameraController: CameraController;
  private readonly highlighter = new MuscleHighlighter();
  private modelRoot: Group | null = null;
  private selector: MuscleSelector | null = null;
  private mapping: MuscleMapping | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frame = 0;
  private selected: Mesh | null = null;
  private ambientLight: AmbientLight | null = null;
  private keyLight: DirectionalLight | null = null;
  private fillLight: DirectionalLight | null = null;
  private rimLight: DirectionalLight | null = null;
  private readonly themeListener = (): void => this.syncTheme();

  constructor(container: HTMLElement, options: AnatomyViewerOptions = {}) {
    this.container = container;
    this.options = options;
    this.camera = new PerspectiveCamera(35, 1, 0.01, 100);
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxPixelRatio || 1.75));
    this.renderer.setClearColor(new Color(), 0);
    this.renderer.domElement.className = 'portal-anatomy-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'عارض تشريحي ثلاثي الأبعاد');
    this.container.replaceChildren(this.renderer.domElement);
    this.cameraController = new CameraController(this.camera, this.renderer.domElement);
    this.addStudioLighting();
    this.syncTheme();
    window.addEventListener('topgym:themechange', this.themeListener);
  }

  private addStudioLighting(): void {
    this.ambientLight = new AmbientLight(new Color(), 2.1);
    this.keyLight = new DirectionalLight(new Color(), 3.2);
    this.keyLight.position.set(3, 5, 4);
    this.fillLight = new DirectionalLight(new Color(), 1.5);
    this.fillLight.position.set(-4, 2, 2);
    this.rimLight = new DirectionalLight(new Color(), 2);
    this.rimLight.position.set(0, 3, -5);
    this.scene.add(this.ambientLight, this.keyLight, this.fillLight, this.rimLight);
  }

  private syncTheme(): void {
    const styles = getComputedStyle(document.documentElement);
    const canvasBackground = styles.getPropertyValue('--anatomy-canvas-bg').trim();
    const keyLight = styles.getPropertyValue('--anatomy-key-light').trim();
    const fillLight = styles.getPropertyValue('--anatomy-fill-light').trim();
    const rimLight = styles.getPropertyValue('--anatomy-rim-light').trim();
    if (canvasBackground) this.renderer.setClearColor(new Color(canvasBackground), 0);
    if (keyLight) {
      this.ambientLight?.color.set(keyLight);
      this.keyLight?.color.set(keyLight);
    }
    if (fillLight) this.fillLight?.color.set(fillLight);
    if (rimLight) this.rimLight?.color.set(rimLight);
  }

  async mount(): Promise<void> {
    try {
      this.options.onProgress?.(3);
      this.mapping = await loadMuscleMapping();
      this.options.onProgress?.(8);
      const root = await new AnatomyModelLoader(this.options).load((progress) => this.options.onProgress?.(8 + Math.round(progress * .86)));
      this.modelRoot = root;
      this.prepareModel(root);
      this.scene.add(root);
      this.options.onProgress?.(100);
      this.resize();
      this.animate();
    } catch (error) {
      const failure = error instanceof Error ? error : new Error('Anatomy model failed to load.');
      this.options.onModelUnavailable?.(failure);
      this.dispose();
      throw failure;
    }
  }

  private prepareModel(root: Group): void {
    const bounds = new Box3().setFromObject(root);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const maxSize = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(2.4 / maxSize);
    root.position.sub(center.multiplyScalar(root.scale.x));
    const scaledBounds = new Box3().setFromObject(root);
    const scaledCenter = scaledBounds.getCenter(new Vector3());
    this.cameraController.setTarget(scaledCenter);
    this.cameraController.preset('front', 3.2);
    this.isolateMaterials(root);
    this.mapping?.attach(root);
    this.selector = new MuscleSelector(this.renderer, this.camera, root, (mesh) => this.select(mesh), (mesh) => this.hover(mesh));
  }

  private isolateMaterials(root: Group): void {
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = materials.map((material: any) => material?.clone?.() || material);
    });
  }

  private select(mesh: Mesh | null): void {
    this.selected = mesh;
    if (this.modelRoot) this.highlighter.highlight(this.modelRoot, mesh);
    if (mesh) this.cameraController.focus(mesh);
    const muscle = mesh?.userData?.muscle as MuscleRecord | undefined;
    this.options.onMuscleSelected?.(muscle || null, mesh);
  }

  private hover(mesh: Mesh | null): void {
    this.renderer.domElement.style.cursor = mesh ? 'pointer' : 'grab';
  }

  preset(view: 'front' | 'back' | 'left' | 'right'): void { this.cameraController.preset(view); }
  reset(): void { this.selected = null; if (this.modelRoot) this.highlighter.clear(this.modelRoot); this.cameraController.preset('front'); }

  private resize = (): void => {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private animate = (): void => {
    this.frame = window.requestAnimationFrame(this.animate);
    this.cameraController.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    if (this.frame) window.cancelAnimationFrame(this.frame);
    window.removeEventListener('topgym:themechange', this.themeListener);
    this.resizeObserver?.disconnect();
    this.selector?.dispose();
    this.cameraController.dispose();
    this.highlighter.dispose();
    this.modelRoot?.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material: any) => material?.dispose?.());
    });
    this.renderer.dispose();
    this.container.replaceChildren();
  }

  observeResize(): void {
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.container);
    this.resize();
  }
}
