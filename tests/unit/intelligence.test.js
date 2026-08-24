'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { churnScore } = require('../../src/services/intelligence-service');
const { permissionForRequest } = require('../../src/permissions/route-permissions');

test('intelligence churn scoring prioritizes inactive members near expiry', () => {
    const result = churnScore({ daysSinceLastVisit: 28, visitsLast30: 0, daysToExpiry: 4, amountRemaining: 250, completedSessions: 0 });
    assert.equal(result.level, 'high');
    assert.ok(result.score >= 80);
    assert.ok(result.reasons.length >= 3);
});

test('intelligence churn scoring keeps recently active members low risk', () => {
    const result = churnScore({ daysSinceLastVisit: 1, visitsLast30: 12, daysToExpiry: 60, amountRemaining: 0, completedSessions: 8 });
    assert.equal(result.level, 'low');
    assert.ok(result.score < 35);
});

test('intelligence routes separate read from plan generation permissions', () => {
    assert.deepEqual(permissionForRequest({ path: '/intelligence/overview', method: 'GET' }).all, ['intelligence.read']);
    assert.deepEqual(permissionForRequest({ path: '/intelligence/query', method: 'POST' }).all, ['intelligence.read']);
    assert.deepEqual(permissionForRequest({ path: '/intelligence/refine', method: 'POST' }).all, ['intelligence.generate']);
});
