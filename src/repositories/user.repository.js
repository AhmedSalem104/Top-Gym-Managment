'use strict';

const { getPool, sql } = require('../database/pool');

async function findOwner() {
    const pool = await getPool();
    return pool.request().query("SELECT TOP (1) id FROM dbo.gym_users WHERE role = 'Owner';");
}

async function findByEmail(emailNormalized) {
    const pool = await getPool();
    return pool.request()
        .input('emailNormalized', sql.NVarChar(254), emailNormalized)
        .query('SELECT TOP (1) * FROM dbo.gym_users WHERE email_normalized = @emailNormalized;');
}

async function touchLogin(userId) {
    const pool = await getPool();
    return pool.request()
        .input('userId', sql.Int, userId)
        .query('UPDATE dbo.gym_users SET last_login_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @userId;');
}

async function createOwner({ fullName, email, passwordHash }) {
    const pool = await getPool();
    return pool.request()
        .input('fullName', sql.NVarChar(120), fullName)
        .input('email', sql.NVarChar(254), email)
        .input('emailNormalized', sql.NVarChar(254), email)
        .input('passwordHash', sql.NVarChar(512), passwordHash)
        .query("INSERT INTO dbo.gym_users (full_name, username, email, email_normalized, password_hash, role, status) OUTPUT INSERTED.id VALUES (@fullName, @email, @email, @emailNormalized, @passwordHash, 'Owner', 'Active');");
}

async function list(tenantId = null) {
    const pool = await getPool();
    return pool.request()
        .input('tenantId', sql.Int, tenantId == null ? null : Number(tenantId))
        .query("SELECT id, full_name, email, role, status, last_login_at, created_at, updated_at FROM dbo.gym_users WHERE @tenantId IS NULL OR EXISTS (SELECT 1 FROM dbo.gym_user_tenants ut WHERE ut.user_id=id AND ut.tenant_id=@tenantId AND ut.status='active') ORDER BY CASE WHEN role = 'Owner' THEN 0 ELSE 1 END, full_name, id;");
}

async function findRoleById(id, tenantId = null) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .input('tenantId', sql.Int, tenantId == null ? null : Number(tenantId))
        .query("SELECT TOP (1) id, role FROM dbo.gym_users WHERE id=@id AND (@tenantId IS NULL OR EXISTS (SELECT 1 FROM dbo.gym_user_tenants ut WHERE ut.user_id=id AND ut.tenant_id=@tenantId AND ut.status='active')); ");
}

async function createAssistant({ fullName, email, passwordHash }) {
    const pool = await getPool();
    return pool.request()
        .input('fullName', sql.NVarChar(120), fullName)
        .input('email', sql.NVarChar(254), email)
        .input('emailNormalized', sql.NVarChar(254), email)
        .input('passwordHash', sql.NVarChar(512), passwordHash)
        .query("INSERT INTO dbo.gym_users (full_name, username, email, email_normalized, password_hash, role, status) OUTPUT INSERTED.id, INSERTED.full_name, INSERTED.email, INSERTED.role, INSERTED.status, INSERTED.last_login_at VALUES (@fullName, @email, @email, @emailNormalized, @passwordHash, 'Assistant', 'Active');");
}

async function updateAssistant({ id, fullName, email, passwordHash, tenantId = null }) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .input('fullName', sql.NVarChar(120), fullName)
        .input('email', sql.NVarChar(254), email)
        .input('emailNormalized', sql.NVarChar(254), email)
        .input('passwordHash', sql.NVarChar(512), passwordHash)
        .input('tenantId', sql.Int, tenantId == null ? null : Number(tenantId))
        .query(`UPDATE dbo.gym_users
            SET full_name=@fullName, email=@email, email_normalized=@emailNormalized,
                password_hash=COALESCE(@passwordHash, password_hash), updated_at=SYSUTCDATETIME()
            WHERE id=@id AND (@tenantId IS NULL OR EXISTS (SELECT 1 FROM dbo.gym_user_tenants ut WHERE ut.user_id=id AND ut.tenant_id=@tenantId AND ut.status='active'));`);
}

async function findPublicById(id, tenantId = null) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .input('tenantId', sql.Int, tenantId == null ? null : Number(tenantId))
        .query("SELECT TOP (1) id, full_name, email, role, status, last_login_at FROM dbo.gym_users WHERE id=@id AND (@tenantId IS NULL OR EXISTS (SELECT 1 FROM dbo.gym_user_tenants ut WHERE ut.user_id=id AND ut.tenant_id=@tenantId AND ut.status='active')); ");
}

async function updateStatus({ id, status, tenantId = null }) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .input('status', sql.VarChar(20), status)
        .input('tenantId', sql.Int, tenantId == null ? null : Number(tenantId))
        .query("UPDATE dbo.gym_users SET status=@status, updated_at=SYSUTCDATETIME() WHERE id=@id AND (@tenantId IS NULL OR EXISTS (SELECT 1 FROM dbo.gym_user_tenants ut WHERE ut.user_id=id AND ut.tenant_id=@tenantId AND ut.status='active')); IF @@ROWCOUNT > 0 AND @status = 'Disabled' UPDATE dbo.gym_auth_sessions SET revoked_at=SYSUTCDATETIME() WHERE user_id=@id AND revoked_at IS NULL;");
}

async function deleteAssistant(id, tenantId = null) {
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .input('tenantId', sql.Int, tenantId == null ? null : Number(tenantId))
        .query("DELETE FROM dbo.gym_users OUTPUT DELETED.id WHERE id=@id AND role='Assistant' AND (@tenantId IS NULL OR EXISTS (SELECT 1 FROM dbo.gym_user_tenants ut WHERE ut.user_id=id AND ut.tenant_id=@tenantId AND ut.status='active')); ");
}

module.exports = {
    createAssistant,
    createOwner,
    deleteAssistant,
    findByEmail,
    findOwner,
    findPublicById,
    findRoleById,
    list,
    touchLogin,
    updateAssistant,
    updateStatus
};
