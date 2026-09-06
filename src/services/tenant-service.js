'use strict';

const { getPool, sql } = require('../database');
const { currentTenantId } = require('../tenancy/tenant-context');
const { TENANT_TYPES, resolveTenantType } = require('../tenancy/tenant-types');

const BOOTSTRAP_TENANT_SLUG = 'top-gym';
const BOOTSTRAP_TENANT_NAME = 'Top Gym';
const TENANT_POLICY_NAME = 'gym_tenant_security_policy';
const TENANT_PREDICATE_NAME = 'gym_tenant_access_predicate';
const TENANT_SECURITY_READINESS_TTL_MS = 30_000;

// Tenant membership is control-plane metadata. It deliberately contains a
// tenant_id so it can answer membership questions before a tenant context is
// available, but it is not tenant-owned operational data and therefore is
// excluded from the operational RLS coverage contract below.
const GLOBAL_TENANT_COLUMN_TABLES = Object.freeze(['dbo.gym_user_tenants']);
// This audit table is dual-scope: tenant events carry tenant_id, while
// platform-level events intentionally keep it NULL. It is still RLS
// protected, but NULL is valid for this one table's platform records.
const NULLABLE_TENANT_TABLES = Object.freeze(['dbo.saas_audit_log']);

// Every operational table that stores gym data is listed explicitly. Auth
// credentials/sessions and tenant membership metadata stay global so a user
// can be resolved before the tenant context is applied.
const TENANT_TABLES = Object.freeze([
    'gym_branches',
    'gym_branch_user_access',
    'gym_branch_commerce_config',
    'gym_membership_branch_access',
    'gym_stock_locations',
    'gym_store_location_inventory_balances',
    'gym_stock_transfers',
    'gym_stock_transfer_items',
    'gym_bar_recipes',
    'gym_bar_recipe_items',
    'gym_pos_shifts',
    'gym_commerce_waste',
    'gym_bar_modifiers',
    'athlete_checkins',
    'body_measurements',
    'coaching_activity_events',
    'coaching_sessions',
    'diet_meal_items',
    'diet_meals',
    'diet_plans',
    'gym_ai_generation_log',
    'gym_alert_communications',
    'gym_attendance',
    'gym_backup_archives',
    'gym_backup_operations',
    'gym_backup_records',
    'gym_backup_audit_log',
    'gym_branding_assets',
    'gym_branding_audit',
    'gym_branding_config',
    'gym_day_pass_sales',
    'gym_day_pass_types',
    'gym_exercises',
    'gym_expenses',
    'gym_foods',
    'gym_member_feedback',
    'gym_member_portal_sessions',
    'gym_member_portal_visit_daily',
    'gym_member_portal_visit_visitors',
    'gym_member_subscription_payment_proofs',
    'gym_member_subscription_requests',
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
    'trainer_packages',
    'trainer_package_purchases',
    'trainer_package_usage',
    'gym_trainer_goals',
    'gym_trainer_templates',
    'gym_trainer_tasks',
    'saas_payment_proofs',
    'saas_audit_log',
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
        tenant_type VARCHAR(32) NOT NULL CONSTRAINT DF_gym_tenants_tenant_type DEFAULT ('gym'),
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
        CONSTRAINT CK_gym_tenants_status CHECK (status IN ('trial', 'active', 'suspended', 'expired', 'archived')),
        CONSTRAINT CK_gym_tenants_tenant_type CHECK (tenant_type IN ('gym', 'independent_trainer'))
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
let tenantSecurityReadinessPromise;
let tenantSecurityReadyUntil = 0;

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
        tenantType: resolveTenantType(row.tenant_type),
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
                    WHERE name=N'CK_gym_tenants_status'
                      AND parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
                      AND (
                          definition IS NULL
                          OR definition NOT LIKE N'%trial%'
                          OR definition NOT LIKE N'%active%'
                          OR definition NOT LIKE N'%suspended%'
                          OR definition NOT LIKE N'%expired%'
                          OR definition NOT LIKE N'%archived%'
                      )
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
    const tenantTypeColumn = await pool.request().query(`
        SELECT CASE WHEN EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id=OBJECT_ID(N'dbo.gym_tenants')
              AND name=N'tenant_type'
              AND system_type_id=167
              AND max_length>=32
              AND is_nullable=0
        )
        AND EXISTS (
            SELECT 1 FROM sys.default_constraints dc
            INNER JOIN sys.columns c ON c.default_object_id=dc.object_id
            WHERE dc.parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
              AND c.name=N'tenant_type'
              AND LOWER(dc.definition) LIKE N'%gym%'
        )
        AND EXISTS (
            SELECT 1 FROM sys.check_constraints cc
            WHERE cc.parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
              AND cc.name=N'CK_gym_tenants_tenant_type'
              AND LOWER(cc.definition) LIKE N'%gym%'
              AND LOWER(cc.definition) LIKE N'%independent_trainer%'
        ) THEN 1 ELSE 0 END AS ready;
    `);
    if (Number(tenantTypeColumn.recordset[0]?.ready) !== 1) {
        throw tenantError('Tenant type schema is not ready.', 503, 'TENANT_TYPE_SCHEMA_NOT_READY');
    }
    const tenantResult = await pool.request()
        .input('slug', sql.VarChar(80), BOOTSTRAP_TENANT_SLUG)
        .input('name', sql.NVarChar(160), BOOTSTRAP_TENANT_NAME)
        .input('tenantType', sql.VarChar(32), TENANT_TYPES.GYM)
        .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.gym_tenants WHERE slug=@slug)
                INSERT INTO dbo.gym_tenants(name, slug, tenant_type, status) VALUES (@name, @slug, @tenantType, 'active');
            SELECT TOP (1) id, name, slug, tenant_type, status FROM dbo.gym_tenants WHERE slug=@slug;
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
              AND (bootstrapMembership.is_primary<>0 OR bootstrapMembership.status<>'disabled')
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
            SELECT TOP (1) t.id, t.name, t.slug, t.tenant_type, t.status, ut.role, ut.is_primary
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
    // Public tenant resolution must be explicit. A missing slug is not a
    // request for Top Gym (or for any other tenant); callers must provide a
    // tenant identifier through the hostname/header/query contract.
    const normalizedSlug = normalizeTenantSlug(requestedSlug);
    if (!normalizedSlug) return null;
    const pool = await getPool();
    const result = await pool.request()
        .input('slug', sql.VarChar(80), normalizedSlug)
        .query("SELECT TOP (1) id, name, slug, tenant_type, status FROM dbo.gym_tenants WHERE slug=@slug AND status IN ('trial', 'active');");
    const tenant = tenantRecord(result.recordset[0]);
    return tenant;
}

async function getTenantType(tenantId) {
    const normalizedTenantId = Number(tenantId);
    if (!Number.isInteger(normalizedTenantId) || normalizedTenantId <= 0) {
        throw tenantError('Invalid tenant id.', 400, 'INVALID_TENANT_ID');
    }
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, normalizedTenantId)
        .query('SELECT TOP (1) tenant_type FROM dbo.gym_tenants WHERE id=@tenantId;');
    if (!result.recordset[0]) throw tenantError('Tenant was not found.', 404, 'TENANT_NOT_FOUND');
    return resolveTenantType(result.recordset[0].tenant_type);
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

function tableKey(schemaName, tableName) {
    return `${String(schemaName || '').trim().toLowerCase()}.${String(tableName || '').trim().toLowerCase()}`;
}

function hasTenantPredicate(row, type, operation = null) {
    if (!row || String(row.predicate_type_desc || '').toUpperCase() !== type) return false;
    if (operation) {
        const operationDescription = String(row.operation_desc || '').toUpperCase();
        const operationValue = String(row.operation || '').toUpperCase();
        const numericOperation = Number(row.operation);
        const normalizedOperation = operationDescription
            || (operationValue === 'AFTER INSERT' || operationValue === 'AFTER UPDATE' ? operationValue : '')
            || (numericOperation === 1 ? 'AFTER INSERT' : numericOperation === 2 ? 'AFTER UPDATE' : '');
        if (normalizedOperation !== operation) return false;
    }
    const definition = String(row.predicate_definition || '').toLowerCase();
    return definition.includes(TENANT_PREDICATE_NAME.toLowerCase()) && definition.includes('tenant_id');
}

/**
 * Discover the tenant-owned surface from SQL Server metadata. The registry
 * remains an application contract for expected tables, but it is no longer
 * the source of truth for deciding which tables need protection.
 */
async function getTenantSecuritySnapshot(pool = null) {
    const database = pool || await getPool();
    const registryNames = TENANT_TABLES.map((name) => `N'${name.replace(/'/g, "''")}'`).join(', ');
    const result = await database.request().query(`
        SELECT s.name AS schema_name, t.name, c.is_nullable, ty.name AS data_type
        FROM sys.tables AS t
        INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id
        INNER JOIN sys.columns AS c ON c.object_id=t.object_id AND c.name=N'tenant_id'
        INNER JOIN sys.types AS ty ON ty.user_type_id=c.user_type_id
        WHERE t.is_ms_shipped=0;

        SELECT s.name AS schema_name, t.name
        FROM sys.tables AS t
        INNER JOIN sys.schemas AS s ON s.schema_id=t.schema_id
        WHERE t.is_ms_shipped=0
          AND s.name=N'dbo'
          AND t.name IN (${registryNames});

        SELECT p.name AS policy_name, p.is_enabled, ps.name AS policy_schema,
               ts.name AS schema_name, t.name AS table_name,
               sp.predicate_type_desc, sp.operation, sp.operation_desc,
               sp.predicate_definition
        FROM sys.security_policies AS p
        INNER JOIN sys.schemas AS ps ON ps.schema_id=p.schema_id
        INNER JOIN sys.security_predicates AS sp ON sp.object_id=p.object_id
        INNER JOIN sys.tables AS t ON t.object_id=sp.target_object_id
        INNER JOIN sys.schemas AS ts ON ts.schema_id=t.schema_id
        WHERE p.name=N'${TENANT_POLICY_NAME}';

        SELECT o.name, s.name AS schema_name, o.type, o.is_ms_shipped,
               OBJECTPROPERTYEX(o.object_id, 'IsSchemaBound') AS is_schema_bound
        FROM sys.objects AS o
        INNER JOIN sys.schemas AS s ON s.schema_id=o.schema_id
        WHERE o.name=N'${TENANT_PREDICATE_NAME}';

        SELECT CASE WHEN OBJECT_ID(N'dbo.gym_users', N'U') IS NOT NULL
                         AND OBJECT_ID(N'dbo.gym_auth_sessions', N'U') IS NOT NULL
                         AND EXISTS (
                             SELECT 1
                             FROM sys.columns c
                             WHERE c.object_id=OBJECT_ID(N'dbo.gym_users')
                               AND c.name=N'must_change_password'
                               AND c.system_type_id=104
                               AND c.is_nullable=0
                         )
                         AND EXISTS (
                             SELECT 1
                             FROM sys.columns c
                             WHERE c.object_id=OBJECT_ID(N'dbo.gym_users')
                               AND c.name=N'password_changed_at'
                               AND c.system_type_id=42
                              AND c.scale=0
                              AND c.is_nullable=1
                         )
                         AND EXISTS (
                             SELECT 1
                             FROM sys.columns c
                             WHERE c.object_id=OBJECT_ID(N'dbo.gym_tenants')
                               AND c.name=N'tenant_type'
                               AND c.system_type_id=167
                               AND c.max_length>=32
                               AND c.is_nullable=0
                         )
                         AND EXISTS (
                             SELECT 1
                             FROM sys.default_constraints dc
                             INNER JOIN sys.columns c ON c.default_object_id=dc.object_id
                             WHERE dc.parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
                               AND c.name=N'tenant_type'
                               AND LOWER(dc.definition) LIKE N'%gym%'
                         )
                         AND EXISTS (
                             SELECT 1
                             FROM sys.check_constraints cc
                             WHERE cc.parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
                               AND cc.name=N'CK_gym_tenants_tenant_type'
                               AND LOWER(cc.definition) LIKE N'%gym%'
                               AND LOWER(cc.definition) LIKE N'%independent_trainer%'
                         )
                    THEN 1 ELSE 0 END AS schema_contract_ready;
    `);

    const actualRows = result.recordsets?.[0] || [];
    const registeredRows = result.recordsets?.[1] || [];
    const policyRows = result.recordsets?.[2] || [];
    const functionRows = result.recordsets?.[3] || [];
    const schemaRows = result.recordsets?.[4] || [];
    const globalTables = new Set(GLOBAL_TENANT_COLUMN_TABLES);
    const actual = actualRows
        .map((row) => ({
            schema: String(row.schema_name || ''),
            name: String(row.name || ''),
            key: tableKey(row.schema_name, row.name),
            nullable: Boolean(row.is_nullable),
            dataType: String(row.data_type || '').toLowerCase()
        }))
        .filter((row) => !globalTables.has(row.key));
    const registeredPhysical = new Set(registeredRows.map((row) => tableKey(row.schema_name, row.name)));
    const registry = TENANT_TABLES.map((name) => ({ schema: 'dbo', name, key: tableKey('dbo', name) }));
    const registryKeys = new Set(registry.map((row) => row.key));
    const predicatesByTable = new Map();
    for (const row of policyRows) {
        const key = tableKey(row.schema_name, row.table_name);
        if (!predicatesByTable.has(key)) predicatesByTable.set(key, []);
        predicatesByTable.get(key).push(row);
    }
    const policyExists = policyRows.some((row) => String(row.policy_schema || '').toLowerCase() === 'dbo');
    const policyEnabled = policyRows.some((row) => Number(row.is_enabled) === 1 && String(row.policy_schema || '').toLowerCase() === 'dbo');
    const protectedTables = [];
    const unprotectedTables = [];
    const invalidPredicates = [];
    const disabledRequiredPolicies = [];
    for (const table of actual) {
        const rows = predicatesByTable.get(table.key) || [];
        const policyIsDisabled = rows.some((row) => Number(row.is_enabled) !== 1);
        const valid = rows.some((row) => hasTenantPredicate(row, 'FILTER'))
            && rows.some((row) => hasTenantPredicate(row, 'BLOCK', 'AFTER INSERT'))
            && rows.some((row) => hasTenantPredicate(row, 'BLOCK', 'AFTER UPDATE'))
            && rows.every((row) => String(row.policy_schema || '').toLowerCase() === 'dbo'
                && String(row.policy_name || '') === TENANT_POLICY_NAME);
        if (valid && !policyIsDisabled) protectedTables.push(table.key);
        else unprotectedTables.push(table.key);
        if (rows.length > 0 && (!valid || policyIsDisabled)) invalidPredicates.push(table.key);
        if (policyIsDisabled) disabledRequiredPolicies.push(table.key);
    }
    const missingRegistryEntries = actual.filter((table) => !registryKeys.has(table.key)).map((table) => table.key);
    const missingRegistryTables = registry.filter((table) => !registeredPhysical.has(table.key)).map((table) => table.key);
    const schemaSecurityMismatches = actual
        .filter((table) => table.dataType !== 'int'
            || (table.nullable && !NULLABLE_TENANT_TABLES.includes(table.key)))
        .map((table) => table.key);
    const securityFunction = functionRows.find((row) => String(row.schema_name || '').toLowerCase() === 'dbo'
        && String(row.name || '') === TENANT_PREDICATE_NAME);
    const securityFunctionPresent = Boolean(securityFunction
        && String(securityFunction.type || '').toUpperCase() === 'IF'
        && Number(securityFunction.is_ms_shipped) === 0
        && Number(securityFunction.is_schema_bound) === 1);
    const securityFunctionSchemaMismatch = functionRows.length > 0 && !securityFunctionPresent;
    const schemaContractReady = Number(schemaRows[0]?.schema_contract_ready) === 1;
    const registryMismatch = missingRegistryEntries.length > 0 || missingRegistryTables.length > 0;
    return {
        policy_enabled: policyEnabled ? 1 : 0,
        policy_exists: policyExists ? 1 : 0,
        security_function_present: securityFunctionPresent ? 1 : 0,
        schema_contract_ready: schemaContractReady ? 1 : 0,
        actual_tenant_tables: actual.length,
        registry_tenant_tables: registry.length,
        registry_physical_tables: registeredPhysical.size,
        expected_tables: actual.length,
        protected_tables: protectedTables.length,
        unprotected_tenant_tables: unprotectedTables.length,
        missing_registry_entries: missingRegistryEntries.length,
        missing_registry_tables: missingRegistryTables.length,
        disabled_required_policies: disabledRequiredPolicies.length,
        invalid_predicates: invalidPredicates.length,
        schema_security_mismatch: schemaSecurityMismatches.length + (securityFunctionSchemaMismatch ? 1 : 0),
        registry_mismatch: registryMismatch ? 1 : 0,
        actualTenantTables: actual.map((table) => table.key),
        registryTables: registry.map((table) => table.key),
        missingRegistryEntries,
        missingRegistryTables,
        unprotectedTenantTables: unprotectedTables,
        invalidPredicates,
        disabledRequiredPolicies,
        schemaSecurityMismatches,
        globalTenantColumnTables: [...GLOBAL_TENANT_COLUMN_TABLES],
        nullableTenantTables: [...NULLABLE_TENANT_TABLES]
    };
}

function tenantSecuritySnapshotIsReady(snapshot = {}) {
    const policyEnabled = Number(snapshot.policy_enabled ?? snapshot.policyEnabled) === 1;
    const actualTables = Number(snapshot.actual_tenant_tables ?? snapshot.actualTenantTablesCount ?? snapshot.expected_tables);
    const registryTables = Number(snapshot.registry_tenant_tables ?? snapshot.registryTenantTables);
    const protectedTables = Number(snapshot.protected_tables ?? snapshot.protectedTables);
    const functionPresent = Number(snapshot.security_function_present ?? snapshot.securityFunctionPresent) === 1;
    const unprotected = Number(snapshot.unprotected_tenant_tables ?? snapshot.unprotectedTenantTablesCount);
    const missingRegistry = Number(snapshot.missing_registry_entries ?? snapshot.missingRegistryEntriesCount);
    const missingPhysical = Number(snapshot.missing_registry_tables ?? snapshot.missingRegistryTablesCount);
    const disabledPolicies = Number(snapshot.disabled_required_policies ?? snapshot.disabledRequiredPoliciesCount);
    const invalidPredicates = Number(snapshot.invalid_predicates ?? snapshot.invalidPredicatesCount);
    const schemaMismatch = Number(snapshot.schema_security_mismatch ?? snapshot.schemaSecurityMismatchCount);
    return policyEnabled
        && functionPresent
        && Number(snapshot.schema_contract_ready ?? snapshot.schemaContractReady) === 1
        && actualTables > 0
        && registryTables === actualTables
        && protectedTables === actualTables
        && unprotected === 0
        && missingRegistry === 0
        && missingPhysical === 0
        && disabledPolicies === 0
        && invalidPredicates === 0
        && schemaMismatch === 0;
}

async function assertTenantIsolationReady() {
    if (tenantSecurityReadyUntil > Date.now()) return true;
    if (!tenantSecurityReadinessPromise) {
        tenantSecurityReadinessPromise = (async () => {
            const pool = await getPool();
            const snapshot = await getTenantSecuritySnapshot(pool);
            if (!tenantSecuritySnapshotIsReady(snapshot)) {
                throw tenantError('Tenant data isolation is not ready.', 503, 'TENANT_ISOLATION_NOT_READY');
            }
            tenantSecurityReadyUntil = Date.now() + TENANT_SECURITY_READINESS_TTL_MS;
            return true;
        })().finally(() => {
            tenantSecurityReadinessPromise = null;
        });
    }
    return tenantSecurityReadinessPromise;
}

function invalidateTenantSecurityReadiness() {
    tenantSecurityReadyUntil = 0;
}

function tenantColumnMigrationSql(table) {
    const quotedTable = `dbo.[${table}]`;
    const nullableTenantColumn = NULLABLE_TENANT_TABLES.includes(`dbo.${table}`);
    const defaultName = `DF_${table}_tenant_id`;
    const foreignKeyName = `FK_${table}_tenant`;
    const indexName = `IX_${table}_tenant_id`;
    return `
        IF COL_LENGTH(N'dbo.${table}', N'tenant_id') IS NULL
            EXEC(N'ALTER TABLE ${quotedTable} ADD tenant_id INT NULL;');

        ${nullableTenantColumn ? '' : `EXEC sys.sp_executesql
            N'UPDATE ${quotedTable} SET tenant_id=@TenantId WHERE tenant_id IS NULL;',
            N'@TenantId INT', @TenantId=@tenantId;`}

        IF NOT EXISTS (
            SELECT 1
            FROM sys.default_constraints dc
            INNER JOIN sys.columns c ON c.default_object_id=dc.object_id
            WHERE dc.parent_object_id=OBJECT_ID(N'dbo.${table}')
              AND c.name=N'tenant_id'
        )
            EXEC(N'ALTER TABLE ${quotedTable} ADD CONSTRAINT [${defaultName}] DEFAULT (TRY_CONVERT(INT, SESSION_CONTEXT(N''tenant_id''))) FOR tenant_id;');

        IF ${nullableTenantColumn ? '0=1' : `EXISTS (
            SELECT 1 FROM sys.columns
            WHERE object_id=OBJECT_ID(N'dbo.${table}')
              AND name=N'tenant_id'
              AND (is_nullable=1 OR system_type_id<>56)
        )`}
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

async function ensureLibrarySourceKeys(pool, tables) {
    const libraryKeys = [
        ['gym_muscles', 'UQ_gym_muscles_source', 'UQ_gym_muscles_tenant_source'],
        ['gym_foods', 'UQ_gym_foods_source', 'UQ_gym_foods_tenant_source'],
        ['gym_exercises', 'UQ_gym_exercises_source', 'UQ_gym_exercises_tenant_source']
    ];
    for (const [table, legacyKey, scopedKey] of libraryKeys) {
        if (!tables.includes(table)) continue;
        await pool.request().batch(`
            -- The catalog source id is stable inside a tenant, not globally.
            -- Drop the pre-tenancy single-column key once, then keep the
            -- tenant-scoped rule idempotently for future boots.
            IF EXISTS (
                SELECT 1 FROM sys.key_constraints
                WHERE name=N'${legacyKey}' AND parent_object_id=OBJECT_ID(N'dbo.${table}')
            )
                ALTER TABLE dbo.[${table}] DROP CONSTRAINT [${legacyKey}];

            IF EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name=N'${legacyKey}' AND object_id=OBJECT_ID(N'dbo.${table}')
            )
                DROP INDEX [${legacyKey}] ON dbo.[${table}];

            IF NOT EXISTS (
                SELECT 1 FROM sys.indexes
                WHERE name=N'${scopedKey}' AND object_id=OBJECT_ID(N'dbo.${table}')
            )
                CREATE UNIQUE INDEX [${scopedKey}]
                    ON dbo.[${table}](tenant_id, source_id)
                    WHERE source_id IS NOT NULL;
        `);
    }
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
    const beforeRepair = await getTenantSecuritySnapshot(pool);
    if (Number(beforeRepair.schema_contract_ready) !== 1) {
        throw tenantError('Tenant schema contract is not ready.', 503, 'TENANT_SCHEMA_CONTRACT_NOT_READY');
    }
    if (beforeRepair.missing_registry_entries.length > 0) {
        throw tenantError(`Tenant registry mismatch: ${beforeRepair.missing_registry_entries.join(', ')}`, 503, 'TENANT_REGISTRY_MISMATCH');
    }
    if (beforeRepair.missing_registry_tables.length > 0) {
        throw tenantError(`Required tenant tables are missing: ${beforeRepair.missing_registry_tables.join(', ')}`, 503, 'TENANT_SCHEMA_INCOMPLETE');
    }
    invalidateTenantSecurityReadiness();
    await dropTenantSecurityPolicy(pool);

    for (const table of tables) {
        await pool.request()
            .input('tenantId', sql.Int, normalizedTenantId)
            .batch(tenantColumnMigrationSql(table));
    }
    const afterColumns = await getTenantSecuritySnapshot(pool);
    if (afterColumns.missing_registry_entries.length > 0) {
        throw tenantError(`Tenant registry mismatch: ${afterColumns.missing_registry_entries.join(', ')}`, 503, 'TENANT_REGISTRY_MISMATCH');
    }
    if (afterColumns.missing_registry_tables.length > 0) {
        throw tenantError(`Required tenant tables are missing: ${afterColumns.missing_registry_tables.join(', ')}`, 503, 'TENANT_SCHEMA_INCOMPLETE');
    }
    await ensureBrandingKeyCompatibility(pool);
    await ensureLibrarySourceKeys(pool, tables);

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
    await recreateTenantSecurityPolicy(pool, afterColumns.actualTenantTables.map((key) => key.split('.')[1]));
    invalidateTenantSecurityReadiness();
    return { tenantId: normalizedTenantId, tables };
}

module.exports = {
    BOOTSTRAP_TENANT_NAME,
    BOOTSTRAP_TENANT_SLUG,
    TENANT_SCHEMA_SQL,
    GLOBAL_TENANT_COLUMN_TABLES,
    NULLABLE_TENANT_TABLES,
    TENANT_TABLES,
    assignUserToTenant,
    assertTenantIsolationReady,
    ensureBootstrapTenant,
    ensureTenantColumnsAndRls,
    getTenantType,
    ensureTenantTables,
    getTenantSecuritySnapshot,
    resolvePublicTenant,
    resolveTenantForUser,
    tenantSecuritySnapshotIsReady
};
