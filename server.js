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
const authService = require('./src/services/auth-service');
const permissionService = require('./src/services/permission-service');
const { ensureAuthReady } = authService;

const publicDirectory = path.join(__dirname, 'public');
const app = createApp({ publicDirectory, expressFactory: express });

const sensitiveRateLimit = createSensitiveRateLimit();
const membershipPortalRateLimit = createMembershipPortalRateLimit();
const allowLoginAttempt = createLoginAttemptGuard();
app.use('/api', sensitiveRateLimit);
app.use('/api/member-portal', membershipPortalRateLimit);
app.use('/api', createAuthApiMiddleware({
    authService,
    permissionService,
    isAuthorizedCronRequest: (request) => isAuthorizedCronRequest(request, { config })
}));

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function qrPageDate(value) {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : String(value);
}

function renderQrMemberPage(member) {
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
    <link rel="stylesheet" href="/css/main.css?v=44">
    <title>بيانات عضوية ${escapeHtml(member.fullName)}</title>
</head>
<body class="qr-member-page">
    <main class="qr-member-shell">
        <button class="theme-toggle-button" type="button" data-theme-toggle aria-pressed="false" title="تفعيل الوضع الداكن">
            <span aria-hidden="true">◐</span><span data-theme-toggle-label>الوضع الداكن</span>
        </button>
        <section class="qr-member-card">
            <header class="qr-member-head"><div class="qr-member-brand">TOP GYM</div><h1>بيانات العضوية</h1><p>تم التعرف على رمز المشترك بنجاح</p></header>
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
            <footer class="qr-member-foot">نتمنى لك تجربة تدريب مميزة — TOP GYM</footer>
        </section>
    </main>
    <script defer src="/js/theme.js?v=1"></script>
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
    getPool
});

app.get('/qr/:id', asyncRoute(async (request, response) => {
    const member = await memberService.getMemberById(request.params.id);
    response.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Robots-Tag': 'noindex, nofollow'
    });
    response.type('html').send(renderQrMemberPage(member));
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
        attendance: error.attendance || null
    });
});

async function start() {
    await initDatabase();
    await ensureAuthReady();
    await ensureLibraryData();
    await coachingService.ensureCoachingTables();
    await dayPassService.ensureDayPassTables();
    await membershipCodeService.ensureMembershipCodeStorage();
    await memberFeedbackService.ensureMemberFeedbackTable();
    await storeService.ensureStoreTables();
    await intelligenceService.ensureIntelligenceTables();
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
