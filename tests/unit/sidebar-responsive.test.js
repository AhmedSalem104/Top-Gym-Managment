'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Gym App exposes an explicit mobile navigation drawer contract', () => {
    const index = read('public/index.html');
    const source = read('public/js/page-tabs.js');
    const styles = read('public/css/components/ui-foundation.css');

    assert.match(index, /id="mobileNavToggle"[^>]*aria-controls="pageTabs"/);
    assert.match(index, /id="mobileNavClose"/);
    assert.match(index, /id="mobileNavBackdrop"[^>]*hidden/);
    assert.match(index, /\/js\/page-tabs\.js\?v=17/);
    assert.match(source, /function initMobileNavigation\(\)/);
    assert.match(source, /mobile-nav-open/);
    assert.match(source, /matchMedia\('\(max-width: 1199px\)'\)/);
    assert.match(source, /closeButton\?\.addEventListener/);
    assert.match(styles, /\.app-shell > \.page-tabs\s*\{[\s\S]*?position: fixed !important/);
    assert.match(styles, /\.app-shell\.mobile-nav-open > \.page-tabs\s*\{[\s\S]*?transform: translateX\(0\) !important/);
    assert.match(styles, /\.app-shell > \.page-tabs > \.page-tab > span[\s\S]*?opacity: 1 !important/);
    assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*?\.mobile-nav-toggle[\s\S]*?display: none !important/);
});

test('Mobile navigation prevents background scrolling and supports reduced motion', () => {
    const styles = read('public/css/components/ui-foundation.css');

    assert.match(styles, /body\.mobile-nav-open\s*\{[\s\S]*?overflow: hidden/);
    assert.match(styles, /\.mobile-nav-backdrop:not\(\[hidden\]\)\s*\{[\s\S]*?display: block/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.mobile-nav-close[\s\S]*?transition: none !important/);
});
