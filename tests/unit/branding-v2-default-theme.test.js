'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('server and browser tenant-branding fallbacks preserve the canonical V2 Azure primary', () => {
    const server = read('src/services/branding-service.js');
    const browser = read('public/js/branding.js');
    const tokens = read('public/css/tokens.css');

    for (const [name, source] of [['server', server], ['browser', browser]]) {
        assert.match(source, /primary:\s*'#0070F3'/u, `${name} default primary must match V2`);
        assert.match(source, /primaryHover:\s*'#(?:0061DD|80B8FF)'/u, `${name} default hover must use an Azure step`);
        assert.doesNotMatch(source, /#(?:1769E8|7C3AED)/u, `${name} must not restore legacy Azure/purple fallbacks`);
        assert.match(source, /arabicFont:\s*'Tajawal',\s*englishFont:\s*'Geist Sans'/u, `${name} typography defaults must follow V2`);
        assert.match(source, /gradientStart:\s*'#0070F3'/u, `${name} login fallback must use the V2 primary`);
    }

    assert.match(tokens, /--azure-500:\s*#0070f3/u);
    assert.match(tokens, /--shadow-primary:\s*0 8px 20px rgb\(0 112 243 \/ 0\.18\)/u);
});

test('branding preview search is labeled and follows the active centralized locale', () => {
    const html = read('public/index.html');
    const browser = read('public/js/pages/branding/branding.js');
    const translations = read('public/js/core/i18n.js');

    assert.match(html, /class="branding-preview-input"[^>]*data-i18n-aria-label="branding\.preview\.sample\.search"/u);
    assert.match(browser, /const searchLabel = brandingText\('preview\.sample\.search'\);[\s\S]*?setAttribute\('aria-label', searchLabel\)/u);
    assert.match(translations, /'branding\.preview\.sample\.search': 'Search members'/u);
    assert.match(translations, /'branding\.preview\.sample\.search': 'ابحث عن مشترك'/u);
});
