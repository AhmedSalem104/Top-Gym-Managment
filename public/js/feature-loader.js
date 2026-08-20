(() => {
    if (window.__topGymFeatureLoaderLoaded) return;
    window.__topGymFeatureLoaderLoaded = true;

    const scriptPromises = new Map();
    const featurePromises = new Map();

    const features = {
        dashboard: {
            dependencies: ['finance'],
            styles: [],
            scripts: []
        },
        finance: {
            styles: [],
            scripts: ['/js/pages/finance/monthly-finance.js?v=16']
        },
        members: {
            styles: [],
            scripts: [
                '/js/pages/members/action-menu.js?v=6',
                '/js/pages/attendance/attendance.js?v=8'
            ]
        },
        coaching: {
            styles: [],
            scripts: [
                '/js/exercise-assets.js?v=5',
                '/js/muscle-assets.js?v=3',
                '/js/pages/coaching/coaching.js?v=14'
            ]
        },
        print: {
            styles: [],
            scripts: ['/js/exercise-assets.js?v=5', '/js/integrations/print-enhancements.js?v=11']
        },
        expenses: {
            dependencies: ['finance'],
            styles: [],
            scripts: []
        },
        reports: {
            styles: [],
            scripts: ['/js/pages/reports/reports.js?v=8']
        },
        management: {
            styles: [],
            scripts: ['/js/pages/management/backup.js?v=9', '/js/pages/management/auth-users.js?v=1']
        },
        attendance: {
            styles: [],
            scripts: ['/js/pages/attendance/attendance.js?v=8']
        },
        library: {
            styles: [],
            scripts: ['/js/exercise-assets.js?v=5', '/js/muscle-assets.js?v=3', '/js/pages/library/library.js?v=12']
        },
        trainees: {
            dependencies: ['coaching'],
            styles: [],
            scripts: []
        }
    };

    const externalAssets = {
        qrcode: 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js',
        'html5-qrcode': 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
        sweetalert: 'https://cdn.jsdelivr.net/npm/sweetalert2@11'
    };

    function loadScript(source, key = source) {
        if (scriptPromises.has(key)) return scriptPromises.get(key);
        const existing = [...document.querySelectorAll('script[data-top-gym-asset]')]
            .find((script) => script.dataset.topGymAsset === key);
        if (existing) {
            const promise = Promise.resolve(existing);
            scriptPromises.set(key, promise);
            return promise;
        }

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = source;
            script.async = false;
            script.dataset.topGymAsset = key;
            script.onload = () => resolve(script);
            script.onerror = () => {
                script.remove();
                reject(new Error(`تعذر تحميل مكوّن ${key}.`));
            };
            document.head.appendChild(script);
        });
        scriptPromises.set(key, promise);
        return promise;
    }

    async function ensureTab(name) {
        const feature = features[name];
        if (!feature) return;
        if (featurePromises.has(name)) return featurePromises.get(name);

        const promise = (async () => {
            for (const dependency of feature.dependencies || []) await ensureTab(dependency);
            // Feature scripts are independent modules. Start them together so
            // navigation pays one network round-trip instead of one per file.
            await Promise.all((feature.scripts || []).map((source) => loadScript(source)));
        })();
        featurePromises.set(name, promise);
        try {
            await promise;
        } catch (error) {
            featurePromises.delete(name);
            throw error;
        }
    }

    async function loadExternalAsset(name) {
        const source = externalAssets[name];
        if (!source) throw new Error(`مكتبة ${name} غير معروفة.`);
        return loadScript(source, `external-${name}`);
    }

    function dashboardIsRequested() {
        return (window.location.hash.slice(1) || 'dashboard') === 'dashboard';
    }

    function scheduleDashboardAnalytics(immediate = false) {
        if (window.__topGymDashboardAnalyticsScheduled) return;
        if (!dashboardIsRequested()) return;
        window.__topGymDashboardAnalyticsScheduled = true;
        const start = async () => {
            if (window.topGymAuthReady) await window.topGymAuthReady.catch(() => null);
            if (!dashboardIsRequested() || !window.topGymAuth?.canAccessTab?.('dashboard')) {
                window.__topGymDashboardAnalyticsScheduled = false;
                return;
            }
            loadScript('/js/pages/dashboard/analytics.js?v=6', 'dashboard-analytics')
                .catch((error) => console.warn('[TOP GYM] Dashboard analytics failed to load.', error));
        };
        if (immediate) void start();
        else if ('requestIdleCallback' in window) window.requestIdleCallback(() => void start(), { timeout: 1800 });
        else window.setTimeout(() => void start(), 900);
    }

    function bindLazyBackupAction() {
        document.addEventListener('click', (event) => {
            const button = event.target.closest('#backupButton');
            if (!button || button.dataset.topGymFeatureReady === 'management' || button.dataset.topGymFeatureLoading === 'true') return;
            if (!window.topGymAuth?.isOwner?.()) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            button.dataset.topGymFeatureLoading = 'true';
            button.disabled = true;
            ensureTab('management').then(() => {
                button.dataset.topGymFeatureReady = 'management';
                button.click();
            }).catch((error) => {
                console.warn('[TOP GYM] Backup feature failed to load.', error);
                window.showToast?.(error.message, true, 'error');
            }).finally(() => {
                delete button.dataset.topGymFeatureLoading;
                button.disabled = false;
            });
        }, true);
    }

    function bindLazyPrintActions() {
        const ensurePrint = () => ensureTab('print').catch((error) => {
            console.warn('[TOP GYM] Print feature failed to load.', error);
            throw error;
        });
        window.addEventListener('topgym:member-details-opened', ensurePrint);
        document.addEventListener('click', (event) => {
            const receiptButton = event.target.closest('[data-payment-receipt]');
            const memberPrintButton = event.target.closest('button[data-action="print"]');
            const pricingPrintButton = event.target.closest('#dashboardPrintPricingButton');
            const button = receiptButton || memberPrintButton || pricingPrintButton;
            const printReady = receiptButton
                ? window.topGymPrint?.printPaymentReceipt
                : memberPrintButton
                    ? window.topGymPrint?.printMember
                    : window.topGymPrint?.downloadPricingPdf;
            if (!button || button.dataset.topGymPrintLoading === 'true') return;
            if (pricingPrintButton && printReady) {
                event.preventDefault();
                event.stopImmediatePropagation();
                button.dataset.topGymPrintLoading = 'true';
                button.disabled = true;
                const label = button.querySelector('span:last-child');
                const originalLabel = label?.textContent || '';
                if (label) label.textContent = 'جاري تجهيز ملف PDF…';
                Promise.resolve()
                    .then(() => printReady())
                    .catch((error) => {
                        console.warn('[TOP GYM] Pricing PDF failed.', error);
                        window.showToast?.(error.message || 'تعذر تنزيل ملف الاشتراكات والباقات.', true, 'error');
                    })
                    .finally(() => {
                        delete button.dataset.topGymPrintLoading;
                        button.disabled = false;
                        if (label) label.textContent = originalLabel;
                    });
                return;
            }
            if (printReady) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            button.dataset.topGymPrintLoading = 'true';
            ensurePrint().then(() => pricingPrintButton
                ? window.topGymPrint?.downloadPricingPdf?.()
                : button.click())
                .catch((error) => {
                    console.warn('[TOP GYM] Receipt print feature failed to load.', error);
                    window.showToast?.(error.message || 'تعذر تحميل أداة الطباعة.', true, 'error');
                })
                .finally(() => delete button.dataset.topGymPrintLoading);
        }, true);
    }

    function bindLazyCoachingActions() {
        const ensureCoaching = () => ensureTab('coaching').catch((error) => {
            console.warn('[TOP GYM] Coaching feature failed to load.', error);
            window.showToast?.(error.message || 'تعذر تحميل أدوات التدريب والتغذية.', true, 'error');
            throw error;
        });

        // Member details are opened by the core member module. Replay the event
        // after the optional coaching module registers its listener so the
        // existing details flow remains unchanged.
        window.addEventListener('topgym:member-details-opened', (event) => {
            if (event.detail?.__topGymCoachingReplay) return;
            const detail = event.detail || {};
            ensureCoaching().then(() => {
                window.dispatchEvent(new CustomEvent('topgym:member-details-opened', {
                    detail: { ...detail, __topGymCoachingReplay: true }
                }));
            }).catch(() => {});
        });

        // The table still renders the same training/diet actions, but the
        // 221KB coaching module is fetched only when one of them is used.
        document.addEventListener('click', (event) => {
            const button = event.target.closest('[data-member-coaching-action]');
            if (!button || window.__topGymCoachingLoaded || button.dataset.topGymFeatureLoading === 'true') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            button.dataset.topGymFeatureLoading = 'true';
            button.disabled = true;
            ensureCoaching().then(() => {
                // A disabled button does not dispatch a synthetic click in the
                // browser. Re-enable it before replaying the user's action.
                if (button.isConnected) {
                    button.disabled = false;
                    button.click();
                }
            }).catch(() => {}).finally(() => {
                delete button.dataset.topGymFeatureLoading;
                if (button.isConnected) button.disabled = false;
            });
        }, true);
    }

    function scheduleOptionalEnhancements() {
        const load = () => loadExternalAsset('sweetalert').catch(() => null);
        // Keep optional third-party UI out of the first interaction window.
        // Native dialogs/toasts remain available until this enhancement loads.
        window.setTimeout(() => {
            if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 3000 });
            else load();
        }, 4500);
    }

    window.topGymEnsureTab = ensureTab;
    window.topGymLoadExternalAsset = loadExternalAsset;
    window.topGymLoadFeature = loadScript;
    window.addEventListener('topgym:tab-changed', (event) => {
        if (event.detail?.name === 'dashboard') scheduleDashboardAnalytics(true);
    });
    bindLazyBackupAction();
    bindLazyPrintActions();
    bindLazyCoachingActions();
    scheduleOptionalEnhancements();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            scheduleDashboardAnalytics();
        }, { once: true });
    } else {
        scheduleDashboardAnalytics();
    }
})();
