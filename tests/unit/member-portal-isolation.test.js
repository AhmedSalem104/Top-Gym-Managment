'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const membershipCodeService = require('../../src/services/membership-code-service');

const root = path.resolve(__dirname, '../..');
const membershipCodeServiceSource = fs.readFileSync(path.join(root, 'src/services/membership-code-service.js'), 'utf8');
const portalServiceSource = fs.readFileSync(path.join(root, 'src/services/member-portal-service.js'), 'utf8');
const feedbackServiceSource = fs.readFileSync(path.join(root, 'src/services/member-feedback-service.js'), 'utf8');
const portalUiSource = fs.readFileSync(path.join(root, 'public/js/member-portal.js'), 'utf8');
const portalHtmlSource = fs.readFileSync(path.join(root, 'public/member-portal.html'), 'utf8');
const brandingUiSource = fs.readFileSync(path.join(root, 'public/js/branding.js'), 'utf8');

test('member portal links can be pinned to a tenant without exposing the membership code', () => {
    assert.equal(
        membershipCodeService.getPortalUrl('https://logicfit.example', 'Power-Gym'),
        'https://logicfit.example/member-portal?tenant=power-gym'
    );
    assert.doesNotMatch(membershipCodeService.getPortalUrl('https://logicfit.example', 'power gym'), /power%20gym/);
    assert.doesNotMatch(membershipCodeService.getPortalUrl('https://logicfit.example', 'power-gym'), /TG-|membershipCode/i);
});

test('portal reads are scoped to the member-code tenant before returning report data', () => {
    assert.match(portalServiceSource, /findMemberContextByCode\(code, \{ request \}\)/);
    assert.match(portalServiceSource, /runTenantContext\(\{ tenantId: memberContext\.tenantId, mode: 'public'/);
    assert.match(portalServiceSource, /tenant:\s*\{\s*name: memberContext\.tenantName/);
    assert.match(feedbackServiceSource, /findMemberContextByCode\(membershipCode, \{ request \}\)/);
    assert.match(feedbackServiceSource, /runTenantContext\(\{ tenantId: memberContext\.tenantId, mode: 'public'/);
});

test('membership-code reads stay read-only and audit writes carry the active tenant explicitly', () => {
    assert.match(membershipCodeServiceSource, /ensureMembershipCodeStorage\(\{ readOnly: true \}\)/);
    assert.match(membershipCodeServiceSource, /currentTenantId\(\{ required: true \}\)/);
    assert.match(membershipCodeServiceSource, /tenant_id = @tenantId AND id IN/);
    assert.match(membershipCodeServiceSource, /INSERT INTO dbo\.gym_membership_code_audit \(tenant_id, member_id, action/);
});

test('member portal UI keeps one member record and each ledger row isolated on small screens', () => {
    assert.match(portalUiSource, /portal-membership-overview/);
    assert.match(portalUiSource, /portal-membership-history/);
    assert.match(portalUiSource, /data-label="\$\{escapeHtml\(label\)\}/);
    assert.match(portalUiSource, /resetOnFailure: true/);
});

test('public portal starts with platform branding and switches safely to the resolved gym branding', () => {
    assert.match(portalHtmlSource, /<body class="member-portal-page" data-branding-entry="saas">/);
    assert.match(portalUiSource, /await applyPortalTenant\(data\.tenant\)/);
    assert.match(portalUiSource, /scope: 'platform'/);
    assert.match(portalUiSource, /applyTenantBrandingFallback/);
    assert.match(brandingUiSource, /let refreshSequence = 0/);
});
