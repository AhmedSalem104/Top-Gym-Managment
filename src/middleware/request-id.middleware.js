'use strict';

const { randomUUID } = require('node:crypto');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;

function normalizeRequestId(value) {
    const candidate = String(value || '').trim();
    return REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function requestIdMiddleware(request, response, next) {
    const incoming = typeof request.get === 'function'
        ? request.get('x-request-id')
        : request.headers?.['x-request-id'];
    const requestId = normalizeRequestId(incoming);
    request.requestId = requestId;
    response.setHeader('X-Request-ID', requestId);
    next();
}

module.exports = { normalizeRequestId, requestIdMiddleware, REQUEST_ID_PATTERN };
