'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { secretRing } = require('./secret-ring');
const { currentTenantId } = require('../tenancy/tenant-context');

const TOKEN_PREFIX = 'LFQR1.';
const AAD = Buffer.from('logicfit:attendance-qr:v1', 'utf8');
const KEY_INFO = Buffer.from('logicfit:attendance-qr:key:v1', 'utf8');
const NONCE_INFO = Buffer.from('logicfit:attendance-qr:nonce:v1\0', 'utf8');

function positiveId(value) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) return null;
    return id;
}

function createAttendanceQrTokenCrypto(ring = secretRing) {
    function keyFor(secret) {
        return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.alloc(0), KEY_INFO, 32));
    }

    function nonceFor(key, payload) {
        return crypto.createHmac('sha256', key).update(NONCE_INFO).update(payload).digest().subarray(0, 12);
    }

    function encode({ tenantId, memberId }) {
        const tenant = positiveId(tenantId);
        const member = positiveId(memberId);
        if (!tenant || !member) throw new TypeError('Attendance QR identity is invalid.');
        const payload = Buffer.from(JSON.stringify({ v: 1, t: tenant, m: member }), 'utf8');
        const key = keyFor(ring.getCurrentSecret('membershipCode'));
        const nonce = nonceFor(key, payload);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
        cipher.setAAD(AAD);
        const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
        return `${TOKEN_PREFIX}${Buffer.concat([nonce, ciphertext, cipher.getAuthTag()]).toString('base64url')}`;
    }

    function decode(value) {
        const token = String(value || '').trim();
        if (!token.startsWith(TOKEN_PREFIX)) return null;
        const encoded = token.slice(TOKEN_PREFIX.length);
        if (!/^[A-Za-z0-9_-]{32,160}$/.test(encoded)) return null;
        const data = Buffer.from(encoded, 'base64url');
        if (data.length < 29) return null;
        const nonce = data.subarray(0, 12);
        const ciphertext = data.subarray(12, -16);
        const tag = data.subarray(-16);
        for (const entry of ring.getVerificationSecrets('membershipCode')) {
            try {
                const key = keyFor(entry.secret);
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
                decipher.setAAD(AAD);
                decipher.setAuthTag(tag);
                const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
                const expectedNonce = nonceFor(key, plaintext);
                if (!crypto.timingSafeEqual(nonce, expectedNonce)) continue;
                const identity = JSON.parse(plaintext.toString('utf8'));
                const tenantId = positiveId(identity?.t);
                const memberId = positiveId(identity?.m);
                if (identity?.v !== 1 || !tenantId || !memberId) continue;
                return { tenantId, memberId };
            } catch (_) {
                // An unknown, malformed, or tampered token is not an identity.
            }
        }
        return null;
    }

    return Object.freeze({ encode, decode });
}

const tokenCrypto = createAttendanceQrTokenCrypto();

function createAttendanceQrTokenService({ crypto = tokenCrypto, getPool: resolvePool = getPool, currentTenantId: resolveTenant = currentTenantId, sqlClient = sql } = {}) {
async function getForMember(memberId) {
    const id = positiveId(memberId);
    if (!id) {
        const error = new Error('معرّف العضو غير صالح.');
        error.statusCode = 400;
        error.expose = true;
        error.code = 'INVALID_MEMBER_ID';
        throw error;
    }
    const tenantId = resolveTenant({ required: true });
    const pool = await resolvePool();
    const result = await pool.request()
        .input('memberId', sqlClient.Int, id)
        .input('tenantId', sqlClient.Int, tenantId)
        .query('SELECT TOP (1) id FROM dbo.members WHERE id=@memberId AND tenant_id=@tenantId;');
    if (!result.recordset?.[0]) {
        const error = new Error('العضو غير موجود.');
        error.statusCode = 404;
        error.expose = true;
        error.code = 'MEMBER_NOT_FOUND';
        throw error;
    }
    return { qrToken: crypto.encode({ tenantId, memberId: id }) };
}

async function resolveForCurrentTenant(value) {
    const identity = crypto.decode(value);
    if (!identity) return null;
    const tenantId = resolveTenant({ required: true });
    if (identity.tenantId !== tenantId) return null;
    const pool = await resolvePool();
    const result = await pool.request()
        .input('memberId', sqlClient.Int, identity.memberId)
        .input('tenantId', sqlClient.Int, tenantId)
        .query('SELECT TOP (1) id FROM dbo.members WHERE id=@memberId AND tenant_id=@tenantId;');
    if (!result.recordset?.[0]) return null;
    return Number(result.recordset[0].id) || null;
}

return Object.freeze({ getForMember, resolveForCurrentTenant });
}

const attendanceQrTokenService = createAttendanceQrTokenService();

module.exports = {
    createAttendanceQrTokenCrypto,
    createAttendanceQrTokenService,
    getForMember: attendanceQrTokenService.getForMember,
    resolveForCurrentTenant: attendanceQrTokenService.resolveForCurrentTenant
};
