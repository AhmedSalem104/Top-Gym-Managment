(() => {
    'use strict';

    if (window.topGymSkeleton) return;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
    const safeClassName = (value) => String(value || '').replace(/[^a-z0-9_-]/gi, '');
    const escapeAttribute = (value) => String(value || '').replace(/[&"<>]/g, (character) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[character]));
    const loadingLabel = (name, fallback) => {
        const key = `common.loading.${name}`;
        const translated = window.TopGymI18n?.t?.(key);
        return escapeAttribute(translated && translated !== key ? translated : fallback);
    };
    const localizedFallback = (arabic, english) => document.documentElement?.lang?.toLowerCase().startsWith('ar') ? arabic : english;
    function loadingState(label, size = 'section', fallback) {
        const accessibleLabel = loadingLabel(label, fallback || localizedFallback('جارٍ التحميل', 'Loading'));
        return `<div class="logicfit-loading-state" data-loading-size="${size}" role="status" aria-live="polite" aria-atomic="true" aria-busy="true" aria-label="${accessibleLabel}"><span class="logicfit-loader logicfit-loader--${size === 'page' ? 'page' : 'section'}" aria-hidden="true"></span><span>${accessibleLabel}</span></div>`;
    }
    const blocks = (count, className = 'skeleton-line') => Array.from({ length: clamp(count, 1, 12) }, () => `<span class="skeleton-block ${safeClassName(className)}" aria-hidden="true"></span>`).join('');

    function table({ rows = 5, columns = 4, className = '' } = {}) {
        return loadingState('data', 'section', localizedFallback('جارٍ تحميل البيانات', 'Loading data'));
    }

    function list({ rows = 4, className = '' } = {}) {
        return loadingState('data', 'section', localizedFallback('جارٍ تحميل البيانات', 'Loading data'));
    }

    function cards({ count = 4, className = '' } = {}) {
        return loadingState('indicators', 'section', localizedFallback('جارٍ تحميل البيانات', 'Loading data'));
    }

    function text({ lines = 2, className = '' } = {}) {
        const lineCount = clamp(lines, 1, 8);
        const classes = ['skeleton-text', safeClassName(className)].filter(Boolean).join(' ');
        return `<span class="${classes}" role="status" aria-label="${loadingLabel('text', 'جارٍ تحميل النص')}">${blocks(lineCount)}</span>`;
    }

    function avatar({ size = 'md', className = '' } = {}) {
        const normalizedSize = ['sm', 'md', 'lg'].includes(size) ? size : 'md';
        const classes = ['skeleton-avatar', `skeleton-avatar-${normalizedSize}`, safeClassName(className)].filter(Boolean).join(' ');
        return `<span class="skeleton-block ${classes}" role="status" aria-label="${loadingLabel('avatar', 'جارٍ تحميل الصورة الشخصية')}" aria-hidden="true"></span>`;
    }

    function kpi({ className = '' } = {}) {
        const classes = ['skeleton-kpi', safeClassName(className)].filter(Boolean).join(' ');
        return `<div class="${classes}" role="status" aria-label="${loadingLabel('metric', 'جارٍ تحميل المؤشر')}"><span class="skeleton-block skeleton-kpi-label" aria-hidden="true"></span><span class="skeleton-block skeleton-kpi-value" aria-hidden="true"></span></div>`;
    }

    function chart({ className = '' } = {}) {
        const classes = ['skeleton-chart', safeClassName(className)].filter(Boolean).join(' ');
        return `<div class="${classes}" role="status" aria-label="${loadingLabel('chart', 'جارٍ تحميل الرسم البياني')}"><span class="skeleton-chart-grid" aria-hidden="true"></span><span class="skeleton-chart-line" aria-hidden="true"></span></div>`;
    }

    function form({ fields = 3, className = '' } = {}) {
        const fieldCount = clamp(fields, 1, 8);
        const classes = ['skeleton-form', safeClassName(className)].filter(Boolean).join(' ');
        return `<div class="${classes}" role="status" aria-label="${loadingLabel('form', 'جارٍ تحميل النموذج')}">${Array.from({ length: fieldCount }, () => `<div class="skeleton-form-field"><span class="skeleton-block skeleton-form-label" aria-hidden="true"></span><span class="skeleton-block skeleton-form-control" aria-hidden="true"></span></div>`).join('')}</div>`;
    }

    function select({ className = '' } = {}) {
        const classes = ['skeleton-select', safeClassName(className)].filter(Boolean).join(' ');
        return `<span class="skeleton-block ${classes}" role="status" aria-label="${loadingLabel('select', 'جارٍ تحميل الخيارات')}" aria-hidden="true"></span>`;
    }

    function start(host, markup, { preserve = false } = {}) {
        if (!host) return;
        host.querySelectorAll(':scope > .skeleton-region-error, :scope > .logicfit-refresh-indicator').forEach((notice) => notice.remove());
        host.classList.add('skeleton-region');
        host.setAttribute('aria-busy', 'true');
        host.dataset.loadingState = preserve ? 'refreshing' : 'initial';
        if (!preserve && markup) host.innerHTML = markup;
    }

    function refresh(host) {
        start(host, '', { preserve: true });
        if (!host) return;
        const indicator = document.createElement('span');
        indicator.className = 'logicfit-refresh-indicator';
        indicator.setAttribute('role', 'status');
        indicator.setAttribute('aria-live', 'polite');
        indicator.setAttribute('aria-label', loadingLabel('data', localizedFallback('جارٍ تحديث البيانات', 'Refreshing data')));
        indicator.innerHTML = '<span class="logicfit-loader logicfit-loader--button" aria-hidden="true"></span>';
        host.append(indicator);
    }

    function ready(host) {
        if (!host) return;
        host.classList.remove('skeleton-region');
        host.classList.remove('skeleton-error');
        host.querySelectorAll(':scope > .logicfit-refresh-indicator').forEach((indicator) => indicator.remove());
        host.removeAttribute('aria-busy');
        delete host.dataset.loadingState;
    }

    function error(host, markup = '', { preserve = false } = {}) {
        if (!host) return;
        host.classList.add('skeleton-region', 'skeleton-error');
        host.querySelectorAll(':scope > .logicfit-refresh-indicator').forEach((indicator) => indicator.remove());
        host.setAttribute('aria-busy', 'false');
        host.dataset.loadingState = 'error';
        if (preserve && markup) host.insertAdjacentHTML('afterbegin', markup);
        else if (markup) host.innerHTML = markup;
    }

    function hydrate(root = document) {
        const hosts = [];
        if (root.matches?.('[data-skeleton-kind]')) hosts.push(root);
        root.querySelectorAll?.('[data-skeleton-kind]').forEach((host) => hosts.push(host));
        hosts.forEach((host) => {
            const placeholder = host.querySelector(':scope > .loading');
            if (!placeholder) return;
            const kind = host.dataset.skeletonKind;
            const rows = clamp(host.dataset.skeletonRows, 1, 12);
            const columns = clamp(host.dataset.skeletonColumns, 2, 12);
            const markup = kind === 'table'
                ? table({ rows, columns, className: host.dataset.skeletonClass })
                : kind === 'cards'
                    ? cards({ count: rows, className: host.dataset.skeletonClass })
                    : list({ rows, className: host.dataset.skeletonClass });
            start(host, markup);
        });
    }

    window.topGymSkeleton = Object.freeze({ avatar, cards, chart, error, form, hydrate, kpi, list, ready, refresh, select, start, table, text });

    const localizedSkeletonLabels = [
        ['.logicfit-loading-state[role="status"]', 'data'],
        ['.logicfit-refresh-indicator[role="status"]', 'data'],
        ['.skeleton-text[role="status"]', 'text'],
        ['.skeleton-avatar[role="status"]', 'avatar'],
        ['.skeleton-kpi[role="status"]', 'metric'],
        ['.skeleton-chart[role="status"]', 'chart'],
        ['.skeleton-form[role="status"]', 'form'],
        ['.skeleton-select[role="status"]', 'select']
    ];
    window.addEventListener('topgym:localechange', () => {
        localizedSkeletonLabels.forEach(([selector, name]) => {
            const key = `common.loading.${name}`;
            const translated = window.TopGymI18n?.t?.(key);
            if (!translated || translated === key) return;
            document.querySelectorAll(selector).forEach((element) => element.setAttribute('aria-label', translated));
        });
    });

    document.addEventListener('DOMContentLoaded', () => {
        hydrate();
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                hydrate(node);
                const host = node.closest?.('[data-skeleton-kind]');
                if (host) hydrate(host);
            }));
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
})();
