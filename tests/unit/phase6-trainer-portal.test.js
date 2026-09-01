'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('database/migrations/019-trainer-portal-foundation.sql');
const portalService = read('src/services/member-portal-service.js');
const codeService = read('src/services/membership-code-service.js');
const trainerService = read('src/services/trainer-service.js');
const routes = read('src/routes/trainer.routes.js');
const portalScript = read('public/js/member-portal.js');
const portalHtml = read('public/member-portal.html');

test('Trainer portal reuses the existing member portal and keeps audit rows tenant scoped', () => {
    assert.match(migration, /gym_membership_code_audit/i);
    assert.match(migration, /ADD tenant_id INT NULL/i);
    assert.match(migration, /SET tenant_id = member\.tenant_id/i);
    assert.match(migration, /FK_gym_membership_code_audit_tenant/i);
    assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX)/i);
    assert.match(portalService, /portalMode: 'trainer_client'/);
    assert.match(portalService, /trainerPortalSnapshot/);
    assert.match(portalService, /trainerCommerceService\.listPurchases/);
    assert.match(portalService, /trainerCommerceService\.listSessions/);
    assert.match(portalService, /trainerCommerceService\.listPayments/);
    assert.match(portalService, /PORTAL_FEATURE_UNAVAILABLE/);
});

test('Trainer client portal access uses the existing secure membership-code capability', () => {
    assert.match(trainerService, /membershipCodeService\.issueForMember/);
    assert.match(trainerService, /getClientPortalAccess/);
    assert.match(routes, /\/api\/trainer\/clients\/:id\/portal-access/);
    assert.match(codeService, /tenant_type/);
    assert.match(portalScript, /data\?\.portalMode === 'trainer_client'/);
    assert.match(portalHtml, /portalTrainerOverview/);
});

test('Trainer portal does not expose the gym membership catalog or occupancy flow', () => {
    assert.match(portalService, /paymentMethods: \[\]/);
    assert.match(portalService, /plans: \[\], types: \[\], prices: \{\}/);
    assert.match(portalScript, /data\?\.portalMode !== 'trainer_client'/);
    assert.match(portalScript, /trainerTool\.hidden = true/);
    assert.match(portalScript, /trainerOverviewContent/);
});
