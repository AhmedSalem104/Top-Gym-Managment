(() => {
    if (window.__topGymAppShellBootstrapLoaded) return;
    window.__topGymAppShellBootstrapLoaded = true;

    const source = '/js/app.js?v=membership-type-delete-v1';
    let loadPromise = null;
    let appUsableResolve;
    let appUsableReject;

    // Script download and route usability are different milestones. The
    // welcome surface waits for the latter instead of using a fixed timer.
    if (!window.topGymAppUsable) {
        window.topGymAppUsable = new Promise((resolve, reject) => {
            appUsableResolve = resolve;
            appUsableReject = reject;
        });
        window.topGymMarkAppUsable = (detail = {}) => {
            appUsableResolve?.(detail);
            window.dispatchEvent(new CustomEvent('topgym:app-usable', { detail }));
        };
        window.topGymMarkAppBootstrapFailed = (error) => {
            appUsableReject?.(error);
            window.dispatchEvent(new CustomEvent('topgym:app-bootstrap-failed', { detail: { error } }));
        };
    }

    function loadApplication() {
        if (loadPromise) return loadPromise;
        loadPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-top-gym-app-entry]');
            if (existing) {
                existing.addEventListener('load', () => resolve(existing), { once: true });
                existing.addEventListener('error', () => reject(new Error('تعذر تحميل مساحة التطبيق.')), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = source;
            script.async = true;
            script.dataset.topGymAppEntry = 'true';
            script.onload = () => resolve(script);
            script.onerror = () => {
                script.remove();
                reject(new Error('تعذر تحميل مساحة التطبيق.'));
            };
            document.head.appendChild(script);
        });
        window.topGymAppReady = loadPromise;
        return loadPromise;
    }

    function loadPostAppSupport() {
        const loadFeature = window.topGymLoadFeature;
        if (!loadFeature) return Promise.resolve(null);
        return loadFeature('/js/button-loading.js?v=5', 'button-loading');
    }

    // Route modules share the existing app controller's lexical state. They
    // use this hook to preserve the original dependency order when a direct
    // route starts loading before the post-paint bootstrap callback runs.
    window.topGymLoadApp = loadApplication;

    function scheduleApplication(user) {
        if (!user || user.mustChangePassword) return;
        const start = () => {
            if (document.visibilityState === 'hidden') {
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') void loadApplication();
                }, { once: true });
                return;
            }
            void loadApplication().then(loadPostAppSupport).catch((error) => {
                window.topGymMarkAppBootstrapFailed?.(error);
                console.error('[TOP GYM] Application shell failed to load.', error);
            });
        };

        // One frame lets the authenticated shell paint first. A second rAF
        // added a frame without a real dependency and delayed app bootstrap.
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(start);
        } else start();
    }

    const authReady = window.topGymAuthReady;
    if (authReady) authReady.then(scheduleApplication).catch(() => {});
})();
