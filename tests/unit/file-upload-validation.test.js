'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { hasExpectedProofSignature, validateProof } = require('../../src/services/saas-service');

const root = path.join(__dirname, '..', '..');

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

test('payment proof validation recovers from a missing or inaccurate browser MIME label using the file signature', () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    assert.equal(validateProof({ buffer: png, mimeType: 'application/octet-stream', fileName: 'proof.bin' }).mimeType, 'image/png');
    assert.equal(validateProof({ buffer: png, mimeType: 'image/jpeg', fileName: 'proof.jpg' }).mimeType, 'image/png');
});

test('payment proofs accept common image container formats by signature, independent of extension', () => {
    const fixtures = [
        ['image/gif', Buffer.from('GIF89a' + '\0'.repeat(16))],
        ['image/bmp', Buffer.from('BM' + '\0'.repeat(30))],
        ['image/tiff', Buffer.from([0x49, 0x49, 0x2a, 0x00, 0, 0, 0, 0])],
        ['image/avif', Buffer.concat([Buffer.from([0, 0, 0, 28]), Buffer.from('ftypavif'), Buffer.alloc(16)])],
        ['image/heic', Buffer.concat([Buffer.from([0, 0, 0, 28]), Buffer.from('ftypheic'), Buffer.alloc(16)])],
        ['image/jxl', Buffer.from([0xff, 0x0a, 0x00, 0x00])]
    ];
    for (const [mimeType, buffer] of fixtures) {
        assert.equal(validateProof({ buffer, mimeType: 'application/octet-stream', fileName: 'proof.unknown' }).mimeType, mimeType, mimeType);
    }
});

test('payment proof validation keeps active SVG out of the inline proof surface', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>');
    assert.throws(
        () => validateProof({ buffer: svg, mimeType: 'image/svg+xml', fileName: 'proof.svg' }),
        (error) => error.code === 'INVALID_PAYMENT_PROOF_TYPE' && error.statusCode === 400
    );
});

test('all payment-proof pickers expose the broad image filter plus the existing PDF option', () => {
    for (const file of ['public/index.html', 'public/register-gym.html', 'public/register-trainer.html', 'public/member-portal.html']) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        assert.match(source, /accept="image\/\*,application\/pdf"/u, file);
    }
});
