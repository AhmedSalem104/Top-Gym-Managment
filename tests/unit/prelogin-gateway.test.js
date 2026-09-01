'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('pre-login gateway keeps the auth entry point and product preview together', () => {
    const markup = read('public/index.html');

    assert.match(markup, /id="saasEntryCard"/);
    assert.match(markup, /id="saasEntryContinue"/);
    assert.match(markup, /id="authLoginCard"/);
    assert.match(markup, /class="saas-entry-preview"/);
    assert.match(markup, /class="saas-entry-preview-glass-panel"/);
    assert.match(markup, /أدر جيمك بذكاء، <span>من مكان واحد\.<\/span>/);
    assert.match(markup, /الدخول إلى مساحة الجيم/);
    assert.match(markup, /class="saas-entry-preview-sidebar"/);
    assert.match(markup, /class="saas-entry-preview-kpis"/);
    assert.match(markup, /class="saas-entry-preview-activity"/);
});

test('pre-login gateway layout is theme-token based and preserves desktop/mobile intent', () => {
    const styles = read('public/css/pages/login.css');

    assert.match(styles, /grid-template-areas:\s*"preview copy"/);
    assert.doesNotMatch(styles, /grid-template-areas:[\s\S]*"preview action"/);
    assert.match(styles, /\.saas-entry-preview\s*\{[\s\S]*grid-area: preview/);
    assert.match(styles, /background-image:[\s\S]*gym-background\.webp/);
    assert.match(styles, /\.auth-screen\[data-auth-stage="gateway"\] \.auth-theme-toggle\s*\{[\s\S]*font-size: var\(--font-sm\)/);
    assert.match(styles, /\.auth-screen\[data-auth-stage="gateway"\] \.auth-theme-toggle\s*>\s*span\[data-theme-toggle-label\][\s\S]*position: static/);
    assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.saas-entry-copy\s*\{[\s\S]*display: contents/);
    assert.match(styles, /\.saas-entry-preview\s*\{[\s\S]*background: var\(--bg/);
    assert.doesNotMatch(styles, /\.saas-entry-preview[^}]*#[0-9a-f]{3,8}/i);
});

test('pre-login CTA remains wired to the existing authentication stage transition', () => {
    const authUi = read('public/js/auth-ui.js');

    assert.match(authUi, /saasEntryContinue/);
    assert.match(authUi, /setAuthStage\(['"]login['"]\)/);
});
