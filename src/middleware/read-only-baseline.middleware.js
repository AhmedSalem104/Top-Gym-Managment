'use strict';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const BASELINE_HEADER = 'x-logic-fit-baseline';
const BASELINE_VALUE = 'read-only';

/**
 * Enables a deliberately stricter request mode for the performance baseline
 * runner. The header can only reduce capabilities: it never grants access or
 * changes authentication. This also gives services an explicit signal to
 * avoid read-triggered maintenance writes such as attendance auto-checkout.
 */
function readOnlyBaselineGuard(request, response, next) {
    if (String(request.get(BASELINE_HEADER) || '').trim().toLowerCase() !== BASELINE_VALUE) {
        return next();
    }

    request.readOnlyBaseline = true;
    if (!READ_ONLY_METHODS.has(request.method)) {
        return response.status(405).json({
            error: 'Baseline requests are read-only.',
            code: 'BASELINE_READ_ONLY'
        });
    }
    return next();
}

module.exports = { BASELINE_HEADER, BASELINE_VALUE, readOnlyBaselineGuard };
