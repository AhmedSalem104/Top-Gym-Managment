'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('login entry is generated from the shared auth card and excludes the app shell', () => {
    const index = read('public/index.html');
    const login = read('public/login.html');

    assert.equal((index.match(/AUTH_ENTRY_CARD_START/g) || []).length, 1);
    assert.equal((index.match(/AUTH_ENTRY_CARD_END/g) || []).length, 1);
    assert.match(login, /id="authScreen"[^>]*data-auth-stage="login"/u);
    assert.match(login, /id="authLoginCard"/u);
    assert.match(login, /id="loginForm"/u);
    assert.match(login, /id="loginEmail"/u);
    assert.match(login, /id="loginPassword"/u);
    assert.match(login, /data-theme-toggle/iu);
    assert.doesNotMatch(login, /class="app-shell"/u);
    assert.doesNotMatch(login, /notification-center\.js/u);
    assert.doesNotMatch(login, /\/js\/app\.js/u);
    assert.doesNotMatch(login, /core\/phone-inputs\.js/u);
    assert.doesNotMatch(login, /\/css\/main\.css/u);
    assert.match(login, /\/css\/login-entry\.css\?v=[a-f0-9]{12}/u);
});

test('login entry delivery is server-selected only for unauthenticated root requests', () => {
    const server = read('server.js');
    assert.match(server, /const user = await authService\.getSessionUser\(authService\.readSessionCookie\(request\)/u);
    assert.match(server, /if \(!user\) return response\.sendFile\(path\.join\(publicDirectory, 'login\.html'\)\)/u);
    assert.match(server, /return next\(\);/u);
});

test('unauthenticated protected deep links receive the login entry instead of the app shell', () => {
    const server = read('server.js');
    assert.match(server, /app\.get\('\*', asyncRoute\(async \(request, response\) =>/u);
    assert.match(server, /if \(!user\) \{[\s\S]*?return response\.sendFile\(path\.join\(publicDirectory, 'login\.html'\)\);[\s\S]*?response\.sendFile\(path\.join\(publicDirectory, 'index\.html'\)\);/u);
});

test('login entry stylesheet is materially smaller than the full app stylesheet', () => {
    const loginCss = fs.statSync(path.join(ROOT, 'public/css/login-entry.css')).size;
    const mainCss = fs.statSync(path.join(ROOT, 'public/css/main.css')).size;
    assert.ok(loginCss < mainCss * 0.5, `login CSS ${loginCss} should be less than half of main CSS ${mainCss}`);
});
