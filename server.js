require('dotenv').config();

const express = require('express');
const path = require('node:path');
const { getPool, initDatabase } = require('./src/db');
const {
    createBackup,
    createScheduledBackupArchive,
    getBackupArchive,
    getBackupHistory,
    getScheduledBackupHistory,
    inspectBackupBuffer,
    recordBackupOperation,
    restoreBackup
} = require('./src/backup-service');
const { createExpense, deleteExpense, getMonthlyFinance, updateExpense } = require('./src/finance-service');
const { getDashboardAnalytics } = require('./src/analytics-service');
const { getReportData } = require('./src/report-service');
const { checkIn, checkOut, getAttendanceReport, getMemberAttendance, getTodayAttendance } = require('./src/attendance-service');
const {
    createLibraryItem,
    deleteLibraryItem,
    ensureLibraryData,
    getLibraryCollection,
    getLibraryItem,
    getLibraryOptions,
    updateLibraryItem
} = require('./src/library-service');
const {
    createMember,
    deleteMember,
    getBootstrap,
    getDashboard,
    getMemberById,
    getMemberDetails,
    getMembers,
    getPricingCatalog,
    createPricingPlan,
    createMembershipType,
    freezeMember,
    recordPayment,
    renewMember,
    resumeMember,
    updatePricingPlan,
    updateMembershipType,
    updatePricingCatalog,
    updatePricing,
    updateMember
} = require('./src/member-service');
const {
    addWorkoutSet,
    createDietPlan,
    createExternalTrainee,
    createMealLog,
    createMeasurement,
    createWorkoutProgram,
    deleteDietPlan,
    deleteMeasurement,
    deleteWorkoutProgram,
    endWorkoutSession,
    ensureCoachingTables,
    getClientOptions,
    getDietPlan,
    getDietPlans,
    getExternalTrainees,
    getMealLogs,
    getMeasurements,
    getTrainingOverview,
    getWorkoutProgram,
    getWorkoutPrograms,
    getWorkoutSession,
    getWorkoutSessions,
    setDietPlanStatus,
    setWorkoutProgramStatus,
    startWorkoutSession,
    updateDietPlan,
    updateClientBasic,
    updateMeasurement,
    updateWorkoutProgram
} = require('./src/coaching-service');

const app = express();
const publicDirectory = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Baseline browser protections. Camera access remains available for the QR scanner.
app.use((request, response, next) => {
    response.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(self), microphone=()'
    });
    next();
});

app.use(express.static(publicDirectory));

const sensitiveWindow = new Map();
let sensitiveWindowLastCleanup = 0;
function sensitiveRateLimit(request, response, next) {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return next();
    const now = Date.now();
    if (now - sensitiveWindowLastCleanup > 300_000) {
        for (const [entryKey, entry] of sensitiveWindow) {
            if (now - entry.startedAt >= 60_000) sensitiveWindow.delete(entryKey);
        }
        sensitiveWindowLastCleanup = now;
    }
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const current = sensitiveWindow.get(key);
    if (!current || now - current.startedAt >= 60_000) {
        sensitiveWindow.set(key, { startedAt: now, count: 1 });
        return next();
    }
    current.count += 1;
    if (current.count > 120) {
        response.set('Retry-After', '60');
        return response.status(429).json({ error: 'تم تجاوز عدد العمليات المسموح به مؤقتًا. حاول بعد دقيقة.' });
    }
    return next();
}
app.use('/api', sensitiveRateLimit);

function asyncRoute(handler) {
    return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

function isAuthorizedCronRequest(request) {
    const secret = String(process.env.CRON_SECRET || '').trim();
    const authorization = String(request.get('authorization') || '');
    if (secret) return authorization === `Bearer ${secret}`;
    if (String(request.get('user-agent') || '').toLowerCase() === 'vercel-cron/1.0') return true;
    return process.env.NODE_ENV !== 'production' && request.get('x-top-gym-cron-key') === 'daily-backup';
}

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
    <meta name="theme-color" content="#0f172a">
    <title>بيانات عضوية ${escapeHtml(member.fullName)}</title>
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 18px; color: #172033; background: radial-gradient(circle at 85% 5%, rgba(59,130,246,.2), transparent 32%), linear-gradient(135deg, #edf4fb, #f8fafc 52%, #e5edf7); font-family: Cairo, Tahoma, Arial, sans-serif; }
        .card { width: min(520px, 100%); overflow: hidden; border: 1px solid #dbe3ef; border-radius: 22px; background: rgba(255,255,255,.96); box-shadow: 0 22px 60px rgba(15,23,42,.14); }
        .head { padding: 22px 22px 18px; color: #fff; background: linear-gradient(120deg, #0f172a, #1e3a8a 64%, #155e75); }
        .brand { color: #bfdbfe; font-size: 11px; font-weight: 900; letter-spacing: 2px; direction: ltr; }
        h1 { margin: 7px 0 3px; font-size: 22px; line-height: 1.35; }
        .subtitle { margin: 0; color: #cbd5e1; font-size: 11px; }
        .body { padding: 18px; }
        .member { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding: 12px 13px; border: 1px solid #dbeafe; border-radius: 13px; background: #f8fbff; }
        .member strong { display: block; color: #0f172a; font-size: 16px; }
        .member span { display: block; margin-top: 3px; color: #64748b; direction: ltr; font-size: 11px; text-align: right; }
        .status { display: inline-flex; align-items: center; min-height: 27px; padding: 4px 9px; border-radius: 999px; font-size: 10px; font-weight: 900; white-space: nowrap; }
        .status.active { color: #047857; background: #d1fae5; }
        .status.expiring_soon { color: #b45309; background: #fef3c7; }
        .status.expired { color: #b91c1c; background: #fee2e2; }
        .status.frozen { color: #6d28d9; background: #ede9fe; }
        .status.unknown { color: #64748b; background: #f1f5f9; }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .item { display: grid; gap: 3px; min-width: 0; padding: 10px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
        .item span { color: #94a3b8; font-size: 10px; font-weight: 700; }
        .item strong { overflow: hidden; color: #334155; font-size: 11px; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }
        .item.balance { grid-column: 1 / -1; border-color: #fde68a; background: #fffbeb; }
        .item.balance strong { color: #b45309; direction: ltr; text-align: right; }
        .foot { padding: 12px 18px 16px; border-top: 1px solid #eef2f7; color: #94a3b8; font-size: 10px; text-align: center; }
        @media (max-width: 420px) { body { padding: 10px; } .head { padding: 18px 16px 15px; } h1 { font-size: 18px; } .body { padding: 13px; } .member { padding: 10px; } .member strong { font-size: 14px; } .grid { gap: 6px; } .item { padding: 8px; } }
    </style>
</head>
<body>
    <main class="card">
        <header class="head"><div class="brand">TOP GYM</div><h1>بيانات العضوية</h1><p class="subtitle">تم التعرف على رمز المشترك بنجاح</p></header>
        <section class="body">
            <div class="member"><div><strong>${escapeHtml(member.fullName || '—')}</strong><span>${escapeHtml(member.phone || '—')}</span></div><b class="status ${statusClass}">${escapeHtml(statusLabel)}</b></div>
            <div class="grid">
                <div class="item"><span>الباقة</span><strong>${escapeHtml(planLabel)}</strong></div>
                <div class="item"><span>النوع</span><strong>${escapeHtml(typeLabel)}</strong></div>
                <div class="item"><span>تاريخ البداية</span><strong>${escapeHtml(qrPageDate(membership.startDate))}</strong></div>
                <div class="item"><span>تاريخ الانتهاء</span><strong>${escapeHtml(qrPageDate(membership.effectiveEndDate || membership.endDate))}</strong></div>
                ${remaining > 0 ? `<div class="item balance"><span>المبلغ المتبقي</span><strong>${remaining.toFixed(2)} ج.م</strong></div>` : ''}
            </div>
        </section>
        <footer class="foot">نتمنى لك تجربة تدريب مميزة — TOP GYM</footer>
    </main>
</body>
</html>`;
}

app.get('/api/health', asyncRoute(async (request, response) => {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok;');
    response.json({ ok: true, database: 'connected' });
}));

app.get('/api/backup/daily', asyncRoute(async (request, response) => {
    if (!isAuthorizedCronRequest(request)) return response.status(401).json({ error: 'طلب الجدولة غير مصرح به.' });
    const result = await createScheduledBackupArchive({ format: 'bak' });
    response.json({ ok: true, scheduled: true, ...result });
}));

app.get('/api/backup/download', asyncRoute(async (request, response) => {
    const requestedFormat = String(request.query.format || 'json.gz').toLowerCase();
    if (!['json.gz', 'bak'].includes(requestedFormat)) {
        return response.status(400).json({ error: 'صيغة النسخة غير مدعومة. اختر .json.gz أو .bak.' });
    }
    const backup = await createBackup({ format: requestedFormat });
    await recordBackupOperation({
        operationType: 'download',
        fileName: backup.filename,
        sourceGeneratedAt: backup.generatedAt,
        tableCounts: backup.rowCounts,
        details: `تم إنشاء نسخة TOP GYM بصيغة .${backup.format} وتنزيلها على جهاز المستخدم.`
    }).catch((error) => console.warn('Unable to record backup download:', error.message));
    response.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Content-Type': backup.format === 'bak' ? 'application/octet-stream' : 'application/gzip',
        'Content-Disposition': `attachment; filename="${backup.filename}"`,
        'Content-Length': String(backup.buffer.length),
        'X-Content-Type-Options': 'nosniff'
    });
    response.send(backup.buffer);
}));

const backupUploadBody = express.raw({
    type: ['application/gzip', 'application/x-gzip', 'application/octet-stream'],
    limit: '25mb'
});

app.get('/api/backup/history', asyncRoute(async (request, response) => {
    const [operations, archives] = await Promise.all([
        getBackupHistory(request.query.limit),
        getScheduledBackupHistory(request.query.archiveLimit || 10)
    ]);
    response.json({ operations, archives });
}));

app.get('/api/backup/archives/:id', asyncRoute(async (request, response) => {
    const archive = await getBackupArchive(request.params.id);
    response.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Content-Type': archive.format === 'bak' ? 'application/octet-stream' : 'application/gzip',
        'Content-Disposition': `attachment; filename="${archive.fileName}"`,
        'Content-Length': String(archive.contentBytes),
        'X-Content-Type-Options': 'nosniff'
    });
    response.send(archive.content);
}));

app.post('/api/backup/inspect', backupUploadBody, asyncRoute(async (request, response) => {
    const fileName = String(request.get('X-BACKUP-FILENAME') || 'uploaded-backup.json.gz').slice(0, 260);
    try {
        const inspected = await inspectBackupBuffer(request.body);
        await recordBackupOperation({
            operationType: 'inspect',
            fileName,
            sourceGeneratedAt: inspected.generatedAt,
            tableCounts: inspected.tableCounts,
            details: 'تم التحقق من ضغط النسخة وبنيتها قبل الاسترجاع.'
        }).catch((error) => console.warn('Unable to record backup inspection:', error.message));
        return response.json({
            valid: true,
            generatedAt: inspected.generatedAt,
            timeZone: inspected.timeZone,
            compressedBytes: inspected.compressedBytes,
            jsonBytes: inspected.jsonBytes,
            rowCount: inspected.rowCount,
            tableCounts: inspected.tableCounts
        });
    } catch (error) {
        await recordBackupOperation({ operationType: 'inspect', fileName, status: 'failed', details: error.message }).catch((recordError) => console.warn('Unable to record failed backup inspection:', recordError.message));
        throw error;
    }
}));

app.post('/api/backup/restore', backupUploadBody, asyncRoute(async (request, response) => {
    if (String(request.get('X-TOP-GYM-RESTORE-CONFIRM') || '').toUpperCase() !== 'RESTORE') {
        return response.status(400).json({ error: 'يجب تأكيد عملية الاسترجاع من شاشة الإدارة.' });
    }
    const fileName = String(request.get('X-BACKUP-FILENAME') || 'uploaded-backup.json.gz').slice(0, 260);
    try {
        const result = await restoreBackup(request.body, { fileName });
        return response.json({ restored: true, ...result });
    } catch (error) {
        await recordBackupOperation({ operationType: 'restore', fileName, status: 'failed', details: error.message }).catch((recordError) => console.warn('Unable to record failed backup restore:', recordError.message));
        throw error;
    }
}));

app.get('/api/monthly-finance', asyncRoute(async (request, response) => {
    response.json(await getMonthlyFinance());
}));

app.post('/api/expenses', asyncRoute(async (request, response) => {
    const expense = await createExpense(request.body);
    response.status(201).json({ expense });
}));

app.put('/api/expenses/:id', asyncRoute(async (request, response) => {
    const expense = await updateExpense(request.params.id, request.body);
    response.json({ expense });
}));

app.delete('/api/expenses/:id', asyncRoute(async (request, response) => {
    await deleteExpense(request.params.id);
    response.status(204).send();
}));

app.get('/api/dashboard', asyncRoute(async (request, response) => {
    response.json(await getDashboard());
}));

app.get('/api/dashboard-analytics', asyncRoute(async (request, response) => {
    response.json(await getDashboardAnalytics(request.query.period));
}));

app.get('/api/library/options', asyncRoute(async (request, response) => {
    response.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=60');
    response.json(await getLibraryOptions());
}));

app.get('/api/library/:type', asyncRoute(async (request, response) => {
    response.set('Cache-Control', 'private, max-age=20, stale-while-revalidate=60');
    response.json(await getLibraryCollection(request.params.type, request.query));
}));

app.get('/api/library/:type/:id', asyncRoute(async (request, response) => {
    response.json({ item: await getLibraryItem(request.params.type, request.params.id) });
}));

app.post('/api/library/:type', asyncRoute(async (request, response) => {
    response.status(201).json({ item: await createLibraryItem(request.params.type, request.body) });
}));

app.put('/api/library/:type/:id', asyncRoute(async (request, response) => {
    response.json({ item: await updateLibraryItem(request.params.type, request.params.id, request.body) });
}));

app.delete('/api/library/:type/:id', asyncRoute(async (request, response) => {
    await deleteLibraryItem(request.params.type, request.params.id);
    response.status(204).send();
}));

app.get('/api/reports', asyncRoute(async (request, response) => {
    response.json(await getReportData(request.query));
}));

app.get('/api/attendance', asyncRoute(async (request, response) => {
    response.json(await getTodayAttendance({ date: request.query.date, search: request.query.search }));
}));

app.get('/api/attendance/report', asyncRoute(async (request, response) => {
    response.json(await getAttendanceReport(request.query));
}));

app.get('/api/attendance/member/:id', asyncRoute(async (request, response) => {
    response.json(await getMemberAttendance(request.params.id, request.query));
}));

app.post('/api/attendance/check-in', asyncRoute(async (request, response) => {
    response.status(201).json(await checkIn(request.body));
}));

app.post('/api/attendance/check-out', asyncRoute(async (request, response) => {
    response.json(await checkOut(request.body));
}));

app.get('/api/bootstrap', asyncRoute(async (request, response) => {
    response.json(await getBootstrap());
}));

app.get('/api/pricing', asyncRoute(async (request, response) => {
    response.json(await getPricingCatalog());
}));

app.put('/api/pricing', asyncRoute(async (request, response) => {
    const pricing = await updatePricingCatalog(request.body);
    response.json(pricing);
}));

app.put('/api/pricing/:planCode', asyncRoute(async (request, response) => {
    const pricing = await updatePricing(request.params.planCode, request.body);
    response.json(pricing);
}));

app.post('/api/pricing-plans', asyncRoute(async (request, response) => {
    const pricing = await createPricingPlan(request.body);
    response.status(201).json(pricing);
}));

app.put('/api/pricing-plans/:planCode', asyncRoute(async (request, response) => {
    const pricing = await updatePricingPlan(request.params.planCode, request.body);
    response.json(pricing);
}));

app.post('/api/membership-types', asyncRoute(async (request, response) => {
    const pricing = await createMembershipType(request.body);
    response.status(201).json(pricing);
}));

app.put('/api/membership-types/:typeCode', asyncRoute(async (request, response) => {
    const pricing = await updateMembershipType(request.params.typeCode, request.body);
    response.json(pricing);
}));

app.get('/api/external-trainees', asyncRoute(async (request, response) => {
    response.json(await getExternalTrainees({
        search: request.query.search,
        page: request.query.page,
        pageSize: request.query.pageSize
    }));
}));

app.post('/api/external-trainees', asyncRoute(async (request, response) => {
    response.status(201).json({ member: await createExternalTrainee(request.body) });
}));

app.get('/api/coaching/clients', asyncRoute(async (request, response) => {
    response.json({ clients: await getClientOptions({ search: request.query.search, limit: request.query.limit }) });
}));

app.get('/api/clients/:id/training-overview', asyncRoute(async (request, response) => {
    response.json(await getTrainingOverview(request.params.id));
}));

app.put('/api/clients/:id', asyncRoute(async (request, response) => {
    response.json({ member: await updateClientBasic(request.params.id, request.body) });
}));

app.get('/api/clients/:id/measurements', asyncRoute(async (request, response) => {
    response.json({ measurements: await getMeasurements(request.params.id) });
}));

app.post('/api/clients/:id/measurements', asyncRoute(async (request, response) => {
    response.status(201).json({ measurement: await createMeasurement(request.params.id, request.body) });
}));

app.put('/api/clients/:id/measurements/:measurementId', asyncRoute(async (request, response) => {
    response.json({ measurement: await updateMeasurement(request.params.id, request.params.measurementId, request.body) });
}));

app.delete('/api/clients/:id/measurements/:measurementId', asyncRoute(async (request, response) => {
    await deleteMeasurement(request.params.id, request.params.measurementId);
    response.status(204).send();
}));

function registerWorkoutRoutes(prefix) {
    app.get(`${prefix}`, asyncRoute(async (request, response) => {
        response.json({ programs: await getWorkoutPrograms({ memberId: request.query.memberId || request.query.clientId, search: request.query.search, status: request.query.status, level: request.query.level }) });
    }));
    app.get(`${prefix}/:id`, asyncRoute(async (request, response) => {
        response.json({ program: await getWorkoutProgram(request.params.id, request.query.memberId || request.query.clientId) });
    }));
    app.post(`${prefix}`, asyncRoute(async (request, response) => {
        response.status(201).json({ program: await createWorkoutProgram(request.body) });
    }));
    app.put(`${prefix}/:id`, asyncRoute(async (request, response) => {
        response.json({ program: await updateWorkoutProgram(request.params.id, request.body) });
    }));
    app.patch(`${prefix}/:id/status`, asyncRoute(async (request, response) => {
        response.json({ program: await setWorkoutProgramStatus(request.params.id, request.body?.status) });
    }));
    app.delete(`${prefix}/:id`, asyncRoute(async (request, response) => {
        await deleteWorkoutProgram(request.params.id);
        response.status(204).send();
    }));
}

function registerDietRoutes(prefix) {
    app.get(`${prefix}`, asyncRoute(async (request, response) => {
        response.json({ plans: await getDietPlans({ memberId: request.query.memberId || request.query.clientId, search: request.query.search, status: request.query.status }) });
    }));
    app.get(`${prefix}/:id`, asyncRoute(async (request, response) => {
        response.json({ plan: await getDietPlan(request.params.id, request.query.memberId || request.query.clientId) });
    }));
    app.post(`${prefix}`, asyncRoute(async (request, response) => {
        response.status(201).json({ plan: await createDietPlan(request.body) });
    }));
    app.put(`${prefix}/:id`, asyncRoute(async (request, response) => {
        response.json({ plan: await updateDietPlan(request.params.id, request.body) });
    }));
    app.patch(`${prefix}/:id/status`, asyncRoute(async (request, response) => {
        response.json({ plan: await setDietPlanStatus(request.params.id, request.body?.status) });
    }));
    app.delete(`${prefix}/:id`, asyncRoute(async (request, response) => {
        await deleteDietPlan(request.params.id);
        response.status(204).send();
    }));
}

registerWorkoutRoutes('/api/workoutprograms');
registerWorkoutRoutes('/api/workout-programs');
registerDietRoutes('/api/dietplans');
registerDietRoutes('/api/diet-plans');

app.post('/api/workoutsessions/start', asyncRoute(async (request, response) => {
    response.status(201).json({ session: await startWorkoutSession(request.body) });
}));

app.get('/api/workoutsessions', asyncRoute(async (request, response) => {
    response.json({ sessions: await getWorkoutSessions(request.query.memberId || request.query.clientId, request.query) });
}));

app.get('/api/workoutsessions/:id', asyncRoute(async (request, response) => {
    response.json({ session: await getWorkoutSession(request.params.id) });
}));

app.post('/api/workoutsessions/:id/sets', asyncRoute(async (request, response) => {
    response.status(201).json({ set: await addWorkoutSet(request.params.id, request.body) });
}));

app.post('/api/workoutsessions/:id/end', asyncRoute(async (request, response) => {
    response.json({ session: await endWorkoutSession(request.params.id, request.body) });
}));

app.post('/api/meal-logs', asyncRoute(async (request, response) => {
    response.status(201).json({ mealLog: await createMealLog(request.body) });
}));

app.get('/api/meal-logs', asyncRoute(async (request, response) => {
    response.json({ mealLogs: await getMealLogs(request.query.memberId || request.query.clientId, request.query) });
}));

app.get('/api/members', asyncRoute(async (request, response) => {
    response.json(await getMembers({
        search: request.query.search,
        status: request.query.status,
        sort: request.query.sort,
        page: request.query.page,
        pageSize: request.query.pageSize
    }));
}));

app.get('/api/members/:id/details', asyncRoute(async (request, response) => {
    response.json(await getMemberDetails(request.params.id));
}));

app.get('/api/members/:id', asyncRoute(async (request, response) => {
    response.json({ member: await getMemberById(request.params.id) });
}));

app.post('/api/members', asyncRoute(async (request, response) => {
    const member = await createMember(request.body);
    response.status(201).json({ member });
}));

app.put('/api/members/:id', asyncRoute(async (request, response) => {
    const member = await updateMember(request.params.id, request.body);
    response.json({ member });
}));

app.post('/api/members/:id/freeze', asyncRoute(async (request, response) => {
    const member = await freezeMember(request.params.id, request.body?.days, request.body?.reason);
    response.json({ member });
}));

app.post('/api/members/:id/resume', asyncRoute(async (request, response) => {
    const member = await resumeMember(request.params.id);
    response.json({ member });
}));

app.post('/api/members/:id/renew', asyncRoute(async (request, response) => {
    const member = await renewMember(request.params.id, request.body);
    response.json({ member });
}));

app.post('/api/members/:id/memberships', asyncRoute(async (request, response) => {
    const member = await renewMember(request.params.id, request.body);
    response.status(201).json({ member });
}));

app.post('/api/memberships/:id/payments', asyncRoute(async (request, response) => {
    const member = await recordPayment(request.params.id, request.body);
    response.json({ member });
}));

app.delete('/api/members/:id', asyncRoute(async (request, response) => {
    await deleteMember(request.params.id);
    response.status(204).send();
}));

app.get('/qr/:id', asyncRoute(async (request, response) => {
    const member = await getMemberById(request.params.id);
    response.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Robots-Tag': 'noindex, nofollow'
    });
    response.type('html').send(renderQrMemberPage(member));
}));

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
    await ensureLibraryData();
    await ensureCoachingTables();
    const port = Number(process.env.PORT || 3000);
    app.listen(port, () => console.log(`Gym membership app is running on http://localhost:${port}`));
}

if (require.main === module) {
    start().catch((error) => {
        console.error('Unable to start the application:', error.message);
        process.exitCode = 1;
    });
}

module.exports = app;
