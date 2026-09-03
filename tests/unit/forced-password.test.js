'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('forced first-login password flow is server-enforced and additive', () => {
    const auth = read('src/services/auth-service.js');
    const middleware = read('src/middleware/auth.middleware.js');
    const routes = read('src/routes/auth.routes.js');
    const migration = read('database/migrations/013-phase0-security-preconditions.sql');

    assert.match(auth, /must_change_password BIT NOT NULL/);
    assert.match(auth, /password_changed_at DATETIME2\(0\)/);
    assert.match(auth, /crypto.randomBytes/);
    assert.match(auth, /async function changePassword/);
    assert.match(auth, /must_change_password=0/);
    assert.match(auth, /password_changed_at=SYSUTCDATETIME\(\)/);
    assert.match(auth, /sessionRepository\.revokeForUser\(normalizedUserId, transaction\)/);
    assert.match(auth, /PASSWORD_CHANGE_NOT_REQUIRED/);
    assert.match(middleware, /if \(user\.mustChangePassword\)/);
    assert.match(middleware, /PASSWORD_CHANGE_REQUIRED/);
    assert.match(routes, /app\.post\('\/api\/auth\/change-password'/);
    assert.match(migration, /IF COL_LENGTH\(N'dbo\.gym_users', N'must_change_password'\) IS NULL/);
    assert.match(migration, /IF COL_LENGTH\(N'dbo\.gym_users', N'password_changed_at'\) IS NULL/);
});

test('forced first-login screen releases the auth restoration veil', () => {
    const authUi = read('public/js/auth-ui.js');
    const app = read('public/js/app.js');
    const loader = read('public/js/feature-loader.js');
    const branches = read('public/js/branch-context.js');
    const dayPasses = read('public/js/day-passes.js');
    const start = authUi.indexOf('function showForcedPasswordChange');
    const end = authUi.indexOf('\n    function hasTenantWelcomeFlag', start);
    const block = authUi.slice(start, end);

    assert.notEqual(start, -1);
    assert.match(block, /classList\.remove\('auth-pending', 'top-gym-navigation-pending'\)/);
    assert.match(block, /classList\.add\('auth-locked'\)/);
    assert.match(block, /id = 'forcePasswordChangePanel'/);
    assert.match(app, /!window\.topGymAuth\?\.getUser\?\.\(\)\?\.mustChangePassword/);
    assert.match(loader, /!user\?\.mustChangePassword/);
    assert.match(branches, /if \(user\.mustChangePassword\)/);
    assert.match(dayPasses, /if \(!user \|\| user\.mustChangePassword\) return/);
});

test('temporary credential reset is tenant-scoped, transactional, and audit-safe', () => {
    const service = read('src/services/platform-admin-service.js');
    const start = service.indexOf('async function resetTenantUserPassword');
    const end = service.indexOf('\nasync function createOrChangeOwner', start);
    const block = service.slice(start, end);

    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    assert.match(block, /generateTemporaryPassword/);
    assert.match(block, /WITH \(UPDLOCK,HOLDLOCK\)/);
    assert.match(block, /ut\.tenant_id=@tenantId/);
    assert.match(block, /ut\.status='active'/);
    assert.match(block, /must_change_password=1/);
    assert.match(block, /sessionRepository\.revokeForUser\(user, transaction\)/);
    assert.match(block, /executor: transaction/);
    assert.match(block, /return \{ userId: user, temporaryPassword/);
    assert.doesNotMatch(block, /currentPassword/);
    const auditStart = block.indexOf('await saasService.recordAudit');
    const auditBlock = block.slice(auditStart, block.indexOf('});', auditStart) + 3);
    assert.doesNotMatch(auditBlock, /temporaryPassword/);
    assert.doesNotMatch(auditBlock, /passwordHash/);
    assert.match(read('src/controllers/platform-admin.controller.js'), /Cache-Control.*no-store/);
});

test('safe owner projections never include password hashes or temporary credentials', () => {
    const auth = read('src/services/auth-service.js');
    const platformClient = read('public/js/platform-admin.js');
    const safeUserStart = auth.indexOf('function safeUser(');
    const safeUserEnd = auth.indexOf('\n}\n\nconst TEMPORARY_PASSWORD_ALPHABET', safeUserStart);
    const safeUser = auth.slice(safeUserStart, safeUserEnd);
    assert.doesNotMatch(safeUser, /password_hash/);
    assert.doesNotMatch(safeUser, /temporaryPassword/);
    assert.match(platformClient, /showPasswordResetCredentials/);
    assert.match(platformClient, /temporaryPassword: result\?\.temporaryPassword/);
});

test('trainer onboarding is capability-driven and does not bootstrap Gym-only APIs', () => {
    const app = read('public/js/app.js');
    const loader = read('public/js/feature-loader.js');
    const authUi = read('public/js/auth-ui.js');
    assert.match(app, /authenticatedUser\.tenantType === 'independent_trainer'/);
    assert.match(loader, /tenantType \|\| ''\)\.toLowerCase\(\) !== 'independent_trainer'/);
    assert.match(loader, /isIndependentTrainer\(\) \|\| !dashboardIsRequested\(\)/);
    assert.match(authUi, /tenantType === 'independent_trainer'/);
    assert.match(authUi, /window\.location\.replace\('\/trainer-workspace'\)/);
    assert.match(read('public/js/trainer-workspace.js'), /\/api\/trainer\/workspace/);
    assert.doesNotMatch(read('public/js/trainer-workspace.js'), /\/api\/dashboard/);
    const saas = read('src/services/saas-service.js');
    assert.match(saas, /CAPABILITY_NOT_ENABLED/);
    assert.match(saas, /TENANT_CAPABILITY_FORBIDDEN/);
});

test('independent trainer owners cannot receive the Gym application navigation', () => {
    const permissions = read('public/js/core/permissions.js');
    const authUi = read('public/js/auth-ui.js');
    assert.match(permissions, /tenantType \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'independent_trainer'/);
    assert.match(permissions, /if \(String\(user\?\.tenantType \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'independent_trainer'\) return \[\]/);
    assert.match(authUi, /isIndependentTrainer = String\(user\?\.tenantType \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'independent_trainer'/);
    assert.match(authUi, /isOwner && !isIndependentTrainer/);
    assert.match(authUi, /managementPanel\.hidden = !isOwner \|\| isIndependentTrainer/);
});
