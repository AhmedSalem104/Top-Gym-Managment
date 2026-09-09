'use strict';

const { config } = require('../config/env');

const PURPOSES = Object.freeze({
    membershipCode: 'membershipCode',
    memberPortalSession: 'memberPortalSession',
    publicRegistration: 'publicRegistration'
});

const METRIC_NAMES = Object.freeze({
    membershipCode: Object.freeze({
        currentValidation: 'membership_secret_current_validation',
        previousValidation: 'membership_secret_previous_validation',
        previousDecrypt: 'membership_secret_previous_decrypt'
    }),
    memberPortalSession: Object.freeze({
        currentValidation: 'portal_secret_current_validation',
        previousValidation: 'portal_secret_previous_validation'
    }),
    publicRegistration: Object.freeze({
        currentValidation: 'registration_secret_current_validation',
        previousValidation: 'registration_secret_previous_validation'
    })
});

const PURPOSE_ENV_NAMES = Object.freeze({
    membershipCode: Object.freeze({ current: 'MEMBERSHIP_CODE_SECRET_CURRENT', legacy: 'MEMBERSHIP_CODE_SECRET' }),
    memberPortalSession: Object.freeze({ current: 'MEMBER_PORTAL_SESSION_SECRET_CURRENT', legacy: 'MEMBER_PORTAL_SESSION_SECRET' }),
    publicRegistration: Object.freeze({ current: 'PUBLIC_REGISTRATION_SECRET_CURRENT', legacy: 'PUBLIC_REGISTRATION_SECRET' })
});

function normalize(value) {
    return String(value ?? '').trim();
}

function createSecretError(purpose) {
    const names = PURPOSE_ENV_NAMES[purpose] || { current: `${purpose}_CURRENT`, legacy: `${purpose}_LEGACY` };
    const error = new Error(`${names.current} or ${names.legacy} is required.`);
    error.statusCode = 503;
    error.expose = true;
    error.code = 'SECRET_NOT_CONFIGURED';
    return error;
}

function createSecretConfigurationError(purpose) {
    const names = PURPOSE_ENV_NAMES[purpose] || { current: `${purpose}_CURRENT`, legacy: `${purpose}_LEGACY` };
    const error = new Error(`${names.current} and ${names.current.replace('_CURRENT', '_PREVIOUS')} must be different.`);
    error.statusCode = 503;
    error.expose = true;
    error.code = 'SECRET_CONFIG_INVALID';
    return error;
}

function normalizedVersion(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function createSecretRing(source = config.secretRing) {
    const metrics = {
        secret_fallback_usage: 0,
        membership_secret_current_validation: 0,
        membership_secret_previous_validation: 0,
        membership_secret_previous_decrypt: 0,
        portal_secret_current_validation: 0,
        portal_secret_previous_validation: 0,
        registration_secret_current_validation: 0,
        registration_secret_previous_validation: 0
    };

    const configured = {};
    for (const purpose of Object.values(PURPOSES)) {
        const entry = source?.[purpose] || {};
        const current = normalize(entry.current);
        const currentSource = normalize(entry.currentSource) || (current ? 'current' : 'missing');
        const legacy = normalize(entry.legacy);
        const explicitPrevious = normalize(entry.previous);
        const configuredPreviousSource = normalize(entry.previousSource);
        if (current && explicitPrevious && current === explicitPrevious) throw createSecretConfigurationError(purpose);
        const previous = explicitPrevious || (currentSource === 'current' && current && legacy && legacy !== current ? legacy : '');
        const previousSource = explicitPrevious
            ? configuredPreviousSource === 'legacy_bridge' ? 'legacy_bridge' : 'explicit'
            : previous
                ? 'legacy_bridge'
                : 'none';
        configured[purpose] = {
            family: purpose,
            current,
            currentSource,
            legacy,
            legacyAliasPresent: entry.legacyAliasPresent === true || Boolean(legacy) || currentSource === 'legacy',
            previous,
            previousSource,
            currentVersion: normalizedVersion(entry.currentVersion, 1),
            previousVersion: normalizedVersion(entry.previousVersion, 0)
        };
    }

    function ringFor(purpose) {
        if (!Object.values(PURPOSES).includes(purpose)) throw new Error(`Unknown secret purpose: ${purpose}`);
        return configured[purpose];
    }

    function getCurrentSecret(purpose) {
        const ring = ringFor(purpose);
        if (!ring.current) throw createSecretError(purpose);
        if (ring.currentSource !== 'current') metrics.secret_fallback_usage += 1;
        return ring.current;
    }

    function getVerificationSecrets(purpose) {
        const ring = ringFor(purpose);
        // Verification cannot safely proceed without a current key. This
        // also prevents a previous-only deployment from accepting writes.
        getCurrentSecret(purpose);
        const entries = [{ keyId: 'current', version: ring.currentVersion, secret: ring.current }];
        if (ring.previous && ring.previous !== ring.current) {
            entries.push({ keyId: 'previous', version: ring.previousVersion, secret: ring.previous });
        }
        return entries;
    }

    function getCurrentKeyVersion(purpose) {
        const ring = ringFor(purpose);
        getCurrentSecret(purpose);
        return ring.currentVersion;
    }

    function assertRequiredSecrets() {
        for (const purpose of Object.values(PURPOSES)) getCurrentSecret(purpose);
        return Object.freeze(Object.fromEntries(
            Object.values(PURPOSES).map((purpose) => [purpose, getState(purpose)])
        ));
    }

    function recordVerification(purpose, keyId, operation = 'validation') {
        const metricsForPurpose = METRIC_NAMES[purpose];
        if (!metricsForPurpose) return;
        const metric = keyId === 'previous'
            ? (operation === 'decrypt' ? metricsForPurpose.previousDecrypt : metricsForPurpose.previousValidation)
            : metricsForPurpose.currentValidation;
        if (metric && Object.prototype.hasOwnProperty.call(metrics, metric)) metrics[metric] += 1;
    }

    function getState(purpose) {
        const ring = ringFor(purpose);
        return Object.freeze({
            family: ring.family,
            mode: !ring.current
                ? 'MISSING'
                : ring.previousSource === 'legacy_bridge'
                    ? 'TRANSITION'
                    : ring.previousSource === 'explicit'
                        ? 'EXPLICIT_RING'
                        : ring.currentSource === 'legacy'
                            ? 'LEGACY'
                            : 'CURRENT_ONLY',
            currentPresent: Boolean(ring.current),
            previousPresent: Boolean(ring.previous),
            legacyAliasPresent: ring.legacyAliasPresent,
            previousSource: ring.previousSource
        });
    }

    return Object.freeze({
        getCurrentSecret,
        getCurrentKeyVersion,
        getVerificationSecrets,
        assertRequiredSecrets,
        getMetrics: () => Object.freeze({ ...metrics }),
        getState,
        recordVerification,
        resetMetrics: () => {
            for (const key of Object.keys(metrics)) metrics[key] = 0;
        }
    });
}

const secretRing = createSecretRing();

module.exports = {
    PURPOSES,
    createSecretRing,
    secretRing
};
