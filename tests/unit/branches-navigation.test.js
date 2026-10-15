'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('dynamically injected Branches tab keeps delegated navigation and Gym-only routing', () => {
    const tabs = read('public/js/page-tabs.js');
    const branches = read('public/js/branch-context.js');

    assert.match(tabs, /tabRail\?\.addEventListener\('click'/u);
    assert.match(tabs, /name === 'branches' && user\.tenantType !== 'gym'/u);
    assert.match(tabs, /setHidden\(dashboardInitialSkeleton, !isDashboard\)/u);
    assert.match(branches, /button\.dataset\.branchTabReady = 'true'/u);
    assert.match(branches, /button\.setAttribute\('aria-label', translateShared\('nav\.branches', 'الفروع والأقسام'\)\)/u);
    assert.match(branches, /tab\.toggleAttribute\('inert', !show\)/u);
});

test('branch archive action keeps safe archive semantics and neutral affordance', () => {
    const branches = read('public/js/branch-context.js');

    assert.match(branches, /data-branch-archive/u);
    assert.match(branches, /function decorateBranchArchiveActions\(\)/u);
    assert.match(branches, /button\.classList\.remove\('btn-danger'\)/u);
    assert.match(branches, /button\.classList\.add\('btn-light'\)/u);
    assert.match(branches, /button\.innerHTML = localizedMarkup\('actions\.archive', 'أرشفة الفرع'\)/u);
    assert.match(branches, /\/archive`/u);
    assert.match(branches, /preserving its historical data/u);
});
