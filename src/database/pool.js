'use strict';

const sql = require('mssql');
const { config: appConfig } = require('../config/env');
const { getTenantContext } = require('../tenancy/tenant-context');

let poolPromise;
let tenantAwarePool;
let tenantAwarePoolTarget;

const TENANT_ID_PARAMETER = '__topgym_tenant_id';
const TENANT_MODE_PARAMETER = '__topgym_tenant_mode';

function sqlTenantContext() {
    const context = getTenantContext();
    const mode = context?.mode || 'deny';
    const configuredTenantId = Number(context?.tenantId);
    // Platform/startup work is intentionally associated with the bootstrap
    // tenant when it inserts legacy/default rows. RLS still bypasses filters
    // in platform mode, while tenant requests always use their own id.
    const tenantId = Number.isInteger(configuredTenantId) && configuredTenantId > 0
        ? configuredTenantId
        : mode === 'platform' ? 1 : null;
    return { tenantId, mode, skipSessionContext: Boolean(context?.skipSessionContext) };
}

function decorateRequest(request) {
    let proxy;
    const handler = {
        get(target, property) {
            const value = target[property];
            if (property === 'query' || property === 'batch') {
                return (command, ...rest) => {
                    const context = sqlTenantContext();
                    if (context.skipSessionContext) return value.call(target, command, ...rest);
                    target.input(TENANT_ID_PARAMETER, sql.Int, context.tenantId);
                    target.input(TENANT_MODE_PARAMETER, sql.VarChar(20), context.mode);
                    const guardedCommand = `EXEC sys.sp_set_session_context @key=N'tenant_id', @value=@${TENANT_ID_PARAMETER}; EXEC sys.sp_set_session_context @key=N'tenant_mode', @value=@${TENANT_MODE_PARAMETER}; ${String(command || '')}`;
                    return value.call(target, guardedCommand, ...rest);
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
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
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

module.exports = { closePool, getPool, parseConnectionString, sql };
