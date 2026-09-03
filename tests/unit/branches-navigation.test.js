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
    assert.match(branches, /button\.setAttribute\('aria-label', 'الفروع'\)/u);
    assert.match(branches, /tab\.toggleAttribute\('inert', !show\)/u);
});
