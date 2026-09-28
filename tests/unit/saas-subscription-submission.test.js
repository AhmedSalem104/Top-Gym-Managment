'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const test = require('node:test');
const { parseSaasSubscriptionSubmission } = require('../../src/middleware/saas-subscription-submission.middleware');
const { createSaasController } = require('../../src/controllers/saas.controller');
const { createPlatformAdminController } = require('../../src/controllers/platform-admin.controller');
const { registerSaasRoutes } = require('../../src/routes/saas.routes');

const root = path.join(__dirname, '..', '..');

function multipartRequest({ includeFile = true } = {}) {
    const boundary = 'logic-fit-test-boundary';
    const chunks = [
        `--${boundary}\r\nContent-Disposition: form-data; name="planId"\r\n\r\n12\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="termCode"\r\n\r\nquarterly\r\n`,
        `--${boundary}\r\nContent-Disposition: form-data; name="notes"\r\n\r\nQA request\r\n`
    ];
    if (includeFile) chunks.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="proof"; filename="proof.png"\r\nContent-Type: image/png\r\n\r\n`,
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
        '\r\n'
    );
    chunks.push(`--${boundary}--\r\n`);
    const request = Readable.from(chunks.map((chunk) => Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    request.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
    return request;
}

function runParser(request) {
    return new Promise((resolve, reject) => {
        parseSaasSubscriptionSubmission(request, {}, (error) => error ? reject(error) : resolve(request.saasSubscriptionSubmission));
    });
}

test('multipart subscription submission parser binds request fields and one proof to the same request', async () => {
    const submission = await runParser(multipartRequest());
    assert.equal(submission.fields.planId, '12');
    assert.equal(submission.fields.termCode, 'quarterly');
    assert.equal(submission.fields.notes, 'QA request');
    assert.equal(submission.proof.fileName, 'proof.png');
    assert.equal(submission.proof.mimeType, 'image/png');
    assert.ok(Buffer.isBuffer(submission.proof.buffer));
});

test('multipart subscription submission rejects a missing proof before service invocation', async () => {
    await assert.rejects(runParser(multipartRequest({ includeFile: false })), (error) => error.code === 'PAYMENT_PROOF_REQUIRED' && error.statusCode === 422);
});

test('submit controller forwards authenticated tenant, actor, fields and proof as one service call', async () => {
    let input;
    const controller = createSaasController({ saasService: { submitSubscriptionRequest: async (value) => { input = value; return { id: 3, status: 'pending', proof: { id: 8 } }; } } });
    let status;
    let body;
    await controller.submitRequest({
        tenant: { id: 42 }, auth: { id: 9 },
        saasSubscriptionSubmission: { fields: { planId: '12', termCode: 'annual', notes: 'from form' }, proof: { buffer: Buffer.from('proof'), mimeType: 'image/png', fileName: 'proof.png' } }
    }, { status(value) { status = value; return this; }, json(value) { body = value; return this; } });
    assert.equal(status, 201);
    assert.equal(input.tenantId, 42);
    assert.equal(input.userId, 9);
    assert.equal(input.planId, '12');
    assert.equal(input.proof.fileName, 'proof.png');
    assert.equal(body.request.id, 3);
});

test('legacy create-only endpoint fails closed instead of creating a request without its proof', async () => {
    let called = false;
    let status;
    let body;
    const controller = createSaasController({ saasService: { createSubscriptionRequest: async () => { called = true; } } });
    await controller.createRequest({}, {
        status(value) { status = value; return this; },
        json(value) { body = value; return this; }
    });
    assert.equal(status, 410);
    assert.equal(called, false);
    assert.equal(body.code, 'ATOMIC_SUBSCRIPTION_SUBMISSION_REQUIRED');
    assert.equal(body.submitUrl, '/api/saas/subscription-requests/submit');
});

test('tenant proof controller returns verified bytes inline with the actual media type, never JSON metadata', async () => {
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    let serviceArgs;
    let headers;
    let sent;
    const controller = createSaasController({ saasService: {
        PROOF_MIME_TYPES: new Set(['image/png']),
        getPaymentProofFile: async (...args) => { serviceArgs = args; return { mime_type: 'image/png', file_name: 'proof.png', content: image }; }
    } });
    await controller.paymentProof({ params: { id: '8' }, tenant: { id: 42 }, readOnlyRequest: true }, {
        set(value) { headers = value; return this; }, send(value) { sent = value; return this; },
        status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; }
    });
    assert.deepEqual(serviceArgs, ['8', 42, { readOnly: true }]);
    assert.equal(headers['Content-Type'], 'image/png');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.deepEqual(sent, image);
});

test('Platform Admin proof controller serves the same verified private file as an inline image/PDF', async () => {
    const pdf = Buffer.from('%PDF-1.7');
    let headers;
    let sent;
    const controller = createPlatformAdminController({
        saasService: { getPaymentProofFile: async (id, tenantId) => {
            assert.equal(id, '8');
            assert.equal(tenantId, null);
            return { mime_type: 'application/pdf', file_name: 'proof.pdf', content: pdf };
        } },
        platformAdminService: {}, authService: {}, backupRecoveryService: null, commercialService: {}
    });
    await controller.paymentProof({ params: { proofId: '8' }, readOnlyRequest: true }, {
        set(value) { headers = value; return this; }, send(value) { sent = value; return this; },
        status(value) { this.code = value; return this; }, json(value) { this.body = value; return this; }
    });
    assert.equal(headers['Content-Type'], 'application/pdf');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.deepEqual(sent, pdf);
});

test('subscription submit and proof routes remain owner-authenticated and proof lookup remains tenant-scoped', () => {
    const routes = new Map();
    const ownerOnly = function ownerOnly() {};
    const app = { get(pathname, ...handlers) { routes.set(`GET ${pathname}`, handlers); }, post(pathname, ...handlers) { routes.set(`POST ${pathname}`, handlers); } };
    registerSaasRoutes(app, { saasService: {}, asyncRoute: (handler) => handler, ownerOnly });
    const submit = routes.get('POST /api/saas/subscription-requests/submit');
    const proof = routes.get('GET /api/saas/payment-proofs/:id/file');
    assert.equal(submit[0], ownerOnly);
    assert.equal(submit.length, 3);
    assert.equal(proof[0], ownerOnly);

    const service = fs.readFileSync(path.join(root, 'src/services/saas-service.js'), 'utf8');
    assert.match(service, /WHERE id=@id AND \(@tenantId IS NULL OR tenant_id=@tenantId\)/);
    const ui = fs.readFileSync(path.join(root, 'public/js/pages/saas/saas.js'), 'utf8');
    assert.match(ui, /state\.submitting/);
    assert.match(ui, /loading-spinner/);
    assert.match(ui, /subscription-requests\/submit/);
    assert.match(ui, /contentType\.startsWith\('image\/'\) \|\| contentType === 'application\/pdf'/);
    assert.match(ui, /dialog\.close\(\)/);
});

test('request, proof, audit and in-app admin event share a transaction; email dispatch follows commit', () => {
    const service = fs.readFileSync(path.join(root, 'src/services/saas-service.js'), 'utf8');
    const start = service.indexOf('async function submitSubscriptionRequest');
    const end = service.indexOf('\nasync function listPlatformRequests', start);
    const block = service.slice(start, end);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    assert.match(block, /await withTransaction\(async \(transaction\)/);
    assert.match(block, /INSERT INTO dbo\.saas_subscription_requests/);
    assert.match(block, /INSERT INTO dbo\.saas_payment_proofs/);
    assert.match(block, /recordAudit\([\s\S]*?executor: transaction/);
    assert.match(block, /notificationService\.recordEvent\(eventInput, \{ executor: transaction \}\)/);
    assert.ok(block.indexOf('await withTransaction') < block.indexOf('notificationService.dispatchEvent(notificationEvent)'));
    assert.match(block, /deletePrivateObject\(\{ tenantId: id, key: storedObject.key \}\)/);
});
