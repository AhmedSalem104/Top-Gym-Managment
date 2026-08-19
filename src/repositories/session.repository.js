'use strict';

const { getPool, sql } = require('../database/pool');

async function create({ userId, tokenHash, expiresAt, ipAddress, userAgent }) {
    const pool = await getPool();
    return pool.request()
        .input('userId', sql.Int, userId)
        .input('tokenHash', sql.Char(64), tokenHash)
        .input('expiresAt', sql.DateTime2(0), expiresAt)
        .input('ipAddress', sql.NVarChar(64), ipAddress)
        .input('userAgent', sql.NVarChar(512), userAgent)
        .query('INSERT INTO dbo.gym_auth_sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES (@userId, @tokenHash, @expiresAt, @ipAddress, @userAgent); UPDATE dbo.gym_users SET last_login_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @userId;');
}

async function findActiveWithUser(tokenHash) {
    const pool = await getPool();
    return pool.request()
        .input('tokenHash', sql.Char(64), tokenHash)
        .query(`SELECT TOP (1) u.id, u.full_name, u.email, u.role, u.status, u.last_login_at, s.id AS session_id
                FROM dbo.gym_auth_sessions AS s
                INNER JOIN dbo.gym_users AS u ON u.id = s.user_id
                WHERE s.token_hash = @tokenHash
                  AND s.revoked_at IS NULL
                  AND s.expires_at > SYSUTCDATETIME()
                  AND u.status = 'Active';`);
}

async function touch(id) {
    const pool = await getPool();
    return pool.request()
        .input('sessionId', sql.UniqueIdentifier, id)
        .query('UPDATE dbo.gym_auth_sessions SET last_seen_at = SYSUTCDATETIME() WHERE id = @sessionId;');
}

async function revokeByTokenHash(tokenHash) {
    const pool = await getPool();
    return pool.request()
        .input('tokenHash', sql.Char(64), tokenHash)
        .query('UPDATE dbo.gym_auth_sessions SET revoked_at = SYSUTCDATETIME() WHERE token_hash = @tokenHash AND revoked_at IS NULL;');
}

async function revokeForUser(id) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .query('UPDATE dbo.gym_auth_sessions SET revoked_at=SYSUTCDATETIME() WHERE user_id=@id AND revoked_at IS NULL;');
}

module.exports = { create, findActiveWithUser, revokeByTokenHash, revokeForUser, touch };
