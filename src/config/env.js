'use strict';

function getEnv(name, fallback = '') {
    const value = process.env[name];
    return value === undefined || value === '' ? fallback : value;
}

// New storage integrations use the generic OBJECT_STORAGE_* contract, while
// the original backup-only names remain supported for existing deployments.
// Empty primary values intentionally fall back to the legacy setting too.
function getAliasedEnv(name, legacyName, fallback = '') {
    return getEnv(name, getEnv(legacyName, fallback));
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

const nodeEnv = getEnv('NODE_ENV', 'development');
const defaultTrustProxyHops = nodeEnv.trim().toLowerCase() === 'production' ? 1 : 0;

const config = Object.freeze({
    nodeEnv,
    port: getNumberEnv('PORT', 3000),
    appTimeZone: getEnv('APP_TIMEZONE', 'Africa/Cairo'),
    authSessionDays: getNumberEnv('AUTH_SESSION_DAYS', 7),
    authOwnerEmail: getEnv('AUTH_OWNER_EMAIL'),
    authOwnerName: getEnv('AUTH_OWNER_NAME', 'مالك النظام'),
    authOwnerPassword: getEnv('AUTH_OWNER_PASSWORD'),
    authPlatformAdminEmail: getEnv('AUTH_PLATFORM_ADMIN_EMAIL'),
    authPlatformAdminName: getEnv('AUTH_PLATFORM_ADMIN_NAME', 'Platform Admin'),
    authPlatformAdminPassword: getEnv('AUTH_PLATFORM_ADMIN_PASSWORD'),
    // The platform admin has a canonical path (`/platform-admin`). A host
    // alias is optional and must be configured explicitly only for a domain
    // controlled and verified by the deployment owner.
    platformAdminHost: getEnv('PLATFORM_ADMIN_HOST'),
    defaultTenantSlug: getEnv('DEFAULT_TENANT_SLUG', 'top-gym'),
    authSessionTouchIntervalMs: getNumberEnv('AUTH_SESSION_TOUCH_INTERVAL_MS', 60_000),
    saasSyncIntervalMs: getNumberEnv('SAAS_SYNC_INTERVAL_MS', 30_000),
    // Production metrics are opt-in twice so a development `.env` copied to
    // a deployment cannot enable request logging by accident. The middleware
    // emits only bounded route/timing metadata; it never logs request bodies,
    // SQL, cookies or credentials.
    performanceMetricsEnabled: getBooleanEnv('PERFORMANCE_METRICS', false)
        && (getEnv('NODE_ENV', 'development').trim().toLowerCase() !== 'production'
            || getBooleanEnv('PERFORMANCE_METRICS_PRODUCTION', false)),
    cronSecret: getEnv('CRON_SECRET'),
    // The generic object-storage contract is the single runtime configuration
    // for backups, branding and private uploads. BACKUP_STORAGE_* remains a
    // backwards-compatible alias so existing deployments do not need an
    // emergency environment-variable migration.
    objectStorageDriver: getAliasedEnv('OBJECT_STORAGE_DRIVER', 'BACKUP_STORAGE_DRIVER', 'none'),
    objectStoragePath: getAliasedEnv('OBJECT_STORAGE_PATH', 'BACKUP_STORAGE_PATH'),
    objectStorageEndpoint: getAliasedEnv('OBJECT_STORAGE_ENDPOINT', 'BACKUP_STORAGE_ENDPOINT'),
    objectStorageBucket: getAliasedEnv('OBJECT_STORAGE_BUCKET', 'BACKUP_STORAGE_BUCKET'),
    objectStorageRegion: getAliasedEnv('OBJECT_STORAGE_REGION', 'BACKUP_STORAGE_REGION', 'auto'),
    objectStorageAccessKeyId: getAliasedEnv('OBJECT_STORAGE_ACCESS_KEY_ID', 'BACKUP_STORAGE_ACCESS_KEY_ID'),
    objectStorageSecretAccessKey: getAliasedEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY', 'BACKUP_STORAGE_SECRET_ACCESS_KEY'),
    objectStorageSessionToken: getAliasedEnv('OBJECT_STORAGE_SESSION_TOKEN', 'BACKUP_STORAGE_SESSION_TOKEN'),
    objectStorageForcePathStyle: getBooleanEnv('OBJECT_STORAGE_FORCE_PATH_STYLE', getBooleanEnv('BACKUP_STORAGE_FORCE_PATH_STYLE', true)),
    objectStorageRequestTimeoutMs: getBoundedNumberEnv('OBJECT_STORAGE_REQUEST_TIMEOUT_MS', getBoundedNumberEnv('BACKUP_STORAGE_REQUEST_TIMEOUT_MS', 30_000, 1_000, 120_000), 1_000, 120_000),
    backupStorageDriver: getAliasedEnv('OBJECT_STORAGE_DRIVER', 'BACKUP_STORAGE_DRIVER', 'none'),
    backupStoragePath: getAliasedEnv('OBJECT_STORAGE_PATH', 'BACKUP_STORAGE_PATH'),
    backupStorageEndpoint: getAliasedEnv('OBJECT_STORAGE_ENDPOINT', 'BACKUP_STORAGE_ENDPOINT'),
    backupStorageBucket: getAliasedEnv('OBJECT_STORAGE_BUCKET', 'BACKUP_STORAGE_BUCKET'),
    backupStorageRegion: getAliasedEnv('OBJECT_STORAGE_REGION', 'BACKUP_STORAGE_REGION', 'auto'),
    backupStorageAccessKeyId: getAliasedEnv('OBJECT_STORAGE_ACCESS_KEY_ID', 'BACKUP_STORAGE_ACCESS_KEY_ID'),
    backupStorageSecretAccessKey: getAliasedEnv('OBJECT_STORAGE_SECRET_ACCESS_KEY', 'BACKUP_STORAGE_SECRET_ACCESS_KEY'),
    backupStorageSessionToken: getAliasedEnv('OBJECT_STORAGE_SESSION_TOKEN', 'BACKUP_STORAGE_SESSION_TOKEN'),
    backupStorageForcePathStyle: getBooleanEnv('OBJECT_STORAGE_FORCE_PATH_STYLE', getBooleanEnv('BACKUP_STORAGE_FORCE_PATH_STYLE', true)),
    backupStorageRequestTimeoutMs: getBoundedNumberEnv('OBJECT_STORAGE_REQUEST_TIMEOUT_MS', getBoundedNumberEnv('BACKUP_STORAGE_REQUEST_TIMEOUT_MS', 30_000, 1_000, 120_000), 1_000, 120_000),
    backupSchedulerConcurrency: getBoundedNumberEnv('BACKUP_SCHEDULER_CONCURRENCY', 2, 1, 8),
    backupSchedulerRetryCount: getBoundedNumberEnv('BACKUP_SCHEDULER_RETRY_COUNT', 1, 0, 3),
    backupEnablePlatformWeekly: getBooleanEnv('BACKUP_ENABLE_PLATFORM_WEEKLY', true),
    backupEnablePlatformMonthly: getBooleanEnv('BACKUP_ENABLE_PLATFORM_MONTHLY', true),
    publicAppUrl: getEnv('PUBLIC_APP_URL'),
    membershipCodeSecret: getEnv('MEMBERSHIP_CODE_SECRET'),
    attendanceAutoCheckoutMinutes: getNumberEnv('ATTENDANCE_AUTO_CHECKOUT_MINUTES', 0),
    // Member-portal occupancy is intentionally configurable because a quiet
    // or busy gym threshold depends on the facility size. The service still
    // normalizes the ordering before it classifies a count.
    memberPortalOccupancyModerateAt: getBoundedNumberEnv('MEMBER_PORTAL_OCCUPANCY_MODERATE_AT', 6, 1, 10_000),
    memberPortalOccupancyBusyAt: getBoundedNumberEnv('MEMBER_PORTAL_OCCUPANCY_BUSY_AT', 16, 2, 10_000),
    memberPortalOccupancyVeryBusyAt: getBoundedNumberEnv('MEMBER_PORTAL_OCCUPANCY_VERY_BUSY_AT', 31, 3, 10_000),
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
    mssqlPoolIdleTimeoutMs: getBoundedNumberEnv('MSSQL_POOL_IDLE_TIMEOUT_MS', 30_000, 1_000, 600_000),
    // Vercel adds one trusted proxy hop in front of the Express function.
    // Local development defaults to zero so forwarded headers remain untrusted.
    trustProxyHops: getBoundedNumberEnv('TRUST_PROXY_HOPS', defaultTrustProxyHops, 0, 3)
});

function isProduction() {
    return config.nodeEnv === 'production';
}

module.exports = { config, getBooleanEnv, getEnv, getNumberEnv, getBoundedNumberEnv, isProduction };
