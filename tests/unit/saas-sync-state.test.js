'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { pruneSyncStates } = require('../../src/services/saas-service');

test('SaaS sync pruning removes stale completed states but preserves running work', () => {
    const running = Promise.resolve();
    const states = new Map([
        ['stale', { completedAt: 100 }],
        ['fresh', { completedAt: 9_950 }],
        ['running', { promise: running }]
    ]);

    pruneSyncStates(states, 10_000, 2, 500);

    assert.equal(states.has('stale'), false);
    assert.equal(states.has('fresh'), true);
    assert.equal(states.has('running'), true);
});

test('SaaS sync pruning caps completed states without evicting promises', () => {
    const states = new Map([
        ['first', { completedAt: 1 }],
        ['second', { completedAt: 2 }],
        ['running', { promise: Promise.resolve() }]
    ]);

    pruneSyncStates(states, 3, 1, 10_000);

    assert.equal(states.has('first'), false);
    assert.equal(states.has('second'), false);
    assert.equal(states.has('running'), true);
});
