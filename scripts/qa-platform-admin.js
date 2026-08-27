'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const app = require('../server');
const { closePool, initDatabase } = require('../src/database');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const tenantService = require('../src/services/tenant-service');
const authService = require('../src/services/auth-service');
const libraryService = require('../src/services/library-service');
const coachingService = require('../src/services/coaching-service');
const dayPassService = require('../src/services/day-pass-service');
const membershipCodeService = require('../src/services/membership-code-service');
const memberFeedbackService = require('../src/services/member-feedback-service');
const storeService = require('../src/services/store-service');
const intelligenceService = require('../src/services/intelligence-service');
const brandingService = require('../src/services/branding-service');
const saasService = require('../src/services/saas-service');

function credentials(prefix, fallbackPrefix = prefix) {
    return {
        email: process.env[`QA_${prefix}_EMAIL`] || process.env[`AUTH_${fallbackPrefix}_EMAIL`] || '',
        password: process.env[`QA_${prefix}_PASSWORD`] || process.env[`AUTH_${fallbackPrefix}_PASSWORD`] || ''
    };
}

function cookieFrom(response) {
    const raw = response.headers.get('set-cookie') || '';
    const match = raw.match(/topgym_session=([^;]+)/);
    return match ? `topgym_session=${match[1]}` : '';
}

async function request(baseUrl, path, { cookie = '', ...options } = {}) {
    const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) };
    return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function login(baseUrl, account) {
    const response = await request(baseUrl, '/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(account)
    });
    assert.equal(response.status, 200, `login failed for ${account.email}`);
    const body = await response.json();
    const cookie = cookieFrom(response);
    assert.ok(cookie, `no session cookie returned for ${account.email}`);
    return { body, cookie };
}

async function prepareDatabase() {
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => initDatabase());
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureTenantTables());
    const bootstrapTenant = await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureBootstrapTenant());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureSaasTables());
    await runTenantContext({ mode: 'tenant', tenantId: bootstrapTenant.id }, async () => {
        await authService.ensureAuthReady();
        await libraryService.ensureLibraryData();
        await coachingService.ensureCoachingTables();
        await dayPassService.ensureDayPassTables();
        await membershipCodeService.ensureMembershipCodeStorage();
        await memberFeedbackService.ensureMemberFeedbackTable();
        await storeService.ensureStoreTables();
        await intelligenceService.ensureIntelligenceTables();
        await brandingService.ensureBrandingTables();
    });
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureBootstrapSubscription(bootstrapTenant.id));
}

(async () => {
    const platformAdmin = credentials('PLATFORM_ADMIN');
    if (!platformAdmin.email || !platformAdmin.password) {
        console.log('PLATFORM_ADMIN_QA_SKIPPED - set AUTH_PLATFORM_ADMIN_EMAIL/AUTH_PLATFORM_ADMIN_PASSWORD (or QA_PLATFORM_ADMIN_*) to run live authentication checks.');
        return;
    }

    let server;
    try {
        await prepareDatabase();
        server = app.listen(0);
        await new Promise((resolve) => server.once('listening', resolve));
        const baseUrl = `http://127.0.0.1:${server.address().port}`;

        const anonymousPage = await request(baseUrl, '/platform-admin');
        assert.equal(anonymousPage.status, 200, 'anonymous Platform Admin page should be reachable');
        assert.match(await anonymousPage.text(), /platformAdminLoginScreen/);

        const anonymousApi = await request(baseUrl, '/api/platform-admin/dashboard');
        assert.equal(anonymousApi.status, 401, 'anonymous Platform Admin API access must be rejected');

        const platformSession = await login(baseUrl, platformAdmin);
        assert.equal(platformSession.body.user.role, 'PlatformAdmin');
        const platformPage = await request(baseUrl, '/platform-admin', { cookie: platformSession.cookie });
        assert.equal(platformPage.status, 200, 'PlatformAdmin page should be accessible');
        const platformPageHtml = await platformPage.text();
        assert.match(platformPageHtml, /platformAdminApp/);
        const dashboard = await request(baseUrl, '/api/platform-admin/dashboard', { cookie: platformSession.cookie });
        assert.equal(dashboard.status, 200, 'PlatformAdmin dashboard API should be accessible');
        const tenants = await request(baseUrl, '/api/platform-admin/tenants', { cookie: platformSession.cookie });
        assert.equal(tenants.status, 200, 'PlatformAdmin tenant directory API should be accessible');

        for (const [label, account] of [['Owner', credentials('OWNER')], ['Assistant', credentials('ASSISTANT')]]) {
            if (!account.email || !account.password) {
                console.log(`PLATFORM_ADMIN_${label.toUpperCase()}_QA_SKIPPED - credentials were not configured.`);
                continue;
            }
            const session = await login(baseUrl, account);
            assert.notEqual(session.body.user.role, 'PlatformAdmin');
            const page = await request(baseUrl, '/platform-admin', { cookie: session.cookie });
            assert.equal(page.status, 403, `${label} must not open the Platform Admin page`);
            const api = await request(baseUrl, '/api/platform-admin/dashboard', { cookie: session.cookie });
            assert.equal(api.status, 403, `${label} must not call Platform Admin APIs`);
        }

        console.log('PLATFORM_ADMIN_QA_PASSED');
    } catch (error) {
        console.error(`PLATFORM_ADMIN_QA_FAILED - ${error.message}`);
        process.exitCode = 1;
    } finally {
        if (server) await new Promise((resolve) => server.close(resolve));
        await closePool().catch(() => {});
    }
})().catch((error) => {
    console.error(`PLATFORM_ADMIN_QA_FAILED - ${error.message}`);
    process.exitCode = 1;
}).finally(() => closePool().catch(() => {}));
