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
    authOwnerName: getEnv('AUTH_OWNER_NAME', 'TOP GYM Owner'),
    authOwnerPassword: getEnv('AUTH_OWNER_PASSWORD'),
    cronSecret: getEnv('CRON_SECRET'),
    attendanceAutoCheckoutMinutes: getNumberEnv('ATTENDANCE_AUTO_CHECKOUT_MINUTES', 0),
    mssqlConnectionString: getEnv('MSSQL_CONNECTION_STRING') || getEnv('DATABASE_URL'),
    mssqlConnectionTimeout: getNumberEnv('MSSQL_CONNECTION_TIMEOUT', 30_000),
    mssqlRequestTimeout: getNumberEnv('MSSQL_REQUEST_TIMEOUT', 120_000)
});

function isProduction() {
    return config.nodeEnv === 'production';
}

module.exports = { config, getEnv, getNumberEnv, isProduction };
