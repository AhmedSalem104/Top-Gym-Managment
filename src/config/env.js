'use strict';

function getEnv(name, fallback = '') {
    const value = process.env[name];
    return value === undefined || value === '' ? fallback : value;
}

function getNumberEnv(name, fallback) {
    const value = Number(getEnv(name, fallback));
    return Number.isFinite(value) ? value : fallback;
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
    defaultTenantSlug: getEnv('DEFAULT_TENANT_SLUG', 'top-gym'),
    cronSecret: getEnv('CRON_SECRET'),
    publicAppUrl: getEnv('PUBLIC_APP_URL'),
    membershipCodeSecret: getEnv('MEMBERSHIP_CODE_SECRET'),
    attendanceAutoCheckoutMinutes: getNumberEnv('ATTENDANCE_AUTO_CHECKOUT_MINUTES', 0),
    mssqlConnectionString: getEnv('MSSQL_CONNECTION_STRING') || getEnv('DATABASE_URL'),
    mssqlConnectionTimeout: getNumberEnv('MSSQL_CONNECTION_TIMEOUT', 30_000),
    mssqlRequestTimeout: getNumberEnv('MSSQL_REQUEST_TIMEOUT', 120_000)
});

function isProduction() {
    return config.nodeEnv === 'production';
}

module.exports = { config, getEnv, getNumberEnv, isProduction };
