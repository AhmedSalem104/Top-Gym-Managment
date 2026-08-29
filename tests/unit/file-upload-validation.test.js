'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { hasExpectedProofSignature, validateProof } = require('../../src/services/saas-service');

test('payment proof validation requires the declared file signature', () => {
    const fixtures = [
        ['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
        ['image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])],
        ['image/webp', Buffer.from('RIFF0000WEBP', 'ascii')],
        ['application/pdf', Buffer.from('%PDF-1.7', 'ascii')]
    ];
    for (const [mimeType, buffer] of fixtures) {
        assert.equal(hasExpectedProofSignature(buffer, mimeType), true, mimeType);
        assert.equal(validateProof({ buffer, mimeType, fileName: 'proof' }).mimeType, mimeType);
    }
});

test('payment proof validation rejects content that only spoofs the MIME header', () => {
    assert.equal(hasExpectedProofSignature(Buffer.from('not-an-image'), 'image/png'), false);
    assert.throws(
        () => validateProof({ buffer: Buffer.from('not-an-image'), mimeType: 'image/png', fileName: 'proof.png' }),
        (error) => error.code === 'PAYMENT_PROOF_SIGNATURE_MISMATCH' && error.statusCode === 400
    );
});
