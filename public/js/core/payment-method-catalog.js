(() => {
    'use strict';

    const types = Object.freeze([
        Object.freeze({ id: 'vodafone_cash', nameAr: 'فودافون كاش', nameEn: 'Vodafone Cash', logo: '/assets/payment-vodafone-cash.jpg' }),
        Object.freeze({ id: 'instapay', nameAr: 'إنستاباي', nameEn: 'InstaPay', logo: '/assets/payment-instapay-icon.png' }),
        Object.freeze({ id: 'other', nameAr: 'وسيلة أخرى', nameEn: 'Other method', logo: null })
    ]);
    const byId = new Map(types.map((item) => [item.id, item]));
    const boundFallbackRoots = new WeakSet();

    function get(id) {
        return byId.get(String(id || '')) || null;
    }

    function label(id, locale = 'ar') {
        const item = get(id);
        if (!item) return '';
        return locale === 'en' ? item.nameEn : item.nameAr;
    }

    function createMark(id, { document: ownerDocument = globalThis.document, className = 'payment-method-brand-mark' } = {}) {
        if (!ownerDocument) return null;
        const item = get(id);
        const mark = ownerDocument.createElement('span');
        mark.className = className;
        mark.setAttribute('aria-hidden', 'true');

        if (item?.logo) {
            const image = ownerDocument.createElement('img');
            image.src = item.logo;
            image.alt = '';
            image.decoding = 'async';
            image.addEventListener('error', () => {
                mark.classList.add('is-fallback');
                image.remove();
            }, { once: true });
            mark.append(image);
        }

        const fallback = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
        fallback.setAttribute('viewBox', '0 0 24 24');
        fallback.setAttribute('fill', 'none');
        fallback.setAttribute('stroke', 'currentColor');
        fallback.setAttribute('stroke-width', '1.8');
        fallback.setAttribute('stroke-linecap', 'round');
        fallback.setAttribute('stroke-linejoin', 'round');
        fallback.classList.add('ui-icon');
        fallback.innerHTML = '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6.5 15h3"/>';
        mark.append(fallback);
        return mark;
    }

    function bindFallbackHandling(root) {
        if (!root?.addEventListener || boundFallbackRoots.has(root)) return;
        boundFallbackRoots.add(root);
        root.addEventListener('error', (event) => {
            const image = event.target;
            if (!(image instanceof (root.ownerDocument?.defaultView?.HTMLImageElement || globalThis.HTMLImageElement))) return;
            const mark = image.closest('.payment-method-brand-mark');
            if (!mark) return;
            mark.classList.add('is-fallback');
            image.remove();
        }, true);
    }

    const catalog = Object.freeze({ types, get, label, createMark, bindFallbackHandling, has: (id) => byId.has(String(id || '')) });
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    if (typeof window !== 'undefined') window.LogicFitPaymentMethodCatalog = catalog;
})();
