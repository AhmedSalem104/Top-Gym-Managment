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

async function main() {
    const connection = required('MSSQL_CONNECTION_STRING');
    const database = connection.match(/(?:Database|Initial Catalog)=([^;]+)/i)?.[1] || '';
    const server = connection.match(/(?:Server|Data Source)=([^;]+)/i)?.[1] || '';
    if (!/^localhost(?:\\|,|$)/i.test(server) || !/^LogicFit_/i.test(database)) {
        throw new Error('QA credential preparation is restricted to a localhost LogicFit_ database.');
    }

    const ownerPassword = required('QA_OWNER_PASSWORD');
    const adminPassword = required('QA_PLATFORM_ADMIN_PASSWORD');
    const ownerEmail = process.env.QA_GYM_OWNER_EMAIL || 'qa-gym-owner@local.test';
    const adminEmail = process.env.QA_ADMIN_EMAIL || 'qa-platform-admin@local.test';
    const ownerMustChangePassword = String(process.env.QA_OWNER_MUST_CHANGE_PASSWORD ?? '1').trim() !== '0';
    const pool = await getPool();
    try {
        const ownerHash = await authService.hashPassword(ownerPassword);
        const adminHash = await authService.hashPassword(adminPassword);
        await pool.request()
            .input('ownerHash', sql.NVarChar(512), ownerHash)
            .input('adminHash', sql.NVarChar(512), adminHash)
            .input('ownerEmail', sql.NVarChar(254), ownerEmail)
            .input('adminEmail', sql.NVarChar(254), adminEmail)
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
                WHERE id=11;
                UPDATE dbo.gym_users
                SET email=@adminEmail,
                    email_normalized=@adminEmail,
                    username=@adminEmail,
                    password_hash=@adminHash,
                    must_change_password=0,
                    password_changed_at=SYSUTCDATETIME(),
                    status='Active',
                    updated_at=SYSUTCDATETIME()
                WHERE id=15;
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
