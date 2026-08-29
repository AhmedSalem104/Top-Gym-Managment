'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    assertPrivateObjectKey,
    buildPrivateObjectKey,
    createObjectStorageService,
    preparePrivateObject
} = require('../../src/services/object-storage-service');

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
});

test('storage operations fail closed until an approved provider is configured', async () => {
    const storage = createObjectStorageService();
    await assert.rejects(
        storage.putPrivateObject({ tenantId: 1, category: 'exports', objectName: 'report.json', contentType: 'application/json', body: Buffer.from('{}') }),
        { code: 'OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED' }
    );
    assert.throws(() => storage.getPublicUrl(), { code: 'PRIVATE_OBJECT_PUBLIC_URL_FORBIDDEN' });
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
