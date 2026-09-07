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
    assert.match(source, /branches\.map\(\(branch\) => getBranchSections\(branch\.id, \{ userId, role \}\)\)/u);
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
