(() => {
    if (window.__topGymSaasBillingLoaded) return;
    window.__topGymSaasBillingLoaded = true;

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' });
    const numberFormatter = new Intl.NumberFormat('ar-EG');
    const state = { billing: null, plans: [], requests: [], loaded: false, loading: false };

    function notify(message, error = false, type = '') {
        if (typeof window.showToast === 'function') window.showToast(message, error, type || (error ? 'error' : 'success'));
        else window.alert(message);
    }

    function date(value) {
        if (!value) return 'غير محدد';
        try { return dateFormatter.format(new Date(value)); } catch (_) { return String(value); }
    }

    function money(value, currency = 'EGP') { return `${numberFormatter.format(Number(value || 0))} ${currency === 'EGP' ? 'ج.م' : currency}`; }
    function statusLabel(status) { return { trial: 'فترة تجريبية', active: 'نشط', expired: 'منتهي', suspended: 'موقوف', cancelled: 'ملغى', pending: 'قيد المراجعة', approved: 'مقبول', rejected: 'مرفوض' }[String(status || '').toLowerCase()] || status || 'غير محدد'; }
    function statusMarkup(status, className = 'saas-status') { const value = String(status || '').toLowerCase(); return `<span class="${className}" data-status="${escapeHtml(value)}">${escapeHtml(statusLabel(value))}</span>`; }
    function limit(value) { return value == null ? 'غير محدود' : numberFormatter.format(value); }

    function showMessage(message, error = false) {
        const element = $('saasSubscriptionMessage');
        if (!element) return;
        element.textContent = message || '';
        element.hidden = !message;
        element.classList.toggle('is-error', error);
    }

    function renderSummary(billing) {
        const host = $('saasSubscriptionSummary');
        const status = billing?.subscription?.status || billing?.tenant?.status || 'expired';
        const subscription = billing?.subscription;
        const plan = subscription?.plan;
        const statusHost = $('saasSubscriptionStatus');
        if (statusHost) { statusHost.textContent = statusLabel(status); statusHost.dataset.status = status; }
        if (!host) return;
        if (!billing?.tenant) { host.innerHTML = '<div class="saas-loading-block">تعذر العثور على بيانات الجيم.</div>'; return; }
        host.innerHTML = `<article class="saas-summary-card"><span>الجيم</span><strong>${escapeHtml(billing.tenant.name)}</strong><p dir="ltr">${escapeHtml(billing.tenant.slug)}</p></article><article class="saas-summary-card"><span>الباقة الحالية</span><strong>${escapeHtml(plan?.name || 'بدون باقة')}</strong><p>${subscription ? statusMarkup(subscription.status) : 'لم يبدأ الاشتراك'}</p></article><article class="saas-summary-card"><span>الصلاحية</span><strong>${subscription?.expiresAt ? date(subscription.expiresAt) : 'غير محددة'}</strong><p>${subscription?.daysRemaining == null ? 'اشتراك مفتوح' : `${numberFormatter.format(subscription.daysRemaining)} يوم متبقٍ`}</p></article><article class="saas-summary-card"><span>الحدود الحالية</span><strong>${limit(plan?.maxMembers)} عضو</strong><p>${limit(plan?.maxUsers)} مستخدم · ${limit(plan?.maxAiGenerations)} AI</p></article>`;
    }

    function renderPlans(plans) {
        const host = $('saasPlansList');
        const select = $('saasPlanSelect');
        if (select) select.innerHTML = plans.map((plan) => `<option value="${plan.id}">${escapeHtml(plan.name)} — ${money(plan.price, plan.currency)} / ${plan.billingPeriod === 'yearly' ? 'سنة' : 'شهر'}</option>`).join('');
        if (!host) return;
        if (!plans.length) { host.innerHTML = '<div class="saas-empty">لا توجد باقات متاحة حاليًا.</div>'; return; }
        host.innerHTML = plans.map((plan, index) => `<article class="saas-plan-card ${index === 0 ? 'is-selected' : ''}" data-saas-plan-card="${plan.id}"><div><h5>${escapeHtml(plan.name)}</h5><span class="saas-muted">${escapeHtml(plan.description || '')}</span></div><div class="saas-plan-price">${money(plan.price, plan.currency)} <small>/ ${plan.billingPeriod === 'yearly' ? 'سنة' : 'شهر'}</small></div><ul class="saas-plan-limits"><li><span>الأعضاء</span><strong>${limit(plan.maxMembers)}</strong></li><li><span>المستخدمون</span><strong>${limit(plan.maxUsers)}</strong></li><li><span>AI شهريًا</span><strong>${limit(plan.maxAiGenerations)}</strong></li><li><span>التخزين</span><strong>${limit(plan.maxStorageMb)} MB</strong></li></ul><button class="btn btn-light btn-small" type="button" data-saas-select-plan="${plan.id}">اختيار الباقة</button></article>`).join('');
        if (select && plans[0]) select.value = String(plans[0].id);
    }

    function renderRequests(requests) {
        const host = $('saasRequestsList');
        if (!host) return;
        if (!requests?.length) { host.innerHTML = '<tr><td colspan="6"><div class="saas-empty">لم يتم إرسال طلبات اشتراك بعد.</div></td></tr>'; return; }
        host.innerHTML = requests.map((request) => `<tr><td>${escapeHtml(date(request.createdAt))}</td><td>${escapeHtml(request.plan?.name || '—')}</td><td>${money(request.amount, request.currency)}</td><td>${statusMarkup(request.status)}</td><td>${request.proof ? `<a class="btn btn-light btn-small" href="/api/saas/payment-proofs/${request.proof.id}/file" target="_blank" rel="noreferrer">عرض الإثبات</a>` : '<span class="saas-muted">غير مرفق</span>'}</td><td><span class="saas-muted">${escapeHtml(request.reviewNotes || 'لا توجد ملاحظات')}</span></td></tr>`).join('');
    }

    async function load() {
        if (state.loading || !window.topGymAuth?.isOwner?.()) return;
        state.loading = true;
        try {
            const data = await window.topGymAuth.api('/api/saas/subscription');
            state.billing = data;
            state.plans = data.plans || [];
            state.requests = data.requests || [];
            renderSummary(data);
            renderPlans(state.plans);
            renderRequests(state.requests);
            state.loaded = true;
        } catch (error) {
            showMessage(error.message || 'تعذر تحميل اشتراك المنصة.', true);
        } finally { state.loading = false; }
    }

    function selectPlan(planId) {
        const select = $('saasPlanSelect');
        if (select) select.value = String(planId);
        document.querySelectorAll('[data-saas-plan-card]').forEach((card) => card.classList.toggle('is-selected', card.dataset.saasPlanCard === String(planId)));
    }

    async function uploadProof(requestId, file) {
        return window.topGymAuth.api(`/api/saas/subscription-requests/${requestId}/proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-Payment-Proof-Mime': file.type, 'X-Payment-Proof-Name': file.name },
            body: file
        });
    }

    async function submit(event) {
        event.preventDefault();
        const button = $('saasSubscriptionSubmit');
        const planId = Number($('saasPlanSelect')?.value || 0);
        const file = $('saasPaymentProof')?.files?.[0];
        const notes = $('saasRequestNotes')?.value || '';
        const pending = state.requests.find((request) => request.status === 'pending');
        if (!planId) return showMessage('اختر باقة أولًا.', true);
        if (!file) return showMessage('ارفع إثبات الدفع قبل إرسال الطلب.', true);
        if (file.size > 4 * 1024 * 1024) return showMessage('حجم إثبات الدفع يجب ألا يتجاوز 4MB.', true);
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        showMessage('جارٍ إرسال الطلب ورفع إثبات الدفع…');
        try {
            let request = pending;
            if (!request) {
                const response = await window.topGymAuth.api('/api/saas/subscription-requests', { method: 'POST', body: JSON.stringify({ planId, notes }) });
                request = response.request;
            }
            await uploadProof(request.id, file);
            showMessage('تم إرسال الطلب وإثبات الدفع للمراجعة.', false);
            notify('تم إرسال طلب الاشتراك بنجاح.', false, 'success');
            $('saasSubscriptionForm')?.reset();
            await load();
        } catch (error) {
            showMessage(error.message || 'تعذر إرسال طلب الاشتراك.', true);
            notify(error.message || 'تعذر إرسال طلب الاشتراك.', true, 'error');
        } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
    }

    function bind() {
        $('saasSubscriptionForm')?.addEventListener('submit', submit);
        $('saasPlanSelect')?.addEventListener('change', (event) => selectPlan(event.target.value));
        $('saasPlansList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-saas-select-plan]');
            if (button) selectPlan(button.dataset.saasSelectPlan);
        });
    }

    bind();
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'saas-billing' && !state.loaded) void load(); });
    if (document.documentElement.dataset.topGymActiveTab === 'saas-billing') void load();
})();
