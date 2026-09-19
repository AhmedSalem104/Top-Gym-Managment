'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('membership type delete is owner-protected and exposed through the pricing route', () => {
    const routes = read('src/routes/pricing.routes.js');
    const controller = read('src/controllers/pricing.controller.js');
    const permissions = read('src/permissions/route-permissions.js');

    assert.match(routes, /app\.delete\('\/api\/membership-types\/:typeCode'/);
    assert.match(controller, /deleteMembershipType\(request\.params\.typeCode\)/);
    assert.ok(permissions.includes("{ pattern: /^\\/membership-types\\/[^/]+$/, methods: ['DELETE'], ownerOnly: true, all: [PERMISSIONS.PRICING_UPDATE] }"));
});

test('membership type delete preserves core types and historical memberships', () => {
    const service = read('src/services/member-service.js');

    assert.match(service, /async function deleteMembershipType\(typeCodeValue\)/);
    assert.match(service, /DEFAULT_MEMBERSHIP_TYPES, typeCode/);
    assert.match(service, /MEMBERSHIP_TYPE_SYSTEM_TYPE/);
    assert.match(service, /COUNT_BIG\(1\).*FROM dbo\.memberships/s);
    assert.match(service, /MEMBERSHIP_TYPE_IN_USE/);
    assert.match(service, /DELETE FROM dbo\.membership_type_prices/);
    assert.match(service, /DELETE FROM dbo\.membership_types/);
    assert.match(service, /deleteMembershipType,/);
});

test('membership types management renders delete action and keeps it on responsive cards', () => {
    const app = read('public/js/app.js');
    const cards = read('public/js/pricing-cards.js');
    const styles = read('public/css/pages/memberships.css');
    const index = read('public/index.html');
    const bootstrap = read('public/js/app-shell-bootstrap.js');

    assert.match(app, /data-type-action="delete"/);
    assert.match(app, /confirmMembershipTypeDelete/);
    assert.match(app, /api\('\/api\/membership-types\/' \+ encodeURIComponent\(code\), \{ method: 'DELETE' \}\)/);
    assert.match(cards, /data-type-action="delete"/);
    assert.match(styles, /\.type-delete-button/);
    assert.match(index, /feature-manifest\.js\?v=membership-type-delete-v1/);
    assert.match(index, /app-shell-bootstrap\.js\?v=membership-type-delete-v1/);
    assert.match(bootstrap, /app\.js\?v=membership-type-delete-v1/);
});
