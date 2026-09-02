'use strict';

// Read-only Production backup readiness audit. This script never creates a
// backup, writes recovery metadata, runs migrations, or changes schema.
const dotenv = require('dotenv');
let currentStage = 'validate-input';

async function main() {
    const setStage = (stage) => { currentStage = stage; };
    const envFile = process.env.DR_PRODUCTION_ENV_FILE;
    if (process.env.DR_PRODUCTION_READ_ONLY_CONFIRM !== 'YES') {
        throw new Error('Explicit read-only confirmation is required.');
    }
    if (envFile) dotenv.config({ path: envFile, override: true, quiet: true });
    if (process.env.VERCEL_ENV !== 'production' && !envFile) {
        throw new Error('The direct process must be Vercel production environment or use an explicit temporary environment file.');
    }
    setStage('load-config');
    const { config } = require('../src/config/env');
    const { parseConnectionString } = require('../src/database/pool');
    const { closePool, getPool } = require('../src/database');
    const { runTenantContext } = require('../src/tenancy/tenant-context');
    const { getPlatformBackupCoverageStatus } = require('../src/services/backup-recovery-service');
    const parsed = parseConnectionString(config.mssqlConnectionString);
    setStage('connect');
    const pool = await getPool();
    setStage('database-metadata');
    const metadata = (await pool.request().query(`
        SELECT DB_NAME() AS database_name,
               CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(80)) AS sql_version,
               CAST(SERVERPROPERTY('Edition') AS nvarchar(120)) AS edition,
               state_desc
        FROM sys.databases
        WHERE name=DB_NAME();
    `)).recordset[0] || {};
    setStage('schema-metadata');
    const schema = (await pool.request().query(`
        SELECT
          CASE WHEN COL_LENGTH(N'dbo.gym_tenants', N'tenant_type') IS NOT NULL THEN 1 ELSE 0 END AS tenant_type_column,
          CASE WHEN OBJECT_ID(N'dbo.saas_plan_tenant_types', N'U') IS NOT NULL THEN 1 ELSE 0 END AS plan_type_table,
          CASE WHEN OBJECT_ID(N'dbo.trainer_client_profiles', N'U') IS NOT NULL THEN 1 ELSE 0 END AS trainer_client_profiles,
          CASE WHEN OBJECT_ID(N'dbo.trainer_packages', N'U') IS NOT NULL THEN 1 ELSE 0 END AS trainer_packages,
          CASE WHEN OBJECT_ID(N'dbo.trainer_package_purchases', N'U') IS NOT NULL THEN 1 ELSE 0 END AS trainer_package_purchases,
          CASE WHEN OBJECT_ID(N'dbo.trainer_package_usage', N'U') IS NOT NULL THEN 1 ELSE 0 END AS trainer_package_usage,
          CASE WHEN OBJECT_ID(N'dbo.coaching_sessions', N'U') IS NOT NULL THEN 1 ELSE 0 END AS coaching_sessions;
    `)).recordset[0] || {};
    setStage('platform-coverage');
    const coverage = await runTenantContext(
        { mode: 'platform', readOnlyBaseline: true },
        () => getPlatformBackupCoverageStatus({ readOnly: true })
    );
    console.log(JSON.stringify({
        database: metadata.database_name || parsed.database,
        server: parsed.server,
        sqlVersion: metadata.sql_version || null,
        edition: metadata.edition || null,
        state: metadata.state_desc || null,
        schema: {
            tenantTypeColumn: Boolean(schema.tenant_type_column),
            saasPlanTenantTypes: Boolean(schema.plan_type_table),
            trainerClientProfiles: Boolean(schema.trainer_client_profiles),
            trainerPackages: Boolean(schema.trainer_packages),
            trainerPackagePurchases: Boolean(schema.trainer_package_purchases),
            trainerPackageUsage: Boolean(schema.trainer_package_usage),
            coachingSessions: Boolean(schema.coaching_sessions)
        },
        coverage: {
            status: coverage.status,
            existingTableCount: coverage.existingTableCount,
            tenantTableCount: coverage.tenantTableCount,
            sourceSchemaGeneration: coverage.sourceSchemaGeneration,
            sourceSchemaCapabilities: coverage.sourceSchemaCapabilities,
            classificationCounts: coverage.classificationCounts,
            missingGlobalTables: coverage.missingGlobalTables,
            missingTenantTables: coverage.missingTenantTables,
            unregisteredTenantTables: coverage.unregisteredTenantTables,
            unclassifiedTables: coverage.unclassifiedTables,
            physicalTableCount: coverage.existingTableCount,
            includedTableCount: Object.values(coverage.definitionsByScope || {}).reduce((sum, definitions) => sum + definitions.length, 0),
            explicitExcludedTableCount: (coverage.excludedTables || []).length + (coverage.legacyExcludedTables || []).length,
            unknownTables: coverage.unclassifiedTables.length,
            unexplainedTables: coverage.unregisteredTenantTables.length
        },
        operation: 'READ_ONLY'
    }));
    await closePool();
}

main().catch((error) => {
    console.error(JSON.stringify({ status: 'PRODUCTION_READ_ONLY_AUDIT_FAILED', stage: currentStage, code: error.code || 'UNKNOWN' }));
    process.exitCode = 1;
});
