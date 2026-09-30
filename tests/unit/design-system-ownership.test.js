const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { hasClassSelector, hasRootClassSelector, rulesContainingClass, rulesWithRootClass } = require('../helpers/css-selector-ownership');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('shared empty, loading, and error surfaces have canonical component owners', () => {
    const empty = read('public/css/components/empty-states.css');
    const loading = read('public/css/components/loading.css');
    const alerts = read('public/css/components/alerts.css');

    assert.match(empty, /body \.empty-state[\s\S]*?--rf-line[\s\S]*?--rf-surface-soft/u);
    assert.match(loading, /body \.loading[\s\S]*?--rf-line[\s\S]*?--rf-surface-soft/u);
    assert.match(alerts, /body \.error-state[\s\S]*?--danger-border[\s\S]*?--danger-soft/u);
});

test('global foundations and visual polish do not own shared status surfaces', () => {
    const sources = [
        'public/css/components/ui-foundation.css',
        'public/css/components/design-foundation.css',
        'public/css/components/visual-redesign.css'
    ].map(read).join('\n');

    assert.doesNotMatch(sources, /body\s+\.(?:empty-state|empty|no-data|not-found-state|saas-empty|loading|error-state|page-error|registration-error|portal-error)(?![-\w])/u);
    assert.doesNotMatch(sources, /:where\(\s*\.(?:empty-state|empty|no-data|not-found-state|loading|error-state)(?![-\w])/u);
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

test('Platform Admin nested modal layout uses the shared scroll-body contract', () => {
    const modal = read('public/css/components/modal-foundation.css');
    const enhancer = read('public/js/dialog-enhancements.js');

    assert.match(enhancer, /structuredLayoutById[\s\S]*platformActionDialog[\s\S]*platformRegistrationCredentialsDialog[\s\S]*pricingDialog[\s\S]*membershipTypesDialog/u);
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

test('authentication alerts use Alerts owner and Platform form message stays feature-owned', () => {
    const alerts = read('public/css/components/alerts.css');
    const visual = read('public/css/components/visual-redesign.css');
    const platform = read('public/css/pages/platform-admin.css');

    assert.equal(hasRootClassSelector(alerts, 'auth-message'), true);
    assert.equal(hasRootClassSelector(visual, 'auth-message'), false);
    assert.equal(hasRootClassSelector(visual, 'platform-form-message'), false);
    assert.match(platform, /\.platform-form-message\s*\{[^}]*line-height:\s*1\.65/u);
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
    const roots = rulesWithRootClass(platform, 'platform-card').filter(rule => rule.selector.trim() === '.platform-card');

    assert.equal(hasRootClassSelector(cards, 'platform-card'), true);
    assert.equal(roots.length, 1);
    assert.equal(/(?:^|;)\s*(?:border|border-radius|background|box-shadow)\s*:/u.test(roots[0].declarations), false);
    assert.match(roots[0].declarations, /min-width:\s*0/u);
});

test('Platform navigation visual states are owned by its feature stylesheet', () => {
    const platform = read('public/css/pages/platform-admin.css');
    const visual = read('public/css/components/visual-redesign.css');

    assert.equal(hasRootClassSelector(platform, 'platform-nav-item'), true);
    assert.equal(hasClassSelector(visual, 'platform-nav-item'), false);
    assert.match(platform, /\.platform-nav-item:hover[\s\S]*?background:\s*rgb\(92 168 255 \/ \.12\)/u);
    assert.match(platform, /\.platform-nav-item\.active\s*\{[^}]*min-height|\.platform-nav-item\.active\s*\{[^}]*background:\s*linear-gradient/u);
});

test('shared search controls are owned by Forms, not foundation or visual layers', () => {
    const forms = read('public/css/components/forms.css');
    const nonOwners = [
        'public/css/components/ui-foundation.css',
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
    const visual = read('public/css/components/visual-redesign.css');
    const wrapperClasses = [
        'table-container', 'table-panel', 'members-panel', 'store-table-wrap', 'saas-table-wrap',
        'platform-table-wrap', 'auth-users-table-wrap', 'attendance-table-wrap', 'member-requests-table-wrap'
    ];

    for (const selectorClass of wrapperClasses) {
        assert.equal(hasRootClassSelector(tables, selectorClass), true, `${selectorClass} must have a canonical Tables owner`);
        assert.equal(hasRootClassSelector(visual, selectorClass), false, `${selectorClass} must not be owned by visual-redesign`);
    }
});

test('Members table composition is feature-owned while generic table behavior stays centralized', () => {
    const members = read('public/css/pages/members.css');
    const visual = read('public/css/components/visual-redesign.css');
    const tables = read('public/css/components/tables.css');

    assert.match(members, /\.members-table:not\(\.table-card-layout\)\s*\{[^}]*min-width:\s*1120px[^}]*table-layout:\s*fixed/u);
    assert.match(tables, /table,\s*\.data-table,\s*\.members-table,\s*\.history-table\s*\{[^}]*table-layout:\s*auto/u);
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
