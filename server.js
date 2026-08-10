require('dotenv').config();

const express = require('express');
const path = require('node:path');
const { getPool, initDatabase } = require('./src/db');
const { createBackup } = require('./src/backup-service');
const { createExpense, deleteExpense, getMonthlyFinance, updateExpense } = require('./src/finance-service');
const { getDashboardAnalytics } = require('./src/analytics-service');
const { getReportData } = require('./src/report-service');
const { checkIn, checkOut, getMemberAttendance, getTodayAttendance } = require('./src/attendance-service');
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

const app = express();
const publicDirectory = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(publicDirectory));

function asyncRoute(handler) {
    return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

app.get('/api/health', asyncRoute(async (request, response) => {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok;');
    response.json({ ok: true, database: 'connected' });
}));

app.get('/api/backup/download', asyncRoute(async (request, response) => {
    const backup = await createBackup();
    response.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${backup.filename}"`,
        'Content-Length': String(backup.buffer.length),
        'X-Content-Type-Options': 'nosniff'
    });
    response.send(backup.buffer);
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

app.get('/api/reports', asyncRoute(async (request, response) => {
    response.json(await getReportData(request.query));
}));

app.get('/api/attendance', asyncRoute(async (request, response) => {
    response.json(await getTodayAttendance({ date: request.query.date, search: request.query.search }));
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

app.post('/api/memberships/:id/payments', asyncRoute(async (request, response) => {
    const member = await recordPayment(request.params.id, request.body);
    response.json({ member });
}));

app.delete('/api/members/:id', asyncRoute(async (request, response) => {
    await deleteMember(request.params.id);
    response.status(204).send();
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
        attendance: error.attendance || null
    });
});

async function start() {
    await initDatabase();
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
