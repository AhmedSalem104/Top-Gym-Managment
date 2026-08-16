require('dotenv').config();

const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const app = require('../server');
const { closePool, getPool, initDatabase, sql } = require('../src/db');
const { reconcileAutoCheckout } = require('../src/attendance-service');
const { addDays, todayInTimeZone } = require('../src/date-utils');

async function call(baseUrl, path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers,
    });
    const body = response.status === 204 ? null : await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${body?.error || 'request failed'}`);
    return body;
}

(async () => {
    let server;
    let memberId;
    let externalMemberId;
    let temporaryPlanCode;
    let temporaryTypeCode;
    try {
        await initDatabase();
        server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        const suffix = Date.now();
        const testStartDate = todayInTimeZone();
        const testHalfMonthEndDate = addDays(testStartDate, 14);
        const testMonthlyEndDate = addDays(testStartDate, 29);

        const health = await call(baseUrl, '/api/health');
        assert.equal(health.database, 'connected');
        const backupResponse = await fetch(`${baseUrl}/api/backup/download`);
        assert.equal(backupResponse.status, 200);
        assert.equal(backupResponse.headers.get('content-type'), 'application/gzip');
        assert.match(backupResponse.headers.get('content-disposition') || '', /backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json\.gz/);
        const backupBuffer = Buffer.from(await backupResponse.arrayBuffer());
        assert.ok(backupBuffer.byteLength > 20);
        const bakResponse = await fetch(`${baseUrl}/api/backup/download?format=bak`);
        assert.equal(bakResponse.status, 200);
        assert.equal(bakResponse.headers.get('content-type'), 'application/octet-stream');
        assert.match(bakResponse.headers.get('content-disposition') || '', /backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.bak/);
        const bakBuffer = Buffer.from(await bakResponse.arrayBuffer());
        assert.ok(bakBuffer.byteLength > 20);
        const bakInspectResponse = await fetch(`${baseUrl}/api/backup/inspect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/octet-stream', 'X-Backup-Filename': 'smoke-backup.bak' },
            body: bakBuffer
        });
        assert.equal(bakInspectResponse.status, 200);
        assert.equal((await bakInspectResponse.json()).valid, true);
        const backupInspectResponse = await fetch(`${baseUrl}/api/backup/inspect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/gzip', 'X-Backup-Filename': 'smoke-backup.json.gz' },
            body: backupBuffer
        });
        const backupInspection = await backupInspectResponse.json();
        assert.equal(backupInspectResponse.status, 200);
        assert.equal(backupInspection.valid, true);
        assert.equal(backupInspection.integrity.verified, true);
        assert.ok(Number(backupInspection.rowCount) >= 0);
        const backupHistory = await call(baseUrl, '/api/backup/history?limit=5');
        assert.ok(backupHistory.operations.some((item) => item.operationType === 'download'));
        assert.ok(backupHistory.operations.some((item) => item.operationType === 'inspect'));
        const invalidBackupResponse = await fetch(`${baseUrl}/api/backup/inspect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/gzip' },
            body: gzipSync(Buffer.from(JSON.stringify({ format: 'invalid', version: 1, tables: {} })))
        });
        assert.equal(invalidBackupResponse.status, 400);
        const unconfirmedRestoreResponse = await fetch(`${baseUrl}/api/backup/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/gzip' },
            body: backupBuffer
        });
        assert.equal(unconfirmedRestoreResponse.status, 400);
        const bootstrap = await call(baseUrl, '/api/bootstrap');
        assert.ok(Array.isArray(bootstrap.members));
        assert.ok(bootstrap.dashboard && bootstrap.dashboard.stats);
        assert.ok(bootstrap.pricing && bootstrap.pricing.plans);
        assert.ok(bootstrap.pagination && Number.isInteger(bootstrap.pagination.page));
        assert.equal(bootstrap.pricing.types.half_month.durationValue, 15);
        assert.equal(bootstrap.pricing.types.half_month.mode, 'days');
        const externalTrainee = await call(baseUrl, '/api/external-trainees', {
            method: 'POST',
            body: JSON.stringify({
                fullName: `External Smoke Test ${suffix}`,
                phone: `011${String(suffix).slice(-8)}`,
                registrationDate: testStartDate
            })
        });
        externalMemberId = externalTrainee.member.id;
        const dashboardWithoutExternal = await call(baseUrl, '/api/dashboard');
        assert.equal(dashboardWithoutExternal.alerts.some((item) => Number(item.id) === Number(externalMemberId)), false);
        const dashboardAnalytics = await call(baseUrl, '/api/dashboard-analytics?period=month');
        assert.ok(dashboardAnalytics.attendance && dashboardAnalytics.attendance.kpis);
        assert.ok(Array.isArray(dashboardAnalytics.attendance.peakHours));
        assert.ok(Array.isArray(dashboardAnalytics.attendance.topMembers));
        assert.ok(Array.isArray(dashboardAnalytics.attendance.inactiveMembers));
        const firstPage = await call(baseUrl, '/api/members?page=1&pageSize=1');
        assert.ok(firstPage.pagination && firstPage.pagination.pageSize === 1);
        assert.ok(firstPage.members.length <= 1);
        const filteredPage = await call(baseUrl, '/api/members?status=active&page=1&pageSize=5');
        assert.ok(filteredPage.pagination && filteredPage.members.length <= 5);
        const pricing = await call(baseUrl, '/api/pricing');
        const gymOnlyMonthly = Number(pricing.plans.gym_only.monthlyPrice);
        const cardioMonthly = Number(pricing.plans.gym_cardio.monthlyPrice);
        const gymOnlyMonthlyPrice = Number(pricing.prices?.gym_only?.monthly ?? gymOnlyMonthly);
        const gymOnlyHalfMonthPrice = Number(pricing.prices?.gym_only?.half_month ?? gymOnlyMonthly * 0.5);
        const cardioQuarterlyPrice = Number(pricing.prices?.gym_cardio?.quarterly ?? cardioMonthly * 3);
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
                registrationDate: testStartDate,
                membershipType: 'half_month',
                membershipPlan: 'gym_only',
                startDate: testStartDate,
                discountAmount: 5,
                amountPaid: 50,
                paymentMethod: 'cash'
            })
        });
        memberId = created.member.id;
        assert.match(created.member.qrToken, new RegExp(`^TOPGYM-MEMBER:${memberId}$`));
        const qrPage = await fetch(`${baseUrl}/qr/${memberId}`);
        assert.equal(qrPage.status, 200);
        assert.match(await qrPage.text(), /TOP GYM/);
        assert.equal(created.member.membership.status, 'active');
        assert.equal(created.member.membership.endDate, testHalfMonthEndDate);
        assert.equal(created.member.membership.amountDue, gymOnlyHalfMonthPrice - 5);
        assert.equal(created.member.membership.discountAmount, 5);
        assert.equal(created.member.membership.amountRemaining, gymOnlyHalfMonthPrice - 55);
        assert.equal(created.member.membership.freezeCount, 0);
        assert.equal(created.member.membership.freezeLimit, 3);
        assert.equal(created.member.membership.freezesRemaining, 3);
        const trainingOverview = await call(baseUrl, `/api/clients/${memberId}/training-overview`);
        assert.equal(trainingOverview.member.id, memberId);
        assert.ok(Array.isArray(trainingOverview.workoutSessions));
        assert.ok(Array.isArray(trainingOverview.mealLogs));
        const duplicateResponse = await fetch(`${baseUrl}/api/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullName: `Duplicate Smoke Test ${suffix}`,
                phone: created.member.phone,
                membershipType: 'monthly',
                membershipPlan: 'gym_only',
                startDate: testStartDate,
                amountPaid: 0,
                paymentMethod: 'cash'
            })
        });
        const duplicateBody = await duplicateResponse.json();
        assert.equal(duplicateResponse.status, 409);
        assert.equal(duplicateBody.code, 'DUPLICATE_MEMBER_PHONE');
        assert.equal(duplicateBody.memberName, created.member.fullName);
        const listed = await call(baseUrl, `/api/members?search=${encodeURIComponent(created.member.fullName)}&page=1&pageSize=5`);
        assert.equal(listed.members[0].membership.freezeCount, 0);
        assert.equal(listed.members[0].membership.freezesRemaining, 3);

        const edited = await call(baseUrl, `/api/members/${memberId}`, {
            method: 'PUT',
            body: JSON.stringify({
                fullName: `Edited Smoke Test ${suffix}`,
                phone: `010${String(suffix).slice(-8)}`,
                registrationDate: testStartDate,
                membershipType: 'monthly',
                membershipPlan: 'gym_only',
                startDate: testStartDate,
                endDate: testMonthlyEndDate,
                discountAmount: 0,
                amountPaid: 150,
                paymentMethod: 'cash'
            })
        });
        assert.equal(edited.member.fullName, `Edited Smoke Test ${suffix}`);
        assert.equal(edited.member.membership.amountDue, gymOnlyMonthlyPrice);

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
            method: 'POST', body: JSON.stringify({ listPrice: gymOnlyMonthlyPrice, discountAmount: 0, amountPaid: gymOnlyMonthlyPrice, paymentMethod: 'card' })
        });
        assert.equal(paid.member.membership.amountRemaining, 0);

        const renewed = await call(baseUrl, `/api/members/${memberId}/renew`, {
            method: 'POST', body: JSON.stringify({ membershipType: 'quarterly', membershipPlan: 'gym_cardio', discountAmount: 0, amountPaid: cardioQuarterlyPrice, paymentMethod: 'transfer' })
        });
        assert.equal(renewed.member.membership.type, 'quarterly');
        assert.equal(renewed.member.membership.plan, 'gym_cardio');
        assert.equal(renewed.member.membership.amountDue, cardioQuarterlyPrice);
        assert.equal(renewed.member.membership.amountRemaining, 0);

        const details = await call(baseUrl, `/api/members/${memberId}/details`);
        assert.equal(details.member.id, memberId);
        assert.equal(details.memberships.length, 2);
        assert.ok(details.payments.length >= 4);
        assert.ok(details.payments.every((item) => item.receiptNumber));
        assert.equal(details.financialSummary.totalRemaining, 0);
        assert.ok(details.events.length >= 6);

        const attendance = await call(baseUrl, '/api/attendance', { method: 'GET' });
        assert.ok(attendance.summary && Array.isArray(attendance.records));
        const checkedIn = await call(baseUrl, '/api/attendance/check-in', {
            method: 'POST', body: JSON.stringify({ phone: created.member.phone })
        });
        assert.equal(checkedIn.attendance.memberId, memberId);
        let duplicateAttendanceRejected = false;
        try {
            await call(baseUrl, '/api/attendance/check-in', {
                method: 'POST', body: JSON.stringify({ qrToken: `${baseUrl}/qr/${memberId}` })
            });
        } catch (error) {
            duplicateAttendanceRejected = /بالفعل/.test(error.message);
        }
        assert.equal(duplicateAttendanceRejected, true);
        const checkedOut = await call(baseUrl, '/api/attendance/check-out', {
            method: 'POST', body: JSON.stringify({ qrToken: `TOPGYM-MEMBER:${memberId}` })
        });
        assert.ok(checkedOut.attendance.checkOutAt);
        const memberAttendance = await call(baseUrl, `/api/attendance/member/${memberId}`);
        assert.ok(memberAttendance.records.some((item) => item.id === checkedOut.attendance.id));
        const attendanceReport = await call(baseUrl, '/api/attendance/report');
        assert.ok(attendanceReport.summary && Number.isInteger(attendanceReport.summary.totalVisits));
        assert.ok(Array.isArray(attendanceReport.members));
        const previousAutoCheckoutMinutes = process.env.ATTENDANCE_AUTO_CHECKOUT_MINUTES;
        const smokePool = await getPool();
        try {
            process.env.ATTENDANCE_AUTO_CHECKOUT_MINUTES = '1';
            await smokePool.request()
                .input('attendanceId', sql.Int, checkedOut.attendance.id)
                .query(`UPDATE dbo.gym_attendance
                        SET check_out_at = NULL, check_out_source = NULL,
                            check_in_at = DATEADD(minute, -2, SYSUTCDATETIME()), updated_at = SYSUTCDATETIME()
                        WHERE id = @attendanceId;`);
            await reconcileAutoCheckout(smokePool, memberId);
            const autoClosedResult = await smokePool.request()
                .input('attendanceId', sql.Int, checkedOut.attendance.id)
                .query('SELECT check_out_source FROM dbo.gym_attendance WHERE id = @attendanceId;');
            assert.equal(autoClosedResult.recordset[0]?.check_out_source, 'auto');
        } finally {
            if (previousAutoCheckoutMinutes === undefined) delete process.env.ATTENDANCE_AUTO_CHECKOUT_MINUTES;
            else process.env.ATTENDANCE_AUTO_CHECKOUT_MINUTES = previousAutoCheckoutMinutes;
        }
        await smokePool.request()
            .input('attendanceId', sql.Int, checkedOut.attendance.id)
            .query('UPDATE dbo.gym_attendance SET attendance_date = DATEADD(day, -1, attendance_date) WHERE id = @attendanceId;');
        const nextDayCheckIn = await call(baseUrl, '/api/attendance/check-in', {
            method: 'POST', body: JSON.stringify({ phone: created.member.phone })
        });
        assert.equal(nextDayCheckIn.attendance.memberId, memberId);
        assert.equal(nextDayCheckIn.attendance.checkInSource, 'phone');

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
        if (externalMemberId && server) {
            try {
                const baseUrl = `http://127.0.0.1:${server.address().port}`;
                await call(baseUrl, `/api/members/${externalMemberId}`, { method: 'DELETE' });
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
