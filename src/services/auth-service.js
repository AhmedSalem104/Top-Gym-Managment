'use strict';

const crypto = require('node:crypto');
const { getPool } = require('../database');
const { config, isProduction } = require('../config/env');
const {
    ROLE_PERMISSIONS,
    assistantPathAllowed,
    canAccessRoleRequest,
    permissionsForRole
} = require('../permissions/role-permissions');
const userRepository = require('../repositories/user.repository');
const sessionRepository = require('../repositories/session.repository');

const SESSION_COOKIE_NAME = 'topgym_session';
const DEFAULT_SESSION_DAYS = 7;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, keyLength: 64 };

const AUTH_SCHEMA_SQL = `
IF OBJECT_ID(N'dbo.gym_users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_users (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_users PRIMARY KEY,
        full_name NVARCHAR(120) NOT NULL,
        username NVARCHAR(254) NULL,
        email NVARCHAR(254) NOT NULL,
        email_normalized NVARCHAR(254) NOT NULL,
        password_hash NVARCHAR(512) NOT NULL,
        role VARCHAR(20) NOT NULL CONSTRAINT DF_gym_users_role DEFAULT ('Assistant'),
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_users_status DEFAULT ('Active'),
        last_login_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_users_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_users_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_users_email UNIQUE (email_normalized),
        CONSTRAINT CK_gym_users_role CHECK (role IN ('Owner', 'Assistant')),
        CONSTRAINT CK_gym_users_status CHECK ((role = 'Owner' AND status = 'Active') OR (role = 'Assistant' AND status IN ('Active', 'Disabled')))
    );
END;

-- Backward-compatible migration for an older gym_users table that used
-- username/is_active. Existing rows are preserved and can be edited by Owner.
IF OBJECT_ID(N'dbo.gym_users', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.gym_users', N'username') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD username NVARCHAR(254) NULL;');
    IF COL_LENGTH(N'dbo.gym_users', N'email') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD email NVARCHAR(254) NULL;');
    IF COL_LENGTH(N'dbo.gym_users', N'email_normalized') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD email_normalized NVARCHAR(254) NULL;');
    IF COL_LENGTH(N'dbo.gym_users', N'status') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD status VARCHAR(20) NULL;');
    IF COL_LENGTH(N'dbo.gym_users', N'last_login_at') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD last_login_at DATETIME2(0) NULL;');

    -- A previous schema used the same constraint name for reception/manager
    -- roles. Replace it before normalizing the data to Owner/Assistant.
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_gym_users_role' AND parent_object_id = OBJECT_ID(N'dbo.gym_users'))
        EXEC(N'ALTER TABLE dbo.gym_users DROP CONSTRAINT CK_gym_users_role;');
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_gym_users_status' AND parent_object_id = OBJECT_ID(N'dbo.gym_users'))
        EXEC(N'ALTER TABLE dbo.gym_users DROP CONSTRAINT CK_gym_users_status;');

    -- SQL Server compiles a whole batch before running it. Keep all references
    -- to newly-added columns inside dynamic SQL so this also works on legacy
    -- tables where email/status did not exist at batch compilation time.
    IF COL_LENGTH(N'dbo.gym_users', N'is_active') IS NOT NULL
    BEGIN
        EXEC(N'
            UPDATE dbo.gym_users
            SET role = CASE LOWER(LTRIM(RTRIM(role))) WHEN ''owner'' THEN ''Owner'' WHEN ''manager'' THEN ''Owner'' ELSE ''Assistant'' END;
            UPDATE dbo.gym_users
            SET email = COALESCE(NULLIF(LTRIM(RTRIM(email)), ''''), NULLIF(LTRIM(RTRIM(username)), ''''), CONCAT(''legacy-'', CONVERT(VARCHAR(20), id), ''@topgym.local''))
            WHERE email IS NULL OR LTRIM(RTRIM(email)) = '''';
            UPDATE dbo.gym_users
            SET email_normalized = LOWER(LTRIM(RTRIM(email)))
            WHERE email_normalized IS NULL OR LTRIM(RTRIM(email_normalized)) = '''';
            UPDATE dbo.gym_users
            SET status = CASE WHEN role = ''Owner'' OR ISNULL(is_active, 1) = 1 THEN ''Active'' ELSE ''Disabled'' END
            WHERE status IS NULL OR LTRIM(RTRIM(status)) = '''';
        ');
    END
    ELSE
    BEGIN
        EXEC(N'
            UPDATE dbo.gym_users
            SET role = CASE LOWER(LTRIM(RTRIM(role))) WHEN ''owner'' THEN ''Owner'' WHEN ''manager'' THEN ''Owner'' ELSE ''Assistant'' END;
            UPDATE dbo.gym_users
            SET email = COALESCE(NULLIF(LTRIM(RTRIM(email)), ''''), NULLIF(LTRIM(RTRIM(username)), ''''), CONCAT(''legacy-'', CONVERT(VARCHAR(20), id), ''@topgym.local''))
            WHERE email IS NULL OR LTRIM(RTRIM(email)) = '''';
            UPDATE dbo.gym_users
            SET email_normalized = LOWER(LTRIM(RTRIM(email)))
            WHERE email_normalized IS NULL OR LTRIM(RTRIM(email_normalized)) = '''';
            UPDATE dbo.gym_users
            SET status = ''Active''
            WHERE status IS NULL OR LTRIM(RTRIM(status)) = '''';
        ');
    END;

    EXEC(N'ALTER TABLE dbo.gym_users ALTER COLUMN email NVARCHAR(254) NOT NULL;');
    EXEC(N'ALTER TABLE dbo.gym_users ALTER COLUMN email_normalized NVARCHAR(254) NOT NULL;');
    EXEC(N'ALTER TABLE dbo.gym_users ALTER COLUMN status VARCHAR(20) NOT NULL;');
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_gym_users_role' AND parent_object_id = OBJECT_ID(N'dbo.gym_users'))
        EXEC(N'ALTER TABLE dbo.gym_users ADD CONSTRAINT CK_gym_users_role CHECK (role IN (''Owner'', ''Assistant''));');
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_gym_users_status' AND parent_object_id = OBJECT_ID(N'dbo.gym_users'))
        EXEC(N'ALTER TABLE dbo.gym_users ADD CONSTRAINT CK_gym_users_status CHECK ((role = ''Owner'' AND status = ''Active'') OR (role = ''Assistant'' AND status IN (''Active'', ''Disabled'')));');
    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_gym_users_email'
          AND object_id = OBJECT_ID(N'dbo.gym_users')
    )
        EXEC(N'CREATE UNIQUE INDEX UQ_gym_users_email ON dbo.gym_users(email_normalized);');
END;

IF OBJECT_ID(N'dbo.gym_auth_sessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_auth_sessions (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_gym_auth_sessions PRIMARY KEY DEFAULT (NEWID()),
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME2(0) NOT NULL,
        revoked_at DATETIME2(0) NULL,
        ip_address NVARCHAR(64) NULL,
        user_agent NVARCHAR(512) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_auth_sessions_created_at DEFAULT (SYSUTCDATETIME()),
        last_seen_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_auth_sessions_last_seen_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_auth_sessions_token UNIQUE (token_hash),
        CONSTRAINT FK_gym_auth_sessions_user FOREIGN KEY (user_id)
            REFERENCES dbo.gym_users(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_auth_sessions_user_expiry'
      AND object_id = OBJECT_ID(N'dbo.gym_auth_sessions')
)
BEGIN
    CREATE INDEX IX_gym_auth_sessions_user_expiry
        ON dbo.gym_auth_sessions(user_id, expires_at DESC, revoked_at);
END;
`;

let authReadyPromise;
let dummyPasswordHashPromise;

function authError(message, statusCode = 400, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function normalizeEmail(value) {
    return String(value ?? '').trim().toLowerCase();
}

function validateEmail(value) {
    const email = normalizeEmail(value);
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw authError('أدخل بريدًا إلكترونيًا صحيحًا.', 400, 'INVALID_EMAIL');
    }
    return email;
}

function validateName(value) {
    const name = String(value ?? '').trim();
    if (name.length < 2 || name.length > 120) throw authError('أدخل اسمًا صحيحًا.', 400, 'INVALID_NAME');
    return name;
}

function validatePassword(value, { required = true } = {}) {
    const password = String(value ?? '');
    if (!required && !password) return '';
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        throw authError(`كلمة المرور يجب أن تكون بين ${PASSWORD_MIN_LENGTH} و${PASSWORD_MAX_LENGTH} حرفًا.`, 400, 'INVALID_PASSWORD');
    }
    return password;
}

function scryptAsync(password, salt, params = SCRYPT_PARAMS) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, params.keyLength, {
            N: params.N,
            r: params.r,
            p: params.p,
            maxmem: 128 * 1024 * 1024
        }, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
    });
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derivedKey = await scryptAsync(password, salt);
    return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`;
}

async function verifyPassword(password, encodedHash) {
    try {
        const [algorithm, n, r, p, saltText, hashText] = String(encodedHash || '').split('$');
        if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
        const salt = Buffer.from(saltText, 'base64url');
        const expected = Buffer.from(hashText, 'base64url');
        const derived = await scryptAsync(String(password || ''), salt, {
            N: Number(n),
            r: Number(r),
            p: Number(p),
            keyLength: expected.length || SCRYPT_PARAMS.keyLength
        });
        return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
    } catch (_) {
        return false;
    }
}

function tokenHash(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function sessionDays() {
    const value = Number(config.authSessionDays || DEFAULT_SESSION_DAYS);
    return Number.isFinite(value) ? Math.min(30, Math.max(1, value)) : DEFAULT_SESSION_DAYS;
}

function safeUser(row) {
    if (!row) return null;
    const role = String(row.role || 'Assistant');
    return {
        id: Number(row.id),
        name: row.full_name,
        email: row.email,
        role,
        status: row.status,
        permissions: ROLE_PERMISSIONS[role] || [],
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null
    };
}

async function ensureAuthTables() {
    const pool = await getPool();
    await pool.request().batch(AUTH_SCHEMA_SQL);
}

async function ensureOwnerAccount() {
    const existing = await userRepository.findOwner();
    if (existing.recordset[0]) return { created: false, setupRequired: false };

    const email = config.authOwnerEmail ? validateEmail(config.authOwnerEmail) : '';
    const password = config.authOwnerPassword ? validatePassword(config.authOwnerPassword) : '';
    if (!email || !password) {
        console.warn('[TOP GYM AUTH] No Owner account exists. Set AUTH_OWNER_EMAIL and AUTH_OWNER_PASSWORD to bootstrap the first Owner.');
        return { created: false, setupRequired: true };
    }

    const passwordHash = await hashPassword(password);
    try {
        await userRepository.createOwner({
            fullName: config.authOwnerName,
            email,
            passwordHash
        });
        console.log(`[TOP GYM AUTH] Bootstrapped Owner account ${email}.`);
        return { created: true, setupRequired: false };
    } catch (error) {
        if (error.number === 2601 || error.number === 2627) return { created: false, setupRequired: false };
        throw error;
    }
}

async function ensureAuthReady() {
    if (!authReadyPromise) {
        authReadyPromise = ensureAuthTables()
            .then(ensureOwnerAccount)
            .catch((error) => {
                authReadyPromise = null;
                throw error;
            });
    }
    return authReadyPromise;
}

async function getUserByEmail(email) {
    const result = await userRepository.findByEmail(email);
    return result.recordset[0] || null;
}

async function getDummyPasswordHash() {
    if (!dummyPasswordHashPromise) dummyPasswordHashPromise = hashPassword('TOP_GYM_INVALID_PASSWORD');
    return dummyPasswordHashPromise;
}

async function login(body = {}, request) {
    await ensureAuthReady();
    const email = normalizeEmail(body.email);
    const password = String(body.password ?? '');
    const user = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? await getUserByEmail(email) : null;
    const validPassword = await verifyPassword(password, user?.password_hash || await getDummyPasswordHash());
    if (!user || !validPassword) throw authError('البريد الإلكتروني أو كلمة المرور غير صحيحة.', 401, 'INVALID_CREDENTIALS');
    if (user.status !== 'Active') throw authError('هذا الحساب معطل. تواصل مع مالك النظام.', 403, 'ACCOUNT_DISABLED');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + sessionDays() * 24 * 60 * 60 * 1000);
    await sessionRepository.create({
        userId: Number(user.id),
        tokenHash: tokenHash(token),
        expiresAt,
        ipAddress: String(request?.ip || request?.socket?.remoteAddress || '').slice(0, 64),
        userAgent: String(request?.get?.('user-agent') || '').slice(0, 512)
    });
    return { token, expiresAt, user: safeUser(user) };
}

async function getSessionUser(token) {
    if (!token) return null;
    await ensureAuthReady();
    const result = await sessionRepository.findActiveWithUser(tokenHash(token));
    const row = result.recordset[0];
    if (!row) return null;
    await sessionRepository.touch(row.session_id).catch(() => {});
    return safeUser(row);
}

async function revokeSession(token) {
    if (!token) return;
    await ensureAuthReady();
    await sessionRepository.revokeByTokenHash(tokenHash(token));
}

async function listUsers() {
    await ensureAuthReady();
    const result = await userRepository.list();
    return result.recordset.map(safeUser);
}

async function createAssistant(body = {}) {
    await ensureAuthReady();
    const name = validateName(body.name || body.fullName);
    const email = validateEmail(body.email);
    const password = validatePassword(body.password);
    const passwordHash = await hashPassword(password);
    try {
        const result = await userRepository.createAssistant({ fullName: name, email, passwordHash });
        return safeUser(result.recordset[0]);
    } catch (error) {
        if (error.number === 2601 || error.number === 2627) throw authError('هذا البريد الإلكتروني مستخدم بالفعل.', 409, 'DUPLICATE_USER_EMAIL');
        throw error;
    }
}

async function updateUser(id, body = {}) {
    await ensureAuthReady();
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) throw authError('معرّف الحساب غير صحيح.', 400, 'INVALID_USER_ID');
    const name = validateName(body.name || body.fullName);
    const email = validateEmail(body.email);
    const password = validatePassword(body.password, { required: false });
    const current = await userRepository.findRoleById(userId);
    if (!current.recordset[0]) throw authError('الحساب غير موجود.', 404, 'USER_NOT_FOUND');
    if (current.recordset[0].role !== 'Assistant') throw authError('\u062d\u0633\u0627\u0628 \u0627\u0644\u0645\u0627\u0644\u0643 \u0645\u062d\u0645\u064a \u0645\u0646 \u0627\u0644\u062a\u0639\u062f\u064a\u0644 \u0645\u0646 \u0647\u0630\u0647 \u0627\u0644\u0634\u0627\u0634\u0629.', 403, 'OWNER_ACCOUNT_PROTECTED');
    const passwordHash = password ? await hashPassword(password) : null;
    try {
        await userRepository.updateAssistant({ id: userId, fullName: name, email, passwordHash });
        if (passwordHash) {
            await sessionRepository.revokeForUser(userId);
        }
    } catch (error) {
        if (error.number === 2601 || error.number === 2627) throw authError('هذا البريد الإلكتروني مستخدم بالفعل.', 409, 'DUPLICATE_USER_EMAIL');
        throw error;
    }
    const updated = await userRepository.findPublicById(userId);
    return safeUser(updated.recordset[0]);
}

async function setAssistantStatus(id, status) {
    await ensureAuthReady();
    const userId = Number(id);
    const nextStatus = String(status || '').trim();
    if (!Number.isInteger(userId) || userId <= 0 || !['Active', 'Disabled'].includes(nextStatus)) throw authError('بيانات حالة الحساب غير صحيحة.', 400, 'INVALID_USER_STATUS');
    const result = await userRepository.findRoleById(userId);
    const user = result.recordset[0];
    if (!user) throw authError('الحساب غير موجود.', 404, 'USER_NOT_FOUND');
    if (user.role !== 'Assistant') throw authError('لا يمكن تعطيل حساب المالك.', 400, 'OWNER_STATUS_PROTECTED');
    await userRepository.updateStatus({ id: userId, status: nextStatus });
    const updated = await userRepository.findPublicById(userId);
    return safeUser(updated.recordset[0]);
}

function canAccess(user, request) {
    return canAccessRoleRequest(user, request);
}

function sessionCookie(token, expiresAt, request) {
    const maxAge = Math.max(1, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    const secure = isProduction() || String(request?.secure) === 'true';
    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function clearSessionCookie(request) {
    const secure = isProduction() || String(request?.secure) === 'true';
    return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function readSessionCookie(request) {
    const header = String(request.get?.('cookie') || '');
    const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
    return match ? decodeURIComponent(match.slice(SESSION_COOKIE_NAME.length + 1)) : '';
}

function appendCookie(response, value) {
    response.setHeader('Set-Cookie', value);
}

module.exports = {
    AUTH_SCHEMA_SQL,
    ROLE_PERMISSIONS,
    SESSION_COOKIE_NAME,
    appendCookie,
    assistantPathAllowed,
    canAccess,
    clearSessionCookie,
    createAssistant,
    ensureAuthReady,
    ensureAuthTables,
    ensureOwnerAccount,
    getSessionUser,
    hashPassword,
    listUsers,
    login,
    permissionsForRole,
    readSessionCookie,
    revokeSession,
    safeUser,
    sessionCookie,
    setAssistantStatus,
    updateUser,
    validateEmail,
    validatePassword
};
