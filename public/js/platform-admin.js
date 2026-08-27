'use strict';

(function () {
    const state = {
        user: null,
        view: 'dashboard',
        dashboard: null,
        tenants: { tenants: [], pagination: {} },
        plans: [],
        requests: [],
        audit: [],
        profile: null,
        profileTab: 'overview',
        tenantPage: 1,
        tenantFilters: { search: '', status: '', plan: '', expiringDays: '0' }
    };

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const loginScreen = $('#platformAdminLoginScreen');
    const appShell = $('#platformAdminApp');
    const dialog = $('#platformActionDialog');
    const dialogForm = $('#platformActionForm');
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
        return ({ active: 'Active', trial: 'Trial', suspended: 'Suspended', expired: 'Expired', archived: 'Archived', cancelled: 'Cancelled', pending: 'Pending', approved: 'Approved', rejected: 'Rejected' })[String(value || '').toLowerCase()] || value || '—';
    }

    function statusPill(value) {
        const normalized = String(value || '').toLowerCase();
        return `<span class="status-pill ${escapeHtml(normalized)}">${escapeHtml(statusLabel(value))}</span>`;
    }

    function showToast(message, isError = false) {
        const element = $('#platformToast');
        element.textContent = message;
        element.classList.toggle('error', isError);
        element.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => element.classList.remove('show'), 3800);
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
            error.payload = data;
            throw error;
        }
        return data;
    }

    function setLoading(element, loading) {
        if (!element) return;
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
        $('#platformThemeToggle').setAttribute('aria-label', next === 'dark' ? 'تفعيل المظهر الفاتح' : 'تفعيل المظهر الداكن');
    }

    function initializeTheme() {
        const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
        setTheme(current);
        $('#platformThemeToggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    }

    function setView(view) {
        state.view = view;
        $$('[data-platform-view]').forEach((button) => button.classList.toggle('active', button.dataset.platformView === view));
        $$('[data-platform-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.platformPanel === view));
        const titles = { dashboard: 'لوحة المنصة', gyms: 'الجيمات / Tenants', requests: 'طلبات الاشتراك', plans: 'الباقات', audit: 'سجل المنصة', settings: 'إعدادات المنصة' };
        $('#platformPageTitle').textContent = titles[view] || 'إدارة المنصة';
        $('.platform-sidebar')?.classList.remove('open');
        if (view === 'dashboard') loadDashboard();
        if (view === 'gyms') loadTenants();
        if (view === 'requests') loadRequests();
        if (view === 'plans') loadPlans();
        if (view === 'audit') loadAudit();
    }

    function renderKpis(metrics) {
        const gyms = metrics.gyms || {};
        const items = [
            ['إجمالي الجيمات', gyms.total, 'كل Tenants المسجلة', '▦', ''],
            ['Active Gyms', gyms.active, 'جيمات تعمل الآن', '✓', 'kpi-success'],
            ['Trial Gyms', gyms.trial, 'في فترة التجربة', '◌', 'kpi-info'],
            ['طلبات Pending', metrics.pendingRequests, 'تحتاج مراجعة', '◷', 'kpi-warning'],
            ['تنتهي قريبًا', metrics.expiringSubscriptions, 'خلال 30 يومًا', '!', 'kpi-danger'],
            ['إجمالي المشتركين', metrics.members, 'في كل الجيمات', '◉', ''],
            ['مستخدمو النظام', metrics.users, 'Owners و Assistants', '◎', ''],
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
        $('#recentTenants').innerHTML = recent.length ? recent.map((tenant) => `<button class="mini-tenant" type="button" data-open-tenant="${tenant.id}"><span class="mini-tenant-main"><strong>${escapeHtml(tenant.name)}</strong><small>${escapeHtml(tenant.slug)} · ${escapeHtml(tenant.owner?.name || 'بدون Owner')}</small></span>${statusPill(tenant.status)}</button>`).join('') : '<div class="empty-inline">لا توجد جيمات مضافة بعد.</div>';
        const activity = data.recentActivity || [];
        $('#recentActivity').innerHTML = activity.length ? activity.map((item) => `<div class="mini-activity"><span class="mini-activity-main"><strong>${escapeHtml(item.action || 'عملية')}</strong><small>${escapeHtml(item.actorName || 'System')} · ${escapeHtml(item.details || '')}</small></span><small>${escapeHtml(formatDateTime(item.createdAt))}</small></div>`).join('') : '<div class="empty-inline">لا توجد عمليات مسجلة.</div>';
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
        $('#tenantsTableBody').innerHTML = rows.length ? rows.map((tenant) => `<tr><td><span class="tenant-cell"><strong>${escapeHtml(tenant.name)}</strong><small>${escapeHtml(tenant.slug)} · #${tenant.id}</small></span></td><td><span class="owner-cell"><strong>${escapeHtml(tenant.owner?.name || '—')}</strong><small>${escapeHtml(tenant.owner?.email || '—')}</small></span></td><td>${escapeHtml(tenant.subscription?.plan?.name || '—')}</td><td>${statusPill(tenant.status)}</td><td><span>${escapeHtml(statusLabel(tenant.subscription?.status))}</span><small class="table-secondary">${escapeHtml(tenant.subscription?.expiresAt ? `${tenant.subscription.daysRemaining ?? 0} يوم` : 'بدون انتهاء')}</small></td><td>${tenantUsageCell(tenant)}</td><td>${escapeHtml(formatDateTime(tenant.lastActivityAt))}</td><td><button class="table-action" type="button" data-open-tenant="${tenant.id}">فتح الملف</button></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty-inline">لا توجد نتائج مطابقة.</div></td></tr>';
        const total = Number(data.pagination?.total || 0);
        const page = Number(data.pagination?.page || 1);
        const pages = Number(data.pagination?.pages || 1);
        $('#tenantResultsSummary').textContent = total ? `عرض ${rows.length} من ${total} جيم` : 'لا توجد نتائج';
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
        $('#tenantProfile').innerHTML = `<div class="profile-head"><div class="profile-heading"><span class="profile-logo">ج</span><div><h2>${escapeHtml(tenant.name)}</h2><p>${escapeHtml(tenant.slug)} · Tenant #${tenant.id}</p><div class="profile-status-line">${statusPill(tenant.status)}<span class="table-secondary">${escapeHtml(tenant.contactEmail || 'لا يوجد بريد اتصال')}</span></div></div></div><div class="profile-actions"><button class="platform-btn ghost" type="button" data-profile-action="back">← كل الجيمات</button>${actions}${profileActionButton('الاشتراك', 'subscription')}${profileActionButton('تغيير الباقة', 'plan')}${profileActionButton('تمديد', 'extend', 'primary')}<button class="platform-btn ghost" type="button" data-profile-action="more">المزيد</button></div></div><div class="profile-tabs" role="tablist">${[['overview','نظرة عامة'],['subscription','الاشتراك'],['usage','الاستخدام والحدود'],['users','Owner والمستخدمون'],['data','بيانات الجيم'],['payments','المدفوعات'],['health','Health'],['audit','Audit Log'],['notes','ملاحظات داخلية']].map(([id,label]) => `<button class="profile-tab ${state.profileTab === id ? 'active' : ''}" type="button" data-profile-tab="${id}">${label}</button>`).join('')}</div><div class="profile-panel-wrap">${profileOverviewPanel(profile)}${profileSubscriptionPanel(profile)}${profileUsagePanel(profile)}${profileUsersPanel(profile)}${profileDataPanel(profile)}${profilePaymentsPanel(profile)}${profileHealthPanel(profile)}${profileAuditPanel(profile)}${profileNotesPanel(profile)}</div>`;
        $('#tenantDirectory').hidden = true;
        $('.platform-view[data-platform-panel="gyms"] > .platform-page-head').hidden = true;
        $('#tenantProfile').hidden = false;
        activateProfileTab(state.profileTab);
    }

    function profilePanel(id, content) { return `<section class="profile-panel" data-profile-panel="${id}">${content}</section>`; }

    function stat(label, value) { return `<div class="profile-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`; }

    function detailRows(rows) { return `<div class="detail-list">${rows.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value ?? '—')}</b></div>`).join('')}</div>`; }

    function profileOverviewPanel(profile) {
        const tenant = profile.tenant || {};
        const sub = profile.subscription;
        const stats = profile.stats || {};
        return profilePanel('overview', `<div class="profile-grid">${stat('المشتركون', stats.members ?? 0)}${stat('عضويات نشطة', stats.activeMemberships ?? 0)}${stat('حضور اليوم', stats.attendanceToday ?? 0)}${stat('إيراد الشهر', formatMoney(stats.revenueMonth ?? 0))}</div><div class="profile-section-grid"><article class="profile-section"><h3>بيانات الجيم</h3>${detailRows([['Tenant ID', tenant.id],['Slug', tenant.slug],['الحالة', statusLabel(tenant.status)],['تاريخ الإنشاء', formatDate(tenant.createdAt)],['آخر تحديث', formatDateTime(tenant.updatedAt)],['هاتف الاتصال', tenant.contactPhone]])}</article><article class="profile-section"><h3>Owner والاشتراك</h3>${detailRows([['Owner', tenant.owner?.name],['البريد', tenant.owner?.email],['آخر دخول', formatDateTime(tenant.owner?.lastLoginAt)],['الباقة', sub?.plan?.name],['حالة الاشتراك', statusLabel(sub?.status)],['ينتهي في', sub?.expiresAt ? `${formatDate(sub.expiresAt)} (${sub.daysRemaining} يوم)` : 'Lifetime']])}</article></div>`);
    }

    function profileSubscriptionPanel(profile) {
        const sub = profile.subscription;
        const changes = profile.scheduledChanges || [];
        const plan = sub?.plan;
        return profilePanel('subscription', `<div class="profile-grid">${stat('الباقة الحالية', plan?.name || '—')}${stat('الحالة', statusLabel(sub?.status))}${stat('الأيام المتبقية', sub?.daysRemaining ?? '∞')}${stat('السعر المثبت', formatMoney(sub?.priceSnapshot ?? plan?.price ?? 0, sub?.currencySnapshot || plan?.currency))}</div><div class="profile-section-grid"><article class="profile-section"><h3>تفاصيل الاشتراك</h3>${detailRows([['البداية', formatDate(sub?.startsAt)],['النهاية', sub?.expiresAt ? formatDate(sub.expiresAt) : 'Lifetime'],['المصدر', sub?.source],['التجديد', sub?.renewalStatus],['ملاحظات', sub?.notes]])}<div class="profile-actions" style="margin-top:16px">${profileActionButton('تفعيل / Trial إلى Paid','subscription')}${profileActionButton('منح Lifetime','lifetime')}${profileActionButton('إيقاف الاشتراك','subscription-suspend','danger')}</div></article><article class="profile-section"><h3>تغييرات مجدولة</h3>${changes.length ? `<div class="note-list">${changes.map((change) => `<div class="note-item"><p>${escapeHtml(change.plan?.name)} · ${escapeHtml(statusLabel(change.status))}</p><small>${escapeHtml(formatDate(change.effectiveAt))} · ${escapeHtml(change.reason)}</small></div>`).join('')}</div>` : '<div class="empty-inline">لا توجد تغييرات مجدولة.</div>'}</article></div>`);
    }

    function profileUsagePanel(profile) {
        const usage = profile.tenant?.usage || {};
        const entitlements = profile.entitlements || {};
        const rows = usage.rows || [];
        const featureNames = { intelligence: 'الذكاء التشغيلي', coaching: 'التدريب والتغذية', store: 'المتجر', reports: 'التقارير', portal: 'بوابة المشترك', prioritySupport: 'دعم أولوية' };
        return profilePanel('usage', `<div class="profile-section-grid"><article class="profile-section"><h3>الاستهلاك مقابل الحدود</h3><div class="limit-list">${rows.map((row) => `<div class="limit-row ${row.percent >= 100 ? 'reached' : row.percent >= 80 ? 'near' : ''}"><div class="limit-row-head"><span>${escapeHtml(row.label)}</span><b>${escapeHtml(row.key === 'storage' ? formatBytes(row.used) : row.used)} / ${escapeHtml(row.max == null ? '∞' : row.key === 'storage' ? formatBytes(row.max) : row.max)}</b></div><span class="progress-track"><i style="width:${row.percent}%"></i></span></div>`).join('')}</div></article><article class="profile-section"><div class="card-heading"><h3>المزايا الفعالة</h3>${profileActionButton('إضافة Override','override')}</div><div class="feature-list">${Object.entries(featureNames).map(([key,label]) => `<span class="feature-chip ${entitlements.features?.[key] === false ? 'off' : ''}">${entitlements.features?.[key] === false ? '×' : '✓'} ${escapeHtml(label)}</span>`).join('')}</div><div style="margin-top:18px">${detailRows([['الباقة الأساسية', entitlements.plan?.name || profile.subscription?.plan?.name],['استثناءات مخصصة', entitlements.overrides ? 'مفعلة' : 'لا توجد'],['ملاحظات الاستثناء', entitlements.overrides?.notes || '—']])}</div></article></div>`);
    }

    function profileUsersPanel(profile) {
        const users = profile.users || [];
        return profilePanel('users', `<div class="profile-section profile-wide"><div class="card-heading"><div><h3>Owner والمستخدمون</h3><p>يمكن تعطيل حساب مستخدم أو إبطال جلساته دون تعديل بيانات الجيم التشغيلية.</p></div>${profileActionButton('تغيير / إضافة Owner','owner','primary')}</div><div class="table-scroll"><table class="profile-table"><thead><tr><th>المستخدم</th><th>الدور</th><th>الحالة</th><th>آخر دخول</th><th>إجراء</th></tr></thead><tbody>${users.length ? users.map((user) => `<tr><td><strong>${escapeHtml(user.name)}</strong><br><small>${escapeHtml(user.email)}</small></td><td>${escapeHtml(user.role)}</td><td>${statusPill(user.status === 'active' ? 'active' : user.status)}</td><td>${escapeHtml(formatDateTime(user.lastLoginAt))}</td><td><button class="table-action" type="button" data-user-action="${user.status === 'Disabled' ? 'enable' : 'disable'}" data-user-id="${user.id}">${user.status === 'Disabled' ? 'تفعيل' : 'تعطيل'}</button> <button class="table-action" type="button" data-user-action="reset" data-user-id="${user.id}">Reset Password</button></td></tr>`).join('') : '<tr><td colspan="5">لا يوجد مستخدمون.</td></tr>'}</tbody></table></div></div>`);
    }

    function profileDataPanel(profile) {
        const stats = profile.stats || {};
        return profilePanel('data', `<div class="profile-grid">${stat('إجمالي المشتركين', stats.members ?? 0)}${stat('عضويات منتهية', stats.expiredMemberships ?? 0)}${stat('حضور الشهر', stats.attendanceMonth ?? 0)}${stat('مصروفات الشهر', formatMoney(stats.expensesMonth ?? 0))}${stat('مبيعات المتجر', stats.storeSalesMonth ?? 0)}${stat('المنتجات', stats.products ?? 0)}${stat('برامج التدريب', stats.workoutPrograms ?? 0)}${stat('خطط التغذية', stats.dietPlans ?? 0)}</div><div class="profile-section-grid"><article class="profile-section"><h3>ملخص مالي</h3>${detailRows([['إيراد الشهر', formatMoney(stats.revenueMonth)],['مصروفات الشهر', formatMoney(stats.expensesMonth)],['صافي تقريبي', formatMoney(Number(stats.revenueMonth || 0) - Number(stats.expensesMonth || 0))]])}</article><article class="profile-section"><h3>نشاط البوابة</h3>${detailRows([['تقييمات / Feedback', stats.portalFeedback],['حضور اليوم', stats.attendanceToday],['حضور الشهر', stats.attendanceMonth]])}</article></div>`);
    }

    function profilePaymentsPanel(profile) {
        const requests = profile.payments || [];
        return profilePanel('payments', `<div class="profile-section profile-wide"><h3>طلبات الاشتراك وإثباتات الدفع</h3><div class="table-scroll"><table class="profile-table"><thead><tr><th>الباقة</th><th>المبلغ</th><th>الحالة</th><th>الإثبات</th><th>التاريخ</th><th></th></tr></thead><tbody>${requests.length ? requests.map((request) => `<tr><td>${escapeHtml(request.plan?.name || '—')}</td><td>${escapeHtml(formatMoney(request.amount, request.currency))}</td><td>${statusPill(request.status)}</td><td>${request.proof ? `<a class="table-action" target="_blank" rel="noreferrer" href="/api/platform-admin/payment-proofs/${request.proof.id}/file">معاينة آمنة</a><br><small>${escapeHtml(request.proof.fileName)}</small>` : '—'}</td><td>${escapeHtml(formatDate(request.createdAt))}</td><td>${request.status === 'pending' ? `<button class="table-action" type="button" data-request-action="approve" data-request-id="${request.id}">قبول</button> <button class="table-action" type="button" data-request-action="reject" data-request-id="${request.id}">رفض</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6">لا توجد طلبات اشتراك.</td></tr>'}</tbody></table></div></div>`);
    }

    function profileHealthPanel(profile) {
        const health = profile.health || {};
        const accessDetails = detailRows([
            ['Database', health.database?.status],
            ['RLS', health.rls?.status],
            ['سياسة RLS', `${health.rls?.enabled || 0} / ${health.rls?.policies || 0}`],
            ['Last successful request', formatDateTime(health.lastSuccessfulRequest)],
            ['Last login', formatDateTime(health.lastLogin)]
        ]);
        const assetDetails = detailRows([
            ['Last backup', formatDateTime(health.lastBackup)],
            ['Storage', `${formatBytes(health.storage?.usedBytes)} / ${health.storage?.maxBytes ? formatBytes(health.storage.maxBytes) : '∞'}`],
            ['AI', `${health.ai?.used || 0} / ${health.ai?.max ?? '∞'}`],
            ['حالة التخزين', health.storage?.status],
            ['حالة AI', health.ai?.status]
        ]);
        return profilePanel('health', `<div class="profile-grid">${stat('Database', health.database?.status || '—')}${stat('RLS', health.rls?.status || '—')}${stat('Subscription', health.subscriptionEnforcement?.status || '—')}${stat('أخطاء 24 ساعة', health.errorsLast24Hours ?? 0)}</div><div class="profile-section-grid"><article class="profile-section"><h3>صحة الوصول والبنية</h3>${accessDetails}</article><article class="profile-section"><h3>التخزين والنسخ والذكاء</h3>${assetDetails}</article></div>`);
    }

    function profileAuditPanel(profile) {
        const audit = profile.audit || [];
        return profilePanel('audit', `<div class="profile-section profile-wide"><h3>سجل الجيم</h3><div class="audit-list">${audit.length ? audit.map((item) => `<div class="audit-item"><p>${escapeHtml(item.action)} · ${escapeHtml(item.details)}</p><small>${escapeHtml(item.actorName || 'System')} · ${escapeHtml(formatDateTime(item.createdAt))}${item.reason ? ` · السبب: ${escapeHtml(item.reason)}` : ''}</small></div>`).join('') : '<div class="empty-inline">لا توجد عمليات مسجلة.</div>'}</div></div>`);
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

    async function openTenant(id) {
        try {
            state.profileTab = 'overview';
            renderProfile(await api(`/api/platform-admin/tenants/${id}`));
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
        try { state.requests = (await api(`/api/platform-admin/subscription-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`)).requests || []; renderRequests(); } catch (error) { showToast(error.message, true); }
    }

    function renderRequests() {
        $('#requestsTableBody').innerHTML = state.requests.length ? state.requests.map((request) => `<tr><td><span class="tenant-cell"><strong>${escapeHtml(request.tenantName || '—')}</strong><small>${escapeHtml(request.tenantSlug || '')}</small></span></td><td>${escapeHtml(request.plan?.name || '—')}</td><td>${escapeHtml(formatMoney(request.amount, request.currency))}</td><td>${request.proof ? `<a class="table-action" target="_blank" rel="noreferrer" href="/api/platform-admin/payment-proofs/${request.proof.id}/file">معاينة</a>` : 'لم يرفع'}</td><td>${statusPill(request.status)}</td><td>${escapeHtml(formatDate(request.createdAt))}</td><td>${request.status === 'pending' ? `<button class="table-action" data-request-action="approve" data-request-id="${request.id}" type="button">قبول</button> <button class="table-action" data-request-action="reject" data-request-id="${request.id}" type="button">رفض</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-inline">لا توجد طلبات.</div></td></tr>';
    }

    async function loadPlans() {
        try { state.plans = (await api('/api/platform-admin/plans')).plans || []; updatePlanFilter(); renderPlans(); } catch (error) { showToast(error.message, true); }
    }

    function renderPlans() {
        const featureNames = { intelligence: 'AI', coaching: 'Training & Nutrition', store: 'Store', reports: 'Reports', portal: 'Portal' };
        $('#plansGrid').innerHTML = state.plans.length ? state.plans.map((plan, index) => `<article class="plan-card ${index === 1 ? 'featured' : ''}"><div class="card-heading"><div><span class="eyebrow">${escapeHtml(plan.code)}</span><h3>${escapeHtml(plan.name)}</h3></div>${plan.isActive ? statusPill('active') : statusPill('archived')}</div><p>${escapeHtml(plan.description || 'باقة SaaS لمنصة الجيم.')}</p><div class="plan-price">${escapeHtml(formatMoney(plan.price, plan.currency))}<small> / ${escapeHtml(plan.billingPeriod === 'yearly' ? 'سنة' : 'شهر')}</small></div><div class="plan-limits"><span>المشتركون <b>${escapeHtml(plan.maxMembers ?? '∞')}</b></span><span>المستخدمون <b>${escapeHtml(plan.maxUsers ?? '∞')}</b></span><span>AI شهريًا <b>${escapeHtml(plan.maxAiGenerations ?? '∞')}</b></span><span>التخزين <b>${escapeHtml(plan.maxStorageMb ? `${plan.maxStorageMb} MB` : '∞')}</b></span></div><div class="plan-features">${Object.entries(featureNames).map(([key,label]) => `<span class="feature-chip ${plan.features?.[key] === false ? 'off' : ''}">${plan.features?.[key] === false ? '×' : '✓'} ${label}</span>`).join('')}</div><button class="platform-btn ghost plan-edit" type="button" data-plan-edit="${plan.id}">تعديل الباقة</button></article>`).join('') : '<div class="empty-inline">لا توجد باقات.</div>';
    }

    async function loadAudit() {
        try { state.audit = (await api('/api/platform-admin/audit?limit=200')).audit || []; $('#auditTableBody').innerHTML = state.audit.length ? state.audit.map((item) => `<tr><td>${escapeHtml(formatDateTime(item.createdAt))}</td><td>${escapeHtml(item.actorName || 'System')}</td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.tenantId || 'Platform')}</td><td>${escapeHtml(item.reason || '—')}</td><td>${escapeHtml(item.details || '')}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-inline">لا توجد عمليات.</div></td></tr>'; } catch (error) { showToast(error.message, true); }
    }

    function planOptions(selected = '') { return state.plans.map((plan) => `<option value="${plan.id}" ${String(plan.id) === String(selected) ? 'selected' : ''}>${escapeHtml(plan.name)} — ${escapeHtml(formatMoney(plan.price, plan.currency))}</option>`).join(''); }

    function dialogField(label, name, type = 'text', value = '', extra = '') { return `<label class="dialog-label"><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${type}" value="${escapeHtml(value)}" ${extra}></label>`; }
    function dialogSelect(label, name, options, extraClass = '') { return `<label class="dialog-label ${extraClass}"><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}">${options}</select></label>`; }

    function openDialog(type, payload = {}) {
        const profile = state.profile;
        const tenant = profile?.tenant || {};
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
            title = 'إضافة Gym جديد';
            body = `<div class="dialog-grid">${dialogField('اسم الجيم','name','text','','required')}${dialogField('Slug','slug','text','','pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required')}${dialogField('اسم الـOwner','ownerName','text','','required')}${dialogField('بريد الـOwner','ownerEmail','email','','required')}${dialogField('كلمة مرور الـOwner','ownerPassword','password','','minlength="8" required')}${dialogSelect('باقة التجربة','trialPlanCode',planOptions())}</div>`;
        } else if (type === 'owner') {
            title = 'إضافة أو تغيير Owner';
            body = `<p>مع تفعيل الاستبدال سيتم تحويل الـOwner الحالي إلى Assistant وإبطال جلساته.</p><div class="dialog-grid">${dialogField('الاسم','name','text','','required')}${dialogField('البريد','email','email','','required')}${dialogField('كلمة المرور','password','password','','minlength="8" required')}</div><label class="dialog-check"><input name="replaceExisting" type="checkbox"> استبدال الـOwner الحالي</label>${dialogField('السبب','reason','text','')}`;
        } else if (type === 'plan-edit') {
            const plan = state.plans.find((item) => String(item.id) === String(payload.planId)) || {};
            title = `تعديل باقة ${plan.name || ''}`;
            body = `<div class="dialog-grid">${dialogField('اسم الباقة','name','text',plan.name || '','required')}${dialogField('السعر','price','number',plan.price || 0,'min="0" step="0.01" required')}${dialogSelect('الفترة','billingPeriod',`<option value="monthly" ${plan.billingPeriod === 'monthly' ? 'selected' : ''}>شهري</option><option value="yearly" ${plan.billingPeriod === 'yearly' ? 'selected' : ''}>سنوي</option>`)}${dialogField('حد المشتركين','maxMembers','number',plan.maxMembers || '')}${dialogField('حد المستخدمين','maxUsers','number',plan.maxUsers || '')}${dialogField('حد AI','maxAiGenerations','number',plan.maxAiGenerations || '')}${dialogField('التخزين MB','maxStorageMb','number',plan.maxStorageMb || '')}</div><label class="dialog-check"><input name="isActive" type="checkbox" ${plan.isActive ? 'checked' : ''}> الباقة مفعلة للاشتراكات الجديدة</label>`;
            body += dialogField('سبب تعديل الباقة', 'reason', 'text', '', 'required');
        } else if (type === 'reject') {
            title = 'رفض طلب الاشتراك';
            body = `${dialogField('سبب الرفض','reason','text','','required')}`;
        }
        $('#platformDialogTitle').textContent = title;
        $('#platformDialogBody').innerHTML = body;
        dialogForm.dataset.action = action;
        dialogForm.dataset.payload = JSON.stringify(payload);
        dialog.showModal();
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
        const action = dialogForm.dataset.action;
        const payload = JSON.parse(dialogForm.dataset.payload || '{}');
        const values = formObject(dialogForm);
        const submit = $('#platformDialogSubmit');
        setLoading(submit, true);
        try {
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
            } else if (action === 'reset') {
                if (values.newPassword !== values.confirmPassword) throw new Error('كلمتا المرور غير متطابقتين.');
                await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/users/${payload.userId}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword: values.newPassword }) });
                showToast('تم تغيير كلمة المرور وإبطال الجلسات القديمة.'); dialog.close(); await refreshProfile();
            } else if (action === 'new-tenant') {
                const created = await api('/api/platform-admin/tenants', { method: 'POST', body: JSON.stringify(values) });
                showToast('تم إنشاء الجيم والـOwner وفترة التجربة.'); dialog.close(); state.tenantPage = 1; setView('gyms'); if (created.tenant?.id) setTimeout(() => openTenant(created.tenant.id), 250);
            } else if (action === 'owner') {
                await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/owner`, { method: 'POST', body: JSON.stringify(values) });
                showToast('تم تحديث Owner الجيم.'); dialog.close(); await refreshProfile();
            } else if (action === 'plan-edit') {
                await api(`/api/platform-admin/plans/${payload.planId}`, { method: 'PATCH', body: JSON.stringify({ name: values.name, price: values.price, billingPeriod: values.billingPeriod, maxMembers: values.maxMembers || null, maxUsers: values.maxUsers || null, maxAiGenerations: values.maxAiGenerations || null, maxStorageMb: values.maxStorageMb || null, isActive: values.isActive, reason: values.reason }) });
                showToast('تم تحديث الباقة.'); dialog.close(); await loadPlans();
            } else if (action === 'reject') {
                await api(`/api/platform-admin/subscription-requests/${payload.requestId}/reject`, { method: 'POST', body: JSON.stringify({ reason: values.reason }) });
                showToast('تم رفض الطلب وتسجيل السبب.'); dialog.close(); await loadRequests();
            }
        } catch (error) { showToast(error.message, true); } finally { setLoading(submit, false); }
    }

    async function refreshProfile() {
        if (!state.profile?.tenant?.id) return;
        await openTenant(state.profile.tenant.id);
        loadDashboard();
    }

    async function handleRequestAction(action, requestId) {
        try {
            if (action === 'reject') { openDialog('reject', { requestId }); return; }
            if (!window.confirm('سيتم تفعيل الاشتراك بعد قبول إثبات الدفع. هل تريد المتابعة؟')) return;
            await api(`/api/platform-admin/subscription-requests/${requestId}/approve`, { method: 'POST', body: JSON.stringify({ reviewNotes: 'تمت الموافقة من لوحة المنصة.' }) });
            showToast('تم قبول الطلب وتفعيل الاشتراك.');
            if (state.view === 'requests') await loadRequests();
            if (state.profile) await refreshProfile();
            loadDashboard();
        } catch (error) { showToast(error.message, true); }
    }

    function bindEvents() {
        $$('#platformNav [data-platform-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.platformView)));
        $$('[data-platform-view-target]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.platformViewTarget)));
        $('#platformAdminLogoutButton').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); window.location.reload(); });
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
        [['tenantStatusFilter','status'],['tenantPlanFilter','plan'],['tenantExpiryFilter','expiringDays']].forEach(([id,key]) => $(`#${id}`).addEventListener('change', (event) => { state.tenantFilters[key] = event.target.value; state.tenantPage = 1; loadTenants(); }));
        $('#requestStatusFilter').addEventListener('change', loadRequests);
        $('#platformGlobalSearch').addEventListener('input', (event) => { if (state.view !== 'gyms') setView('gyms'); $('#tenantSearch').value = event.target.value; state.tenantFilters.search = event.target.value; state.tenantPage = 1; clearTimeout(searchTimer); searchTimer = setTimeout(loadTenants, 260); });
        $('[data-platform-action="refresh-dashboard"]').addEventListener('click', loadDashboard);
        $('[data-platform-action="refresh-requests"]').addEventListener('click', loadRequests);
        $('#platformMobileMenu').addEventListener('click', () => $('.platform-sidebar').classList.toggle('open'));
        $('#platformMobileMenu').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') $('.platform-sidebar').classList.toggle('open'); });
        dialogForm.addEventListener('submit', handleDialogSubmit);
        document.addEventListener('click', async (event) => {
            const platformAction = event.target.closest('[data-platform-action]');
            if (platformAction?.dataset.platformAction === 'new-tenant') { openDialog('new-tenant'); return; }
            const openButton = event.target.closest('[data-open-tenant]');
            if (openButton) { setView('gyms'); await openTenant(openButton.dataset.openTenant); return; }
            const pageButton = event.target.closest('[data-tenant-page]');
            if (pageButton) { state.tenantPage = Number(pageButton.dataset.tenantPage); loadTenants(); return; }
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
                if (action === 'more') { openDialog('status', { status: 'archived' }); return; }
            }
            const userAction = event.target.closest('[data-user-action]');
            if (userAction) {
                const userId = userAction.dataset.userId;
                if (userAction.dataset.userAction === 'reset') { openDialog('reset', { userId }); return; }
                try { await api(`/api/platform-admin/tenants/${state.profile.tenant.id}/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ status: userAction.dataset.userAction === 'enable' ? 'Active' : 'Disabled' }) }); showToast('تم تحديث حالة المستخدم.'); await refreshProfile(); } catch (error) { showToast(error.message, true); }
            }
            const requestAction = event.target.closest('[data-request-action]');
            if (requestAction) await handleRequestAction(requestAction.dataset.requestAction, requestAction.dataset.requestId);
            const planEdit = event.target.closest('[data-plan-edit]');
            if (planEdit) openDialog('plan-edit', { planId: planEdit.dataset.planEdit });
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
