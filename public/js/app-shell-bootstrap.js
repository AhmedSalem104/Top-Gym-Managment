(() => {
    if (window.__topGymAppShellBootstrapLoaded) return;
    window.__topGymAppShellBootstrapLoaded = true;

    const source = '/js/app.js?v=phase2-shell';
    let loadPromise = null;

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
                console.error('[TOP GYM] Application shell failed to load.', error);
            });
        };

        // The shell and navigation can paint first. The app controller is
        // still loaded immediately after that paint, so interaction does not
        // wait for an arbitrary timer and direct routes remain deterministic.
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(() => window.requestAnimationFrame(start));
        } else start();
    }

    const authReady = window.topGymAuthReady;
    if (authReady) authReady.then(scheduleApplication).catch(() => {});
})();
