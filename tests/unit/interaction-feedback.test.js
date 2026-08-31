'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('unified feedback utility exposes safe async action primitives', () => {
    const source = read('public/js/ui-feedback.js');

    assert.match(source, /window\.LogicFitFeedback/);
    assert.match(source, /function start\(button, options = \{\}\)/);
    assert.match(source, /function stop\(button, options = \{\}\)/);
    assert.match(source, /async function run\(button, task, options = \{\}\)/);
    assert.match(source, /button\.disabled = true/);
    assert.match(source, /setAttribute\('aria-busy', 'true'\)/);
    assert.match(source, /originalHtml: button\.innerHTML/);
    assert.match(source, /messageElement\.textContent/);
});

test('feedback CSS has accessible loading, toast and reduced-motion states', () => {
    const styles = read('public/css/components/feedback.css');

    assert.match(styles, /\.logicfit-button-spinner/);
    assert.match(styles, /\.logicfit-feedback-toast-stack/);
    assert.match(styles, /prefers-reduced-motion/);
    assert.match(styles, /pointer-events:\s*none/);
    assert.match(styles, /pointer-events:\s*auto/);
});

test('critical surfaces load the same feedback layer with context-aware labels', () => {
    const index = read('public/index.html');
    const portal = read('public/member-portal.html');
    const platform = read('public/platform-admin.html');

    assert.match(index, /\/js\/ui-feedback\.js\?v=2/);
    assert.match(index, /id="loginSubmit"[^>]*data-feedback-ignore[^>]*data-loading-text="جاري تسجيل الدخول\.\.\."/);
    assert.match(portal, /\/js\/ui-feedback\.js\?v=2/);
    assert.match(portal, /id="portalSubmitButton"[^>]*data-loading-text="جاري التحقق من الكود\.\.\."/);
    assert.match(portal, /id="portalOccupancyRefresh"[^>]*data-async-action="true"/);
    assert.match(platform, /\/js\/ui-feedback\.js\?v=2/);
});

test('legacy auto-loading bridge excludes immediate controls and preserves compatibility hooks', () => {
    const source = read('public/js/button-loading.js');

    assert.match(source, /data-feedback-ignore/);
    assert.match(source, /data-dialog-cancel/);
    assert.match(source, /data-page-tab/);
    assert.match(source, /data-portal-tool/);
    assert.match(source, /window\.topGymStopButtonLoading\s*=\s*stopButtonLoading/);
    assert.match(source, /window\.topGymStartButtonLoading\s*=\s*startButtonLoading/);
    assert.match(source, /const activeButtons = new WeakSet\(\)/);
    assert.match(source, /feedback\.isLoading\(latestClickedButton\)/);
});

test('standalone buttons require explicit async opt-in and are never inferred from labels', () => {
    const source = read('public/js/button-loading.js');

    assert.doesNotMatch(source, /const asyncHint\s*=/);
    assert.match(source, /Standalone buttons must opt in explicitly/);
    assert.match(source, /if \(button\.dataset\.asyncAction === 'true' \|\| button\.dataset\.feedbackAction === 'async'\) return true;/);
    assert.match(source, /return false;/);
});

test('submit controls are not disabled during click capture before native submit dispatch', () => {
    const source = read('public/js/button-loading.js');

    assert.match(source, /A submit button must remain enabled until the browser has/);
    assert.match(source, /if \(\(button\.getAttribute\('type'\) \|\| 'submit'\)\.toLowerCase\(\) === 'submit'\) return;/);
});

test('backup and restore actions use contextual loading without changing success semantics', () => {
    const source = read('public/js/pages/management/backup.js');

    assert.match(source, /function setActionLoading\(button, loading, loadingText\)/);
    assert.match(source, /جاري إنشاء النسخة/);
    assert.match(source, /جاري استرجاع النسخة/);
    assert.match(source, /setActionLoading\(trigger, true/);
    assert.match(source, /setActionLoading\(restoreSubmit, true/);
    assert.match(source, /window\.topGymFeedback\.toast/);
});
