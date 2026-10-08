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
            const navbarIcon = button.querySelector('[data-theme-toggle-icon], .theme-toggle-icon-dark, .theme-toggle-icon-light');
            const labelText = nextTheme === 'dark' ? 'الوضع الداكن' : 'الوضع الفاتح';
            const titleText = nextTheme === 'dark' ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح';
            button.setAttribute('aria-pressed', String(theme === 'dark'));
            button.setAttribute('aria-label', titleText);
            button.setAttribute('title', titleText);
            if (label) label.textContent = labelText;

            if (button.id === 'themeToggleButton' && navbarIcon) {
                navbarIcon.setAttribute('class', 'ui-icon theme-toggle-icon');
                navbarIcon.dataset.themeToggleIcon = '';
                navbarIcon.dataset.themeState = theme;
                navbarIcon.innerHTML = theme === 'dark'
                    ? '<path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"/>'
                    : '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l-1.4-1.4M17.7 6.3l-1.4-1.4"/>';
                button.querySelectorAll('.theme-toggle-icon-dark, .theme-toggle-icon-light').forEach((duplicate) => {
                    if (duplicate !== navbarIcon) duplicate.remove();
                });
            }
        });
    }

    function updateMetaThemeColor(theme) {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            const appBackground = getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim();
            if (appBackground) meta.setAttribute('content', appBackground);
        }
    }

    function placeLoginThemeControl() {
        const control = document.querySelector('#authLoginCard > .auth-theme-toggle');
        const panel = document.querySelector('#authLoginCard .auth-form-panel');
        if (control && panel && control.parentElement !== panel) panel.prepend(control);
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
        placeLoginThemeControl();
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
