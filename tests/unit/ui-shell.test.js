const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

test('complete UI QA requires explicit static-server mode and labels its evidence', () => {
    const source = fs.readFileSync(path.join(root, 'scripts/qa-complete-ui.js'), 'utf8');
    const inventory = fs.readFileSync(path.join(root, 'scripts/discover-screens.js'), 'utf8');

    assert.match(source, /QA_ALLOW_STATIC_SERVER === '1'/u);
    assert.match(source, /4174\|4173[\s\S]*?&& !allowStaticQaServer/u);
    assert.match(source, /executionMode:\s*allowStaticQaServer \? 'static-assets-with-browser-api-fixtures'/u);
    assert.match(source, /Express\/server behavior is not under test/u);
    assert.match(source, /QA_REPORTS_DIR \|\| path\.join\(root, 'qa', 'reports'\)/u);
    assert.match(source, /QA_ARTIFACTS_DIR \|\| path\.join\(root, 'qa', 'artifacts'\)/u);
    assert.match(inventory, /process\.env\.QA_REPORTS_DIR \|\| path\.join\(root, 'qa', 'reports'\)/u);
});

test('complete UI QA dialog registry matches every static native dialog exactly once', () => {
    const qaSource = fs.readFileSync(path.join(root, 'scripts/qa-complete-ui.js'), 'utf8');
    const registry = qaSource.match(/const dialogIds = \[([^\]]+)\];/u)?.[1] || '';
    const qaDialogIds = [...registry.matchAll(/'([^']+)'/gu)].map((match) => match[1]);
    const htmlFiles = [];
    const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(entryPath);
            else if (entry.isFile() && entry.name.endsWith('.html')) htmlFiles.push(entryPath);
        }
    };
    visit(path.join(root, 'public'));
    const sourceDialogIds = [...new Set(htmlFiles.flatMap((file) => {
        const source = fs.readFileSync(file, 'utf8');
        return [...source.matchAll(/<dialog\b[^>]*\bid=["']([^"']+)["']/giu)].map((match) => match[1]);
    }))].sort();

    assert.equal(new Set(qaDialogIds).size, qaDialogIds.length, 'QA dialog registry contains duplicate IDs');
    assert.deepEqual([...qaDialogIds].sort(), sourceDialogIds);
});

test('navigation pending state keeps the first authenticated shell crisp and interactive', () => {
    const source = fs.readFileSync(path.join(root, 'public/css/layout.css'), 'utf8');
    const pendingBlock = source.match(/\.top-gym-navigation-pending[\s\S]*?transition: none;/u)?.[0] || '';

    assert.match(pendingBlock, /opacity:\s*1/u);
    assert.match(pendingBlock, /transition:\s*none/u);
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

test('sidebar width tokens provide a wider desktop rail and expanded navigation', () => {
    const tokens = fs.readFileSync(path.join(root, 'public/css/tokens.css'), 'utf8');

    assert.match(tokens, /--sidebar-width-collapsed:\s*72px/u);
    assert.match(tokens, /--sidebar-width-expanded:\s*256px/u);
    assert.match(tokens, /--app-sidebar-width-compact:\s*224px/u);
    assert.match(tokens, /--app-sidebar-width-wide:\s*256px/u);
});

test('navigation polish keeps desktop controls usable and coordinated', () => {
    const source = fs.readFileSync(path.join(root, 'public/css/components/navigation-shell.css'), 'utf8');
    const markup = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const authUi = fs.readFileSync(path.join(root, 'public/js/auth-ui.js'), 'utf8');

    assert.match(source, /grid-template-columns:\s*var\(--sidebar-width-collapsed\)\s+minmax\(0,\s*1fr\)[\s\S]*?transition:\s*grid-template-columns\s+var\(--sidebar-rail-transition\)/u);
    assert.match(source, /\.app-shell:not\(:has\(> \.workspace-contextbar:not\(\[hidden\]\)\)\)\s*>\s*\.page-tabs[\s\S]*?top:\s*0[\s\S]*?grid-row:\s*1\s*\/\s*-1/u);
    assert.match(source, /page-tabs\s*>\s*\.page-tab \.ui-icon[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px/u);
    assert.match(source, /topbar-controls[\s\S]*?gap:\s*var\(--space-2\)/u);
    assert.match(source, /auth-logout-button[\s\S]*?background:\s*var\(--danger-soft\)/u);
    assert.match(source, /auth-logout-button[\s\S]*?color:\s*var\(--danger-text\)/u);
    assert.match(source, /auth-logout-button \.ui-icon[\s\S]*?stroke-width:\s*2\.2px/u);
    assert.match(source, /page-tabs::-webkit-scrollbar[\s\S]*?width:\s*5px/u);
    assert.match(source, /sidebar-floating-tooltip[\s\S]*?pointer-events:\s*none/u);
    assert.match(source, /#authAccountBar \.auth-logout-button \{[\s\S]*?background:\s*var\(--danger-soft\)[\s\S]*?color:\s*var\(--danger-text\)/u);
    assert.match(source, /#authAccountBar \.auth-logout-button:hover[\s\S]*?background:\s*var\(--danger-border\)[\s\S]*?color:\s*var\(--danger-text\)/u);
    assert.match(markup, /class="btn btn-danger btn-small auth-logout-button"/u);
    assert.match(authUi, /button\.className\s*=\s*'btn btn-danger btn-small auth-logout-button'/u);
    const buttons = fs.readFileSync(path.join(root, 'public/css/components/buttons.css'), 'utf8');
    assert.match(buttons, /body button\.btn\.btn-danger[\s\S]*?color:\s*var\(--danger-text\)/u);
});

test('assistant launcher is docked outside the sidebar while logout stays in the navigation rail', () => {
    const markup = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const navigation = fs.readFileSync(path.join(root, 'public/css/components/navigation-shell.css'), 'utf8');
    const navigationScript = fs.readFileSync(path.join(root, 'public/js/page-tabs.js'), 'utf8');
    const rail = markup.match(/<nav class="page-tabs topgym-nav"[\s\S]*?<\/nav>/u)?.[0] || '';
    const dock = markup.match(/<div class="assistant-launcher-dock">([\s\S]*?)<\/div>/u)?.[0] || '';

    assert.doesNotMatch(rail, /id="smartAssistantLauncher"/u);
    assert.match(dock, /id="smartAssistantLauncher"/u);
    assert.match(dock, /aria-label="فتح المساعد الذكي"/u);
    assert.doesNotMatch(dock, /smart-assistant-launcher-label/u);
    assert.match(rail, /id="authLogoutButton"/u);
    assert.match(navigation, /\.app-shell\s*>\s*\.assistant-launcher-dock[\s\S]*?inset-inline-start:\s*var\(--space-4\)[\s\S]*?inset-block-end:/u);
    assert.match(navigation, /html\[dir="rtl"\]\s*\.app-shell\s*>\s*\.assistant-launcher-dock\s*\{\s*inset-inline:\s*auto\s*var\(--space-4\)/u);
    assert.match(navigation, /\.assistant-launcher-dock\s*>\s*\.smart-assistant-launcher\s*\{[\s\S]*?width:\s*48px[\s\S]*?height:\s*48px/u);
    assert.match(navigation, /\.app-shell\.mobile-nav-open\s*>\s*\.assistant-launcher-dock\s*\{\s*visibility:\s*hidden/u);
    assert.doesNotMatch(navigationScript, /rail\.querySelectorAll\('\.page-tab, \.smart-assistant-launcher'\)/u);
});

test('Gym App shell styles have one canonical source', () => {
    const canonical = fs.readFileSync(path.join(root, 'public/css/components/navigation-shell.css'), 'utf8');
    const secondarySources = [
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
