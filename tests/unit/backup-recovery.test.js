'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildTenantBackupPayload,
    getRetentionPolicy,
    getScheduledPlatformBackupTypes,
    getTenantBackupCoverageStatus,
    inspectTenantBackupBuffer,
    inspectPlatformBackupBuffer,
    mapWithConcurrency,
    normalizeBackupFormat,
    normalizeRetryCount,
    validatePlatformBackupPayload,
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

function samplePlatformPayload() {
    const tables = {
        global: { gym_tenants: [{ id: 7, name: 'Gym A' }] },
        tenant: { members: [{ id: 11, tenant_id: 7, full_name: 'Synthetic Member' }] }
    };
    return {
        format: 'logic-fit-platform-backup',
        version: 2,
        backupType: 'platform-disaster-recovery',
        generatedAt: '2026-08-29T00:00:00.000Z',
        manifest: {
            registryVersion: 1,
            includesGlobalControlPlane: true,
            includesTenantData: true,
            excludesSecrets: true,
            tableCounts: { global: { gym_tenants: 1 }, tenant: { members: 1 } },
            rowCount: 2
        },
        tables,
        integrity: {
            algorithm: 'sha256',
            sha256: require('node:crypto').createHash('sha256').update(JSON.stringify(tables)).digest('hex')
        }
    };
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

test('platform backup validation checks scope, manifest completeness and credential exclusion', async () => {
    const payload = samplePlatformPayload();
    const validation = validatePlatformBackupPayload(payload, { requireCompleteRegistry: false });
    assert.equal(validation.rowCount, 2);
    const gzip = require('node:zlib').gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
    const inspected = await inspectPlatformBackupBuffer(gzip, { requireCompleteRegistry: false });
    assert.equal(inspected.integrity.verified, true);
    assert.throws(() => validatePlatformBackupPayload(payload), { code: 'PLATFORM_BACKUP_REGISTRY_INCOMPLETE' });
    const secretPayload = structuredClone(payload);
    secretPayload.tables.global.gym_tenants[0].password_hash = 'must-not-export';
    assert.throws(() => validatePlatformBackupPayload(secretPayload, { requireCompleteRegistry: false }), { code: 'PLATFORM_BACKUP_SECRET_COLUMN' });
});

test('tenant restore rejects an artifact that does not cover the current registry', () => {
    const payload = samplePayload();
    assert.throws(() => validateTenantBackupPayload(payload, { expectedTenantId: 7, requireCompleteRegistry: true }), { code: 'BACKUP_REGISTRY_INCOMPLETE' });
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

test('daily scheduler selects weekly and monthly platform snapshots by UTC calendar rules', () => {
    assert.deepEqual(getScheduledPlatformBackupTypes(new Date('2026-08-30T12:00:00.000Z')), ['platform_weekly']);
    assert.deepEqual(getScheduledPlatformBackupTypes(new Date('2026-08-01T12:00:00.000Z')), ['platform_monthly']);
    assert.deepEqual(getScheduledPlatformBackupTypes(new Date('2026-11-01T12:00:00.000Z')), ['platform_monthly', 'platform_weekly']);
    assert.deepEqual(getScheduledPlatformBackupTypes(new Date('2026-11-01T12:00:00.000Z'), { weekly: false }), ['platform_monthly']);
    assert.deepEqual(getScheduledPlatformBackupTypes(new Date('2026-11-01T12:00:00.000Z'), { monthly: false }), ['platform_weekly']);
});

test('runtime backup coverage inspection is platform-scoped before touching the database', async () => {
    await assert.rejects(getTenantBackupCoverageStatus({ readOnly: true }), { code: 'PLATFORM_SCOPE_REQUIRED' });
});

test('scheduler retry count preserves an explicit zero retry policy', () => {
    assert.equal(normalizeRetryCount(0, 1, 3), 0);
    assert.equal(normalizeRetryCount(5, 1, 3), 3);
    assert.equal(normalizeRetryCount('invalid', 1, 3), 1);
});

test('native BAK requests fail closed instead of mislabelling a logical gzip artifact', () => {
    assert.equal(normalizeBackupFormat('json.gz'), 'json.gz');
    assert.throws(() => normalizeBackupFormat('bak'), { code: 'BACKUP_NATIVE_FORMAT_UNAVAILABLE', statusCode: 409 });
});

test('stored backup verification hashes returned bytes instead of trusting metadata', async () => {
    const expected = require('node:crypto').createHash('sha256').update(Buffer.from('expected')).digest('hex');
    const storage = {
        async headPrivateObject() { return { size: 8, checksum: expected }; },
        async getPrivateObject() { return { body: Buffer.from('tampered'), size: 8, checksum: expected }; }
    };
    await assert.rejects(
        require('../../src/services/backup-recovery-service').verifyStoredTenantObject(storage, {
            tenantId: 7,
            key: 'tenants/7/private/backups/abcdefghijklmnop.json.gz',
            expectedSize: 8,
            expectedChecksum: expected
        }),
        { code: 'BACKUP_ARTIFACT_CHECKSUM_MISMATCH' }
    );
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
