'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const serviceSource = fs.readFileSync(path.join(root, 'src/services/member-service.js'), 'utf8');
const detailsUiSource = fs.readFileSync(path.join(root, 'public/js/member-details-ui.js'), 'utf8');
const printSource = fs.readFileSync(path.join(root, 'public/js/integrations/print-enhancements.js'), 'utf8');
const printCss = fs.readFileSync(path.join(root, 'public/css/pages/memberships.css'), 'utf8');

test('member details read membership branch and section scope tenant-safely', () => {
    const detailsStart = serviceSource.indexOf('async function getMemberDetails');
    const detailsEnd = serviceSource.indexOf('module.exports', detailsStart);
    const details = serviceSource.slice(detailsStart, detailsEnd);

    assert.match(details, /currentTenantId\(\{ required: true \}\)/u);
    assert.match(details, /gym_membership_branch_access/u);
    assert.match(details, /gym_membership_section_access/u);
    assert.match(details, /access\.tenant_id = @tenantId/u);
    assert.match(details, /membership\.member_id = @memberId/u);
    assert.match(details, /scope: \{/u);
    assert.match(details, /branches: membershipScopes\.get\(membershipId\)\?\.branches/u);
    assert.match(details, /sections: membershipScopes\.get\(membershipId\)\?\.sections/u);
});

test('member details expose only the masked portal code and tenant-scoped portal URL', () => {
    assert.match(serviceSource, /membershipCodePortalUrl: membershipCode\.active[\s\S]*?getPortalUrl\('', memberRow\.tenant_slug\)/u);
    assert.match(detailsUiSource, /membershipCode\?\.maskedCode/u);
    assert.match(detailsUiSource, /membershipCodePortalUrl/u);
    assert.match(printSource, /member\.membershipCode\?\.maskedCode/u);
    assert.doesNotMatch(printSource, /member\.membershipCode\?\.membershipCode/u);
});

test('details and print surfaces render branch, section, and portal access information', () => {
    assert.match(detailsUiSource, /member-scope-details/u);
    assert.match(detailsUiSource, /scope\.branches/u);
    assert.match(detailsUiSource, /scope\.sections/u);
    assert.match(printSource, /membershipAccessInfo/u);
    assert.match(printSource, /scopeNames\(membershipScope\.branches\)/u);
    assert.match(printSource, /scopeNames\(membershipScope\.sections\)/u);
    assert.match(printSource, /membershipCodePortalUrl/u);
    assert.match(printCss, /member-scope-grid/u);
});
