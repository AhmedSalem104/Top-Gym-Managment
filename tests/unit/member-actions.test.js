'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/app.js'), 'utf8');

test('member actions restore the conditional freeze row flow', () => {
    const rowStart = source.indexOf('function memberTableRow(member)');
    const rowEnd = source.indexOf('function renderMembers()', rowStart);
    assert.ok(rowStart >= 0 && rowEnd > rowStart, 'member row renderer must remain discoverable');

    const rowSource = source.slice(rowStart, rowEnd);
    assert.doesNotMatch(rowSource, /const freezeUnavailable\s*=/u);
    assert.match(rowSource, /actionButton\(\s*'freeze',\s*member\.id/u);
    assert.match(rowSource, /const membershipStatus\s*=\s*String\(sub\.status \|\| ''\)\.toLowerCase\(\)/u);
    assert.match(rowSource, /const canFreeze\s*=\s*\['active', 'expiring_soon'\]\.includes\(membershipStatus\)/u);
    assert.match(rowSource, /membershipStatus === 'frozen'/u);
    assert.match(rowSource, /: ''/u);
    assert.match(source, /querySelectorAll\('\[data-action="freeze"\], \[data-action="payment"\]'\)/u);
    assert.match(source, /if \(action === 'freeze' \|\| action === 'renew' \|\| action === 'payment'\)/u);
});

test('member deletion releases nullable NO ACTION references atomically before the existing delete', () => {
    const service = fs.readFileSync(path.join(__dirname, '../../src/services/member-service.js'), 'utf8');
    const start = service.indexOf('async function deleteMember');
    const end = service.indexOf('async function activateMembership', start);
    assert.ok(start >= 0 && end > start, 'deleteMember must remain discoverable');
    const deletion = service.slice(start, end);
    assert.match(deletion, /UPDATE dbo\.gym_store_customers[\s\S]*SET member_id = NULL/u);
    assert.match(deletion, /UPDATE dbo\.gym_trainer_tasks[\s\S]*SET member_id = NULL/u);
    assert.match(deletion, /UPDATE dbo\.saas_notifications[\s\S]*SET recipient_member_id = NULL/u);
    assert.match(deletion, /UPDATE events[\s\S]*SET membership_id = NULL/u);
    assert.match(deletion, /DELETE FROM dbo\.members WHERE id = @id/u);
    assert.match(deletion, /withTransaction\(async \(transaction\)/u);
    assert.match(deletion, /MEMBER_DELETE_BLOCKED_BY_DATA/u);
    assert.match(deletion, /Number\(error\?\.number\) === 547/u);
});
