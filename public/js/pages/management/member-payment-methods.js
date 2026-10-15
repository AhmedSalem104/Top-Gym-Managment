(() => {
    'use strict';

    if (window.__topGymMemberPaymentMethodsLoaded) return;
    window.__topGymMemberPaymentMethodsLoaded = true;

    const page = document.getElementById('memberPaymentMethodsSection');
    if (!page) return;

    const $ = (id) => document.getElementById(id);
    const t = (key, params) => window.TopGymI18n?.t?.(key, params) || key;
    const fallback = window.topGymBranding?.fallback?.() || { identity: {} };
    const state = {
        draft: null,
        published: null,
        originalDraft: null,
        version: 1,
        dirty: false,
        pendingPublish: false,
        busy: false,
        initialized: false
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value ?? {}));
    }

    function isObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function merge(base, override) {
        const result = clone(base || {});
        if (!isObject(override)) return result;
        Object.entries(override).forEach(([key, value]) => {
            result[key] = isObject(value) && isObject(result[key]) ? merge(result[key], value) : value;
        });
        return result;
    }

    function ensureIdentity(config) {
        if (!isObject(config.identity)) config.identity = {};
        if (!Array.isArray(config.identity.paymentMethods)) config.identity.paymentMethods = [];
        return config.identity;
    }

    function methodsFor(config) {
        return ensureIdentity(config || {}).paymentMethods;
    }

    function methodSnapshot(config) {
        return methodsFor(clone(config)).map((method, index) => ({
            id: String(method?.id || ''),
            name: String(method?.name || ''),
            accountReference: String(method?.accountReference || ''),
            recipientName: String(method?.recipientName || ''),
            instructions: String(method?.instructions || ''),
            isActive: method?.isActive !== false,
            sortOrder: Number.isFinite(Number(method?.sortOrder)) ? Number(method.sortOrder) : index
        }));
    }

    function hasMethodChanges(first, second) {
        return JSON.stringify(methodSnapshot(first)) !== JSON.stringify(methodSnapshot(second));
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function errorMessage(error, fallbackMessage) {
        const message = String(error?.message || '').trim();
        return message || fallbackMessage;
    }

    function updateStatus(message, kind = 'info', translationKey = '') {
        const status = $('memberPaymentMethodsStatus');
        if (!status) return;
        if (translationKey) status.dataset.i18n = translationKey;
        else delete status.dataset.i18n;
        status.textContent = translationKey ? t(translationKey) : message;
        status.classList.toggle('is-error', kind === 'error');
        status.classList.toggle('is-success', kind === 'success');
    }

    function setStatus(key, kind = 'info', params = {}) {
        const status = $('memberPaymentMethodsStatus');
        if (!status) return;
        updateStatus(t(key, params), kind, key);
        Object.keys(status.dataset).filter((name) => name.startsWith('i18nParam')).forEach((name) => delete status.dataset[name]);
        Object.entries(params).forEach(([name, value]) => {
            status.dataset[`i18nParam${name[0].toUpperCase()}${name.slice(1)}`] = String(value);
        });
    }

    function annotateStaticText() {
        const labels = [
            ['.member-payment-eyebrow', 'memberPayment.eyebrow'],
            ['#memberPaymentMethodsTitle', 'memberPayment.title'],
            ['.member-payment-page-heading > p', 'memberPayment.description'],
            ['#memberPaymentMethodsStatus', 'memberPayment.status.loading'],
            ['#memberPaymentMethodsMeta', 'memberPayment.status.draft'],
            ['.member-payment-section-head .member-payment-kicker', 'memberPayment.methods.eyebrow'],
            ['#memberPaymentEditorTitle', 'memberPayment.methods.title'],
            ['.member-payment-section-head p', 'memberPayment.methods.description'],
            ['#memberPaymentMethodAdd', 'memberPayment.methods.add'],
            ['.member-payment-loading', 'memberPayment.methods.loading'],
            ['.member-payment-summary-top .member-payment-kicker', 'memberPayment.summary.eyebrow'],
            ['#memberPaymentSummaryTitle', 'memberPayment.summary.title'],
            ['.member-payment-summary-top p', 'memberPayment.summary.description'],
            ['#memberPaymentSummaryNote', 'memberPayment.summary.inactiveNote'],
            ['#memberPaymentMethodsActionTitle', 'memberPayment.action.cleanTitle'],
            ['#memberPaymentMethodsActionHint', 'memberPayment.action.cleanHint'],
            ['#memberPaymentMethodsSave', 'memberPayment.action.saveDraft'],
            ['#memberPaymentMethodsPublish', 'memberPayment.action.publish']
        ];
        labels.forEach(([selector, key]) => {
            const element = page.querySelector(selector);
            if (element) element.dataset.i18n = key;
        });
        const activeLabel = $('memberPaymentActiveCount')?.previousElementSibling;
        const totalLabel = $('memberPaymentTotalCount')?.previousElementSibling;
        if (activeLabel) activeLabel.dataset.i18n = 'memberPayment.summary.activeCount';
        if (totalLabel) totalLabel.dataset.i18n = 'memberPayment.summary.totalCount';
        window.TopGymI18n?.apply?.(page);
    }

    function updateSummary() {
        const methods = methodsFor(state.draft || merge(fallback, {}));
        const activeCount = methods.filter((method) => method?.isActive !== false).length;
        const active = $('memberPaymentActiveCount');
        const total = $('memberPaymentTotalCount');
        const note = $('memberPaymentSummaryNote');
        const actionTitle = $('memberPaymentMethodsActionTitle');
        const actionHint = $('memberPaymentMethodsActionHint');
        if (active) active.textContent = String(activeCount);
        if (total) total.textContent = String(methods.length);
        if (active?.previousElementSibling) active.previousElementSibling.dataset.i18n = 'memberPayment.summary.activeCount';
        if (total?.previousElementSibling) total.previousElementSibling.dataset.i18n = 'memberPayment.summary.totalCount';
        if (note) {
            note.dataset.i18n = activeCount ? 'memberPayment.summary.activeNote' : 'memberPayment.summary.inactiveNote';
            if (activeCount) note.dataset.i18nParamCount = String(activeCount);
            else delete note.dataset.i18nParamCount;
            note.textContent = activeCount ? t('memberPayment.summary.activeNote', { count: activeCount }) : t('memberPayment.summary.inactiveNote');
        }
        if (actionTitle) {
            const key = state.dirty ? 'memberPayment.action.unsavedTitle' : state.pendingPublish ? 'memberPayment.action.pendingTitle' : 'memberPayment.action.cleanTitle';
            actionTitle.dataset.i18n = key;
            actionTitle.textContent = t(key);
        }
        if (actionHint) {
            const key = state.dirty ? 'memberPayment.action.unsavedHint' : state.pendingPublish ? 'memberPayment.action.pendingHint' : 'memberPayment.action.cleanHint';
            actionHint.dataset.i18n = key;
            actionHint.textContent = t(key);
        }
        const meta = $('memberPaymentMethodsMeta');
        if (meta) {
            const key = state.pendingPublish ? 'memberPayment.meta.draft' : 'memberPayment.meta.published';
            meta.dataset.i18n = key;
            meta.dataset.i18nParamVersion = String(state.version);
            meta.textContent = t(key, { version: state.version });
        }
    }

    function renderMethods() {
        const list = $('memberPaymentMethodsList');
        if (!list || !state.draft) return;
        const methods = methodsFor(state.draft);
        list.setAttribute('aria-busy', 'false');
        if (!methods.length) {
            list.innerHTML = '<div class="member-payment-empty"><strong data-i18n="memberPayment.methods.empty.title"></strong><span data-i18n="memberPayment.methods.empty.body"></span></div>';
            window.TopGymI18n?.apply?.(list);
            updateSummary();
            return;
        }
        list.innerHTML = methods.map((method, index) => {
            const value = (key) => escapeHtml(method?.[key] ?? '');
            const checked = method?.isActive !== false ? ' checked' : '';
            return `<article class="member-payment-method-card" data-member-payment-row="${index}">
                <div class="member-payment-method-card-head"><strong data-i18n="memberPayment.methods.row" data-i18n-param-count="${index + 1}"></strong><button class="btn btn-danger btn-small" type="button" data-member-payment-remove="${index}" data-async-action="false" data-i18n="memberPayment.methods.remove"></button></div>
                <div class="member-payment-field-grid">
                    <div class="field"><label><span data-i18n="memberPayment.methods.name"></span> <span aria-hidden="true">*</span><input data-member-payment-field="name" data-member-payment-index="${index}" value="${value('name')}" maxlength="120" required data-i18n-placeholder="memberPayment.methods.name.placeholder"></label></div>
                    <div class="field"><label><span data-i18n="memberPayment.methods.reference"></span> <span aria-hidden="true">*</span><input data-member-payment-field="accountReference" data-member-payment-index="${index}" value="${value('accountReference')}" maxlength="160" dir="ltr" required data-i18n-placeholder="memberPayment.methods.reference.placeholder"></label></div>
                    <div class="field"><label><span data-i18n="memberPayment.methods.recipient"></span><input data-member-payment-field="recipientName" data-member-payment-index="${index}" value="${value('recipientName')}" maxlength="160"></label></div>
                    <div class="field"><label><span data-i18n="memberPayment.methods.sortOrder"></span><input data-member-payment-field="sortOrder" data-member-payment-index="${index}" value="${value('sortOrder')}" type="number" min="0" max="999" step="1"></label></div>
                    <div class="field field-full"><label><span data-i18n="memberPayment.methods.instructions"></span><textarea data-member-payment-field="instructions" data-member-payment-index="${index}" maxlength="1000" rows="2" data-i18n-placeholder="memberPayment.methods.instructions.placeholder">${value('instructions')}</textarea></label></div>
                </div>
                <label class="member-payment-method-active"><input type="checkbox" data-member-payment-field="isActive" data-member-payment-index="${index}"${checked}><span data-i18n="memberPayment.methods.active"></span></label>
            </article>`;
        }).join('');
        window.TopGymI18n?.apply?.(list);
        updateSummary();
    }

    function refreshDirtyState() {
        state.dirty = Boolean(state.draft && state.originalDraft && hasMethodChanges(state.draft, state.originalDraft));
        state.pendingPublish = Boolean(state.draft && state.published && hasMethodChanges(state.draft, state.published));
        updateSummary();
    }

    function markChanged() {
        refreshDirtyState();
        setStatus('memberPayment.status.draftChanged');
    }

    function updateMethod(target) {
        const index = Number(target.dataset.memberPaymentIndex);
        const field = target.dataset.memberPaymentField;
        const methods = methodsFor(state.draft);
        if (!Number.isInteger(index) || index < 0 || index >= methods.length || !field) return;
        let value = target.type === 'checkbox' ? target.checked : target.type === 'number' ? Number(target.value) : target.value;
        if (field === 'sortOrder' && !Number.isFinite(value)) value = index;
        methods[index][field] = value;
        markChanged();
    }

    function addMethod() {
        if (state.busy || !state.draft) return;
        const methods = methodsFor(state.draft);
        methods.push({ id: '', name: '', accountReference: '', recipientName: '', instructions: '', isActive: true, sortOrder: methods.length });
        renderMethods();
        markChanged();
        document.querySelector(`[data-member-payment-field="name"][data-member-payment-index="${methods.length - 1}"]`)?.focus();
    }

    function removeMethod(index) {
        if (state.busy || !state.draft) return;
        const methods = methodsFor(state.draft);
        if (!Number.isInteger(index) || index < 0 || index >= methods.length) return;
        methods.splice(index, 1);
        renderMethods();
        markChanged();
    }

    function validateMethods() {
        const methods = methodsFor(state.draft);
        for (const [index, method] of methods.entries()) {
            if (!String(method?.name || '').trim() || !String(method?.accountReference || '').trim()) {
                setStatus('memberPayment.validation.required', 'error', { count: index + 1 });
                document.querySelector(`[data-member-payment-field="name"][data-member-payment-index="${index}"]`)?.focus();
                return false;
            }
        }
        return true;
    }

    async function runWithFeedback(button, task, options) {
        if (window.topGymFeedback?.run) return window.topGymFeedback.run(button, task, options);
        button.disabled = true;
        try {
            return await task();
        } finally {
            button.disabled = false;
        }
    }

    function applySettings(result) {
        state.draft = merge(fallback, result?.draft || state.draft || {});
        state.published = merge(fallback, result?.published || state.published || {});
        state.originalDraft = clone(state.draft);
        state.version = Number(result?.version || state.version || 1);
        state.dirty = false;
        refreshDirtyState();
        renderMethods();
    }

    async function loadSettings() {
        if (!window.topGymAuth?.isOwner?.()) return false;
        const list = $('memberPaymentMethodsList');
        if (list) list.setAttribute('aria-busy', 'true');
        setStatus('memberPayment.status.loadingSettings');
        try {
            const result = await window.topGymAuth.api('/api/branding/settings', { method: 'GET' });
            state.draft = merge(fallback, result?.draft || {});
            state.published = merge(fallback, result?.published || {});
            state.originalDraft = clone(state.draft);
            state.version = Number(result?.version || 1);
            state.dirty = false;
            refreshDirtyState();
            renderMethods();
            state.initialized = true;
            setStatus(state.pendingPublish ? 'memberPayment.status.draftNotPublished' : 'memberPayment.status.publishedReady', state.pendingPublish ? 'info' : 'success');
            return true;
        } catch (error) {
            if (list) {
                list.setAttribute('aria-busy', 'false');
                list.innerHTML = '<div class="member-payment-empty"><strong data-i18n="memberPayment.methods.loadError.title"></strong><span data-i18n="memberPayment.methods.loadError.body"></span></div>';
                window.TopGymI18n?.apply?.(list);
            }
            const message = String(error?.message || '').trim();
            const genericRequestFailure = !message || /^تعذر تنفيذ الطلب(?:\s*\(\d+\))?\.?$/u.test(message);
            if (genericRequestFailure) setStatus('memberPayment.status.loadError', 'error');
            else updateStatus(message, 'error');
            return false;
        }
    }

    async function saveDraft(button = $('memberPaymentMethodsSave')) {
        if (state.busy || !state.draft || !validateMethods()) return false;
        state.busy = true;
        try {
            const result = await runWithFeedback(button, () => window.topGymAuth.api('/api/branding/draft', {
                method: 'PUT',
                body: JSON.stringify({ config: state.draft })
            }), {
                loadingText: t('memberPayment.action.loadingSave'),
                successText: t('memberPayment.action.savedTitle'),
                successMessage: t('memberPayment.action.saved'),
                errorMessage: t('memberPayment.action.saveError')
            });
            applySettings(result);
            setStatus('memberPayment.status.draftSaved', 'success');
            return true;
        } catch (error) {
            updateStatus(errorMessage(error, t('memberPayment.status.saveError')), 'error');
            return false;
        } finally {
            state.busy = false;
        }
    }

    async function publish(button = $('memberPaymentMethodsPublish')) {
        if (state.busy || !state.draft || !validateMethods()) return false;
        state.busy = true;
        try {
            if (state.dirty) {
                state.busy = false;
                const saved = await saveDraft($('memberPaymentMethodsSave'));
                if (!saved) return false;
                state.busy = true;
            }
            const result = await runWithFeedback(button, () => window.topGymAuth.api('/api/branding/publish', {
                method: 'POST',
                body: JSON.stringify({})
            }), {
                loadingText: t('memberPayment.action.loadingPublish'),
                successText: t('memberPayment.action.publishedTitle'),
                successMessage: t('memberPayment.action.published'),
                errorMessage: t('memberPayment.action.publishError')
            });
            applySettings(result);
            state.pendingPublish = false;
            updateSummary();
            setStatus('memberPayment.status.publishedReady', 'success');
            window.topGymBranding?.refresh?.();
            window.dispatchEvent(new CustomEvent('topgym:brandingchange'));
            return true;
        } catch (error) {
            updateStatus(errorMessage(error, t('memberPayment.status.publishError')), 'error');
            return false;
        } finally {
            state.busy = false;
        }
    }

    async function confirmLeave() {
        if (!state.dirty) return true;
        if (window.Swal) {
            const result = await window.Swal.fire({
                icon: 'warning',
                title: t('memberPayment.leave.title'),
                text: t('memberPayment.leave.body'),
                showCancelButton: true,
                confirmButtonText: t('memberPayment.leave.confirm'),
                cancelButtonText: t('memberPayment.leave.cancel'),
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            return Boolean(result.isConfirmed);
        }
        return window.confirm(t('memberPayment.status.leaveError'));
    }

    function bind() {
        $('memberPaymentMethodAdd')?.addEventListener('click', addMethod);
        $('memberPaymentMethodsSave')?.addEventListener('click', () => { void saveDraft(); });
        $('memberPaymentMethodsPublish')?.addEventListener('click', () => { void publish(); });
        $('memberPaymentMethodsList')?.addEventListener('input', (event) => {
            if (event.target.matches('[data-member-payment-field]')) updateMethod(event.target);
        });
        $('memberPaymentMethodsList')?.addEventListener('change', (event) => {
            if (event.target.matches('[data-member-payment-field]')) updateMethod(event.target);
        });
        $('memberPaymentMethodsList')?.addEventListener('click', (event) => {
            const remove = event.target.closest('[data-member-payment-remove]');
            if (remove) removeMethod(Number(remove.dataset.memberPaymentRemove));
        });
        window.addEventListener('beforeunload', (event) => {
            if (!state.dirty) return;
            event.preventDefault();
            event.returnValue = '';
        });
        window.addEventListener('topgym:brandingchange', () => {
            if (state.initialized && !state.dirty && !state.busy) void loadSettings();
        });
    }

    bind();
    annotateStaticText();
    window.addEventListener('topgym:localechange', () => {
        window.TopGymI18n?.apply?.(page);
        updateSummary();
    });
    window.topGymMemberPaymentMethodsEditor = Object.freeze({ confirmLeave, reload: loadSettings });
    if (window.topGymAuthReady) void window.topGymAuthReady.then(loadSettings).catch(() => null);
})();
