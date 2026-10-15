(() => {
    'use strict';

    const form = document.getElementById('gymRegistrationForm');
    if (!form) return;
    const isTrainerRegistration = document.body?.dataset.registrationType === 'independent_trainer';
    const registrationEndpoint = isTrainerRegistration ? 'trainer-registration' : 'gym-registration';
    const i18n = () => window.TopGymI18n;
    const t = (key, params = {}) => i18n()?.t(key, params) || key;

    const $ = (id) => document.getElementById(id);
    const panels = [...document.querySelectorAll('[data-registration-step]')];
    const indicators = [...document.querySelectorAll('[data-step-indicator]')];
    const state = {
        step: 1,
        catalog: null,
        selectedPlan: null,
        selectedTerm: null,
        selectedPaymentMethod: null,
        proof: null,
        idempotencyKey: null,
        requestId: null,
        accessToken: null,
        requestStatus: null,
        activeError: null,
        submitting: false
    };
    const termLabelKeys = { monthly: 'registration.term.monthly', quarterly: 'registration.term.quarterly', semiannual: 'registration.term.semiannual', annual: 'registration.term.annual' };
    const phoneMessageKeys = Object.freeze({
        required: 'registration.phone.required',
        characters: 'registration.phone.characters',
        localFormat: 'registration.phone.localFormat',
        length: 'registration.phone.length',
        tooLong: 'registration.phone.tooLong',
        format: 'registration.phone.format',
        catalog: 'registration.phone.catalog'
    });
    const errorKeys = Object.freeze({
        CATALOG_INVALID: 'registration.error.catalogInvalid',
        GYM_REGISTRATION_NOT_CONFIGURED: 'registration.error.catalogUnavailable',
        REGISTRATION_PLAN_UNAVAILABLE: 'registration.error.planUnavailable',
        REGISTRATION_TERM_UNAVAILABLE: 'registration.error.termUnavailable',
        REGISTRATION_PAYMENT_METHOD_UNAVAILABLE: 'registration.error.paymentMethodUnavailable',
        PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED: 'registration.error.storageNotConfigured',
        PRIVATE_STORAGE_VERIFICATION_UNAVAILABLE: 'registration.error.storageVerificationUnavailable',
        REGISTRATION_PAYMENT_PROOF_UNAVAILABLE: 'registration.error.proofUnavailable',
        REGISTRATION_PAYMENT_PROOF_INTEGRITY_FAILED: 'registration.error.proofIntegrity',
        REGISTRATION_REQUEST_ALREADY_EXISTS: 'registration.error.requestExists',
        REGISTRATION_REQUEST_LOCKED: 'registration.error.requestLocked',
        REGISTRATION_REQUEST_ID_MISSING: 'registration.validation.requestIdMissing'
    });
    const stageKeys = Object.freeze({
        gym: [
            ['registration.step.1.gym.title', 'registration.stage.1.gym.description'],
            ['registration.step.2.title', 'registration.step.2.description.gym'],
            ['registration.step.3.title', 'registration.step.3.description.gym'],
            ['registration.step.4.title', 'registration.step.4.description.gym'],
            ['registration.step.5.title', 'registration.step.5.description.gym'],
            ['registration.step.6.title', 'registration.step.6.description']
        ],
        trainer: [
            ['registration.step.1.trainer.title', 'registration.stage.1.trainer.description'],
            ['registration.step.2.title', 'registration.step.2.description.trainer'],
            ['registration.step.3.title', 'registration.step.3.description.trainer'],
            ['registration.step.4.title', 'registration.step.4.description.trainer'],
            ['registration.step.5.title', 'registration.step.5.description.trainer'],
            ['registration.step.6.title', 'registration.step.6.description']
        ]
    });

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function text(value) { return String(value ?? '').trim(); }

    function phoneValue(name) {
        const input = form.elements?.namedItem(name);
        return window.LogicFitPhoneInputs?.getSubmissionPayload?.(input)?.phone || '';
    }

    function phonePayload(name) {
        const input = form.elements?.namedItem(name);
        return window.LogicFitPhoneInputs?.getSubmissionPayload?.(input) || {};
    }

    function formatMoney(value, currency = 'EGP') {
        const locale = i18n()?.get?.() === 'en' ? 'en-EG' : 'ar-EG';
        return `${Number(value || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency)}`;
    }

    function formatBytes(value) {
        const bytes = Number(value || 0);
        if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} ${t('registration.upload.sizeUnit.kb')}`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} ${t('registration.upload.sizeUnit.mb')}`;
    }

    function catalogError() {
        const error = new Error('Registration catalog is invalid.');
        error.code = 'CATALOG_INVALID';
        return error;
    }

    function normalizeCatalog(data) {
        if (!data || typeof data !== 'object' || !Array.isArray(data.plans) || !Array.isArray(data.paymentMethods)) {
            throw catalogError();
        }
        return {
            ...data,
            plans: data.plans.filter((plan) => plan && typeof plan === 'object' && text(plan.code)),
            paymentMethods: data.paymentMethods.filter((method) => method && typeof method === 'object' && text(method.methodCode))
        };
    }

    function errorKey(error, fallbackKey = 'registration.error.generic') {
        const code = text(error?.code);
        if (code && errorKeys[code]) return errorKeys[code];
        if (Number(error?.status) === 429) return 'registration.error.rateLimited';
        if (Number(error?.status) >= 500 || error?.name === 'TypeError') return 'registration.error.network';
        return fallbackKey;
    }

    function errorMessage(error, fallbackKey = 'registration.error.generic') {
        return t(errorKey(error, fallbackKey));
    }

    function showErrorKey(key, params = {}, { scroll = true } = {}) {
        state.activeError = { key, params };
        showError(t(key, params), { scroll });
    }

    function phoneMessageKey(result) {
        if (!result) return 'registration.phone.catalog';
        if (result.status === 'empty') return 'registration.phone.required';
        if (result.status === 'not_ready') return 'registration.phone.catalog';
        if (result.tooLong) return 'registration.phone.tooLong';
        if (result.mismatch || result.status === 'incomplete') return result.mismatch ? 'registration.phone.localFormat' : 'registration.phone.length';
        if (result.nationalDigits != null) return 'registration.phone.format';
        if (!/^\+?\d+$/u.test(String(result.compactValue || ''))) return 'registration.phone.characters';
        return 'registration.phone.localFormat';
    }

    async function api(path, options = {}) {
        const response = await fetch(path, { credentials: 'same-origin', ...options });
        let payload = null;
        try { payload = await response.json(); } catch (_) { payload = null; }
        if (!response.ok) {
            const error = new Error(payload?.error || 'تعذر الاتصال بالخدمة.');
            error.code = payload?.code || null;
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    function showError(message, { scroll = true } = {}) {
        const element = $('registrationError');
        if (!element) return;
        element.textContent = text(message);
        element.hidden = !text(message);
        if (scroll) element.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }

    function clearError() {
        state.activeError = null;
        const element = $('registrationError');
        if (element) { element.textContent = ''; element.hidden = true; }
    }

    function toast(message, type = 'info') {
        window.LogicFitFeedback?.toast?.(message, type);
    }

    function selectedTermLabel(term) {
        const key = termLabelKeys[term?.code];
        return key ? t(key) : t('registration.term.months', { count: Number(term?.durationMonths || 0) });
    }

    function renderPlans() {
        const host = $('registrationPlans');
        if (!host || !state.catalog) return;
        host.replaceChildren();
        state.catalog.plans.forEach((plan) => {
            const label = document.createElement('label');
            label.className = 'registration-plan-option';
            label.innerHTML = `<input type="radio" name="registrationPlan" value="${escapeHtml(plan.code)}"><span class="registration-plan-content"><span class="registration-plan-top"><strong data-registration-value>${escapeHtml(plan.name)}</strong><span class="registration-select-dot" aria-hidden="true"></span></span><small>${escapeHtml(plan.description || t('registration.plan.descriptionFallback'))}</small><span class="registration-plan-limit">${plan.maxMembers == null ? t('registration.plan.memberLimit.unlimited') : t('registration.plan.memberLimit.upTo', { count: Number(plan.maxMembers).toLocaleString(i18n()?.get?.() === 'en' ? 'en-EG' : 'ar-EG') })}</span></span>`;
            const input = label.querySelector('input');
            input.checked = state.selectedPlan?.code === plan.code;
            input.addEventListener('change', () => {
                state.selectedPlan = plan;
                state.selectedTerm = null;
                renderTerms();
                updateReview();
            });
            host.appendChild(label);
        });
        if (!state.catalog.plans.length) host.innerHTML = `<p class="registration-empty">${escapeHtml(t('registration.plans.empty'))}</p>`;
    }

    function renderTerms() {
        const host = $('registrationTerms');
        if (!host) return;
        host.replaceChildren();
        const terms = state.selectedPlan?.terms?.filter((term) => term.isActive) || [];
        terms.forEach((term) => {
            const label = document.createElement('label');
            label.className = 'registration-term-option';
            label.innerHTML = `<input type="radio" name="registrationTerm" value="${escapeHtml(term.code)}"><span><strong>${escapeHtml(selectedTermLabel(term))}</strong><small>${formatMoney(term.price, term.currency)}${Number(term.discountAmount || 0) > 0 ? ` · ${escapeHtml(t('registration.discount'))} ${formatMoney(term.discountAmount, term.currency)}` : ''}</small></span>`;
            const input = label.querySelector('input');
            input.checked = state.selectedTerm?.code === term.code;
            input.addEventListener('change', () => {
                state.selectedTerm = term;
                renderPriceSummary();
                updateReview();
            });
            host.appendChild(label);
        });
        if (!terms.length) host.innerHTML = `<p class="registration-empty">${escapeHtml(t('registration.terms.empty'))}</p>`;
    }

    function renderPaymentMethods() {
        const host = $('registrationPaymentMethods');
        if (!host || !state.catalog) return;
        host.replaceChildren();
        state.catalog.paymentMethods.forEach((method) => {
            const choice = document.createElement('div');
            choice.className = 'registration-payment-choice';
            choice.innerHTML = `<label class="registration-payment-option"><input type="radio" name="registrationPaymentMethod" value="${escapeHtml(method.methodCode)}"><span class="registration-payment-content"><span class="registration-payment-top"><strong data-registration-value>${escapeHtml(method.displayName)}</strong><span class="registration-select-dot" aria-hidden="true"></span></span><b dir="ltr" data-registration-value>${escapeHtml(method.accountReference)}</b>${method.recipientName ? `<small><span>${escapeHtml(t('registration.payment.recipient'))}: </span><span data-registration-value>${escapeHtml(method.recipientName)}</span></small>` : ''}${method.instructions ? `<small data-registration-value>${escapeHtml(method.instructions)}</small>` : ''}</span></label><button class="btn btn-light btn-small registration-copy-payment" type="button" data-registration-copy-payment="${escapeHtml(method.methodCode)}">${escapeHtml(t('registration.payment.copyAccount'))}</button>`;
            const input = choice.querySelector('input');
            input.checked = state.selectedPaymentMethod?.methodCode === method.methodCode;
            input.addEventListener('change', () => {
                state.selectedPaymentMethod = method;
                updateReview();
            });
            host.appendChild(choice);
        });
        if (!state.catalog.paymentMethods.length) host.innerHTML = `<p class="registration-empty">${escapeHtml(t('registration.payment.empty'))}</p>`;
    }

    async function copyText(value) {
        if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(String(value));
        const field = document.createElement('textarea');
        field.value = String(value);
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('clipboard_unavailable');
    }

    function renderPriceSummary() {
        const host = $('registrationPriceSummary');
        const term = state.selectedTerm;
        if (!host) return;
        if (!term) { host.hidden = true; host.replaceChildren(); return; }
        host.hidden = false;
        host.innerHTML = `<span><small>${escapeHtml(t('registration.price.amountDue'))}</small><strong>${formatMoney(Number(term.price || 0) - Number(term.discountAmount || 0), term.currency)}</strong></span>${Number(term.discountAmount || 0) > 0 ? `<span><small>${escapeHtml(t('registration.price.discount'))}</small><b>${formatMoney(term.discountAmount, term.currency)}</b></span>` : ''}`;
    }

    function renderFilePreview() {
        const host = $('registrationFilePreview');
        if (!host) return;
        if (!state.proof) { host.hidden = true; host.replaceChildren(); return; }
        host.hidden = false;
        host.innerHTML = `<span class="registration-file-icon" aria-hidden="true">▤</span><span><strong>${escapeHtml(state.proof.name)}</strong><small>${formatBytes(state.proof.size)}</small></span><button type="button" id="registrationRemoveFile" aria-label="${escapeHtml(t('registration.file.remove'))}">×</button>`;
        $('registrationRemoveFile')?.addEventListener('click', () => {
            state.proof = null;
            form.elements.proof.value = '';
            renderFilePreview();
        });
    }

    function value(name) { return text(form.elements[name]?.value); }

    function reviewRow(label, content, direction = 'auto') {
        const safeDirection = direction === 'ltr' ? 'ltr' : 'auto';
        return `<div class="registration-review-row"><span>${escapeHtml(label)}</span><strong dir="${safeDirection}">${escapeHtml(content || '—')}</strong></div>`;
    }

    function updateReview() {
        const host = $('registrationReview');
        if (!host) return;
        const term = state.selectedTerm;
        const plan = state.selectedPlan;
        const method = state.selectedPaymentMethod;
        host.innerHTML = [
            reviewRow(t(isTrainerRegistration ? 'registration.review.trainerName' : 'registration.review.gymName'), value('gymName')),
            reviewRow(t('registration.review.owner'), value('ownerName')),
            reviewRow(t('registration.review.whatsapp'), value('whatsapp'), 'ltr'),
            reviewRow(t('registration.review.plan'), plan?.name),
            reviewRow(t('registration.review.term'), selectedTermLabel(term)),
            reviewRow(t('registration.review.paymentMethod'), method?.displayName),
            reviewRow(t('registration.review.paymentProof'), state.proof?.name),
            `<div class="registration-review-total"><span>${escapeHtml(t('registration.review.total'))}</span><strong>${term ? formatMoney(Number(term.price || 0) - Number(term.discountAmount || 0), term.currency) : '—'}</strong></div>`
        ].join('');
    }

    function setPhoneErrorPresentation(input, result) {
        if (!input || !result || result.valid) return;
        const key = phoneMessageKey(result);
        const message = t(key, { count: result.maximumInputDigits });
        input.setCustomValidity(message);
        const error = input.closest('.phone-input-control')?.querySelector('.phone-input-error');
        if (error && !error.hidden) error.textContent = message;
    }

    function refreshPhoneLocale() {
        form.querySelectorAll('[data-phone-input]').forEach((input) => {
            const helper = input.closest('.phone-input-control')?.querySelector('.phone-input-help');
            if (helper) helper.textContent = t('registration.phone.help');
            const search = input.closest('.phone-input-control')?.querySelector('.phone-country-search');
            if (search) {
                search.placeholder = t('registration.phone.countrySearch');
                search.setAttribute('aria-label', t('registration.phone.countrySearch'));
            }
            const phoneState = window.LogicFitPhoneInputs?.getState?.(input);
            if (phoneState?.validationState === 'invalid') {
                const result = window.LogicFitPhoneInputs?.validateInput?.(input, {
                    show: true,
                    touched: phoneState.touched,
                    submitted: phoneState.submitted
                });
                setPhoneErrorPresentation(input, result);
            }
        });
    }

    function validateStep(step) {
        clearError();
        if (step === 1) {
            for (const name of ['gymName', 'ownerName', 'whatsapp', 'email']) {
                if (!value(name)) { showErrorKey('registration.validation.required'); form.elements[name]?.focus(); return false; }
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email'))) { showErrorKey('registration.validation.email'); form.elements.email.focus(); return false; }
        }
        if (step === 2 && !state.selectedPlan) { showErrorKey('registration.validation.plan'); return false; }
        if (step === 3 && !state.selectedTerm) { showErrorKey('registration.validation.term'); return false; }
        if (step === 4 && !state.selectedPaymentMethod) {
            showErrorKey(state.catalog?.paymentMethods?.length
                ? 'registration.validation.paymentMethod'
                : 'registration.validation.paymentMethodNotConfigured');
            return false;
        }
        if (step === 5 && !state.proof) { showErrorKey('registration.validation.paymentProof'); return false; }
        if (step === 1) {
            const phoneInput = form.elements?.namedItem('whatsapp');
            const phoneValidation = window.LogicFitPhoneInputs?.validateInput?.(phoneInput, { show: true });
            if (phoneValidation && !phoneValidation.valid) {
                showErrorKey(phoneMessageKey(phoneValidation), { count: phoneValidation.maximumInputDigits });
                setPhoneErrorPresentation(phoneInput, phoneValidation);
                phoneInput?.focus();
                return false;
            }
        }
        return true;
    }

    function updateStepUi({ scroll = true } = {}) {
        panels.forEach((panel) => {
            const active = Number(panel.dataset.registrationStep) === state.step;
            panel.hidden = !active;
            panel.classList.toggle('is-active', active);
        });
        indicators.forEach((indicator) => {
            const number = Number(indicator.dataset.stepIndicator);
            indicator.classList.toggle('is-current', number === state.step);
            indicator.classList.toggle('is-complete', number < state.step);
            indicator.setAttribute('aria-current', number === state.step ? 'step' : 'false');
        });
        const [titleKey, descriptionKey] = stageKeys[isTrainerRegistration ? 'trainer' : 'gym'][state.step - 1];
        $('registrationStageLabel').textContent = t('registration.stageLabel', { step: String(state.step).padStart(2, '0') });
        $('registrationTitle').textContent = t(titleKey);
        $('registrationStageDescription').textContent = t(descriptionKey);
        $('registrationBack').hidden = state.step === 1;
        $('registrationNext').textContent = `${t(state.step === 6 ? 'registration.actions.submit' : 'registration.actions.next')} ${i18n()?.dir?.() === 'ltr' ? '→' : '←'}`;
        $('registrationActionHint').textContent = t(state.step === 6
            ? `registration.actions.hint.review.${isTrainerRegistration ? 'trainer' : 'gym'}`
            : 'registration.actions.hint.editable');
        if (state.step === 6) updateReview();
        if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goToStep(step) {
        state.step = Math.min(6, Math.max(1, step));
        updateStepUi();
    }

    async function loadCatalog() {
        try {
            const data = await api(`/api/public/${registrationEndpoint}/catalog`, { headers: { Accept: 'application/json' } });
            state.catalog = normalizeCatalog(data);
            renderPlans();
            renderPaymentMethods();
        } catch (error) {
            $('registrationPlans').innerHTML = `<p class="registration-empty">${escapeHtml(t('registration.error.catalogLoad'))}</p>`;
            const key = errorKey(error, 'registration.error.catalogInvalid');
            showErrorKey(key);
            toast(t(key), 'error');
        }
    }

    async function createRequest() {
        if (state.requestId && state.accessToken) return;
        if (!state.idempotencyKey) state.idempotencyKey = window.crypto?.randomUUID?.() || `registration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const data = await api(`/api/public/${registrationEndpoint}/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Idempotency-Key': state.idempotencyKey },
            body: JSON.stringify({
                gymName: value('gymName'), ownerName: value('ownerName'), whatsapp: phoneValue('whatsapp'), whatsappNational: phonePayload('whatsapp').phoneNational || '', whatsappCountry: phonePayload('whatsapp').phoneCountry || '', email: value('email'), city: value('city'), notes: value('notes'),
                planCode: state.selectedPlan.code, termCode: state.selectedTerm.code, paymentMethodCode: state.selectedPaymentMethod.methodCode
            })
        });
        state.requestId = data.request?.id;
        state.accessToken = data.accessToken;
        if (!state.requestId || !state.accessToken) {
            const error = new Error('registration_request_tracking_unavailable');
            error.code = 'REGISTRATION_REQUEST_ID_MISSING';
            throw error;
        }
    }

    async function uploadProof() {
        await createRequest();
        const headers = {
            'Content-Type': state.proof.type || 'application/octet-stream',
            'X-Registration-Token': state.accessToken,
            'X-Payment-Proof-Mime': state.proof.type || 'application/octet-stream',
            'X-Payment-Proof-Name-Encoded': encodeURIComponent(state.proof.name)
        };
        return api(`/api/public/${registrationEndpoint}/requests/${encodeURIComponent(state.requestId)}/proof`, { method: 'POST', headers, body: state.proof });
    }

    function registrationStatusLabel(status) {
        return t(({ pending: 'registration.status.pending', approved: 'registration.status.approved', rejected: 'registration.status.rejected', cancelled: 'registration.status.cancelled' })[String(status || '').toLowerCase()] || 'registration.status.unavailable');
    }

    function renderPaymentConfirmation() {
        const successDetails = $('registrationPaymentConfirmation');
        if (!successDetails || state.requestStatus == null) return;
        const amount = Number(state.selectedTerm?.price || 0) - Number(state.selectedTerm?.discountAmount || 0);
        successDetails.innerHTML = `<div><small>${escapeHtml(t('registration.confirmation.amount'))}</small><strong>${formatMoney(amount, state.selectedTerm?.currency)}</strong></div><div><small>${escapeHtml(t('registration.confirmation.paymentMethod'))}</small><strong data-registration-value>${escapeHtml(state.selectedPaymentMethod?.displayName || '—')}</strong></div><div class="registration-confirmation-status"><small>${escapeHtml(t('registration.confirmation.status'))}</small><strong data-registration-status role="status">${escapeHtml(registrationStatusLabel(state.requestStatus))}</strong><button class="btn btn-light btn-small" type="button" data-registration-refresh-status>${escapeHtml(t('registration.confirmation.refresh'))}</button></div><p>${escapeHtml(t('registration.confirmation.received'))}</p>`;
    }

    async function refreshRegistrationStatus(button) {
        if (!state.requestId || !state.accessToken || !button || button.disabled) return;
        button.disabled = true;
        const status = $('registrationPaymentConfirmation')?.querySelector('[data-registration-status]');
        if (status) status.textContent = t('registration.status.loading');
        try {
            const result = await api(`/api/public/${registrationEndpoint}/requests/${encodeURIComponent(state.requestId)}`, {
                headers: { 'X-Registration-Token': state.accessToken, Accept: 'application/json' }
            });
            state.requestStatus = result.request?.status || '';
            if (status) status.textContent = registrationStatusLabel(state.requestStatus);
        } catch (error) {
            if (status) status.textContent = t('registration.status.refreshError');
            toast(errorMessage(error), 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function submitRequest() {
        if (state.submitting) return;
        state.submitting = true;
        const button = $('registrationNext');
        const feedback = window.LogicFitFeedback;
        const record = feedback?.start?.(button, { loadingText: t('registration.actions.submitLoading') });
        clearError();
        try {
            const proofResult = await uploadProof();
            state.requestStatus = proofResult?.request?.status || '';
            $('registrationReference').textContent = `#${state.requestId}`;
            renderPaymentConfirmation();
            $('registrationSuccess').hidden = false;
            $('registrationActions').hidden = true;
            panels.forEach((panel) => { panel.hidden = true; panel.classList.remove('is-active'); });
            indicators.forEach((indicator) => indicator.classList.add('is-complete'));
            feedback?.stop?.(button, { successText: t('registration.actions.submitSuccess') });
            toast(t('registration.toast.success'), 'success');
        } catch (error) {
            feedback?.stop?.(button);
            showErrorKey(errorKey(error, 'registration.error.requestSubmit'));
            toast(errorMessage(error, 'registration.error.requestSubmit'), 'error');
        } finally {
            state.submitting = false;
            if (record && !state.requestId) feedback?.stop?.(button);
        }
    }

    $('registrationProof')?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) { state.proof = null; renderFilePreview(); return; }
        if (file.size <= 0 || file.size > 4 * 1024 * 1024) { event.target.value = ''; state.proof = null; renderFilePreview(); showErrorKey('registration.validation.paymentProofSize'); return; }
        state.proof = file;
        clearError();
        renderFilePreview();
        updateReview();
    });

    form.addEventListener('input', () => { if (state.step === 6) updateReview(); });
    $('registrationBack').addEventListener('click', () => { clearError(); goToStep(state.step - 1); });
    $('registrationPaymentMethods')?.addEventListener('click', async (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-registration-copy-payment]') : null;
        if (!button) return;
        const method = state.catalog?.paymentMethods?.find((item) => item.methodCode === button.dataset.registrationCopyPayment);
        if (!method?.accountReference) return;
        try {
            await copyText(method.accountReference);
            toast(t('registration.toast.copied'), 'success');
        } catch (_) {
            toast(t('registration.toast.copyFailed'), 'error');
        }
    });
    $('registrationSuccess')?.addEventListener('click', (event) => {
        const button = event.target instanceof Element ? event.target.closest('[data-registration-refresh-status]') : null;
        if (button) void refreshRegistrationStatus(button);
    });
    $('registrationNext').addEventListener('click', async () => {
        if (!validateStep(state.step)) return;
        if (state.step === 6) return submitRequest();
        if (state.step === 2 && state.selectedPlan) renderTerms();
        if (state.step === 4) renderPriceSummary();
        goToStep(state.step + 1);
    });

    function applyRegistrationLocale() {
        const runtime = i18n();
        if (!runtime) return;
        runtime.annotateText(document, 'registration.', '[data-registration-value], [data-theme-toggle]');
        const asideImage = document.querySelector('.registration-aside-visual img');
        if (asideImage) asideImage.alt = t(isTrainerRegistration ? 'registration.aside.trainer.imageAlt' : 'registration.aside.gym.imageAlt');
        refreshPhoneLocale();
        updateStepUi({ scroll: false });
        renderPlans();
        renderTerms();
        renderPaymentMethods();
        renderPriceSummary();
        renderFilePreview();
        updateReview();
        renderPaymentConfirmation();
        if (state.activeError) showErrorKey(state.activeError.key, state.activeError.params, { scroll: false });
    }

    window.addEventListener('topgym:localechange', applyRegistrationLocale);
    applyRegistrationLocale();
    updateStepUi();
    loadCatalog();
})();
