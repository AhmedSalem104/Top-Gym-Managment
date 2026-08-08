require('dotenv').config();

const assert = require('node:assert/strict');
const app = require('../server');
const { closePool, initDatabase } = require('../src/db');

async function call(baseUrl, path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${body?.error || 'request failed'}`);
    return body;
}

(async () => {
    let server;
    let memberId;
    try {
        await initDatabase();
        server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        const suffix = Date.now();

        const health = await call(baseUrl, '/api/health');
        assert.equal(health.database, 'connected');
        const bootstrap = await call(baseUrl, '/api/bootstrap');
        assert.ok(Array.isArray(bootstrap.members));
        assert.ok(bootstrap.dashboard && bootstrap.dashboard.stats);
        assert.ok(bootstrap.pricing && bootstrap.pricing.plans);
        const pricing = await call(baseUrl, '/api/pricing');
        const pricingUpdate = await call(baseUrl, '/api/pricing', {
            method: 'PUT',
            body: JSON.stringify({
                plans: Object.entries(pricing.plans).map(([planCode, plan]) => ({
                    planCode,
                    planName: plan.label,
                    monthlyPrice: plan.monthlyPrice
                }))
            })
        });
        assert.deepEqual(pricingUpdate.plans, pricing.plans);
        const page = await fetch(`${baseUrl}/`);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /إدارة عضويات الجيم/);

        const created = await call(baseUrl, '/api/members', {
            method: 'POST',
            body: JSON.stringify({
                fullName: `Smoke Test ${suffix}`,
                phone: `010${String(suffix).slice(-8)}`,
                registrationDate: '2026-08-08',
                membershipType: 'monthly',
                membershipPlan: 'gym_only',
                startDate: '2026-08-08',
                endDate: '2026-09-07',
                discountAmount: 5,
                amountPaid: 150,
                paymentMethod: 'cash'
            })
        });
        memberId = created.member.id;
        assert.equal(created.member.membership.status, 'active');
        assert.equal(created.member.membership.amountDue, 300);
        assert.equal(created.member.membership.discountAmount, 5);
        assert.equal(created.member.membership.amountRemaining, 150);

        const edited = await call(baseUrl, `/api/members/${memberId}`, {
            method: 'PUT',
            body: JSON.stringify({
                fullName: `Edited Smoke Test ${suffix}`,
                phone: `010${String(suffix).slice(-8)}`,
                registrationDate: '2026-08-08',
                membershipType: 'monthly',
                membershipPlan: 'gym_only',
                startDate: '2026-08-08',
                endDate: '2026-09-07',
                discountAmount: 0,
                amountPaid: 150,
                paymentMethod: 'cash'
            })
        });
        assert.equal(edited.member.fullName, `Edited Smoke Test ${suffix}`);
        assert.equal(edited.member.membership.amountDue, 305);

        const frozen = await call(baseUrl, `/api/members/${memberId}/freeze`, {
            method: 'POST', body: JSON.stringify({ days: 2, reason: 'smoke test' })
        });
        assert.equal(frozen.member.membership.status, 'frozen');

        const resumed = await call(baseUrl, `/api/members/${memberId}/resume`, { method: 'POST' });
        assert.equal(resumed.member.membership.status, 'active');

        const paid = await call(baseUrl, `/api/memberships/${resumed.member.membership.id}/payments`, {
            method: 'POST', body: JSON.stringify({ listPrice: 305, discountAmount: 0, amountPaid: 305, paymentMethod: 'card' })
        });
        assert.equal(paid.member.membership.amountRemaining, 0);

        const renewed = await call(baseUrl, `/api/members/${memberId}/renew`, {
            method: 'POST', body: JSON.stringify({ membershipType: 'quarterly', membershipPlan: 'gym_cardio', discountAmount: 0, amountPaid: 1200, paymentMethod: 'transfer' })
        });
        assert.equal(renewed.member.membership.type, 'quarterly');
        assert.equal(renewed.member.membership.plan, 'gym_cardio');
        assert.equal(renewed.member.membership.amountDue, 1200);
        assert.equal(renewed.member.membership.amountRemaining, 0);

        const details = await call(baseUrl, `/api/members/${memberId}/details`);
        assert.equal(details.member.id, memberId);
        assert.equal(details.memberships.length, 2);
        assert.ok(details.events.length >= 6);

        const dashboard = await call(baseUrl, '/api/dashboard');
        assert.ok(Number.isInteger(dashboard.stats.total));
        console.log('SMOKE_TEST_OK');
    } finally {
        if (memberId && server) {
            try {
                const baseUrl = `http://127.0.0.1:${server.address().port}`;
                await call(baseUrl, `/api/members/${memberId}`, { method: 'DELETE' });
            } catch (_) { /* cleanup is best effort */ }
        }
        if (server) await new Promise((resolve) => server.close(resolve));
        await closePool();
    }
})().catch((error) => {
    console.error('SMOKE_TEST_FAILED:', error.message);
    process.exitCode = 1;
});
