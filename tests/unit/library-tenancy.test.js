'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('repository library fixtures contain the complete baseline catalog', () => {
    assert.equal(JSON.parse(read('data/library/muscles.json')).length, 297);
    assert.equal(JSON.parse(read('data/library/foods.json')).length, 367);
    assert.equal(JSON.parse(read('data/library/exercises.json')).length, 873);
});

test('library provisioning resolves the tracked root catalog in serverless deployments', () => {
    const library = read('src/services/library-service.js');
    assert.match(library, /const DATA_DIRECTORY = path\.join\(__dirname, '..', '..', 'data', 'library'\)/);
    for (const type of ['muscles', 'foods', 'exercises']) {
        assert.equal(fs.existsSync(path.join(ROOT, 'data', 'library', `${type}.json`)), true);
    }
});

test('library provisioning is tenant keyed and writes tenant scoped catalog rows', () => {
    const library = read('src/services/library-service.js');
    assert.match(library, /const librarySeedPromises = new Map()/);
    assert.doesNotMatch(library, /\blet librarySeedPromise\b/);
    assert.match(library, /currentTenantId\(\{ required: true \}\)/);
    assert.match(library, /WITH \(UPDLOCK, HOLDLOCK\)/);
    assert.match(library, /tenant_id=@tenantId/);
    assert.match(library, /INSERT INTO dbo\.gym_muscles \(tenant_id,/);
    assert.match(library, /INSERT INTO dbo\.gym_foods\s+\(tenant_id,/);
    assert.match(library, /INSERT INTO dbo\.gym_exercises\s+\(tenant_id,/);
    assert.match(library, /target\.tenant_id=@tenantId AND target\.source_id/);
});

test('library source identities are unique per tenant, not globally', () => {
    const tenantService = read('src/services/tenant-service.js');
    assert.match(tenantService, /async function ensureLibrarySourceKeys\(pool, tables\)/);
    assert.match(tenantService, /UQ_gym_muscles_tenant_source/);
    assert.match(tenantService, /UQ_gym_foods_tenant_source/);
    assert.match(tenantService, /UQ_gym_exercises_tenant_source/);
    assert.match(tenantService, /ON dbo\.\[\$\{table\}\]\(tenant_id, source_id\)/);
    assert.match(tenantService, /await ensureLibrarySourceKeys\(pool, tables\)/);
    assert.doesNotMatch(read('database/schema.sql'), /UQ_gym_(?:muscles|foods|exercises)_source UNIQUE/);
});

test('tenant onboarding provisions the catalog before its transaction commits', () => {
    const saas = read('src/services/saas-service.js');
    assert.match(saas, /await withTransaction\(async \(transaction\) => \{/);
    assert.match(saas, /runTenantContext\(\{ mode: 'tenant', tenantId: id \}, \(\) => libraryService\.ensureLibraryData\(\{ transaction \}\)\)/);
    assert.match(saas, /recordAudit\(\{ tenantId: id,[\s\S]*executor: transaction \}\)/);
    const bootstrap = saas.slice(saas.indexOf('async function ensureBootstrapSubscription'), saas.indexOf('async function listTenantRequests'));
    assert.doesNotMatch(bootstrap, /runTenantContext\(\{ mode: 'tenant', tenantId \}, \(\) => libraryService\.ensureLibraryData\(\{ transaction \}\)\)/);
    const onboarding = saas.slice(saas.indexOf('async function createTenantWithOwner'), saas.indexOf('function booleanValue'));
    assert.match(saas, /async function provisionTenantWithOwner\(\{/);
    assert.match(saas, /await runTenantContext\(\{ mode: 'tenant', tenantId \}, \(\) => libraryService\.ensureLibraryData\(\{ transaction: activeTransaction \}\)\)/);
    assert.match(saas, /if \(transaction\) await work\(transaction\);\s*else await withTransaction\(work\);/);
    assert.match(onboarding, /const result = await provisionTenantWithOwner\(\{ body, actorUserId, authService \}\);/);
    const server = read('server.js');
    assert.match(server, /ensureCoachingTables\(\{ seedLibrary: false \}\)/);
    assert.match(server, /ensureTenantColumnsAndRls\(bootstrapTenant\.id\)[\s\S]*ensureLibraryData\(\)/);
});

test('public portal library responses are not CDN-shared across tenants', () => {
    const portal = read('src/controllers/member-portal.controller.js');
    assert.ok((portal.match(/Cache-Control', 'private, no-store/g) || []).length >= 4);
    assert.doesNotMatch(portal, /library(?:Options|Collection|Item)[\s\S]{0,500}public, max-age/);
});

test('repair command requires an explicit safe target and tenant scope', () => {
    const repair = read('scripts/repair-tenant-library.js');
    assert.match(repair, /assertSafeDatabaseTarget/);
    assert.match(repair, /LIBRARY_REPAIR_ALL/);
    assert.match(repair, /runTenantContext\(\{ mode: 'tenant', tenantId \}/);
    assert.match(repair, /for \(const tenantId of tenantIds\)/);
});
