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

test('member registration is available with members.create while paid onboarding stays financial-permission protected', () => {
    const unpaidRequest = {
        path: '/members',
        method: 'POST',
        body: {
            fullName: 'Synthetic Member',
            membershipType: 'monthly',
            membershipPlan: 'gym_only',
            amountPaid: 0,
            discountAmount: 0,
            paymentMethod: 'cash'
        }
    };
    const memberCreator = { role: 'Assistant', permissions: ['members.create'] };

    assert.deepEqual(permissionForRequest(unpaidRequest).all, ['members.create']);
    assert.equal(canAccessRoleRequest(memberCreator, unpaidRequest), true);

    const paidRequest = { ...unpaidRequest, body: { ...unpaidRequest.body, amountPaid: 100 } };
    assert.deepEqual(permissionForRequest(paidRequest).all, ['members.create', 'payments.create']);
    assert.equal(canAccessRoleRequest(memberCreator, paidRequest), false);
    assert.equal(canAccessRoleRequest({ ...memberCreator, permissions: ['members.create', 'payments.create'] }, paidRequest), true);

    const discountedRequest = { ...unpaidRequest, body: { ...unpaidRequest.body, discountAmount: 25 } };
    assert.deepEqual(permissionForRequest(discountedRequest).all, ['members.create', 'payments.create']);
});

test('Payment and renewal require both membership and payment permissions', () => {
    const request = { path: '/members/7/renew', method: 'POST' };
    assert.deepEqual(permissionForRequest(request).all, ['memberships.renew', 'payments.create']);
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['memberships.renew'] }, request), false);
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['memberships.renew', 'payments.create'] }, request), true);
});

test('member updates require only the permissions represented by the submitted fields', () => {
    const memberFields = { fullName: 'Updated Member', phone: '01000000000' };
    assert.deepEqual(
        permissionForRequest({ path: '/members/7', method: 'PUT', body: memberFields }).all,
        ['members.update']
    );
    assert.deepEqual(
        permissionForRequest({ path: '/members/7', method: 'PUT', body: { ...memberFields, startDate: '2026-08-30' } }).all,
        ['members.update', 'memberships.update']
    );
    assert.deepEqual(
        permissionForRequest({ path: '/members/7', method: 'PUT', body: { ...memberFields, amountPaid: 100 } }).all,
        ['members.update', 'payments.create']
    );
    assert.deepEqual(
        permissionForRequest({ path: '/members/7', method: 'PUT', body: { ...memberFields, membershipPlan: 'gym_only' } }).all,
        ['members.update', 'memberships.update', 'payments.create']
    );
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['members.update'] }, { path: '/members/7', method: 'PUT', body: memberFields }), true);
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['members.update'] }, { path: '/members/7', method: 'PUT', body: { ...memberFields, startDate: '2026-08-30' } }), false);
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

test('pricing catalog stays readable while pricing configuration is Owner-only', () => {
    const assistant = { role: 'Assistant', permissions: ['pricing.read', 'pricing.create', 'pricing.update'] };
    const readRequest = { path: '/pricing', method: 'GET' };
    const writeRequests = [
        { path: '/pricing', method: 'PUT' },
        { path: '/pricing-plans', method: 'POST' },
        { path: '/pricing-plans/gym_only', method: 'PUT' },
        { path: '/membership-types', method: 'POST' },
        { path: '/membership-types/monthly', method: 'PUT' }
    ];

    assert.equal(permissionForRequest(readRequest).ownerOnly, false);
    assert.equal(canAccessRoleRequest(assistant, readRequest), true);
    writeRequests.forEach((request) => {
        assert.equal(permissionForRequest(request).ownerOnly, true);
        assert.equal(canAccessRoleRequest({ role: 'Owner', permissions: [] }, request), true);
        assert.equal(canAccessRoleRequest(assistant, request), false);
    });
});

test('portal analytics is Owner-only and tenant-scoped', () => {
    const request = { path: '/portal/analytics', method: 'GET' };
    assert.deepEqual(permissionForRequest(request).all, ['portal.analytics.read']);
    assert.equal(permissionForRequest(request).ownerOnly, true);
    assert.equal(canAccessRoleRequest({ role: 'Owner', permissions: [] }, request), true);
    assert.equal(canAccessRoleRequest({ role: 'Assistant', permissions: ['portal.analytics.read'] }, request), false);
});
