'use strict';

(function () {
    const state = {
        user: null,
        view: 'dashboard',
        dashboard: null,
        tenants: { tenants: [], pagination: {} },
        plans: [],
        requests: [],
        requestPage: 1,
        requestPagination: {},
        gymRegistrationRequests: [],
        gymRegistrationPage: 1,
        gymRegistrationPagination: {},
        registrationCredentials: null,
        platformPaymentMethods: [],
        audit: [],
        profile: null,
        profileTab: 'overview',
        profilePaymentsPage: 1,
        tenantPage: 1,
        tenantFilters: { search: '', status: '', plan: '', tenantType: '', expiringDays: '0' },
        backupHealth: null,
        backups: [],
        backupAudit: []
    };

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const loginScreen = $('#platformAdminLoginScreen');
    const appShell = $('#platformAdminApp');
    const dialog = $('#platformActionDialog');
    const dialogForm = $('#platformActionForm');
    const registrationCredentialsDialog = $('#platformRegistrationCredentialsDialog');
    let toastTimer;
    let searchTimer;

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function formatDate(value, fallback = '—') {
        if (!value) return fallback;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? fallback : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(date);
    }

    function formatDateTime(value, fallback = '—') {
        if (!value) return fallback;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? fallback : new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }

    function formatMoney(value, currency = 'EGP') {
        return new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0)) + ` ${currency === 'EGP' ? 'ج.م' : currency}`;
    }

    function formatBytes(value) {
        const bytes = Number(value || 0);
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    function statusLabel(value) {
        return ({ active: 'نشط', trial: 'تجريبي', suspended: 'موقوف', expired: 'منتهي', archived: 'مؤرشف', cancelled: 'ملغي', pending: 'قيد المراجعة', approved: 'مقبول', rejected: 'مرفوض' })[String(value || '').toLowerCase()] || value || '—';
    }

    function tenantTypeLabel(value) {
        return ({ gym: 'جيم', independent_trainer: 'مدرب مستقل' })[String(value || '').toLowerCase()] || 'نوع غير معروف';
    }

    function statusPill(value) {
        const normalized = String(value || '').toLowerCase();
        return `<span class="status-pill ${escapeHtml(normalized)}">${escapeHtml(statusLabel(value))}</span>`;
    }

    function showToast(message, isError = false) {
        if (window.topGymFeedback) {
            window.topGymFeedback.toast(message, isError ? 'error' : 'success');
            return;
        }
        const element = $('#platformToast');
        element.textContent = message;
        element.classList.toggle('error', isError);
        element.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => element.classList.remove('show'), 3800);
    }

    const dialogValidationMessages = Object.freeze({
        name: 'اكتب اسم الجيم (حرفان على الأقل).',
        slug: 'اكتب معرفًا مختصرًا من حروف إنجليزية صغيرة وأرقام وشرطات فقط، مثل: fit-zone.',
        ownerName: 'اكتب اسم المالك بشكل صحيح.',
        ownerEmail: 'اكتب بريدًا إلكترونيًا صحيحًا للمالك.',
        ownerPassword: 'كلمة مرور المالك يجب ألا تقل عن 8 أحرف.'
    });

    const apiErrorMessages = Object.freeze({
        INVALID_TENANT_NAME: 'اسم الجيم غير صحيح. أدخل اسمًا من حرفين على الأقل.',
        INVALID_TENANT_SLUG: 'المعرف المختصر غير صحيح. استخدم حروفًا إنجليزية صغيرة وأرقامًا وشرطات فقط، ويجب أن يكون 3 أحرف على الأقل.',
        DUPLICATE_TENANT_SLUG: 'هذا المعرف المختصر مستخدم بالفعل. اختر معرفًا آخر.',
        DUPLICATE_TENANT_OWNER: 'البريد الإلكتروني للمالك مستخدم بالفعل. استخدم بريدًا آخر.',
        INVALID_NAME: 'الاسم غير صحيح. أدخل اسمًا من حرفين إلى 120 حرفًا.',
        INVALID_EMAIL: 'البريد الإلكتروني غير صحيح.',
        INVALID_PASSWORD: 'كلمة المرور يجب أن تكون بين 8 و128 حرفًا.',
        INVALID_PLAN_CODE: 'معرف الباقة غير صحيح. استخدم حروفًا إنجليزية صغيرة وأرقامًا وشرطات فقط.',
        DUPLICATE_PLAN_CODE: 'معرف الباقة مستخدم بالفعل. اختر معرفًا آخر.',
        INVALID_PLAN_NAME: 'اسم الباقة مطلوب.',
        INVALID_PLAN_PRICE: 'سعر الباقة غير صحيح.',
        INVALID_PLAN_PERIOD: 'دورة الفوترة غير صحيحة.',
        INVALID_PLAN_CURRENCY: 'عملة الباقة يجب أن تكون رمزًا من 3 أحرف.',
        LAST_ACTIVE_PLAN: 'لا يمكن إيقاف آخر باقة مفعّلة؛ اترك باقة واحدة متاحة على الأقل.',
        REASON_REQUIRED: 'سبب هذا الإجراء مطلوب.',
        TRIAL_PLAN_NOT_FOUND: 'باقة التجربة غير متاحة حاليًا. راجع باقات المنصة ثم حاول مرة أخرى.',
        SAAS_REQUEST_PLAN_INVALID: 'بيانات الباقة المرتبطة بالطلب غير صالحة. راجع الباقة أو أنشئ طلب الاشتراك مرة أخرى.',
        AUTH_SERVICE_REQUIRED: 'خدمة الحسابات غير متاحة حاليًا. أعد المحاولة بعد قليل.',
        INVALID_PAYMENT_METHOD_CODE: 'المعرّف الداخلي لوسيلة الدفع غير صحيح. استخدم حروفًا إنجليزية صغيرة وأرقامًا وشرطة فقط.',
        PAYMENT_METHOD_DETAILS_REQUIRED: 'اسم وسيلة الدفع والرقم أو الحساب مطلوبان.',
        DUPLICATE_PAYMENT_METHOD_CODE: 'هذا المعرّف مستخدم بالفعل. اختر معرّفًا آخر.',
        PAYMENT_METHOD_NOT_FOUND: 'وسيلة الدفع المطلوبة غير موجودة أو تم حذفها.'
    });

    function clearDialogError() {
        const element = $('#platformDialogError');
        if (element) {
            element.textContent = '';
            element.hidden = true;
            delete element.dataset.code;
        }
        $$('[aria-invalid="true"]', dialogForm).forEach((field) => field.removeAttribute('aria-invalid'));
    }

    function showDialogError(message, code = '', field = '') {
        const element = $('#platformDialogError');
        if (!element) return;
        element.textContent = message || 'راجع البيانات وحاول مرة أخرى.';
        element.hidden = false;
        if (code) element.dataset.code = code;
        $$('[aria-invalid="true"]', dialogForm).forEach((input) => input.removeAttribute('aria-invalid'));
        const invalidField = field ? dialogForm.elements.namedItem(field) : null;
        if (invalidField && typeof invalidField.setAttribute === 'function') invalidField.setAttribute('aria-invalid', 'true');
    }

    function getApiErrorMessage(error) {
        if (error?.code && apiErrorMessages[error.code]) return apiErrorMessages[error.code];
        if (Number(error?.status) >= 500) return 'تعذر إتمام العملية بسبب مشكلة في الخادم. لم يتم حفظ أي بيانات؛ حاول مرة أخرى، وإذا استمر الخطأ راجع سجلات الخادم.';
        return error?.message || 'تعذر تنفيذ العملية. راجع البيانات وحاول مرة أخرى.';
    }

    function validateDialogForm() {
        if (dialogForm.checkValidity()) return true;
        const invalidField = dialogForm.querySelector(':invalid');
        const message = dialogValidationMessages[invalidField?.name] || 'راجع الحقول المطلوبة والبيانات المدخلة.';
        showDialogError(message, 'CLIENT_VALIDATION', invalidField?.name || '');
        invalidField?.focus();
        dialogForm.reportValidity();
        return false;
    }

    async function api(path, options = {}) {
        const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
        const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
        if (response.status === 204) return null;
        const raw = await response.text();
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (_) { data = null; }
        if (!response.ok) {
            const error = new Error(data?.error || 'حدث خطأ أثناء تنفيذ الطلب.');
            error.status = response.status;
            error.code = data?.code || null;
            error.field = data?.field || null;
            error.payload = data;
            throw error;
        }
        return data;
    }

    function setLoading(element, loading, loadingText = '') {
        if (!element) return;
        if (window.topGymFeedback) {
            if (loading) window.topGymFeedback.start(element, loadingText ? { loadingText } : {});
            else window.topGymFeedback.stop(element);
            return;
        }
        element.disabled = loading;
        element.dataset.loading = loading ? 'true' : 'false';
    }

    function showLogin(message = '') {
        loginScreen.hidden = false;
        appShell.hidden = true;
        const messageElement = $('#platformAdminLoginMessage');
        messageElement.textContent = message;
        messageElement.hidden = !message;
        $('#platformAdminEmail').focus();
    }

    function showApp(user) {
        state.user = user;
        $('#platformAdminName').textContent = user.name || user.email || 'Platform Admin';
        loginScreen.hidden = true;
        appShell.hidden = false;
    }

    function setTheme(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = next;
        try { localStorage.setItem('topgym-theme', next); } catch (_) { /* storage is optional */ }
        [$('#platformThemeToggle'), $('#platformLoginThemeToggle')].filter(Boolean).forEach((toggle) => {
            toggle.setAttribute('aria-label', next === 'dark' ? 'تفعيل المظهر الفاتح' : 'تفعيل المظهر الداكن');
            toggle.setAttribute('title', next === 'dark' ? 'تفعيل المظهر الفاتح' : 'تفعيل المظهر الداكن');
        });
    }

    function initializeTheme() {
        const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        setTheme(current);
        [$('#platformThemeToggle'), $('#platformLoginThemeToggle')].filter(Boolean).forEach((toggle) => {
            toggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
        });
    }

    function setView(view) {
        state.view = view;
        $$('[data-platform-view]').forEach((button) => button.classList.toggle('active', button.dataset.platformView === view));
        $$('[data-platform-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.platformPanel === view));
        const titles = { dashboard: 'لوحة المنصة', gyms: 'الجيمات', requests: 'طلبات الاشتراك', 'gym-registrations': 'طلبات الانضمام', 'payment-methods': 'وسائل دفع Logic Fit', backups: 'النسخ والتعافي', plans: 'الباقات', audit: 'سجل المنصة', settings: 'إعدادات المنصة' };
        $('#platformPageTitle').textContent = titles[view] || 'إدارة المنصة';
        $('.platform-sidebar')?.classList.remove('open');
        if (view === 'dashboard') loadDashboard();
        if (view === 'gyms') loadTenants();
        if (view === 'requests') loadRequests();
        if (view === 'gym-registrations') loadGymRegistrations();
        if (view === 'payment-methods') loadPlatformPaymentMethods();
        if (view === 'backups') loadBackups();
        if (view === 'plans') loadPlans();
        if (view === 'audit') loadAudit();
    }

    function renderKpis(metrics) {
        const gyms = metrics.gyms || {};
        const items = [
            ['إجمالي الجيمات', gyms.total, 'كل الجيمات المسجلة', '▦', ''],
            ['الجيمات النشطة', gyms.active, 'تعمل الآن', '✓', 'kpi-success'],
            ['جيمات تجريبية', gyms.trial, 'في فترة التجربة', '◌', 'kpi-info'],
            ['طلبات قيد المراجعة', metrics.pendingRequests, 'تحتاج إلى إجراء', '◷', 'kpi-warning'],
            ['تنتهي قريبًا', metrics.expiringSubscriptions, 'خلال 30 يومًا', '!', 'kpi-danger'],
            ['إجمالي المشتركين', metrics.members, 'في كل الجيمات', '◉', ''],
            ['مستخدمو النظام', metrics.users, 'الملاك والمساعدون', '◎', ''],
            ['استخدام AI', metrics.aiGenerations, 'هذا الشهر', '✦', 'kpi-info'],
            ['التخزين', formatBytes(metrics.storageBytes), 'ملفات المنصة والجيمات', '▤', 'kpi-warning'],
            ['جيمات جديدة', metrics.newGyms, 'خلال الفترة المحددة', '+', 'kpi-success']
        ];
        $('#platformKpis').innerHTML = items.map(([label, value, caption, icon, className]) => `<article class="platform-kpi ${className}"><div class="platform-kpi-top"><span class="platform-kpi-label">${escapeHtml(label)}</span><span class="platform-kpi-icon">${escapeHtml(icon)}</span></div><strong class="platform-kpi-value">${escapeHtml(value)}</strong><small class="platform-kpi-caption">${escapeHtml(caption)}</small></article>`).join('');
        $('#navGymsCount').textContent = gyms.total || 0;
        $('#navRequestsCount').textContent = metrics.pendingRequests || 0;
    }

    function renderDashboard(data) {
        state.dashboard = data;
        renderKpis(data.metrics || {});
        const gyms = data.metrics?.gyms || {};
        const statusItems = [['active', gyms.active], ['trial', gyms.trial], ['suspended', gyms.suspended], ['expired', gyms.expired], ['archived', gyms.archived]];
        $('#platformStatusGrid').innerHTML = statusItems.map(([status, count]) => `<div class="status-tile ${status}"><strong>${Number(count || 0)}</strong><span>${escapeHtml(statusLabel(status))}</span></div>`).join('');
        const recent = data.recentGyms || [];
        $('#recentTenants').innerHTML = recent.length ? recent.map((tenant) => `<button class="mini-tenant" type="button" data-open-tenant="${tenant.id}"><span class="mini-tenant-main"><strong>${escapeHtml(tenant.name)}</strong><small>${escapeHtml(tenantTypeLabel(tenant.tenantType))} · ${escapeHtml(tenant.slug)} · ${escapeHtml(tenant.owner?.name || 'بدون مالك')}</small></span>${statusPill(tenant.status)}</button>`).join('') : '<div class="empty-inline">لا توجد جيمات مضافة بعد.</div>';
        const activity = data.recentActivity || [];
        $('#recentActivity').innerHTML = activity.length ? activity.map((item) => `<div class="mini-activity"><span class="mini-activity-main"><strong>${escapeHtml(item.action || 'عملية')}</strong><small>${escapeHtml(item.actorName || 'النظام')} · ${escapeHtml(item.details || '')}</small></span><small>${escapeHtml(formatDateTime(item.createdAt))}</small></div>`).join('') : '<div class="empty-inline">لا توجد عمليات مسجلة.</div>';
    }

    async function loadDashboard() {
        try { renderDashboard(await api('/api/platform-admin/dashboard')); } catch (error) { showToast(error.message, true); }
    }

    function tenantUsageCell(tenant) {
        const members = Number(tenant.usage?.members || 0);
        const users = Number(tenant.usage?.users || 0);
        return `<span class="usage-cell"><small>${members} مشترك · ${users} مستخدم</small><span class="usage-bar"><i style="width:${Math.min(100, members ? 100 : 0)}%"></i></span></span>`;
    }

    function renderTenants(data) {
        state.tenants = data;
        const rows = data.tenants || [];
        $('#tenantsTableBody').innerHTML = rows.length ? rows.map((tenant) => `<tr><td><span class="tenant-cell"><strong>${escapeHtml(tenant.name)}</strong><small>${escapeHtml(tenant.slug)} · #${tenant.id}</small></span></td><td><span class="tenant-type-pill ${escapeHtml(tenant.tenantType || '')}">${escapeHtml(tenantTypeLabel(tenant.tenantType))}</span></td><td><span class="owner-cell"><strong>${escapeHtml(tenant.owner?.name || '—')}</strong><small>${escapeHtml(tenant.owner?.email || '—')}</small></span></td><td>${escapeHtml(tenant.subscription?.plan?.name || '—')}</td><td>${statusPill(tenant.status)}</td><td><span>${escapeHtml(statusLabel(tenant.subscription?.status))}</span><small class="table-secondary">${escapeHtml(tenant.subscription?.expiresAt ? `${tenant.subscription.daysRemaining ?? 0} يوم` : 'بدون انتهاء')}</small></td><td>${tenantUsageCell(tenant)}</td><td>${escapeHtml(formatDateTime(tenant.lastActivityAt))}</td><td><button class="table-action" type="button" data-open-tenant="${tenant.id}">فتح الملف</button></td></tr>`).join('') : '<tr><td colspan="9"><div class="empty-inline">لا توجد نتائج مطابقة.</div></td></tr>';
        const total = Number(data.pagination?.total || 0);
        const page = Number(data.pagination?.page || 1);
        const pages = Number(data.pagination?.pages || 1);
        $('#tenantResultsSummary').textContent = total ? `عرض ${rows.length} من ${total} عميل منصة` : 'لا توجد نتائج';
        $('#tenantPagination').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, index) => index + 1).map((number) => `<button type="button" class="${number === page ? 'active' : ''}" data-tenant-page="${number}">${number}</button>`).join('') : '';
    }

    function updatePlanFilter() {
        const select = $('#tenantPlanFilter');
        const selected = state.tenantFilters.plan;
        select.innerHTML = '<option value="">كل الباقات</option>' + state.plans.map((plan) => `<option value="${escapeHtml(plan.code)}">${escapeHtml(plan.name)}</option>`).join('');
        select.value = selected;
    }

    async function loadTenants() {
        const params = new URLSearchParams({ page: state.tenantPage, pageSize: 20 });
        Object.entries(state.tenantFilters).forEach(([key, value]) => { if (value) params.set(key, value); });
        try { renderTenants(await api(`/api/platform-admin/tenants?${params}`)); } catch (error) { showToast(error.message, true); }
    }

    function profileActionButton(label, action, className = 'ghost') {
        return `<button class="platform-btn ${className}" type="button" data-profile-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
    }

    function renderProfile(profile) {
        state.profile = profile;
        const tenant = profile.tenant || {};
        const subscription = profile.subscription;
        const stats = profile.stats || {};
        const health = profile.health || {};
        const plan = subscription?.plan;
        const actions = tenant.status === 'suspended' ? profileActionButton('إعادة التفعيل', 'activate', 'primary') : tenant.status === 'archived' ? profileActionButton('استعادة الجيم', 'restore', 'primary') : profileActionButton('إيقاف الجيم', 'suspend', 'danger');
        $('#tenantProfile').innerHTML = `<div class="profile-head"><div class="profile-heading"><span class="profile-logo">ج</span><div><h2>${escapeHtml(tenant.name)}</h2><p>${escapeHtml(tenantTypeLabel(tenant.tenantType))} · ${escapeHtml(tenant.slug)} · معرف الجيم #${tenant.id}</p><div class="profile-status-line">${statusPill(tenant.status)}<span class="table-secondary">${escapeHtml(tenant.contactEmail || 'لا يوجد بريد اتصال')}</span></div></div></div><div class="profile-actions"><button class="platform-btn ghost" type="button" data-profile-action="back">← كل الجيمات</button>${actions}${profileActionButton('الاشتراك', 'subscription')}${profileActionButton('تغيير الباقة', 'plan')}${profileActionButton('تمديد', 'extend', 'primary')}<button class="platform-btn ghost" type="button" data-profile-action="more">المزيد</button></div></div><div class="profile-tabs" role="tablist">${[['overview','نظرة عامة'],['subscription','الاشتراك'],['usage','الاستخدام والحدود'],['users','المالك والمستخدمون'],['data','بيانات الجيم'],['payments','المدفوعات'],['health','الحالة الفنية'],['backups','النسخ الاحتياطي'],['audit','سجل العمليات'],['notes','ملاحظات داخلية']].map(([id,label]) => `<button class="profile-tab ${state.profileTab === id ? 'active' : ''}" type="button" data-profile-tab="${id}">${label}</button>`).join('')}</div><div class="profile-panel-wrap">${profileOverviewPanel(profile)}${profileSubscriptionPanel(profile)}${profileUsagePanel(profile)}${profileUsersPanel(profile)}${profileDataPanel(profile)}${profilePaymentsPanel(profile)}${profileHealthPanel(profile)}${profileBackupsPanel(profile)}${profileAuditPanel(profile)}${profileNotesPanel(profile)}</div>`;
        $('#tenantDirectory').hidden = true;
        $('.platform-view[data-platform-panel="gyms"] > .platform-page-head').hidden = true;
        $('#tenantProfile').hidden = false;
        activateProfileTab(state.profileTab);
        renderProfilePaymentsPagination(profile);
    }

    function profilePanel(id, content) { return `<section class="profile-panel" data-profile-panel="${id}">${content}</section>`; }

    function stat(label, value) { return `<div class="profile-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }

    function detailRows(rows) { return `<div class="detail-list">${rows.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value ?? '—')}</b></div>`).join('')}</div>`; }

    function profileOverviewPanel(profile) {
        const tenant = profile.tenant || {};
        const sub = profile.subscription;
        const stats = profile.stats || {};
        return profilePanel('overview', `<div class="profile-grid">${stat('المشتركون', stats.members ?? 0)}${stat('عضويات نشطة', stats.activeMemberships ?? 0)}${stat('حضور اليوم', stats.attendanceToday ?? 0)}${stat('إيراد الشهر', formatMoney(stats.revenueMonth ?? 0))}</div><div class="profile-section-grid"><article class="profile-section"><h3>بيانات الجيم</h3>${detailRows([['نوع العميل', tenantTypeLabel(tenant.tenantType)],['معرف الجيم', tenant.id],['المعرف المختصر', tenant.slug],['الحالة', statusLabel(tenant.status)],['تاريخ الإنشاء', formatDate(tenant.createdAt)],['آخر تحديث', formatDateTime(tenant.updatedAt)],['هاتف الاتصال', tenant.contactPhone]])}</article><article class="profile-section"><h3>المالك والاشتراك</h3>${detailRows([['المالك', tenant.owner?.name],['البريد', tenant.owner?.email],['آخر دخول', formatDateTime(tenant.owner?.lastLoginAt)],['الباقة', sub?.plan?.name],['حالة الاشتراك', statusLabel(sub?.status)],['ينتهي في', sub?.expiresAt ? `${formatDate(sub.expiresAt)} (${sub.daysRemaining} يوم)` : 'مدى الحياة']])}</article></div>`);
    }

    function profileSubscriptionPanel(profile) {
        const sub = profile.subscription;
        const changes = profile.scheduledChanges || [];
        const plan = sub?.plan;
        return profilePanel('subscription', `<div class="profile-grid">${stat('الباقة الحالية', plan?.name || '—')}${stat('الحالة', statusLabel(sub?.status))}${stat('الأيام المتبقية', sub?.daysRemaining ?? '∞')}${stat('السعر المثبت', formatMoney(sub?.priceSnapshot ?? plan?.price ?? 0, sub?.currencySnapshot || plan?.currency))}</div><div class="profile-section-grid"><article class="profile-section"><h3>تفاصيل الاشتراك</h3>${detailRows([['البداية', formatDate(sub?.startsAt)],['النهاية', sub?.expiresAt ? formatDate(sub.expiresAt) : 'مدى الحياة'],['المصدر', sub?.source],['التجديد', sub?.renewalStatus],['ملاحظات', sub?.notes]])}<div class="profile-actions" style="margin-top:16px">${profileActionButton('تفعيل / تحويل التجربة إلى مدفوع','subscription')}${profileActionButton('منح اشتراك مدى الحياة','lifetime')}${profileActionButton('إيقاف الاشتراك','subscription-suspend','danger')}</div></article><article class="profile-section"><h3>تغييرات مجدولة</h3>${changes.length ? `<div class="note-list">${changes.map((change) => `<div class="note-item"><p>${escapeHtml(change.plan?.name)} · ${escapeHtml(statusLabel(change.status))}</p><small>${escapeHtml(formatDate(change.effectiveAt))} · ${escapeHtml(change.reason)}</small></div>`).join('')}</div>` : '<div class="empty-inline">لا توجد تغييرات مجدولة.</div>'}</article></div>`);
    }

    function profileUsagePanel(profile) {
        const usage = profile.tenant?.usage || {};
        const entitlements = profile.entitlements || {};
        const rows = usage.rows || [];
        const featureNames = { intelligence: 'الذكاء التشغيلي', coaching: 'التدريب والتغذية', store: 'المتجر', reports: 'التقارير', portal: 'بوابة المشترك', prioritySupport: 'دعم بأولوية' };
        return profilePanel('usage', `<div class="profile-section-grid"><article class="profile-section"><h3>الاستهلاك مقابل الحدود</h3><div class="limit-list">${rows.map((row) => `<div class="limit-row ${row.percent >= 100 ? 'reached' : row.percent >= 80 ? 'near' : ''}"><div class="limit-row-head"><span>${escapeHtml(row.label)}</span><b>${escapeHtml(row.key === 'storage' ? formatBytes(row.used) : row.used)} / ${escapeHtml(row.max == null ? '∞' : row.key === 'storage' ? formatBytes(row.max) : row.max)}</b></div><span class="progress-track"><i style="width:${row.percent}%"></i></span></div>`).join('')}</div></article><article class="profile-section"><div class="card-heading"><h3>المزايا الفعالة</h3>${profileActionButton('إضافة Override','override')}</div><div class="feature-list">${Object.entries(featureNames).map(([key,label]) => `<span class="feature-chip ${entitlements.features?.[key] === false ? 'off' : ''}">${entitlements.features?.[key] === false ? '×' : '✓'} ${escapeHtml(label)}</span>`).join('')}</div><div style="margin-top:18px">${detailRows([['الباقة الأساسية', entitlements.plan?.name || profile.subscription?.plan?.name],['استثناءات مخصصة', entitlements.overrides ? 'مفعلة' : 'لا توجد'],['ملاحظات الاستثناء', entitlements.overrides?.notes || '—']])}</div></article></div>`);
    }

    function profileUsersPanel(profile) {
        const users = profile.users || [];
        return profilePanel('users', `<div class="profile-section profile-wide"><div class="card-heading"><div><h3>المالك والمستخدمون</h3><p>يمكن تعطيل حساب مستخدم أو إبطال جلساته دون تعديل بيانات الجيم التشغيلية.</p></div>${profileActionButton('تغيير / إضافة مالك','owner','primary')}</div><div class="table-scroll"><table class="profile-table"><thead><tr><th>المستخدم</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th>إجراء</th></tr></thead><tbody>${users.length ? users.map((user) => `<tr><td><strong>${escapeHtml(user.name)}</strong><br><small>${escapeHtml(user.email)}</small></td><td>${escapeHtml(user.role === 'Owner' ? 'مالك' : user.role === 'Assistant' ? 'مساعد' : user.role)}</td><td>${statusPill(user.status === 'active' ? 'active' : user.status)}</td><td>${escapeHtml(formatDateTime(user.lastLoginAt))}</td><td><button class="table-action" type="button" data-user-action="${user.status === 'Disabled' ? 'enable' : 'disable'}" data-user-id="${user.id}">${user.status === 'Disabled' ? 'تفعيل' : 'تعطيل'}</button> <button class="table-action" type="button" data-user-action="reset" data-user-id="${user.id}">إعادة تعيين كلمة المرور</button></td></tr>`).join('') : '<tr><td colspan="5">لا يوجد مستخدمون.</td></tr>'}</tbody></table></div></div>`);
    }

    function profileDataPanel(profile) {
        const stats = profile.stats || {};
        return profilePanel('data', `<div class="profile-grid">${stat('إجمالي المشتركين', stats.members ?? 0)}${stat('عضويات منتهية', stats.expiredMemberships ?? 0)}${stat('حضور الشهر', stats.attendanceMonth ?? 0)}${stat('مصروفات الشهر', formatMoney(stats.expensesMonth ?? 0))}${stat('مبيعات المتجر', stats.storeSalesMonth ?? 0)}${stat('المنتجات', stats.products ?? 0)}${stat('برامج التدريب', stats.workoutPrograms ?? 0)}${stat('خطط التغذية', stats.dietPlans ?? 0)}</div><div class="profile-section-grid"><article class="profile-section"><h3>ملخص مالي</h3>${detailRows([['إيراد الشهر', formatMoney(stats.revenueMonth)],['مصروفات الشهر', formatMoney(stats.expensesMonth)],['صافي تقريبي', formatMoney(Number(stats.revenueMonth || 0) - Number(stats.expensesMonth || 0))]])}</article><article class="profile-section"><h3>نشاط البوابة</h3>${detailRows([['تقييمات المشتركين', stats.portalFeedback],['حضور اليوم', stats.attendanceToday],['حضور الشهر', stats.attendanceMonth]])}</article></div>`);
    }

    function profilePaymentsPanel(profile) {
        const requests = profile.payments || [];
        return profilePanel('payments', `<div class="profile-section profile-wide"><h3>طلبات الاشتراك وإثباتات الدفع</h3><div class="table-scroll"><table class="profile-table"><thead><tr><th>الباقة</th><th>المبلغ</th><th>الحالة</th><th>الإثبات</th><th>التاريخ</th><th></th></tr></thead><tbody>${requests.length ? requests.map((request) => `<tr><td>${escapeHtml(request.plan?.name || '—')}</td><td>${escapeHtml(formatMoney(request.amount, request.currency))}</td><td>${statusPill(request.status)}</td><td>${request.proof ? `<a class="table-action" target="_blank" rel="noreferrer" href="/api/platform-admin/payment-proofs/${request.proof.id}/file">معاينة آمنة</a><br><small>${escapeHtml(request.proof.fileName)}</small>` : '—'}</td><td>${escapeHtml(formatDate(request.createdAt))}</td><td>${request.status === 'pending' ? `<button class="table-action" type="button" data-request-action="approve" data-request-id="${request.id}">قبول</button> <button class="table-action" type="button" data-request-action="reject" data-request-id="${request.id}">رفض</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6">لا توجد طلبات اشتراك.</td></tr>'}</tbody></table></div></div>`);
    }

    function renderProfilePaymentsPagination(profile) {
        const panel = $('#tenantProfile [data-profile-panel="payments"]');
        if (!panel) return;
        let footer = panel.querySelector('.profile-payments-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'directory-footer profile-payments-footer';
            footer.innerHTML = '<span id="profilePaymentsSummary" class="table-summary"></span><div id="profilePaymentsPagination" class="pagination" aria-label="Tenant payment history pagination"></div>';
            (panel.querySelector('.profile-section') || panel).appendChild(footer);
        }
        const pagination = profile.paymentsPagination || {};
        const total = Number(pagination.total || 0);
        const page = Number(pagination.page || state.profilePaymentsPage || 1);
        const pages = Number(pagination.pages || 1);
        $('#profilePaymentsSummary').textContent = total ? `عرض ${(profile.payments || []).length} من ${total} طلب` : 'لا توجد طلبات';
        $('#profilePaymentsPagination').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, index) => index + 1).map((number) => `<button type="button" class="${number === page ? 'active' : ''}" data-profile-payments-page="${number}">${number}</button>`).join('') : '';
    }

    function profileHealthPanel(profile) {
        const health = profile.health || {};
        const accessDetails = detailRows([
            ['قاعدة البيانات', health.database?.status],
            ['عزل البيانات RLS', health.rls?.status],
            ['سياسات العزل', `${health.rls?.enabled || 0} / ${health.rls?.policies || 0}`],
            ['آخر طلب ناجح', formatDateTime(health.lastSuccessfulRequest)],
            ['آخر دخول', formatDateTime(health.lastLogin)]
        ]);
        const assetDetails = detailRows([
            ['آخر نسخة احتياطية', formatDateTime(health.lastBackup)],
            ['التخزين', `${formatBytes(health.storage?.usedBytes)} / ${health.storage?.maxBytes ? formatBytes(health.storage.maxBytes) : '∞'}`],
            ['الذكاء الاصطناعي', `${health.ai?.used || 0} / ${health.ai?.max ?? '∞'}`],
            ['حالة التخزين', health.storage?.status],
            ['حالة الذكاء الاصطناعي', health.ai?.status]
        ]);
        return profilePanel('health', `<div class="profile-grid">${stat('قاعدة البيانات', health.database?.status || '—')}${stat('عزل البيانات', health.rls?.status || '—')}${stat('تطبيق الاشتراك', health.subscriptionEnforcement?.status || '—')}${stat('أخطاء 24 ساعة', health.errorsLast24Hours ?? 0)}</div><div class="profile-section-grid"><article class="profile-section"><h3>صحة الوصول والبنية</h3>${accessDetails}</article><article class="profile-section"><h3>التخزين والنسخ والذكاء</h3>${assetDetails}</article></div>`);
    }

    function profileAuditPanel(profile) {
        const audit = profile.audit || [];
        return profilePanel('audit', `<div class="profile-section profile-wide"><h3>سجل الجيم</h3><div class="audit-list">${audit.length ? audit.map((item) => `<div class="audit-item"><p>${escapeHtml(item.action)} · ${escapeHtml(item.details)}</p><small>${escapeHtml(item.actorName || 'النظام')} · ${escapeHtml(formatDateTime(item.createdAt))}${item.reason ? ` · السبب: ${escapeHtml(item.reason)}` : ''}</small></div>`).join('') : '<div class="empty-inline">لا توجد عمليات مسجلة.</div>'}</div></div>`);
    }

    function profileBackupsPanel(profile) {
        const backups = profile.backups || [];
        const audit = profile.backupAudit || [];
        const latest = backups.find((item) => item.status === 'VERIFIED') || backups[0];
        const tableRows = backups.length ? backups.map((backup) => `<tr><td>${escapeHtml(backupTypeLabel(backup.backupType))}</td><td>${backupStatusPill(backup.status)}</td><td>${escapeHtml(formatDate(backup.backupDay))}</td><td>${escapeHtml(backup.sizeBytes == null ? '—' : formatBytes(backup.sizeBytes))}</td><td>${escapeHtml(formatDateTime(backup.verifiedAt))}</td><td>${backup.status === 'VERIFIED' ? `<a class="table-action" href="/api/platform-admin/tenants/${encodeURIComponent(profile.tenant.id)}/backups/${encodeURIComponent(backup.id)}/download">تنزيل</a>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-inline">لا توجد نسخ احتياطية لهذا الجيم بعد.</div></td></tr>';
        const auditRows = audit.length ? audit.map((item) => `<div class="audit-item"><p>${escapeHtml(item.eventType || 'عملية نسخ')} · ${escapeHtml(item.result || '')}</p><small>${escapeHtml(item.reason || 'بدون سبب مسجل')} · ${escapeHtml(formatDateTime(item.createdAt))}</small></div>`).join('') : '<div class="empty-inline">لا توجد عمليات نسخ مسجلة.</div>';
        return profilePanel('backups', `<div class="profile-section-grid"><article class="profile-section"><div class="card-heading"><div><span class="eyebrow">Tenant Backup</span><h3>حالة النسخ</h3></div><button class="platform-btn primary" type="button" data-profile-action="tenant-backup">إنشاء نسخة الآن</button></div>${detailRows([['آخر نسخة تم التحقق منها', latest ? formatDateTime(latest.verifiedAt || latest.createdAt) : 'لا توجد'],['الحالة', latest ? statusLabel(latest.status) : 'لم تبدأ'],['الحجم', latest?.sizeBytes == null ? '—' : formatBytes(latest.sizeBytes)],['تنتهي في', latest ? formatDate(latest.expiresAt) : '—']])}<p class="profile-section-note">النسخ خاصة بهذا الجيم فقط، ولا يمكنها قراءة بيانات أي Tenant آخر.</p></article><article class="profile-section"><div class="card-heading"><div><span class="eyebrow">Recovery policy</span><h3>قواعد التعافي</h3></div></div>${detailRows([['النسخ اليومية','مفعلة للجيمات التجريبية والنشطة'],['التحقق','Checksum + manifest قبل الاعتماد'],['الاستعادة','Owner فقط مع نسخة أمان قبل التنفيذ'],['التخزين','خاص؛ لا توجد روابط عامة']])}</article></div><article class="profile-section profile-wide backup-table-card"><div class="card-heading"><div><span class="eyebrow">History</span><h3>سجل نسخ الجيم</h3></div></div><div class="table-scroll"><table class="profile-table"><thead><tr><th>النوع</th><th>الحالة</th><th>اليوم</th><th>الحجم</th><th>آخر تحقق</th><th>الإجراء</th></tr></thead><tbody>${tableRows}</tbody></table></div></article><article class="profile-section profile-wide"><div class="card-heading"><div><span class="eyebrow">Audit</span><h3>سجل عمليات النسخ</h3></div></div><div class="audit-list">${auditRows}</div></article>`);
    }

    function profileNotesPanel(profile) {
        const notes = profile.notes || [];
        return profilePanel('notes', `<div class="profile-section profile-wide"><div class="card-heading"><h3>ملاحظات داخلية</h3>${profileActionButton('+ إضافة ملاحظة','add-note','primary')}</div><div class="note-list">${notes.length ? notes.map((note) => `<div class="note-item"><p>${escapeHtml(note.note)}</p><small>${escapeHtml(note.createdByName || 'Platform Admin')} · ${escapeHtml(formatDateTime(note.createdAt))}</small></div>`).join('') : '<div class="empty-inline">لا توجد ملاحظات داخلية.</div>'}</div></div>`);
    }

    function activateProfileTab(tab) {
        state.profileTab = tab;
        $$('[data-profile-tab]').forEach((button) => button.classList.toggle('active', button.dataset.profileTab === tab));
        $$('[data-profile-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.profilePanel === tab));
    }

    async function openTenant(id, { resetTab = true, paymentsPage = state.profilePaymentsPage } = {}) {
        try {
            if (resetTab) {
                state.profileTab = 'overview';
                state.profilePaymentsPage = 1;
            } else {
                state.profilePaymentsPage = Number(paymentsPage) || 1;
            }
            const params = new URLSearchParams({ paymentsPage: state.profilePaymentsPage, paymentsPageSize: 25 });
            const [profileResult, backupsResult] = await Promise.allSettled([
                api(`/api/platform-admin/tenants/${id}?${params}`),
                api(`/api/platform-admin/tenants/${id}/backups?limit=100&auditLimit=100`)
            ]);
            if (profileResult.status === 'rejected') throw profileResult.reason;
            const backupData = backupsResult.status === 'fulfilled' ? backupsResult.value : { backups: [], audit: [] };
            renderProfile({ ...profileResult.value, backups: backupData.backups || [], backupAudit: backupData.audit || [] });
        } catch (error) { showToast(error.message, true); }
    }

    function closeProfile() {
        state.profile = null;
        $('#tenantProfile').hidden = true;
        $('#tenantDirectory').hidden = false;
        $('.platform-view[data-platform-panel="gyms"] > .platform-page-head').hidden = false;
    }

    async function loadRequests() {
        const status = $('#requestStatusFilter')?.value || '';
        const params = new URLSearchParams({ page: state.requestPage, pageSize: 25 });
        if (status) params.set('status', status);
        try { const data = await api(`/api/platform-admin/subscription-requests?${params}`); state.requests = data.requests || []; state.requestPagination = data.pagination || {}; renderRequests(); renderRequestPagination(); } catch (error) { showToast(error.message, true); }
    }

    function renderRequests() {
        $('#requestsTableBody').innerHTML = state.requests.length ? state.requests.map((request) => `<tr><td><span class="tenant-cell"><strong>${escapeHtml(request.tenantName || '—')}</strong><small>${escapeHtml(request.tenantSlug || '')}</small></span></td><td><span class="tenant-type-pill ${escapeHtml(request.tenantType || '')}">${escapeHtml(tenantTypeLabel(request.tenantType))}</span></td><td>${escapeHtml(request.plan?.name || '—')}</td><td>${escapeHtml(formatMoney(request.amount, request.currency))}</td><td>${request.proof ? `<a class="table-action" target="_blank" rel="noreferrer" href="/api/platform-admin/payment-proofs/${request.proof.id}/file">معاينة</a>` : 'لم يرفع'}</td><td>${statusPill(request.status)}</td><td>${escapeHtml(formatDate(request.createdAt))}</td><td>${request.status === 'pending' ? `<button class="table-action" data-request-action="approve" data-request-id="${request.id}" type="button">قبول</button> <button class="table-action" data-request-action="reject" data-request-id="${request.id}" type="button">رفض</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="8"><div class="empty-inline">لا توجد طلبات.</div></td></tr>';
    }

    function renderRequestPagination() {
        const summary = $('#requestResultsSummary');
        const host = $('#requestPagination');
        if (!summary || !host) return;
        const pagination = state.requestPagination || {};
        const total = Number(pagination.total || 0);
        const page = Number(pagination.page || state.requestPage || 1);
        const pages = Number(pagination.pages || 1);
        summary.textContent = total ? `عرض ${state.requests.length} من ${total} طلب` : 'لا توجد نتائج';
        host.innerHTML = pages > 1 ? Array.from({ length: pages }, (_, index) => index + 1).map((number) => `<button type="button" class="${number === page ? 'active' : ''}" data-request-page="${number}">${number}</button>`).join('') : '';
    }

    function registrationTermLabel(term) {
        const months = Number(term?.durationMonths || 0);
        return months === 1 ? 'شهري' : months === 3 ? '3 أشهر' : months === 6 ? '6 أشهر' : months === 12 ? 'سنوي' : `${months} شهر`;
    }

    function renderGymRegistrations(data) {
        state.gymRegistrationRequests = data?.requests || [];
        state.gymRegistrationPagination = data?.pagination || {};
        $('#navGymRegistrationCount').textContent = Number(data?.pendingCount ?? state.gymRegistrationRequests.filter((item) => item.status === 'pending').length);
        const rows = state.gymRegistrationRequests;
        $('#gymRegistrationTableBody').innerHTML = rows.length ? rows.map((request) => {
            const proof = request.proof;
            const amount = request.pricing?.amountDue ?? 0;
            const proofCell = proof
                ? `<a class="table-action" target="_blank" rel="noopener noreferrer" href="/api/platform-admin/gym-registration-requests/proofs/${encodeURIComponent(proof.id)}/file">معاينة</a><small class="table-secondary">${proof.verified ? 'تم التحقق' : 'غير مكتمل'}</small>`
                : '<span class="table-secondary">لم يرفع</span>';
            const actions = request.status === 'pending'
                ? `<button class="table-action" type="button" data-gym-registration-action="approve" data-gym-registration-id="${request.id}">اعتماد</button> <button class="table-action danger-text" type="button" data-gym-registration-action="reject" data-gym-registration-id="${request.id}">رفض</button>`
                : '<span class="table-secondary">—</span>';
            return `<tr><td><span class="tenant-cell"><strong>${escapeHtml(request.gymName)}</strong><small>${escapeHtml(request.city || 'الموقع غير محدد')} · #${escapeHtml(request.id)}</small></span></td><td><span class="owner-cell"><strong>${escapeHtml(request.ownerName)}</strong><small dir="ltr">${escapeHtml(request.whatsapp)}</small><small>${escapeHtml(request.email || '—')}</small></span></td><td><span class="tenant-cell"><strong>${escapeHtml(request.plan?.name || '—')}</strong><small>${escapeHtml(registrationTermLabel(request.term))}</small></span></td><td><span class="tenant-cell"><strong>${escapeHtml(formatMoney(amount, request.pricing?.currency))}</strong><small>${escapeHtml(request.paymentMethod?.name || '—')}</small></span></td><td>${proofCell}</td><td>${statusPill(request.status)}</td><td>${escapeHtml(formatDateTime(request.createdAt))}</td><td>${actions}</td></tr>`;
        }).join('') : '<tr><td colspan="8"><div class="empty-inline">لا توجد طلبات انضمام مطابقة.</div></td></tr>';
        const pagination = state.gymRegistrationPagination;
        const total = Number(pagination.total || 0);
        const page = Number(pagination.page || state.gymRegistrationPage || 1);
        const pages = Number(pagination.pages || 1);
        $('#gymRegistrationResultsSummary').textContent = total ? `عرض ${rows.length} من ${total} طلب` : 'لا توجد نتائج';
        $('#gymRegistrationPagination').innerHTML = pages > 1 ? Array.from({ length: pages }, (_, index) => index + 1).map((number) => `<button type="button" class="${number === page ? 'active' : ''}" data-gym-registration-page="${number}">${number}</button>`).join('') : '';
    }

    async function loadGymRegistrations() {
        const status = $('#gymRegistrationStatusFilter')?.value || '';
        const params = new URLSearchParams({ page: state.gymRegistrationPage, pageSize: 25 });
        if (status) params.set('status', status);
        try { renderGymRegistrations(await api(`/api/platform-admin/gym-registration-requests?${params}`)); } catch (error) { showToast(getApiErrorMessage(error), true); }
    }

    function renderPlatformPaymentMethods(data) {
        state.platformPaymentMethods = Array.isArray(data?.paymentMethods) ? data.paymentMethods : [];
        const activeCount = state.platformPaymentMethods.filter((item) => item.isActive).length;
        const count = $('#platformPaymentMethodsCount');
        if (count) count.textContent = `${activeCount} وسيلة نشطة · ${state.platformPaymentMethods.length} إجمالي`;
        const body = $('#platformPaymentMethodsTableBody');
        if (!body) return;
        body.innerHTML = state.platformPaymentMethods.length ? state.platformPaymentMethods.map((method) => `<tr>
            <td><span class="tenant-cell"><strong>${escapeHtml(method.displayName)}</strong><small>${escapeHtml(method.methodCode)}</small></span></td>
            <td><strong class="payment-account-reference" dir="ltr">${escapeHtml(method.accountReference)}</strong></td>
            <td><span class="tenant-cell"><strong>${escapeHtml(method.recipientName || '—')}</strong><small>${escapeHtml(method.instructions || 'لا توجد تعليمات إضافية')}</small></span></td>
            <td>${statusPill(method.isActive ? 'active' : 'archived')}</td>
            <td>${escapeHtml(method.sortOrder)}</td>
            <td>${escapeHtml(formatDateTime(method.updatedAt || method.createdAt))}</td>
            <td><button class="table-action" type="button" data-platform-payment-method-edit="${escapeHtml(method.id)}">تعديل</button></td>
        </tr>`).join('') : '<tr><td colspan="7"><div class="empty-inline payment-methods-empty"><strong>لا توجد وسائل دفع للمنصة بعد.</strong><span>أضف وسيلة دفع نشطة حتى يستطيع صاحب الجيم إكمال التسجيل من /register-gym.</span></div></td></tr>';
    }

    async function loadPlatformPaymentMethods() {
        try { renderPlatformPaymentMethods(await api('/api/platform-admin/payment-methods')); } catch (error) { showToast(getApiErrorMessage(error), true); }
    }

    function backupStatusLabel(value) {
        return ({
            pending: 'قيد الانتظار',
            running: 'جارٍ التنفيذ',
            uploaded: 'تم الرفع',
            verifying: 'جارٍ التحقق',
            verified: 'تم التحقق',
            failed: 'فشل',
            expired: 'منتهية',
            deleted: 'محذوفة'
        })[String(value || '').toLowerCase()] || value || '—';
    }

    function backupTypeLabel(value) {
        return ({
            platform_daily: 'نسخة يومية للمنصة',
            platform_weekly: 'نسخة أسبوعية للمنصة',
            platform_monthly: 'نسخة شهرية للمنصة',
            platform_manual: 'نسخة يدوية للمنصة',
            tenant_daily: 'نسخة يومية للجيم',
            tenant_manual: 'نسخة يدوية للجيم',
            tenant_pre_restore: 'نسخة أمان قبل الاستعادة'
        })[String(value || '').toLowerCase()] || value || '—';
    }

    function backupStatusPill(value) {
        const normalized = String(value || '').toLowerCase();
        const className = ['verified', 'failed', 'running', 'pending', 'expired', 'deleted'].includes(normalized) ? normalized : '';
        return `<span class="status-pill backup-status ${className}">${escapeHtml(backupStatusLabel(value))}</span>`;
    }

    function backupHealthStat(label, value, caption, className = '') {
        return `<article class="platform-kpi backup-health-stat ${className}"><span class="platform-kpi-label">${escapeHtml(label)}</span><strong class="platform-kpi-value">${escapeHtml(value)}</strong><small class="platform-kpi-caption">${escapeHtml(caption)}</small></article>`;
    }

    function renderBackupHealth(data) {
        state.backupHealth = data || {};
        const summary = data?.summary || {};
        const providerStatus = data?.providerStatus === 'configured' ? 'متصل' : data?.providerStatus === 'local_development' ? 'محلي للاختبار' : 'غير مهيأ';
        const providerCaption = data?.providerStatus === 'configured'
            ? 'التخزين الخاص جاهز للتحقق والرفع.'
            : data?.providerStatus === 'local_development'
                ? 'تخزين محلي للتطوير فقط؛ لا يُعتمد كنسخة Production أو Off-site.'
            : 'يلزم ربط مزود تخزين خاص قبل التشغيل الفعلي.';
        $('#platformBackupHealthKpis').innerHTML = [
            backupHealthStat('الجيمات المستحقة اليوم', summary.eligibleTenants ?? 0, summary.backupDay || 'اليوم'),
            backupHealthStat('نسخ تم التحقق منها', summary.verifiedToday ?? 0, 'نسخ يومية سليمة', 'kpi-success'),
            backupHealthStat('نسخ فشلت', summary.failedToday ?? 0, 'تحتاج مراجعة أو إعادة محاولة', 'kpi-danger'),
            backupHealthStat('نسخ مفقودة اليوم', summary.missingToday ?? 0, 'لم تُنشأ بعد', 'kpi-warning')
        ].join('');
        const lastVerified = data?.lastVerifiedPlatformBackup?.verifiedAt || data?.lastVerifiedPlatformBackup?.createdAt;
        const schedule = data?.scheduledPolicy || {};
        const recurring = [schedule.weekly ? 'أسبوعي' : '', schedule.monthly ? 'شهري' : ''].filter(Boolean).join(' + ') || 'اليومي فقط';
        $('#platformBackupHealthSummary').innerHTML = `<div class="backup-summary-row"><span>اليوم</span><strong>${escapeHtml(summary.backupDay || '—')}</strong></div><div class="backup-summary-row"><span>تم التحقق</span><strong>${escapeHtml(`${summary.verifiedToday ?? 0} / ${summary.eligibleTenants ?? 0}`)}</strong></div><div class="backup-summary-row"><span>مفقود أو فاشل</span><strong>${escapeHtml(Number(summary.missingToday || 0) + Number(summary.failedToday || 0))}</strong></div><div class="backup-summary-row"><span>آخر نسخة منصة Verified</span><strong>${escapeHtml(formatDateTime(lastVerified))}</strong></div><div class="backup-summary-row"><span>استعادة تجريبية مثبتة</span><strong>${escapeHtml(formatDateTime(data?.lastRestoreRehearsalAt))}</strong></div><div class="backup-summary-row"><span>النسخ الدورية</span><strong>${escapeHtml(recurring)}</strong></div>`;
        const coverage = data?.registryCoverage || {};
        const uncoveredCount = (coverage.uncoveredTenantTables || []).length
            + (coverage.unregisteredPhysicalTenantTables || []).length
            + (coverage.missingPhysicalTables || []).length;
        const coverageLabel = coverage.status === 'covered'
            ? 'مكتملة'
            : `تحتاج مراجعة (${uncoveredCount})`;
        const platformFailureCount = Array.isArray(data?.platformFailures) ? data.platformFailures.length : 0;
        $('#platformBackupHealthSummary').insertAdjacentHTML('beforeend', `<div class="backup-summary-row"><span>تغطية سجل الجداول</span><strong>${escapeHtml(coverageLabel)}</strong></div><div class="backup-summary-row"><span>فشل نسخ المنصة مؤخرًا</span><strong>${escapeHtml(platformFailureCount)}</strong></div>`);
        $('#platformBackupProviderState').innerHTML = `<div class="backup-provider-badge ${data?.providerStatus === 'configured' ? 'ready' : 'pending'}"><span class="scope-dot"></span><strong>${escapeHtml(providerStatus)}</strong></div><p>${escapeHtml(providerCaption)}</p><small>Off-site: ${escapeHtml(data?.offsiteStatus || 'غير مهيأ')} · لا يتم عرض مسارات التخزين أو روابط عامة للملفات الخاصة.</small>`;
        const tenantRows = data?.tenantDaily || [];
        $('#tenantBackupsHealthTableBody').innerHTML = tenantRows.length ? tenantRows.map((row) => `<tr><td><span class="tenant-cell"><strong>${escapeHtml(row.slug || `Tenant #${row.tenantId}`)}</strong><small>#${escapeHtml(row.tenantId)}</small></span></td><td>${backupStatusPill(row.status)}</td><td>${escapeHtml(formatDate(row.backupDay))}</td><td>${escapeHtml(row.sizeBytes == null ? '—' : formatBytes(row.sizeBytes))}</td><td>${escapeHtml(formatDateTime(row.verifiedAt))}</td><td>${row.id && row.status === 'VERIFIED' ? `<a class="table-action" href="/api/platform-admin/tenants/${encodeURIComponent(row.tenantId)}/backups/${encodeURIComponent(row.id)}/download">تنزيل</a>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-inline">لا توجد بيانات نسخ للجيمات بعد.</div></td></tr>';
    }

    function renderBackupHistory(data) {
        state.backups = data?.backups || [];
        state.backupAudit = data?.audit || [];
        $('#platformBackupsTableBody').innerHTML = state.backups.length ? state.backups.map((backup) => `<tr><td>${escapeHtml(backupTypeLabel(backup.backupType))}</td><td>${backupStatusPill(backup.status)}</td><td>${escapeHtml(formatDate(backup.backupDay))}</td><td>${escapeHtml(backup.sizeBytes == null ? '—' : formatBytes(backup.sizeBytes))}</td><td>${escapeHtml(formatDateTime(backup.verifiedAt))}</td><td>${backup.status === 'VERIFIED' ? `<a class="table-action" href="/api/platform-admin/backups/${encodeURIComponent(backup.id)}/download">تنزيل</a>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-inline">لم تُنشأ نسخ للمنصة بعد.</div></td></tr>';
        $('#platformBackupAuditTableBody').innerHTML = state.backupAudit.length ? state.backupAudit.map((item) => `<tr><td>${escapeHtml(formatDateTime(item.createdAt))}</td><td>${escapeHtml(item.eventType || '—')}</td><td>${escapeHtml(item.backupId || '—')}</td><td>${backupStatusPill(item.result === 'success' ? 'verified' : item.result)}</td><td>${escapeHtml(item.reason || '—')}</td></tr>`).join('') : '<tr><td colspan="5"><div class="empty-inline">لا توجد عمليات نسخ مسجلة.</div></td></tr>';
    }

    async function loadBackups() {
        try {
            const [health, history] = await Promise.all([
                api('/api/platform-admin/backups/health?limit=100'),
                api('/api/platform-admin/backups?limit=100&auditLimit=100')
            ]);
            renderBackupHealth(health);
            renderBackupHistory(history);
        } catch (error) { showToast(error.message, true); }
    }

    async function loadPlans() {
        try { state.plans = (await api('/api/platform-admin/plans')).plans || []; updatePlanFilter(); renderPlans(); } catch (error) { showToast(error.message, true); }
    }

    function renderPlans() {
        const featureNames = { intelligence: 'الذكاء التشغيلي', coaching: 'التدريب والتغذية', store: 'المتجر', reports: 'التقارير', portal: 'بوابة المشترك', prioritySupport: 'دعم بأولوية' };
        $('#plansGrid').innerHTML = state.plans.length ? state.plans.map((plan) => `<article class="plan-card ${plan.code === 'pro' && plan.isActive ? 'featured' : ''} ${plan.isActive ? '' : 'is-inactive'}"><div class="card-heading"><div><span class="eyebrow">${escapeHtml(plan.code)}</span><h3>${escapeHtml(plan.name)}</h3></div>${plan.isActive ? statusPill('active') : statusPill('archived')}</div><p>${escapeHtml(plan.description || 'باقة SaaS لمنصة الجيم.')}</p><div class="plan-price">${escapeHtml(formatMoney(plan.price, plan.currency))}<small> / ${escapeHtml(plan.billingPeriod === 'yearly' ? 'سنة' : 'شهر')}</small></div><div class="plan-limits"><span>المشتركون <b>${escapeHtml(plan.maxMembers ?? '∞')}</b></span><span>المستخدمون <b>${escapeHtml(plan.maxUsers ?? '∞')}</b></span><span>AI شهريًا <b>${escapeHtml(plan.maxAiGenerations ?? '∞')}</b></span><span>التخزين <b>${escapeHtml(plan.maxStorageMb ? `${plan.maxStorageMb} MB` : '∞')}</b></span></div><div class="plan-features">${Object.entries(featureNames).map(([key,label]) => `<span class="feature-chip ${plan.features?.[key] === false ? 'off' : ''}">${plan.features?.[key] === false ? '×' : '✓'} ${label}</span>`).join('')}</div><div class="plan-card-actions"><button class="platform-btn ghost plan-edit" type="button" data-plan-edit="${plan.id}">تعديل الباقة</button><button class="platform-btn danger plan-delete" type="button" data-plan-delete="${plan.id}" ${plan.isActive && state.plans.filter((item) => item.isActive).length <= 1 ? 'disabled title="يجب إبقاء باقة مفعّلة"' : ''}>حذف</button></div></article>`).join('') : '<div class="empty-inline">لا توجد باقات.</div>';
    }

    async function loadAudit() {
        try { state.audit = (await api('/api/platform-admin/audit?limit=200')).audit || []; $('#auditTableBody').innerHTML = state.audit.length ? state.audit.map((item) => `<tr><td>${escapeHtml(formatDateTime(item.createdAt))}</td><td>${escapeHtml(item.actorName || 'System')}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.tenantId || 'Platform')}</td><td>${escapeHtml(item.reason || '—')}</td><td>${escapeHtml(item.details || '')}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-inline">لا توجد عمليات.</div></td></tr>'; } catch (error) { showToast(error.message, true); }
    }

    function planOptions(selected = '') {
        return state.plans.filter((plan) => plan.isActive || String(plan.id) === String(selected)).map((plan) => `<option value="${plan.id}" ${String(plan.id) === String(selected) ? 'selected' : ''}>${escapeHtml(plan.name)} — ${escapeHtml(formatMoney(plan.price, plan.currency))}</option>`).join('');
    }

    function trialPlanOptions(selected = '') {
        const plans = state.plans.filter((plan) => plan.isActive);
        return plans.map((plan) => `<option value="${escapeHtml(plan.code)}" ${String(plan.code) === String(selected) ? 'selected' : ''}>${escapeHtml(plan.name)} — ${escapeHtml(formatMoney(plan.price, plan.currency))}</option>`).join('');
    }

    function planFeatureFields(features = {}) {
        const labels = { intelligence: 'الذكاء التشغيلي', coaching: 'التدريب والتغذية', store: 'المتجر', reports: 'التقارير', portal: 'بوابة المشترك', prioritySupport: 'دعم بأولوية' };
        return `<div class="dialog-feature-grid full">${Object.entries(labels).map(([key, label]) => `<label class="dialog-check"><input name="feature_${key}" type="checkbox" ${features[key] === true ? 'checked' : ''}> ${escapeHtml(label)}</label>`).join('')}</div>`;
    }

    function planCompatibilityFields(selected = ['gym']) {
        const values = Array.isArray(selected) ? selected : [];
        return `<fieldset class="dialog-fieldset full"><legend>توافق الباقة</legend><p class="dialog-hint">يحدد أنواع العملاء التي يمكن أن تستخدم هذه الباقة. لا يمكن إزالة نوع مستخدم من اشتراك نشط.</p><div class="dialog-feature-grid full"><label class="dialog-check"><input name="compatibleTenantType_gym" type="checkbox" ${values.includes('gym') ? 'checked' : ''}> الجيم</label><label class="dialog-check"><input name="compatibleTenantType_independent_trainer" type="checkbox" ${values.includes('independent_trainer') ? 'checked' : ''}> المدرب المستقل</label></div></fieldset>`;
    }

    function tenantTypeField(selected = 'gym') {
        return `<label class="dialog-label full"><span>نوع العميل</span><select name="tenantType"><option value="gym" ${selected === 'gym' ? 'selected' : ''}>جيم</option><option value="independent_trainer" ${selected === 'independent_trainer' ? 'selected' : ''}>مدرب مستقل</option></select></label><p class="dialog-hint full">نوع العميل جزء ثابت من ملف الـTenant، وسيتم التحقق منه مع الباقة قبل الإنشاء.</p>`;
    }

    function numberOrNull(value) { return value === '' || value == null ? null : Number(value); }

    function dialogField(label, name, type = 'text', value = '', extra = '') { return `<label class="dialog-label"><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${type}" value="${escapeHtml(value)}" ${extra}></label>`; }
    function dialogSelect(label, name, options, extraClass = '') { return `<label class="dialog-label ${extraClass}"><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}">${options}</select></label>`; }
    function dialogTextarea(label, name, value = '', extra = '') { return `<label class="dialog-label full"><span>${escapeHtml(label)}</span><textarea name="${escapeHtml(name)}" ${extra}>${escapeHtml(value)}</textarea></label>`; }

    function openDialog(type, payload = {}) {
        const profile = state.profile;
        const tenant = profile?.tenant || {};
        clearDialogError();
        let title = 'إجراء إداري';
        let body = '';
        let action = type;
        if (type === 'status') {
            title = 'تغيير حالة الجيم';
            const selected = payload.status || (tenant.status === 'suspended' ? 'active' : tenant.status === 'archived' ? 'active' : 'suspended');
            body = `<p>لن يتم حذف أي بيانات. سيُحفظ القرار في Audit Log.</p>${dialogSelect('الحالة الجديدة','status',TENANT_STATUS_OPTIONS(selected))}${dialogField('سبب الإجراء','reason','text',payload.reason,'required')}${dialogField('إعادة التفعيل في (اختياري)','suspendUntil','datetime-local') }<label class="dialog-check"><input name="billingOnly" type="checkbox" checked> السماح للـOwner بصفحات الاشتراك أثناء الإيقاف</label>`;
        } else if (type === 'subscription' || type === 'plan' || type === 'extend' || type === 'lifetime') {
            title = type === 'plan' ? 'تغيير باقة الجيم' : type === 'extend' ? 'تمديد الاشتراك' : type === 'lifetime' ? 'منح اشتراك Lifetime' : 'إدارة الاشتراك';
            if (type === 'extend') body = `${dialogField('عدد الأيام','days','number','30','min="1" required')} ${dialogField('السبب','reason','text','','required')} ${dialogField('ملاحظات','notes','text','')}`;
            else if (type === 'lifetime') body = `<p>سيصبح الاشتراك Active بدون تاريخ انتهاء.</p>${dialogField('السبب','reason','text','','required')}`;
            else body = `<div class="dialog-grid">${dialogSelect('الإجراء','action',SUBSCRIPTION_OPTIONS(payload.action || (type === 'plan' ? 'change_plan' : 'activate')))}${dialogSelect('الباقة','planId',planOptions(profile?.subscription?.plan?.id))}${dialogSelect('متى يطبق تغيير الباقة؟','effective','<option value="immediate">فورًا</option><option value="renewal">عند التجديد</option>')}${dialogField('عدد الأيام (للتمديد/التقصير)','days','number','','min="1"')}${dialogField('بداية الاشتراك','startsAt','datetime-local')}${dialogField('نهاية الاشتراك','expiresAt','datetime-local')}</div>${dialogField('السبب','reason','text','','required')}${dialogField('ملاحظات','notes','text','')}`;
        } else if (type === 'override') {
            title = 'استثناءات مخصصة للجيم';
            const over = profile?.entitlements?.overrides || {};
            body = `<p>اترك الحد فارغًا لاستخدام حد الباقة. هذه الاستثناءات لا تنشئ باقة جديدة.</p><div class="dialog-grid">${dialogField('حد المشتركين','maxMembers','number',over.maxMembers || '')}${dialogField('حد المستخدمين','maxUsers','number',over.maxUsers || '')}${dialogField('حد AI الشهري','maxAiGenerations','number',over.maxAiGenerations || '')}${dialogField('حد التخزين MB','maxStorageMb','number',over.maxStorageMb || '')}</div><div class="dialog-grid">${['intelligence','coaching','store','reports','portal','prioritySupport'].map((key) => `<label class="dialog-check"><input name="feature_${key}" type="checkbox" ${over.features?.[key] === true ? 'checked' : ''}> ${escapeHtml(key)}</label>`).join('')}</div>${dialogField('ملاحظات','notes','text',over.notes || '')}${dialogField('سبب التغيير','reason','text','','required')}`;
        } else if (type === 'note') {
            title = 'إضافة ملاحظة داخلية';
            body = '<p>هذه الملاحظة لا يراها Owner أو مستخدمو الجيم.</p><label class="dialog-label full"><span>الملاحظة</span><textarea name="note" required placeholder="اكتب تفاصيل المتابعة..."></textarea></label>';
        } else if (type === 'reset') {
            title = 'إعادة تعيين كلمة المرور';
            body = `<p>سيتم إبطال الجلسات الحالية للمستخدم بعد التغيير.</p>${dialogField('كلمة المرور المؤقتة الجديدة','newPassword','password','','minlength="8" required')}${dialogField('تأكيد كلمة المرور','confirmPassword','password','','minlength="8" required')}`;
        } else if (type === 'new-tenant') {
            title = 'إضافة جيم جديد';
            body = `<div class="dialog-grid">${dialogField('اسم الجيم','name','text','','minlength="2" maxlength="160" required')}${dialogField('المعرف المختصر','slug','text','','pattern="[a-z0-9]+(?:-[a-z0-9]+)*" minlength="3" maxlength="80" required')}${dialogField('اسم المالك','ownerName','text','','minlength="2" maxlength="120" required')}${dialogField('بريد المالك','ownerEmail','email','','required')}${dialogField('كلمة مرور المالك','ownerPassword','password','','minlength="8" maxlength="128" required')}${dialogSelect('باقة التجربة','trialPlanCode',trialPlanOptions())}</div><p class="dialog-hint">سيبدأ الجيم بفترة تجربة 14 يومًا على الباقة المفعّلة المختارة.</p>`;
        } else if (type === 'owner') {
            title = 'إضافة أو تغيير Owner';
            body = `<p>مع تفعيل الاستبدال سيتم تحويل الـOwner الحالي إلى Assistant وإبطال جلساته.</p><div class="dialog-grid">${dialogField('الاسم','name','text','','required')}${dialogField('البريد','email','email','','required')}${dialogField('كلمة المرور','password','password','','minlength="8" required')}</div><label class="dialog-check"><input name="replaceExisting" type="checkbox"> استبدال الـOwner الحالي</label>${dialogField('السبب','reason','text','')}`;
        } else if (type === 'plan-create' || type === 'plan-edit') {
            const plan = type === 'plan-edit' ? (state.plans.find((item) => String(item.id) === String(payload.planId)) || {}) : {};
            title = type === 'plan-edit' ? `تعديل باقة ${plan.name || ''}` : 'إضافة باقة جديدة';
            body = `<div class="dialog-grid">${type === 'plan-create' ? dialogField('معرف الباقة','code','text','','pattern="[a-z0-9]+(?:-[a-z0-9]+)*" minlength="2" maxlength="40" required') : dialogField('معرف الباقة','code','text',plan.code || '','readonly')}${dialogField('اسم الباقة','name','text',plan.name || '','maxlength="120" required')}${dialogField('السعر','price','number',plan.price ?? 0,'min="0" step="0.01" required')}${dialogSelect('الفترة','billingPeriod',`<option value="monthly" ${plan.billingPeriod === 'monthly' || !plan.billingPeriod ? 'selected' : ''}>شهري</option><option value="yearly" ${plan.billingPeriod === 'yearly' ? 'selected' : ''}>سنوي</option>`)}${dialogField('العملة','currency','text',plan.currency || 'EGP','pattern="[A-Za-z]{3}" minlength="3" maxlength="3" required')}${dialogField('ترتيب الظهور','sortOrder','number',plan.sortOrder ?? 0,'min="0" step="1" required')}${dialogField('حد المشتركين','maxMembers','number',plan.maxMembers ?? '')}${dialogField('حد المستخدمين','maxUsers','number',plan.maxUsers ?? '')}${dialogField('حد AI الشهري','maxAiGenerations','number',plan.maxAiGenerations ?? '')}${dialogField('التخزين MB','maxStorageMb','number',plan.maxStorageMb ?? '')}</div>${dialogTextarea('وصف الباقة','description',plan.description || '','maxlength="500" rows="3"')}${planFeatureFields(plan.features || {})}<label class="dialog-check"><input name="isActive" type="checkbox" ${plan.isActive !== false ? 'checked' : ''}> الباقة مفعلة للاشتراكات الجديدة</label>${dialogField(type === 'plan-edit' ? 'سبب تعديل الباقة' : 'سبب إنشاء الباقة', 'reason', 'text', '', 'required')}`;
        } else if (type === 'plan-delete') {
            const plan = state.plans.find((item) => String(item.id) === String(payload.planId)) || {};
            title = `حذف باقة ${plan.name || ''}`;
            body = `<p>سيتم إخفاء الباقة من الاشتراكات الجديدة مع الحفاظ على الاشتراكات والتقارير القديمة. لا يتم حذف البيانات التاريخية.</p>${dialogField('سبب الحذف','reason','text','','maxlength="1000" required')}`;
        } else if (type === 'platform-payment-method-create' || type === 'platform-payment-method-edit') {
            const method = type === 'platform-payment-method-edit'
                ? (state.platformPaymentMethods.find((item) => String(item.id) === String(payload.methodId)) || {})
                : {};
            const editing = type === 'platform-payment-method-edit';
            title = editing ? `تعديل وسيلة الدفع ${method.displayName || ''}` : 'إضافة وسيلة دفع للمنصة';
            body = `<p class="dialog-hint">هذه الوسيلة ستظهر للمتقدمين في /register-gym فقط. لا تستخدم بيانات دفع أي Gym هنا؛ إعدادات دفع أعضاء كل Gym تظل داخل هوية الجيم.</p><div class="dialog-grid">${dialogField('المعرّف الداخلي','methodCode','text',method.methodCode || '','pattern="[a-z0-9]+(?:[-_][a-z0-9]+)*" minlength="2" maxlength="60" required' + (editing ? ' readonly' : ''))}${dialogField('اسم وسيلة الدفع','displayName','text',method.displayName || '','maxlength="120" required')}${dialogField('الرقم أو الحساب','accountReference','text',method.accountReference || '','maxlength="160" required dir="ltr"')}${dialogField('اسم المستلم','recipientName','text',method.recipientName || '','maxlength="160"')}${dialogField('ترتيب الظهور','sortOrder','number',method.sortOrder ?? 0,'min="0" max="999" step="1" required')}</div>${dialogTextarea('تعليمات الدفع','instructions',method.instructions || '','maxlength="1000" rows="3" placeholder="تعليمات مختصرة للمتقدم"')}${dialogField('سبب التغيير (اختياري)','reason','text','','maxlength="1000"')}<label class="dialog-check"><input name="isActive" type="checkbox" ${method.isActive !== false ? 'checked' : ''}> عرض الوسيلة للمتقدمين في التسجيل</label>`;
        } else if (type === 'gym-registration-approve' || type === 'gym-registration-reject') {
            const request = state.gymRegistrationRequests.find((item) => String(item.id) === String(payload.requestId)) || {};
            const isApproval = type === 'gym-registration-approve';
            title = isApproval ? 'اعتماد طلب انضمام الجيم' : 'رفض طلب انضمام الجيم';
            if (isApproval) {
                const proof = request.proof;
                const proofLink = proof?.id ? `<a class="table-action" target="_blank" rel="noopener noreferrer" href="/api/platform-admin/gym-registration-requests/proofs/${encodeURIComponent(proof.id)}/file">فتح إثبات الدفع</a>` : '<span class="table-secondary">لم يتم رفع إثبات دفع مؤكد</span>';
                body = `<p class="dialog-hint">سيتم إنشاء Tenant وحساب Owner واشتراك Active باستخدام خدمة Provisioning الحالية. كلمة المرور المؤقتة ستظهر مرة واحدة فقط بعد نجاح الاعتماد.</p><div class="registration-admin-detail">${detailRows([['نوع العميل', tenantTypeLabel(request.tenantType)],['الجيم أو العلامة', request.gymName],['المسؤول', request.ownerName],['WhatsApp', request.whatsapp],['البريد', request.email],['الباقة', request.plan?.name],['المدة', registrationTermLabel(request.term)],['الإجمالي', formatMoney(request.pricing?.amountDue, request.pricing?.currency)],['وسيلة الدفع', request.paymentMethod?.name]])}</div><div class="registration-proof-review"><span>إثبات الدفع</span>${proofLink}</div>${dialogTextarea('ملاحظات المراجعة','reviewNotes','','maxlength="2000" rows="3" placeholder="اختياري"')}`;
            } else {
                body = `<p class="dialog-hint">لن يتم إنشاء جيم أو حساب عند الرفض. سجّل سببًا واضحًا حتى يمكن متابعة الطلب لاحقًا.</p>${dialogField('سبب الرفض','reason','text','','maxlength="2000" required')}`;
            }
        } else if (type === 'approve') {
            const request = state.requests.find((item) => String(item.id) === String(payload.requestId));
            title = 'قبول طلب الاشتراك';
            body = `<p>سيتم تفعيل اشتراك الجيم على باقة <strong>${escapeHtml(request?.plan?.name || 'المختارة')}</strong> بعد التحقق من إثبات الدفع. ستُحفظ العملية في سجل المنصة.</p>${request?.proof ? `<p class="dialog-hint">الإثبات المرفق: ${escapeHtml(request.proof.fileName || 'ملف مرفق')}</p>` : '<p class="dialog-hint">لا يوجد إثبات دفع مرفق؛ لن يقبل الخادم الطلب قبل رفعه.</p>'}${dialogTextarea('ملاحظات المراجعة','reviewNotes','','maxlength="1000" rows="3" placeholder="اختياري"')}`;
        } else if (type === 'reject') {
            title = 'رفض طلب الاشتراك';
            body = `${dialogField('سبب الرفض','reason','text','','required')}`;
        } else if (type === 'platform-backup') {
            title = 'إنشاء نسخة احتياطية للمنصة';
            body = `<p class="dialog-hint">سيتم إنشاء نسخة DR من بيانات التحكم والمنشآت في التخزين الخاص. لا تُعتبر النسخة جاهزة إلا بعد التحقق من سلامة checksum.</p>${dialogField('سبب الإنشاء','reason','text','','maxlength="1000" required')}`;
        } else if (type === 'backup-retention') {
            title = 'تنظيف النسخ المنتهية';
            body = `<p class="dialog-hint">سيتم حذف artifacts التي انتهت مدة الاحتفاظ بها فقط، مع إبقاء السجل الإداري وقابلية إعادة المحاولة عند فشل التخزين.</p>${dialogField('سبب التنظيف','reason','text','','maxlength="1000" required')}`;
        } else if (type === 'tenant-backup') {
            title = `إنشاء نسخة احتياطية — ${tenant.name || 'الجيم'}`;
            body = `<p class="dialog-hint">سيتم حفظ نسخة من بيانات هذا الجيم فقط داخل التخزين الخاص، ثم التحقق من سلامة checksum قبل اعتمادها.</p>${dialogField('سبب الإنشاء','reason','text','','maxlength="1000" required')}`;
        }
        $('#platformDialogTitle').textContent = title;
        $('#platformDialogBody').innerHTML = body;
        if (action === 'plan-create' || action === 'plan-edit') {
            const selectedTenantTypes = type === 'plan-edit'
                ? (state.plans.find((item) => String(item.id) === String(payload.planId))?.compatibleTenantTypes || ['gym'])
                : ['gym'];
            $('#platformDialogBody').insertAdjacentHTML('beforeend', planCompatibilityFields(selectedTenantTypes));
        }
        if (action === 'new-tenant') $('#platformDialogBody').insertAdjacentHTML('afterbegin', tenantTypeField('gym'));
        if (action === 'reset') {
            $('#platformDialogBody').innerHTML = '<p class="dialog-hint">سيتم إنشاء كلمة مرور مؤقتة آمنة من الخادم، وإبطال الجلسات الحالية للحساب.</p><p>بعد تسجيل الدخول بها سيُطلب من صاحب الجيم تعيين كلمة مرور جديدة. لن يتم عرض كلمة المرور الحالية أو حفظ كلمة المرور المؤقتة في النظام.</p>';
        }
        dialogForm.dataset.action = action;
        dialogForm.dataset.payload = JSON.stringify(payload);
        if (dialog.open) dialog.close();
        dialog.showModal();
    }

    function registrationWelcomeMessage(result) {
        const request = result?.request || {};
        const credentials = result?.oneTimeCredentials || {};
        const subscription = result?.subscription || {};
        const planName = subscription.plan?.name || request.plan?.name || 'الباقة المختارة';
        const startsAt = formatDate(subscription.startsAt || subscription.starts_at);
        const expiresAt = subscription.expiresAt || subscription.expires_at ? formatDate(subscription.expiresAt || subscription.expires_at) : 'بدون انتهاء';
        const loginUrl = credentials.loginUrl || window.location.origin;
        return `مرحبًا بك في Logic Fit\n\nتم تفعيل حساب الجيم بنجاح.\n\nالجيم: ${request.gymName || '—'}\nالباقة: ${planName}\nتاريخ البداية: ${startsAt}\nتاريخ الانتهاء: ${expiresAt}\n\nرابط تسجيل الدخول:\n${loginUrl}\n\nاسم المستخدم: ${credentials.username || '—'}\nكلمة المرور المؤقتة: ${credentials.temporaryPassword || '—'}\n\nيرجى تغيير كلمة المرور بعد أول تسجيل دخول.`;
    }

    function clearRegistrationCredentials() {
        state.registrationCredentials = null;
        const body = $('#platformRegistrationCredentialsBody');
        if (body) body.replaceChildren();
    }

    function showRegistrationCredentials(result) {
        if (!registrationCredentialsDialog) return;
        const credentials = result?.oneTimeCredentials || {};
        const request = result?.request || {};
        const loginUrl = credentials.loginUrl || window.location.origin;
        const message = registrationWelcomeMessage(result);
        state.registrationCredentials = { ...credentials, loginUrl, message };
        const phone = String(request.whatsapp || '').replace(/[^0-9]/g, '');
        const whatsappHref = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '';
        $('#platformRegistrationCredentialsBody').innerHTML = `<p class="dialog-hint">تظهر كلمة المرور المؤقتة الآن مرة واحدة فقط. انسخها أو أرسل الرسالة يدويًا قبل إغلاق هذه النافذة؛ لا يمكن استرجاعها من النظام بعد ذلك.</p><div class="registration-credentials-grid"><div class="registration-credential-row"><span>اسم المستخدم</span><code>${escapeHtml(credentials.username || '—')}</code><button class="table-action" type="button" data-copy-registration="username">نسخ</button></div><div class="registration-credential-row"><span>كلمة المرور المؤقتة</span><code>${escapeHtml(credentials.temporaryPassword || '—')}</code><button class="table-action" type="button" data-copy-registration="temporaryPassword">نسخ</button></div><div class="registration-credential-row"><span>رابط الدخول</span><code dir="ltr">${escapeHtml(loginUrl)}</code><button class="table-action" type="button" data-copy-registration="loginUrl">نسخ</button></div></div><div class="registration-whatsapp-box"><div class="card-heading"><div><span class="eyebrow">تواصل يدوي</span><h3>رسالة الترحيب</h3></div>${whatsappHref ? `<a class="platform-btn ghost" target="_blank" rel="noopener noreferrer" href="${escapeHtml(whatsappHref)}">فتح WhatsApp</a>` : ''}</div><textarea id="registrationWelcomeMessage" readonly>${escapeHtml(message)}</textarea><button class="platform-btn ghost" type="button" data-copy-registration="message">نسخ الرسالة</button><small>فتح WhatsApp لا يثبت إرسال الرسالة؛ الإرسال يتم يدويًا داخل التطبيق.</small></div>`;
        registrationCredentialsDialog.showModal();
    }

    function showPasswordResetCredentials(result, userId) {
        const user = (state.profile?.users || []).find((item) => String(item.id) === String(userId)) || {};
        showRegistrationCredentials({
            ...result,
            oneTimeCredentials: {
                username: user.email || '—',
                temporaryPassword: result?.temporaryPassword,
                loginUrl: window.location.origin,
                mustChangePassword: true
            },
            request: { gymName: state.profile?.tenant?.name || '—', ownerName: user.name || '—', email: user.email || '—' },
            subscription: {}
        });
    }

    async function copyRegistrationValue(key) {
        const value = state.registrationCredentials?.[key];
        if (!value) return;
        try {
            await navigator.clipboard.writeText(String(value));
            showToast('تم نسخ البيانات إلى الحافظة.');
        } catch (_) {
            showToast('تعذر النسخ تلقائيًا؛ حدّد النص وانسخه يدويًا.', true);
        }
    }

    function TENANT_STATUS_OPTIONS(selected) { return ['active','trial','suspended','expired','archived'].map((status) => `<option value="${status}" ${status === selected ? 'selected' : ''}>${statusLabel(status)}</option>`).join(''); }
    function SUBSCRIPTION_OPTIONS(selected) { return [['activate','تفعيل / تحويل Trial'],['extend','تمديد'],['shorten','تقليل المدة'],['set_dates','تعديل التواريخ'],['change_plan','تغيير الباقة'],['grant_lifetime','Lifetime'],['suspend','إيقاف الاشتراك'],['reactivate','إعادة تفعيل'],['expire','إنهاء الاشتراك'],['cancel','إلغاء الاشتراك']].map(([value,label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join(''); }

    function formObject(form) {
        const data = Object.fromEntries(new FormData(form).entries());
        $$('input[type="checkbox"]', form).forEach((input) => { data[input.name] = input.checked; });
        return data;
    }

    async function handleDialogSubmit(event) {
        event.preventDefault();
        if (event.submitter?.value === 'cancel') { dialog.close(); return; }
        if (dialogForm.dataset.action !== 'reset' && !validateDialogForm()) return;
        clearDialogError();
        const action = dialogForm.dataset.action;
        const payload = JSON.parse(dialogForm.dataset.payload || '{}');
        const values = formObject(dialogForm);
        const submit = $('#platformDialogSubmit');
        const loadingLabels = {
            status: 'جاري تحديث حالة الجيم...', subscription: 'جاري تطبيق الاشتراك...', extend: 'جاري تمديد الاشتراك...', lifetime: 'جاري تفعيل الاشتراك...', plan: 'جاري تغيير الباقة...', override: 'جاري حفظ الاستثناءات...', note: 'جاري حفظ الملاحظة...', reset: 'جاري إعادة ضبط الوصول...', 'new-tenant': 'جاري إنشاء الجيم...', owner: 'جاري تحديث بيانات المالك...', 'plan-create': 'جاري إضافة الباقة...', 'plan-edit': 'جاري تحديث الباقة...', 'plan-delete': 'جاري أرشفة الباقة...', 'platform-payment-method-create': 'جاري إضافة وسيلة الدفع...', 'platform-payment-method-edit': 'جاري تحديث وسيلة الدفع...', approve: 'جاري اعتماد الطلب...', reject: 'جاري رفض الطلب...', 'gym-registration-approve': 'جاري اعتماد طلب الجيم...', 'gym-registration-reject': 'جاري رفض طلب الجيم...', 'platform-backup': 'جاري إنشاء نسخة المنصة...', 'backup-retention': 'جاري تنظيف النسخ...', 'tenant-backup': 'جاري إنشاء نسخة الجيم...'
        };
        setLoading(submit, true, loadingLabels[action] || 'جاري تنفيذ الإجراء...');
        try {
            if (action === 'reset') {
                const result = await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/users/${payload.userId}/reset-password`, { method: 'POST', body: JSON.stringify({}) });
                showToast('تم إنشاء كلمة مرور مؤقتة وإبطال الجلسات القديمة.');
                dialog.close();
                showPasswordResetCredentials(result, payload.userId);
                await refreshProfile();
                return;
            }
            if (action === 'status') {
                await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: values.status, reason: values.reason, suspendUntil: values.suspendUntil || null, billingOnly: values.billingOnly }) });
                showToast('تم تحديث حالة الجيم وتسجيل العملية.');
                dialog.close(); await refreshProfile();
            } else if (['subscription','extend','lifetime','plan'].includes(action)) {
                const body = action === 'extend' ? { action: 'extend', days: values.days, reason: values.reason, notes: values.notes } : action === 'lifetime' ? { action: 'grant_lifetime', reason: values.reason } : { action: values.action || 'change_plan', planId: values.planId || undefined, effective: values.effective, days: values.days || undefined, startsAt: values.startsAt || undefined, expiresAt: values.expiresAt || undefined, reason: values.reason, notes: values.notes, autoRenew: values.autoRenew };
                await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/subscription`, { method: 'PATCH', body: JSON.stringify(body) });
                showToast('تم تحديث الاشتراك بنجاح.'); dialog.close(); await refreshProfile();
            } else if (action === 'override') {
                const features = {}; ['intelligence','coaching','store','reports','portal','prioritySupport'].forEach((key) => { if (Object.prototype.hasOwnProperty.call(values, `feature_${key}`)) features[key] = Boolean(values[`feature_${key}`]); });
                await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/overrides`, { method: 'PUT', body: JSON.stringify({ maxMembers: values.maxMembers || null, maxUsers: values.maxUsers || null, maxAiGenerations: values.maxAiGenerations || null, maxStorageMb: values.maxStorageMb || null, features, notes: values.notes, reason: values.reason }) });
                showToast('تم حفظ استثناءات الباقة.'); dialog.close(); await refreshProfile();
            } else if (action === 'note') {
                await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/notes`, { method: 'POST', body: JSON.stringify({ note: values.note }) });
                showToast('تمت إضافة الملاحظة الداخلية.'); dialog.close(); await refreshProfile();
            } else if (action === 'new-tenant') {
                const created = await api('/api/platform-admin/tenants', { method: 'POST', body: JSON.stringify({ ...values, tenantType: values.tenantType || 'gym' }) });
                showToast('تم إنشاء الجيم والـOwner وفترة التجربة.'); dialog.close(); state.tenantPage = 1; setView('gyms'); if (created.tenant?.id) setTimeout(() => openTenant(created.tenant.id), 250);
            } else if (action === 'owner') {
                await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/owner`, { method: 'POST', body: JSON.stringify(values) });
                showToast('تم تحديث Owner الجيم.'); dialog.close(); await refreshProfile();
            } else if (action === 'plan-create') {
                const features = {};
                ['intelligence','coaching','store','reports','portal','prioritySupport'].forEach((key) => { features[key] = Boolean(values[`feature_${key}`]); });
                const compatibleTenantTypes = ['gym', 'independent_trainer'].filter((type) => values[`compatibleTenantType_${type}`]);
                await api('/api/platform-admin/plans', { method: 'POST', body: JSON.stringify({ code: values.code, name: values.name, description: values.description, price: values.price, currency: values.currency, billingPeriod: values.billingPeriod, sortOrder: values.sortOrder, maxMembers: numberOrNull(values.maxMembers), maxUsers: numberOrNull(values.maxUsers), maxAiGenerations: numberOrNull(values.maxAiGenerations), maxStorageMb: numberOrNull(values.maxStorageMb), isActive: values.isActive, features, compatibleTenantTypes, reason: values.reason }) });
                showToast('تم إنشاء الباقة بنجاح.'); dialog.close(); await loadPlans();
            } else if (action === 'plan-edit') {
                const features = {};
                ['intelligence','coaching','store','reports','portal','prioritySupport'].forEach((key) => { features[key] = Boolean(values[`feature_${key}`]); });
                const compatibleTenantTypes = ['gym', 'independent_trainer'].filter((type) => values[`compatibleTenantType_${type}`]);
                await api(`/api/platform-admin/plans/${payload.planId}`, { method: 'PATCH', body: JSON.stringify({ name: values.name, description: values.description, price: values.price, currency: values.currency, billingPeriod: values.billingPeriod, sortOrder: values.sortOrder, maxMembers: numberOrNull(values.maxMembers), maxUsers: numberOrNull(values.maxUsers), maxAiGenerations: numberOrNull(values.maxAiGenerations), maxStorageMb: numberOrNull(values.maxStorageMb), isActive: values.isActive, features, compatibleTenantTypes, reason: values.reason }) });
                showToast('تم تحديث الباقة.'); dialog.close(); await loadPlans();
            } else if (action === 'plan-delete') {
                await api(`/api/platform-admin/plans/${payload.planId}`, { method: 'DELETE', body: JSON.stringify({ reason: values.reason }) });
                showToast('تم حذف الباقة من الاشتراكات الجديدة مع الحفاظ على السجل.'); dialog.close(); await loadPlans();
            } else if (action === 'platform-payment-method-create') {
                await api('/api/platform-admin/payment-methods', { method: 'POST', body: JSON.stringify({ methodCode: values.methodCode, displayName: values.displayName, accountReference: values.accountReference, recipientName: values.recipientName, instructions: values.instructions, isActive: values.isActive, sortOrder: numberOrNull(values.sortOrder), reason: values.reason }) });
                showToast('تمت إضافة وسيلة دفع المنصة بنجاح.'); dialog.close(); await loadPlatformPaymentMethods();
            } else if (action === 'platform-payment-method-edit') {
                await api(`/api/platform-admin/payment-methods/${encodeURIComponent(payload.methodId)}`, { method: 'PATCH', body: JSON.stringify({ methodCode: values.methodCode, displayName: values.displayName, accountReference: values.accountReference, recipientName: values.recipientName, instructions: values.instructions, isActive: values.isActive, sortOrder: numberOrNull(values.sortOrder), reason: values.reason }) });
                showToast('تم تحديث وسيلة دفع المنصة.'); dialog.close(); await loadPlatformPaymentMethods();
            } else if (action === 'approve') {
                await api(`/api/platform-admin/subscription-requests/${payload.requestId}/approve`, { method: 'POST', body: JSON.stringify({ reviewNotes: values.reviewNotes || '' }) });
                showToast('تم قبول الطلب وتفعيل الاشتراك.'); dialog.close(); await loadRequests(); loadDashboard(); if (state.profile) await refreshProfile();
            } else if (action === 'reject') {
                await api(`/api/platform-admin/subscription-requests/${payload.requestId}/reject`, { method: 'POST', body: JSON.stringify({ reason: values.reason }) });
                showToast('تم رفض الطلب وتسجيل السبب.'); dialog.close(); await loadRequests();
            } else if (action === 'gym-registration-approve') {
                const result = await api(`/api/platform-admin/gym-registration-requests/${payload.requestId}/approve`, { method: 'POST', body: JSON.stringify({ reviewNotes: values.reviewNotes || '' }) });
                showToast('تم اعتماد طلب الجيم وإنشاء الحساب بنجاح.'); dialog.close(); await loadGymRegistrations(); loadDashboard(); loadTenants(); showRegistrationCredentials(result);
            } else if (action === 'gym-registration-reject') {
                await api(`/api/platform-admin/gym-registration-requests/${payload.requestId}/reject`, { method: 'POST', body: JSON.stringify({ reason: values.reason }) });
                showToast('تم رفض طلب الجيم وتسجيل السبب.'); dialog.close(); await loadGymRegistrations();
            } else if (action === 'platform-backup') {
                await api('/api/platform-admin/backups/run', { method: 'POST', body: JSON.stringify({ backupType: 'platform_manual', reason: values.reason }) });
                showToast('تم بدء نسخة المنصة والتحقق منها.'); dialog.close(); await loadBackups();
            } else if (action === 'backup-retention') {
                await api('/api/platform-admin/backups/retention', { method: 'POST', body: JSON.stringify({ reason: values.reason }) });
                showToast('تم تنفيذ سياسة الاحتفاظ.'); dialog.close(); await loadBackups();
            } else if (action === 'tenant-backup') {
                await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/backups`, { method: 'POST', body: JSON.stringify({ reason: values.reason }) });
                showToast('تم إنشاء نسخة الجيم والتحقق منها.'); dialog.close(); await refreshProfile();
            }
        } catch (error) {
            const message = getApiErrorMessage(error);
            showDialogError(message, error.code || '', error.field || '');
            showToast(message, true);
        } finally { setLoading(submit, false); }
    }

    async function refreshProfile() {
        if (!state.profile?.tenant?.id) return;
        await openTenant(state.profile.tenant.id, { resetTab: false, paymentsPage: state.profilePaymentsPage });
        loadDashboard();
    }

    async function handleRequestAction(action, requestId) {
        try {
            if (action === 'reject') { openDialog('reject', { requestId }); return; }
            if (action === 'approve') { openDialog('approve', { requestId }); return; }
        } catch (error) { showToast(error.message, true); }
    }

    function bindEvents() {
        $$('#platformNav [data-platform-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.platformView)));
        $$('[data-platform-view-target]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.platformViewTarget)));
        $('#platformAdminLogoutButton').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            setLoading(button, true, 'جاري تسجيل الخروج...');
            await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
            window.location.reload();
        });
        $('#platformAdminLoginForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const button = $('#platformAdminLoginButton');
            setLoading(button, true);
            try {
                const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#platformAdminEmail').value, password: $('#platformAdminPassword').value }) });
                if (result.user?.role !== 'PlatformAdmin') { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); throw new Error('هذا الدخول مخصص لحساب PlatformAdmin فقط.'); }
                showApp(result.user); await Promise.all([loadPlans(), loadDashboard()]);
            } catch (error) { const message = $('#platformAdminLoginMessage'); message.textContent = error.message; message.hidden = false; } finally { setLoading(button, false); }
        });
        $('#tenantSearch').addEventListener('input', (event) => { clearTimeout(searchTimer); state.tenantFilters.search = event.target.value; state.tenantPage = 1; searchTimer = setTimeout(loadTenants, 260); });
        [['tenantStatusFilter','status'],['tenantPlanFilter','plan'],['tenantTypeFilter','tenantType'],['tenantExpiryFilter','expiringDays']].forEach(([id,key]) => $(`#${id}`).addEventListener('change', (event) => { state.tenantFilters[key] = event.target.value; state.tenantPage = 1; loadTenants(); }));
        $('#requestStatusFilter').addEventListener('change', () => { state.requestPage = 1; loadRequests(); });
        $('#gymRegistrationStatusFilter').addEventListener('change', () => { state.gymRegistrationPage = 1; loadGymRegistrations(); });
        $('#platformGlobalSearch').addEventListener('input', (event) => { if (state.view !== 'gyms') setView('gyms'); $('#tenantSearch').value = event.target.value; state.tenantFilters.search = event.target.value; state.tenantPage = 1; clearTimeout(searchTimer); searchTimer = setTimeout(loadTenants, 260); });
        const bindRefresh = (selector, loader) => {
            const button = $(selector);
            if (!button) return;
            button.addEventListener('click', async () => {
                setLoading(button, true, 'جاري التحديث...');
                try { await loader(); } finally { setLoading(button, false); }
            });
        };
        bindRefresh('[data-platform-action="refresh-dashboard"]', loadDashboard);
        bindRefresh('[data-platform-action="refresh-requests"]', loadRequests);
        bindRefresh('[data-platform-action="refresh-gym-registrations"]', loadGymRegistrations);
        bindRefresh('[data-platform-action="refresh-payment-methods"]', loadPlatformPaymentMethods);
        bindRefresh('[data-platform-action="refresh-backups"]', loadBackups);
        $('#platformMobileMenu').addEventListener('click', () => $('.platform-sidebar').classList.toggle('open'));
        dialogForm.addEventListener('submit', handleDialogSubmit);
        dialogForm.addEventListener('input', () => { if (!$('#platformDialogError')?.hidden) clearDialogError(); });
        $$('[data-dialog-cancel]', dialog).forEach((button) => button.addEventListener('click', () => dialog.close()));
        dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
        dialog.addEventListener('close', clearDialogError);
        registrationCredentialsDialog?.addEventListener('close', clearRegistrationCredentials);
        document.addEventListener('click', async (event) => {
            const registrationCopy = event.target.closest('[data-copy-registration]');
            if (registrationCopy) { await copyRegistrationValue(registrationCopy.dataset.copyRegistration); return; }
            const registrationAction = event.target.closest('[data-gym-registration-action]');
            if (registrationAction) { openDialog(`gym-registration-${registrationAction.dataset.gymRegistrationAction}`, { requestId: registrationAction.dataset.gymRegistrationId }); return; }
            const platformAction = event.target.closest('[data-platform-action]');
            if (platformAction?.dataset.platformAction === 'new-tenant') { openDialog('new-tenant'); return; }
            if (platformAction?.dataset.platformAction === 'new-plan') { openDialog('plan-create'); return; }
            if (platformAction?.dataset.platformAction === 'new-platform-payment-method') { openDialog('platform-payment-method-create'); return; }
            if (platformAction?.dataset.platformAction === 'run-platform-backup') { openDialog('platform-backup'); return; }
            if (platformAction?.dataset.platformAction === 'cleanup-backups') { openDialog('backup-retention'); return; }
            const paymentMethodEdit = event.target.closest('[data-platform-payment-method-edit]');
            if (paymentMethodEdit) { openDialog('platform-payment-method-edit', { methodId: paymentMethodEdit.dataset.platformPaymentMethodEdit }); return; }
            const openButton = event.target.closest('[data-open-tenant]');
            if (openButton) { setView('gyms'); await openTenant(openButton.dataset.openTenant); return; }
            const pageButton = event.target.closest('[data-tenant-page]');
            if (pageButton) { state.tenantPage = Number(pageButton.dataset.tenantPage); loadTenants(); return; }
            const requestPageButton = event.target.closest('[data-request-page]');
            if (requestPageButton) { state.requestPage = Number(requestPageButton.dataset.requestPage); loadRequests(); return; }
            const gymRegistrationPageButton = event.target.closest('[data-gym-registration-page]');
            if (gymRegistrationPageButton) { state.gymRegistrationPage = Number(gymRegistrationPageButton.dataset.gymRegistrationPage); loadGymRegistrations(); return; }
            const profilePaymentsPageButton = event.target.closest('[data-profile-payments-page]');
            if (profilePaymentsPageButton && state.profile?.tenant?.id) {
                state.profilePaymentsPage = Number(profilePaymentsPageButton.dataset.profilePaymentsPage) || 1;
                await openTenant(state.profile.tenant.id, { resetTab: false, paymentsPage: state.profilePaymentsPage });
                activateProfileTab('payments');
                return;
            }
            const tab = event.target.closest('[data-profile-tab]');
            if (tab) { activateProfileTab(tab.dataset.profileTab); return; }
            const profileAction = event.target.closest('[data-profile-action]');
            if (profileAction) {
                const action = profileAction.dataset.profileAction;
                if (action === 'back') { closeProfile(); return; }
                if (action === 'suspend') { openDialog('status', { status: 'suspended' }); return; }
                if (action === 'activate' || action === 'restore') { openDialog('status', { status: 'active' }); return; }
                if (action === 'subscription') { openDialog('subscription'); return; }
                if (action === 'subscription-suspend') { openDialog('subscription', { action: 'suspend' }); return; }
                if (action === 'plan') { openDialog('plan'); return; }
                if (action === 'extend') { openDialog('extend'); return; }
                if (action === 'lifetime') { openDialog('lifetime'); return; }
                if (action === 'override') { openDialog('override'); return; }
                if (action === 'add-note') { openDialog('note'); return; }
                if (action === 'owner') { openDialog('owner'); return; }
                if (action === 'tenant-backup') { openDialog('tenant-backup'); return; }
                if (action === 'more') { openDialog('status', { status: 'archived' }); return; }
            }
            const userAction = event.target.closest('[data-user-action]');
            if (userAction) {
                const userId = userAction.dataset.userId;
                if (userAction.dataset.userAction === 'reset') { openDialog('reset', { userId }); return; }
                setLoading(userAction, true, 'جاري تحديث المستخدم...');
                try { await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status: userAction.dataset.userAction === 'enable' ? 'Active' : 'Disabled' }) }); showToast('تم تحديث حالة المستخدم.'); await refreshProfile(); } catch (error) { showToast(error.message, true); } finally { setLoading(userAction, false); }
            }
            const requestAction = event.target.closest('[data-request-action]');
            if (requestAction) await handleRequestAction(requestAction.dataset.requestAction, requestAction.dataset.requestId);
            const planEdit = event.target.closest('[data-plan-edit]');
            if (planEdit) openDialog('plan-edit', { planId: planEdit.dataset.planEdit });
            const planDelete = event.target.closest('[data-plan-delete]');
            if (planDelete && !planDelete.disabled) openDialog('plan-delete', { planId: planDelete.dataset.planDelete });
        });
    }

    async function boot() {
        initializeTheme();
        bindEvents();
        try {
            const session = await api('/api/auth/session');
            if (!session.authenticated) { showLogin(); return; }
            if (session.user?.role !== 'PlatformAdmin') { showLogin('هذه الصفحة مخصصة لحساب PlatformAdmin فقط.'); return; }
            showApp(session.user);
            await Promise.all([loadPlans(), loadDashboard()]);
        } catch (error) { showLogin(error.message); }
    }

    boot();
}());
