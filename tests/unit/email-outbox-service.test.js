'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    MAX_ATTEMPTS, RETRY_SECONDS, TEMPLATE_BY_EVENT, createEmailOutboxService
} = require('../../src/services/email-outbox-service');

function fakeSqlType(name) {
    return (length) => `${name}(${length})`;
}

const fakeSql = {
    VarChar: fakeSqlType('varchar'), NVarChar: fakeSqlType('nvarchar'),
    BigInt: 'bigint', Int: 'int', UniqueIdentifier: 'uniqueidentifier',
    Bit: 'bit', MAX: -1
};

function fakeDatabase() {
    const records = new Map();
    let nextId = 1;
    const queries = [];
    const pool = { request: () => createRequest() };
    function createRequest() {
        const params = {};
        return {
            input(name, _type, value) { params[name] = value; return this; },
            async query(statement) {
                queries.push(statement);
                if (statement.includes('IF NOT EXISTS')) {
                    const existing = [...records.values()].find((record) => record.idempotency_key === params.idempotencyKey);
                    if (existing) return { recordset: [{ created: false }] };
                    records.set(nextId, {
                        id: nextId++, event_type: params.eventType, entity_type: params.entityType,
                        entity_id: params.entityId, recipient_reference: params.recipientReference,
                        template_key: params.templateKey, payload_json: params.payloadJson,
                        status: 'pending', attempts: 0, next_attempt_at: 0,
                        idempotency_key: params.idempotencyKey
                    });
                    return { recordset: [{ created: true }] };
                }
                if (statement.includes(';WITH claimable AS')) {
                    const candidates = [...records.values()].filter((record) => record.attempts < params.maxAttempts
                        && ((record.status === 'pending' && record.next_attempt_at <= Date.now())
                            || (record.status === 'processing' && record.lease_until <= Date.now())))
                        .sort((a, b) => a.id - b.id).slice(0, params.batchSize);
                    return { recordset: candidates.map((record) => {
                        record.status = 'processing';
                        record.attempts += 1;
                        record.lease_token = params.leaseToken;
                        record.lease_until = Date.now() + params.leaseSeconds * 1_000;
                        return { ...record };
                    }) };
                }
                const row = records.get(Number(params.id));
                if (!row || row.lease_token !== params.leaseToken || row.status !== 'processing') return { rowsAffected: [0] };
                if (statement.includes("SET status='sent'")) {
                    row.status = 'sent'; row.sent_at = Date.now(); row.last_error = null;
                } else if (statement.includes("SET status='skipped'")) {
                    row.status = 'skipped'; row.last_error = params.safeError;
                } else if (statement.includes("SET status=CASE")) {
                    row.status = params.terminal ? 'failed' : 'pending';
                    row.last_error = 'delivery_failed';
                    row.next_attempt_at = params.terminal ? row.next_attempt_at : Date.now();
                } else if (statement.includes("SET status='failed'")) {
                    for (const item of records.values()) {
                        if (item.status === 'processing' && item.lease_until <= Date.now() && item.attempts >= params.maxAttempts) {
                            item.status = 'failed'; item.last_error = 'max_attempts_exhausted';
                        }
                    }
                }
                row.lease_token = null;
                row.lease_until = null;
                return { rowsAffected: [1] };
            }
        };
    }
    return { pool, records, queries };
}

function testEvent(entityId = 91) {
    return {
        type: 'saas_subscription_request_created', entityType: 'saas_subscription_request', entityId,
        channels: { email: true },
        payload: {
            gymName: 'Synthetic Gym', planName: 'Basic', durationMonths: 6, amountDue: 1200,
            currency: 'EGP', submittedAt: '2026-09-28T10:00:00.000Z', actionUrl: '/unsafe',
            storageKey: 'private/key', proof: 'private-bytes', accessToken: 'must-not-persist'
        }
    };
}

function createService(db, sendEmailEvent, logger = { info() {}, warn() {}, error() {} }) {
    return createEmailOutboxService({ getPool: async () => db.pool, sql: fakeSql, sendEmailEvent, logger });
}

test('enqueue is transaction-executor scoped, idempotent and persists only safe template payload', async () => {
    const db = fakeDatabase();
    const service = createService(db, async () => ({ status: 'sent' }));
    const transactionCalls = [];
    const executor = { request: () => ({
        input(name, _type, value) { transactionCalls.push([name, value]); return this; },
        async query(statement) {
            assert.match(statement, /INSERT INTO dbo\.email_outbox/);
            return db.pool.request().input('eventType', null, transactionCalls.find(([key]) => key === 'eventType')[1])
                .input('entityType', null, transactionCalls.find(([key]) => key === 'entityType')[1])
                .input('entityId', null, transactionCalls.find(([key]) => key === 'entityId')[1])
                .input('recipientReference', null, transactionCalls.find(([key]) => key === 'recipientReference')[1])
                .input('templateKey', null, transactionCalls.find(([key]) => key === 'templateKey')[1])
                .input('payloadJson', null, transactionCalls.find(([key]) => key === 'payloadJson')[1])
                .input('idempotencyKey', null, transactionCalls.find(([key]) => key === 'idempotencyKey')[1])
                .query(statement);
        }
    }) };
    const first = await service.enqueue(testEvent(), { executor });
    const second = await service.enqueue(testEvent(), { executor });
    assert.equal(first.status, 'pending');
    assert.equal(second.status, 'already_enqueued');
    assert.equal(db.records.size, 1);
    const stored = [...db.records.values()][0];
    const payload = JSON.parse(stored.payload_json);
    assert.equal(stored.idempotency_key, 'saas_subscription_request_created:91');
    assert.equal(stored.template_key, TEMPLATE_BY_EVENT.saas_subscription_request_created);
    assert.equal(stored.recipient_reference, 'platform-admin-config');
    assert.equal(payload.durationMonths, 6);
    assert.equal(payload.actionUrl, '/platform-admin.html#subscription-requests');
    assert.equal('storageKey' in payload, false);
    assert.equal('proof' in payload, false);
    assert.equal('accessToken' in payload, false);
});

test('an outbox insert staged in a failed caller transaction is not committed as a standalone job', async () => {
    const db = fakeDatabase();
    const service = createService(db, async () => ({ status: 'sent' }));
    const staged = [];
    const executor = { request: () => ({
        values: {}, input(name, _type, value) { this.values[name] = value; return this; },
        async query() { staged.push({ ...this.values }); return { recordset: [{ created: true }] }; }
    }) };
    try {
        await service.enqueue(testEvent(92), { executor });
        throw new Error('synthetic transaction rollback');
    } catch (_) {
        staged.length = 0;
    }
    assert.equal(staged.length, 0);
    assert.equal(db.records.size, 0);
    assert.equal(db.queries.length, 0, 'enqueue must use the supplied transaction, not open an independent pool request');
});

test('SQL lease claim prevents overlapping workers from sending the same outbox row twice', async () => {
    const db = fakeDatabase();
    const seed = createService(db, async () => ({ status: 'sent' }));
    await seed.enqueue(testEvent(93));
    let sends = 0;
    const workerA = createService(db, async () => { sends += 1; await new Promise((resolve) => setTimeout(resolve, 15)); return { status: 'sent' }; });
    const workerB = createService(db, async () => { sends += 1; return { status: 'sent' }; });
    const results = await Promise.all([workerA.processBatch(), workerB.processBatch()]);
    assert.equal(results.reduce((sum, item) => sum + item.claimed, 0), 1);
    assert.equal(sends, 1);
    assert.equal([...db.records.values()][0].status, 'sent');
    const claim = db.queries.find((statement) => statement.includes(';WITH claimable AS'));
    assert.match(claim, /UPDLOCK,READPAST,READCOMMITTEDLOCK,ROWLOCK/);
});

test('pending outbox delivery survives service recreation and transitions to sent', async () => {
    const db = fakeDatabase();
    await createService(db, async () => ({ status: 'sent' })).enqueue(testEvent(94));
    let sends = 0;
    const restartedWorker = createService(db, async () => { sends += 1; return { status: 'sent' }; });
    assert.equal([...db.records.values()][0].status, 'pending');
    await restartedWorker.processBatch();
    assert.equal(sends, 1);
    assert.equal([...db.records.values()][0].status, 'sent');
});

test('SMTP temporary failures retry with bounded backoff and terminate at the configured attempt limit', async () => {
    const db = fakeDatabase();
    await createService(db, async () => ({ status: 'sent' })).enqueue(testEvent(95));
    let sends = 0;
    const worker = createService(db, async () => { sends += 1; return { status: 'failed', reason: 'secret-bearing-provider-detail' }; });
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) await worker.processBatch();
    const row = [...db.records.values()][0];
    assert.equal(sends, MAX_ATTEMPTS);
    assert.equal(row.status, 'failed');
    assert.equal(row.attempts, MAX_ATTEMPTS);
    assert.equal(row.last_error, 'delivery_failed');
    assert.deepEqual(RETRY_SECONDS, [30, 120, 600, 1800]);
    const retrySql = db.queries.find((statement) => statement.includes("SET status=CASE"));
    assert.match(retrySql, /DATEADD\(SECOND,@retrySeconds/);
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src/services/email-outbox-service.js'), 'utf8');
    assert.doesNotMatch(source, /setTimeout\(/);
});

test('worker logs use safe status metadata and never log provider errors or payloads', async () => {
    const db = fakeDatabase();
    await createService(db, async () => ({ status: 'sent' })).enqueue(testEvent(96));
    const logOutput = [];
    const logger = Object.fromEntries(['info', 'warn', 'error'].map((level) => [level, (...args) => logOutput.push(JSON.stringify(args))]));
    const worker = createService(db, async () => { throw new Error('SMTP_PASSWORD=do-not-log'); }, logger);
    await worker.processBatch();
    assert.equal(logOutput.some((item) => item.includes('SMTP_PASSWORD')), false);
    assert.equal(logOutput.some((item) => item.includes('private/key')), false);
    assert.equal(logOutput.some((item) => item.includes('private-bytes')), false);
});

test('subscription notification, proof metadata and outbox write are in the business transaction; SMTP is absent from HTTP submit path', () => {
    const root = path.join(__dirname, '..', '..');
    const service = fs.readFileSync(path.join(root, 'src/services/saas-service.js'), 'utf8');
    const start = service.indexOf('async function submitSubscriptionRequest');
    const end = service.indexOf('\nasync function listPlatformRequests', start);
    const block = service.slice(start, end);
    assert.match(block, /INSERT INTO dbo\.saas_payment_proofs/);
    assert.match(block, /notificationService\.recordEvent\(eventInput, \{ executor: transaction \}\)/);
    assert.match(block, /emailOutboxDispatcher\.enqueue\(notificationEvent, \{ executor: transaction \}\)/);
    assert.doesNotMatch(block, /sendEmailEvent\(|dispatchEvent\(notificationEvent\)/);
    const worker = fs.readFileSync(path.join(root, 'src/services/email-outbox-service.js'), 'utf8');
    assert.match(worker, /sendEmailEvent\(/);
});
