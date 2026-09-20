(() => {
    if (window.__topGymDialogEnhancementsLoaded) return;
    window.__topGymDialogEnhancementsLoaded = true;

    const closeIcon = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>';

    const sizeById = Object.freeze({
        actionDialog: 'sm',
        expenseDialog: 'md',
        membershipPlanDialog: 'md',
        membershipTypeDialog: 'md',
        branchCreateDialog: 'md',
        trainerClientDialog: 'md',
        trainerMeasurementDialog: 'md',
        trainerCheckinDialog: 'md',
        trainerPackageDialog: 'md',
        trainerSessionDialog: 'md',
        trainerPurchaseDialog: 'md',
        trainerPaymentDialog: 'md',
        memberQrDialog: 'sm',
        qrReaderDialog: 'sm',
        platformActionDialog: 'lg',
        platformRegistrationCredentialsDialog: 'lg',
        detailsDialog: 'lg',
        trainerClientDetailsDialog: 'lg',
        trainerTimelineDialog: 'lg',
        coachingProfileDialog: 'lg',
        libraryDetailsDialog: 'lg',
        authUserDialog: 'lg',
        backupRestoreDialog: 'lg',
        memberDialog: 'xl',
        dayPassDialog: 'xl',
        pricingDialog: 'xl',
        membershipTypesDialog: 'xl',
        libraryFormDialog: 'xl',
        externalTraineeDialog: 'xl',
        coachingBuilderDialog: 'workspace'
    });

    function hydrateDialog(dialog) {
        if (!dialog) return;
        dialog.classList.add('lf-modal-shell');
        const size = sizeById[dialog.id] || (dialog.classList.contains('trainer-client-dialog') ? 'md' : 'md');
        dialog.classList.add(`lf-modal--${size}`);
        dialog.dataset.modalContract = 'logic-fit-v1';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        const title = dialog.querySelector('h1[id], h2[id], h3[id], h4[id], [role="heading"][id]');
        const description = dialog.querySelector('p[id]');
        if (title?.id && !dialog.hasAttribute('aria-labelledby')) dialog.setAttribute('aria-labelledby', title.id);
        if (description?.id && !dialog.hasAttribute('aria-describedby')) dialog.setAttribute('aria-describedby', description.id);
    }

    function closeDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.close === 'function' && dialog.open) {
            dialog.close();
            return;
        }
        dialog.removeAttribute('open');
        dialog.hidden = true;
    }

    function hideLegacyCloseButtons(dialog, hasDirectSharedClose = false) {
        if (!dialog || !hasDirectSharedClose) return;
        dialog.querySelectorAll('button').forEach((button) => {
            if (button.classList.contains('dialog-close-button')) {
                // Keep the shared top-level close control visible. Older
                // dialogs may also render a header close button; hide only
                // that visual duplicate while preserving its id/listeners.
                if (button.parentElement === dialog) return;
                button.classList.add('legacy-dialog-close');
                button.setAttribute('aria-hidden', 'true');
                button.tabIndex = -1;
                return;
            }
            if (button.hasAttribute('data-dialog-close')) return;
            const header = button.closest('.dialog-header, .details-dialog-head, .member-dialog-header, .trainer-dialog-header, .day-pass-head');
            if (header && /close$/i.test(button.id || '')) {
                button.classList.add('legacy-dialog-close');
                button.setAttribute('aria-hidden', 'true');
                button.tabIndex = -1;
                return;
            }
            if (button.textContent.trim() !== 'إغلاق') return;
            button.classList.add('legacy-dialog-close');
            button.setAttribute('aria-hidden', 'true');
            button.tabIndex = -1;
        });
    }

    function ensureCloseButton(dialog) {
        if (!dialog) return;
        hydrateDialog(dialog);
        const hasDirectSharedClose = dialog.querySelector(':scope > .dialog-close-button, :scope > [data-dialog-close]');
        hideLegacyCloseButtons(dialog, Boolean(hasDirectSharedClose));
        if (dialog.dataset.dialogCloseReady === 'true') return;
        // Several feature dialogs already own a close control inside their
        // header. Treat all existing close contracts as authoritative so the
        // shared decorator never places a second button on top of it.
        const hasFeatureOwnedHeaderClose = dialog.querySelector('.dialog-close, .trainer-dialog-close, [data-dialog-cancel]');
        if (hasDirectSharedClose || hasFeatureOwnedHeaderClose) {
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
