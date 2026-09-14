'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('all WhatsApp entry points use the central template renderer', () => {
    const memberConnector = read('public/js/whatsapp-enhancements.js');
    const dayPass = read('public/js/day-passes.js');
    const dayPassReports = read('public/js/day-pass-reports.js');
    const platformAdmin = read('public/js/platform-admin.js');

    assert.match(memberConnector, /renderTemplate\('PORTAL_ACCESS'/);
    assert.match(memberConnector, /renderTemplate\('MEMBERSHIP_WELCOME'/);
    assert.match(memberConnector, /alertTemplateId/);
    assert.doesNotMatch(memberConnector, /function\s+build(?:Alert)?Message\s*\(/);
    assert.match(dayPass, /LogicFitWhatsAppTemplates\.render\('DAY_PASS_THANK_YOU'/);
    assert.match(dayPassReports, /LogicFitWhatsAppTemplates\.render\('DAY_PASS_THANK_YOU'/);
    assert.match(platformAdmin, /LogicFitWhatsAppTemplates\.render\('TENANT_ACTIVATED'/);
});

test('the feature loader loads the shared renderer before day-pass/report consumers', () => {
    const manifest = read('public/js/core/feature-manifest.js');
    assert.match(manifest, /reports:\s*\{[^\n]*dependencies:\s*\[[^\]]*'whatsapp-templates'/);
    assert.match(manifest, /'dashboard-enhancements':\s*\{[^\n]*dependencies:\s*\[[^\]]*'whatsapp-templates'/);
    assert.match(manifest, /'whatsapp-templates':\s*\{[^\n]*whatsapp-templates\.js/);
    assert.match(read('public/js/feature-loader.js'), /name === 'whatsapp-templates'[\s\S]*for \(const source of feature\.scripts/);
    assert.match(read('public/js/feature-loader.js'), /name === 'whatsapp-templates'\) await window\.topGymWhatsappTemplatesUi\?\.load/);
});

test('platform template routes and tenant registry are explicit', () => {
    assert.match(read('src/routes/whatsapp-template.routes.js'), /api\/whatsapp-templates/);
    assert.match(read('src/routes/whatsapp-template.routes.js'), /api\/platform\/whatsapp-templates/);
    assert.match(read('src/permissions/route-permissions.js'), /MESSAGE_TEMPLATES_MANAGE/);
    assert.match(read('src/services/tenant-service.js'), /gym_whatsapp_template_overrides/);
    assert.match(read('database/migrations/034-whatsapp-message-templates.sql'), /whatsapp_message_templates/);
});
