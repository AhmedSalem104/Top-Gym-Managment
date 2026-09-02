(() => {
    if (window.__topGymSaasBillingLoaded) return;
    window.__topGymSaasBillingLoaded = true;

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' });
    const numberFormatter = new Intl.NumberFormat('ar-EG');
    const state = { billing: null, plans: [], requests: [], requestsPagination: {}, requestPage: 1, loaded: false, loading: false };

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
        const availablePlans = (plans || []).filter((plan) => plan.isActive !== false);
        const currentPlanId = state.billing?.subscription?.plan?.id;
        if (select) {
            select.innerHTML = availablePlans.map((plan) => `<option value="${plan.id}">${escapeHtml(plan.name)} — ${money(plan.price, plan.currency)} / ${plan.billingPeriod === 'yearly' ? 'سنة' : 'شهر'}</option>`).join('');
            select.disabled = !availablePlans.length;
        }
        if (!host) return;
        if (!availablePlans.length) { host.innerHTML = '<div class="saas-empty">لا توجد باقات مفعّلة حاليًا. راجع مدير المنصة.</div>'; return; }
        const selectedId = availablePlans.some((plan) => String(plan.id) === String(currentPlanId)) ? currentPlanId : availablePlans[0].id;
        host.innerHTML = availablePlans.map((plan) => `<article class="saas-plan-card ${String(plan.id) === String(selectedId) ? 'is-selected' : ''} ${String(plan.id) === String(currentPlanId) ? 'is-current' : ''}" data-saas-plan-card="${plan.id}"><div><h5>${escapeHtml(plan.name)}</h5><span class="saas-muted">${escapeHtml(plan.description || '')}</span></div><div class="saas-plan-price">${money(plan.price, plan.currency)} <small>/ ${plan.billingPeriod === 'yearly' ? 'سنة' : 'شهر'}</small></div><ul class="saas-plan-limits"><li><span>الأعضاء</span><strong>${limit(plan.maxMembers)}</strong></li><li><span>المستخدمون</span><strong>${limit(plan.maxUsers)}</strong></li><li><span>AI شهريًا</span><strong>${limit(plan.maxAiGenerations)}</strong></li><li><span>الفروع</span><strong>${limit(plan.maxBranches)}</strong></li><li><span>التخزين</span><strong>${limit(plan.maxStorageMb)} MB</strong></li></ul><button class="btn btn-light btn-small" type="button" data-saas-select-plan="${plan.id}">${String(plan.id) === String(currentPlanId) ? 'الباقة الحالية' : 'اختيار الباقة'}</button></article>`).join('');
        if (select) select.value = String(selectedId);
    }

    function renderRequests(requests) {
        const host = $('saasRequestsList');
        if (!host) return;
        if (!requests?.length) { host.innerHTML = '<tr><td colspan="6"><div class="saas-empty">لم يتم إرسال طلبات اشتراك بعد.</div></td></tr>'; return; }
        host.innerHTML = requests.map((request) => `<tr><td>${escapeHtml(date(request.createdAt))}</td><td>${escapeHtml(request.plan?.name || '—')}</td><td>${money(request.amount, request.currency)}</td><td>${statusMarkup(request.status)}</td><td>${request.proof ? `<a class="btn btn-light btn-small" href="/api/saas/payment-proofs/${request.proof.id}/file" target="_blank" rel="noreferrer">عرض الإثبات</a>` : '<span class="saas-muted">غير مرفق</span>'}</td><td><span class="saas-muted">${escapeHtml(request.reviewNotes || 'لا توجد ملاحظات')}</span></td></tr>`).join('');
    }

    function ensureRequestPagination() {
        const panel = $('saasRequestsList')?.closest('.saas-requests-panel');
        if (!panel) return { summary: null, host: null };
        let footer = panel.querySelector('.saas-request-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'directory-footer saas-request-footer';
            footer.innerHTML = '<span id="saasRequestsSummary" class="table-summary"></span><div id="saasRequestsPagination" class="pagination" aria-label="Subscription request pagination"></div>';
            panel.appendChild(footer);
        }
        return { summary: $('saasRequestsSummary'), host: $('saasRequestsPagination') };
    }

    function renderRequestPagination() {
        const { summary, host } = ensureRequestPagination();
        if (!summary || !host) return;
        const pagination = state.requestsPagination || {};
        const total = Number(pagination.total || 0);
        const page = Number(pagination.page || state.requestPage || 1);
        const pages = Number(pagination.pages || 1);
        summary.textContent = total ? `عرض ${state.requests.length} من ${total} طلب` : 'لا توجد طلبات';
        host.innerHTML = pages > 1 ? Array.from({ length: pages }, (_, index) => index + 1).map((number) => `<button type="button" class="${number === page ? 'active' : ''}" data-saas-request-page="${number}">${number}</button>`).join('') : '';
    }

    async function load() {
        if (state.loading || !window.topGymAuth?.isOwner?.()) return;
        state.loading = true;
        try {
            const data = await window.topGymAuth.api(`/api/saas/subscription?page=${state.requestPage}&pageSize=25`);
            state.billing = data;
            state.plans = data.plans || [];
            state.requests = data.requests || [];
            state.requestsPagination = data.requestsPagination || {};
            renderSummary(data);
            renderPlans(state.plans);
            renderRequests(state.requests);
            renderRequestPagination();
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
            // HTTP header values are restricted to ISO-8859-1 by the browser.
            // Encode the user-facing filename before sending it in a header so
            // Arabic filenames do not make fetch fail before the request starts.
            headers: { 'Content-Type': 'application/octet-stream', 'X-Payment-Proof-Mime': file.type, 'X-Payment-Proof-Name-Encoded': encodeURIComponent(file.name) },
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
        document.addEventListener('click', (event) => {
            const button = event.target.closest('[data-saas-request-page]');
            if (!button) return;
            state.requestPage = Number(button.dataset.saasRequestPage) || 1;
            void load();
        });
    }

    bind();
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'saas-billing' && !state.loaded) void load(); });
    if (document.documentElement.dataset.topGymActiveTab === 'saas-billing') void load();
})();
