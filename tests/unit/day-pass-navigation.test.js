'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/day-passes.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');

test('daily-pass dialog only registers a pass while the dashboard keeps its separate ledger', () => {
    const dialog = html.match(/<dialog\b[^>]*\bid="dayPassDialog"[^>]*>([\s\S]*?)<\/dialog>/u)?.[1] || '';
    assert.match(dialog, /id="dayPassForm"/u);
    assert.match(dialog, /id="dayPassVisitorName"/u);
    assert.match(dialog, /id="dayPassVisitorPhone"/u);
    assert.match(dialog, /id="dayPassType"/u);
    assert.match(dialog, /id="dayPassPaymentMethod"/u);
    assert.doesNotMatch(dialog, /dayPassTableWrap|dayPassSearch|dayPassRefreshButton|dayPassTodayCount/u);
    assert.doesNotMatch(html, /id="dashboardDayPassManage"/u);
    assert.match(html, /id="dashboardDayPassAdd"/u);
    assert.match(html, /id="dashboardDayPassTableWrap"/u);
    assert.match(source, /function renderDashboardList\(\)/u);
    assert.match(source, /iconButton\('void'/u);
    assert.match(source, /const voidButton = event\.target\.closest\('\[data-day-pass-void\]'\)/u);
    assert.doesNotMatch(source, /function openDayPassRecords\(\)/u);
    assert.doesNotMatch(source, /function loadToday\(\)/u);
});

test('day-pass dialog is outside the attendance screen section', () => {
    assert.match(
        html,
        /id="attendanceTableWrap"[\s\S]*?<\/section>\s*<dialog id="dayPassDialog"/u,
        'attendance screen closes before the day-pass dialog begins'
    );
});

test('dashboard alerts and day-pass card share a 7/5 grid row above finance', () => {
    const dashboard = fs.readFileSync(path.join(__dirname, '../../public/css/pages/dashboard.css'), 'utf8');
    const sourceOrder = source.match(/function arrangeDashboardSections\(\) \{([\s\S]*?)\n    \}/u)?.[1] || '';

    assert.match(dashboard, /\.overview-grid > \.alerts-panel\s*\{\s*grid-column:\s*8 \/ span 5;\s*grid-row:\s*2;/u);
    assert.match(dashboard, /\.overview-grid > \.dashboard-day-pass-card\s*\{\s*grid-column:\s*1 \/ span 7;\s*grid-row:\s*2;/u);
    assert.match(sourceOrder, /overview\.insertBefore\(alerts, insertionPoint\)/u);
    assert.match(sourceOrder, /overview\.insertBefore\(dayPassCard, insertionPoint/u);
});
