'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    BRANCH_STATUS,
    MEMBERSHIP_BRANCH_ACCESS_MODE,
    branchCapabilityEnabled,
    canAcceptNewOperations,
    normalizeBranchContext,
    normalizeBranchId,
    normalizeBranchStatus,
    normalizeMembershipBranchAccessMode
} = require('../../src/branches/branch-contract');
const { requestedBranchContext } = require('../../src/branches/branch-context');

test('branch contract normalizes IDs, statuses, and all-branch scope safely', () => {
    assert.equal(normalizeBranchId('7'), 7);
    assert.equal(normalizeBranchId('0'), null);
    assert.equal(normalizeBranchId('not-an-id'), null);
    assert.equal(normalizeBranchStatus('ARCHIVED'), BRANCH_STATUS.ARCHIVED);
    assert.equal(normalizeBranchStatus('unexpected'), BRANCH_STATUS.ACTIVE);
    assert.deepEqual(normalizeBranchContext({ allBranches: true, branchId: 7 }), { branchId: null, allBranches: true });
});

test('only active branches accept new operations', () => {
    assert.equal(canAcceptNewOperations(BRANCH_STATUS.ACTIVE), true);
    assert.equal(canAcceptNewOperations(BRANCH_STATUS.INACTIVE), false);
    assert.equal(canAcceptNewOperations(BRANCH_STATUS.ARCHIVED), false);
});

test('membership access defaults closed to one branch and accepts explicit modes', () => {
    assert.equal(normalizeMembershipBranchAccessMode(), MEMBERSHIP_BRANCH_ACCESS_MODE.SINGLE_BRANCH);
    assert.equal(normalizeMembershipBranchAccessMode('all_branches'), MEMBERSHIP_BRANCH_ACCESS_MODE.ALL_BRANCHES);
    assert.equal(normalizeMembershipBranchAccessMode('selected_branches'), MEMBERSHIP_BRANCH_ACCESS_MODE.SELECTED_BRANCHES);
    assert.equal(normalizeMembershipBranchAccessMode('anything_else'), MEMBERSHIP_BRANCH_ACCESS_MODE.SINGLE_BRANCH);
});

test('branch capability is Gym-only and server-side', () => {
    assert.equal(branchCapabilityEnabled({ tenantType: 'gym', capabilities: { branches: true } }), true);
    assert.equal(branchCapabilityEnabled({ tenantType: 'independent_trainer', capabilities: { branches: true } }), false);
    assert.equal(branchCapabilityEnabled({ tenantType: 'gym', capabilities: {} }), false);
});

test('branch context treats client input as a request and supports explicit all-branch scope', () => {
    assert.deepEqual(requestedBranchContext({ query: { branchId: '12' } }), { branchId: 12, allBranches: false });
    assert.deepEqual(requestedBranchContext({ body: { branchId: '7', allBranches: 'true' } }), { branchId: null, allBranches: true });
});
