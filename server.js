require('dotenv').config();

const express = require('express');
const path = require('node:path');
const { getPool, initDatabase } = require('./src/db');
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

app.get('/api/dashboard', asyncRoute(async (request, response) => {
    response.json(await getDashboard());
}));

app.get('/api/bootstrap', asyncRoute(async (request, response) => {
    response.json(await getBootstrap());
}));

app.get('/api/pricing', asyncRoute(async (request, response) => {
    response.json(await getPricingCatalog());
}));

app.put('/api/pricing', asyncRoute(async (request, response) => {
    response.json(await updatePricingCatalog(request.body));
}));

app.put('/api/pricing/:planCode', asyncRoute(async (request, response) => {
    response.json(await updatePricing(request.params.planCode, request.body));
}));

app.post('/api/pricing-plans', asyncRoute(async (request, response) => {
    response.status(201).json(await createPricingPlan(request.body));
}));

app.put('/api/pricing-plans/:planCode', asyncRoute(async (request, response) => {
    response.json(await updatePricingPlan(request.params.planCode, request.body));
}));

app.post('/api/membership-types', asyncRoute(async (request, response) => {
    response.status(201).json(await createMembershipType(request.body));
}));

app.put('/api/membership-types/:typeCode', asyncRoute(async (request, response) => {
    response.json(await updateMembershipType(request.params.typeCode, request.body));
}));

app.get('/api/members', asyncRoute(async (request, response) => {
    response.json(await getMembers({
        search: request.query.search,
        status: request.query.status,
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
    response.status(201).json({ member: await createMember(request.body) });
}));

app.put('/api/members/:id', asyncRoute(async (request, response) => {
    response.json({ member: await updateMember(request.params.id, request.body) });
}));

app.post('/api/members/:id/freeze', asyncRoute(async (request, response) => {
    response.json({ member: await freezeMember(request.params.id, request.body?.days, request.body?.reason) });
}));

app.post('/api/members/:id/resume', asyncRoute(async (request, response) => {
    response.json({ member: await resumeMember(request.params.id) });
}));

app.post('/api/members/:id/renew', asyncRoute(async (request, response) => {
    response.json({ member: await renewMember(request.params.id, request.body) });
}));

app.post('/api/memberships/:id/payments', asyncRoute(async (request, response) => {
    response.json({ member: await recordPayment(request.params.id, request.body) });
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
