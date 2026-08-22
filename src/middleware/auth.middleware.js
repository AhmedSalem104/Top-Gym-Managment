'use strict';

const { authorizeRequest, requirePermission } = require('./permission.middleware');
const { protectFinancialResponse } = require('./financial-data.middleware');

function isSameOriginRequest(request) {
    const origin = String(request.get('origin') || '').trim();
    if (!origin) return true;
    try {
        const originUrl = new URL(origin);
        const host = String(request.get('host') || request.get('x-forwarded-host') || '').split(',')[0].trim();
        return originUrl.host === host;
    } catch (_) {
        return false;
    }
}

function createAuthApiMiddleware({ authService, isAuthorizedCronRequest }) {
    const { ensureAuthReady, getSessionUser, readSessionCookie } = authService;
    return (request, response, next) => {
        const publicPath = ['/health', '/auth/login', '/auth/session', '/auth/logout', '/member-portal/lookup', '/member-portal/feedback'].includes(request.path);
        if (publicPath || (request.path === '/backup/daily' && isAuthorizedCronRequest(request))) return next();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isSameOriginRequest(request)) {
            return response.status(403).json({ error: 'الطلب غير مصرح به.' });
        }
        return ensureAuthReady()
            .then(() => getSessionUser(readSessionCookie(request)))
            .then((user) => {
                if (!user) return response.status(401).json({ error: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.', code: 'AUTH_REQUIRED' });
                if (!authorizeRequest(user, request)) {
                    return response.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.', code: 'FORBIDDEN' });
                }
                request.auth = user;
                // Field-level protection complements the route-level
                // permission. A permitted screen cannot leak balances or
                // payment data when finance.read is disabled.
                protectFinancialResponse(request, response);
                return next();
            })
            .catch(next);
    };
}

function ownerOnly(request, response, next) {
    return requirePermission('__owner_only__', { ownerOnly: true })(request, response, next);
}

module.exports = { createAuthApiMiddleware, isSameOriginRequest, ownerOnly, requirePermission };
