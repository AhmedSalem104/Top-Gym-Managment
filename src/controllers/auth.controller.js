'use strict';

function createAuthController({ authService, allowLoginAttempt }) {
    return {
        session: async (request, response) => {
            const setup = await authService.ensureAuthReady();
            const user = await authService.getSessionUser(authService.readSessionCookie(request));
            response.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            response.json({ authenticated: Boolean(user), user: user || null, setupRequired: Boolean(setup?.setupRequired) });
        },

        login: async (request, response) => {
            if (!allowLoginAttempt(request, request.body?.email)) {
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
        }
    };
}

module.exports = { createAuthController };
