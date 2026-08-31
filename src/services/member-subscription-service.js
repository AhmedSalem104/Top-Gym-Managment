'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { currentTenantId, getTenantContext } = require('../tenancy/tenant-context');
const { config } = require('../config/env');
const { addDays, formatDateOnly, parseDateOnly, todayInTimeZone } = require('../utils/date');
const commercialSchema = require('./commercial-schema');
const commercialService = require('./commercial-service');
const brandingService = require('./branding-service');
const memberService = require('./member-service');
const membershipCodeService = require('./membership-code-service');
const saasService = require('./saas-service');

const SUPPORTED_REQUEST_TYPES = Object.freeze(new Set(['membership', 'renewal']));
const MAX_PAGE_SIZE = 50;
const MAX_PROOF_BYTES = 4 * 1024 * 1024;
let objectStorageService = null;

function requestError(message, statusCode = 400, code = 'MEMBER_SUBSCRIPTION_REQUEST_INVALID') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function text(value, fallback = '', maxLength = 1000) {
    return String(value ?? fallback)
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .slice(0, maxLength);
}

function positiveId(value, label = 'id') {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw requestError(`${label} is invalid.`, 400, 'INVALID_MEMBER_SUBSCRIPTION_ID');
    return parsed;
}

function normalizePage(value, fallback = 1) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(100000, parsed) : fallback;
}

function normalizePageSize(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(MAX_PAGE_SIZE, parsed) : 25;
}

function normalizeRequestType(value = 'membership') {
    const type = text(value, 'membership', 40).toLowerCase();
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(type)) {
        throw requestError('Request type is invalid.', 400, 'INVALID_MEMBER_SUBSCRIPTION_REQUEST_TYPE');
    }
    // The schema intentionally keys pending uniqueness by request_type. Keep
    // future types possible without allowing an approval path that has not
    // been implemented yet.
    if (!SUPPORTED_REQUEST_TYPES.has(type)) {
        throw requestError('This member request type is not available yet.', 422, 'MEMBER_SUBSCRIPTION_REQUEST_TYPE_UNSUPPORTED');
    }
    return type;
}

function idempotencyKeyHash(value, tenantId, memberId, requestType) {
    const key = text(value, '', 128);
    if (!key) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(key)) {
        throw requestError('Idempotency key is invalid.', 400, 'INVALID_IDEMPOTENCY_KEY');
    }
    const secret = String(config.memberPortalSessionSecret || 'logicfit-idempotency-key');
    return crypto.createHmac('sha256', secret)
        .update(`${tenantId}:${memberId}:${requestType}:${key}`)
        .digest('hex');
}

function configureObjectStorageService(service) {
    objectStorageService = service || null;
}

function requireObjectStorageService() {
    if (!objectStorageService || objectStorageService.isConfigured === false) {
        throw requestError('Private payment-proof storage is not configured.', 503, 'MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED');
    }
    return objectStorageService;
}

const PAYMENT_PROOF_STORAGE_UNAVAILABLE_CODES = new Set([
    'OBJECT_STORAGE_PROVIDER_UNAVAILABLE',
    'OBJECT_STORAGE_PROVIDER_REQUEST_FAILED'
]);

const PAYMENT_PROOF_STORAGE_INTEGRITY_CODES = new Set([
    'STORAGE_OBJECT_NOT_FOUND',
    'STORAGE_SIZE_MISMATCH',
    'STORAGE_CHECKSUM_MISMATCH',
    'PAYMENT_PROOF_INTEGRITY_FAILED'
]);

function normalizePaymentProofStorageError(error) {
    const code = String(error?.code || '');
    if (code === 'OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED' || code === 'MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED') {
        return requestError('Private payment-proof storage is not configured.', 503, 'MEMBER_PAYMENT_PROOF_STORAGE_NOT_CONFIGURED');
    }
    if (PAYMENT_PROOF_STORAGE_UNAVAILABLE_CODES.has(code)) {
        return requestError('Private payment-proof storage is temporarily unavailable.', 503, 'MEMBER_PAYMENT_PROOF_STORAGE_UNAVAILABLE');
    }
    if (PAYMENT_PROOF_STORAGE_INTEGRITY_CODES.has(code)) {
        return requestError('Payment proof integrity could not be verified.', 503, 'PAYMENT_PROOF_INTEGRITY_FAILED');
    }
    return error;
}

function paymentLedgerMethod(methodCode) {
    // gym_payments intentionally keeps its existing four-value constraint.
    // Tenant-specific method codes remain in the request snapshot/notes while
    // an external transfer is represented as the existing `transfer` ledger
    // method.
    return String(methodCode || '').toLowerCase() === 'cash' ? 'cash' : 'transfer';
}

function requestFromRow(row, codePreview = null) {
    if (!row) return null;
    return {
        id: Number(row.id),
        requestType: String(row.request_type || 'membership'),
        status: String(row.status),
        member: {
            id: Number(row.member_id),
            name: row.member_name || null,
            phone: row.member_phone || null,
            membershipCode: codePreview || null
        },
        membership: {
            plan: row.membership_plan,
            type: row.membership_type,
            durationMode: row.duration_mode,
            durationValue: Number(row.duration_value || 0),
            startDate: formatDateOnly(row.start_date),
            endDate: formatDateOnly(row.end_date)
        },
        pricing: {
            listPrice: Number(row.list_price || 0),
            discountAmount: Number(row.discount_amount || 0),
            amountDue: Number(row.amount_due || 0),
            currency: String(row.currency || 'EGP')
        },
        paymentMethod: row.payment_method_code ? {
            code: row.payment_method_code,
            name: row.payment_method_name || null
        } : null,
        notes: row.notes || '',
        reviewNotes: row.review_notes || '',
        reviewedAt: row.reviewed_at || null,
        approvedMembershipId: row.approved_membership_id == null ? null : Number(row.approved_membership_id),
        createdPaymentId: row.created_payment_id == null ? null : Number(row.created_payment_id),
        createdLedgerTransactionId: row.created_ledger_transaction_id == null ? null : Number(row.created_ledger_transaction_id),
        createdAt: row.created_at || null,
        proof: row.proof_id ? {
            id: Number(row.proof_id),
            fileName: row.proof_file_name,
            mimeType: row.proof_mime_type,
            fileSize: Number(row.proof_file_size || 0),
            uploadedAt: row.proof_uploaded_at || null,
            verified: Boolean(row.proof_verified_at),
            verifiedAt: row.proof_verified_at || null
        } : null
    };
}

const REQUEST_SELECT = `
    SELECT r.id,r.tenant_id,r.member_id,r.request_type,r.status,
           r.membership_plan,r.membership_type,r.duration_mode,r.duration_value,
           r.start_date,r.end_date,r.list_price,r.discount_amount,r.amount_due,r.currency,
           r.payment_method_code,r.payment_method_name,r.notes,r.review_notes,
           r.reviewed_at,r.approved_membership_id,r.created_payment_id,r.created_ledger_transaction_id,
           r.created_at,r.updated_at,
           m.full_name AS member_name,m.phone AS member_phone,
           proof.id AS proof_id,proof.file_name AS proof_file_name,proof.mime_type AS proof_mime_type,
           proof.file_size AS proof_file_size,proof.uploaded_at AS proof_uploaded_at,
           proof.storage_verified_at AS proof_verified_at
    FROM dbo.gym_member_subscription_requests AS r
    INNER JOIN dbo.members AS m ON m.id=r.member_id AND m.tenant_id=r.tenant_id
    LEFT JOIN dbo.gym_member_subscription_payment_proofs AS proof
      ON proof.request_id=r.id AND proof.tenant_id=r.tenant_id
`;

async function ensureTables({ readOnly = false } = {}) {
    await commercialSchema.ensureCommercialTables({ readOnly });
}

async function getRequestRow(id, tenantId, { memberId = null, transaction = null, lock = false } = {}) {
    const select = lock
        ? REQUEST_SELECT.replace('FROM dbo.gym_member_subscription_requests AS r', 'FROM dbo.gym_member_subscription_requests AS r WITH (UPDLOCK,HOLDLOCK)')
        : REQUEST_SELECT;
    const request = (transaction || await getPool()).request()
        .input('requestId', sql.BigInt, positiveId(id, 'request id'))
        .input('tenantId', sql.Int, positiveId(tenantId, 'tenant id'))
        .input('memberId', sql.Int, memberId == null ? null : positiveId(memberId, 'member id'));
    return (await request.query(`${select}
        WHERE r.id=@requestId AND r.tenant_id=@tenantId
          AND (@memberId IS NULL OR r.member_id=@memberId);`)).recordset[0] || null;
}

async function listRequests({ tenantId, memberId = null, status = '', page = 1, pageSize = 25, includeMemberCode = false, readOnly = false } = {}) {
    const id = positiveId(tenantId, 'tenant id');
    await ensureTables({ readOnly });
    const currentPage = normalizePage(page);
    const currentPageSize = normalizePageSize(pageSize);
    const offset = (currentPage - 1) * currentPageSize;
    const normalizedStatus = text(status, '', 20).toLowerCase();
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, id)
        .input('memberId', sql.Int, memberId == null ? null : positiveId(memberId, 'member id'))
        .input('status', sql.VarChar(20), normalizedStatus)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, currentPageSize)
        .query(`${REQUEST_SELECT}
            WHERE r.tenant_id=@tenantId
              AND (@memberId IS NULL OR r.member_id=@memberId)
              AND (@status='' OR r.status=@status)
            ORDER BY r.created_at DESC,r.id DESC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
    const previews = includeMemberCode
        ? await membershipCodeService.getPreviews(result.recordset.map((row) => Number(row.member_id)))
        : new Map();
    const requests = result.recordset.map((row) => requestFromRow(row, previews.get(Number(row.member_id)) || null));
    // The page query intentionally returns a bounded result. A separate count
    // keeps the API contract useful without loading all historical requests.
    const count = await pool.request()
        .input('tenantId', sql.Int, id)
        .input('memberId', sql.Int, memberId == null ? null : positiveId(memberId, 'member id'))
        .input('status', sql.VarChar(20), normalizedStatus)
        .query(`SELECT COUNT_BIG(*) AS total
                FROM dbo.gym_member_subscription_requests AS r
                WHERE r.tenant_id=@tenantId
                  AND (@memberId IS NULL OR r.member_id=@memberId)
                  AND (@status='' OR r.status=@status);`);
    const total = Number(count.recordset[0]?.total || 0);
    return {
        requests,
        pagination: {
            page: currentPage,
            pageSize: currentPageSize,
            total,
            pages: Math.max(1, Math.ceil(total / currentPageSize))
        }
    };
}

async function getTenantPaymentMethod(code) {
    const normalizedCode = text(code, '', 60).toLowerCase();
    if (!normalizedCode) throw requestError('Payment method is required.', 400, 'PAYMENT_METHOD_REQUIRED');
    const methods = await brandingService.getTenantPaymentMethods({ readOnly: true });
    const method = methods.find((item) => String(item.id).toLowerCase() === normalizedCode || String(item.name).toLowerCase() === normalizedCode || String(item.code || '').toLowerCase() === normalizedCode);
    if (!method) throw requestError('The selected payment method is not available for this gym.', 409, 'PAYMENT_METHOD_NOT_AVAILABLE');
    return {
        code: text(method.id || method.code || method.name, '', 60).toLowerCase(),
        name: text(method.name, '', 120),
        accountReference: text(method.accountReference, '', 160),
        recipientName: text(method.recipientName, '', 160) || null,
        instructions: text(method.instructions, '', 1000) || null
    };
}

async function normalizePortalRequest(body = {}) {
    const tenantId = currentTenantId({ required: true });
    const requestType = normalizeRequestType(body.requestType || 'membership');
    const membershipPlan = text(body.membershipPlan, '', 30).toLowerCase();
    const requestedMembershipType = text(body.membershipType || body.type, '', 30).toLowerCase();
    if (!membershipPlan || !requestedMembershipType) throw requestError('Membership plan and type are required.', 400, 'MEMBERSHIP_SELECTION_REQUIRED');
    const catalog = await memberService.getPricingCatalog();
    const plan = catalog.plans?.[membershipPlan];
    if (!plan || plan.active === false) throw requestError('The selected membership plan is not available.', 409, 'MEMBERSHIP_PLAN_NOT_AVAILABLE');
    const membershipType = catalog.types?.[requestedMembershipType]
        ? requestedMembershipType
        : catalog.typeAliases?.[requestedMembershipType];
    const type = membershipType ? catalog.types?.[membershipType] : null;
    if (!type || type.active === false) throw requestError('The selected membership type is not available.', 409, 'MEMBERSHIP_TYPE_NOT_AVAILABLE');
    const pricing = await memberService.calculatePricing(membershipType, membershipPlan, 0);
    const startDate = requestType === 'renewal'
        ? null
        : parseDateOnly(body.startDate || todayInTimeZone(), 'start date');
    const endDate = startDate
        ? memberService.membershipEndDateFromConfig(startDate, pricing.typeConfig)
        : null;
    const method = await getTenantPaymentMethod(body.paymentMethodCode || body.paymentMethod);
    return {
        tenantId,
        requestType,
        membershipPlan,
        membershipType: pricing.typeCode,
        durationMode: pricing.typeConfig.mode,
        durationValue: Math.round(Number(pricing.typeConfig.durationValue)),
        startDate,
        endDate,
        listPrice: Number(pricing.listPrice),
        discountAmount: Number(pricing.discountAmount),
        amountDue: Number(pricing.amountDue),
        currency: 'EGP',
        paymentMethodCode: method.code,
        paymentMethodName: method.name,
        paymentNotes: method.instructions,
        notes: text(body.notes, '', 1000) || null
    };
}

async function createPortalRequest(request, body = {}) {
    return commercialService.withPortalSession(request, async (session) => {
        const data = await normalizePortalRequest(body);
        const idempotency = idempotencyKeyHash(
            request.get?.('idempotency-key') || body.idempotencyKey,
            data.tenantId,
            session.memberId,
            data.requestType
        );
        let requestId = null;
        let reused = false;
        let requestDates = { startDate: data.startDate, endDate: data.endDate };
        try {
            await withTransaction(async (transaction) => {
                const member = await transaction.request()
                    .input('tenantId', sql.Int, data.tenantId)
                    .input('memberId', sql.Int, positiveId(session.memberId, 'member id'))
                    .query('SELECT TOP (1) id FROM dbo.members WITH (UPDLOCK,HOLDLOCK) WHERE id=@memberId AND tenant_id=@tenantId;');
                if (!member.recordset[0]) throw requestError('Member portal session is no longer valid.', 401, 'PORTAL_SESSION_MEMBER_INVALID');
                if (idempotency) {
                    const existing = await transaction.request()
                        .input('tenantId', sql.Int, data.tenantId)
                        .input('memberId', sql.Int, session.memberId)
                        .input('requestType', sql.VarChar(40), data.requestType)
                        .input('idempotencyKeyHash', sql.Char(64), idempotency)
                        .query('SELECT TOP (1) id FROM dbo.gym_member_subscription_requests WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND member_id=@memberId AND request_type=@requestType AND idempotency_key_hash=@idempotencyKeyHash;');
                    if (existing.recordset[0]) {
                        requestId = Number(existing.recordset[0].id);
                        reused = true;
                        return;
                    }
                }
                if (data.requestType === 'renewal') {
                    requestDates = await memberService.resolveRenewalDates(transaction, {
                        memberId: session.memberId,
                        durationMode: data.durationMode,
                        durationValue: data.durationValue
                    });
                }
                const pending = await transaction.request()
                    .input('tenantId', sql.Int, data.tenantId)
                    .input('memberId', sql.Int, session.memberId)
                    .input('requestType', sql.VarChar(40), data.requestType)
                    .query("SELECT TOP (1) id FROM dbo.gym_member_subscription_requests WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND member_id=@memberId AND request_type=@requestType AND status='pending';");
                if (pending.recordset[0]) throw requestError('A pending request of this type already exists.', 409, 'MEMBER_SUBSCRIPTION_REQUEST_ALREADY_PENDING');
                const inserted = await transaction.request()
                    .input('tenantId', sql.Int, data.tenantId)
                    .input('memberId', sql.Int, session.memberId)
                    .input('requestType', sql.VarChar(40), data.requestType)
                    .input('status', sql.VarChar(20), 'pending')
                    .input('membershipPlan', sql.VarChar(30), data.membershipPlan)
                    .input('membershipType', sql.VarChar(30), data.membershipType)
                    .input('durationMode', sql.VarChar(10), data.durationMode)
                    .input('durationValue', sql.Int, data.durationValue)
                    .input('startDate', sql.Date, new Date(`${requestDates.startDate}T00:00:00.000Z`))
                    .input('endDate', sql.Date, new Date(`${requestDates.endDate}T00:00:00.000Z`))
                    .input('listPrice', sql.Decimal(12, 2), data.listPrice)
                    .input('discountAmount', sql.Decimal(12, 2), data.discountAmount)
                    .input('amountDue', sql.Decimal(12, 2), data.amountDue)
                    .input('currency', sql.Char(3), data.currency)
                    .input('paymentMethodCode', sql.VarChar(60), data.paymentMethodCode)
                    .input('paymentMethodName', sql.NVarChar(120), data.paymentMethodName)
                    .input('notes', sql.NVarChar(1000), data.notes)
                    .input('idempotencyKeyHash', sql.Char(64), idempotency)
                    .query(`INSERT INTO dbo.gym_member_subscription_requests
                            (tenant_id,member_id,request_type,status,membership_plan,membership_type,
                             duration_mode,duration_value,start_date,end_date,list_price,discount_amount,
                             amount_due,currency,payment_method_code,payment_method_name,notes,idempotency_key_hash)
                            OUTPUT INSERTED.id
                            VALUES (@tenantId,@memberId,@requestType,@status,@membershipPlan,@membershipType,
                                    @durationMode,@durationValue,@startDate,@endDate,@listPrice,@discountAmount,
                                    @amountDue,@currency,@paymentMethodCode,@paymentMethodName,@notes,@idempotencyKeyHash);`);
                requestId = Number(inserted.recordset[0]?.id);
                await saasService.recordAudit({
                    tenantId: data.tenantId,
                    actorUserId: null,
                    action: 'member_subscription_requested',
                    entityType: 'member_subscription_request',
                    entityId: requestId,
                    details: `Member portal request ${data.requestType}.`,
                    executor: transaction
                });
            });
        } catch (error) {
            if (saasService.isDuplicateSqlError?.(error)) {
                throw requestError('A request of this type was submitted already. Refresh the portal to view its status.', 409, 'MEMBER_SUBSCRIPTION_REQUEST_ALREADY_PENDING');
            }
            throw error;
        }
        const result = await getRequestRow(requestId, data.tenantId, { memberId: session.memberId });
        if (!result) throw requestError('The subscription request could not be loaded after creation.', 503, 'MEMBER_SUBSCRIPTION_REQUEST_NOT_AVAILABLE');
        return { request: requestFromRow(result), idempotent: reused };
    });
}

async function uploadPortalProof(request, requestId, { buffer, mimeType, fileName } = {}) {
    return commercialService.withPortalSession(request, async (session) => {
        const tenantId = currentTenantId({ required: true });
        const proof = saasService.validateProof({ buffer, mimeType, fileName });
        if (proof.buffer.length > MAX_PROOF_BYTES) throw requestError('Payment proof is too large.', 400, 'PAYMENT_PROOF_TOO_LARGE');
        const before = await getRequestRow(requestId, tenantId, { memberId: session.memberId });
        if (!before) throw requestError('Subscription request was not found.', 404, 'MEMBER_SUBSCRIPTION_REQUEST_NOT_FOUND');
        if (before.status !== 'pending') throw requestError('This request has already been reviewed.', 409, 'MEMBER_SUBSCRIPTION_REQUEST_LOCKED');
        const storage = requireObjectStorageService();
        let storedObject = null;
        try {
            storedObject = await storage.putPrivateObject({
                tenantId,
                category: 'payment-proofs',
                objectName: proof.fileName,
                contentType: proof.mimeType,
                body: proof.buffer,
                checksum: proof.sha256
            });
            await storage.verifyPrivateObject({
                tenantId,
                key: storedObject.key,
                expectedSize: proof.buffer.length,
                expectedChecksum: proof.sha256
            });
            let previousKey = null;
            await withTransaction(async (transaction) => {
                const locked = await getRequestRow(requestId, tenantId, { memberId: session.memberId, transaction, lock: true });
                if (!locked) throw requestError('Subscription request was not found.', 404, 'MEMBER_SUBSCRIPTION_REQUEST_NOT_FOUND');
                if (locked.status !== 'pending') throw requestError('This request has already been reviewed.', 409, 'MEMBER_SUBSCRIPTION_REQUEST_LOCKED');
                const previous = await transaction.request()
                    .input('tenantId', sql.Int, tenantId)
                    .input('requestId', sql.BigInt, positiveId(requestId, 'request id'))
                    .query('SELECT TOP (1) storage_key FROM dbo.gym_member_subscription_payment_proofs WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND request_id=@requestId;');
                previousKey = previous.recordset[0]?.storage_key || null;
                await transaction.request()
                    .input('tenantId', sql.Int, tenantId)
                    .input('requestId', sql.BigInt, positiveId(requestId, 'request id'))
                    .input('fileName', sql.NVarChar(255), proof.fileName)
                    .input('mimeType', sql.VarChar(80), proof.mimeType)
                    .input('fileSize', sql.Int, proof.buffer.length)
                    .input('sha256', sql.Char(64), proof.sha256)
                    .input('storageKey', sql.NVarChar(512), storedObject.key)
                    .input('storageProvider', sql.VarChar(40), String(storage.provider || storage.providerStatus || 'private').slice(0, 40))
                    .query(`UPDATE dbo.gym_member_subscription_payment_proofs
                            SET file_name=@fileName,mime_type=@mimeType,file_size=@fileSize,sha256=@sha256,
                                storage_key=@storageKey,storage_provider=@storageProvider,
                                storage_verified_at=SYSUTCDATETIME(),uploaded_at=SYSUTCDATETIME()
                            WHERE tenant_id=@tenantId AND request_id=@requestId;
                            IF @@ROWCOUNT=0
                                INSERT INTO dbo.gym_member_subscription_payment_proofs
                                    (tenant_id,request_id,file_name,mime_type,file_size,sha256,storage_key,storage_provider,storage_verified_at)
                                VALUES (@tenantId,@requestId,@fileName,@mimeType,@fileSize,@sha256,@storageKey,@storageProvider,SYSUTCDATETIME());`);
                await saasService.recordAudit({
                    tenantId,
                    actorUserId: null,
                    action: 'member_subscription_proof_uploaded',
                    entityType: 'member_subscription_request',
                    entityId: positiveId(requestId, 'request id'),
                    details: 'Member portal payment proof uploaded and verified.',
                    executor: transaction
                });
            });
            if (previousKey && previousKey !== storedObject.key) await storage.deletePrivateObject({ tenantId, key: previousKey }).catch(() => {});
        } catch (error) {
            if (storedObject?.key) await storage.deletePrivateObject({ tenantId, key: storedObject.key }).catch(() => {});
            throw normalizePaymentProofStorageError(error);
        }
        const result = await getRequestRow(requestId, tenantId, { memberId: session.memberId });
        return { request: requestFromRow(result) };
    });
}

async function getPortalRequests(request, options = {}) {
    return commercialService.withPortalSession(request, async (session) => listRequests({
        tenantId: session.tenantId,
        memberId: session.memberId,
        status: options.status,
        page: options.page,
        pageSize: options.pageSize,
        readOnly: true
    }));
}

async function getOwnerRequests(options = {}) {
    return listRequests({
        tenantId: currentTenantId({ required: true }),
        status: options.status,
        page: options.page,
        pageSize: options.pageSize,
        includeMemberCode: true,
        readOnly: Boolean(options.readOnly)
    });
}

async function getStoredProofFile(proofId, tenantId = currentTenantId({ required: true })) {
    const id = positiveId(proofId, 'proof id');
    const scopedTenantId = positiveId(tenantId, 'tenant id');
    await ensureTables({ readOnly: true });
    const pool = await getPool();
    const result = await pool.request()
        .input('proofId', sql.BigInt, id)
        .input('tenantId', sql.Int, scopedTenantId)
        .query(`SELECT TOP (1) p.id,p.tenant_id,p.file_name,p.mime_type,p.file_size,p.sha256,
                       p.storage_key,p.storage_verified_at
                FROM dbo.gym_member_subscription_payment_proofs AS p
                INNER JOIN dbo.gym_member_subscription_requests AS r
                    ON r.id=p.request_id AND r.tenant_id=p.tenant_id
                WHERE p.id=@proofId AND p.tenant_id=@tenantId;`);
    const proof = result.recordset[0] || null;
    if (!proof) return null;
    if (!proof.storage_key || !proof.storage_verified_at) throw requestError('Payment proof is unavailable.', 503, 'PAYMENT_PROOF_UNAVAILABLE');
    const storage = requireObjectStorageService();
    let object;
    try {
        object = await storage.getPrivateObject({ tenantId: scopedTenantId, key: proof.storage_key });
    } catch (error) {
        throw normalizePaymentProofStorageError(error);
    }
    if (!object?.body || !Buffer.isBuffer(object.body)) throw requestError('Payment proof is unavailable.', 503, 'PAYMENT_PROOF_UNAVAILABLE');
    if (object.body.length !== Number(proof.file_size)) throw requestError('Payment proof integrity check failed.', 503, 'PAYMENT_PROOF_INTEGRITY_FAILED');
    const checksum = crypto.createHash('sha256').update(object.body).digest('hex');
    if (checksum !== String(proof.sha256 || '').trim().toLowerCase()) throw requestError('Payment proof integrity check failed.', 503, 'PAYMENT_PROOF_INTEGRITY_FAILED');
    return { ...proof, content: object.body };
}

async function verifyProofForRequest(requestRow, tenantId) {
    if (!requestRow?.proof_id || !requestRow.proof_verified_at || !requestRow.storage_key) {
        throw requestError('Approval requires a verified payment proof.', 409, 'PAYMENT_PROOF_REQUIRED');
    }
    const storage = requireObjectStorageService();
    let object;
    try {
        object = await storage.getPrivateObject({ tenantId, key: requestRow.storage_key });
    } catch (error) {
        throw normalizePaymentProofStorageError(error);
    }
    if (!object?.body || object.body.length !== Number(requestRow.proof_file_size)) {
        throw requestError('Payment proof integrity could not be verified.', 503, 'PAYMENT_PROOF_INTEGRITY_FAILED');
    }
    const checksum = crypto.createHash('sha256').update(object.body).digest('hex');
    if (checksum !== String(requestRow.proof_sha256 || '').trim().toLowerCase()) {
        throw requestError('Payment proof integrity could not be verified.', 503, 'PAYMENT_PROOF_INTEGRITY_FAILED');
    }
}

function approvalPaymentNotes(row) {
    const method = text(row.payment_method_name || row.payment_method_code, 'external transfer', 120);
    const notes = text(row.notes, '', 300);
    return text(`Member portal payment method: ${method}${notes ? `; ${notes}` : ''}`, '', 500);
}

async function approveRequest(requestId, actorUserId, reviewNotes = '') {
    const tenantId = currentTenantId({ required: true });
    const actorId = positiveId(actorUserId, 'actor id');
    await ensureTables();
    await memberService.ensurePaymentTransactionsTable();
    const initial = await getRequestRow(requestId, tenantId);
    if (!initial) throw requestError('Subscription request was not found.', 404, 'MEMBER_SUBSCRIPTION_REQUEST_NOT_FOUND');
    if (initial.status !== 'pending') throw requestError('This request has already been reviewed.', 409, 'MEMBER_SUBSCRIPTION_REQUEST_ALREADY_REVIEWED');
    const proofPool = await getPool();
    const proofResult = await proofPool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('requestId', sql.BigInt, positiveId(requestId, 'request id'))
        .query(`SELECT TOP (1) p.id AS proof_id,p.storage_key,p.storage_verified_at,p.file_size,p.sha256
                FROM dbo.gym_member_subscription_payment_proofs AS p
                WHERE p.tenant_id=@tenantId AND p.request_id=@requestId;`);
    await verifyProofForRequest({ ...initial, ...proofResult.recordset[0] }, tenantId);
    let created;
    await withTransaction(async (transaction) => {
        const locked = await getRequestRow(requestId, tenantId, { transaction, lock: true });
        if (!locked) throw requestError('Subscription request was not found.', 404, 'MEMBER_SUBSCRIPTION_REQUEST_NOT_FOUND');
        if (locked.status !== 'pending') throw requestError('This request has already been reviewed.', 409, 'MEMBER_SUBSCRIPTION_REQUEST_ALREADY_REVIEWED');
        const proof = await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('requestId', sql.BigInt, positiveId(requestId, 'request id'))
            .query(`SELECT TOP (1) storage_key,storage_verified_at,file_size,sha256
                    FROM dbo.gym_member_subscription_payment_proofs WITH (UPDLOCK,HOLDLOCK)
                    WHERE tenant_id=@tenantId AND request_id=@requestId;`);
        const lockedProof = proof.recordset[0];
        if (!lockedProof?.storage_verified_at) throw requestError('Approval requires a verified payment proof.', 409, 'PAYMENT_PROOF_REQUIRED');
        const initialProof = proofResult.recordset[0];
        if (String(lockedProof.storage_key || '') !== String(initialProof?.storage_key || '')
            || Number(lockedProof.file_size) !== Number(initialProof?.file_size)
            || String(lockedProof.sha256 || '').toLowerCase() !== String(initialProof?.sha256 || '').toLowerCase()) {
            throw requestError('The payment proof changed during review. Please reload and verify it again.', 409, 'PAYMENT_PROOF_CHANGED');
        }
        const createdResult = await memberService.createMembershipFromApprovedRequest({
            transaction,
            memberId: locked.member_id,
            requestType: locked.request_type,
            membershipPlan: locked.membership_plan,
            membershipType: locked.membership_type,
            startDate: formatDateOnly(locked.start_date),
            endDate: formatDateOnly(locked.end_date),
            durationMode: locked.duration_mode,
            durationValue: Number(locked.duration_value),
            listPrice: Number(locked.list_price),
            discountAmount: Number(locked.discount_amount),
            amountDue: Number(locked.amount_due),
            paymentMethod: paymentLedgerMethod(locked.payment_method_code),
            paymentNotes: approvalPaymentNotes(locked),
            membershipNotes: locked.notes,
            sourceRequestId: locked.id
        });
        await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('requestId', sql.BigInt, positiveId(requestId, 'request id'))
            .input('actorId', sql.Int, actorId)
            .input('reviewNotes', sql.NVarChar(1000), text(reviewNotes, '', 1000) || null)
            .input('membershipId', sql.Int, createdResult.membershipId)
            .input('paymentId', sql.Int, createdResult.paymentId)
            .input('ledgerTransactionId', sql.Int, createdResult.ledgerTransactionId)
            .input('startDate', sql.Date, new Date(`${createdResult.startDate}T00:00:00.000Z`))
            .input('endDate', sql.Date, new Date(`${createdResult.endDate}T00:00:00.000Z`))
            .query(`UPDATE dbo.gym_member_subscription_requests
                    SET start_date=@startDate,end_date=@endDate,
                        status='approved',reviewed_by_user_id=@actorId,reviewed_at=SYSUTCDATETIME(),
                        review_notes=@reviewNotes,approved_membership_id=@membershipId,
                        created_payment_id=@paymentId,created_ledger_transaction_id=@ledgerTransactionId,
                        updated_at=SYSUTCDATETIME()
                    WHERE id=@requestId AND tenant_id=@tenantId AND status='pending';`);
        created = {
            membershipId: createdResult.membershipId,
            paymentId: createdResult.paymentId,
            ledgerTransactionId: createdResult.ledgerTransactionId
        };
        await saasService.recordAudit({
            tenantId,
            actorUserId: actorId,
            action: 'member_subscription_approved',
            entityType: 'member_subscription_request',
            entityId: positiveId(requestId, 'request id'),
            details: 'Member subscription request approved and membership/payment created atomically.',
            reason: text(reviewNotes, '', 1000),
            executor: transaction
        });
    });
    const result = await getRequestRow(requestId, tenantId);
    return { request: requestFromRow(result), created };
}

async function rejectRequest(requestId, actorUserId, reviewNotes = '') {
    const tenantId = currentTenantId({ required: true });
    const actorId = positiveId(actorUserId, 'actor id');
    const notes = text(reviewNotes, '', 1000);
    if (!notes) throw requestError('A reason is required when rejecting a member request.', 400, 'REVIEW_NOTES_REQUIRED');
    await ensureTables();
    await withTransaction(async (transaction) => {
        const locked = await getRequestRow(requestId, tenantId, { transaction, lock: true });
        if (!locked) throw requestError('Subscription request was not found.', 404, 'MEMBER_SUBSCRIPTION_REQUEST_NOT_FOUND');
        if (locked.status !== 'pending') throw requestError('This request has already been reviewed.', 409, 'MEMBER_SUBSCRIPTION_REQUEST_ALREADY_REVIEWED');
        await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('requestId', sql.BigInt, positiveId(requestId, 'request id'))
            .input('actorId', sql.Int, actorId)
            .input('reviewNotes', sql.NVarChar(1000), notes)
            .query(`UPDATE dbo.gym_member_subscription_requests
                    SET status='rejected',reviewed_by_user_id=@actorId,reviewed_at=SYSUTCDATETIME(),
                        review_notes=@reviewNotes,updated_at=SYSUTCDATETIME()
                    WHERE id=@requestId AND tenant_id=@tenantId AND status='pending';`);
        await saasService.recordAudit({
            tenantId,
            actorUserId: actorId,
            action: 'member_subscription_rejected',
            entityType: 'member_subscription_request',
            entityId: positiveId(requestId, 'request id'),
            details: 'Member subscription request rejected.',
            reason: notes,
            executor: transaction
        });
    });
    const result = await getRequestRow(requestId, tenantId);
    return { request: requestFromRow(result) };
}

module.exports = {
    MAX_PROOF_BYTES,
    REQUEST_SELECT,
    SUPPORTED_REQUEST_TYPES,
    approveRequest,
    configureObjectStorageService,
    createPortalRequest,
    getOwnerRequests,
    getPortalRequests,
    getRequestRow,
    getStoredProofFile,
    idempotencyKeyHash,
    normalizeRequestType,
    paymentLedgerMethod,
    rejectRequest,
    requestFromRow,
    uploadPortalProof
};
