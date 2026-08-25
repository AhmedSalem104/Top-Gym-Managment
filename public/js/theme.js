(function () {
    'use strict';

    const STORAGE_KEY = 'topgym-theme';
    const root = document.documentElement;
    const allowedThemes = new Set(['light', 'dark']);

    function readSavedTheme() {
        try {
            return window.localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            return null;
        }
    }

    function saveTheme(theme) {
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch (error) {
            // Private browsing and locked-down webviews can deny storage.
        }
    }

    function preferredTheme() {
        const saved = readSavedTheme();
        if (allowedThemes.has(saved)) return saved;
        return 'light';
    }

    function updateControls(theme) {
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            const nextTheme = theme === 'dark' ? 'light' : 'dark';
            const label = button.querySelector('[data-theme-toggle-label]');
            const labelText = nextTheme === 'dark' ? 'الوضع الداكن' : 'الوضع الفاتح';
            const titleText = nextTheme === 'dark' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح';
            button.setAttribute('aria-pressed', String(theme === 'dark'));
            button.setAttribute('aria-label', titleText);
            button.setAttribute('title', titleText);
            if (label) label.textContent = labelText;
        });
    }

    function updateMetaThemeColor(theme) {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            const appBackground = getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim();
            if (appBackground) meta.setAttribute('content', appBackground);
        }
    }

    function setTheme(theme, { persist = true } = {}) {
        const nextTheme = allowedThemes.has(theme) ? theme : 'light';
        root.dataset.theme = nextTheme;
        if (document.body) document.body.dataset.theme = nextTheme;
        if (persist) saveTheme(nextTheme);
        updateControls(nextTheme);
        updateMetaThemeColor(nextTheme);
        window.dispatchEvent(new CustomEvent('topgym:themechange', { detail: { theme: nextTheme } }));
        return nextTheme;
    }

    function setup() {
        const initialTheme = root.dataset.theme || preferredTheme();
        setTheme(initialTheme, { persist: false });
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            button.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
        });
    }

    window.topGymThemeValue = (name, fallback = '') => {
        const value = window.getComputedStyle(root).getPropertyValue(name).trim();
        return value || fallback;
    };

    window.TopGymTheme = Object.freeze({
        get: () => root.dataset.theme || preferredTheme(),
        set: (theme) => setTheme(theme),
        toggle: () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark')
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup, { once: true });
    } else {
        setup();
    }
}());
