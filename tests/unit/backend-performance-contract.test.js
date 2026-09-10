'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('branch bootstrap loads independent branch sections concurrently', () => {
    const source = read('src/services/branch-service.js');
    assert.match(source, /const sectionsByBranch = await Promise\.all\(/u);
    assert.match(source, /branches\.map\(\(branch\) => getSectionsForAuthorizedBranch\(branch\)\)/u);
    assert.match(source, /async function getSectionsForAuthorizedBranch\(branch/u);
    assert.match(source, /async function bootstrap\(\{ userId = null, role = null, readOnly = false, tenantType = null \} = \{\}\)/u);
    assert.match(source, /getEffectiveEntitlements\(tenantId\(\), null, \{ readOnly, tenantType \}\)/u);
    assert.match(source, /const sections = sectionsByBranch\.flat\(\);/u);
});

test('allowed branches are filtered server-side with tenant and user access predicates', () => {
    const source = read('src/services/branch-service.js');
    assert.match(source, /FROM dbo\.gym_branches AS b[\s\S]*?b\.tenant_id=@tenantId/u);
    assert.match(source, /@isOwner=1 OR EXISTS \([\s\S]*?a\.tenant_id=b\.tenant_id[\s\S]*?a\.user_id=@userId/u);
    assert.doesNotMatch(source, /const allowed = new Set\(/u);
});

test('empty member attendance status lists return before database setup', () => {
    const source = read('src/services/attendance-service.js');
    assert.match(source, /const ids = \[\.\.\.new Set\(memberIds\.map[\s\S]*?if \(!ids\.length\) return new Map\(\);[\s\S]*?ensureAttendanceTable/u);
});

test('reports use a summary-only dashboard query instead of hydrating dashboard alerts', () => {
    const source = read('src/services/report-service.js');
    assert.match(source, /getDashboardSummary/u);
    assert.match(source, /alertsCount: Number\(dashboard\.alertsCount \|\| 0\)/u);
    assert.doesNotMatch(source, /getDashboard\(/u);
});

test('member lists reuse portal-code previews without a per-member hydration fan-out', () => {
    const appSource = read('public/js/app.js');
    const paginationSource = read('public/js/pagination.js');

    assert.match(appSource, /membershipCode/u);
    assert.doesNotMatch(appSource, /hydrateMemberPortalCodes/u);
    assert.doesNotMatch(paginationSource, /hydrateMemberPortalCodes/u);
});

test('member repository keeps the reusable CTE scoped to the following statement', () => {
    const source = read('src/repositories/member.repository.js');
    assert.match(source, /const MEMBER_CTE = MEMBER_ROWS_CTE;/u);
    assert.match(source, /\.query\(`\$\{MEMBER_CTE\}[\s\S]*?FROM member_rows[\s\S]*?WHERE id = @id/u);
});

test('member list includes profile-only members without manufacturing a subscription', () => {
    const source = read('src/repositories/member.repository.js');
    const listStart = source.indexOf('async function list(');
    const listBody = source.slice(listStart);
    assert.doesNotMatch(listBody, /AND membershipId IS NOT NULL/u);
});

test('pricing catalog uses one SQL batch for uncached lookups', () => {
    const source = read('src/services/member-service.js');
    const block = source.slice(source.indexOf('async function getPricingCatalog'), source.indexOf('\nfunction invalidatePricingCatalog'));
    assert.match(block, /await pool\.request\(\)\.batch\(/u);
    assert.doesNotMatch(block, /queryFactories|Promise\.all\(queryFactories/u);
});

test('branch context reuses an already-authorized branch for section reads', () => {
    const source = read('src/branches/branch-context.js');
    assert.match(source, /authorizedBranch: branch/u);
    assert.match(source, /authorizedBranch: branches\[0\]/u);
});
