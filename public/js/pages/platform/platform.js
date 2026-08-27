(() => {
    if (window.__topGymPlatformLoaded) return;
    window.__topGymPlatformLoaded = true;

    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const dateFormatter = new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
    const numberFormatter = new Intl.NumberFormat('ar-EG');
    let loaded = false;
    let loading = false;
    let plans = [];

    function notify(message, error = false, type = '') {
        if (typeof window.showToast === 'function') window.showToast(message, error, type || (error ? 'error' : 'success'));
        else window.alert(message);
    }

    function formatDate(value) {
        if (!value) return '—';
        try { return dateFormatter.format(new Date(value)); } catch (_) { return String(value); }
    }

    function formatMoney(value, currency = 'EGP') {
        return `${numberFormatter.format(Number(value || 0))} ${currency === 'EGP' ? 'ج.م' : currency}`;
    }

    function statusLabel(status) {
        return { trial: 'تجربة', active: 'نشط', suspended: 'موقوف', expired: 'منتهي', archived: 'مؤرشف', pending: 'قيد المراجعة', approved: 'مقبول', rejected: 'مرفوض' }[String(status || '').toLowerCase()] || status || 'غير محدد';
    }

    function statusMarkup(status, className = 'saas-status') {
        const value = String(status || '').toLowerCase();
        return `<span class="${className}" data-status="${escapeHtml(value)}">${escapeHtml(statusLabel(value))}</span>`;
    }

    function setButtonLoading(button, loadingState) {
        if (!button) return;
        button.disabled = Boolean(loadingState);
        button.setAttribute('aria-busy', String(Boolean(loadingState)));
    }

    function renderOverview(data) {
        const tenants = data?.tenants || {};
        if ($('platformTotalTenants')) $('platformTotalTenants').textContent = numberFormatter.format(tenants.total || 0);
        if ($('platformLiveTenants')) $('platformLiveTenants').textContent = numberFormatter.format(tenants.live || 0);
        if ($('platformPendingRequests')) $('platformPendingRequests').textContent = numberFormatter.format(data?.pendingRequests || 0);
        if ($('platformExpiredTenants')) $('platformExpiredTenants').textContent = numberFormatter.format((tenants.expired || 0) + (tenants.suspended || 0));
    }

    function renderRequests(requests) {
        const host = $('platformRequestsList');
        if (!host) return;
        if (!requests?.length) {
            host.innerHTML = '<tr><td colspan="6"><div class="saas-empty">لا توجد طلبات في هذه الحالة.</div></td></tr>';
            return;
        }
        host.innerHTML = requests.map((request) => {
            const proof = request.proof
                ? `<a class="btn btn-light btn-small" href="/api/platform/payment-proofs/${request.proof.id}/file" target="_blank" rel="noreferrer">عرض الإثبات</a>`
                : '<span class="saas-muted">لم يُرفع</span>';
            const actions = request.status === 'pending'
                ? `<div class="saas-table-actions"><button class="btn btn-primary btn-small" type="button" data-platform-action="approve-request" data-request-id="${request.id}" ${request.proof ? '' : 'disabled'}>قبول وتفعيل</button><button class="btn btn-light btn-small" type="button" data-platform-action="reject-request" data-request-id="${request.id}">رفض</button></div>`
                : '<span class="saas-muted">تمت المراجعة</span>';
            return `<tr><td><strong>${escapeHtml(request.tenantName || '—')}</strong><small class="saas-muted" dir="ltr">${escapeHtml(request.tenantSlug || '')}</small></td><td>${escapeHtml(request.plan?.name || request.plan?.code || '—')}</td><td>${formatMoney(request.amount, request.currency)}</td><td>${proof}</td><td>${statusMarkup(request.status)}</td><td>${actions}</td></tr>`;
        }).join('');
    }

    function renderTenants(tenants) {
        const host = $('platformTenantsList');
        if (!host) return;
        if (!tenants?.length) {
            host.innerHTML = '<tr><td colspan="6"><div class="saas-empty">لا توجد جيمات مسجلة بعد.</div></td></tr>';
            return;
        }
        host.innerHTML = tenants.map((tenant) => {
            const plan = tenant.subscription?.plan?.name || 'بدون باقة';
            const usage = `${numberFormatter.format(tenant.usage?.members || 0)} عضو · ${numberFormatter.format(tenant.usage?.users || 0)} مستخدم`;
            const statusOptions = ['trial', 'active', 'suspended', 'expired', 'archived'].map((value) => `<option value="${value}" ${value === tenant.status ? 'selected' : ''}>${statusLabel(value)}</option>`).join('');
            return `<tr><td><strong>${escapeHtml(tenant.name)}</strong><small class="saas-muted" dir="ltr">${escapeHtml(tenant.slug)}</small></td><td>${escapeHtml(tenant.owner?.name || '—')}<small class="saas-muted" dir="ltr">${escapeHtml(tenant.owner?.email || '')}</small></td><td><select class="saas-inline-input" data-platform-tenant-status="${tenant.id}" aria-label="حالة ${escapeHtml(tenant.name)}">${statusOptions}</select></td><td>${escapeHtml(plan)}<small class="saas-muted">${tenant.subscription?.expiresAt ? `حتى ${escapeHtml(formatDate(tenant.subscription.expiresAt))}` : 'بدون انتهاء'}</small></td><td>${escapeHtml(usage)}</td><td><span class="saas-muted">${escapeHtml(formatDate(tenant.createdAt))}</span></td></tr>`;
        }).join('');
    }

    function planLimits(plan) {
        const limit = (value) => value == null ? 'غير محدود' : numberFormatter.format(value);
        return `<ul class="saas-plan-limits"><li><span>الأعضاء</span><strong>${limit(plan.maxMembers)}</strong></li><li><span>المستخدمون</span><strong>${limit(plan.maxUsers)}</strong></li><li><span>AI شهريًا</span><strong>${limit(plan.maxAiGenerations)}</strong></li><li><span>التخزين</span><strong>${limit(plan.maxStorageMb)} MB</strong></li></ul>`;
    }

    function renderPlans(items) {
        plans = items || [];
        const host = $('platformPlansList');
        if (!host) return;
        if (!plans.length) { host.innerHTML = '<div class="saas-empty">لا توجد باقات.</div>'; return; }
        const featureLabels = { intelligence: 'الذكاء التشغيلي', coaching: 'التدريب والتغذية', store: 'المتجر', reports: 'التقارير', portal: 'بوابة المشترك', prioritySupport: 'دعم أولوية' };
        host.innerHTML = plans.map((plan) => {
            const featureInputs = Object.entries(featureLabels).map(([key, label]) => `<label class="saas-feature-toggle"><input type="checkbox" data-plan-feature="${key}" data-plan-id="${plan.id}" ${plan.features?.[key] ? 'checked' : ''}><span>${label}</span></label>`).join('');
            return `<article class="saas-plan-card saas-admin-plan-card"><div><h5>${escapeHtml(plan.name)}</h5><span class="saas-muted" dir="ltr">${escapeHtml(plan.code)}</span></div><div class="saas-plan-edit"><label>السعر<input class="saas-inline-input" type="number" min="0" step="0.01" data-plan-field="price" data-plan-id="${plan.id}" value="${escapeHtml(plan.price)}"></label><label>دورة الفوترة<select class="saas-inline-input" data-plan-field="billingPeriod" data-plan-id="${plan.id}"><option value="monthly" ${plan.billingPeriod === 'monthly' ? 'selected' : ''}>شهري</option><option value="yearly" ${plan.billingPeriod === 'yearly' ? 'selected' : ''}>سنوي</option></select></label><label>الأعضاء<input class="saas-inline-input" type="number" min="1" data-plan-field="maxMembers" data-plan-id="${plan.id}" value="${plan.maxMembers == null ? '' : escapeHtml(plan.maxMembers)}" placeholder="غير محدود"></label><label>المستخدمون<input class="saas-inline-input" type="number" min="1" data-plan-field="maxUsers" data-plan-id="${plan.id}" value="${plan.maxUsers == null ? '' : escapeHtml(plan.maxUsers)}" placeholder="غير محدود"></label><label>AI شهريًا<input class="saas-inline-input" type="number" min="1" data-plan-field="maxAiGenerations" data-plan-id="${plan.id}" value="${plan.maxAiGenerations == null ? '' : escapeHtml(plan.maxAiGenerations)}" placeholder="غير محدود"></label><label>التخزين MB<input class="saas-inline-input" type="number" min="1" data-plan-field="maxStorageMb" data-plan-id="${plan.id}" value="${plan.maxStorageMb == null ? '' : escapeHtml(plan.maxStorageMb)}" placeholder="غير محدود"></label></div><div class="saas-feature-grid"><span class="saas-muted">المميزات المسموحة</span>${featureInputs}</div>${planLimits(plan)}<div class="saas-table-actions"><button class="btn btn-light btn-small" type="button" data-platform-action="save-plan" data-plan-id="${plan.id}">حفظ الباقة</button><span class="saas-muted">${plan.isActive ? 'متاحة للبيع' : 'متوقفة'}</span></div></article>`;
        }).join('');
    }

    function renderAudit(items) {
        const host = $('platformAuditList');
        if (!host) return;
        if (!items?.length) { host.innerHTML = '<div class="saas-empty">لا توجد عمليات مسجلة بعد.</div>'; return; }
        host.innerHTML = items.map((item) => `<div class="saas-audit-item"><time datetime="${escapeHtml(item.createdAt || '')}">${escapeHtml(formatDate(item.createdAt))}</time><div><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.details || '')}${item.actorName ? ` · بواسطة ${escapeHtml(item.actorName)}` : ''}</span></div></div>`).join('');
    }

    async function loadRequests() {
        const status = encodeURIComponent($('platformRequestStatus')?.value || '');
        const data = await window.topGymAuth.api(`/api/platform/subscription-requests${status ? `?status=${status}` : ''}`);
        renderRequests(data.requests || []);
    }

    async function loadAll() {
        if (loading) return;
        if (!window.topGymAuth?.isPlatformAdmin?.()) return;
        loading = true;
        try {
            const status = encodeURIComponent($('platformRequestStatus')?.value || '');
            const [overview, tenants, platformPlans, requests, audit] = await Promise.all([
                window.topGymAuth.api('/api/platform/overview'),
                window.topGymAuth.api('/api/platform/tenants'),
                window.topGymAuth.api('/api/platform/plans'),
                window.topGymAuth.api(`/api/platform/subscription-requests${status ? `?status=${status}` : ''}`),
                window.topGymAuth.api('/api/platform/audit?limit=50')
            ]);
            renderOverview(overview);
            renderTenants(tenants.tenants || []);
            renderPlans(platformPlans.plans || []);
            renderRequests(requests.requests || []);
            renderAudit(audit.audit || []);
            loaded = true;
        } catch (error) {
            notify(error.message || 'تعذر تحميل بيانات إدارة المنصة.', true, 'error');
        } finally {
            loading = false;
        }
    }

    async function handleCreateTenant(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = $('platformCreateTenant');
        const data = Object.fromEntries(new FormData(form).entries());
        if (!data.name || !data.slug || !data.ownerName || !data.ownerEmail || !data.ownerPassword) return notify('أكمل بيانات الجيم والـOwner أولًا.', true, 'error');
        setButtonLoading(button, true);
        try {
            await window.topGymAuth.api('/api/platform/tenants', { method: 'POST', body: JSON.stringify(data) });
            form.reset();
            notify('تم إنشاء الجيم والـOwner وبدء الفترة التجريبية.', false, 'success');
            await loadAll();
        } catch (error) {
            notify(error.message || 'تعذر إنشاء الجيم.', true, 'error');
        } finally { setButtonLoading(button, false); }
    }

    async function reviewRequest(requestId, action) {
        let reviewNotes = '';
        if (action === 'reject' || action === 'approve') reviewNotes = window.prompt(action === 'reject' ? 'اكتب سبب رفض الطلب:' : 'ملاحظات التفعيل (اختياري):', '') || '';
        if (action === 'reject' && !reviewNotes.trim()) return;
        try {
            await window.topGymAuth.api(`/api/platform/subscription-requests/${requestId}/${action}`, { method: 'POST', body: JSON.stringify({ reviewNotes }) });
            notify(action === 'approve' ? 'تم قبول الطلب وتفعيل اشتراك الجيم.' : 'تم رفض الطلب.', false, 'success');
            await loadAll();
        } catch (error) { notify(error.message || 'تعذر مراجعة الطلب.', true, 'error'); }
    }

    async function updateTenantStatus(select) {
        const tenantId = select.dataset.platformTenantStatus;
        const status = select.value;
        try {
            await window.topGymAuth.api(`/api/platform/tenants/${tenantId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
            notify('تم تحديث حالة الجيم.', false, 'success');
            await loadAll();
        } catch (error) { notify(error.message || 'تعذر تحديث حالة الجيم.', true, 'error'); }
    }

    async function savePlan(button) {
        const id = button.dataset.planId;
        const values = {};
        document.querySelectorAll(`[data-plan-id="${id}"][data-plan-field]`).forEach((input) => {
            values[input.dataset.planField] = input.dataset.planField === 'billingPeriod' ? input.value : input.value === '' ? null : Number(input.value);
        });
        values.features = {};
        document.querySelectorAll(`[data-plan-id="${id}"][data-plan-feature]`).forEach((input) => { values.features[input.dataset.planFeature] = input.checked; });
        setButtonLoading(button, true);
        try {
            await window.topGymAuth.api(`/api/platform/plans/${id}`, { method: 'PATCH', body: JSON.stringify(values) });
            notify('تم حفظ إعدادات الباقة.', false, 'success');
            await loadAll();
        } catch (error) { notify(error.message || 'تعذر حفظ الباقة.', true, 'error'); }
        finally { setButtonLoading(button, false); }
    }

    function bind() {
        $('platformTenantForm')?.addEventListener('submit', handleCreateTenant);
        $('platformRefresh')?.addEventListener('click', () => void loadAll());
        $('platformRequestStatus')?.addEventListener('change', () => void loadRequests());
        $('platformSection')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-platform-action]');
            if (!button) return;
            if (button.dataset.platformAction === 'approve-request') void reviewRequest(button.dataset.requestId, 'approve');
            if (button.dataset.platformAction === 'reject-request') void reviewRequest(button.dataset.requestId, 'reject');
            if (button.dataset.platformAction === 'save-plan') void savePlan(button);
        });
        $('platformSection')?.addEventListener('change', (event) => {
            if (event.target.matches('[data-platform-tenant-status]')) void updateTenantStatus(event.target);
        });
    }

    bind();
    window.addEventListener('topgym:tab-changed', (event) => {
        if (event.detail?.name === 'platform' && !loaded) void loadAll();
    });
    if (document.documentElement.dataset.topGymActiveTab === 'platform') void loadAll();
})();
