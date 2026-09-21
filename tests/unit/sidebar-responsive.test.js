'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Gym App exposes an accessible grouped mobile navigation drawer', () => {
    const index = read('public/index.html');
    const source = read('public/js/page-tabs.js');

    assert.match(index, /id="mobileNavToggle"[^>]*aria-controls="pageTabs"/);
    assert.match(index, /id="mobileNavClose"/);
    assert.match(index, /id="mobileNavBackdrop"[^>]*hidden/);
    assert.match(index, /id="mobileNavCurrent"/);
    assert.match(index, /branch-context-kicker/);
    assert.match(index, /\/js\/page-tabs\.js\?v=25/);
    assert.match(source, /function initMobileNavigation\(\)/);
    assert.match(source, /matchMedia\('\(max-width: 767px\)'\)/);
    assert.match(source, /rail\.inert = !open/u);
    assert.match(source, /function ensureNavigationSections\(\)/u);
    assert.match(source, /data-nav-group-label/u);
    assert.match(source, /function syncMobileNavigationContext\(name\)/u);
    assert.doesNotMatch(index, /\/css\/components\/navigation-shell\.css/u);
    assert.match(read('public/css/functional-state.css'), /\[hidden\]/u);
});

test('Mobile navigation drawer keeps focus contained and supports reduced motion', () => {
    const source = read('public/js/page-tabs.js');
    assert.match(source, /event\.key === 'Escape'/u);
    assert.match(source, /event\.key !== 'Tab'/u);
    assert.match(source, /lastFocusedElement\.focus\(\)/u);
    assert.match(read('public/css/functional-state.css'), /prefers-reduced-motion/u);
});

test('Desktop navigation keeps its functional DOM contract during the reset', () => {
    const index = read('public/index.html');
    assert.match(index, /id="pageTabs"/u);
    assert.match(index, /id="mobileNavToggle"/u);
    assert.doesNotMatch(index, /\/css\/components\/navigation-shell\.css/u);
});
