'use strict';

// Disposable-clone runtime gate. This is verification tooling, not product
// code. It creates synthetic trainer tenants/records only on the local clone.
const BASE_URL = String(process.env.QA_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const OWNER_PASSWORD = String(process.env.QA_OWNER_PASSWORD || '');
const ADMIN_PASSWORD = String(process.env.QA_PLATFORM_ADMIN_PASSWORD || '');
const TRAINER_PASSWORD = String(process.env.QA_TRAINER_PASSWORD || '');
const GYM_OWNER_EMAIL = String(process.env.QA_GYM_OWNER_EMAIL || 'qa-gym-owner@local.test');
const ADMIN_EMAIL = String(process.env.QA_ADMIN_EMAIL || 'qa-platform-admin@local.test');

if (!OWNER_PASSWORD || !ADMIN_PASSWORD || !TRAINER_PASSWORD) throw new Error('QA credentials must be supplied by the process environment.');

function today() { return new Date().toISOString().slice(0, 10); }
function isoMinutesFromNow(minutes) { return new Date(Date.now() + minutes * 60_000).toISOString(); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function idOf(value) { return Number(value?.id || value?.clientId || value?.packageId || value?.sessionId || 0); }

class Session {
    constructor(name) { this.name = name; this.cookie = ''; }

    updateCookie(response) {
        const cookies = typeof response.headers.getSetCookie === 'function'
            ? response.headers.getSetCookie()
            : String(response.headers.get('set-cookie') || '').split(/,(?=[^;]+=[^;]+)/);
        const auth = cookies.find((value) => /^(?:auth_session|topgym_session)=/i.test(value));
        if (auth) this.cookie = auth.split(';', 1)[0];
    }

    async raw(path, options = {}) {
        const headers = new Headers(options.headers || {});
        if (this.cookie) headers.set('cookie', this.cookie);
        let body = options.body;
        if (body !== undefined && body !== null && !Buffer.isBuffer(body) && typeof body === 'object' && !(body instanceof Uint8Array)) {
            headers.set('content-type', 'application/json');
            body = JSON.stringify(body);
        }
        const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, body });
        this.updateCookie(response);
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
        return { response, status: response.status, data };
    }

    async expect(path, options = {}, statuses = [200]) {
        const result = await this.raw(path, options);
        assert(statuses.includes(result.status), `${this.name} ${options.method || 'GET'} ${path} returned ${result.status} (${result.data?.code || 'no-code'})`);
        return result.data;
    }

    async login(email, password) {
        return this.expect('/api/auth/login', { method: 'POST', body: { email, password } });
    }
}

async function forcedPasswordCheck() {
    const owner = new Session('gym-owner');
    const login = await owner.login(GYM_OWNER_EMAIL, OWNER_PASSWORD);
    assert(login.user?.mustChangePassword === true, 'Gym owner forced-password state was not returned.');
    const blocked = await owner.raw('/api/members');
    assert(blocked.status === 403 && blocked.data?.code === 'PASSWORD_CHANGE_REQUIRED', `Protected API was not blocked before forced password change (${blocked.status}/${blocked.data?.code || 'no-code'}).`);
    await owner.expect('/api/auth/change-password', { method: 'POST', body: { newPassword: TRAINER_PASSWORD, confirmPassword: TRAINER_PASSWORD } });
    const oldLogin = new Session('old-gym-password');
    const old = await oldLogin.raw('/api/auth/login', { method: 'POST', body: { email: GYM_OWNER_EMAIL, password: OWNER_PASSWORD } });
    assert(old.status === 401, 'Temporary/old Gym owner password remained valid after rotation.');
    const fresh = new Session('gym-owner-fresh');
    const freshLogin = await fresh.login(GYM_OWNER_EMAIL, TRAINER_PASSWORD);
    assert(freshLogin.user?.mustChangePassword === false, 'Gym owner still requires password change after rotation.');
    return fresh;
}

async function platformAdmin() {
    const admin = new Session('platform-admin');
    const login = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert(login.user?.role === 'PlatformAdmin', 'Synthetic PlatformAdmin did not authenticate as PlatformAdmin.');
    return admin;
}

async function trainerRegistration(admin, suffix) {
    const publicSession = new Session(`public-${suffix}`);
    const catalog = await publicSession.expect('/api/public/trainer-registration/catalog');
    const plan = catalog.plans?.find((item) => item.isActive !== false && item.terms?.some((term) => term.isActive !== false));
    const term = plan?.terms?.find((item) => item.isActive !== false);
    const paymentMethod = catalog.paymentMethods?.find((item) => item.isActive !== false);
    assert(plan && term && paymentMethod, 'Trainer registration catalog did not expose a usable compatible plan.');
    const email = `qa-${suffix}-${Date.now()}@local.test`;
    const requestResult = await publicSession.expect('/api/public/trainer-registration/requests', {
        method: 'POST',
        headers: { 'idempotency-key': `qa-${suffix}-registration-${Date.now()}` },
        body: {
            gymName: `QA Trainer ${suffix}`,
            ownerName: `QA Trainer Owner ${suffix}`,
            whatsapp: `+2010000${String(Date.now()).slice(-6)}`,
            email,
            city: 'QA Local',
            planCode: plan.code,
            termCode: term.code,
            paymentMethodCode: paymentMethod.methodCode,
            notes: 'Synthetic local release-gate record.'
        }
    }, [201]);
    const request = requestResult.request;
    const proof = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    await publicSession.expect(`/api/public/trainer-registration/requests/${request.id}/proof`, {
        method: 'POST',
        headers: {
            'content-type': 'application/octet-stream',
            'x-registration-token': requestResult.accessToken,
            'x-payment-proof-mime': 'image/png',
            'x-payment-proof-name': `qa-${suffix}.png`
        },
        body: proof
    }, [201]);
    const list = await admin.expect('/api/platform-admin/gym-registration-requests?status=pending');
    const listed = list.requests?.find((item) => Number(item.id) === Number(request.id));
    assert(listed?.tenantType === 'independent_trainer', 'PlatformAdmin did not expose the Trainer customer type.');
    const approval = await admin.expect(`/api/platform-admin/gym-registration-requests/${request.id}/approve`, {
        method: 'POST', body: { reviewNotes: 'Synthetic local release-gate approval.' }
    });
    assert(approval.request?.tenantType === 'independent_trainer', 'Approved request lost the Trainer tenant type.');
    assert(approval.tenant?.tenantType === 'independent_trainer', 'Provisioned tenant is not Independent Trainer.');
    assert(approval.oneTimeCredentials?.temporaryPassword, 'Approval did not return one-time credentials.');
    const secondApproval = await admin.raw(`/api/platform-admin/gym-registration-requests/${request.id}/approve`, { method: 'POST', body: { reviewNotes: 'duplicate' } });
    assert(secondApproval.status === 409, 'Double approval was not rejected.');
    return {
        email,
        tenantId: Number(approval.tenant.id),
        ownerId: Number(approval.owner.id),
        temporaryPassword: approval.oneTimeCredentials.temporaryPassword
    };
}

async function trainerLogin(account, label) {
    const forced = new Session(label);
    const temporary = await forced.login(account.email, account.temporaryPassword);
    assert(temporary.user?.role === 'Owner' && temporary.user?.mustChangePassword === true, `${label} owner/forced-password state is invalid.`);
    const forcedSession = await forced.expect('/api/auth/session');
    assert(forcedSession.user?.tenantType === 'independent_trainer', `${label} did not resolve as Independent Trainer (${forcedSession.user?.tenantType || 'missing'}).`);
    const blocked = await forced.raw('/api/trainer/workspace');
    assert(blocked.status === 403 && blocked.data?.code === 'PASSWORD_CHANGE_REQUIRED', `${label} protected workspace was not blocked before password change.`);
    await forced.expect('/api/auth/change-password', { method: 'POST', body: { newPassword: TRAINER_PASSWORD, confirmPassword: TRAINER_PASSWORD } });
    const old = new Session(`${label}-old-password`);
    const oldResult = await old.raw('/api/auth/login', { method: 'POST', body: { email: account.email, password: account.temporaryPassword } });
    assert(oldResult.status === 401, `${label} temporary password remained valid after change.`);
    const session = new Session(label);
    const result = await session.login(account.email, TRAINER_PASSWORD);
    assert(result.user?.mustChangePassword === false, `${label} still requires password change.`);
    const sessionState = await session.expect('/api/auth/session');
    assert(sessionState.user?.tenantType === 'independent_trainer', `${label} session did not resolve as Independent Trainer.`);
    return session;
}

async function trainerOperations(session, suffix) {
    const workspace = await session.expect('/api/trainer/workspace');
    assert(workspace && typeof workspace === 'object', 'Trainer workspace response was invalid.');
    const clientsBefore = await session.expect('/api/trainer/clients?page=1&pageSize=20');
    const clientResult = await session.expect('/api/trainer/clients', {
        method: 'POST',
        body: {
            fullName: `Synthetic Client ${suffix}`,
            phone: `+2011000${String(Date.now()).slice(-6)}`,
            email: `client-${suffix}-${Date.now()}@local.test`,
            registrationDate: today(),
            primaryGoal: 'Strength',
            notes: 'Synthetic local release-gate record.'
        }
    }, [201]);
    const clientId = idOf(clientResult.client?.client || clientResult.client);
    const clientsAfter = await session.expect('/api/trainer/clients?page=1&pageSize=20');
    assert(clientId > 0 && Number(clientsBefore.pagination?.total) + 1 === Number(clientsAfter.pagination?.total), `Trainer client CRUD/list flow failed (${clientsBefore.pagination?.total}/${clientsAfter.pagination?.total}, client=${clientId}, keys=${Object.keys(clientResult || {}).join(',')}).`);
    await session.expect(`/api/trainer/clients/${clientId}`);
    const measurement = await session.expect(`/api/trainer/clients/${clientId}/measurements`, {
        method: 'POST', body: { measuredAt: today(), weightKg: 80, notes: 'Synthetic measurement.' }
    }, [201]);
    assert(idOf(measurement.measurement) > 0, 'Trainer measurement was not created.');
    const checkin = await session.expect(`/api/trainer/clients/${clientId}/checkins`, {
        method: 'POST', body: { checkinDate: today(), bodyweightKg: 79.5, sleepQuality: 4, notes: 'Synthetic check-in.' }
    }, [201]);
    assert(idOf(checkin.checkin) > 0, 'Trainer check-in was not created.');
    const catalog = await session.expect('/api/coaching/catalog');
    const exerciseId = idOf(catalog.exercises?.[0]);
    const foodId = idOf(catalog.foods?.[0]);
    assert(exerciseId > 0 && foodId > 0, 'Training/nutrition catalogs were empty.');
    const workout = await session.expect('/api/trainer/training-plans', {
        method: 'POST', body: {
            memberId: clientId, name: `Synthetic Training ${suffix}`, description: 'Local release gate.', startDate: today(),
            durationWeeks: 4, goal: 'strength', level: 'beginner', daysPerWeek: 1, status: 'active', version: 1,
            routines: [{ name: 'Day 1', dayOfWeek: 1, sortOrder: 0, exercises: [{ exerciseId, sortOrder: 0, sets: 3, repsMin: 8, repsMax: 10, weightKg: 20, restSeconds: 60, rir: 2, rpe: 7, tempo: '2-0-2' }] }]
        }
    }, [201]);
    assert(idOf(workout.plan) > 0, 'Trainer training plan was not created.');
    const nutrition = await session.expect('/api/trainer/nutrition-plans', {
        method: 'POST', body: {
            memberId: clientId, name: `Synthetic Nutrition ${suffix}`, description: 'Local release gate.', startDate: today(),
            mealsPerDay: 1, targetCalories: 2200, targetProtein: 150, targetCarbs: 220, targetFats: 70,
            calorieGoal: 'maintain', calorieAdjustment: 0, status: 'active', version: 1,
            calculator: { weightKg: 80, heightCm: 180, age: 30, gender: 'male', activity: 'moderate', bmr: 1800, tdee: 2500 },
            meals: [{ name: 'Breakfast', mealTime: '08:00', sortOrder: 0, items: [{ foodId, assignedQuantity: 100, sortOrder: 0 }] }]
        }
    }, [201]);
    assert(idOf(nutrition.plan) > 0, 'Trainer nutrition plan was not created.');
    const packageResult = await session.expect('/api/trainer/packages', {
        method: 'POST', body: { name: `Synthetic Package ${suffix}`, description: 'Local release gate.', price: 100, sessionCount: 2, serviceMode: 'hybrid' }
    }, [201]);
    const packageId = idOf(packageResult.package);
    const purchaseKey = `qa-purchase-${suffix}-${Date.now()}`;
    const purchaseBody = { packageId, clientId, startsOn: today(), amountPaid: 50, paymentMethod: 'cash', paidAt: today(), idempotencyKey: purchaseKey };
    const purchaseA = await session.expect('/api/trainer/package-purchases', { method: 'POST', body: purchaseBody }, [201]);
    const purchaseB = await session.expect('/api/trainer/package-purchases', { method: 'POST', body: purchaseBody }, [200, 201]);
    const purchaseId = idOf(purchaseA.purchase);
    assert(purchaseId > 0 && idOf(purchaseB.purchase) === purchaseId, 'Package purchase idempotency failed.');
    const concurrentPurchaseBody = {
        packageId,
        clientId,
        startsOn: today(),
        amountPaid: 0,
        paymentMethod: 'cash',
        paidAt: today(),
        idempotencyKey: `qa-concurrent-purchase-${suffix}-${Date.now()}`
    };
    const concurrentPurchases = await Promise.all(Array.from({ length: 4 }, () => (
        session.raw('/api/trainer/package-purchases', { method: 'POST', body: concurrentPurchaseBody })
    )));
    assert(concurrentPurchases.every((item) => [200, 201].includes(item.status)), 'Concurrent package purchase returned an unexpected response.');
    const concurrentPurchaseIds = new Set(concurrentPurchases.map((item) => idOf(item.data?.purchase)));
    assert(concurrentPurchaseIds.size === 1 && !concurrentPurchaseIds.has(0), 'Concurrent package purchase created duplicate or missing records.');
    const paymentBody = { amountPaid: 50, paymentMethod: 'cash', paidAt: today(), idempotencyKey: `qa-payment-${suffix}-${Date.now()}` };
    const concurrentPayments = await Promise.all(Array.from({ length: 4 }, () => (
        session.raw(`/api/trainer/package-purchases/${purchaseId}/payments`, { method: 'POST', body: paymentBody })
    )));
    assert(concurrentPayments.every((item) => [201, 409].includes(item.status)), 'Concurrent payment returned an unexpected response.');
    const concurrentPaymentIds = new Set(concurrentPayments.map((item) => idOf(item.data?.payment)));
    assert(concurrentPaymentIds.size === 1 && !concurrentPaymentIds.has(0), 'Concurrent payment created duplicate or missing records.');
    const refundBody = { amount: 10, paymentMethod: 'cash', refundDate: today(), idempotencyKey: `qa-refund-${suffix}-${Date.now()}` };
    const refundA = await session.expect(`/api/trainer/package-purchases/${purchaseId}/refunds`, { method: 'POST', body: refundBody }, [201]);
    const refundB = await session.expect(`/api/trainer/package-purchases/${purchaseId}/refunds`, { method: 'POST', body: refundBody }, [201]);
    assert(idOf(refundA.refund) > 0 && idOf(refundA.refund) === idOf(refundB.refund), 'Refund idempotency failed.');
    const sessionStart = isoMinutesFromNow(15);
    const sessionResult = await session.expect('/api/trainer/sessions', {
        method: 'POST', body: { clientId, packagePurchaseId: purchaseId, scheduledStart: sessionStart, scheduledEnd: isoMinutesFromNow(75), notes: 'Synthetic session.', idempotencyKey: `qa-session-${suffix}-${Date.now()}` }
    }, [201]);
    const sessionId = idOf(sessionResult.session);
    const completions = await Promise.all(Array.from({ length: 6 }, () => session.raw(`/api/trainer/sessions/${sessionId}/status`, { method: 'PATCH', body: { status: 'completed' } })));
    assert(completions.every((item) => [200, 409].includes(item.status)), 'Unexpected response during concurrent session completion.');
    const purchases = await session.expect(`/api/trainer/package-purchases?memberId=${clientId}`);
    const purchase = purchases.purchases?.find((item) => item.id === purchaseId);
    assert(purchase && Number(purchase.sessionsRemaining) === 1, 'Concurrent session completion consumed more than one entitlement.');
    const payments = await session.expect(`/api/trainer/payments?purchaseId=${purchaseId}`);
    assert(payments.payments?.filter((item) => item.transactionType === 'payment').length === 2, 'Payment ledger contains a duplicate payment row.');
    assert(payments.payments?.filter((item) => item.transactionType === 'adjustment').length === 1, 'Refund ledger is not idempotent.');
    await session.expect('/api/trainer/follow-up');
    await session.expect('/api/trainer/reports/summary');
    await session.expect(`/api/trainer/clients/${clientId}/timeline?limit=100`);
    const portalAccess = await session.expect(`/api/trainer/clients/${clientId}/portal-access`, { method: 'POST', body: {} });
    const membershipCode = typeof portalAccess.membershipCode === 'string' ? portalAccess.membershipCode : portalAccess.membershipCode?.membershipCode;
    assert(membershipCode, 'Trainer client portal access did not issue a membership code.');
    const portal = new Session(`portal-${suffix}`);
    const portalResult = await portal.expect('/api/member-portal/lookup', { method: 'POST', body: { membershipCode } });
    assert(portalResult.tenant && portalResult.member && portalResult.coaching, 'Trainer Client Portal response was incomplete.');
    const occupancy = await portal.raw('/api/member-portal/occupancy', { method: 'POST', body: { membershipCode } });
    assert(occupancy.status === 404 && occupancy.data?.code === 'PORTAL_FEATURE_UNAVAILABLE', 'Trainer Client Portal exposed Gym occupancy.');
    return { clientId, packageId, purchaseId, sessionId, membershipCode, tenantId: Number(workspace.tenant?.id || 0) };
}

async function platformAdminChecks(admin) {
    const dashboard = await admin.expect('/api/platform-admin/dashboard');
    const tenants = await admin.expect('/api/platform-admin/tenants');
    assert(Array.isArray(tenants.tenants) && tenants.tenants.some((item) => item.tenantType === 'independent_trainer'), 'PlatformAdmin tenant directory did not include Trainer tenants.');
    assert(dashboard && typeof dashboard === 'object', 'PlatformAdmin dashboard response was invalid.');
    return tenants;
}

async function main() {
    const health = await new Session('public').expect('/api/health');
    assert(health.status === 'healthy' || health.ok === true || health.database?.status === 'healthy', 'Health endpoint did not report healthy.');
    const gymOwner = await forcedPasswordCheck();
    await gymOwner.expect('/api/auth/session');
    const admin = await platformAdmin();
    const trainerAAccount = await trainerRegistration(admin, 'trainer-a');
    const trainerBAccount = await trainerRegistration(admin, 'trainer-b');
    const trainerA = await trainerLogin(trainerAAccount, 'trainer-a');
    const trainerB = await trainerLogin(trainerBAccount, 'trainer-b');
    const trainerAData = await trainerOperations(trainerA, 'trainer-a');
    const trainerBData = await trainerOperations(trainerB, 'trainer-b');
    const foreign = await trainerB.raw(`/api/trainer/clients/${trainerAData.clientId}`);
    assert([403, 404].includes(foreign.status), 'Trainer B accessed Trainer A client by IDOR.');
    const reverseForeign = await trainerA.raw(`/api/trainer/clients/${trainerBData.clientId}`);
    assert([403, 404].includes(reverseForeign.status), 'Trainer A accessed Trainer B client by IDOR.');
    const foreignMutationChecks = await Promise.all([
        trainerA.raw(`/api/trainer/clients/${trainerBData.clientId}`, { method: 'PATCH', body: { fullName: 'IDOR probe' } }),
        trainerA.raw(`/api/trainer/clients/${trainerBData.clientId}`, { method: 'DELETE' }),
        trainerA.raw(`/api/trainer/packages/${trainerBData.packageId}`, { method: 'DELETE' }),
        trainerA.raw(`/api/trainer/package-purchases/${trainerBData.purchaseId}/payments`, {
            method: 'POST', body: { amountPaid: 1, paymentMethod: 'cash', paidAt: today(), idempotencyKey: `qa-idor-payment-${Date.now()}` }
        }),
        trainerA.raw(`/api/trainer/sessions/${trainerBData.sessionId}/status`, { method: 'PATCH', body: { status: 'cancelled' } }),
        trainerA.raw(`/api/trainer/clients/${trainerBData.clientId}/portal-access`, { method: 'POST', body: {} })
    ]);
    assert(foreignMutationChecks.every((item) => [403, 404].includes(item.status)), 'A foreign Trainer resource accepted a read or mutation request.');
    const gymForeign = await gymOwner.raw(`/api/trainer/clients/${trainerAData.clientId}`);
    assert(
        [403, 404].includes(gymForeign.status)
        || gymForeign.status === 503,
        'Gym owner accessed Trainer client route.'
    );
    const adminTenants = await platformAdminChecks(admin);
    console.log(JSON.stringify({
        status: 'PASS',
        health: 'PASS',
        forcedPassword: 'PASS',
        trainerRegistrationProvisioning: 'PASS',
        trainerA: { tenantId: trainerAAccount.tenantId, clientId: trainerAData.clientId, packageId: trainerAData.packageId, portal: 'PASS' },
        trainerB: { tenantId: trainerBAccount.tenantId, clientId: trainerBData.clientId, packageId: trainerBData.packageId, portal: 'PASS' },
        idor: 'PASS',
        platformAdmin: { trainerTenantsVisible: adminTenants.tenants.filter((item) => item.tenantType === 'independent_trainer').length }
    }));
}

main().catch((error) => {
    console.error(JSON.stringify({ status: 'FAIL', message: error.message }));
    process.exitCode = 1;
});
