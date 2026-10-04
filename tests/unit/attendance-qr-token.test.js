'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAttendanceQrTokenCrypto, createAttendanceQrTokenService } = require('../../src/services/attendance-qr-token-service');

function ring(current, previous = '') {
    return {
        getCurrentSecret: () => current,
        getVerificationSecrets: () => [
            { keyId: 'current', secret: current },
            ...(previous ? [{ keyId: 'previous', secret: previous }] : [])
        ]
    };
}

test('attendance QR tokens are stable, opaque and resolve the same scoped identity', () => {
    const crypto = createAttendanceQrTokenCrypto(ring('current-test-secret'));
    const first = crypto.encode({ tenantId: 12345, memberId: 67890 });
    assert.match(first, /^LFQR1\.[A-Za-z0-9_-]+$/);
    assert.equal(first, crypto.encode({ tenantId: 12345, memberId: 67890 }));
    assert.equal(first.includes('12345'), false);
    assert.equal(first.includes('67890'), false);
    assert.deepEqual(crypto.decode(first), { tenantId: 12345, memberId: 67890 });
});

test('attendance QR rejects tampering, malformed values and another secret', () => {
    const issuer = createAttendanceQrTokenCrypto(ring('issuer-secret'));
    const verifier = createAttendanceQrTokenCrypto(ring('other-secret'));
    const token = issuer.encode({ tenantId: 12, memberId: 34 });
    const finalChar = token.at(-1);
    const tampered = `${token.slice(0, -1)}${finalChar === 'A' ? 'B' : 'A'}`;
    assert.equal(issuer.decode(tampered), null);
    assert.equal(verifier.decode(token), null);
    assert.equal(issuer.decode('LFQR1.not-a-token'), null);
    assert.throws(() => issuer.encode({ tenantId: 0, memberId: 34 }), /invalid/i);
});

test('attendance QR verification accepts a prior key during configured rotation', () => {
    const oldToken = createAttendanceQrTokenCrypto(ring('old-secret')).encode({ tenantId: 7, memberId: 9 });
    const rotated = createAttendanceQrTokenCrypto(ring('new-secret', 'old-secret'));
    assert.deepEqual(rotated.decode(oldToken), { tenantId: 7, memberId: 9 });
});

test('QR issue and resolve stay tenant-scoped and reject cross-tenant identity before lookup', async () => {
    const tokenCrypto = createAttendanceQrTokenCrypto(ring('tenant-secret'));
    const calls = [];
    const service = createAttendanceQrTokenService({
        crypto: tokenCrypto,
        currentTenantId: () => 22,
        sqlClient: { Int: 'int' },
        getPool: async () => ({
            request() {
                const parameters = {};
                return {
                    input(name, _type, value) { parameters[name] = value; return this; },
                    async query(query) {
                        calls.push({ query, parameters: { ...parameters } });
                        return { recordset: parameters.tenantId === 22 && parameters.memberId === 5 ? [{ id: 5 }] : [] };
                    }
                };
            }
        })
    });
    const issued = await service.getForMember(5);
    assert.equal(tokenCrypto.decode(issued.qrToken).tenantId, 22);
    assert.equal(await service.resolveForCurrentTenant(issued.qrToken), 5);
    assert.equal(await service.resolveForCurrentTenant(tokenCrypto.encode({ tenantId: 23, memberId: 5 })), null);
    assert.equal(calls.at(-1).parameters.tenantId, 22);
    assert.equal(calls.length, 2);
});
