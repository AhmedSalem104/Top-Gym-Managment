const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { promisify } = require('node:util');
const { gzip, gunzip } = require('node:zlib');
const { getPool, sql } = require('../database');
const { ensureExpensesTable } = require('./finance-service');
const { ensurePaymentTransactionsTable } = require('./member-service');
const { ensureAttendanceTable } = require('./attendance-service');
const { ensureLibraryData } = require('./library-service');
const { ensureCoachingTables } = require('./coaching-service');
const { ensureDayPassTables } = require('../repositories/day-pass.repository');
const { ensureStoreTables } = require('./store-service');
const { config } = require('../config/env');

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const MAX_BACKUP_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_BACKUP_JSON_BYTES = 80 * 1024 * 1024;
const MAX_BACKUP_ROWS = 150000;
const DAILY_BACKUP_RETENTION_DAYS = 2;

// Keep the backup limited to the tables owned by this application. The shared
// database also contains dbo.Payments, which belongs to another system.
const BACKUP_TABLES = [
    { key: 'members', table: 'members' },
    { key: 'memberships', table: 'memberships' },
    { key: 'membership_pricing', table: 'membership_pricing' },
    { key: 'membership_types', table: 'membership_types' },
    { key: 'membership_type_prices', table: 'membership_type_prices' },
    { key: 'gym_day_pass_types', table: 'gym_day_pass_types' },
    { key: 'gym_day_pass_sales', table: 'gym_day_pass_sales' },
    { key: 'membership_freezes', table: 'membership_freezes' },
    { key: 'gym_payments', table: 'gym_payments' },
    { key: 'gym_payment_transactions', table: 'gym_payment_transactions' },
    { key: 'gym_subscription_refunds', table: 'gym_subscription_refunds' },
    { key: 'gym_expenses', table: 'gym_expenses' },
    { key: 'gym_store_categories', table: 'gym_store_categories' },
    { key: 'gym_store_suppliers', table: 'gym_store_suppliers' },
    { key: 'gym_store_products', table: 'gym_store_products' },
    { key: 'gym_store_product_variants', table: 'gym_store_product_variants' },
    { key: 'gym_store_customers', table: 'gym_store_customers' },
    { key: 'gym_store_purchases', table: 'gym_store_purchases' },
    { key: 'gym_store_purchase_items', table: 'gym_store_purchase_items' },
    { key: 'gym_store_purchase_payments', table: 'gym_store_purchase_payments' },
    { key: 'gym_store_inventory_balances', table: 'gym_store_inventory_balances' },
    { key: 'gym_store_inventory_batches', table: 'gym_store_inventory_batches' },
    { key: 'gym_store_stock_movements', table: 'gym_store_stock_movements' },
    { key: 'gym_store_sales', table: 'gym_store_sales' },
    { key: 'gym_store_sale_items', table: 'gym_store_sale_items' },
    { key: 'gym_store_sale_payments', table: 'gym_store_sale_payments' },
    { key: 'gym_store_returns', table: 'gym_store_returns' },
    { key: 'gym_store_return_items', table: 'gym_store_return_items' },
    { key: 'gym_store_audit_log', table: 'gym_store_audit_log' },
    { key: 'gym_attendance', table: 'gym_attendance' },
    { key: 'membership_events', table: 'membership_events' },
    { key: 'gym_muscles', table: 'gym_muscles' },
    { key: 'gym_foods', table: 'gym_foods' },
    { key: 'gym_exercises', table: 'gym_exercises' },
    { key: 'workout_programs', table: 'workout_programs' },
    { key: 'workout_routines', table: 'workout_routines' },
    { key: 'workout_exercises', table: 'workout_exercises' },
    { key: 'diet_plans', table: 'diet_plans' },
    { key: 'diet_meals', table: 'diet_meals' },
    { key: 'diet_meal_items', table: 'diet_meal_items' },
    { key: 'body_measurements', table: 'body_measurements' },
    { key: 'athlete_checkins', table: 'athlete_checkins' },
    { key: 'coaching_activity_events', table: 'coaching_activity_events' },
    { key: 'workout_sessions', table: 'workout_sessions' },
    { key: 'workout_set_logs', table: 'workout_set_logs' },
    { key: 'meal_logs', table: 'meal_logs' }
];

const BACKUP_TABLE_BY_KEY = new Map(BACKUP_TABLES.map((item) => [item.key, item]));
let backupOperationsPromise;
let backupArchivesPromise;
let restoreInProgress = false;

function backupInputError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    error.expose = true;
    error.code = 'BACKUP_FILE_INVALID';
    return error;
}

function getLocalTimeParts(date = new Date()) {
    const timeZone = config.appTimeZone;
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );

    return {
        timeZone,
        stamp: `${values.year}-${values.month}-${values.day}_${values.hour}-${values.minute}`
    };
}

async function readTable(pool, table) {
    const result = await pool.request().query(`SELECT * FROM dbo.[${table}];`);
    return result.recordset;
}

async function ensureBackupOperationsTable() {
    if (!backupOperationsPromise) {
        backupOperationsPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_backup_operations', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_backup_operations (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_operations PRIMARY KEY,
                        operation_type VARCHAR(20) NOT NULL,
                        file_name NVARCHAR(260) NULL,
                        source_generated_at DATETIME2(0) NULL,
                        row_count INT NOT NULL CONSTRAINT DF_gym_backup_operations_rows DEFAULT (0),
                        table_counts NVARCHAR(MAX) NULL,
                        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_backup_operations_status DEFAULT ('success'),
                        details NVARCHAR(1000) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_operations_created DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT CK_gym_backup_operations_type CHECK (operation_type IN ('download', 'inspect', 'restore')),
                        CONSTRAINT CK_gym_backup_operations_status CHECK (status IN ('success', 'failed'))
                    );
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_backup_operations_created'
                      AND object_id = OBJECT_ID(N'dbo.gym_backup_operations')
                )
                    CREATE INDEX IX_gym_backup_operations_created ON dbo.gym_backup_operations(created_at DESC, id DESC);
            `);
        })().catch((error) => {
            backupOperationsPromise = undefined;
            throw error;
        });
    }
    return backupOperationsPromise;
}

async function ensureBackupArchivesTable() {
    if (!backupArchivesPromise) {
        backupArchivesPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_backup_archives', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_backup_archives (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_archives PRIMARY KEY,
                        backup_day DATE NOT NULL,
                        file_name NVARCHAR(260) NOT NULL,
                        backup_format VARCHAR(10) NOT NULL,
                        generated_at DATETIME2(0) NOT NULL,
                        content VARBINARY(MAX) NOT NULL,
                        content_bytes BIGINT NOT NULL,
                        row_count INT NOT NULL CONSTRAINT DF_gym_backup_archives_rows DEFAULT (0),
                        table_counts NVARCHAR(MAX) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_archives_created DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT CK_gym_backup_archives_format CHECK (backup_format IN ('json.gz', 'bak')),
                        CONSTRAINT UQ_gym_backup_archives_day_format UNIQUE (backup_day, backup_format)
                    );
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_backup_archives_created'
                      AND object_id = OBJECT_ID(N'dbo.gym_backup_archives')
                )
                    CREATE INDEX IX_gym_backup_archives_created ON dbo.gym_backup_archives(created_at DESC, id DESC);
            `);
        })().catch((error) => {
            backupArchivesPromise = undefined;
            throw error;
        });
    }
    return backupArchivesPromise;
}

function totalRows(tableCounts = {}) {
    return Object.values(tableCounts).reduce((sum, value) => sum + Number(value || 0), 0);
}

function backupTablesDigest(tables) {
    return createHash('sha256')
        .update(JSON.stringify(tables))
        .digest('hex');
}

function validateBackupPayload(payload) {
    if (!payload || payload.format !== 'top-gym-json-backup') {
        throw backupInputError('ملف النسخة الاحتياطية غير صالح أو ليس من TOP GYM.');
    }
    if (Number(payload.version || 0) !== 1) {
        throw backupInputError('إصدار النسخة الاحتياطية غير مدعوم.');
    }
    if (!payload.tables || typeof payload.tables !== 'object' || Array.isArray(payload.tables)) {
        throw backupInputError('بيانات الجداول غير موجودة داخل ملف النسخة الاحتياطية.');
    }
    const unknownTables = Object.keys(payload.tables).filter((key) => !BACKUP_TABLE_BY_KEY.has(key));
    if (unknownTables.length) throw backupInputError(`النسخة تحتوي على جداول غير معروفة: ${unknownTables.join(', ')}.`);
    if (!Array.isArray(payload.tables.members)) throw backupInputError('جدول الأعضاء غير موجود داخل النسخة.');

    const tableCounts = {};
    let rowCount = 0;
    for (const [key, rows] of Object.entries(payload.tables)) {
        if (!Array.isArray(rows)) throw backupInputError(`بيانات جدول ${key} غير صالحة.`);
        if (rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw backupInputError(`يوجد صف غير صالح داخل جدول ${key}.`);
        }
        tableCounts[key] = rows.length;
        rowCount += rows.length;
        if (rowCount > MAX_BACKUP_ROWS) throw backupInputError('حجم النسخة أكبر من الحد الآمن المسموح به.');
    }
    let integrity = null;
    if (payload.integrity !== undefined) {
        const algorithm = String(payload.integrity?.algorithm || '').toLowerCase();
        const digest = String(payload.integrity?.sha256 || '').toLowerCase();
        if (algorithm !== 'sha256' || !/^[a-f0-9]{64}$/.test(digest)) {
            throw backupInputError('بيانات سلامة النسخة الاحتياطية غير صالحة.');
        }
        if (backupTablesDigest(payload.tables) !== digest) {
            throw backupInputError('تم تغيير محتوى النسخة أو تلفه بعد إنشائها.');
        }
        integrity = { algorithm, verified: true };
    }
    return { tableCounts, rowCount, integrity };
}

async function inspectBackupBuffer(input) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
    if (!buffer.length || buffer.length > MAX_BACKUP_UPLOAD_BYTES) {
        throw backupInputError('ملف النسخة فارغ أو أكبر من الحد المسموح به (25 ميجابايت).');
    }
    if (buffer[0] !== 0x1f || buffer[1] !== 0x8b) {
        throw backupInputError('يجب اختيار ملف TOP GYM بصيغة .json.gz أو .bak المضغوطة.');
    }
    let jsonBuffer;
    try {
        jsonBuffer = await gunzipAsync(buffer, { maxOutputLength: MAX_BACKUP_JSON_BYTES });
    } catch (_) {
        throw backupInputError('تعذر فك ضغط ملف النسخة. تأكد من سلامة الملف.');
    }
    let payload;
    try {
        payload = JSON.parse(jsonBuffer.toString('utf8'));
    } catch (_) {
        throw backupInputError('محتوى النسخة ليس JSON صالحًا.');
    }
    const validation = validateBackupPayload(payload);
    return {
        payload,
        generatedAt: payload.generatedAt || null,
        timeZone: payload.timeZone || null,
        compressedBytes: buffer.length,
        jsonBytes: jsonBuffer.length,
        rowCount: validation.rowCount,
        tableCounts: validation.tableCounts,
        integrity: validation.integrity
    };
}

async function recordBackupOperation({ operationType, fileName = null, sourceGeneratedAt = null, tableCounts = {}, status = 'success', details = null } = {}) {
    await ensureBackupOperationsTable();
    const pool = await getPool();
    const sourceDate = sourceGeneratedAt ? new Date(sourceGeneratedAt) : null;
    await pool.request()
        .input('operationType', sql.VarChar(20), operationType)
        .input('fileName', sql.NVarChar(260), String(fileName ?? '').slice(0, 260) || null)
        .input('sourceGeneratedAt', sql.DateTime2(0), sourceDate && !Number.isNaN(sourceDate.getTime()) ? sourceDate : null)
        .input('rowCount', sql.Int, totalRows(tableCounts))
        .input('tableCounts', sql.NVarChar(4000), JSON.stringify(tableCounts))
        .input('status', sql.VarChar(20), status)
        .input('details', sql.NVarChar(1000), String(details ?? '').slice(0, 1000) || null)
        .query(`INSERT INTO dbo.gym_backup_operations
                    (operation_type, file_name, source_generated_at, row_count, table_counts, status, details)
                VALUES (@operationType, @fileName, @sourceGeneratedAt, @rowCount, @tableCounts, @status, @details);`);
}

async function getBackupHistory(limit = 30) {
    await ensureBackupOperationsTable();
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
    const pool = await getPool();
    const result = await pool.request().input('limit', sql.Int, safeLimit).query(`
        SELECT TOP (@limit) id, operation_type, file_name, source_generated_at, row_count,
               table_counts, status, details, created_at
        FROM dbo.gym_backup_operations
        ORDER BY created_at DESC, id DESC;
    `);
    return result.recordset.map((row) => ({
        id: Number(row.id),
        operationType: row.operation_type,
        fileName: row.file_name,
        sourceGeneratedAt: row.source_generated_at,
        rowCount: Number(row.row_count || 0),
        tableCounts: (() => { try { return JSON.parse(row.table_counts || '{}'); } catch (_) { return {}; } })(),
        status: row.status,
        details: row.details,
        createdAt: row.created_at
    }));
}

function mapBackupArchiveRow(row) {
    return {
        id: Number(row.id),
        backupDay: row.backup_day,
        fileName: row.file_name,
        format: row.backup_format,
        generatedAt: row.generated_at,
        contentBytes: Number(row.content_bytes || 0),
        rowCount: Number(row.row_count || 0),
        tableCounts: (() => { try { return JSON.parse(row.table_counts || '{}'); } catch (_) { return {}; } })(),
        createdAt: row.created_at
    };
}

async function getScheduledBackupHistory(limit = 10) {
    await ensureBackupArchivesTable();
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));
    const pool = await getPool();
    const result = await pool.request().input('limit', sql.Int, safeLimit).query(`
        SELECT TOP (@limit) id, backup_day, file_name, backup_format, generated_at,
               content_bytes, row_count, table_counts, created_at
        FROM dbo.gym_backup_archives
        ORDER BY backup_day DESC, id DESC;
    `);
    return result.recordset.map(mapBackupArchiveRow);
}

async function getBackupArchive(id) {
    await ensureBackupArchivesTable();
    const archiveId = Number.parseInt(id, 10);
    if (!Number.isInteger(archiveId) || archiveId < 1) {
        const error = new Error('رقم النسخة الاحتياطية غير صالح.');
        error.statusCode = 400;
        error.expose = true;
        throw error;
    }
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, archiveId).query(`
        SELECT TOP (1) id, backup_day, file_name, backup_format, generated_at,
               content, content_bytes, row_count, table_counts, created_at
        FROM dbo.gym_backup_archives
        WHERE id = @id;
    `);
    if (!result.recordset.length) {
        const error = new Error('النسخة الاحتياطية المطلوبة غير موجودة أو انتهت مدة الاحتفاظ بها.');
        error.statusCode = 404;
        error.expose = true;
        throw error;
    }
    const row = result.recordset[0];
    return { ...mapBackupArchiveRow(row), content: row.content };
}

async function deleteBackupArchive(id) {
    await ensureBackupArchivesTable();
    const archiveId = Number.parseInt(id, 10);
    if (!Number.isInteger(archiveId) || archiveId < 1) {
        const error = new Error('رقم النسخة الاحتياطية غير صالح.');
        error.statusCode = 400;
        error.expose = true;
        throw error;
    }
    const pool = await getPool();
    const result = await pool.request()
        .input('id', sql.Int, archiveId)
        .query('DELETE FROM dbo.gym_backup_archives WHERE id = @id;');
    if (!result.rowsAffected.some((count) => Number(count) > 0)) {
        const error = new Error('النسخة الاحتياطية المطلوبة غير موجودة أو انتهت مدة الاحتفاظ بها.');
        error.statusCode = 404;
        error.expose = true;
        throw error;
    }
    return { id: archiveId };
}

async function createScheduledBackupArchive({ format = 'bak' } = {}) {
    await ensureBackupArchivesTable();
    const backup = await createBackup({ format });
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let archive;
    let created = false;
    try {
        const result = await transaction.request()
            .input('backupDay', sql.Date, new Date(`${backup.backupDay}T00:00:00.000Z`))
            .input('fileName', sql.NVarChar(260), backup.filename)
            .input('backupFormat', sql.VarChar(10), backup.format)
            .input('generatedAt', sql.DateTime2(0), new Date(backup.generatedAt))
            .input('content', sql.VarBinary(sql.MAX), backup.buffer)
            .input('contentBytes', sql.BigInt, backup.buffer.length)
            .input('rowCount', sql.Int, totalRows(backup.rowCounts))
            .input('tableCounts', sql.NVarChar(4000), JSON.stringify(backup.rowCounts))
            .query(`
                DECLARE @inserted BIT = 0;
                IF NOT EXISTS (
                    SELECT 1
                    FROM dbo.gym_backup_archives WITH (UPDLOCK, HOLDLOCK)
                    WHERE backup_day = @backupDay AND backup_format = @backupFormat
                )
                BEGIN
                    INSERT INTO dbo.gym_backup_archives
                        (backup_day, file_name, backup_format, generated_at, content, content_bytes, row_count, table_counts)
                    VALUES
                        (@backupDay, @fileName, @backupFormat, @generatedAt, @content, @contentBytes, @rowCount, @tableCounts);
                    SET @inserted = 1;
                END;
                SELECT @inserted AS inserted, id, backup_day, file_name, backup_format, generated_at,
                       content_bytes, row_count, table_counts, created_at
                FROM dbo.gym_backup_archives
                WHERE backup_day = @backupDay AND backup_format = @backupFormat;
            `);
        const row = result.recordset[0];
        created = Boolean(Number(row?.inserted || 0));
        archive = row ? mapBackupArchiveRow(row) : null;

        const cutoff = new Date(Date.now() - DAILY_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        await transaction.request()
            .input('cutoff', sql.DateTime2(0), cutoff)
            .query('DELETE FROM dbo.gym_backup_archives WHERE created_at < @cutoff;');
        await transaction.commit();
    } catch (error) {
        try { await transaction.rollback(); } catch (_) { /* preserve original error */ }
        throw error;
    }

    if (created) {
        await recordBackupOperation({
            operationType: 'download',
            fileName: backup.filename,
            sourceGeneratedAt: backup.generatedAt,
            tableCounts: backup.rowCounts,
            details: `تم حفظ النسخة اليومية تلقائيًا بصيغة .${backup.format}. مدة الاحتفاظ: يومان.`
        }).catch((error) => console.warn('Unable to record scheduled backup:', error.message));
    }
    return {
        created,
        archive,
        generatedAt: backup.generatedAt,
        retentionDays: DAILY_BACKUP_RETENTION_DAYS
    };
}

async function tableMetadata(pool, table) {
    const result = await pool.request().input('tableName', sql.NVarChar(128), table).query(`
        SELECT c.name, c.is_identity AS isIdentity, c.is_computed AS isComputed
        FROM sys.columns AS c
        INNER JOIN sys.tables AS t ON t.object_id = c.object_id
        INNER JOIN sys.schemas AS s ON s.schema_id = t.schema_id
        WHERE s.name = N'dbo' AND t.name = @tableName;
    `);
    if (!result.recordset.length) throw new Error(`جدول ${table} غير موجود في قاعدة البيانات الحالية.`);
    return result.recordset;
}

function restoreValue(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    throw backupInputError('النسخة تحتوي على قيمة غير مدعومة.');
}

async function insertBackupTable(transaction, tableDefinition, rows, metadata) {
    if (!rows.length) return;
    const columns = metadata.filter((column) => !column.isComputed);
    const columnNames = new Map(columns.map((column) => [column.name.toLowerCase(), column.name]));
    const insertColumns = columns.filter((column) => rows.some((row) => Object.prototype.hasOwnProperty.call(row, column.name) || Object.prototype.hasOwnProperty.call(row, column.name.toLowerCase())));
    if (!insertColumns.length) return;
    const quotedTable = `dbo.[${tableDefinition.table}]`;
    const quotedColumns = insertColumns.map((column) => `[${column.name}]`).join(', ');
    const useIdentity = insertColumns.some((column) => column.isIdentity);
    if (useIdentity) await transaction.request().query(`SET IDENTITY_INSERT ${quotedTable} ON;`);
    try {
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            const request = transaction.request();
            const values = insertColumns.map((column, columnIndex) => {
                const sourceKey = Object.keys(row).find((key) => key.toLowerCase() === column.name.toLowerCase());
                const value = restoreValue(sourceKey === undefined ? null : row[sourceKey]);
                const parameter = `b${rowIndex}_${columnIndex}`;
                if (value === null) request.input(parameter, sql.NVarChar(1), null);
                else request.input(parameter, value);
                return `@${parameter}`;
            });
            await request.query(`INSERT INTO ${quotedTable} (${quotedColumns}) VALUES (${values.join(', ')});`);
        }
    } finally {
        if (useIdentity) await transaction.request().query(`SET IDENTITY_INSERT ${quotedTable} OFF;`).catch(() => {});
    }
}

async function restoreBackup(input, { fileName = 'uploaded-backup.json.gz' } = {}) {
    if (restoreInProgress) {
        const error = new Error('يوجد استرجاع آخر قيد التنفيذ. انتظر حتى ينتهي.');
        error.statusCode = 409;
        error.expose = true;
        throw error;
    }
    const inspected = input?.payload ? input : await inspectBackupBuffer(input);
    validateBackupPayload(inspected.payload);
    restoreInProgress = true;
    try {
        await ensureBackupOperationsTable();
        await ensureExpensesTable();
        await ensurePaymentTransactionsTable();
        await ensureAttendanceTable();
        await ensureLibraryData();
        await ensureCoachingTables();
        await ensureDayPassTables();
        await ensureStoreTables();
        const pool = await getPool();
        const metadataEntries = await Promise.all(BACKUP_TABLES.map(async (item) => [item.table, await tableMetadata(pool, item.table)]));
        const metadata = new Map(metadataEntries);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            for (const item of [...BACKUP_TABLES].reverse()) {
                if (Object.prototype.hasOwnProperty.call(inspected.payload.tables, item.key)) {
                    await transaction.request().query(`DELETE FROM dbo.[${item.table}];`);
                }
            }
            for (const item of BACKUP_TABLES) {
                if (Object.prototype.hasOwnProperty.call(inspected.payload.tables, item.key)) {
                    await insertBackupTable(transaction, item, inspected.payload.tables[item.key] || [], metadata.get(item.table));
                }
            }
            await transaction.commit();
        } catch (error) {
            try { await transaction.rollback(); } catch (_) { /* preserve original error */ }
            throw error;
        }
        await recordBackupOperation({
            operationType: 'restore',
            fileName,
            sourceGeneratedAt: inspected.generatedAt,
            tableCounts: inspected.tableCounts,
            details: inspected.integrity
                ? 'تم استرجاع النسخة بعد التحقق من البنية والصفوف وبصمة SHA-256.'
                : 'تم استرجاع النسخة بعد التحقق من البنية والصفوف.'
        }).catch((error) => console.warn('Unable to record backup restore:', error.message));
        return {
            rowCount: inspected.rowCount,
            tableCounts: inspected.tableCounts,
            generatedAt: inspected.generatedAt,
            integrity: inspected.integrity
        };
    } finally {
        restoreInProgress = false;
    }
}

async function createBackup({ format = 'json.gz' } = {}) {
    const backupFormat = String(format).toLowerCase() === 'bak' ? 'bak' : 'json.gz';
    await ensureExpensesTable();
    await ensurePaymentTransactionsTable();
    await ensureAttendanceTable();
    await ensureLibraryData();
    await ensureCoachingTables();
    await ensureDayPassTables();
    await ensureStoreTables();
    const pool = await getPool();
    const generatedAt = new Date();
    const { timeZone, stamp } = getLocalTimeParts(generatedAt);
    const tableRows = await Promise.all(
        BACKUP_TABLES.map(async ({ key, table }) => [key, await readTable(pool, table)])
    );
    const tables = Object.fromEntries(tableRows);
    // `backup-service.js` lives under `src/services`, while the canonical
    // schema is kept at the repository root in `database/schema.sql`.
    // Using only one `..` here made every manual and scheduled backup fail
    // with ENOENT in production (`src/database/schema.sql` does not exist).
    const schemaSql = fs.readFileSync(
        path.join(__dirname, '..', '..', 'database', 'schema.sql'),
        'utf8'
    );
    const payload = {
        format: 'top-gym-json-backup',
        version: 1,
        generatedAt: generatedAt.toISOString(),
        timeZone,
        tables,
        schemaSql,
        integrity: {
            algorithm: 'sha256',
            sha256: backupTablesDigest(tables)
        }
    };
    const json = JSON.stringify(payload, (_, value) => (
        typeof value === 'bigint' ? value.toString() : value
    ));
    const buffer = await gzipAsync(Buffer.from(json, 'utf8'));

    return {
        buffer,
        format: backupFormat,
        backupDay: stamp.slice(0, 10),
        filename: `backup_${stamp}.${backupFormat}`,
        generatedAt: generatedAt.toISOString(),
        rowCounts: Object.fromEntries(
            Object.entries(tables).map(([key, records]) => [key, records.length])
        )
    };
}

module.exports = {
    createBackup,
    createScheduledBackupArchive,
    deleteBackupArchive,
    ensureBackupOperationsTable,
    ensureBackupArchivesTable,
    getBackupArchive,
    getBackupHistory,
    getScheduledBackupHistory,
    inspectBackupBuffer,
    recordBackupOperation,
    restoreBackup
};
