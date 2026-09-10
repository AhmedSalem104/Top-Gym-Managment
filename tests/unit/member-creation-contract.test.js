'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { hasPaymentDetails, resolveMembershipRequest } = require('../../src/services/member-service');

test('name and phone alone create a profile without a membership', () => {
    assert.equal(resolveMembershipRequest({ fullName: 'عضو اختبار', phone: '01000000000' }), false);
    assert.equal(hasPaymentDetails({ amountPaid: 0, discountAmount: 0, amountDue: 0, paymentMethod: 'cash' }), false);
});

test('membership creation is explicit and validates its required pair', () => {
    assert.equal(resolveMembershipRequest({ createMembership: true, membershipType: 'monthly', membershipPlan: 'gym_only' }), true);
    assert.equal(resolveMembershipRequest({ createMembership: false, membershipType: 'monthly', membershipPlan: 'gym_only' }), false);
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
    assert.equal(resolveMembershipRequest({ fullName: 'عضو اختبار', phone: '01000000000', email: '' }), false);
});
