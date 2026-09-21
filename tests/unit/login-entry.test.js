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

test('login entry uses the shared Tailwind artifact and application entry', () => {
    const loginCss = fs.statSync(path.join(ROOT, 'public/css/login-entry.css')).size;
    const mainCss = fs.statSync(path.join(ROOT, 'public/css/main.css')).size;
    // The generated login entry shares the authenticated pilot foundation so
    // the root auth gateway and standalone login cannot diverge by load order.
    assert.ok(loginCss < 220_000, `Tailwind login CSS ${loginCss} exceeds the shared foundation budget`);
    assert.ok(mainCss < 220_000, `Tailwind application CSS ${mainCss} exceeds the shared foundation budget`);
});

test('login and authenticated shell share the Tailwind pilot source and functional state contract', () => {
    const appShellSource = read('public/css/app-shell.source.css');
    const loginBuilder = read('scripts/build-login-entry.js');
    const appShell = read('public/css/app-shell.css');
    const loginCss = read('public/css/login-entry.css');

    assert.match(appShellSource, /tailwind\.source\.css/u);
    assert.match(loginBuilder, /buildLoginEntryStyles/u);
    assert.match(appShell, /\.page-tabs/u);
    assert.match(appShell, /\.auth-card/u);
    assert.match(loginCss, /\.auth-card/u);
    assert.match(loginCss, /\[hidden\]/u);
});

test('post-auth loading has no fixed welcome timeout or double-rAF bootstrap', () => {
    const auth = read('public/js/auth-ui.js');
    const bootstrap = read('public/js/app-shell-bootstrap.js');
    assert.match(auth, /topGymAppUsable/u);
    assert.equal(auth.includes('1450'), false);
    assert.match(bootstrap, /requestAnimationFrame\(start\)/u);
    assert.doesNotMatch(bootstrap, /requestAnimationFrame\(\(\)\s*=>\s*window\.requestAnimationFrame/u);
});
