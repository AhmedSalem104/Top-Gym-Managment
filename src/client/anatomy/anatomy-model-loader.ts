import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { Group } from 'three';
import type { AnatomyModelConfig } from './types';

export class AnatomyModelLoader {
  private readonly loader: GLTFLoader;
  private readonly config: AnatomyModelConfig;

  constructor(config: AnatomyModelConfig = {}) {
    this.config = config;
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    if (config.dracoDecoderPath) {
      const draco = new DRACOLoader();
      draco.setDecoderPath(config.dracoDecoderPath);
      this.loader.setDRACOLoader(draco);
    }
  }

  load(onProgress?: (progress: number) => void): Promise<Group> {
    const url = this.config.modelUrl || '/assets/anatomy/top-gym-anatomy.glb';
    return new Promise((resolve, reject) => {
      this.loader.load(url, (gltf) => resolve(gltf.scene), (event) => {
        if (event.total) onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }, (error) => {
        const reason = new Error(`Professional anatomy model is not available at ${url}.`);
        (reason as Error & { code?: string; cause?: unknown }).code = 'ANATOMY_MODEL_NOT_FOUND';
        (reason as Error & { cause?: unknown }).cause = error;
        reject(reason);
      });
    });
  }
}
