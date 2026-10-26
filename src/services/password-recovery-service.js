'use strict';

const crypto = require('node:crypto');
const { getPool, sql: defaultSql } = require('../database');
const { withTransaction: defaultWithTransaction } = require('../database/transaction');
const sessionRepository = require('../repositories/session.repository');
const authService = require('./auth-service');

const TOKEN_TTL_MINUTES = 30;
const GENERIC_REQUEST_RESULT = Object.freeze({ accepted: true });
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function serviceError(message, statusCode, code) {
    return Object.assign(new Error(message), { statusCode, code, expose: true });
}

function normalizeEmail(value) {
    return String(value ?? '').trim().toLowerCase().slice(0, 254);
}

function tokenDigest(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function recoveryUrl(publicAppUrl, token, { requireHttps = false } = {}) {
    let url;
    try {
        url = new URL('/reset-password', publicAppUrl);
    } catch (_) {
        throw serviceError('Password recovery is not configured.', 503, 'PASSWORD_RECOVERY_UNAVAILABLE');
    }
    if (!['https:', 'http:'].includes(url.protocol) || (requireHttps && url.protocol !== 'https:') || url.username || url.password || url.search) {
        throw serviceError('Password recovery is not configured.', 503, 'PASSWORD_RECOVERY_UNAVAILABLE');
    }
    url.hash = `recovery=${encodeURIComponent(token)}`;
    return url.toString();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function recoveryEmail(url) {
    const safeUrl = escapeHtml(url);
    const subject = 'استعادة الوصول إلى حساب Logic Fit';
    const text = `تلقينا طلبًا لاستعادة الوصول إلى حساب Logic Fit. استخدم الرابط التالي خلال ${TOKEN_TTL_MINUTES} دقيقة لإعداد كلمة مرور جديدة:\n\n${url}\n\nإذا لم تطلب ذلك، فتجاهل هذه الرسالة. لن تتغير كلمة مرورك دون استخدام الرابط.`;
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head><body dir="rtl" style="margin:0;padding:24px;background:#f5f7fb;color:#172033;font-family:Tahoma,Arial,sans-serif;text-align:right"><main style="max-width:560px;margin:auto;padding:24px;border:1px solid #e5eaf2;border-radius:14px;background:#fff"><strong dir="ltr">LOGIC FIT</strong><h1 style="font-size:21px">استعادة الوصول</h1><p style="line-height:1.8">تلقينا طلبًا لإعداد كلمة مرور جديدة لحسابك. الرابط صالح لمدة ${TOKEN_TTL_MINUTES} دقيقة ويُستخدم مرة واحدة.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#0070f3;color:#fff;text-decoration:none;font-weight:700">إعداد كلمة مرور جديدة</a></p><p style="color:#687385;font-size:13px;line-height:1.8">إذا لم تطلب استعادة الوصول، فتجاهل هذه الرسالة. لن تتغير كلمة مرورك دون استخدام الرابط.</p></main></body></html>`;
    return { subject, text, html };
}

function createPasswordRecoveryService({
    getPool: poolProvider = getPool,
    sql = defaultSql,
    withTransaction = defaultWithTransaction,
    auth = authService,
    sessions = sessionRepository,
    emailService,
    publicAppUrl = '',
    requireHttps = false,
    now = () => new Date(),
    randomBytes = crypto.randomBytes
} = {}) {
    async function requestRecovery(body = {}) {
        if (typeof emailService?.canSendTo !== 'function' || !emailService.canSendTo('recovery-check@example.invalid')) {
            throw serviceError('Password recovery is temporarily unavailable. Contact your account administrator.', 503, 'PASSWORD_RECOVERY_UNAVAILABLE');
        }
        recoveryUrl(publicAppUrl, 'configuration-check', { requireHttps });
        const email = normalizeEmail(body.email);
        let normalizedEmail = '';
        try { normalizedEmail = auth.validateEmail(email); } catch (_) { return GENERIC_REQUEST_RESULT; }

        const token = randomBytes(32).toString('base64url');
        const hashedToken = tokenDigest(token);
        const user = await withTransaction(async (transaction) => {
            const lookup = await transaction.request()
                .input('email', sql.NVarChar(254), normalizedEmail)
                .query(`SELECT TOP (1) id,email,status FROM dbo.gym_users WITH (UPDLOCK,HOLDLOCK)
                        WHERE email_normalized=@email AND status='Active';`);
            const row = lookup.recordset?.[0];
            if (!row) return null;
            await transaction.request()
                .input('userId', sql.Int, Number(row.id))
                .input('tokenHash', sql.Char(64), hashedToken)
                .input('expiresAt', sql.DateTime2(0), new Date(now().getTime() + TOKEN_TTL_MINUTES * 60_000))
                .query(`DELETE FROM dbo.gym_password_recovery_tokens WHERE user_id=@userId;
                        INSERT INTO dbo.gym_password_recovery_tokens(user_id,token_hash,expires_at)
                        VALUES(@userId,@tokenHash,@expiresAt);`);
            return { id: Number(row.id), email: String(row.email || normalizedEmail) };
        });
        if (!user) return GENERIC_REQUEST_RESULT;

        const url = recoveryUrl(publicAppUrl, token, { requireHttps });
        const result = await emailService.send({
            type: 'password_recovery',
            recipients: [user.email],
            email: recoveryEmail(url)
        });
        if (result?.status !== 'sent') {
            const pool = await poolProvider();
            await pool.request().input('tokenHash', sql.Char(64), hashedToken)
                .query(`UPDATE dbo.gym_password_recovery_tokens SET used_at=SYSUTCDATETIME()
                        WHERE token_hash=@tokenHash AND used_at IS NULL;`);
        }
        return GENERIC_REQUEST_RESULT;
    }

    async function completeRecovery(body = {}) {
        const token = String(body.token || '').trim();
        if (!TOKEN_PATTERN.test(token)) throw serviceError('The recovery link is invalid or expired.', 400, 'INVALID_RECOVERY_TOKEN');
        const newPassword = auth.validatePassword(body.newPassword, { field: 'newPassword' });
        const confirmation = String(body.confirmPassword ?? '');
        if (newPassword !== confirmation) throw serviceError('The passwords do not match.', 400, 'PASSWORD_CONFIRMATION_MISMATCH');
        const hashedToken = tokenDigest(token);
        const pool = await poolProvider();
        const preflight = await pool.request().input('tokenHash', sql.Char(64), hashedToken)
            .query(`SELECT TOP (1) user_id FROM dbo.gym_password_recovery_tokens
                    WHERE token_hash=@tokenHash AND used_at IS NULL AND expires_at>SYSUTCDATETIME();`);
        if (!preflight.recordset?.[0]) throw serviceError('The recovery link is invalid or expired.', 400, 'INVALID_RECOVERY_TOKEN');
        const passwordHash = await auth.hashPassword(newPassword);

        await withTransaction(async (transaction) => {
            const locked = await transaction.request().input('tokenHash', sql.Char(64), hashedToken)
                .query(`SELECT TOP (1) t.user_id,u.status
                        FROM dbo.gym_password_recovery_tokens AS t WITH (UPDLOCK,HOLDLOCK)
                        INNER JOIN dbo.gym_users AS u WITH (UPDLOCK,HOLDLOCK) ON u.id=t.user_id
                        WHERE t.token_hash=@tokenHash AND t.used_at IS NULL AND t.expires_at>SYSUTCDATETIME();`);
            const row = locked.recordset?.[0];
            if (!row || row.status !== 'Active') throw serviceError('The recovery link is invalid or expired.', 400, 'INVALID_RECOVERY_TOKEN');
            const userId = Number(row.user_id);
            await transaction.request()
                .input('userId', sql.Int, userId)
                .input('passwordHash', sql.NVarChar(512), passwordHash)
                .query(`UPDATE dbo.gym_users
                        SET password_hash=@passwordHash,must_change_password=0,
                            password_changed_at=SYSUTCDATETIME(),updated_at=SYSUTCDATETIME()
                        WHERE id=@userId AND status='Active';
                        IF @@ROWCOUNT<>1 THROW 51041, 'Password recovery account state changed.', 1;
                        UPDATE dbo.gym_password_recovery_tokens SET used_at=SYSUTCDATETIME()
                        WHERE user_id=@userId AND used_at IS NULL;
                        UPDATE dbo.gym_mobile_refresh_sessions SET revoked_at=SYSUTCDATETIME()
                        WHERE user_id=@userId AND revoked_at IS NULL;`);
            await sessions.revokeForUser(userId, transaction);
        });
        return { changed: true };
    }

    return Object.freeze({ requestRecovery, completeRecovery });
}

module.exports = {
    GENERIC_REQUEST_RESULT,
    TOKEN_PATTERN,
    TOKEN_TTL_MINUTES,
    createPasswordRecoveryService,
    recoveryEmail,
    recoveryUrl,
    tokenDigest
};
