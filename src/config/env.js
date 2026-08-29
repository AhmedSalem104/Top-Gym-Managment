'use strict';

function getEnv(name, fallback = '') {
    const value = process.env[name];
    return value === undefined || value === '' ? fallback : value;
}

function getNumberEnv(name, fallback) {
    const value = Number(getEnv(name, fallback));
    return Number.isFinite(value) ? value : fallback;
}

function getBoundedNumberEnv(name, fallback, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, getNumberEnv(name, fallback)));
}

function getBooleanEnv(name, fallback = false) {
    const value = getEnv(name, fallback ? 'true' : 'false').trim().toLowerCase();
    return ['true', '1', 'yes', 'on'].includes(value);
}

const config = Object.freeze({
    nodeEnv: getEnv('NODE_ENV', 'development'),
    port: getNumberEnv('PORT', 3000),
    appTimeZone: getEnv('APP_TIMEZONE', 'Africa/Cairo'),
    authSessionDays: getNumberEnv('AUTH_SESSION_DAYS', 7),
    authOwnerEmail: getEnv('AUTH_OWNER_EMAIL'),
    authOwnerName: getEnv('AUTH_OWNER_NAME', 'مالك النظام'),
    authOwnerPassword: getEnv('AUTH_OWNER_PASSWORD'),
    authPlatformAdminEmail: getEnv('AUTH_PLATFORM_ADMIN_EMAIL'),
    authPlatformAdminName: getEnv('AUTH_PLATFORM_ADMIN_NAME', 'Platform Admin'),
    authPlatformAdminPassword: getEnv('AUTH_PLATFORM_ADMIN_PASSWORD'),
    platformAdminHost: getEnv('PLATFORM_ADMIN_HOST', 'admin.voltyks.app'),
    defaultTenantSlug: getEnv('DEFAULT_TENANT_SLUG', 'top-gym'),
    authSessionTouchIntervalMs: getNumberEnv('AUTH_SESSION_TOUCH_INTERVAL_MS', 60_000),
    saasSyncIntervalMs: getNumberEnv('SAAS_SYNC_INTERVAL_MS', 30_000),
    performanceMetricsEnabled: getBooleanEnv('PERFORMANCE_METRICS', false)
        && getEnv('NODE_ENV', 'development').trim().toLowerCase() !== 'production',
    cronSecret: getEnv('CRON_SECRET'),
    publicAppUrl: getEnv('PUBLIC_APP_URL'),
    membershipCodeSecret: getEnv('MEMBERSHIP_CODE_SECRET'),
    attendanceAutoCheckoutMinutes: getNumberEnv('ATTENDANCE_AUTO_CHECKOUT_MINUTES', 0),
    mssqlConnectionString: getEnv('MSSQL_CONNECTION_STRING') || getEnv('DATABASE_URL'),
    // Keep database timeouts finite and positive. Operators can tune these
    // values for a measured environment, but an invalid value must not turn
    // into an unbounded wait inside a serverless function.
    mssqlConnectionTimeout: getBoundedNumberEnv('MSSQL_CONNECTION_TIMEOUT', 30_000, 1_000, 300_000),
    mssqlRequestTimeout: getBoundedNumberEnv('MSSQL_REQUEST_TIMEOUT', 120_000, 1_000, 600_000),
    // These limits apply per Node/Vercel instance. Keep the defaults stable;
    // operators can tune them for a known database capacity after measurement.
    mssqlPoolMax: getBoundedNumberEnv('MSSQL_POOL_MAX', 10, 1, 100),
    mssqlPoolMin: getBoundedNumberEnv('MSSQL_POOL_MIN', 0, 0, 100),
    mssqlPoolIdleTimeoutMs: getBoundedNumberEnv('MSSQL_POOL_IDLE_TIMEOUT_MS', 30_000, 1_000, 600_000)
});

function isProduction() {
    return config.nodeEnv === 'production';
}

module.exports = { config, getBooleanEnv, getEnv, getNumberEnv, getBoundedNumberEnv, isProduction };
