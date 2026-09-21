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

test('minimal login suppresses marketing composition without touching auth behavior', () => {
    const styles = read('public/css/pages/login.css');

    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.auth-reference-hero[\s\S]*display: none !important/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.saas-entry-card[\s\S]*display: none !important/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.auth-reference-security[\s\S]*display: none !important/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.auth-card\[hidden\][\s\S]*display: none !important/u);
    assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.auth-screen\[data-auth-stage="login"\] \.auth-form-panel/u);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.auth-screen\[data-auth-stage="login"\]/u);
});

test('login remains keyboard and mobile friendly', () => {
    const markup = read('public/index.html');
    const styles = read('public/css/pages/login.css');

    assert.match(markup, /<label for="loginEmail">/u);
    assert.match(markup, /<label for="loginPassword">/u);
    assert.match(markup, /id="loginPasswordToggle"[^>]*aria-label=/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.auth-theme-toggle[\s\S]*min-height: 44px;/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.auth-password-toggle[\s\S]*min-width: 42px;[\s\S]*min-height: 42px;/u);
    assert.match(styles, /\.auth-screen\[data-auth-stage="login"\] \.auth-theme-toggle/iu);
});
