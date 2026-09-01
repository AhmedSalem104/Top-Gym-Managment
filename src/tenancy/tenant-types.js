'use strict';

/**
 * Canonical tenant-type vocabulary. This is tenant metadata, not an
 * authorization boundary: RLS continues to use tenant_id and capabilities
 * are resolved separately by the backend.
 */
const TENANT_TYPES = Object.freeze({
    GYM: 'gym',
    INDEPENDENT_TRAINER: 'independent_trainer'
});

const TENANT_TYPE_VALUES = Object.freeze(Object.values(TENANT_TYPES));
const TENANT_TYPE_SET = new Set(TENANT_TYPE_VALUES);

function tenantTypeError(message = 'Tenant type is invalid.', code = 'TENANT_TYPE_INVALID') {
    const error = new Error(message);
    error.statusCode = 503;
    error.expose = true;
    error.code = code;
    return error;
}

function isTenantType(value) {
    return typeof value === 'string' && TENANT_TYPE_SET.has(value.trim().toLowerCase());
}

/**
 * Resolve only a value that came from the trusted tenant aggregate. Missing
 * and unknown persisted values fail closed; callers must not use this helper
 * to accept tenant_type from a request body, query string or header.
 */
function resolveTenantType(value) {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!TENANT_TYPE_SET.has(normalized)) throw tenantTypeError();
    return normalized;
}

module.exports = {
    TENANT_TYPES,
    TENANT_TYPE_VALUES,
    isTenantType,
    resolveTenantType,
    tenantTypeError
};
