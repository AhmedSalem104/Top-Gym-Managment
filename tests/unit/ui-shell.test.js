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
    const source = fs.readFileSync(path.join(root, 'public/css/components/navigation-shell.css'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'public/js/page-tabs.js'), 'utf8');

    assert.match(source, /grid-template-columns:\s*var\(--sidebar-width-collapsed\)\s+minmax\(0,\s*1fr\)/u);
    assert.match(source, /\.app-shell\.sidebar-expanded[\s\S]*?grid-template-columns:\s*var\(--sidebar-width-expanded\)\s+minmax\(0,\s*1fr\)/u);
    assert.match(source, /\.app-shell\s*>\s*main\.page[\s\S]*?grid-column:\s*2/u);
    assert.match(source, /\.app-shell\s*>\s*\.page-tabs\.is-hovered\s*>\s*\.page-tab\s*>\s*span[\s\S]*?opacity:\s*1/u);
    assert.match(source, /\.app-shell\s*>\s*\.page-tabs\s*>\s*\.sidebar-brand\s*>\s*\.sidebar-brand-copy[\s\S]*?max-inline-size:\s*0/u);
    assert.match(script, /function initSidebarTooltip\(rail\)/u);
    assert.match(script, /hoverOpenTimer\s*=\s*window\.setTimeout\(revealRail,\s*120\)/u);
});

test('navigation polish keeps desktop controls usable and coordinated', () => {
    const source = fs.readFileSync(path.join(root, 'public/css/components/navigation-shell.css'), 'utf8');

    assert.match(source, /grid-template-columns:\s*var\(--sidebar-width-collapsed\)\s+minmax\(0,\s*1fr\)[\s\S]*?transition:\s*grid-template-columns\s+var\(--sidebar-rail-transition\)/u);
    assert.match(source, /page-tabs\s*\{[\s\S]*?top:\s*80px[\s\S]*?grid-row:\s*2/u);
    assert.match(source, /page-tabs\s*>\s*\.page-tab \.ui-icon[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px/u);
    assert.match(source, /topbar-controls[\s\S]*?gap:\s*var\(--space-2\)/u);
    assert.match(source, /auth-logout-button[\s\S]*?background:\s*transparent/u);
    assert.match(source, /page-tabs::-webkit-scrollbar[\s\S]*?width:\s*5px/u);
    assert.match(source, /sidebar-floating-tooltip[\s\S]*?pointer-events:\s*none/u);
});

test('Gym App shell styles have one canonical source', () => {
    const canonical = fs.readFileSync(path.join(root, 'public/css/components/navigation-shell.css'), 'utf8');
    const secondarySources = [
        'public/css/components/ui-foundation.css',
        'public/css/components/tabs.css',
        'public/css/components/navbar.css',
        'public/css/components/assistant.css',
        'public/css/responsive.css',
        'public/css/theme.css',
        'public/css/pages/branding.css',
        'public/css/layout.css'
    ].map(readRelative => fs.readFileSync(path.join(root, readRelative), 'utf8'));

    assert.match(canonical, /\.app-shell\s*\{/u);
    assert.match(canonical, /\.page-tabs\s*\{/u);
    assert.match(canonical, /\.topbar\s*\{/u);
    for (const source of secondarySources) {
        assert.doesNotMatch(source, /(^|[^a-z0-9_-])(?:#pageTabs|\.app-shell|\.page-tabs|\.page-tab|\.topbar|\.auth-logout-button|\.sidebar-pin-button|\.mobile-nav-toggle|\.kiosk-toggle-button)(?=$|[^a-z0-9_-])/imu);
    }
});
