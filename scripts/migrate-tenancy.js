'use strict';

require('dotenv').config();

const { closePool, initDatabase } = require('../src/database');
const { parseConnectionString } = require('../src/database/pool');
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
const { safeErrorCode } = require('../src/utils/error-response');

const ALLOWED_MIGRATION_ENVIRONMENTS = new Set(['local', 'development', 'test', 'staging']);
const PRODUCTION_CONFIRMATION = 'I_UNDERSTAND_PRODUCTION_MIGRATION';
const NON_PRODUCTION_EXTERNAL_CONFIRMATION = 'I_UNDERSTAND_NON_PRODUCTION_TARGET';

function isLocalDatabaseServer(server) {
    const value = String(server || '').trim().toLowerCase();
    return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function assertMigrationTarget({
    connectionString = process.env.MSSQL_CONNECTION_STRING || process.env.DATABASE_URL,
    environment = process.env.MIGRATION_ENV,
    productionConfirmation = process.env.MIGRATION_PRODUCTION_CONFIRM,
    nonProductionExternalConfirmation = process.env.MIGRATION_NON_PRODUCTION_CONFIRM
} = {}) {
    const target = parseConnectionString(connectionString);
    const localTarget = isLocalDatabaseServer(target.server);
    const configuredEnvironment = String(environment || '').trim().toLowerCase();
    const resolvedEnvironment = configuredEnvironment || (localTarget ? 'local' : '');
    if (resolvedEnvironment !== 'production' && !ALLOWED_MIGRATION_ENVIRONMENTS.has(resolvedEnvironment)) {
        throw new Error('MIGRATION_ENV must explicitly identify a non-production target; external targets cannot default to local.');
    }
    if (resolvedEnvironment === 'production' && String(productionConfirmation || '').trim() !== PRODUCTION_CONFIRMATION) {
        throw new Error('Production migration requires an explicit MIGRATION_PRODUCTION_CONFIRM value.');
    }
    if (!localTarget && resolvedEnvironment !== 'staging' && resolvedEnvironment !== 'production'
        && String(nonProductionExternalConfirmation || '').trim() !== NON_PRODUCTION_EXTERNAL_CONFIRMATION) {
        throw new Error('External non-production migration targets require an explicit MIGRATION_NON_PRODUCTION_CONFIRM value.');
    }
    return { environment: resolvedEnvironment, localTarget };
}

async function migrate() {
    assertMigrationTarget();
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => initDatabase());
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureTenantTables());
    const bootstrapTenant = await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureBootstrapTenant());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureSaasTables());
    await runTenantContext({ mode: 'tenant', tenantId: bootstrapTenant.id }, async () => {
        await authService.ensureAuthReady();
        await libraryService.ensureLibraryTables();
        await coachingService.ensureCoachingTables({ seedLibrary: false });
        await dayPassService.ensureDayPassTables();
        await membershipCodeService.ensureMembershipCodeStorage();
        await memberFeedbackService.ensureMemberFeedbackTable();
        await storeService.ensureStoreTables();
        await intelligenceService.ensureIntelligenceTables();
        await brandingService.ensureBrandingTables();
    });
    const result = await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    await runTenantContext({ mode: 'tenant', tenantId: bootstrapTenant.id }, () => libraryService.ensureLibraryData());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureBootstrapSubscription(bootstrapTenant.id));
    console.log(JSON.stringify({ tenant: bootstrapTenant, tenantTables: result.tables.length, saasTables: saasService.SAAS_TABLES.length, policy: 'enabled' }));
}

if (require.main === module) {
    migrate()
        .catch((error) => {
            console.error('TENANCY_MIGRATION_FAILED', safeErrorCode(error, 'migration_failed'));
            process.exitCode = 1;
        })
        .finally(() => closePool().catch(() => {}));
}

module.exports = { assertMigrationTarget, migrate };
