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
        'src/services/backup-service.js',
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
        'src/routes/pricing.routes.js',
        'src/controllers/pricing.controller.js',
        'src/routes/coaching.routes.js',
        'src/controllers/coaching.controller.js',
        'src/routes/day-pass.routes.js',
        'src/controllers/day-pass.controller.js',
        'src/services/day-pass-service.js',
        'src/services/member-feedback-service.js',
        'src/routes/member-feedback.routes.js',
        'src/controllers/member-feedback.controller.js',
        'database/migrations/005-member-feedback.sql',
        'public/js/day-passes.js',
        'public/js/day-pass-reports.js',
        'public/js/member-portal.js',
        'public/js/pages/management/member-feedback.js',
        'public/css/pages/member-feedback.css',
        'docs/AUTH.md',
        'docs/ARCHITECTURE.md',
        'docs/API.md',
        'docs/PERMISSIONS.md',
        'docs/DATABASE.md',
        'docs/DEPLOYMENT.md',
        'docs/BACKUP-RESTORE.md',
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
        'src/routes/day-pass.routes.js',
        'src/routes/member-feedback.routes.js'
    ].filter((relativePath) => fs.existsSync(path.join(root, relativePath))).map(read).join('\n');
    const expectedRoutes = [
        '/api/members', '/api/expenses', '/api/attendance', '/api/reports',
        '/api/backup', '/api/library', '/api/external-trainees',
        '/api/workoutprograms', '/api/dietplans', '/api/workoutsessions', '/api/meal-logs', '/api/day-passes', '/api/member-feedback', '/api/member-portal/feedback'
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
    record('FEEDBACK-PORTAL-LINK', authMiddleware.includes("'/member-portal/feedback'") && feedbackService.includes('findMemberIdByCode'), 'portal feedback is public only through membership-code resolution', 'P0');
    record('FEEDBACK-NO-CODE-STORAGE', feedbackService.includes('member_id, rating, note_type, message') && !feedbackService.includes('membership_code'), 'feedback storage keeps member_id and does not persist the membership code', 'P0');
    const permissions = read('src/permissions/permissions.js');
    const routePermissions = read('src/permissions/route-permissions.js');
    const permissionService = read('src/services/permission-service.js');
    const permissionsUi = read('public/js/pages/management/permissions.js');
    record('PERMISSIONS-CATALOG', permissions.includes('members.read') && permissions.includes('payments.create') && permissions.includes('finance.read'), 'resource.action permission catalog is present', 'P0');
    record('PERMISSIONS-ROUTE-RESOLVER', routePermissions.includes('permissionForRequest') && authMiddleware.includes('permission.middleware'), 'all API authorization resolves through the centralized route permission resolver', 'P0');
    record('PERMISSIONS-DB-AUDIT', permissionService.includes('gym_user_permissions') && permissionService.includes('gym_permission_audit') && permissionService.includes('withTransaction'), 'permission state and audit are persisted transactionally', 'P0');
    record('PERMISSIONS-OWNER-API', authRoutes.includes('/api/auth/permissions/catalog') && authRoutes.includes('/api/auth/users/:id/permissions') && authRoutes.includes('ownerOnly'), 'Owner-only permission management APIs are present', 'P0');
    record('PERMISSIONS-OWNER-UI', index.includes('data-page-tab="permissions"') && index.includes('id="permissionsSection"') && permissionsUi.includes('/permissions'), 'Owner permissions screen is present', 'P1');
    record('PERMISSIONS-SESSION-INVALIDATION', permissionService.includes('revokeForUser'), 'permission updates invalidate the target Assistant sessions', 'P0');
    record('FINANCE-FIELD-GUARD', fs.existsSync(path.join(root, 'src/middleware/financial-data.middleware.js')) && authMiddleware.includes('protectFinancialResponse'), 'financial response fields are filtered when finance.read is disabled', 'P0');
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
    const optionalScripts = ['/js/smart-assistant.js', '/js/day-passes.js', '/js/alerts-enhancements.js', '/js/member-details-ui.js', '/js/member-portal-admin.js', '/js/day-pass-reports.js'];
    record('UI-NO-EAGER-OPTIONALS', optionalScripts.every((source) => !index.includes(source)), 'optional feature scripts are not duplicated in the initial HTML shell');
    record('CSS-PRODUCTION-BUNDLE', !/\/\*@import|@import\s/.test(main.replace(/\/\*[\s\S]*?\*\//g, '')), 'production CSS bundle has no active blocking imports');
    record('UI-API-CORE', index.includes('/js/core/api.js') && app.includes('window.topGymApi.request'), 'frontend API client is centralized');
    record('UI-PERMISSIONS-CORE', index.includes('/js/core/permissions.js') && authUi.includes('window.topGymPermissions'), 'frontend tab permissions are centralized');
    record('UI-CACHE-BUST', index.includes('app.js?v=feature-expansion'), 'frontend script cache-busting is present');
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
checkStyleSurface();
checkPrintAndLazyLoadingSurface();
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
