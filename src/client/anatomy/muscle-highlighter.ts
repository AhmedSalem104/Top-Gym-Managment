import { Color, type Mesh, type Object3D } from 'three';

type MaterialState = { opacity: number; transparent: boolean; color?: Color; emissive?: Color; emissiveIntensity?: number };

export class MuscleHighlighter {
  private readonly original = new Map<Mesh, MaterialState[]>();
  private readonly selectedColor = new Color();
  private readonly themeListener = (): void => this.syncThemeColor();

  constructor() {
    this.syncThemeColor();
    window.addEventListener('topgym:themechange', this.themeListener);
  }

  private syncThemeColor(): void {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue('--anatomy-selection').trim();
    if (value) this.selectedColor.set(value);
  }

  private materials(mesh: Mesh): any[] { return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean) as any[]; }

  private remember(mesh: Mesh): MaterialState[] {
    const existing = this.original.get(mesh);
    if (existing) return existing;
    const states = this.materials(mesh).map((material) => ({
      opacity: material.opacity ?? 1,
      transparent: Boolean(material.transparent),
      color: material.color?.clone(),
      emissive: material.emissive?.clone(),
      emissiveIntensity: material.emissiveIntensity
    }));
    this.original.set(mesh, states);
    return states;
  }

  clear(root: Object3D): void {
    root.traverse((object) => {
      if (!(object as Mesh).isMesh) return;
      const states = this.original.get(object as Mesh);
      if (!states) return;
      this.materials(object as Mesh).forEach((material, index) => {
        const state = states[index];
        if (!state) return;
        material.opacity = state.opacity;
        material.transparent = state.transparent;
        if (state.color && material.color) material.color.copy(state.color);
        if (state.emissive && material.emissive) material.emissive.copy(state.emissive);
        if (state.emissiveIntensity !== undefined) material.emissiveIntensity = state.emissiveIntensity;
        material.needsUpdate = true;
      });
    });
  }

  highlight(root: Object3D, selected: Mesh | null): void {
    this.clear(root);
    if (!selected) return;
    root.traverse((object) => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      const materials = this.materials(mesh);
      this.remember(mesh);
      materials.forEach((material) => {
        if (mesh === selected) {
          if (material.color) material.color.lerp(this.selectedColor, 0.65);
          if (material.emissive) { material.emissive.copy(this.selectedColor); material.emissiveIntensity = 0.32; }
          material.opacity = 1;
          material.transparent = false;
        } else if (mesh.userData?.muscle) {
          material.opacity = 0.24;
          material.transparent = true;
        }
        material.needsUpdate = true;
      });
    });
  }

  dispose(): void {
    window.removeEventListener('topgym:themechange', this.themeListener);
    this.original.clear();
  }
}
