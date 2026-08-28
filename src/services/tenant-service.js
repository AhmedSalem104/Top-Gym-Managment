'use strict';

const { getPool, sql } = require('../database');
const { currentTenantId } = require('../tenancy/tenant-context');
const { config } = require('../config/env');

const BOOTSTRAP_TENANT_SLUG = 'top-gym';
const BOOTSTRAP_TENANT_NAME = 'Top Gym';
const TENANT_POLICY_NAME = 'gym_tenant_security_policy';
const TENANT_PREDICATE_NAME = 'gym_tenant_access_predicate';

// Every operational table that stores gym data is listed explicitly. Auth
// credentials/sessions and tenant membership metadata stay global so a user
// can be resolved before the tenant context is applied.
const TENANT_TABLES = Object.freeze([
    'athlete_checkins',
    'body_measurements',
    'coaching_activity_events',
    'diet_meal_items',
    'diet_meals',
    'diet_plans',
    'gym_ai_generation_log',
    'gym_alert_communications',
    'gym_attendance',
    'gym_backup_archives',
    'gym_backup_operations',
    'gym_branding_assets',
    'gym_branding_audit',
    'gym_branding_config',
    'gym_day_pass_sales',
    'gym_day_pass_types',
    'gym_exercises',
    'gym_expenses',
    'gym_foods',
    'gym_member_feedback',
    'gym_membership_code_audit',
    'gym_muscles',
    'gym_payment_transactions',
    'gym_payments',
    'gym_permission_audit',
    'gym_store_categories',
    'gym_store_suppliers',
    'gym_store_products',
    'gym_store_product_variants',
    'gym_store_customers',
    'gym_store_purchases',
    'gym_store_purchase_items',
    'gym_store_purchase_payments',
    'gym_store_inventory_balances',
    'gym_store_inventory_batches',
    'gym_store_stock_movements',
    'gym_store_sales',
    'gym_store_sale_items',
    'gym_store_sale_payments',
    'gym_store_returns',
    'gym_store_return_items',
    'gym_store_audit_log',
    'gym_subscription_refunds',
    'gym_user_permissions',
    'meal_logs',
    'members',
    'membership_events',
    'membership_freezes',
    'membership_pricing',
    'membership_type_prices',
    'membership_types',
    'memberships',
    'saas_payment_proofs',
    'saas_platform_notes',
    'saas_subscription_requests',
    'saas_subscription_changes',
    'saas_tenant_subscriptions',
    'saas_tenant_overrides',
    'workout_exercises',
    'workout_programs',
    'workout_routines',
    'workout_sessions',
    'workout_set_logs'
]);

const TENANT_SCHEMA_SQL = `
IF OBJECT_ID(N'dbo.gym_tenants', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_tenants (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_tenants PRIMARY KEY,
        name NVARCHAR(160) NOT NULL,
        slug VARCHAR(80) NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_tenants_status DEFAULT ('active'),
        contact_phone NVARCHAR(40) NULL,
        contact_email NVARCHAR(254) NULL,
        suspension_reason NVARCHAR(1000) NULL,
        suspended_at DATETIME2(0) NULL,
        suspend_until DATETIME2(0) NULL,
        suspension_billing_only BIT NOT NULL CONSTRAINT DF_gym_tenants_suspension_billing_only DEFAULT (1),
        archived_at DATETIME2(0) NULL,
        archived_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_tenants_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_tenants_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_tenants_slug UNIQUE (slug),
        CONSTRAINT CK_gym_tenants_status CHECK (status IN ('trial', 'active', 'suspended', 'expired', 'archived'))
    );
END;

IF OBJECT_ID(N'dbo.gym_user_tenants', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_user_tenants (
        user_id INT NOT NULL,
        tenant_id INT NOT NULL,
        role VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_user_tenants_status DEFAULT ('active'),
        is_primary BIT NOT NULL CONSTRAINT DF_gym_user_tenants_primary DEFAULT (0),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_user_tenants_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_user_tenants_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_gym_user_tenants PRIMARY KEY (user_id, tenant_id),
        CONSTRAINT FK_gym_user_tenants_user FOREIGN KEY (user_id) REFERENCES dbo.gym_users(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_user_tenants_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_user_tenants_role CHECK (role IN ('Owner', 'Assistant')),
        CONSTRAINT CK_gym_user_tenants_status CHECK (status IN ('active', 'disabled'))
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_user_tenants_tenant_status'
      AND object_id = OBJECT_ID(N'dbo.gym_user_tenants')
)
    CREATE INDEX IX_gym_user_tenants_tenant_status ON dbo.gym_user_tenants(tenant_id, status, user_id);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_user_tenants_user_primary'
      AND object_id = OBJECT_ID(N'dbo.gym_user_tenants')
)
    CREATE INDEX IX_gym_user_tenants_user_primary ON dbo.gym_user_tenants(user_id, is_primary DESC, status, tenant_id);
`;

let tenantSchemaPromise;

function tenantError(message, statusCode = 500, code = 'TENANT_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function normalizeTenantSlug(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
}

function tenantRecord(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        name: String(row.name || ''),
        slug: String(row.slug || ''),
        status: String(row.status || 'active'),
        role: row.role ? String(row.role) : null,
        isPrimary: Boolean(row.is_primary)
    };
}

async function ensureTenantTables() {
    if (!tenantSchemaPromise) {
        tenantSchemaPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(TENANT_SCHEMA_SQL);
            await pool.request().batch(`
                IF EXISTS (
                    SELECT 1 FROM sys.check_constraints
                    WHERE name=N'CK_gym_tenants_status' AND parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
                )
                    ALTER TABLE dbo.gym_tenants DROP CONSTRAINT CK_gym_tenants_status;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.check_constraints
                    WHERE name=N'CK_gym_tenants_status' AND parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
                )
                    ALTER TABLE dbo.gym_tenants ADD CONSTRAINT CK_gym_tenants_status CHECK (status IN ('trial', 'active', 'suspended', 'expired', 'archived'));

                IF COL_LENGTH(N'dbo.gym_tenants', N'contact_phone') IS NULL
                    ALTER TABLE dbo.gym_tenants ADD contact_phone NVARCHAR(40) NULL;
                IF COL_LENGTH(N'dbo.gym_tenants', N'contact_email') IS NULL
                    ALTER TABLE dbo.gym_tenants ADD contact_email NVARCHAR(254) NULL;
                IF COL_LENGTH(N'dbo.gym_tenants', N'suspension_reason') IS NULL
                    ALTER TABLE dbo.gym_tenants ADD suspension_reason NVARCHAR(1000) NULL;
                IF COL_LENGTH(N'dbo.gym_tenants', N'suspended_at') IS NULL
                    ALTER TABLE dbo.gym_tenants ADD suspended_at DATETIME2(0) NULL;
                IF COL_LENGTH(N'dbo.gym_tenants', N'suspend_until') IS NULL
                    ALTER TABLE dbo.gym_tenants ADD suspend_until DATETIME2(0) NULL;
                IF COL_LENGTH(N'dbo.gym_tenants', N'suspension_billing_only') IS NULL
                    ALTER TABLE dbo.gym_tenants ADD suspension_billing_only BIT NOT NULL CONSTRAINT DF_gym_tenants_suspension_billing_only DEFAULT (1);
                IF COL_LENGTH(N'dbo.gym_tenants', N'archived_at') IS NULL
                    ALTER TABLE dbo.gym_tenants ADD archived_at DATETIME2(0) NULL;
                IF COL_LENGTH(N'dbo.gym_tenants', N'archived_by_user_id') IS NULL
                    ALTER TABLE dbo.gym_tenants ADD archived_by_user_id INT NULL;
            `);
        })().catch((error) => {
            tenantSchemaPromise = null;
            throw error;
        });
    }
    return tenantSchemaPromise;
}

async function ensureBootstrapTenant() {
    await ensureTenantTables();
    const pool = await getPool();
    const tenantResult = await pool.request()
        .input('slug', sql.VarChar(80), BOOTSTRAP_TENANT_SLUG)
        .input('name', sql.NVarChar(160), BOOTSTRAP_TENANT_NAME)
        .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.gym_tenants WHERE slug=@slug)
                INSERT INTO dbo.gym_tenants(name, slug, status) VALUES (@name, @slug, 'active');
            SELECT TOP (1) id, name, slug, status FROM dbo.gym_tenants WHERE slug=@slug;
        `);
    const tenant = tenantRecord(tenantResult.recordset[0]);
    if (!tenant) throw tenantError('Unable to create the Top Gym tenant.', 500, 'BOOTSTRAP_TENANT_FAILED');

    await pool.request()
        .input('tenantId', sql.Int, tenant.id)
        .query(`
            INSERT INTO dbo.gym_user_tenants(user_id, tenant_id, role, is_primary)
            SELECT u.id, @tenantId, u.role, CASE WHEN u.role='Owner' THEN 1 ELSE 0 END
            FROM dbo.gym_users u
            WHERE u.role IN ('Owner', 'Assistant')
              AND NOT EXISTS (
                SELECT 1 FROM dbo.gym_user_tenants existing
                WHERE existing.user_id=u.id
                );

            -- Older boots attached every Owner/Assistant to Top Gym. Keep
            -- that legacy membership available for migration, but never let
            -- it win tenant resolution when the account already belongs to a
            -- different gym.
            UPDATE bootstrapMembership
            SET is_primary=0, status='disabled', updated_at=SYSUTCDATETIME()
            FROM dbo.gym_user_tenants bootstrapMembership
            WHERE bootstrapMembership.tenant_id=@tenantId
              AND EXISTS (
                SELECT 1 FROM dbo.gym_user_tenants otherMembership
                WHERE otherMembership.user_id=bootstrapMembership.user_id
                  AND otherMembership.tenant_id<>@tenantId
                  AND otherMembership.status IN ('active', 'disabled')
                );
            `);
    return tenant;
}

async function assignUserToTenant(userId, tenantId = currentTenantId({ required: true }), role = null) {
    await ensureTenantTables();
    const normalizedUserId = Number(userId);
    const normalizedTenantId = Number(tenantId);
    if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0 || !Number.isInteger(normalizedTenantId) || normalizedTenantId <= 0) {
        throw tenantError('Invalid user or tenant membership.', 400, 'INVALID_TENANT_MEMBERSHIP');
    }
    const pool = await getPool();
    await pool.request()
        .input('userId', sql.Int, normalizedUserId)
        .input('tenantId', sql.Int, normalizedTenantId)
        .input('role', sql.VarChar(20), role || null)
        .query(`
            INSERT INTO dbo.gym_user_tenants(user_id, tenant_id, role, is_primary)
            SELECT @userId, @tenantId, COALESCE(@role, u.role),
                   CASE WHEN NOT EXISTS (SELECT 1 FROM dbo.gym_user_tenants WHERE user_id=@userId AND is_primary=1) THEN 1 ELSE 0 END
            FROM dbo.gym_users u
            WHERE u.id=@userId
              AND NOT EXISTS (SELECT 1 FROM dbo.gym_user_tenants WHERE user_id=@userId AND tenant_id=@tenantId);
        `);
    return true;
}

async function resolveTenantForUser(userId, requestedSlug = '', { readOnly = false } = {}) {
    if (!readOnly) await ensureTenantTables();
    const normalizedSlug = normalizeTenantSlug(requestedSlug);
    const pool = await getPool();
    const result = await pool.request()
        .input('userId', sql.Int, Number(userId))
        .input('slug', sql.VarChar(80), normalizedSlug)
        .input('bootstrapSlug', sql.VarChar(80), BOOTSTRAP_TENANT_SLUG)
        .query(`
            SELECT TOP (1) t.id, t.name, t.slug, t.status, ut.role, ut.is_primary
            FROM dbo.gym_user_tenants ut
            INNER JOIN dbo.gym_tenants t ON t.id=ut.tenant_id
            WHERE ut.user_id=@userId
              AND ut.status='active'
              AND t.status IN ('trial', 'active', 'suspended', 'expired', 'archived')
              AND (@slug='' OR t.slug=@slug)
              AND (t.slug<>@bootstrapSlug OR NOT EXISTS (
                  SELECT 1 FROM dbo.gym_user_tenants otherMembership
                  WHERE otherMembership.user_id=@userId
                    AND otherMembership.tenant_id<>t.id
                  ))
            ORDER BY ut.is_primary DESC, CASE WHEN t.slug=@bootstrapSlug THEN 1 ELSE 0 END, t.id ASC;
        `);
    return tenantRecord(result.recordset[0]);
}

async function resolvePublicTenant(requestedSlug = '', { readOnly = false } = {}) {
    if (!readOnly) await ensureTenantTables();
    const normalizedSlug = normalizeTenantSlug(requestedSlug) || normalizeTenantSlug(config.defaultTenantSlug) || BOOTSTRAP_TENANT_SLUG;
    const pool = await getPool();
    const result = await pool.request()
        .input('slug', sql.VarChar(80), normalizedSlug)
        .query("SELECT TOP (1) id, name, slug, status FROM dbo.gym_tenants WHERE slug=@slug AND status IN ('trial', 'active');");
    const tenant = tenantRecord(result.recordset[0]);
    // This keeps the app shell and isolated test boots safe when the base
    // schema exists but the tenancy bootstrap has not run yet.
    return tenant || (normalizedSlug === BOOTSTRAP_TENANT_SLUG && !readOnly ? ensureBootstrapTenant() : null);
}

async function existingTenantTables(pool) {
    const names = TENANT_TABLES.map((table) => `N'${table}'`).join(', ');
    const result = await pool.request().query(`
        SELECT name FROM sys.tables
        WHERE schema_id=SCHEMA_ID(N'dbo') AND name IN (${names});
    `);
    const existing = new Set(result.recordset.map((row) => String(row.name)));
    return TENANT_TABLES.filter((table) => existing.has(table));
}

function tenantColumnMigrationSql(table) {
    const quotedTable = `dbo.[${table}]`;
    const defaultName = `DF_${table}_tenant_id`;
    const foreignKeyName = `FK_${table}_tenant`;
    const indexName = `IX_${table}_tenant_id`;
    return `
        IF COL_LENGTH(N'dbo.${table}', N'tenant_id') IS NULL
            EXEC(N'ALTER TABLE ${quotedTable} ADD tenant_id INT NULL;');

        EXEC sys.sp_executesql
            N'UPDATE ${quotedTable} SET tenant_id=@TenantId WHERE tenant_id IS NULL;',
            N'@TenantId INT', @TenantId=@tenantId;

        IF NOT EXISTS (
            SELECT 1
            FROM sys.default_constraints dc
            INNER JOIN sys.columns c ON c.default_object_id=dc.object_id
            WHERE dc.parent_object_id=OBJECT_ID(N'dbo.${table}')
              AND c.name=N'tenant_id'
        )
            EXEC(N'ALTER TABLE ${quotedTable} ADD CONSTRAINT [${defaultName}] DEFAULT (TRY_CONVERT(INT, SESSION_CONTEXT(N''tenant_id''))) FOR tenant_id;');

        IF EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id=OBJECT_ID(N'dbo.${table}')
              AND name=N'tenant_id'
              AND (is_nullable=1 OR system_type_id<>56)
        )
            EXEC(N'ALTER TABLE ${quotedTable} ALTER COLUMN tenant_id INT NOT NULL;');

        IF NOT EXISTS (
            SELECT 1 FROM sys.foreign_keys
            WHERE name=N'${foreignKeyName}' AND parent_object_id=OBJECT_ID(N'dbo.${table}')
        )
            EXEC(N'ALTER TABLE ${quotedTable} ADD CONSTRAINT [${foreignKeyName}] FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id);');

        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name=N'${indexName}' AND object_id=OBJECT_ID(N'dbo.${table}')
        )
            EXEC(N'CREATE INDEX [${indexName}] ON ${quotedTable}(tenant_id);');
    `;
}

async function ensureBrandingKeyCompatibility(pool) {
    // Branding used to be a single global row. Keep the stable row id for
    // compatibility, but widen its key so every tenant can own id=1 safely.
    await pool.request().batch(`
        IF OBJECT_ID(N'dbo.gym_branding_config', N'U') IS NOT NULL
           AND COL_LENGTH(N'dbo.gym_branding_config', N'tenant_id') IS NOT NULL
           AND EXISTS (SELECT 1 FROM sys.key_constraints WHERE name=N'PK_gym_branding_config' AND parent_object_id=OBJECT_ID(N'dbo.gym_branding_config'))
            ALTER TABLE dbo.gym_branding_config DROP CONSTRAINT PK_gym_branding_config;

        IF OBJECT_ID(N'dbo.gym_branding_config', N'U') IS NOT NULL
           AND COL_LENGTH(N'dbo.gym_branding_config', N'tenant_id') IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE type='PK' AND parent_object_id=OBJECT_ID(N'dbo.gym_branding_config'))
            ALTER TABLE dbo.gym_branding_config ADD CONSTRAINT PK_gym_branding_config PRIMARY KEY (tenant_id, id);

        IF OBJECT_ID(N'dbo.gym_branding_assets', N'U') IS NOT NULL
           AND EXISTS (SELECT 1 FROM sys.key_constraints WHERE name=N'UQ_gym_branding_assets_scope_key' AND parent_object_id=OBJECT_ID(N'dbo.gym_branding_assets'))
            ALTER TABLE dbo.gym_branding_assets DROP CONSTRAINT UQ_gym_branding_assets_scope_key;
    `);
}

async function dropTenantSecurityPolicy(pool) {
    await pool.request().batch(`
        IF EXISTS (
            SELECT 1 FROM sys.security_policies
            WHERE name=N'${TENANT_POLICY_NAME}' AND schema_id=SCHEMA_ID(N'dbo')
        )
            DROP SECURITY POLICY dbo.[${TENANT_POLICY_NAME}];
    `);
}

async function recreateTenantSecurityPolicy(pool, tables) {
    await pool.request().batch(`
        EXEC(N'
            CREATE OR ALTER FUNCTION dbo.[${TENANT_PREDICATE_NAME}](@tenant_id INT)
            RETURNS TABLE WITH SCHEMABINDING
            AS
            RETURN SELECT 1 AS allowed
            WHERE CONVERT(NVARCHAR(20), SESSION_CONTEXT(N''tenant_mode'')) = N''platform''
               OR @tenant_id = TRY_CONVERT(INT, SESSION_CONTEXT(N''tenant_id''));
        ');
    `);

    const clauses = tables.flatMap((table) => [
        `ADD FILTER PREDICATE dbo.[${TENANT_PREDICATE_NAME}](tenant_id) ON dbo.[${table}]`,
        `ADD BLOCK PREDICATE dbo.[${TENANT_PREDICATE_NAME}](tenant_id) ON dbo.[${table}] AFTER INSERT`,
        `ADD BLOCK PREDICATE dbo.[${TENANT_PREDICATE_NAME}](tenant_id) ON dbo.[${table}] AFTER UPDATE`
    ]);
    if (!clauses.length) return;
    const policySql = `EXEC(N'CREATE SECURITY POLICY dbo.[${TENANT_POLICY_NAME}] ${clauses.join(', ')} WITH (STATE = ON);');`;
    await pool.request().batch(policySql);
}

async function ensureTenantColumnsAndRls(tenantId) {
    await ensureTenantTables();
    const normalizedTenantId = Number(tenantId);
    if (!Number.isInteger(normalizedTenantId) || normalizedTenantId <= 0) throw tenantError('Bootstrap tenant id is invalid.', 500, 'INVALID_BOOTSTRAP_TENANT');
    const pool = await getPool();
    const tables = await existingTenantTables(pool);
    await dropTenantSecurityPolicy(pool);

    for (const table of tables) {
        await pool.request()
            .input('tenantId', sql.Int, normalizedTenantId)
            .batch(tenantColumnMigrationSql(table));
    }
    await ensureBrandingKeyCompatibility(pool);

    if (tables.includes('gym_branding_config')) {
        await pool.request().batch(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_branding_config_tenant' AND object_id=OBJECT_ID(N'dbo.gym_branding_config'))
                CREATE UNIQUE INDEX IX_gym_branding_config_tenant ON dbo.gym_branding_config(tenant_id);
        `);
    }

    // The branding assets uniqueness rule must include tenant_id after the
    // migration, otherwise two gyms could never use the same asset key.
    if (tables.includes('gym_branding_assets')) {
        await pool.request().batch(`
            IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_gym_branding_assets_tenant_scope_key' AND object_id=OBJECT_ID(N'dbo.gym_branding_assets'))
                CREATE UNIQUE INDEX UQ_gym_branding_assets_tenant_scope_key ON dbo.gym_branding_assets(tenant_id, scope, asset_key);
        `);
    }
    await recreateTenantSecurityPolicy(pool, tables);
    return { tenantId: normalizedTenantId, tables };
}

module.exports = {
    BOOTSTRAP_TENANT_NAME,
    BOOTSTRAP_TENANT_SLUG,
    TENANT_SCHEMA_SQL,
    TENANT_TABLES,
    assignUserToTenant,
    ensureBootstrapTenant,
    ensureTenantColumnsAndRls,
    ensureTenantTables,
    resolvePublicTenant,
    resolveTenantForUser
};
