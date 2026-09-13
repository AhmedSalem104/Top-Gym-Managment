'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { hasPaymentDetails, resolveMembershipRequest } = require('../../src/services/member-service');
const { executeInTransaction } = require('../../src/database/transaction');

test('every new member creation requires an initial membership', () => {
    assert.equal(resolveMembershipRequest({ fullName: 'عضو اختبار', phone: '01000000000' }), true);
    assert.equal(hasPaymentDetails({ amountPaid: 0, discountAmount: 0, amountDue: 0, paymentMethod: 'cash' }), false);
});

test('membership creation cannot be disabled by the legacy flag', () => {
    assert.equal(resolveMembershipRequest({ createMembership: true, membershipType: 'monthly', membershipPlan: 'gym_only' }), true);
    assert.throws(
        () => resolveMembershipRequest({ createMembership: false, membershipType: 'monthly', membershipPlan: 'gym_only' }),
        (error) => error.code === 'MEMBERSHIP_REQUIRED' && error.statusCode === 422
    );
    assert.equal(resolveMembershipRequest({ membershipType: 'monthly', membershipPlan: 'gym_only' }), true);
    assert.throws(
        () => resolveMembershipRequest({ createMembership: 'invalid' }),
        (error) => error.code === 'MEMBERSHIP_SELECTION_INVALID' && error.statusCode === 400
    );
});

test('payment details are rejected by the create contract unless membership is requested', () => {
    assert.equal(hasPaymentDetails({ amountPaid: 100, paymentMethod: 'cash' }), true);
    assert.equal(hasPaymentDetails({ paymentMethod: 'card' }), true);
    assert.equal(hasPaymentDetails({ amountPaid: 0, paymentMethod: 'cash' }), false);
});

test('legacy clients remain compatible when they explicitly submit membership data', () => {
    assert.equal(resolveMembershipRequest({ membershipType: 'monthly', membershipPlan: 'gym_only', startDate: '2026-09-10' }), true);
    assert.equal(resolveMembershipRequest({ fullName: 'عضو اختبار', phone: '01000000000', email: '' }), true);
});

test('the transaction wrapper rolls back the member when membership creation fails', async () => {
    const calls = [];
    const transaction = {
        async begin() { calls.push('begin'); },
        async commit() { calls.push('commit'); },
        async rollback() { calls.push('rollback'); }
    };

    await assert.rejects(
        executeInTransaction(transaction, async () => {
            calls.push('member-insert');
            calls.push('membership-insert');
            throw new Error('membership failure');
        }),
        /membership failure/
    );
    assert.deepEqual(calls, ['begin', 'member-insert', 'membership-insert', 'rollback']);
});
