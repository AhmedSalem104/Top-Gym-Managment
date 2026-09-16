'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('operational WhatsApp flows use the centralized renderer', () => {
    const memberConnector = read('public/js/whatsapp-enhancements.js');
    const dayPass = read('public/js/day-passes.js');
    const dayPassReports = read('public/js/day-pass-reports.js');
    const platformAdmin = read('public/js/platform-admin.js');

    assert.match(memberConnector, /renderTemplate\('PORTAL_ACCESS'/);
    assert.match(memberConnector, /renderTemplate\('MEMBERSHIP_WELCOME'/);
    assert.match(memberConnector, /renderTemplate\('MEMBERSHIP_FROZEN'/);
    assert.match(memberConnector, /sendMembershipFreezeNotice/);
    assert.match(memberConnector, /alertTemplateId/);
    assert.doesNotMatch(memberConnector, /function\s+(?:messageFrame|build(?:Alert)?Message)\s*\(/);
    assert.doesNotMatch(memberConnector, /مبروك يا بطل|ملخص الحساب|تفاصيل اشتراكك|كود العضوية الخاص بك/);
    assert.match(read('public/js/app.js'), /dialogFreezeWhatsappOption/);
    assert.doesNotMatch(read('public/js/app.js'), /id="dialogFreezeSendWhatsApp"/);
    assert.match(dayPass, /LogicFitWhatsAppTemplates\.render\('DAY_PASS_THANK_YOU'/);
    assert.match(dayPassReports, /LogicFitWhatsAppTemplates\.render\('DAY_PASS_THANK_YOU'/);
    assert.match(platformAdmin, /LogicFitWhatsAppTemplates\.render\('TENANT_ACTIVATED'/);
});

test('the central WhatsApp runtime cache-bust advances with the renderer contract', () => {
    const loader = read('public/js/feature-loader.js');
    assert.match(loader, /whatsapp-enhancements\.js\?v=14/);
    assert.doesNotMatch(loader, /whatsapp-enhancements\.js\?v=13/);
    assert.match(read('public/index.html'), /feature-loader\.js\?v=loading-path-v1/);
    assert.match(read('public/index.html'), /app-shell-bootstrap\.js\?v=members-pagination-fix-v1/);
    assert.match(read('public/js/app-shell-bootstrap.js'), /app\.js\?v=members-pagination-fix-v1/);
});

test('Gym feature loading keeps only the runtime renderer and no management UI', () => {
    const manifest = read('public/js/core/feature-manifest.js');
    const loader = read('public/js/feature-loader.js');
    const pageTabs = read('public/js/page-tabs.js');
    const permissions = read('public/js/core/permissions.js');

    assert.match(manifest, /'whatsapp-runtime'/);
    assert.match(manifest, /reports:\s*\{[^\n]*'whatsapp-runtime'/);
    assert.match(manifest, /'dashboard-enhancements':\s*\{[^\n]*'whatsapp-runtime'/);
    assert.doesNotMatch(manifest, /'whatsapp-templates'\s*:/);
    assert.doesNotMatch(loader, /ensureTab\('whatsapp-templates'\)/);
    assert.doesNotMatch(loader, /topGymWhatsappTemplatesUi/);
    assert.doesNotMatch(pageTabs, /whatsappTemplatesSection|platformSettingsShell|settings\/whatsapp/);
    assert.doesNotMatch(permissions, /['"]whatsapp-templates['"]/);
});

test('Platform Admin owns the only template management surface', () => {
    const page = read('public/platform-admin.html');
    const templatesUi = read('public/js/pages/management/whatsapp-templates.js');
    const platformCss = read('public/css/pages/platform-admin.css');
    const templatesCss = read('public/css/pages/whatsapp-templates.css');

    assert.match(page, /id="platformSettingsShell"/);
    assert.match(page, /id="platformWhatsappTemplatesMount"/);
    assert.match(page, /data-platform-panel="settings"/);
    assert.match(page, /js\/pages\/management\/whatsapp-templates\.js/);
    assert.match(templatesUi, /data-whatsapp-template-list/);
    assert.match(templatesUi, /data-whatsapp-template-body/);
    assert.match(templatesUi, /data-whatsapp-template-variables/);
    assert.match(templatesUi, /data-whatsapp-template-preview/);
    assert.match(templatesUi, /\/api\/platform\/whatsapp-templates/);
    assert.match(platformCss, /platform-settings-card-grid/);
    assert.match(platformCss, /whatsapp-templates\.css/);
    assert.match(templatesCss, /grid-template-columns: minmax\(220px, \.25fr\)/);
});

test('Tenant management API is disabled while runtime reads system templates', () => {
    const routes = read('src/routes/whatsapp-template.routes.js');
    const service = read('src/services/whatsapp-template-service.js');
    assert.match(routes, /PLATFORM_TEMPLATES_ONLY/);
    assert.match(routes, /api\/whatsapp-templates\/runtime/);
    assert.match(routes, /api\/platform\/whatsapp-templates/);
    assert.match(service, /source of truth|مصدر الحقيقة/);
    assert.doesNotMatch(service, /gym_whatsapp_template_overrides/);
    assert.match(read('src/services/tenant-service.js'), /gym_whatsapp_template_overrides/);
    assert.match(read('database/migrations/034-whatsapp-message-templates.sql'), /whatsapp_message_templates/);
});
