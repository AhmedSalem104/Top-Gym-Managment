'use strict';

// Read-only Production-vs-artifact parity check. The artifact is read from a
// local path; Production queries return aggregate counts only. No row values
// are logged.
const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

function quote(value) { return `[${String(value).replaceAll(']', ']]')}]`; }
function literal(value) { return `N'${String(value).replaceAll("'", "''")}'`; }
function tenantKeyHash(table, value) { return crypto.createHash('sha256').update(`${table}\0${value == null ? '<NULL>' : String(value)}`).digest('hex'); }
function findTenantColumn(row) { return Object.keys(row || {}).find((name) => ['tenantid', 'tenant_id'].includes(name.toLowerCase())); }
function groupArtifactTenantRows(payload) {
    const groups = new Map();
    const legacyRows = payload.tables?.legacy || {};
    const rowsFor = (key) => Array.isArray(legacyRows[key]) ? legacyRows[key] : [];
    const domainUsers = new Map(rowsFor('legacy:DomainUsers').map((row) => [String(row.Id), row.TenantId]));
    const exercises = new Map(rowsFor('legacy:Exercises').map((row) => [String(row.Id), row.TenantId]));
    const foods = new Map(rowsFor('legacy:Foods').map((row) => [String(row.Id), row.TenantId]));
    const recipes = new Map(rowsFor('legacy:Recipes').map((row) => [String(row.Id), row.TenantId]));
    const derivedTenantValue = (key, row) => {
        if (key === 'legacy:UserProfiles') return domainUsers.get(String(row.UserId));
        if (key === 'legacy:ExerciseSecondaryMuscles') return exercises.get(String(row.ExerciseId));
        if (key === 'legacy:FoodMicronutrients') return foods.get(String(row.FoodId));
        if (key === 'legacy:RecipeIngredients') return recipes.get(String(row.RecipeId));
        return undefined;
    };
    for (const [scope, tableMap] of Object.entries(payload.tables || {})) {
        if (!['global', 'tenant', 'legacy'].includes(scope)) continue;
        for (const [key, rows] of Object.entries(tableMap || {})) {
            const table = payload.manifest.tableInventory?.[scope]?.find((item) => item.key === key)?.table || key;
            for (const row of rows || []) {
                const column = findTenantColumn(row);
                const value = column ? row[column] : derivedTenantValue(key, row);
                if (column === undefined && value === undefined) continue;
                const hash = tenantKeyHash(table, value);
                groups.set(`${key}|${hash}`, { key, table, hash, rowCount: (groups.get(`${key}|${hash}`)?.rowCount || 0) + 1 });
            }
        }
    }
    return groups;
}

async function main() {
    if (process.env.DR_PRODUCTION_READ_ONLY_CONFIRM !== 'YES') throw new Error('Explicit read-only confirmation is required.');
    if (process.env.DR_PRODUCTION_ENV_FILE) dotenv.config({ path: process.env.DR_PRODUCTION_ENV_FILE, override: true, quiet: true });
    if (process.env.VERCEL_ENV !== 'production' && !process.env.DR_PRODUCTION_ENV_FILE) throw new Error('Production environment injection is required.');
    const artifactPath = String(process.env.DR_PRODUCTION_ARTIFACT_INPUT || '').trim();
    if (!artifactPath) throw new Error('An explicit local artifact input path is required.');
    const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(artifactPath)).toString('utf8'));
    const { closePool, getPool } = require('../src/database');
    const { runTenantContext } = require('../src/tenancy/tenant-context');
    const { loadTableMetadata, readTableRows, rowsDigest } = require('../src/services/backup-recovery-service');
    const included = [];
    for (const scope of ['global', 'tenant', 'legacy']) {
        for (const item of payload.manifest.tableInventory?.[scope] || []) included.push({ scope, key: item.key, table: item.table, expected: Number(payload.manifest.tableCounts?.[scope]?.[item.key] || 0) });
    }
    const result = await runTenantContext({ mode: 'platform', readOnlyBaseline: true }, async () => {
        const pool = await getPool();
        const countSql = included.map((item) => `SELECT ${literal(item.key)} AS table_key,COUNT_BIG(*) AS row_count FROM dbo.${quote(item.table)}`).join(' UNION ALL ');
        const productionCounts = (await pool.request().query(countSql)).recordset;
        const countMismatches = productionCounts.map((row) => {
            const item = included.find((candidate) => candidate.key === row.table_key);
            return { key: row.table_key, table: item?.table || null, production: Number(row.row_count || 0), artifact: item?.expected ?? null };
        }).filter((item) => item.production !== item.artifact);
        const metadata = (await pool.request().query(`
            SELECT t.name AS table_name,c.name AS tenant_column
            FROM sys.tables t INNER JOIN sys.schemas s ON s.schema_id=t.schema_id
            INNER JOIN sys.columns c ON c.object_id=t.object_id
            WHERE s.name=N'dbo' AND t.is_ms_shipped=0 AND REPLACE(LOWER(c.name),N'_',N'')=N'tenantid';
        `)).recordset;
        const includedByLower = new Map(included.map((item) => [item.table.toLowerCase(), item]));
        const owned = metadata.map((item) => ({ ...item, definition: includedByLower.get(String(item.table_name).toLowerCase()) })).filter((item) => item.definition);
        const derivedSql = [
            ['legacy:UserProfiles', 'UserProfiles', 'p', 'JOIN dbo.DomainUsers u ON u.Id=p.UserId', 'u.TenantId'],
            ['legacy:ExerciseSecondaryMuscles', 'ExerciseSecondaryMuscles', 'x', 'JOIN dbo.Exercises e ON e.Id=x.ExerciseId', 'e.TenantId'],
            ['legacy:FoodMicronutrients', 'FoodMicronutrients', 'f', 'JOIN dbo.Foods d ON d.Id=f.FoodId', 'd.TenantId'],
            ['legacy:RecipeIngredients', 'RecipeIngredients', 'r', 'JOIN dbo.Recipes q ON q.Id=r.RecipeId', 'q.TenantId']
        ].filter(([key]) => included.some((item) => item.key === key)).map(([key, table, alias, join, tenantColumn]) => `SELECT ${literal(key)} AS table_key,CONVERT(nvarchar(4000),${tenantColumn}) AS tenant_key,COUNT_BIG(*) AS row_count FROM dbo.${quote(table)} ${alias} ${join} GROUP BY ${tenantColumn}`);
        const tenantSql = [...owned.map((item) => `SELECT ${literal(item.definition.key)} AS table_key,CONVERT(nvarchar(4000),${quote(item.tenant_column)}) AS tenant_key,COUNT_BIG(*) AS row_count FROM dbo.${quote(item.table_name)} GROUP BY ${quote(item.tenant_column)}`), ...derivedSql].join(' UNION ALL ');
        const productionTenantGroups = tenantSql ? (await pool.request().query(tenantSql)).recordset : [];
        const definitions = included.map((item) => ({ table: item.table, tenantScoped: item.scope === 'tenant' }));
        const tableMetadata = await loadTableMetadata(pool, definitions);
        const productionChecksums = [];
        for (const item of included) {
            const rows = await readTableRows(pool, { table: item.table, tenantScoped: item.scope === 'tenant' }, tableMetadata, { allTenants: true, excludeSensitive: true });
            productionChecksums.push({ key: item.key, sha256: rowsDigest(rows) });
        }
        return { productionCounts, productionTenantGroups, productionChecksums };
    });
    const countMismatches = result.productionCounts.map((row) => {
        const item = included.find((candidate) => candidate.key === row.table_key);
        return { key: row.table_key, table: item?.table || null, production: Number(row.row_count || 0), artifact: item?.expected ?? null };
    }).filter((item) => item.production !== item.artifact);
    const checksumMismatches = result.productionChecksums.map((item) => {
        const expected = payload.manifest.tableInventory?.global?.find((candidate) => candidate.key === item.key)?.sha256
            || payload.manifest.tableInventory?.tenant?.find((candidate) => candidate.key === item.key)?.sha256
            || payload.manifest.tableInventory?.legacy?.find((candidate) => candidate.key === item.key)?.sha256
            || null;
        return { key: item.key, production: item.sha256, artifact: expected };
    }).filter((item) => item.production !== item.artifact).map((item) => ({ key: item.key }));
    const artifactTenantGroups = groupArtifactTenantRows(payload);
    const productionTenantGroups = new Map(result.productionTenantGroups.map((row) => [`${row.table_key}|${tenantKeyHash(included.find((item) => item.key === row.table_key)?.table || row.table_key, row.tenant_key)}`, Number(row.row_count || 0)]));
    const tenantMismatches = [];
    for (const [id, count] of productionTenantGroups) if (artifactTenantGroups.get(id)?.rowCount !== count) tenantMismatches.push({ id, production: count, artifact: artifactTenantGroups.get(id)?.rowCount || 0 });
    for (const [id, item] of artifactTenantGroups) if (!productionTenantGroups.has(id)) tenantMismatches.push({ id, production: 0, artifact: item.rowCount });
    const includedDirect = new Set(result.productionTenantGroups.map((row) => row.table_key));
    const derivedKeys = new Set(['legacy:UserProfiles', 'legacy:ExerciseSecondaryMuscles', 'legacy:FoodMicronutrients', 'legacy:RecipeIngredients']);
    const derivedNonEmpty = included.filter((item) => derivedKeys.has(item.key) && Number(item.expected) > 0 && !result.productionTenantGroups.some((row) => row.table_key === item.key)).map((item) => ({ key: item.key, table: item.table, rows: item.expected }));
    console.log(JSON.stringify({
        operation: 'READ_ONLY_PARITY', database: 'db62278',
        physicalTableCount: payload.manifest.coverage?.physicalTableCount || null,
        includedTableCount: included.length,
        countMismatches,
        checksumMismatches,
        tenantGroupMismatches: tenantMismatches,
        derivedOrUnscopedNonEmpty: derivedNonEmpty,
        productionRowCount: result.productionCounts.reduce((sum, row) => sum + Number(row.row_count || 0), 0),
        artifactRowCount: Number(payload.manifest.rowCount || 0),
        countsPass: countMismatches.length === 0,
        checksumsPass: checksumMismatches.length === 0,
        tenantCoveragePass: tenantMismatches.length === 0 && derivedNonEmpty.length === 0
    }));
    await closePool();
}
main().catch((error) => { console.error(JSON.stringify({ status: 'PRODUCTION_ARTIFACT_PARITY_FAILED', code: error.code || 'UNKNOWN', message: String(error.message || '').slice(0, 240) })); process.exitCode = 1; });
