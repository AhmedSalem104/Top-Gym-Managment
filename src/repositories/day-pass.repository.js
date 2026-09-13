'use strict';

const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { toUtcDate } = require('../utils/date');
const { branchOnlyFinancialScopeSql, financialDateRangeSql, normalizeFinancialScope } = require('./financial-scope');

const DEFAULT_DAY_PASS_TYPES = Object.freeze([
    { code: 'day_gym', label: 'حصة جيم فقط', price: 30, sortOrder: 1 },
    { code: 'day_gym_cardio', label: 'حصة جيم وكارديو', price: 40, sortOrder: 2 }
]);

let tablePromise;

async function ensureDayPassTables({ readOnly = false } = {}) {
    if (!tablePromise) {
        tablePromise = (async () => {
            const pool = await getPool();
            const result = await pool.request().query(`
                SELECT
                    CASE WHEN OBJECT_ID(N'dbo.gym_day_pass_types', N'U') IS NULL THEN 1 ELSE 0 END AS types_table_missing,
                    CASE WHEN OBJECT_ID(N'dbo.gym_day_pass_sales', N'U') IS NULL THEN 1 ELSE 0 END AS sales_table_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_types', N'type_code') IS NULL THEN 1 ELSE 0 END AS type_code_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_types', N'type_name') IS NULL THEN 1 ELSE 0 END AS type_name_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_types', N'price') IS NULL THEN 1 ELSE 0 END AS type_price_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_sales', N'visitor_name') IS NULL THEN 1 ELSE 0 END AS visitor_name_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_sales', N'visitor_phone_normalized') IS NULL THEN 1 ELSE 0 END AS visitor_phone_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_sales', N'amount_paid') IS NULL THEN 1 ELSE 0 END AS amount_paid_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_sales', N'visit_date') IS NULL THEN 1 ELSE 0 END AS visit_date_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_sales', N'status') IS NULL THEN 1 ELSE 0 END AS status_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_sales', N'branch_id') IS NULL THEN 1 ELSE 0 END AS branch_missing,
                    CASE WHEN COL_LENGTH(N'dbo.gym_day_pass_sales', N'created_at') IS NULL THEN 1 ELSE 0 END AS created_missing
            `);
            const row = result.recordset?.[0] || {};
            const missing = Object.entries({
                types_table_missing: 'dbo.gym_day_pass_types',
                sales_table_missing: 'dbo.gym_day_pass_sales',
                type_code_missing: 'gym_day_pass_types.type_code',
                type_name_missing: 'gym_day_pass_types.type_name',
                type_price_missing: 'gym_day_pass_types.price',
                visitor_name_missing: 'gym_day_pass_sales.visitor_name',
                visitor_phone_missing: 'gym_day_pass_sales.visitor_phone_normalized',
                amount_paid_missing: 'gym_day_pass_sales.amount_paid',
                visit_date_missing: 'gym_day_pass_sales.visit_date',
                status_missing: 'gym_day_pass_sales.status',
                branch_missing: 'gym_day_pass_sales.branch_id',
                created_missing: 'gym_day_pass_sales.created_at'
            }).filter(([field]) => Number(row[field]) === 1).map(([, name]) => name);
            if (missing.length) {
                const error = new Error('Day-pass schema is not ready. Apply the approved migration before serving financial requests.');
                error.statusCode = 503;
                error.code = 'DAY_PASS_SCHEMA_NOT_READY';
                error.expose = true;
                error.missing = missing;
                throw error;
            }
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
    const id = Number(row.id);
    return {
        id,
        reference: id ? `VIS-${String(id).padStart(6, '0')}` : null,
        visitorName: row.visitor_name || 'زائر',
        visitorPhone: row.visitor_phone || '',
        visitorPhoneNormalized: row.visitor_phone_normalized || '',
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

async function listTypes({ activeOnly = false, readOnly = false } = {}) {
    await ensureDayPassTables({ readOnly });
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

async function findActiveType(code, options = {}) {
    const type = await findType(code, options);
    return type?.active ? type : null;
}

async function findType(code, { readOnly = false } = {}) {
    await ensureDayPassTables({ readOnly });
    const pool = await getPool();
    const result = await pool.request()
        .input('code', sql.VarChar(40), code)
        .query(`
            SELECT type_code, type_name, price, is_active, sort_order
            FROM dbo.gym_day_pass_types
            WHERE type_code = @code;
        `);
    return result.recordset[0] ? mapType(result.recordset[0]) : null;
}

async function createSale({ visitorName, visitorPhone, visitorPhoneNormalized, passType, paymentMethod, visitDate, notes, createdByUserId, branchId = null }) {
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
        .input('branchId', sql.Int, branchId == null ? null : Number(branchId))
        .query(`
            INSERT INTO dbo.gym_day_pass_sales
                (visitor_name, visitor_phone, visitor_phone_normalized, pass_type_code, pass_type_name,
                 amount_due, amount_paid, payment_method, visit_date, notes, created_by_user_id, branch_id)
            OUTPUT INSERTED.id, INSERTED.visitor_name, INSERTED.visitor_phone, INSERTED.visitor_phone_normalized,
                   INSERTED.pass_type_code, INSERTED.pass_type_name, INSERTED.amount_due, INSERTED.amount_paid,
                   INSERTED.payment_method, INSERTED.visit_date, INSERTED.notes, INSERTED.status,
                   INSERTED.created_by_user_id, INSERTED.whatsapp_opened_at, INSERTED.created_at, INSERTED.updated_at
            VALUES (@visitorName, @visitorPhone, @visitorPhoneNormalized, @passTypeCode, @passTypeName,
                    @amountDue, @amountPaid, @paymentMethod, @visitDate, @notes, @createdByUserId, @branchId);
        `);
    return mapSale(result.recordset[0]);
}

async function updateSale({ id, visitorName, visitorPhone, visitorPhoneNormalized, passType, paymentMethod, visitDate, notes }) {
    await ensureDayPassTables();
    const pool = await getPool();
    const result = await pool.request()
        .input('id', sql.Int, id)
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
        .query(`
            UPDATE dbo.gym_day_pass_sales
            SET visitor_name = @visitorName,
                visitor_phone = @visitorPhone,
                visitor_phone_normalized = @visitorPhoneNormalized,
                pass_type_code = @passTypeCode,
                pass_type_name = @passTypeName,
                amount_due = @amountDue,
                amount_paid = @amountPaid,
                payment_method = @paymentMethod,
                visit_date = @visitDate,
                notes = @notes,
                updated_at = SYSUTCDATETIME()
            OUTPUT INSERTED.id, INSERTED.visitor_name, INSERTED.visitor_phone, INSERTED.visitor_phone_normalized,
                   INSERTED.pass_type_code, INSERTED.pass_type_name, INSERTED.amount_due, INSERTED.amount_paid,
                   INSERTED.payment_method, INSERTED.visit_date, INSERTED.notes, INSERTED.status,
                   INSERTED.created_by_user_id, INSERTED.whatsapp_opened_at, INSERTED.created_at, INSERTED.updated_at
            WHERE id = @id AND status = 'completed';
        `);
    return result.recordset[0] ? mapSale(result.recordset[0]) : null;
}

function addListFilters(request, { fromDate, nextDate, typeCode, paymentMethod, search, includeVoided = false, branchId = null }) {
    request.input('fromDate', sql.Date, toUtcDate(fromDate));
    request.input('nextDate', sql.Date, toUtcDate(nextDate));
    const conditions = [financialDateRangeSql('s.visit_date')];
    if (!includeVoided) conditions.push("s.status = 'completed'");
    const scope = normalizeFinancialScope({ branchId });
    request.input('branchId', sql.Int, scope.branchId);
    request.input('sectionId', sql.Int, null);
    conditions.push(branchOnlyFinancialScopeSql('s').trim());
    if (typeCode) { request.input('typeCode', sql.VarChar(40), typeCode); conditions.push('s.pass_type_code = @typeCode'); }
    if (paymentMethod) { request.input('paymentMethod', sql.VarChar(20), paymentMethod); conditions.push('s.payment_method = @paymentMethod'); }
    if (search) { request.input('search', sql.NVarChar(160), `%${search}%`); conditions.push('(s.visitor_name LIKE @search OR s.visitor_phone LIKE @search OR s.visitor_phone_normalized LIKE @search)'); }
    return conditions.join(' AND ');
}

async function listSales({ fromDate, nextDate, typeCode = '', paymentMethod = '', search = '', page = 1, pageSize = 20, includeVoided = false, readOnly = false, branchId = null }) {
    await ensureDayPassTables({ readOnly });
    const pool = await getPool();
    const request = pool.request();
    const where = addListFilters(request, { fromDate, nextDate, typeCode, paymentMethod, search, includeVoided, branchId });
    request.input('offset', sql.Int, (page - 1) * pageSize).input('pageSize', sql.Int, pageSize);
    const result = await request.batch(`
        SELECT COUNT_BIG(*) AS total
        FROM dbo.gym_day_pass_sales AS s
        WHERE ${where};
        WITH paged_day_passes AS (
            SELECT s.id, s.visitor_name, s.visitor_phone, s.visitor_phone_normalized,
                   s.pass_type_code, s.pass_type_name, s.amount_due, s.amount_paid,
                   s.payment_method, s.visit_date, s.notes, s.status, s.created_by_user_id,
                   s.whatsapp_opened_at, s.created_at, s.updated_at,
                   ROW_NUMBER() OVER (ORDER BY s.visit_date DESC, s.id DESC) AS row_num
            FROM dbo.gym_day_pass_sales AS s
            WHERE ${where}
        )
        SELECT id, visitor_name, visitor_phone, visitor_phone_normalized,
               pass_type_code, pass_type_name, amount_due, amount_paid,
               payment_method, visit_date, notes, status, created_by_user_id,
               whatsapp_opened_at, created_at, updated_at
        FROM paged_day_passes
        WHERE row_num > @offset AND row_num <= (@offset + @pageSize)
        ORDER BY row_num;
    `);
    return {
        records: (result.recordsets[1] || []).map(mapSale),
        pagination: { page, pageSize, total: Number(result.recordsets[0]?.[0]?.total || 0) }
    };
}

async function getRangeData({ fromDate, nextDate, readOnly = false, branchId = null, sectionId = null }) {
    await ensureDayPassTables({ readOnly });
    const pool = await getPool();
    const scope = normalizeFinancialScope({ branchId, sectionId });
    const request = pool.request()
        .input('fromDate', sql.Date, toUtcDate(fromDate))
        .input('nextDate', sql.Date, toUtcDate(nextDate))
        .input('branchId', sql.Int, scope.branchId)
        // Day passes are branch-level records and have no section assignment.
        // They remain visible for branch/all-branch views and are excluded from
        // a section view instead of being attributed to the wrong section.
        .input('sectionId', sql.Int, scope.sectionId);
    const result = await request.batch(`
        SELECT s.id, s.visitor_name, s.visitor_phone, s.visitor_phone_normalized,
               s.pass_type_code, s.pass_type_name, s.amount_due, s.amount_paid,
               s.payment_method, s.visit_date, s.notes, s.status, s.created_by_user_id,
               s.whatsapp_opened_at, s.created_at, s.updated_at
        FROM dbo.gym_day_pass_sales AS s
        WHERE ${financialDateRangeSql('s.visit_date')} AND s.status = 'completed' ${branchOnlyFinancialScopeSql('s')}
        ORDER BY s.visit_date DESC, s.id DESC;
        SELECT COUNT_BIG(*) AS count, ISNULL(SUM(s.amount_paid), 0) AS amount
        FROM dbo.gym_day_pass_sales AS s
        WHERE ${financialDateRangeSql('s.visit_date')} AND s.status = 'completed' ${branchOnlyFinancialScopeSql('s')};
    `);
    return {
        records: (result.recordsets[0] || []).map(mapSale),
        summary: {
            count: Number(result.recordsets[1]?.[0]?.count || 0),
            amount: Number(result.recordsets[1]?.[0]?.amount || 0)
        }
    };
}

async function getRangeSummary({ fromDate, nextDate, readOnly = false, branchId = null, sectionId = null }) {
    await ensureDayPassTables({ readOnly });
    const pool = await getPool();
    const scope = normalizeFinancialScope({ branchId, sectionId });
    const result = await pool.request()
        .input('fromDate', sql.Date, toUtcDate(fromDate))
        .input('nextDate', sql.Date, toUtcDate(nextDate))
        .input('branchId', sql.Int, scope.branchId)
        .input('sectionId', sql.Int, scope.sectionId)
        .query(`
            SELECT COUNT_BIG(*) AS count, ISNULL(SUM(s.amount_paid), 0) AS amount
            FROM dbo.gym_day_pass_sales AS s
            WHERE ${financialDateRangeSql('s.visit_date')} AND s.status = 'completed' ${branchOnlyFinancialScopeSql('s')};
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

async function deleteSale(id) {
    await ensureDayPassTables();
    const pool = await getPool();
    return pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM dbo.gym_day_pass_sales WHERE id = @id;');
}

module.exports = {
    DEFAULT_DAY_PASS_TYPES,
    ensureDayPassTables,
    deleteSale,
    findActiveType,
    findType,
    createSale,
    getRangeData,
    getRangeSummary,
    listSales,
    listTypes,
    markWhatsappOpened,
    updateSale,
    updateTypes,
    voidSale
};
