'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const workspace = read('public/trainer-workspace.html');
const script = read('public/js/trainer-workspace.js');
const gymApp = read('public/index.html');

test('independent trainer uses a dedicated product composition', () => {
    assert.match(workspace, /data-product-surface="independent-trainer"/);
    assert.match(workspace, /trainer-workspace-nav/);
    assert.match(workspace, /id="trainerToday"/);
    assert.match(workspace, /id="trainerClients"/);
    assert.match(workspace, /id="trainerPackages"/);
    assert.match(workspace, /id="trainerPurchases"/);
    assert.match(workspace, /id="trainerReports"/);
    assert.match(workspace, /id="trainerQuickActionsTitle"/);
});

test('independent trainer does not render Gym-only dashboard surfaces', () => {
    const gymOnly = /dashboardSection|dashboardDayPass|branchContextShell|dashboardAnalytics|occupancy|day-passes|Gym Members|حضور الجيم|ازدحام الجيم|فروع الجيم/i;
    assert.doesNotMatch(workspace, gymOnly);
    assert.doesNotMatch(script, /\/api\/(?:dashboard|branches|attendance|day-passes|monthly-finance|dashboard-analytics|members)(?:[/'?]|$)/i);
});

test('trainer dashboard data is sourced from trainer APIs and has no fabricated Gym metrics', () => {
    assert.match(script, /\/api\/trainer\/workspace/);
    assert.match(script, /metrics\.activeClients/);
    assert.match(script, /metrics\.sessionsToday/);
    assert.match(script, /metrics\.upcomingSessions/);
    assert.match(script, /metrics\.packagesExpiring/);
    assert.match(script, /metrics\.outstandingPayments/);
    assert.match(script, /\/api\/trainer\/clients/);
    assert.match(script, /\/api\/trainer\/sessions/);
    assert.match(script, /\/api\/trainer\/reports\/summary/);
    assert.match(script, /loadWorkspace\(\), loadClients\(1\), loadReports\(\)/);
    assert.doesNotMatch(script, /fake|mock|demo/i);
});

test('Gym dashboard remains the canonical composition for Gym tenants', () => {
    assert.match(gymApp, /id="dashboardSection"/);
    assert.match(gymApp, /data-page-tab="dashboard"/);
    assert.match(gymApp, /id="branchContextShell"/);
});

test('trainer page has explicit actions for the trainer product only', () => {
    for (const id of ['trainerAddClient', 'trainerAddSession', 'trainerAddPackage', 'trainerAddPurchase', 'trainerRefreshReports']) {
        assert.match(workspace, new RegExp(`id="${id}"`));
    }
    assert.doesNotMatch(workspace, /data-page-tab=/);
});
