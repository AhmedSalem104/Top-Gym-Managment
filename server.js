require('dotenv').config();

const express = require('express');
const path = require('node:path');
const { getPool, initDatabase } = require('./src/db');
const { createBackup } = require('./src/backup-service');
const { createExpense, deleteExpense, getMonthlyFinance, updateExpense } = require('./src/finance-service');
const { getDashboardAnalytics } = require('./src/analytics-service');
const { getReportData } = require('./src/report-service');
const {
    createUser,
    deleteUser,
    getAuditLog,
    getAuthContext,
    getAuthStatus,
    getUsers,
    login,
    logout,
    recordAudit,
    requirePermission,
    setupFirstManager,
    updateUser
} = require('./src/auth-service');
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

app.use('/api', (request, response, next) => {
    const publicPath = request.path === '/health' || request.path === '/auth/status'
        || request.path === '/auth/login' || request.path === '/auth/setup' || request.path === '/auth/logout';
    if (publicPath) return next();
    getAuthContext(request)
        .then((user) => {
            if (!user) return response.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
            request.auth = user;
            next();
        })
        .catch(next);
});

app.get('/api/health', asyncRoute(async (request, response) => {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok;');
    response.json({ ok: true, database: 'connected' });
}));

app.get('/api/auth/status', asyncRoute(async (request, response) => {
    response.json(await getAuthStatus(request));
}));

app.post('/api/auth/setup', asyncRoute(async (request, response) => {
    response.status(201).json({ user: await setupFirstManager(request.body, response) });
}));

app.post('/api/auth/login', asyncRoute(async (request, response) => {
    response.json({ user: await login(request.body, response) });
}));

app.post('/api/auth/logout', asyncRoute(async (request, response) => {
    await logout(response);
    response.status(204).send();
}));

app.get('/api/auth/users', requirePermission('users.manage'), asyncRoute(async (request, response) => {
    response.json({ users: await getUsers() });
}));

app.post('/api/auth/users', requirePermission('users.manage'), asyncRoute(async (request, response) => {
    const user = await createUser(request.body);
    await recordAudit(request.auth, 'user_created', 'user', user.id, { username: user.username, role: user.role });
    response.status(201).json({ user });
}));

app.put('/api/auth/users/:id', requirePermission('users.manage'), asyncRoute(async (request, response) => {
    const user = await updateUser(request.params.id, request.body);
    await recordAudit(request.auth, 'user_updated', 'user', user.id, { username: user.username, role: user.role, active: user.active });
    response.json({ user });
}));

app.delete('/api/auth/users/:id', requirePermission('users.manage'), asyncRoute(async (request, response) => {
    await deleteUser(request.params.id, request.auth.id);
    await recordAudit(request.auth, 'user_deactivated', 'user', request.params.id, {});
    response.status(204).send();
}));

app.get('/api/audit-log', requirePermission('audit.read'), asyncRoute(async (request, response) => {
    response.json({ audit: await getAuditLog(request.query.limit) });
}));

app.get('/api/backup/download', requirePermission('backup.download'), asyncRoute(async (request, response) => {
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

app.get('/api/monthly-finance', requirePermission('expenses.read'), asyncRoute(async (request, response) => {
    response.json(await getMonthlyFinance());
}));

app.post('/api/expenses', requirePermission('expenses.write'), asyncRoute(async (request, response) => {
    const expense = await createExpense(request.body);
    await recordAudit(request.auth, 'expense_created', 'expense', expense.id, { name: expense.name, amount: expense.amount });
    response.status(201).json({ expense });
}));

app.put('/api/expenses/:id', requirePermission('expenses.write'), asyncRoute(async (request, response) => {
    const expense = await updateExpense(request.params.id, request.body);
    await recordAudit(request.auth, 'expense_updated', 'expense', expense.id, { name: expense.name, amount: expense.amount });
    response.json({ expense });
}));

app.delete('/api/expenses/:id', requirePermission('expenses.delete'), asyncRoute(async (request, response) => {
    await deleteExpense(request.params.id);
    await recordAudit(request.auth, 'expense_deleted', 'expense', request.params.id, {});
    response.status(204).send();
}));

app.get('/api/dashboard', requirePermission('dashboard.read'), asyncRoute(async (request, response) => {
    response.json(await getDashboard());
}));

app.get('/api/dashboard-analytics', requirePermission('reports.read'), asyncRoute(async (request, response) => {
    response.json(await getDashboardAnalytics(request.query.period));
}));

app.get('/api/reports', requirePermission('reports.read'), asyncRoute(async (request, response) => {
    response.json(await getReportData(request.query));
}));

app.get('/api/bootstrap', requirePermission('dashboard.read'), asyncRoute(async (request, response) => {
    response.json(await getBootstrap());
}));

app.get('/api/pricing', requirePermission('settings.read'), asyncRoute(async (request, response) => {
    response.json(await getPricingCatalog());
}));

app.put('/api/pricing', requirePermission('settings.write'), asyncRoute(async (request, response) => {
    const pricing = await updatePricingCatalog(request.body);
    await recordAudit(request.auth, 'settings_updated', 'pricing', null, { kind: 'catalog' });
    response.json(pricing);
}));

app.put('/api/pricing/:planCode', requirePermission('settings.write'), asyncRoute(async (request, response) => {
    const pricing = await updatePricing(request.params.planCode, request.body);
    await recordAudit(request.auth, 'settings_updated', 'pricing', null, { kind: 'plan', code: request.params.planCode });
    response.json(pricing);
}));

app.post('/api/pricing-plans', requirePermission('settings.write'), asyncRoute(async (request, response) => {
    const pricing = await createPricingPlan(request.body);
    await recordAudit(request.auth, 'settings_created', 'pricing', null, { kind: 'plan', code: request.body?.planCode });
    response.status(201).json(pricing);
}));

app.put('/api/pricing-plans/:planCode', requirePermission('settings.write'), asyncRoute(async (request, response) => {
    const pricing = await updatePricingPlan(request.params.planCode, request.body);
    await recordAudit(request.auth, 'settings_updated', 'pricing', null, { kind: 'plan', code: request.params.planCode });
    response.json(pricing);
}));

app.post('/api/membership-types', requirePermission('settings.write'), asyncRoute(async (request, response) => {
    const pricing = await createMembershipType(request.body);
    await recordAudit(request.auth, 'settings_created', 'membership_type', null, { code: request.body?.typeCode });
    response.status(201).json(pricing);
}));

app.put('/api/membership-types/:typeCode', requirePermission('settings.write'), asyncRoute(async (request, response) => {
    const pricing = await updateMembershipType(request.params.typeCode, request.body);
    await recordAudit(request.auth, 'settings_updated', 'membership_type', null, { code: request.params.typeCode });
    response.json(pricing);
}));

app.get('/api/members', requirePermission('members.read'), asyncRoute(async (request, response) => {
    response.json(await getMembers({
        search: request.query.search,
        status: request.query.status,
        sort: request.query.sort,
        page: request.query.page,
        pageSize: request.query.pageSize
    }));
}));

app.get('/api/members/:id/details', requirePermission('members.read'), asyncRoute(async (request, response) => {
    response.json(await getMemberDetails(request.params.id));
}));

app.get('/api/members/:id', requirePermission('members.read'), asyncRoute(async (request, response) => {
    response.json({ member: await getMemberById(request.params.id) });
}));

app.post('/api/members', requirePermission('members.write'), asyncRoute(async (request, response) => {
    const member = await createMember(request.body);
    await recordAudit(request.auth, 'member_created', 'member', member.id, { fullName: member.fullName, phone: member.phone });
    response.status(201).json({ member });
}));

app.put('/api/members/:id', requirePermission('members.write'), asyncRoute(async (request, response) => {
    const member = await updateMember(request.params.id, request.body);
    await recordAudit(request.auth, 'member_updated', 'member', member.id, { fields: Object.keys(request.body || {}) });
    response.json({ member });
}));

app.post('/api/members/:id/freeze', requirePermission('members.write'), asyncRoute(async (request, response) => {
    const member = await freezeMember(request.params.id, request.body?.days, request.body?.reason);
    await recordAudit(request.auth, 'member_frozen', 'member', member.id, { days: request.body?.days, reason: request.body?.reason });
    response.json({ member });
}));

app.post('/api/members/:id/resume', requirePermission('members.write'), asyncRoute(async (request, response) => {
    const member = await resumeMember(request.params.id);
    await recordAudit(request.auth, 'member_resumed', 'member', member.id, {});
    response.json({ member });
}));

app.post('/api/members/:id/renew', requirePermission('members.write'), asyncRoute(async (request, response) => {
    const member = await renewMember(request.params.id, request.body);
    await recordAudit(request.auth, 'membership_renewed', 'member', member.id, { fields: Object.keys(request.body || {}) });
    response.json({ member });
}));

app.post('/api/memberships/:id/payments', requirePermission('members.write'), asyncRoute(async (request, response) => {
    const member = await recordPayment(request.params.id, request.body);
    await recordAudit(request.auth, 'payment_updated', 'membership', request.params.id, { amountPaid: request.body?.amountPaid, paymentMethod: request.body?.paymentMethod });
    response.json({ member });
}));

app.delete('/api/members/:id', requirePermission('members.delete'), asyncRoute(async (request, response) => {
    await deleteMember(request.params.id);
    await recordAudit(request.auth, 'member_deleted', 'member', request.params.id, {});
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
    response.status(statusCode).json({ error: message });
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
