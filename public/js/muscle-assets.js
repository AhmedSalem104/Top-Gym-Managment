(() => {
    if (window.TopGymMuscleAssets) return;

    const state = {
        manifest: null,
        promise: null,
        bySystemId: new Map(),
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

    function indexManifest(manifest) {
        state.manifest = manifest || {};
        state.bySystemId.clear();
        state.byName.clear();
        (state.manifest.records || []).forEach((record) => {
            if (record.systemMuscleId != null) state.bySystemId.set(String(record.systemMuscleId), record);
            [record.systemName, record.systemNameAr, record.canonicalName].forEach((name) => {
                if (name) state.byName.set(normalize(name), record);
            });
        });
        return state.manifest;
    }

    async function load() {
        if (state.manifest) return state.manifest;
        if (!state.promise) {
            state.promise = fetch('/data/muscle-assets.json', { cache: 'force-cache' })
                .then((response) => {
                    if (!response.ok) throw new Error(`Muscle assets manifest failed (${response.status})`);
                    return response.json();
                })
                .then(indexManifest);
        }
        try {
            return await state.promise;
        } catch (error) {
            state.promise = null;
            throw error;
        }
    }

    function find(item) {
        if (!item) return null;
        const source = typeof item === 'object' ? item : { id: item };
        const ids = [
            source.systemMuscleId,
            source.system_muscle_id,
            source.sourceId,
            source.source_id,
            source.muscleSourceId,
            source.muscle_source_id,
            source.id,
            source.muscleId,
            source.muscle_id
        ].filter((value) => value !== undefined && value !== null && String(value).trim() !== '');
        for (const id of ids) {
            const match = state.bySystemId.get(String(id));
            if (match) return match;
        }
        const names = [source.nameAr, source.name_ar, source.name, source.nameEn, source.name_en, source.canonicalName]
            .map(normalize)
            .filter(Boolean);
        return names.map((name) => state.byName.get(name)).find(Boolean) || null;
    }

    function fallbackMarkup(icon = '💪', className = '', reference = {}) {
        const referenceId = reference.id ?? reference.sourceId ?? reference.systemMuscleId ?? '';
        const referenceName = reference.nameAr || reference.name || reference.nameEn || '';
        return `<span class="muscle-media muscle-media-fallback ${escapeAttribute(className)}" data-muscle-media data-muscle-id="${escapeAttribute(referenceId)}" data-muscle-name="${escapeAttribute(referenceName)}" aria-hidden="true"><span class="muscle-media-fallback-icon">${escapeHtml(icon)}</span></span>`;
    }

    function imageMarkup(item, view = 'main', options = {}) {
        const match = find(item);
        const source = match?.imageAssets?.[view === 'main' ? 'main' : view] || match?.imageAssets?.main;
        const className = options.className || '';
        const alt = options.alt || item?.nameAr || item?.name || item?.nameEn || 'عضلة';
        const icon = options.icon || item?.icon || '💪';
        if (!source) return fallbackMarkup(icon, className, item);
        const width = Number(options.width || state.manifest?.imageStyle?.width || 480);
        const height = Number(options.height || state.manifest?.imageStyle?.height || 630);
        return `<span class="muscle-media ${escapeAttribute(className)}" data-muscle-media><img src="${escapeAttribute(source)}" alt="${escapeAttribute(alt)}" loading="${options.loading || 'lazy'}" width="${width}" height="${height}" data-muscle-image><span class="muscle-media-fallback-icon" aria-hidden="true">${escapeHtml(icon)}</span></span>`;
    }

    function galleryMarkup(item, options = {}) {
        const match = find(item);
        const altName = options.alt || item?.nameAr || item?.name || item?.nameEn || 'عضلة';
        const views = ['front', 'back', 'side'].filter((view) => match?.imageAssets?.[view]);
        if (!views.length) return `<div class="muscle-media-gallery" data-muscle-gallery data-muscle-id="${escapeAttribute(item?.sourceId || item?.id || '')}" data-muscle-name="${escapeAttribute(altName)}">${imageMarkup(item, 'main', { className: 'muscle-media-detail', alt: altName, loading: 'eager' })}</div>`;
        return `<div class="muscle-media-gallery" data-muscle-gallery>${views.map((view) => `<figure>${imageMarkup(item, view, { className: 'muscle-media-detail', alt: `${altName} - ${view}`, loading: view === 'front' ? 'eager' : 'lazy' })}<figcaption>${view === 'front' ? 'أمامي' : view === 'back' ? 'خلفي' : 'جانبي'}</figcaption></figure>`).join('')}</div>`;
    }

    function hydrate(root = document) {
        const task = load().then(() => {
            root.querySelectorAll?.('[data-muscle-media]').forEach((container) => {
                if (container.querySelector('[data-muscle-image]')) {
                    container.querySelector('[data-muscle-image]')?.addEventListener('error', () => {
                        container.classList.add('is-fallback');
                        container.querySelector('[data-muscle-image]').hidden = true;
                    }, { once: true });
                    return;
                }
                const item = { id: container.dataset.muscleId, nameAr: container.dataset.muscleName, name: container.dataset.muscleName };
                const match = find(item);
                const source = match?.imageAssets?.main;
                if (!source) return;
                const image = document.createElement('img');
                image.src = source;
                image.alt = item.nameAr || 'عضلة';
                image.loading = 'lazy';
                image.width = Number(state.manifest?.imageStyle?.width || 480);
                image.height = Number(state.manifest?.imageStyle?.height || 630);
                image.dataset.muscleImage = 'true';
                image.addEventListener('error', () => { image.hidden = true; container.classList.add('is-fallback'); }, { once: true });
                container.classList.remove('muscle-media-fallback');
                container.appendChild(image);
            });
            root.querySelectorAll?.('[data-muscle-gallery]').forEach((gallery) => {
                if (gallery.querySelector('.muscle-media-detail img')) return;
                const item = { id: gallery.dataset.muscleId, nameAr: gallery.dataset.muscleName, name: gallery.dataset.muscleName };
                const match = find(item);
                if (!match) return;
                gallery.outerHTML = galleryMarkup(item);
            });
        }).catch(() => {});
        return task;
    }

    function source() { return state.manifest?.source || null; }

    window.TopGymMuscleAssets = { load, find, imageMarkup, galleryMarkup, hydrate, normalize, source };
})();
