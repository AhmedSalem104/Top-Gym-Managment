'use strict';

const sql = require('mssql');
const { config: appConfig } = require('../config/env');
const { getTenantContext } = require('../tenancy/tenant-context');
const { recordDatabaseQuery } = require('../middleware/performance-metrics');
const { performance } = require('node:perf_hooks');

let poolPromise;
let tenantAwarePool;
let tenantAwarePoolTarget;

const TENANT_ID_PARAMETER = '__topgym_tenant_id';
const TENANT_MODE_PARAMETER = '__topgym_tenant_mode';

function sqlTenantContext() {
    const context = getTenantContext();
    const mode = context?.mode || 'deny';
    const configuredTenantId = Number(context?.tenantId);
    // Platform scope is deliberately tenant-less. Any operation that needs a
    // tenant must pass its target tenant explicitly; never silently fall back
    // to Top Gym while running as PlatformAdmin.
    const tenantId = Number.isInteger(configuredTenantId) && configuredTenantId > 0
        ? configuredTenantId
        : null;
    return {
        tenantId,
        mode,
        skipSessionContext: Boolean(context?.skipSessionContext),
        readOnlyBaseline: Boolean(context?.readOnlyBaseline)
    };
}

function stripSqlCommentsAndLiterals(command) {
    const source = String(command || '');
    let output = '';
    let index = 0;
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;
    while (index < source.length) {
        const current = source[index];
        const next = source[index + 1];
        if (inLineComment) {
            if (current === '\\n' || current === '\\r') inLineComment = false;
            output += ' ';
            index += 1;
            continue;
        }
        if (inBlockComment) {
            if (current === '*' && next === '/') {
                output += '  ';
                index += 2;
                inBlockComment = false;
            } else {
                output += ' ';
                index += 1;
            }
            continue;
        }
        if (inString) {
            if (current === "'" && next === "'") {
                output += '  ';
                index += 2;
            } else if (current === "'") {
                output += ' ';
                index += 1;
                inString = false;
            } else {
                output += ' ';
                index += 1;
            }
            continue;
        }
        if (current === '-' && next === '-') {
            output += '  ';
            index += 2;
            inLineComment = true;
            continue;
        }
        if (current === '/' && next === '*') {
            output += '  ';
            index += 2;
            inBlockComment = true;
            continue;
        }
        if (current === "'") {
            output += ' ';
            index += 1;
            inString = true;
            continue;
        }
        output += current;
        index += 1;
    }
    return output;
}

function hasPersistentSqlMutation(command) {
    const normalized = stripSqlCommentsAndLiterals(command);
    if (/\b(?:EXEC(?:UTE)?|BULK\s+INSERT|DBCC|GRANT|DENY|REVOKE)\b/i.test(normalized)) return true;
    if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE\s+TABLE)\s+(?![#@])/i.test(normalized)) return true;
    if (/\b(?:CREATE|ALTER|DROP)\s+TABLE\s+(?![#@])/i.test(normalized)) return true;
    if (/\b(?:CREATE\s+(?:UNIQUE\s+)?INDEX|DROP\s+INDEX)\b[\s\S]*?\bON\s+(?![#@])/i.test(normalized)) return true;
    if (/\bCREATE\s+(?:VIEW|PROCEDURE|FUNCTION|TRIGGER|SCHEMA|DATABASE)\b/i.test(normalized)) return true;
    if (/\bSELECT\b[\s\S]*?\bINTO\s+(?![#@])/i.test(normalized)) return true;
    if (/\bSET\s+IDENTITY_INSERT\b/i.test(normalized)) return true;
    return false;
}

function assertReadOnlySql(command, context) {
    if (!context.readOnlyBaseline || !hasPersistentSqlMutation(command)) return;
    const error = new Error('Baseline requests may execute read-only SQL only.');
    error.statusCode = 405;
    error.expose = true;
    error.code = 'BASELINE_SQL_WRITE_BLOCKED';
    throw error;
}

function decorateRequest(request) {
    let proxy;
    const handler = {
        get(target, property) {
            const value = target[property];
            if (property === 'query' || property === 'batch') {
                return (command, ...rest) => {
                    const context = sqlTenantContext();
                    const startedAt = process.hrtime.bigint();
                    const startedAtMonotonic = performance.now();
                    assertReadOnlySql(command, context);
                    let result;
                    if (context.skipSessionContext) {
                        result = value.call(target, command, ...rest);
                    } else {
                        target.input(TENANT_ID_PARAMETER, sql.Int, context.tenantId);
                        target.input(TENANT_MODE_PARAMETER, sql.VarChar(20), context.mode);
                        const guardedCommand = `EXEC sys.sp_set_session_context @key=N'tenant_id', @value=@${TENANT_ID_PARAMETER}; EXEC sys.sp_set_session_context @key=N'tenant_mode', @value=@${TENANT_MODE_PARAMETER}; ${String(command || '')}`;
                        result = value.call(target, guardedCommand, ...rest);
                    }
                    return Promise.resolve(result).then((response) => {
                        const endedAtMonotonic = performance.now();
                        recordDatabaseQuery(Number(process.hrtime.bigint() - startedAt) / 1_000_000, property, startedAtMonotonic, endedAtMonotonic);
                        return response;
                    }, (error) => {
                        const endedAtMonotonic = performance.now();
                        recordDatabaseQuery(Number(process.hrtime.bigint() - startedAt) / 1_000_000, property, startedAtMonotonic, endedAtMonotonic);
                        throw error;
                    });
                };
            }
            if (typeof value !== 'function') return value;
            return (...args) => {
                const result = value.apply(target, args);
                // mssql's input/output helpers return the original request so
                // fluent chains keep working through the proxy.
                return result === target ? proxy : result;
            };
        }
    };
    proxy = new Proxy(request, handler);
    return proxy;
}

function decorateTransaction(transaction) {
    let proxy;
    const handler = {
        get(target, property) {
            const value = target[property];
            if (property === 'request') return (...args) => decorateRequest(value.apply(target, args));
            if (typeof value !== 'function') return value;
            return (...args) => {
                const result = value.apply(target, args);
                return result === target ? proxy : result;
            };
        }
    };
    proxy = new Proxy(transaction, handler);
    return proxy;
}

function decoratePool(pool) {
    let proxy;
    const handler = {
        get(target, property) {
            const value = target[property];
            if (property === 'request') return (...args) => decorateRequest(value.apply(target, args));
            if (property === 'transaction') return (...args) => decorateTransaction(value.apply(target, args));
            if (property === 'query' || property === 'batch') {
                return (command, ...rest) => decorateRequest(target.request())[property](command, ...rest);
            }
            if (typeof value !== 'function') return value;
            return (...args) => {
                const result = value.apply(target, args);
                return result === target ? proxy : result;
            };
        }
    };
    proxy = new Proxy(pool, handler);
    return proxy;
}

function parseBoolean(value, fallback) {
    if (value === undefined || value === '') return fallback;
    return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
}

function parseConnectionString(connectionString) {
    if (!connectionString) throw new Error('MSSQL_CONNECTION_STRING is not configured.');
    const values = {};
    for (const segment of connectionString.split(';')) {
        const separator = segment.indexOf('=');
        if (separator < 0) continue;
        const key = segment.slice(0, separator).trim().toLowerCase().replace(/\s+/g, '');
        values[key] = segment.slice(separator + 1).trim();
    }

    const serverValue = values.server || values.datasource || values.data_source || values.address;
    const databaseValue = values.database || values.initialcatalog;
    const userValue = values.userid || values.user || values.uid;
    const passwordValue = values.password || values.pwd;
    if (!serverValue || !databaseValue || !userValue || passwordValue === undefined) {
        throw new Error('The SQL Server connection string is incomplete.');
    }

    const serverParts = serverValue.split(',');
    const connectionConfig = {
        server: serverParts[0],
        database: databaseValue,
        user: userValue,
        password: passwordValue,
        connectionTimeout: appConfig.mssqlConnectionTimeout,
        requestTimeout: appConfig.mssqlRequestTimeout,
        options: {
            encrypt: parseBoolean(values.encrypt, true),
            trustServerCertificate: parseBoolean(values.trustservercertificate, false)
        },
        pool: {
            max: appConfig.mssqlPoolMax,
            min: Math.min(appConfig.mssqlPoolMin, appConfig.mssqlPoolMax),
            idleTimeoutMillis: appConfig.mssqlPoolIdleTimeoutMs
        }
    };
    if (serverParts[1]) connectionConfig.port = Number(serverParts[1]);
    return connectionConfig;
}

async function getPool() {
    if (!poolPromise) {
        const connectionConfig = parseConnectionString(appConfig.mssqlConnectionString);
        poolPromise = sql.connect(connectionConfig).catch((error) => {
            poolPromise = undefined;
            tenantAwarePool = undefined;
            tenantAwarePoolTarget = undefined;
            throw error;
        });
    }
    const pool = await poolPromise;
    if (!tenantAwarePool || tenantAwarePoolTarget !== pool) {
        tenantAwarePool = decoratePool(pool);
        tenantAwarePoolTarget = pool;
    }
    return tenantAwarePool;
}

async function closePool() {
    if (!poolPromise) return;
    const pool = await poolPromise;
    poolPromise = undefined;
    tenantAwarePool = undefined;
    tenantAwarePoolTarget = undefined;
    await pool.close();
}

module.exports = { assertReadOnlySql, closePool, getPool, hasPersistentSqlMutation, parseConnectionString, sql };
