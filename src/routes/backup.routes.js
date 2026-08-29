'use strict';

const express = require('express');
const { createBackupController } = require('../controllers/backup.controller');

function registerBackupRoutes(app, { backupService, backupRecoveryService, brandingService, asyncRoute, isAuthorizedCronRequest, backupActionRateLimit }) {
    const controller = createBackupController({ backupService, backupRecoveryService, brandingService, isAuthorizedCronRequest });
    const backupUploadBody = express.raw({
        type: ['application/gzip', 'application/x-gzip', 'application/octet-stream'],
        limit: '25mb'
    });

    app.get('/api/backup/daily', asyncRoute(controller.daily));
    app.get('/api/backup/download', backupActionRateLimit, asyncRoute(controller.download));
    app.get('/api/backup/status', asyncRoute(controller.status));
    app.post('/api/backup/records', asyncRoute(controller.create));
    app.get('/api/backup/history', asyncRoute(controller.history));
    app.get('/api/backup/archives/:id', backupActionRateLimit, asyncRoute(controller.archive));
    app.get('/api/backup/records/:id/download', backupActionRateLimit, asyncRoute(controller.recordDownload));
    app.delete('/api/backup/archives/:id', backupActionRateLimit, asyncRoute(controller.deleteArchive));
    app.delete('/api/backup/records/:id', backupActionRateLimit, asyncRoute(controller.deleteArchive));
    app.post('/api/backup/records/:id/restore', backupActionRateLimit, asyncRoute(controller.restoreRecord));
    app.post('/api/backup/inspect', backupActionRateLimit, backupUploadBody, asyncRoute(controller.inspect));
    app.post('/api/backup/restore', backupActionRateLimit, backupUploadBody, asyncRoute(controller.restore));
}

module.exports = { registerBackupRoutes };
