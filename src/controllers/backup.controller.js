'use strict';

function createBackupController({ backupService, brandingService, isAuthorizedCronRequest }) {
    const {
        createBackup,
        createScheduledBackupArchive,
        deleteBackupArchive,
        getBackupArchive,
        getBackupHistory,
        getScheduledBackupHistory,
        inspectBackupBuffer,
        recordBackupOperation,
        restoreBackup
    } = backupService;

    return {
        daily: async (request, response) => {
            if (!isAuthorizedCronRequest(request)) return response.status(401).json({ error: 'طلب الجدولة غير مصرح به.' });
            const result = await createScheduledBackupArchive({ format: 'bak' });
            response.json({ ok: true, scheduled: true, ...result });
        },
        download: async (request, response) => {
            const requestedFormat = String(request.query.format || 'json.gz').toLowerCase();
            if (!['json.gz', 'bak'].includes(requestedFormat)) {
                return response.status(400).json({ error: 'صيغة النسخة غير مدعومة. اختر .json.gz أو .bak.' });
            }
            const backup = await createBackup({ format: requestedFormat });
            const brandName = brandingService ? await brandingService.getPublicBrandName('الجيم') : 'الجيم';
            await recordBackupOperation({
                operationType: 'download',
                fileName: backup.filename,
                sourceGeneratedAt: backup.generatedAt,
                tableCounts: backup.rowCounts,
                details: `تم إنشاء نسخة ${brandName} بصيغة .${backup.format} وتنزيلها على جهاز المستخدم.`
            }).catch((error) => console.warn('Unable to record backup download:', error.message));
            response.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                'Content-Type': backup.format === 'bak' ? 'application/octet-stream' : 'application/gzip',
                'Content-Disposition': `attachment; filename="${backup.filename}"`,
                'Content-Length': String(backup.buffer.length),
                'X-Content-Type-Options': 'nosniff'
            });
            response.send(backup.buffer);
        },
        history: async (request, response) => {
            const [operations, archives] = await Promise.all([
                getBackupHistory(request.query.limit),
                getScheduledBackupHistory(request.query.archiveLimit || 10)
            ]);
            response.json({ operations, archives });
        },
        archive: async (request, response) => {
            const archive = await getBackupArchive(request.params.id);
            response.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                'Content-Type': archive.format === 'bak' ? 'application/octet-stream' : 'application/gzip',
                'Content-Disposition': `attachment; filename="${archive.fileName}"`,
                'Content-Length': String(archive.contentBytes),
                'X-Content-Type-Options': 'nosniff'
            });
            response.send(archive.content);
        },
        deleteArchive: async (request, response) => {
            await deleteBackupArchive(request.params.id);
            response.status(204).send();
        },
        inspect: async (request, response) => {
            const fileName = String(request.get('X-BACKUP-FILENAME') || 'uploaded-backup.json.gz').slice(0, 260);
            try {
                const inspected = await inspectBackupBuffer(request.body);
                await recordBackupOperation({
                    operationType: 'inspect',
                    fileName,
                    sourceGeneratedAt: inspected.generatedAt,
                    tableCounts: inspected.tableCounts,
                    details: 'تم التحقق من ضغط النسخة وبنيتها قبل الاسترجاع.'
                }).catch((error) => console.warn('Unable to record backup inspection:', error.message));
                return response.json({
                    valid: true,
                    generatedAt: inspected.generatedAt,
                    timeZone: inspected.timeZone,
                    compressedBytes: inspected.compressedBytes,
                    jsonBytes: inspected.jsonBytes,
                    rowCount: inspected.rowCount,
                    tableCounts: inspected.tableCounts,
                    integrity: inspected.integrity
                });
            } catch (error) {
                await recordBackupOperation({ operationType: 'inspect', fileName, status: 'failed', details: error.message })
                    .catch((recordError) => console.warn('Unable to record failed backup inspection:', recordError.message));
                throw error;
            }
        },
        restore: async (request, response) => {
            if (String(request.get('X-TOP-GYM-RESTORE-CONFIRM') || '').toUpperCase() !== 'RESTORE') {
                return response.status(400).json({ error: 'يجب تأكيد عملية الاسترجاع من شاشة الإدارة.' });
            }
            const fileName = String(request.get('X-BACKUP-FILENAME') || 'uploaded-backup.json.gz').slice(0, 260);
            try {
                const result = await restoreBackup(request.body, { fileName });
                return response.json({ restored: true, ...result });
            } catch (error) {
                await recordBackupOperation({ operationType: 'restore', fileName, status: 'failed', details: error.message })
                    .catch((recordError) => console.warn('Unable to record failed backup restore:', recordError.message));
                throw error;
            }
        }
    };
}

module.exports = { createBackupController };
