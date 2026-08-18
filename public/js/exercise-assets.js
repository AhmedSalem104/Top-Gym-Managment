(() => {
    if (window.TopGymExerciseAssets) return;

    const state = {
        promise: null,
        manifest: null,
        byLegacySourceId: new Map(),
        byCatalogSourceId: new Map(),
        byProjectName: new Map(),
        byUpstreamId: new Map(),
        bySlug: new Map(),
        byName: new Map()
    };

    const normalize = (value) => String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
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
                    state.byCatalogSourceId.clear();
                    state.byProjectName.clear();
                    state.byUpstreamId.clear();
                    state.bySlug.clear();
                    state.byName.clear();
                    (state.manifest.projectLinks || []).forEach((link) => {
                        state.byLegacySourceId.set(String(link.legacySourceId), link);
                        if (link.projectNameEn) state.byProjectName.set(normalize(link.projectNameEn), link);
                        if (link.projectNameAr) state.byProjectName.set(normalize(link.projectNameAr), link);
                    });
                    (state.manifest.records || []).forEach((record) => {
                        if (record.catalogSourceId != null) state.byCatalogSourceId.set(String(record.catalogSourceId), record);
                        if (record.upstreamId) state.byUpstreamId.set(String(record.upstreamId), record);
                        if (record.slug) state.bySlug.set(normalize(record.slug), record);
                        if (record.nameEn) state.byName.set(normalize(record.nameEn), record);
                    });
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
        const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
        const sourceId = item.sourceId ?? item.legacySourceId;
        const legacyLink = (sourceId != null ? state.byLegacySourceId.get(String(sourceId)) : null)
            || state.byProjectName.get(normalize(item.name || item.nameEn || item.nameAr));
        const directRecord = (sourceId != null ? state.byCatalogSourceId.get(String(sourceId)) : null)
            || (item.upstreamId || metadata.upstreamId ? state.byUpstreamId.get(String(item.upstreamId || metadata.upstreamId)) : null)
            || (item.slug || metadata.slug ? state.bySlug.get(normalize(item.slug || metadata.slug)) : null)
            || state.byName.get(normalize(item.name || item.nameEn));
        const record = directRecord || (legacyLink?.upstreamId ? state.byUpstreamId.get(String(legacyLink.upstreamId)) : null);
        if (directRecord?.imageAssets?.start) {
            return { ...directRecord, status: 'canonical', imageAssets: directRecord.imageAssets };
        }
        if (!legacyLink || !['exact', 'alias'].includes(legacyLink.status) || !legacyLink.imageAssets?.start) return null;
        return {
            ...legacyLink,
            record,
            imageAssets: legacyLink.imageAssets
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

    function preloadImage(source) {
        if (!source) return Promise.resolve(false);
        return new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve(true);
            image.onerror = () => resolve(false);
            image.src = source;
        });
    }

    async function preload(item, phases = ['start']) {
        await load();
        const match = find(item);
        if (!match) return false;
        const requested = Array.isArray(phases) ? phases : [phases];
        await Promise.all(requested.map((phase) => preloadImage(match.imageAssets?.[phase === 'main' ? 'start' : phase])));
        return true;
    }

    async function preloadItems(items = [], phases = ['start']) {
        await Promise.all((Array.isArray(items) ? items : []).map((item) => preload(item, phases)));
    }

    async function waitForImages(root = document) {
        const images = [...(root.querySelectorAll?.('img') || [])];
        await Promise.all(images.map(async (image) => {
            if (!image.complete) await new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; });
            if (typeof image.decode === 'function') await image.decode().catch(() => {});
        }));
    }

    window.TopGymExerciseAssets = { load, find, imageMarkup, hydrate, normalize, preload, preloadItems, waitForImages };
})();
