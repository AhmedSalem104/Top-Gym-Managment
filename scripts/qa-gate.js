'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const runBuild = args.includes('--build');
const runSmoke = args.includes('--smoke');
const runBrowser = args.includes('--browser');
const reportIndex = args.indexOf('--report');
const reportPath = reportIndex >= 0 && args[reportIndex + 1]
    ? path.resolve(root, args[reportIndex + 1])
    : path.join(root, 'qa', 'reports', 'qa-gate-latest.json');

const startedAt = new Date().toISOString();
const results = [];

function record(id, passed, details, severity = 'P1') {
    results.push({ id, status: passed ? 'PASS' : 'FAIL', severity, details });
    const mark = passed ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${id} - ${details}`);
}

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function run(command, commandArgs) {
    const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
    return spawnSync(executable, commandArgs, {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, CI: process.env.CI || '1' },
        shell: process.platform === 'win32' && command === 'npm',
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

function jsFiles(directory) {
    const absolute = path.join(root, directory);
    return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
        const relative = path.join(directory, entry.name);
        if (entry.isDirectory()) return jsFiles(relative);
        return entry.name.endsWith('.js') ? [relative] : [];
    });
}

function assertRequiredFiles() {
    const required = [
        'server.js',
        'package.json',
        'public/index.html',
        'public/css/main.css',
        'public/css/main.source.css',
        'public/css/tokens.css',
        'public/css/reset.css',
        'public/css/layout.css',
        'public/css/responsive.css',
        'public/css/print.css',
        'public/css/components/buttons.css',
        'public/css/components/forms.css',
        'public/css/components/cards.css',
        'public/css/components/tables.css',
        'public/css/components/modals.css',
        'public/css/components/navbar.css',
        'public/css/pages/login.css',
        'public/css/pages/dashboard.css',
        'public/css/pages/members.css',
        'public/css/pages/attendance.css',
        'public/js/app.js',
        'public/js/core/api.js',
        'public/js/core/permissions.js',
        'public/js/core/state.js',
        'public/js/feature-loader.js',
        'public/js/integrations/print-enhancements.js',
        'src/db.js',
        'src/services/member-service.js',
        'src/services/finance-service.js',
        'src/services/attendance-service.js',
        'src/services/coaching-service.js',
        'src/services/intelligence-service.js',
        'src/services/backup-service.js',
        'src/services/backup-recovery-service.js',
        'src/services/backup-registry.js',
        'src/services/report-service.js',
        'src/services/auth-service.js',
        'public/js/auth-ui.js',
        'public/js/pages/management/auth-users.js',
        'scripts/validate-styles.js',
        'scripts/qa-browser-style.js',
        'src/app.js',
        'src/config/env.js',
        'src/database/pool.js',
        'src/database/transaction.js',
        'src/database/index.js',
        'src/utils/date.js',
        'src/repositories/member.repository.js',
        'src/repositories/day-pass.repository.js',
        'src/repositories/expense.repository.js',
        'src/repositories/user.repository.js',
        'src/repositories/session.repository.js',
        'src/permissions/roles.js',
        'src/permissions/permissions.js',
        'src/permissions/role-permissions.js',
        'src/permissions/route-permissions.js',
        'src/services/permission-service.js',
        'src/middleware/permission.middleware.js',
        'src/middleware/financial-data.middleware.js',
        'database/migrations/006-permissions.sql',
        'public/js/pages/management/permissions.js',
        'public/css/pages/permissions.css',
        'public/css/pages/store.css',
        'src/routes/index.js',
        'src/routes/auth.routes.js',
        'src/controllers/auth.controller.js',
        'src/routes/members.routes.js',
        'src/controllers/members.controller.js',
        'src/routes/attendance.routes.js',
        'src/controllers/attendance.controller.js',
        'src/routes/finance.routes.js',
        'src/controllers/finance.controller.js',
        'src/routes/dashboard.routes.js',
        'src/controllers/dashboard.controller.js',
        'src/routes/library.routes.js',
        'src/controllers/library.controller.js',
        'src/routes/reports.routes.js',
        'src/controllers/reports.controller.js',
        'src/routes/backup.routes.js',
        'src/controllers/backup.controller.js',
        'src/middleware/cron.middleware.js',
        'src/middleware/auth.middleware.js',
        'src/middleware/rate-limit.middleware.js',
        'src/middleware/read-only-baseline.middleware.js',
        'src/routes/pricing.routes.js',
        'src/controllers/pricing.controller.js',
        'src/routes/coaching.routes.js',
        'src/controllers/coaching.controller.js',
        'src/routes/intelligence.routes.js',
        'src/controllers/intelligence.controller.js',
        'src/routes/day-pass.routes.js',
        'src/controllers/day-pass.controller.js',
        'src/services/store-service.js',
        'src/routes/store.routes.js',
        'src/controllers/store.controller.js',
        'database/migrations/007-store.sql',
        'database/migrations/008-backup-recovery.sql',
        'database/migrations/009-platform-backup-audit.sql',
        'src/services/day-pass-service.js',
        'src/services/member-feedback-service.js',
        'src/routes/member-feedback.routes.js',
        'src/controllers/member-feedback.controller.js',
        'src/services/branding-service.js',
        'src/routes/branding.routes.js',
        'src/controllers/branding.controller.js',
        'src/services/object-storage-service.js',
        'src/services/saas-service.js',
        'src/routes/platform.routes.js',
        'src/controllers/platform.controller.js',
        'src/routes/platform-admin.routes.js',
        'src/controllers/platform-admin.controller.js',
        'src/services/platform-admin-service.js',
        'src/routes/saas.routes.js',
        'src/controllers/saas.controller.js',
        'src/middleware/platform.middleware.js',
        'public/platform-admin.html',
        'public/platform-admin-forbidden.html',
        'public/js/platform-admin.js',
        'public/css/pages/platform-admin.css',
        'public/js/pages/platform/platform.js',
        'public/js/pages/saas/saas.js',
        'public/css/pages/saas.css',
        'database/migrations/005-member-feedback.sql',
        'public/js/day-passes.js',
        'public/js/day-pass-reports.js',
        'public/js/member-portal.js',
        'public/js/member-portal-library.js',
        'public/js/member-portal-anatomy.js',
        'public/data/anatomy-muscle-mapping.json',
        'public/assets/anatomy/top-gym-anatomy.glb',
        'public/assets/anatomy/README.md',
        'src/client/anatomy/index.ts',
        'src/client/anatomy/anatomy-viewer.ts',
        'src/client/anatomy/camera-controller.ts',
        'src/client/anatomy/muscle-mapping.ts',
        'scripts/build-anatomy.js',
        'scripts/build-bodyparts3d-anatomy.mjs',
        'docs/ANATOMY-3D.md',
        'docs/ANATOMY-BODYPARTS3D-REPORT.json',
        'tsconfig.anatomy.json',
        'public/js/pages/management/member-feedback.js',
        'public/css/pages/member-feedback.css',
        'public/css/pages/branding.css',
        'public/js/branding.js',
        'public/js/pages/branding/branding.js',
        'public/assets/gym-brand.svg',
        'public/assets/gym-brand-horizontal.svg',
        'public/assets/gym-brand-light.svg',
        'public/assets/gym-brand-dark.svg',
        'docs/AUTH.md',
        'docs/ARCHITECTURE.md',
        'docs/API.md',
        'docs/PERMISSIONS.md',
        'docs/DATABASE.md',
        'docs/DEPLOYMENT.md',
        'docs/BACKUP-RESTORE.md',
        'docs/BACKUP-DISASTER-RECOVERY.md',
        'qa/AGENT-CONTRACT.md'
    ];
    required.forEach((relativePath) => record(
        `FILES-${relativePath.replaceAll('/', '-')}`,
        fs.existsSync(path.join(root, relativePath)),
        fs.existsSync(path.join(root, relativePath)) ? 'required file exists' : 'required file is missing'
    ));
}

function checkJavaScriptSyntax() {
    for (const relativePath of jsFiles('public/js')) {
        const result = run(process.execPath, ['--check', relativePath]);
        record(`SYNTAX-${relativePath.replaceAll('/', '-')}`, result.status === 0, result.status === 0 ? 'node --check passed' : (result.stderr || 'syntax check failed').trim());
    }
    for (const relativePath of jsFiles('src')) {
        const result = run(process.execPath, ['--check', relativePath]);
        record(`SYNTAX-${relativePath.replaceAll('/', '-')}`, result.status === 0, result.status === 0 ? 'node --check passed' : (result.stderr || 'syntax check failed').trim());
    }
}

function checkModuleGraph() {
    const modules = [
        './server',
        './src/services/auth-service',
        './src/services/member-service',
        './src/services/finance-service',
        './src/services/attendance-service',
        './src/services/coaching-service',
        './src/services/library-service',
        './src/services/analytics-service',
        './src/services/report-service',
        './src/services/backup-service',
        './src/services/branding-service',
        './src/services/saas-service',
        './src/services/platform-admin-service',
        './src/database',
        './src/repositories/user.repository',
        './src/repositories/session.repository',
        './src/services/permission-service',
        './src/middleware/permission.middleware',
        './src/middleware/financial-data.middleware'
    ];
    const source = `${modules.map((item) => `require(${JSON.stringify(item)});`).join('')}console.log('MODULE_GRAPH_OK');`;
    const result = run(process.execPath, ['-e', source]);
    record('MODULE-GRAPH', result.status === 0 && String(result.stdout || '').includes('MODULE_GRAPH_OK'), result.status === 0 ? 'backend module graph loads' : (result.stderr || 'backend module graph failed').trim(), 'P0');
}

function checkRouteSurface() {
    const server = read('server.js');
    const routeSurface = server + [
        'src/routes/auth.routes.js',
        'src/routes/members.routes.js',
        'src/routes/attendance.routes.js',
        'src/routes/finance.routes.js',
        'src/routes/dashboard.routes.js',
        'src/routes/library.routes.js',
        'src/routes/reports.routes.js',
        'src/routes/backup.routes.js',
        'src/routes/pricing.routes.js',
        'src/routes/coaching.routes.js',
        'src/routes/intelligence.routes.js',
        'src/routes/day-pass.routes.js',
        'src/routes/member-feedback.routes.js',
        'src/routes/store.routes.js',
        'src/routes/branding.routes.js',
        'src/routes/platform.routes.js',
        'src/routes/platform-admin.routes.js',
        'src/routes/saas.routes.js'
    ].filter((relativePath) => fs.existsSync(path.join(root, relativePath))).map(read).join('\n');
    const expectedRoutes = [
        '/api/members', '/api/expenses', '/api/attendance', '/api/reports',
        '/api/backup', '/api/library', '/api/external-trainees',
        '/api/workoutprograms', '/api/dietplans', '/api/workoutsessions', '/api/meal-logs', '/api/intelligence/overview', '/api/intelligence/refine', '/api/day-passes', '/api/member-feedback', '/api/member-portal/feedback', '/api/store/products', '/api/store/sales', '/api/store/inventory', '/api/branding', '/api/branding/publish', '/api/platform/overview', '/api/platform/tenants', '/api/platform-admin/dashboard', '/api/platform-admin/tenants', '/api/platform-admin/tenants/:tenantId', '/api/platform-admin/tenants/:tenantId/subscription', '/api/platform-admin/tenants/:tenantId/usage', '/api/saas/subscription', '/api/saas/subscription-requests'
    ];
    expectedRoutes.forEach((route) => record(
        `ROUTE-${route.replaceAll('/', '-')}`,
        routeSurface.includes(route),
        routeSurface.includes(route) ? 'route surface is present' : 'expected route surface is missing'
    ));
}

function checkAuthSurface() {
    const server = read('server.js');
    const authMiddleware = read('src/middleware/auth.middleware.js');
    const authRoutes = read('src/routes/auth.routes.js');
    const auth = read('src/services/auth-service.js');
    const index = read('public/index.html');
    [
        '/api/auth/session', '/api/auth/login', '/api/auth/logout', '/api/auth/users'
    ].forEach((route) => record(
        `AUTH-ROUTE-${route.replaceAll('/', '-')}`,
        server.includes(route) || authRoutes.includes(route),
        server.includes(route) || authRoutes.includes(route) ? 'authentication route is present' : 'authentication route is missing',
        'P0'
    ));
    record('AUTH-BACKEND-MIDDLEWARE', server.includes('createAuthApiMiddleware') && authMiddleware.includes('authorizeRequest(user, request)'), 'backend authentication and centralized authorization middleware is present', 'P0');
    record('AUTH-SCRYPT-HASHING', auth.includes('crypto.scrypt') && auth.includes('timingSafeEqual'), 'password hashing uses scrypt and timing-safe comparison', 'P0');
    record('AUTH-HTTPONLY-SESSION', auth.includes('HttpOnly') && auth.includes('SameSite=Lax'), 'sessions use HttpOnly SameSite cookies', 'P0');
    record('AUTH-LOGIN-SCREEN', index.includes('id="authScreen"') && index.includes('/css/main.css'), 'login screen structure and central stylesheet are present', 'P1');
    const feedbackRoute = read('src/routes/member-feedback.routes.js');
    const feedbackService = read('src/services/member-feedback-service.js');
    record('FEEDBACK-OWNER-API', feedbackRoute.includes("'/api/member-feedback'") && feedbackRoute.includes('ownerOnly'), 'member feedback administration API is Owner-protected', 'P0');
    record('FEEDBACK-PORTAL-LINK', authMiddleware.includes("'/member-portal/feedback'") && (feedbackService.includes('findMemberIdByCode') || feedbackService.includes('findMemberContextByCode')), 'portal feedback is public only through membership-code resolution', 'P0');
    record('FEEDBACK-NO-CODE-STORAGE', feedbackService.includes('member_id, rating, note_type, message') && !feedbackService.includes('membership_code'), 'feedback storage keeps member_id and does not persist the membership code', 'P0');
    const memberPortalRoutes = read('src/routes/member-portal.routes.js');
    record('PORTAL-LIBRARY-API', memberPortalRoutes.includes('/api/member-portal/library/options') && memberPortalRoutes.includes('/api/member-portal/library/:type/:id'), 'member portal library read-only API surface is present', 'P1');
    record('PORTAL-LIBRARY-PUBLIC', authMiddleware.includes("request.path === '/member-portal/library/options'") && authMiddleware.includes("request.path.startsWith('/member-portal/library/')"), 'member portal library endpoints are explicitly public and do not bypass other API protection', 'P0');
    const permissions = read('src/permissions/permissions.js');
    const routePermissions = read('src/permissions/route-permissions.js');
    const permissionService = read('src/services/permission-service.js');
    const userRepository = read('src/repositories/user.repository.js');
    const tenantService = read('src/services/tenant-service.js');
    const permissionsUi = read('public/js/pages/management/permissions.js');
    record('PERMISSIONS-CATALOG', permissions.includes('members.read') && permissions.includes('payments.create') && permissions.includes('finance.read'), 'resource.action permission catalog is present', 'P0');
    record('PERMISSIONS-ROUTE-RESOLVER', routePermissions.includes('permissionForRequest') && authMiddleware.includes('permission.middleware'), 'all API authorization resolves through the centralized route permission resolver', 'P0');
    record('PERMISSIONS-DB-AUDIT', permissionService.includes('gym_user_permissions') && permissionService.includes('gym_permission_audit') && permissionService.includes('withTransaction'), 'permission state and audit are persisted transactionally', 'P0');
    record('PERMISSIONS-OWNER-API', authRoutes.includes('/api/auth/permissions/catalog') && authRoutes.includes('/api/auth/users/:id/permissions') && authRoutes.includes('ownerOnly'), 'Owner-only permission management APIs are present', 'P0');
    record('PERMISSIONS-OWNER-UI', index.includes('data-page-tab="permissions"') && index.includes('id="permissionsSection"') && permissionsUi.includes('/permissions'), 'Owner permissions screen is present', 'P1');
    record('PERMISSIONS-SESSION-INVALIDATION', permissionService.includes('revokeForUser'), 'permission updates invalidate the target Assistant sessions', 'P0');
    record('TENANT-USER-SCOPE', auth.includes('currentTenantId({ required: true })') && userRepository.includes("ut.status='active'") && permissionService.includes('currentTenantId({ required: true })'), 'account and permission lists/actions are scoped to the active tenant', 'P0');
    record('TENANT-BOOTSTRAP-SAFETY', tenantService.includes('bootstrapMembership') && tenantService.includes('otherMembership.tenant_id<>@tenantId'), 'legacy Top Gym bootstrap mapping cannot override another gym membership', 'P0');
    record('FINANCE-FIELD-GUARD', fs.existsSync(path.join(root, 'src/middleware/financial-data.middleware.js')) && authMiddleware.includes('protectFinancialResponse'), 'financial response fields are filtered when finance.read is disabled', 'P0');
    const brandingRoutes = read('src/routes/branding.routes.js');
    const brandingService = read('src/services/branding-service.js');
    const brandingClient = read('public/js/branding.js');
    record('BRANDING-OWNER-API', brandingRoutes.includes('/api/branding/settings') && brandingRoutes.includes('branding.publish') && brandingRoutes.includes('ownerOnly'), 'custom branding settings and publish APIs are Owner-protected', 'P0');
    record('BRANDING-FALLBACK', brandingService.includes('DEFAULT_BRANDING') && brandingService.includes('getPublicBrandName'), 'default branding and safe fallback resolver are present', 'P0');
    record('BRANDING-DESIGN-TOKENS', brandingClient.includes('TOKEN_ALIASES') && brandingClient.includes('topgym:brandingchange'), 'resolved branding is applied through centralized runtime design tokens', 'P1');
    record('BRANDING-TENANT-CONTEXT', authMiddleware.includes('tenantBrandingPath') && brandingService.includes('defaultBrandingForTenant') && brandingClient.includes('tenantHint') && !brandingClient.includes('topgym-branding-cache'), 'branding identity and assets resolve per tenant without a shared browser cache', 'P0');
    record('BRANDING-UI', index.includes('data-page-tab="branding"') && index.includes('id="brandingSection"') && index.includes('/js/branding.js'), 'Owner custom branding editor and runtime loader are present', 'P1');
    const saasService = read('src/services/saas-service.js');
    const platformRoutes = read('src/routes/platform.routes.js');
    const saasRoutes = read('src/routes/saas.routes.js');
    const platformUi = read('public/js/pages/platform/platform.js');
    const platformAdminPage = read('public/platform-admin.html');
    const saasUi = read('public/js/pages/saas/saas.js');
    record('SAAS-PLATFORM-ROLE', auth.includes('PlatformAdmin') && authMiddleware.includes('PLATFORM_ADMIN_REQUIRED') && platformRoutes.includes('platformOnly'), 'PlatformAdmin account and server-side platform boundary are present', 'P0');
    record('SAAS-SCHEMA', saasService.includes('saas_plans') && saasService.includes('saas_tenant_subscriptions') && saasService.includes('saas_subscription_requests') && saasService.includes('saas_payment_proofs'), 'SaaS plans, subscriptions, manual requests and payment proofs have separate tables', 'P0');
    record('SAAS-WORKFLOW', saasRoutes.includes('/api/saas/subscription-requests/:id/proof') && platformRoutes.includes('/api/platform/subscription-requests/:id/approve') && platformRoutes.includes('/api/platform/subscription-requests/:id/reject'), 'manual payment-proof review workflow is wired', 'P0');
    record('SAAS-ENFORCEMENT', authMiddleware.includes('enforceTenantAccess') && authMiddleware.includes('enforceRequestLimit') && saasService.includes('SAAS_PLAN_LIMIT_REACHED'), 'tenant expiration, feature and plan limits are enforced before domain handlers', 'P0');
    record('SAAS-CURRENCY-SNAPSHOT', saasService.includes('currency_snapshot=(SELECT TOP (1) currency FROM dbo.saas_plans WHERE id=@planId)') && !saasService.includes("input('currencySnapshot', sql.VarChar(3)"), 'subscription snapshots use the plan currency in SQL and avoid the production TDS metadata failure', 'P0');
    record('SAAS-UI', platformAdminPage.includes('platformAdminLoginScreen') && platformAdminPage.includes('platformAdminApp') && index.includes('data-page-tab="saas-billing"') && platformUi.includes('/api/platform/tenants') && saasUi.includes('/api/saas/subscription'), 'Platform Admin has an independent shell and tenant billing remains available to gym owners', 'P1');
}

function checkPlatformAdminSurface() {
    const server = read('server.js');
    const middleware = read('src/middleware/auth.middleware.js');
    const routes = read('src/routes/platform-admin.routes.js');
    const platformMiddleware = read('src/middleware/platform.middleware.js');
    const service = read('src/services/platform-admin-service.js');
    const saasService = read('src/services/saas-service.js');
    const controller = read('src/controllers/platform-admin.controller.js');
    const page = read('public/platform-admin.html');
    const forbidden = read('public/platform-admin-forbidden.html');
    const client = read('public/js/platform-admin.js');

    record('PLATFORM-ADMIN-PAGE', (server.includes("app.get('/platform-admin'") || server.includes("app.get(['/platform-admin'")) && page.includes('platformAdminLoginScreen') && page.includes('platformAdminApp'), 'Platform Admin has an independent route and login shell', 'P0');
    record('PLATFORM-ADMIN-FORBIDDEN', server.includes('response.status(403).sendFile') && forbidden.includes('platform-forbidden-page'), 'non-PlatformAdmin users receive a dedicated forbidden response', 'P0');
    record('PLATFORM-ADMIN-ROLE-GUARD', middleware.includes("request.path.startsWith('/platform-admin/')") && middleware.includes('tenantId: null') && platformMiddleware.includes('ROLES.PLATFORM_ADMIN'), 'PlatformAdmin role is checked server-side without a fallback tenant context', 'P0');
    record('PLATFORM-ADMIN-API-NAMESPACE', routes.includes('/api/platform-admin/dashboard') && routes.includes('platformOnly') && routes.includes('/api/platform-admin/tenants/:tenantId/usage'), 'Platform control-plane APIs use a protected platform-admin namespace', 'P0');
    record('PLATFORM-ADMIN-CONTROL-PLANE', service.includes('getTenantProfile') && service.includes('updateTenantStatus') && service.includes('updateTenantSubscription') && service.includes('updateOverrides') && service.includes('getTenantHealth'), 'Tenant profile, status, subscription, overrides and health services are present', 'P0');
    record('PLATFORM-ADMIN-SCHEDULED-PLAN', service.includes("when === 'renewal'") && saasService.includes('applyScheduledSubscriptionChanges') && saasService.includes("status='applied'"), 'plan changes can be scheduled for renewal and applied by the subscription synchronizer', 'P1');
    record('PLATFORM-ADMIN-AUDIT', service.includes('recordAudit') && service.includes('before') && service.includes('after') && routes.includes('/api/platform-admin/audit'), 'platform administrative changes retain reason and before/after audit data', 'P0');
    record('PLATFORM-ADMIN-CLIENT', client.includes('/api/platform-admin/dashboard') && client.includes('/api/platform-admin/tenants/') && client.includes('data-profile-tab'), 'independent client renders dashboard, tenant profile tabs and actions', 'P1');
    record('PLATFORM-ADMIN-NO-GYM-SHELL', !page.includes('/js/app.js') && !page.includes('data-page-tab="members"') && !page.includes('data-page-tab="attendance"'), 'Platform Admin page does not load the Gym Owner application shell', 'P0');
    record('PLATFORM-ADMIN-EXPLICIT-TENANT', service.includes('WHERE t.id=@tenantId') && service.includes('target_tenant_id') === false, 'platform service uses explicit tenant ids for tenant-scoped operations', 'P0');
    record('PLATFORM-ADMIN-PLAN-CRUD', routes.includes("app.post('/api/platform-admin/plans'") && routes.includes("app.patch('/api/platform-admin/plans/:planId'") && routes.includes("app.delete('/api/platform-admin/plans/:planId'") && controller.includes('createPlan') && controller.includes('deletePlan') && saasService.includes('async function createPlan') && saasService.includes('async function deletePlan'), 'SaaS plan create, update and safe-delete operations are exposed through the protected Platform Admin API', 'P0');
    record('PLATFORM-ADMIN-PLAN-SAFETY', saasService.includes('DUPLICATE_PLAN_CODE') && saasService.includes('LAST_ACTIVE_PLAN') && saasService.includes("action: 'plan_deleted'") && client.includes('data-plan-delete'), 'plan validation, last-active protection and audited safe deletion are present', 'P0');
    record('PLATFORM-ADMIN-REVIEW-FLOW', routes.includes('/api/platform-admin/subscription-requests/:requestId/approve') && routes.includes('/api/platform-admin/subscription-requests/:requestId/reject') && client.includes('data-request-action="approve"') && client.includes("action === 'approve'"), 'subscription approval and rejection actions are wired to the independent Platform Admin surface', 'P0');
    record('PLATFORM-ADMIN-DIALOG-CLOSE', page.includes('data-dialog-cancel') && client.includes('dialog.close()') && client.includes("dialog.addEventListener('click'"), 'all Platform Admin dialogs have explicit close/cancel and backdrop-close handling', 'P1');
    record('SAAS-TRIAL-PLAN-RESOLUTION', saasService.includes('requestedTrialPlanId') && saasService.includes('body.trialPlanId') && client.includes('function trialPlanOptions') && client.includes("value=\"${escapeHtml(plan.code)}\""), 'tenant onboarding accepts both legacy plan ids and plan codes while the UI posts the active plan code', 'P0');
}

function checkProductionClosureContracts() {
    const storage = read('src/services/object-storage-service.js');
    const rateLimit = read('src/middleware/rate-limit.middleware.js');
    const authMiddleware = read('src/middleware/auth.middleware.js');
    const backupRecovery = read('src/services/backup-recovery-service.js');
    const backupRegistry = read('src/services/backup-registry.js');
    const backupRoutes = read('src/routes/backup.routes.js');
    const platformRoutes = read('src/routes/platform-admin.routes.js');
    record('SEC-PRIVATE-OBJECT-CONTRACT', storage.includes('tenants/${normalizedTenantId}/private') && storage.includes('assertPrivateObjectKey') && storage.includes('tenantId'), 'private object keys are tenant-scoped and validated before provider access', 'P0');
    record('SEC-PRIVATE-OBJECT-NO-PUBLIC-URL', storage.includes('PRIVATE_OBJECT_PUBLIC_URL_FORBIDDEN') && storage.includes('getPublicUrl()'), 'private storage contract rejects public URL exposure', 'P0');
    record('SEC-PRIVATE-OBJECT-FAIL-CLOSED', storage.includes('OBJECT_STORAGE_PROVIDER_NOT_CONFIGURED') && storage.includes('assertAdapter'), 'storage operations fail closed until an approved provider adapter is configured', 'P0');
    record('SEC-RATE-LIMIT-POLICY-BACKEND-SEAM', rateLimit.includes('createMemoryRateLimitStore') && rateLimit.includes('store = null') && rateLimit.includes('fallbackStore = null') && rateLimit.includes('incrementWithFallback'), 'rate-limit policy accepts an injectable atomic backend while retaining the bounded local adapter', 'P1');
    record('SEC-RATE-LIMIT-FAIL-CLOSED', rateLimit.includes('RATE_LIMIT_UNAVAILABLE') && rateLimit.includes('Number.MAX_SAFE_INTEGER'), 'rate-limit backend and fallback failures fail closed instead of bypassing protection', 'P0');
    record('SEC-GET-READONLY-CONTEXT', authMiddleware.includes('READ_ONLY_METHODS.has(request.method) && !cronRequest') && authMiddleware.includes('request.readOnlyRequest = readOnlyRequest') && authMiddleware.includes('touch: !readOnlyRequest'), 'normal GET requests use a read-only context while the authorized backup cron remains explicit', 'P0');
    record('BACKUP-TENANT-REGISTRY', backupRegistry.includes('TENANT_BACKUP_TABLES') && backupRegistry.includes('getTenantBackupCoverage') && backupRecovery.includes('requireCompleteRegistry'), 'tenant backup coverage is registry-driven and restore rejects incomplete artifacts', 'P0');
    record('BACKUP-INTEGRITY', backupRecovery.includes('sha256') && backupRecovery.includes('BACKUP_CHECKSUM_MISMATCH') && backupRecovery.includes("status: 'VERIFYING'") && backupRecovery.includes("status: 'VERIFIED'"), 'backup artifacts are checksum-verified before they become downloadable', 'P0');
    record('BACKUP-RESTORE-SAFETY', backupRecovery.includes('tenant_pre_restore') && backupRecovery.includes('sp_getapplock') && backupRecovery.includes('BACKUP_TENANT_BUSY'), 'tenant restore requires a safety copy and database-level recovery coordination', 'P0');
    record('BACKUP-PLATFORM-SEPARATION', backupRecovery.includes('createPlatformBackup') && backupRecovery.includes('platform-disaster-recovery') && platformRoutes.includes('/api/platform-admin/backups/health'), 'platform disaster-recovery artifacts and administration routes are separate from tenant backups', 'P0');
    record('BACKUP-ROUTE-SAFETY', backupRoutes.includes('/api/backup/records/:id/download') && backupRoutes.includes('/api/backup/records/:id/restore') && backupRoutes.includes("app.get('/api/backup/daily'") && backupRecovery.includes('runDailyBackupCycle'), 'tenant backup history/download/restore and authorized daily orchestration are wired', 'P0');
}

function checkStyleSurface() {
    const index = read('public/index.html');
    const main = read('public/css/main.css');
    const mainSource = read('public/css/main.source.css');
    const tokens = read('public/css/tokens.css');
    const print = read('public/css/print.css');
    record('STYLE-CENTRAL-LINK', index.includes('/css/main.css'), 'index links one central application stylesheet');
    record('STYLE-TOKENS', mainSource.includes('./tokens.css') && main.includes('--color-primary') && tokens.includes('--color-primary') && tokens.includes('--space-4'), 'design tokens are centralized in the source graph and production bundle');
    record('STYLE-PRINT', mainSource.includes('./print.css') && main.includes('TOP GYM layer: public/css/print.css') && print.includes('@media print'), 'print styles are included in the production stylesheet bundle');
    record('STYLE-CSS-VALIDATOR', fs.existsSync(path.join(root, 'scripts/validate-styles.js')), 'CSS validation script is present');
    const validation = run(process.execPath, ['scripts/validate-styles.js']);
    record('STYLE-INTEGRITY', validation.status === 0, validation.status === 0 ? 'CSS import, variable, brace, media-query and entrypoint checks passed' : (validation.stderr || validation.stdout || 'CSS integrity validation failed').trim(), 'P0');
}

function checkPrintAndLazyLoadingSurface() {
    const app = read('public/js/app.js');
    const authUi = read('public/js/auth-ui.js');
    const loader = read('public/js/feature-loader.js');
    const index = read('public/index.html');
    const main = read('public/css/main.css');
    record('UI-PRINT-MEMBER-ACTION', app.includes("actionButton('print'") && loader.includes('button[data-action="print"]'), 'member print action and lazy handler are present');
    record('UI-LAZY-FEATURES', loader.includes('async function ensureTab') && loader.includes("features =") && loader.includes("'dashboard-enhancements'") && loader.includes("'smart-assistant'"), 'feature loader maps deferred dashboard and assistant features');
    const optionalScripts = ['/js/smart-assistant.js', '/js/whatsapp-enhancements.js', '/js/details-enhancements.js', '/js/day-passes.js', '/js/alerts-enhancements.js', '/js/member-details-ui.js', '/js/member-portal-admin.js', '/js/day-pass-reports.js'];
    record('UI-NO-EAGER-OPTIONALS', optionalScripts.every((source) => !index.includes(source)), 'optional feature scripts are not duplicated in the initial HTML shell');
    record('CSS-PRODUCTION-BUNDLE', !/\/\*@import|@import\s/.test(main.replace(/\/\*[\s\S]*?\*\//g, '')), 'production CSS bundle has no active blocking imports');
    record('UI-API-CORE', index.includes('/js/core/api.js') && app.includes('window.topGymApi.request'), 'frontend API client is centralized');
    const store = read('public/js/pages/store/store.js');
    record('STORE-MODULE', index.includes('data-page-tab="store"') && index.includes('id="storeSection"') && loader.includes("'/js/pages/store/store.js") && store.includes('/api/store/sales') && store.includes('/api/store/customers/search'), 'Store/POS module is wired through lazy loading and member lookup');
    record('UI-PERMISSIONS-CORE', index.includes('/js/core/permissions.js') && authUi.includes('window.topGymPermissions'), 'frontend tab permissions are centralized');
    record('UI-CACHE-BUST', index.includes('app.js?v=feature-expansion'), 'frontend script cache-busting is present');
    const memberPortal = read('public/member-portal.html');
    const memberPortalScript = read('public/js/member-portal.js');
    const memberPortalLibrary = read('public/js/member-portal-library.js');
    record('PORTAL-MEMBER-HUB', memberPortal.includes('data-portal-tool="exercises"') && memberPortal.includes('data-portal-tool="foods"') && memberPortalScript.includes('ensureLibraryFeature'), 'member portal exposes four service cards and lazy-loads the library guide');
    record('PORTAL-LIBRARY-FILTERS', memberPortalLibrary.includes('portalLibrarySearch') && memberPortalLibrary.includes('portalExerciseDifficulty') && memberPortalLibrary.includes('portalExerciseEquipment') && memberPortalLibrary.includes('/api/member-portal/library/') && !memberPortalLibrary.includes('targetMuscleId'), 'member portal exercise guide uses name, difficulty and equipment filters without a body-region constraint');
    record('PORTAL-LIBRARY-SCOPED-VIEW', memberPortalLibrary.includes('data-library-type') && !memberPortalLibrary.includes('data-library-tab'), 'exercise and nutrition guides render as separate scoped views without internal cross-category tabs');
}

function checkAnatomyAsset() {
    const assetPath = path.join(root, 'public', 'assets', 'anatomy', 'top-gym-anatomy.glb');
    const mappingPath = path.join(root, 'public', 'data', 'anatomy-muscle-mapping.json');
    const reportPath = path.join(root, 'docs', 'ANATOMY-BODYPARTS3D-REPORT.json');
    let asset = Buffer.alloc(0);
    try { asset = fs.readFileSync(assetPath); } catch (_) { /* required-file check reports the missing asset */ }
    let mapping = null;
    let report = null;
    try { mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8')); } catch (_) { /* reported below */ }
    try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch (_) { /* reported below */ }
    const isGlb = asset.length >= 12 && asset.subarray(0, 4).toString('ascii') === 'glTF' && asset.readUInt32LE(4) === 2;
    record('ANATOMY-GLB-INTEGRITY', isGlb && asset.length > 1024, isGlb ? `valid GLB v2 (${asset.length} bytes)` : 'anatomy GLB header or size is invalid', 'P0');
    const mapped = Number(mapping?.stats?.mappedMeshes || Object.keys(mapping?.mappings || {}).length);
    record('ANATOMY-MAPPING-MANIFEST', mapping?.schemaVersion >= 2 && mapping?.modelAsset === '/assets/anatomy/top-gym-anatomy.glb' && mapped > 0, `mapping manifest contains ${mapped} explicit mesh mappings`);
    record('ANATOMY-BODYPARTS3D-REPORT', report?.source?.archiveUrl?.includes('bodyparts3d') && report?.qualityGate?.passed === true && Number(report?.output?.triangles) > 0, 'official source, quality gate, and triangle metrics are recorded');
}

function checkTrackedSecrets() {
    const result = run('git', ['ls-files', '.env', '.env.*']);
    const files = (result.stdout || '').split(/\r?\n/).map((item) => item.trim()).filter((item) => item && item !== '.env.example');
    record('SEC-TRACKED-ENV', files.length === 0, files.length === 0 ? 'no environment file is tracked' : `tracked environment files: ${files.join(', ')}`, 'P0');
}

function runOptionalCommand(label, command, commandArgs) {
    const result = run(command, commandArgs);
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    record(label, result.status === 0, result.status === 0 ? 'command passed' : output.slice(-2000) || result.error?.message || 'command failed');
}

assertRequiredFiles();
checkJavaScriptSyntax();
checkModuleGraph();
checkRouteSurface();
checkAuthSurface();
checkPlatformAdminSurface();
checkProductionClosureContracts();
checkStyleSurface();
checkPrintAndLazyLoadingSurface();
checkAnatomyAsset();
checkTrackedSecrets();
if (runBuild) runOptionalCommand('BUILD', 'npm', ['run', 'build']);
if (runSmoke) runOptionalCommand('SMOKE', 'npm', ['run', 'test:smoke']);
if (runBrowser) runOptionalCommand('BROWSER', 'npm', ['run', 'test:e2e']);

const failed = results.filter((item) => item.status === 'FAIL');
const report = {
    name: 'TOP GYM QA Gate',
    startedAt,
    finishedAt: new Date().toISOString(),
    commit: (() => {
        const result = run('git', ['rev-parse', 'HEAD']);
        return (result.stdout || '').trim() || 'unknown';
    })(),
    options: { build: runBuild, smoke: runSmoke, browser: runBrowser },
    summary: { total: results.length, passed: results.length - failed.length, failed: failed.length },
    results
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`QA_REPORT=${path.relative(root, reportPath)}`);
if (failed.length) {
    console.error(`QA_GATE_FAILED=${failed.length}`);
    process.exitCode = 1;
} else {
    console.log('QA_GATE_PASSED');
}
