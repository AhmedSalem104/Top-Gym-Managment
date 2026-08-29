'use strict';

const crypto = require('node:crypto');

const MAX_PRIVATE_OBJECT_BYTES = 25 * 1024 * 1024;
const OBJECT_KEY_PATTERN = /^tenants\/(\d+)\/private\/([a-z0-9][a-z0-9_-]{0,63})\/([A-Za-z0-9_-]{16,128})(?:\.([A-Za-z0-9]{1,12}))?$/;
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const MIME_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/i;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/i;

function storageError(message, statusCode = 400, code = 'OBJECT_STORAGE_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = statusCode < 500;
    error.code = code;
    return error;
}

function normalizeTenantId(value) {
    const tenantId = Number(value);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
        throw storageError('A valid tenant id is required.', 400, 'INVALID_STORAGE_TENANT');
    }
    return tenantId;
}

function normalizeCategory(value) {
    const category = String(value || '').trim().toLowerCase();
    if (!CATEGORY_PATTERN.test(category)) {
        throw storageError('The private object category is invalid.', 400, 'INVALID_STORAGE_CATEGORY');
    }
    return category;
}

function normalizeObjectName(value) {
    const name = String(value || '').trim();
    if (!name || name.length > 255 || /[\u0000-\u001F\u007F]/.test(name)) {
        throw storageError('The private object name is invalid.', 400, 'INVALID_STORAGE_OBJECT_NAME');
    }
    const segments = name.replaceAll('\\', '/').split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        throw storageError('The private object path is invalid.', 400, 'INVALID_STORAGE_OBJECT_PATH');
    }
    return segments[segments.length - 1];
}

function normalizeObjectId(value, idFactory = crypto.randomUUID) {
    const objectId = String(value || idFactory()).trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(objectId)) {
        throw storageError('The private object id is invalid.', 400, 'INVALID_STORAGE_OBJECT_ID');
    }
    return objectId;
}

function fileExtension(name) {
    const match = String(name || '').match(/\.([A-Za-z0-9]{1,12})$/);
    return match ? `.${match[1].toLowerCase()}` : '';
}

function buildPrivateObjectKey({ tenantId, category, objectName, objectId, idFactory } = {}) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedCategory = normalizeCategory(category);
    const normalizedName = normalizeObjectName(objectName);
    const normalizedObjectId = normalizeObjectId(objectId, idFactory);
    return `tenants/${normalizedTenantId}/private/${normalizedCategory}/${normalizedObjectId}${fileExtension(normalizedName)}`;
}

function assertPrivateObjectKey(tenantId, key) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const normalizedKey = String(key || '').trim();
    const match = normalizedKey.match(OBJECT_KEY_PATTERN);
    if (!match || Number(match[1]) !== normalizedTenantId) {
        throw storageError('The private object does not belong to this tenant.', 403, 'STORAGE_TENANT_KEY_MISMATCH');
    }
    return normalizedKey;
}

function normalizeMaxBytes(value) {
    const maxBytes = Number(value ?? MAX_PRIVATE_OBJECT_BYTES);
    if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_PRIVATE_OBJECT_BYTES) {
        throw storageError('The private object size limit is invalid.', 500, 'INVALID_STORAGE_SIZE_LIMIT');
    }
    return maxBytes;
}

function normalizeMimeType(value) {
    const mimeType = String(value || '').trim().toLowerCase();
    if (!MIME_PATTERN.test(mimeType)) {
        throw storageError('The private object MIME type is invalid.', 400, 'INVALID_STORAGE_MIME');
    }
    return mimeType;
}

function preparePrivateObject(input = {}, { maxBytes = MAX_PRIVATE_OBJECT_BYTES } = {}) {
    const tenantId = normalizeTenantId(input.tenantId);
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body || '');
    const limit = normalizeMaxBytes(maxBytes);
    if (!body.length || body.length > limit) {
        throw storageError('The private object size is outside the allowed limit.', 400, 'INVALID_STORAGE_SIZE');
    }
    const key = input.key
        ? assertPrivateObjectKey(tenantId, input.key)
        : buildPrivateObjectKey({
            tenantId,
            category: input.category,
            objectName: input.objectName,
            objectId: input.objectId,
            idFactory: input.idFactory
        });
    const checksum = input.checksum
        ? String(input.checksum).trim().toLowerCase()
        : crypto.createHash('sha256').update(body).digest('hex');
    if (!CHECKSUM_PATTERN.test(checksum)) {
        throw storageError('The private object checksum is invalid.', 400, 'INVALID_STORAGE_CHECKSUM');
    }
    return {
        tenantId,
        key,
        originalName: normalizeObjectName(input.objectName || 'object'),
        contentType: normalizeMimeType(input.contentType),
        size: body.length,
        checksum,
        body
    };
}

function assertAdapter(adapter, method) {
    if (!adapter || typeof adapter[method] !== 'function') {
        throw storageError('A private object storage provider is not configured.', 503, 'OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED');
    }
}

function validateReturnedObject(object, tenantId, key) {
    if (!object) return null;
    if (object.tenantId != null && Number(object.tenantId) !== tenantId) {
        throw storageError('The private object does not belong to this tenant.', 403, 'STORAGE_TENANT_KEY_MISMATCH');
    }
    if (object.key) assertPrivateObjectKey(tenantId, object.key);
    return object;
}

function createObjectStorageService({ adapter = null, maxBytes = MAX_PRIVATE_OBJECT_BYTES } = {}) {
    const service = {
        providerStatus: adapter ? 'configured' : 'not_configured',
        isConfigured: Boolean(adapter),
        maxBytes: normalizeMaxBytes(maxBytes),
        buildPrivateObjectKey,
        assertPrivateObjectKey,
        preparePrivateObject,
        async putPrivateObject(input = {}) {
            const object = preparePrivateObject(input, { maxBytes });
            assertAdapter(adapter, 'putPrivateObject');
            await adapter.putPrivateObject(object);
            return {
                tenantId: object.tenantId,
                key: object.key,
                originalName: object.originalName,
                contentType: object.contentType,
                size: object.size,
                checksum: object.checksum
            };
        },
        async getPrivateObject({ tenantId, key } = {}) {
            const normalizedTenantId = normalizeTenantId(tenantId);
            const normalizedKey = assertPrivateObjectKey(normalizedTenantId, key);
            assertAdapter(adapter, 'getPrivateObject');
            const object = await adapter.getPrivateObject({ tenantId: normalizedTenantId, key: normalizedKey });
            return validateReturnedObject(object, normalizedTenantId, normalizedKey);
        },
        async headPrivateObject({ tenantId, key } = {}) {
            const normalizedTenantId = normalizeTenantId(tenantId);
            const normalizedKey = assertPrivateObjectKey(normalizedTenantId, key);
            if (adapter && typeof adapter.headPrivateObject === 'function') {
                return validateReturnedObject(
                    await adapter.headPrivateObject({ tenantId: normalizedTenantId, key: normalizedKey }),
                    normalizedTenantId,
                    normalizedKey
                );
            }
            // Adapters that only expose GET remain compatible. The adapter
            // may omit the body from the returned metadata; verification code
            // only relies on key/size/checksum.
            assertAdapter(adapter, 'getPrivateObject');
            const object = await adapter.getPrivateObject({ tenantId: normalizedTenantId, key: normalizedKey });
            return validateReturnedObject(object, normalizedTenantId, normalizedKey);
        },
        async createSignedDownload({ tenantId, key, expiresInSeconds = 300 } = {}) {
            const normalizedTenantId = normalizeTenantId(tenantId);
            const normalizedKey = assertPrivateObjectKey(normalizedTenantId, key);
            assertAdapter(adapter, 'createSignedDownload');
            const expiry = Math.min(900, Math.max(60, Number(expiresInSeconds) || 300));
            const result = await adapter.createSignedDownload({
                tenantId: normalizedTenantId,
                key: normalizedKey,
                expiresInSeconds: expiry
            });
            if (!result || typeof result.url !== 'string' || !result.url) {
                throw storageError('The storage provider returned an invalid private download.', 503, 'INVALID_SIGNED_DOWNLOAD');
            }
            return { url: result.url, expiresInSeconds: expiry, expiresAt: result.expiresAt || null };
        },
        async deletePrivateObject({ tenantId, key } = {}) {
            const normalizedTenantId = normalizeTenantId(tenantId);
            const normalizedKey = assertPrivateObjectKey(normalizedTenantId, key);
            assertAdapter(adapter, 'deletePrivateObject');
            await adapter.deletePrivateObject({ tenantId: normalizedTenantId, key: normalizedKey });
            return true;
        },
        getPublicUrl() {
            throw storageError('Private objects do not expose public URLs.', 400, 'PRIVATE_OBJECT_PUBLIC_URL_FORBIDDEN');
        }
    };
    return service;
}

module.exports = {
    MAX_PRIVATE_OBJECT_BYTES,
    assertPrivateObjectKey,
    buildPrivateObjectKey,
    createObjectStorageService,
    normalizeCategory,
    normalizeObjectName,
    normalizeTenantId,
    preparePrivateObject
};
