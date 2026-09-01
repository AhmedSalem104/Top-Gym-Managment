(() => {
    if (window.__topGymFeatureLoaderLoaded) return;
    window.__topGymFeatureLoaderLoaded = true;

    const scriptPromises = new Map();
    const featurePromises = new Map();

    const features = {
        dashboard: {
            dependencies: [],
            styles: [],
            scripts: []
        },
        'dashboard-enhancements': {
            dependencies: ['finance'],
            styles: [],
            scripts: [
                '/js/day-passes.js?v=8',
                '/js/alerts-enhancements.js?v=10'
            ]
        },
        finance: {
            styles: [],
            scripts: ['/js/pages/finance/monthly-finance.js?v=20']
        },
        'member-details': {
            styles: [],
            scripts: [
                '/js/member-details-ui.js?v=4',
                '/js/member-portal-admin.js?v=4',
                '/js/member-coaching-summary.js?v=2'
            ]
        },
        members: {
            dependencies: [],
            styles: [],
            scripts: [
                '/js/design-enhancements.js?v=4',
                '/js/pages/members/action-menu.js?v=7',
                '/js/pages/attendance/attendance.js?v=10'
            ]
        },
        coaching: {
            styles: [],
            scripts: [
                '/js/exercise-assets.js?v=5',
                '/js/muscle-assets.js?v=3',
                '/js/pages/coaching/coaching.js?v=19'
            ]
        },
        print: {
            styles: [],
            scripts: ['/js/exercise-assets.js?v=5', '/js/integrations/print-enhancements.js?v=13']
        },
        expenses: {
            dependencies: ['finance'],
            styles: [],
            scripts: []
        },
        reports: {
            styles: [],
            scripts: ['/js/pages/reports/reports.js?v=10', '/js/day-pass-reports.js?v=2']
        },
        feedback: {
            styles: [],
            scripts: ['/js/pages/management/member-feedback.js?v=1']
        },
        management: {
            styles: [],
            scripts: []
        },
        branding: {
            dependencies: [],
            styles: [],
            scripts: ['/js/pages/branding/branding.js?v=2']
        },
        'member-payment-methods': {
            dependencies: [],
            styles: [],
            scripts: ['/js/pages/management/member-payment-methods.js?v=1']
        },
        'saas-billing': {
            dependencies: [],
            styles: [],
            scripts: ['/js/pages/saas/saas.js?v=1']
        },
        'backup-history': {
            dependencies: [],
            styles: [],
            scripts: ['/js/pages/management/backup.js?v=11']
        },
        'member-subscription-requests': {
            dependencies: [],
            styles: [],
            scripts: ['/js/pages/management/member-subscription-requests.js?v=4']
        },
        'portal-analytics': {
            dependencies: [],
            styles: [],
            scripts: ['/js/pages/management/portal-analytics.js?v=1']
        },
        permissions: {
            styles: [],
            scripts: ['/js/pages/management/permissions.js?v=4', '/js/pages/management/auth-users.js?v=3']
        },
        attendance: {
            styles: [],
            scripts: ['/js/pages/attendance/attendance.js?v=10']
        },
        library: {
            styles: [],
            scripts: ['/js/exercise-assets.js?v=5', '/js/muscle-assets.js?v=3', '/js/pages/library/library.js?v=13']
        },
        trainees: {
            dependencies: ['coaching'],
            styles: [],
            scripts: []
        },
        intelligence: {
            styles: [],
            scripts: ['/js/pages/intelligence/intelligence.js?v=3']
        },
        store: {
            styles: [],
            scripts: ['/js/pages/store/store.js?v=1']
        },
        'smart-assistant': {
            styles: [],
            scripts: ['/js/smart-assistant.js?v=5']
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
            const releaseProgress = window.topGymPerformance?.startTask?.('جاري تجهيز مكونات الشاشة…');
            const script = document.createElement('script');
            script.src = source;
            script.async = false;
            script.dataset.topGymAsset = key;
            script.onload = () => {
                releaseProgress?.();
                resolve(script);
            };
            script.onerror = () => {
                releaseProgress?.();
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
        const script = await loadScript(source, `external-${name}`);
        if (name === 'sweetalert') window.topGymPatchSweetAlertDialogs?.();
        return script;
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
            if (!dashboardIsRequested() || !window.topGymAuth?.canAccessTab?.('dashboard') || (!window.topGymAuth?.isOwner?.() && !window.topGymAuth?.hasPermission?.('finance.read'))) {
                window.__topGymDashboardAnalyticsScheduled = false;
                return;
            }
            loadScript('/js/pages/dashboard/analytics.js?v=8', 'dashboard-analytics')
                .catch((error) => console.warn('[TOP GYM] Dashboard analytics failed to load.', error));
        };
        const delay = immediate ? 250 : 1100;
        window.setTimeout(() => {
            if ('requestIdleCallback' in window) window.requestIdleCallback(() => void start(), { timeout: 1200 });
            else void start();
        }, delay);
    }

    function scheduleDashboardEnhancements(immediate = false) {
        if (window.__topGymDashboardEnhancementsScheduled || !dashboardIsRequested()) return;
        window.__topGymDashboardEnhancementsScheduled = true;
        const start = async () => {
            if (window.topGymAuthReady) await window.topGymAuthReady.catch(() => null);
            if (!dashboardIsRequested() || !window.topGymAuth?.getUser?.() || !window.topGymAuth?.canAccessTab?.('dashboard')) {
                window.__topGymDashboardEnhancementsScheduled = false;
                return;
            }
            ensureTab('dashboard-enhancements').catch((error) => {
                window.__topGymDashboardEnhancementsScheduled = false;
                console.warn('[TOP GYM] Dashboard enhancements failed to load.', error);
            });
        };
        const delay = immediate ? 180 : 900;
        window.setTimeout(() => {
            if ('requestIdleCallback' in window) window.requestIdleCallback(() => void start(), { timeout: 1100 });
            else void start();
        }, delay);
    }

    function bindLazyDashboardActions() {
        document.addEventListener('click', (event) => {
            const button = event.target.closest('#dashboardDayPassAdd, #dashboardDayPassManage');
            if (!button || window.__topGymDayPassesLoaded || button.dataset.topGymFeatureLoading === 'true') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            button.dataset.topGymFeatureLoading = 'true';
            button.disabled = true;
            ensureTab('dashboard-enhancements').then(() => {
                button.dataset.topGymFeatureReady = 'dashboard-enhancements';
                if (button.isConnected) {
                    button.disabled = false;
                    button.click();
                }
            }).catch((error) => {
                console.warn('[TOP GYM] Day-pass feature failed to load.', error);
                window.showToast?.(error.message || 'تعذر تحميل الحصص اليومية.', true, 'error');
            }).finally(() => {
                delete button.dataset.topGymFeatureLoading;
                if (button.isConnected && button.dataset.topGymFeatureReady !== 'dashboard-enhancements') button.disabled = false;
            });
        }, true);
    }

    function bindLazyMemberDetails() {
        const requestedDetails = new WeakSet();
        window.addEventListener('topgym:member-details-opened', (event) => {
            const detail = event.detail;
            if (!detail || detail.__topGymMemberDetailsReplay || window.__topGymMemberDetailsUiLoaded || requestedDetails.has(detail)) return;
            requestedDetails.add(detail);
            ensureTab('member-details').then(() => {
                window.dispatchEvent(new CustomEvent('topgym:member-details-opened', {
                    detail: { ...detail, __topGymMemberDetailsReplay: true }
                }));
            }).catch((error) => console.warn('[TOP GYM] Member details feature failed to load.', error));
        });
    }

    function bindLazySmartAssistant() {
        const launcher = document.getElementById('smartAssistantLauncher');
        if (!launcher) return;

        const syncVisibility = () => {
            if (window.__topGymSmartAssistantLoaded) return;
            const authenticated = Boolean(
                document.body.dataset.topGymAuthenticated === 'true'
                && window.topGymAuth?.getUser?.()
            );
            launcher.hidden = !authenticated;
        };

        const loadAssistant = () => ensureTab('smart-assistant').catch((error) => {
            console.warn('[TOP GYM] Smart assistant failed to load.', error);
            window.showToast?.(error.message || 'تعذر تحميل المساعد الذكي.', true, 'error');
            throw error;
        });

        // The launcher stays available after authentication, but the 38KB
        // assistant bundle is fetched only when the user actually opens it.
        launcher.addEventListener('click', (event) => {
            if (window.__topGymSmartAssistantLoaded || launcher.dataset.topGymFeatureLoading === 'true') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            launcher.dataset.topGymFeatureLoading = 'true';
            launcher.disabled = true;
            launcher.setAttribute('aria-busy', 'true');
            loadAssistant().then(() => {
                if (launcher.isConnected) {
                    launcher.disabled = false;
                    launcher.removeAttribute('aria-busy');
                    launcher.click();
                }
            }).catch(() => {
                launcher.disabled = false;
                launcher.removeAttribute('aria-busy');
            }).finally(() => {
                delete launcher.dataset.topGymFeatureLoading;
            });
        }, true);

        const authReady = window.topGymAuthReady;
        if (authReady) authReady.then(syncVisibility).catch(syncVisibility);
        else syncVisibility();
        new MutationObserver(syncVisibility).observe(document.body, {
            attributes: true,
            attributeFilter: ['class', 'data-top-gym-authenticated']
        });
    }

    function bindLazyWhatsapp() {
        const source = '/js/whatsapp-enhancements.js?v=13';
        const key = 'whatsapp-enhancements';
        const ensureWhatsapp = () => loadScript(source, key);
        const actionSelector = '[data-alert-whatsapp], [data-report-whatsapp], [data-day-pass-whatsapp], [data-day-pass-report-whatsapp], [data-portal-code-action="whatsapp"]';

        document.addEventListener('click', (event) => {
            const button = event.target.closest?.(actionSelector);
            if (!button || window.__topGymWhatsappEnhancementsLoaded || button.dataset.topGymWhatsappLoading === 'true') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            button.dataset.topGymWhatsappLoading = 'true';
            button.disabled = true;
            ensureWhatsapp().then(() => {
                if (button.isConnected) {
                    button.dataset.topGymWhatsappReady = 'true';
                    button.disabled = false;
                    button.click();
                }
            }).catch((error) => {
                console.warn('[TOP GYM] WhatsApp feature failed to load.', error);
                window.showToast?.(error.message || 'تعذر تحميل أداة واتساب.', true, 'error');
            }).finally(() => {
                delete button.dataset.topGymWhatsappLoading;
                delete button.dataset.topGymWhatsappReady;
                if (button.isConnected) button.disabled = false;
            });
        }, true);

        document.addEventListener('submit', (event) => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement) || window.__topGymWhatsappEnhancementsLoaded) return;
            const memberSubmit = form.id === 'memberForm' && document.getElementById('sendWhatsAppAfterSave')?.checked;
            const dayPassSubmit = form.id === 'dayPassForm' && document.getElementById('dayPassSendWhatsApp')?.checked;
            if ((!memberSubmit && !dayPassSubmit) || form.dataset.topGymWhatsappLoading === 'true') return;
            if (form.dataset.topGymWhatsappReady === 'true') {
                delete form.dataset.topGymWhatsappReady;
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            form.dataset.topGymWhatsappLoading = 'true';
            const submitter = event.submitter;
            ensureWhatsapp().then(() => {
                if (!form.isConnected) return;
                form.dataset.topGymWhatsappReady = 'true';
                if (typeof form.requestSubmit === 'function') form.requestSubmit(submitter || undefined);
                else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }).catch((error) => {
                console.warn('[TOP GYM] WhatsApp feature failed to load.', error);
                window.showToast?.(error.message || 'تعذر تحميل أداة واتساب.', true, 'error');
            }).finally(() => {
                delete form.dataset.topGymWhatsappLoading;
            });
        }, true);
    }

    function bindLazyPrintActions() {
        const ensurePrint = () => ensureTab('print').catch((error) => {
            console.warn('[TOP GYM] Print feature failed to load.', error);
            throw error;
        });
        document.addEventListener('click', (event) => {
            const receiptButton = event.target.closest('[data-payment-receipt]');
            const memberPrintButton = event.target.closest('button[data-action="print"]');
            const pricingPrintButton = event.target.closest('#dashboardPrintPricingButton, #dashboardPrintPricingPreviewButton');
            const pricingPreviewButton = pricingPrintButton?.id === 'dashboardPrintPricingPreviewButton';
            const button = receiptButton || memberPrintButton || pricingPrintButton;
            const printReady = receiptButton
                ? window.topGymPrint?.printPaymentReceipt
                : memberPrintButton
                    ? window.topGymPrint?.printMember
                    : pricingPreviewButton
                        ? window.topGymPrint?.printPricing
                        : window.topGymPrint?.downloadPricingPdf;
            if (!button || button.dataset.topGymPrintLoading === 'true') return;
            if (pricingPrintButton && printReady) {
                event.preventDefault();
                event.stopImmediatePropagation();
                button.dataset.topGymPrintLoading = 'true';
                button.disabled = true;
                const label = button.querySelector('span:last-child');
                const originalLabel = label?.textContent || '';
                if (label) label.textContent = pricingPreviewButton ? 'جاري تجهيز الطباعة…' : 'جاري تجهيز ملف PDF…';
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
                ? (pricingPreviewButton ? window.topGymPrint?.printPricing?.() : window.topGymPrint?.downloadPricingPdf?.())
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

        // The coaching module is intentionally not loaded when a member details
        // dialog opens. The dialog has a lightweight coaching summary now, and
        // the full module is fetched only when the user starts a coaching action.
        // This keeps the common "view member" path small and responsive.
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
        if (event.detail?.name === 'dashboard') {
            scheduleDashboardEnhancements();
            scheduleDashboardAnalytics(true);
        }
    });
    bindLazyPrintActions();
    bindLazyCoachingActions();
    bindLazyDashboardActions();
    bindLazyMemberDetails();
    bindLazyWhatsapp();
    scheduleOptionalEnhancements();
    bindLazySmartAssistant();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            scheduleDashboardEnhancements();
            scheduleDashboardAnalytics();
        }, { once: true });
    } else {
        scheduleDashboardEnhancements();
        scheduleDashboardAnalytics();
    }
})();
