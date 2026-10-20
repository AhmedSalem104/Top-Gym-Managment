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
    const topbarStyles = read('public/css/components/mobile-topbar.css');
    assert.match(index, /id="mobileNavToggle"[^>]*aria-controls="pageTabs"/);
    assert.match(index, /id="mobileNavToggle"[^>]*>[\s\S]*?<svg class="ui-icon"[^>]*aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"\/><\/svg>[\s\S]*?<span class="visually-hidden" data-mobile-nav-label/u);
    assert.match(index, /class="topbar-language-toggle"[\s\S]*?<button[^>]*data-locale-choice="ar"[^>]*><svg[\s\S]*?<span class="visually-hidden">العربية<\/span><\/button>\s*<button[^>]*data-locale-choice="en"[^>]*><svg[\s\S]*?<span class="visually-hidden">English<\/span><\/button>/u);
    assert.match(index, /id="mobileNavClose"/);
    assert.match(index, /id="mobileNavBackdrop"[^>]*hidden/);
    assert.match(index, /id="mobileNavCurrent"/);
    assert.match(index, /id="sidebarPinToggle"[^>]*aria-label=/u);
    assert.match(index, /id="sidebarPinToggle"[^>]*>[\s\S]*?<svg[^>]*><rect x="3" y="4" width="18" height="16" rx="2"\/><path d="M9 4v16"\/><\/svg>\s*<\/button>/u);
    assert.match(index, /branch-context-kicker/);
    assert.match(index, /\/js\/page-tabs\.js\?v=[a-f0-9]{16}/);
    assert.match(source, /function initMobileNavigation\(\)/);
    assert.match(source, /matchMedia\('\(max-width: 1023px\)'\)/);
    assert.match(source, /rail\.inert = !open/u);
    assert.match(source, /function ensureNavigationSections\(\)/u);
    assert.match(source, /data-nav-group-label/u);
    assert.match(source, /function syncMobileNavigationContext\(name\)/u);
    assert.match(styles, /@media \(max-width: 1023px\)[\s\S]*?body \.app-shell > \.page-tabs\s*\{[\s\S]*?position: fixed[\s\S]*?transform: translateX\(110%\)/u);
    assert.match(styles, /\.app-shell\.mobile-nav-open > \.page-tabs[\s\S]*?transform: translateX\(0\)/u);
    assert.match(styles, /\.app-shell > \.page-tabs > \.sidebar-section-label[\s\S]*?display: block/u);
    assert.match(styles, /\.app-shell > \.page-tabs > \.page-tab,[\s\S]*?width: 100%[\s\S]*?min-width: 0/u);
    assert.match(styles, /\.app-shell > \.page-tabs::-webkit-scrollbar\s*\{[\s\S]*?width: 0[\s\S]*?height: 0/u);
    assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*?\.app-shell > \.page-tabs\s*\{[\s\S]*?grid-row: 2/u);
    assert.match(topbarStyles, /#mobileNavToggle\s*\{\s*display: inline-flex;/u,
        'the side-navigation control remains available in the compact navigation layout');
    assert.match(topbarStyles, /@media \(min-width: 1024px\)[\s\S]*?#mobileNavToggle\s*\{\s*display: none;/u,
        'the mobile-only side-navigation control is hidden at the desktop breakpoint');
    assert.match(topbarStyles, /@media \(max-width: 1023px\)[\s\S]*?\.application-launcher\s*\{\s*display: none;/u,
        'the compact navigation shows the drawer control instead of a duplicate app-grid control');
});

test('Desktop navbar settings use icon-only actions with localized accessible names', () => {
    const index = read('public/index.html');
    const i18n = read('public/js/core/i18n.js');
    const mobileTopbar = read('public/css/components/mobile-topbar.css');
    const themeToggle = read('public/css/components/theme-toggle.css');

    assert.match(index, /data-locale-choice="ar"[^>]*>[\s\S]*?<svg[\s\S]*?class="visually-hidden">العربية<\/span>/u);
    assert.match(index, /data-locale-choice="en"[^>]*>[\s\S]*?<svg[\s\S]*?class="visually-hidden">English<\/span>/u);
    assert.match(index, /id="themeToggleButton"[^>]*data-theme-toggle[\s\S]*?data-theme-toggle-icon/u);
    assert.match(index, /id="topAddMemberButton"[^>]*aria-label=[^>]*>[\s\S]*?<svg[\s\S]*?<span data-i18n="shell.addMember">/u);
    assert.match(i18n, /button\.setAttribute\('aria-label', localeLabel\)[\s\S]*?button\.setAttribute\('title', localeLabel\)/u);
    assert.match(i18n, /\['#topAddMemberButton > span', 'shell\.addMember'\]/u);
    assert.match(mobileTopbar, /@media \(min-width: 1024px\)[\s\S]*?\.topbar-settings-section \.topbar-settings-copy \{ display: none; \}/u);
    assert.match(mobileTopbar, /\.topbar-settings-logout-section \.topbar-settings-logout > span,\s*\.topbar-more-menu\[open\] > \.topbar-more-items > \.topbar-more-actions > \.btn > span \{ display: none; \}/u);
    assert.match(mobileTopbar, /@media \(max-width: 1023px\)[\s\S]*?\.topbar-language-toggle > button \.visually-hidden\s*\{\s*position: static/u);
    assert.match(themeToggle, /@media \(min-width: 1024px\)[\s\S]*?\.topbar-settings-switch::before,[\s\S]*?\.topbar-settings-switch::after \{ display: none; \}/u);
});

test('Mobile navigation drawer keeps focus contained and supports reduced motion', () => {
    const styles = read('public/css/components/navigation-shell.css');
    const source = read('public/js/page-tabs.js');
    assert.match(styles, /body\.mobile-nav-open\s*\{[\s\S]*?overflow: hidden/u);
    assert.match(source, /event\.key === 'Escape'/u);
    assert.match(source, /event\.key !== 'Tab'/u);
    assert.match(source, /lastFocusedElement\.focus\(\)/u);
    assert.match(styles, /transition: transform var\(--motion-duration-page\) var\(--motion-easing-enter\)/u);
    assert.match(styles, /env\(safe-area-inset-top\)/u);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-shell > \.page-tabs[\s\S]*?transition: none/u);
});

test('Desktop navigation rail fills the viewport with a legacy height fallback', () => {
    const styles = read('public/css/components/navigation-shell.css');

    assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*?body \.app-shell > \.page-tabs\s*\{[\s\S]*?grid-row: 2/u);
    assert.match(styles, /inset-block-start:\s*var\(--app-topbar-height\)/u);
    assert.match(styles, /height:\s*calc\(100dvh - var\(--app-topbar-height\)\)/u);
});
