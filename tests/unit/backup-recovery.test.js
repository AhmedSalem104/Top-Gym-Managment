'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildTenantBackupPayload,
    getRetentionPolicy,
    inspectTenantBackupBuffer,
    mapWithConcurrency,
    validateTenantBackupPayload
} = require('../../src/services/backup-recovery-service');
const { createObjectStorageService } = require('../../src/services/object-storage-service');

function samplePayload() {
    return buildTenantBackupPayload({
        tenant: { id: 7, slug: 'gym-a', name: 'Gym A' },
        tables: {
            members: [{ id: 11, tenant_id: 7, full_name: 'Synthetic Member' }],
            gym_muscles: [{ id: 1, tenant_id: 7, source_id: 'muscle-1', name: 'Synthetic Muscle' }]
        },
        generatedAt: '2026-08-29T00:00:00.000Z'
    });
}

test('tenant backup manifest validates tenant ownership and SHA-256 content integrity', () => {
    const payload = samplePayload();
    const validation = validateTenantBackupPayload(payload, { expectedTenantId: 7 });
    assert.equal(validation.tenantId, 7);
    assert.equal(validation.rowCount, 2);
    assert.equal(validation.integrity.verified, true);
    assert.throws(() => validateTenantBackupPayload(payload, { expectedTenantId: 8 }), { code: 'BACKUP_TENANT_MISMATCH' });
});

test('tenant backup validation rejects cross-tenant rows and tampering', () => {
    const payload = samplePayload();
    const crossTenant = structuredClone(payload);
    crossTenant.tables.members[0].tenant_id = 8;
    assert.throws(() => validateTenantBackupPayload(crossTenant), { code: 'BACKUP_CROSS_TENANT_RECORD' });

    const tampered = structuredClone(payload);
    tampered.tables.members[0].full_name = 'Changed after export';
    assert.throws(() => validateTenantBackupPayload(tampered), { code: 'BACKUP_CHECKSUM_MISMATCH' });
});

test('backup inspector accepts gzip artifacts and does not expose credentials or sessions', async () => {
    const payload = samplePayload();
    const gzip = require('node:zlib').gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
    const inspected = await inspectTenantBackupBuffer(gzip, { expectedTenantId: 7 });
    assert.equal(inspected.tenantId, 7);
    assert.equal(inspected.rowCount, 2);
    assert.equal(Object.hasOwn(inspected, 'body'), false);
    assert.equal(JSON.stringify(inspected.payload).includes('password'), false);
    assert.equal(JSON.stringify(inspected.payload).includes('session'), false);
});

test('backup table workers are bounded and preserve result order', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], async (value) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return value * 2;
    }, 2);
    assert.deepEqual(result, [2, 4, 6, 8, 10]);
    assert.equal(peak <= 2, true);
});

test('retention defaults are configurable and never include an unlimited value', () => {
    const policy = getRetentionPolicy();
    assert.equal(policy.tenant_daily, 30);
    assert.equal(policy.platform_weekly, 84);
    assert.ok(Object.values(policy).every((days) => Number.isInteger(days) && days > 0));
});

test('platform private storage uses a separate scope and rejects tenant-key confusion', async () => {
    const objects = new Map();
    const storage = createObjectStorageService({
        adapter: {
            async putPrivateObject(object) { objects.set(object.key, object); },
            async headPrivateObject({ key }) {
                const object = objects.get(key);
                return object ? { scope: object.scope, key: object.key, size: object.size, checksum: object.checksum } : null;
            },
            async getPrivateObject({ key }) { return objects.get(key) || null; },
            async deletePrivateObject({ key }) { objects.delete(key); }
        }
    });
    const stored = await storage.putPrivatePlatformObject({
        category: 'backups',
        objectName: 'platform.json.gz',
        objectId: 'platform-backup-001',
        contentType: 'application/gzip',
        body: Buffer.from('synthetic')
    });
    assert.match(stored.key, /^platform\/private\/backups\//);
    assert.equal((await storage.headPrivatePlatformObject({ key: stored.key })).size, 9);
    await assert.rejects(storage.getPrivateObject({ tenantId: 7, key: stored.key }), { code: 'STORAGE_TENANT_KEY_MISMATCH' });
});
