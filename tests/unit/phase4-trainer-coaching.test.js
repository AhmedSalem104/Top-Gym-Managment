'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const migration = read('database/migrations/017-trainer-client-profile.sql');
const trainerService = read('src/services/trainer-service.js');
const trainerRoutes = read('src/routes/trainer.routes.js');
const trainerController = read('src/controllers/trainer.controller.js');
const workspace = read('public/trainer-workspace.html');
const workspaceScript = read('public/js/trainer-workspace.js');
const workspaceStyle = read('public/css/pages/trainer-workspace.css');
const routePermissions = read('src/permissions/route-permissions.js');
const routeIndex = read('src/routes/index.js');

test('Trainer clients reuse the tenant-scoped members identity without a duplicate table', () => {
    assert.match(migration, /OBJECT_ID\(N'dbo\.members', N'U'\)/i);
    assert.match(migration, /ALTER TABLE dbo\.members ADD primary_goal/i);
    assert.match(migration, /ALTER TABLE dbo\.members ADD profile_status/i);
    assert.match(migration, /CK_members_profile_status/i);
    assert.match(migration, /IX_members_profile_status/i);
    assert.doesNotMatch(migration, /CREATE TABLE\s+dbo\.(?:trainer_)?clients/i);
    assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
    assert.match(trainerService, /coachingService\.createExternalTrainee/);
    assert.match(trainerService, /FROM dbo\.members/);
    assert.match(trainerService, /memberService\.deleteMember/);
});

test('Trainer routes are isolated by persisted tenant type and use existing auth context', () => {
    assert.match(trainerRoutes, /request\.tenant\?\.tenantType !== TENANT_TYPES\.INDEPENDENT_TRAINER/);
    assert.match(trainerRoutes, /TRAINER_ROUTE_NOT_FOUND/);
    assert.match(trainerRoutes, /\/api\/trainer\/clients/);
    assert.match(trainerRoutes, /\/api\/trainer\/clients\/:id\/measurements/);
    assert.match(trainerRoutes, /\/api\/trainer\/clients\/:id\/checkins/);
    assert.match(trainerRoutes, /\/api\/trainer\/training-plans/);
    assert.match(trainerRoutes, /\/api\/trainer\/nutrition-plans/);
    assert.match(routeIndex, /registerTrainerRoutes\(app, \{ trainerService, trainerCommerceService, trainerStudioService, asyncRoute \}\)/);
    assert.match(routePermissions, /trainer\\\/clients/);
    assert.ok(routePermissions.includes('training-plans|nutrition-plans'));
});

test('Trainer service applies tenant and client guards before profile/coaching operations', () => {
    assert.match(trainerService, /currentTenantId\(\{ required: true \}\)/);
    assert.match(trainerService, /resolveTenantType\(tenant\.tenant_type\)/);
    assert.match(trainerService, /TENANT_TYPES\.INDEPENDENT_TRAINER/);
    assert.match(trainerService, /assertTrainerClient\(memberIdValue/);
    assert.match(trainerService, /WHERE id=@memberId/);
    assert.match(trainerService, /primary_goal, profile_status/);
    assert.match(trainerController, /trainerService\.createClient/);
    assert.match(trainerController, /trainerService\.getClient/);
});

test('Trainer workspace uses real API metrics and gives no fake operational data', () => {
    assert.match(workspace, /data-trainer-workspace="phase6"/);
    assert.match(workspaceScript, /\/api\/trainer\/workspace/);
    assert.match(workspaceScript, /\/api\/trainer\/clients/);
    assert.match(workspaceScript, /method: 'POST'/);
    assert.match(workspaceScript, /method: 'PATCH'/);
    assert.match(workspaceScript, /\/api\/trainer\/clients/);
    assert.match(workspaceScript, /escapeHtml/);
    assert.match(workspaceScript, /mustChangePassword/);
    assert.match(workspace, /id="trainerMetricClients"/);
    assert.doesNotMatch(workspaceScript, /fake|mock|demo/i);
    assert.match(workspaceStyle, /@media \(max-width: 480px\)/);
    assert.match(workspaceStyle, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Trainer commercial routes remain explicit and phase-owned', () => {
    const capabilityService = read('src/services/capability-service.js');
    assert.match(capabilityService, /'clients', 'coaching', 'nutrition'/);
    assert.match(capabilityService, /'sessions', 'packages', 'payments'/);
    assert.match(capabilityService, /'portal'/);
    assert.match(capabilityService, /IMPLEMENTED_CAPABILITIES_BY_TENANT_TYPE/);
});
