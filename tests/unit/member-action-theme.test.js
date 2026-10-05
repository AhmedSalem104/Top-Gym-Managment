'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../public/css/pages/members.css'), 'utf8');

test('dark member row actions retain the light-theme control geometry', () => {
    assert.match(source, /html\[data-theme="dark"\] \.members-table \.table-actions > \.table-action-visible\s*\{[^}]*width: 38px;[^}]*height: 38px;[^}]*flex: 0 0 38px;/u);
    assert.match(source, /html\[data-theme="dark"\] \.members-table \.table-actions \.action-menu-toggle\s*\{[^}]*width: 38px;[^}]*height: 38px;/u);
    assert.match(source, /\.members-table \.table-actions \.action-menu-toggle\s*\{[^}]*width: 38px;[^}]*height: 38px;/u);
});

test('the renewal refresh action remains solid primary in the dark theme', () => {
    assert.match(source, /html\[data-theme="dark"\] \.members-table \.table-actions > \[data-action="renew"\]\s*\{[^}]*background: var\(--rf-accent\);[^}]*color: var\(--text-on-primary\);/u);
    assert.match(source, /\[data-action="renew"\]:hover:not\(:disabled\)\s*\{[^}]*background: var\(--rf-accent-strong\);/u);
});

test('dark member secondary and unavailable actions stay neutral and theme-token based', () => {
    assert.match(source, /\.table-action-visible:not\(\[data-action="renew"\]\)\s*\{[^}]*background: var\(--bg-elevated\);[^}]*color: var\(--text-secondary\);/u);
    assert.match(source, /\.table-action-visible:disabled[\s\S]*?background: var\(--bg-app\);[\s\S]*?color: var\(--text-disabled\);/u);
    assert.doesNotMatch(source, /html\[data-theme="dark"\] \.members-table[^}]*#[\da-f]{3,8}/iu);
});
