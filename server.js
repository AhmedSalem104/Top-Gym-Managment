require('dotenv').config();

const path = require('node:path');
const express = require('express');
const { createApp } = require('./src/app');
const { config } = require('./src/config/env');
const { asyncRoute } = require('./src/utils/async-route');
const { registerRoutes } = require('./src/routes');
const { isAuthorizedCronRequest } = require('./src/middleware/cron.middleware');
const { createAuthApiMiddleware, ownerOnly } = require('./src/middleware/auth.middleware');
const { createLoginAttemptGuard, createSensitiveRateLimit, createMembershipPortalRateLimit } = require('./src/middleware/rate-limit.middleware');
const { getPool, initDatabase } = require('./src/database');
const backupService = require('./src/services/backup-service');
const financeService = require('./src/services/finance-service');
const analyticsService = require('./src/services/analytics-service');
const reportService = require('./src/services/report-service');
const attendanceService = require('./src/services/attendance-service');
const libraryService = require('./src/services/library-service');
const { ensureLibraryData } = libraryService;
const memberService = require('./src/services/member-service');
const pricingService = memberService;
const coachingService = require('./src/services/coaching-service');
const dayPassService = require('./src/services/day-pass-service');
const membershipCodeService = require('./src/services/membership-code-service');
const memberPortalService = require('./src/services/member-portal-service');
const memberFeedbackService = require('./src/services/member-feedback-service');
const storeService = require('./src/services/store-service');
const intelligenceService = require('./src/services/intelligence-service');
const brandingService = require('./src/services/branding-service');
const authService = require('./src/services/auth-service');
const permissionService = require('./src/services/permission-service');
const tenantService = require('./src/services/tenant-service');
const saasService = require('./src/services/saas-service');
const platformAdminService = require('./src/services/platform-admin-service');
const { runTenantContext } = require('./src/tenancy/tenant-context');
const { ensureAuthReady } = authService;
const { createPerformanceMetrics } = require('./src/middleware/performance-metrics');
const { readOnlyBaselineGuard } = require('./src/middleware/read-only-baseline.middleware');

const publicDirectory = path.join(__dirname, 'public');
const app = createApp({ publicDirectory, expressFactory: express });
app.use(readOnlyBaselineGuard);
app.use(createPerformanceMetrics({ enabled: config.performanceMetricsEnabled }));

const sensitiveRateLimit = createSensitiveRateLimit();
const membershipPortalRateLimit = createMembershipPortalRateLimit();
const allowLoginAttempt = createLoginAttemptGuard();
app.use('/api', sensitiveRateLimit);
app.use('/api/member-portal', membershipPortalRateLimit);
app.use('/api', createAuthApiMiddleware({
    authService,
    permissionService,
    tenantService,
    saasService,
    isAuthorizedCronRequest: (request) => isAuthorizedCronRequest(request, { config })
}));

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function normalizedHost(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split(':')[0];
}

function isPlatformAdminHost(request) {
    const configuredHosts = String(config.platformAdminHost || '')
        .split(',')
        .map(normalizedHost)
        .filter(Boolean);
    if (!configuredHosts.length) return false;
    const requestHost = normalizedHost(request.hostname || request.get('host'));
    return configuredHosts.includes(requestHost);
}

function qrPageDate(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function renderQrMemberPage(member, tenantSlug = '') {
    const membership = member.membership || {};
    const status = String(membership.status || '').toLowerCase();
    const statusLabels = { active: 'نشطة', expiring_soon: 'قريبة الانتهاء', expired: 'منتهية', frozen: 'مجمدة' };
    const planLabels = { gym_only: 'جيم فقط', gym_cardio: 'جيم وكارديو' };
    const typeLabels = { monthly: 'شهرية', half_month: 'نصف شهر', quarterly: 'ربع سنوية', semiannual: 'نصف سنوية', annual: 'سنوية' };
    const statusClass = ['active', 'expiring_soon', 'expired', 'frozen'].includes(status) ? status : 'unknown';
    const statusLabel = statusLabels[status] || 'بدون اشتراك';
    const planLabel = planLabels[membership.plan] || membership.plan || '—';
    const typeLabel = typeLabels[membership.type] || membership.type || '—';
    const remaining = Number(membership.amountRemaining || 0);
    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <meta name="theme-color" content="#f5f7fb">
    <script>
        (function () {
            try {
                var savedTheme = window.localStorage.getItem('topgym-theme');
                document.documentElement.dataset.theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';
            } catch (error) {
                document.documentElement.dataset.theme = 'light';
            }
        }());
    </script>
    <link rel="stylesheet" href="/css/main.css?v=64">
    <link rel="icon" type="image/svg+xml" href="/assets/gym-brand.svg?v=2" sizes="any">
    <title>بيانات عضوية ${escapeHtml(member.fullName)} | Logic Fit</title>
</head>
<body class="qr-member-page" data-branding-tenant="${escapeHtml(tenantSlug)}">
    <main class="qr-member-shell">
        <button class="theme-toggle-button" type="button" data-theme-toggle aria-pressed="false" title="تفعيل الوضع الداكن">
            <span aria-hidden="true">◐</span><span data-theme-toggle-label>الوضع الداكن</span>
        </button>
        <section class="qr-member-card">
            <header class="qr-member-head"><div class="qr-member-brand" data-brand-text="brandName">Logic Fit</div><h1>بيانات العضوية</h1><p>تم التعرف على رمز المشترك بنجاح</p></header>
            <section class="qr-member-body">
                <div class="qr-member-identity"><div><strong>${escapeHtml(member.fullName || '—')}</strong><span>${escapeHtml(member.phone || '—')}</span></div><b class="qr-member-status ${statusClass}">${escapeHtml(statusLabel)}</b></div>
            <div class="qr-member-grid">
                <div class="qr-member-item"><span>الباقة</span><strong>${escapeHtml(planLabel)}</strong></div>
                <div class="qr-member-item"><span>النوع</span><strong>${escapeHtml(typeLabel)}</strong></div>
                <div class="qr-member-item"><span>تاريخ البداية</span><strong>${escapeHtml(qrPageDate(membership.startDate))}</strong></div>
                <div class="qr-member-item"><span>تاريخ الانتهاء</span><strong>${escapeHtml(qrPageDate(membership.effectiveEndDate || membership.endDate))}</strong></div>
                ${remaining > 0 ? `<div class="qr-member-item"><span>المبلغ المتبقي</span><strong>${remaining.toFixed(2)} ج.م</strong></div>` : ''}
            </div>
        </section>
            <footer class="qr-member-foot">نتمنى لك تجربة تدريب مميزة — <span data-brand-text="brandName">Logic Fit</span></footer>
        </section>
    </main>
    <script defer src="/js/theme.js?v=1"></script>
    <script defer src="/js/branding.js?v=4"></script>
</body>
</html>`;
}

registerRoutes(app, {
    asyncRoute,
    authService,
    permissionService,
    ownerOnly,
    allowLoginAttempt,
    backupService,
    isAuthorizedCronRequest: (request) => isAuthorizedCronRequest(request, { config }),
    financeService,
    analyticsService,
    reportService,
    attendanceService,
    libraryService,
    pricingService,
    coachingService,
    dayPassService,
    memberService,
    membershipCodeService,
    portalService: memberPortalService,
    feedbackService: memberFeedbackService,
    storeService,
    intelligenceService,
    brandingService,
    saasService,
    platformAdminService,
    getPool
});

app.get('/qr/:id', asyncRoute(async (request, response) => {
    const tenant = await tenantService.resolvePublicTenant(request.query?.tenant || request.get('x-gym-slug') || '', { readOnly: request.readOnlyBaseline });
    if (!tenant) return response.status(404).send('Gym not found.');
    const member = await runTenantContext({ tenantId: tenant.id, mode: 'public', readOnlyBaseline: request.readOnlyBaseline }, () => memberService.getMemberById(request.params.id));
    response.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Robots-Tag': 'noindex, nofollow'
    });
    response.type('html').send(renderQrMemberPage(member, tenant.slug));
}));

async function sendPlatformAdminPage(request, response) {
    const user = await authService.getSessionUser(authService.readSessionCookie(request), { includePermissions: false, readOnly: request.readOnlyBaseline });
    if (user && user.role !== 'PlatformAdmin') {
        return response.status(403).sendFile(path.join(publicDirectory, 'platform-admin-forbidden.html'));
    }
    return response.sendFile(path.join(publicDirectory, 'platform-admin.html'));
}

app.get(['/platform-admin', '/platform-admin/', '/admin-panel', '/admin-panel/'], asyncRoute(sendPlatformAdminPage));

app.get('/', asyncRoute(async (request, response, next) => {
    if (isPlatformAdminHost(request)) return sendPlatformAdminPage(request, response);
    const user = await authService.getSessionUser(authService.readSessionCookie(request), { includePermissions: false, readOnly: request.readOnlyBaseline });
    if (user?.role === 'PlatformAdmin') return response.redirect('/platform-admin');
    return next();
}));

app.get('/member-portal', (_request, response) => {
    response.sendFile(path.join(publicDirectory, 'member-portal.html'));
});

app.get('*', (request, response) => {
    response.sendFile(path.join(publicDirectory, 'index.html'));
});

app.use((error, request, response, next) => {
    console.error(`[${new Date().toISOString()}]`, error);
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const message = error.expose || statusCode < 500
        ? error.message
        : 'حدث خطأ في الخادم. حاول مرة أخرى.';
    response.status(statusCode).json({
        error: message,
        code: error.code || null,
        field: error.field || null,
        memberName: error.memberName || null,
        memberId: error.memberId || null,
        attendance: error.attendance || null,
        saas: error.saas || null
    });
});

async function start() {
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => initDatabase());
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureTenantTables());
    const bootstrapTenant = await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureBootstrapTenant());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureSaasTables());
    await runTenantContext({ mode: 'tenant', tenantId: bootstrapTenant.id }, async () => {
        await ensureAuthReady();
        await ensureLibraryData();
        await coachingService.ensureCoachingTables();
        await dayPassService.ensureDayPassTables();
        await membershipCodeService.ensureMembershipCodeStorage();
        await memberFeedbackService.ensureMemberFeedbackTable();
        await storeService.ensureStoreTables();
        await intelligenceService.ensureIntelligenceTables();
        await brandingService.ensureBrandingTables();
    });
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureBootstrapSubscription(bootstrapTenant.id));
    const port = config.port;
    app.listen(port, () => console.log(`Gym membership app is running on http://localhost:${port}`));
}

if (require.main === module) {
    start().catch((error) => {
        console.error('Unable to start the application:', error.message);
        process.exitCode = 1;
    });
}

module.exports = app;
