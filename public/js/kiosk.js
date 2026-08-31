(() => {
    if (window.__topGymKioskLoaded) return;
    window.__topGymKioskLoaded = true;

    const STORAGE_KEY = 'topgym.kiosk.enabled';
    const CONTROL_SELECTOR = '[data-kiosk-toggle]';
    let active = false;
    let exitControl = null;

    const labels = {
        enable: '\u062a\u0641\u0639\u064a\u0644 \u0648\u0636\u0639 Kiosk',
        disable: '\u0625\u0646\u0647\u0627\u0621 \u0648\u0636\u0639 Kiosk',
        exit: '\u0625\u0646\u0647\u0627\u0621 \u0648\u0636\u0639 Kiosk'
    };

    function readPreference() {
        try {
            return window.localStorage.getItem(STORAGE_KEY) === 'true';
        } catch (_) {
            return false;
        }
    }

    function persistPreference(value) {
        try {
            window.localStorage.setItem(STORAGE_KEY, String(value));
        } catch (_) {
            // Kiosk remains usable when browser storage is unavailable.
        }
    }

    function getShell() {
        return document.querySelector('.app-shell');
    }

    function ensureExitControl() {
        const shell = getShell();
        if (!shell) return null;
        if (exitControl && shell.contains(exitControl)) return exitControl;

        exitControl = document.createElement('button');
        exitControl.type = 'button';
        exitControl.className = 'kiosk-exit-control';
        exitControl.dataset.kioskExit = '';
        exitControl.setAttribute('aria-label', labels.exit);
        exitControl.setAttribute('title', labels.exit);
        exitControl.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg><span>\u0625\u0646\u0647\u0627\u0621 Kiosk</span>';
        exitControl.addEventListener('click', () => set(false));
        shell.appendChild(exitControl);
        return exitControl;
    }

    function syncControls() {
        const label = active ? labels.disable : labels.enable;
        document.querySelectorAll(CONTROL_SELECTOR).forEach((button) => {
            button.setAttribute('aria-pressed', String(active));
            button.setAttribute('aria-label', label);
            button.setAttribute('title', label);
            button.dataset.kioskState = active ? 'active' : 'idle';

            const labelElement = button.querySelector('[data-kiosk-toggle-label]');
            if (labelElement) {
                labelElement.textContent = label;
            } else if (!button.querySelector('svg')) {
                button.textContent = label;
            }
        });

        if (exitControl) {
            exitControl.hidden = !active;
            exitControl.setAttribute('aria-hidden', String(!active));
        }
    }

    function dispatchChange() {
        document.dispatchEvent(new CustomEvent('topgym:kioskchange', {
            detail: { active }
        }));
    }

    function requestBrowserFullscreen() {
        const request = document.documentElement?.requestFullscreen;
        if (typeof request !== 'function') return;
        try {
            const pending = request.call(document.documentElement);
            pending?.catch?.(() => {});
        } catch (_) {
            // Browser fullscreen is an enhancement; app Kiosk still works.
        }
    }

    function exitBrowserFullscreen() {
        if (!document.fullscreenElement || typeof document.exitFullscreen !== 'function') return;
        try {
            const pending = document.exitFullscreen();
            pending?.catch?.(() => {});
        } catch (_) {
            // The layout mode is already disabled even if browser fullscreen refuses.
        }
    }

    function apply(next, options = {}) {
        active = Boolean(next);
        const shell = getShell();
        shell?.classList.toggle('is-kiosk-mode', active);
        document.body?.classList.toggle('is-kiosk-mode', active);
        document.documentElement?.toggleAttribute('data-kiosk-mode', active);
        ensureExitControl();
        syncControls();

        if (options.persist !== false) persistPreference(active);
        dispatchChange();

        if (active && options.requestFullscreen) requestBrowserFullscreen();
        if (!active && options.exitFullscreen !== false) exitBrowserFullscreen();
    }

    function set(next) {
        apply(next, { requestFullscreen: Boolean(next) });
        return active;
    }

    function toggle() {
        return set(!active);
    }

    function bindControls() {
        document.querySelectorAll(CONTROL_SELECTOR).forEach((button) => {
            if (button.dataset.kioskBound === 'true') return;
            button.dataset.kioskBound = 'true';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                toggle();
            });
        });
    }

    function initialize() {
        bindControls();
        ensureExitControl();
        apply(readPreference(), {
            persist: false,
            requestFullscreen: false,
            exitFullscreen: false
        });

        document.addEventListener('fullscreenchange', () => {
            if (active && !document.fullscreenElement) {
                apply(false, { requestFullscreen: false, exitFullscreen: false });
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !active || event.defaultPrevented) return;
            if (document.querySelector('[role="dialog"]:not([hidden]), dialog[open]')) return;
            set(false);
        });
    }

    window.TopGymKiosk = Object.freeze({
        isActive: () => active,
        set,
        toggle
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
