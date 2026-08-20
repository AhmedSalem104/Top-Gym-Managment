'use strict';

const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { toUtcDate } = require('../utils/date');

const DEFAULT_DAY_PASS_TYPES = Object.freeze([
    { code: 'day_gym', label: 'حصة جيم فقط', price: 30, sortOrder: 1 },
    { code: 'day_gym_cardio', label: 'حصة جيم وكارديو', price: 40, sortOrder: 2 }
]);

let tablePromise;

async function ensureDayPassTables() {
    if (!tablePromise) {
        tablePromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_day_pass_types', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_day_pass_types (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_day_pass_types_runtime PRIMARY KEY,
                        type_code VARCHAR(40) NOT NULL,
                        type_name NVARCHAR(120) NOT NULL,
                        price DECIMAL(12,2) NOT NULL,
                        is_active BIT NOT NULL CONSTRAINT DF_gym_day_pass_types_active_runtime DEFAULT (1),
                        sort_order INT NOT NULL CONSTRAINT DF_gym_day_pass_types_sort_runtime DEFAULT (0),
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_day_pass_types_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_day_pass_types_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT UQ_gym_day_pass_types_code_runtime UNIQUE (type_code),
                        CONSTRAINT CK_gym_day_pass_types_price_runtime CHECK (price > 0)
                    );
                END;
                IF OBJECT_ID(N'dbo.gym_day_pass_sales', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_day_pass_sales (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_day_pass_sales_runtime PRIMARY KEY,
                        visitor_name NVARCHAR(120) NOT NULL,
                        visitor_phone NVARCHAR(30) NOT NULL,
                        visitor_phone_normalized NVARCHAR(30) NOT NULL,
                        pass_type_code VARCHAR(40) NOT NULL,
                        pass_type_name NVARCHAR(120) NOT NULL,
                        amount_due DECIMAL(12,2) NOT NULL,
                        amount_paid DECIMAL(12,2) NOT NULL,
                        payment_method VARCHAR(20) NOT NULL CONSTRAINT DF_gym_day_pass_sales_method_runtime DEFAULT ('cash'),
                        visit_date DATE NOT NULL,
                        notes NVARCHAR(500) NULL,
                        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_day_pass_sales_status_runtime DEFAULT ('completed'),
                        created_by_user_id INT NULL,
                        whatsapp_opened_at DATETIME2(0) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_day_pass_sales_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_day_pass_sales_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_gym_day_pass_sales_type_runtime FOREIGN KEY (pass_type_code)
                            REFERENCES dbo.gym_day_pass_types(type_code) ON DELETE NO ACTION,
                        CONSTRAINT CK_gym_day_pass_sales_amounts_runtime CHECK (amount_due > 0 AND amount_paid = amount_due),
                        CONSTRAINT CK_gym_day_pass_sales_method_runtime CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
                        CONSTRAINT CK_gym_day_pass_sales_status_runtime CHECK (status IN ('completed', 'voided'))
                    );
                END;
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name IN (N'IX_gym_day_pass_sales_date_runtime', N'IX_gym_day_pass_sales_date') AND object_id = OBJECT_ID(N'dbo.gym_day_pass_sales'))
                    CREATE INDEX IX_gym_day_pass_sales_date_runtime ON dbo.gym_day_pass_sales(visit_date DESC, id DESC);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name IN (N'IX_gym_day_pass_sales_type_date_runtime', N'IX_gym_day_pass_sales_type_date') AND object_id = OBJECT_ID(N'dbo.gym_day_pass_sales'))
                    CREATE INDEX IX_gym_day_pass_sales_type_date_runtime ON dbo.gym_day_pass_sales(pass_type_code, visit_date DESC, id DESC);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name IN (N'IX_gym_day_pass_sales_phone_runtime', N'IX_gym_day_pass_sales_phone') AND object_id = OBJECT_ID(N'dbo.gym_day_pass_sales'))
                    CREATE INDEX IX_gym_day_pass_sales_phone_runtime ON dbo.gym_day_pass_sales(visitor_phone_normalized, visit_date DESC, id DESC);
                IF NOT EXISTS (SELECT 1 FROM dbo.gym_day_pass_types WHERE type_code = 'day_gym')
                    INSERT INTO dbo.gym_day_pass_types (type_code, type_name, price, sort_order) VALUES ('day_gym', N'حصة جيم فقط', 30, 1);
                IF NOT EXISTS (SELECT 1 FROM dbo.gym_day_pass_types WHERE type_code = 'day_gym_cardio')
                    INSERT INTO dbo.gym_day_pass_types (type_code, type_name, price, sort_order) VALUES ('day_gym_cardio', N'حصة جيم وكارديو', 40, 2);
            `);
        })().catch((error) => {
            tablePromise = undefined;
            throw error;
        });
    }
    return tablePromise;
}

function mapType(row) {
    return {
        code: String(row.type_code),
        label: row.type_name,
        price: Number(row.price || 0),
        active: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 0)
    };
}

function mapSale(row) {
    return {
        id: Number(row.id),
        visitorName: row.visitor_name,
        visitorPhone: row.visitor_phone,
        visitorPhoneNormalized: row.visitor_phone_normalized,
        passTypeCode: row.pass_type_code,
        passTypeName: row.pass_type_name,
        amountDue: Number(row.amount_due || 0),
        amountPaid: Number(row.amount_paid || 0),
        paymentMethod: row.payment_method,
        visitDate: row.visit_date instanceof Date ? row.visit_date.toISOString().slice(0, 10) : String(row.visit_date).slice(0, 10),
        notes: row.notes || null,
        status: row.status,
        createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
        whatsappOpenedAt: row.whatsapp_opened_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function listTypes({ activeOnly = false } = {}) {
    await ensureDayPassTables();
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT type_code, type_name, price, is_active, sort_order
        FROM dbo.gym_day_pass_types
        ${activeOnly ? 'WHERE is_active = 1' : ''}
        ORDER BY sort_order ASC, id ASC;
    `);
    return result.recordset.map(mapType);
}

async function updateTypes(items) {
    await ensureDayPassTables();
    return withTransaction(async (transaction) => {
        const updated = [];
        for (const item of items) {
            const result = await transaction.request()
                .input('code', sql.VarChar(40), item.code)
                .input('label', sql.NVarChar(120), item.label)
                .input('price', sql.Decimal(12, 2), item.price)
                .input('active', sql.Bit, item.active !== false)
                .input('sortOrder', sql.Int, item.sortOrder || 0)
                .query(`
                    UPDATE dbo.gym_day_pass_types
                    SET type_name = @label, price = @price, is_active = @active,
                        sort_order = @sortOrder, updated_at = SYSUTCDATETIME()
                    OUTPUT INSERTED.type_code, INSERTED.type_name, INSERTED.price, INSERTED.is_active, INSERTED.sort_order
                    WHERE type_code = @code;
                `);
            if (!result.recordset[0]) throw new Error(`DAY_PASS_TYPE_NOT_FOUND:${item.code}`);
            updated.push(mapType(result.recordset[0]));
        }
        return updated;
    });
}

async function findActiveType(code) {
    await ensureDayPassTables();
    const pool = await getPool();
    const result = await pool.request()
        .input('code', sql.VarChar(40), code)
        .query(`
            SELECT type_code, type_name, price, is_active, sort_order
            FROM dbo.gym_day_pass_types
            WHERE type_code = @code AND is_active = 1;
        `);
    return result.recordset[0] ? mapType(result.recordset[0]) : null;
}

async function createSale({ visitorName, visitorPhone, visitorPhoneNormalized, passType, paymentMethod, visitDate, notes, createdByUserId }) {
    await ensureDayPassTables();
    const pool = await getPool();
    const result = await pool.request()
        .input('visitorName', sql.NVarChar(120), visitorName)
        .input('visitorPhone', sql.NVarChar(30), visitorPhone)
        .input('visitorPhoneNormalized', sql.NVarChar(30), visitorPhoneNormalized)
        .input('passTypeCode', sql.VarChar(40), passType.code)
        .input('passTypeName', sql.NVarChar(120), passType.label)
        .input('amountDue', sql.Decimal(12, 2), passType.price)
        .input('amountPaid', sql.Decimal(12, 2), passType.price)
        .input('paymentMethod', sql.VarChar(20), paymentMethod)
        .input('visitDate', sql.Date, toUtcDate(visitDate))
        .input('notes', sql.NVarChar(500), notes)
        .input('createdByUserId', sql.Int, createdByUserId || null)
        .query(`
            INSERT INTO dbo.gym_day_pass_sales
                (visitor_name, visitor_phone, visitor_phone_normalized, pass_type_code, pass_type_name,
                 amount_due, amount_paid, payment_method, visit_date, notes, created_by_user_id)
            OUTPUT INSERTED.id, INSERTED.visitor_name, INSERTED.visitor_phone, INSERTED.visitor_phone_normalized,
                   INSERTED.pass_type_code, INSERTED.pass_type_name, INSERTED.amount_due, INSERTED.amount_paid,
                   INSERTED.payment_method, INSERTED.visit_date, INSERTED.notes, INSERTED.status,
                   INSERTED.created_by_user_id, INSERTED.whatsapp_opened_at, INSERTED.created_at, INSERTED.updated_at
            VALUES (@visitorName, @visitorPhone, @visitorPhoneNormalized, @passTypeCode, @passTypeName,
                    @amountDue, @amountPaid, @paymentMethod, @visitDate, @notes, @createdByUserId);
        `);
    return mapSale(result.recordset[0]);
}

function addListFilters(request, { fromDate, nextDate, typeCode, paymentMethod, search, includeVoided = false }) {
    request.input('fromDate', sql.Date, toUtcDate(fromDate));
    request.input('nextDate', sql.Date, toUtcDate(nextDate));
    const conditions = ['s.visit_date >= @fromDate', 's.visit_date < @nextDate'];
    if (!includeVoided) conditions.push("s.status = 'completed'");
    if (typeCode) { request.input('typeCode', sql.VarChar(40), typeCode); conditions.push('s.pass_type_code = @typeCode'); }
    if (paymentMethod) { request.input('paymentMethod', sql.VarChar(20), paymentMethod); conditions.push('s.payment_method = @paymentMethod'); }
    if (search) { request.input('search', sql.NVarChar(160), `%${search}%`); conditions.push('(s.visitor_name LIKE @search OR s.visitor_phone LIKE @search OR s.visitor_phone_normalized LIKE @search)'); }
    return conditions.join(' AND ');
}

async function listSales({ fromDate, nextDate, typeCode = '', paymentMethod = '', search = '', page = 1, pageSize = 20, includeVoided = false }) {
    await ensureDayPassTables();
    const pool = await getPool();
    const request = pool.request();
    const where = addListFilters(request, { fromDate, nextDate, typeCode, paymentMethod, search, includeVoided });
    request.input('offset', sql.Int, (page - 1) * pageSize).input('pageSize', sql.Int, pageSize);
    const result = await request.batch(`
        SELECT COUNT_BIG(*) AS total
        FROM dbo.gym_day_pass_sales AS s
        WHERE ${where};
        SELECT s.id, s.visitor_name, s.visitor_phone, s.visitor_phone_normalized,
               s.pass_type_code, s.pass_type_name, s.amount_due, s.amount_paid,
               s.payment_method, s.visit_date, s.notes, s.status, s.created_by_user_id,
               s.whatsapp_opened_at, s.created_at, s.updated_at
        FROM dbo.gym_day_pass_sales AS s
        WHERE ${where}
        ORDER BY s.visit_date DESC, s.id DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `);
    return {
        records: (result.recordsets[1] || []).map(mapSale),
        pagination: { page, pageSize, total: Number(result.recordsets[0]?.[0]?.total || 0) }
    };
}

async function getRangeData({ fromDate, nextDate }) {
    await ensureDayPassTables();
    const pool = await getPool();
    const request = pool.request()
        .input('fromDate', sql.Date, toUtcDate(fromDate))
        .input('nextDate', sql.Date, toUtcDate(nextDate));
    const result = await request.batch(`
        SELECT s.id, s.visitor_name, s.visitor_phone, s.visitor_phone_normalized,
               s.pass_type_code, s.pass_type_name, s.amount_due, s.amount_paid,
               s.payment_method, s.visit_date, s.notes, s.status, s.created_by_user_id,
               s.whatsapp_opened_at, s.created_at, s.updated_at
        FROM dbo.gym_day_pass_sales AS s
        WHERE s.visit_date >= @fromDate AND s.visit_date < @nextDate AND s.status = 'completed'
        ORDER BY s.visit_date DESC, s.id DESC;
        SELECT COUNT_BIG(*) AS count, ISNULL(SUM(s.amount_paid), 0) AS amount
        FROM dbo.gym_day_pass_sales AS s
        WHERE s.visit_date >= @fromDate AND s.visit_date < @nextDate AND s.status = 'completed';
    `);
    return {
        records: (result.recordsets[0] || []).map(mapSale),
        summary: {
            count: Number(result.recordsets[1]?.[0]?.count || 0),
            amount: Number(result.recordsets[1]?.[0]?.amount || 0)
        }
    };
}

async function getRangeSummary({ fromDate, nextDate }) {
    await ensureDayPassTables();
    const pool = await getPool();
    const result = await pool.request()
        .input('fromDate', sql.Date, toUtcDate(fromDate))
        .input('nextDate', sql.Date, toUtcDate(nextDate))
        .query(`
            SELECT COUNT_BIG(*) AS count, ISNULL(SUM(s.amount_paid), 0) AS amount
            FROM dbo.gym_day_pass_sales AS s
            WHERE s.visit_date >= @fromDate AND s.visit_date < @nextDate AND s.status = 'completed';
        `);
    return {
        count: Number(result.recordset[0]?.count || 0),
        amount: Number(result.recordset[0]?.amount || 0)
    };
}

async function markWhatsappOpened(id) {
    await ensureDayPassTables();
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .query('UPDATE dbo.gym_day_pass_sales SET whatsapp_opened_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id AND status = \'completed\';');
}

async function voidSale(id) {
    await ensureDayPassTables();
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .query("UPDATE dbo.gym_day_pass_sales SET status = 'voided', updated_at = SYSUTCDATETIME() WHERE id = @id AND status = 'completed';");
}

module.exports = {
    DEFAULT_DAY_PASS_TYPES,
    ensureDayPassTables,
    findActiveType,
    createSale,
    getRangeData,
    getRangeSummary,
    listSales,
    listTypes,
    markWhatsappOpened,
    updateTypes,
    voidSale
};
