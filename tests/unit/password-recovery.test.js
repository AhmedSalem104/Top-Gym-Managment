'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const {
    createPasswordRecoveryService,
    TOKEN_TTL_MINUTES,
    tokenDigest
} = require('../../src/services/password-recovery-service');
const { createPasswordRecoveryRateLimit } = require('../../src/middleware/rate-limit.middleware');
const { createEmailNotificationService } = require('../../src/services/email-notification-service');
const { classifyMigration } = require('../../scripts/production-migration-gate');

const sql = {
    NVarChar: (size) => `nvarchar(${size})`,
    Char: (size) => `char(${size})`,
    DateTime2: (scale) => `datetime2(${scale})`,
    Int: 'int'
};

function makeTransaction(queryHandler) {
    return { request: () => {
        const inputs = {};
        return {
            input(name, _type, value) { inputs[name] = value; return this; },
            query: (query) => queryHandler(query, inputs)
        };
    } };
}

function responseDouble() {
    return {
        statusCode: 200,
        headers: {},
        set(name, value) { this.headers[name] = value; return this; },
        status(value) { this.statusCode = value; return this; },
        json(value) { this.body = value; return this; }
    };
}

test('recovery requests return the same generic result for known and unknown accounts; only hashed tokens are stored', async () => {
    const issued = [];
    const mail = [];
    let userExists = true;
    const service = createPasswordRecoveryService({
        sql,
        publicAppUrl: 'https://getlogicfit.com',
        requireHttps: true,
        now: () => new Date('2026-10-26T12:00:00Z'),
        randomBytes: () => Buffer.alloc(32, 7),
        emailService: {
            canSendTo: () => true,
            async send(message) { mail.push(message); return { status: 'sent' }; }
        },
        async withTransaction(callback) {
            return callback(makeTransaction(async (query, inputs) => {
                if (query.includes('SELECT TOP (1) id,email,status')) {
                    return { recordset: userExists ? [{ id: 42, email: 'owner@example.test', status: 'Active' }] : [] };
                }
                if (query.includes('INSERT INTO dbo.gym_password_recovery_tokens')) issued.push({ query, inputs });
                return { recordset: [] };
            }));
        }
    });

    assert.deepEqual(await service.requestRecovery({ email: 'OWNER@example.test' }), { accepted: true });
    assert.equal(issued.length, 1);
    assert.equal(mail.length, 1);
    assert.deepEqual(mail[0].recipients, ['owner@example.test']);
    assert.equal(issued[0].inputs.tokenHash, tokenDigest(Buffer.alloc(32, 7).toString('base64url')));
    assert.ok(!issued[0].query.includes('token=@'));
    assert.match(mail[0].email.text, /#recovery=/);
    assert.ok(!mail[0].email.text.includes(issued[0].inputs.tokenHash));
    assert.equal(new URL(mail[0].email.text.match(/https:\/\/[^\s]+/)[0]).pathname, '/reset-password');
    assert.equal(issued[0].inputs.expiresAt.toISOString(), '2026-10-26T12:30:00.000Z');

    userExists = false;
    const beforeUnknown = mail.length;
    assert.deepEqual(await service.requestRecovery({ email: 'unknown@example.test' }), { accepted: true });
    assert.equal(mail.length, beforeUnknown);
    assert.equal(TOKEN_TTL_MINUTES, 30);
    await assert.rejects(
        createPasswordRecoveryService({ emailService: { canSendTo: () => true }, publicAppUrl: 'http://insecure.example.test', requireHttps: true })
            .requestRecovery({ email: 'nobody@example.test' }),
        (error) => error.code === 'PASSWORD_RECOVERY_UNAVAILABLE' && error.statusCode === 503
    );
});

test('completion consumes the token transactionally, updates the existing password policy, and revokes both session families', async () => {
    const token = Buffer.alloc(32, 9).toString('base64url');
    const queryLog = [];
    let hashCalls = 0;
    let revokeUserId = null;
    const pool = { request: () => makeTransaction(async (query, inputs) => {
        queryLog.push({ query, inputs });
        return { recordset: [{ user_id: 17 }] };
    }).request() };
    const service = createPasswordRecoveryService({
        getPool: async () => pool,
        sql,
        emailService: {},
        auth: {
            validatePassword(value) { if (String(value).length < 8) throw Object.assign(new Error('short'), { code: 'INVALID_PASSWORD' }); return value; },
            async hashPassword(value) { hashCalls += 1; return `hashed:${value}`; }
        },
        sessions: { async revokeForUser(id, executor) { assert.ok(executor); revokeUserId = id; } },
        async withTransaction(callback) {
            return callback(makeTransaction(async (query, inputs) => {
                queryLog.push({ query, inputs });
                if (query.includes('SELECT TOP (1) t.user_id,u.status')) return { recordset: [{ user_id: 17, status: 'Active' }] };
                return { recordset: [] };
            }));
        }
    });

    assert.deepEqual(await service.completeRecovery({ token, newPassword: 'new-password-1', confirmPassword: 'new-password-1' }), { changed: true });
    assert.equal(hashCalls, 1);
    assert.equal(revokeUserId, 17);
    assert.ok(queryLog.some(({ query }) => query.includes('UPDATE dbo.gym_mobile_refresh_sessions')));
    assert.ok(queryLog.some(({ query }) => query.includes('used_at=SYSUTCDATETIME()')));
    assert.ok(queryLog.some(({ inputs }) => inputs.passwordHash === 'hashed:new-password-1'));

    const beforeInvalid = hashCalls;
    await assert.rejects(service.completeRecovery({ token: 'bad', newPassword: 'new-password-1', confirmPassword: 'new-password-1' }),
        (error) => error.code === 'INVALID_RECOVERY_TOKEN');
    await assert.rejects(service.completeRecovery({ token, newPassword: 'new-password-1', confirmPassword: 'different-password' }),
        (error) => error.code === 'PASSWORD_CONFIRMATION_MISMATCH');
    assert.equal(hashCalls, beforeInvalid);
});

test('password recovery limits IP, account identifier, and token using non-reversible bucket keys', async () => {
    const keys = [];
    const store = { async increment(key, { windowMs }) {
        keys.push(key);
        const count = keys.filter((item) => item === key).length;
        return { count, resetAt: Date.now() + windowMs };
    } };
    const limit = createPasswordRecoveryRateLimit({ store, windowMs: 60_000, requestIpMax: 5, emailMax: 1, completeIpMax: 5, tokenMax: 1 });
    let response = responseDouble();
    let nextCalls = 0;
    await limit.request({ ip: '192.0.2.10', body: { email: 'sensitive@example.test' } }, response, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    response = responseDouble();
    await limit.request({ ip: '192.0.2.11', body: { email: 'sensitive@example.test' } }, response, () => { nextCalls += 1; });
    assert.equal(response.statusCode, 202);
    assert.deepEqual(response.body, { accepted: true });
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(nextCalls, 1);
    assert.ok(keys.every((key) => !key.includes('sensitive@example.test')));
    assert.ok(keys.some((key) => key.endsWith(crypto.createHash('sha256').update('sensitive@example.test').digest('hex'))));
});

test('password recovery migration is additive, checksummed, and classified for the canonical release gate', () => {
    const fileName = '041-password-recovery-tokens.sql';
    const migration = read(`database/migrations/${fileName}`);
    const checksum = crypto.createHash('sha256').update(migration).digest('hex');
    const manifest = JSON.parse(read('database/migration-manifest.json'));
    assert.equal(manifest.migrations[fileName].checksum, checksum);
    assert.equal(classifyMigration({ fileName, version: '041', source: migration, checksum }, manifest.migrations[fileName]).classification, 'SAFE_AUTOMATIC');
    assert.match(migration, /token_hash CHAR\(64\)/);
    assert.match(migration, /ON DELETE CASCADE/);
    assert.doesNotMatch(migration, /token\s+NVARCHAR|plaintext|password_hash/i);
});

test('password recovery email can use a validated per-message recipient without changing default notification routing', async () => {
    const messages = [];
    const service = createEmailNotificationService({
        enabled: true,
        from: 'no-reply@example.test',
        recipients: 'platform@example.test',
        transporter: { async sendMail(message) { messages.push(message); } },
        logger: { warn() {} }
    });

    assert.equal(service.isConfigured(), true);
    assert.equal(service.canSendTo('owner@example.test'), true);
    assert.equal(service.canSendTo('not-an-email'), false);
    assert.deepEqual(await service.send({
        email: { subject: 'Recovery', text: 'Link', html: '<p>Link</p>' }
    }), { status: 'sent' });
    assert.deepEqual(messages[0].to, ['platform@example.test']);
    assert.deepEqual(await service.send({
        recipients: ['Owner@example.test'],
        email: { subject: 'Recovery', text: 'Link', html: '<p>Link</p>' }
    }), { status: 'sent' });
    assert.deepEqual(messages[1].to, ['owner@example.test']);
});

test('public login no longer exposes bootstrap credential names or setup state', () => {
    const login = read('public/index.html');
    const controller = read('src/controllers/auth.controller.js');
    assert.doesNotMatch(login, /AUTH_OWNER_(?:EMAIL|PASSWORD)/);
    assert.doesNotMatch(controller, /setupRequired/);
});
