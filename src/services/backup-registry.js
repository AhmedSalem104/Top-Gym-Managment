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
    definition('gym_user_tenants', 'gym_user_tenants', 'membership-metadata'),
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
    Object.freeze({ key: 'saas_plans', table: 'saas_plans' }),
    Object.freeze({ key: 'saas_plan_tenant_types', table: 'saas_plan_tenant_types' }),
    Object.freeze({ key: 'saas_tenant_subscriptions', table: 'saas_tenant_subscriptions' }),
    Object.freeze({ key: 'saas_subscription_requests', table: 'saas_subscription_requests' }),
    Object.freeze({ key: 'saas_payment_proofs', table: 'saas_payment_proofs' }),
    Object.freeze({ key: 'saas_tenant_overrides', table: 'saas_tenant_overrides' }),
    Object.freeze({ key: 'saas_subscription_changes', table: 'saas_subscription_changes' }),
    Object.freeze({ key: 'saas_platform_notes', table: 'saas_platform_notes' }),
    Object.freeze({ key: 'saas_audit_log', table: 'saas_audit_log' })
]);

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

module.exports = {
    PLATFORM_GLOBAL_BACKUP_TABLES,
    TENANT_BACKUP_EXCLUDED_TABLES,
    TENANT_BACKUP_REGISTRY_VERSION,
    TENANT_BACKUP_TABLES,
    getTenantBackupCoverage,
    getTenantBackupDefinition
};
