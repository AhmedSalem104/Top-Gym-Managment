'use strict';

const { currentTenantId } = require('../tenancy/tenant-context');

function sendBackupDownload(response, backup) {
    response.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Content-Type': backup.contentType || (backup.format === 'bak' ? 'application/octet-stream' : 'application/gzip'),
        'Content-Disposition': `attachment; filename="${String(backup.fileName || backup.filename || 'logic-fit-backup.json.gz').replace(/["\\\r\n]/g, '')}"`,
        'Content-Length': String(backup.body?.length ?? backup.buffer?.length ?? 0),
        'X-Content-Type-Options': 'nosniff'
    });
    return response.send(backup.body || backup.buffer);
}

function legacyArchiveView(record) {
    return {
        id: record.id,
        backupDay: record.backupDay,
        fileName: record.fileName,
        format: record.format,
        generatedAt: record.completedAt || record.createdAt,
        contentBytes: record.sizeBytes || 0,
        rowCount: record.rowCount,
        tableCounts: record.tableCounts,
        status: record.status,
        verifiedAt: record.verifiedAt,
        expiresAt: record.expiresAt,
        createdAt: record.createdAt
    };
}

function requestReason(request, fallback = '') {
    const encoded = String(request.get?.('x-backup-reason-b64') || '').trim();
    if (encoded && encoded.length <= 4096 && /^[A-Za-z0-9_-]+$/.test(encoded)) {
        try {
            const decoded = Buffer.from(encoded, 'base64url').toString('utf8').trim();
            if (decoded) return decoded.slice(0, 1000);
        } catch (_) { /* fall through to the JSON/header reason */ }
    }
    return String(request.get?.('x-backup-reason') || request.body?.reason || fallback).trim().slice(0, 1000);
}

function backupStorageView(recovery) {
    return {
        status: recovery?.providerStatus || 'not_configured',
        configured: Boolean(recovery?.isStorageConfigured)
    };
}

function createBackupController({ backupService, backupRecoveryService, brandingService, isAuthorizedCronRequest }) {
    const {
        createBackup,
        recordBackupOperation,
        safeOperationalError
    } = backupService;
    const recovery = backupRecoveryService;

    return {
        daily: async (request, response) => {
            if (!isAuthorizedCronRequest(request)) return response.status(401).json({ error: 'The scheduled backup request is not authorized.' });
            if (!recovery) return response.status(503).json({ error: 'Backup recovery service is not configured.', code: 'BACKUP_RECOVERY_NOT_CONFIGURED' });
            const result = await recovery.runDailyBackupCycle({});
            const statusCode = typeof recovery.getDailyBackupCycleHttpStatus === 'function'
                ? recovery.getDailyBackupCycleHttpStatus(result)
                : 200;
            return response.status(statusCode).json({ ok: statusCode === 200, scheduled: true, ...result });
        },

        // This route remains a read-only, on-demand export for compatibility
        // with the existing Owner UI. Persistent automatic backups use the
        // private storage-backed records below.
        download: async (request, response) => {
            const requestedFormat = String(request.query.format || 'json.gz').toLowerCase();
            if (requestedFormat !== 'json.gz') {
                return response.status(409).json({
                    error: 'Native SQL Server .bak backups are not available in this deployment. Use the verified .json.gz format.',
                    code: 'BACKUP_NATIVE_FORMAT_UNAVAILABLE'
                });
            }
            const backup = await createBackup({ format: requestedFormat, readOnly: request.readOnlyRequest });
            const brandName = brandingService ? await brandingService.getPublicBrandName('Logic Fit', { readOnly: request.readOnlyRequest }) : 'Logic Fit';
            await recordBackupOperation({
                operationType: 'download',
                fileName: backup.filename,
                sourceGeneratedAt: backup.generatedAt,
                tableCounts: backup.rowCounts,
                readOnly: request.readOnlyRequest,
                details: `On-demand ${brandName} tenant export downloaded.`
            }).catch(() => {});
            return sendBackupDownload(response, { ...backup, fileName: backup.filename });
        },

        status: async (request, response) => {
            const [records, audit] = await Promise.all([
                recovery.getTenantBackupHistory({ limit: request.query.limit, readOnly: request.readOnlyRequest }),
                recovery.getTenantBackupAudit({ limit: request.query.auditLimit, readOnly: request.readOnlyRequest })
            ]);
            response.json({
                records,
                audit,
                lastAutomatic: records.find((record) => record.backupType === 'tenant_daily') || null,
                retention: recovery.getRetentionPolicy(),
                storage: backupStorageView(recovery)
            });
        },

        create: async (request, response) => {
            const reason = requestReason(request);
            if (!reason) {
                return response.status(400).json({ error: 'A reason is required before starting a manual backup.', code: 'BACKUP_REASON_REQUIRED' });
            }
            const result = await recovery.createTenantBackup({
                backupType: 'tenant_manual',
                actorUserId: request.auth?.id,
                reason,
                format: String(request.body?.format || 'json.gz').toLowerCase()
            });
            response.status(result.idempotent ? 200 : 201).json(result);
        },

        history: async (request, response) => {
            const [records, audit] = await Promise.all([
                recovery.getTenantBackupHistory({ limit: request.query.limit, readOnly: request.readOnlyRequest }),
                recovery.getTenantBackupAudit({ limit: request.query.auditLimit, readOnly: request.readOnlyRequest })
            ]);
            response.json({
                operations: audit.map((item) => ({
                    operationType: item.eventType,
                    fileName: item.metadata?.fileName || null,
                    rowCount: item.metadata?.rowCount || 0,
                    status: item.result,
                    createdAt: item.createdAt
                })),
                archives: records.map(legacyArchiveView),
                records,
                audit,
                retention: recovery.getRetentionPolicy(),
                storage: backupStorageView(recovery)
            });
        },

        archive: async (request, response) => {
            const archive = await recovery.downloadTenantBackup(request.params.id, {
                readOnly: request.readOnlyRequest,
                actorUserId: request.auth?.id,
                auditDownload: true
            });
            return sendBackupDownload(response, archive);
        },

        recordDownload: async (request, response) => {
            const backup = await recovery.downloadTenantBackup(request.params.id, {
                readOnly: request.readOnlyRequest,
                actorUserId: request.auth?.id,
                auditDownload: true
            });
            return sendBackupDownload(response, backup);
        },

        deleteArchive: async (request, response) => {
            const result = await recovery.deleteTenantBackup(request.params.id, {
                actorUserId: request.auth?.id,
                reason: requestReason(request),
                storageService: undefined
            });
            response.json(result);
        },

        inspect: async (request, response) => {
            const inspected = await recovery.inspectTenantBackupBuffer(request.body, { expectedTenantId: currentTenantId({ required: true }) });
            response.json({
                valid: true,
                generatedAt: inspected.generatedAt,
                compressedBytes: inspected.compressedBytes,
                jsonBytes: inspected.jsonBytes,
                rowCount: inspected.rowCount,
                tableCounts: inspected.tableCounts,
                integrity: inspected.integrity
            });
        },

        restore: async (request, response) => {
            if (String(request.get('X-TOP-GYM-RESTORE-CONFIRM') || '').toUpperCase() !== 'RESTORE') {
                return response.status(400).json({ error: 'Restore must be explicitly confirmed from the administration screen.', code: 'RESTORE_CONFIRMATION_REQUIRED' });
            }
            const fileName = String(request.get('X-BACKUP-FILENAME') || 'tenant-backup.json.gz').slice(0, 260);
            const result = await recovery.restoreTenantBackup(request.body, {
                actorUserId: request.auth?.id,
                reason: requestReason(request),
                fileName
            });
            return response.json(result);
        },

        restoreRecord: async (request, response) => {
            if (String(request.get('X-TOP-GYM-RESTORE-CONFIRM') || '').toUpperCase() !== 'RESTORE') {
                return response.status(400).json({ error: 'Restore must be explicitly confirmed from the administration screen.', code: 'RESTORE_CONFIRMATION_REQUIRED' });
            }
            const result = await recovery.restoreTenantBackupRecord(request.params.id, {
                actorUserId: request.auth?.id,
                reason: requestReason(request)
            });
            return response.json(result);
        },

        // Kept as a narrow compatibility surface for callers that still
        // import the old controller. New errors are intentionally safe and
        // never include SQL, storage paths, or stack traces.
        safeError: (error) => safeOperationalError(error, 'Backup operation failed.')
    };
}

module.exports = { createBackupController, legacyArchiveView, sendBackupDownload };
