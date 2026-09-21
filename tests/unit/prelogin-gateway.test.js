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
    const markup = read('public/login.html');
    assert.match(markup, /\/css\/login-entry\.css\?v=/u);
    assert.doesNotMatch(markup, /\/css\/pages\/login\.css/u);
    assert.match(read('public/css/functional-state.css'), /auth-pending|auth-locked/u);
});

test('login remains keyboard and mobile friendly', () => {
    const markup = read('public/login.html');

    assert.match(markup, /<label for="loginEmail">/u);
    assert.match(markup, /<label for="loginPassword">/u);
    assert.match(markup, /id="loginPasswordToggle"[^>]*aria-label=/u);
    assert.match(markup, /\/css\/login-entry\.css\?v=/u);
});
