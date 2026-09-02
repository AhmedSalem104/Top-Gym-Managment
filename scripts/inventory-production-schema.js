'use strict';

// Read-only schema inventory for legacy Production backup classification.
// It reads metadata only; it never reads business row values and never writes
// SQL. Counts come from SQL Server partition metadata so RLS cannot filter
// the inventory itself.
const dotenv = require('dotenv');
const fs = require('node:fs');

let stage = 'validate-input';

function splitColumns(value) {
    return String(value || '').split('|').filter(Boolean);
}

async function main() {
    if (process.env.DR_PRODUCTION_READ_ONLY_CONFIRM !== 'YES') {
        throw new Error('Explicit read-only confirmation is required.');
    }
    if (process.env.DR_PRODUCTION_ENV_FILE) {
        dotenv.config({ path: process.env.DR_PRODUCTION_ENV_FILE, override: true, quiet: true });
    } else if (process.env.VERCEL_ENV !== 'production') {
        throw new Error('Use Vercel production env injection or an explicit temporary env file.');
    }

    stage = 'load-config';
    const { closePool, getPool } = require('../src/database');
    const { parseConnectionString } = require('../src/database/pool');
    const { runTenantContext } = require('../src/tenancy/tenant-context');
    const { config } = require('../src/config/env');
    const { classifyPlatformTable } = require('../src/services/backup-registry');
    const connection = parseConnectionString(config.mssqlConnectionString);

    const result = await runTenantContext({ mode: 'platform', readOnlyBaseline: true }, async () => {
        const pool = await getPool();
        stage = 'database-metadata';
        const database = (await pool.request().query(`
            SELECT DB_NAME() AS database_name,
                   CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(80)) AS sql_version,
                   CAST(SERVERPROPERTY('Edition') AS nvarchar(120)) AS edition,
                   state_desc
            FROM sys.databases WHERE name=DB_NAME();
        `)).recordset[0] || {};

        stage = 'table-metadata';
        const tableRows = (await pool.request().query(`
            SELECT s.name AS schema_name,t.name AS table_name,t.object_id,
                   CAST(CASE WHEN EXISTS (SELECT 1 FROM sys.columns c WHERE c.object_id=t.object_id AND REPLACE(LOWER(c.name),N'_',N'')=N'tenantid') THEN 1 ELSE 0 END AS bit) AS has_tenant_id,
                   CAST(CASE WHEN EXISTS (SELECT 1 FROM sys.security_predicates spr WHERE spr.target_object_id=t.object_id) THEN 1 ELSE 0 END AS bit) AS rls_enabled,
                   COALESCE(SUM(CASE WHEN ps.index_id IN (0,1) THEN ps.row_count ELSE 0 END),0) AS row_count
            FROM sys.tables t
            INNER JOIN sys.schemas s ON s.schema_id=t.schema_id
            LEFT JOIN sys.dm_db_partition_stats ps ON ps.object_id=t.object_id
            WHERE t.is_ms_shipped=0
            GROUP BY s.name,t.name,t.object_id
            ORDER BY s.name,t.name;
        `)).recordset;
        if (!tableRows.length) throw new Error('No application tables were found.');

        // Set-based metadata queries keep this read-only audit fast enough for
        // hosted SQL Server latency while retaining table-level detail.
        stage = 'column-metadata';
        const columns = (await pool.request().query(`
            SELECT c.object_id,c.column_id,c.name,ty.name AS type_name,
                   CASE WHEN ty.name IN (N'nvarchar',N'nchar',N'varbinary',N'binary') THEN c.max_length/2 ELSE c.max_length END AS max_length,
                   c.precision,c.scale,c.is_nullable,dc.definition AS default_definition,
                   c.is_identity
            FROM sys.columns c
            INNER JOIN sys.types ty ON ty.user_type_id=c.user_type_id
            INNER JOIN sys.tables t ON t.object_id=c.object_id AND t.is_ms_shipped=0
            LEFT JOIN sys.default_constraints dc ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id
            ORDER BY c.object_id,c.column_id;
        `)).recordset;

        stage = 'key-metadata';
        const keys = (await pool.request().query(`
            SELECT kc.parent_object_id AS object_id,kc.type,kc.name,
                   STRING_AGG(c.name,N'|') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_columns
            FROM sys.key_constraints kc
            INNER JOIN sys.index_columns ic ON ic.object_id=kc.parent_object_id AND ic.index_id=kc.unique_index_id AND ic.key_ordinal>0
            INNER JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
            GROUP BY kc.parent_object_id,kc.type,kc.name;
        `)).recordset;

        stage = 'index-metadata';
        const indexes = (await pool.request().query(`
            SELECT i.object_id,i.name,i.type_desc,i.is_unique,i.is_primary_key,i.is_unique_constraint,
                   STRING_AGG(c.name,N'|') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_columns
            FROM sys.indexes i
            INNER JOIN sys.tables t ON t.object_id=i.object_id AND t.is_ms_shipped=0
            LEFT JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal>0
            LEFT JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
            WHERE i.name IS NOT NULL AND i.is_hypothetical=0
            GROUP BY i.object_id,i.name,i.type_desc,i.is_unique,i.is_primary_key,i.is_unique_constraint;
        `)).recordset;

        stage = 'foreign-key-metadata';
        const foreignKeys = (await pool.request().query(`
            SELECT fk.parent_object_id AS object_id,fk.name,
                   rs.name AS referenced_schema,rt.name AS referenced_table,
                   STRING_AGG(pc.name,N'|') WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS columns,
                   STRING_AGG(rc.name,N'|') WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS referenced_columns,
                   fk.is_disabled
            FROM sys.foreign_keys fk
            INNER JOIN sys.tables rt ON rt.object_id=fk.referenced_object_id
            INNER JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
            INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
            INNER JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id
            INNER JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id
            GROUP BY fk.parent_object_id,fk.name,rs.name,rt.name,fk.is_disabled;
        `)).recordset;
        const referencedBy = (await pool.request().query(`
            SELECT fk.referenced_object_id AS object_id,fk.name,
                   ps.name AS referencing_schema,pt.name AS referencing_table,
                   STRING_AGG(pc.name,N'|') WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS columns,
                   STRING_AGG(rc.name,N'|') WITHIN GROUP (ORDER BY fkc.constraint_column_id) AS referenced_columns,
                   fk.is_disabled
            FROM sys.foreign_keys fk
            INNER JOIN sys.tables pt ON pt.object_id=fk.parent_object_id
            INNER JOIN sys.schemas ps ON ps.schema_id=pt.schema_id
            INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
            INNER JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id
            INNER JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id
            GROUP BY fk.referenced_object_id,fk.name,ps.name,pt.name,fk.is_disabled;
        `)).recordset;

        stage = 'rls-metadata';
        const rls = (await pool.request().query(`
            SELECT spr.target_object_id AS object_id,sp.name AS policy_name,sp.is_enabled,sp.is_schema_bound,
                   spr.security_predicate_id,spr.predicate_type_desc,spr.predicate_definition
            FROM sys.security_policies sp
            INNER JOIN sys.security_predicates spr ON spr.object_id=sp.object_id
            ORDER BY spr.target_object_id,sp.name,spr.security_predicate_id;
        `)).recordset;
        const checks = (await pool.request().query(`
            SELECT cc.parent_object_id AS object_id,cc.name,cc.definition,cc.is_disabled
            FROM sys.check_constraints cc ORDER BY cc.parent_object_id,cc.name;
        `)).recordset;

        const byObject = (rows) => {
            const map = new Map();
            for (const row of rows) {
                const key = Number(row.object_id);
                const list = map.get(key) || [];
                list.push(row);
                map.set(key, list);
            }
            return map;
        };
        const columnsByObject = byObject(columns);
        const keysByObject = byObject(keys);
        const indexesByObject = byObject(indexes);
        const foreignKeysByObject = byObject(foreignKeys);
        const referencedByObject = byObject(referencedBy);
        const rlsByObject = byObject(rls);
        const checksByObject = byObject(checks);
        const tableInventory = tableRows.map((item) => {
            const objectId = Number(item.object_id);
            const classification = classifyPlatformTable(item.table_name, { hasTenantId: Boolean(item.has_tenant_id) });
            return {
                schema: item.schema_name,name: item.table_name,rowCount: Number(item.row_count || 0),
                hasTenantId: Boolean(item.has_tenant_id),
                backupClassification: classification.classification,
                backupScope: classification.scope,
                backupKey: classification.key,
                backupOwnership: classification.ownership || null,
                backupClassificationReason: classification.reason,
                rls: { enabled: Boolean(item.rls_enabled), policies: (rlsByObject.get(objectId) || []).map((row) => ({ policy: row.policy_name,enabled: Boolean(row.is_enabled),schemaBound: Boolean(row.is_schema_bound),predicateType: row.predicate_type_desc,predicateDefinition: row.predicate_definition || null })) },
                primaryKeys: (keysByObject.get(objectId) || []).filter((row) => row.type === 'PK').map((row) => ({ name: row.name,columns: splitColumns(row.key_columns) })),
                uniqueConstraints: (keysByObject.get(objectId) || []).filter((row) => row.type === 'UQ').map((row) => ({ name: row.name,columns: splitColumns(row.key_columns) })),
                indexes: (indexesByObject.get(objectId) || []).map((row) => ({ name: row.name,type: row.type_desc,unique: Boolean(row.is_unique),primaryKey: Boolean(row.is_primary_key),uniqueConstraint: Boolean(row.is_unique_constraint),keyColumns: splitColumns(row.key_columns) })),
                foreignKeys: (foreignKeysByObject.get(objectId) || []).map((row) => ({ name: row.name,referencedTable: `${row.referenced_schema}.${row.referenced_table}`,columns: splitColumns(row.columns),referencedColumns: splitColumns(row.referenced_columns),disabled: Boolean(row.is_disabled) })),
                referencedBy: (referencedByObject.get(objectId) || []).map((row) => ({ name: row.name,referencingTable: `${row.referencing_schema}.${row.referencing_table}`,columns: splitColumns(row.columns),referencedColumns: splitColumns(row.referenced_columns),disabled: Boolean(row.is_disabled) })),
                checks: (checksByObject.get(objectId) || []).map((row) => ({ name: row.name,definition: row.definition,disabled: Boolean(row.is_disabled) })),
                columns: (columnsByObject.get(objectId) || []).map((row) => ({ ordinal: Number(row.column_id),name: row.name,type: row.type_name,maxLength: row.max_length == null ? null : Number(row.max_length),precision: row.precision == null ? null : Number(row.precision),scale: row.scale == null ? null : Number(row.scale),nullable: Boolean(row.is_nullable),identity: Boolean(row.is_identity),defaultDefinition: row.default_definition || null }))
            };
        });
        return { database: database.database_name || connection.database,server: connection.server,sqlVersion: database.sql_version || null,edition: database.edition || null,state: database.state_desc || null,tableCount: tableInventory.length,tables: tableInventory };
    });
    const output = JSON.stringify({ operation: 'READ_ONLY', ...result });
    if (process.env.DR_SCHEMA_INVENTORY_OUTPUT) fs.writeFileSync(process.env.DR_SCHEMA_INVENTORY_OUTPUT, output, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ operation: 'READ_ONLY',database: result.database,server: result.server,sqlVersion: result.sqlVersion,edition: result.edition,state: result.state,tableCount: result.tableCount,reportWritten: Boolean(process.env.DR_SCHEMA_INVENTORY_OUTPUT) }));
    await closePool();
}

main().catch((error) => {
    const safeMessage = String(error.message || '').replace(/(?:password|pwd|user id|userid|uid|connection string|server=|database=)[^;\s]*/gi, '[redacted]').slice(0, 300);
    console.error(JSON.stringify({ status: 'PRODUCTION_SCHEMA_INVENTORY_FAILED', stage, code: error.code || 'UNKNOWN', message: safeMessage }));
    process.exitCode = 1;
});
