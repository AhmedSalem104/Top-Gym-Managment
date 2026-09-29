(() => {
    if (window.__topGymSaasBillingLoaded) return;
    window.__topGymSaasBillingLoaded = true;

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' });
    const numberFormatter = new Intl.NumberFormat('ar-EG');
    const state = { billing: null, plans: [], requests: [], pendingRequest: null, optimisticRequests: new Map(), requestsPagination: {}, requestPage: 1, loaded: false, loading: false, refreshAfterLoad: false, submitting: false, termSelections: {} };

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

    const termLabels = Object.freeze({ monthly: 'شهري', quarterly: '3 شهور', semiannual: '6 شهور', annual: 'سنوي' });
    function planTerms(plan) {
        return Array.isArray(plan?.terms) ? plan.terms.filter((term) => term.isActive !== false) : [];
    }
    function selectedTerm(plan) {
        const terms = planTerms(plan);
        const selectedCode = state.termSelections[String(plan?.id)] || (terms.find((term) => term.code === 'monthly')?.code || terms[0]?.code);
        return terms.find((term) => term.code === selectedCode) || terms[0] || null;
    }
    function termLabel(term) { return term ? `${termLabels[term.code] || 'مدة الاشتراك'} · ${numberFormatter.format(Number(term.durationMonths || 0))} شهر` : 'مدة غير متاحة'; }
    function termAmountDue(term) { return Math.max(0, Math.round((Number(term?.price || 0) - Number(term?.discountAmount || 0)) * 100) / 100); }
    function termSelectMarkup(plan) {
        const selected = selectedTerm(plan)?.code;
        const terms = planTerms(plan);
        if (!terms.length) return '<p class="saas-muted">لا توجد مدة مفعّلة لهذه الباقة.</p>';
        return `<label class="saas-term-control"><span>مدة الاشتراك</span><select data-saas-term-plan="${escapeHtml(plan.id)}" aria-label="مدة الاشتراك لباقة ${escapeHtml(plan.name)}">${terms.map((term) => `<option value="${escapeHtml(term.code)}" ${term.code === selected ? 'selected' : ''}>${escapeHtml(termLabel(term))} — ${escapeHtml(money(termAmountDue(term), term.currency))}</option>`).join('')}</select></label>`;
    }

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
        return enabled.map((feature) => `<li data-saas-feature-key="${escapeHtml(feature.key)}"><span class="saas-plan-feature-check" aria-hidden="true">✓</span><span>${escapeHtml(featureLabels[feature.key] || feature.key)}</span></li>`).join('');
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
            ? `<div><small>الاشتراك الحالي</small><strong>${escapeHtml(plan.name)}</strong><span>${escapeHtml(statusLabel(subscription.status))}${subscription.expiresAt ? ` · حتى ${escapeHtml(date(subscription.expiresAt))}` : ''}</span></div>`
            : '<div><small>الاشتراك الحالي</small><strong>لا توجد باقة مفعّلة</strong><span>اختر باقة من القائمة الحالية لإرسال الطلب.</span></div>';
    }

    function renderPendingRequest(request) {
        const host = $('saasPendingRequestState');
        const trigger = document.querySelector('.saas-request-open');
        state.pendingRequest = request && ['pending', 'under_review'].includes(String(request.status || '').toLowerCase()) ? request : null;
        const actionBar = document.querySelector('.saas-plan-action-bar');
        const createUnavailable = Boolean(state.pendingRequest) || !state.loaded;
        if (actionBar) actionBar.hidden = createUnavailable;
        if (trigger) trigger.hidden = createUnavailable;
        if (!host) return;
        host.hidden = !state.pendingRequest;
        if (!state.pendingRequest) return;
        const pending = state.pendingRequest;
        const planName = pending.plan?.name || pending.planName || '—';
        const duration = Number(pending.durationMonths || pending.duration_months || 0);
        host.innerHTML = `<div class="saas-panel-head"><div><span class="saas-eyebrow">حالة الطلب</span><h4>طلب الاشتراك قيد المراجعة</h4><p>تم إرسال طلبك وسيتم إشعارك بعد مراجعته.</p></div>${statusMarkup(pending.status)}</div><p data-saas-pending-duration="${duration}"><strong>${escapeHtml(planName)}</strong> · ${escapeHtml(numberFormatter.format(duration))} ${duration === 1 ? 'شهر' : 'أشهر'} · ${escapeHtml(money(pending.amount, pending.currency))}</p><p class="saas-muted">تاريخ الإرسال: ${escapeHtml(date(pending.createdAt || pending.created_at))} · إثبات الدفع: ${pending.proof ? 'مرفق' : 'غير مرفق'}</p>`;
    }

    async function refreshPendingRequest() {
        const data = await window.topGymAuth.api('/api/saas/subscription-requests?page=1&pageSize=1');
        const latest = Array.isArray(data?.requests) ? data.requests : [];
        const pending = latest.find((request) => ['pending', 'under_review'].includes(String(request.status || '').toLowerCase())) || null;
        renderPendingRequest(pending);
        return pending;
    }

    function planIcon(plan) {
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
        const availablePlans = [...uniquePlans.values()].filter((plan) => planTerms(plan).length > 0);
        const currentPlan = availablePlans.find(planMatchesCurrent) || null;
        const currentPlanId = currentPlan?.id ?? subscriptionPlanId;
        const activePlans = availablePlans.filter((plan) => plan.isActive !== false);
        const requestPlans = currentPlan && !activePlans.some((plan) => String(plan.id) === String(currentPlan.id))
            ? [currentPlan, ...activePlans]
            : activePlans;
        if (select) {
            const hasCurrentPlan = requestPlans.some((plan) => String(plan.id) === String(currentPlanId));
            select.innerHTML = `<option value="">اختر الباقة المطلوبة</option>${requestPlans.map((plan) => `<option value="${plan.id}" ${String(plan.id) === String(currentPlanId) ? 'selected' : ''}>${escapeHtml(plan.name)}${String(plan.id) === String(currentPlanId) ? ' · الباقة الحالية' : ''}</option>`).join('')}`;
            select.disabled = !requestPlans.length;
            select.value = hasCurrentPlan ? String(currentPlanId) : '';
        }
        if (!host) return;
        if (!availablePlans.length) { host.innerHTML = '<div class="saas-empty">لا توجد باقات مفعّلة حاليًا. راجع مدير المنصة.</div>'; return; }
        const selectedId = currentPlan?.id ?? null;
        host.innerHTML = availablePlans.map((plan) => {
            const isCurrent = String(plan.id) === String(currentPlanId);
            const isSelected = String(plan.id) === String(selectedId);
            const term = selectedTerm(plan);
            return `<article class="saas-plan-card ${isSelected ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}" data-saas-plan-card="${plan.id}" ${isCurrent ? 'aria-current="true"' : ''}><div class="saas-plan-card-heading"><span class="saas-plan-card-icon">${planIcon(plan)}</span><div><h5>${escapeHtml(plan.name)}</h5><span class="saas-muted">${escapeHtml(plan.description || '')}</span></div></div>${termSelectMarkup(plan)}<div class="saas-plan-price">${money(term.price, term.currency)} <small>/ ${escapeHtml(termLabels[term.code] || term.code)}</small></div><ul class="saas-plan-limits"><li><span>الأعضاء</span><strong>${limit(plan.maxMembers)}</strong></li><li><span>العملاء</span><strong>${limit(plan.maxClients)}</strong></li><li><span>المستخدمون</span><strong>${limit(plan.maxUsers)}</strong></li><li><span>AI شهريًا</span><strong>${limit(plan.maxAiGenerations)}</strong></li><li><span>الفروع</span><strong>${limit(plan.maxBranches)}</strong></li><li><span>التخزين</span><strong>${limit(plan.maxStorageMb)} MB</strong></li></ul><div class="saas-plan-features"><span class="saas-plan-features-title">مميزات الباقة</span><ul>${planFeaturesMarkup(plan)}</ul></div><button class="btn ${isCurrent ? 'btn-current-plan' : 'btn-light'} btn-small" type="button" data-saas-select-plan="${plan.id}" ${isCurrent ? 'disabled aria-pressed="true"' : ''}>${isCurrent ? 'الباقة الحالية' : 'اختيار الباقة'}</button></article>`;
        }).join('');
        host.querySelectorAll('[data-saas-term-plan]').forEach((termSelect) => {
            const plan = availablePlans.find((item) => String(item.id) === termSelect.dataset.saasTermPlan);
            if (!plan) return;
            [...termSelect.options].forEach((option) => {
                const term = planTerms(plan).find((item) => item.code === option.value);
                if (term) option.textContent = `${termLabel(term)} — ${money(termAmountDue(term), term.currency)}`;
            });
            const selected = selectedTerm(plan);
            const price = termSelect.closest('.saas-plan-card')?.querySelector('.saas-plan-price');
            if (selected && price) price.textContent = `${money(termAmountDue(selected), selected.currency)} / ${termLabel(selected)}`;
        });
        if (select) {
            select.value = selectedId == null ? '' : String(selectedId);
            if (select.value) selectPlan(select.value);
            else renderRequestPricing();
        }
    }

    function setupPaymentProofUpload() {
        const input = $('saasPaymentProof');
        const box = input?.closest('.saas-upload-box');
        if (!input || !box || box.dataset.uploadReady === 'true') return;
        box.dataset.uploadReady = 'true';
        box.classList.add('file-upload-control');
        box.setAttribute('role', 'group');
        box.querySelector('.saas-upload-icon')?.classList.replace('saas-upload-icon', 'file-upload-control-icon');
        const copy = box.querySelector('div');
        const uploadHint = copy?.querySelector('small');
        if (uploadHint) uploadHint.textContent = 'PNG أو JPG أو PDF · الحد الأقصى 4MB';
        const fileName = document.createElement('span');
        fileName.className = 'file-upload-control-name';
        fileName.setAttribute('aria-live', 'polite');
        fileName.textContent = 'لم يتم اختيار ملف بعد';
        copy?.appendChild(fileName);
        const trigger = document.createElement('button');
        trigger.className = 'file-upload-control-trigger';
        trigger.type = 'button';
        trigger.textContent = 'اختيار ملف';
        trigger.addEventListener('click', () => input.click());
        box.appendChild(trigger);
        input.classList.add('visually-hidden');
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
        dialog.className = 'saas-request-dialog lf-modal-shell lf-modal--md lf-modal--structured';
        dialog.setAttribute('aria-labelledby', 'saasRequestTitle');
        const close = document.createElement('button');
        close.className = 'btn btn-light dialog-close-button';
        close.type = 'button';
        close.setAttribute('aria-label', 'إغلاق نموذج طلب الاشتراك');
        close.textContent = 'إغلاق';
        close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>';
        close.setAttribute('aria-label', 'إغلاق نموذج طلب الاشتراك');
        const header = panel.querySelector('.saas-panel-head');
        header?.classList.remove('saas-panel-head');
        header?.classList.add('modal-header');
        header?.querySelector(':scope > div')?.classList.add('modal-heading-content', 'modal-heading-stack');
        const eyebrow = header?.querySelector('.saas-eyebrow');
        if (eyebrow) eyebrow.textContent = 'مراجعة المنصة';
        if (header) {
            dialog.appendChild(header);
            const headingActions = document.createElement('div');
            headingActions.className = 'modal-heading-actions';
            headingActions.appendChild(close);
            header.appendChild(headingActions);
        }
        header?.querySelector('.saas-panel-badge.is-secure')?.remove();
        const title = header?.querySelector('#saasRequestTitle');
        if (title) title.textContent = 'طلب تجديد الاشتراك';
        const description = header?.querySelector('p');
        if (description) description.textContent = 'اختر الباقة والمدة، ثم أرفق إثبات الدفع لإرسال الطلب للمراجعة.';
        const currentContext = document.createElement('div');
        currentContext.id = 'saasRequestCurrent';
        currentContext.className = 'modal-form-context';
        close.addEventListener('click', () => { if (!state.submitting) dialog.close(); });
        dialog.addEventListener('cancel', (event) => { if (state.submitting) event.preventDefault(); });
        dialog.addEventListener('click', (event) => { if (event.target === dialog && !state.submitting) dialog.close(); });
        panel.parentElement.insertBefore(dialog, panel);
        document.body.appendChild(dialog);
        panel.classList.remove('saas-panel');
        panel.classList.add('modal-body');
        dialog.appendChild(panel);
        const planSelect = $('saasPlanSelect');
        const planField = planSelect?.closest('.field');
        const form = $('saasSubscriptionForm');
        form?.classList.add('modal-form-grid');
        const notesField = $('saasRequestNotes');
        if (notesField) notesField.rows = 2;
        if (form) panel.insertBefore(currentContext, form);
        planField?.classList.remove('field-full');
        if (form && planField && !$('saasTermSelect')) {
            const termField = document.createElement('div');
            termField.className = 'field';
            termField.innerHTML = '<label for="saasTermSelect">مدة الاشتراك المطلوبة *</label><select id="saasTermSelect" required disabled></select><div id="saasRequestPriceSummary" class="modal-form-summary" aria-live="polite"><span>الإجمالي حسب إعدادات المنصة</span><strong>اختر الباقة والمدة</strong></div>';
            planField.after(termField);
            const summary = $('saasRequestPriceSummary');
            summary?.classList.add('modal-form-summary--neutral', 'field-full');
            if (summary) termField.after(summary);
        }
        const actions = form?.querySelector('.saas-form-actions');
        actions?.classList.add('form-actions');
        const message = $('saasSubscriptionMessage');
        if (form && actions && message) {
            message.classList.add('field-full');
            form.insertBefore(message, actions);
        }
        const submitButton = $('saasSubscriptionSubmit');
        if (submitButton && form && actions) {
            submitButton.setAttribute('form', form.id);
            submitButton.dataset.loadingText = 'جارٍ إرسال الطلب...';
            actions.remove();
        }
        if (actions) dialog.appendChild(actions);
        const actionBar = document.createElement('div');
        actionBar.className = 'saas-plan-action-bar';
        actionBar.innerHTML = '<div><span>إدارة اشتراك الجيم</span><strong>هل تريد الترقية أو التجديد؟</strong></div>';
        const trigger = document.createElement('button');
        trigger.className = 'btn btn-primary saas-request-open';
        trigger.type = 'button';
        trigger.innerHTML = '<span aria-hidden="true">＋</span><span>إرسال طلب اشتراك</span>';
        trigger.addEventListener('click', async () => {
            if (state.submitting || trigger.disabled) return;
            trigger.disabled = true;
            try {
                const pending = await refreshPendingRequest();
                if (pending) return;
                selectPlan($('saasPlanSelect')?.value || '');
                renderRequestPricing();
                dialog.showModal();
            } catch (error) {
                notify(error.message || 'تعذر التحقق من حالة طلب الاشتراك.', true, 'error');
            } finally {
                trigger.disabled = Boolean(state.pendingRequest);
            }
        });
        actionBar.appendChild(trigger);
        plansPanel.parentElement.insertBefore(actionBar, plansPanel);
        const pendingState = document.createElement('section');
        pendingState.id = 'saasPendingRequestState';
        pendingState.className = 'saas-panel';
        pendingState.setAttribute('aria-live', 'polite');
        pendingState.hidden = true;
        actionBar.parentElement.insertBefore(pendingState, plansPanel);
        renderRequestContext();
        renderPendingRequest(state.pendingRequest);
    }

    function renderRequests(requests) {
        const host = $('saasRequestsList');
        if (!host) return;
        if (!requests?.length) { host.innerHTML = '<tr><td colspan="7"><div class="saas-empty">لم يتم إرسال طلبات اشتراك بعد.</div></td></tr>'; return; }
        host.innerHTML = requests.map((request) => `<tr><td data-label="التاريخ">${escapeHtml(date(request.createdAt))}</td><td data-label="الباقة">${escapeHtml(request.plan?.name || '—')}</td><td data-label="المدة" data-saas-request-duration="true">${escapeHtml(numberFormatter.format(Number(request.durationMonths || 0)))} شهر</td><td data-label="المبلغ">${money(request.amount, request.currency)}</td><td data-label="الحالة">${statusMarkup(request.status)}</td><td data-label="إثبات الدفع">${request.proof ? `<a class="btn btn-light btn-small" data-saas-payment-proof href="/api/saas/payment-proofs/${request.proof.id}/file" target="_blank" rel="noreferrer">عرض الإثبات</a>` : '<span class="saas-muted">غير مرفق</span>'}</td><td data-label="ملاحظات"><span class="saas-muted">${escapeHtml(request.reviewNotes || 'لا توجد ملاحظات')}</span></td></tr>`).join('');
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
        const table = host.closest('.saas-requests-panel')?.querySelector('.saas-table');
        const headerRow = table?.tHead?.rows?.[0];
        if (headerRow && !headerRow.querySelector('[data-saas-duration-column]')) {
            const heading = document.createElement('th');
            heading.dataset.saasDurationColumn = 'true';
            heading.textContent = 'المدة';
            headerRow.insertBefore(heading, headerRow.cells[2] || null);
        }
        const rows = $('saasRequestsList')?.rows || [];
        if (rows.length === 1 && rows[0].cells[0]?.colSpan) rows[0].cells[0].colSpan = 7;
        else [...rows].forEach((row, index) => {
            if (row.querySelector('[data-saas-request-duration]')) return;
            const cell = document.createElement('td');
            cell.dataset.label = 'المدة';
            cell.dataset.saasRequestDuration = 'true';
            cell.textContent = `${numberFormatter.format(Number(state.requests[index]?.durationMonths || 0))} شهر`;
            row.insertBefore(cell, row.cells[2] || null);
        });
        const pagination = state.requestsPagination || {};
        const total = Number(pagination.total || 0);
        const page = Number(pagination.page || state.requestPage || 1);
        const pages = Number(pagination.pages || 1);
        summary.textContent = total ? `عرض ${state.requests.length} من ${total} طلب` : 'لا توجد طلبات';
        host.innerHTML = pages > 1 ? Array.from({ length: pages }, (_, index) => index + 1).map((number) => `<button type="button" class="${number === page ? 'active' : ''}" data-saas-request-page="${number}">${number}</button>`).join('') : '';
    }

    async function load() {
        if (state.loading) { state.refreshAfterLoad = true; return; }
        if (!window.topGymAuth?.isOwner?.()) return;
        state.loading = true;
        try {
            const [data, latestRequestData] = await Promise.all([
                window.topGymAuth.api(`/api/saas/subscription?page=${state.requestPage}&pageSize=25`),
                window.topGymAuth.api('/api/saas/subscription-requests?page=1&pageSize=1')
            ]);
            state.billing = data;
            state.plans = data.plans || [];
            const loadedRequests = data.requests || [];
            const loadedIds = new Set(loadedRequests.map((item) => Number(item.id)));
            for (const id of loadedIds) state.optimisticRequests.delete(id);
            const optimistic = [...state.optimisticRequests.values()].filter((item) => !loadedIds.has(Number(item.id)));
            state.requests = [...loadedRequests, ...optimistic].sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
            state.requestsPagination = data.requestsPagination || {};
            const latestRequests = Array.isArray(latestRequestData?.requests) ? latestRequestData.requests : [];
            renderPendingRequest(latestRequests.find((request) => ['pending', 'under_review'].includes(String(request.status || '').toLowerCase())) || null);
            renderSummary(data);
            renderPlans(state.plans);
            renderRequests(state.requests);
            renderRequestPagination();
            state.loaded = true;
            renderPendingRequest(state.pendingRequest);
        } catch (error) {
            showMessage(error.message || 'تعذر تحميل اشتراك المنصة.', true);
        } finally {
            state.loading = false;
            if (state.refreshAfterLoad) {
                state.refreshAfterLoad = false;
                void load().catch(() => {});
            }
        }
    }

    function selectPlan(planId, termCode = null) {
        const select = $('saasPlanSelect');
        if (select) select.value = String(planId);
        const plan = state.plans.find((item) => String(item.id) === String(planId));
        if (plan && termCode) state.termSelections[String(plan.id)] = termCode;
        document.querySelectorAll('[data-saas-plan-card]').forEach((card) => card.classList.toggle('is-selected', card.dataset.saasPlanCard === String(planId)));
        const termSelect = $('saasTermSelect');
        if (termSelect && plan) {
            termSelect.replaceChildren(...planTerms(plan).map((term) => new Option(`${termLabel(term)} — ${money(termAmountDue(term), term.currency)}`, term.code)));
            termSelect.value = selectedTerm(plan)?.code || '';
            termSelect.disabled = !planTerms(plan).length;
        }
        if (termSelect && !plan) { termSelect.replaceChildren(); termSelect.disabled = true; }
        if (select) {
            const currentId = state.billing?.subscription?.plan?.id ?? state.billing?.subscription?.planId ?? null;
            [...select.options].forEach((option) => {
                if (!option.value) return;
                const optionPlan = state.plans.find((item) => String(item.id) === option.value);
                if (optionPlan) option.textContent = `${optionPlan.name}${String(optionPlan.id) === String(currentId) ? ' · الباقة الحالية' : ''}`;
            });
        }
        renderRequestPricing();
    }

    function renderRequestPricing() {
        const host = $('saasRequestPriceSummary');
        const plan = state.plans.find((item) => String(item.id) === String($('saasPlanSelect')?.value));
        const term = planTerms(plan).find((item) => item.code === $('saasTermSelect')?.value);
        if (!host) return;
        host.innerHTML = plan && term
            ? `<span>${escapeHtml(plan.name)} · ${escapeHtml(termLabel(term))}</span><strong>الإجمالي: ${escapeHtml(money(termAmountDue(term), term.currency))}</strong>`
            : '<span>الإجمالي حسب إعدادات المنصة</span><strong>اختر الباقة والمدة</strong>';
    }

    async function submit(event) {
        event.preventDefault();
        if (state.submitting || state.pendingRequest) return;
        const button = $('saasSubscriptionSubmit');
        const form = $('saasSubscriptionForm');
        const planId = Number($('saasPlanSelect')?.value || 0);
        const file = $('saasPaymentProof')?.files?.[0];
        const notes = $('saasRequestNotes')?.value || '';
        const selectedPlan = state.plans.find((plan) => String(plan.id) === String(planId));
        const selectedTermCode = $('saasTermSelect')?.value || '';
        const selectedBillingTerm = planTerms(selectedPlan).find((term) => term.code === selectedTermCode);
        const termCode = selectedBillingTerm?.code || '';
        if (!planId) return showMessage('اختر باقة أولًا.', true);
        if (!selectedBillingTerm) return showMessage('اختر مدة اشتراك متاحة للباقة.', true);
        if (!file) return showMessage('ارفع إثبات الدفع قبل إرسال الطلب.', true);
        if (file.size > 4 * 1024 * 1024) return showMessage('حجم إثبات الدفع يجب ألا يتجاوز 4MB.', true);
        const controls = [...(form?.querySelectorAll('input,select,textarea') || [])].map((control) => ({ control, disabled: control.disabled }));
        state.submitting = true;
        const feedback = window.LogicFitFeedback?.start(button, { loadingText: button.dataset.loadingText || 'جارٍ إرسال الطلب...', allowLayoutShift: false });
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        controls.forEach(({ control }) => { control.disabled = true; });
        try {
            const payload = new FormData();
            payload.set('planId', String(planId));
            payload.set('termCode', termCode);
            payload.set('notes', notes);
            payload.set('proof', file, file.name);
            const response = await window.topGymAuth.api('/api/saas/subscription-requests/submit', { method: 'POST', body: payload });
            const responseRequest = response.request;
            if (!responseRequest?.id || !responseRequest.proof) throw new Error('تم حفظ الطلب لكن تعذر تأكيد إثبات الدفع. حدّث سجل الطلبات قبل إعادة الإرسال.');
            const request = { ...responseRequest, termCode, durationMonths: selectedBillingTerm.durationMonths };
            state.submitting = false;
            form?.reset();
            const dialog = form?.closest('dialog');
            if (dialog?.open) dialog.close();
            notify('تم إرسال طلب الاشتراك بنجاح، والطلب الآن تحت المراجعة.', false, 'success');
            renderPendingRequest(request);
            state.requestPage = 1;
            state.optimisticRequests.set(Number(request.id), request);
            state.requests = [request, ...state.requests.filter((item) => Number(item.id) !== Number(request.id))];
            renderRequests(state.requests);
            void load().catch(() => {});
        } catch (error) {
            if (error.code === 'SAAS_REQUEST_ALREADY_PENDING' || Number(error.status || error.statusCode) === 409) {
                try {
                    const pending = await refreshPendingRequest();
                    if (pending) {
                        $('saasSubscriptionForm')?.closest('dialog')?.close();
                        notify('لديك طلب اشتراك قيد المراجعة بالفعل.', false, 'info');
                        return;
                    }
                } catch (_) { /* preserve the original conflict response */ }
            }
            showMessage(error.message || 'تعذر إرسال طلب الاشتراك.', true);
            notify(error.message || 'تعذر إرسال طلب الاشتراك.', true, 'error');
        } finally {
            state.submitting = false;
            controls.forEach(({ control, disabled }) => { control.disabled = disabled; });
            if (feedback) window.LogicFitFeedback.stop(button);
            else {
                button.disabled = false;
                button.removeAttribute('aria-busy');
            }
        }
    }

    async function previewPaymentProof(event) {
        const link = event.target.closest('[data-saas-payment-proof]');
        if (!link) return;
        event.preventDefault();
        const preview = window.open('about:blank', '_blank');
        if (!preview) {
            notify('اسمح بفتح نافذة معاينة الإثبات ثم حاول مرة أخرى.', true, 'error');
            return;
        }
        try {
            const response = await window.topGymApi.raw(link.href, { cache: 'no-store', headers: { Accept: 'image/*, application/pdf' } });
            const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
            if (!(contentType.startsWith('image/') || contentType === 'application/pdf')) {
                throw new Error('استجابة ملف الإثبات ليست صورة أو PDF صالحًا.');
            }
            const blob = await response.blob();
            if (!blob.size || blob.type && blob.type !== contentType) throw new Error('تعذر التحقق من ملف إثبات الدفع.');
            preview.location.replace(URL.createObjectURL(blob));
        } catch (error) {
            preview.close();
            notify(error.message || 'تعذر عرض إثبات الدفع.', true, 'error');
        }
    }

    function bind() {
        $('saasSubscriptionForm')?.addEventListener('submit', submit);
        $('saasPlanSelect')?.addEventListener('change', (event) => { selectPlan(event.target.value); renderRequestPricing(); });
        $('saasSubscriptionForm')?.addEventListener('change', (event) => {
            if (event.target?.id !== 'saasTermSelect') return;
            const planId = $('saasPlanSelect')?.value;
            if (!planId) return;
            state.termSelections[String(planId)] = event.target.value;
            const plan = state.plans.find((item) => String(item.id) === String(planId));
            if (plan) renderPlans(state.plans);
            renderRequestPricing();
        });
        setupPaymentProofUpload();
        setupRequestDialog();
        $('saasPlansList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-saas-select-plan]');
            if (button) selectPlan(button.dataset.saasSelectPlan);
        });
        $('saasPlansList')?.addEventListener('change', (event) => {
            const term = event.target.closest('[data-saas-term-plan]');
            if (!term) return;
            state.termSelections[String(term.dataset.saasTermPlan)] = term.value;
            selectPlan(term.dataset.saasTermPlan, term.value);
            renderPlans(state.plans);
        });
        document.addEventListener('click', (event) => {
            void previewPaymentProof(event);
            const button = event.target.closest('[data-saas-request-page]');
            if (!button) return;
            state.requestPage = Number(button.dataset.saasRequestPage) || 1;
            void load();
        });
    }

    bind();
    window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'saas-billing') void load(); });
})();
