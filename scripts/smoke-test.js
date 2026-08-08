require('dotenv').config();

const assert = require('node:assert/strict');
const app = require('../server');
const { closePool, getPool, initDatabase, sql } = require('../src/db');

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
    let temporaryPlanCode;
    let temporaryTypeCode;
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
        assert.ok(bootstrap.pagination && Number.isInteger(bootstrap.pagination.page));
        assert.equal(bootstrap.pricing.types.half_month.durationValue, 15);
        assert.equal(bootstrap.pricing.types.half_month.mode, 'days');
        const firstPage = await call(baseUrl, '/api/members?page=1&pageSize=1');
        assert.ok(firstPage.pagination && firstPage.pagination.pageSize === 1);
        assert.ok(firstPage.members.length <= 1);
        const filteredPage = await call(baseUrl, '/api/members?status=active&page=1&pageSize=5');
        assert.ok(filteredPage.pagination && filteredPage.members.length <= 5);
        const pricing = await call(baseUrl, '/api/pricing');
        const gymOnlyMonthly = Number(pricing.plans.gym_only.monthlyPrice);
        const cardioMonthly = Number(pricing.plans.gym_cardio.monthlyPrice);
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

        temporaryPlanCode = `smoke_plan_${String(Date.now()).slice(-14)}`;
        const createdPlan = await call(baseUrl, '/api/pricing-plans', {
            method: 'POST',
            body: JSON.stringify({
                planCode: temporaryPlanCode,
                planName: 'باقة اختبار مؤقتة',
                monthlyPrice: 777,
                sortOrder: 99
            })
        });
        assert.equal(createdPlan.plans[temporaryPlanCode].monthlyPrice, 777);
        assert.equal(createdPlan.plans[temporaryPlanCode].active, true);
        const updatedPlan = await call(baseUrl, `/api/pricing-plans/${temporaryPlanCode}`, {
            method: 'PUT',
            body: JSON.stringify({ monthlyPrice: 778, isActive: false, sortOrder: 100 })
        });
        assert.equal(updatedPlan.plans[temporaryPlanCode].monthlyPrice, 778);
        assert.equal(updatedPlan.plans[temporaryPlanCode].active, false);

        temporaryTypeCode = `smoke_${String(Date.now()).slice(-20)}`;
        const createdType = await call(baseUrl, '/api/membership-types', {
            method: 'POST',
            body: JSON.stringify({
                typeCode: temporaryTypeCode,
                typeName: 'نوع اختبار مؤقت',
                durationMode: 'days',
                durationValue: 10,
                priceMultiplier: 0.33,
                sortOrder: 99
            })
        });
        assert.equal(createdType.types[temporaryTypeCode].durationValue, 10);
        const updatedType = await call(baseUrl, `/api/membership-types/${temporaryTypeCode}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: false, durationValue: 12 })
        });
        assert.equal(updatedType.types[temporaryTypeCode].active, false);
        assert.equal(updatedType.types[temporaryTypeCode].durationValue, 12);
        const page = await fetch(`${baseUrl}/`);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /إدارة عضويات الجيم/);

        const created = await call(baseUrl, '/api/members', {
            method: 'POST',
            body: JSON.stringify({
                fullName: `Smoke Test ${suffix}`,
                phone: `010${String(suffix).slice(-8)}`,
                registrationDate: '2026-08-08',
                membershipType: 'half_month',
                membershipPlan: 'gym_only',
                startDate: '2026-08-08',
                discountAmount: 5,
                amountPaid: 50,
                paymentMethod: 'cash'
            })
        });
        memberId = created.member.id;
        assert.equal(created.member.membership.status, 'active');
        assert.equal(created.member.membership.endDate, '2026-08-22');
        assert.equal(created.member.membership.amountDue, gymOnlyMonthly * 0.5 - 5);
        assert.equal(created.member.membership.discountAmount, 5);
        assert.equal(created.member.membership.amountRemaining, gymOnlyMonthly * 0.5 - 55);
        assert.equal(created.member.membership.freezeCount, 0);
        assert.equal(created.member.membership.freezeLimit, 3);
        assert.equal(created.member.membership.freezesRemaining, 3);
        const listed = await call(baseUrl, `/api/members?search=${encodeURIComponent(created.member.fullName)}&page=1&pageSize=5`);
        assert.equal(listed.members[0].membership.freezeCount, 0);
        assert.equal(listed.members[0].membership.freezesRemaining, 3);

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
        assert.equal(edited.member.membership.amountDue, gymOnlyMonthly);

        const frozen = await call(baseUrl, `/api/members/${memberId}/freeze`, {
            method: 'POST', body: JSON.stringify({ days: 2, reason: 'smoke test' })
        });
        assert.equal(frozen.member.membership.status, 'frozen');

        const resumed = await call(baseUrl, `/api/members/${memberId}/resume`, { method: 'POST' });
        assert.equal(resumed.member.membership.status, 'active');
        assert.equal(resumed.member.membership.freezeCount, 1);
        assert.equal(resumed.member.membership.freezesRemaining, 2);

        for (let freezeNumber = 2; freezeNumber <= 3; freezeNumber += 1) {
            const extraFrozen = await call(baseUrl, `/api/members/${memberId}/freeze`, {
                method: 'POST', body: JSON.stringify({ days: 1, reason: `smoke test ${freezeNumber}` })
            });
            assert.equal(extraFrozen.member.membership.freezeCount, freezeNumber);
            assert.equal(extraFrozen.member.membership.freezesRemaining, 3 - freezeNumber);
            const extraResumed = await call(baseUrl, `/api/members/${memberId}/resume`, { method: 'POST' });
            assert.equal(extraResumed.member.membership.status, 'active');
        }

        let freezeLimitRejected = false;
        try {
            await call(baseUrl, `/api/members/${memberId}/freeze`, {
                method: 'POST', body: JSON.stringify({ days: 1, reason: 'smoke test limit' })
            });
        } catch (error) {
            freezeLimitRejected = /الحد الأقصى للتجميد/.test(error.message);
        }
        assert.equal(freezeLimitRejected, true);

        const paid = await call(baseUrl, `/api/memberships/${resumed.member.membership.id}/payments`, {
            method: 'POST', body: JSON.stringify({ listPrice: gymOnlyMonthly, discountAmount: 0, amountPaid: gymOnlyMonthly, paymentMethod: 'card' })
        });
        assert.equal(paid.member.membership.amountRemaining, 0);

        const renewed = await call(baseUrl, `/api/members/${memberId}/renew`, {
            method: 'POST', body: JSON.stringify({ membershipType: 'quarterly', membershipPlan: 'gym_cardio', discountAmount: 0, amountPaid: cardioMonthly * 3, paymentMethod: 'transfer' })
        });
        assert.equal(renewed.member.membership.type, 'quarterly');
        assert.equal(renewed.member.membership.plan, 'gym_cardio');
        assert.equal(renewed.member.membership.amountDue, cardioMonthly * 3);
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
        if (temporaryPlanCode) {
            try {
                const pool = await getPool();
                await pool.request().input('planCode', sql.VarChar(30), temporaryPlanCode)
                    .query('DELETE FROM dbo.membership_pricing WHERE plan_code = @planCode;');
            } catch (_) { /* cleanup is best effort */ }
        }
        if (temporaryTypeCode) {
            try {
                const pool = await getPool();
                await pool.request().input('typeCode', sql.VarChar(30), temporaryTypeCode)
                    .query('DELETE FROM dbo.membership_types WHERE type_code = @typeCode;');
            } catch (_) { /* cleanup is best effort */ }
        }
        if (server) await new Promise((resolve) => server.close(resolve));
        await closePool();
    }
})().catch((error) => {
    console.error('SMOKE_TEST_FAILED:', error.message);
    process.exitCode = 1;
});
