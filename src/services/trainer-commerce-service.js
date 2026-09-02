'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { currentTenantId, getTenantContext } = require('../tenancy/tenant-context');
const { addDays, formatDateOnly, parseDateOnly, todayInTimeZone, toUtcDate } = require('../utils/date');
const { TENANT_TYPES, resolveTenantType } = require('../tenancy/tenant-types');
const coachingService = require('./coaching-service');
const trainerService = require('./trainer-service');
const saasService = require('./saas-service');
const commercialSchema = require('./commercial-schema');

function commerceError(message, statusCode = 400, code = 'TRAINER_COMMERCE_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function positiveId(value, label = 'المعرّف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw commerceError(`${label} غير صالح.`, 400, 'INVALID_IDENTIFIER');
    return id;
}

function boundedText(value, label, max, { required = false } = {}) {
    const normalized = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (required && !normalized) throw commerceError(`${label} مطلوب.`, 422, 'VALIDATION_ERROR');
    if (normalized.length > max) throw commerceError(`${label} أطول من المسموح.`, 422, 'VALIDATION_ERROR');
    return normalized || null;
}

function money(value, label, { required = false, fallback = 0 } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) throw commerceError(`${label} مطلوب.`, 422, 'VALIDATION_ERROR');
        return fallback;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 999999999) {
        throw commerceError(`${label} غير صالح.`, 422, 'VALIDATION_ERROR');
    }
    return Math.round(amount * 100) / 100;
}

function integerOrNull(value, label, { min = 1, max = 10000 } = {}) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
        throw commerceError(`${label} غير صالح.`, 422, 'VALIDATION_ERROR');
    }
    return number;
}

function dateValue(value, label, fallback = todayInTimeZone()) {
    return parseDateOnly(value || fallback, label);
}

function timestampValue(value, label) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) throw commerceError(`${label} غير صالح.`, 422, 'VALIDATION_ERROR');
    return date;
}

function idempotencyHash(value, label = 'مفتاح العملية') {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized.length > 200) throw commerceError(`${label} مطلوب.`, 422, 'IDEMPOTENCY_KEY_REQUIRED');
    return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function serviceMode(value) {
    const mode = String(value || 'hybrid').trim().toLowerCase();
    if (!['in_person', 'online', 'hybrid'].includes(mode)) throw commerceError('طريقة تقديم الباقة غير صالحة.', 422, 'VALIDATION_ERROR');
    return mode;
}

function packageStatus(value, fallback = 'active') {
    const status = String(value || fallback).trim().toLowerCase();
    if (!['active', 'archived'].includes(status)) throw commerceError('حالة الباقة غير صالحة.', 422, 'VALIDATION_ERROR');
    return status;
}

function purchaseStatus(value, fallback = 'active') {
    const status = String(value || fallback).trim().toLowerCase();
    if (!['active', 'completed', 'expired', 'cancelled'].includes(status)) throw commerceError('حالة الشراء غير صالحة.', 422, 'VALIDATION_ERROR');
    return status;
}

function sessionStatus(value, fallback = 'scheduled') {
    const status = String(value || fallback).trim().toLowerCase();
    if (!['scheduled', 'completed', 'cancelled', 'no_show'].includes(status)) throw commerceError('حالة الجلسة غير صالحة.', 422, 'VALIDATION_ERROR');
    return status;
}

function actorUserId() {
    const userId = Number(getTenantContext()?.userId);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
}

async function assertTrainerContext({ readOnly = false } = {}) {
    const tenantId = currentTenantId({ required: true });
    const tenant = await trainerService.assertTrainerTenant();
    // assertTrainerTenant reads the persisted tenant aggregate, never a
    // request field. Keep the explicit type assertion here as a defense in
    // depth for future callers of this service.
    if (!tenant || resolveTenantType(tenant.tenantType) !== TENANT_TYPES.INDEPENDENT_TRAINER) {
        throw commerceError('هذه العملية متاحة لمساحة المدرب المستقل فقط.', 403, 'TRAINER_TENANT_REQUIRED');
    }
    await commercialSchema.ensureCommercialTables({ readOnly });
    return { tenantId, tenant };
}

function mapPackage(row) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        name: row.name,
        description: row.description,
        price: Number(row.price || 0),
        durationDays: row.duration_days == null ? null : Number(row.duration_days),
        sessionCount: row.session_count == null ? null : Number(row.session_count),
        serviceMode: row.service_mode,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapPurchase(row) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        packageId: Number(row.package_id),
        packageName: row.package_name || null,
        memberId: Number(row.member_id),
        clientName: row.client_name || null,
        startsOn: formatDateOnly(row.starts_on),
        endsOn: row.ends_on ? formatDateOnly(row.ends_on) : null,
        sessionsIncluded: row.sessions_included == null ? null : Number(row.sessions_included),
        sessionsRemaining: row.sessions_remaining == null ? null : Number(row.sessions_remaining),
        amountDue: Number(row.amount_due || 0),
        amountPaid: Number(row.amount_paid || 0),
        amountRemaining: Number(row.amount_remaining || 0),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapSession(row) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        memberId: Number(row.member_id),
        clientName: row.client_name || null,
        trainerUserId: Number(row.trainer_user_id),
        scheduledStart: row.scheduled_start,
        scheduledEnd: row.scheduled_end,
        status: row.status,
        notes: row.notes,
        packagePurchaseId: row.package_purchase_id == null ? null : Number(row.package_purchase_id),
        completedAt: row.completed_at || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function assertClient(connection, memberId) {
    const tenantId = currentTenantId({ required: true });
    const result = await connection.request()
        .input('tenantId', sql.Int, tenantId)
        .input('memberId', sql.Int, positiveId(memberId, 'معرّف العميل'))
        .query('SELECT TOP (1) id,full_name FROM dbo.members WHERE id=@memberId AND tenant_id=@tenantId;');
    if (!result.recordset[0]) throw commerceError('العميل غير موجود في مساحة المدرب.', 404, 'CLIENT_NOT_FOUND');
    return result.recordset[0];
}

async function assertTrainerUser(connection, userId) {
    const tenantId = currentTenantId({ required: true });
    const result = await connection.request()
        .input('tenantId', sql.Int, tenantId)
        .input('userId', sql.Int, positiveId(userId, 'معرّف المدرب'))
        .query("SELECT TOP (1) user_id FROM dbo.gym_user_tenants WHERE tenant_id=@tenantId AND user_id=@userId AND status='active';");
    if (!result.recordset[0]) throw commerceError('حساب المدرب غير مرتبط بهذه المساحة.', 403, 'TRAINER_USER_REQUIRED');
}

async function getPackage(connection, packageId, { lock = false, activeOnly = false } = {}) {
    const tenantId = currentTenantId({ required: true });
    const result = await connection.request()
        .input('tenantId', sql.Int, tenantId)
        .input('packageId', sql.Int, positiveId(packageId, 'معرّف الباقة'))
        .query(`SELECT TOP (1) id,tenant_id,name,description,price,duration_days,session_count,service_mode,status,created_at,updated_at
                FROM dbo.trainer_packages${lock ? ' WITH (UPDLOCK,HOLDLOCK)' : ''}
                WHERE id=@packageId AND tenant_id=@tenantId${activeOnly ? " AND status='active'" : ''};`);
    if (!result.recordset[0]) throw commerceError('الباقة غير موجودة في مساحة المدرب.', 404, 'PACKAGE_NOT_FOUND');
    return result.recordset[0];
}

async function getPurchase(connection, purchaseId, { lock = false } = {}) {
    const tenantId = currentTenantId({ required: true });
    const result = await connection.request()
        .input('tenantId', sql.Int, tenantId)
        .input('purchaseId', sql.Int, positiveId(purchaseId, 'معرّف شراء الباقة'))
        .query(`SELECT TOP (1) pp.*,p.name AS package_name,m.full_name AS client_name
                FROM dbo.trainer_package_purchases pp${lock ? ' WITH (UPDLOCK,HOLDLOCK)' : ''}
                INNER JOIN dbo.trainer_packages p ON p.id=pp.package_id AND p.tenant_id=pp.tenant_id
                INNER JOIN dbo.members m ON m.id=pp.member_id AND m.tenant_id=pp.tenant_id
                WHERE pp.id=@purchaseId AND pp.tenant_id=@tenantId;`);
    if (!result.recordset[0]) throw commerceError('شراء الباقة غير موجود في مساحة المدرب.', 404, 'PACKAGE_PURCHASE_NOT_FOUND');
    return result.recordset[0];
}

async function recordAudit(executor, action, entityType, entityId, { details = '', before = null, after = null } = {}) {
    await saasService.recordAudit({
        tenantId: currentTenantId({ required: true }),
        actorUserId: actorUserId(),
        action,
        entityType,
        entityId,
        details,
        before,
        after,
        executor
    });
}

async function recordLedgerPayment(connection, purchase, { amountPaid, paymentMethod, paidAt, notes, idempotencyKey, transactionType = 'payment', amountRemainingOverride = null }) {
    const hash = idempotencyHash(`trainer-payment:${purchase.id}:${idempotencyKey}`);
    const existing = await connection.request()
        .input('tenantId', sql.Int, currentTenantId({ required: true }))
        .input('hash', sql.Char(64), hash)
        .query(`SELECT TOP (1) t.id,t.amount_paid,t.transaction_type,t.trainer_package_purchase_id
                FROM dbo.gym_payment_transactions t
                INNER JOIN dbo.trainer_package_purchases pp ON pp.id=t.trainer_package_purchase_id AND pp.tenant_id=@tenantId
                WHERE t.trainer_package_purchase_id IS NOT NULL AND t.idempotency_key_hash=@hash;`);
    if (existing.recordset[0]) {
        const row = existing.recordset[0];
        if (Number(row.trainer_package_purchase_id) !== Number(purchase.id)
            || Math.abs(Number(row.amount_paid) - Number(amountPaid)) > 0.005
            || row.transaction_type !== transactionType) {
            throw commerceError('مفتاح الدفع مستخدم لعملية مختلفة.', 409, 'PAYMENT_IDEMPOTENCY_CONFLICT');
        }
        return Number(row.id);
    }
    const result = await connection.request()
        .input('purchaseId', sql.Int, purchase.id)
        .input('transactionType', sql.VarChar(20), transactionType)
        .input('listPrice', sql.Decimal(12, 2), Number(purchase.amount_due))
        .input('discountAmount', sql.Decimal(12, 2), 0)
        .input('amountDue', sql.Decimal(12, 2), Number(purchase.amount_due))
        .input('amountPaid', sql.Decimal(12, 2), transactionType === 'adjustment' ? -Math.abs(Number(amountPaid)) : Number(amountPaid))
        .input('amountRemaining', sql.Decimal(12, 2), transactionType === 'adjustment'
            ? 0
            : (amountRemainingOverride == null ? Math.max(0, Number(purchase.amount_remaining) - Number(amountPaid)) : Number(amountRemainingOverride)))
        .input('paymentMethod', sql.VarChar(20), paymentMethod)
        .input('paidAt', sql.Date, toUtcDate(paidAt))
        .input('notes', sql.NVarChar(500), notes)
        .input('hash', sql.Char(64), hash)
        .query(`INSERT INTO dbo.gym_payment_transactions
                    (membership_id,trainer_package_purchase_id,transaction_type,list_price,discount_amount,amount_due,
                     amount_paid,amount_remaining,payment_method,paid_at,notes,idempotency_key_hash)
                OUTPUT INSERTED.id
                VALUES (NULL,@purchaseId,@transactionType,@listPrice,@discountAmount,@amountDue,
                        @amountPaid,@amountRemaining,@paymentMethod,@paidAt,@notes,@hash);`);
    return Number(result.recordset[0].id);
}

async function updatePurchaseTotals(connection, purchaseId, amountDelta, { refund = false } = {}) {
    const purchase = await getPurchase(connection, purchaseId, { lock: true });
    const nextPaid = Math.round((Number(purchase.amount_paid) + (refund ? -Number(amountDelta) : Number(amountDelta))) * 100) / 100;
    if (nextPaid < 0 || nextPaid > Number(purchase.amount_due)) throw commerceError('قيمة العملية تتجاوز رصيد الباقة.', 409, 'PACKAGE_BALANCE_INVALID');
    const nextRemaining = Math.round((Number(purchase.amount_due) - nextPaid) * 100) / 100;
    await connection.request()
        .input('id', sql.Int, purchase.id)
        .input('paid', sql.Decimal(12, 2), nextPaid)
        .input('remaining', sql.Decimal(12, 2), nextRemaining)
        .query('UPDATE dbo.trainer_package_purchases SET amount_paid=@paid,amount_remaining=@remaining,updated_at=SYSUTCDATETIME() WHERE id=@id;');
    return { ...purchase, amount_paid: nextPaid, amount_remaining: nextRemaining };
}

async function listPackages({ includeArchived = false, readOnly = false } = {}) {
    await assertTrainerContext({ readOnly });
    const tenantId = currentTenantId({ required: true });
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('includeArchived', sql.Bit, includeArchived ? 1 : 0)
        .query(`SELECT id,tenant_id,name,description,price,duration_days,session_count,service_mode,status,created_at,updated_at
                FROM dbo.trainer_packages WHERE tenant_id=@tenantId AND (@includeArchived=1 OR status='active')
                ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END,updated_at DESC,id DESC;`));
    return result.recordset.map(mapPackage);
}

async function createPackage(body = {}) {
    await assertTrainerContext();
    const data = {
        name: boundedText(body.name, 'اسم الباقة', 160, { required: true }),
        description: boundedText(body.description, 'وصف الباقة', 1000),
        price: money(body.price, 'سعر الباقة', { required: true }),
        durationDays: integerOrNull(body.durationDays, 'مدة الباقة', { max: 3650 }),
        sessionCount: integerOrNull(body.sessionCount, 'عدد الجلسات'),
        serviceMode: serviceMode(body.serviceMode),
        status: packageStatus(body.status)
    };
    if (data.durationDays == null && data.sessionCount == null) throw commerceError('حدد مدة الباقة أو عدد الجلسات على الأقل.', 422, 'PACKAGE_SHAPE_REQUIRED');
    const tenantId = currentTenantId({ required: true });
    const id = await withTransaction(async (transaction) => {
        const result = await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('name', sql.NVarChar(160), data.name)
            .input('description', sql.NVarChar(1000), data.description)
            .input('price', sql.Decimal(12, 2), data.price)
            .input('durationDays', sql.Int, data.durationDays)
            .input('sessionCount', sql.Int, data.sessionCount)
            .input('serviceMode', sql.VarChar(20), data.serviceMode)
            .input('status', sql.VarChar(20), data.status)
            .query(`INSERT INTO dbo.trainer_packages(tenant_id,name,description,price,duration_days,session_count,service_mode,status)
                    OUTPUT INSERTED.id VALUES (@tenantId,@name,@description,@price,@durationDays,@sessionCount,@serviceMode,@status);`);
        const packageId = Number(result.recordset[0].id);
        await recordAudit(transaction, 'trainer_package_created', 'trainer_package', packageId, { after: data });
        return packageId;
    });
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('id', sql.Int, id).query('SELECT TOP (1) id,tenant_id,name,description,price,duration_days,session_count,service_mode,status,created_at,updated_at FROM dbo.trainer_packages WHERE id=@id AND tenant_id=@tenantId;'));
    return mapPackage(result.recordset[0]);
}

async function updatePackage(packageIdValue, body = {}) {
    await assertTrainerContext();
    const packageId = positiveId(packageIdValue, 'معرّف الباقة');
    const tenantId = currentTenantId({ required: true });
    const result = await withTransaction(async (transaction) => {
        const current = await getPackage(transaction, packageId, { lock: true });
        const data = {
            name: body.name === undefined ? current.name : boundedText(body.name, 'اسم الباقة', 160, { required: true }),
            description: body.description === undefined ? current.description : boundedText(body.description, 'وصف الباقة', 1000),
            price: body.price === undefined ? Number(current.price) : money(body.price, 'سعر الباقة', { required: true }),
            durationDays: body.durationDays === undefined ? (current.duration_days == null ? null : Number(current.duration_days)) : integerOrNull(body.durationDays, 'مدة الباقة', { max: 3650 }),
            sessionCount: body.sessionCount === undefined ? (current.session_count == null ? null : Number(current.session_count)) : integerOrNull(body.sessionCount, 'عدد الجلسات'),
            serviceMode: body.serviceMode === undefined ? current.service_mode : serviceMode(body.serviceMode),
            status: body.status === undefined ? current.status : packageStatus(body.status)
        };
        if (data.durationDays == null && data.sessionCount == null) throw commerceError('حدد مدة الباقة أو عدد الجلسات على الأقل.', 422, 'PACKAGE_SHAPE_REQUIRED');
        await transaction.request()
            .input('id', sql.Int, packageId)
            .input('name', sql.NVarChar(160), data.name)
            .input('description', sql.NVarChar(1000), data.description)
            .input('price', sql.Decimal(12, 2), data.price)
            .input('durationDays', sql.Int, data.durationDays)
            .input('sessionCount', sql.Int, data.sessionCount)
            .input('serviceMode', sql.VarChar(20), data.serviceMode)
            .input('status', sql.VarChar(20), data.status)
            .query('UPDATE dbo.trainer_packages SET name=@name,description=@description,price=@price,duration_days=@durationDays,session_count=@sessionCount,service_mode=@serviceMode,status=@status,updated_at=SYSUTCDATETIME() WHERE id=@id;');
        await recordAudit(transaction, 'trainer_package_updated', 'trainer_package', packageId, { before: mapPackage(current), after: data });
        return data;
    });
    const row = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('id', sql.Int, packageId).query('SELECT TOP (1) id,tenant_id,name,description,price,duration_days,session_count,service_mode,status,created_at,updated_at FROM dbo.trainer_packages WHERE id=@id AND tenant_id=@tenantId;'));
    return mapPackage(row.recordset[0]);
}

async function listPurchases({ memberId = null, status = null, readOnly = false } = {}) {
    await assertTrainerContext({ readOnly });
    const tenantId = currentTenantId({ required: true });
    const member = memberId == null ? null : positiveId(memberId, 'معرّف العميل');
    const normalizedStatus = status == null || status === '' ? null : purchaseStatus(status);
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('memberId', sql.Int, member)
        .input('status', sql.VarChar(20), normalizedStatus)
        .query(`SELECT pp.*,p.name AS package_name,m.full_name AS client_name
                FROM dbo.trainer_package_purchases pp
                INNER JOIN dbo.trainer_packages p ON p.id=pp.package_id AND p.tenant_id=pp.tenant_id
                INNER JOIN dbo.members m ON m.id=pp.member_id AND m.tenant_id=pp.tenant_id
                WHERE pp.tenant_id=@tenantId AND (@memberId IS NULL OR pp.member_id=@memberId) AND (@status IS NULL OR pp.status=@status)
                ORDER BY pp.starts_on DESC,pp.id DESC;`));
    return result.recordset.map(mapPurchase);
}

async function createPurchase(body = {}) {
    const { tenantId } = await assertTrainerContext();
    const packageId = positiveId(body.packageId, 'معرّف الباقة');
    const memberId = positiveId(body.memberId ?? body.clientId, 'معرّف العميل');
    const requestKey = idempotencyHash(body.idempotencyKey);
    const startsOn = dateValue(body.startsOn, 'تاريخ بداية الباقة');
    const paid = money(body.amountPaid, 'المبلغ المدفوع');
    const paymentMethod = String(body.paymentMethod || 'cash').trim().toLowerCase();
    if (!['cash', 'card', 'transfer', 'other'].includes(paymentMethod)) throw commerceError('طريقة الدفع غير صالحة.', 422, 'VALIDATION_ERROR');
    const paidAt = paid > 0 ? dateValue(body.paidAt, 'تاريخ التحصيل') : null;
    const notes = boundedText(body.notes, 'ملاحظات الدفع', 500);
    const result = await withTransaction(async (transaction) => {
        const replay = await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('hash', sql.Char(64), requestKey)
            .query('SELECT TOP (1) id,package_id,member_id,amount_due,amount_paid,amount_remaining FROM dbo.trainer_package_purchases WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND idempotency_key_hash=@hash;');
        if (replay.recordset[0]) {
            const existing = replay.recordset[0];
            const initialPaymentHash = idempotencyHash(`trainer-payment:${existing.id}:purchase:${requestKey}`);
            const initialPayment = await transaction.request()
                .input('tenantId', sql.Int, tenantId)
                .input('purchaseId', sql.Int, Number(existing.id))
                .input('hash', sql.Char(64), initialPaymentHash)
                .query('SELECT TOP (1) amount_paid FROM dbo.gym_payment_transactions WHERE tenant_id=@tenantId AND trainer_package_purchase_id=@purchaseId AND idempotency_key_hash=@hash;');
            const originalAmountPaid = initialPayment.recordset[0] ? Number(initialPayment.recordset[0].amount_paid) : 0;
            if (Number(existing.package_id) !== packageId
                || Number(existing.member_id) !== memberId
                || Math.abs(originalAmountPaid - paid) > 0.005) {
                throw commerceError('مفتاح العملية مستخدم لطلب شراء مختلف.', 409, 'PURCHASE_IDEMPOTENCY_CONFLICT');
            }
            return Number(existing.id);
        }
        const packageRow = await getPackage(transaction, packageId, { lock: true, activeOnly: true });
        await assertClient(transaction, memberId);
        const endOn = packageRow.duration_days == null ? null : addDays(startsOn, Number(packageRow.duration_days) - 1);
        if (paid > Number(packageRow.price)) throw commerceError('المبلغ المدفوع لا يمكن أن يتجاوز سعر الباقة.', 422, 'PACKAGE_PAYMENT_TOO_LARGE');
        const purchaseResult = await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('packageId', sql.Int, packageId)
            .input('memberId', sql.Int, memberId)
            .input('startsOn', sql.Date, toUtcDate(startsOn))
            .input('endsOn', sql.Date, endOn ? toUtcDate(endOn) : null)
            .input('sessionsIncluded', sql.Int, packageRow.session_count == null ? null : Number(packageRow.session_count))
            .input('sessionsRemaining', sql.Int, packageRow.session_count == null ? null : Number(packageRow.session_count))
            .input('amountDue', sql.Decimal(12, 2), Number(packageRow.price))
            .input('amountPaid', sql.Decimal(12, 2), paid)
            .input('amountRemaining', sql.Decimal(12, 2), Math.max(0, Number(packageRow.price) - paid))
            .input('hash', sql.Char(64), requestKey)
            .query(`INSERT INTO dbo.trainer_package_purchases
                        (tenant_id,package_id,member_id,starts_on,ends_on,sessions_included,sessions_remaining,amount_due,amount_paid,amount_remaining,idempotency_key_hash)
                    OUTPUT INSERTED.id
                    VALUES (@tenantId,@packageId,@memberId,@startsOn,@endsOn,@sessionsIncluded,@sessionsRemaining,@amountDue,@amountPaid,@amountRemaining,@hash);`);
        const purchaseId = Number(purchaseResult.recordset[0].id);
        const purchase = await getPurchase(transaction, purchaseId, { lock: true });
        if (paid > 0) {
            // The purchase row already contains the initial payment. The
            // ledger snapshot must therefore use its current balance rather
            // than subtracting the initial amount for a second time.
            await recordLedgerPayment(transaction, purchase, { amountPaid: paid, paymentMethod, paidAt, notes, idempotencyKey: `purchase:${requestKey}`, amountRemainingOverride: purchase.amount_remaining });
        }
        await recordAudit(transaction, 'trainer_package_purchased', 'trainer_package_purchase', purchaseId, { after: { packageId, memberId, amountPaid: paid, paidAt } });
        return purchaseId;
    });
    const purchase = (await listPurchases({ readOnly: true })).find((item) => item.id === result) || null;
    if (!purchase) throw commerceError('تعذر قراءة شراء الباقة بعد الحفظ.', 500, 'PACKAGE_PURCHASE_READ_FAILED');
    await coachingService.recordCoachingEvent(memberId, 'package_purchased', { entityType: 'package_purchase', entityId: result, details: `تم شراء باقة رقم ${packageId}.` });
    return purchase;
}

async function recordPayment(purchaseIdValue, body = {}) {
    const { tenantId } = await assertTrainerContext();
    const purchaseId = positiveId(purchaseIdValue, 'معرّف شراء الباقة');
    idempotencyHash(body.idempotencyKey);
    const paid = money(body.amountPaid, 'المبلغ المدفوع', { required: true });
    if (paid <= 0) throw commerceError('المبلغ المدفوع يجب أن يكون أكبر من صفر.', 422, 'VALIDATION_ERROR');
    const paymentMethod = String(body.paymentMethod || 'cash').trim().toLowerCase();
    if (!['cash', 'card', 'transfer', 'other'].includes(paymentMethod)) throw commerceError('طريقة الدفع غير صالحة.', 422, 'VALIDATION_ERROR');
    const paidAt = dateValue(body.paidAt, 'تاريخ التحصيل');
    const transactionId = await withTransaction(async (transaction) => {
        const purchase = await getPurchase(transaction, purchaseId, { lock: true });
        const replay = await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('purchaseId', sql.Int, purchaseId)
            .input('hash', sql.Char(64), idempotencyHash(`trainer-payment:${purchaseId}:${body.idempotencyKey}`))
            .query('SELECT TOP (1) id,amount_paid FROM dbo.gym_payment_transactions WHERE tenant_id=@tenantId AND trainer_package_purchase_id=@purchaseId AND idempotency_key_hash=@hash;');
        if (replay.recordset[0]) {
            if (Math.abs(Number(replay.recordset[0].amount_paid) - paid) > 0.005) throw commerceError('مفتاح الدفع مستخدم بقيمة مختلفة.', 409, 'PAYMENT_IDEMPOTENCY_CONFLICT');
            return Number(replay.recordset[0].id);
        }
        if (purchase.status === 'cancelled') throw commerceError('لا يمكن التحصيل من شراء ملغى.', 409, 'PACKAGE_PURCHASE_CANCELLED');
        if (paid > Number(purchase.amount_remaining)) throw commerceError('المبلغ المدفوع أكبر من المتبقي على الباقة.', 409, 'PACKAGE_BALANCE_INVALID');
        const id = await recordLedgerPayment(transaction, purchase, { amountPaid: paid, paymentMethod, paidAt, notes: boundedText(body.notes, 'ملاحظات الدفع', 500), idempotencyKey: body.idempotencyKey });
        await updatePurchaseTotals(transaction, purchaseId, paid);
        await recordAudit(transaction, 'trainer_package_payment_recorded', 'payment_transaction', id, { after: { packagePurchaseId: purchaseId, amountPaid: paid, paidAt } });
        return id;
    });
    const rows = await listPayments({ purchaseId, readOnly: true });
    return rows.find((row) => row.id === transactionId) || rows[0] || null;
}

async function refundPayment(purchaseIdValue, body = {}) {
    await assertTrainerContext();
    const purchaseId = positiveId(purchaseIdValue, 'معرّف شراء الباقة');
    const amount = money(body.amount, 'قيمة الاسترداد', { required: true });
    if (amount <= 0) throw commerceError('قيمة الاسترداد يجب أن تكون أكبر من صفر.', 422, 'VALIDATION_ERROR');
    const refundKey = idempotencyHash(body.idempotencyKey);
    const refundDate = dateValue(body.refundDate, 'تاريخ الاسترداد');
    const paymentMethod = String(body.paymentMethod || 'cash').trim().toLowerCase();
    if (!['cash', 'card', 'transfer', 'other'].includes(paymentMethod)) throw commerceError('طريقة الدفع غير صالحة.', 422, 'VALIDATION_ERROR');
    const transactionId = await withTransaction(async (transaction) => {
        const purchase = await getPurchase(transaction, purchaseId, { lock: true });
        const ledgerHash = idempotencyHash(`trainer-payment:${purchaseId}:refund:${refundKey}`);
        const replay = await transaction.request()
            .input('tenantId', sql.Int, currentTenantId({ required: true }))
            .input('purchaseId', sql.Int, purchaseId)
            .input('hash', sql.Char(64), ledgerHash)
            .query('SELECT TOP (1) id,amount_paid,transaction_type FROM dbo.gym_payment_transactions WHERE tenant_id=@tenantId AND trainer_package_purchase_id=@purchaseId AND idempotency_key_hash=@hash;');
        if (replay.recordset[0]) {
            const row = replay.recordset[0];
            if (row.transaction_type !== 'adjustment' || Math.abs(Number(row.amount_paid) + amount) > 0.005) {
                throw commerceError('مفتاح الاسترداد مستخدم لقيمة مختلفة.', 409, 'REFUND_IDEMPOTENCY_CONFLICT');
            }
            return Number(row.id);
        }
        if (amount > Number(purchase.amount_paid)) throw commerceError('قيمة الاسترداد تتجاوز المدفوع.', 409, 'REFUND_EXCEEDS_PAYMENT');
        const id = await recordLedgerPayment(transaction, purchase, { amountPaid: amount, paymentMethod, paidAt: refundDate, notes: boundedText(body.notes, 'سبب الاسترداد', 500) || 'استرداد دفعة باقة.', idempotencyKey: `refund:${refundKey}`, transactionType: 'adjustment' });
        await updatePurchaseTotals(transaction, purchaseId, amount, { refund: true });
        await recordAudit(transaction, 'trainer_package_payment_refunded', 'payment_transaction', id, { after: { packagePurchaseId: purchaseId, amountRefunded: amount, refundDate } });
        return id;
    });
    return (await listPayments({ purchaseId, readOnly: true })).find((row) => row.id === transactionId) || null;
}

async function listPayments({ purchaseId = null, memberId = null, readOnly = false } = {}) {
    await assertTrainerContext({ readOnly });
    const tenantId = currentTenantId({ required: true });
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('purchaseId', sql.Int, purchaseId == null ? null : positiveId(purchaseId, 'معرّف شراء الباقة'))
        .input('memberId', sql.Int, memberId == null ? null : positiveId(memberId, 'معرّف العميل'))
        .query(`SELECT t.id,t.trainer_package_purchase_id,t.transaction_type,t.amount_due,t.amount_paid,t.amount_remaining,
                       t.payment_method,t.paid_at,t.notes,t.is_voided,t.created_at,pp.member_id,p.name AS package_name,m.full_name AS client_name
                FROM dbo.gym_payment_transactions t
                INNER JOIN dbo.trainer_package_purchases pp ON pp.id=t.trainer_package_purchase_id AND pp.tenant_id=t.tenant_id
                INNER JOIN dbo.trainer_packages p ON p.id=pp.package_id AND p.tenant_id=pp.tenant_id
                INNER JOIN dbo.members m ON m.id=pp.member_id AND m.tenant_id=pp.tenant_id
                WHERE t.tenant_id=@tenantId AND t.trainer_package_purchase_id IS NOT NULL
                  AND (@purchaseId IS NULL OR t.trainer_package_purchase_id=@purchaseId)
                  AND (@memberId IS NULL OR pp.member_id=@memberId)
                ORDER BY t.paid_at DESC,t.created_at DESC,t.id DESC;`));
    return result.recordset.map((row) => ({
        id: Number(row.id), packagePurchaseId: Number(row.trainer_package_purchase_id), transactionType: row.transaction_type,
        amountDue: Number(row.amount_due || 0), amountPaid: Number(row.amount_paid || 0), amountRemaining: Number(row.amount_remaining || 0),
        paymentMethod: row.payment_method, paidAt: row.paid_at ? formatDateOnly(row.paid_at) : null, notes: row.notes || null,
        isVoided: Boolean(row.is_voided), memberId: Number(row.member_id), clientName: row.client_name, packageName: row.package_name, createdAt: row.created_at
    }));
}

async function listSessions({ memberId = null, from = null, to = null, readOnly = false } = {}) {
    await assertTrainerContext({ readOnly });
    const tenantId = currentTenantId({ required: true });
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('memberId', sql.Int, memberId == null ? null : positiveId(memberId, 'معرّف العميل'))
        .input('from', sql.DateTime2(0), from ? timestampValue(from, 'بداية الفترة') : null)
        .input('to', sql.DateTime2(0), to ? timestampValue(to, 'نهاية الفترة') : null)
        .query(`SELECT s.*,m.full_name AS client_name
                FROM dbo.coaching_sessions s
                INNER JOIN dbo.members m ON m.id=s.member_id AND m.tenant_id=s.tenant_id
                WHERE s.tenant_id=@tenantId AND (@memberId IS NULL OR s.member_id=@memberId)
                  AND (@from IS NULL OR s.scheduled_end >= @from) AND (@to IS NULL OR s.scheduled_start <= @to)
                ORDER BY s.scheduled_start ASC,s.id ASC;`));
    return result.recordset.map(mapSession);
}

async function createSession(body = {}) {
    const { tenantId } = await assertTrainerContext();
    const memberId = positiveId(body.memberId ?? body.clientId, 'معرّف العميل');
    const trainerUserId = actorUserId();
    if (!trainerUserId) throw commerceError('لا يمكن تحديد حساب المدرب الحالي.', 500, 'TRAINER_CONTEXT_REQUIRED');
    const start = timestampValue(body.scheduledStart, 'موعد بداية الجلسة');
    const end = timestampValue(body.scheduledEnd, 'موعد نهاية الجلسة');
    if (end <= start) throw commerceError('موعد نهاية الجلسة يجب أن يكون بعد البداية.', 422, 'SESSION_WINDOW_INVALID');
    const requestKey = idempotencyHash(body.idempotencyKey);
    const packagePurchaseId = body.packagePurchaseId == null || body.packagePurchaseId === '' ? null : positiveId(body.packagePurchaseId, 'معرّف شراء الباقة');
    const notes = boundedText(body.notes, 'ملاحظات الجلسة', 1000);
    const id = await withTransaction(async (transaction) => {
        const replay = await transaction.request().input('tenantId', sql.Int, tenantId).input('hash', sql.Char(64), requestKey).query('SELECT TOP (1) id,member_id,scheduled_start,scheduled_end,package_purchase_id FROM dbo.coaching_sessions WHERE tenant_id=@tenantId AND idempotency_key_hash=@hash;');
        if (replay.recordset[0]) {
            const existing = replay.recordset[0];
            const sameWindow = new Date(existing.scheduled_start).getTime() === start.getTime()
                && new Date(existing.scheduled_end).getTime() === end.getTime();
            if (Number(existing.member_id) !== memberId
                || !sameWindow
                || Number(existing.package_purchase_id || 0) !== Number(packagePurchaseId || 0)) {
                throw commerceError('Ù…ÙØªØ§Ø­ Ø§Ù„Ø¹Ù…Ù„ÙŠØ© Ù…Ø³ØªØ®Ø¯Ù… Ù„Ø¬Ù„Ø³Ø© Ù…Ø®ØªÙ„ÙØ©.', 409, 'SESSION_IDEMPOTENCY_CONFLICT');
            }
            return Number(existing.id);
        }
        await assertClient(transaction, memberId);
        await assertTrainerUser(transaction, trainerUserId);
        if (packagePurchaseId) {
            const purchase = await getPurchase(transaction, packagePurchaseId, { lock: true });
            if (Number(purchase.member_id) !== memberId) throw commerceError('شراء الباقة لا يخص هذا العميل.', 403, 'PACKAGE_CLIENT_MISMATCH');
            if (purchase.status === 'cancelled' || purchase.status === 'expired') throw commerceError('لا يمكن ربط جلسة بباقة غير متاحة.', 409, 'PACKAGE_NOT_AVAILABLE');
        }
        const result = await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('memberId', sql.Int, memberId)
            .input('trainerUserId', sql.Int, trainerUserId)
            .input('scheduledStart', sql.DateTime2(0), start)
            .input('scheduledEnd', sql.DateTime2(0), end)
            .input('notes', sql.NVarChar(1000), notes)
            .input('packagePurchaseId', sql.Int, packagePurchaseId)
            .input('hash', sql.Char(64), requestKey)
            .query(`INSERT INTO dbo.coaching_sessions(tenant_id,member_id,trainer_user_id,scheduled_start,scheduled_end,status,notes,package_purchase_id,idempotency_key_hash)
                    OUTPUT INSERTED.id VALUES (@tenantId,@memberId,@trainerUserId,@scheduledStart,@scheduledEnd,'scheduled',@notes,@packagePurchaseId,@hash);`);
        const sessionId = Number(result.recordset[0].id);
        await recordAudit(transaction, 'trainer_session_created', 'coaching_session', sessionId, { after: { memberId, scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), packagePurchaseId } });
        return sessionId;
    });
    await coachingService.recordCoachingEvent(memberId, 'session_scheduled', { entityType: 'coaching_session', entityId: id, details: 'تم جدولة جلسة تدريب.' });
    return (await listSessions({ memberId, readOnly: true })).find((row) => row.id === id) || null;
}

async function updateSession(sessionIdValue, body = {}) {
    await assertTrainerContext();
    const sessionId = positiveId(sessionIdValue, 'معرّف الجلسة');
    const current = await withTransaction(async (transaction) => {
        const tenantId = currentTenantId({ required: true });
        const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('id', sql.Int, sessionId).query('SELECT TOP (1) * FROM dbo.coaching_sessions WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND tenant_id=@tenantId;');
        const row = result.recordset[0];
        if (!row) throw commerceError('الجلسة غير موجودة.', 404, 'SESSION_NOT_FOUND');
        if (row.status !== 'scheduled') throw commerceError('لا يمكن تعديل جلسة بعد بدء نتيجتها.', 409, 'SESSION_IMMUTABLE');
        const start = body.scheduledStart === undefined ? row.scheduled_start : timestampValue(body.scheduledStart, 'موعد بداية الجلسة');
        const end = body.scheduledEnd === undefined ? row.scheduled_end : timestampValue(body.scheduledEnd, 'موعد نهاية الجلسة');
        if (end <= start) throw commerceError('موعد نهاية الجلسة يجب أن يكون بعد البداية.', 422, 'SESSION_WINDOW_INVALID');
        const notes = body.notes === undefined ? row.notes : boundedText(body.notes, 'ملاحظات الجلسة', 1000);
        await transaction.request().input('id', sql.Int, sessionId).input('start', sql.DateTime2(0), start).input('end', sql.DateTime2(0), end).input('notes', sql.NVarChar(1000), notes).query('UPDATE dbo.coaching_sessions SET scheduled_start=@start,scheduled_end=@end,notes=@notes,updated_at=SYSUTCDATETIME() WHERE id=@id;');
        await recordAudit(transaction, 'trainer_session_updated', 'coaching_session', sessionId, { before: { scheduledStart: row.scheduled_start, scheduledEnd: row.scheduled_end, notes: row.notes }, after: { scheduledStart: start, scheduledEnd: end, notes } });
        return Number(row.member_id);
    });
    return (await listSessions({ memberId: current, readOnly: true })).find((row) => row.id === sessionId) || null;
}

async function setSessionStatus(sessionIdValue, statusValue) {
    await assertTrainerContext();
    const sessionId = positiveId(sessionIdValue, 'معرّف الجلسة');
    const nextStatus = sessionStatus(statusValue);
    const memberId = await withTransaction(async (transaction) => {
        const tenantId = currentTenantId({ required: true });
        const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('id', sql.Int, sessionId).query('SELECT TOP (1) * FROM dbo.coaching_sessions WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND tenant_id=@tenantId;');
        const session = result.recordset[0];
        if (!session) throw commerceError('الجلسة غير موجودة.', 404, 'SESSION_NOT_FOUND');
        if (session.status === nextStatus) return Number(session.member_id);
        if (session.status === 'completed') throw commerceError('الجلسة المكتملة لا يمكن التراجع عنها تلقائيًا.', 409, 'SESSION_COMPLETED_IMMUTABLE');
        if (nextStatus === 'completed' && session.package_purchase_id) {
            const purchase = await getPurchase(transaction, session.package_purchase_id, { lock: true });
            if (Number(purchase.member_id) !== Number(session.member_id)) throw commerceError('الباقة لا تخص عميل الجلسة.', 403, 'PACKAGE_CLIENT_MISMATCH');
            if (purchase.status === 'cancelled' || purchase.status === 'expired' || Number(purchase.sessions_remaining || 0) < 1) throw commerceError('لا توجد جلسات متبقية في الباقة.', 409, 'PACKAGE_SESSIONS_EXHAUSTED');
            const usage = await transaction.request().input('tenantId', sql.Int, tenantId).input('purchaseId', sql.Int, Number(purchase.id)).input('sessionId', sql.Int, sessionId).query('SELECT TOP (1) id FROM dbo.trainer_package_usage WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND package_purchase_id=@purchaseId AND coaching_session_id=@sessionId;');
            if (!usage.recordset[0]) {
                await transaction.request().input('tenantId', sql.Int, tenantId).input('purchaseId', sql.Int, Number(purchase.id)).input('sessionId', sql.Int, sessionId).query('INSERT INTO dbo.trainer_package_usage(tenant_id,package_purchase_id,coaching_session_id,quantity) VALUES (@tenantId,@purchaseId,@sessionId,1);');
                await transaction.request().input('id', sql.Int, Number(purchase.id)).query("UPDATE dbo.trainer_package_purchases SET sessions_remaining=sessions_remaining-1,status=CASE WHEN sessions_remaining=1 THEN 'completed' ELSE status END,updated_at=SYSUTCDATETIME() WHERE id=@id AND sessions_remaining>0;");
            }
        }
        await transaction.request().input('id', sql.Int, sessionId).input('status', sql.VarChar(20), nextStatus).query("UPDATE dbo.coaching_sessions SET status=@status,completed_at=CASE WHEN @status='completed' THEN COALESCE(completed_at,SYSUTCDATETIME()) ELSE completed_at END,updated_at=SYSUTCDATETIME() WHERE id=@id;");
        await recordAudit(transaction, 'trainer_session_status_changed', 'coaching_session', sessionId, { after: { status: nextStatus, packageConsumption: nextStatus === 'completed' && Boolean(session.package_purchase_id) } });
        return Number(session.member_id);
    });
    await coachingService.recordCoachingEvent(memberId, `session_${nextStatus}`, { entityType: 'coaching_session', entityId: sessionId, details: `تم تحديث حالة الجلسة إلى ${nextStatus}.` });
    return (await listSessions({ memberId, readOnly: true })).find((row) => row.id === sessionId) || null;
}

module.exports = {
    assertTrainerContext,
    createPackage,
    createPurchase,
    createSession,
    listPackages,
    listPayments,
    listPurchases,
    listSessions,
    recordPayment,
    refundPayment,
    setSessionStatus,
    updatePackage,
    updateSession
};
