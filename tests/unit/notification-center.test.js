'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('notification center is loaded only by account shells and uses safe same-origin actions', () => {
    const center = read('public/js/notification-center.js');
    assert.match(center, /credentials: 'same-origin'/);
    assert.match(center, /startsWith\('\/'\)/);
    assert.match(center, /!candidate\.startsWith\('\/\/'\)/);
    assert.match(center, /textContent = item\.title/);
    assert.match(center, /notificationCategoryFilter/);
    assert.match(center, /params\.set\('category', state\.category\)/);
    assert.match(center, /notification-center-item-icon/);
    assert.match(center, /notification-center-item-action/);
    assert.match(center, /EventSource/);
    assert.match(center, /showLiveToast/);
    assert.match(center, /realtimeReconnectTimer/);
    assert.match(center, /if \(host\) \{[\s\S]*void load\(\);/);
    assert.match(center, /api\/member-portal\/notifications/);
    assert.match(read('public/member-portal.html'), /portal-notification-host/);
    assert.match(center, /تصفية الإشعارات/);
    assert.doesNotMatch(center, /All notifications|Registration|System/);
    assert.doesNotMatch(center, /console\.(log|error|warn)\([^)]*(token|secret|password)/i);
    assert.match(read('public/index.html'), /notification-center\.js/);
    assert.match(read('public/platform-admin.html'), /notification-center\.js/);
    assert.match(read('public/trainer-workspace.html'), /notification-center\.js/);
    assert.match(read('public/js/platform-admin.js'), /topGymNotificationCenter\?\.refresh/);
});

test('notification API surface is explicit, paginated and tenant-scoped by the server', () => {
    const service = read('src/services/notification-service.js');
    const routes = read('src/routes/notification.routes.js');
    assert.match(service, /OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY/);
    assert.match(service, /n\.tenant_id=@tenantId/);
    assert.match(service, /n\.tenant_id IS NULL AND @role='PlatformAdmin'/);
    assert.match(routes, /\/api\/notifications\/unread-count/);
    assert.match(routes, /\/api\/notifications\/read-all/);
    assert.match(routes, /\/api\/member-portal\/notifications\/stream/);
    assert.match(routes, /listForPortalMember/);
    assert.match(service, /recipient_member_id/);
    assert.match(service, /saas_member_notification_reads/);
    assert.match(read('src/middleware/auth.middleware.js'), /const notificationPath/);
});
