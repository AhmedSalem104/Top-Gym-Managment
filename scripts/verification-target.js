'use strict';

const { parseConnectionString } = require('../src/database/pool');

const ALLOWED_ENVIRONMENTS = new Set(['local', 'development', 'test', 'staging']);
const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function normalizedHost(value) {
    const source = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/^tcp:\/\//, '')
        .split(',')[0]
        .trim();
    if (source === '::1' || source === '[::1]') return '::1';
    return source
        .replace(/^\[/, '')
        .replace(/\](?::\d+)?$/, '')
        .replace(/:\d+$/, '');
}

function isProductionLike(value) {
    return /(^|[-_.])(prod|production|live)([-_.]|$)/i.test(String(value || '').trim().toLowerCase());
}

function normalizedAllowedHosts(value) {
    const values = Array.isArray(value) ? value : String(value || '').split(',');
    return values.map(normalizedHost).filter(Boolean);
}

/**
 * Fail closed before a verification script can touch an unidentified or
 * production-like SQL Server. The connection string is parsed in memory only;
 * no credential or target value is included in errors or return data.
 */
function assertSafeDatabaseTarget({
    connectionString = process.env.MSSQL_CONNECTION_STRING || process.env.DATABASE_URL,
    environment,
    confirmation,
    allowedHosts,
    purpose = 'Verification'
} = {}) {
    const target = parseConnectionString(connectionString);
    const resolvedEnvironment = String(environment || '').trim().toLowerCase();
    if (!ALLOWED_ENVIRONMENTS.has(resolvedEnvironment)) {
        throw new Error(`${purpose} requires an explicit local, development, test, or staging environment.`);
    }

    const host = normalizedHost(target.server);
    const database = String(target.database || '').trim().toLowerCase();
    if (isProductionLike(resolvedEnvironment) || isProductionLike(host) || isProductionLike(database)) {
        throw new Error(`${purpose} rejects production-like database targets.`);
    }

    const localTarget = LOCAL_DATABASE_HOSTS.has(host);
    if (!localTarget && resolvedEnvironment !== 'staging') {
        throw new Error(`${purpose} requires staging for external database targets.`);
    }
    if (String(confirmation || '').trim().toLowerCase() !== resolvedEnvironment) {
        throw new Error(`${purpose} requires an explicit target confirmation matching the environment.`);
    }

    if (!localTarget) {
        const permittedHosts = normalizedAllowedHosts(allowedHosts);
        if (!permittedHosts.length || !permittedHosts.includes(host)) {
            throw new Error(`${purpose} requires an explicit allowed staging database host.`);
        }
    }

    return { environment: resolvedEnvironment, localTarget };
}

module.exports = { assertSafeDatabaseTarget, isProductionLike, normalizedHost };
