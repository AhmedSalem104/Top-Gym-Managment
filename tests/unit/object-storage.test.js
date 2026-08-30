'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
    assertPrivateObjectKey,
    buildPrivateObjectKey,
    createConfiguredObjectStorageService,
    createObjectStorageService,
    preparePrivateObject
} = require('../../src/services/object-storage-service');
const { createS3CompatiblePrivateStorageAdapter } = require('../../src/services/s3-compatible-private-storage-adapter');
const { isVercelRuntime } = require('../../src/services/local-private-storage-adapter');

test('private object keys are tenant-scoped and do not contain the original filename', () => {
    const key = buildPrivateObjectKey({
        tenantId: 42,
        category: 'payment-proofs',
        objectName: 'receipt-إيصال.png',
        objectId: 'object-test-00000001'
    });

    assert.equal(key, 'tenants/42/private/payment-proofs/object-test-00000001.png');
    assert.equal(key.includes('receipt'), false);
    assert.equal(key.includes('إيصال'), false);
    assert.doesNotThrow(() => assertPrivateObjectKey(42, key));
    assert.throws(() => assertPrivateObjectKey(43, key), { code: 'STORAGE_TENANT_KEY_MISMATCH' });
});

test('private object key generation rejects traversal and absolute paths', () => {
    assert.throws(() => buildPrivateObjectKey({ tenantId: 1, category: 'backups', objectName: '../backup.json.gz' }), { code: 'INVALID_STORAGE_OBJECT_PATH' });
    assert.throws(() => buildPrivateObjectKey({ tenantId: 1, category: 'backups', objectName: '/backup.json.gz' }), { code: 'INVALID_STORAGE_OBJECT_PATH' });
    assert.throws(() => buildPrivateObjectKey({ tenantId: 1, category: '../backups', objectName: 'backup.json.gz' }), { code: 'INVALID_STORAGE_CATEGORY' });
});

test('private object preparation validates size, MIME and checksum without retaining a public URL', () => {
    const object = preparePrivateObject({
        tenantId: 7,
        category: 'branding',
        objectName: 'logo.svg',
        contentType: 'image/svg+xml',
        body: Buffer.from('<svg></svg>')
    }, { maxBytes: 1024 });

    assert.equal(object.tenantId, 7);
    assert.equal(object.scope, 'tenant');
    assert.equal(object.size, 11);
    assert.match(object.checksum, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(object, 'url'), false);
    assert.throws(() => preparePrivateObject({ ...object, contentType: 'text/plain', body: Buffer.alloc(2048) }, { maxBytes: 1024 }), { code: 'INVALID_STORAGE_SIZE' });
    assert.throws(() => preparePrivateObject({
        tenantId: 7,
        category: 'branding',
        objectName: 'logo.svg',
        contentType: 'image/svg+xml',
        body: Buffer.from('<svg></svg>'),
        checksum: 'a'.repeat(64)
    }), { code: 'STORAGE_CHECKSUM_MISMATCH' });
});

test('storage operations fail closed until an approved provider is configured', async () => {
    const storage = createObjectStorageService();
    await assert.rejects(
        storage.putPrivateObject({ tenantId: 1, category: 'exports', objectName: 'report.json', contentType: 'application/json', body: Buffer.from('{}') }),
        { code: 'OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED' }
    );
    assert.throws(() => storage.getPublicUrl(), { code: 'PRIVATE_OBJECT_PUBLIC_URL_FORBIDDEN' });
});

test('private object verification reads back uploaded bytes even when HEAD has metadata', async () => {
    const crypto = require('node:crypto');
    const body = Buffer.from('verified object');
    const checksum = crypto.createHash('sha256').update(body).digest('hex');
    const calls = [];
    const key = 'tenants/7/private/branding/abcdefghijklmnop.png';
    const storage = createObjectStorageService({
        adapter: {
            async headPrivateObject() {
                calls.push('head');
                return { tenantId: 7, key, size: body.length, checksum };
            },
            async getPrivateObject() {
                calls.push('get');
                return { tenantId: 7, key, body, size: body.length, checksum };
            }
        }
    });

    const result = await storage.verifyPrivateObject({ tenantId: 7, key, expectedSize: body.length, expectedChecksum: checksum });
    assert.deepEqual(calls, ['head', 'get']);
    assert.deepEqual(result, { key, size: body.length, checksum });
});

test('private object verification rejects tampered bytes despite matching HEAD metadata', async () => {
    const crypto = require('node:crypto');
    const expectedBody = Buffer.from('expected object');
    const tamperedBody = Buffer.from('tampered object');
    const expectedChecksum = crypto.createHash('sha256').update(expectedBody).digest('hex');
    const tamperedChecksum = crypto.createHash('sha256').update(tamperedBody).digest('hex');
    const key = 'tenants/7/private/payment-proofs/abcdefghijklmnop.jpg';
    const storage = createObjectStorageService({
        adapter: {
            async headPrivateObject() {
                return { tenantId: 7, key, size: expectedBody.length, checksum: expectedChecksum };
            },
            async getPrivateObject() {
                return { tenantId: 7, key, body: tamperedBody, size: tamperedBody.length, checksum: tamperedChecksum };
            }
        }
    });

    await assert.rejects(
        storage.verifyPrivateObject({ tenantId: 7, key, expectedSize: expectedBody.length, expectedChecksum }),
        { code: 'STORAGE_CHECKSUM_MISMATCH' }
    );
});

test('platform object verification reads back bytes before registration proof acceptance', async () => {
    const crypto = require('node:crypto');
    const body = Buffer.from('platform proof');
    const checksum = crypto.createHash('sha256').update(body).digest('hex');
    const calls = [];
    const key = 'platform/private/registration-payment-proofs/abcdefghijklmnop.png';
    const storage = createObjectStorageService({
        adapter: {
            async headPrivateObject() {
                calls.push('head');
                return { tenantId: null, scope: 'platform', key, size: body.length, checksum };
            },
            async getPrivateObject() {
                calls.push('get');
                return { tenantId: null, scope: 'platform', key, body, size: body.length, checksum };
            }
        }
    });

    const result = await storage.verifyPrivatePlatformObject({ key, expectedSize: body.length, expectedChecksum: checksum });
    assert.deepEqual(calls, ['head', 'get']);
    assert.deepEqual(result, { key, size: body.length, checksum });
});

test('local private storage is explicit, isolated and usable only outside production', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logic-fit-private-storage-'));
    try {
        const storage = createConfiguredObjectStorageService({ driver: 'local', nodeEnv: 'test', rootDir });
        const stored = await storage.putPrivateObject({
            tenantId: 7,
            category: 'backups',
            objectName: 'gym-a.json.gz',
            contentType: 'application/gzip',
            body: Buffer.from('synthetic-backup')
        });
        assert.equal(storage.providerStatus, 'local_development');
        assert.match(stored.key, /^tenants\/7\/private\/backups\//);
        assert.equal((await storage.headPrivateObject({ tenantId: 7, key: stored.key })).size, 16);
        assert.equal((await storage.getPrivateObject({ tenantId: 7, key: stored.key })).body.toString(), 'synthetic-backup');
        await assert.rejects(storage.getPrivateObject({ tenantId: 8, key: stored.key }), { code: 'STORAGE_TENANT_KEY_MISMATCH' });
        assert.equal(await storage.deletePrivateObject({ tenantId: 7, key: stored.key }), true);
        assert.equal(await storage.getPrivateObject({ tenantId: 7, key: stored.key }), null);
    } finally {
        await fs.rm(rootDir, { recursive: true, force: true });
    }
});

test('local private storage cannot be enabled in production or staging', () => {
    assert.throws(
        () => createConfiguredObjectStorageService({ driver: 'local', nodeEnv: 'production', rootDir: path.join(os.tmpdir(), 'logic-fit-prod-storage') }),
        { code: 'LOCAL_STORAGE_FORBIDDEN' }
    );
    assert.throws(
        () => createConfiguredObjectStorageService({ driver: 'local', nodeEnv: 'staging', rootDir: path.join(os.tmpdir(), 'logic-fit-staging-storage') }),
        { code: 'LOCAL_STORAGE_FORBIDDEN' }
    );
    assert.throws(
        () => createConfiguredObjectStorageService({ driver: 'local', nodeEnv: 'development', isVercel: true, rootDir: path.join(os.tmpdir(), 'logic-fit-vercel-storage') }),
        { code: 'LOCAL_STORAGE_FORBIDDEN' }
    );
    assert.equal(isVercelRuntime('preview'), true);
    assert.equal(isVercelRuntime('local'), false);
});

test('s3 driver wires the production adapter without activating local storage', () => {
    const storage = createConfiguredObjectStorageService({
        driver: 's3',
        endpoint: 'https://objects.example.test',
        bucket: 'logic-fit-private',
        region: 'auto',
        accessKeyId: 'access-key-for-test',
        secretAccessKey: 'secret-key-for-test'
    });

    assert.equal(storage.providerStatus, 'configured');
    assert.equal(storage.isConfigured, true);
    assert.equal(typeof storage.getPublicUrl, 'function');
    assert.throws(() => storage.getPublicUrl(), { code: 'PRIVATE_OBJECT_PUBLIC_URL_FORBIDDEN' });
});

test('s3-compatible production adapter signs private tenant requests without public URLs', async () => {
    const calls = [];
    const fixedDate = new Date('2026-08-30T12:34:56.000Z');
    const adapter = createS3CompatiblePrivateStorageAdapter({
        endpoint: 'https://objects.example.test',
        bucket: 'logic-fit-private',
        region: 'auto',
        accessKeyId: 'access-key-for-test',
        secretAccessKey: 'secret-key-for-test',
        clock: () => fixedDate,
        fetchImpl: async (url, options) => {
            calls.push({ url: String(url), options });
            return new Response(null, { status: options.method === 'HEAD' ? 200 : 204, headers: { 'content-length': '14' } });
        }
    });
    const body = Buffer.from('synthetic backup');
    await adapter.putPrivateObject({
        tenantId: 7,
        scope: 'tenant',
        key: 'tenants/7/private/backups/abcdefghijklmnop.gz',
        contentType: 'application/gzip',
        body,
        checksum: require('node:crypto').createHash('sha256').update(body).digest('hex')
    });
    const signed = await adapter.createSignedDownload({
        tenantId: 7,
        scope: 'tenant',
        key: 'tenants/7/private/backups/abcdefghijklmnop.gz'
    });
    assert.match(calls[0].url, /objects\.example\.test\/logic-fit-private\/tenants\/7\/private\/backups\//);
    assert.match(calls[0].options.headers.Authorization, /Credential=access-key-for-test\//);
    assert.doesNotMatch(calls[0].options.headers.Authorization, /secret-key-for-test/);
    assert.match(signed.url, /^https:\/\//);
    assert.match(signed.url, /X-Amz-SignedHeaders=host/);
    assert.doesNotMatch(signed.url, /secret-key-for-test/);
    await assert.rejects(
        adapter.getPrivateObject({ tenantId: 8, scope: 'tenant', key: 'tenants/7/private/backups/abcdefghijklmnop.gz' }),
        { code: 'STORAGE_TENANT_KEY_MISMATCH' }
    );
});

test('s3-compatible production adapter requires complete private credentials', () => {
    assert.throws(() => createS3CompatiblePrivateStorageAdapter({
        endpoint: 'https://objects.example.test',
        bucket: 'logic-fit-private',
        accessKeyId: 'access-key-for-test',
        secretAccessKey: ''
    }), { code: 'OBJECT_STORAGE_CONFIGURATION_INVALID' });
});

test('returned private objects must keep the requested key and integrity', async () => {
    const service = createObjectStorageService({
        adapter: {
            async getPrivateObject() {
                return { key: 'tenants/7/private/backups/another-object-0001', body: Buffer.from('data'), checksum: require('node:crypto').createHash('sha256').update('data').digest('hex'), size: 4 };
            }
        }
    });
    await assert.rejects(
        service.getPrivateObject({ tenantId: 7, key: 'tenants/7/private/backups/abcdefghijklmnop' }),
        { code: 'STORAGE_OBJECT_KEY_MISMATCH' }
    );
});

test('signed private downloads must be HTTPS URLs', async () => {
    const service = createObjectStorageService({
        adapter: {
            async createSignedDownload() { return { url: 'http://storage.invalid/private/object' }; }
        }
    });
    await assert.rejects(
        service.createSignedDownload({ tenantId: 7, key: 'tenants/7/private/backups/abcdefghijklmnop' }),
        { code: 'INVALID_SIGNED_DOWNLOAD' }
    );
});

test('storage adapter receives a tenant-safe private key and no public URL', async () => {
    const calls = [];
    const storage = createObjectStorageService({
        adapter: {
            async putPrivateObject(object) {
                calls.push(object);
            }
        }
    });
    const result = await storage.putPrivateObject({
        tenantId: 9,
        category: 'exports',
        objectName: 'monthly-report.json',
        contentType: 'application/json',
        body: Buffer.from('{"ok":true}')
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0].key, /^tenants\/9\/private\/exports\//);
    assert.equal(calls[0].originalName, 'monthly-report.json');
    assert.equal(result.url, undefined);
    assert.equal(result.body, undefined);
});

test('provider cannot return an object owned by another tenant', async () => {
    const service = createObjectStorageService({
        adapter: {
            async getPrivateObject() {
                return { tenantId: 8, key: 'tenants/7/private/payment-proofs/abcdefghijklmnop.jpg' };
            }
        }
    });

    await assert.rejects(
        service.getPrivateObject({ tenantId: 7, key: 'tenants/7/private/payment-proofs/abcdefghijklmnop.jpg' }),
        { code: 'STORAGE_TENANT_KEY_MISMATCH', statusCode: 403 }
    );
});

test('tenant object reads reject a provider scope mismatch', async () => {
    const service = createObjectStorageService({
        adapter: {
            async getPrivateObject() {
                return { tenantId: 7, scope: 'platform', key: 'tenants/7/private/payment-proofs/abcdefghijklmnop.jpg' };
            }
        }
    });

    await assert.rejects(
        service.getPrivateObject({ tenantId: 7, key: 'tenants/7/private/payment-proofs/abcdefghijklmnop.jpg' }),
        { code: 'STORAGE_SCOPE_MISMATCH', statusCode: 403 }
    );
});
