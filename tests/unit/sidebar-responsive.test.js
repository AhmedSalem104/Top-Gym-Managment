'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Gym App exposes four compact mobile navigation tabs per row', () => {
    const index = read('public/index.html');
    const source = read('public/js/page-tabs.js');
    const styles = read('public/css/components/navigation-shell.css');
    const tabletStyles = styles.slice(
        styles.indexOf('@media (max-width: 1199px)'),
        styles.indexOf('@media (max-width: 767px)')
    );
    const mobileStyles = styles.slice(
        styles.indexOf('@media (max-width: 767px)'),
        styles.indexOf('@media (max-width: 379px)')
    );

    assert.match(index, /id="mobileNavToggle"[^>]*aria-controls="pageTabs"/);
    assert.match(index, /id="mobileNavClose"/);
    assert.match(index, /id="mobileNavBackdrop"[^>]*hidden/);
    assert.match(index, /\/js\/page-tabs\.js\?v=21/);
    assert.match(source, /function initMobileNavigation\(\)/);
    assert.match(source, /matchMedia\('\(max-width: 1199px\)'\)/);
    assert.match(source, /rail\.removeAttribute\('aria-hidden'\)/);
    assert.match(mobileStyles, /\.app-shell > \.page-tabs\s*\{[\s\S]*?display: grid[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/u);
    assert.match(mobileStyles, /\.app-shell > \.page-tabs\s*\{[\s\S]*?overflow: visible/u);
    assert.match(mobileStyles, /\.app-shell > \.page-tabs > \.page-tab,[\s\S]*?width: 100%[\s\S]*?min-width: 0/u);
    assert.doesNotMatch(mobileStyles, /overflow-x:\s*auto/u);
    assert.match(tabletStyles, /\.app-shell > \.page-tabs > \.page-tab,[\s\S]*?min-width: max-content/u);
    assert.match(styles, /\.app-shell > \.page-tabs::-webkit-scrollbar\s*\{[\s\S]*?width: 0[\s\S]*?height: 0/u);
    assert.match(tabletStyles, /\.app-shell > \.mobile-nav-backdrop:not\(\[hidden\]\)\s*\{[\s\S]*?display: none/u);
    assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*?\.mobile-nav-toggle[\s\S]*?display: none/u);
});

test('Mobile tab grid keeps the page scrollable and supports reduced motion', () => {
    const styles = read('public/css/components/navigation-shell.css');
    const mobileStyles = styles.slice(
        styles.indexOf('@media (max-width: 767px)'),
        styles.indexOf('@media (max-width: 379px)')
    );

    assert.doesNotMatch(styles, /body\.mobile-nav-open\s*\{[\s\S]*?overflow: hidden/u);
    assert.match(mobileStyles, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/u);
    assert.match(mobileStyles, /overflow-x: visible/u);
    assert.match(mobileStyles, /overflow-y: visible/u);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-shell > \.page-tabs[\s\S]*?transition: none/u);
});
