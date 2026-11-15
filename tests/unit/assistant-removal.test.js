'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

test('assistant removal is tenant-scoped and preserves account history', () => {
    const repository = read('src/repositories/user.repository.js');
    const deletion = repository.slice(repository.indexOf('async function deleteAssistant'), repository.indexOf('\nmodule.exports'));

    assert.match(deletion, /if \(tenantId == null\) throw/);
    assert.match(deletion, /return withTransaction\(async \(transaction\)/);
    assert.match(deletion, /DELETE FROM dbo\.gym_branch_user_access\s+WHERE user_id=@id AND tenant_id=@tenantId/);
    assert.match(deletion, /UPDATE dbo\.gym_user_tenants\s+SET status='disabled'/);
    assert.doesNotMatch(deletion, /DELETE FROM dbo\.gym_users/);
    assert.doesNotMatch(deletion, /DELETE FROM dbo\.saas_notifications/);
    assert.match(deletion, /IF EXISTS \(SELECT 1 FROM dbo\.gym_user_tenants WHERE user_id=@id AND status='active'\)/);
    assert.match(deletion, /UPDATE dbo\.gym_auth_sessions\s+SET revoked_at=SYSUTCDATETIME\(\)\s+WHERE user_id=@id/);
    assert.match(deletion, /UPDATE dbo\.gym_mobile_refresh_sessions\s+SET revoked_at=SYSUTCDATETIME\(\)\s+WHERE user_id=@id/);
});

test('confirmation and localized feedback describe removal, not permanent account deletion', () => {
    const frontend = read('public/js/pages/management/auth-users.js');
    const catalog = read('public/js/core/i18n-catalog.js');
    const deleteFlow = frontend.slice(frontend.indexOf('async function deleteUser'), frontend.indexOf('\n    function bind'));

    assert.ok(deleteFlow.indexOf('if (!confirmed) return;') < deleteFlow.indexOf("method: 'DELETE'"));
    assert.match(catalog, /permissionsScreen\.authUsers\.confirm\.deleteBody': '[^']*إيقاف وصول/);
    assert.match(catalog, /permissionsScreen\.authUsers\.confirm\.deleteBody': 'This will revoke/);
    assert.match(catalog, /permissionsScreen\.authUsers\.message\.deleted': 'تمت إزالة المساعد/);
    assert.match(catalog, /permissionsScreen\.authUsers\.message\.deleted': 'Assistant .*removed from this gym/);
});

test('assistant removal uses safe tenant-specific failure messages', () => {
    const service = read('src/services/auth-service.js');
    const start = service.indexOf('async function deleteAssistant');
    const removal = service.slice(start, service.indexOf('\nfunction canAccess', start));

    assert.match(removal, /ASSISTANT_REMOVAL_CONFLICT/);
    assert.match(removal, /ASSISTANT_DELETE_FAILED/);
    assert.doesNotMatch(removal, /revokeForUser\(userId\);\s*const result/);
});
