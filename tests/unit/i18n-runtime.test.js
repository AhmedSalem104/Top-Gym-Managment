const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runtime = fs.readFileSync(path.join(__dirname, '../../public/js/core/i18n.js'), 'utf8');

function createElement() {
    const attributes = new Map();
    const listeners = new Map();
    return {
        id: '',
        type: '',
        className: '',
        textContent: '',
        dataset: {},
        attributes,
        listeners,
        parentElement: null,
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.get(name) ?? null; },
        addEventListener(name, handler) { listeners.set(name, handler); },
        querySelector() { return null; },
        click() { listeners.get('click')?.(); }
    };
}

function boot(savedLocale = null, source = runtime) {
    const storage = new Map(savedLocale ? [['logic-fit-ui-locale', savedLocale], ['topgym-theme', 'dark']] : [['topgym-theme', 'dark']]);
    const host = createElement();
    host.insertBefore = (element) => { element.parentElement = host; host.button = element; };
    host.querySelector = () => null;
    const root = { lang: 'ar', dir: 'rtl', dataset: {}, setAttribute(name, value) { this[name] = value; } };
    const body = { dataset: {} };
    const events = [];
    const document = {
        readyState: 'complete',
        documentElement: root,
        body,
        querySelector(selector) { return selector === '.topbar-mobile-actions' ? host : null; },
        querySelectorAll() { return []; },
        getElementById() { return null; },
        createElement,
        createTextNode: (value) => ({ textContent: value })
    };
    class CustomEvent {
        constructor(type, init) { this.type = type; this.detail = init?.detail; }
    }
    const window = {
        localStorage: {
            getItem(key) { return storage.get(key) ?? null; },
            setItem(key, value) { storage.set(key, String(value)); }
        },
        dispatchEvent(event) { events.push(event); },
        addEventListener() {}
    };
    vm.runInNewContext(source, { window, document, CustomEvent }, { filename: 'i18n.js' });
    return { api: window.TopGymI18n, root, body, storage, events, host };
}

test('central localization runtime switches locale, updates document direction, and persists without touching theme state', () => {
    const { api, root, body, storage, events, host } = boot();

    assert.equal(api.get(), 'ar');
    assert.equal(root.lang, 'ar');
    assert.equal(root.dir, 'rtl');
    assert.equal(host.button.textContent, 'EN');

    api.set('en');
    assert.equal(root.lang, 'en');
    assert.equal(root.dir, 'ltr');
    assert.equal(body.lang, 'en');
    assert.equal(body.dir, 'ltr');
    assert.equal(storage.get('logic-fit-ui-locale'), 'en');
    assert.equal(storage.get('topgym-theme'), 'dark');
    assert.equal(events.at(-1).type, 'topgym:localechange');
    assert.deepEqual({ locale: events.at(-1).detail.locale, dir: events.at(-1).detail.dir }, { locale: 'en', dir: 'ltr' });

    api.toggle();
    assert.equal(api.get(), 'ar');
    assert.equal(root.dir, 'rtl');
    assert.equal(host.button.textContent, 'EN');
    assert.equal(storage.get('topgym-theme'), 'dark');
});

test('saved locale is restored and invalid locale requests do not mutate state', () => {
    const { api, root, storage } = boot('en');
    assert.equal(api.get(), 'en');
    assert.equal(root.dir, 'ltr');
    assert.equal(api.set('fr'), 'en');
    assert.equal(storage.get('logic-fit-ui-locale'), 'en');
});

test('localization exposes only centralized text lookup and never injects user interpolation as HTML', () => {
    const { api } = boot();
    const target = createElement();
    target.innerHTML = '<em>unchanged</em>';
    assert.equal(api.t('nav.members'), 'المشتركون');
    api.set('en', { persist: false });
    assert.equal(api.t('nav.members'), 'Members');
    assert.equal(api.t('missing.key'), 'missing.key');
    api.renderText(target, 'common.greeting', { name: '<img src=x onerror=alert(1)>' });
    assert.equal(target.textContent, 'Hello <img src=x onerror=alert(1)>');
    assert.equal(target.innerHTML, '<em>unchanged</em>');
});

test('dashboard attendance analytics labels resolve in both centralized locales', () => {
    const { api } = boot();
    const keys = [
        'dashboard.analytics.label.visits',
        'dashboard.analytics.label.uniqueMembers',
        'dashboard.analytics.label.dailyAverage',
        'dashboard.analytics.label.differentMember',
        'dashboard.analytics.label.visitPerDay',
        'dashboard.analytics.label.noAttendance7Days'
    ];

    for (const locale of ['ar', 'en']) {
        api.set(locale, { persist: false });
        for (const key of keys) assert.notEqual(api.t(key), key, `${locale} is missing ${key}`);
    }
});

test('member print catalog has complete Arabic and English coverage with key fallback', () => {
    const { api } = boot();
    const catalogKeys = (catalogName) => {
        const start = runtime.indexOf(`const ${catalogName} = Object.freeze({`);
        assert.notEqual(start, -1, `Missing catalog ${catalogName}`);
        const end = runtime.indexOf('\n    });', start);
        assert.notEqual(end, -1, `Unterminated catalog ${catalogName}`);
        return [...runtime.slice(start, end).matchAll(/'((?:print\.member\.)[\w.]+)'\s*:/gu)].map((match) => match[1]);
    };
    const arabicKeys = catalogKeys('memberPrintArabic');
    const englishKeys = catalogKeys('memberPrintEnglish');
    const counts = new Map();
    [...arabicKeys, ...englishKeys].forEach((key) => counts.set(key, (counts.get(key) || 0) + 1));

    assert.ok(counts.size >= 80, `Expected a complete member print message set, found ${counts.size} keys`);
    for (const [key, count] of counts) assert.equal(count, 2, `${key} must be defined once per locale`);
    assert.deepEqual([...arabicKeys].sort(), [...englishKeys].sort(), 'Arabic and English print catalogs must have identical key coverage');

    const requiredGroups = [
        'print.member.document.membershipTitle',
        'print.member.document.fullProfileTitle',
        'print.member.document.paymentReceiptTitle',
        'print.member.section.membershipHistory',
        'print.member.field.registrationDate',
        'print.member.table.transactionAmount',
        'print.member.empty.payments',
        'print.member.error.receiptMissing',
        'print.member.footer.signature'
    ];
    for (const key of requiredGroups) assert.ok(counts.has(key), `Missing required print catalog key: ${key}`);

    for (const locale of ['ar', 'en']) {
        api.set(locale, { persist: false });
        for (const key of counts.keys()) assert.notEqual(api.t(key), key, `${locale} is missing ${key}`);
    }

    api.set('en', { persist: false });
    assert.equal(api.t('print.member.value.until', { date: '20/08/2026' }), 'Until 20/08/2026');
    assert.equal(api.t('print.member.missing.key'), 'print.member.missing.key');

    const fallbackKey = "        'print.member.value.active': 'Active',\n";
    assert.ok(runtime.includes(fallbackKey), 'English fallback fixture should match a single catalog entry');
    const fallbackRuntime = runtime.replace(fallbackKey, '');
    const { api: fallbackApi } = boot('en', fallbackRuntime);
    assert.equal(fallbackApi.t('print.member.value.active'), 'نشط');
});

test('member print known operation and duration labels resolve exactly without defining arbitrary enum codes', () => {
    const { api } = boot();
    const labels = {
        ar: {
            'print.member.operation.created': 'إضافة اشتراك',
            'print.member.operation.updated': 'تعديل بيانات',
            'print.member.operation.renewed': 'تجديد اشتراك',
            'print.member.operation.frozen': 'تجميد العضوية',
            'print.member.operation.resumed': 'استئناف العضوية',
            'print.member.operation.paymentUpdated': 'تحديث الدفع',
            'print.member.operation.transactionSubscription': 'اشتراك',
            'print.member.operation.transactionPayment': 'دفعة',
            'print.member.operation.transactionAdjustment': 'تسوية',
            'print.member.value.twoMonths': 'شهرين'
        },
        en: {
            'print.member.operation.created': 'Membership added',
            'print.member.operation.updated': 'Details updated',
            'print.member.operation.renewed': 'Membership renewed',
            'print.member.operation.frozen': 'Membership frozen',
            'print.member.operation.resumed': 'Membership resumed',
            'print.member.operation.paymentUpdated': 'Payment updated',
            'print.member.operation.transactionSubscription': 'Subscription',
            'print.member.operation.transactionPayment': 'Payment',
            'print.member.operation.transactionAdjustment': 'Adjustment',
            'print.member.value.twoMonths': 'Two months'
        }
    };

    for (const [locale, expected] of Object.entries(labels)) {
        api.set(locale, { persist: false });
        for (const [key, value] of Object.entries(expected)) assert.equal(api.t(key), value, `${locale}: ${key}`);
    }

    const unknownCode = 'print.member.operation.unrecognized_external_code';
    assert.equal(api.t(unknownCode), unknownCode, 'Unknown enum-like values must retain key fallback');
    assert.ok(!runtime.includes(`'${unknownCode}'`), 'Arbitrary unknown enum codes must not be added to the catalog');
});

test('central locale formatters localize numbers, currency, and dates without changing source values', () => {
    const { api } = boot();
    assert.match(api.format('currency', 8750.5, { currency: 'EGP' }), /ج\.م/u);
    assert.notEqual(api.format('date', '2026-10-11'), '2026-10-11');
    api.set('en', { persist: false });
    assert.match(api.format('currency', 8750.5, { currency: 'EGP' }), /EGP/u);
    assert.match(api.format('number', 1234), /1,234/u);
    assert.equal(api.format('date', 'not-a-date'), 'not-a-date');
});

test('central date formatter accepts Intl styles without conflicting component fields', () => {
    const { api } = boot();
    assert.doesNotThrow(() => api.format('date', '2026-10-12', { dateStyle: 'medium' }));
    assert.notEqual(api.format('date', '2026-10-12', { dateStyle: 'medium' }), '2026-10-12');
    assert.equal(
        api.format('date', '2026-10-01', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
        new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date('2026-10-01T00:00:00Z'))
    );
    api.set('en', { persist: false });
    assert.doesNotThrow(() => api.format('date', '2026-10-12T14:35:00Z', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }));
    assert.notEqual(api.format('date', '2026-10-12T14:35:00Z', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }), '2026-10-12T14:35:00Z');
});

test('central time formatter localizes valid timestamps and preserves invalid values', () => {
    const { api } = boot();
    const timestamp = '2026-10-12T14:35:00Z';
    const arabicTime = api.format('time', timestamp, { timeStyle: 'short', timeZone: 'UTC' });
    assert.ok(arabicTime.length > 0);
    assert.notEqual(arabicTime, timestamp);
    api.set('en', { persist: false });
    const englishTime = api.format('time', timestamp, { timeStyle: 'short', timeZone: 'UTC' });
    assert.ok(englishTime.length > 0);
    assert.notEqual(englishTime, timestamp);
    assert.equal(api.format('time', 'not-a-time'), 'not-a-time');
});
