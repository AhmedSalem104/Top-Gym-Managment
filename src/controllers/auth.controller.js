'use strict';

function createAuthController({ authService, permissionService, allowLoginAttempt }) {
    return {
        session: async (request, response) => {
            const readOnly = Boolean(request.readOnlyBaseline);
            const setup = readOnly ? { setupRequired: false } : await authService.ensureAuthReady();
            const user = await authService.getSessionUser(authService.readSessionCookie(request), {
                ensureReady: !readOnly,
                touch: !readOnly,
                readOnly
            });
            response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            response.json({ authenticated: Boolean(user), user: user || null, setupRequired: Boolean(setup?.setupRequired) });
        },

        login: async (request, response) => {
            if (!await allowLoginAttempt(request, request.body?.email)) {
                response.set('Retry-After', '900');
                return response.status(429).json({ error: 'محاولات دخول كثيرة. حاول بعد قليل.', code: 'LOGIN_RATE_LIMITED' });
            }
            const result = await authService.login(request.body || {}, request);
            authService.appendCookie(response, authService.sessionCookie(result.token, result.expiresAt, request));
            response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            response.json({ user: result.user, expiresAt: result.expiresAt.toISOString() });
        },

        logout: async (request, response) => {
            await authService.revokeSession(authService.readSessionCookie(request));
            authService.appendCookie(response, authService.clearSessionCookie(request));
            response.status(204).send();
        },

        listUsers: async (_request, response) => {
            response.json({ users: await authService.listUsers() });
        },

        createAssistant: async (request, response) => {
            response.status(201).json({ user: await authService.createAssistant(request.body || {}) });
        },

        updateUser: async (request, response) => {
            response.json({ user: await authService.updateUser(request.params.id, request.body || {}) });
        },

        setStatus: async (request, response) => {
            response.json({ user: await authService.setAssistantStatus(request.params.id, request.body?.status) });
        },

        deleteUser: async (request, response) => {
            response.json(await authService.deleteAssistant(request.params.id));
        },

        permissionsCatalog: async (_request, response) => {
            response.json({ permissions: permissionService.catalog() });
        },

        userPermissions: async (request, response) => {
            response.json(await permissionService.getUserPermissionState(request.params.id));
        },

        updateUserPermissions: async (request, response) => {
            const result = await permissionService.updateUserPermissions(
                request.params.id,
                request.auth.id,
                request.body?.permissions,
                {
                    reason: request.body?.reason,
                    ipAddress: request.ip || request.socket?.remoteAddress,
                    userAgent: request.get('user-agent')
                }
            );
            response.json(result);
        },

        resetUserPermissions: async (request, response) => {
            const result = await permissionService.resetUserPermissions(
                request.params.id,
                request.auth.id,
                {
                    reason: request.body?.reason,
                    ipAddress: request.ip || request.socket?.remoteAddress,
                    userAgent: request.get('user-agent')
                }
            );
            response.json(result);
        }
    };
}

module.exports = { createAuthController };
