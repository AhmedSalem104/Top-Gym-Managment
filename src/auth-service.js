const crypto = require('node:crypto');
const { getPool, sql } = require('./db');

const ROLES = ['manager', 'reception'];
const ROLE_LABELS = { manager: 'مدير', reception: 'استقبال' };
const ROLE_PERMISSIONS = {
    manager: [
        'dashboard.read', 'members.read', 'members.write', 'members.delete',
        'expenses.read', 'expenses.write', 'expenses.delete',
        'settings.read', 'settings.write', 'reports.read', 'backup.download',
        'users.manage', 'audit.read'
    ],
    reception: [
        'dashboard.read', 'members.read', 'members.write',
        'expenses.read', 'settings.read', 'reports.read'
    ]
};
const SESSION_COOKIE = 'topgym_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 8;
let authTablesPromise;

function appError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    return error;
}

function requiredString(value, fieldName, maxLength) {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw appError(`${fieldName} مطلوب.`);
    if (normalized.length > maxLength) throw appError(`${fieldName} أطول من المسموح.`);
    return normalized;
}

function normalizeUsername(value) {
    const username = requiredString(value, 'اسم المستخدم', 50).toLowerCase();
    if (!/^[a-z][a-z0-9._-]{2,49}$/.test(username)) {
        throw appError('اسم المستخدم يجب أن يبدأ بحرف إنجليزي ويحتوي على أحرف أو أرقام أو . _ -.');
    }
    return username;
}

function normalizeRole(value = 'reception') {
    const role = String(value || '').trim().toLowerCase();
    if (!ROLES.includes(role)) throw appError('صلاحية المستخدم غير صالحة.');
    return role;
}

function validatePassword(value, required = true) {
    if ((value === undefined || value === null || value === '') && !required) return null;
    const password = String(value ?? '');
    if (password.length < 8 || password.length > 128) {
        throw appError('كلمة المرور يجب أن تكون من 8 إلى 128 حرفًا.');
    }
    return password;
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const digest = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
    const [salt, expectedHex] = String(storedHash || '').split(':');
    if (!salt || !expectedHex) return false;
    try {
        const actual = crypto.scryptSync(String(password ?? ''), salt, 64);
        const expected = Buffer.from(expectedHex, 'hex');
        return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
    } catch (_) {
        return false;
    }
}

function sessionSecret() {
    return crypto.createHash('sha256')
        .update(String(process.env.TOP_GYM_AUTH_SECRET || process.env.AUTH_SECRET || process.env.MSSQL_CONNECTION_STRING || process.env.DATABASE_URL || 'top-gym-change-this-secret'))
        .digest();
}

function encode(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode(value) {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function signSession(payload) {
    const body = encode(payload);
    const signature = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
    return `${body}.${signature}`;
}

function verifySession(token) {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return null;
    const expected = crypto.createHmac('sha256', sessionSecret()).update(body).digest('base64url');
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
    try {
        const payload = decode(body);
        if (!payload.sub || Number(payload.exp || 0) < Date.now()) return null;
        return { userId: Number(payload.sub) };
    } catch (_) {
        return null;
    }
}

function readCookies(request) {
    return String(request.headers.cookie || '').split(';').reduce((result, item) => {
        const separator = item.indexOf('=');
        if (separator < 0) return result;
        result[item.slice(0, separator).trim()] = decodeURIComponent(item.slice(separator + 1).trim());
        return result;
    }, {});
}

function mapUser(row) {
    if (!row) return null;
    const role = String(row.role || 'reception');
    return {
        id: Number(row.id),
        fullName: row.full_name,
        username: row.username,
        role,
        roleLabel: ROLE_LABELS[role] || role,
        active: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        permissions: ROLE_PERMISSIONS[role] || []
    };
}

async function ensureAuthTables() {
    if (!authTablesPromise) {
        authTablesPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_users', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_users (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_users_runtime PRIMARY KEY,
                        full_name NVARCHAR(120) NOT NULL,
                        username VARCHAR(50) NOT NULL,
                        password_hash NVARCHAR(255) NOT NULL,
                        role VARCHAR(20) NOT NULL CONSTRAINT DF_gym_users_role_runtime DEFAULT ('reception'),
                        is_active BIT NOT NULL CONSTRAINT DF_gym_users_active_runtime DEFAULT (1),
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_users_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_users_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT UQ_gym_users_username_runtime UNIQUE (username),
                        CONSTRAINT CK_gym_users_role_runtime CHECK (role IN ('manager', 'reception'))
                    );
                END;
                IF OBJECT_ID(N'dbo.gym_audit_log', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_audit_log (
                        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_audit_log_runtime PRIMARY KEY,
                        actor_user_id INT NULL,
                        actor_name NVARCHAR(120) NULL,
                        actor_role VARCHAR(20) NULL,
                        action VARCHAR(40) NOT NULL,
                        entity_type VARCHAR(40) NOT NULL,
                        entity_id INT NULL,
                        details NVARCHAR(MAX) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_audit_created_runtime DEFAULT (SYSUTCDATETIME())
                    );
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_audit_log_created_runtime' AND object_id = OBJECT_ID(N'dbo.gym_audit_log')
                )
                BEGIN
                    CREATE INDEX IX_gym_audit_log_created_runtime ON dbo.gym_audit_log(created_at DESC, id DESC);
                END;
            `);
        })().catch((error) => {
            authTablesPromise = undefined;
            throw error;
        });
    }
    return authTablesPromise;
}

async function countUsers() {
    await ensureAuthTables();
    const pool = await getPool();
    const result = await pool.request().query('SELECT COUNT(*) AS total FROM dbo.gym_users;');
    return Number(result.recordset[0]?.total || 0);
}

async function getUserById(id) {
    await ensureAuthTables();
    const pool = await getPool();
    const result = await pool.request()
        .input('id', sql.Int, Number(id))
        .query(`SELECT id, full_name, username, role, is_active, created_at, updated_at
                FROM dbo.gym_users WHERE id = @id;`);
    return mapUser(result.recordset[0]);
}

async function getAuthContext(request) {
    await ensureAuthTables();
    const session = verifySession(readCookies(request)[SESSION_COOKIE]);
    if (!session) return null;
    const user = await getUserById(session.userId);
    return user?.active ? user : null;
}

function permissionsForRole(role) {
    return [...(ROLE_PERMISSIONS[role] || [])];
}

function can(user, permission) {
    return Boolean(user && permissionsForRole(user.role).includes(permission));
}

function requirePermission(permission) {
    return (request, response, next) => {
        if (!request.auth) return response.status(401).json({ error: 'يجب تسجيل الدخول أولاً.' });
        if (!can(request.auth, permission)) return response.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.' });
        next();
    };
}

function authError(message = 'يجب تسجيل الدخول أولاً.') {
    return appError(message, 401);
}

async function getAuthStatus(request) {
    const userCount = await countUsers();
    const user = await getAuthContext(request);
    return {
        setupRequired: userCount === 0,
        authenticated: Boolean(user),
        user,
        roles: ROLE_LABELS
    };
}

function cookieOptions(maxAge) {
    const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) parts.push('Secure');
    return parts.join('; ');
}

function startSession(response, user) {
    const now = Date.now();
    response.setHeader('Set-Cookie', `${cookieOptions(SESSION_DURATION_SECONDS).replace(`${SESSION_COOKIE}=`, `${SESSION_COOKIE}=${signSession({ sub: user.id, iat: now, exp: now + SESSION_DURATION_SECONDS * 1000 })}`)}`);
}

function endSession(response) {
    response.setHeader('Set-Cookie', cookieOptions(0));
}

async function setupFirstManager(body = {}, response) {
    const existing = await countUsers();
    if (existing) throw appError('تم إعداد حساب الإدارة بالفعل. استخدم تسجيل الدخول.', 409);
    const fullName = requiredString(body.fullName || 'مدير TOP GYM', 'اسم المدير', 120);
    const username = normalizeUsername(body.username || 'admin');
    const password = validatePassword(body.password, true);
    const pool = await getPool();
    await pool.request()
        .input('fullName', sql.NVarChar(120), fullName)
        .input('username', sql.VarChar(50), username)
        .input('passwordHash', sql.NVarChar(255), hashPassword(password))
        .input('role', sql.VarChar(20), 'manager')
        .query(`INSERT INTO dbo.gym_users (full_name, username, password_hash, role)
                VALUES (@fullName, @username, @passwordHash, @role);`);
    const row = await getUserByUsername(username);
    const user = mapUser(row);
    startSession(response, user);
    return user;
}

async function getUserByUsername(username) {
    const pool = await getPool();
    const result = await pool.request()
        .input('username', sql.VarChar(50), username)
        .query(`SELECT id, full_name, username, password_hash, role, is_active, created_at, updated_at
                FROM dbo.gym_users WHERE username = @username;`);
    return result.recordset[0] || null;
}

async function login(body = {}, response) {
    const username = normalizeUsername(body.username);
    const password = String(body.password ?? '');
    const row = await getUserByUsername(username);
    if (!row || !row.is_active || !verifyPassword(password, row.password_hash)) {
        throw appError('اسم المستخدم أو كلمة المرور غير صحيحة.', 401);
    }
    const user = mapUser(row);
    startSession(response, user);
    return user;
}

async function logout(response) {
    endSession(response);
}

async function getUsers() {
    await ensureAuthTables();
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT id, full_name, username, role, is_active, created_at, updated_at
        FROM dbo.gym_users ORDER BY is_active DESC, full_name ASC, id ASC;
    `);
    return result.recordset.map(mapUser);
}

async function createUser(body = {}) {
    const fullName = requiredString(body.fullName, 'اسم الموظف', 120);
    const username = normalizeUsername(body.username);
    const password = validatePassword(body.password, true);
    const role = normalizeRole(body.role);
    const pool = await getPool();
    try {
        await pool.request()
            .input('fullName', sql.NVarChar(120), fullName)
            .input('username', sql.VarChar(50), username)
            .input('passwordHash', sql.NVarChar(255), hashPassword(password))
            .input('role', sql.VarChar(20), role)
            .query(`INSERT INTO dbo.gym_users (full_name, username, password_hash, role)
                    VALUES (@fullName, @username, @passwordHash, @role);`);
    } catch (error) {
        if (error.number === 2627 || error.number === 2601) throw appError('اسم المستخدم مستخدم بالفعل.');
        throw error;
    }
    return getUserByUsername(username).then(mapUser);
}

async function updateUser(id, body = {}) {
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId < 1) throw appError('معرّف المستخدم غير صالح.');
    const current = await getUserById(userId);
    if (!current) throw appError('المستخدم غير موجود.', 404);
    const fullName = body.fullName === undefined ? current.fullName : requiredString(body.fullName, 'اسم الموظف', 120);
    const role = body.role === undefined ? current.role : normalizeRole(body.role);
    const isActive = body.isActive === undefined ? current.active : Boolean(body.isActive);
    const password = validatePassword(body.password, false);
    if (current.role === 'manager' && (role !== 'manager' || !isActive)) {
        const managerCount = await countManagers();
        if (managerCount <= 1) throw appError('يجب الإبقاء على مدير واحد نشط على الأقل.');
    }
    const pool = await getPool();
    const request = pool.request()
        .input('id', sql.Int, userId)
        .input('fullName', sql.NVarChar(120), fullName)
        .input('role', sql.VarChar(20), role)
        .input('isActive', sql.Bit, isActive);
    const passwordClause = password ? ', password_hash = @passwordHash' : '';
    if (password) request.input('passwordHash', sql.NVarChar(255), hashPassword(password));
    await request.query(`UPDATE dbo.gym_users
                         SET full_name = @fullName, role = @role, is_active = @isActive${passwordClause},
                             updated_at = SYSUTCDATETIME()
                         WHERE id = @id;`);
    return getUserById(userId);
}

async function countManagers() {
    const pool = await getPool();
    const result = await pool.request().query(`SELECT COUNT(*) AS total FROM dbo.gym_users WHERE role = 'manager' AND is_active = 1;`);
    return Number(result.recordset[0]?.total || 0);
}

async function deleteUser(id, currentUserId) {
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId < 1) throw appError('معرّف المستخدم غير صالح.');
    if (userId === Number(currentUserId)) throw appError('لا يمكنك حذف حسابك أثناء تسجيل الدخول.');
    const user = await getUserById(userId);
    if (!user) throw appError('المستخدم غير موجود.', 404);
    if (user.role === 'manager' && await countManagers() <= 1) throw appError('يجب الإبقاء على مدير واحد نشط على الأقل.');
    const pool = await getPool();
    await pool.request().input('id', sql.Int, userId).query('UPDATE dbo.gym_users SET is_active = 0, updated_at = SYSUTCDATETIME() WHERE id = @id;');
}

async function recordAudit(actor, action, entityType, entityId = null, details = {}) {
    if (!actor) return;
    await ensureAuthTables();
    const pool = await getPool();
    await pool.request()
        .input('actorUserId', sql.Int, actor.id || null)
        .input('actorName', sql.NVarChar(120), actor.fullName || null)
        .input('actorRole', sql.VarChar(20), actor.role || null)
        .input('action', sql.VarChar(40), String(action).slice(0, 40))
        .input('entityType', sql.VarChar(40), String(entityType).slice(0, 40))
        .input('entityId', sql.Int, entityId ? Number(entityId) : null)
        .input('details', sql.NVarChar(sql.MAX), JSON.stringify(details || {}))
        .query(`INSERT INTO dbo.gym_audit_log
                (actor_user_id, actor_name, actor_role, action, entity_type, entity_id, details)
                VALUES (@actorUserId, @actorName, @actorRole, @action, @entityType, @entityId, @details);`);
}

async function getAuditLog(limit = 100) {
    await ensureAuthTables();
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
    const pool = await getPool();
    const result = await pool.request().input('limit', sql.Int, safeLimit).query(`
        SELECT TOP (@limit) id, actor_user_id, actor_name, actor_role, action,
               entity_type, entity_id, details, created_at
        FROM dbo.gym_audit_log ORDER BY created_at DESC, id DESC;
    `);
    return result.recordset.map((row) => {
        let details = {};
        try { details = row.details ? JSON.parse(row.details) : {}; } catch (_) { details = { text: String(row.details || '') }; }
        return {
            id: Number(row.id),
            actorUserId: row.actor_user_id ? Number(row.actor_user_id) : null,
            actorName: row.actor_name,
            actorRole: row.actor_role,
            action: row.action,
            entityType: row.entity_type,
            entityId: row.entity_id ? Number(row.entity_id) : null,
            details,
            createdAt: row.created_at
        };
    });
}

module.exports = {
    ROLE_LABELS,
    ROLE_PERMISSIONS,
    authError,
    can,
    createUser,
    deleteUser,
    ensureAuthTables,
    endSession,
    getAuditLog,
    getAuthContext,
    getAuthStatus,
    getUsers,
    login,
    logout,
    mapUser,
    permissionsForRole,
    recordAudit,
    requirePermission,
    setupFirstManager,
    updateUser
};
