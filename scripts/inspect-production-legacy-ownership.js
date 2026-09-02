'use strict';

// Read-only aggregate audit for legacy TenantId ownership. No row values are
// returned; only counts and null/sentinel counts are emitted.
const dotenv = require('dotenv');

function quote(value) { return `[${String(value).replaceAll(']', ']]')}]`; }

async function main() {
    if (process.env.DR_PRODUCTION_READ_ONLY_CONFIRM !== 'YES') throw new Error('Explicit read-only confirmation is required.');
    if (process.env.DR_PRODUCTION_ENV_FILE) dotenv.config({ path: process.env.DR_PRODUCTION_ENV_FILE, override: true, quiet: true });
    if (process.env.VERCEL_ENV !== 'production' && !process.env.DR_PRODUCTION_ENV_FILE) throw new Error('Production environment injection is required.');
    const { closePool, getPool } = require('../src/database');
    const { runTenantContext } = require('../src/tenancy/tenant-context');
    const { LEGACY_BACKUP_TABLES } = require('../src/services/backup-registry');
    const result = await runTenantContext({ mode: 'platform', readOnlyBaseline: true }, async () => {
        const pool = await getPool();
        const columns = (await pool.request().query(`
            SELECT t.name AS table_name,c.name AS tenant_column
            FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id=t.schema_id
            INNER JOIN sys.columns c ON c.object_id=t.object_id
            WHERE s.name=N'dbo' AND t.is_ms_shipped=0 AND REPLACE(LOWER(c.name),N'_',N'')=N'tenantid';
        `)).recordset;
        const known = new Set(LEGACY_BACKUP_TABLES.map((item) => item.table.toLowerCase()));
        const owned = columns.filter((item) => known.has(String(item.table_name).toLowerCase()));
        if (!owned.length) return [];
        const parts = owned.map((item) => {
            const table = quote(item.table_name);
            const column = quote(item.tenant_column);
            return `SELECT N'${String(item.table_name).replaceAll("'", "''")}' AS table_name,COUNT_BIG(*) AS total_rows,SUM(CASE WHEN ${column} IS NULL THEN 1 ELSE 0 END) AS null_rows,SUM(CASE WHEN TRY_CONVERT(bigint,CONVERT(nvarchar(100),${column}))=0 THEN 1 ELSE 0 END) AS zero_rows,COUNT(DISTINCT CONVERT(nvarchar(100),${column})) AS distinct_tenant_values FROM dbo.${table}`;
        });
        return (await pool.request().query(parts.join(' UNION ALL '))).recordset.map((row) => ({ table: row.table_name,totalRows: Number(row.total_rows || 0),nullRows: Number(row.null_rows || 0),zeroRows: Number(row.zero_rows || 0),distinctTenantValues: Number(row.distinct_tenant_values || 0) }));
    });
    console.log(JSON.stringify({ operation: 'READ_ONLY', database: 'db62278', directLegacyOwnership: result }));
    await closePool();
}
main().catch((error) => { console.error(JSON.stringify({ status: 'PRODUCTION_LEGACY_OWNERSHIP_FAILED', code: error.code || 'UNKNOWN', message: String(error.message || '').slice(0, 240) })); process.exitCode = 1; });
