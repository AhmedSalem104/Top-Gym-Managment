'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { resolveAssistantBranchIds } = require('../../src/branches/assistant-branch-scope');

const ACTIVE = [
    { id: 12, isMain: false },
    { id: 8, isMain: true },
    { id: 15, isMain: false }
];

test('legacy assistant creation without branchIds receives the active main branch', () => {
    assert.deepEqual(resolveAssistantBranchIds(undefined, ACTIVE), [8]);
});

test('legacy assistant creation falls back to the first active branch if there is no main branch', () => {
    assert.deepEqual(resolveAssistantBranchIds(undefined, [{ id: 12 }, { id: 15 }]), [12]);
});

test('owner-selected active branches are preserved as a unique selection', () => {
    assert.deepEqual(resolveAssistantBranchIds(['12', 15], ACTIVE), [12, 15]);
});

test('empty, malformed, duplicate, and out-of-scope branch selections fail closed', () => {
    for (const [input, code] of [
        [[], 'ASSISTANT_BRANCH_REQUIRED'],
        ['12', 'ASSISTANT_BRANCH_REQUIRED'],
        [[0], 'BRANCH_SCOPE_INVALID'],
        [[12.5], 'BRANCH_SCOPE_INVALID'],
        [[12, 12], 'BRANCH_SCOPE_INVALID'],
        [[999], 'BRANCH_SCOPE_INVALID']
    ]) {
        assert.throws(() => resolveAssistantBranchIds(input, ACTIVE), (error) => error.code === code);
    }
});

test('a Gym without active branches cannot receive a branchless new assistant', () => {
    assert.throws(() => resolveAssistantBranchIds(undefined, []), (error) => error.code === 'ACTIVE_BRANCH_REQUIRED');
});

test('assistant account, tenant membership, permission defaults, and initial branch links share one transaction', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../src/services/auth-service.js'), 'utf8');
    const start = source.indexOf('async function createAssistant(');
    const end = source.indexOf('\nasync function updateUser(', start);
    const implementation = source.slice(start, end);
    assert.match(implementation, /await withTransaction\(async \(transaction\)/);
    assert.match(implementation, /resolveAssistantBranchIds\(body\.branchIds, activeBranchResult\.recordset/);
    assert.match(implementation, /userRepository\.createAssistant\([^;]+transaction\)/);
    assert.match(implementation, /assignUserToTenant\([^;]+executor: transaction/);
    assert.match(implementation, /seedAssistantPermissions\([^;]+executor: transaction/);
    assert.match(implementation, /INSERT INTO dbo\.gym_branch_user_access[\s\S]+?VALUES \(@tenantId,@branchId,@userId,@actorUserId\)/);
    assert.match(implementation, /recordAudit\([\s\S]+?executor: transaction/);
});
