'use strict';

const { authorizeRequest, requirePermission } = require('./permission.middleware');
const { protectFinancialResponse } = require('./financial-data.middleware');
const { runTenantContext } = require('../tenancy/tenant-context');

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

function requestedTenantSlug(request) {
    return request.get('x-gym-slug')
        || request.query?.tenant
        || request.body?.tenantSlug
        || request.body?.gymSlug
        || '';
}

function createAuthApiMiddleware({ authService, isAuthorizedCronRequest, tenantService }) {
    const { ensureAuthReady, getSessionUser, readSessionCookie } = authService;
    return (request, response, next) => {
        const publicPath = ['/health', '/auth/login', '/auth/session', '/auth/logout', '/member-portal/lookup', '/member-portal/feedback', '/branding'].includes(request.path)
            || request.path === '/member-portal/library/options'
            || request.path.startsWith('/member-portal/library/')
            || (request.method === 'GET' && request.path.startsWith('/branding/assets/'));
        const cronRequest = request.path === '/backup/daily' && isAuthorizedCronRequest(request);

        if (publicPath || cronRequest) {
            return tenantService.resolvePublicTenant(requestedTenantSlug(request))
                .then((tenant) => {
                    if (!tenant) return response.status(404).json({ error: 'الجيم المطلوب غير موجود.', code: 'TENANT_NOT_FOUND' });
                    request.tenant = tenant;
                    return runTenantContext({ tenantId: tenant.id, mode: cronRequest ? 'platform' : 'public' }, next);
                })
                .catch(next);
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isSameOriginRequest(request)) {
            return response.status(403).json({ error: 'الطلب غير مصرح به.' });
        }

        return ensureAuthReady()
            .then(() => getSessionUser(readSessionCookie(request), { includePermissions: false }))
            .then((user) => {
                if (!user) return response.status(401).json({ error: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.', code: 'AUTH_REQUIRED' });
                return tenantService.resolveTenantForUser(user.id, requestedTenantSlug(request)).then((tenant) => {
                    if (!tenant) return response.status(403).json({ error: 'لا يوجد اشتراك نشط لهذا الحساب في الجيم المطلوب.', code: 'TENANT_ACCESS_REQUIRED' });
                    request.tenant = tenant;
                    return runTenantContext({ tenantId: tenant.id, userId: user.id, mode: 'tenant' }, async () => {
                        user = await authService.withPermissions(user);
                        if (!authorizeRequest(user, request)) {
                            return response.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.', code: 'FORBIDDEN' });
                        }
                        request.auth = user;
                        // Field-level protection complements the route-level
                        // permission. A permitted screen cannot leak balances or
                        // payment data when finance.read is disabled.
                        protectFinancialResponse(request, response);
                        return next();
                    });
                });
            })
            .catch(next);
    };
}

function ownerOnly(request, response, next) {
    return requirePermission('__owner_only__', { ownerOnly: true })(request, response, next);
}

module.exports = { createAuthApiMiddleware, isSameOriginRequest, ownerOnly, requirePermission };
