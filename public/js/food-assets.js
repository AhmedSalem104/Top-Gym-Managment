(() => {
    if (window.TopGymFoodAssets) return;

    const sources = Object.freeze([
        'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=900&q=82',
        'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=82',
        'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=82',
        'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=82',
        'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=900&q=82',
        'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=82',
        'https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?auto=format&fit=crop&w=900&q=82',
        'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=82'
    ]);

    const categorySources = Object.freeze({
        grains: sources[2],
        fruits: sources[5],
        vegetables: sources[1],
        protein: sources[6],
        meat: sources[6],
        poultry: sources[6],
        seafood: sources[3],
        dairy: sources[7],
        nuts: sources[0],
        beverages: sources[4],
        oils: sources[3]
    });

    const escapeAttribute = (value) => String(value ?? '').replace(/[&<>'"`]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '`': '&#96;'
    }[character]));

    function hash(value) {
        return String(value || '').split('').reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
    }

    function imageUrl(item) {
        const category = String(item?.category || '').toLowerCase();
        const matched = Object.entries(categorySources).find(([key]) => category.includes(key));
        return matched?.[1] || sources[hash(item?.id || item?.nameAr || item?.nameEn) % sources.length];
    }

    function imageMarkup(item, options = {}) {
        const alt = options.alt || item?.nameAr || item?.nameEn || 'طعام';
        const className = options.className || '';
        const source = imageUrl(item);
        return `<span class="food-media ${escapeAttribute(className)}" data-food-media><img src="${escapeAttribute(source)}" alt="${escapeAttribute(alt)}" loading="${escapeAttribute(options.loading || 'lazy')}" width="900" height="600" data-food-image><span class="food-media-fallback" aria-hidden="true"></span></span>`;
    }

    function hydrate(root = document) {
        root.querySelectorAll?.('[data-food-image]').forEach((image) => {
            if (image.dataset.foodHydrated) return;
            image.dataset.foodHydrated = 'true';
            image.addEventListener('error', () => {
                image.hidden = true;
                image.closest('[data-food-media]')?.classList.add('is-fallback');
            }, { once: true });
        });
    }

    window.TopGymFoodAssets = { imageUrl, imageMarkup, hydrate };
})();
