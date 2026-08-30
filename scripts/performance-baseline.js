'use strict';

// Read-only performance baseline runner. It sends GET requests only; an
// already-issued session cookie must be supplied through the environment so
// this tool never performs a login POST or stores credentials.
if (process.env.PERFORMANCE_METRICS === undefined) process.env.PERFORMANCE_METRICS = 'true';
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { todayInTimeZone } = require('../src/utils/date');

const LOCAL_HOST_PATTERN = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i;
const ALLOWED_ENVIRONMENTS = new Set(['local', 'development', 'test', 'staging']);
const KNOWN_PRODUCTION_HOSTS = new Set([
    'gym-membership-app-smoky.vercel.app'
]);
const KNOWN_PRODUCTION_DEPLOYMENT_PATTERN = /^gym-membership-[a-z0-9]+-ahmedsalem104s-projects\.vercel\.app$/i;
const DEFAULT_SAMPLES = 5;
const DEFAULT_WARMUPS = 1;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_TIMEOUT_MS = 30_000;

function numberEnv(name, fallback, { min = 0, max = 20 } = {}) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${name} must be a number.`);
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

function positiveNumberEnv(name, fallback, { min = 250, max = 120_000 } = {}) {
    return numberEnv(name, fallback, { min, max });
}

function sleep(milliseconds) {
    return milliseconds > 0 ? new Promise((resolve) => setTimeout(resolve, milliseconds)) : Promise.resolve();
}

function percentile(values, ratio) {
    if (!values.length) return null;
    const sorted = [...values].sort((first, second) => first - second);
    const position = (sorted.length - 1) * ratio;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return Math.round(sorted[lower] * 100) / 100;
    const value = sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
    return Math.round(value * 100) / 100;
}

function average(values) {
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : null;
}

function summary(values) {
    return {
        average: average(values),
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        p99: percentile(values, 0.99),
        min: percentile(values, 0),
        max: percentile(values, 1)
    };
}

function round(value) {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function gitCommit() {
    if (process.env.GIT_COMMIT) return String(process.env.GIT_COMMIT).slice(0, 80);
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (_) {
        return 'unknown';
    }
}

function parseServerTiming(value) {
    const result = {};
    for (const entry of String(value || '').split(',')) {
        const app = entry.match(/\bapp;dur=([0-9.]+)/);
        const db = entry.match(/\bdb;dur=([0-9.]+)/);
        const dbWork = entry.match(/\bdb-work;dur=([0-9.]+)/);
        const queries = entry.match(/\bdb-queries;desc=(?:"|\\")?(\d+)/);
        if (app) result.appMs = Number(app[1]);
        if (db) result.dbMs = Number(db[1]);
        if (dbWork) result.dbWorkMs = Number(dbWork[1]);
        if (queries) result.dbQueries = Number(queries[1]);
    }
    return result;
}

function normalizedHost(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^[a-z]+:\/\//, '')
        .split('/')[0]
        .split(':')[0];
}

async function readJson(response, buffer) {
    if (!String(response.headers.get('content-type') || '').includes('json')) return null;
    try {
        return JSON.parse(Buffer.from(buffer).toString('utf8'));
    } catch (_) {
        return null;
    }
}

function safeRoutePath(route) {
    return route.reportPath || route.path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');
}

async function request(baseUrl, route, cookie, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = performance.now();
    try {
        const response = await fetch(`${baseUrl}${route.path}`, {
            method: 'GET',
            // A staging alias must not be able to redirect the read-only
            // runner to an unapproved host. Configure the final HTTPS URL.
            redirect: 'manual',
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'X-Logic-Fit-Baseline': 'read-only',
                ...(cookie ? { Cookie: cookie } : {}),
                ...(route.headers || {})
            }
        });
        const buffer = await response.arrayBuffer();
        const timing = parseServerTiming(response.headers.get('server-timing'));
        const body = route.captureBody ? await readJson(response, buffer) : null;
        return {
            status: response.status,
            durationMs: round(performance.now() - startedAt),
            payloadBytes: buffer.byteLength,
            timing,
            timeout: false,
            fixture: route.captureBody ? route.captureBody(body) : null
        };
    } catch (error) {
        const timedOut = controller.signal.aborted;
        return {
            status: 0,
            durationMs: round(performance.now() - startedAt),
            payloadBytes: 0,
            timing: {},
            timeout: timedOut,
            fixture: null,
            errorCode: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR'
        };
    } finally {
        clearTimeout(timeout);
    }
}

function isSuccessful(status) {
    return status >= 200 && status < 300;
}

function aggregate(samples) {
    const durations = samples.map((sample) => sample.durationMs).filter(Number.isFinite);
    const payloads = samples.map((sample) => sample.payloadBytes).filter(Number.isFinite);
    const appDurations = samples.map((sample) => sample.timing.appMs).filter(Number.isFinite);
    const dbDurations = samples.map((sample) => sample.timing.dbMs).filter(Number.isFinite);
    const dbWorkDurations = samples.map((sample) => sample.timing.dbWorkMs).filter(Number.isFinite);
    const dbQueries = samples.map((sample) => sample.timing.dbQueries).filter(Number.isFinite);
    const serverApplicationOverhead = samples
        .filter((sample) => Number.isFinite(sample.timing.appMs) && Number.isFinite(sample.timing.dbMs))
        .map((sample) => Math.max(0, sample.timing.appMs - sample.timing.dbMs));
    const applicationNetworkOverhead = samples
        .filter((sample) => Number.isFinite(sample.durationMs) && Number.isFinite(sample.timing.dbMs))
        .map((sample) => Math.max(0, sample.durationMs - sample.timing.dbMs));
    const statuses = {};
    samples.forEach((sample) => {
        const key = String(sample.status);
        statuses[key] = (statuses[key] || 0) + 1;
    });
    const successfulRequests = samples.filter((sample) => isSuccessful(sample.status)).length;
    const failedRequests = samples.length - successfulRequests;
    return {
        totalRequests: samples.length,
        successfulRequests,
        failedRequests,
        statusDistribution: statuses,
        timeoutCount: samples.filter((sample) => sample.timeout).length,
        errorRate: samples.length ? round((failedRequests / samples.length) * 100) : 0,
        totalApiLatencyMs: summary(durations),
        serverApplicationMs: appDurations.length ? summary(appDurations) : null,
        dbLatencyMs: dbDurations.length ? summary(dbDurations) : null,
        dbWorkMs: dbWorkDurations.length ? summary(dbWorkDurations) : null,
        dbQueries: dbQueries.length ? summary(dbQueries) : null,
        // Runner time is measured around fetch(), so this includes network,
        // server application work, serialization, and proxy overhead. It must
        // not be interpreted as pure Node execution time.
        applicationNetworkOverheadMs: applicationNetworkOverhead.length ? summary(applicationNetworkOverhead) : null,
        serverApplicationOverheadMs: serverApplicationOverhead.length ? summary(serverApplicationOverhead) : null,
        dbTiming: dbDurations.length ? 'AVAILABLE' : 'NOT AVAILABLE',
        responseSizeBytes: {
            average: average(payloads),
            max: percentile(payloads, 1)
        },
        errors: samples
            .filter((sample) => sample.errorCode || sample.status >= 400)
            .map((sample) => ({ status: sample.status, code: sample.errorCode || `HTTP_${sample.status}` }))
    };
}

function warmupSummary(samples) {
    if (!samples.length) return { totalRequests: 0, firstRequestMs: null, firstRequestStatus: null, latencyMs: null };
    return {
        totalRequests: samples.length,
        firstRequestMs: samples[0].durationMs,
        firstRequestStatus: samples[0].status,
        latencyMs: summary(samples.map((sample) => sample.durationMs))
    };
}

async function runBatch(baseUrl, route, cookie, { count, concurrency, delayMs, timeoutMs, capture }) {
    const measurements = new Array(count);
    let cursor = 0;
    async function worker() {
        while (true) {
            const index = cursor;
            cursor += 1;
            if (index >= count) return;
            const result = await request(baseUrl, route, cookie, timeoutMs);
            if (capture && result.fixture != null) capture(result.fixture);
            measurements[index] = result;
            await sleep(delayMs);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, count) }, () => worker()));
    return measurements;
}

async function runRoutes(baseUrl, cookie, routes, options) {
    const results = [];
    const fixtures = {};
    for (const route of routes) {
        const warmups = await runBatch(baseUrl, route, cookie, {
            ...options,
            count: options.warmups,
            capture: (value) => { fixtures[route.name] = value; }
        });
        const measurements = await runBatch(baseUrl, route, cookie, {
            ...options,
            count: options.samples,
            capture: (value) => { fixtures[route.name] = value; }
        });
        results.push({
            route: route.name,
            path: safeRoutePath(route),
            warmup: warmupSummary(warmups),
            ...aggregate(measurements)
        });
    }
    return { results, fixtures };
}

function createTenantRoutes(tenantHeaders) {
    const today = todayInTimeZone();
    const from = `${today.slice(0, 7)}-01`;
    const searchTerm = String(process.env.PERF_MEMBER_SEARCH || '').trim().slice(0, 100);
    const searchRoute = searchTerm
        ? [{ name: 'member-search', path: `/api/members?search=${encodeURIComponent(searchTerm)}&page=1&pageSize=20`, reportPath: '/api/members?search=:fixture&page=1&pageSize=20' }]
        : [];
    return [
        { name: 'session', path: '/api/auth/session' },
        { name: 'members', path: '/api/members?page=1&pageSize=20', captureBody: (body) => Number(body?.members?.[0]?.id || 0) || null },
        ...searchRoute,
        { name: 'dashboard', path: '/api/dashboard' },
        { name: 'dashboard-analytics', path: '/api/dashboard-analytics?period=month' },
        { name: 'attendance', path: '/api/attendance' },
        { name: 'attendance-report', path: `/api/attendance/report?from=${from}&to=${today}` },
        { name: 'pricing', path: '/api/pricing' },
        { name: 'reports', path: `/api/reports?from=${from}&to=${today}` },
        { name: 'external-trainees', path: '/api/external-trainees?page=1&pageSize=20' },
        { name: 'coaching-clients', path: '/api/coaching/clients?page=1&pageSize=20' },
        { name: 'coaching-catalog', path: '/api/coaching/catalog' },
        { name: 'store-dashboard', path: '/api/store/dashboard' },
        { name: 'store-reports', path: `/api/store/reports?from=${from}&to=${today}` },
        { name: 'store-bootstrap', path: '/api/store/bootstrap' },
        { name: 'member-portal-library-options', path: '/api/member-portal/library/options' },
        { name: 'member-portal-exercises', path: '/api/member-portal/library/exercises?page=1&pageSize=18' },
        { name: 'member-portal-foods', path: '/api/member-portal/library/foods?page=1&pageSize=18' },
        { name: 'bootstrap', path: '/api/bootstrap' }
    ].map((route) => ({ ...route, headers: tenantHeaders }));
}

function createPlatformRoutes() {
    return [
        { name: 'session', path: '/api/auth/session' },
        { name: 'platform-dashboard', path: '/api/platform-admin/dashboard' },
        { name: 'platform-tenants', path: '/api/platform-admin/tenants?page=1&pageSize=20' },
        { name: 'platform-requests', path: '/api/platform-admin/subscription-requests?page=1&pageSize=20' },
        { name: 'platform-plans', path: '/api/platform-admin/plans' }
    ];
}

function memberRoutes(memberId) {
    return [
        { name: 'member-details', path: `/api/members/${memberId}`, reportPath: '/api/members/:fixtureMemberId' },
        { name: 'coaching-summary', path: `/api/clients/${memberId}/coaching-summary`, reportPath: '/api/clients/:fixtureMemberId/coaching-summary' },
        { name: 'member-measurements', path: `/api/clients/${memberId}/measurements`, reportPath: '/api/clients/:fixtureMemberId/measurements' },
        { name: 'member-checkins', path: `/api/clients/${memberId}/checkins`, reportPath: '/api/clients/:fixtureMemberId/checkins' }
    ];
}

function compareValue(before, after) {
    if (!Number.isFinite(before) || !Number.isFinite(after)) return { available: false };
    const absoluteDifference = round(after - before);
    const percentageDifference = before === 0 ? null : round((absoluteDifference / Math.abs(before)) * 100);
    const stable = Math.abs(absoluteDifference) >= 5 && (percentageDifference == null || Math.abs(percentageDifference) >= 5);
    return {
        available: true,
        before: round(before),
        after: round(after),
        absoluteDifference,
        percentageDifference,
        interpretation: stable
            ? (absoluteDifference < 0 ? 'IMPROVEMENT' : 'REGRESSION')
            : 'NO SIGNIFICANT CHANGE'
    };
}

function compareRoute(before, after) {
    const compareMetric = (metric) => compareValue(before?.[metric], after?.[metric]);
    return {
        route: after?.route || before?.route,
        metrics: {
            p50: compareMetric('p50'),
            p95: compareMetric('p95'),
            p99: compareMetric('p99')
        }
    };
}

function compareReports(beforeReport, afterReport) {
    const output = [];
    for (const afterProfile of afterReport.profiles || []) {
        const beforeProfile = (beforeReport.profiles || []).find((profile) => profile.name === afterProfile.name);
        for (const afterRoute of afterProfile.routes || []) {
            const beforeRoute = beforeProfile?.routes?.find((route) => route.route === afterRoute.route);
            output.push({
                profile: afterProfile.name,
                ...compareRoute(beforeRoute?.totalApiLatencyMs, afterRoute.totalApiLatencyMs),
                dbTiming: compareRoute(beforeRoute?.dbLatencyMs, afterRoute.dbLatencyMs),
                payload: compareValue(beforeRoute?.responseSizeBytes?.average, afterRoute.responseSizeBytes?.average),
                errorRate: compareValue(beforeRoute?.errorRate, afterRoute.errorRate)
            });
        }
    }
    return output;
}

function loadComparison(file) {
    if (!file || !fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_) {
        throw new Error(`Unable to read comparison report: ${file}`);
    }
}

function validateTarget(baseUrl) {
    const target = new URL(baseUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
        throw new Error('Baseline target must be an HTTP(S) URL without embedded credentials.');
    }
    const local = LOCAL_HOST_PATTERN.test(target.origin);
    const environment = String(process.env.PERF_BASELINE_ENV || (local ? 'local' : '')).trim().toLowerCase();
    if (!ALLOWED_ENVIRONMENTS.has(environment)) {
        throw new Error('PERF_BASELINE_ENV must be local, development, test, or staging.');
    }
    const productionHints = [environment, process.env.VERCEL_ENV, target.hostname]
        .map((value) => String(value || '').toLowerCase());
    const knownProductionHost = KNOWN_PRODUCTION_HOSTS.has(target.hostname.toLowerCase())
        || KNOWN_PRODUCTION_DEPLOYMENT_PATTERN.test(target.hostname);
    if (knownProductionHost || productionHints.some((value) => /(^|[-_.])(prod|production|live)([-_.]|$)/.test(value))) {
        throw new Error('Production-like targets are blocked by the baseline runner.');
    }
    if (!local && (environment !== 'staging' || process.env.PERF_BASELINE_CONFIRM !== 'staging')) {
        throw new Error('External targets require PERF_BASELINE_ENV=staging and PERF_BASELINE_CONFIRM=staging.');
    }
    if (!local) {
        const allowedHosts = String(process.env.PERF_BASELINE_ALLOWED_HOSTS || '')
            .split(',')
            .map(normalizedHost)
            .filter(Boolean);
        if (!allowedHosts.length || !allowedHosts.includes(target.hostname.toLowerCase())) {
            throw new Error('External targets also require PERF_BASELINE_ALLOWED_HOSTS to explicitly allow the staging host.');
        }
    }
    return { target, environment };
}

function requireTargetUrl(baseUrl, requiresAuthenticatedTarget) {
    const normalized = String(baseUrl || '').replace(/\/$/, '');
    if (requiresAuthenticatedTarget && !normalized) {
        throw new Error('QA_BASE_URL is required when a session is provided. Start a prepared local/staging server separately; the runner never bootstraps a database.');
    }
    return normalized;
}

function printHumanReport(report) {
    console.log('\nPERFORMANCE BASELINE (READ-ONLY)');
    console.log(`Environment: ${report.environment} | Host: ${report.targetHost} | Commit: ${report.gitCommit}`);
    console.log(`Total requests: ${report.totalRequests} | Measured: ${report.measuredRequests} | Warm-up: ${report.warmupRequests} | Concurrency: ${report.concurrency} | Timeout: ${report.timeoutMs}ms | Delay: ${report.delayMs}ms`);
    console.log('Total API latency includes fetch/network time. DB timing is aggregate Server-Timing; application/network overhead is not pure Node execution.');
    for (const profile of report.profiles) {
        console.log(`\n[${profile.name}]`);
        console.log('Endpoint | Success/Total | p50 | p95 | p99 | Avg | DB p95 | App/Net p95 | Payload avg | Errors');
        for (const route of profile.routes) {
            const dbP95 = route.dbLatencyMs?.p95 == null ? 'NOT AVAILABLE' : `${route.dbLatencyMs.p95}ms`;
            const overheadP95 = route.applicationNetworkOverheadMs?.p95 == null ? 'NOT AVAILABLE' : `${route.applicationNetworkOverheadMs.p95}ms`;
            console.log(`${route.route} | ${route.successfulRequests}/${route.totalRequests} | ${route.totalApiLatencyMs.p50}ms | ${route.totalApiLatencyMs.p95}ms | ${route.totalApiLatencyMs.p99}ms | ${route.totalApiLatencyMs.average}ms | ${dbP95} | ${overheadP95} | ${route.responseSizeBytes.average}B | ${route.errors.length}`);
        }
    }
    if (report.comparison) {
        console.log(`\nComparison: ${report.comparison.source}`);
        report.comparison.routes.forEach((route) => {
            console.log(`${route.profile}/${route.route}: p50 ${route.metrics.p50.interpretation}, p95 ${route.metrics.p95.interpretation}, p99 ${route.metrics.p99.interpretation}`);
        });
    }
}

async function main() {
    const samples = numberEnv('PERF_BASELINE_SAMPLES', DEFAULT_SAMPLES, { min: 1, max: 20 });
    const warmups = numberEnv('PERF_BASELINE_WARMUPS', DEFAULT_WARMUPS, { min: 0, max: 5 });
    const concurrency = numberEnv('PERF_BASELINE_CONCURRENCY', DEFAULT_CONCURRENCY, { min: 1, max: 5 });
    const timeoutMs = positiveNumberEnv('PERF_BASELINE_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    const delayMs = numberEnv('PERF_BASELINE_DELAY_MS', 0, { min: 0, max: 10_000 });
    const tenantCookie = String(process.env.PERF_TENANT_COOKIE || process.env.PERF_SESSION_COOKIE || '').trim();
    const platformCookie = String(process.env.PERF_PLATFORM_COOKIE || '').trim();
    const configuredBaseUrl = String(process.env.QA_BASE_URL || '').replace(/\/$/, '');
    if (configuredBaseUrl) validateTarget(configuredBaseUrl);
    if (!tenantCookie && !platformCookie) {
        console.log('PERF_BASELINE_SKIPPED - set PERF_TENANT_COOKIE/PERF_PLATFORM_COOKIE with an existing staging session. No login request is sent.');
        return;
    }

    const plannedTenantRoutes = tenantCookie
        ? createTenantRoutes({}).length + memberRoutes(1).length
        : 0;
    const plannedPlatformRoutes = platformCookie ? createPlatformRoutes().length : 0;
    const expectedRoutes = plannedTenantRoutes + plannedPlatformRoutes;
    const requestBudget = expectedRoutes * (samples + warmups);
    if (requestBudget > 1_000) throw new Error('Baseline request budget exceeds the safe 1,000-request cap.');

    const baseUrl = requireTargetUrl(configuredBaseUrl, Boolean(tenantCookie || platformCookie));
    const targetInfo = validateTarget(baseUrl);
    const options = { samples, warmups, concurrency, timeoutMs, delayMs };
    const profiles = [];
    let measuredRequests = 0;
    let warmupRequests = 0;
    if (tenantCookie) {
        const tenantHeaders = {};
        const tenantSlug = String(process.env.PERF_TENANT_SLUG || '').trim();
        if (tenantSlug) tenantHeaders['X-Gym-Slug'] = tenantSlug;
        const tenantRun = await runRoutes(baseUrl, tenantCookie, createTenantRoutes(tenantHeaders), options);
        const memberId = Number(process.env.PERF_MEMBER_ID || tenantRun.fixtures.members || 0);
        if (memberId > 0) {
            const detailRun = await runRoutes(baseUrl, tenantCookie, memberRoutes(memberId).map((route) => ({ ...route, headers: tenantHeaders })), options);
            tenantRun.results.push(...detailRun.results);
        }
        profiles.push({ name: 'tenant', routes: tenantRun.results });
    }
    if (platformCookie) {
        const platformRun = await runRoutes(baseUrl, platformCookie, createPlatformRoutes(), options);
        profiles.push({ name: 'platform', routes: platformRun.results });
    }
    profiles.forEach((profile) => profile.routes.forEach((route) => {
        measuredRequests += route.totalRequests;
        warmupRequests += route.warmup.totalRequests;
    }));
    const label = String(process.env.PERF_BASELINE_LABEL || 'current').trim().replace(/[^a-z0-9_-]/gi, '-') || 'current';
    const outputFile = path.resolve(process.env.PERF_OUTPUT_FILE || path.join('qa', 'reports', `baseline-${label}.json`));
    const report = {
        generatedAt: new Date().toISOString(),
        gitCommit: gitCommit(),
        environment: targetInfo.environment,
        targetHost: targetInfo.target.host,
        nodeVersion: process.version,
        readOnly: true,
        requestMethods: ['GET'],
        measuredRequests,
        warmupRequests,
        totalRequests: measuredRequests + warmupRequests,
        concurrency,
        timeoutMs,
        delayMs,
        profiles,
        comparison: null
    };
    const compareFile = process.env.PERF_COMPARE_FILE
        ? path.resolve(process.env.PERF_COMPARE_FILE)
        : label === 'after' ? path.resolve('qa', 'reports', 'baseline-before.json') : null;
    const beforeReport = loadComparison(compareFile);
    if (beforeReport) {
        report.comparison = {
            source: compareFile,
            routes: compareReports(beforeReport, report)
        };
    }
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    printHumanReport(report);
    console.log(`\nMachine-readable report: ${outputFile}`);
    if (report.profiles.some((profile) => profile.routes.some((route) => route.errors.length))) process.exitCode = 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`PERF_BASELINE_FAILED - ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    aggregate,
    compareReports,
    compareValue,
    parseServerTiming,
    runRoutes,
    requireTargetUrl,
    safeRoutePath,
    validateTarget
};
