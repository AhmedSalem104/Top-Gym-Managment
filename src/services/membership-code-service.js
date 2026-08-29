'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { config } = require('../config/env');
const { getTenantContext, runTenantContext } = require('../tenancy/tenant-context');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^TG[A-HJ-NP-Z2-9]{16}$/;
const AUDIT_ACTIONS = new Set(['issued', 'viewed', 'whatsapp_sent', 'rotated', 'portal_viewed']);
let storagePromise;

function appError(message, statusCode = 400, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    if (code) error.code = code;
    return error;
}

function ensurePositiveId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw appError('معرّف العضو غير صالح.');
    return id;
}

function secretSource() {
    // The explicit secret is recommended. The fallbacks keep existing
    // installations stable while they roll out the new environment value.
    return String(
        config.membershipCodeSecret
        || process.env.SESSION_SECRET
        || config.authOwnerPassword
        || config.mssqlConnectionString
        || 'TOP_GYM_MEMBERSHIP_CODE_FALLBACK'
    );
}

function encryptionKey() {
    return crypto.createHash('sha256').update(secretSource()).digest();
}

function normalizeCode(value) {
    const compact = String(value || '').trim().toUpperCase().replace(/[\s-]/g, '');
    if (!CODE_PATTERN.test(compact)) throw appError('كود العضوية غير صحيح.', 400, 'INVALID_MEMBERSHIP_CODE');
    return compact;
}

function hashCode(compactCode) {
    return crypto.createHmac('sha256', secretSource()).update(compactCode).digest('hex');
}

function formatCode(compactCode) {
    const compact = String(compactCode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!compact.startsWith('TG') || compact.length !== 18) return compact || '';
    const body = compact.slice(2);
    return `TG-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

function generateCode() {
    const bytes = crypto.randomBytes(16);
    let body = '';
    for (const byte of bytes) body += CODE_ALPHABET[byte & 31];
    return formatCode(`TG${body}`);
}

function encryptCode(compactCode) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(compactCode, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptCode(value) {
    const [ivEncoded, tagEncoded, dataEncoded] = String(value || '').split('.');
    if (!ivEncoded || !tagEncoded || !dataEncoded) throw new Error('Invalid membership code ciphertext.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivEncoded, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataEncoded, 'base64url')), decipher.final()]).toString('utf8');
}

function maskCode(value) {
    const formatted = formatCode(value);
    if (!formatted) return null;
    const parts = formatted.split('-');
    return parts.length === 5 ? `${parts[0]}-${parts[1]}-••••-••••-••••` : `${formatted.slice(0, 7)}••••`;
}

function requestMeta(request) {
    if (!request) return { ip: null, userAgent: null };
    const forwarded = String(request.get?.('x-forwarded-for') || '').split(',')[0].trim();
    return {
        ip: String(forwarded || request.ip || request.socket?.remoteAddress || '').slice(0, 64) || null,
        userAgent: String(request.get?.('user-agent') || '').slice(0, 512) || null
    };
}

async function ensureMembershipCodeStorage({ readOnly = false } = {}) {
    // Listing members and loading member details are read paths. Never let a
    // baseline request turn those reads into schema ALTER/CREATE/backfill
    // work; the database must already be prepared before it is benchmarked.
    if (readOnly || getTenantContext()?.readOnlyBaseline) return;
    if (!storagePromise) {
        storagePromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF COL_LENGTH(N'dbo.members', N'membership_code_hash') IS NULL
                    EXEC(N'ALTER TABLE dbo.members ADD membership_code_hash CHAR(64) NULL;');
                IF COL_LENGTH(N'dbo.members', N'membership_code_ciphertext') IS NULL
                    EXEC(N'ALTER TABLE dbo.members ADD membership_code_ciphertext NVARCHAR(512) NULL;');
                IF COL_LENGTH(N'dbo.members', N'membership_code_version') IS NULL
                    EXEC(N'ALTER TABLE dbo.members ADD membership_code_version INT NOT NULL CONSTRAINT DF_members_membership_code_version_runtime DEFAULT (1);');
                IF COL_LENGTH(N'dbo.members', N'membership_code_issued_at') IS NULL
                    EXEC(N'ALTER TABLE dbo.members ADD membership_code_issued_at DATETIME2(0) NULL;');
                IF COL_LENGTH(N'dbo.members', N'membership_code_revoked_at') IS NULL
                    EXEC(N'ALTER TABLE dbo.members ADD membership_code_revoked_at DATETIME2(0) NULL;');
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_members_membership_code_hash'
                      AND object_id = OBJECT_ID(N'dbo.members')
                )
                    EXEC(N'CREATE UNIQUE INDEX UX_members_membership_code_hash ON dbo.members(membership_code_hash) WHERE membership_code_hash IS NOT NULL;');
                IF OBJECT_ID(N'dbo.gym_membership_code_audit', N'U') IS NULL
                BEGIN
                    EXEC(N'CREATE TABLE dbo.gym_membership_code_audit (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_membership_code_audit PRIMARY KEY,
                        member_id INT NOT NULL,
                        action VARCHAR(30) NOT NULL,
                        actor_user_id INT NULL,
                        ip_address VARCHAR(64) NULL,
                        user_agent NVARCHAR(512) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_membership_code_audit_created DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_gym_membership_code_audit_member FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
                        CONSTRAINT CK_gym_membership_code_audit_action CHECK (action IN (''issued'', ''viewed'', ''whatsapp_sent'', ''rotated'', ''portal_viewed''))
                    );');
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_membership_code_audit_member_date'
                      AND object_id = OBJECT_ID(N'dbo.gym_membership_code_audit')
                )
                    EXEC(N'CREATE INDEX IX_gym_membership_code_audit_member_date ON dbo.gym_membership_code_audit(member_id, created_at DESC, id DESC);');
            `);
            await backfillCodes(pool);
        })().catch((error) => {
            storagePromise = undefined;
            throw error;
        });
    }
    return storagePromise;
}

async function saveNewCode(connection, memberId, { action = 'issued', userId = null } = {}) {
    const id = ensurePositiveId(memberId);
    const request = connection.request();
    const code = generateCode();
    const compact = normalizeCode(code);
    const hash = hashCode(compact);
    const ciphertext = encryptCode(compact);
    request
        .input('memberId', sql.Int, id)
        .input('hash', sql.Char(64), hash)
        .input('ciphertext', sql.NVarChar(512), ciphertext)
        .input('userId', sql.Int, Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null);
    try {
        const result = await request.query(`
            UPDATE dbo.members
            SET membership_code_hash = @hash,
                membership_code_ciphertext = @ciphertext,
                membership_code_version = ISNULL(membership_code_version, 0) + 1,
                membership_code_issued_at = SYSUTCDATETIME(),
                membership_code_revoked_at = NULL,
                updated_at = SYSUTCDATETIME()
            WHERE id = @memberId;
            SELECT @@ROWCOUNT AS affected;
        `);
        if (!Number(result.recordset?.[0]?.affected)) throw appError('تعذر إنشاء كود بوابة المشترك.', 500, 'MEMBERSHIP_CODE_ISSUE_FAILED');
        return { code: formatCode(compact), hash };
    } catch (error) {
        if (error.number === 2601 || error.number === 2627) return saveNewCode(connection, memberId, { action, userId });
        throw error;
    }
}

async function audit(memberId, action, { userId = null, request = null, connection = null } = {}) {
    if (!AUDIT_ACTIONS.has(action)) throw appError('إجراء كود العضوية غير صالح.', 400);
    const id = ensurePositiveId(memberId);
    const meta = requestMeta(request);
    const db = connection || await getPool();
    await db.request()
        .input('memberId', sql.Int, id)
        .input('action', sql.VarChar(30), action)
        .input('userId', sql.Int, Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null)
        .input('ipAddress', sql.VarChar(64), meta.ip)
        .input('userAgent', sql.NVarChar(512), meta.userAgent)
        .query(`INSERT INTO dbo.gym_membership_code_audit (member_id, action, actor_user_id, ip_address, user_agent)
                VALUES (@memberId, @action, @userId, @ipAddress, @userAgent);`);
}

async function backfillCodes(pool) {
    const result = await pool.request().query(`
        SELECT id
        FROM dbo.members
        WHERE membership_code_hash IS NULL OR membership_code_ciphertext IS NULL
        ORDER BY id ASC;
    `);
    for (const row of result.recordset || []) {
        const id = Number(row.id);
        let assigned = false;
        for (let attempt = 0; attempt < 5 && !assigned; attempt += 1) {
            try {
                const code = generateCode();
                const compact = normalizeCode(code);
                const update = await pool.request()
                    .input('memberId', sql.Int, id)
                    .input('hash', sql.Char(64), hashCode(compact))
                    .input('ciphertext', sql.NVarChar(512), encryptCode(compact))
                    .query(`UPDATE dbo.members
                            SET membership_code_hash = @hash,
                                membership_code_ciphertext = @ciphertext,
                                membership_code_version = ISNULL(membership_code_version, 0) + 1,
                                membership_code_issued_at = COALESCE(membership_code_issued_at, SYSUTCDATETIME()),
                                membership_code_revoked_at = NULL,
                                updated_at = SYSUTCDATETIME()
                            WHERE id = @memberId
                              AND (membership_code_hash IS NULL OR membership_code_ciphertext IS NULL);`);
                assigned = Number(update.rowsAffected?.[0] || 0) > 0;
            } catch (error) {
                if (error.number !== 2601 && error.number !== 2627) throw error;
            }
        }
        if (!assigned) throw appError('تعذر إنشاء أكواد العضوية الحالية.', 500, 'MEMBERSHIP_CODE_BACKFILL_FAILED');
    }
}

async function issueForMember(memberId, connection = null, options = {}) {
    const id = ensurePositiveId(memberId);
    const db = connection || await getPool();
    const existing = await db.request()
        .input('memberId', sql.Int, id)
        .query(`SELECT membership_code_hash, membership_code_ciphertext, membership_code_revoked_at FROM dbo.members WHERE id = @memberId;`);
    if (!existing.recordset[0]) throw appError('العضو غير موجود.', 404);
    if (existing.recordset[0].membership_code_hash && existing.recordset[0].membership_code_ciphertext && !existing.recordset[0].membership_code_revoked_at) {
        return formatCode(decryptCode(existing.recordset[0].membership_code_ciphertext));
    }
    const issued = await saveNewCode(db, id, options);
    if (options.audit !== false) await audit(id, options.action || 'issued', { ...options, connection: db });
    return issued.code;
}

async function getPreview(memberId) {
    await ensureMembershipCodeStorage();
    const id = ensurePositiveId(memberId);
    const pool = await getPool();
    const result = await pool.request().input('memberId', sql.Int, id).query(`
        SELECT membership_code_hash, membership_code_ciphertext, membership_code_issued_at, membership_code_revoked_at,
               membership_code_version
        FROM dbo.members WHERE id = @memberId;
    `);
    const row = result.recordset[0];
    if (!row || !row.membership_code_hash || !row.membership_code_ciphertext || row.membership_code_revoked_at) {
        return { active: false, maskedCode: null, issuedAt: null, version: Number(row?.membership_code_version || 0) };
    }
    let code;
    try { code = formatCode(decryptCode(row.membership_code_ciphertext)); } catch (_) { code = null; }
    return {
        active: Boolean(code),
        maskedCode: code ? maskCode(code) : null,
        issuedAt: row.membership_code_issued_at || null,
        version: Number(row.membership_code_version || 0)
    };
}

async function getPreviews(memberIds = []) {
    await ensureMembershipCodeStorage();
    const ids = [...new Set(memberIds.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
    const previews = new Map();
    if (!ids.length) return previews;
    const pool = await getPool();
    const request = pool.request();
    const placeholders = ids.map((id, index) => {
        const name = `memberId${index}`;
        request.input(name, sql.Int, id);
        return `@${name}`;
    });
    const result = await request.query(`
        SELECT id, membership_code_hash, membership_code_ciphertext, membership_code_issued_at,
               membership_code_revoked_at, membership_code_version
        FROM dbo.members WHERE id IN (${placeholders.join(', ')});
    `);
    for (const row of result.recordset || []) {
        let code = null;
        if (row.membership_code_hash && row.membership_code_ciphertext && !row.membership_code_revoked_at) {
            try { code = formatCode(decryptCode(row.membership_code_ciphertext)); } catch (_) { code = null; }
        }
        previews.set(Number(row.id), {
            active: Boolean(code),
            maskedCode: code ? maskCode(code) : null,
            issuedAt: row.membership_code_issued_at || null,
            version: Number(row.membership_code_version || 0)
        });
    }
    return previews;
}

async function getForMember(memberId, { userId = null, request = null, action = 'viewed' } = {}) {
    await ensureMembershipCodeStorage();
    const id = ensurePositiveId(memberId);
    const pool = await getPool();
    const result = await pool.request().input('memberId', sql.Int, id).query(`
        SELECT membership_code_hash, membership_code_ciphertext, membership_code_issued_at, membership_code_revoked_at,
               membership_code_version
        FROM dbo.members WHERE id = @memberId;
    `);
    const row = result.recordset[0];
    if (!row) throw appError('العضو غير موجود.', 404);
    if (!row.membership_code_hash || !row.membership_code_ciphertext || row.membership_code_revoked_at) {
        throw appError('لا يوجد كود نشط لهذا العضو.', 404, 'MEMBERSHIP_CODE_NOT_ACTIVE');
    }
    let code;
    try { code = formatCode(decryptCode(row.membership_code_ciphertext)); } catch (_) {
        throw appError('تعذر قراءة كود العضوية. أصدر كودًا جديدًا.', 500, 'MEMBERSHIP_CODE_DECRYPT_FAILED');
    }
    await audit(id, action, { userId, request });
    return { membershipCode: code, maskedCode: maskCode(code), issuedAt: row.membership_code_issued_at, version: Number(row.membership_code_version || 0) };
}

async function rotateForMember(memberId, { userId = null, request = null } = {}) {
    await ensureMembershipCodeStorage();
    const id = ensurePositiveId(memberId);
    const pool = await getPool();
    const check = await pool.request().input('memberId', sql.Int, id).query('SELECT TOP 1 id FROM dbo.members WHERE id = @memberId;');
    if (!check.recordset[0]) throw appError('العضو غير موجود.', 404);
    const code = generateCode();
    const compact = normalizeCode(code);
    const result = await pool.request()
        .input('memberId', sql.Int, id)
        .input('hash', sql.Char(64), hashCode(compact))
        .input('ciphertext', sql.NVarChar(512), encryptCode(compact))
        .query(`UPDATE dbo.members
                SET membership_code_hash = @hash,
                    membership_code_ciphertext = @ciphertext,
                    membership_code_version = ISNULL(membership_code_version, 0) + 1,
                    membership_code_issued_at = SYSUTCDATETIME(),
                    membership_code_revoked_at = NULL,
                    updated_at = SYSUTCDATETIME()
                WHERE id = @memberId;`);
    if (!Number(result.rowsAffected?.[0] || 0)) throw appError('تعذر إصدار كود جديد.', 500, 'MEMBERSHIP_CODE_ROTATE_FAILED');
    await audit(id, 'rotated', { userId, request });
    return { membershipCode: formatCode(compact), maskedCode: maskCode(compact), issuedAt: new Date().toISOString() };
}

function requestedTenantSlug(request) {
    const raw = request?.get?.('x-gym-slug')
        || request?.query?.tenant
        || request?.body?.tenantSlug
        || '';
    return String(raw).trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
}

/**
 * Resolve the member-code capability to its owning tenant before reading the
 * portal data. The lookup intentionally runs in a short platform context and
 * returns only the member/tenant identity; all member data is fetched again
 * inside the resolved public tenant context by the portal service.
 *
 * This is required because a public portal request has no authenticated gym
 * session. Falling back to Top Gym for every request made other tenants'
 * members unusable, while reading member details in a global context would
 * weaken the RLS boundary. The HMAC is the capability, the second scoped read
 * is the isolation boundary.
 */
async function findMemberContextByCode(value, { request = null, auditAction = 'portal_viewed' } = {}) {
    const callerContext = getTenantContext();
    const readOnlyBaseline = Boolean(callerContext?.readOnlyBaseline);
    await ensureMembershipCodeStorage({ readOnly: readOnlyBaseline });
    let compact;
    try { compact = normalizeCode(value); } catch (_) { return null; }

    const tenantSlug = requestedTenantSlug(request);
    const result = await runTenantContext({ tenantId: null, mode: 'platform', readOnlyBaseline }, async () => {
        const pool = await getPool();
        return pool.request()
            .input('hash', sql.Char(64), hashCode(compact))
            .input('tenantSlug', sql.VarChar(80), tenantSlug)
            .query(`SELECT TOP (1) m.id, m.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug
                    FROM dbo.members AS m
                    INNER JOIN dbo.gym_tenants AS t ON t.id = m.tenant_id
                    WHERE m.membership_code_hash = @hash
                      AND m.membership_code_revoked_at IS NULL
                      AND t.status IN ('trial', 'active')
                      AND (@tenantSlug = '' OR t.slug = @tenantSlug);`);
    });
    const row = result.recordset[0];
    if (!row) return null;

    const memberContext = {
        memberId: Number(row.id),
        tenantId: Number(row.tenant_id),
        tenantName: String(row.tenant_name || ''),
        tenantSlug: String(row.tenant_slug || '').toLowerCase()
    };
    if (auditAction && !readOnlyBaseline) {
        await runTenantContext({ tenantId: memberContext.tenantId, mode: 'public' }, () => audit(memberContext.memberId, auditAction, { request }));
    }
    return memberContext;
}

async function findMemberIdByCode(value, options = {}) {
    const memberContext = await findMemberContextByCode(value, options);
    return memberContext?.memberId || null;
}

function getPortalUrl(origin = '', tenantSlug = '') {
    const configured = String(config.publicAppUrl || '').trim().replace(/\/+$/, '');
    const base = configured || String(origin || '').trim().replace(/\/+$/, '');
    const normalizedSlug = String(tenantSlug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
    return base ? `${base}/member-portal${normalizedSlug ? `?tenant=${encodeURIComponent(normalizedSlug)}` : ''}` : '';
}

module.exports = {
    ensureMembershipCodeStorage,
    findMemberContextByCode,
    findMemberIdByCode,
    formatCode,
    getForMember,
    getPortalUrl,
    getPreview,
    getPreviews,
    hashCode,
    issueForMember,
    maskCode,
    normalizeCode,
    rotateForMember
};
