(() => {
    if (window.TopGymExerciseAssets) return;

    const state = {
        promise: null,
        manifest: null,
        byLegacySourceId: new Map(),
        byProjectName: new Map(),
        byUpstreamId: new Map()
    };

    const normalize = (value) => String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));

    const escapeAttribute = (value) => escapeHtml(value).replace(/`/g, '&#96;');

    async function load() {
        if (state.manifest) return state.manifest;
        if (!state.promise) {
            state.promise = fetch('/data/exercise-assets.json', { cache: 'force-cache' })
                .then((response) => {
                    if (!response.ok) throw new Error(`Exercise assets manifest failed (${response.status})`);
                    return response.json();
                })
                .then((manifest) => {
                    state.manifest = manifest || {};
                    state.byLegacySourceId.clear();
                    state.byProjectName.clear();
                    state.byUpstreamId.clear();
                    (state.manifest.projectLinks || []).forEach((link) => {
                        state.byLegacySourceId.set(String(link.legacySourceId), link);
                        if (link.projectNameEn) state.byProjectName.set(normalize(link.projectNameEn), link);
                    });
                    (state.manifest.records || []).forEach((record) => state.byUpstreamId.set(String(record.upstreamId), record));
                    return state.manifest;
                });
        }
        try {
            return await state.promise;
        } catch (error) {
            state.promise = null;
            throw error;
        }
    }

    function find(item) {
        if (!state.manifest || !item) return null;
        const sourceId = item.sourceId ?? item.legacySourceId;
        const link = (sourceId != null ? state.byLegacySourceId.get(String(sourceId)) : null)
            || state.byProjectName.get(normalize(item.name || item.nameEn));
        if (!link || !['exact', 'alias'].includes(link.status) || !link.imageAssets?.start) return null;
        return {
            ...link,
            record: state.byUpstreamId.get(String(link.upstreamId)) || null,
            imageAssets: link.imageAssets
        };
    }

    function fallbackMarkup(icon, className = '') {
        return `<span class="exercise-media exercise-media-fallback ${escapeAttribute(className)}" aria-hidden="true"><span class="exercise-media-fallback-icon">${escapeHtml(icon || '🏋️')}</span></span>`;
    }

    function imageMarkup(item, phase = 'main', options = {}) {
        const match = find(item);
        const icon = item?.icon || '🏋️';
        const className = options.className || '';
        const alt = options.alt || item?.nameAr || item?.name || item?.nameEn || 'تمرين';
        const requestedPhase = phase === 'end' ? 'end' : 'start';
        const source = match?.imageAssets?.[requestedPhase] || match?.imageAssets?.main;
        if (!source) return fallbackMarkup(icon, className);
        return `<span class="exercise-media ${escapeAttribute(className)}" data-exercise-media><img src="${escapeAttribute(source)}" alt="${escapeAttribute(alt)}" loading="${options.loading || 'lazy'}" width="720" height="480" data-exercise-image><span class="exercise-media-fallback-icon" aria-hidden="true">${escapeHtml(icon)}</span></span>`;
    }

    function hydrate(root = document) {
        root.querySelectorAll?.('[data-exercise-image]').forEach((image) => {
            if (image.dataset.exerciseHydrated) return;
            image.dataset.exerciseHydrated = 'true';
            image.addEventListener('error', () => {
                image.hidden = true;
                image.closest('[data-exercise-media]')?.classList.add('is-fallback');
            }, { once: true });
        });
    }

    window.TopGymExerciseAssets = { load, find, imageMarkup, hydrate, normalize };
})();
