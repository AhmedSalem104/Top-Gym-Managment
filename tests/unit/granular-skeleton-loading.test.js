'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('shared skeleton utility exposes bounded component primitives without artificial delays', () => {
    const source = read('public/js/loading-skeleton.js');

    assert.match(source, /window\.topGymSkeleton/);
    assert.match(source, /function table\(/);
    assert.match(source, /function list\(/);
    assert.match(source, /function cards\(/);
    assert.match(source, /function text\(/);
    assert.match(source, /function avatar\(/);
    assert.match(source, /function kpi\(/);
    assert.match(source, /function chart\(/);
    assert.match(source, /function form\(/);
    assert.match(source, /function select\(/);
    assert.match(source, /Object\.freeze\(\{ avatar, cards, chart, error, form, hydrate, kpi, list, ready, refresh, select, start, table, text \}\)/);
    assert.match(source, /function refresh\(/);
    assert.match(source, /function ready\(/);
    assert.match(source, /aria-busy/);
    assert.match(source, /loadingState/);
    assert.doesNotMatch(source, /setTimeout|setInterval/);
});

test('members, dashboard, platform and trainer surfaces use component-scoped loading contracts', () => {
    const index = read('public/index.html');
    const trainerMarkup = read('public/trainer-workspace.html');
    const trainerScript = read('public/js/trainer-workspace.js');

    assert.match(index, /id="membersList"[^>]+data-skeleton-kind="table"/);
    assert.match(index, /id="alertsList"[^>]+data-skeleton-kind="list"/);
    assert.match(index, /class="stats-grid"[^>]+data-skeleton-region="dashboard-stats"/);
    assert.match(index, /id="platformPlansList"[^>]+data-skeleton-kind="cards"/);
    assert.match(index, /id="platformAuditList"[^>]+data-skeleton-kind="list"/);
    assert.match(read('public/js/app.js'), /topGymSkeleton\?\.ready\(membersList\)/);
    assert.match(read('public/js/app.js'), /data-members-retry/);
    assert.match(trainerMarkup, /id="trainerClientsList"[^>]+data-skeleton-kind="list"/);
    assert.match(trainerMarkup, /id="trainerSessionsList"[^>]+data-skeleton-kind="list"/);
    assert.match(trainerScript, /function beginRegionLoading\(/);
    assert.match(trainerScript, /topGymSkeleton\?\.ready/);
    assert.doesNotMatch(index, /\/css\/pages\/dashboard\.css/);
});

test('refreshing a region preserves its current content and reduced motion disables shimmer', () => {
    const utility = read('public/js/loading-skeleton.js');

    assert.match(utility, /function refresh\(host\) \{[\s\S]*preserve: true/);
    const functionalState = read('public/css/functional-state.css');
    assert.match(functionalState, /prefers-reduced-motion/);
    assert.doesNotMatch(functionalState, /\.skeleton-region|trainer-workspace-summary/);
});
