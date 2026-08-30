'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    buildTenantBackupPayload,
    assertBackupNotExpired,
    deletePlatformArtifactAndVerify,
    deleteTenantArtifactAndVerify,
    getRetentionPolicy,
    getScheduledPlatformBackupTypes,
    getTenantBackupCoverageStatus,
    inspectTenantBackupBuffer,
    inspectPlatformBackupBuffer,
    mapWithConcurrency,
    normalizeBackupFormat,
    normalizeRetryCount,
    payloadDigest,
    metadataColumns,
    validatePlatformBackupPayload,
    validateTenantBackupPayload,
    verifyStoredTenantObject
} = require('../../src/services/backup-recovery-service');
const { createObjectStorageService } = require('../../src/services/object-storage-service');
const { TENANT_BACKUP_REGISTRY_VERSION, TENANT_BACKUP_TABLES } = require('../../src/services/backup-registry');

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
            registryVersion: TENANT_BACKUP_REGISTRY_VERSION,
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

test('tenant backup validation rejects sensitive credential fields', () => {
    const payload = samplePayload();
    payload.tables.members[0].refresh_token = 'must-not-export';
    payload.integrity.sha256 = require('node:crypto').createHash('sha256').update(JSON.stringify(payload.tables)).digest('hex');
    assert.throws(() => validateTenantBackupPayload(payload), { code: 'BACKUP_SENSITIVE_COLUMN' });
});

test('tenant backup validation keeps nutritional salt data', () => {
    const payload = samplePayload();
    payload.tables.gym_foods = [{ id: 21, tenant_id: 7, salt: 0.4 }];
    payload.manifest.tableCounts.gym_foods = 1;
    payload.manifest.rowCount = 3;
    payload.integrity.sha256 = payloadDigest(payload.tables);
    assert.doesNotThrow(() => validateTenantBackupPayload(payload));
});

test('tenant backup validation requires the declared backup type and complete manifest', () => {
    const wrongType = structuredClone(samplePayload());
    wrongType.backupType = 'platform-disaster-recovery';
    assert.throws(() => validateTenantBackupPayload(wrongType), { code: 'BACKUP_TYPE_INVALID' });

    const missingManifest = structuredClone(samplePayload());
    delete missingManifest.manifest;
    assert.throws(() => validateTenantBackupPayload(missingManifest), { code: 'BACKUP_MANIFEST_INVALID' });
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

    const unknownTenant = structuredClone(payload);
    unknownTenant.tables.tenant.members[0].tenant_id = 8;
    unknownTenant.integrity.sha256 = payloadDigest(unknownTenant.tables);
    assert.throws(() => validatePlatformBackupPayload(unknownTenant, { requireCompleteRegistry: false }), { code: 'PLATFORM_BACKUP_TENANT_REFERENCE_INVALID' });

    const unknownControlPlaneTenant = structuredClone(payload);
    unknownControlPlaneTenant.tables.global.saas_tenant_subscriptions = [{ id: 1, tenant_id: 8 }];
    unknownControlPlaneTenant.manifest.tableCounts.global.saas_tenant_subscriptions = 1;
    unknownControlPlaneTenant.manifest.rowCount = 3;
    unknownControlPlaneTenant.integrity.sha256 = payloadDigest(unknownControlPlaneTenant.tables);
    assert.throws(() => validatePlatformBackupPayload(unknownControlPlaneTenant, { requireCompleteRegistry: false }), { code: 'PLATFORM_BACKUP_TENANT_REFERENCE_INVALID' });
});

test('backup projections exclude secret-like columns without dropping nutritional salt', () => {
    const metadata = new Map([['gym_foods', [
        { name: 'salt', isComputed: false, isRowVersion: false },
        { name: 'refresh_token', isComputed: false, isRowVersion: false },
        { name: 'password_hash', isComputed: false, isRowVersion: false },
        { name: 'calories', isComputed: false, isRowVersion: false }
    ]]]);
    assert.deepEqual(metadataColumns(metadata, 'gym_foods', { excludeSensitive: true }).map((column) => column.name), ['salt', 'calories']);
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

test('expired or malformed backup metadata cannot pass the download freshness gate', () => {
    assert.doesNotThrow(() => assertBackupNotExpired({ expiresAt: '2099-01-01T00:00:00.000Z' }, new Date('2026-08-29T00:00:00.000Z')));
    assert.throws(() => assertBackupNotExpired({ expiresAt: '2026-08-28T00:00:00.000Z' }, new Date('2026-08-29T00:00:00.000Z')), { code: 'BACKUP_EXPIRED', statusCode: 410 });
    assert.throws(() => assertBackupNotExpired({ expiresAt: 'not-a-date' }), { code: 'BACKUP_METADATA_INCOMPLETE', statusCode: 503 });
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
    assert.throws(() => normalizeBackupFormat('zip'), { code: 'BACKUP_FORMAT_UNSUPPORTED', statusCode: 400 });
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

test('stored tenant verification also validates the complete manifest after upload', async () => {
    const tables = Object.fromEntries(TENANT_BACKUP_TABLES.map((definition) => [definition.key, []]));
    const payload = buildTenantBackupPayload({ tenant: { id: 7, slug: 'gym-a', name: 'Gym A' }, tables });
    const body = require('node:zlib').gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
    const checksum = require('node:crypto').createHash('sha256').update(body).digest('hex');
    const storage = {
        async headPrivateObject() { return { size: body.length }; },
        async getPrivateObject() { return { body, contentType: 'application/gzip' }; }
    };
    const verified = await verifyStoredTenantObject(storage, {
        tenantId: 7,
        key: 'tenants/7/private/backups/abcdefghijklmnop.json.gz',
        expectedSize: body.length,
        expectedChecksum: checksum
    });
    assert.equal(verified.rowCount, 0);
    assert.equal(verified.checksum, checksum);
});

test('artifact deletion is confirmed before backup metadata can be finalized', async () => {
    const tenantKey = 'tenants/7/private/backups/abcdefghijklmnop.json.gz';
    let tenantPresent = true;
    const tenantStorage = {
        async deletePrivateObject() { tenantPresent = false; return true; },
        async headPrivateObject() { return tenantPresent ? { key: tenantKey } : null; }
    };
    assert.deepEqual(await deleteTenantArtifactAndVerify(tenantStorage, { tenantId: 7, key: tenantKey }), { status: 'deleted' });

    const platformKey = 'platform/private/backups/abcdefghijklmnop.json.gz';
    let platformPresent = true;
    const platformStorage = {
        async deletePrivatePlatformObject() { return true; },
        async headPrivatePlatformObject() { return platformPresent ? { key: platformKey } : null; }
    };
    await assert.rejects(
        deletePlatformArtifactAndVerify(platformStorage, { key: platformKey }),
        { code: 'BACKUP_ARTIFACT_DELETE_UNCONFIRMED' }
    );
    platformPresent = false;
    assert.deepEqual(await deletePlatformArtifactAndVerify(platformStorage, { key: platformKey }), { status: 'deleted' });
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
