'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Gym App exposes a visible mobile navigation tab rail contract', () => {
    const index = read('public/index.html');
    const source = read('public/js/page-tabs.js');
    const styles = read('public/css/components/navigation-shell.css');
    const mobileStyles = styles.slice(
        styles.indexOf('@media (max-width: 1199px)'),
        styles.indexOf('@media (max-width: 767px)')
    );

    assert.match(index, /id="mobileNavToggle"[^>]*aria-controls="pageTabs"/);
    assert.match(index, /id="mobileNavClose"/);
    assert.match(index, /id="mobileNavBackdrop"[^>]*hidden/);
    assert.match(index, /\/js\/page-tabs\.js\?v=20/);
    assert.match(source, /function initMobileNavigation\(\)/);
    assert.match(source, /matchMedia\('\(max-width: 1199px\)'\)/);
    assert.match(source, /rail\.removeAttribute\('aria-hidden'\)/);
    assert.match(mobileStyles, /\.app-shell > \.page-tabs\s*\{[\s\S]*?align-items: stretch/u);
    assert.match(mobileStyles, /\.app-shell > \.page-tabs > \.page-tab,[\s\S]*?min-width: max-content/u);
    assert.match(styles, /\.app-shell > \.page-tabs\s*\{[\s\S]*?overflow-x: auto/u);
    assert.match(styles, /\.app-shell > \.page-tabs::-webkit-scrollbar\s*\{[\s\S]*?width: 0[\s\S]*?height: 0/u);
    assert.match(mobileStyles, /\.app-shell > \.mobile-nav-backdrop:not\(\[hidden\]\)\s*\{[\s\S]*?display: none/u);
    assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*?\.mobile-nav-toggle[\s\S]*?display: none/u);
});

test('Mobile tab rail keeps the page scrollable and supports reduced motion', () => {
    const styles = read('public/css/components/navigation-shell.css');

    assert.doesNotMatch(styles, /body\.mobile-nav-open\s*\{[\s\S]*?overflow: hidden/u);
    assert.match(styles, /overflow-x: auto/);
    assert.match(styles, /overflow-y: hidden/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-shell > \.page-tabs[\s\S]*?transition: none/u);
});
