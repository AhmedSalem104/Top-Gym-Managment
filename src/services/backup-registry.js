'use strict';

/**
 * Authoritative inventory for logical backups.
 *
 * The registry is intentionally separate from the SQL implementation. It is
 * reviewed when a tenant-scoped table is added, and the coverage helper is
 * used by QA to prevent a new table from silently falling outside backups.
 */
// Bump when the logical tenant artifact contract changes. Existing artifacts
// remain readable only when their registry matches the current restore
// inventory; new tenant-owned commercial records are included below.
const TENANT_BACKUP_REGISTRY_VERSION = 3;

function definition(key, table, restorePolicy = 'tenant') {
    return Object.freeze({ key, table, tenantScoped: true, restorePolicy });
}

const TENANT_BACKUP_TABLES = Object.freeze([
    definition('gym_branches', 'gym_branches'),
    definition('gym_branch_user_access', 'gym_branch_user_access'),
    definition('gym_branch_commerce_config', 'gym_branch_commerce_config'),
    definition('gym_membership_branch_access', 'gym_membership_branch_access'),
    definition('gym_stock_locations', 'gym_stock_locations'),
    definition('gym_store_location_inventory_balances', 'gym_store_location_inventory_balances'),
    definition('gym_stock_transfers', 'gym_stock_transfers'),
    definition('gym_stock_transfer_items', 'gym_stock_transfer_items'),
    definition('gym_bar_recipes', 'gym_bar_recipes'),
    definition('gym_bar_recipe_items', 'gym_bar_recipe_items'),
    definition('gym_pos_shifts', 'gym_pos_shifts'),
    definition('gym_commerce_waste', 'gym_commerce_waste'),
    definition('gym_bar_modifiers', 'gym_bar_modifiers'),
    definition('members', 'members'),
    definition('gym_membership_code_audit', 'gym_membership_code_audit'),
    definition('gym_member_feedback', 'gym_member_feedback'),
    definition('gym_member_subscription_requests', 'gym_member_subscription_requests'),
    definition('gym_member_subscription_payment_proofs', 'gym_member_subscription_payment_proofs'),
    definition('gym_member_portal_visit_daily', 'gym_member_portal_visit_daily'),
    definition('gym_member_portal_visit_visitors', 'gym_member_portal_visit_visitors'),
    definition('memberships', 'memberships'),
    definition('membership_pricing', 'membership_pricing'),
    definition('membership_types', 'membership_types'),
    definition('membership_type_prices', 'membership_type_prices'),
    definition('gym_day_pass_types', 'gym_day_pass_types'),
    definition('gym_day_pass_sales', 'gym_day_pass_sales'),
    definition('membership_freezes', 'membership_freezes'),
    definition('gym_payments', 'gym_payments'),
    definition('gym_payment_transactions', 'gym_payment_transactions'),
    definition('gym_subscription_refunds', 'gym_subscription_refunds'),
    definition('gym_expenses', 'gym_expenses'),
    definition('gym_attendance', 'gym_attendance'),
    definition('membership_events', 'membership_events'),
    definition('gym_muscles', 'gym_muscles'),
    definition('gym_foods', 'gym_foods'),
    definition('gym_exercises', 'gym_exercises'),
    definition('workout_programs', 'workout_programs'),
    definition('workout_routines', 'workout_routines'),
    definition('workout_exercises', 'workout_exercises'),
    definition('diet_plans', 'diet_plans'),
    definition('diet_meals', 'diet_meals'),
    definition('diet_meal_items', 'diet_meal_items'),
    definition('body_measurements', 'body_measurements'),
    definition('athlete_checkins', 'athlete_checkins'),
    definition('coaching_activity_events', 'coaching_activity_events'),
    definition('coaching_sessions', 'coaching_sessions'),
    definition('trainer_packages', 'trainer_packages'),
    definition('trainer_package_purchases', 'trainer_package_purchases'),
    definition('trainer_package_usage', 'trainer_package_usage'),
    definition('workout_sessions', 'workout_sessions'),
    definition('workout_set_logs', 'workout_set_logs'),
    definition('meal_logs', 'meal_logs'),
    definition('gym_ai_generation_log', 'gym_ai_generation_log'),
    definition('gym_alert_communications', 'gym_alert_communications'),
    definition('gym_permission_audit', 'gym_permission_audit'),
    definition('gym_user_permissions', 'gym_user_permissions'),
    definition('gym_store_categories', 'gym_store_categories'),
    definition('gym_store_suppliers', 'gym_store_suppliers'),
    definition('gym_store_products', 'gym_store_products'),
    definition('gym_store_product_variants', 'gym_store_product_variants'),
    definition('gym_store_customers', 'gym_store_customers'),
    definition('gym_store_purchases', 'gym_store_purchases'),
    definition('gym_store_purchase_items', 'gym_store_purchase_items'),
    definition('gym_store_purchase_payments', 'gym_store_purchase_payments'),
    definition('gym_store_inventory_balances', 'gym_store_inventory_balances'),
    definition('gym_store_inventory_batches', 'gym_store_inventory_batches'),
    definition('gym_store_stock_movements', 'gym_store_stock_movements'),
    definition('gym_store_sales', 'gym_store_sales'),
    definition('gym_store_sale_items', 'gym_store_sale_items'),
    definition('gym_store_sale_payments', 'gym_store_sale_payments'),
    definition('gym_store_returns', 'gym_store_returns'),
    definition('gym_store_return_items', 'gym_store_return_items'),
    definition('gym_store_audit_log', 'gym_store_audit_log'),
    definition('gym_branding_config', 'gym_branding_config'),
    definition('gym_branding_assets', 'gym_branding_assets'),
    definition('gym_branding_audit', 'gym_branding_audit')
]);

// These tables may be tenant-scoped in the application database, but they
// are backup metadata or platform-control data. Restoring them from a tenant
// artifact would either overwrite the control plane or create a loop.
const TENANT_BACKUP_EXCLUDED_TABLES = Object.freeze([
    'gym_user_tenants',
    'gym_backup_archives',
    'gym_backup_operations',
    'gym_backup_records',
    'gym_backup_audit_log',
    // Portal sessions are bearer-token hashes and deliberately transient;
    // they must never be exported or restored as tenant business data.
    'gym_member_portal_sessions',
    'saas_payment_proofs',
    // Audit is dual-scope: tenant events are RLS-scoped, while platform
    // events intentionally have a NULL tenant_id and stay in the platform
    // control-plane backup artifact.
    'saas_audit_log',
    'saas_platform_notes',
    'saas_subscription_requests',
    'saas_subscription_changes',
    'saas_tenant_subscriptions',
    'saas_tenant_overrides'
]);

const PLATFORM_GLOBAL_BACKUP_TABLES = Object.freeze([
    Object.freeze({ key: 'gym_tenants', table: 'gym_tenants' }),
    Object.freeze({ key: 'gym_users', table: 'gym_users' }),
    // Tenant membership metadata is required to recover account-to-tenant
    // resolution before an operational tenant context exists.
    Object.freeze({ key: 'gym_user_tenants', table: 'gym_user_tenants' }),
    Object.freeze({ key: 'saas_plans', table: 'saas_plans' }),
    Object.freeze({ key: 'saas_plan_terms', table: 'saas_plan_terms' }),
    Object.freeze({ key: 'saas_plan_tenant_types', table: 'saas_plan_tenant_types' }),
    Object.freeze({ key: 'saas_platform_payment_methods', table: 'saas_platform_payment_methods' }),
    Object.freeze({ key: 'saas_gym_registration_requests', table: 'saas_gym_registration_requests' }),
    Object.freeze({ key: 'saas_gym_registration_payment_proofs', table: 'saas_gym_registration_payment_proofs' }),
    Object.freeze({ key: 'saas_tenant_subscriptions', table: 'saas_tenant_subscriptions' }),
    Object.freeze({ key: 'saas_subscription_requests', table: 'saas_subscription_requests' }),
    Object.freeze({ key: 'saas_payment_proofs', table: 'saas_payment_proofs' }),
    Object.freeze({ key: 'saas_tenant_overrides', table: 'saas_tenant_overrides' }),
    Object.freeze({ key: 'saas_subscription_changes', table: 'saas_subscription_changes' }),
    Object.freeze({ key: 'saas_platform_notes', table: 'saas_platform_notes' }),
    Object.freeze({ key: 'saas_audit_log', table: 'saas_audit_log' })
]);

// These objects are deliberately not part of a logical application restore:
// sessions/bearer hashes must be invalidated, backup metadata belongs to the
// recovery system itself, and legacy archives are not the source of truth.
const PLATFORM_BACKUP_EXCLUDED_TABLES = Object.freeze([
    'gym_auth_sessions',
    'gym_member_portal_sessions',
    'gym_backup_archives',
    'gym_backup_operations',
    'gym_backup_records',
    'gym_backup_audit_log',
    'gym_platform_backup_records',
    'gym_platform_backup_audit_log'
]);

const PLATFORM_BACKUP_EXCLUSION_REASONS = Object.freeze({
    gym_auth_sessions: 'Bearer sessions are transient and must be revoked during recovery.',
    gym_member_portal_sessions: 'Portal bearer sessions are transient and must be revoked during recovery.',
    gym_backup_archives: 'Legacy tenant archive metadata is not the platform recovery source of truth.',
    gym_backup_operations: 'Legacy operational metadata is not required to recover business data.',
    gym_backup_records: 'Tenant backup metadata is rebuilt by the recovery schema.',
    gym_backup_audit_log: 'Tenant recovery audit metadata is rebuilt by the recovery schema.',
    gym_platform_backup_records: 'Platform backup metadata is rebuilt by the recovery schema.',
    gym_platform_backup_audit_log: 'Platform recovery audit metadata is rebuilt by the recovery schema.'
});

// The deployed legacy schema predates the lower_snake_case application
// schema. These tables remain recoverable business/history data even though
// the current runtime no longer uses them as its primary domain model. The
// names and relationship notes are intentionally explicit: a future table
// cannot become recoverable merely because it happens to be present.
const LEGACY_REQUIRED_TABLES = Object.freeze([
    '__TenantEFMigrationsHistory',
    'Appointments',
    'Attendances',
    'AuditLogs',
    'BodyMeasurements',
    'Branches',
    'BranchOperatingHours',
    'Challenges',
    'ChatConversations',
    'ChatMessages',
    'ClassEnrollments',
    'ClassSchedules',
    'ClientChallenges',
    'ClientSubscriptions',
    'CoachClients',
    'CommissionRules',
    'Commissions',
    'Coupons',
    'CouponUsages',
    'DailyMeals',
    'DietPlans',
    'DomainUsers',
    'EmployeeBranches',
    'EmployeeProfiles',
    'Equipment',
    'Exercises',
    'ExpenseCategories',
    'Expenses',
    'Foods',
    'GateAccessLogs',
    'GroupClasses',
    'InvoiceItems',
    'Invoices',
    'LeaveRequests',
    'MaintenanceRecords',
    'MealItems',
    'MealLogs',
    'MembershipCards',
    'Notifications',
    'PayrollItems',
    'PayrollRuns',
    'Payments',
    'ProductCategories',
    'Products',
    'ProgramRoutines',
    'PurchaseOrderItems',
    'PurchaseOrders',
    'RecipeIngredients',
    'Recipes',
    'Roles',
    'Rooms',
    'RoutineExercises',
    'SaleItems',
    'Sales',
    'SessionSets',
    'ShiftAssignments',
    'Shifts',
    'StaffAttendances',
    'StockItems',
    'StockMovements',
    'SubscriptionFreezes',
    'SubscriptionPlans',
    'Suppliers',
    'TaxSettings',
    'UserBranchAccesses',
    'UserProfiles',
    'UserRoles',
    'WalletTransactions',
    'WorkoutPrograms',
    'WorkoutSessions',
    'gym_audit_log',
    'gym_cash_closings'
]);

// These legacy objects are reference/authorization data, not disposable
// records. They are separated for manifest classification but are still
// included in a platform recovery artifact.
const REFERENCE_REQUIRED_TABLES = Object.freeze([
    'ExerciseSecondaryMuscles',
    'FoodMicronutrients',
    'Muscles',
    'NutrientDefinitions',
    'Permissions',
    'RolePermissions'
]);

const LEGACY_TRANSIENT_EXCLUDED_TABLES = Object.freeze([
    'JobExecutionLogs',
    'OutboxMessages'
]);

const LEGACY_SECRET_EXCLUDED_TABLES = Object.freeze([]);

const LEGACY_OWNERSHIP_RULES = Object.freeze({
    '__TenantEFMigrationsHistory': { scope: 'global', ownership: 'schema-history', reason: 'Legacy migration history records the source schema generation.' },
    'UserProfiles': { scope: 'legacy', ownership: 'fk:DomainUsers.UserId→DomainUsers.TenantId', reason: 'User profile ownership is derived through its DomainUsers foreign key.' },
    'ExerciseSecondaryMuscles': { scope: 'legacy', ownership: 'fk:Exercises.ExerciseId→Exercises.TenantId', reason: 'Exercise association ownership is derived through the exercise foreign key.' },
    'FoodMicronutrients': { scope: 'legacy', ownership: 'fk:Foods.FoodId→Foods.TenantId', reason: 'Food nutrient ownership is derived through the food foreign key.' },
    'RecipeIngredients': { scope: 'legacy', ownership: 'fk:Recipes.RecipeId→Recipes.TenantId', reason: 'Recipe ingredient ownership is derived through the recipe foreign key.' },
    'RolePermissions': { scope: 'legacy', ownership: 'reference-role-relationship', reason: 'Permission assignment is preserved with role/permission reference data.' },
    'Muscles': { scope: 'reference', ownership: 'global-reference', reason: 'Global anatomy reference data.' },
    'NutrientDefinitions': { scope: 'reference', ownership: 'global-reference', reason: 'Global nutrition reference data.' },
    'Permissions': { scope: 'reference', ownership: 'global-reference', reason: 'Global authorization reference data.' },
    'gym_audit_log': { scope: 'legacy', ownership: 'legacy-unscoped-audit', reason: 'Legacy audit history has no tenant column; all rows are retained.' },
    'gym_cash_closings': { scope: 'legacy', ownership: 'legacy-unscoped-finance', reason: 'Legacy cash-closing history has no tenant column; all rows are retained.' }
});

function legacyDefinition(table, classification = 'LEGACY_REQUIRED') {
    const rule = LEGACY_OWNERSHIP_RULES[table] || { scope: 'legacy', ownership: 'direct:TenantId/tenant_id', reason: 'Legacy business table retained as recoverable historical data.' };
    return Object.freeze({
        key: `legacy:${table}`,
        table,
        scope: rule.scope,
        classification,
        ownership: rule.ownership,
        reason: rule.reason
    });
}

const LEGACY_BACKUP_TABLES = Object.freeze([
    ...LEGACY_REQUIRED_TABLES.map((table) => legacyDefinition(table)),
    ...REFERENCE_REQUIRED_TABLES.map((table) => legacyDefinition(table, 'REFERENCE_REQUIRED'))
]);

const LEGACY_BACKUP_EXCLUDED_TABLES = Object.freeze([
    ...LEGACY_TRANSIENT_EXCLUDED_TABLES,
    ...LEGACY_SECRET_EXCLUDED_TABLES
]);

const LEGACY_BACKUP_EXCLUSION_REASONS = Object.freeze({
    JobExecutionLogs: 'Operational job telemetry is transient and is not required for business recovery.',
    OutboxMessages: 'Undelivered integration messages are transient and must be replayed by the outbox policy.'
});

const LEGACY_BACKUP_TABLE_BY_NAME = new Map(LEGACY_BACKUP_TABLES.map((item) => [item.table.toLowerCase(), item]));

function classifyPlatformTable(table, { hasTenantId = false } = {}) {
    const name = String(table || '').trim();
    const normalized = name.toLowerCase();
    const global = PLATFORM_GLOBAL_BACKUP_TABLES.find((item) => item.table.toLowerCase() === normalized);
    if (global) return { classification: 'GLOBAL_REQUIRED', scope: 'global', key: global.key, table: global.table, reason: 'Authoritative platform/control-plane table.' };
    const tenant = TENANT_BACKUP_TABLES.find((item) => item.table.toLowerCase() === normalized);
    if (tenant) return { classification: 'TENANT_REQUIRED', scope: 'tenant', key: tenant.key, table: tenant.table, reason: 'Current tenant-owned operational table.' };
    const legacy = LEGACY_BACKUP_TABLE_BY_NAME.get(normalized);
    if (legacy) return { classification: legacy.classification, scope: legacy.scope, key: legacy.key, table: legacy.table, ownership: legacy.ownership, reason: legacy.reason };
    const platformExcluded = PLATFORM_BACKUP_EXCLUDED_TABLES.find((item) => item.toLowerCase() === normalized);
    if (platformExcluded) return { classification: ['gym_auth_sessions', 'gym_member_portal_sessions'].includes(platformExcluded) ? 'SECRET_EXCLUDED' : 'TRANSIENT_EXCLUDED', scope: 'excluded', key: `excluded:${platformExcluded}`, table: platformExcluded, reason: PLATFORM_BACKUP_EXCLUSION_REASONS[platformExcluded] };
    const legacyExcluded = LEGACY_BACKUP_EXCLUDED_TABLES.find((item) => item.toLowerCase() === normalized);
    if (legacyExcluded) return { classification: 'TRANSIENT_EXCLUDED', scope: 'excluded', key: `excluded:${legacyExcluded}`, table: legacyExcluded, reason: LEGACY_BACKUP_EXCLUSION_REASONS[legacyExcluded] || 'Legacy transient table excluded by policy.' };
    // `hasTenantId` is deliberately not enough to classify an unknown table;
    // an unreviewed table must fail closed until its owner and recovery policy
    // are registered.
    return { classification: 'UNKNOWN', scope: null, key: null, table: name, hasTenantId: Boolean(hasTenantId), reason: 'No reviewed registry entry exists.' };
}

const TENANT_BACKUP_TABLE_BY_KEY = new Map(TENANT_BACKUP_TABLES.map((item) => [item.key, item]));
const TENANT_BACKUP_EXCLUDED_SET = new Set(TENANT_BACKUP_EXCLUDED_TABLES);

function normalizedNames(values) {
    return new Set((Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean));
}

function getTenantBackupCoverage({ tenantTables = [], existingTables = null } = {}) {
    const knownTenantTables = normalizedNames(tenantTables);
    const registryTables = new Set(TENANT_BACKUP_TABLES.map((item) => item.table));
    const excludedTables = new Set(TENANT_BACKUP_EXCLUDED_SET);
    const uncoveredTenantTables = [...knownTenantTables]
        .filter((table) => !registryTables.has(table) && !excludedTables.has(table))
        .sort();
    const physicalTables = existingTables == null ? null : normalizedNames(existingTables);
    const missingPhysicalTables = physicalTables == null
        ? []
        : TENANT_BACKUP_TABLES.map((item) => item.table).filter((table) => !physicalTables.has(table));
    return {
        registryVersion: TENANT_BACKUP_REGISTRY_VERSION,
        registryTables: TENANT_BACKUP_TABLES.map((item) => item.table),
        excludedTables: TENANT_BACKUP_EXCLUDED_TABLES,
        uncoveredTenantTables,
        missingPhysicalTables,
        coveredTenantTables: [...knownTenantTables].filter((table) => registryTables.has(table)).sort()
    };
}

function getTenantBackupDefinition(key) {
    return TENANT_BACKUP_TABLE_BY_KEY.get(String(key || '').trim()) || null;
}

function getPlatformBackupCoverage({ existingTables = [], tenantTables = [], sourceSchemaGeneration = null } = {}) {
    const actual = normalizedNames(existingTables);
    const tenantOwned = normalizedNames(tenantTables);
    const global = new Set(PLATFORM_GLOBAL_BACKUP_TABLES.map((item) => item.table.toLowerCase()));
    const registeredTenant = new Set(TENANT_BACKUP_TABLES.map((item) => item.table.toLowerCase()));
    const legacy = new Set(LEGACY_BACKUP_TABLES.map((item) => item.table.toLowerCase()));
    const excluded = new Set([
        ...PLATFORM_BACKUP_EXCLUDED_TABLES,
        ...LEGACY_BACKUP_EXCLUDED_TABLES
    ].map((item) => item.toLowerCase()));
    const legacySource = sourceSchemaGeneration === 'legacy-pre-trainer';
    const missingGlobalTables = legacySource ? [] : PLATFORM_GLOBAL_BACKUP_TABLES
        .map((item) => item.table)
        .filter((table) => !actual.has(table.toLowerCase()))
        .sort();
    const missingTenantTables = legacySource ? [] : TENANT_BACKUP_TABLES
        .map((item) => item.table)
        .filter((table) => !actual.has(table.toLowerCase()))
        .sort();
    const unregisteredTenantTables = [...tenantOwned]
        // Some control-plane tables carry tenant_id for referential integrity
        // but are intentionally backed up in the global platform section.
        // Global classification has precedence over tenant discovery.
        .filter((table) => !global.has(table) && !registeredTenant.has(table) && !legacy.has(table) && !excluded.has(table))
        .sort();
    const known = new Set([...global, ...registeredTenant, ...legacy, ...excluded]);
    const unclassifiedTables = [...actual].filter((table) => !known.has(table)).sort();
    const presentLegacyTables = LEGACY_BACKUP_TABLES.map((item) => item.table).filter((table) => actual.has(table.toLowerCase()));
    const absentLegacyTables = LEGACY_BACKUP_TABLES.map((item) => item.table).filter((table) => !actual.has(table.toLowerCase()));
    const absentModernTables = [...PLATFORM_GLOBAL_BACKUP_TABLES, ...TENANT_BACKUP_TABLES]
        .map((item) => item.table)
        .filter((table) => !actual.has(table.toLowerCase()));
    return {
        registryVersion: TENANT_BACKUP_REGISTRY_VERSION,
        status: missingGlobalTables.length || missingTenantTables.length || unregisteredTenantTables.length || unclassifiedTables.length
            ? 'attention'
            : 'covered',
        missingGlobalTables,
        missingTenantTables,
        unregisteredTenantTables,
        unclassifiedTables,
        presentLegacyTables,
        absentLegacyTables,
        absentModernTables,
        legacyExcludedTables: [...LEGACY_BACKUP_EXCLUDED_TABLES],
        legacyExclusionReasons: LEGACY_BACKUP_EXCLUSION_REASONS,
        excludedTables: [...PLATFORM_BACKUP_EXCLUDED_TABLES],
        exclusionReasons: PLATFORM_BACKUP_EXCLUSION_REASONS
    };
}

module.exports = {
    PLATFORM_BACKUP_EXCLUDED_TABLES,
    PLATFORM_BACKUP_EXCLUSION_REASONS,
    PLATFORM_GLOBAL_BACKUP_TABLES,
    classifyPlatformTable,
    LEGACY_BACKUP_EXCLUDED_TABLES,
    LEGACY_BACKUP_EXCLUSION_REASONS,
    LEGACY_BACKUP_TABLES,
    LEGACY_REQUIRED_TABLES,
    REFERENCE_REQUIRED_TABLES,
    TENANT_BACKUP_EXCLUDED_TABLES,
    TENANT_BACKUP_REGISTRY_VERSION,
    TENANT_BACKUP_TABLES,
    getPlatformBackupCoverage,
    getTenantBackupCoverage,
    getTenantBackupDefinition
};
