'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { permissionForRequest } = require('../../src/permissions/route-permissions');
const { canAccessRoleRequest } = require('../../src/permissions/role-permissions');
const { stripFinancialData } = require('../../src/middleware/financial-data.middleware');

test('Owner always has access to a resolved API operation', () => {
    assert.equal(canAccessRoleRequest({ role: 'Owner', permissions: [] }, { path: '/reports', method: 'GET' }), true);
});

test('Assistant read-only permissions allow GET and reject writes', () => {
    const user = { role: 'Assistant', permissions: ['members.read'] };
    assert.deepEqual(permissionForRequest({ path: '/members', method: 'GET' }).all, ['members.read', 'memberships.read']);
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['members.read'] }, { path: '/members', method: 'GET' }), false);
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['members.read', 'memberships.read'] }, { path: '/members', method: 'GET' }), true);
    assert.equal(canAccessRoleRequest(user, { path: '/members', method: 'GET' }), false);
    assert.equal(canAccessRoleRequest(user, { path: '/members', method: 'POST' }), false);
});

test('Payment and renewal require both membership and payment permissions', () => {
    const request = { path: '/members/7/renew', method: 'POST' };
    assert.deepEqual(permissionForRequest(request).all, ['memberships.renew', 'payments.create']);
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['memberships.renew'] }, request), false);
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['memberships.renew', 'payments.create'] }, request), true);
});

test('finance.read removes financial fields from a permitted response', () => {
    const safe = stripFinancialData({ members: [{ fullName: 'A', amountRemaining: 150, amountPaid: 200 }], dashboard: { visits: 4, finance: { net: 20 } } });
    assert.deepEqual(safe, { members: [{ fullName: 'A' }], dashboard: { visits: 4 } });
});

test('unmapped assistant routes are denied instead of falling back to role checks', () => {
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['*'] }, { path: '/internal-secret', method: 'GET' }), false);
});

test('assistant deletion is an Owner-only resolved operation', () => {
    const request = { path: '/auth/users/12', method: 'DELETE' };
    assert.deepEqual(permissionForRequest(request).all, ['management.users.delete']);
    assert.equal(permissionForRequest(request).ownerOnly, true);
    assert.equal(canAccessRoleRequest({ role: 'Owner', permissions: [] }, request), true);
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['management.users.delete'] }, request), false);
});
