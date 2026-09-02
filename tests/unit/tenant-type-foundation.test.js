'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
    TENANT_TYPES,
    TENANT_TYPE_VALUES,
    isTenantType,
    resolveTenantType
} = require('../../src/tenancy/tenant-types');
const capabilityService = require('../../src/services/capability-service');
const { metadataColumns } = require('../../src/services/backup-recovery-service');

const root = path.join(__dirname, '..', '..');
const migration = fs.readFileSync(path.join(root, 'database', 'migrations', '014-tenant-type-foundation.sql'), 'utf8');
const tenantService = fs.readFileSync(path.join(root, 'src', 'services', 'tenant-service.js'), 'utf8');
const saasService = fs.readFileSync(path.join(root, 'src', 'services', 'saas-service.js'), 'utf8');
const platformAdminService = fs.readFileSync(path.join(root, 'src', 'services', 'platform-admin-service.js'), 'utf8');
const backupRecoveryService = fs.readFileSync(path.join(root, 'src', 'services', 'backup-recovery-service.js'), 'utf8');

test('canonical tenant types recognize only the additive domain values', () => {
    assert.deepEqual(TENANT_TYPES, { GYM: 'gym', INDEPENDENT_TRAINER: 'independent_trainer' });
    assert.deepEqual(TENANT_TYPE_VALUES, ['gym', 'independent_trainer']);
    assert.equal(isTenantType('GYM'), true);
    assert.equal(resolveTenantType(' GYM '), 'gym');
    assert.equal(resolveTenantType('independent_trainer'), 'independent_trainer');
    assert.throws(() => resolveTenantType('unknown'), { code: 'TENANT_TYPE_INVALID', statusCode: 503 });
    assert.throws(() => resolveTenantType(null), { code: 'TENANT_TYPE_INVALID', statusCode: 503 });
});

test('tenant type migration is additive, idempotent, and only backfills legacy tenant metadata', () => {
    assert.match(migration, /COL_LENGTH\(N'dbo\.gym_tenants', N'tenant_type'\) IS NULL/i);
    assert.match(migration, /UPDATE dbo\.gym_tenants[\s\S]*tenant_type=''gym''/i);
    assert.match(migration, /tenant_type VARCHAR\(32\) NOT NULL/i);
    assert.match(migration, /CK_gym_tenants_tenant_type/i);
    assert.match(migration, /tenant_type IN \(('{2})?gym\1, \1independent_trainer\1\)/i);
    assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
    assert.doesNotMatch(migration, /DELETE\s+FROM\s+dbo\.(?!gym_tenants\b)/i);
    assert.doesNotMatch(migration, /UPDATE\s+dbo\.(?!gym_tenants\b)/i);
});

test('new tenant records are explicitly created as Gym and bootstrap is not a type fallback', () => {
    assert.match(tenantService, /tenant_type VARCHAR\(32\) NOT NULL/);
    assert.match(tenantService, /INSERT INTO dbo\.gym_tenants\(name, slug, tenant_type, status\)/);
    assert.match(saasService, /INSERT INTO dbo\.gym_tenants \(name,slug,tenant_type,status\)/);
    assert.match(saasService, /TENANT_TYPES\.GYM/);
    assert.doesNotMatch(saasService, /body\.tenantType|body\.tenant_type/);
});

test('bootstrap tenant repair does not mutate already-repaired membership history', () => {
    assert.match(tenantService, /bootstrapMembership\.is_primary<>0 OR bootstrapMembership\.status<>'disabled'/);
});

test('capability foundation preserves Gym output and exposes only shipped Trainer domains', () => {
    const fromCanonicalGym = capabilityService.resolveEffectiveCapabilities({ tenantType: TENANT_TYPES.GYM, features: { store: false } });
    const legacyCallShape = capabilityService.resolveEffectiveCapabilities({ features: { store: false } });
    assert.deepEqual(fromCanonicalGym, legacyCallShape);
    const trainer = capabilityService.resolveEffectiveCapabilities({ tenantType: TENANT_TYPES.INDEPENDENT_TRAINER });
    assert.equal(trainer.capabilities.clients, true);
    assert.equal(trainer.capabilities.portal, true);
    assert.equal(trainer.capabilities.sessions, true);
    assert.match(saasService, /tenantService\.getTenantType\(id\)/);
    assert.match(saasService, /tenantType: entitlements\.tenantType/);
});

test('tenant type is backend-derived and PlatformAdmin read-only in this phase', () => {
    assert.match(tenantService, /SELECT TOP \(1\) tenant_type FROM dbo\.gym_tenants WHERE id=@tenantId/);
    assert.match(tenantService, /resolveTenantType\(result\.recordset\[0\]\.tenant_type\)/);
    assert.match(platformAdminService, /tenantType: resolveTenantType\(row\.tenant_type\)/);
    assert.match(platformAdminService, /t\.tenant_type/);
    assert.doesNotMatch(platformAdminService, /UPDATE dbo\.gym_tenants[\s\S]{0,500}tenant_type\s*=/i);
});

test('tenant security readiness requires the tenant type schema contract', () => {
    assert.match(tenantService, /name=N'tenant_type'[\s\S]*system_type_id=167[\s\S]*max_length>=32[\s\S]*is_nullable=0/);
    assert.match(tenantService, /schema_contract_ready/);
});

test('platform backup keeps tenant metadata in the generic global-table projection', () => {
    assert.match(backupRecoveryService, /loadTableMetadata\(pool, PLATFORM_GLOBAL_BACKUP_TABLES\)/);
    assert.match(backupRecoveryService, /readTableRows\(pool, \{ \.\.\.definition, tenantScoped: false \}, globalMetadata/);
    const columns = metadataColumns(new Map([['gym_tenants', [
        { name: 'id', isComputed: false, isRowVersion: false },
        { name: 'tenant_type', isComputed: false, isRowVersion: false }
    ]]]), 'gym_tenants');
    assert.ok(columns.some((column) => column.name === 'tenant_type'));
});
