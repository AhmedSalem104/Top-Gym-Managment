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
    assert.match(library, /async function prepareLibraryData\(\{ readOnly = false \} = \{\}\)/);
    assert.match(library, /prepareLibraryData,/);
    assert.match(backupController, /getBackupHistory\(request\.query\.limit, \{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(backupController, /getBackupArchive\(request\.params\.id, \{ readOnly: request\.readOnlyRequest \}\)/);
    assert.match(backupController, /createBackup\(\{ format: requestedFormat, readOnly: request\.readOnlyRequest \}\)/);
    assert.match(backupController, /tableCounts: backup\.rowCounts,[\s\S]*?readOnly: request\.readOnlyRequest,/);
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

test('non-API read pages carry the read-only context to avoid session/schema writes', () => {
    const server = source('server.js');
    assert.match(server, /function isReadOnlyRequest\(request\)/);
    assert.match(server, /resolvePublicTenant\([\s\S]*?\{ readOnly \}\)/);
    assert.match(server, /runTenantContext\(\{ tenantId: tenant\.id, mode: 'public', readOnlyBaseline: readOnly \}/);
    assert.match(server, /getSessionUser\(authService\.readSessionCookie\(request\), \{ includePermissions: false, readOnly: isReadOnlyRequest\(request\) \}\)/);
});
