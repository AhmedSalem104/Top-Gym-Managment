const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { hasClassSelector, hasRootClassSelector, rulesContainingClass, rulesWithRootClass } = require('../helpers/css-selector-ownership');

const root = path.resolve(__dirname, '..', '..');
const retiredVisualPath = 'public/css/components/visual-redesign.css';
const retiredUiFoundationPath = 'public/css/components/ui-foundation.css';
const read = relative => {
    const absolutePath = path.join(root, relative);
    if ([retiredVisualPath, retiredUiFoundationPath].includes(relative) && !fs.existsSync(absolutePath)) return '';
    return fs.readFileSync(absolutePath, 'utf8');
};

test('retired global visual layer has no source file or entrypoint imports', () => {
    assert.equal(fs.existsSync(path.join(root, retiredVisualPath)), false);
    for (const entrypoint of ['public/css/main.source.css', 'public/css/app-shell.source.css']) {
        assert.doesNotMatch(read(entrypoint), /visual-redesign\.css/u, `${entrypoint} must not import the retired layer`);
    }
});

test('retired UI foundation has no source file or active entrypoint imports', () => {
    assert.equal(fs.existsSync(path.join(root, retiredUiFoundationPath)), false);
    for (const entrypoint of ['public/css/main.source.css', 'public/css/app-shell.source.css']) {
        assert.doesNotMatch(read(entrypoint), /ui-foundation\.css/u, `${entrypoint} must not import the retired foundation`);
    }
    assert.doesNotMatch(read('scripts/build-login-entry.js'), /ui-foundation\.css/u,
        'the isolated login bundle must not include the retired foundation');
    for (const bundle of ['public/css/main.css', 'public/css/app-shell.css', 'public/css/login-entry.css']) {
        assert.doesNotMatch(read(bundle), /(?:components\/|components\\)ui-foundation\.css/u,
            `${bundle} must be generated without the retired foundation`);
    }
});

test('retired global primitives retain canonical token and accessibility owners', () => {
    const utilities = read('public/css/utilities.css');
    const layout = read('public/css/layout.css');
    const tokens = read('public/css/tokens.css');
    const responsive = read('public/css/responsive.css');

    assert.match(utilities, /body\.gym-page-bg::selection\s*\{[^}]*var\(--color-primary\)[^}]*var\(--text-on-primary\)/u);
    assert.match(layout, /body \.page > \.workspace,[\s\S]*?gap:\s*var\(--space-page-stack\)/u);
    assert.match(tokens, /--space-page-stack:\s*22px/u);
    assert.match(responsive, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
});

test('hidden state and card footer borders have one canonical CSS owner', () => {
    const reset = read('public/css/reset.css');
    const utilities = read('public/css/utilities.css');
    const cards = read('public/css/components/cards.css');
    const footerRules = rulesWithRootClass(cards, 'panel-footer').filter(rule =>
        /border-top:\s*1px solid var\(--border-color\)/u.test(rule.declarations));

    assert.match(reset, /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/u);
    assert.doesNotMatch(utilities, /\[hidden\]/u);
    assert.match(utilities, /\.hidden\s*\{\s*display:\s*none\s*!important;\s*\}/u);
    assert.equal(footerRules.length, 1, 'Cards owns one panel/card footer border rule');
});

test('shared empty, loading, and error surfaces have canonical component owners', () => {
    const empty = read('public/css/components/empty-states.css');
    const loading = read('public/css/components/loading.css');
    const alerts = read('public/css/components/alerts.css');

    assert.match(empty, /body \.empty-state[\s\S]*?--border-primary[\s\S]*?--bg-card-hover[\s\S]*?--text-muted/u);
    assert.match(loading, /body \.loading\s*\{[^}]*min-height:\s*120px[^}]*color:\s*var\(--text-muted\)/u);
    assert.match(alerts, /body \.error-state[\s\S]*?--danger-border[\s\S]*?--danger-soft/u);
});

test('retired RF visual aliases have no consumers or token definitions in canonical CSS sources', () => {
    const cssRoot = path.join(root, 'public/css');
    const sourcePaths = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) return sourcePaths(absolutePath);
        return entry.isFile() && entry.name.endsWith('.css') ? [absolutePath] : [];
    });
    for (const absolutePath of sourcePaths(cssRoot)) {
        const relativePath = path.relative(root, absolutePath);
        assert.doesNotMatch(read(relativePath), /--rf-/u, `${relativePath} must use canonical semantic tokens`);
    }
});

test('global foundations and visual polish do not own shared status surfaces', () => {
    const sources = [
        retiredUiFoundationPath,
        'public/css/components/visual-redesign.css'
    ].map(read).join('\n');

    assert.doesNotMatch(sources, /body\s+\.(?:empty-state|empty|no-data|not-found-state|saas-empty|loading|error-state|page-error|registration-error|portal-error)(?![-\w])/u);
    assert.doesNotMatch(sources, /:where\(\s*\.(?:empty-state|empty|no-data|not-found-state|loading|error-state)(?![-\w])/u);
});

test('page and section heading presentation has canonical typography, layout, and responsive owners', () => {
    const visual = read('public/css/components/visual-redesign.css');
    const typography = read('public/css/typography.css');
    const layout = read('public/css/layout.css');
    const responsive = read('public/css/responsive.css');
    const dashboard = read('public/css/pages/dashboard.css');
    const theme = read('public/css/theme.css');

    assert.match(typography, /body \.page-header h2,[\s\S]*?font-size:\s*var\(--font-size-page-title\)[\s\S]*?font-weight:\s*var\(--weight-semibold\)/u);
    assert.match(typography, /body \.page-header p,[\s\S]*?color:\s*var\(--color-text-muted\)[\s\S]*?line-height:\s*1\.6/u);
    assert.match(layout, /\.section-heading\s*\{[^}]*min-height:\s*44px[^}]*var\(--space-4\)[^}]*var\(--border-secondary\)[^}]*var\(--space-3\)/u);
    assert.match(responsive, /\.section-heading\s*\{[^}]*align-items:\s*flex-start[^}]*flex-direction:\s*column[^}]*gap:\s*var\(--space-3\)/u);
    assert.doesNotMatch(visual, /body \.page-header h2|body \.section-heading|body \.members-panel h3/u);
    assert.match(dashboard, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.dashboard-overview-cards\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/u);
    assert.doesNotMatch(theme, /\.dashboard-section-heading/u, 'dashboard-specific responsive styling belongs to the dashboard page owner');
});

test('shared mobile content grids collapse in the responsive owner, not visual polish', () => {
    const responsive = read('public/css/responsive.css');
    const visual = read('public/css/components/visual-redesign.css');

    assert.match(responsive, /@media\s*\(max-width:\s*767px\)[\s\S]*?body \.form-grid,[\s\S]*?body \.field-grid,[\s\S]*?body \.two-column-grid,[\s\S]*?grid-template-columns:\s*1fr/u);
    assert.doesNotMatch(visual, /body \.form-grid|body \.field-grid|body \.two-column-grid|body \.page-header \.actions-row/u);
});

test('auth helper text has one shared form owner', () => {
    const forms = read('public/css/components/forms.css');
    const visual = read('public/css/components/visual-redesign.css');
    const memberships = read('public/css/pages/memberships.css');

    assert.match(forms, /\.form-help,[\s\S]*?\.auth-helper\s*\{[^}]*var\(--color-text-muted\)[^}]*var\(--font-2xs\)[^}]*line-height:\s*1\.65/u);
    assert.doesNotMatch(visual, /\.auth-helper/u);
    assert.doesNotMatch(memberships, /\.auth-helper/u);
});

test('Store card heading presentation is owned by the Store feature', () => {
    const store = read('public/css/pages/store.css');
    const visual = read('public/css/components/visual-redesign.css');

    assert.match(store, /body \.store-card-header\s*\{[^}]*--control-height-large[^}]*--border-secondary[^}]*--space-3/u);
    assert.match(store, /@media\s*\(max-width:\s*700px\)[\s\S]*?body \.store-card-header \.header-actions \.btn\s*\{[^}]*flex:\s*1\s+1\s+auto/u);
    assert.doesNotMatch(visual, /\.store-card-header/u);
});

test('SaaS panel heading presentation is owned by the SaaS page stylesheet', () => {
    const saas = read('public/css/pages/saas.css');
    const visual = read('public/css/components/visual-redesign.css');

    assert.match(saas, /body \.saas-panel-head\s*\{[^}]*min-height:\s*44px[^}]*--border-secondary/u);
    assert.match(saas, /@media\s*\(max-width:\s*767px\)[\s\S]*?body \.saas-panel-head\s*\{[^}]*flex-direction:\s*column/u);
    assert.doesNotMatch(visual, /\.saas-panel-head/u);
});

test('Dashboard overview cards are owned by the dashboard page and use live data hooks', () => {
    const dashboard = read('public/css/pages/dashboard.css');
    const visual = read('public/css/components/visual-redesign.css');
    const html = read('public/index.html');
    const app = read('public/js/app.js');

    assert.doesNotMatch(visual, /\.dashboard-hero(?:[\s:#.[,]|$)|dashboard-hero-enter/u);
    assert.doesNotMatch(dashboard, /dashboard-hero|logic-fit-login-gym\.webp/u);
    assert.match(dashboard, /\.dashboard-overview-shell\s*\{[^}]*padding:\s*0[^}]*border:\s*0[^}]*background:\s*transparent/u);
    assert.match(dashboard, /\.dashboard-overview-cards\s*\{[^}]*display:\s*grid/u);
    assert.match(dashboard, /\.dashboard-overview-card\s*\{[^}]*var\(--radius-overview-card\)/u);
    assert.match(dashboard, /@media\s*\(min-width:\s*1280px\)[\s\S]*?\.dashboard-overview-cards\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/u);
    assert.match(dashboard, /@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1023px\)[\s\S]*?\.dashboard-overview-cards\s*\{[^}]*grid-template-columns:\s*repeat\(8,\s*minmax\(0,\s*1fr\)\)/u);
    assert.match(html, /id="dashboardPrintPricingButton"[\s\S]*?id="dashboardPrintPricingPreviewButton"/u);
    assert.match(html, /class="dashboard-overview-cards"[\s\S]*?data-dashboard-member-count[\s\S]*?data-dashboard-overview-plan[\s\S]*?data-dashboard-overview-date/u);
    assert.match(html, /class="dashboard-overview-shell"[\s\S]*?id="dashboardOverviewTitle"[\s\S]*?class="dashboard-overview-cards"/u);
    assert.match(html, /class="dashboard-overview-shell"[^>]*\shidden(?:\s|>)/u);
    const tabs = read('public/js/page-tabs.js');
    assert.match(tabs, /setHidden\(dashboardOverviewShell, !isDashboard\)/u);
    assert.match(app, /const rawMemberCount\s*=\s*state\.dashboard\?\.stats\?\.total/u);
    assert.match(app, /syncDashboardOverviewCards\(\)/u);
    assert.match(app, /function dashboardSubscriptionValue\(\)[\s\S]*?const candidates = \[[\s\S]*?billing\.subscription[\s\S]*?return candidates\.find/u);
    assert.doesNotMatch(app, /parseInt\([^)]*dashboard-overview|Number\([^)]*textContent/u);
});

test('Gym Dashboard local views use canonical tabs and stay separate from global page routes', () => {
    const tabsCss = read('public/css/components/tabs.css');
    const dashboardCss = read('public/css/pages/dashboard.css');
    const theme = read('public/css/theme.css');
    const visual = read('public/css/components/visual-redesign.css');
    const html = read('public/index.html');
    const pageTabs = read('public/js/page-tabs.js');

    assert.match(tabsCss, /\.tabs--surface\s*\{[^}]*var\(--color-border-soft\)[^}]*var\(--color-surface-muted\)/u);
    assert.match(tabsCss, /\.tabs--surface[^{}]*\[role="tab"\]\[aria-selected="true"\]/u);
    assert.match(dashboardCss, /\.dashboard-view-tabs\s*\{/u);
    assert.match(html, /id="dashboardViewTabs"[\s\S]*?id="dashboardOverviewTab"[\s\S]*?id="dashboardAnalyticsTab"/u);
    assert.match(html, /id="dashboardOverviewPanel"[\s\S]*?class="dashboard-overview-shell"[\s\S]*?class="overview-grid"[\s\S]*?id="alertsSection"[\s\S]*?id="dashboardDayPassCard"/u);
    assert.match(html, /id="dashboardAnalyticsTab"[^>]*data-owner-only/u);
    assert.match(pageTabs, /setHidden\(dashboardViewTabs, !isDashboard\)/u);
    assert.match(pageTabs, /initDashboardViewTabs\(\)/u);
    assert.doesNotMatch(theme, /\.dashboard-view-tabs|\.tabs--surface/u);
    assert.doesNotMatch(visual, /\.dashboard-view-tabs|\.tabs--surface/u);
});

test('Branch Management presentation is feature-owned, not part of the visual polish layer', () => {
    const branches = read('public/css/pages/branches.css');
    const branchContext = read('public/css/components/branch-context.css');
    const visual = read('public/css/components/visual-redesign.css');
    const main = read('public/css/main.source.css');
    const appShell = read('public/css/app-shell.source.css');

    for (const selectorClass of [
        'branches-page', 'branches-page-header', 'branches-page-heading', 'branches-page-actions',
        'branches-page-summary', 'branches-create-trigger', 'branches-list-card',
        'branches-card-header', 'branches-card-kicker', 'branches-list', 'branch-list-item',
        'branch-list-marker', 'branch-list-copy', 'branch-list-actions', 'branches-form',
        'branch-create-fields', 'branch-create-options', 'branches-check-field', 'branches-form-status',
        'branch-commerce-chips', 'branch-commerce-chip', 'branch-status'
    ]) {
        assert.equal(hasClassSelector(branches, selectorClass), true, `${selectorClass} must be owned by pages/branches.css`);
        assert.equal(hasClassSelector(branchContext, selectorClass), false, `${selectorClass} must not be owned by branch-context.css`);
        assert.equal(hasClassSelector(visual, selectorClass), false, `${selectorClass} must not be owned by visual-redesign.css`);
    }

    assert.match(main, /@import url\("\.\/pages\/branches\.css"\);/u);
    assert.match(appShell, /@import url\("\.\/pages\/branches\.css"\);/u);
});

test('branch/section dropdown styling and Navbar shell composition have canonical owners', () => {
    const context = read('public/css/components/branch-context.css');
    const navigation = read('public/css/components/navigation-shell.css');
    const visual = read('public/css/components/visual-redesign.css');
    const main = read('public/css/main.source.css');
    const appShell = read('public/css/app-shell.source.css');
    const componentClasses = [
        'branch-context-kicker', 'branch-context-kicker-icon', 'branch-context-divider',
        'branch-context-field', 'branch-context-field-icon', 'branch-context-field-copy',
        'branch-context-status', 'branch-context-status-dot', 'branch-context-trigger',
        'branch-context-trigger-chevron', 'branch-context-menu', 'branch-context-option'
    ];

    for (const selectorClass of componentClasses) {
        assert.ok(rulesContainingClass(context, selectorClass).length > 0,
            `${selectorClass} must be owned by components/branch-context.css`);
        assert.equal(rulesContainingClass(visual, selectorClass).length, 0,
            `${selectorClass} must not remain in components/visual-redesign.css`);
    }

    assert.equal((context.match(/body \.app-shell > \.topbar:has\(\.branch-context-field\.is-open\)/gu) || []).length, 1,
        'the open branch-context topbar stacking rule must have one canonical declaration');
    assert.match(context,
        /body \.topbar-controls > \.branch-context-shell \.branch-context-field:hover,\s*body \.topbar-controls > \.branch-context-shell \.branch-context-field:focus-within,\s*body \.topbar-controls > \.branch-context-shell \.branch-context-field\.is-open\s*\{[^}]*min-width: 0;[^}]*transform: none;/u,
        'the compact Navbar branch/section states share one non-important sizing rule');

    for (const source of [main, appShell]) {
        const navigationIndex = source.indexOf('@import url("./components/navigation-shell.css");');
        const contextIndex = source.indexOf('@import url("./components/branch-context.css");');
        assert.ok(navigationIndex >= 0 && contextIndex > navigationIndex,
            'branch context must load after the shell layout owner');
        assert.doesNotMatch(source, /visual-redesign\.css/u, 'retired global visual CSS must not be imported');
    }

    assert.ok(rulesContainingClass(navigation, 'branch-context-shell').length > 0,
        'Navbar shell placement/composition must be owned by navigation-shell.css');
    for (const shellClass of ['topbar-inner', 'topbar-controls', 'topbar-quick-actions', 'branch-context-shell']) {
        assert.equal(rulesContainingClass(visual, shellClass).length, 0,
            `${shellClass} composition must not remain in visual-redesign.css`);
    }
});

test('application page navigation states are owned by navigation-shell, not visual-redesign', () => {
    const navigation = read('public/css/components/navigation-shell.css');
    const visual = read('public/css/components/visual-redesign.css');

    for (const selector of [
        'body .app-shell > .page-tabs',
        'body .app-shell > .page-tabs::before',
        'body .app-shell > .page-tabs > .page-tab',
        'body .app-shell > .page-tabs > .smart-assistant-launcher',
        'body .app-shell > .page-tabs > .page-tab:hover',
        'body .app-shell > .page-tabs > .page-tab.active'
    ]) {
        assert.ok(navigation.includes(selector), `${selector} must be owned by navigation-shell.css`);
        assert.equal(visual.includes(selector), false, `${selector} must not remain in visual-redesign.css`);
    }

    assert.match(navigation, /\.page-tab\.active,[\s\S]*?background:\s*var\(--primary-soft\)[\s\S]*?box-shadow:\s*inset 3px 0 0 var\(--primary-hover\)/u);
});

test('superseded branch-context positioning layer is removed while desktop and mobile owners remain', () => {
    const visual = read('public/css/components/visual-redesign.css');
    const navigation = read('public/css/components/navigation-shell.css');
    const mobile = read('public/css/components/mobile-topbar.css');
    const html = read('public/index.html');

    assert.doesNotMatch(visual, /width:\s*min\(430px,\s*calc\(100%\s*-\s*500px\)\)/u);
    assert.doesNotMatch(visual, /box-shadow:\s*0 12px 28px rgb\(2 6 23 \/ \.18\)/u);
    assert.match(navigation, /body \.topbar-controls > \.branch-context-shell\s*\{[^}]*position:\s*static/u,
        'branch context selectors stay in document flow so they cannot cover adjacent shell actions');
    assert.doesNotMatch(navigation, /body \.topbar-controls > \.branch-context-shell\s*\{[^}]*position:\s*absolute/u,
        'desktop and tablet context must not overlay the action row');
    assert.match(mobile, /\.topbar-controls\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/u,
        'mobile controls allocate one compact row to navigation, context and utility actions');
    assert.match(mobile, /#branchContextShell\s*\{[^}]*position:\s*relative[^}]*display:\s*block[^}]*width:\s*100%/u,
        'the mobile context selector is a single full-width grid item within the middle track');
    assert.match(html, /id="branchContextMobileTrigger"/u,
        'the mobile context item exposes one trigger for branch and section selection');
    assert.match(navigation, /\.app-shell > \.topbar \.topbar-inner/u,
        'the application shell remains the owner for topbar structure');
});

test('member add/edit dialog uses canonical modal and form owners without unreachable fallback CSS', () => {
    const members = read('public/css/pages/members.css');
    const visual = read('public/css/components/visual-redesign.css');
    const modal = read('public/css/components/modal-foundation.css');
    const manifest = read('public/js/core/feature-manifest.js');
    const html = read('public/index.html');

    assert.doesNotMatch(members, /#memberDialog:not\(\.lf-modal-shell\)/u);
    assert.doesNotMatch(visual, /#memberDialog:not\(\.lf-modal-shell\)/u);
    assert.match(manifest, /\/css\/pages\/members\.css/u,
        'the authenticated members route loads the page stylesheet after the app shell');
    assert.match(html, /id="memberDialog" class="member-dialog lf-modal-shell/u,
        'the current dialog keeps its canonical modal class');
    assert.match(modal, /dialog\.lf-modal-shell,[\s\S]*?\.lf-modal-shell\.lf-modal--lg/u,
        'the live member dialog is owned by the shared modal foundation');
    assert.match(modal, /\.lf-modal-shell \.member-dialog-header/u,
        'the actual member dialog header uses the shared modal composition');
});

test('member details and floating more-menu presentation are owned by the members page stylesheet', () => {
    const members = read('public/css/pages/members.css');
    const visual = read('public/css/components/visual-redesign.css');

    for (const selector of [
        'body #detailsDialog .member-profile-name-row h3',
        'body #detailsDialog > .dialog-body',
        'body #detailsDialog .member-details-overview',
        'body #detailsDialog .member-detail-stat',
        'body #detailsDialog .member-details-action-grid',
        'body #detailsDialog .member-details-action',
        'body #detailsDialog .member-details-more-menu.is-floating',
        'body .member-details-more-menu.is-floating',
        'body .member-details-more-menu.is-floating button'
    ]) {
        assert.ok(members.includes(selector), `${selector} must remain owned by pages/members.css`);
        assert.equal(visual.includes(selector), false, `${selector} must not remain in visual-redesign.css`);
    }

    assert.match(members, /@media\s*\(max-width:\s*767px\)[\s\S]*?body #detailsDialog > \.dialog-body[\s\S]*?body #detailsDialog \.member-details-action-grid/u,
        'member-details mobile composition must remain in the members page owner');
    assert.match(members, /@media\s*\(max-width:\s*380px\)[\s\S]*?body #detailsDialog \.member-details-action/u,
        'the narrow mobile member-details rule must remain in the members page owner');
});

test('member action dialog presentation is owned by the members page stylesheet', () => {
    const members = read('public/css/pages/members.css');
    const visual = read('public/css/components/visual-redesign.css');

    for (const selector of [
        '#actionDialog {',
        '#actionDialog #dialogTitle {',
        '#actionDialog #dialogDescription {',
        '#dialogFields {'
    ]) {
        assert.ok(members.includes(selector), `${selector} must be owned by pages/members.css`);
        assert.equal(visual.includes(selector), false, `${selector} must not remain in visual-redesign.css`);
    }

    const modalFoundation = read('public/css/components/modal-foundation.css');
    const html = read('public/index.html');
    assert.match(modalFoundation, /#actionDialog\s*\{[^}]*max-height:\s*calc\(100dvh\s*-\s*32px\)[^}]*height:\s*fit-content/u,
        'the shared modal owner must size the action dialog to content');
    assert.match(modalFoundation, /\.lf-modal-shell\.lf-modal--structured > \.lf-modal-layout > :is\(\.dialog-body, \.dialog-scroll-content\)\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/u,
        'only the action dialog body may scroll');
    assert.match(modalFoundation, /#actionDialog > \.lf-modal-layout > \.dialog-actions\s*\{[^}]*border-block-start/u,
        'the action footer separator must remain inside the dialog');
    assert.match(html, /<form class="lf-modal-layout" id="actionForm">[\s\S]*?<header class="dialog-header">[\s\S]*?<div class="dialog-body" id="actionDialogBody">[\s\S]*?<footer class="dialog-actions">/u,
        'the form contract must use explicit header/body/footer regions');
    assert.doesNotMatch(members, /body #actionDialog > form\.dialog-body\s*\{[^}]*position:\s*sticky/u);
    assert.doesNotMatch(visual, /#actionDialog|#dialogTitle|#dialogDescription|#dialogFields/u,
        'visual-redesign.css must not own member action dialog presentation');
    assert.doesNotMatch(visual, /body \.coaching-builder-dialog > form\.dialog-body/u,
        'coaching-builder-dialog layout must not remain in the global visual layer');
    assert.doesNotMatch(members, /\.coaching-builder-dialog/u,
        'coaching builder dialog remains outside the members page owner');
});

test('coaching builder dialog scroll and action presentation is owned by the coaching page stylesheet', () => {
    const coaching = read('public/css/pages/coaching.css');
    const visual = read('public/css/components/visual-redesign.css');

    assert.match(coaching, /body \.coaching-builder-dialog > form\.dialog-body\s*\{[^}]*scroll-padding-bottom:\s*112px/u,
        'coaching page must own the builder dialog scroll padding');
    assert.match(coaching, /body \.coaching-builder-dialog > form\.dialog-body > #coachingBuilderContent\s*\{[^}]*padding-bottom:\s*var\(--space-7\)/u,
        'coaching page must own the builder content bottom spacing');
    assert.match(coaching, /body \.coaching-builder-dialog > form\.dialog-body > \.builder-dialog-actions\s*\{[^}]*min-height:\s*66px[^}]*padding-block:\s*var\(--space-3\)/u,
        'coaching page must own the builder action sizing');
    assert.match(coaching, /@media\s*\(max-width:\s*767px\)\s*\{[^}]*body \.coaching-builder-dialog > form\.dialog-body > #coachingBuilderContent\s*\{[^}]*padding-bottom:\s*var\(--space-6\)/u,
        'coaching page must retain the builder mobile spacing rule');
    assert.doesNotMatch(visual, /body \.coaching-builder-dialog > form\.dialog-body/u,
        'visual-redesign.css must not own coaching builder dialog layout');
});

test('structured modal contract owns form dialog scroll and sticky action regions', () => {
    const modal = read('public/css/components/modal-foundation.css');
    const html = read('public/index.html');

    assert.match(modal, /\.lf-modal-shell\.lf-modal--structured\s*>\s*:is\(\.modal-body,\s*\.dialog-body,\s*form\.dialog-body\)/u);
    assert.match(modal, /\.lf-modal-shell\.lf-modal--structured\s*>\s*:is\(\.modal-header,\s*\.form-actions,\s*\.dialog-actions\)/u);
    for (const id of ['expenseDialog', 'actionDialog', 'dayPassDialog', 'membershipPlanDialog', 'membershipTypeDialog', 'detailsDialog', 'qrReaderDialog', 'memberQrDialog']) {
        const tag = html.match(new RegExp(`<dialog\\b[^>]*\\bid="${id}"[^>]*>`, 'u'))?.[0] || '';
        assert.match(tag, /\blf-modal--structured\b/u, `${id} must opt into the central structured contract`);
        assert.match(tag, /\blf-modal-shell\b/u, `${id} must use the central modal shell`);
    }

    const lazyDialogs = [
        ['public/dialogs/permissions.html', ['authUserDialog']],
        ['public/dialogs/library.html', ['libraryFormDialog', 'libraryDetailsDialog']],
        ['public/dialogs/backup.html', ['backupRestoreDialog']],
        ['public/dialogs/coaching.html', ['externalTraineeDialog', 'coachingBuilderDialog', 'coachingProfileDialog']]
    ];
    for (const [file, ids] of lazyDialogs) {
        const source = read(file);
        for (const id of ids) {
            const tag = source.match(new RegExp(`<dialog\\b[^>]*\\bid="${id}"[^>]*>`, 'u'))?.[0] || '';
            assert.match(tag, /\blf-modal-shell\b/u, `${id} must use the canonical modal shell`);
            assert.match(tag, /\blf-modal--structured\b/u, `${id} must use the structured modal contract`);
        }
    }

    const trainer = read('public/trainer-workspace.html');
    for (const id of [
        'trainerClientDialog', 'trainerClientDetailsDialog', 'trainerTimelineDialog',
        'trainerMeasurementDialog', 'trainerCheckinDialog', 'trainerPackageDialog',
        'trainerSessionDialog', 'trainerPurchaseDialog', 'trainerPaymentDialog'
    ]) {
        const tag = trainer.match(new RegExp(`<dialog\\b[^>]*\\bid="${id}"[^>]*>`, 'u'))?.[0] || '';
        assert.match(tag, /\blf-modal--structured\b/u, `${id} must use the structured modal contract`);
    }
});

test('Day Pass table horizontal scrolling uses the canonical Tables contract', () => {
    const tables = read('public/css/components/tables.css');
    const attendance = read('public/css/pages/attendance.css');
    const html = read('public/index.html');
    const wrapper = html.match(/<div\b[^>]*\bid="dayPassTableWrap"[^>]*>/u)?.[0] || '';

    assert.match(wrapper, /\btable-scroll\b/u);
    assert.match(tables, /\.table-scroll[\s\S]*?overflow-x:\s*auto[\s\S]*?overflow-y:\s*hidden/u);
    assert.match(tables, /\.table-scroll--content-height\s*\{\s*min-height:\s*max-content/u);
    assert.doesNotMatch(attendance, /\.day-pass-table-wrap\s*\{[^}]*overflow/u);
});

test('dynamic Branch Create dialog opts into the central structured modal contract', () => {
    const source = read('public/js/branch-context.js');
    const tag = source.match(/<dialog\b[^>]*\bid="branchCreateDialog"[^>]*>/u)?.[0] || '';

    assert.match(tag, /\blf-modal-shell\b/u);
    assert.match(tag, /\blf-modal--structured\b/u);
    assert.match(source, /<form[^>]*\bclass="dialog-body branches-form"/u);
});

test('Platform Admin nested modals use the shared scroll-body contract while pricing workspaces remain inline', () => {
    const modal = read('public/css/components/modal-foundation.css');
    const enhancer = read('public/js/dialog-enhancements.js');
    const html = read('public/index.html');

    assert.match(enhancer, /structuredLayoutById[\s\S]*platformActionDialog[\s\S]*platformRegistrationCredentialsDialog/u);
    assert.doesNotMatch(enhancer, /pricingDialog|membershipTypesDialog/u);
    assert.match(html, /<section id="pricingDialog"[^>]*role="tabpanel"/u);
    assert.match(html, /<section id="membershipTypesDialog"[^>]*role="tabpanel"/u);
    assert.match(modal, /\.lf-modal-layout[\s\S]*overflow:\s*hidden/u);
    assert.match(modal, /\.lf-modal-layout\s*>\s*:is\(\.dialog-body,\s*\.dialog-scroll-content\)[\s\S]*overflow-y:\s*auto/u);
    assert.match(modal, /\.lf-modal-layout\s*>\s*:is\(\.dialog-actions,\s*\.form-actions\):not\(:has\(>[\s\S]*display:\s*none/u);
});

test('dynamically-created Coaching dialogs opt into the central structured contract by component type', () => {
    const enhancer = read('public/js/dialog-enhancements.js');
    const coaching = read('public/js/pages/coaching/coaching.js');

    assert.match(enhancer, /const usesNestedLayout = structuredLayoutById\.has\(dialog\.id\)[\s\S]*if \(usesNestedLayout \|\| dialog\.classList\.contains\('coaching-small-dialog'\)\)[\s\S]*if \(usesNestedLayout\)/u);
    for (const id of [
        'measurementDialog', 'checkinDialog', 'coachingSubscriptionDialog',
        'coachingClientEditDialog', 'coachingSessionDialog', 'coachingMealLogDialog'
    ]) {
        assert.match(coaching, new RegExp(`dialog\\.id = '${id}'[\\s\\S]*?dialog\\.className = 'coaching-small-dialog`, 'u'), `${id} should use the shared Coaching dialog component class`);
    }
});

test('SweetAlert destructive actions have one semantic danger owner instead of a shadowed primary rule', () => {
    const modals = read('public/css/components/modals.css');
    const primaryRule = modals.match(/body \.swal2-popup \.swal2-actions > button\.swal2-confirm,[\s\S]*?\{([^}]*)\}/u);
    const dangerRule = modals.match(/body \.swal2-popup \.swal2-actions > button\.btn-danger\s*\{([^}]*)\}/u);

    assert.ok(primaryRule, 'the confirm and primary buttons keep their canonical primary styling');
    assert.doesNotMatch(primaryRule[0], /button\.btn-danger/u, 'destructive actions must not be classified as primary');
    assert.ok(dangerRule, 'the destructive button has a dedicated semantic owner');
    assert.match(dangerRule[1], /background:\s*var\(--color-danger\)\s*!important/u);
    assert.match(dangerRule[1], /color:\s*var\(--text-on-primary\)\s*!important/u);
});

test('all static native dialogs are hydrated by the central runtime and have canonical size metadata', () => {
    const enhancer = read('public/js/dialog-enhancements.js');
    const htmlFiles = [
        'public/index.html', 'public/trainer-workspace.html', 'public/platform-admin.html',
        'public/dialogs/permissions.html', 'public/dialogs/library.html',
        'public/dialogs/backup.html', 'public/dialogs/coaching.html'
    ];
    const tags = htmlFiles.flatMap(file => [...read(file).matchAll(/<dialog\b([^>]*)>/gu)]);

    assert.ok(tags.length >= 25, `Expected the current native dialog inventory, found ${tags.length}`);
    assert.match(enhancer, /document\.querySelectorAll\('dialog'\)\.forEach\(ensureCloseButton\)/u);
    assert.match(enhancer, /observer\.observe\(document\.body,\s*\{\s*childList:\s*true,\s*subtree:\s*true\s*\}\)/u);
    for (const [, attributes] of tags) {
        const id = attributes.match(/\bid="([^"]+)"/u)?.[1];
        assert.ok(id, `Every static dialog needs an id for its central sizing/identity contract: ${attributes}`);
        if (!/\blf-modal-shell\b/u.test(attributes)) {
            assert.match(enhancer, new RegExp(`\\b${id}\\s*:`), `${id} must be hydrated centrally`);
        }
        assert.match(enhancer, new RegExp(`\\b${id}\\s*:`), `${id} must have a canonical size variant`);
    }
});

test('Platform Admin compact pagination is a Pagination-owner variant, not a page redefinition', () => {
    const pagination = read('public/css/components/pagination.css');
    const platform = read('public/css/pages/platform-admin.css');
    const platformHtml = read('public/platform-admin.html');
    const platformScript = read('public/js/platform-admin.js');

    assert.match(pagination, /\.pagination--compact\s*\{[\s\S]*min-height:\s*0[\s\S]*background:\s*transparent/u);
    assert.match(pagination, /\.pagination--compact button,[\s\S]*min-height:\s*38px/u);
    assert.match(pagination, /@media\s*\(max-width:\s*600px\)[\s\S]*\.pagination--compact\s*\{[\s\S]*flex-direction:\s*row[\s\S]*padding:\s*0/u);
    assert.equal(hasRootClassSelector(platform, 'pagination'), false);
    assert.equal((platformHtml.match(/class="pagination pagination--compact"/gu) || []).length, 3);
    assert.match(platformScript, /class="pagination pagination--compact"/u);
});

test('Platform Admin button and table primitives retain their canonical component owners', () => {
    const buttons = read('public/css/components/buttons.css');
    const tables = read('public/css/components/tables.css');
    const platform = read('public/css/pages/platform-admin.css');
    const platformButtonRoots = rulesWithRootClass(platform, 'platform-btn').map(rule => rule.selector);

    assert.equal(hasRootClassSelector(buttons, 'platform-btn'), true);
    assert.equal(hasRootClassSelector(tables, 'table-scroll'), true);
    assert.deepEqual(platformButtonRoots, ['.platform-btn.primary.full']);
    assert.equal(hasRootClassSelector(platform, 'table-scroll'), false);
    assert.match(buttons, /body \.platform-btn\.full\s*\{[\s\S]*width:\s*100%/u);
});

test('authentication submit geometry is owned by Buttons rather than visual-redesign', () => {
    const buttons = read('public/css/components/buttons.css');
    const visual = read('public/css/components/visual-redesign.css');
    const login = read('public/css/pages/login.css');

    assert.equal(hasRootClassSelector(buttons, 'auth-submit'), true);
    assert.equal(hasRootClassSelector(visual, 'auth-submit'), false);
    assert.equal(rulesContainingClass(login, 'auth-submit').some(rule => /min-height:\s*56px/u.test(rule.declarations)), true);
});

test('login remember-me keeps an 18px visual box inside the shared touch target', () => {
    const login = read('public/css/pages/login.css');
    const lastRule = (pattern) => [...login.matchAll(pattern)].at(-1)?.[0] || '';
    const rule = lastRule(/\.auth-screen\[data-auth-stage="login"\] \.auth-remember\s*\{[^}]*\}/gu);
    const checkbox = login.match(/\.auth-screen\[data-auth-stage="login"\] \.auth-remember input\s*\{[^}]*appearance:\s*none[^}]*\}/u)?.[0] || '';
    const checked = lastRule(/\.auth-screen\[data-auth-stage="login"\] \.auth-remember input:checked\s*\{[^}]*\}/gu);
    const mark = lastRule(/\.auth-screen\[data-auth-stage="login"\] \.auth-remember input:checked::after\s*\{[^}]*\}/gu);
    assert.match(rule, /min-height:\s*var\(--ui-touch-target\)/u);
    assert.match(rule, /gap:\s*var\(--space-2\)/u);
    assert.match(rule, /font-size:\s*14px/u);
    assert.match(checkbox, /width:\s*18px/u);
    assert.match(checkbox, /height:\s*18px/u);
    assert.match(checkbox, /border-radius:\s*4px/u);
    assert.match(checkbox, /display:\s*grid/u);
    assert.match(checked, /background:\s*var\(--primary\)/u);
    assert.match(mark, /border:\s*solid var\(--text-on-primary\)/u);
    assert.doesNotMatch(login, /body\.auth-locked \.auth-screen\[data-auth-stage="login"\] \.auth-remember input\s*\{[^}]*height:\s*20px/u);
    assert.match(login, /\.auth-screen\[data-auth-stage="login"\] \.auth-remember input:focus-visible/u);
});

test('authentication alerts use Alerts owner and Platform form message stays feature-owned', () => {
    const alerts = read('public/css/components/alerts.css');
    const visual = read('public/css/components/visual-redesign.css');
    const platform = read('public/css/pages/platform-admin.css');

    assert.equal(hasRootClassSelector(alerts, 'auth-message'), true);
    assert.equal(hasRootClassSelector(visual, 'auth-message'), false);
    assert.equal(hasRootClassSelector(visual, 'platform-form-message'), false);
    assert.match(platform, /\.platform-form-message\s*\{[^}]*line-height:\s*1\.6/u);
});

test('Member Portal error surface keeps semantic color and geometry in Alerts', () => {
    const alerts = read('public/css/components/alerts.css');
    const portal = read('public/css/pages/member-portal.css');

    assert.equal(hasRootClassSelector(alerts, 'portal-error'), true);
    const portalErrorRoots = rulesWithRootClass(portal, 'portal-error');
    assert.equal(portalErrorRoots.some(rule => /(?:^|;)\s*(?:color|background|border|padding)\s*:/u.test(rule.declarations)), false);
    assert.equal(portalErrorRoots.some(rule => /margin:\s*4px/u.test(rule.declarations)), true);
});

test('SaaS panels delegate standard card surface and padding to Cards', () => {
    const cards = read('public/css/components/cards.css');
    const saas = read('public/css/pages/saas.css');
    const standardPanelRules = rulesWithRootClass(saas, 'saas-panel').filter(rule => rule.selector.trim() === '.saas-panel');

    assert.equal(hasRootClassSelector(cards, 'saas-panel'), true);
    assert.ok(standardPanelRules.length > 0);
    assert.equal(standardPanelRules.some(rule => /(?:^|;)\s*(?:border|border-radius|background|box-shadow|padding)\s*:/u.test(rule.declarations)), false);
});

test('Platform Admin cards delegate their shared surface to Cards', () => {
    const cards = read('public/css/components/cards.css');
    const platform = read('public/css/pages/platform-admin.css');
    const foundation = read('public/css/components/ui-foundation.css');
    const roots = rulesWithRootClass(platform, 'platform-card').filter(rule => rule.selector.trim() === '.platform-card');

    assert.equal(hasRootClassSelector(cards, 'platform-card'), true);
    assert.doesNotMatch(foundation, /\.platform-(?:login-)?card\b/u,
        'shared foundations must not override Platform Admin card or login-card surfaces');
    assert.equal(roots.length, 1);
    assert.equal(/(?:^|;)\s*(?:border|border-radius|background|box-shadow)\s*:/u.test(roots[0].declarations), false);
    assert.match(roots[0].declarations, /min-width:\s*0/u);
    assert.match(platform, /\.platform-login-card\s*\{[^}]*border:\s*1px solid var\(--border-primary\)[^}]*box-shadow:\s*var\(--shadow-popup\)/u);
    assert.match(platform, /\.platform-card \.card-heading\s*\{\s*min-width:\s*0/u);
});

test('page-level foundation rules have canonical feature owners', () => {
    const foundation = read(retiredUiFoundationPath);
    const platform = read('public/css/pages/platform-admin.css');
    const portal = read('public/css/pages/member-portal.css');
    const registration = read('public/css/pages/register-gym.css');

    assert.equal(foundation, '', 'the retired shared foundation must not retain page rules');
    for (const selectorClass of ['platform-shell', 'platform-content', 'platform-page-head', 'platform-table']) {
        assert.equal(hasClassSelector(platform, selectorClass), true, `${selectorClass} must remain page-owned`);
    }
    assert.match(platform, /\.platform-table th\s*\{[^}]*letter-spacing:\s*0/u);
    assert.match(portal, /\.member-portal-page \.portal-result\s*\{[^}]*width:\s*min\(100%,\s*1120px\)[^}]*margin-inline:\s*auto/u);
    assert.match(portal, /\.portal-proof-picker\s*>\s*input\[type="file"\]\s*\{[^}]*width:\s*1px;[^}]*clip-path:\s*inset\(50%\)/u);
    assert.match(registration, /\.public-registration-page \.registration-shell\s*\{[^}]*width:\s*min\(100%\s*-\s*32px,\s*1280px\)/u);
    assert.match(registration, /\.registration-upload\s*>\s*input\[type="file"\]/u);
});

test('Platform Admin presentation is owned by its page stylesheet, not visual-redesign', () => {
    const platform = read('public/css/pages/platform-admin.css');
    const visual = read('public/css/components/visual-redesign.css');
    const platformSelectors = [
        'platform-shell', 'platform-sidebar', 'platform-main', 'platform-content',
        'platform-topbar', 'platform-page-head', 'platform-kpi', 'platform-kpi-label',
        'platform-kpi-value'
    ];

    for (const selectorClass of platformSelectors) {
        assert.equal(hasClassSelector(platform, selectorClass), true, `${selectorClass} must remain page-owned`);
        assert.equal(hasClassSelector(visual, selectorClass), false, `${selectorClass} must not be owned by visual-redesign`);
    }

    assert.match(platform, /\.platform-shell\s*\{[^}]*background:\s*var\(--bg-app\)[^}]*color:\s*var\(--text-primary\)/u);
    assert.match(platform, /\.platform-sidebar\s*\{[^}]*background:\s*var\(--platform-sidebar\)/u);
    assert.doesNotMatch(platform, /\.platform-sidebar\s*\{[^}]*linear-gradient/u);
    assert.match(platform, /\.platform-topbar\s*\{[^}]*border-bottom-color:\s*var\(--border-primary\)[^}]*background:\s*color-mix\(in srgb, var\(--bg-surface\) 94%, transparent\)/u);
    assert.match(platform, /\.platform-page-head\s*\{[^}]*var\(--border-secondary\)[^}]*padding:\s*0 0 15px/u);
    assert.match(platform, /\.platform-kpi::before\s*\{[^}]*background:\s*var\(--primary\)/u);
    assert.match(platform, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.platform-page-head\s*\{[^}]*gap:\s*12px/u);

    // Generic section-heading geometry and typography remain with the shared
    // layout/type owners; SaaS panel heading geometry is page-owned.
    assert.doesNotMatch(visual, /body \.section-heading/u);
    assert.match(read('public/css/layout.css'), /\.section-heading\s*\{[^}]*border-block-end:\s*1px solid var\(--border-secondary\)/u);
    assert.doesNotMatch(visual, /\.saas-panel-head/u);
    assert.doesNotMatch(visual, /body \.saas-page(?:\s*\{|-header h2)|body \.saas-panel h4/u);
    const saas = read('public/css/pages/saas.css');
    assert.match(saas, /body \.saas-page\s*\{[^}]*border-color:\s*var\(--border-primary\)[^}]*background:\s*var\(--bg-surface\)[^}]*box-shadow:\s*var\(--shadow-sm\)/u);
    assert.match(saas, /body \.saas-page-header h2,\s*body \.saas-panel h4\s*\{[^}]*color:\s*var\(--text-primary\)/u);
    assert.doesNotMatch(visual, /body \.skeleton,\s*body \.loading-skeleton\s*\{/u);
    const loading = read('public/css/components/loading.css');
    assert.match(loading, /\.logicfit-loader,[\s\S]*?mask-composite:\s*subtract[\s\S]*?@keyframes logicfit-loader-spin/u);
});

test('Platform navigation visual states are owned by its feature stylesheet', () => {
    const platform = read('public/css/pages/platform-admin.css');
    const visual = read('public/css/components/visual-redesign.css');

    assert.equal(hasRootClassSelector(platform, 'platform-nav-item'), true);
    assert.equal(hasClassSelector(visual, 'platform-nav-item'), false);
    assert.match(platform, /\.platform-nav-item:hover[\s\S]*?background:\s*var\(--sidebar-hover-bg\)/u);
    assert.match(platform, /\.platform-nav-item\.active\s*\{[^}]*background:\s*var\(--primary-soft\)[^}]*color:\s*var\(--azure-300\)/u);
});

test('shared search controls are owned by Forms, not foundation or visual layers', () => {
    const forms = read('public/css/components/forms.css');
    const nonOwners = [
        retiredUiFoundationPath,
        'public/css/components/visual-redesign.css'
    ].map(read).join('\n');

    assert.match(forms, /body \.members-search-field[\s\S]*?\.platform-search-field/u);
    assert.match(forms, /\.platform-global-search\s*>\s*span \.ui-icon[\s\S]*?width:\s*16px/u);
    assert.doesNotMatch(nonOwners, /body \.members-search-field|\.platform-global-search\s*>\s*span \.ui-icon/u);
});

test('tab component states are owned by Tabs, not the visual-redesign layer', () => {
    const tabs = read('public/css/components/tabs.css');
    const visual = read('public/css/components/visual-redesign.css');

    for (const selectorClass of ['library-type-tabs', 'store-tab']) {
        assert.equal(hasClassSelector(tabs, selectorClass), true, `${selectorClass} must have a canonical Tabs owner`);
        assert.equal(hasClassSelector(visual, selectorClass), false, `${selectorClass} must not be owned by visual-redesign`);
    }
});

test('shared status badge geometry is owned by Badges, not visual-redesign', () => {
    const badges = read('public/css/components/badges.css');
    const visual = read('public/css/components/visual-redesign.css');

    for (const selectorClass of ['branch-status', 'saas-status-pill', 'saas-panel-badge']) {
        assert.equal(hasClassSelector(badges, selectorClass), true, `${selectorClass} must have a canonical Badges owner`);
        assert.equal(hasClassSelector(visual, selectorClass), false, `${selectorClass} must not be owned by visual-redesign`);
    }
});

test('shared table wrapper geometry and mobile overflow are owned by Tables', () => {
    const tables = read('public/css/components/tables.css');
    const permissions = read('public/css/pages/permissions.css');
    const visual = read('public/css/components/visual-redesign.css');
    const wrapperClasses = [
        'table-container', 'table-panel', 'members-panel', 'store-table-wrap', 'saas-table-wrap',
        'platform-table-wrap', 'attendance-table-wrap', 'member-requests-table-wrap'
    ];

    for (const selectorClass of wrapperClasses) {
        assert.equal(hasRootClassSelector(tables, selectorClass), true, `${selectorClass} must have a canonical Tables owner`);
        assert.equal(hasRootClassSelector(visual, selectorClass), false, `${selectorClass} must not be owned by visual-redesign`);
    }

    assert.equal(hasRootClassSelector(permissions, 'auth-users-table-wrap'), true, 'Assistant account records own their responsive table/card wrapper in Permissions');
    assert.equal(hasRootClassSelector(visual, 'auth-users-table-wrap'), false, 'Assistant account wrapper must not be owned by visual-redesign');
    assert.doesNotMatch(tables, /body\s+\.auth-users-table-wrap\s*\{[^}]*overflow-x:\s*auto/isu,
        'the generic mobile table contract must not force horizontal scrolling on the responsive Assistant account cards');
});

test('empty spanning rows are excluded from sticky action-column treatment', () => {
    const tables = read('public/css/components/tables.css');
    for (const tableClass of ['members-table', 'attendance-table', 'external-trainees-table', 'library-data-table', 'backup-history-table']) {
        assert.match(tables, new RegExp(`\\.${tableClass} td:last-child:not\\(\\[colspan\\]\\)`, 'u'),
            `${tableClass} must not make a colspan empty-state cell a sticky action column`);
        assert.match(tables, new RegExp(`\\.${tableClass} tbody tr:nth-child\\(even\\) td:last-child:not\\(\\[colspan\\]\\)`, 'u'),
            `${tableClass} zebra treatment must exclude colspan empty-state cells`);
        assert.match(tables, new RegExp(`\\.${tableClass} tbody tr:hover td:last-child:not\\(\\[colspan\\]\\)`, 'u'),
            `${tableClass} hover treatment must exclude colspan empty-state cells`);
    }
});

test('Members desktop table styling applies with responsive-card decoration while shared hover stays centralized', () => {
    const members = read('public/css/pages/members.css');
    const visual = read('public/css/components/visual-redesign.css');
    const tables = read('public/css/components/tables.css');

    assert.match(members, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.members-table\s*\{[^}]*min-width:\s*1320px[^}]*table-layout:\s*fixed/u);
    assert.doesNotMatch(members, /\.members-table:not\(\.table-card-layout\)/u);
    assert.match(members, /#membersSection\s+\.members-table\s+th,[\s\S]*?text-align:\s*center/u);
    assert.match(tables, /table,\s*\.data-table,\s*\.members-table,\s*\.history-table\s*\{[^}]*table-layout:\s*auto/u);
    assert.match(tables, /\.members-table\s*>\s*tbody\s*>\s*tr:hover\s*\{\s*background:\s*var\(--color-surface-muted\)/u);
    assert.doesNotMatch(visual, /\.members-table(?:\b|\s|:|#)|#membersSection\s+\.members-table/u);
});

test('feature card surfaces share the canonical Cards owner', () => {
    const cards = read('public/css/components/cards.css');
    const visual = read('public/css/components/visual-redesign.css');
    const featureCards = ['store-card', 'branches-card', 'saas-panel', 'platform-card', 'portal-tool-card', 'platform-kpi'];
    const surfaceProperties = /(?:^|;)\s*(?:border|border-radius|background|box-shadow)\s*:/u;

    for (const selectorClass of featureCards) {
        assert.equal(rulesWithRootClass(cards, selectorClass).some(rule => surfaceProperties.test(rule.declarations)), true,
            `${selectorClass} needs shared surface declarations in Cards`);
        assert.equal(rulesWithRootClass(visual, selectorClass).some(rule => surfaceProperties.test(rule.declarations)), false,
            `${selectorClass} surface must not be redeclared in visual-redesign`);
    }
});

test('print data cells wrap long email and portal values inside canonical document grids', () => {
    const print = read('public/css/print.css');

    assert.match(print, /\.print-info-item,\s*\.print-billing-item,\s*\.print-system-kpi,\s*\.print-system-info\s*\{[^}]*min-width:\s*0/u);
    assert.match(print, /\.print-info-item strong,\s*\.print-billing-item strong,\s*\.print-system-kpi strong,\s*\.print-system-info strong\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere/u);
});

test('payment receipt amounts use primary semantics while outstanding balances remain danger-coded', () => {
    const print = read('public/css/print.css');

    assert.match(print, /:root\s*\{[^}]*--print-danger-text:\s*#c53030/u);
    assert.match(print, /\.print-billing-item\.remaining\s*\{[^}]*border-color:\s*var\(--print-danger-border\)[^}]*background:\s*var\(--print-danger-surface\)/u);
    assert.match(print, /\.print-billing-item\.remaining strong\s*\{[^}]*color:\s*var\(--print-danger-text\)/u);
    assert.match(print, /\.print-receipt-amount\s*\{[^}]*border-color:\s*var\(--print-brand-border\)[^}]*background:\s*var\(--print-brand-surface\)/u);
    assert.match(print, /\.print-receipt-amount strong\s*\{[^}]*color:\s*var\(--print-brand-primary\)/u);
    assert.doesNotMatch(print, /\.print-receipt-amount strong\s*\{[^}]*color:\s*#c53030/u);
});

test('all print styling and standalone print windows have one canonical owner', () => {
    const printCss = read('public/css/print.css');
    const printRuntime = read('public/js/integrations/print-enhancements.js');
    const store = read('public/js/pages/store/store.js');
    const coaching = read('public/js/pages/coaching/coaching.js');
    const pageStyles = fs.readdirSync(path.join(root, 'public/css/pages'))
        .filter(file => file.endsWith('.css'))
        .map(file => fs.readFileSync(path.join(root, 'public/css/pages', file), 'utf8'));

    assert.match(printRuntime, /function printDocument\(printWindow, html\)/u);
    assert.match(printRuntime, /data-top-gym-print-styles href=.*\/css\/print\.css/u);
    assert.match(store, /print-store-receipt/u);
    assert.doesNotMatch(store, /<style>|main\.css\?v=|print\.css\?v=/u);
    assert.doesNotMatch(coaching, /buildBuilderPrintDocument|<style>@page/u);
    assert.match(coaching, /printer\.printCoachingDraft/u);
    assert.match(printCss, /\.print-store-receipt-table/u);
    assert.equal(pageStyles.some(source => /@media\s+print|@page\b/u.test(source)), false,
        'feature page styles must not own print or page rules');
});

test('print documents use compact shared spacing without reserving full media height for missing images', () => {
    const printCss = read('public/css/print.css');
    assert.match(printCss, /\.print-header\s*\{[^}]*padding:\s*3px 0 9px/su);
    assert.match(printCss, /\.print-section\s*\{[^}]*margin:\s*0 0 10px/su);
    assert.match(printCss, /\.print-footer\s*\{[^}]*margin-top:\s*14px/su);
    assert.match(printCss, /\.coaching-plan-media-empty\s*\{[^}]*min-height:\s*16mm/su);
    assert.match(printCss, /\.coaching-plan-summary\s*\{[^}]*padding:\s*2\.5mm/su);
});

test('attendance phone feedback delegates hidden-state behavior to the canonical phone component', () => {
    const phone = read('public/css/components/phone-inputs.css');
    const attendance = read('public/css/pages/attendance.css');

    assert.match(phone, /\.phone-input-error\[hidden\]\s*\{[^}]*display:\s*block\s*!important/u,
        'the phone component owns its stable hidden feedback slot');
    assert.match(attendance, /\.attendance-section \.phone-input-error\[hidden\]\s*\{[^}]*height:\s*0;[^}]*visibility:\s*hidden;/u,
        'Attendance may retain its local zero-height layout adjustment');
    assert.doesNotMatch(attendance, /\.attendance-section \.phone-input-error\[hidden\]\s*\{[^}]*display\s*:/u,
        'Attendance must not duplicate the phone component display invariant');
});

test('style validator checks generated bundles but does not report them as duplicate token owners', () => {
    const result = spawnSync(process.execPath, ['scripts/validate-styles.js'], { cwd: root, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /\[STYLES-OK\]/u);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /multiple source owners outside tokens\.css/u);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /login-entry\.css uses !important/u);
});
