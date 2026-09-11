'use strict';

function registerNotificationRoutes(app, { notificationService, commercialService, asyncRoute } = {}) {
    if (!notificationService) return;
    const stream = (request, response, filter) => new Promise((resolve) => {
        response.status(200);
        response.set({
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        response.flushHeaders?.();
        response.write(': connected\n\n');
        const unsubscribe = notificationService.subscribe(filter, (payload) => {
            if (response.writableEnded) return;
            response.write(`event: notification\ndata: ${JSON.stringify(payload)}\n\n`);
        });
        const heartbeat = setInterval(() => {
            if (!response.writableEnded) response.write(': heartbeat\n\n');
        }, 25_000);
        const close = () => {
            clearInterval(heartbeat);
            unsubscribe();
            resolve();
        };
        request.once('close', close);
        response.once('close', close);
    });
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

    app.get('/api/notifications/stream', asyncRoute(async (request, response) => stream(request, response, {
        kind: 'user', userId: request.auth?.id, role: request.auth?.role, tenantId: request.tenant?.id ?? null
    })));

    if (!commercialService?.withPortalSession) return;
    const withPortalSession = (request, callback) => commercialService.withPortalSession(request, callback);
    app.get('/api/member-portal/notifications', asyncRoute(async (request, response) => {
        await withPortalSession(request, async (session) => {
            response.set('Cache-Control', 'private, no-store');
            response.json(await notificationService.listForPortalMember({
                memberId: session.memberId, tenantId: session.tenantId, page: request.query?.page,
                pageSize: request.query?.pageSize, unreadOnly: String(request.query?.unreadOnly || '').toLowerCase() === 'true',
                category: request.query?.category
            }));
        });
    }));
    app.get('/api/member-portal/notifications/unread-count', asyncRoute(async (request, response) => {
        await withPortalSession(request, async (session) => {
            response.set('Cache-Control', 'private, no-store');
            response.json({ unread: await notificationService.unreadCountForPortalMember(session) });
        });
    }));
    app.post('/api/member-portal/notifications/:id/read', asyncRoute(async (request, response) => {
        await withPortalSession(request, async (session) => {
            response.json(await notificationService.markPortalRead({ ...session, notificationId: request.params.id }));
        });
    }));
    app.post('/api/member-portal/notifications/read-all', asyncRoute(async (request, response) => {
        await withPortalSession(request, async (session) => {
            response.json(await notificationService.markPortalAllRead(session));
        });
    }));
    app.get('/api/member-portal/notifications/stream', asyncRoute(async (request, response) => {
        await withPortalSession(request, async (session) => stream(request, response, {
            kind: 'member', memberId: session.memberId, tenantId: session.tenantId
        }));
    }));
}

module.exports = { registerNotificationRoutes };
