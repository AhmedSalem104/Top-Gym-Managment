'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function source(relativePath) {
    return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

test('read-only feedback and backup paths do not initialize schema', () => {
    const feedback = source('src/services/member-feedback-service.js');
    const backup = source('src/services/backup-service.js');
    const recovery = source('src/services/backup-recovery-service.js');
    const feedbackController = source('src/controllers/member-feedback.controller.js');
    const backupController = source('src/controllers/backup.controller.js');

    assert.match(feedback, /async function ensureMemberFeedbackTable\(\{ readOnly = false \} = \{\}\) \{\s*if \(readOnly \|\| getTenantContext\(\)\?\.readOnlyBaseline\) return;/);
    assert.match(feedback, /async function list\(query = \{\}, \{ readOnly = false \} = \{\}\)/);
    assert.match(feedbackController, /feedbackService\.list\(request\.query, \{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(backup, /async function ensureBackupOperationsTable\(\{ readOnly = false \} = \{\}\) \{\s*if \(readOnly \|\| getTenantContext\(\)\?\.readOnlyBaseline\) return;/);
    assert.match(backup, /async function ensureBackupArchivesTable\(\{ readOnly = false \} = \{\}\) \{\s*if \(readOnly \|\| getTenantContext\(\)\?\.readOnlyBaseline\) return;/);
    assert.match(backup, /async function recordBackupOperation\(\{[\s\S]*?readOnly = false[\s\S]*?\} = \{\}\) \{[\s\S]*?if \(readOnly \|\| getTenantContext\(\)\?\.readOnlyBaseline\) return false;/);
    assert.match(backup, /const \{ prepareLibraryData \} = require\('\.\/library-service'\);/);
    assert.match(backup, /async function createBackup\(\{ format = 'json\.gz', readOnly = false \} = \{\}\) \{[\s\S]*?await prepareLibraryData\(\{ readOnly \}\);[\s\S]*?await ensureBrandingTables\(\{ readOnly \}\);/);
    const library = source('src/services/library-service.js');
    assert.match(library, /async function ensureLibraryTables\(\{ readOnly = false \} = \{\}\) \{\s*if \(readOnly \|\| getTenantContext\(\)\?\.readOnlyBaseline\) return;/);
    assert.match(library, /async function ensureLibraryData\(\{ transaction = null, readOnly = false \} = \{\}\) \{[\s\S]*?if \(readOnly \|\| getTenantContext\(\)\?\.readOnlyBaseline\) return \{ action: 'read-only' \};/);
    assert.match(library, /async function prepareLibraryData\(\{ readOnly = false \} = \{\}\)/);
    assert.match(library, /prepareLibraryData,/);
    assert.match(backupController, /recovery\.getTenantBackupHistory\(\{ limit: request\.query\.limit, readOnly: request\.readOnlyRequest \}\)/);
    assert.match(backupController, /recovery\.downloadTenantBackup\(request\.params\.id, \{[\s\S]*?readOnly: request\.readOnlyRequest/);
    assert.match(backupController, /createBackup\(\{ format: requestedFormat, readOnly: request\.readOnlyRequest \}\)/);
    assert.match(backupController, /tableCounts: backup\.rowCounts,[\s\S]*?readOnly: request\.readOnlyRequest,/);
    assert.match(recovery, /if \(auditDownload\)[\s\S]*?eventType: 'BACKUP_DOWNLOADED'/);
    assert.match(recovery, /eventType: 'PLATFORM_BACKUP_DOWNLOADED'/);
    assert.match(recovery, /excludeSensitive: true/);
    assert.match(recovery, /readTableRows\(pool, definition, tenantMetadata, \{ allTenants: true, excludeSensitive: true \}\)/);
    assert.match(recovery, /function recoveryErrorCode\(error, fallback\) \{\s*return safeErrorCode\(error, fallback\);/);
    assert.match(recovery, /verifyStoredPlatformObject/);
    assert.match(recovery, /status IN \('VERIFIED','FAILED','EXPIRED'\)/);
    assert.match(recovery, /artifactCleanup/);
});

test('backup actions expose tenant-scoped record routes and reason-safe restore input', () => {
    const routes = source('src/routes/backup.routes.js');
    const controller = source('src/controllers/backup.controller.js');
    assert.match(routes, /\/api\/backup\/records', asyncRoute\(controller\.create\)/);
    assert.match(routes, /\/api\/backup\/records\/:id\/download', backupActionRateLimit, asyncRoute\(controller\.recordDownload\)/);
    assert.match(routes, /\/api\/backup\/records\/:id\/restore', backupActionRateLimit, asyncRoute\(controller\.restoreRecord\)/);
    assert.match(controller, /x-backup-reason-b64/);
    assert.match(controller, /Buffer\.from\(encoded, 'base64url'\)/);
    assert.match(controller, /const reason = requestReason\(request\);[\s\S]*?BACKUP_REASON_REQUIRED/);
});

test('read-only intelligence paths skip generation audit and resolve branding safely', () => {
    const intelligence = source('src/services/intelligence-service.js');
    const controller = source('src/controllers/intelligence.controller.js');
    const branding = source('src/services/branding-service.js');

    assert.match(intelligence, /async function getChurnRisks\(\{ limit = 20, actorUserId = null, readOnly = false \} = \{\}\)/);
    assert.match(intelligence, /if \(actorUserId && !readOnly\) await logGeneration/);
    assert.match(intelligence, /async function getOverview\(\{ actorUserId = null, readOnly = false \} = \{\}\)/);
    assert.match(intelligence, /getPublicBrandName\('Logic Fit', \{ readOnly \}\)/);
    assert.match(controller, /getOverview\(\{ actorUserId: request\.auth\?\.id, readOnly: request\.readOnlyRequest \}\)/);
    assert.match(controller, /getChurnRisks\(\{ limit: request\.query\.limit, actorUserId: request\.auth\?\.id, readOnly: request\.readOnlyRequest \}\)/);
    assert.match(branding, /async function getPublicBrandName\(fallback = 'Logic Fit', \{ readOnly = false \} = \{\}\)/);
    assert.match(branding, /getPublicBranding\(\{ readOnly \}\)/);
});

test('member portal lookup keeps report reads from triggering maintenance writes', () => {
    const portal = source('src/services/member-portal-service.js');
    const members = source('src/services/member-service.js');
    const attendance = source('src/services/attendance-service.js');

    assert.match(portal, /getMemberDetails\(memberContext\.memberId, \{ readOnly: true \}\)/);
    assert.match(portal, /getMemberAttendance\(memberContext\.memberId, \{ from, to: today, readOnly: true \}\)/);
    assert.match(members, /async function getMemberDetails\(id, \{ readOnly = false \} = \{\}\)/);
    assert.match(members, /async function getMemberDetails\(id, \{ readOnly = false \} = \{\}\) \{[\s\S]*?ensurePaymentTransactionsTable\(\{ readOnly \}\)/);
    assert.match(attendance, /async function getMemberAttendance\(memberId, options = \{\}\) \{\s*await ensureAttendanceTable\(\{ readOnly: Boolean\(options\.readOnly\) \}\);\s*if \(!options\.readOnly\) await reconcileAutoCheckout\(\);/);
});

test('non-API read pages carry the read-only context to avoid session/schema writes', () => {
    const server = source('server.js');
    assert.match(server, /function isReadOnlyRequest\(request\)/);
    assert.match(server, /resolvePublicTenant\([\s\S]*?\{ readOnly \}\)/);
    assert.match(server, /runTenantContext\(\{ tenantId: tenant\.id, mode: 'public', readOnlyBaseline: Boolean\(request\.readOnlyBaseline\) \}/);
    assert.match(server, /getSessionUser\(authService\.readSessionCookie\(request\), \{ includePermissions: false, readOnly: isReadOnlyRequest\(request\) \}\)/);
});

test('permissions reads propagate read-only mode without bootstrapping schema', () => {
    const authService = source('src/services/auth-service.js');
    const permissionService = source('src/services/permission-service.js');
    const controller = source('src/controllers/auth.controller.js');

    assert.match(authService, /async function listUsers\(\{ readOnly = false \} = \{\}\) \{[\s\S]*?if \(!readOnly\) await ensureAuthReady\(\);[\s\S]*?safeUserWithPermissions\(row, \{ readOnly \}\)/);
    assert.match(authService, /async function safeUserWithPermissions\(row, \{ readOnly = false \} = \{\}\)/);
    assert.match(permissionService, /async function getUserPermissionState\(id, \{ readOnly = false \} = \{\}\)/);
    assert.match(permissionService, /getEffectivePermissions\(user\.id, user\.role, \{ readOnly \}\)/);
    assert.match(permissionService, /getLastPermissionAudit\(user\.id, \{ readOnly \}\)/);
    assert.match(controller, /authService\.listUsers\(\{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(controller, /permissionService\.getUserPermissionState\(request\.params\.id, \{ readOnly: request\.readOnlyRequest \}\)/);
});

test('coaching and training reads propagate read-only mode without seeding tenant library data', () => {
    const coaching = source('src/services/coaching-service.js');
    const controller = source('src/controllers/coaching.controller.js');

    assert.match(coaching, /async function ensureReady\(\{ readOnly = false \} = \{\}\) \{[\s\S]*?ensureLibraryData\(\{ readOnly \}\)[\s\S]*?ensureCoachingTables\(\{ seedLibrary: !readOnly, readOnly \}\)/);
    assert.match(coaching, /async function getTrainingOverview\(memberId, \{ readOnly = false \} = \{\}\)/);
    assert.match(coaching, /getWorkoutPrograms\(\{ memberId: id, readOnly \}\)/);
    assert.match(coaching, /getDietPlans\(\{ memberId: id, readOnly \}\)/);
    assert.match(coaching, /async function getExternalTrainees\(\{ search = '', page = 1, pageSize = 12, readOnly = false \} = \{\}\)/);
    assert.match(coaching, /ensureCoachingTables\(\{ seedLibrary: false, readOnly \}\)/);
    assert.match(controller, /getBuilderCatalog\(\{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(controller, /getTrainingOverview\(request\.params\.id, \{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(controller, /pageSize: request\.query\.pageSize,[\s\S]*?readOnly: request\.readOnlyRequest/);
    assert.match(controller, /getWorkoutSessions\(request\.query\.memberId \|\| request\.query\.clientId, \{ \.\.\.request\.query, readOnly: request\.readOnlyRequest \}\)/);
});

test('finance, day-pass and store reads propagate read-only mode to schema guards', () => {
    const finance = source('src/services/finance-service.js');
    const financeController = source('src/controllers/finance.controller.js');
    const dayPass = source('src/services/day-pass-service.js');
    const dayPassRepository = source('src/repositories/day-pass.repository.js');
    const dayPassController = source('src/controllers/day-pass.controller.js');
    const store = source('src/services/store-service.js');
    const storeController = source('src/controllers/store.controller.js');

    assert.match(finance, /async function getMonthlyFinance\(\{[^}]*readOnly = false[^}]*\} = \{\}\)[\s\S]*?ensureExpensesTable\(\{ readOnly \}\)[\s\S]*?ensurePaymentTransactionsTable\(\{ readOnly \}\)[\s\S]*?ensureDayPassTables\(\{ readOnly \}\)/);
    assert.match(financeController, /getMonthlyFinance\(\{[^}]*readOnly: request\.readOnlyRequest[^}]*\}\)/);
    assert.match(dayPass, /async function getPricing\(\{ readOnly = false \} = \{\}\)/);
    assert.match(dayPass, /readOnly: Boolean\(query\.readOnly\)/);
    assert.match(dayPassRepository, /async function listTypes\(\{ activeOnly = false, readOnly = false \} = \{\}\)[\s\S]*?ensureDayPassTables\(\{ readOnly \}\)/);
    assert.match(dayPassRepository, /async function getRangeSummary\(\{[^}]*fromDate,[^}]*nextDate,[^}]*readOnly = false[^}]*\}\)[\s\S]*?ensureDayPassTables\(\{ readOnly \}\)/);
    assert.match(dayPassController, /listDayPasses\(\{ \.\.\.request\.query,[^}]*readOnly: request\.readOnlyRequest[^}]*\}\)/);
    assert.match(store, /async function listProducts\([\s\S]*?readOnly = false[\s\S]*?ensureStoreTables\(\{ readOnly \}\)/);
    assert.match(store, /async function getDashboard\([\s\S]*?readOnly = false[\s\S]*?ensureStoreTables\(\{ readOnly \}\)/);
    assert.match(storeController, /storeService\.listProducts\(\{ \.\.\.request\.query,[\s\S]*?readOnly: request\.readOnlyRequest \}\)/);
    assert.match(storeController, /storeService\.getMemberPurchases\(request\.params\.id, \{ \.\.\.request\.query, readOnly: request\.readOnlyRequest \}\)/);
});

test('subscription requests and reports keep read paths free of maintenance writes', () => {
    const subscription = source('src/services/member-subscription-service.js');
    const subscriptionController = source('src/controllers/member-subscription.controller.js');
    const report = source('src/services/report-service.js');

    assert.match(subscription, /async function listRequests\(\{[\s\S]*?includeMemberCode = false, readOnly = false[\s\S]*?\}\s*=\s*\{\}\)\s*\{[\s\S]*?ensureTables\(\{ readOnly \}\)/);
    assert.match(subscription, /getPortalRequests\(request, options = \{\}\)[\s\S]*?pageSize: options\.pageSize,[\s\S]*?readOnly: true/);
    assert.match(subscription, /getOwnerRequests\(options = \{\}\)[\s\S]*?includeMemberCode: true,[\s\S]*?readOnly: Boolean\(options\.readOnly\)/);
    assert.match(subscriptionController, /service\.getOwnerRequests\(\{[\s\S]*?readOnly: request\.readOnlyRequest/);
    assert.match(report, /dayPassRepository\.getRangeData\(\{ fromDate: range\.from, nextDate: range\.nextDate, readOnly \}\)/);
    assert.match(report, /alertContactService\.getLatestForAlerts\(debtAlertSnapshots, \{ readOnly \}\)/);
});

test('attendance, pricing and refund preview GETs propagate read-only mode', () => {
    const attendance = source('src/services/attendance-service.js');
    const pricingController = source('src/controllers/pricing.controller.js');
    const membersController = source('src/controllers/members.controller.js');
    const members = source('src/services/member-service.js');

    assert.match(attendance, /getTodayAttendance\(options = \{\}\)[\s\S]*?ensureAttendanceTable\(\{ readOnly: Boolean\(options\.readOnly\) \}\)/);
    assert.match(attendance, /getMemberAttendanceStatuses\(memberIds = \[\], date = todayInTimeZone\(\), options = \{\}\)[\s\S]*?ensureAttendanceTable\(\{ readOnly: Boolean\(options\.readOnly\) \}\)/);
    assert.match(attendance, /getAttendanceReport\(options = \{\}\)[\s\S]*?ensureAttendanceTable\(\{ readOnly: Boolean\(options\.readOnly\) \}\)/);
    assert.match(pricingController, /pricingService\.getPricingCatalog\(null, \{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(members, /async function ensureSubscriptionRefundsTable\(\{ readOnly = false \} = \{\}\)[\s\S]*?if \(readOnly \|\| getTenantContext\(\)\?\.readOnlyBaseline\) return;/);
    assert.match(members, /async function getSubscriptionRefundPreview\(id, \{ readOnly = false \} = \{\}\)[\s\S]*?ensureSubscriptionRefundsTable\(\{ readOnly \}\)/);
    assert.match(membersController, /getSubscriptionRefundPreview\(request\.params\.id, \{ readOnly: request\.readOnlyRequest \}\)/);
});
