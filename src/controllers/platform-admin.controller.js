'use strict';

function sendBackupDownload(response, backup) {
    response.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Content-Type': backup.contentType || 'application/gzip',
        'Content-Disposition': `attachment; filename="${String(backup.fileName || 'logic-fit-backup.json.gz').replace(/["\\\r\n]/g, '')}"`,
        'Content-Length': String(backup.body?.length || 0),
        'X-Content-Type-Options': 'nosniff'
    });
    return response.send(backup.body);
}

function requiredReason(request) {
    return String(request.body?.reason || request.get?.('x-backup-reason') || '').trim().slice(0, 1000);
}

function createPlatformAdminController({ platformAdminService, saasService, authService, backupRecoveryService }) {
    const meta = (request) => platformAdminService.requestMeta(request);
    return {
        dashboard: async (request, response) => {
            response.json(await platformAdminService.getDashboard({ from: request.query?.from, to: request.query?.to, readOnly: request.readOnlyRequest }));
        },

        tenants: async (request, response) => {
            response.json(await platformAdminService.listTenants({
                search: request.query?.search,
                status: request.query?.status,
                plan: request.query?.plan,
                sort: request.query?.sort,
                direction: request.query?.direction,
                page: request.query?.page,
                pageSize: request.query?.pageSize,
                expiringDays: request.query?.expiringDays,
                readOnly: request.readOnlyRequest
            }));
        },

        createTenant: async (request, response) => {
            response.status(201).json(await saasService.createTenantWithOwner(request.body || {}, request.auth?.id, authService));
        },

        tenant: async (request, response) => {
            response.json(await platformAdminService.getTenantProfile(request.params.tenantId, {
                paymentsPage: request.query?.paymentsPage,
                paymentsPageSize: request.query?.paymentsPageSize,
                readOnly: request.readOnlyRequest
            }));
        },

        updateTenant: async (request, response) => {
            response.json(await platformAdminService.updateTenantProfile(request.params.tenantId, request.body || {}, request.auth?.id, meta(request)));
        },

        status: async (request, response) => {
            response.json(await platformAdminService.updateTenantStatus(request.params.tenantId, request.body || {}, request.auth?.id, meta(request)));
        },

        subscription: async (request, response) => {
            const tenantId = request.params.tenantId;
            if (request.method === 'GET') {
                const readOnly = request.readOnlyRequest;
                const subscription = await saasService.getCurrentSubscription(tenantId, { readOnly });
                const entitlements = await saasService.getEffectiveEntitlements(tenantId, subscription, { readOnly });
                return response.json({ subscription, entitlements });
            }
            return response.json(await platformAdminService.updateTenantSubscription(tenantId, request.body || {}, request.auth?.id, meta(request)));
        },

        usage: async (request, response) => {
            const tenantId = request.params.tenantId;
            const subscription = await saasService.getCurrentSubscription(tenantId, { readOnly: request.readOnlyRequest });
            const [usage, entitlements] = await Promise.all([
                saasService.getUsage(tenantId, { readOnly: request.readOnlyRequest }),
                saasService.getEffectiveEntitlements(tenantId, subscription, { readOnly: request.readOnlyRequest })
            ]);
            response.json({ usage, entitlements });
        },

        plan: async (request, response) => {
            response.json(await platformAdminService.updateTenantSubscription(request.params.tenantId, { ...(request.body || {}), action: 'change_plan' }, request.auth?.id, meta(request)));
        },

        overrides: async (request, response) => {
            const tenantId = request.params.tenantId;
            if (request.method === 'GET') {
                const readOnly = request.readOnlyRequest;
                return response.json({
                    overrides: await saasService.getTenantOverrides(tenantId, { readOnly }),
                    entitlements: await saasService.getEffectiveEntitlements(tenantId, null, { readOnly })
                });
            }
            return response.json(await platformAdminService.updateOverrides(tenantId, request.body || {}, request.auth?.id, meta(request)));
        },

        users: async (request, response) => {
            response.json({ users: await platformAdminService.getTenantUsers(request.params.tenantId) });
        },

        userStatus: async (request, response) => {
            response.json(await platformAdminService.updateTenantUserStatus(request.params.tenantId, request.params.userId, request.body?.status, request.auth?.id, meta(request)));
        },

        resetPassword: async (request, response) => {
            response.json(await platformAdminService.resetTenantUserPassword(request.params.tenantId, request.params.userId, request.body?.newPassword, request.auth?.id, authService, meta(request)));
        },

        owner: async (request, response) => {
            response.status(201).json(await platformAdminService.createOrChangeOwner(request.params.tenantId, request.body || {}, request.auth?.id, authService, meta(request)));
        },

        health: async (request, response) => {
            const tenantId = request.params.tenantId;
            const subscription = await saasService.getCurrentSubscription(tenantId, { readOnly: request.readOnlyRequest });
            const [usage, entitlements] = await Promise.all([
                saasService.getUsage(tenantId, { readOnly: request.readOnlyRequest }),
                saasService.getEffectiveEntitlements(tenantId, subscription, { readOnly: request.readOnlyRequest })
            ]);
            response.json(await platformAdminService.getTenantHealth(tenantId, { subscription, usage, entitlements }));
        },

        audit: async (request, response) => {
            response.json({ audit: await saasService.listAudit({ tenantId: request.params.tenantId, limit: request.query?.limit, readOnly: request.readOnlyRequest }) });
        },

        notes: async (request, response) => {
            if (request.method === 'GET') return response.json({ notes: await platformAdminService.getTenantNotes(request.params.tenantId) });
            return response.status(201).json({ note: await platformAdminService.addNote(request.params.tenantId, request.body?.note, request.auth?.id, meta(request)) });
        },

        plans: async (request, response) => {
            response.json({ plans: await saasService.getPlans({ includeInactive: true, readOnly: request.readOnlyRequest }) });
        },

        createPlan: async (request, response) => {
            response.status(201).json({ plan: await saasService.createPlan(request.body || {}, request.auth?.id, meta(request)) });
        },

        updatePlan: async (request, response) => {
            response.json({ plan: await saasService.updatePlan(request.params.planId, request.body || {}, request.auth?.id, meta(request)) });
        },

        deletePlan: async (request, response) => {
            response.json({ plan: await saasService.deletePlan(request.params.planId, request.auth?.id, request.body?.reason, meta(request)) });
        },

        requests: async (request, response) => {
            response.json(await saasService.listPlatformRequests({ status: request.query?.status || '', page: request.query?.page, pageSize: request.query?.pageSize, readOnly: request.readOnlyRequest, includePagination: true }));
        },

        approveRequest: async (request, response) => {
            response.json(await saasService.approveRequest(request.params.requestId, request.auth?.id, request.body?.reviewNotes || request.body?.notes));
        },

        rejectRequest: async (request, response) => {
            response.json({ request: await saasService.rejectRequest(request.params.requestId, request.auth?.id, request.body?.reviewNotes || request.body?.reason) });
        },

        paymentProof: async (request, response) => {
            const proof = await saasService.getPaymentProofFile(request.params.proofId, null, { readOnly: request.readOnlyRequest });
            if (!proof) return response.status(404).end();
            response.set({
                'Cache-Control': 'no-store, no-cache, must-revalidate, private',
                'Content-Type': proof.mime_type,
                'Content-Disposition': `inline; filename="${String(proof.file_name || 'payment-proof').replace(/[^\w.\- ]/g, '_')}"`
            });
            return response.send(proof.content);
        },

        auditAll: async (request, response) => {
            response.json({ audit: await saasService.listAudit({ limit: request.query?.limit, readOnly: request.readOnlyRequest }) });
        },

        backupHealth: async (request, response) => {
            if (!backupRecoveryService) return response.status(503).json({ error: 'Backup recovery service is not configured.', code: 'BACKUP_RECOVERY_NOT_CONFIGURED' });
            response.json(await backupRecoveryService.getPlatformBackupHealth({
                limit: request.query?.limit,
                readOnly: request.readOnlyRequest
            }));
        },

        backupHistory: async (request, response) => {
            if (!backupRecoveryService) return response.status(503).json({ error: 'Backup recovery service is not configured.', code: 'BACKUP_RECOVERY_NOT_CONFIGURED' });
            const [backups, audit] = await Promise.all([
                backupRecoveryService.getPlatformBackupHistory({ limit: request.query?.limit, readOnly: request.readOnlyRequest }),
                backupRecoveryService.getPlatformBackupAudit({ limit: request.query?.auditLimit, readOnly: request.readOnlyRequest })
            ]);
            response.json({ backups, audit });
        },

        runPlatformBackup: async (request, response) => {
            if (!backupRecoveryService) return response.status(503).json({ error: 'Backup recovery service is not configured.', code: 'BACKUP_RECOVERY_NOT_CONFIGURED' });
            const backupType = String(request.body?.backupType || 'platform_manual').trim().toLowerCase();
            const reason = requiredReason(request);
            if (backupType === 'platform_manual' && !reason) return response.status(400).json({ error: 'A reason is required before starting a platform backup.', code: 'BACKUP_REASON_REQUIRED' });
            const result = await backupRecoveryService.createPlatformBackup({
                backupType,
                format: 'json.gz',
                actorUserId: request.auth?.id,
                reason
            });
            response.status(result.idempotent ? 200 : 201).json(result);
        },

        runTenantBackup: async (request, response) => {
            if (!backupRecoveryService) return response.status(503).json({ error: 'Backup recovery service is not configured.', code: 'BACKUP_RECOVERY_NOT_CONFIGURED' });
            const reason = requiredReason(request);
            if (!reason) return response.status(400).json({ error: 'A reason is required before starting a tenant backup.', code: 'BACKUP_REASON_REQUIRED' });
            const result = await backupRecoveryService.createTenantBackup({
                tenantId: request.params.tenantId,
                backupType: 'tenant_manual',
                format: 'json.gz',
                actorUserId: request.auth?.id,
                reason
            });
            response.status(result.idempotent ? 200 : 201).json(result);
        },

        tenantBackups: async (request, response) => {
            if (!backupRecoveryService) return response.status(503).json({ error: 'Backup recovery service is not configured.', code: 'BACKUP_RECOVERY_NOT_CONFIGURED' });
            const [backups, audit] = await Promise.all([
                backupRecoveryService.getTenantBackupHistory({ tenantId: request.params.tenantId, limit: request.query?.limit, readOnly: request.readOnlyRequest }),
                backupRecoveryService.getTenantBackupAudit({ tenantId: request.params.tenantId, limit: request.query?.auditLimit, readOnly: request.readOnlyRequest })
            ]);
            response.json({ backups, audit });
        },

        downloadPlatformBackup: async (request, response) => {
            if (!backupRecoveryService) return response.status(503).json({ error: 'Backup recovery service is not configured.', code: 'BACKUP_RECOVERY_NOT_CONFIGURED' });
            return sendBackupDownload(response, await backupRecoveryService.downloadPlatformBackup(request.params.backupId, { readOnly: request.readOnlyRequest, actorUserId: request.auth?.id, auditDownload: true }));
        },

        downloadTenantBackup: async (request, response) => {
            if (!backupRecoveryService) return response.status(503).json({ error: 'Backup recovery service is not configured.', code: 'BACKUP_RECOVERY_NOT_CONFIGURED' });
            return sendBackupDownload(response, await backupRecoveryService.downloadTenantBackup(request.params.backupId, {
                tenantId: request.params.tenantId,
                readOnly: request.readOnlyRequest,
                actorUserId: request.auth?.id,
                auditDownload: true
            }));
        },

        cleanupBackups: async (request, response) => {
            if (!backupRecoveryService) return response.status(503).json({ error: 'Backup recovery service is not configured.', code: 'BACKUP_RECOVERY_NOT_CONFIGURED' });
            const reason = requiredReason(request);
            if (!reason) return response.status(400).json({ error: 'A reason is required before running retention cleanup.', code: 'BACKUP_REASON_REQUIRED' });
            response.json(await backupRecoveryService.cleanupExpiredBackups({
                limit: request.body?.limit,
                concurrency: request.body?.concurrency,
                actorUserId: request.auth?.id,
                reason
            }));
        }
    };
}

module.exports = { createPlatformAdminController, sendBackupDownload };
