'use strict';

// Local QA fixture bootstrap only. This script deliberately uses the public
// application contracts for fixture provisioning so that QA exercises the same
// authentication, tenant resolution, permissions, membership, and portal-code
// paths as the browser. It refuses production-like targets.
require('dotenv').config();

const BASE_URL = String(process.env.QA_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const OWNER_EMAIL = String(process.env.QA_OWNER_EMAIL || process.env.QA_GYM_OWNER_EMAIL || 'qa-owner@local.test').trim().toLowerCase();
const ADMIN_EMAIL = String(process.env.QA_PLATFORM_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || 'qa-platform-admin@local.test').trim().toLowerCase();
const TRAINER_EMAIL = String(process.env.QA_TRAINER_EMAIL || 'qa-trainer@local.test').trim().toLowerCase();
const MEMBER_EMAIL = String(process.env.QA_MEMBER_EMAIL || 'qa-member@local.test').trim().toLowerCase();
const OWNER_PASSWORD = String(process.env.QA_OWNER_PASSWORD || '');
const ADMIN_PASSWORD = String(process.env.QA_PLATFORM_ADMIN_PASSWORD || '');
const TRAINER_PASSWORD = String(process.env.QA_TRAINER_PASSWORD || '');

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function requireEmail(value, name) {
    assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), `${name} must be a valid QA email.`);
    return value;
}

function requireLocalTarget() {
    const url = new URL(BASE_URL);
    const connection = String(process.env.MSSQL_CONNECTION_STRING || '');
    const server = connection.match(/(?:Server|Data Source)=([^;]+)/i)?.[1] || '';
    const database = connection.match(/(?:Database|Initial Catalog)=([^;]+)/i)?.[1] || '';
    const hostIsLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())
        && /^(?:localhost|127\.0\.0\.1|\[?::1\]?)(?:,|\\|$)/i.test(server);
    const databaseIsQa = /^LogicFit_/i.test(database);
    const environment = String(process.env.NODE_ENV || 'local').trim().toLowerCase();
    const production = environment === 'production' || String(process.env.PRODUCTION || '').trim().toLowerCase() === 'true';
    assert(hostIsLocal, 'QA fixture bootstrap requires a localhost/127.0.0.1 API and database target.');
    assert(databaseIsQa, 'QA fixture bootstrap requires a LogicFit_ local database.');
    assert(!production, 'QA fixture bootstrap refuses production environment targets.');
    return { host: url.hostname, database, environment: environment || 'local', production };
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function addDays(dateText, days) {
    const date = new Date(`${dateText}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

class Session {
    constructor(name) {
        this.name = name;
        this.cookies = new Map();
    }

    updateCookie(response) {
        const cookies = typeof response.headers.getSetCookie === 'function'
            ? response.headers.getSetCookie()
            : String(response.headers.get('set-cookie') || '').split(/,(?=[^;]+=[^;]+)/);
        for (const value of cookies) {
            const pair = String(value || '').split(';', 1)[0];
            const separator = pair.indexOf('=');
            if (separator <= 0) continue;
            const name = pair.slice(0, separator).trim();
            if (/^(?:auth_session|topgym_session|logicfit_portal_session|logicfit_portal_visitor)$/i.test(name)) {
                this.cookies.set(name, pair.slice(separator + 1));
            }
        }
    }

    async raw(path, options = {}) {
        const headers = new Headers(options.headers || {});
        if (this.cookies.size) headers.set('cookie', [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '));
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

async function ensureOwnerSession() {
    const owner = new Session('gym-owner');
    const login = await owner.login(OWNER_EMAIL, OWNER_PASSWORD);
    assert(login.user?.role === 'Owner', 'Local Gym Owner fixture did not authenticate as Owner.');
    assert(login.user?.tenantType === 'gym', `Local Gym Owner resolved to unexpected tenant type (${login.user?.tenantType || 'missing'}).`);
    assert(login.user?.mustChangePassword === false, 'Local Gym Owner still requires a password change.');
    return owner;
}

async function ensureAdminSession() {
    const admin = new Session('platform-admin');
    const login = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert(login.user?.role === 'PlatformAdmin', 'Local Platform Admin fixture did not authenticate as PlatformAdmin.');
    return admin;
}

async function findTrainerTenant(admin) {
    const query = new URLSearchParams({ search: TRAINER_EMAIL, tenantType: 'independent_trainer', page: '1', pageSize: '100' });
    const result = await admin.expect(`/api/platform-admin/tenants?${query}`);
    return (result.tenants || []).find((tenant) => String(tenant.owner?.email || '').trim().toLowerCase() === TRAINER_EMAIL) || null;
}

async function compatibleTrainerPlan(admin) {
    const result = await admin.expect('/api/platform-admin/plans');
    const plans = (result.plans || []).filter((plan) => {
        const status = String(plan.status || (plan.isActive ? 'active' : 'disabled')).toLowerCase();
        const compatible = Array.isArray(plan.compatibleTenantTypes) && plan.compatibleTenantTypes.length
            ? plan.compatibleTenantTypes.includes('independent_trainer')
            : true;
        return status === 'active' && plan.availableForNewSubscriptions !== false && compatible;
    });
    const preferredCodes = ['basic', 'pro', 'starter'];
    return preferredCodes.map((code) => plans.find((plan) => String(plan.code).toLowerCase() === code)).find(Boolean)
        || plans[0]
        || null;
}

async function ensureTrainerFixture(admin) {
    let tenant = await findTrainerTenant(admin);
    const plan = await compatibleTrainerPlan(admin);
    assert(plan?.code, 'No active plan compatible with independent_trainer is available locally.');
    if (!tenant) {
        const created = await admin.expect('/api/platform-admin/tenants', {
            method: 'POST',
            body: {
                name: 'QA Independent Trainer',
                slug: 'qa-independent-trainer',
                ownerName: 'QA Trainer Owner',
                ownerEmail: TRAINER_EMAIL,
                ownerPassword: TRAINER_PASSWORD,
                trialPlanCode: plan.code,
                tenantType: 'independent_trainer'
            }
        }, [201]);
        tenant = created.tenant;
        assert(tenant?.tenantType === 'independent_trainer', 'Local Trainer fixture was created with the wrong tenant type.');
    } else if (String(tenant.subscription?.plan?.code || '').toLowerCase() !== String(plan.code).toLowerCase()) {
        // Keep an older deterministic QA tenant usable for the Trainer
        // surface without creating a second tenant. The subscription change
        // uses the normal platform-admin contract and is local-fixture data.
        await admin.expect(`/api/platform-admin/tenants/${tenant.id}/subscription`, {
            method: 'PATCH',
            body: {
                action: 'change_plan',
                planId: plan.id,
                effective: 'immediate',
                reason: 'Local QA fixture plan alignment'
            }
        });
    }

    assert(tenant?.id, 'Local Trainer tenant could not be resolved deterministically.');
    const trainer = new Session('independent-trainer');
    let login;
    try {
        login = await trainer.login(TRAINER_EMAIL, TRAINER_PASSWORD);
    } catch (error) {
        // Recovery is limited to the deterministic local QA account. The
        // platform-admin reset endpoint is the official fixture mechanism and
        // returns a one-time temporary password without persisting plaintext.
        const users = await admin.expect(`/api/platform-admin/tenants/${tenant.id}/users`);
        const owner = (users.users || []).find((user) => String(user.email || '').trim().toLowerCase() === TRAINER_EMAIL);
        assert(owner?.id, 'The existing Trainer tenant has no deterministic QA Owner account.');
        const reset = await admin.expect(`/api/platform-admin/tenants/${tenant.id}/users/${owner.id}/reset-password`, { method: 'POST', body: {} });
        assert(reset.temporaryPassword, 'The official local Trainer password reset did not return a temporary credential.');
        const forced = new Session('independent-trainer-forced');
        const temporary = await forced.login(TRAINER_EMAIL, reset.temporaryPassword);
        assert(temporary.user?.mustChangePassword === true, 'The local Trainer reset did not enforce a password change.');
        await forced.expect('/api/auth/change-password', { method: 'POST', body: { newPassword: TRAINER_PASSWORD, confirmPassword: TRAINER_PASSWORD } });
        const old = new Session('independent-trainer-old-password');
        const oldResult = await old.raw('/api/auth/login', { method: 'POST', body: { email: TRAINER_EMAIL, password: reset.temporaryPassword } });
        assert(oldResult.status === 401, 'The temporary Trainer credential remained valid after rotation.');
        login = await trainer.login(TRAINER_EMAIL, TRAINER_PASSWORD);
    }
    assert(login.user?.role === 'Owner', 'Local Trainer fixture did not authenticate as Owner.');
    assert(login.user?.tenantType === 'independent_trainer', `Local Trainer resolved to unexpected tenant type (${login.user?.tenantType || 'missing'}).`);
    assert(login.user?.mustChangePassword === false, 'Local Trainer fixture requires an unexpected password change.');
    const session = await trainer.expect('/api/auth/session');
    assert(session.user?.tenantType === 'independent_trainer', 'Local Trainer session lost tenant type resolution.');
    await trainer.expect('/api/trainer/workspace');
    return { tenant, email: TRAINER_EMAIL, session: trainer };
}

async function findMember(owner) {
    const query = new URLSearchParams({ search: MEMBER_EMAIL, page: '1', pageSize: '100' });
    const result = await owner.expect(`/api/members?${query}`);
    return (result.members || []).find((member) => String(member.email || '').trim().toLowerCase() === MEMBER_EMAIL) || null;
}

async function ensureMemberFixture(owner) {
    let member = await findMember(owner);
    if (!member) {
        const pricing = await owner.expect('/api/pricing');
        const typeCode = Object.entries(pricing.types || {}).find(([, type]) => type.active !== false && type.mode === 'months')?.[0]
            || Object.keys(pricing.types || {})[0];
        const planCode = Object.entries(pricing.plans || {}).find(([, plan]) => plan.active !== false)?.[0];
        assert(typeCode && planCode, 'Local Gym pricing catalog has no active membership type and plan.');
        const startDate = today();
        const result = await owner.expect('/api/members', {
            method: 'POST',
            headers: { 'idempotency-key': 'qa-local-member-fixture-v1' },
            body: {
                fullName: 'QA Member Fixture',
                phone: String(process.env.QA_MEMBER_PHONE || '+201012345678'),
                email: MEMBER_EMAIL,
                registrationDate: startDate,
                notes: 'Local QA fixture. Synthetic data only.',
                createMembership: true,
                startDate,
                endDate: addDays(startDate, 30),
                membershipNotes: 'Local QA fixture. Synthetic data only.',
                membershipType: typeCode,
                membershipPlan: planCode,
                discountAmount: 0,
                amountPaid: 0,
                paymentMethod: 'cash'
            }
        }, [201]);
        member = result.member || result;
    }
    assert(member?.id, 'Local Member fixture could not be resolved deterministically.');
    const revealed = await owner.expect(`/api/members/${member.id}/membership-code/reveal`, { method: 'POST', body: {} });
    const code = String(revealed.membershipCode || revealed.code || member.membershipCode || '').trim();
    assert(code, 'Local Member fixture has no active membership portal code.');

    const portal = new Session('member-portal');
    const lookup = await portal.expect('/api/member-portal/lookup', { method: 'POST', body: { membershipCode: code } });
    assert(String(lookup.member?.email || '').trim().toLowerCase() === MEMBER_EMAIL, 'Membership code resolved to the wrong local member.');
    const session = await portal.expect('/api/member-portal/session');
    assert(Number(session.memberId) === Number(member.id), 'Member Portal session was not established by the real code flow.');
    return { member, membershipCode: code, session: portal, email: MEMBER_EMAIL };
}

async function prepareFixtures() {
    const safety = requireLocalTarget();
    assert(OWNER_PASSWORD && ADMIN_PASSWORD && TRAINER_PASSWORD, 'QA_OWNER_PASSWORD, QA_PLATFORM_ADMIN_PASSWORD, and QA_TRAINER_PASSWORD are required.');
    requireEmail(OWNER_EMAIL, 'QA_OWNER_EMAIL');
    requireEmail(ADMIN_EMAIL, 'QA_PLATFORM_ADMIN_EMAIL');
    requireEmail(TRAINER_EMAIL, 'QA_TRAINER_EMAIL');
    requireEmail(MEMBER_EMAIL, 'QA_MEMBER_EMAIL');
    const owner = await ensureOwnerSession();
    const admin = await ensureAdminSession();
    const trainer = await ensureTrainerFixture(admin);
    const member = await ensureMemberFixture(owner);
    return { safety, owner, admin, trainer, member };
}

if (require.main === module) {
    prepareFixtures()
        .then(({ safety }) => {
            console.log(`QA_LOCAL_FIXTURES_READY host=${safety.host} database=${safety.database} environment=${safety.environment} production=${safety.production}`);
        })
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}

module.exports = { prepareFixtures, Session };
