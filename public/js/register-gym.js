(() => {
    'use strict';

    const form = document.getElementById('gymRegistrationForm');
    if (!form) return;

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
        submitting: false
    };
    const stageCopy = [
        ['بيانات الجيم', 'أدخل بيانات التواصل الأساسية حتى نتمكن من مراجعة طلبك.'],
        ['اختر الباقة', 'اختر الباقة التي تناسب حجم وتشغيل جيمك.'],
        ['اختر المدة', 'يمكنك اختيار المدة المتاحة داخل الباقة المحددة.'],
        ['بيانات الدفع', 'حوّل المبلغ إلى وسيلة الدفع المختارة واحتفظ بالإثبات.'],
        ['إثبات الدفع', 'ارفع ملفًا واضحًا حتى يتمكن فريق المراجعة من التحقق.'],
        ['المراجعة والإرسال', 'راجع تفاصيلك ثم أرسل الطلب إلى فريق Logic Fit.']
    ];
    const termLabels = { monthly: 'شهري', quarterly: '3 أشهر', semiannual: '6 أشهر', annual: 'سنوي' };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function text(value) { return String(value ?? '').trim(); }

    function formatMoney(value, currency = 'EGP') {
        return `${Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${escapeHtml(currency)}`;
    }

    function formatBytes(value) {
        const bytes = Number(value || 0);
        if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} كيلوبايت`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} ميجابايت`;
    }

    const safeErrorMessages = Object.freeze({
        CATALOG_INVALID: 'تعذر تحميل خيارات التسجيل حاليًا. أعد المحاولة بعد قليل.',
        GYM_REGISTRATION_NOT_CONFIGURED: 'التسجيل العام غير مهيأ حاليًا. تواصل مع Logic Fit أو أعد المحاولة لاحقًا.',
        REGISTRATION_PLAN_UNAVAILABLE: 'الباقة المختارة لم تعد متاحة. أعد تحميل الخيارات واختر باقة أخرى.',
        REGISTRATION_TERM_UNAVAILABLE: 'مدة الاشتراك المختارة لم تعد متاحة. أعد تحميل الخيارات واختر مدة أخرى.',
        REGISTRATION_PAYMENT_METHOD_UNAVAILABLE: 'وسيلة الدفع المختارة لم تعد متاحة. أعد تحميل الخيارات واختر وسيلة أخرى.',
        PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED: 'تعذر رفع إثبات الدفع لأن التخزين الخاص غير مهيأ حاليًا.',
        PRIVATE_STORAGE_VERIFICATION_UNAVAILABLE: 'تعذر التحقق من إثبات الدفع حاليًا. حاول مرة أخرى.',
        REGISTRATION_PAYMENT_PROOF_UNAVAILABLE: 'تعذر الوصول إلى إثبات الدفع. أعد رفع الملف وحاول مرة أخرى.',
        REGISTRATION_PAYMENT_PROOF_INTEGRITY_FAILED: 'تعذر التحقق من سلامة إثبات الدفع. أعد رفع الملف الأصلي.',
        REGISTRATION_REQUEST_ALREADY_EXISTS: 'يوجد طلب تسجيل مماثل قيد المراجعة بالفعل.',
        REGISTRATION_REQUEST_LOCKED: 'تمت مراجعة هذا الطلب بالفعل. أعد تحميل الصفحة لمعرفة حالته.'
    });

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

    function errorMessage(error, fallback = 'تعذر تنفيذ الطلب. حاول مرة أخرى.') {
        const code = text(error?.code);
        if (code && safeErrorMessages[code]) return safeErrorMessages[code];
        if (Number(error?.status) === 429) return 'تم تجاوز عدد المحاولات المسموح به. انتظر قليلًا ثم حاول مرة أخرى.';
        if (Number(error?.status) >= 500 || error?.name === 'TypeError') return 'تعذر الاتصال بخدمة التسجيل حاليًا. حاول مرة أخرى بعد قليل.';
        return fallback;
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

    function showError(message) {
        const element = $('registrationError');
        if (!element) return;
        element.textContent = text(message);
        element.hidden = !text(message);
        element.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }

    function clearError() {
        const element = $('registrationError');
        if (element) { element.textContent = ''; element.hidden = true; }
    }

    function toast(message, type = 'info') {
        window.LogicFitFeedback?.toast?.(message, type);
    }

    function selectedTermLabel(term) {
        return termLabels[term?.code] || `${Number(term?.durationMonths || 0)} شهر`;
    }

    function renderPlans() {
        const host = $('registrationPlans');
        if (!host || !state.catalog) return;
        host.replaceChildren();
        state.catalog.plans.forEach((plan) => {
            const label = document.createElement('label');
            label.className = 'registration-plan-option';
            label.innerHTML = `<input type="radio" name="registrationPlan" value="${escapeHtml(plan.code)}"><span class="registration-plan-content"><span class="registration-plan-top"><strong>${escapeHtml(plan.name)}</strong><span class="registration-select-dot" aria-hidden="true"></span></span><small>${escapeHtml(plan.description || 'باقة مرنة لإدارة وتشغيل الجيم.')}</small><span class="registration-plan-limit">${plan.maxMembers == null ? 'أعضاء بدون حد معلن' : `حتى ${Number(plan.maxMembers).toLocaleString('ar-EG')} عضو نشط`}</span></span>`;
            label.querySelector('input').addEventListener('change', () => {
                state.selectedPlan = plan;
                state.selectedTerm = null;
                renderTerms();
                updateReview();
            });
            host.appendChild(label);
        });
        if (!state.catalog.plans.length) host.innerHTML = '<p class="registration-empty">لا توجد باقات متاحة حاليًا. حاول لاحقًا.</p>';
    }

    function renderTerms() {
        const host = $('registrationTerms');
        if (!host) return;
        host.replaceChildren();
        const terms = state.selectedPlan?.terms?.filter((term) => term.isActive) || [];
        terms.forEach((term) => {
            const label = document.createElement('label');
            label.className = 'registration-term-option';
            label.innerHTML = `<input type="radio" name="registrationTerm" value="${escapeHtml(term.code)}"><span><strong>${escapeHtml(selectedTermLabel(term))}</strong><small>${formatMoney(term.price, term.currency)}${Number(term.discountAmount || 0) > 0 ? ` · خصم ${formatMoney(term.discountAmount, term.currency)}` : ''}</small></span>`;
            label.querySelector('input').addEventListener('change', () => {
                state.selectedTerm = term;
                renderPriceSummary();
                updateReview();
            });
            host.appendChild(label);
        });
        if (!terms.length) host.innerHTML = '<p class="registration-empty">اختر باقة أولًا لعرض المدد المتاحة.</p>';
    }

    function renderPaymentMethods() {
        const host = $('registrationPaymentMethods');
        if (!host || !state.catalog) return;
        host.replaceChildren();
        state.catalog.paymentMethods.forEach((method) => {
            const label = document.createElement('label');
            label.className = 'registration-payment-option';
            label.innerHTML = `<input type="radio" name="registrationPaymentMethod" value="${escapeHtml(method.methodCode)}"><span class="registration-payment-content"><span class="registration-payment-top"><strong>${escapeHtml(method.displayName)}</strong><span class="registration-select-dot" aria-hidden="true"></span></span><b dir="ltr">${escapeHtml(method.accountReference)}</b>${method.recipientName ? `<small>المستلم: ${escapeHtml(method.recipientName)}</small>` : ''}${method.instructions ? `<small>${escapeHtml(method.instructions)}</small>` : ''}</span>`;
            label.querySelector('input').addEventListener('change', () => {
                state.selectedPaymentMethod = method;
                updateReview();
            });
            host.appendChild(label);
        });
        if (!state.catalog.paymentMethods.length) host.innerHTML = '<p class="registration-empty">لم تُجهّز وسائل دفع Logic Fit بعد. لا يمكن إرسال طلب التسجيل قبل تفعيل وسيلة دفع من لوحة إدارة المنصة.</p>';
    }

    function renderPriceSummary() {
        const host = $('registrationPriceSummary');
        const term = state.selectedTerm;
        if (!host) return;
        if (!term) { host.hidden = true; host.replaceChildren(); return; }
        host.hidden = false;
        host.innerHTML = `<span><small>المبلغ المطلوب حسب إعدادات المنصة</small><strong>${formatMoney(Number(term.price || 0) - Number(term.discountAmount || 0), term.currency)}</strong></span>${Number(term.discountAmount || 0) > 0 ? `<span><small>الخصم</small><b>${formatMoney(term.discountAmount, term.currency)}</b></span>` : ''}`;
    }

    function renderFilePreview() {
        const host = $('registrationFilePreview');
        if (!host) return;
        if (!state.proof) { host.hidden = true; host.replaceChildren(); return; }
        host.hidden = false;
        host.innerHTML = `<span class="registration-file-icon" aria-hidden="true">▤</span><span><strong>${escapeHtml(state.proof.name)}</strong><small>${formatBytes(state.proof.size)}</small></span><button type="button" id="registrationRemoveFile" aria-label="إزالة الملف">×</button>`;
        $('registrationRemoveFile')?.addEventListener('click', () => {
            state.proof = null;
            form.elements.proof.value = '';
            renderFilePreview();
        });
    }

    function value(name) { return text(form.elements[name]?.value); }

    function reviewRow(label, content) {
        return `<div class="registration-review-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(content || '—')}</strong></div>`;
    }

    function updateReview() {
        const host = $('registrationReview');
        if (!host) return;
        const term = state.selectedTerm;
        const plan = state.selectedPlan;
        const method = state.selectedPaymentMethod;
        host.innerHTML = [
            reviewRow('اسم الجيم', value('gymName')),
            reviewRow('المسؤول', value('ownerName')),
            reviewRow('WhatsApp', value('whatsapp')),
            reviewRow('الباقة', plan?.name),
            reviewRow('المدة', selectedTermLabel(term)),
            reviewRow('وسيلة الدفع', method?.displayName),
            reviewRow('إثبات الدفع', state.proof?.name),
            `<div class="registration-review-total"><span>الإجمالي</span><strong>${term ? formatMoney(Number(term.price || 0) - Number(term.discountAmount || 0), term.currency) : '—'}</strong></div>`
        ].join('');
    }

    function validateStep(step) {
        clearError();
        if (step === 1) {
            for (const name of ['gymName', 'ownerName', 'whatsapp', 'email']) {
                if (!value(name)) { showError('أكمل الحقول المطلوبة للمتابعة.'); form.elements[name]?.focus(); return false; }
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email'))) { showError('أدخل بريدًا إلكترونيًا صالحًا.'); form.elements.email.focus(); return false; }
        }
        if (step === 2 && !state.selectedPlan) { showError('اختر باقة للمتابعة.'); return false; }
        if (step === 3 && !state.selectedTerm) { showError('اختر مدة الاشتراك للمتابعة.'); return false; }
        if (step === 4 && !state.selectedPaymentMethod) {
            showError(state.catalog?.paymentMethods?.length
                ? 'اختر وسيلة الدفع للمتابعة.'
                : 'لا توجد وسيلة دفع مفعلة لـLogic Fit حاليًا. يجب على Platform Admin تهيئة وسيلة دفع قبل متابعة التسجيل.');
            return false;
        }
        if (step === 5 && !state.proof) { showError('ارفع إثبات الدفع أولًا.'); return false; }
        return true;
    }

    function updateStepUi() {
        panels.forEach((panel) => {
            const active = Number(panel.dataset.registrationStep) === state.step;
            panel.hidden = !active;
            panel.classList.toggle('is-active', active);
        });
        indicators.forEach((indicator) => {
            const number = Number(indicator.dataset.stepIndicator);
            indicator.classList.toggle('is-current', number === state.step);
            indicator.classList.toggle('is-complete', number < state.step);
        });
        const copy = stageCopy[state.step - 1];
        $('registrationStageLabel').textContent = `الخطوة ${String(state.step).padStart(2, '0')} من 06`;
        $('registrationTitle').textContent = copy[0];
        $('registrationStageDescription').textContent = copy[1];
        $('registrationBack').hidden = state.step === 1;
        $('registrationNext').textContent = state.step === 6 ? 'إرسال طلب الاشتراك ←' : 'التالي ←';
        $('registrationActionHint').textContent = state.step === 6 ? 'لن يتم إنشاء الحساب قبل مراجعة الطلب واعتماده.' : 'يمكنك الرجوع لتعديل أي اختيار.';
        if (state.step === 6) updateReview();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function goToStep(step) {
        state.step = Math.min(6, Math.max(1, step));
        updateStepUi();
    }

    async function loadCatalog() {
        try {
            const data = await api('/api/public/gym-registration/catalog', { headers: { Accept: 'application/json' } });
            state.catalog = normalizeCatalog(data);
            renderPlans();
            renderPaymentMethods();
        } catch (error) {
            $('registrationPlans').innerHTML = '<p class="registration-empty">تعذر تحميل الباقات حاليًا. أعد تحميل الصفحة وحاول مرة أخرى.</p>';
            const message = errorMessage(error, 'تعذر تحميل خيارات الاشتراك.');
            showError(message);
            toast(message, 'error');
        }
    }

    async function createRequest() {
        if (state.requestId && state.accessToken) return;
        if (!state.idempotencyKey) state.idempotencyKey = window.crypto?.randomUUID?.() || `registration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const data = await api('/api/public/gym-registration/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Idempotency-Key': state.idempotencyKey },
            body: JSON.stringify({
                gymName: value('gymName'), ownerName: value('ownerName'), whatsapp: value('whatsapp'), email: value('email'), city: value('city'), notes: value('notes'),
                planCode: state.selectedPlan.code, termCode: state.selectedTerm.code, paymentMethodCode: state.selectedPaymentMethod.methodCode
            })
        });
        state.requestId = data.request?.id;
        state.accessToken = data.accessToken;
        if (!state.requestId || !state.accessToken) throw new Error('لم يتم إنشاء رمز متابعة آمن للطلب.');
    }

    async function uploadProof() {
        await createRequest();
        const headers = {
            'Content-Type': state.proof.type || 'application/octet-stream',
            'X-Registration-Token': state.accessToken,
            'X-Payment-Proof-Mime': state.proof.type || 'application/octet-stream',
            'X-Payment-Proof-Name-Encoded': encodeURIComponent(state.proof.name)
        };
        await api(`/api/public/gym-registration/requests/${encodeURIComponent(state.requestId)}/proof`, { method: 'POST', headers, body: state.proof });
    }

    async function submitRequest() {
        if (state.submitting) return;
        state.submitting = true;
        const button = $('registrationNext');
        const feedback = window.LogicFitFeedback;
        const record = feedback?.start?.(button, { loadingText: 'جاري إرسال الطلب...' });
        clearError();
        try {
            await uploadProof();
            $('registrationReference').textContent = `#${state.requestId}`;
            $('registrationSuccess').hidden = false;
            $('registrationActions').hidden = true;
            panels.forEach((panel) => { panel.hidden = true; panel.classList.remove('is-active'); });
            indicators.forEach((indicator) => indicator.classList.add('is-complete'));
            feedback?.stop?.(button, { successText: 'تم إرسال الطلب' });
            toast('تم استلام طلبك بنجاح.', 'success');
        } catch (error) {
            feedback?.stop?.(button);
            showError(errorMessage(error, 'تعذر إرسال الطلب. تحقق من التخزين أو الملف وحاول مرة أخرى.'));
            toast(errorMessage(error, 'تعذر إرسال الطلب.'), 'error');
        } finally {
            state.submitting = false;
            if (record && !state.requestId) feedback?.stop?.(button);
        }
    }

    $('registrationProof')?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (!file) { state.proof = null; renderFilePreview(); return; }
        if (file.size <= 0 || file.size > 4 * 1024 * 1024) { event.target.value = ''; state.proof = null; renderFilePreview(); showError('حجم إثبات الدفع يجب ألا يتجاوز 4 ميجابايت.'); return; }
        state.proof = file;
        clearError();
        renderFilePreview();
        updateReview();
    });

    form.addEventListener('input', () => { if (state.step === 6) updateReview(); });
    $('registrationBack').addEventListener('click', () => { clearError(); goToStep(state.step - 1); });
    $('registrationNext').addEventListener('click', async () => {
        if (!validateStep(state.step)) return;
        if (state.step === 6) return submitRequest();
        if (state.step === 2 && state.selectedPlan) renderTerms();
        if (state.step === 4) renderPriceSummary();
        goToStep(state.step + 1);
    });

    updateStepUi();
    loadCatalog();
})();
