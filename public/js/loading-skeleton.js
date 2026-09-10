(() => {
    'use strict';

    if (window.topGymSkeleton) return;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
    const safeClassName = (value) => String(value || '').replace(/[^a-z0-9_-]/gi, '');
    const blocks = (count, className = 'skeleton-line') => Array.from({ length: clamp(count, 1, 12) }, () => `<span class="skeleton-block ${safeClassName(className)}" aria-hidden="true"></span>`).join('');

    function table({ rows = 5, columns = 4, className = '' } = {}) {
        const rowCount = clamp(rows, 1, 12);
        const columnCount = clamp(columns, 2, 12);
        const classes = ['skeleton-table', safeClassName(className)].filter(Boolean).join(' ');
        const style = `--skeleton-columns: repeat(${columnCount}, minmax(0, 1fr));`;
        const row = `<div class="skeleton-table-row">${blocks(columnCount, 'skeleton-table-cell')}</div>`;
        return `<div class="${classes}" style="${style}" role="status" aria-label="جاري تحميل البيانات"><div class="skeleton-table-head">${blocks(columnCount, 'skeleton-table-cell is-head')}</div>${row.repeat(rowCount)}</div>`;
    }

    function list({ rows = 4, className = '' } = {}) {
        const rowCount = clamp(rows, 1, 12);
        const classes = ['skeleton-list', safeClassName(className)].filter(Boolean).join(' ');
        return `<div class="${classes}" role="status" aria-label="جاري تحميل البيانات">${Array.from({ length: rowCount }, () => `<div class="skeleton-list-row"><span class="skeleton-block skeleton-avatar" aria-hidden="true"></span><span class="skeleton-list-copy">${blocks(2)}</span><span class="skeleton-block skeleton-chip" aria-hidden="true"></span></div>`).join('')}</div>`;
    }

    function cards({ count = 4, className = '' } = {}) {
        const cardCount = clamp(count, 1, 12);
        const classes = ['skeleton-cards', safeClassName(className)].filter(Boolean).join(' ');
        return `<div class="${classes}" role="status" aria-label="جاري تحميل المؤشرات">${Array.from({ length: cardCount }, () => `<div class="skeleton-card"><div class="skeleton-card-head"><span class="skeleton-block skeleton-title" aria-hidden="true"></span><span class="skeleton-block skeleton-chip" aria-hidden="true"></span></div>${blocks(2)}</div>`).join('')}</div>`;
    }

    function text({ lines = 2, className = '' } = {}) {
        const lineCount = clamp(lines, 1, 8);
        const classes = ['skeleton-text', safeClassName(className)].filter(Boolean).join(' ');
        return `<span class="${classes}" role="status" aria-label="Loading text">${blocks(lineCount)}</span>`;
    }

    function avatar({ size = 'md', className = '' } = {}) {
        const normalizedSize = ['sm', 'md', 'lg'].includes(size) ? size : 'md';
        const classes = ['skeleton-avatar', `skeleton-avatar-${normalizedSize}`, safeClassName(className)].filter(Boolean).join(' ');
        return `<span class="skeleton-block ${classes}" role="status" aria-label="Loading avatar" aria-hidden="true"></span>`;
    }

    function kpi({ className = '' } = {}) {
        const classes = ['skeleton-kpi', safeClassName(className)].filter(Boolean).join(' ');
        return `<div class="${classes}" role="status" aria-label="Loading metric"><span class="skeleton-block skeleton-kpi-label" aria-hidden="true"></span><span class="skeleton-block skeleton-kpi-value" aria-hidden="true"></span></div>`;
    }

    function chart({ className = '' } = {}) {
        const classes = ['skeleton-chart', safeClassName(className)].filter(Boolean).join(' ');
        return `<div class="${classes}" role="status" aria-label="Loading chart"><span class="skeleton-chart-grid" aria-hidden="true"></span><span class="skeleton-chart-line" aria-hidden="true"></span></div>`;
    }

    function form({ fields = 3, className = '' } = {}) {
        const fieldCount = clamp(fields, 1, 8);
        const classes = ['skeleton-form', safeClassName(className)].filter(Boolean).join(' ');
        return `<div class="${classes}" role="status" aria-label="Loading form">${Array.from({ length: fieldCount }, () => `<div class="skeleton-form-field"><span class="skeleton-block skeleton-form-label" aria-hidden="true"></span><span class="skeleton-block skeleton-form-control" aria-hidden="true"></span></div>`).join('')}</div>`;
    }

    function select({ className = '' } = {}) {
        const classes = ['skeleton-select', safeClassName(className)].filter(Boolean).join(' ');
        return `<span class="skeleton-block ${classes}" role="status" aria-label="Loading select" aria-hidden="true"></span>`;
    }

    function start(host, markup, { preserve = false } = {}) {
        if (!host) return;
        if (preserve) host.querySelectorAll(':scope > .skeleton-region-error').forEach((notice) => notice.remove());
        host.classList.add('skeleton-region');
        host.setAttribute('aria-busy', 'true');
        host.dataset.loadingState = preserve ? 'refreshing' : 'initial';
        if (!preserve && markup) host.innerHTML = markup;
    }

    function refresh(host) {
        start(host, '', { preserve: true });
    }

    function ready(host) {
        if (!host) return;
        host.classList.remove('skeleton-region');
        host.classList.remove('skeleton-error');
        host.removeAttribute('aria-busy');
        delete host.dataset.loadingState;
    }

    function error(host, markup = '', { preserve = false } = {}) {
        if (!host) return;
        host.classList.add('skeleton-region', 'skeleton-error');
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
