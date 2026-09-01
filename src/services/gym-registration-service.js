'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { config } = require('../config/env');
const commercialSchema = require('./commercial-schema');
const { TENANT_TYPES, resolveTenantType } = require('../tenancy/tenant-types');

const MAX_PAGE_SIZE = 100;
const REGISTRATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const STATUS_VALUES = new Set(['pending', 'approved', 'rejected', 'cancelled']);

function registrationError(message, statusCode = 400, code = 'GYM_REGISTRATION_INVALID', field = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = statusCode < 500 || statusCode === 503;
    error.code = code;
    if (field) error.field = field;
    return error;
}

function text(value, fallback = '', maxLength = 1000) {
    return String(value ?? fallback)
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim()
        .slice(0, maxLength);
}

function positiveId(value, field = 'id') {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw registrationError(`${field} is invalid.`, 400, 'INVALID_GYM_REGISTRATION_ID', field);
    return parsed;
}

function requireSecret() {
    const secret = String(config.publicRegistrationSecret || '').trim();
    if (secret.length < 32) throw registrationError('Public registration is not configured.', 503, 'GYM_REGISTRATION_NOT_CONFIGURED');
    return secret;
}

function normalizeIdempotencyKey(value) {
    const key = text(value, '', 128);
    if (!IDEMPOTENCY_PATTERN.test(key)) throw registrationError('A valid idempotency key is required.', 400, 'REGISTRATION_IDEMPOTENCY_REQUIRED');
    return key;
}

function hashCapability(value, purpose) {
    return crypto.createHmac('sha256', requireSecret()).update(`${purpose}:${String(value)}`).digest('hex');
}

function accessTokenForIdempotency(key) {
    return crypto.createHmac('sha256', requireSecret()).update(`registration-access:${key}`).digest('base64url');
}

function normalizeAccessToken(value) {
    const token = text(value, '', 128);
    if (!REGISTRATION_TOKEN_PATTERN.test(token)) throw registrationError('A valid registration access token is required.', 401, 'REGISTRATION_ACCESS_REQUIRED');
    return token;
}

function normalizeWhatsapp(value) {
    const normalized = text(value, '', 40).replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{7,20}$/.test(normalized)) throw registrationError('Enter a valid WhatsApp number.', 400, 'INVALID_REGISTRATION_WHATSAPP', 'whatsapp');
    return normalized;
}

function normalizeStatus(value) {
    const status = text(value, '', 20).toLowerCase();
    return status && STATUS_VALUES.has(status) ? status : '';
}

function normalizePage(value, fallback = 1) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(100000, parsed) : fallback;
}

function normalizePageSize(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(MAX_PAGE_SIZE, parsed) : 25;
}

function addMonths(date, months) {
    const result = new Date(date.getTime());
    const originalDay = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + Number(months));
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(originalDay, lastDay));
    return result;
}

function generateTenantSlug(gymName) {
    const base = text(gymName, 'gym', 60)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'gym';
    return `gym-${base}-${crypto.randomBytes(4).toString('hex')}`.slice(0, 80);
}

function registrationTypeFromRoute(value = TENANT_TYPES.GYM) {
    try {
        return resolveTenantType(value);
    } catch (_) {
        throw registrationError('The registration customer type is not supported.', 400, 'REGISTRATION_TENANT_TYPE_INVALID');
    }
}

function generateTemporaryPassword() {
    return `Lf-${crypto.randomBytes(18).toString('base64url')}`;
}

function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function requestFromRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        status: String(row.status),
        tenantType: registrationTypeFromRoute(row.tenant_type || TENANT_TYPES.GYM),
        gymName: row.gym_name,
        ownerName: row.owner_name,
        whatsapp: row.whatsapp,
        email: row.email || null,
        city: row.city || null,
        plan: {
            id: Number(row.plan_id),
            code: row.plan_code_snapshot,
            name: row.plan_name_snapshot
        },
        term: {
            code: row.term_code_snapshot,
            durationMonths: Number(row.duration_months_snapshot)
        },
        pricing: {
            price: Number(row.price_snapshot || 0),
            discountAmount: Number(row.discount_amount_snapshot || 0),
            amountDue: Number(row.amount_due_snapshot || 0),
            currency: row.currency_snapshot || 'EGP'
        },
        paymentMethod: row.payment_method_code_snapshot ? {
            code: row.payment_method_code_snapshot,
            name: row.payment_method_name_snapshot || null
        } : null,
        notes: row.notes || '',
        reviewNotes: row.review_notes || '',
        reviewedByUserId: row.reviewed_by_user_id == null ? null : Number(row.reviewed_by_user_id),
        reviewedAt: row.reviewed_at || null,
        createdTenantId: row.created_tenant_id == null ? null : Number(row.created_tenant_id),
        createdOwnerUserId: row.created_owner_user_id == null ? null : Number(row.created_owner_user_id),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        proof: row.proof_id ? {
            id: Number(row.proof_id),
            fileName: row.proof_file_name,
            mimeType: row.proof_mime_type,
            fileSize: Number(row.proof_file_size || 0),
            uploadedAt: row.proof_uploaded_at || null,
            verified: Boolean(row.proof_storage_verified_at),
            verifiedAt: row.proof_storage_verified_at || null
        } : null
    };
}

// Public registration responses are capability-token protected, but the token
// must not turn an internal request row into a public admin record. Keep the
// projection intentionally small: callers need status and their submitted
// commercial summary, never reviewer/created-user references or storage keys.
function publicRequestFromRow(row) {
    const request = requestFromRow(row);
    if (!request) return null;
    return {
        id: request.id,
        status: request.status,
        tenantType: request.tenantType,
        gymName: request.gymName,
        ownerName: request.ownerName,
        plan: request.plan,
        term: request.term,
        pricing: request.pricing,
        paymentMethod: request.paymentMethod,
        notes: request.notes,
        reviewNotes: request.status === 'rejected' ? request.reviewNotes : '',
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        proof: request.proof ? {
            fileName: request.proof.fileName,
            mimeType: request.proof.mimeType,
            fileSize: request.proof.fileSize,
            uploadedAt: request.proof.uploadedAt,
            verified: request.proof.verified,
            verifiedAt: request.proof.verifiedAt
        } : null
    };
}

const REQUEST_SELECT = `
    SELECT r.id,r.gym_name,r.tenant_type,r.owner_name,r.whatsapp,r.email,r.city,
           r.plan_id,r.plan_code_snapshot,r.plan_name_snapshot,r.term_code_snapshot,
           r.duration_months_snapshot,r.price_snapshot,r.discount_amount_snapshot,
           r.amount_due_snapshot,r.currency_snapshot,r.payment_method_code_snapshot,
           r.payment_method_name_snapshot,r.status,r.notes,r.review_notes,
           r.reviewed_by_user_id,r.reviewed_at,r.created_tenant_id,r.created_owner_user_id,
           r.created_at,r.updated_at,
           proof.id AS proof_id,proof.file_name AS proof_file_name,proof.mime_type AS proof_mime_type,
           proof.file_size AS proof_file_size,proof.uploaded_at AS proof_uploaded_at,
           proof.storage_verified_at AS proof_storage_verified_at,proof.storage_key,proof.sha256 AS proof_sha256
    FROM dbo.saas_gym_registration_requests AS r
    LEFT JOIN dbo.saas_gym_registration_payment_proofs AS proof ON proof.request_id=r.id
`;

async function ensureTables({ readOnly = false } = {}) {
    await commercialSchema.ensureCommercialTables({ readOnly });
}

async function getRequestRow(requestId, { accessToken = null, transaction = null, lock = false } = {}) {
    const id = positiveId(requestId, 'registration request id');
    const select = lock
        ? REQUEST_SELECT.replace('FROM dbo.saas_gym_registration_requests AS r', 'FROM dbo.saas_gym_registration_requests AS r WITH (UPDLOCK,HOLDLOCK)')
        : REQUEST_SELECT;
    const executor = transaction || await getPool();
    const request = executor.request().input('requestId', sql.BigInt, id);
    let predicate = 'r.id=@requestId';
    if (accessToken != null) {
        request.input('publicTokenHash', sql.Char(64), hashCapability(normalizeAccessToken(accessToken), 'registration-token'));
        predicate += ' AND r.public_token_hash=@publicTokenHash';
    }
    return (await request.query(`${select} WHERE ${predicate};`)).recordset[0] || null;
}

async function getCatalog(commercialService, tenantType = TENANT_TYPES.GYM) {
    const normalizedTenantType = registrationTypeFromRoute(tenantType);
    const [plans, paymentMethods] = await Promise.all([
        commercialService.getCommercialPlanCatalog({ readOnly: true, tenantType: normalizedTenantType }),
        commercialService.listPlatformPaymentMethods({ activeOnly: true, readOnly: true })
    ]);
    return { plans, paymentMethods, tenantType: normalizedTenantType };
}

function normalizeSelection(catalog, body = {}) {
    const planCode = text(body.planCode || body.plan, '', 40).toLowerCase();
    const termCode = text(body.termCode || body.term, '', 20).toLowerCase();
    const plan = catalog.plans.find((item) => item.code === planCode && item.isActive);
    if (!plan) throw registrationError('The selected plan is not available.', 409, 'REGISTRATION_PLAN_UNAVAILABLE', 'planCode');
    const term = plan.terms.find((item) => item.code === termCode && item.isActive);
    if (!term) throw registrationError('The selected subscription term is not available.', 409, 'REGISTRATION_TERM_UNAVAILABLE', 'termCode');
    const paymentMethodCode = text(body.paymentMethodCode || body.paymentMethod, '', 60).toLowerCase();
    const paymentMethod = catalog.paymentMethods.find((item) => item.methodCode === paymentMethodCode);
    if (!paymentMethod) throw registrationError('Select an active Logic Fit payment method.', 409, 'REGISTRATION_PAYMENT_METHOD_UNAVAILABLE', 'paymentMethodCode');
    const price = roundMoney(term.price);
    const discountAmount = roundMoney(term.discountAmount);
    return {
        plan,
        term,
        paymentMethod,
        price,
        discountAmount,
        amountDue: roundMoney(Math.max(0, price - discountAmount))
    };
}

function requireStorage(storage) {
    if (!storage?.isConfigured) throw registrationError('Private storage is not configured.', 503, 'PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED');
    return storage;
}

async function verifyStoredProof(storage, row) {
    if (!row?.proof_id || !row.proof_storage_verified_at || !row.storage_key) {
        throw registrationError('A verified payment proof is required.', 409, 'REGISTRATION_PAYMENT_PROOF_REQUIRED');
    }
    const object = await storage.getPrivatePlatformObject({ key: row.storage_key });
    if (!object?.body || !Buffer.isBuffer(object.body)) throw registrationError('The payment proof is unavailable.', 503, 'REGISTRATION_PAYMENT_PROOF_UNAVAILABLE');
    const expectedSize = row.proof_file_size ?? row.file_size;
    const expectedChecksum = row.proof_sha256 ?? row.sha256;
    if (object.body.length !== Number(expectedSize)) throw registrationError('The payment proof integrity check failed.', 503, 'REGISTRATION_PAYMENT_PROOF_INTEGRITY_FAILED');
    const checksum = crypto.createHash('sha256').update(object.body).digest('hex');
    if (checksum !== String(expectedChecksum || '').trim().toLowerCase()) throw registrationError('The payment proof integrity check failed.', 503, 'REGISTRATION_PAYMENT_PROOF_INTEGRITY_FAILED');
    return { size: object.body.length, checksum };
}

function createGymRegistrationService({ commercialService, saasService, authService, objectStorageService } = {}) {
    if (!commercialService || !saasService || !authService) throw new Error('Gym registration service dependencies are required.');

    return {
        async catalog(tenantType = TENANT_TYPES.GYM) {
            await ensureTables({ readOnly: true });
            return getCatalog(commercialService, tenantType);
        },

        async createRequest(body = {}, idempotencyKey, tenantType = TENANT_TYPES.GYM) {
            await ensureTables();
            const normalizedTenantType = registrationTypeFromRoute(tenantType);
            const key = normalizeIdempotencyKey(idempotencyKey);
            const idempotencyKeyHash = hashCapability(key, 'registration-idempotency');
            const accessToken = accessTokenForIdempotency(key);
            const publicTokenHash = hashCapability(accessToken, 'registration-token');
            const gymName = text(body.gymName || body.name, '', 160);
            if (gymName.length < 2) throw registrationError('Gym name is required.', 400, 'INVALID_REGISTRATION_GYM_NAME', 'gymName');
            const ownerName = authService.validateName(body.ownerName || body.ownerFullName, 'ownerName');
            const whatsapp = normalizeWhatsapp(body.whatsapp || body.phone);
            const email = authService.validateEmail(body.email || body.ownerEmail, 'email');
            const city = text(body.city, '', 120) || null;
            const catalog = await getCatalog(commercialService, normalizedTenantType);
            const selection = normalizeSelection(catalog, body);
            const notes = text(body.notes, '', 2000) || null;
            let requestId = null;
            let reused = false;
            const insert = async (transaction) => {
                const existing = await transaction.request()
                    .input('idempotencyKeyHash', sql.Char(64), idempotencyKeyHash)
                    .query('SELECT TOP (1) id,public_token_hash FROM dbo.saas_gym_registration_requests WITH (UPDLOCK,HOLDLOCK) WHERE idempotency_key_hash=@idempotencyKeyHash;');
                if (existing.recordset[0]) {
                    if (String(existing.recordset[0].public_token_hash || '') !== publicTokenHash) {
                        throw registrationError('This registration request already exists.', 409, 'REGISTRATION_REQUEST_ALREADY_EXISTS');
                    }
                    requestId = Number(existing.recordset[0].id);
                    reused = true;
                    return;
                }
                const result = await transaction.request()
                    .input('gymName', sql.NVarChar(160), gymName)
                    .input('tenantType', sql.VarChar(32), normalizedTenantType)
                    .input('ownerName', sql.NVarChar(120), ownerName)
                    .input('whatsapp', sql.NVarChar(40), whatsapp)
                    .input('email', sql.NVarChar(254), email)
                    .input('city', sql.NVarChar(120), city)
                    .input('planId', sql.Int, selection.plan.id)
                    .input('planCode', sql.VarChar(40), selection.plan.code)
                    .input('planName', sql.NVarChar(120), selection.plan.name)
                    .input('termCode', sql.VarChar(20), selection.term.code)
                    .input('durationMonths', sql.Int, selection.term.durationMonths)
                    .input('price', sql.Decimal(12, 2), selection.price)
                    .input('discountAmount', sql.Decimal(12, 2), selection.discountAmount)
                    .input('amountDue', sql.Decimal(12, 2), selection.amountDue)
                    .input('currency', sql.Char(3), selection.term.currency)
                    .input('paymentMethodCode', sql.VarChar(60), selection.paymentMethod.methodCode)
                    .input('paymentMethodName', sql.NVarChar(120), selection.paymentMethod.displayName)
                    .input('notes', sql.NVarChar(2000), notes)
                    .input('idempotencyKeyHash', sql.Char(64), idempotencyKeyHash)
                    .input('publicTokenHash', sql.Char(64), publicTokenHash)
                    .query(`INSERT INTO dbo.saas_gym_registration_requests
                            (gym_name,tenant_type,owner_name,whatsapp,email,city,plan_id,plan_code_snapshot,plan_name_snapshot,
                             term_code_snapshot,duration_months_snapshot,price_snapshot,discount_amount_snapshot,
                             amount_due_snapshot,currency_snapshot,payment_method_code_snapshot,payment_method_name_snapshot,
                             notes,idempotency_key_hash,public_token_hash)
                            OUTPUT INSERTED.id
                            VALUES (@gymName,@tenantType,@ownerName,@whatsapp,@email,@city,@planId,@planCode,@planName,
                                    @termCode,@durationMonths,@price,@discountAmount,@amountDue,@currency,
                                    @paymentMethodCode,@paymentMethodName,@notes,@idempotencyKeyHash,@publicTokenHash);`);
                requestId = Number(result.recordset[0]?.id);
                await saasService.recordAudit({
                    tenantId: null,
                    actorUserId: null,
                    action: 'gym_registration_requested',
                    entityType: 'gym_registration_request',
                    entityId: requestId,
                    details: normalizedTenantType === TENANT_TYPES.GYM
                        ? 'A public gym registration request was submitted.'
                        : 'A public independent trainer registration request was submitted.',
                    executor: transaction
                });
            };
            try {
                await withTransaction(insert);
            } catch (error) {
                if (!saasService.isDuplicateSqlError?.(error)) throw error;
                const existing = await getPool();
                const result = await existing.request()
                    .input('idempotencyKeyHash', sql.Char(64), idempotencyKeyHash)
                    .query('SELECT TOP (1) id,public_token_hash FROM dbo.saas_gym_registration_requests WHERE idempotency_key_hash=@idempotencyKeyHash;');
                const row = result.recordset[0];
                if (!row || String(row.public_token_hash || '') !== publicTokenHash) throw registrationError('This registration request already exists.', 409, 'REGISTRATION_REQUEST_ALREADY_EXISTS');
                requestId = Number(row.id);
                reused = true;
            }
            const row = await getRequestRow(requestId, { accessToken });
            if (!row) throw registrationError('The registration request could not be loaded.', 503, 'REGISTRATION_REQUEST_NOT_AVAILABLE');
            return { request: publicRequestFromRow(row), accessToken, idempotent: reused };
        },

        async uploadProof(requestId, accessToken, { buffer, mimeType, fileName } = {}) {
            await ensureTables();
            const token = normalizeAccessToken(accessToken);
            const before = await getRequestRow(requestId, { accessToken: token });
            if (!before) throw registrationError('Registration request was not found.', 404, 'REGISTRATION_REQUEST_NOT_FOUND');
            if (before.status !== 'pending') throw registrationError('This registration request has already been reviewed.', 409, 'REGISTRATION_REQUEST_LOCKED');
            const proof = saasService.validateProof({ buffer, mimeType, fileName });
            const storage = requireStorage(objectStorageService);
            let storedObject = null;
            let previousKey = null;
            try {
                storedObject = await storage.putPrivatePlatformObject({
                    category: 'registration-payment-proofs',
                    objectName: proof.fileName,
                    contentType: proof.mimeType,
                    body: proof.buffer,
                    checksum: proof.sha256
                });
                if (typeof storage.verifyPrivatePlatformObject !== 'function') throw registrationError('Private storage verification is unavailable.', 503, 'PRIVATE_STORAGE_VERIFICATION_UNAVAILABLE');
                await storage.verifyPrivatePlatformObject({ key: storedObject.key, expectedSize: proof.buffer.length, expectedChecksum: proof.sha256 });
                await withTransaction(async (transaction) => {
                    const locked = await getRequestRow(requestId, { accessToken: token, transaction, lock: true });
                    if (!locked) throw registrationError('Registration request was not found.', 404, 'REGISTRATION_REQUEST_NOT_FOUND');
                    if (locked.status !== 'pending') throw registrationError('This registration request has already been reviewed.', 409, 'REGISTRATION_REQUEST_LOCKED');
                    previousKey = locked.storage_key || null;
                    await transaction.request()
                        .input('requestId', sql.BigInt, positiveId(requestId, 'registration request id'))
                        .input('fileName', sql.NVarChar(255), proof.fileName)
                        .input('mimeType', sql.VarChar(80), proof.mimeType)
                        .input('fileSize', sql.Int, proof.buffer.length)
                        .input('sha256', sql.Char(64), proof.sha256)
                        .input('storageKey', sql.NVarChar(512), storedObject.key)
                        .input('storageProvider', sql.VarChar(40), String(storage.provider || storage.providerStatus || 'private').slice(0, 40))
                        .query(`UPDATE dbo.saas_gym_registration_payment_proofs
                                SET file_name=@fileName,mime_type=@mimeType,file_size=@fileSize,sha256=@sha256,
                                    storage_key=@storageKey,storage_provider=@storageProvider,storage_verified_at=SYSUTCDATETIME(),uploaded_at=SYSUTCDATETIME()
                                WHERE request_id=@requestId;
                                IF @@ROWCOUNT=0
                                    INSERT INTO dbo.saas_gym_registration_payment_proofs
                                        (request_id,file_name,mime_type,file_size,sha256,storage_key,storage_provider,storage_verified_at)
                                    VALUES (@requestId,@fileName,@mimeType,@fileSize,@sha256,@storageKey,@storageProvider,SYSUTCDATETIME());`);
                    await saasService.recordAudit({
                        tenantId: null,
                        actorUserId: null,
                        action: 'gym_registration_payment_proof_uploaded',
                        entityType: 'gym_registration_request',
                        entityId: positiveId(requestId, 'registration request id'),
                        details: 'A registration payment proof was uploaded and verified.',
                        executor: transaction
                    });
                });
                if (previousKey && previousKey !== storedObject.key) await storage.deletePrivatePlatformObject({ key: previousKey }).catch(() => {});
            } catch (error) {
                if (storedObject?.key) await storage.deletePrivatePlatformObject({ key: storedObject.key }).catch(() => {});
                throw error;
            }
            const row = await getRequestRow(requestId, { accessToken: token });
            return { request: publicRequestFromRow(row) };
        },

        async getPublicStatus(requestId, accessToken) {
            await ensureTables({ readOnly: true });
            const row = await getRequestRow(requestId, { accessToken: normalizeAccessToken(accessToken) });
            if (!row) throw registrationError('Registration request was not found.', 404, 'REGISTRATION_REQUEST_NOT_FOUND');
            return { request: publicRequestFromRow(row) };
        },

        async listAdminRequests({ status = '', page = 1, pageSize = 25 } = {}) {
            await ensureTables({ readOnly: true });
            const normalizedStatus = normalizeStatus(status);
            if (status && !normalizedStatus) throw registrationError('Registration status is invalid.', 400, 'INVALID_REGISTRATION_STATUS');
            const currentPage = normalizePage(page);
            const currentPageSize = normalizePageSize(pageSize);
            const offset = (currentPage - 1) * currentPageSize;
            const pool = await getPool();
            const result = await pool.request()
                .input('status', sql.VarChar(20), normalizedStatus)
                .input('offset', sql.Int, offset)
                .input('pageSize', sql.Int, currentPageSize)
                .query(`${REQUEST_SELECT}
                    WHERE (@status='' OR r.status=@status)
                    ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.created_at DESC,r.id DESC
                    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
            const requests = result.recordset.map(requestFromRow);
            const count = await pool.request()
                .input('status', sql.VarChar(20), normalizedStatus)
                .query("SELECT COUNT_BIG(*) AS total, (SELECT COUNT_BIG(*) FROM dbo.saas_gym_registration_requests WHERE status='pending') AS pending_count FROM dbo.saas_gym_registration_requests WHERE (@status='' OR status=@status);");
            const total = Number(count.recordset[0]?.total || 0);
            const pendingCount = Number(count.recordset[0]?.pending_count || 0);
            return { requests, pendingCount, pagination: { page: currentPage, pageSize: currentPageSize, total, pages: Math.max(1, Math.ceil(total / currentPageSize)) } };
        },

        async getAdminProofFile(proofId) {
            await ensureTables({ readOnly: true });
            const id = positiveId(proofId, 'registration proof id');
            const pool = await getPool();
            const result = await pool.request()
                .input('proofId', sql.BigInt, id)
                .query(`SELECT TOP (1) p.id,p.file_name,p.mime_type,p.file_size,p.sha256,p.storage_key,p.storage_verified_at
                        FROM dbo.saas_gym_registration_payment_proofs AS p
                        INNER JOIN dbo.saas_gym_registration_requests AS r ON r.id=p.request_id
                        WHERE p.id=@proofId;`);
            const row = result.recordset[0];
            if (!row) return null;
            if (!row.storage_verified_at || !row.storage_key) throw registrationError('The payment proof is not verified.', 409, 'REGISTRATION_PAYMENT_PROOF_REQUIRED');
            const storage = requireStorage(objectStorageService);
            const object = await storage.getPrivatePlatformObject({ key: row.storage_key });
            if (!object?.body || object.body.length !== Number(row.file_size)) throw registrationError('The payment proof is unavailable.', 503, 'REGISTRATION_PAYMENT_PROOF_UNAVAILABLE');
            const checksum = crypto.createHash('sha256').update(object.body).digest('hex');
            if (checksum !== String(row.sha256 || '').trim().toLowerCase()) throw registrationError('The payment proof integrity check failed.', 503, 'REGISTRATION_PAYMENT_PROOF_INTEGRITY_FAILED');
            return { ...row, content: object.body };
        },

        async approve(requestId, actorUserId, reviewNotes = '') {
            await ensureTables();
            await authService.ensureAuthReady();
            const id = positiveId(requestId, 'registration request id');
            const actorId = positiveId(actorUserId, 'actor id');
            const storage = requireStorage(objectStorageService);
            const initial = await getRequestRow(id);
            if (!initial) throw registrationError('Registration request was not found.', 404, 'REGISTRATION_REQUEST_NOT_FOUND');
            if (initial.status !== 'pending') throw registrationError('This registration request has already been reviewed.', 409, 'REGISTRATION_REQUEST_ALREADY_REVIEWED');
            const initialWithProof = await getPool();
            const proofResult = await initialWithProof.request()
                .input('requestId', sql.BigInt, id)
                .query(`SELECT TOP (1) p.id AS proof_id,p.storage_key,p.storage_verified_at,p.file_size,p.sha256 AS proof_sha256
                        FROM dbo.saas_gym_registration_payment_proofs AS p WHERE p.request_id=@requestId;`);
            const initialProof = proofResult.recordset[0];
            if (!initialProof?.storage_verified_at) throw registrationError('Approval requires a verified payment proof.', 409, 'REGISTRATION_PAYMENT_PROOF_REQUIRED');
            await verifyStoredProof(storage, { ...initial, ...initialProof });
            const plan = (await saasService.getPlans({ includeInactive: true })).find((item) => Number(item.id) === Number(initial.plan_id));
            if (!plan) throw registrationError('The selected plan is no longer available for provisioning.', 409, 'REGISTRATION_PLAN_UNAVAILABLE');
            const temporaryPassword = generateTemporaryPassword();
            const passwordHash = await authService.hashPassword(temporaryPassword);
            const startsAt = new Date();
            const expiresAt = addMonths(startsAt, Number(initial.duration_months_snapshot));
            const normalizedTenantType = registrationTypeFromRoute(initial.tenant_type || TENANT_TYPES.GYM);
            const slug = generateTenantSlug(initial.gym_name);
            const notes = text(reviewNotes, '', 2000) || null;
            let provisioned;
            await withTransaction(async (transaction) => {
                const locked = await getRequestRow(id, { transaction, lock: true });
                if (!locked) throw registrationError('Registration request was not found.', 404, 'REGISTRATION_REQUEST_NOT_FOUND');
                if (locked.status !== 'pending') throw registrationError('This registration request has already been reviewed.', 409, 'REGISTRATION_REQUEST_ALREADY_REVIEWED');
                const proof = await transaction.request()
                    .input('requestId', sql.BigInt, id)
                    .query(`SELECT TOP (1) storage_key,storage_verified_at,file_size,sha256
                            FROM dbo.saas_gym_registration_payment_proofs WITH (UPDLOCK,HOLDLOCK)
                            WHERE request_id=@requestId;`);
                const lockedProof = proof.recordset[0];
                if (!lockedProof?.storage_verified_at) throw registrationError('Approval requires a verified payment proof.', 409, 'REGISTRATION_PAYMENT_PROOF_REQUIRED');
                if (String(lockedProof.storage_key) !== String(initialProof.storage_key)
                    || Number(lockedProof.file_size) !== Number(initialProof.file_size)
                    || String(lockedProof.sha256 || '').toLowerCase() !== String(initialProof.proof_sha256 || '').toLowerCase()) {
                    throw registrationError('The payment proof changed during review. Please reload and verify it again.', 409, 'REGISTRATION_PAYMENT_PROOF_CHANGED');
                }
                provisioned = await saasService.provisionTenantWithOwner({
                    transaction,
                    authService,
                    actorUserId: actorId,
                    body: {
                        name: locked.gym_name,
                        slug,
                        ownerName: locked.owner_name,
                        ownerEmail: locked.email
                    },
                    tenantType: normalizedTenantType,
                    plan,
                    ownerPasswordHash: passwordHash,
                    ownerPasswordIsTemporary: true,
                    tenantStatus: 'active',
                    subscriptionStatus: 'active',
                    subscriptionSource: 'manual',
                    startsAt,
                    expiresAt,
                    snapshotOverride: {
                        billingPeriod: locked.term_code_snapshot,
                        price: Number(locked.price_snapshot),
                        currency: locked.currency_snapshot,
                        features: plan.features
                    },
                    subscriptionNotes: `Self-service registration request #${id}`,
                    auditAction: normalizedTenantType === TENANT_TYPES.GYM
                        ? 'gym_registration_provisioned'
                        : 'trainer_registration_provisioned',
                    auditDetails: normalizedTenantType === TENANT_TYPES.GYM
                        ? 'Tenant provisioned after PlatformAdmin approved a self-service registration request.'
                        : 'Independent Trainer tenant provisioned after PlatformAdmin approved a self-service registration request.'
                });
                await transaction.request()
                    .input('requestId', sql.BigInt, id)
                    .input('actorId', sql.Int, actorId)
                    .input('reviewNotes', sql.NVarChar(2000), notes)
                    .input('tenantId', sql.Int, provisioned.tenant.id)
                    .input('ownerId', sql.Int, provisioned.owner.id)
                    .query(`UPDATE dbo.saas_gym_registration_requests
                            SET status='approved',reviewed_by_user_id=@actorId,reviewed_at=SYSUTCDATETIME(),review_notes=@reviewNotes,
                                created_tenant_id=@tenantId,created_owner_user_id=@ownerId,updated_at=SYSUTCDATETIME()
                            WHERE id=@requestId AND status='pending';`);
                await saasService.recordAudit({
                    tenantId: provisioned.tenant.id,
                    actorUserId: actorId,
                    action: normalizedTenantType === TENANT_TYPES.GYM
                        ? 'gym_registration_approved'
                        : 'trainer_registration_approved',
                    entityType: 'gym_registration_request',
                    entityId: id,
                    details: 'Self-service registration approved and tenant provisioned.',
                    reason: notes || '',
                    executor: transaction
                });
            });
            const row = await getRequestRow(id);
            return {
                request: requestFromRow(row),
                tenant: provisioned.tenant,
                owner: provisioned.owner,
                subscription: provisioned.subscription,
                oneTimeCredentials: {
                    username: provisioned.owner.email,
                    temporaryPassword,
                    loginUrl: config.publicAppUrl || null,
                    mustChangePassword: true
                }
            };
        },

        async reject(requestId, actorUserId, reviewNotes = '') {
            await ensureTables();
            const id = positiveId(requestId, 'registration request id');
            const actorId = positiveId(actorUserId, 'actor id');
            const notes = text(reviewNotes, '', 2000);
            if (!notes) throw registrationError('A rejection reason is required.', 400, 'REGISTRATION_REVIEW_NOTES_REQUIRED');
            await withTransaction(async (transaction) => {
                const locked = await getRequestRow(id, { transaction, lock: true });
                if (!locked) throw registrationError('Registration request was not found.', 404, 'REGISTRATION_REQUEST_NOT_FOUND');
                if (locked.status !== 'pending') throw registrationError('This registration request has already been reviewed.', 409, 'REGISTRATION_REQUEST_ALREADY_REVIEWED');
                await transaction.request()
                    .input('requestId', sql.BigInt, id)
                    .input('actorId', sql.Int, actorId)
                    .input('reviewNotes', sql.NVarChar(2000), notes)
                    .query("UPDATE dbo.saas_gym_registration_requests SET status='rejected',reviewed_by_user_id=@actorId,reviewed_at=SYSUTCDATETIME(),review_notes=@reviewNotes,updated_at=SYSUTCDATETIME() WHERE id=@requestId AND status='pending';");
                await saasService.recordAudit({
                    tenantId: null,
                    actorUserId: actorId,
                    action: 'gym_registration_rejected',
                    entityType: 'gym_registration_request',
                    entityId: id,
                    details: 'Self-service registration request rejected.',
                    reason: notes,
                    executor: transaction
                });
            });
            const row = await getRequestRow(id);
            return { request: requestFromRow(row) };
        }
    };
}

module.exports = {
    IDEMPOTENCY_PATTERN,
    REGISTRATION_TOKEN_PATTERN,
    accessTokenForIdempotency,
    addMonths,
    createGymRegistrationService,
    generateTemporaryPassword,
    generateTenantSlug,
    normalizeIdempotencyKey,
    normalizeWhatsapp,
    publicRequestFromRow,
    requestFromRow
};
