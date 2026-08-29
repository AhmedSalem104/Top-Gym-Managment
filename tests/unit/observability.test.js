'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    normalizeRequestId,
    requestIdMiddleware,
    REQUEST_ID_PATTERN
} = require('../../src/middleware/request-id.middleware');

test('request id preserves a safe caller correlation id', () => {
    const response = { setHeader(name, value) { this[name] = value; } };
    const request = { get: () => 'staging-check-42' };
    let called = false;
    requestIdMiddleware(request, response, () => { called = true; });
    assert.equal(called, true);
    assert.equal(request.requestId, 'staging-check-42');
    assert.equal(response['X-Request-ID'], 'staging-check-42');
});

test('request id replaces unsafe or oversized caller values', () => {
    const response = { setHeader(name, value) { this[name] = value; } };
    const request = { get: () => `${'x'.repeat(81)}\nsecret` };
    requestIdMiddleware(request, response, () => {});
    assert.notEqual(request.requestId, request.get());
    assert.match(request.requestId, REQUEST_ID_PATTERN);
    assert.equal(response['X-Request-ID'], request.requestId);
});

test('request id normalizer creates a safe id when the header is absent', () => {
    const requestId = normalizeRequestId('');
    assert.match(requestId, REQUEST_ID_PATTERN);
    assert.ok(requestId.length <= 80);
});
