'use strict';

const crypto = require('node:crypto');

const PRIVATE_KEY_PATTERN = /^(?:tenants\/[1-9]\d*\/private\/[a-z0-9][a-z0-9_-]{0,63}\/[A-Za-z0-9_-]{16,128}(?:\.[A-Za-z0-9]{1,12})?|platform\/private\/[a-z0-9][a-z0-9_-]{0,63}\/[A-Za-z0-9_-]{16,128}(?:\.[A-Za-z0-9]{1,12})?)$/;
const BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{1,61}[a-z0-9])?$/;
const REGION_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 120_000;

function adapterError(message, statusCode = 503, code = 'OBJECT_STORAGE_PROVIDER_UNAVAILABLE') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = false;
    error.code = code;
    return error;
}

function requiredText(name, value, maximum = 512) {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized.length > maximum || /[\u0000-\u001F\u007F]/.test(normalized)) {
        throw adapterError(`The ${name} storage setting is invalid.`, 500, 'OBJECT_STORAGE_CONFIGURATION_INVALID');
    }
    return normalized;
}

function normalizeEndpoint(value) {
    let endpoint;
    try {
        endpoint = new URL(requiredText('endpoint', value, 2048));
    } catch (_) {
        throw adapterError('The private storage endpoint is invalid.', 500, 'OBJECT_STORAGE_CONFIGURATION_INVALID');
    }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
        throw adapterError('The private storage endpoint must be an HTTPS URL without credentials or query parameters.', 500, 'OBJECT_STORAGE_CONFIGURATION_INVALID');
    }
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '');
    return endpoint;
}

function normalizeBucket(value) {
    const bucket = requiredText('bucket', value, 63).toLowerCase();
    if (!BUCKET_PATTERN.test(bucket) || bucket.length < 3 || bucket.length > 63) {
        throw adapterError('The private storage bucket is invalid.', 500, 'OBJECT_STORAGE_CONFIGURATION_INVALID');
    }
    return bucket;
}

function normalizeRegion(value) {
    const region = requiredText('region', value || 'auto', 64);
    if (!REGION_PATTERN.test(region)) throw adapterError('The private storage region is invalid.', 500, 'OBJECT_STORAGE_CONFIGURATION_INVALID');
    return region;
}

function normalizeCredential(name, value, maximum = 512) {
    return requiredText(name, value, maximum);
}

function normalizeTimeout(value) {
    const timeout = Number(value ?? 30_000);
    if (!Number.isInteger(timeout) || timeout < MIN_TIMEOUT_MS || timeout > MAX_TIMEOUT_MS) {
        throw adapterError('The private storage request timeout is invalid.', 500, 'OBJECT_STORAGE_CONFIGURATION_INVALID');
    }
    return timeout;
}

function parseBoolean(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function compareCanonicalStrings(first, second) {
    return first === second ? 0 : first < second ? -1 : 1;
}

function normalizeKey(key, tenantId, scope) {
    const normalized = String(key || '').trim().replaceAll('\\', '/');
    if (!PRIVATE_KEY_PATTERN.test(normalized) || normalized.includes('..') || normalized.includes('//')) {
        throw adapterError('The private storage object key is invalid.', 403, 'STORAGE_OBJECT_KEY_INVALID');
    }
    if (scope === 'platform') {
        if (tenantId != null || !normalized.startsWith('platform/private/')) {
            throw adapterError('The private platform object scope is invalid.', 403, 'STORAGE_SCOPE_MISMATCH');
        }
    } else {
        const normalizedTenantId = Number(tenantId);
        if (!Number.isInteger(normalizedTenantId) || normalizedTenantId <= 0
            || !normalized.startsWith(`tenants/${normalizedTenantId}/private/`)) {
            throw adapterError('The private object does not belong to this tenant.', 403, 'STORAGE_TENANT_KEY_MISMATCH');
        }
    }
    return normalized;
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
    const digest = crypto.createHmac('sha256', key).update(value).digest();
    return encoding === 'hex' ? digest.toString('hex') : digest;
}

function awsEncode(value) {
    return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePath(value) {
    return String(value).split('/').map(awsEncode).join('/');
}

function canonicalQueryString(query = {}) {
    return Object.entries(query)
        .flatMap(([key, value]) => Array.isArray(value) ? value.map((item) => [key, item]) : [[key, value]])
        .map(([key, value]) => [awsEncode(key), awsEncode(value ?? '')])
        .sort((first, second) => first[0] === second[0] ? compareCanonicalStrings(first[1], second[1]) : compareCanonicalStrings(first[0], second[0]))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
}

function headerValue(value) {
    return String(value ?? '').trim().replace(/[\t\r\n ]+/g, ' ');
}

function canonicalHeaders(headers = {}) {
    const entries = Object.entries(headers)
        .map(([name, value]) => [name.toLowerCase().trim(), headerValue(value)])
        .sort((first, second) => compareCanonicalStrings(first[0], second[0]));
    return {
        value: `${entries.map(([name, value]) => `${name}:${value}`).join('\n')}\n`,
        signed: entries.map(([name]) => name).join(';')
    };
}

function amzTimestamp(date) {
    return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function dateStamp(timestamp) {
    return timestamp.slice(0, 8);
}

function signingKey(secretAccessKey, day, region) {
    const dateKey = hmac(Buffer.from(`AWS4${secretAccessKey}`), day);
    const regionKey = hmac(dateKey, region);
    const serviceKey = hmac(regionKey, 's3');
    return hmac(serviceKey, 'aws4_request');
}

function buildObjectAddress(config, key) {
    const url = new URL(config.endpoint.toString());
    const basePath = url.pathname.replace(/\/+$/, '');
    if (config.forcePathStyle) {
        url.pathname = `${basePath}/${config.bucket}/${key}`;
    } else {
        url.hostname = `${config.bucket}.${url.hostname}`;
        url.pathname = `${basePath}/${key}`;
    }
    return { url, host: url.host, canonicalUri: encodePath(url.pathname) };
}

function buildSignedRequest(config, { method, key, body = null, contentType = '', metadata = {}, presign = false, expiresInSeconds = 300 } = {}) {
    const address = buildObjectAddress(config, key);
    const timestamp = amzTimestamp(config.clock());
    const day = dateStamp(timestamp);
    const payloadHash = presign ? 'UNSIGNED-PAYLOAD' : (body == null ? 'UNSIGNED-PAYLOAD' : sha256(body));
    const credentialScope = `${day}/${config.region}/s3/aws4_request`;
    if (presign) {
        const query = {
            'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
            'X-Amz-Credential': `${config.accessKeyId}/${credentialScope}`,
            'X-Amz-Date': timestamp,
            'X-Amz-Expires': String(expiresInSeconds),
            'X-Amz-SignedHeaders': 'host'
        };
        if (config.sessionToken) query['X-Amz-Security-Token'] = config.sessionToken;
        const queryString = canonicalQueryString(query);
        const canonicalRequest = [
            method,
            address.canonicalUri,
            queryString,
            `host:${address.host}\n`,
            'host',
            payloadHash
        ].join('\n');
        const stringToSign = ['AWS4-HMAC-SHA256', timestamp, credentialScope, sha256(canonicalRequest)].join('\n');
        query['X-Amz-Signature'] = hmac(signingKey(config.secretAccessKey, day, config.region), stringToSign, 'hex');
        address.url.search = `?${canonicalQueryString(query)}`;
        return { ...address, headers: {}, payloadHash, timestamp };
    }

    const headers = {
        host: address.host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': timestamp
    };
    if (contentType) headers['content-type'] = contentType;
    if (config.sessionToken) headers['x-amz-security-token'] = config.sessionToken;
    for (const [name, value] of Object.entries(metadata)) headers[`x-amz-meta-${name}`] = value;
    const canonical = canonicalHeaders(headers);
    const canonicalRequest = [method, address.canonicalUri, '', canonical.value, canonical.signed, payloadHash].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', timestamp, credentialScope, sha256(canonicalRequest)].join('\n');
    const signature = hmac(signingKey(config.secretAccessKey, day, config.region), stringToSign, 'hex');
    const requestHeaders = { ...headers };
    delete requestHeaders.host;
    requestHeaders.Authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${canonical.signed}, Signature=${signature}`;
    return { ...address, headers: requestHeaders, payloadHash, timestamp };
}

function responseHeader(response, name) {
    return response?.headers?.get?.(name) || response?.headers?.[name] || response?.headers?.[name.toLowerCase()] || null;
}

async function fetchWithTimeout(config, request) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
        return await config.fetchImpl(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            signal: controller.signal
        });
    } catch (error) {
        if (error?.name === 'AbortError') throw adapterError('The private storage request timed out.', 503, 'OBJECT_STORAGE_PROVIDER_UNAVAILABLE');
        throw adapterError('The private storage provider could not be reached.', 503, 'OBJECT_STORAGE_PROVIDER_UNAVAILABLE');
    } finally {
        clearTimeout(timer);
    }
}

function assertSuccessfulResponse(response, action) {
    if (!response || response.status < 200 || response.status >= 300) {
        const status = Number(response?.status || 0);
        throw adapterError(`The private storage ${action} request failed with status ${status || 'unknown'}.`, 503, 'OBJECT_STORAGE_PROVIDER_REQUEST_FAILED');
    }
}

function assertObjectIdentity(input = {}) {
    const scope = input.scope === 'platform' || input.scope === 'tenant' ? input.scope : null;
    if (!scope) throw adapterError('The private storage object scope is invalid.', 403, 'STORAGE_SCOPE_MISMATCH');
    const tenantId = input.tenantId == null ? null : Number(input.tenantId);
    const key = normalizeKey(input.key, tenantId, scope);
    return { scope, tenantId, key };
}

function createS3CompatiblePrivateStorageAdapter({
    endpoint,
    bucket,
    region = 'auto',
    accessKeyId,
    secretAccessKey,
    sessionToken = '',
    forcePathStyle = true,
    requestTimeoutMs = 30_000,
    fetchImpl = globalThis.fetch,
    clock = () => new Date()
} = {}) {
    const config = Object.freeze({
        endpoint: normalizeEndpoint(endpoint),
        bucket: normalizeBucket(bucket),
        region: normalizeRegion(region),
        accessKeyId: normalizeCredential('access key id', accessKeyId, 256),
        secretAccessKey: normalizeCredential('secret access key', secretAccessKey, 512),
        sessionToken: sessionToken ? normalizeCredential('session token', sessionToken, 2048) : '',
        forcePathStyle: parseBoolean(forcePathStyle, true),
        requestTimeoutMs: normalizeTimeout(requestTimeoutMs),
        fetchImpl: typeof fetchImpl === 'function' ? fetchImpl : (() => { throw adapterError('A private storage HTTP client is unavailable.', 500, 'OBJECT_STORAGE_CONFIGURATION_INVALID'); }),
        clock: typeof clock === 'function' ? clock : (() => new Date())
    });

    async function request(method, identity, { body = null, contentType = '', metadata = {}, presign = false, expiresInSeconds = 300 } = {}) {
        const signed = buildSignedRequest(config, { method, key: identity.key, body, contentType, metadata, presign, expiresInSeconds });
        return fetchWithTimeout(config, {
            method,
            url: signed.url,
            headers: signed.headers,
            body: method === 'PUT' ? body : undefined
        });
    }

    async function putPrivateObject(input = {}) {
        const identity = assertObjectIdentity(input);
        const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body || '');
        if (!body.length || (input.size != null && Number(input.size) !== body.length)) {
            throw adapterError('The private storage object size is invalid.', 400, 'INVALID_STORAGE_SIZE');
        }
        if (input.checksum && String(input.checksum).toLowerCase() !== sha256(body)) {
            throw adapterError('The private storage object checksum is invalid.', 400, 'STORAGE_CHECKSUM_MISMATCH');
        }
        const response = await request('PUT', identity, {
            body,
            contentType: String(input.contentType || 'application/octet-stream'),
            metadata: {
                'logic-fit-scope': identity.scope,
                ...(identity.tenantId == null ? {} : { 'logic-fit-tenant-id': String(identity.tenantId) }),
                'logic-fit-checksum': sha256(body)
            }
        });
        assertSuccessfulResponse(response, 'put');
        return true;
    }

    async function getPrivateObject(input = {}) {
        const identity = assertObjectIdentity(input);
        const response = await request('GET', identity);
        if (response?.status === 404) return null;
        assertSuccessfulResponse(response, 'get');
        let body;
        try {
            body = Buffer.from(await response.arrayBuffer());
        } catch (_) {
            throw adapterError('The private storage object could not be read.', 503, 'OBJECT_STORAGE_PROVIDER_UNAVAILABLE');
        }
        return {
            tenantId: identity.tenantId,
            scope: identity.scope,
            key: identity.key,
            size: body.length,
            checksum: String(responseHeader(response, 'x-amz-meta-logic-fit-checksum') || sha256(body)).toLowerCase(),
            contentType: responseHeader(response, 'content-type') || 'application/octet-stream',
            body
        };
    }

    async function headPrivateObject(input = {}) {
        const identity = assertObjectIdentity(input);
        const response = await request('HEAD', identity);
        if (response?.status === 404) return null;
        assertSuccessfulResponse(response, 'head');
        const size = Number(responseHeader(response, 'content-length'));
        return {
            tenantId: identity.tenantId,
            scope: identity.scope,
            key: identity.key,
            size: Number.isInteger(size) && size >= 0 ? size : null,
            checksum: responseHeader(response, 'x-amz-meta-logic-fit-checksum') || null,
            contentType: responseHeader(response, 'content-type') || 'application/octet-stream'
        };
    }

    async function deletePrivateObject(input = {}) {
        const identity = assertObjectIdentity(input);
        const response = await request('DELETE', identity);
        if (response?.status === 404) return false;
        assertSuccessfulResponse(response, 'delete');
        return true;
    }

    async function createSignedDownload(input = {}) {
        const identity = assertObjectIdentity(input);
        const seconds = Math.min(900, Math.max(60, Number(input.expiresInSeconds) || 300));
        const signed = buildSignedRequest(config, { method: 'GET', key: identity.key, presign: true, expiresInSeconds: seconds });
        return { url: signed.url.toString(), expiresAt: new Date(config.clock().getTime() + seconds * 1000).toISOString() };
    }

    return Object.freeze({
        provider: 's3-compatible-private',
        putPrivateObject,
        getPrivateObject,
        headPrivateObject,
        deletePrivateObject,
        createSignedDownload
    });
}

module.exports = {
    canonicalHeaders,
    canonicalQueryString,
    createS3CompatiblePrivateStorageAdapter,
    normalizeKey
};
