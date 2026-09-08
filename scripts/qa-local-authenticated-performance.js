'use strict';

// Local QA only. This runner prepares an isolated tenant fixture, starts the
// real application, logs in through the real auth endpoint, and runs the
// read-only performance baseline. It never accepts production-like database
// targets and never prints credentials or session cookies.
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { chromium } = require('@playwright/test');

require('dotenv').config();

const { closePool, getPool, sql } = require('../src/database');
const { hashPassword } = require('../src/services/auth-service');
const memberService = require('../src/services/member-service');
const { runTenantContext } = require('../src/tenancy/tenant-context');
const { assertSafeDatabaseTarget } = require('./verification-target');

const REPO_ROOT = path.resolve(__dirname, '..');
const TENANT_ID = 1;
const OWNER_ID = 1;
const ADMIN_ID = 2;
const SEED_TAG = 'PERF_TEST_SEED';
const BRANCH_CODE = 'perf-main-20260909';
const BASE_URL = 'http://127.0.0.1:3010';

function required(name) {
    const value = String(process.env[name] || '');
    if (!value) throw new Error(`${name} is required.`);
    return value;
}

function localEnvironmentGuard() {
    assertSafeDatabaseTarget({
        environment: process.env.PERF_SEED_ENV,
        confirmation: process.env.PERF_SEED_CONFIRM,
        allowedHosts: process.env.PERF_SEED_ALLOWED_DB_HOSTS,
        purpose: 'Local authenticated performance QA'
    });
    if (String(process.env.PERF_SEED_ENV).trim().toLowerCase() !== 'local') {
        throw new Error('This runner is restricted to the local QA environment.');
    }
}

async function ensureBranchFixture() {
    return runTenantContext({ tenantId: TENANT_ID, mode: 'tenant' }, async () => {
        const pool = await getPool();
        const result = await pool.request()
            .input('tenantId', sql.Int, TENANT_ID)
            .input('branchCode', sql.VarChar(40), BRANCH_CODE)
            .query(`
                DECLARE @branchId INT;
                SELECT @branchId=id
                FROM dbo.gym_branches
                WHERE tenant_id=@tenantId AND branch_code=@branchCode;
                IF @branchId IS NULL
                BEGIN
                    INSERT INTO dbo.gym_branches
                        (tenant_id,branch_code,name,status,is_main_branch,created_by_user_id)
                    VALUES
                        (@tenantId,@branchCode,N'Performance Main Branch','active',0,@tenantId);
                    SET @branchId=SCOPE_IDENTITY();
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM dbo.gym_branch_commerce_config
                    WHERE tenant_id=@tenantId AND branch_id=@branchId
                )
                    INSERT INTO dbo.gym_branch_commerce_config(tenant_id,branch_id)
                    VALUES (@tenantId,@branchId);
                IF NOT EXISTS (
                    SELECT 1 FROM dbo.gym_branch_sections
                    WHERE tenant_id=@tenantId AND branch_id=@branchId AND section_code='perf-men'
                )
                    INSERT INTO dbo.gym_branch_sections(tenant_id,branch_id,section_code,name,section_type)
                    VALUES (@tenantId,@branchId,'perf-men',N'Men','men');
                IF NOT EXISTS (
                    SELECT 1 FROM dbo.gym_branch_sections
                    WHERE tenant_id=@tenantId AND branch_id=@branchId AND section_code='perf-women'
                )
                    INSERT INTO dbo.gym_branch_sections(tenant_id,branch_id,section_code,name,section_type)
                    VALUES (@tenantId,@branchId,'perf-women',N'Women','women');
                IF NOT EXISTS (
                    SELECT 1 FROM dbo.gym_branch_sections
                    WHERE tenant_id=@tenantId AND branch_id=@branchId AND section_code='perf-mixed'
                )
                    INSERT INTO dbo.gym_branch_sections(tenant_id,branch_id,section_code,name,section_type)
                    VALUES (@tenantId,@branchId,'perf-mixed',N'Mixed','mixed');
                SELECT @branchId AS branch_id;
            `);
        return Number(result.recordset[0]?.branch_id || 0);
    });
}

async function fixtureCount() {
    return runTenantContext({ tenantId: TENANT_ID, mode: 'tenant' }, async () => {
        const pool = await getPool();
        const result = await pool.request()
            .input('tenantId', sql.Int, TENANT_ID)
            .input('seedTag', sql.NVarChar(100), SEED_TAG)
            .query('SELECT COUNT_BIG(*) AS total FROM dbo.members WHERE tenant_id=@tenantId AND notes=@seedTag;');
        return Number(result.recordset[0]?.total || 0);
    });
}

function runSeedIfNeeded() {
    const existing = spawnSync(process.execPath, ['scripts/seed-performance-test-data.js', '--count=500'], {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            PERF_SEED_TENANT_ID: String(TENANT_ID),
            PERF_SEED_SKIP_INIT: '1',
            PERF_SEED_ENV: 'local',
            PERF_SEED_CONFIRM: 'local',
            PERF_SEED_ALLOWED_DB_HOSTS: 'localhost'
        },
        encoding: 'utf8',
        maxBuffer: 1024 * 1024
    });
    if (existing.status !== 0) {
        throw new Error(`Local performance fixture seed failed: ${String(existing.stderr || existing.stdout || '').trim()}`);
    }
}

async function bindFixtureScope(branchId) {
    return runTenantContext({ tenantId: TENANT_ID, mode: 'tenant' }, async () => {
        const pool = await getPool();
        const request = pool.request()
            .input('tenantId', sql.Int, TENANT_ID)
            .input('branchId', sql.Int, branchId)
            .input('seedTag', sql.NVarChar(100), SEED_TAG);
        await request.query(`
            DECLARE @sectionId INT=(
                SELECT TOP (1) id FROM dbo.gym_branch_sections
                WHERE tenant_id=@tenantId AND branch_id=@branchId AND section_type='mixed'
            );
            INSERT INTO dbo.gym_membership_branch_access(tenant_id,membership_id,branch_id)
            SELECT m.tenant_id,m.id,@branchId
            FROM dbo.memberships AS m
            WHERE m.tenant_id=@tenantId AND m.notes=@seedTag
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.gym_membership_branch_access AS access
                  WHERE access.membership_id=m.id AND access.branch_id=@branchId
              );
            INSERT INTO dbo.gym_membership_section_access(tenant_id,membership_id,section_id)
            SELECT m.tenant_id,m.id,@sectionId
            FROM dbo.memberships AS m
            WHERE m.tenant_id=@tenantId AND m.notes=@seedTag AND @sectionId IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.gym_membership_section_access AS access
                  WHERE access.membership_id=m.id AND access.section_id=@sectionId
              );
            INSERT INTO dbo.gym_attendance
                (tenant_id,member_id,membership_id,attendance_date,check_in_source,branch_id,section_id,notes)
            SELECT TOP (200)
                m.tenant_id,m.id,ms.id,
                DATEADD(day,-(m.id % 14),CONVERT(date,SYSUTCDATETIME())),
                'manual',@branchId,@sectionId,@seedTag
            FROM dbo.members AS m
            INNER JOIN dbo.memberships AS ms
                ON ms.member_id=m.id AND ms.tenant_id=m.tenant_id
            WHERE m.tenant_id=@tenantId AND m.notes=@seedTag AND @sectionId IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM dbo.gym_attendance AS attendance
                  WHERE attendance.member_id=m.id
                    AND attendance.attendance_date=DATEADD(day,-(m.id % 14),CONVERT(date,SYSUTCDATETIME()))
              );
        `);
    });
}

async function prepareCredentials() {
    const ownerPassword = required('QA_OWNER_PASSWORD');
    const adminPassword = required('QA_PLATFORM_ADMIN_PASSWORD');
    return runTenantContext({ tenantId: null, mode: 'platform' }, async () => {
        const pool = await getPool();
        const ownerHash = await hashPassword(ownerPassword);
        const adminHash = await hashPassword(adminPassword);
        await pool.request()
            .input('ownerId', sql.Int, OWNER_ID)
            .input('adminId', sql.Int, ADMIN_ID)
            .input('ownerHash', sql.NVarChar(512), ownerHash)
            .input('adminHash', sql.NVarChar(512), adminHash)
            .query(`
                UPDATE dbo.gym_users
                SET password_hash=@ownerHash,must_change_password=0,
                    password_changed_at=SYSUTCDATETIME(),status='Active',updated_at=SYSUTCDATETIME()
                WHERE id=@ownerId;
                UPDATE dbo.gym_users
                SET password_hash=@adminHash,must_change_password=0,
                    password_changed_at=SYSUTCDATETIME(),status='Active',updated_at=SYSUTCDATETIME()
                WHERE id=@adminId;
            `);
    });
}

async function login(email, password) {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw new Error(`QA login failed with HTTP ${response.status}.`);
    const cookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);
    const cookie = cookies.map((value) => String(value).split(';', 1)[0]).filter(Boolean).join('; ');
    if (!cookie) throw new Error('QA login did not return a session cookie.');
    return cookie;
}

async function waitForHealth() {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`${BASE_URL}/api/health`);
            if (response.status === 200) return;
        } catch (_) {
            // The local server may still be starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Local QA server did not become ready.');
}

async function measureBranches(cookie) {
    for (const route of ['/api/branches', '/api/branches/bootstrap']) {
        const samples = [];
        for (let index = 0; index < 6; index += 1) {
            const started = performance.now();
            const duration = Math.round((performance.now() - started) * 100) / 100;
            try {
                const response = await fetch(`${BASE_URL}${route}`, {
                    headers: { Cookie: cookie, Accept: 'application/json', 'X-Logic-Fit-Baseline': 'read-only' }
                });
                await response.arrayBuffer();
                if (index > 0) samples.push({ status: response.status, duration: Math.round((performance.now() - started) * 100) / 100, serverTiming: response.headers.get('server-timing') || '' });
            } catch (error) {
                if (index > 0) samples.push({ status: 0, duration: Math.round((performance.now() - started) * 100) / 100, error: error.code || 'NETWORK_ERROR' });
            }
        }
        console.log(`MANUAL ${route} ${JSON.stringify(samples)}`);
    }
}

async function diagnoseReadOnlyRoutes(cookie) {
    for (const route of ['/api/members?page=1&pageSize=20', '/api/bootstrap']) {
        const response = await fetch(`${BASE_URL}${route}`, {
            headers: { Cookie: cookie, Accept: 'application/json', 'X-Logic-Fit-Baseline': 'read-only' }
        });
        const body = await response.json().catch(() => ({}));
        console.log(`DIAGNOSTIC ${route} ${JSON.stringify({ status: response.status, code: body.code || null, error: body.error || null })}`);
    }
}

async function diagnoseBackendServices() {
    for (const [name, operation] of [
        ['members-service', () => memberService.getMembers({ readOnly: true, page: 1, pageSize: 20 })],
        ['bootstrap-service', () => memberService.getBootstrap({ readOnly: true })]
    ]) {
        try {
            await runTenantContext({ tenantId: TENANT_ID, userId: OWNER_ID, mode: 'tenant', readOnlyBaseline: true }, operation);
            console.log(`SERVICE_DIAGNOSTIC ${name} OK`);
        } catch (error) {
            console.log(`SERVICE_DIAGNOSTIC ${name} ${JSON.stringify({ code: error.code || null, number: error.number || null, message: error.message || 'unknown' })}`);
        }
    }
}

async function browserPerformanceAudit(password) {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ar-EG' });
        const apiRequests = [];
        const failedRequests = [];
        const consoleErrors = [];
        page.on('request', (request) => {
            if (request.method() === 'GET' && new URL(request.url()).pathname.startsWith('/api/')) {
                apiRequests.push(new URL(request.url()).pathname);
            }
        });
        page.on('requestfailed', (request) => {
            if (new URL(request.url()).pathname.startsWith('/api/')) failedRequests.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText || 'failed' });
        });
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 240));
        });
        await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
        const entry = page.locator('#saasEntryContinue');
        if (await entry.isVisible().catch(() => false)) await entry.click();
        await page.locator('#loginEmail').fill('qa-gym-owner@local.test');
        await page.locator('#loginPassword').fill(password);
        await page.locator('#loginSubmit').click();
        await page.locator('[data-page-tab="dashboard"]').waitFor({ state: 'visible', timeout: 20_000 });
        // Login intentionally navigates back to the application shell. The
        // anonymous login page and the authenticated shell each perform their
        // own session/branding bootstrap, so those requests are not duplicate
        // work within one authenticated application load. Measure the
        // authenticated shell as its own phase.
        apiRequests.length = 0;
        failedRequests.length = 0;
        consoleErrors.length = 0;
        await page.waitForTimeout(600);
        const initialApiPaths = [...apiRequests];
        const initialCounts = apiRequests.reduce((map, path) => map.set(path, (map.get(path) || 0) + 1), new Map());
        const duplicateInitial = [...initialCounts.entries()].filter(([, count]) => count > 1).map(([path, count]) => ({ path, count }));
        for (const [tab, selector] of [['members', '#membersSection'], ['attendance', '#attendanceSection'], ['reports', '#reportsSection']]) {
            await page.locator(`[data-page-tab="${tab}"]`).click();
            await page.locator(selector).waitFor({ state: 'visible', timeout: 20_000 });
            await page.waitForTimeout(250);
        }
        const navigationCounts = apiRequests.reduce((map, path) => map.set(path, (map.get(path) || 0) + 1), new Map());
        const duplicateNavigation = [...navigationCounts.entries()].filter(([, count]) => count > 1).map(([path, count]) => ({ path, count }));
        console.log(`BROWSER_PERF ${JSON.stringify({ initialApiRequests: initialApiPaths.length, initialApiPaths, initialDuplicateRequests: duplicateInitial, navigationApiRequests: apiRequests.length, navigationApiPaths: [...apiRequests], navigationDuplicateRequests: duplicateNavigation, failedApiRequests: failedRequests, consoleErrors })}`);
    } catch (error) {
        console.log(`BROWSER_PERF_BLOCKED ${JSON.stringify({ reason: error.message.slice(0, 240) })}`);
    } finally {
        await browser?.close().catch(() => {});
    }
}

function runBaseline(ownerCookie) {
    const result = spawnSync(process.execPath, ['scripts/performance-baseline.js'], {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            QA_BASE_URL: BASE_URL,
            PERF_BASELINE_ENV: 'local',
            PERF_BASELINE_SAMPLES: '5',
            PERF_BASELINE_WARMUPS: '1',
            PERF_BASELINE_TIMEOUT_MS: '30000',
            PERF_BASELINE_LABEL: 'qa-authenticated-20260909',
            PERF_OUTPUT_FILE: 'qa/reports/baseline-qa-authenticated-20260909.json',
            PERF_INCLUDE_MEMBER_PORTAL_ROUTES: '0',
            PERF_TENANT_COOKIE: ownerCookie,
            PERF_PLATFORM_COOKIE: ''
        },
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024
    });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.status !== 0) throw new Error('Authenticated QA baseline reported request failures.');
}

async function main() {
    localEnvironmentGuard();
    const ownerPassword = required('QA_OWNER_PASSWORD');
    const server = spawn(process.execPath, ['-e', "const app=require('./server');const port=Number(process.env.PORT||3010);app.listen(port,()=>process.stdout.write('READY\\n'));"], {
        cwd: REPO_ROOT,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            PORT: '3010',
            PERFORMANCE_METRICS: 'true',
            CACHE_ENABLED: 'false',
            QA_SKIP_SCHEMA_BOOTSTRAP: '1'
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let serverError = '';
    let serverOutput = '';
    server.stderr.on('data', (chunk) => { serverError += String(chunk).slice(-4000); });
    server.stdout.on('data', (chunk) => { serverOutput += String(chunk).slice(-4000); });
    try {
        const branchId = await ensureBranchFixture();
        const existing = await fixtureCount();
        if (existing === 0) runSeedIfNeeded();
        const seeded = await fixtureCount();
        if (seeded < 500) throw new Error('The local performance fixture is incomplete.');
        await bindFixtureScope(branchId);
        await prepareCredentials();
        await diagnoseBackendServices();
        try {
            await waitForHealth();
        } catch (error) {
            const diagnostic = [serverError, serverOutput].filter(Boolean).join(' | ').replace(/\s+/g, ' ').slice(-3000);
            throw new Error(`${error.message}${diagnostic ? `: ${diagnostic}` : ''}`);
        }
        const ownerCookie = await login('qa-gym-owner@local.test', ownerPassword);
        await diagnoseReadOnlyRoutes(ownerCookie);
        runBaseline(ownerCookie);
        await browserPerformanceAudit(ownerPassword);
        await measureBranches(ownerCookie);
        console.log(`QA_FIXTURE_READY members=${seeded} branch=${branchId}`);
    } catch (error) {
        const diagnostic = [serverError, serverOutput].filter(Boolean).join(' | ').replace(/\s+/g, ' ').slice(-3000);
        if (diagnostic) console.error(`LOCAL_SERVER_DIAGNOSTICS: ${diagnostic}`);
        throw error;
    } finally {
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 250));
        await closePool().catch(() => {});
    }
    if (server.exitCode && serverError) throw new Error('Local QA server exited unexpectedly.');
}

main().catch(async (error) => {
    console.error(`LOCAL_AUTHENTICATED_PERF_FAILED: ${error.message}`);
    await closePool().catch(() => {});
    process.exitCode = 1;
});
