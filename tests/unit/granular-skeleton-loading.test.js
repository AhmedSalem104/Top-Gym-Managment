'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('shared skeleton utility exposes bounded component primitives without artificial delays', () => {
    const source = read('public/js/loading-skeleton.js');

    assert.match(source, /window\.topGymSkeleton/);
    assert.match(source, /function table\(/);
    assert.match(source, /function list\(/);
    assert.match(source, /function cards\(/);
    assert.match(source, /function text\(/);
    assert.match(source, /function avatar\(/);
    assert.match(source, /function kpi\(/);
    assert.match(source, /function chart\(/);
    assert.match(source, /function form\(/);
    assert.match(source, /function select\(/);
    assert.match(source, /Object\.freeze\(\{ avatar, cards, chart, error, form, hydrate, kpi, list, ready, refresh, select, start, table, text \}\)/);
    assert.match(source, /function refresh\(/);
    assert.match(source, /function ready\(/);
    assert.match(source, /aria-busy/);
    assert.match(source, /loadingState/);
    assert.doesNotMatch(source, /setTimeout|setInterval/);
});

test('table/list/card initial loading uses the shared spinner without synthetic data skeletons', () => {
    const utility = read('public/js/loading-skeleton.js');
    const performanceLoader = read('public/js/performance-loader.js');
    const styles = read('public/css/components/loading.css');

    assert.equal((utility.match(/return loadingState\(/gu) || []).length, 3);
    assert.match(utility, /aria-busy', 'true'/u);
    assert.match(utility, /logicfit-refresh-indicator/u);
    assert.doesNotMatch(performanceLoader, /skeletonCardsMarkup|skeletonTableMarkup|element\.innerHTML\s*=\s*isTable/u);
    assert.match(performanceLoader, /suppressedRequests:\s*new Map\(\)/u);
    assert.match(performanceLoader, /function requestKey\([\s\S]*parsed\.pathname\}\$\{parsed\.search\}/u);
    assert.match(performanceLoader, /consumeSilentRequest\(String\(url\)\)/u);
    assert.doesNotMatch(performanceLoader, /suppressedTasks/u);
    assert.match(read('public/js/app.js'), /silentRequests\s*\}\);/u);
    assert.match(read('public/js/app.js'), /silentRequests:\s*\[detailsPath\]/u);
    assert.match(styles, /\.logicfit-loader[\s\S]*?--loader-size-section[\s\S]*?mask-composite:\s*subtract/u);
    assert.match(styles, /\.members-list\.is-result-entering[\s\S]*?animation-delay:\s*var\(--member-row-stagger-cap\)/u);
    assert.match(styles, /prefers-reduced-motion[\s\S]*?members-list\.is-result-entering[\s\S]*?animation:\s*none/u);
});

test('central filter choice groups preserve the native filter event contract and use radio semantics', () => {
    const source = read('public/js/ui-feedback.js');

    for (const id of ['statusFilter', 'attendanceStatusFilter', 'platformRequestStatus', 'requestStatusFilter', 'gymRegistrationStatusFilter', 'tenantStatusFilter', 'memberSubscriptionRequestStatus', 'reportsMembershipStatus', 'reportsCoachingStatus', 'memberFeedbackTypeFilter', 'tenantTypeFilter']) {
        assert.match(source, new RegExp(`'${id}'`, 'u'));
    }
    assert.match(source, /setAttribute\('role', 'radiogroup'\)/u);
    assert.match(source, /setAttribute\('role', 'radio'\)/u);
    assert.match(source, /setAttribute\('aria-checked'/u);
    assert.ok(source.indexOf('/expired|rejected|cancelled|failed|inactive/') < source.indexOf('/active|approved|inside|completed|success/'), 'negative states must be classified before active-like substrings');
    assert.match(source, /dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/u);
    assert.doesNotMatch(source, /role', 'tablist|\/api\//u);
});

test('shared skeleton accessible labels follow the centralized Arabic and English locale', () => {
    const source = read('public/js/loading-skeleton.js');
    const localeLabels = {
        ar: { 'common.loading.data': 'جارٍ تحميل البيانات' },
        en: { 'common.loading.data': 'Loading data' }
    };

    for (const locale of ['ar', 'en']) {
        const window = { TopGymI18n: { t: (key) => localeLabels[locale][key] || key }, addEventListener() {} };
        vm.runInNewContext(source, {
            window,
            document: { addEventListener() {} }
        });
        assert.match(window.topGymSkeleton.list({ rows: 1 }), new RegExp(`aria-label=\"${localeLabels[locale]['common.loading.data']}\"`, 'u'));
        assert.match(window.topGymSkeleton.table({ rows: 1, columns: 2 }), new RegExp(`aria-label=\"${localeLabels[locale]['common.loading.data']}\"`, 'u'));
    }
});

test('existing loading skeleton labels update when locale changes before the request finishes', () => {
    const source = read('public/js/loading-skeleton.js');
    const translations = {
        ar: { 'common.loading.data': 'جارٍ تحميل البيانات' },
        en: { 'common.loading.data': 'Loading data' }
    };
    let locale = 'ar';
    let localeListener;
    const loadingRegion = {
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; }
    };
    const document = {
        addEventListener() {},
        querySelectorAll(selector) { return selector.includes('.logicfit-loading-state') ? [loadingRegion] : []; }
    };
    const window = {
        TopGymI18n: { t: (key) => translations[locale][key] || key },
        addEventListener(name, callback) { if (name === 'topgym:localechange') localeListener = callback; }
    };

    vm.runInNewContext(source, { window, document });
    loadingRegion.attributes['aria-label'] = translations.ar['common.loading.data'];
    locale = 'en';
    localeListener();

    assert.equal(loadingRegion.attributes['aria-label'], translations.en['common.loading.data']);
});

test('members, dashboard, platform and trainer surfaces use component-scoped loading contracts', () => {
    const index = read('public/index.html');
    const trainerMarkup = read('public/trainer-workspace.html');
    const trainerScript = read('public/js/trainer-workspace.js');
    const appScript = read('public/js/app.js');
    const dashboardStyles = read('public/css/pages/dashboard.css');

    assert.match(index, /id="membersList"[^>]+data-skeleton-kind="table"/);
    assert.match(index, /id="alertsList"[^>]+data-skeleton-kind="list"/);
    assert.match(index, /class="stats-grid"[^>]+data-skeleton-region="dashboard-stats"/);
    assert.match(index, /id="platformPlansList"[^>]+data-skeleton-kind="cards"/);
    assert.match(index, /id="platformAuditList"[^>]+data-skeleton-kind="list"/);
    assert.match(read('public/js/app.js'), /topGymSkeleton\?\.ready\(membersList\)/);
    assert.match(read('public/js/app.js'), /data-members-retry/);
    assert.match(trainerMarkup, /id="trainerClientsList"[^>]+data-skeleton-kind="list"/);
    assert.match(trainerMarkup, /id="trainerSessionsList"[^>]+data-skeleton-kind="list"/);
    assert.match(trainerScript, /function beginRegionLoading\(/);
    assert.match(trainerScript, /topGymSkeleton\?\.ready/);
    assert.match(index, /class="dashboard-overview-cards"[\s\S]*data-dashboard-member-count/u);
    assert.doesNotMatch(index, /dashboardInitialSkeleton|dashboard-initial-skeleton/u);
    assert.doesNotMatch(appScript, /dashboardInitialSkeleton/u);
    assert.doesNotMatch(dashboardStyles, /dashboard-initial-skeleton/u);
    assert.match(dashboardStyles, /#dashboardSection\.data-loading \.dashboard-overview-card \[data-dashboard-member-count\],[\s\S]*?background:\s*var\(--bg-card-hover\)/u);
});

test('refreshing a region preserves its current content and reduced motion disables shimmer', () => {
    const utility = read('public/js/loading-skeleton.js');
    const styles = read('public/css/components/loading.css');
    const trainerStyles = read('public/css/pages/trainer-workspace.css');

    assert.match(utility, /function refresh\(host\) \{[\s\S]*preserve: true/);
    assert.match(styles, /\.skeleton-region\[data-loading-state="refreshing"\]/);
    assert.match(styles, /prefers-reduced-motion[\s\S]*animation: none/);
    assert.match(trainerStyles, /prefers-reduced-motion[\s\S]*trainer-workspace-summary\[data-loading-state="refreshing"\]/);
});
