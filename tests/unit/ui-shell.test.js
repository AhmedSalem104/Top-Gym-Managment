const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

test('navigation pending state keeps the Gym App controls interactive', () => {
    const source = fs.readFileSync(path.join(root, 'public/css/layout.css'), 'utf8');
    const pendingBlock = source.match(/\.top-gym-navigation-pending[\s\S]*?transition: opacity 160ms ease;/u)?.[0] || '';

    assert.match(pendingBlock, /opacity:\s*\.86/u);
    assert.doesNotMatch(pendingBlock, /pointer-events:\s*none/u);
});

test('desktop sidebar hover contract expands a safe layout track and reveals labels', () => {
    const source = fs.readFileSync(path.join(root, 'public/css/components/ui-foundation.css'), 'utf8');

    assert.match(source, /grid-template-columns:\s*var\(--sidebar-width-collapsed,\s*84px\)\s+minmax\(0,\s*1fr\)/u);
    assert.match(source, /\.app-shell\.sidebar-expanded[\s\S]*?grid-template-columns:\s*var\(--sidebar-width-expanded,\s*292px\)\s+minmax\(0,\s*1fr\)/u);
    assert.match(source, /\.app-shell\s*>\s*main\.page[\s\S]*?grid-column:\s*2/u);
    assert.match(source, /\.app-shell\s*>\s*\.page-tabs:hover\s*>\s*\.page-tab\s*>\s*span[\s\S]*?opacity:\s*1/u);
});
