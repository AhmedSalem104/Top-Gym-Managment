(() => {
    if (window.__topGymPerformanceLoaderLoaded) return;
    window.__topGymPerformanceLoaderLoaded = true;

    const state = {
        activeTasks: 0,
        authTaskRelease: null,
        hideTimer: 0,
        showTimer: 0,
        root: null,
        label: null
    };

    function ensureRoot() {
        if (state.root?.isConnected) return;
        const root = document.createElement('div');
        root.className = 'top-progress';
        root.setAttribute('role', 'progressbar');
        root.setAttribute('aria-valuemin', '0');
        root.setAttribute('aria-valuemax', '100');
        root.setAttribute('aria-valuetext', 'جاري تحميل البيانات');
        root.innerHTML = '<span class="top-progress-track"><span class="top-progress-bar"></span></span><span class="top-progress-label" aria-live="polite"></span>';
        (document.body || document.documentElement).appendChild(root);
        state.root = root;
        state.label = root.querySelector('.top-progress-label');
    }

    function setLabel(label) {
        if (!label) return;
        ensureRoot();
        state.root.setAttribute('aria-valuetext', label);
        if (state.label) state.label.textContent = label;
    }

    function startTask(label = '') {
        ensureRoot();
        state.activeTasks += 1;
        setLabel(label);
        window.clearTimeout(state.hideTimer);
        window.clearTimeout(state.showTimer);

        if (state.activeTasks === 1) {
            state.showTimer = window.setTimeout(() => {
                if (state.activeTasks > 0) {
                    state.root.classList.remove('is-completing');
                    state.root.classList.add('is-visible');
                }
            }, 90);
        } else {
            state.root.classList.remove('is-completing');
            state.root.classList.add('is-visible');
        }

        let released = false;
        return () => {
            if (released) return;
            released = true;
            state.activeTasks = Math.max(0, state.activeTasks - 1);
            if (state.activeTasks > 0) return;

            window.clearTimeout(state.showTimer);
            state.root.classList.add('is-visible', 'is-completing');
            state.hideTimer = window.setTimeout(() => {
                if (state.activeTasks === 0) state.root.classList.remove('is-visible', 'is-completing');
            }, 180);
        };
    }

    async function withLoader(task, options = {}) {
        const label = typeof options === 'string' ? options : options.label;
        const release = startTask(label);
        try {
            return await task();
        } finally {
            release();
        }
    }

    function requestLabel(url) {
        if (url.includes('/api/auth/')) return 'جاري التحقق من الجلسة…';
        if (url.includes('/api/dashboard')) return 'جاري تحميل لوحة التحكم…';
        if (url.includes('/api/members')) return 'جاري تحميل بيانات المشتركين…';
        return 'جاري تحميل البيانات…';
    }

    const nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
    if (nativeFetch) {
        window.fetch = (...args) => {
            const input = args[0];
            const url = typeof input === 'string' ? input : input?.url || '';
            const release = String(url).includes('/api/') ? startTask(requestLabel(String(url))) : null;
            try {
                return Promise.resolve(nativeFetch(...args)).finally(() => release?.());
            } catch (error) {
                release?.();
                throw error;
            }
        };
    }

    function syncAuthPendingState() {
        const pending = document.body?.classList.contains('auth-pending');
        if (pending && !state.authTaskRelease) {
            state.authTaskRelease = startTask('جاري استعادة جلسة TOP GYM…');
        } else if (!pending && state.authTaskRelease) {
            state.authTaskRelease();
            state.authTaskRelease = null;
        }
    }

    if (document.body) {
        new MutationObserver(syncAuthPendingState).observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
        syncAuthPendingState();
    }

    window.topGymPerformance = { startTask, withLoader, isBusy: () => state.activeTasks > 0 };
})();
