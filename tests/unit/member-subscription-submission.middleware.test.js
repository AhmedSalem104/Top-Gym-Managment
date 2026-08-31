'use strict';

const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const { parseMemberSubscriptionSubmission } = require('../../src/middleware/member-subscription-submission.middleware');

function multipartBody(fields = {}, file = null, boundary = 'logicfit-test-boundary') {
    const chunks = [];
    for (const [name, value] of Object.entries(fields)) {
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8'));
    }
    if (file) {
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="proof"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`, 'utf8'));
        chunks.push(file.body);
        chunks.push(Buffer.from('\r\n', 'utf8'));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function runParser({ body, contentType }) {
    return new Promise((resolve) => {
        const request = new PassThrough();
        request.headers = { 'content-type': contentType };
        parseMemberSubscriptionSubmission(request, {}, (error) => resolve({ request, error }));
        request.end(body);
    });
}

test('multipart member submission keeps metadata and proof bytes in memory without writing a request first', async () => {
    const proof = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const parsed = await runParser(multipartBody({
        requestType: 'membership',
        membershipPlan: 'gym_only',
        membershipType: 'monthly',
        startDate: '2026-09-01',
        paymentMethodCode: 'vodafone-cash'
    }, { name: 'proof.png', type: 'image/png', body: proof }));

    assert.equal(parsed.error, undefined);
    assert.equal(parsed.request.memberSubscriptionSubmission.fields.requestType, 'membership');
    assert.deepEqual(parsed.request.memberSubscriptionSubmission.proof.buffer, proof);
    assert.equal(parsed.request.memberSubscriptionSubmission.proof.mimeType, 'image/png');
});

test('multipart member submission rejects a missing proof before the controller can create a request', async () => {
    const parsed = await runParser(multipartBody({ requestType: 'membership' }));

    assert.equal(parsed.error?.code, 'PAYMENT_PROOF_REQUIRED');
    assert.equal(parsed.request.memberSubscriptionSubmission, undefined);
});

test('multipart member submission rejects fields outside the explicit allow-list', async () => {
    const parsed = await runParser(multipartBody({ tenantId: '2' }, {
        name: 'proof.png',
        type: 'image/png',
        body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    }));

    assert.equal(parsed.error?.code, 'INVALID_PAYMENT_PROOF_SUBMISSION');
});
