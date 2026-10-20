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
        dashboardScopeDialog: 'md',
        trainerClientDialog: 'md',
        trainerMeasurementDialog: 'md',
        trainerCheckinDialog: 'md',
        trainerPackageDialog: 'md',
        trainerSessionDialog: 'md',
        trainerPurchaseDialog: 'md',
        trainerPaymentDialog: 'md',
        memberQrDialog: 'md',
        memberPaymentMethodDialog: 'md',
        qrReaderDialog: 'md',
        platformActionDialog: 'lg',
        platformRegistrationCredentialsDialog: 'lg',
        detailsDialog: 'lg',
        trainerClientDetailsDialog: 'lg',
        trainerTimelineDialog: 'lg',
        coachingProfileDialog: 'lg',
        libraryDetailsDialog: 'lg',
        authUserDialog: 'lg',
        authRegistrationDialog: 'md',
        authRecoveryDialog: 'sm',
        backupRestoreDialog: 'lg',
        memberDialog: 'lg',
        dayPassDialog: 'md',
        libraryFormDialog: 'lg',
        externalTraineeDialog: 'xl',
        coachingBuilderDialog: 'workspace'
    });
    const structuredLayoutById = new Set([
        'platformActionDialog',
        'platformRegistrationCredentialsDialog',
    ]);

    // Modal V3 is deliberately opt-in by inventory ID. Other native dialogs
    // (including feature prompts and any future dialog) keep their current
    // visual contract until they are separately approved and migrated.
    const v3VariantById = Object.freeze({
        authRegistrationDialog: 'selection',
        authRecoveryDialog: 'confirmation',
        dashboardScopeDialog: 'selection',
        memberPaymentMethodDialog: 'form',
        dayPassDialog: 'form',
        expenseDialog: 'form',
        memberDialog: 'form',
        actionDialog: 'specialized',
        membershipPlanDialog: 'form',
        membershipTypeDialog: 'form',
        detailsDialog: 'details',
        qrReaderDialog: 'specialized',
        memberQrDialog: 'specialized',
        branchCreateDialog: 'form',
        backupRestoreDialog: 'destructive',
        authUserDialog: 'form',
        libraryFormDialog: 'form',
        libraryDetailsDialog: 'details',
        externalTraineeDialog: 'form',
        coachingBuilderDialog: 'wizard',
        coachingProfileDialog: 'details',
        measurementDialog: 'form',
        checkinDialog: 'form',
        coachingSubscriptionDialog: 'form',
        coachingClientEditDialog: 'edit',
        coachingSessionDialog: 'specialized',
        coachingMealLogDialog: 'form',
        trainerClientDialog: 'form',
        trainerClientDetailsDialog: 'details',
        trainerTimelineDialog: 'details',
        trainerMeasurementDialog: 'form',
        trainerCheckinDialog: 'form',
        trainerPackageDialog: 'form',
        trainerSessionDialog: 'specialized',
        trainerPurchaseDialog: 'specialized',
        trainerPaymentDialog: 'specialized',
        platformActionDialog: 'specialized',
        platformRegistrationCredentialsDialog: 'specialized',
        saasRequestDialog: 'form'
    });

    function hydrateDialog(dialog) {
        if (!dialog) return;
        dialog.classList.add('lf-modal-shell');
        const v3Variant = v3VariantById[dialog.id];
        if (v3Variant) {
            dialog.classList.add('lf-modal--v3', `lf-modal-v3--${v3Variant}`);
            dialog.dataset.modalContract = 'logic-fit-v3';
            applyV3ActionSemantics(dialog);
        }
        const size = sizeById[dialog.id] || (dialog.classList.contains('trainer-client-dialog') ? 'md' : 'md');
        dialog.classList.add(`lf-modal--${size}`);
        const usesNestedLayout = structuredLayoutById.has(dialog.id);
        if (usesNestedLayout || dialog.classList.contains('coaching-small-dialog')) {
            dialog.classList.add('lf-modal--structured');
            if (usesNestedLayout) {
                dialog.querySelector(':scope > form, :scope > .dialog-body')?.classList.add('lf-modal-layout');
            }
        }
        if (!v3Variant) dialog.dataset.modalContract = 'logic-fit-v1';
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

    function isFeatureOwnedCloseButton(button) {
        return button.matches('.dialog-close, .trainer-dialog-close, .auth-choice-close, [data-dialog-cancel]');
    }

    function applyV3ActionSemantics(dialog) {
        const actionContainers = dialog.querySelectorAll('.dialog-actions, .form-actions, .trainer-dialog-actions, :scope > form > footer, :scope > footer');
        actionContainers.forEach((container) => {
            container.querySelectorAll('button').forEach((button) => {
                const identity = `${button.id} ${[...button.attributes].map((attribute) => attribute.name).join(' ')}`;
                if (/(?:cancel|close|dismiss)/i.test(identity)) {
                    button.classList.add('lf-modal-v3__cancel');
                    return;
                }

                const preservesDestructiveStyle = button.matches('.btn-danger, .btn-destructive, .danger, .destructive, [data-variant="destructive"]');
                if (!preservesDestructiveStyle && (button.type === 'submit' || button.matches('.btn-primary, .platform-btn.primary'))) {
                    button.classList.add('lf-modal-v3__primary');
                }
            });
        });
    }

    function hideLegacyCloseButtons(dialog) {
        if (!dialog) return;
        dialog.querySelectorAll('button').forEach((button) => {
            // Feature dialogs already own these controls and their listeners.
            // Keep them visible and keyboard-accessible; only compatibility
            // duplicates should receive the legacy hidden marker.
            if (isFeatureOwnedCloseButton(button)) return;
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
            const header = button.closest('.dialog-header, .details-dialog-head, .member-dialog-header, .trainer-dialog-header, .modal-header');
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
        hideLegacyCloseButtons(dialog);
        const hasFeatureOwnedHeaderClose = dialog.querySelector('.dialog-close, .trainer-dialog-close, [data-dialog-cancel]');
        if (hasFeatureOwnedHeaderClose) {
            dialog.querySelector(':scope > .dialog-close-button[data-dialog-close-generated]')?.remove();
            dialog.dataset.dialogCloseReady = 'true';
            return;
        }
        if (dialog.dataset.dialogCloseReady === 'true') return;
        // Several feature dialogs already own a close control inside their
        // header. Treat all existing close contracts as authoritative so the
        // shared decorator never places a second button on top of it.
        const hasDirectSharedClose = dialog.querySelector(':scope > .dialog-close-button, :scope > [data-dialog-close]');
        if (hasDirectSharedClose) {
            dialog.dataset.dialogCloseReady = 'true';
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dialog-close-button';
        button.dataset.dialogClose = '';
        button.dataset.dialogCloseGenerated = '';
        button.dataset.i18nAriaLabel = 'dialogs.close.aria';
        button.dataset.i18nTitle = 'dialogs.close.title';
        button.setAttribute('aria-label', window.TopGymI18n?.t?.('dialogs.close.aria') || 'إغلاق النافذة');
        button.title = window.TopGymI18n?.t?.('dialogs.close.title') || 'إغلاق';
        button.innerHTML = closeIcon;
        dialog.appendChild(button);
        window.TopGymI18n?.apply?.(button);
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
