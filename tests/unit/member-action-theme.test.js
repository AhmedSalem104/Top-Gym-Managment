'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../public/css/pages/members.css'), 'utf8');
const iconSource = fs.readFileSync(path.join(__dirname, '../../public/css/components/icons.css'), 'utf8');
test('subscriber action and more-menu icons share the same visual box on desktop and mobile', () => {
    assert.match(iconSource, /\.action-icon,\s*\.action-menu-icon\s*\{[^}]*width:\s*17px;[^}]*height:\s*17px;[^}]*flex-basis:\s*17px;/u);
    assert.match(source, /\.members-mobile-actions \.table-action-visible \.action-icon,\s*\.members-mobile-actions \.action-menu-toggle \.action-menu-icon\s*\{\s*width:\s*16px;\s*height:\s*16px;\s*flex:\s*0 0 16px;/u);
});

test('member status and sort filters share one inline tab row without a filter dialog', () => {
    const html = fs.readFileSync(path.join(__dirname, '../../public/index.html'), 'utf8');
    const app = fs.readFileSync(path.join(__dirname, '../../public/js/app.js'), 'utf8');
    assert.match(source, /\.members-filter-tabs-row\s*\{[^}]*display:\s*flex;/u);
    assert.match(app, /filterRow\.append\(statusField,\s*statusChoices,\s*sortField,\s*sortChoices\)/u);
    assert.doesNotMatch(html, /id="membersFiltersDialog"/u);
    assert.doesNotMatch(source, /\.members-filter-dialog/u);
});

test('subscriber row action geometry is theme-independent, with one mobile size', () => {
    assert.match(source, /\.members-table \.actions-cell \.table-actions > \.icon-action\[data-action\],[\s\S]*?width: 38px;[\s\S]*?height: 38px;[\s\S]*?flex: 0 0 38px;/u);
    assert.match(source, /\.members-table \.actions-cell \.table-actions \.action-menu-toggle\s*\{[^}]*width: 38px;[^}]*height: 38px;/u);
    assert.match(source, /@media \(max-width: 767px\)\s*\{[\s\S]*?\.members-table \.actions-cell \.table-actions > \.icon-action\[data-action\],[\s\S]*?width: 40px;[\s\S]*?height: 40px;/u);
    assert.doesNotMatch(source, /html\[data-theme="dark"\] \.members-table \.table-actions[^}]*width:/u);
});

test('renew is solid semantic primary in both themes', () => {
    assert.match(source, /\.members-table \.actions-cell \.table-actions > \.icon-action\[data-action="renew"\]\s*\{[^}]*background: var\(--primary\);[^}]*color: var\(--text-on-primary\);/u);
    assert.match(source, /\.members-table \.actions-cell \.table-actions > \.icon-action\[data-action="renew"\]:hover:not\(:disabled\)\s*\{[^}]*background: var\(--primary-hover\);/u);
});

test('secondary, unavailable, focus and disabled states use shared theme tokens', () => {
    assert.match(source, /\.members-table \.actions-cell \.table-actions > \.icon-action:not\(\[data-action="renew"\]\),[\s\S]*?background: var\(--bg-elevated\);[\s\S]*?color: var\(--text-secondary\);/u);
    assert.match(source, /\.members-table \.actions-cell \.table-actions > \.icon-action:disabled[\s\S]*?background: var\(--bg-app\);[\s\S]*?color: var\(--text-disabled\);/u);
    assert.match(source, /\.members-table \.actions-cell \.member-attendance-status\.unavailable\s*\{[^}]*color: var\(--text-disabled\);/u);
    assert.doesNotMatch(source, /\.members-table \.actions-cell[^}]*#[\da-f]{3,8}/iu);
});
