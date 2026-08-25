(() => {
    if (window.__topGymDialogEnhancementsLoaded) return;
    window.__topGymDialogEnhancementsLoaded = true;

    const closeIcon = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>';

    function closeDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.close === 'function' && dialog.open) {
            dialog.close();
            return;
        }
        dialog.removeAttribute('open');
        dialog.hidden = true;
    }

    function ensureCloseButton(dialog) {
        if (!dialog || dialog.dataset.dialogCloseReady === 'true') return;
        if (dialog.querySelector(':scope > .dialog-close-button, :scope > [data-dialog-close]')) {
            dialog.dataset.dialogCloseReady = 'true';
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dialog-close-button';
        button.dataset.dialogClose = '';
        button.setAttribute('aria-label', 'إغلاق النافذة');
        button.title = 'إغلاق';
        button.innerHTML = closeIcon;
        dialog.appendChild(button);
        dialog.dataset.dialogCloseReady = 'true';
    }

    function init() {
        document.querySelectorAll('dialog').forEach(ensureCloseButton);

        document.addEventListener('click', (event) => {
            const button = event.target.closest?.('[data-dialog-close]');
            if (!button) return;
            event.preventDefault();
            closeDialog(button.closest('dialog, [role="dialog"]'));
        });

        const observer = new MutationObserver(() => {
            document.querySelectorAll('dialog').forEach(ensureCloseButton);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
