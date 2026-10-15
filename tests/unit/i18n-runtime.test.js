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

function boot(savedLocale = null) {
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
    vm.runInNewContext(runtime, { window, document, CustomEvent }, { filename: 'i18n.js' });
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
