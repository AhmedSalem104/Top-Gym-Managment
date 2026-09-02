'use strict';

// Local/test-only application-level DR drill for a legacy Production artifact.
// This script creates one fresh local database, bootstraps the current schema,
// restores the captured legacy schema/data, and verifies logical parity. It
// refuses non-local SQL Server targets and never connects to Production.
const crypto = require('node:crypto');
const fs = require('node:fs');
const zlib = require('node:zlib');
const dotenv = require('dotenv');
const sql = require('mssql');

function safeDatabaseName(value) {
    const name = String(value || '').trim();
    if (!/^LogicFit_DR_Legacy_[0-9]{8}_[0-9]{6}_[a-f0-9]{8}$/i.test(name)) {
        throw new Error('A generated isolated local restore database name is required.');
    }
    return name;
}

function isLocalServer(value) {
    return /^(localhost|127\.0\.0\.1|::1|\.|\(local\))(\\[^,]+)?$/i.test(String(value || '').trim());
}

function replaceDatabase(connectionString, database) {
    const parts = String(connectionString || '').split(';');
    let replaced = false;
    const output = parts.map((part) => {
        const index = part.indexOf('=');
        if (index < 0) return part;
        const key = part.slice(0, index).trim().toLowerCase().replace(/\s+/g, '');
        if (!['database', 'initialcatalog'].includes(key)) return part;
        replaced = true;
        return `${part.slice(0, index + 1)}${database}`;
    });
    if (!replaced) throw new Error('The local connection does not declare a database.');
    return output.join(';');
}

function parseRawConnection(connectionString) {
    const values = {};
    for (const segment of String(connectionString || '').split(';')) {
        const separator = segment.indexOf('=');
        if (separator < 0) continue;
        const key = segment.slice(0, separator).trim().toLowerCase().replace(/\s+/g, '');
        values[key] = segment.slice(separator + 1).trim();
    }
    const serverValue = values.server || values.datasource || values.data_source || values.address;
    const databaseValue = values.database || values.initialcatalog;
    const userValue = values.userid || values.user || values.uid;
    const passwordValue = values.password ?? values.pwd;
    if (!serverValue || !databaseValue || !userValue || passwordValue === undefined) throw new Error('The local SQL Server connection is incomplete.');
    const serverParts = serverValue.split(',');
    const config = {
        server: serverParts[0],
        database: databaseValue,
        user: userValue,
        password: passwordValue,
        connectionTimeout: 30_000,
        requestTimeout: 600_000,
        options: {
            encrypt: ['true', '1', 'yes'].includes(String(values.encrypt ?? 'true').toLowerCase()),
            trustServerCertificate: ['true', '1', 'yes'].includes(String(values.trustservercertificate ?? 'false').toLowerCase())
        },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 }
    };
    if (serverParts[1] !== undefined) config.port = Number(serverParts[1]);
    return config;
}

function quoteDatabase(value) {
    return `[${safeDatabaseName(value).replaceAll(']', ']]')}]`;
}

function parseArtifact(fileName) {
    const buffer = fs.readFileSync(fileName);
    const payload = JSON.parse(zlib.gunzipSync(buffer).toString('utf8'));
    return { buffer, payload };
}

function includedItems(payload) {
    return ['global', 'tenant', 'legacy'].flatMap((scope) => (payload.manifest?.tableInventory?.[scope] || []).map((item) => ({
        scope,
        key: item.key,
        table: item.table,
        expectedRows: Number(payload.manifest?.tableCounts?.[scope]?.[item.key] || 0),
        expectedSha256: item.sha256
    })));
}

function projectRowsToArtifactColumns(rows, artifactRows, tableName = '') {
    const columns = [];
    for (const row of Array.isArray(artifactRows) ? artifactRows : []) {
        for (const column of Object.keys(row || {})) if (!columns.some((item) => item.toLowerCase() === column.toLowerCase())) columns.push(column);
    }
    return (Array.isArray(rows) ? rows : []).map((row) => Object.fromEntries(columns.map((column) => {
        const actualColumn = Object.keys(row || {}).find((candidate) => candidate.toLowerCase() === column.toLowerCase());
        // The legacy gym_users schema represented account state as is_active;
        // the current schema represents the same state as status. Preserve
        // the business meaning during a logical restore without adding a
        // legacy-only column to the canonical schema.
        if (actualColumn === undefined && String(tableName).toLowerCase() === 'gym_users' && column.toLowerCase() === 'is_active') {
            const statusColumn = Object.keys(row || {}).find((candidate) => candidate.toLowerCase() === 'status');
            if (statusColumn !== undefined) return [column, ['active', 'enabled'].includes(String(row[statusColumn]).trim().toLowerCase())];
        }
        return [column, actualColumn === undefined ? null : row[actualColumn]];
    })));
}

async function verifyRestoredParity(payload, runTenantContext, getPool, loadTableMetadata, readTableRows, rowsDigest) {
    const included = includedItems(payload);
    const result = await runTenantContext({ mode: 'platform', readOnlyBaseline: true }, async () => {
        const pool = await getPool();
        const metadata = await loadTableMetadata(pool, included.map((item) => ({ table: item.table })));
        const countMismatches = [];
        const checksumMismatches = [];
        let restoredRowCount = 0;
        for (const item of included) {
            const rows = await readTableRows(pool, { table: item.table, tenantScoped: item.scope === 'tenant' }, metadata, { allTenants: true, excludeSensitive: true });
            restoredRowCount += rows.length;
            if (rows.length !== item.expectedRows) countMismatches.push({ key: item.key, table: item.table, expected: item.expectedRows, restored: rows.length });
            // The target is bootstrapped with the current schema, which may
            // contain additive columns absent from a legacy source (including
            // tenant_type) and regenerated credential fields. Compare the
            // exact source projection represented by the artifact instead of
            // treating those additive recovery columns as data loss.
            const sourceRows = payload.tables?.[item.scope]?.[item.key] || [];
            const checksum = rowsDigest(projectRowsToArtifactColumns(rows, sourceRows, item.table));
            if (checksum !== item.expectedSha256) checksumMismatches.push({ key: item.key });
        }
        return { countMismatches, checksumMismatches, restoredRowCount };
    });
    return {
        ...result,
        artifactRowCount: Number(payload.manifest?.rowCount || 0),
        countsPass: result.countMismatches.length === 0 && result.restoredRowCount === Number(payload.manifest?.rowCount || 0),
        checksumsPass: result.checksumMismatches.length === 0
    };
}

async function main() {
    const artifactPath = process.argv[2];
    if (!artifactPath) throw new Error('Usage: node scripts/restore-production-legacy-artifact.js <artifact.json.gz>');
    dotenv.config({ quiet: true });
    const rawConnectionString = process.env.MSSQL_CONNECTION_STRING || process.env.DATABASE_URL;
    if (!rawConnectionString) throw new Error('A local SQL Server connection is required.');

    const originalConnection = parseRawConnection(rawConnectionString);
    if (!isLocalServer(originalConnection.server)) throw new Error('This restore drill refuses a non-local SQL Server.');
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '');
    const databaseName = safeDatabaseName(`LogicFit_DR_Legacy_${stamp.slice(0, 8)}_${stamp.slice(8, 14)}_${crypto.randomBytes(4).toString('hex')}`);
    const targetConnectionString = replaceDatabase(rawConnectionString, databaseName);
    const targetConnection = parseRawConnection(targetConnectionString);
    const masterConnection = { ...targetConnection, database: 'master' };
    const masterPool = await sql.connect(masterConnection);
    try {
        const exists = await masterPool.request().input('databaseName', sql.NVarChar(128), databaseName).query('SELECT DB_ID(@databaseName) AS database_id;');
        if (exists.recordset[0]?.database_id != null) throw new Error('Generated restore database already exists.');
        await masterPool.request().query(`CREATE DATABASE ${quoteDatabase(databaseName)};`);
    } finally {
        await masterPool.close();
    }

    process.env.MSSQL_CONNECTION_STRING = targetConnectionString;
    process.env.MIGRATION_ENV = 'test';
    process.env.NODE_ENV = 'test';
    process.env.DR_RESTORE_TARGET = 'local';
    process.env.DR_RESTORE_CONFIRM = 'YES';
    const { migrate } = require('./migrate-tenancy');
    const { closePool, getPool } = require('../src/database');
    const { runTenantContext } = require('../src/tenancy/tenant-context');
    const recovery = require('../src/services/backup-recovery-service');
    const { buffer, payload } = parseArtifact(artifactPath);
    const artifactChecksum = crypto.createHash('sha256').update(buffer).digest('hex');
    try {
        await migrate();
        const restored = await runTenantContext({ mode: 'platform' }, () => recovery.restorePlatformBackup(buffer, {
            reason: 'Local/test legacy Production application-level DR restore drill',
            clearTarget: true
        }));
        const parity = await verifyRestoredParity(payload, runTenantContext, getPool, recovery.loadTableMetadata, recovery.readTableRows, recovery.rowsDigest);
        console.log(JSON.stringify({
            operation: 'LOCAL_LEGACY_PRODUCTION_DR_RESTORE',
            database: databaseName,
            databaseType: 'NON-PRODUCTION / PRODUCTION-EQUIVALENT REHEARSAL',
            artifactChecksum,
            artifactRowCount: Number(payload.manifest?.rowCount || 0),
            restoredRowCount: restored.rowCount,
            restoredTables: Object.values(restored.tableCounts || {}).reduce((sum, scope) => sum + Object.keys(scope || {}).length, 0),
            parity,
            restored: true,
            credentialsReset: true
        }));
        if (!parity.countsPass || !parity.checksumsPass) process.exitCode = 1;
    } finally {
        await closePool();
    }
}

main().catch((error) => {
    console.error(JSON.stringify({ restored: false, code: error.code || 'LOCAL_LEGACY_RESTORE_FAILED', message: String(error.message || '').slice(0, 300) }));
    process.exitCode = 1;
});
