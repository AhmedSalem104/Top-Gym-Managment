'use strict';

function registerNotificationRoutes(app, { notificationService, asyncRoute } = {}) {
    if (!notificationService) return;
    app.get('/api/notifications', asyncRoute(async (request, response) => {
        response.json(await notificationService.listForUser({
            userId: request.auth?.id,
            role: request.auth?.role,
            tenantId: request.tenant?.id ?? null,
            page: request.query?.page,
            pageSize: request.query?.pageSize,
            unreadOnly: String(request.query?.unreadOnly || '').toLowerCase() === 'true',
            category: request.query?.category
        }));
    }));
    app.get('/api/notifications/unread-count', asyncRoute(async (request, response) => {
        response.json({ unread: await notificationService.unreadCount({
            userId: request.auth?.id,
            role: request.auth?.role,
            tenantId: request.tenant?.id ?? null
        }) });
    }));
    app.post('/api/notifications/:id/read', asyncRoute(async (request, response) => {
        response.json(await notificationService.markRead({
            userId: request.auth?.id,
            role: request.auth?.role,
            tenantId: request.tenant?.id ?? null,
            notificationId: request.params.id
        }));
    }));
    app.post('/api/notifications/read-all', asyncRoute(async (request, response) => {
        response.json(await notificationService.markAllRead({
            userId: request.auth?.id,
            role: request.auth?.role,
            tenantId: request.tenant?.id ?? null
        }));
    }));
}

module.exports = { registerNotificationRoutes };
