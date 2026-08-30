(() => {
    'use strict';

    if (window.__topGymMemberPaymentMethodsLoaded) return;
    window.__topGymMemberPaymentMethodsLoaded = true;

    const page = document.getElementById('memberPaymentMethodsSection');
    if (!page) return;

    const $ = (id) => document.getElementById(id);
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

    function updateStatus(message, kind = 'info') {
        const status = $('memberPaymentMethodsStatus');
        if (!status) return;
        status.textContent = message;
        status.classList.toggle('is-error', kind === 'error');
        status.classList.toggle('is-success', kind === 'success');
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
        if (note) note.textContent = activeCount
            ? `${activeCount} وسيلة دفع نشطة ستظهر لأعضاء هذا الجيم بعد نشر الهوية.`
            : 'لا توجد وسيلة نشطة منشورة لأعضاء هذا الجيم حاليًا.';
        if (actionTitle) actionTitle.textContent = state.dirty
            ? 'لديك تغييرات غير محفوظة'
            : state.pendingPublish ? 'مسودة محفوظة ولم تُنشر' : 'لا توجد تغييرات غير محفوظة';
        if (actionHint) actionHint.textContent = state.dirty
            ? 'احفظ المسودة أولًا، ثم انشرها حتى تظهر البيانات في بوابة العضو.'
            : state.pendingPublish ? 'البيانات محفوظة كمسودة ولن تظهر للعضو قبل النشر.' : 'التعديلات الحالية مطابقة للمسودة المنشورة.';
        const meta = $('memberPaymentMethodsMeta');
        if (meta) meta.textContent = `v${state.version} · ${state.pendingPublish ? 'Draft' : 'Published'}`;
    }

    function renderMethods() {
        const list = $('memberPaymentMethodsList');
        if (!list || !state.draft) return;
        const methods = methodsFor(state.draft);
        list.setAttribute('aria-busy', 'false');
        if (!methods.length) {
            list.innerHTML = '<div class="member-payment-empty"><strong>لا توجد وسائل دفع مضافة</strong><span>أضف وسيلة دفع خاصة بهذا الجيم ليتمكن العضو من معرفة بيانات التحويل.</span></div>';
            updateSummary();
            return;
        }
        list.innerHTML = methods.map((method, index) => {
            const value = (key) => escapeHtml(method?.[key] ?? '');
            const checked = method?.isActive !== false ? ' checked' : '';
            return `<article class="member-payment-method-card" data-member-payment-row="${index}">
                <div class="member-payment-method-card-head"><strong>وسيلة دفع ${index + 1}</strong><button class="btn btn-danger btn-small" type="button" data-member-payment-remove="${index}" data-async-action="false">إزالة</button></div>
                <div class="member-payment-field-grid">
                    <div class="field"><label>اسم الوسيلة <span aria-hidden="true">*</span><input data-member-payment-field="name" data-member-payment-index="${index}" value="${value('name')}" maxlength="120" required placeholder="Vodafone Cash"></label></div>
                    <div class="field"><label>الرقم أو الحساب <span aria-hidden="true">*</span><input data-member-payment-field="accountReference" data-member-payment-index="${index}" value="${value('accountReference')}" maxlength="160" dir="ltr" required placeholder="رقم الهاتف أو الحساب"></label></div>
                    <div class="field"><label>اسم المستلم<input data-member-payment-field="recipientName" data-member-payment-index="${index}" value="${value('recipientName')}" maxlength="160"></label></div>
                    <div class="field"><label>ترتيب الظهور<input data-member-payment-field="sortOrder" data-member-payment-index="${index}" value="${value('sortOrder')}" type="number" min="0" max="999" step="1"></label></div>
                    <div class="field field-full"><label>تعليمات الدفع<textarea data-member-payment-field="instructions" data-member-payment-index="${index}" maxlength="1000" rows="2" placeholder="تعليمات مختصرة للعضو">${value('instructions')}</textarea></label></div>
                </div>
                <label class="member-payment-method-active"><input type="checkbox" data-member-payment-field="isActive" data-member-payment-index="${index}"${checked}><span>عرض هذه الوسيلة للعضو</span></label>
            </article>`;
        }).join('');
        updateSummary();
    }

    function refreshDirtyState() {
        state.dirty = Boolean(state.draft && state.originalDraft && hasMethodChanges(state.draft, state.originalDraft));
        state.pendingPublish = Boolean(state.draft && state.published && hasMethodChanges(state.draft, state.published));
        updateSummary();
    }

    function markChanged() {
        refreshDirtyState();
        updateStatus('مسودة وسائل الدفع بها تغييرات جديدة');
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
                updateStatus(`أكمل اسم الوسيلة والرقم أو الحساب في وسيلة الدفع ${index + 1}.`, 'error');
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
        updateStatus('جاري تحميل إعدادات الدفع…');
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
            updateStatus(state.pendingPublish ? 'توجد مسودة محفوظة لم تُنشر بعد.' : 'بيانات الدفع المنشورة جاهزة لبوابة العضو.', state.pendingPublish ? 'info' : 'success');
            return true;
        } catch (error) {
            if (list) {
                list.setAttribute('aria-busy', 'false');
                list.innerHTML = '<div class="member-payment-empty"><strong>تعذر تحميل وسائل الدفع</strong><span>حاول تحديث الشاشة مرة أخرى.</span></div>';
            }
            updateStatus(errorMessage(error, 'تعذر تحميل إعدادات الدفع.'), 'error');
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
                loadingText: 'جاري حفظ وسائل الدفع…',
                successText: 'تم حفظ المسودة',
                successMessage: 'تم حفظ وسائل الدفع كمسودة.',
                errorMessage: 'تعذر حفظ وسائل الدفع.'
            });
            applySettings(result);
            updateStatus('تم حفظ وسائل الدفع كمسودة.', 'success');
            return true;
        } catch (error) {
            updateStatus(errorMessage(error, 'تعذر حفظ وسائل الدفع. حاول مرة أخرى.'), 'error');
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
                loadingText: 'جاري نشر وسائل الدفع…',
                successText: 'تم النشر',
                successMessage: 'تم نشر وسائل الدفع لبوابة العضو.',
                errorMessage: 'تعذر نشر وسائل الدفع.'
            });
            applySettings(result);
            state.pendingPublish = false;
            updateSummary();
            updateStatus('تم نشر وسائل الدفع لبوابة العضو.', 'success');
            window.topGymBranding?.refresh?.();
            window.dispatchEvent(new CustomEvent('topgym:brandingchange'));
            return true;
        } catch (error) {
            updateStatus(errorMessage(error, 'تعذر نشر وسائل الدفع. حاول مرة أخرى.'), 'error');
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
                title: 'تغييرات غير محفوظة',
                text: 'هل تريد مغادرة الشاشة دون حفظ وسائل الدفع؟',
                showCancelButton: true,
                confirmButtonText: 'مغادرة دون حفظ',
                cancelButtonText: 'البقاء',
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            return Boolean(result.isConfirmed);
        }
        return window.confirm('توجد تغييرات غير محفوظة. هل تريد المغادرة؟');
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
    window.topGymMemberPaymentMethodsEditor = Object.freeze({ confirmLeave, reload: loadSettings });
    if (window.topGymAuthReady) void window.topGymAuthReady.then(loadSettings).catch(() => null);
})();
