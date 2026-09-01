'use strict';

const { authorizeRequest, requirePermission } = require('./permission.middleware');
const { protectFinancialResponse } = require('./financial-data.middleware');
const { runTenantContext } = require('../tenancy/tenant-context');
const { ROLES } = require('../permissions/roles');
const { READ_ONLY_METHODS } = require('./read-only-baseline.middleware');

function isSameOriginRequest(request) {
    // Fetch Metadata gives browsers an additional signal for state-changing
    // requests. Reject an explicitly cross-site request even when an Origin
    // header is omitted; SameSite cookies remain a second boundary.
    const fetchSite = String(request.get?.('sec-fetch-site') || '').trim().toLowerCase();
    if (fetchSite === 'cross-site') return false;
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
    const assertTenantIsolationReady = typeof tenantService?.assertTenantIsolationReady === 'function'
        ? tenantService.assertTenantIsolationReady
        : async () => {};
    return (request, response, next) => {
        const authPublicPath = ['/auth/login', '/auth/session', '/auth/logout'].includes(request.path);
        const passwordChangePath = request.method === 'POST' && request.path === '/auth/change-password';
        const tenantBrandingPath = request.method === 'GET'
            && (request.path === '/branding' || request.path.startsWith('/branding/assets/'));
        const platformBrandingRequest = tenantBrandingPath
            && String(request.query?.scope || '').trim().toLowerCase() === 'platform';
        const healthPath = ['/health', '/health/live'].includes(request.path);
        // A member-portal session is a separate capability from a gym user
        // session. Let the portal service resolve the tenant from its hashed
        // HttpOnly cookie instead of resolving the public/default tenant here.
        const memberPortalSessionPath = request.path === '/member-portal/session'
            || request.path === '/member-portal/payment-methods'
            || request.path === '/member-portal/membership-catalog'
            || request.path.startsWith('/member-portal/subscription-requests');
        const publicGymRegistrationPath = request.path === '/public/gym-registration/catalog'
            || request.path === '/public/gym-registration/requests'
            || request.path.startsWith('/public/gym-registration/requests/');
        const publicTrainerRegistrationPath = request.path === '/public/trainer-registration/catalog'
            || request.path === '/public/trainer-registration/requests'
            || request.path.startsWith('/public/trainer-registration/requests/');
        const publicPath = ['/health', '/health/live', '/member-portal/lookup', '/member-portal/occupancy', '/member-portal/feedback', '/branding'].includes(request.path)
            || request.path === '/member-portal/library/options'
            || request.path.startsWith('/member-portal/library/')
            || (request.method === 'GET' && request.path.startsWith('/branding/assets/'));
        const cronRequest = request.path === '/backup/daily' && isAuthorizedCronRequest(request);
        const platformPath = request.path.startsWith('/platform/') || request.path.startsWith('/platform-admin/');
        // Normal safe HTTP methods must not trigger schema setup, expiry
        // reconciliation, attendance auto-checkout, session touching, or any
        // other maintenance write. The explicitly authenticated backup cron
        // is the only intentional state-changing GET in this API surface.
        const readOnlyRequest = Boolean(request.readOnlyBaseline)
            || (READ_ONLY_METHODS.has(request.method) && !cronRequest);
        request.readOnlyRequest = readOnlyRequest;

        // Apply the same-origin boundary before public POST endpoints as well
        // as authenticated routes. Public routes do not carry an authenticated
        // tenant session, but cross-site writes could still be abused for
        // login/logout confusion, portal lookup/feedback spam, or future
        // allow-listed public mutations. The authorized backup cron is the
        // only intentional automation exception.
        if (!READ_ONLY_METHODS.has(request.method) && !cronRequest && !isSameOriginRequest(request)) {
            return response.status(403).json({ error: 'The request origin is not allowed.', code: 'CROSS_ORIGIN_REQUEST' });
        }

        // Authentication endpoints do not read tenant data. Keeping their
        // context tenant-neutral is important for PlatformAdmin: the
        // platform account must not depend on Top Gym or any other fallback
        // tenant just to create/read a session.
        if (authPublicPath) {
            return runTenantContext({ tenantId: null, mode: 'public', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, next);
        }

        // Health probes must be tenant-neutral and strictly read-only. In
        // particular, do not resolve the fallback tenant here because that
        // path may bootstrap schema on an uninitialized environment.
        if (healthPath) {
            return runTenantContext({ tenantId: null, mode: 'platform', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, next);
        }

        if (memberPortalSessionPath) {
            return runTenantContext({ tenantId: null, mode: 'public', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, async () => {
                await assertTenantIsolationReady();
                return next();
            }).catch(next);
        }

        // Self-service gym registration is public and platform-scoped. It
        // must never resolve the default/Top Gym tenant from a query string or
        // an old authenticated cookie.
        if (publicGymRegistrationPath) {
            return runTenantContext({ tenantId: null, mode: 'public', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, next);
        }
        if (publicTrainerRegistrationPath) {
            return runTenantContext({ tenantId: null, mode: 'public', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, next);
        }

        // Branding is public for the login screen, but an authenticated gym
        // user must receive the branding of a tenant they actually belong to.
        // Resolving it through the public fallback would make every logged-in
        // gym temporarily inherit Top Gym's identity and assets.
        if (tenantBrandingPath) {
            if (platformBrandingRequest) return runTenantContext({ tenantId: null, mode: 'platform', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, next);
            const readOnlyOptions = { includePermissions: false, ensureReady: !readOnlyRequest, touch: !readOnlyRequest };
            return (readOnlyRequest ? Promise.resolve() : ensureAuthReady())
                .then(() => getSessionUser(readSessionCookie(request), { ...readOnlyOptions, readOnly: readOnlyRequest }))
                .then((user) => {
                    if (user && user.role !== ROLES.PLATFORM_ADMIN) {
                        return tenantService.resolveTenantForUser(user.id, requestedTenantSlug(request), { readOnly: readOnlyRequest }).then((tenant) => {
                            if (!tenant) return response.status(403).json({ error: 'Tenant access is required for this branding request.', code: 'TENANT_ACCESS_REQUIRED' });
                            request.tenant = tenant;
                            return runTenantContext({ tenantId: tenant.id, userId: user.id, mode: 'tenant', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, async () => {
                                await assertTenantIsolationReady();
                                return next();
                            });
                        });
                    }
                    return tenantService.resolvePublicTenant(requestedTenantSlug(request), { readOnly: readOnlyRequest }).then((tenant) => {
                        if (!tenant) return response.status(404).json({ error: 'Gym not found.', code: 'TENANT_NOT_FOUND' });
                        request.tenant = tenant;
                        return runTenantContext({ tenantId: tenant.id, mode: 'public', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, next);
                    });
                })
                .catch(next);
        }

        // Scheduled backup automation is platform-scoped. It must never
        // resolve a public/default tenant; the orchestrator resolves each
        // eligible tenant explicitly.
        if (cronRequest) {
            return runTenantContext({ tenantId: null, mode: 'platform', readOnlyBaseline: false }, async () => {
                await assertTenantIsolationReady();
                return next();
            }).catch(next);
        }

        if (publicPath) {
            return tenantService.resolvePublicTenant(requestedTenantSlug(request), { readOnly: readOnlyRequest })
                .then((tenant) => {
                    if (!tenant) return response.status(404).json({ error: 'الجيم المطلوب غير موجود.', code: 'TENANT_NOT_FOUND' });
                    request.tenant = tenant;
                    return runTenantContext({ tenantId: tenant.id, mode: 'public', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, async () => {
                        await assertTenantIsolationReady();
                        return next();
                    });
                })
                .catch(next);
        }
        const readOnlyOptions = { includePermissions: false, ensureReady: !readOnlyRequest, touch: !readOnlyRequest };
        return (readOnlyRequest ? Promise.resolve() : ensureAuthReady())
            .then(() => getSessionUser(readSessionCookie(request), { ...readOnlyOptions, readOnly: readOnlyRequest }))
            .then((user) => {
                if (!user) return response.status(401).json({ error: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.', code: 'AUTH_REQUIRED' });
                // A forced-password session may only inspect its session,
                // logout, or complete this endpoint. Enforce this before
                // route permissions/SaaS checks so another API cannot bypass
                // the first-login restriction.
                if (passwordChangePath) {
                    if (user.role === ROLES.PLATFORM_ADMIN) {
                        return runTenantContext({ tenantId: null, userId: user.id, mode: 'platform', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, async () => {
                            request.auth = await authService.withPermissions(user, { readOnly: readOnlyRequest });
                            return next();
                        });
                    }
                    return tenantService.resolveTenantForUser(user.id, requestedTenantSlug(request), { readOnly: readOnlyRequest }).then((tenant) => {
                        if (!tenant) return response.status(403).json({ error: 'Tenant access is required to change this password.', code: 'TENANT_ACCESS_REQUIRED' });
                        request.tenant = tenant;
                        return runTenantContext({ tenantId: tenant.id, userId: user.id, mode: 'tenant', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, async () => {
                            await assertTenantIsolationReady();
                            request.auth = await authService.withPermissions(user, { readOnly: readOnlyRequest });
                            return next();
                        });
                    });
                }
                if (user.mustChangePassword) {
                    return response.status(403).json({ error: 'يجب تغيير كلمة المرور المؤقتة قبل استخدام النظام.', code: 'PASSWORD_CHANGE_REQUIRED' });
                }
                if (platformPath) {
                    if (user.role !== ROLES.PLATFORM_ADMIN) {
                        return response.status(403).json({ error: 'هذه المساحة مخصصة لمدير المنصة فقط.', code: 'PLATFORM_ADMIN_REQUIRED' });
                    }
                    return runTenantContext({ tenantId: null, userId: user.id, mode: 'platform', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, async () => {
                        request.auth = await authService.withPermissions(user, { readOnly: readOnlyRequest });
                        return next();
                    });
                }
                return tenantService.resolveTenantForUser(user.id, requestedTenantSlug(request), { readOnly: readOnlyRequest }).then((tenant) => {
                    if (!tenant) return response.status(403).json({ error: 'الحساب غير مرتبط بجيم نشط، أو أن الجيم المطلوب لا يطابق عضوية الحساب.', code: 'TENANT_ACCESS_REQUIRED' });
                    request.tenant = tenant;
                    return runTenantContext({ tenantId: tenant.id, userId: user.id, mode: 'tenant', readOnlyBaseline: Boolean(request.readOnlyBaseline) }, async () => {
                        await assertTenantIsolationReady();
                        user = await authService.withPermissions(user, { readOnly: readOnlyRequest });
                        if (saasService) {
                            request.saas = await saasService.enforceTenantAccess(tenant.id, { path: request.path, method: request.method, readOnly: readOnlyRequest });
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
