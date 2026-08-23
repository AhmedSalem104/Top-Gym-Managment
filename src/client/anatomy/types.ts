import type { Object3D } from 'three';

export interface MuscleRecord {
  id: number;
  name?: string | null;
  nameAr?: string | null;
  bodyPart?: string | null;
}

export interface MuscleMappingEntry {
  muscleId: number;
  aliases?: string[];
  bodyParts3dElementId?: string;
  bodyParts3dConceptIds?: string[];
  representationIds?: string[];
  mappingMethod?: string;
  confidence?: string;
  sourceFile?: string;
}

export interface AnatomyMappingManifest {
  version?: number;
  schemaVersion?: number;
  modelAsset: string;
  meshNameConvention: string;
  mappings: Record<string, MuscleMappingEntry>;
}

export interface AnatomyModelConfig {
  modelUrl?: string;
  dracoDecoderPath?: string;
  meshoptDecoderUrl?: string;
  maxPixelRatio?: number;
}

export interface AnatomyViewerOptions extends AnatomyModelConfig {
  onMuscleSelected?: (muscle: MuscleRecord | null, mesh: Object3D | null) => void;
  onProgress?: (progress: number) => void;
  onModelUnavailable?: (error: Error) => void;
}

export interface ResolvedMuscle {
  id: number;
  name?: string | null;
  nameAr?: string | null;
  bodyPart?: string | null;
  meshName: string;
}
