'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { closePool, getPool, initDatabase, sql } = require('../src/database');
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
const paymentLedgerSchema = require('../src/services/payment-ledger-schema');
const saasService = require('../src/services/saas-service');
const commercialSchema = require('../src/services/commercial-schema');
const { createBackupRecoveryService } = require('../src/services/backup-recovery-service');
const { safeErrorCode } = require('../src/utils/error-response');

const ALLOWED_MIGRATION_ENVIRONMENTS = new Set(['local', 'development', 'test', 'staging']);
const PRODUCTION_CONFIRMATION = 'I_UNDERSTAND_PRODUCTION_MIGRATION';
const NON_PRODUCTION_EXTERNAL_CONFIRMATION = 'I_UNDERSTAND_NON_PRODUCTION_TARGET';
const PHASE1_TENANT_TYPE_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '014-tenant-type-foundation.sql');
const PHASE2_PLAN_COMPATIBILITY_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '015-plan-tenant-type-compatibility.sql');
const PHASE3_TRAINER_REGISTRATION_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '016-independent-trainer-registration.sql');
const PHASE4_TRAINER_CLIENT_PROFILE_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '017-trainer-client-profile.sql');
const PHASE5_TRAINER_COMMERCIAL_OPERATIONS_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '018-trainer-commercial-operations.sql');
const PHASE6_TRAINER_PORTAL_FOUNDATION_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '019-trainer-portal-foundation.sql');
const PHASE7_BRANCH_FOUNDATION_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '020-branch-foundation.sql');
const PHASE8_MEMBERSHIP_BRANCH_ATTENDANCE_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '021-membership-branch-attendance.sql');
const PHASE9_FINANCIAL_BRANCH_ATTRIBUTION_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '022-financial-branch-attribution.sql');
const PHASE10_STOCK_LOCATIONS_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '023-stock-locations-and-transfers.sql');
const PHASE11_BAR_POS_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '024-bar-pos-recipes.sql');
const PHASE12_BAR_MODIFIERS_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '025-bar-modifiers.sql');
const PHASE13_BRANCH_PLAN_LIMITS_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '026-branch-plan-limits.sql');
const PHASE14_TRAINER_STUDIO_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '027-trainer-studio-goals-templates.sql');
const PHASE15_TRAINER_ACTION_CENTER_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '028-trainer-action-center.sql');
const PHASE16_BRANCH_SECTIONS_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '029-branch-sections.sql');
const PHASE17_PLAN_ENTITLEMENTS_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '030-plan-entitlements.sql');
const PHASE0_SECURITY_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '013-phase0-security-preconditions.sql');
const BASE_COMMERCIAL_MIGRATION_PATH = commercialSchema.MIGRATION_PATH;
const MIGRATION_HISTORY_TABLE = '__TenantEFMigrationsHistory';
const MIGRATION_HISTORY_PRODUCT_VERSION = 'logic-fit-runner-1';

const SINGLE_MIGRATIONS = Object.freeze({
    '029': Object.freeze({
        id: '029-branch-sections.sql',
        version: '029',
        path: PHASE16_BRANCH_SECTIONS_MIGRATION_PATH,
        excluded: ['030-plan-entitlements.sql']
    })
});

function parseMigrationOnly(argv = process.argv.slice(2)) {
    const values = [];
    for (let index = 0; index < argv.length; index += 1) {
        const token = String(argv[index] || '').trim();
        if (token === '--only') {
            const value = String(argv[index + 1] || '').trim();
            if (!value) throw new Error('The --only option requires a migration version.');
            values.push(value);
            index += 1;
        } else if (token.startsWith('--only=')) {
            values.push(token.slice('--only='.length).trim());
        } else if (token) {
            throw new Error(`Unknown migration runner argument: ${token}`);
        }
    }
    if (!values.length) return null;
    if (values.length !== 1) throw new Error('Only one migration may be selected at a time.');
    const normalized = values[0]
        .replace(/\.sql$/i, '')
        .replace(/-.*$/, '')
        .replace(/^0+(?=\d)/, '')
        .padStart(3, '0');
    if (!SINGLE_MIGRATIONS[normalized]) {
        throw new Error(`Unsupported single migration selection: ${values[0]}.`);
    }
    return SINGLE_MIGRATIONS[normalized];
}

async function ensureMigrationHistory(executor) {
    await executor.request().batch(`
        IF OBJECT_ID(N'dbo.${MIGRATION_HISTORY_TABLE}', N'U') IS NULL
        BEGIN
            CREATE TABLE dbo.${MIGRATION_HISTORY_TABLE} (
                MigrationId NVARCHAR(150) NOT NULL CONSTRAINT PK___TenantEFMigrationsHistory PRIMARY KEY,
                ProductVersion NVARCHAR(64) NOT NULL
            );
        END;
    `);
}

async function hasMigrationHistory(executor, migrationId) {
    const result = await executor.request()
        .input('migrationId', sql.NVarChar(150), migrationId)
        .query(`
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM dbo.${MIGRATION_HISTORY_TABLE} WHERE MigrationId=@migrationId
            ) THEN 1 ELSE 0 END AS applied;
        `);
    return Number(result.recordset[0]?.applied) === 1;
}

async function recordMigrationHistory(executor, migrationId) {
    await executor.request()
        .input('migrationId', sql.NVarChar(150), migrationId)
        .input('productVersion', sql.NVarChar(64), MIGRATION_HISTORY_PRODUCT_VERSION)
        .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.${MIGRATION_HISTORY_TABLE} WHERE MigrationId=@migrationId)
                INSERT INTO dbo.${MIGRATION_HISTORY_TABLE}(MigrationId,ProductVersion)
                VALUES (@migrationId,@productVersion);
        `);
}

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
    const onlyMigration = parseMigrationOnly();
    if (onlyMigration) return migrateOnly(onlyMigration);
    assertMigrationTarget();
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => initDatabase());
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureTenantTables());
    const phase1TenantTypeMigration = fs.readFileSync(PHASE1_TENANT_TYPE_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: 1 }, async () => {
        const pool = await getPool();
        await pool.request().batch(phase1TenantTypeMigration);
    });
    const bootstrapTenant = await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureBootstrapTenant());
    const backupRecoveryService = createBackupRecoveryService();
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => backupRecoveryService.ensureRecoveryTables());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureSaasTables());
    // Migration 016 extends the registration-request table created by the
    // canonical commercial migration 011. Keep that dependency explicit in
    // the migration runner instead of relying on a runtime request side
    // effect, so a fresh local/staging database can apply the chain safely.
    const baseCommercialMigration = fs.readFileSync(BASE_COMMERCIAL_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(baseCommercialMigration);
    });
    const phase2PlanCompatibilityMigration = fs.readFileSync(PHASE2_PLAN_COMPATIBILITY_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(phase2PlanCompatibilityMigration);
    });
    const phase3TrainerRegistrationMigration = fs.readFileSync(PHASE3_TRAINER_REGISTRATION_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(phase3TrainerRegistrationMigration);
    });
    const phase4TrainerClientProfileMigration = fs.readFileSync(PHASE4_TRAINER_CLIENT_PROFILE_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(phase4TrainerClientProfileMigration);
    });
    const phase5TrainerCommercialOperationsMigration = fs.readFileSync(PHASE5_TRAINER_COMMERCIAL_OPERATIONS_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(phase5TrainerCommercialOperationsMigration);
    });
    const phase6TrainerPortalFoundationMigration = fs.readFileSync(PHASE6_TRAINER_PORTAL_FOUNDATION_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(phase6TrainerPortalFoundationMigration);
    });
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => commercialSchema.ensureCommercialTables());
    const branchFoundationMigration = fs.readFileSync(PHASE7_BRANCH_FOUNDATION_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(branchFoundationMigration);
    });
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => paymentLedgerSchema.ensurePaymentLedgerIntegrity());
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
    const phase0SecurityMigration = fs.readFileSync(PHASE0_SECURITY_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(phase0SecurityMigration);
    });
    const result = await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    const membershipBranchAttendanceMigration = fs.readFileSync(PHASE8_MEMBERSHIP_BRANCH_ATTENDANCE_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(membershipBranchAttendanceMigration);
    });
    // 021 creates a new tenant-owned table after the first RLS pass and adds
    // branch attributes to legacy tables. Rebuild the policy so the new
    // table is covered before any tenant request can observe it.
    const postBranchResult = await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    const financialBranchAttributionMigration = fs.readFileSync(PHASE9_FINANCIAL_BRANCH_ATTRIBUTION_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(financialBranchAttributionMigration);
    });
    const postFinanceResult = await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    const stockLocationsMigration = fs.readFileSync(PHASE10_STOCK_LOCATIONS_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(stockLocationsMigration);
    });
    const postCommerceFoundationResult = await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    const barPosMigration = fs.readFileSync(PHASE11_BAR_POS_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(barPosMigration);
    });
    const postBarResult = await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    const barModifiersMigration = fs.readFileSync(PHASE12_BAR_MODIFIERS_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(barModifiersMigration);
    });
    const postModifiersResult = await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    const branchPlanLimitsMigration = fs.readFileSync(PHASE13_BRANCH_PLAN_LIMITS_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(branchPlanLimitsMigration);
    });
    const trainerStudioMigration = fs.readFileSync(PHASE14_TRAINER_STUDIO_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(trainerStudioMigration);
    });
    const trainerActionCenterMigration = fs.readFileSync(PHASE15_TRAINER_ACTION_CENTER_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(trainerActionCenterMigration);
    });
    const branchSectionsMigration = fs.readFileSync(PHASE16_BRANCH_SECTIONS_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(branchSectionsMigration);
    });
    const planEntitlementsMigration = fs.readFileSync(PHASE17_PLAN_ENTITLEMENTS_MIGRATION_PATH, 'utf8');
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await pool.request().batch(planEntitlementsMigration);
    });
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    await runTenantContext({ mode: 'tenant', tenantId: bootstrapTenant.id }, () => libraryService.ensureLibraryData());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureBootstrapSubscription(bootstrapTenant.id));
    console.log(JSON.stringify({ tenant: bootstrapTenant, tenantTables: postModifiersResult.tables.length, saasTables: saasService.SAAS_TABLES.length, policy: 'enabled' }));
}

/**
 * Run one reviewed migration as a complete unit. This is intentionally kept
 * separate from the historical full-chain bootstrap: selecting 029 must not
 * read or execute 030 (or any other migration file).
 */
async function migrateOnly(migration) {
    assertMigrationTarget();
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => initDatabase());
    await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureTenantTables());
    const bootstrapTenant = await runTenantContext({ mode: 'platform', tenantId: 1 }, () => tenantService.ensureBootstrapTenant());
    return runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, async () => {
        const pool = await getPool();
        await ensureMigrationHistory(pool);
        if (await hasMigrationHistory(pool, migration.id)) {
            const snapshot = await tenantService.getTenantSecuritySnapshot(pool);
            return {
                only: migration.version,
                migration: migration.id,
                executedMigrations: [],
                skippedMigrations: [migration.id],
                excludedMigrations: migration.excluded,
                registryRlsRebuilt: false,
                tenantReady: tenantService.tenantSecuritySnapshotIsReady(snapshot)
            };
        }

        // 029 is a schema batch containing dynamic SQL/DDL. Use the native
        // transaction from the official pool so the request is not decorated
        // with tenant parameters by the normal application query guard.
        const transaction = pool.rawTransaction();
        let committed = false;
        try {
            await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
            await transaction.request().batch(`
                EXEC sys.sp_set_session_context @key=N'tenant_id', @value=${bootstrapTenant.id};
                EXEC sys.sp_set_session_context @key=N'tenant_mode', @value=N'platform';
            `);
            const migrationSql = fs.readFileSync(migration.path, 'utf8');
            await transaction.request().batch(migrationSql);

            // 029 creates tenant-owned tables. Rebuild the official dynamic
            // registry and RLS policy in the same transaction before history
            // is recorded; 030 is deliberately not called here.
            await tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id, { executor: transaction });
            await recordMigrationHistory(transaction, migration.id);
            await transaction.commit();
            committed = true;
        } catch (error) {
            if (!committed) await transaction.rollback().catch(() => {});
            throw error;
        }

        const snapshot = await tenantService.getTenantSecuritySnapshot(pool);
        return {
            only: migration.version,
            migration: migration.id,
            executedMigrations: [migration.id],
            skippedMigrations: [],
            excludedMigrations: migration.excluded,
            registryRlsRebuilt: true,
            tenantReady: tenantService.tenantSecuritySnapshotIsReady(snapshot)
        };
    });
}

if (require.main === module) {
    migrate()
        .catch((error) => {
            console.error('TENANCY_MIGRATION_FAILED', safeErrorCode(error, 'migration_failed'));
            process.exitCode = 1;
        })
        .finally(() => closePool().catch(() => {}));
}

module.exports = {
    assertMigrationTarget,
    migrate,
    migrateOnly,
    parseMigrationOnly,
    SINGLE_MIGRATIONS
};
