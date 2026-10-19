(() => {
    if (window.__topGymPerformanceLoaderLoaded) return;
    window.__topGymPerformanceLoaderLoaded = true;

    const state = {
        activeTasks: 0,
        suppressedRequests: new Map(),
        authTaskRelease: null,
        hideTimer: 0,
        showTimer: 0,
        root: null,
        label: null
    };

    function brandName() {
        return String(window.topGymBranding?.get?.().identity?.brandName || 'Logic Fit').trim() || 'Logic Fit';
    }

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

    function requestKey(url) {
        try {
            const parsed = new URL(url, window.location?.href || 'http://localhost');
            return `${parsed.pathname}${parsed.search}`;
        }
        catch { return String(url).split('?')[0]; }
    }

    function reserveSilentRequests(urls = []) {
        const keys = urls.map(requestKey);
        keys.forEach((key) => state.suppressedRequests.set(key, (state.suppressedRequests.get(key) || 0) + 1));
        return () => keys.forEach((key) => {
            const count = state.suppressedRequests.get(key) || 0;
            if (count <= 1) state.suppressedRequests.delete(key);
            else state.suppressedRequests.set(key, count - 1);
        });
    }

    function consumeSilentRequest(url) {
        const key = requestKey(url);
        const count = state.suppressedRequests.get(key) || 0;
        if (!count) return false;
        if (count <= 1) state.suppressedRequests.delete(key);
        else state.suppressedRequests.set(key, count - 1);
        return true;
    }

    function annotateLoadingHosts(scope = document) {
        const candidates = [];
        if (scope?.nodeType === 1 && scope.matches?.('div.loading, div.loading-state, div.page-loading')) candidates.push(scope);
        scope?.querySelectorAll?.('div.loading, div.loading-state, div.page-loading').forEach((element) => candidates.push(element));
        candidates.forEach((element) => {
            if (element.dataset.loadingAnnotated === 'true') return;
            element.dataset.loadingAnnotated = 'true';
            element.setAttribute('role', 'status');
            element.setAttribute('aria-live', 'polite');
            element.setAttribute('aria-busy', 'true');
            const label = element.textContent.trim();
            if (label) element.setAttribute('aria-label', label);
        });
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
        if (options?.silent) {
            const releaseSilentRequests = reserveSilentRequests(options.silentRequests);
            try {
                return await task();
            } finally {
                releaseSilentRequests();
            }
        }
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
            const release = String(url).includes('/api/') && !consumeSilentRequest(String(url)) ? startTask(requestLabel(String(url))) : null;
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
            state.authTaskRelease = startTask(`جاري استعادة جلسة ${brandName()}…`);
        } else if (!pending && state.authTaskRelease) {
            state.authTaskRelease();
            state.authTaskRelease = null;
        }
    }

    if (document.body) {
        annotateLoadingHosts();
        new MutationObserver((records) => {
            records.forEach((record) => {
                if (record.type === 'attributes') {
                    if (!record.target.hidden) annotateLoadingHosts(record.target);
                    return;
                }
                record.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) annotateLoadingHosts(node);
                });
            });
        }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
        new MutationObserver(syncAuthPendingState).observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
        syncAuthPendingState();
    }

    window.topGymPerformance = { startTask, withLoader, isBusy: () => state.activeTasks > 0 };
})();
