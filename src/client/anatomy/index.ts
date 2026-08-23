import type { AnatomyViewerOptions } from './types';
import { AnatomyViewer } from './anatomy-viewer';

let activeViewer: AnatomyViewer | null = null;

export async function mountAnatomyViewer(container: HTMLElement, options: AnatomyViewerOptions = {}): Promise<AnatomyViewer> {
  activeViewer?.dispose();
  activeViewer = new AnatomyViewer(container, options);
  await activeViewer.mount();
  activeViewer.observeResize();
  return activeViewer;
}

export function disposeAnatomyViewer(): void {
  activeViewer?.dispose();
  activeViewer = null;
}

(window as Window & { TopGymAnatomy?: unknown }).TopGymAnatomy = {
  mount: mountAnatomyViewer,
  dispose: disposeAnatomyViewer
};
