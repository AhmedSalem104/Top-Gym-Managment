'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('minimal login keeps only the real auth hooks and theme control', () => {
    const markup = read('public/index.html');

    assert.match(markup, /id="authScreen"[^>]*data-auth-stage="login"/u);
    assert.match(markup, /id="authLoginCard"/u);
    assert.match(markup, /id="loginForm"/u);
    assert.match(markup, /id="loginEmail"[^>]*required/u);
    assert.match(markup, /id="loginPassword"[^>]*required/u);
    assert.match(markup, /data-theme-toggle/iu);
});

test('V2 login keeps the compact card, splits desktop content, and stacks features on smaller screens', () => {
    const markup = read('public/index.html');
    const styles = read('public/css/pages/login.css');
    const generatedLogin = read('public/login.html');
    const cardEnd = markup.indexOf('<!-- AUTH_ENTRY_CARD_END -->');
    const featuresStart = markup.indexOf('<!-- AUTH_ENTRY_FEATURES_START -->');

    assert.ok(cardEnd >= 0 && featuresStart > cardEnd, 'the three feature cards must follow the login card in the existing markup');
    assert.match(markup, /class="auth-reference-features"/u);
    assert.match(generatedLogin, /class="auth-entry-layout"[\s\S]*class="auth-card"[\s\S]*class="auth-marketing-panel"[\s\S]*class="auth-reference-features"/u);
    assert.match(styles, /grid-template-areas:\s*"marketing login"/u);
    assert.match(styles, /@media \(max-width: 980px\)[\s\S]*?grid-template-areas:\s*"login" "marketing"/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\]::before[\s\S]*?filter:\s*none;/u);
    assert.doesNotMatch(markup, /class="auth-reference-hero(?:\s|["'])/u, 'the retired split hero must not return to the Login DOM');
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.saas-entry-card,[\s\S]*?display: none;/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.auth-reference-security[\s\S]*?display: none;/u);
    assert.match(read('public/css/reset.css'), /\[hidden\]\s*\{\s*display:\s*none\s*!important;/u,
        'native hidden state remains owned by the shared reset');
    assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.auth-screen\[data-auth-stage="login"\] \.auth-form-panel/u);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.auth-screen\[data-auth-stage="login"\]/u);
});

test('login remains keyboard and mobile friendly', () => {
    const markup = read('public/index.html');
    const styles = read('public/css/components/login-theme-toggle.css');
    const loginStyles = read('public/css/pages/login.css');

    assert.match(markup, /<label for="loginEmail">/u);
    assert.match(markup, /<label for="loginPassword">/u);
    assert.match(markup, /id="loginPasswordToggle"[^>]*aria-label=/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.theme-toggle-switch[\s\S]*height: 40px;[\s\S]*min-height: 40px;/u);
    assert.match(styles, /@media \(max-width: 767px\)[\s\S]*\.auth-screen\[data-auth-stage="login"\] \.theme-toggle-switch::after[\s\S]*height: 44px;/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.auth-theme-toggle[\s\S]*inset-inline-start: 20px;/u);
    assert.match(loginStyles, /\.auth-screen\[data-auth-stage="login"\] \.auth-password-toggle[\s\S]*min-width: 42px;[\s\S]*min-height: 42px;/u);
});
