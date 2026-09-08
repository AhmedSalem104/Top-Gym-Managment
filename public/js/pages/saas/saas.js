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

    const featureLabels = Object.freeze({
        dashboard: 'لوحة التحكم', members: 'إدارة المشتركين', attendance: 'الحضور والانصراف',
        coaching: 'التدريب', nutrition: 'التغذية', ai: 'الذكاء الاصطناعي', library: 'المكتبة',
        pricing: 'أسعار العضويات', payments: 'المدفوعات', finance: 'التقارير المالية',
        day_passes: 'دخول اليوم الواحد', reports: 'التقارير', store: 'المتجر', inventory: 'المخزون',
        branches: 'الفروع', bar: 'البار والوصفات', portal: 'البوابة', branding: 'هوية الجيم',
        team: 'الفريق والصلاحيات', backup: 'النسخ الاحتياطي', audit: 'سجل النشاط', clients: 'إدارة العملاء',
        assessments: 'القياسات والتقييمات', progress: 'متابعة التقدم', goals: 'الأهداف', sessions: 'الجلسات',
        packages: 'الباقات', notifications: 'الإشعارات', tasks: 'مركز الإجراءات', templates: 'القوالب',
        prioritySupport: 'دعم بأولوية'
    });

    function planFeaturesMarkup(plan) {
        const catalog = state.billing?.featureCatalog || state.billing?.entitlements?.featureCatalog || [];
        const enabled = catalog.filter((feature) => plan.features?.[feature.key] !== false);
        if (!enabled.length) return '<li class="saas-plan-feature-empty">لا توجد مميزات إضافية مسجلة لهذه الباقة.</li>';
        return enabled.map((feature) => `<li><span class="saas-plan-feature-check" aria-hidden="true">✓</span><span>${escapeHtml(featureLabels[feature.key] || feature.key)}</span></li>`).join('');
    }

    function enhancePlanFeatureComparison(availablePlans, currentPlanId) {
        const catalog = state.billing?.featureCatalog || state.billing?.entitlements?.featureCatalog || [];
        if (!catalog.length) return;
        const current = availablePlans.find((plan) => String(plan.id) === String(currentPlanId));
        document.querySelectorAll('[data-saas-plan-card]').forEach((card) => {
            const plan = availablePlans.find((item) => String(item.id) === String(card.dataset.saasPlanCard));
            if (!plan) return;
            const list = document.createElement('div');
            list.className = 'saas-plan-entitlements';
            list.innerHTML = catalog.map((feature) => {
                const enabled = plan.features?.[feature.key] !== false;
                const currentEnabled = current ? current.features?.[feature.key] !== false : false;
                const delta = enabled && !currentEnabled && current ? ' · upgrade' : '';
                return `<span class="saas-entitlement ${enabled ? 'is-enabled' : 'is-disabled'}" title="${escapeHtml(feature.description)}">${enabled ? '✓' : '×'} ${escapeHtml(feature.key)}${delta}</span>`;
            }).join('');
            card.appendChild(list);
        });
    }

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
        const daysRemaining = subscription?.daysRemaining;
        const durationDays = subscription?.startsAt && subscription?.expiresAt
            ? Math.max(1, Math.ceil((new Date(subscription.expiresAt).getTime() - new Date(subscription.startsAt).getTime()) / 86400000))
            : null;
        const progress = durationDays && daysRemaining != null
            ? Math.max(0, Math.min(100, ((durationDays - Number(daysRemaining)) / durationDays) * 100))
            : 0;
        host.innerHTML = `<article class="saas-summary-card saas-summary-gym"><span>الجيم</span><strong>${escapeHtml(billing.tenant.name)}</strong><p dir="ltr">${escapeHtml(billing.tenant.slug)}</p></article><article class="saas-summary-card saas-summary-status"><div class="saas-summary-card-top"><span>حالة الاشتراك</span>${subscription ? statusMarkup(subscription.status) : statusMarkup('expired')}</div><strong>${subscription ? statusLabel(subscription.status) : 'بدون اشتراك'}</strong><div class="saas-summary-progress" aria-hidden="true"><span style="width:${progress}%"></span></div><p>${daysRemaining == null ? 'لا يوجد تاريخ انتهاء محدد' : `${numberFormatter.format(Math.max(0, daysRemaining))} يوم متبقٍ`}</p></article><article class="saas-summary-card"><span>الباقة الحالية</span><strong>${escapeHtml(plan?.name || 'بدون باقة')}</strong><p>${plan?.billingPeriod === 'yearly' ? 'دورة سنوية' : plan?.billingPeriod === 'monthly' ? 'دورة شهرية' : 'بيانات الاشتراك'}</p></article><article class="saas-summary-card"><span>تاريخ الاشتراك</span><strong>${subscription?.startsAt ? date(subscription.startsAt) : 'غير محدد'}</strong><p>${subscription?.expiresAt ? `حتى ${date(subscription.expiresAt)}` : 'اشتراك مفتوح'}</p></article><article class="saas-summary-card"><span>ملفات الأعضاء المستخدمة في الباقة</span><strong>${numberFormatter.format(Number(billing.usage?.members || 0))}</strong><p>من حد ${limit(plan?.maxMembers)} عضو</p></article>`;
        renderRequestContext();
    }

    function renderRequestContext() {
        const host = $('saasRequestCurrent');
        if (!host) return;
        const subscription = state.billing?.subscription;
        const plan = subscription?.plan;
        host.innerHTML = plan
            ? `<span class="saas-request-current-icon" aria-hidden="true">✓</span><div><small>الاشتراك الحالي</small><strong>${escapeHtml(plan.name)}</strong><span>${escapeHtml(statusLabel(subscription.status))}${subscription.expiresAt ? ` · حتى ${escapeHtml(date(subscription.expiresAt))}` : ''}</span></div>`
            : '<span class="saas-request-current-icon" aria-hidden="true">i</span><div><small>الاشتراك الحالي</small><strong>لا توجد باقة مفعّلة</strong><span>اختر باقة من القائمة الحالية لإرسال الطلب.</span></div>';
    }

    function planIcon(plan) {
        const name = String(plan?.name || '').toLowerCase();
        if (name.includes('enterprise') || name.includes('مؤسس') || name.includes('احتراف')) {
            return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.2 5.1L20 9l-4 3.8 1.1 5.7L12 15.8 6.9 18.5 8 12.8 4 9l5.8-.9L12 3Z"/><path d="M8 21h8"/></svg>';
        }
        if (name.includes('pro') || name.includes('احتراف') || name.includes('متقدم')) {
            return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></svg>';
        }
        return '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-12h-7l0-8Z"/></svg>';
    }

    function renderPlans(plans) {
        const host = $('saasPlansList');
        const select = $('saasPlanSelect');
        const subscriptionPlan = state.billing?.subscription?.plan || null;
        const subscriptionPlanId = subscriptionPlan?.id ?? state.billing?.subscription?.planId ?? null;
        const subscriptionPlanCode = String(subscriptionPlan?.code || state.billing?.subscription?.planCode || '').trim().toLowerCase();
        const subscriptionPlanName = String(subscriptionPlan?.name || '').trim().toLowerCase();
        const uniquePlans = new Map();
        const planKey = (plan) => {
            const code = String(plan?.code || '').trim().toLowerCase();
            if (code) return `code:${code}`;
            if (plan?.id != null) return `id:${String(plan.id)}`;
            const name = String(plan?.name || '').trim().toLowerCase();
            return name ? `name:${name}|${String(plan?.billingPeriod || '').toLowerCase()}` : '';
        };
        const planMatchesCurrent = (plan) => {
            if (subscriptionPlanId != null && String(plan?.id) === String(subscriptionPlanId)) return true;
            if (subscriptionPlanCode && String(plan?.code || '').trim().toLowerCase() === subscriptionPlanCode) return true;
            return !subscriptionPlanId && !subscriptionPlanCode && subscriptionPlanName && String(plan?.name || '').trim().toLowerCase() === subscriptionPlanName;
        };
        const addPlan = (plan) => {
            const key = planKey(plan);
            if (!key || uniquePlans.has(key)) return;
            uniquePlans.set(key, plan);
        };
        (plans || []).forEach((plan) => {
            addPlan(plan);
        });
        // The current subscription is a real plan from the API, not a second
        // catalog entry. Keep it visible once even if the active catalog no
        // longer returns it, so the select and comparison always reflect the
        // tenant's actual subscription.
        if (subscriptionPlan && ![...uniquePlans.values()].some(planMatchesCurrent)) addPlan(subscriptionPlan);
        const availablePlans = [...uniquePlans.values()];
        const currentPlan = availablePlans.find(planMatchesCurrent) || null;
        const currentPlanId = currentPlan?.id ?? subscriptionPlanId;
        const activePlans = availablePlans.filter((plan) => plan.isActive !== false);
        const requestPlans = currentPlan && !activePlans.some((plan) => String(plan.id) === String(currentPlan.id))
            ? [currentPlan, ...activePlans]
            : activePlans;
        if (select) {
            const hasCurrentPlan = requestPlans.some((plan) => String(plan.id) === String(currentPlanId));
            select.innerHTML = `<option value="">اختر الباقة المطلوبة</option>${requestPlans.map((plan) => `<option value="${plan.id}" ${String(plan.id) === String(currentPlanId) ? 'selected' : ''}>${escapeHtml(plan.name)} — ${money(plan.price, plan.currency)} / ${plan.billingPeriod === 'yearly' ? 'سنة' : 'شهر'}${String(plan.id) === String(currentPlanId) ? ' · الباقة الحالية' : ''}</option>`).join('')}`;
            select.disabled = !requestPlans.length;
            select.value = hasCurrentPlan ? String(currentPlanId) : '';
        }
        if (!host) return;
        if (!availablePlans.length) { host.innerHTML = '<div class="saas-empty">لا توجد باقات مفعّلة حاليًا. راجع مدير المنصة.</div>'; return; }
        const selectedId = currentPlan?.id ?? null;
        host.innerHTML = availablePlans.map((plan) => {
            const isCurrent = String(plan.id) === String(currentPlanId);
            const isSelected = String(plan.id) === String(selectedId);
            return `<article class="saas-plan-card ${isSelected ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}" data-saas-plan-card="${plan.id}" ${isCurrent ? 'aria-current="true"' : ''}><div class="saas-plan-card-heading"><span class="saas-plan-card-icon">${planIcon(plan)}</span><div><h5>${escapeHtml(plan.name)}</h5><span class="saas-muted">${escapeHtml(plan.description || '')}</span></div></div><div class="saas-plan-price">${money(plan.price, plan.currency)} <small>/ ${plan.billingPeriod === 'yearly' ? 'سنة' : 'شهر'}</small></div><ul class="saas-plan-limits"><li><span>الأعضاء</span><strong>${limit(plan.maxMembers)}</strong></li><li><span>المستخدمون</span><strong>${limit(plan.maxUsers)}</strong></li><li><span>AI شهريًا</span><strong>${limit(plan.maxAiGenerations)}</strong></li><li><span>الفروع</span><strong>${limit(plan.maxBranches)}</strong></li><li><span>التخزين</span><strong>${limit(plan.maxStorageMb)} MB</strong></li></ul><div class="saas-plan-features"><span class="saas-plan-features-title">مميزات الباقة</span><ul>${planFeaturesMarkup(plan)}</ul></div><button class="btn ${isCurrent ? 'btn-current-plan' : 'btn-light'} btn-small" type="button" data-saas-select-plan="${plan.id}" ${isCurrent ? 'disabled aria-pressed="true"' : ''}>${isCurrent ? 'الباقة الحالية' : 'اختيار الباقة'}</button></article>`;
        }).join('');
        if (select) select.value = selectedId == null ? '' : String(selectedId);
    }

    function setupPaymentProofUpload() {
        const input = $('saasPaymentProof');
        const box = input?.closest('.saas-upload-box');
        if (!input || !box || box.dataset.uploadReady === 'true') return;
        box.dataset.uploadReady = 'true';
        box.setAttribute('role', 'group');
        const copy = box.querySelector('div');
        const fileName = document.createElement('span');
        fileName.className = 'saas-upload-file-name';
        fileName.setAttribute('aria-live', 'polite');
        fileName.textContent = 'لم يتم اختيار ملف بعد';
        copy?.appendChild(fileName);
        const trigger = document.createElement('button');
        trigger.className = 'saas-upload-trigger';
        trigger.type = 'button';
        trigger.textContent = 'اختيار ملف';
        trigger.addEventListener('click', () => input.click());
        box.appendChild(trigger);
        const update = (file) => {
            box.classList.toggle('has-file', Boolean(file));
            fileName.textContent = file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : 'لم يتم اختيار ملف بعد';
        };
        input.addEventListener('change', () => update(input.files?.[0]));
        box.addEventListener('dragover', (event) => { event.preventDefault(); box.classList.add('is-dragging'); });
        box.addEventListener('dragleave', () => box.classList.remove('is-dragging'));
        box.addEventListener('drop', (event) => {
            event.preventDefault();
            box.classList.remove('is-dragging');
            const file = event.dataTransfer?.files?.[0];
            if (!file) return;
            const transfer = new DataTransfer();
            transfer.items.add(file);
            input.files = transfer.files;
            update(file);
        });
    }

    function setupRequestDialog() {
        const page = $('saasBillingSection');
        const panel = page?.querySelector('.saas-request-panel');
        const plansPanel = page?.querySelector('.saas-plans-panel');
        if (!page || !panel || !plansPanel || panel.dataset.dialogReady === 'true') return;
        panel.dataset.dialogReady = 'true';
        const dialog = document.createElement('dialog');
        dialog.className = 'saas-request-dialog';
        dialog.setAttribute('aria-labelledby', 'saasRequestTitle');
        const close = document.createElement('button');
        close.className = 'btn btn-light btn-small saas-request-dialog-close';
        close.type = 'button';
        close.setAttribute('aria-label', 'إغلاق نموذج طلب الاشتراك');
        close.textContent = 'إغلاق';
        panel.querySelector('.saas-panel-head')?.appendChild(close);
        const currentContext = document.createElement('div');
        currentContext.id = 'saasRequestCurrent';
        currentContext.className = 'saas-request-current';
        panel.querySelector('.saas-panel-head')?.after(currentContext);
        close.addEventListener('click', () => dialog.close());
        dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
        panel.parentElement.insertBefore(dialog, panel);
        dialog.appendChild(panel);
        const actionBar = document.createElement('div');
        actionBar.className = 'saas-plan-action-bar';
        actionBar.innerHTML = '<div><span>إدارة اشتراك الجيم</span><strong>هل تريد الترقية أو التجديد؟</strong></div>';
        const trigger = document.createElement('button');
        trigger.className = 'btn btn-primary saas-request-open';
        trigger.type = 'button';
        trigger.innerHTML = '<span aria-hidden="true">＋</span><span>إرسال طلب اشتراك</span>';
        trigger.addEventListener('click', () => dialog.showModal());
        actionBar.appendChild(trigger);
        plansPanel.parentElement.insertBefore(actionBar, plansPanel);
        renderRequestContext();
    }

    function renderRequests(requests) {
        const host = $('saasRequestsList');
        if (!host) return;
        if (!requests?.length) { host.innerHTML = '<tr><td colspan="6"><div class="saas-empty">لم يتم إرسال طلبات اشتراك بعد.</div></td></tr>'; return; }
        host.innerHTML = requests.map((request) => `<tr><td data-label="التاريخ">${escapeHtml(date(request.createdAt))}</td><td data-label="الباقة">${escapeHtml(request.plan?.name || '—')}</td><td data-label="المبلغ">${money(request.amount, request.currency)}</td><td data-label="الحالة">${statusMarkup(request.status)}</td><td data-label="إثبات الدفع">${request.proof ? `<a class="btn btn-light btn-small" href="/api/saas/payment-proofs/${request.proof.id}/file" target="_blank" rel="noreferrer">عرض الإثبات</a>` : '<span class="saas-muted">غير مرفق</span>'}</td><td data-label="ملاحظات"><span class="saas-muted">${escapeHtml(request.reviewNotes || 'لا توجد ملاحظات')}</span></td></tr>`).join('');
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
        setupPaymentProofUpload();
        setupRequestDialog();
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
})();
