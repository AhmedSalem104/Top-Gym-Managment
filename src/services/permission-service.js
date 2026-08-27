'use strict';

const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const userRepository = require('../repositories/user.repository');
const sessionRepository = require('../repositories/session.repository');
const { currentTenantId, runTenantContext } = require('../tenancy/tenant-context');
const { ROLES } = require('../permissions/roles');
const {
    KNOWN_PERMISSION_CODES,
    LEGACY_ASSISTANT_DEFAULT_PERMISSIONS,
    OWNER_ONLY_PERMISSION_CODES,
    PERMISSION_CATALOG,
    SAFE_ASSISTANT_DEFAULT_PERMISSIONS,
    hasPermission
} = require('../permissions/permissions');

const PERMISSION_SCHEMA_SQL = `
IF OBJECT_ID(N'dbo.gym_user_permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_user_permissions (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_user_permissions PRIMARY KEY,
        user_id INT NOT NULL,
        permission_code VARCHAR(100) NOT NULL,
        is_granted BIT NOT NULL CONSTRAINT DF_gym_user_permissions_granted DEFAULT (0),
        updated_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_user_permissions_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_user_permissions_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_user_permissions_user_permission UNIQUE (user_id, permission_code),
        CONSTRAINT FK_gym_user_permissions_user FOREIGN KEY (user_id)
            REFERENCES dbo.gym_users(id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'dbo.gym_permission_audit', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_permission_audit (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_permission_audit PRIMARY KEY,
        target_user_id INT NOT NULL,
        actor_user_id INT NOT NULL,
        permission_code VARCHAR(100) NOT NULL,
        old_is_granted BIT NULL,
        new_is_granted BIT NOT NULL,
        reason NVARCHAR(500) NOT NULL,
        ip_address VARCHAR(64) NULL,
        user_agent NVARCHAR(512) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_permission_audit_created DEFAULT (SYSUTCDATETIME())
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_user_permissions_user'
      AND object_id = OBJECT_ID(N'dbo.gym_user_permissions')
)
BEGIN
    CREATE INDEX IX_gym_user_permissions_user
        ON dbo.gym_user_permissions(user_id, permission_code, is_granted);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_permission_audit_target_date'
      AND object_id = OBJECT_ID(N'dbo.gym_permission_audit')
)
BEGIN
    CREATE INDEX IX_gym_permission_audit_target_date
        ON dbo.gym_permission_audit(target_user_id, created_at DESC, id DESC);
END;
`;

let permissionReadyPromise;

function permissionValuesSql(codes) {
    return codes.map((code) => `('${String(code).replaceAll("'", "''")}')`).join(', ');
}

function normalizeUserId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        const error = new Error('معرّف الحساب غير صحيح.');
        error.statusCode = 400;
        error.expose = true;
        error.code = 'INVALID_USER_ID';
        throw error;
    }
    return id;
}

function permissionError(message, statusCode = 400, code = 'INVALID_PERMISSIONS') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function normalizeReason(value) {
    const reason = String(value ?? '').trim();
    if (!reason) throw permissionError('سبب تعديل الصلاحيات مطلوب.', 400, 'PERMISSION_CHANGE_REASON_REQUIRED');
    if (reason.length > 500) throw permissionError('سبب تعديل الصلاحيات أطول من المسموح.', 400, 'PERMISSION_REASON_TOO_LONG');
    return reason;
}

function normalizeRequestedPermissions(value) {
    if (Array.isArray(value)) {
        const requested = Object.fromEntries(value.map((code) => [String(code), true]));
        return normalizeRequestedPermissions(requested);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw permissionError('صيغة الصلاحيات غير صحيحة.', 400, 'INVALID_PERMISSION_PAYLOAD');
    }

    const unknown = Object.keys(value).filter((code) => !KNOWN_PERMISSION_CODES.has(code));
    if (unknown.length) throw permissionError(`صلاحية غير معروفة: ${unknown[0]}.`, 400, 'UNKNOWN_PERMISSION');

    const ownerOnly = Object.keys(value).find((code) => OWNER_ONLY_PERMISSION_CODES.has(code) && Boolean(value[code]));
    if (ownerOnly) throw permissionError('لا يمكن منح صلاحية Owner لحساب Assistant.', 403, 'OWNER_ONLY_PERMISSION');

    return new Map(PERMISSION_CATALOG
        .filter((item) => !item.ownerOnly)
        .map((item) => [item.code, Boolean(value[item.code])]));
}

async function createTables() {
    const pool = await getPool();
    await pool.request().batch(PERMISSION_SCHEMA_SQL);
}

async function seedAssistantPermissions(userId, defaults = SAFE_ASSISTANT_DEFAULT_PERMISSIONS) {
    const id = normalizeUserId(userId);
    const codes = [...new Set(defaults)].filter((code) => KNOWN_PERMISSION_CODES.has(code) && !OWNER_ONLY_PERMISSION_CODES.has(code));
    if (!codes.length) return;
    const pool = await getPool();
    const values = permissionValuesSql(codes);
    await pool.request()
        .input('userId', sql.Int, id)
        .query(`
            INSERT INTO dbo.gym_user_permissions (user_id, permission_code, is_granted, updated_at)
            SELECT @userId, valuesTable.permission_code, 1, SYSUTCDATETIME()
            FROM (VALUES ${values}) AS valuesTable(permission_code)
            WHERE NOT EXISTS (
                SELECT 1 FROM dbo.gym_user_permissions existing
                WHERE existing.user_id = @userId
                  AND existing.permission_code = valuesTable.permission_code
            );
        `);
}

async function seedExistingAssistants() {
    const pool = await getPool();
    const tenantTable = await pool.request().query("SELECT OBJECT_ID(N'dbo.gym_user_tenants', N'U') AS object_id;");
    if (!tenantTable.recordset[0]?.object_id) {
        const legacyResult = await pool.request().query("SELECT id FROM dbo.gym_users WHERE role = 'Assistant' ORDER BY id;");
        for (const row of legacyResult.recordset) {
            // Legacy installations do not have tenant membership metadata yet.
            await seedAssistantPermissions(row.id, LEGACY_ASSISTANT_DEFAULT_PERMISSIONS);
        }
        return;
    }

    const result = await pool.request().query(`
        SELECT DISTINCT u.id, ut.tenant_id
        FROM dbo.gym_users u
        INNER JOIN dbo.gym_user_tenants ut ON ut.user_id=u.id
        WHERE u.role='Assistant' AND ut.status='active'
        ORDER BY u.id, ut.tenant_id;
    `);
    for (const row of result.recordset) {
        // Existing accounts retain every route that was available before the
        // migration. New accounts use the safer default above. The nested
        // tenant context is required when the permissions table has already
        // been upgraded with a non-null tenant_id column.
        await runTenantContext({ tenantId: Number(row.tenant_id), mode: 'tenant' }, () => seedAssistantPermissions(row.id, LEGACY_ASSISTANT_DEFAULT_PERMISSIONS));
    }
}

async function ensurePermissionTables() {
    if (!permissionReadyPromise) {
        permissionReadyPromise = (async () => {
            await createTables();
            await seedExistingAssistants();
        })().catch((error) => {
            permissionReadyPromise = null;
            throw error;
        });
    }
    return permissionReadyPromise;
}

async function getEffectivePermissions(userId, role) {
    if (role === ROLES.OWNER || role === ROLES.PLATFORM_ADMIN) return ['*'];
    await ensurePermissionTables();
    const result = await getPool().then((pool) => pool.request()
        .input('userId', sql.Int, normalizeUserId(userId))
        .query('SELECT permission_code FROM dbo.gym_user_permissions WHERE user_id=@userId AND is_granted=1 ORDER BY permission_code;'));
    return result.recordset.map((row) => String(row.permission_code));
}

function publicUser(row, permissions = []) {
    if (!row) return null;
    return {
        id: Number(row.id),
        name: row.full_name,
        email: row.email,
        role: String(row.role || ROLES.ASSISTANT),
        status: row.status,
        permissions: [...permissions],
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
    };
}

async function getAssistant(id) {
    const userId = normalizeUserId(id);
    const result = await userRepository.findPublicById(userId, currentTenantId({ required: true }));
    const user = result.recordset[0];
    if (!user) throw permissionError('الحساب غير موجود.', 404, 'USER_NOT_FOUND');
    if (user.role !== ROLES.ASSISTANT) throw permissionError('لا يمكن تعديل صلاحيات حساب Owner.', 403, 'OWNER_ACCOUNT_PROTECTED');
    return user;
}

async function getLastPermissionAudit(targetUserId) {
    await ensurePermissionTables();
    const result = await getPool().then((pool) => pool.request()
        .input('targetUserId', sql.Int, normalizeUserId(targetUserId))
        .query(`
            SELECT TOP (1)
                audit.permission_code,
                audit.new_is_granted,
                audit.reason,
                audit.created_at,
                actor.id AS actor_id,
                actor.full_name AS actor_name,
                actor.email AS actor_email
            FROM dbo.gym_permission_audit AS audit
            LEFT JOIN dbo.gym_users AS actor ON actor.id = audit.actor_user_id
            WHERE audit.target_user_id = @targetUserId
            ORDER BY audit.created_at DESC, audit.id DESC;
        `));
    const row = result.recordset[0];
    if (!row) return null;
    return {
        permissionCode: row.permission_code,
        granted: Boolean(row.new_is_granted),
        reason: row.reason,
        at: row.created_at ? new Date(row.created_at).toISOString() : null,
        by: row.actor_id ? { id: Number(row.actor_id), name: row.actor_name, email: row.actor_email } : null
    };
}

async function getUserPermissionState(id) {
    const user = await getAssistant(id);
    const permissions = await getEffectivePermissions(user.id, user.role);
    const granted = new Set(permissions);
    return {
        user: publicUser(user, permissions),
        lastModified: await getLastPermissionAudit(user.id),
        permissions: PERMISSION_CATALOG
            .filter((item) => !item.ownerOnly)
            .map((item) => ({ ...item, granted: granted.has(item.code) }))
    };
}

async function updateUserPermissions(id, actorUserId, requested, options = {}) {
    const target = await getAssistant(id);
    const actorId = normalizeUserId(actorUserId);
    const actorResult = await userRepository.findPublicById(actorId, currentTenantId({ required: true }));
    const actor = actorResult.recordset[0];
    if (!actor || actor.role !== ROLES.OWNER) {
        throw permissionError('يجب أن يكون منفذ تعديل الصلاحيات Owner.', 403, 'OWNER_REQUIRED');
    }
    const reason = normalizeReason(options.reason);
    const nextState = normalizeRequestedPermissions(requested);
    await ensurePermissionTables();

    await withTransaction(async (transaction) => {
        for (const [permissionCode, nextGranted] of nextState.entries()) {
            const currentResult = await transaction.request()
                .input('userId', sql.Int, target.id)
                .input('permissionCode', sql.VarChar(100), permissionCode)
                .query('SELECT is_granted FROM dbo.gym_user_permissions WITH (UPDLOCK, HOLDLOCK) WHERE user_id=@userId AND permission_code=@permissionCode;');
            const current = currentResult.recordset[0];
            const oldGranted = current ? Boolean(current.is_granted) : false;
            if (oldGranted === nextGranted) continue;

            await transaction.request()
                .input('userId', sql.Int, target.id)
                .input('permissionCode', sql.VarChar(100), permissionCode)
                .input('isGranted', sql.Bit, nextGranted)
                .input('actorUserId', sql.Int, actorId)
                .query(`
                    UPDATE dbo.gym_user_permissions
                    SET is_granted=@isGranted, updated_by_user_id=@actorUserId, updated_at=SYSUTCDATETIME()
                    WHERE user_id=@userId AND permission_code=@permissionCode;
                    IF @@ROWCOUNT = 0
                    INSERT INTO dbo.gym_user_permissions (user_id, permission_code, is_granted, updated_by_user_id)
                    VALUES (@userId, @permissionCode, @isGranted, @actorUserId);
                `);

            await transaction.request()
                .input('targetUserId', sql.Int, target.id)
                .input('actorUserId', sql.Int, actorId)
                .input('permissionCode', sql.VarChar(100), permissionCode)
                .input('oldGranted', sql.Bit, oldGranted)
                .input('newGranted', sql.Bit, nextGranted)
                .input('reason', sql.NVarChar(500), reason)
                .input('ipAddress', sql.VarChar(64), String(options.ipAddress || '').slice(0, 64) || null)
                .input('userAgent', sql.NVarChar(512), String(options.userAgent || '').slice(0, 512) || null)
                .query(`
                    INSERT INTO dbo.gym_permission_audit
                        (target_user_id, actor_user_id, permission_code, old_is_granted, new_is_granted, reason, ip_address, user_agent)
                    VALUES
                        (@targetUserId, @actorUserId, @permissionCode, @oldGranted, @newGranted, @reason, @ipAddress, @userAgent);
                `);
        }
    });

    // Permission changes become effective immediately and cannot be kept in a
    // previously authenticated Assistant session.
    await sessionRepository.revokeForUser(target.id);
    return getUserPermissionState(target.id);
}

async function resetUserPermissions(id, actorUserId, options = {}) {
    const defaults = Object.fromEntries(PERMISSION_CATALOG
        .filter((item) => !item.ownerOnly)
        .map((item) => [item.code, SAFE_ASSISTANT_DEFAULT_PERMISSIONS.includes(item.code)]));
    return updateUserPermissions(id, actorUserId, defaults, options);
}

function catalog() {
    return PERMISSION_CATALOG.map((item) => ({ ...item }));
}

module.exports = {
    PERMISSION_SCHEMA_SQL,
    catalog,
    ensurePermissionTables,
    getEffectivePermissions,
    getUserPermissionState,
    hasPermission,
    resetUserPermissions,
    seedAssistantPermissions,
    updateUserPermissions
};
