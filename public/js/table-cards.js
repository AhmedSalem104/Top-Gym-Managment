'use strict';

/* Adds accessible column labels to dynamic tables so the shared mobile table
   layout can present every row as a readable card without changing APIs or
   the data-rendering code of individual screens. */
(function initializeResponsiveTableCards() {
    const SKIP_SELECTOR = '.print-table, [data-print-table]';

    function normalizeLabel(value, index) {
        const label = String(value || '').replace(/\s+/g, ' ').trim();
        return label || `\u0628\u064a\u0627\u0646 ${index + 1}`;
    }

    function decorateTable(table) {
        if (!(table instanceof HTMLTableElement) || table.matches(SKIP_SELECTOR)) return;

        const headerRow = table.tHead?.rows?.[0];
        const headers = headerRow
            ? Array.from(headerRow.cells).map((cell, index) => normalizeLabel(cell.textContent, index))
            : [];

        if (!headers.length) return;
        table.classList.add('table-card-layout');
        table.dataset.responsiveCards = 'true';
        table.parentElement?.classList.add('table-cards-container');

        Array.from(table.tBodies).forEach((body) => {
            Array.from(body.rows).forEach((row) => {
                Array.from(row.cells).forEach((cell, index) => {
                    if (cell.tagName !== 'TD') return;
                    const labelIndex = Math.min(index, headers.length - 1);
                    cell.dataset.label = headers[labelIndex];
                });
            });
        });
    }

    function scan(root = document) {
        if (root instanceof HTMLTableElement) decorateTable(root);
        root.querySelectorAll?.('table').forEach(decorateTable);
    }

    function start() {
        scan();
        if (!document.body) return;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                const changedTable = mutation.target.closest?.('table');
                if (changedTable) decorateTable(changedTable);
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) scan(node);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
