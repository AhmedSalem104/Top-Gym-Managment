(() => {
    if (window.__topGymFeatureLoaderLoaded) return;
    window.__topGymFeatureLoaderLoaded = true;

    const scriptPromises = new Map();
    const stylePromises = new Map();
    const featurePromises = new Map();

    const features = {
        members: {
            styles: [
                '/css/attendance.css?v=6',
                '/css/coaching.css?v=9'
            ],
            scripts: [
                '/js/action-menu.js?v=4',
                '/js/print-enhancements.js?v=9',
                '/js/attendance.js?v=8',
                '/js/coaching.js?v=12'
            ]
        },
        print: {
            styles: [],
            scripts: ['/js/print-enhancements.js?v=9']
        },
        expenses: {
            styles: ['/css/operations.css?v=6'],
            scripts: []
        },
        reports: {
            styles: ['/css/operations.css?v=6'],
            scripts: ['/js/reports.js?v=7']
        },
        management: {
            styles: ['/css/operations.css?v=6'],
            scripts: ['/js/backup-enhancements.js?v=8']
        },
        attendance: {
            styles: ['/css/attendance.css?v=6'],
            scripts: ['/js/attendance.js?v=8']
        },
        library: {
            styles: ['/css/library.css?v=8'],
            scripts: ['/js/library.js?v=8']
        },
        trainees: {
            styles: ['/css/coaching.css?v=9'],
            scripts: ['/js/coaching.js?v=12']
        }
    };

    const externalAssets = {
        qrcode: 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js',
        'html5-qrcode': 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
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

    function loadStyle(source) {
        if (stylePromises.has(source)) return stylePromises.get(source);
        const promise = new Promise((resolve, reject) => {
            const existing = [...document.querySelectorAll('link[data-top-gym-style]')]
                .find((link) => link.dataset.topGymStyle === source);
            if (existing) {
                resolve(existing);
                return;
            }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = source;
            link.dataset.topGymStyle = source;
            link.onload = () => resolve(link);
            link.onerror = () => {
                link.remove();
                reject(new Error(`تعذر تحميل تنسيق الشاشة ${source}.`));
            };
            document.head.appendChild(link);
        });
        stylePromises.set(source, promise);
        return promise;
    }

    async function ensureTab(name) {
        const feature = features[name];
        if (!feature) return;
        if (featurePromises.has(name)) return featurePromises.get(name);

        const promise = (async () => {
            await Promise.all((feature.styles || []).map(loadStyle));
            for (const source of feature.scripts || []) await loadScript(source);
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
        const start = () => {
            if (!dashboardIsRequested()) {
                window.__topGymDashboardAnalyticsScheduled = false;
                return;
            }
            loadScript('/js/dashboard-analytics.js?v=5', 'dashboard-analytics')
                .catch((error) => console.warn('[TOP GYM] Dashboard analytics failed to load.', error));
        };
        if (immediate) start();
        else if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 1800 });
        else window.setTimeout(start, 900);
    }

    function bindLazyBackupAction() {
        document.addEventListener('click', (event) => {
            const button = event.target.closest('#backupButton');
            if (!button || button.dataset.topGymFeatureReady === 'management' || button.dataset.topGymFeatureLoading === 'true') return;
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

    window.topGymEnsureTab = ensureTab;
    window.topGymLoadExternalAsset = loadExternalAsset;
    window.topGymLoadFeature = loadScript;
    window.addEventListener('topgym:tab-changed', (event) => {
        if (event.detail?.name === 'dashboard') scheduleDashboardAnalytics(true);
    });
    bindLazyBackupAction();
    bindLazyPrintActions();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            scheduleDashboardAnalytics();
        }, { once: true });
    } else {
        scheduleDashboardAnalytics();
    }
})();
