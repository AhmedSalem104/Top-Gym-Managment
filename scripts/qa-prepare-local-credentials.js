'use strict';

// Local QA helper only. It deliberately refuses production-like targets and
// never prints or persists the supplied test passwords.
const { getPool, sql } = require('../src/database');
const authService = require('../src/services/auth-service');

function required(name) {
    const value = String(process.env[name] || '');
    if (!value) throw new Error(`${name} is required.`);
    return value;
}

function normalizeEmail(value, name) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) throw new Error(`${name} must be a valid email.`);
    return normalized;
}

async function findTargetUser(pool, { email, role, tenantType = null }) {
    const exact = await pool.request()
        .input('email', sql.NVarChar(254), email)
        .input('role', sql.NVarChar(40), role)
        .query(`
            SELECT TOP (1) u.id,u.email,u.role
            FROM dbo.gym_users AS u
            WHERE LOWER(COALESCE(u.email_normalized,u.email))=@email
              AND u.role=@role
              AND u.status='Active';
        `);
    if (exact.recordset[0]) return exact.recordset[0];

    const request = pool.request().input('role', sql.NVarChar(40), role);
    const fallbackWhere = role === 'Owner'
        ? `
            JOIN dbo.gym_user_tenants AS ut ON ut.user_id=u.id
                AND ut.role='Owner' AND LOWER(ut.status)='active'
            JOIN dbo.gym_tenants AS t ON t.id=ut.tenant_id
                AND LOWER(t.status) IN ('active','trial')
            WHERE u.role=@role AND u.status='Active'
              AND LOWER(t.tenant_type)=@tenantType
        `
        : `WHERE u.role=@role AND u.status='Active'`;
    if (tenantType) request.input('tenantType', sql.NVarChar(40), tenantType);
    const fallback = await request.query(`
        SELECT TOP (2) u.id,u.email,u.role
        FROM dbo.gym_users AS u
        ${fallbackWhere}
        ORDER BY u.id ASC;
    `);
    if (fallback.recordset.length !== 1) {
        throw new Error(`Could not deterministically resolve the local ${role} QA account by email or role/tenant (${fallback.recordset.length} candidates).`);
    }
    return fallback.recordset[0];
}

async function main() {
    const connection = required('MSSQL_CONNECTION_STRING');
    const database = connection.match(/(?:Database|Initial Catalog)=([^;]+)/i)?.[1] || '';
    const server = connection.match(/(?:Server|Data Source)=([^;]+)/i)?.[1] || '';
    if (!/^localhost(?:\\|,|$)/i.test(server) || !/^LogicFit_/i.test(database)) {
        throw new Error('QA credential preparation is restricted to a localhost LogicFit_ database.');
    }

    const ownerPassword = required('QA_OWNER_PASSWORD');
    const adminPassword = required('QA_PLATFORM_ADMIN_PASSWORD');
    const ownerEmail = normalizeEmail(process.env.QA_OWNER_EMAIL || process.env.QA_GYM_OWNER_EMAIL || 'qa-owner@local.test', 'QA_OWNER_EMAIL');
    const adminEmail = normalizeEmail(process.env.QA_PLATFORM_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || 'qa-platform-admin@local.test', 'QA_PLATFORM_ADMIN_EMAIL');
    const ownerMustChangePassword = String(process.env.QA_OWNER_MUST_CHANGE_PASSWORD ?? '1').trim() !== '0';
    const pool = await getPool();
    try {
        const ownerHash = await authService.hashPassword(ownerPassword);
        const adminHash = await authService.hashPassword(adminPassword);
        const owner = await findTargetUser(pool, { email: ownerEmail, role: 'Owner', tenantType: 'gym' });
        const admin = await findTargetUser(pool, { email: adminEmail, role: 'PlatformAdmin' });
        await pool.request()
            .input('ownerHash', sql.NVarChar(512), ownerHash)
            .input('adminHash', sql.NVarChar(512), adminHash)
            .input('ownerEmail', sql.NVarChar(254), ownerEmail)
            .input('adminEmail', sql.NVarChar(254), adminEmail)
            .input('ownerId', sql.Int, Number(owner.id))
            .input('adminId', sql.Int, Number(admin.id))
            .input('ownerMustChangePassword', sql.Bit, ownerMustChangePassword)
            .query(`
                UPDATE dbo.gym_users
                SET email=@ownerEmail,
                    email_normalized=@ownerEmail,
                    username=@ownerEmail,
                    password_hash=@ownerHash,
                    must_change_password=@ownerMustChangePassword,
                    password_changed_at=CASE WHEN @ownerMustChangePassword=1 THEN NULL ELSE SYSUTCDATETIME() END,
                    status='Active',
                    updated_at=SYSUTCDATETIME()
                WHERE id=@ownerId;
                UPDATE dbo.gym_users
                SET email=@adminEmail,
                    email_normalized=@adminEmail,
                    username=@adminEmail,
                    password_hash=@adminHash,
                    must_change_password=0,
                    password_changed_at=SYSUTCDATETIME(),
                    status='Active',
                    updated_at=SYSUTCDATETIME()
                WHERE id=@adminId;
            `);
    } finally {
        await pool.close();
    }
    console.log('QA_CREDENTIALS_READY');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
