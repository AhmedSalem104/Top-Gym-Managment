'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('authenticated entry keeps route features out of the initial shell', () => {
    const index = read('public/index.html');
    const shell = read('public/css/app-shell.source.css');
    const bootstrap = read('public/js/app-shell-bootstrap.js');

    assert.match(index, /\/css\/app-shell\.css\?v=/u);
    assert.match(index, /\/js\/app-shell-bootstrap\.js\?v=[^"'\s]+/u);
    assert.match(index, /\/js\/core\/feature-manifest\.js\?v=[^"'\s]+/u);
    assert.match(index, /\/js\/core\/dialog-loader\.js\?v=[^"'\s]+/u);
    assert.match(index, /\/js\/feature-loader\.js\?v=freeze-whatsapp-v2/u);
    assert.doesNotMatch(index, /\/js\/(?:core\/dialog-loader|feature-loader)\.js\?v=phase3-6/u);
    assert.doesNotMatch(index, /\/js\/app\.js\?/u);
    assert.doesNotMatch(index, /notification-center\.js/u);
    assert.doesNotMatch(index, /core\/phone-inputs\.js/u);
    assert.doesNotMatch(index, /button-loading\.js/u);
    assert.doesNotMatch(index, /pagination\.js/u);
    assert.doesNotMatch(shell, /pages\/(members|reports|library|trainees)\.css/u);
    assert.match(bootstrap, /topGymAuthReady/u);
    assert.match(bootstrap, /topGymLoadApp/u);
});

test('route loader owns route styles and waits for the shared application state', () => {
    const loader = read('public/js/feature-loader.js');
    const manifest = read('public/js/core/feature-manifest.js');
    const pagination = read('public/js/pagination.js');
    const app = read('public/js/app.js');

    assert.match(loader, /function loadStyle\(/u);
    assert.match(loader, /await window\.topGymLoadApp\(\)/u);
    assert.match(manifest, /\/css\/pages\/members\.css\?v=attendance-compact/u);
    assert.match(manifest, /\/js\/core\/phone-inputs\.js\?v=13/u);
    assert.match(loader, /\/js\/notification-center\.js\?v=6/u);
    assert.match(manifest, /\/js\/pagination\.js\?v=2/u);
    assert.match(pagination, /document\.readyState === 'loading'/u);
    assert.match(pagination, /else initializePagination\(\)/u);
    assert.match(app, /function initializeApp\(\)/u);
    assert.match(app, /else initializeApp\(\)/u);
});

test('app-shell delivery artifact is materially smaller than the compatibility bundle', () => {
    const shellSize = fs.statSync(path.join(ROOT, 'public/css/app-shell.css')).size;
    const mainSize = fs.statSync(path.join(ROOT, 'public/css/main.css')).size;
    assert.ok(shellSize < mainSize, `app-shell CSS ${shellSize} should be smaller than main CSS ${mainSize}`);
});

test('optional UI enhancements are deferred until the authenticated app is ready', () => {
    const index = read('public/index.html');
    const loader = read('public/js/feature-loader.js');
    const manifest = read('public/js/core/feature-manifest.js');
    const dialogLoader = read('public/js/core/dialog-loader.js');

    assert.doesNotMatch(index, /\/js\/(?:dialog-enhancements|table-cards|pricing-cards)\.js/u);
    assert.doesNotMatch(index, /id="(?:libraryFormDialog|libraryDetailsDialog|externalTraineeDialog|coachingProfileDialog|coachingBuilderDialog|authUserDialog|backupRestoreDialog)"/u);
    assert.match(loader, /dialog-enhancements/u);
    assert.match(loader, /table-cards/u);
    assert.match(loader, /Promise\.allSettled/u);
    assert.match(loader, /topGymDialogLoader/u);
    assert.match(loader, /Promise\.all\(\[\s*\.\.\.\(feature\.styles \|\| \[\]\)\.map/u);
    assert.match(manifest, /\/dialogs\/coaching\.html\?v=phase4/u);
    assert.match(manifest, /\/dialogs\/library\.html\?v=phase4/u);
    assert.match(dialogLoader, /loadPromises = new Map/u);
    assert.match(dialogLoader, /cache: 'force-cache'/u);
});

test('initial shell stays within the Phase 3-6 delivery budget', () => {
    const index = read('public/index.html');
    const shellSize = fs.statSync(path.join(ROOT, 'public/css/app-shell.css')).size;
    const eagerScripts = (index.match(/<script\b[^>]*\bsrc=/gu) || []).length;

    assert.ok(shellSize < 400_000, `app-shell CSS ${shellSize} exceeds the 400KB shell budget`);
    assert.ok(eagerScripts <= 18, `initial script count ${eagerScripts} exceeds the shell budget`);
});

test('idle cleanup does not use arbitrary dashboard timers', () => {
    const loader = read('public/js/feature-loader.js');
    assert.match(loader, /function scheduleIdle\(callback, timeout = 1500\)/u);
    assert.doesNotMatch(loader, /const delay = immediate \?/u);
    assert.doesNotMatch(loader, /window\.setTimeout\(\(\) => \{\s*if \('requestIdleCallback' in window\)/u);
});
