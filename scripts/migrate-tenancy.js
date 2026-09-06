'use strict';

require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { closePool, getPool, initDatabase } = require('../src/database');
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
const PHASE0_SECURITY_MIGRATION_PATH = path.join(__dirname, '..', 'database', 'migrations', '013-phase0-security-preconditions.sql');
const BASE_COMMERCIAL_MIGRATION_PATH = commercialSchema.MIGRATION_PATH;

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
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => tenantService.ensureTenantColumnsAndRls(bootstrapTenant.id));
    await runTenantContext({ mode: 'tenant', tenantId: bootstrapTenant.id }, () => libraryService.ensureLibraryData());
    await runTenantContext({ mode: 'platform', tenantId: bootstrapTenant.id }, () => saasService.ensureBootstrapSubscription(bootstrapTenant.id));
    console.log(JSON.stringify({ tenant: bootstrapTenant, tenantTables: postModifiersResult.tables.length, saasTables: saasService.SAAS_TABLES.length, policy: 'enabled' }));
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
