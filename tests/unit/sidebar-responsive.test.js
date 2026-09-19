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
    const styles = read('public/css/components/navigation-shell.css');
    const mobileStyles = styles.slice(styles.lastIndexOf('@media (max-width: 767px)'));

    assert.match(index, /id="mobileNavToggle"[^>]*aria-controls="pageTabs"/);
    assert.match(index, /id="mobileNavClose"/);
    assert.match(index, /id="mobileNavBackdrop"[^>]*hidden/);
    assert.match(index, /id="mobileNavCurrent"/);
    assert.match(index, /branch-context-kicker/);
    assert.match(index, /\/js\/page-tabs\.js\?v=24/);
    assert.match(source, /function initMobileNavigation\(\)/);
    assert.match(source, /matchMedia\('\(max-width: 767px\)'\)/);
    assert.match(source, /rail\.inert = !open/u);
    assert.match(source, /function ensureNavigationSections\(\)/u);
    assert.match(source, /data-nav-group-label/u);
    assert.match(source, /function syncMobileNavigationContext\(name\)/u);
    assert.match(mobileStyles, /\.app-shell > \.page-tabs\s*\{[\s\S]*?position: fixed[\s\S]*?transform: translateX\(110%\)/u);
    assert.match(mobileStyles, /\.app-shell\.mobile-nav-open > \.page-tabs[\s\S]*?transform: translateX\(0\)/u);
    assert.match(mobileStyles, /\.app-shell > \.page-tabs > \.sidebar-section-label[\s\S]*?display: block/u);
    assert.match(mobileStyles, /\.app-shell > \.page-tabs > \.page-tab,[\s\S]*?width: 100%[\s\S]*?min-width: 0/u);
    assert.match(styles, /\.app-shell > \.page-tabs::-webkit-scrollbar\s*\{[\s\S]*?width: 0[\s\S]*?height: 0/u);
    assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*?\.mobile-nav-toggle[\s\S]*?display: none/u);
});

test('Mobile navigation drawer keeps focus contained and supports reduced motion', () => {
    const styles = read('public/css/components/navigation-shell.css');
    const source = read('public/js/page-tabs.js');
    const mobileStyles = styles.slice(styles.lastIndexOf('@media (max-width: 767px)'));

    assert.doesNotMatch(styles, /body\.mobile-nav-open\s*\{[\s\S]*?overflow: hidden/u);
    assert.match(source, /event\.key === 'Escape'/u);
    assert.match(source, /event\.key !== 'Tab'/u);
    assert.match(source, /lastFocusedElement\.focus\(\)/u);
    assert.match(mobileStyles, /transition: transform 260ms cubic-bezier/u);
    assert.match(mobileStyles, /env\(safe-area-inset-top\)/u);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-shell > \.page-tabs[\s\S]*?transition: none/u);
});

test('Desktop navigation rail fills the viewport with a legacy height fallback', () => {
    const styles = read('public/css/components/navigation-shell.css');

    assert.match(styles, /@media \(min-width: 1200px\)[\s\S]*?grid-row:\s*1\s*\/\s*-1/u);
    assert.match(styles, /height:\s*100vh[\s\S]*?min-height:\s*100vh[\s\S]*?height:\s*100dvh[\s\S]*?min-height:\s*100dvh/u);
    assert.match(styles, /align-self:\s*stretch/u);
});
