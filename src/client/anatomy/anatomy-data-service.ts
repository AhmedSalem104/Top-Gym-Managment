import type { MuscleRecord } from './types';

export class AnatomyDataService {
  private musclesPromise: Promise<MuscleRecord[]> | null = null;

  getMuscles(): Promise<MuscleRecord[]> {
    if (!this.musclesPromise) {
      this.musclesPromise = fetch('/api/member-portal/library/options', { headers: { Accept: 'application/json' } })
        .then(async (response) => {
          if (!response.ok) throw new Error('Muscle catalog is unavailable.');
          const payload = await response.json();
          return payload.filters?.muscles || payload.items || [];
        })
        .catch((error) => {
          this.musclesPromise = null;
          throw error;
        });
    }
    return this.musclesPromise;
  }

  async getExercises(muscleId: number, search = ''): Promise<unknown> {
    const params = new URLSearchParams({ page: '1', pageSize: '18', targetMuscleId: String(muscleId), search });
    const response = await fetch(`/api/member-portal/library/exercises?${params}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Exercise catalog is unavailable.');
    return response.json();
  }
}
