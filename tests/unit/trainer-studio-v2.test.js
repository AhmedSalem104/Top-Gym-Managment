'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Trainer Studio V2 has a dedicated route shell and no Gym navigation dependency', () => {
    const html = read('public/trainer-workspace.html');
    const script = read('public/js/trainer-studio-v2.js');
    assert.match(html, /trainer-studio-v2\.css/);
    assert.match(html, /trainer-studio-v2\.js/);
    assert.match(script, /trainerStudioSidebar/);
    assert.match(script, /trainer-workspace\/\$\{route\}/);
    assert.doesNotMatch(script, /api\/dashboard/);
    assert.doesNotMatch(script, /api\/branches/);
    assert.doesNotMatch(script, /api\/attendance/);
});

test('Trainer Studio V2 exposes only data-backed trainer routes and keeps explicit gaps documented', () => {
    const script = read('public/js/trainer-studio-v2.js');
    const inventory = read('docs/TRAINER-STUDIO-V2-INVENTORY.md');
    for (const route of ['clients', 'calendar', 'sessions', 'training', 'nutrition', 'exercises', 'measurements', 'progress', 'checkins', 'goals', 'packages', 'sales', 'renewals', 'finance', 'reports', 'notifications', 'tasks', 'portal', 'templates', 'settings']) {
        assert.match(script, new RegExp(`['"]${route}['"]`));
    }
    assert.match(inventory, /Trainer client online payment \| MISSING/);
    assert.match(inventory, /Goals \| API \/ UI EXISTS/);
    assert.match(inventory, /Notifications \| DERIVED \/ UI EXTENDED/);
    assert.match(inventory, /Templates \| API \/ UI EXISTS/);
    assert.match(script, /api\/trainer\/training-plans/);
    assert.match(script, /api\/trainer\/nutrition-plans/);
    assert.match(script, /data-studio-open-editor/);
    assert.match(script, /data-studio-open-client=.*item\.clientId/);
});

test('trainer plan write actions stay behind the trainer route and ownership checks', () => {
    const routes = read('src/routes/trainer.routes.js');
    const controller = read('src/controllers/trainer.controller.js');
    const service = read('src/services/trainer-service.js');
    assert.match(routes, /training-plans\/:id\/status/);
    assert.match(routes, /nutrition-plans\/:id\/status/);
    assert.match(controller, /setTrainingPlanStatus/);
    assert.match(controller, /setNutritionPlanStatus/);
    assert.match(service, /async function setTrainingPlanStatus[\s\S]*?assertOwnedCoachingPlan/);
    assert.match(service, /async function setNutritionPlanStatus[\s\S]*?assertOwnedCoachingPlan/);
});

test('Trainer server deep links remain behind the existing authenticated tenant guard', () => {
    const server = read('server.js');
    assert.match(server, /app\.get\(\['\/trainer-workspace', '\/trainer-workspace\/', '\/trainer-workspace\/:view'/);
    assert.match(server, /if \(user\.mustChangePassword\) return response\.redirect\('\/change-password'\)/);
    assert.match(server, /normalizedTenantType\(user\) !== 'independent_trainer'/);
});

test('Trainer Studio goals and templates are additive, tenant-scoped and exposed through guarded APIs', () => {
    const migration = read('database/migrations/027-trainer-studio-goals-templates.sql');
    const service = read('src/services/trainer-studio-service.js');
    const routes = read('src/routes/trainer.routes.js');
    const permissions = read('src/permissions/route-permissions.js');
    const registry = read('src/services/tenant-service.js');
    assert.match(migration, /CREATE TABLE dbo\.gym_trainer_goals/);
    assert.match(migration, /CREATE TABLE dbo\.gym_trainer_templates/);
    assert.match(migration, /tenant_id INT NOT NULL/);
    assert.match(migration, /FK_gym_trainer_goals_tenant/);
    assert.match(migration, /CK_gym_trainer_templates_json/);
    assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
    assert.match(service, /trainerService\.assertTrainerTenant/);
    assert.match(service, /WHERE tenant_id=@tenantId/);
    assert.match(service, /idempotency_key_hash/);
    assert.match(routes, /\/api\/trainer\/goals/);
    assert.match(routes, /\/api\/trainer\/templates/);
    assert.match(routes, /\/api\/trainer\/notifications/);
    assert.match(routes, /\/api\/trainer\/tasks/);
    assert.match(permissions, /trainer\\\/goals/);
    assert.match(permissions, /trainer\\\/templates/);
    assert.match(registry, /'gym_trainer_goals'/);
    assert.match(registry, /'gym_trainer_templates'/);
    assert.match(registry, /'gym_trainer_tasks'/);
});

test('Trainer action center is additive, tenant-scoped and idempotent', () => {
    const migration = read('database/migrations/028-trainer-action-center.sql');
    const service = read('src/services/trainer-studio-service.js');
    const routes = read('src/routes/trainer.routes.js');
    assert.match(migration, /CREATE TABLE dbo\.gym_trainer_tasks/);
    assert.match(migration, /tenant_id INT NOT NULL/);
    assert.match(migration, /FK_gym_trainer_tasks_tenant/);
    assert.match(migration, /UX_gym_trainer_tasks_idempotency/);
    assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
    assert.match(service, /async function listTasks/);
    assert.match(service, /async function createTask/);
    assert.match(service, /async function updateTask/);
    assert.match(service, /WHERE tenant_id=@tenantId/);
    assert.match(routes, /\/api\/trainer\/tasks/);
});
