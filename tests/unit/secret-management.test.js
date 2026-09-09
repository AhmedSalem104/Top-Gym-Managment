'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createSecretRing } = require('../../src/services/secret-ring');
const { createMembershipCodeCrypto } = require('../../src/services/membership-code-crypto');

const root = path.resolve(__dirname, '../..');
const membershipSource = fs.readFileSync(path.join(root, 'src/services/membership-code-service.js'), 'utf8');
const commercialSource = fs.readFileSync(path.join(root, 'src/services/commercial-service.js'), 'utf8');
const registrationSource = fs.readFileSync(path.join(root, 'src/services/gym-registration-service.js'), 'utf8');

// Synthetic test-only material. No production secret is read or embedded here.
const OLD = Buffer.alloc(32, 0x11).toString('base64url');
const NEW = Buffer.alloc(32, 0x22).toString('base64url');
const OTHER = Buffer.alloc(32, 0x33).toString('base64url');
const FOURTH = Buffer.alloc(32, 0x44).toString('base64url');

const SECRET_ENV_NAMES = [
    'MEMBERSHIP_CODE_SECRET_CURRENT', 'MEMBERSHIP_CODE_SECRET_PREVIOUS', 'MEMBERSHIP_CODE_SECRET',
    'MEMBER_PORTAL_SESSION_SECRET_CURRENT', 'MEMBER_PORTAL_SESSION_SECRET_PREVIOUS', 'MEMBER_PORTAL_SESSION_SECRET',
    'PUBLIC_REGISTRATION_SECRET_CURRENT', 'PUBLIC_REGISTRATION_SECRET_PREVIOUS', 'PUBLIC_REGISTRATION_SECRET',
    'SESSION_SECRET'
];

function family(overrides = {}) {
    return {
        current: '',
        currentSource: 'missing',
        legacy: '',
        legacyAliasPresent: false,
        previous: '',
        previousSource: 'none',
        currentVersion: 1,
        previousVersion: 0,
        ...overrides
    };
}

function ringSource({ membershipCode, memberPortalSession, publicRegistration } = {}) {
    return {
        membershipCode: family(membershipCode),
        memberPortalSession: family(memberPortalSession),
        publicRegistration: family(publicRegistration)
    };
}

function runEnvProbe(assignments, expression) {
    const environment = { ...process.env };
    for (const name of SECRET_ENV_NAMES) delete environment[name];
    Object.assign(environment, assignments);
    const script = `
        try {
            const { secretRing } = require('./src/services/secret-ring');
            const result = (${expression})();
            process.stdout.write(JSON.stringify(result));
        } catch (error) {
            process.stdout.write(JSON.stringify({ error: error.code || 'UNKNOWN' }));
        }
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: root,
        env: environment,
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

function state(ring, purpose) {
    return ring.getState(purpose);
}

test('legacy-only aliases are compatible and remain family-local', () => {
    const result = runEnvProbe(
        {
            MEMBERSHIP_CODE_SECRET: OLD,
            MEMBER_PORTAL_SESSION_SECRET: NEW,
            PUBLIC_REGISTRATION_SECRET: OTHER,
            SESSION_SECRET: FOURTH
        },
        () => ({
            membership: secretRing.getState('membershipCode'),
            portal: secretRing.getState('memberPortalSession'),
            registration: secretRing.getState('publicRegistration'),
            required: (() => {
                secretRing.assertRequiredSecrets();
                return true;
            })(),
            metrics: secretRing.getMetrics()
        })
    );
    assert.equal(result.membership.mode, 'LEGACY');
    assert.equal(result.membership.previousPresent, false);
    assert.equal(result.membership.previousSource, 'none');
    assert.equal(result.portal.mode, 'LEGACY');
    assert.equal(result.registration.mode, 'LEGACY');
    assert.equal(result.required, true);
    assert.ok(result.metrics.secret_fallback_usage >= 0);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(`${OLD}|${NEW}|${OTHER}|${FOURTH}`, 'u'));
});

test('legacy plus explicit current derives the same-family legacy bridge', () => {
    const result = runEnvProbe(
        { MEMBERSHIP_CODE_SECRET: OLD, MEMBERSHIP_CODE_SECRET_CURRENT: NEW },
        () => ({
            membership: secretRing.getState('membershipCode'),
            verification: secretRing.getVerificationSecrets('membershipCode').map(({ keyId, version }) => ({ keyId, version })),
            portal: secretRing.getState('memberPortalSession'),
            registration: secretRing.getState('publicRegistration'),
            portalError: (() => {
                try { secretRing.getCurrentSecret('memberPortalSession'); return null; } catch (error) { return error.code; }
            })(),
            registrationError: (() => {
                try { secretRing.getCurrentSecret('publicRegistration'); return null; } catch (error) { return error.code; }
            })()
        })
    );
    assert.deepEqual(result.membership, {
        family: 'membershipCode',
        mode: 'TRANSITION',
        currentPresent: true,
        previousPresent: true,
        legacyAliasPresent: true,
        previousSource: 'legacy_bridge'
    });
    assert.deepEqual(result.verification, [
        { keyId: 'current', version: 1 },
        { keyId: 'previous', version: 0 }
    ]);
    assert.equal(result.portal.mode, 'MISSING');
    assert.equal(result.registration.mode, 'MISSING');
    assert.equal(result.portalError, 'SECRET_NOT_CONFIGURED');
    assert.equal(result.registrationError, 'SECRET_NOT_CONFIGURED');
});

test('legacy plus current bridge is independent for portal and registration families', () => {
    const result = runEnvProbe(
        {
            MEMBERSHIP_CODE_SECRET: OLD,
            MEMBERSHIP_CODE_SECRET_CURRENT: NEW,
            MEMBER_PORTAL_SESSION_SECRET: NEW,
            MEMBER_PORTAL_SESSION_SECRET_CURRENT: OTHER,
            PUBLIC_REGISTRATION_SECRET: OTHER,
            PUBLIC_REGISTRATION_SECRET_CURRENT: FOURTH
        },
        () => ({
            membership: secretRing.getState('membershipCode'),
            portal: secretRing.getState('memberPortalSession'),
            registration: secretRing.getState('publicRegistration')
        })
    );
    for (const item of Object.values(result)) {
        assert.equal(item.mode, 'TRANSITION');
        assert.equal(item.currentPresent, true);
        assert.equal(item.previousPresent, true);
        assert.equal(item.previousSource, 'legacy_bridge');
    }
});

test('explicit previous wins over a same-family legacy bridge', () => {
    const result = runEnvProbe(
        {
            MEMBERSHIP_CODE_SECRET: OLD,
            MEMBERSHIP_CODE_SECRET_CURRENT: NEW,
            MEMBERSHIP_CODE_SECRET_PREVIOUS: OTHER
        },
        () => secretRing.getState('membershipCode')
    );
    assert.deepEqual(result, {
        family: 'membershipCode',
        mode: 'EXPLICIT_RING',
        currentPresent: true,
        previousPresent: true,
        legacyAliasPresent: true,
        previousSource: 'explicit'
    });
});

test('identical legacy/current values do not create a duplicate previous key', () => {
    const result = runEnvProbe(
        { MEMBERSHIP_CODE_SECRET: OLD, MEMBERSHIP_CODE_SECRET_CURRENT: OLD },
        () => secretRing.getState('membershipCode')
    );
    assert.deepEqual(result, {
        family: 'membershipCode',
        mode: 'CURRENT_ONLY',
        currentPresent: true,
        previousPresent: false,
        legacyAliasPresent: true,
        previousSource: 'none'
    });
});

test('identical explicit current/previous values fail closed as invalid configuration', () => {
    const result = runEnvProbe(
        { MEMBERSHIP_CODE_SECRET_CURRENT: OLD, MEMBERSHIP_CODE_SECRET_PREVIOUS: OLD },
        () => secretRing.getState('membershipCode')
    );
    assert.deepEqual(result, { error: 'SECRET_CONFIG_INVALID' });
});

test('current-only configuration has no previous slot for every family', () => {
    const result = runEnvProbe(
        {
            MEMBERSHIP_CODE_SECRET_CURRENT: OLD,
            MEMBER_PORTAL_SESSION_SECRET_CURRENT: NEW,
            PUBLIC_REGISTRATION_SECRET_CURRENT: OTHER
        },
        () => ({
            membership: secretRing.getState('membershipCode'),
            portal: secretRing.getState('memberPortalSession'),
            registration: secretRing.getState('publicRegistration')
        })
    );
    for (const item of Object.values(result)) {
        assert.equal(item.mode, 'CURRENT_ONLY');
        assert.equal(item.currentPresent, true);
        assert.equal(item.previousPresent, false);
        assert.equal(item.previousSource, 'none');
    }
});

test('all families support independent legacy bridges and explicit rings', () => {
    const result = runEnvProbe(
        {
            MEMBERSHIP_CODE_SECRET: OLD,
            MEMBERSHIP_CODE_SECRET_CURRENT: NEW,
            MEMBER_PORTAL_SESSION_SECRET: NEW,
            MEMBER_PORTAL_SESSION_SECRET_CURRENT: OTHER,
            MEMBER_PORTAL_SESSION_SECRET_PREVIOUS: OLD,
            PUBLIC_REGISTRATION_SECRET: OTHER,
            PUBLIC_REGISTRATION_SECRET_CURRENT: FOURTH,
            PUBLIC_REGISTRATION_SECRET_PREVIOUS: NEW
        },
        () => ({
            membership: secretRing.getState('membershipCode'),
            portal: secretRing.getState('memberPortalSession'),
            registration: secretRing.getState('publicRegistration')
        })
    );
    assert.equal(result.membership.mode, 'TRANSITION');
    assert.equal(result.membership.previousSource, 'legacy_bridge');
    assert.equal(result.portal.mode, 'EXPLICIT_RING');
    assert.equal(result.portal.previousSource, 'explicit');
    assert.equal(result.registration.mode, 'EXPLICIT_RING');
    assert.equal(result.registration.previousSource, 'explicit');
});

test('missing current and previous-only configurations fail closed without SESSION_SECRET fallback', () => {
    const result = runEnvProbe(
        { SESSION_SECRET: OTHER, MEMBERSHIP_CODE_SECRET_PREVIOUS: OLD },
        () => ({
            membership: (() => {
                try { secretRing.getCurrentSecret('membershipCode'); return 'unexpected'; } catch (error) { return error.code; }
            })(),
            portal: (() => {
                try { secretRing.getCurrentSecret('memberPortalSession'); return 'unexpected'; } catch (error) { return error.code; }
            })(),
            registration: (() => {
                try { secretRing.getCurrentSecret('publicRegistration'); return 'unexpected'; } catch (error) { return error.code; }
            })(),
            required: (() => {
                try { secretRing.assertRequiredSecrets(); return 'unexpected'; } catch (error) { return error.code; }
            })()
        })
    );
    assert.deepEqual(result, {
        membership: 'SECRET_NOT_CONFIGURED',
        portal: 'SECRET_NOT_CONFIGURED',
        registration: 'SECRET_NOT_CONFIGURED',
        required: 'SECRET_NOT_CONFIGURED'
    });
});

test('rotating one family never changes the effective state of other families', () => {
    const base = ringSource({
        membershipCode: { current: OLD, currentSource: 'current' },
        memberPortalSession: { current: NEW, currentSource: 'current', previous: OLD, previousSource: 'explicit' },
        publicRegistration: { current: OTHER, currentSource: 'current', previous: OLD, previousSource: 'explicit' }
    });
    const baseline = createSecretRing(base);
    const membershipRotated = createSecretRing({
        ...base,
        membershipCode: { current: FOURTH, currentSource: 'current', legacy: OLD }
    });
    const portalRotated = createSecretRing({
        ...base,
        memberPortalSession: { current: FOURTH, currentSource: 'current', previous: NEW, previousSource: 'explicit' }
    });
    const registrationRotated = createSecretRing({
        ...base,
        publicRegistration: { current: FOURTH, currentSource: 'current', previous: OTHER, previousSource: 'explicit' }
    });
    assert.deepEqual(state(membershipRotated, 'memberPortalSession'), state(baseline, 'memberPortalSession'));
    assert.deepEqual(state(membershipRotated, 'publicRegistration'), state(baseline, 'publicRegistration'));
    assert.deepEqual(state(portalRotated, 'membershipCode'), state(baseline, 'membershipCode'));
    assert.deepEqual(state(portalRotated, 'publicRegistration'), state(baseline, 'publicRegistration'));
    assert.deepEqual(state(registrationRotated, 'membershipCode'), state(baseline, 'membershipCode'));
    assert.deepEqual(state(registrationRotated, 'memberPortalSession'), state(baseline, 'memberPortalSession'));
});

test('membership crypto reads legacy ciphertext through previous and writes with current', () => {
    const oldRing = createSecretRing(ringSource({
        membershipCode: { current: OLD, currentSource: 'legacy', legacy: OLD }
    }));
    const oldCrypto = createMembershipCodeCrypto(oldRing);
    const compactCode = 'TGABCDEFGHJKLMNPQR';
    const oldCiphertext = oldCrypto.encryptCode(compactCode);

    const transitionRing = createSecretRing(ringSource({
        membershipCode: { current: NEW, currentSource: 'current', legacy: OLD }
    }));
    const transitionCrypto = createMembershipCodeCrypto(transitionRing);
    const candidates = transitionCrypto.hashCandidates(compactCode);
    assert.deepEqual(candidates.map(({ keyId }) => keyId), ['current', 'previous']);
    assert.equal(candidates.some(({ hash }) => hash === oldCrypto.hashCode(compactCode)), true);
    assert.equal(transitionCrypto.decryptWithVerification(oldCiphertext).keyId, 'previous');
    assert.equal(transitionCrypto.decryptWithVerification(oldCiphertext).plaintext, compactCode);
    assert.equal(transitionCrypto.decryptWithVerification(transitionCrypto.encryptCode(compactCode)).keyId, 'current');
    assert.equal(transitionRing.getMetrics().membership_secret_previous_decrypt, 2);

    const currentOnlyCrypto = createMembershipCodeCrypto(createSecretRing(ringSource({
        membershipCode: { current: NEW, currentSource: 'current' }
    })));
    assert.throws(() => currentOnlyCrypto.decryptWithVerification(oldCiphertext));
});

test('portal and registration helpers use bounded current-first dual validation', () => {
    assert.match(commercialSource, /getVerificationSecrets\('memberPortalSession'\)/u);
    assert.match(commercialSource, /token_hash IN \(\$\{placeholders\.join\(', '\)\}\)/u);
    assert.match(registrationSource, /getVerificationSecrets\('publicRegistration'\)/u);
    assert.match(registrationSource, /public_token_hash IN \(\$\{placeholders\.join\(', '\)\}\)/u);
    assert.match(registrationSource, /idempotency_key_hash IN \(\$\{idempotencyPlaceholders\.join\(', '\)\}\)/u);

    const result = runEnvProbe(
        {
            MEMBER_PORTAL_SESSION_SECRET_CURRENT: NEW,
            MEMBER_PORTAL_SESSION_SECRET_PREVIOUS: OLD,
            PUBLIC_REGISTRATION_SECRET_CURRENT: OTHER,
            PUBLIC_REGISTRATION_SECRET_PREVIOUS: OLD
        },
        () => {
            const { hashTokenCandidates } = require('./src/services/commercial-service');
            const { hashCapabilityCandidates, registrationRequestCandidates } = require('./src/services/gym-registration-service');
            const portal = hashTokenCandidates('portal-test-token');
            const registration = registrationRequestCandidates('registration-test-key-001');
            const capability = hashCapabilityCandidates('registration-test-value', 'registration-token');
            return {
                portalKeys: portal.map(({ keyId, version }) => ({ keyId, version })),
                portalHashesDiffer: portal[0].hash !== portal[1].hash,
                registrationKeys: registration.map(({ keyId, version }) => ({ keyId, version })),
                registrationAccessTokensDiffer: registration[0].accessToken !== registration[1].accessToken,
                registrationPublicHashesDiffer: registration[0].publicTokenHash !== registration[1].publicTokenHash,
                capabilityKeys: capability.map(({ keyId, version }) => ({ keyId, version }))
            };
        }
    );
    assert.deepEqual(result.portalKeys.map(({ keyId }) => keyId), ['current', 'previous']);
    assert.equal(result.portalHashesDiffer, true);
    assert.deepEqual(result.registrationKeys.map(({ keyId }) => keyId), ['current', 'previous']);
    assert.equal(result.registrationAccessTokensDiffer, true);
    assert.equal(result.registrationPublicHashesDiffer, true);
    assert.deepEqual(result.capabilityKeys.map(({ keyId }) => keyId), ['current', 'previous']);
});

test('metadata is safe and read-side rewrap is explicitly opt-in', () => {
    const ring = createSecretRing(ringSource({
        membershipCode: { current: NEW, currentSource: 'current', legacy: OLD }
    }));
    const metadata = ring.getState('membershipCode');
    assert.deepEqual(Object.keys(metadata).sort(), [
        'currentPresent', 'family', 'legacyAliasPresent', 'mode', 'previousPresent', 'previousSource'
    ].sort());
    assert.doesNotMatch(JSON.stringify(metadata), new RegExp(`${OLD}|${NEW}|${OTHER}`, 'u'));
    assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'length'), false);
    assert.match(membershipSource, /async function rewrapMemberCodeIfPrevious\(memberId\)/u);
    const previewStart = membershipSource.indexOf('async function getPreview');
    const previewEnd = membershipSource.indexOf('async function getPreviews');
    assert.notEqual(previewStart, -1);
    assert.notEqual(previewEnd, -1);
    assert.doesNotMatch(membershipSource.slice(previewStart, previewEnd), /rewrapMemberCodeIfPrevious/u);
});

test('membership family has no unrelated secret fallback', () => {
    assert.doesNotMatch(membershipSource, /SESSION_SECRET|TOP_GYM_MEMBERSHIP_CODE_FALLBACK|logicfit-idempotency-key/u);
    assert.match(membershipSource, /createMembershipCodeCrypto\(secretRing\)/u);
});
