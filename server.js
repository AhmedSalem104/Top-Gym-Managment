require('dotenv').config();

const path = require('node:path');
const express = require('express');
const { createApp } = require('./src/app');
const { config } = require('./src/config/env');
const { asyncRoute } = require('./src/utils/async-route');
const { registerRoutes } = require('./src/routes');
const { isAuthorizedCronRequest } = require('./src/middleware/cron.middleware');
const { createAuthApiMiddleware, ownerOnly } = require('./src/middleware/auth.middleware');
const { createBackupActionRateLimit, createLoginAttemptGuard, createSensitiveRateLimit, createMembershipPortalRateLimit } = require('./src/middleware/rate-limit.middleware');
const { closePool, getPool, initDatabase } = require('./src/database');
const backupService = require('./src/services/backup-service');
const { createConfiguredObjectStorageService } = require('./src/services/object-storage-service');
const { createBackupRecoveryService } = require('./src/services/backup-recovery-service');
const financeService = require('./src/services/finance-service');
const analyticsService = require('./src/services/analytics-service');
const reportService = require('./src/services/report-service');
const attendanceService = require('./src/services/attendance-service');
const libraryService = require('./src/services/library-service');
const { ensureLibraryData } = libraryService;
const memberService = require('./src/services/member-service');
const pricingService = memberService;
const coachingService = require('./src/services/coaching-service');
const trainerService = require('./src/services/trainer-service');
const trainerCommerceService = require('./src/services/trainer-commerce-service');
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
const branchService = require('./src/services/branch-service');
const stockLocationService = require('./src/services/stock-location-service');
const barService = require('./src/services/bar-service');
const saasService = require('./src/services/saas-service');
const commercialSchema = require('./src/services/commercial-schema');
const commercialService = require('./src/services/commercial-service');
const memberSubscriptionService = require('./src/services/member-subscription-service');
const { createGymRegistrationService } = require('./src/services/gym-registration-service');
const platformAdminService = require('./src/services/platform-admin-service');
const { runTenantContext } = require('./src/tenancy/tenant-context');
const { ensureAuthReady } = authService;
const { createPerformanceMetrics } = require('./src/middleware/performance-metrics');
const { READ_ONLY_METHODS, readOnlyBaselineGuard } = require('./src/middleware/read-only-baseline.middleware');
const { getClientErrorCode, getSafeErrorMessage, isPublicClientError, safeErrorCode } = require('./src/utils/error-response');

const objectStorageService = createConfiguredObjectStorageService({
    driver: config.objectStorageDriver,
    rootDir: config.objectStoragePath,
    nodeEnv: config.nodeEnv,
    endpoint: config.objectStorageEndpoint,
    bucket: config.objectStorageBucket,
    region: config.objectStorageRegion,
    accessKeyId: config.objectStorageAccessKeyId,
    secretAccessKey: config.objectStorageSecretAccessKey,
    sessionToken: config.objectStorageSessionToken,
    forcePathStyle: config.objectStorageForcePathStyle,
    requestTimeoutMs: config.objectStorageRequestTimeoutMs
});
const backupRecoveryService = createBackupRecoveryService({ storageService: objectStorageService });
// All durable private files use the same provider-neutral storage boundary.
// The services keep their existing APIs; this wiring only changes where new
// branding/payment-proof bytes are persisted when the provider is configured.
brandingService.configureObjectStorageService(objectStorageService);
saasService.configureObjectStorageService(objectStorageService);
memberSubscriptionService.configureObjectStorageService(objectStorageService);
const gymRegistrationService = createGymRegistrationService({
    commercialService,
    saasService,
    trainerService,
    trainerCommerceService,
    authService,
    objectStorageService
});

let httpServer;
let shutdownStarted = false;

function isReadOnlyRequest(request) {
    return request.readOnlyRequest !== undefined
        ? Boolean(request.readOnlyRequest)
        : READ_ONLY_METHODS.has(request.method);
}

const publicDirectory = path.join(__dirname, 'public');
const app = createApp({ publicDirectory, expressFactory: express });
app.use(readOnlyBaselineGuard);
app.use(createPerformanceMetrics({ enabled: config.performanceMetricsEnabled }));

const sensitiveRateLimit = createSensitiveRateLimit();
const membershipPortalRateLimit = createMembershipPortalRateLimit();
const backupActionRateLimit = createBackupActionRateLimit();
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
    <script defer src="/js/branding.js?v=5"></script>
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
    backupRecoveryService,
    objectStorageService,
    backupActionRateLimit,
    isAuthorizedCronRequest: (request) => isAuthorizedCronRequest(request, { config }),
    financeService,
    analyticsService,
    reportService,
    attendanceService,
    libraryService,
    pricingService,
    coachingService,
    trainerService,
    trainerCommerceService,
    dayPassService,
    memberService,
    membershipCodeService,
    portalService: memberPortalService,
    commercialService,
    memberSubscriptionService,
    gymRegistrationService,
    feedbackService: memberFeedbackService,
    storeService,
    intelligenceService,
    brandingService,
    saasService,
    platformAdminService,
    branchService,
    stockLocationService,
    barService,
    getPool
});

app.get('/qr/:id', asyncRoute(async (request, response) => {
    const readOnly = isReadOnlyRequest(request);
    const tenant = await tenantService.resolvePublicTenant(request.query?.tenant || request.get('x-gym-slug') || '', { readOnly });
    if (!tenant) return response.status(404).send('Gym not found.');
    const member = await runTenantContext({ tenantId: tenant.id, mode: 'public', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, () => memberService.getMemberById(request.params.id));
    response.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Robots-Tag': 'noindex, nofollow'
    });
    response.type('html').send(renderQrMemberPage(member, tenant.slug));
}));

async function sendPlatformAdminPage(request, response) {
    const user = await authService.getSessionUser(authService.readSessionCookie(request), { includePermissions: false, readOnly: isReadOnlyRequest(request) });
    if (user && user.role !== 'PlatformAdmin') {
        return response.status(403).sendFile(path.join(publicDirectory, 'platform-admin-forbidden.html'));
    }
    return response.sendFile(path.join(publicDirectory, 'platform-admin.html'));
}

app.get(['/platform-admin', '/platform-admin/', '/admin-panel', '/admin-panel/'], asyncRoute(sendPlatformAdminPage));

app.get('/', asyncRoute(async (request, response, next) => {
    if (isPlatformAdminHost(request)) return sendPlatformAdminPage(request, response);
    const user = await authService.getSessionUser(authService.readSessionCookie(request), { includePermissions: false, readOnly: isReadOnlyRequest(request) });
    if (user?.role === 'PlatformAdmin') return response.redirect('/platform-admin');
    // Resolve the product surface at the server boundary as well as in the
    // browser. This prevents a trainer session from ever falling through to
    // the Gym shell when the client redirect is delayed, cached, or skipped.
    if (String(user?.tenantType || '').trim().toLowerCase() === 'independent_trainer' && !user.mustChangePassword) {
        return response.redirect('/trainer-workspace');
    }
    return next();
}));

app.get('/member-portal', (_request, response) => {
    response.sendFile(path.join(publicDirectory, 'member-portal.html'));
});

app.get('/register-gym', (_request, response) => {
    response.sendFile(path.join(publicDirectory, 'register-gym.html'));
});

app.get('/register-trainer', (_request, response) => {
    response.sendFile(path.join(publicDirectory, 'register-trainer.html'));
});

app.get('/trainer-workspace', (_request, response) => {
    response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.sendFile(path.join(publicDirectory, 'trainer-workspace.html'));
});

app.get('*', (request, response) => {
    response.sendFile(path.join(publicDirectory, 'index.html'));
});

app.use((error, request, response, next) => {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    const requestId = request.requestId || null;
    const publicError = isPublicClientError(error, statusCode);
    const clientErrorCode = getClientErrorCode(error, statusCode);
    console.error('[ERROR]', JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        method: request.method,
        path: request.path,
        statusCode,
        code: safeErrorCode(error, null),
        category: statusCode >= 500 ? 'internal_error' : 'request_error'
    }));
    const message = statusCode < 500 && error.expose === true
        ? error.message
        : 'حدث خطأ في الخادم. حاول مرة أخرى.';
    response.status(statusCode).json({
        error: getSafeErrorMessage(error, statusCode) || message,
        code: clientErrorCode,
        field: publicError ? error.field || null : null,
        memberName: publicError ? error.memberName || null : null,
        memberId: publicError ? error.memberId || null : null,
        attendance: publicError ? error.attendance || null : null,
        saas: publicError ? error.saas || null : null,
        requestId
    });
});

async function start() {
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => initDatabase());
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureTenantTables());
    const bootstrapTenant = await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureBootstrapTenant());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => backupRecoveryService.ensureRecoveryTables());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureSaasTables());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => commercialSchema.ensureCommercialTables());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => commercialService.ensureDefaultPlanTerms());
    await runTenantContext({ mode: 'tenant', tenantId: bootstrapTenant.id }, async () => {
        await ensureAuthReady();
        // Create every tenant table before the tenancy migration runs. The
        // catalog is seeded only after tenant_id and RLS are in place.
        await libraryService.ensureLibraryTables();
        await coachingService.ensureCoachingTables({ seedLibrary: false });
        await dayPassService.ensureDayPassTables();
        await membershipCodeService.ensureMembershipCodeStorage();
        await memberFeedbackService.ensureMemberFeedbackTable();
        await storeService.ensureStoreTables();
        await intelligenceService.ensureIntelligenceTables();
        await brandingService.ensureBrandingTables();
    });
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    await runTenantContext({ mode: 'tenant', tenantId: bootstrapTenant.id }, () => ensureLibraryData());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureBootstrapSubscription(bootstrapTenant.id));
    if (shutdownStarted) return null;
    const port = config.port;
    httpServer = app.listen(port, () => console.log(`Gym membership app is running on http://localhost:${port}`));
    return httpServer;
}

async function gracefulShutdown(signal = 'shutdown') {
    if (shutdownStarted) return;
    shutdownStarted = true;
    try {
        if (httpServer) {
            await new Promise((resolve, reject) => {
                httpServer.close((error) => {
                    if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') return reject(error);
                    resolve();
                });
            });
            httpServer = null;
        }
        await closePool();
    } catch (error) {
        console.error('[SHUTDOWN_ERROR]', JSON.stringify({ signal, code: safeErrorCode(error, 'shutdown_failed') }));
        process.exitCode = 1;
    }
}

if (require.main === module) {
    const handleSignal = (signal) => {
        void gracefulShutdown(signal);
    };
    process.once('SIGTERM', handleSignal);
    process.once('SIGINT', handleSignal);
    start().catch(async (error) => {
        console.error('[STARTUP_ERROR]', JSON.stringify({
            code: safeErrorCode(error, null),
            category: 'startup_failure'
        }));
        await gracefulShutdown('startup_failure');
        process.exitCode = 1;
    });
}

module.exports = app;
