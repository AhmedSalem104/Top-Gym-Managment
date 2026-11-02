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
    assert.match(index, /\/js\/feature-loader\.js\?v=[a-f0-9]{16}/u);
    assert.doesNotMatch(index, /\/js\/(?:core\/dialog-loader|feature-loader)\.js\?v=phase3-6/u);
    assert.doesNotMatch(index, /\/js\/app\.js\?/u);
    assert.doesNotMatch(index, /notification-center\.js/u);
    assert.doesNotMatch(index, /core\/phone-inputs\.js/u);
    assert.doesNotMatch(index, /button-loading\.js/u);
    assert.doesNotMatch(index, /pagination\.js/u);
    assert.doesNotMatch(shell, /pages\/(members|reports|library|trainees)\.css/u);
    assert.doesNotMatch(shell, /components\/branch-context\.css/u);
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
    assert.match(manifest, /\/css\/pages\/members\.css\?v=[a-f0-9]{16}/u);
    assert.match(manifest, /\/js\/core\/phone-inputs\.js\?v=[a-f0-9]{16}/u);
    assert.match(loader, /\/js\/notification-center\.js\?v=[a-f0-9]{16}/u);
    assert.match(manifest, /\/js\/pagination\.js\?v=[a-f0-9]{16}/u);
    assert.match(pagination, /document\.readyState === 'loading'/u);
    assert.match(pagination, /else initializePagination\(\)/u);
    assert.match(pagination, /topGymMembersState/u);
    assert.match(app, /window\.topGymMembersState = state/u);
    assert.match(app, /function initializeApp\(\)/u);
    assert.match(app, /else initializeApp\(\)/u);
});

test('warm route changes skip the duplicate shell traversal while cold routes keep the loading transition', () => {
    const loader = read('public/js/feature-loader.js');
    const navigation = read('public/js/page-tabs.js');

    assert.match(loader, /const loadedFeatures = new Set\(\)/u);
    assert.match(loader, /loadedFeatures\.add\(name\)/u);
    assert.match(loader, /window\.topGymIsFeatureReady = \(name\) => loadedFeatures\.has/u);
    assert.match(navigation, /const featureReady = Boolean\(requestedFeature && window\.topGymIsFeatureReady\?\.\(requestedFeature\)\)/u);
    assert.match(navigation, /if \(!featureReady\) renderTab\(name\)/u);
    assert.match(navigation, /if \(featureReady\) renderTab\(name\);\s*renderFeatureAccessState/u);
    assert.match(navigation, /if \(featureReady\) renderTab\(name\);\s*await window\.topGymEnsureTab/u);
    assert.match(navigation, /if \(!featureReady\) renderTab\(name\);\s*animateActiveRouteSurface/u);
});

test('route rendering updates only the previous and next navigation controls', () => {
    const navigation = read('public/js/page-tabs.js');
    const renderTab = navigation.slice(navigation.indexOf('function renderTab(name)'), navigation.indexOf('function animateActiveRouteSurface'));

    assert.match(navigation, /function initializePageTabs\(\)[\s\S]*?rail\.querySelectorAll\('\[data-page-tab\]'\)\.forEach\(configurePageTab\)/u);
    assert.match(renderTab, /const previousTab = tabRail\?\.querySelector\('\[data-page-tab\]\.active'\)/u);
    assert.match(renderTab, /const activeTab = tabRail\?\.querySelector\(.*?data-page-tab/u);
    assert.doesNotMatch(renderTab, /querySelectorAll\('\[data-page-tab\]'\)/u);
});

test('localization annotation reuses its catalog and scans elements and text in one pass', () => {
    const i18n = read('public/js/core/i18n.js');

    assert.match(i18n, /const annotationCatalogs = new Map\(\)/u);
    assert.match(i18n, /NodeFilter\.SHOW_ELEMENT \| NodeFilter\.SHOW_TEXT/u);
    assert.doesNotMatch(i18n, /querySelectorAll\?\.\('\*'\)/u);
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
    assert.match(manifest, /\/dialogs\/coaching\.html\?v=[a-f0-9]{16}/u);
    assert.match(manifest, /\/dialogs\/library\.html\?v=[a-f0-9]{16}/u);
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
