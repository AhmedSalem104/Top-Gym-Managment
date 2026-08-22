'use strict';

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
    const { canAccess, ensureAuthReady, getSessionUser, readSessionCookie } = authService;
    return (request, response, next) => {
        const publicPath = ['/health', '/auth/login', '/auth/session', '/auth/logout', '/member-portal/lookup'].includes(request.path);
        if (publicPath || (request.path === '/backup/daily' && isAuthorizedCronRequest(request))) return next();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isSameOriginRequest(request)) {
            return response.status(403).json({ error: 'الطلب غير مصرح به.' });
        }
        return ensureAuthReady()
            .then(() => getSessionUser(readSessionCookie(request)))
            .then((user) => {
                if (!user) return response.status(401).json({ error: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.', code: 'AUTH_REQUIRED' });
                if (!canAccess(user, request)) return response.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.', code: 'FORBIDDEN' });
                request.auth = user;
                return next();
            })
            .catch(next);
    };
}

function ownerOnly(request, response, next) {
    if (request.auth?.role !== 'Owner') return response.status(403).json({ error: 'هذا الإجراء متاح لمالك النظام فقط.', code: 'OWNER_REQUIRED' });
    return next();
}

module.exports = { createAuthApiMiddleware, isSameOriginRequest, ownerOnly };
