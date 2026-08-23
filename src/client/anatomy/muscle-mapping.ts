import type { AnatomyMappingManifest, MuscleRecord, ResolvedMuscle } from './types';

export function normalizeMeshKey(value: unknown): string {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
}

export class MuscleMapping {
  private readonly byId = new Map<number, MuscleRecord>();
  private readonly byName = new Map<string, MuscleRecord>();
  private readonly byMesh = new Map<string, number>();

  constructor(muscles: MuscleRecord[], manifest: AnatomyMappingManifest) {
    muscles.forEach((muscle) => {
      if (!Number.isInteger(Number(muscle.id))) return;
      this.byId.set(Number(muscle.id), muscle);
      [muscle.name, muscle.nameAr].forEach((name) => {
        const key = normalizeMeshKey(name);
        if (key) this.byName.set(key, muscle);
      });
    });
    Object.entries(manifest.mappings || {}).forEach(([meshName, entry]) => {
      if (entry?.muscleId) this.byMesh.set(normalizeMeshKey(meshName), Number(entry.muscleId));
      (entry?.aliases || []).forEach((alias) => this.byMesh.set(normalizeMeshKey(alias), Number(entry.muscleId)));
    });
  }

  resolve(meshName: string): ResolvedMuscle | null {
    const key = normalizeMeshKey(meshName);
    const explicitId = this.byMesh.get(key);
    const record = explicitId ? this.byId.get(explicitId) : this.byName.get(key);
    if (!record) return null;
    return { ...record, id: Number(record.id), meshName };
  }

  attach(root: { traverse: (callback: (object: any) => void) => void }): number {
    let attached = 0;
    root.traverse((object) => {
      if (!object?.isMesh) return;
      const resolved = this.resolve(object.name);
      if (!resolved) return;
      object.userData = object.userData || {};
      object.userData.muscle = resolved;
      attached += 1;
    });
    return attached;
  }
}

export async function loadMuscleMapping(
  musclesUrl = '/api/member-portal/library/options',
  manifestUrl = '/data/anatomy-muscle-mapping.json'
): Promise<MuscleMapping> {
  const [muscleResponse, manifestResponse] = await Promise.all([
    fetch(musclesUrl, { headers: { Accept: 'application/json' } }),
    fetch(manifestUrl, { cache: 'force-cache' })
  ]);
  if (!muscleResponse.ok || !manifestResponse.ok) throw new Error('Anatomy mapping resources are unavailable.');
  const musclePayload = await muscleResponse.json();
  const manifest = await manifestResponse.json() as AnatomyMappingManifest;
  const muscles = musclePayload.filters?.muscles || musclePayload.items || [];
  return new MuscleMapping(muscles, manifest);
}
