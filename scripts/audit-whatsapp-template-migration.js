'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { auditMigrationText } = require('./audit-database-readiness');
const {
    getBackupClassification,
    TENANT_BACKUP_TABLES,
    PLATFORM_GLOBAL_BACKUP_TABLES
} = require('../src/services/backup-registry');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION_FILE = '034-whatsapp-message-templates.sql';
const TEMPLATE_IDS = Object.freeze([
    'MEMBERSHIP_WELCOME',
    'MEMBERSHIP_FROZEN',
    'MEMBERSHIP_EXPIRED',
    'MEMBERSHIP_EXPIRING',
    'PAYMENT_OUTSTANDING',
    'MEMBER_ABSENCE',
    'DAY_PASS_THANK_YOU',
    'TENANT_ACTIVATED',
    'PORTAL_ACCESS'
]);

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function fail(message) {
    const error = new Error(message);
    error.code = 'WHATSAPP_TEMPLATE_MIGRATION_AUDIT_FAILED';
    throw error;
}

function has(source, pattern, message) {
    if (!pattern.test(source)) fail(message);
}

function countMatches(source, pattern) {
    return [...source.matchAll(pattern)].length;
}

function auditWhatsappTemplateMigration({ rootDir = ROOT } = {}) {
    const migrationPath = path.join(rootDir, 'database', 'migrations', MIGRATION_FILE);
    const source = fs.readFileSync(migrationPath, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'database', 'migration-manifest.json'), 'utf8'));
    const service = fs.readFileSync(path.join(rootDir, 'src', 'services', 'whatsapp-template-service.js'), 'utf8');
    const routes = fs.readFileSync(path.join(rootDir, 'src', 'routes', 'whatsapp-template.routes.js'), 'utf8');
    const tenantService = fs.readFileSync(path.join(rootDir, 'src', 'services', 'tenant-service.js'), 'utf8');
    const migrationGate = fs.readFileSync(path.join(rootDir, 'scripts', 'production-migration-gate.js'), 'utf8');
    const checksum = crypto.createHash('sha256').update(source).digest('hex');
    const findings = [];

    const sourceSafety = auditMigrationText(MIGRATION_FILE, source);
    if (sourceSafety.status !== 'PASS') findings.push(...sourceSafety.findings.map((finding) => finding.code));
    const entry = manifest.migrations?.[MIGRATION_FILE];
    if (!entry || entry.version !== '034' || entry.checksum !== checksum) findings.push('MANIFEST_CHECKSUM_MISMATCH');

    has(source, /IF\s+OBJECT_ID\(N'dbo\.whatsapp_message_templates',\s*N'U'\)\s+IS\s+NULL[\s\S]*?CREATE\s+TABLE\s+dbo\.whatsapp_message_templates/i, 'System table is not guarded by OBJECT_ID.');
    has(source, /IF\s+OBJECT_ID\(N'dbo\.gym_whatsapp_template_overrides',\s*N'U'\)\s+IS\s+NULL[\s\S]*?CREATE\s+TABLE\s+dbo\.gym_whatsapp_template_overrides/i, 'Tenant override table is not guarded by OBJECT_ID.');
    has(source, /PK_whatsapp_message_templates\s+PRIMARY\s+KEY/i, 'System template key is not uniquely constrained.');
    has(source, /PK_gym_whatsapp_template_overrides\s+PRIMARY\s+KEY[\s\S]*?\(tenant_id,\s*template_id\)/i, 'Tenant override identity is not uniquely constrained by tenant and template.');
    has(source, /FK_gym_whatsapp_template_overrides_tenant[\s\S]*?ON\s+DELETE\s+NO\s+ACTION/i, 'Tenant deletion must not cascade into template overrides.');
    has(source, /FK_gym_whatsapp_template_overrides_template[\s\S]*?ON\s+DELETE\s+NO\s+ACTION/i, 'System default deletion must not cascade into overrides.');
    has(source, /CK_whatsapp_message_templates_body_nonempty/i, 'System defaults must not be empty.');
    has(source, /CK_gym_whatsapp_template_overrides_body_nonempty/i, 'Tenant overrides must not be empty.');

    const seededIds = TEMPLATE_IDS.filter((id) => new RegExp(`IF\\s+NOT\\s+EXISTS[\\s\\S]{0,220}FROM\\s+dbo\\.whatsapp_message_templates[\\s\\S]{0,160}template_id\\s*=\\s*'${id}'`, 'i').test(source));
    if (seededIds.length !== TEMPLATE_IDS.length) findings.push('SEED_GUARD_INCOMPLETE');
    if (countMatches(source, /INSERT\s+INTO\s+dbo\.whatsapp_message_templates/gi) !== TEMPLATE_IDS.length) findings.push('SEED_COUNT_UNEXPECTED');
    if (new Set(seededIds).size !== seededIds.length) findings.push('SEED_ID_DUPLICATE');

    const runtimeDdl = /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER|SCHEMA)\b|\bOBJECT_ID\s*\(/i;
    if (runtimeDdl.test(service) || runtimeDdl.test(routes)) findings.push('RUNTIME_DDL_PRESENT');
    has(tenantService, /'gym_whatsapp_template_overrides'/, 'Tenant override table is missing from the tenant/RLS registry.');
    has(migrationGate, /ensureTenantColumnsAndRls\(tenantId,\s*\{\s*executor:\s*transaction\s*\}\)/, 'Migration gate does not rebuild RLS in the migration transaction.');
    has(migrationGate, /MigrationId,ProductVersion/, 'Migration gate does not use the authoritative migration ledger.');
    has(migrationGate, /manifest.*safety|safety.*manifest/is, 'Migration gate does not use manifest safety metadata.');

    const systemClassification = getBackupClassification('whatsapp_message_templates');
    const overrideClassification = getBackupClassification('gym_whatsapp_template_overrides');
    if (systemClassification.scope !== 'platform-global' || systemClassification.artifact !== 'platform-disaster-recovery') findings.push('SYSTEM_BACKUP_SCOPE_INVALID');
    if (overrideClassification.scope !== 'tenant' || overrideClassification.artifact !== 'tenant-operational-recovery') findings.push('OVERRIDE_BACKUP_SCOPE_INVALID');
    if (!PLATFORM_GLOBAL_BACKUP_TABLES.some((item) => item.table === 'whatsapp_message_templates')) findings.push('SYSTEM_BACKUP_REGISTRY_MISSING');
    if (!TENANT_BACKUP_TABLES.some((item) => item.table === 'gym_whatsapp_template_overrides')) findings.push('OVERRIDE_BACKUP_REGISTRY_MISSING');

    return {
        status: findings.length ? 'FAIL' : 'PASS',
        migration: MIGRATION_FILE,
        checksum,
        idempotency: {
            guardedTables: true,
            guardedSeeds: seededIds.length === TEMPLATE_IDS.length,
            replayDoesNotDuplicateDefaults: seededIds.length === TEMPLATE_IDS.length && new Set(seededIds).size === TEMPLATE_IDS.length
        },
        duplicateConstraints: findings.includes('SEED_ID_DUPLICATE') ? 'FAIL' : 'PASS',
        deterministicSeed: seededIds.length === TEMPLATE_IDS.length ? 'PASS' : 'FAIL',
        defaultsSeeded: seededIds.length,
        backupClassification: { system: systemClassification, overrides: overrideClassification },
        runtimeDdl: runtimeDdl.test(service) || runtimeDdl.test(routes) ? 'FAIL' : 'NONE',
        migrationLedger: /MigrationId,ProductVersion/.test(migrationGate) ? 'PASS' : 'FAIL',
        findings
    };
}

if (require.main === module) {
    const report = auditWhatsappTemplateMigration();
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exitCode = report.status === 'PASS' ? 0 : 1;
}

module.exports = { MIGRATION_FILE, TEMPLATE_IDS, auditWhatsappTemplateMigration };
