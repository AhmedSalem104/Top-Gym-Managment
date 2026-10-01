'use strict';

function createAuthController({ authService, permissionService, allowLoginAttempt, saasService }) {
    const mobileSession = (user) => ({
        user: { id: String(user.id), name: user.name, role: user.role },
        tenant: user._primaryTenant ? { id: String(user._primaryTenant.id), name: user._primaryTenant.name, type: user._primaryTenant.tenantType } : undefined,
        workspace: user.role === 'PlatformAdmin' ? 'platform' : 'gym',
        permissions: user.permissions || [],
        features: [],
        limits: {}
    });
    return {
        session: async (request, response) => {
            const readOnly = Boolean(request.readOnlyRequest);
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

        mobileLogin: async (request, response) => {
            if (!await allowLoginAttempt(request, request.body?.email)) {
                response.set('Retry-After', '900');
                return response.status(429).json({ error: 'محاولات دخول كثيرة. حاول بعد قليل.', code: 'LOGIN_RATE_LIMITED' });
            }
            const result = await authService.mobileLogin(request.body || {}, request);
            response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            response.json({ accessToken: result.accessToken, refreshToken: result.refreshToken, session: mobileSession(result.user), expiresAt: result.expiresAt.toISOString() });
        },

        mobileRefresh: async (request, response) => {
            const result = await authService.mobileRefresh(request.body?.refreshToken, request);
            response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            response.json({ accessToken: result.accessToken, refreshToken: result.refreshToken, session: mobileSession(result.user), expiresAt: result.expiresAt.toISOString() });
        },

        mobileSession: async (request, response) => {
            const user = request.auth || null;
            response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            response.json(user ? mobileSession(user) : { authenticated: false, user: null });
        },

        mobileLogout: async (request, response) => {
            await authService.mobileLogout(authService.readBearerToken(request), request.body?.refreshToken);
            response.status(204).send();
        },

        logout: async (request, response) => {
            await authService.revokeSession(authService.readSessionCookie(request));
            authService.appendCookie(response, authService.clearSessionCookie(request));
            response.status(204).send();
        },

        changePassword: async (request, response) => {
            const result = await authService.changePassword(request.auth?.id, request.body || {}, request, {
                recordAudit: saasService?.recordAudit
            });
            authService.appendCookie(response, authService.sessionCookie(result.token, result.expiresAt, request));
            response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            response.json({ user: result.user, expiresAt: result.expiresAt.toISOString() });
        },

        listUsers: async (request, response) => {
            response.json({ users: await authService.listUsers({ readOnly: request.readOnlyRequest }) });
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
            response.json(await permissionService.getUserPermissionState(request.params.id, { readOnly: request.readOnlyRequest }));
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
