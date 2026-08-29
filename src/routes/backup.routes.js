'use strict';

const express = require('express');
const { createBackupController } = require('../controllers/backup.controller');

function registerBackupRoutes(app, { backupService, backupRecoveryService, brandingService, asyncRoute, isAuthorizedCronRequest }) {
    const controller = createBackupController({ backupService, backupRecoveryService, brandingService, isAuthorizedCronRequest });
    const backupUploadBody = express.raw({
        type: ['application/gzip', 'application/x-gzip', 'application/octet-stream'],
        limit: '25mb'
    });

    app.get('/api/backup/daily', asyncRoute(controller.daily));
    app.get('/api/backup/download', asyncRoute(controller.download));
    app.get('/api/backup/history', asyncRoute(controller.history));
    app.get('/api/backup/archives/:id', asyncRoute(controller.archive));
    app.delete('/api/backup/archives/:id', asyncRoute(controller.deleteArchive));
    app.post('/api/backup/inspect', backupUploadBody, asyncRoute(controller.inspect));
    app.post('/api/backup/restore', backupUploadBody, asyncRoute(controller.restore));
}

module.exports = { registerBackupRoutes };
