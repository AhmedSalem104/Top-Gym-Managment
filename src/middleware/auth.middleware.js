'use strict';

const { authorizeRequest, requirePermission } = require('./permission.middleware');
const { protectFinancialResponse } = require('./financial-data.middleware');
const { runTenantContext } = require('../tenancy/tenant-context');
const { ROLES } = require('../permissions/roles');

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

function createAuthApiMiddleware({ authService, isAuthorizedCronRequest, tenantService, saasService }) {
    const { ensureAuthReady, getSessionUser, readSessionCookie } = authService;
    return (request, response, next) => {
        const authPublicPath = ['/auth/login', '/auth/session', '/auth/logout'].includes(request.path);
        const tenantBrandingPath = request.method === 'GET'
            && (request.path === '/branding' || request.path.startsWith('/branding/assets/'));
        const platformBrandingRequest = tenantBrandingPath
            && String(request.query?.scope || '').trim().toLowerCase() === 'platform';
        const publicPath = ['/health', '/member-portal/lookup', '/member-portal/feedback', '/branding'].includes(request.path)
            || request.path === '/member-portal/library/options'
            || request.path.startsWith('/member-portal/library/')
            || (request.method === 'GET' && request.path.startsWith('/branding/assets/'));
        const cronRequest = request.path === '/backup/daily' && isAuthorizedCronRequest(request);
        const platformPath = request.path.startsWith('/platform/') || request.path.startsWith('/platform-admin/');

        // Authentication endpoints do not read tenant data. Keeping their
        // context tenant-neutral is important for PlatformAdmin: the
        // platform account must not depend on Top Gym or any other fallback
        // tenant just to create/read a session.
        if (authPublicPath) {
            return runTenantContext({ tenantId: null, mode: 'public' }, next);
        }

        // Branding is public for the login screen, but an authenticated gym
        // user must receive the branding of a tenant they actually belong to.
        // Resolving it through the public fallback would make every logged-in
        // gym temporarily inherit Top Gym's identity and assets.
        if (tenantBrandingPath) {
            if (platformBrandingRequest) return runTenantContext({ tenantId: null, mode: 'platform' }, next);
            return ensureAuthReady()
                .then(() => getSessionUser(readSessionCookie(request), { includePermissions: false }))
                .then((user) => {
                    if (user && user.role !== ROLES.PLATFORM_ADMIN) {
                        return tenantService.resolveTenantForUser(user.id, requestedTenantSlug(request)).then((tenant) => {
                            if (!tenant) return response.status(403).json({ error: 'Tenant access is required for this branding request.', code: 'TENANT_ACCESS_REQUIRED' });
                            request.tenant = tenant;
                            return runTenantContext({ tenantId: tenant.id, userId: user.id, mode: 'tenant' }, next);
                        });
                    }
                    return tenantService.resolvePublicTenant(requestedTenantSlug(request)).then((tenant) => {
                        if (!tenant) return response.status(404).json({ error: 'Gym not found.', code: 'TENANT_NOT_FOUND' });
                        request.tenant = tenant;
                        return runTenantContext({ tenantId: tenant.id, mode: 'public' }, next);
                    });
                })
                .catch(next);
        }

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
                if (platformPath) {
                    if (user.role !== ROLES.PLATFORM_ADMIN) {
                        return response.status(403).json({ error: 'هذه المساحة مخصصة لمدير المنصة فقط.', code: 'PLATFORM_ADMIN_REQUIRED' });
                    }
                    return runTenantContext({ tenantId: null, userId: user.id, mode: 'platform' }, async () => {
                        request.auth = await authService.withPermissions(user);
                        return next();
                    });
                }
                return tenantService.resolveTenantForUser(user.id, requestedTenantSlug(request)).then((tenant) => {
                    if (!tenant) return response.status(403).json({ error: 'لا يوجد اشتراك نشط لهذا الحساب في الجيم المطلوب.', code: 'TENANT_ACCESS_REQUIRED' });
                    request.tenant = tenant;
                    return runTenantContext({ tenantId: tenant.id, userId: user.id, mode: 'tenant' }, async () => {
                        user = await authService.withPermissions(user);
                        if (saasService) {
                            request.saas = await saasService.enforceTenantAccess(tenant.id, { path: request.path, method: request.method });
                            await saasService.enforceRequestLimit(tenant.id, {
                                path: request.path,
                                method: request.method,
                                incomingBytes: request.get('content-length'),
                                access: request.saas
                            });
                        }
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
