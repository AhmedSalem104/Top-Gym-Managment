(() => {
    if (window.__topGymFeatureLoaderLoaded) return;
    window.__topGymFeatureLoaderLoaded = true;

    const scriptPromises = new Map();
    const featurePromises = new Map();

    const features = window.topGymFeatureManifest || Object.freeze({});
    const externalAssets = window.topGymExternalAssets || Object.freeze({});

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

    function loadStyle(source, key = source) {
        if (scriptPromises.has(`style:${key}`)) return scriptPromises.get(`style:${key}`);
        const existing = [...document.querySelectorAll('link[data-top-gym-asset]')]
            .find((link) => link.dataset.topGymAsset === key);
        if (existing) {
            const promise = Promise.resolve(existing);
            scriptPromises.set(`style:${key}`, promise);
            return promise;
        }

        const promise = new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = source;
            link.dataset.topGymAsset = key;
            link.onload = () => resolve(link);
            link.onerror = () => {
                link.remove();
                reject(new Error(`تعذر تحميل تنسيق ${key}.`));
            };
            document.head.appendChild(link);
        });
        scriptPromises.set(`style:${key}`, promise);
        return promise;
    }

    async function ensureTab(name) {
        const feature = features[name];
        if (!feature) return;
        if (featurePromises.has(name)) return featurePromises.get(name);

        const promise = (async () => {
            // app.js owns the shared application state used by route modules.
            // Await it before loading any module that reads that state so a
            // deep link cannot create a race between the shell and a feature.
            if (window.topGymLoadApp && window.topGymAuth?.getUser?.()) await window.topGymLoadApp();
            for (const dependency of feature.dependencies || []) await ensureTab(dependency);
            const dialogLoader = window.topGymDialogLoader;
            if (feature.dialogs?.length && !dialogLoader) throw new Error(`Lazy dialog loader is unavailable for ${name}.`);
            // Dialog fragments must be mounted before their feature script is
            // evaluated because those scripts bind to the dialog controls at
            // initialization time. Styles remain parallel with the fragment;
            // scripts start only after both are ready.
            await Promise.all([
                ...(feature.styles || []).map((source) => loadStyle(source)),
                ...(feature.dialogs || []).map(({ source, ids }) => dialogLoader.load(source, ids))
            ]);
            await Promise.all((feature.scripts || []).map((source) => loadScript(source)));
            if (name === 'phone-inputs') {
                await Promise.all([
                    Promise.resolve(window.LogicFitPhoneInputs?.loadCatalog?.()).catch(() => null),
                    window.LogicFitPhoneInputs?.loadFormatter?.()
                ]);
            }
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
        const user = window.topGymAuth?.getUser?.();
        return (window.location.hash.slice(1) || 'dashboard') === 'dashboard'
            && !user?.mustChangePassword
            && String(user?.tenantType || '').trim().toLowerCase() !== 'independent_trainer';
    }

    function isIndependentTrainer() {
        return String(window.topGymAuth?.getUser?.()?.tenantType || '').trim().toLowerCase() === 'independent_trainer';
    }

    function scheduleIdle(callback, timeout = 1500) {
        if ('requestIdleCallback' in window) {
            return window.requestIdleCallback(callback, { timeout });
        }
        return window.requestAnimationFrame(() => window.requestAnimationFrame(callback));
    }

    function scheduleDashboardAnalytics(immediate = false) {
        if (window.__topGymDashboardAnalyticsScheduled) return;
        if (!dashboardIsRequested()) return;
        window.__topGymDashboardAnalyticsScheduled = true;
        const start = async () => {
            if (window.topGymAuthReady) await window.topGymAuthReady.catch(() => null);
            if (isIndependentTrainer() || !dashboardIsRequested() || !window.topGymAuth?.canAccessTab?.('dashboard') || (!window.topGymAuth?.isOwner?.() && !window.topGymAuth?.hasPermission?.('finance.read'))) {
                window.__topGymDashboardAnalyticsScheduled = false;
                return;
            }
            await ensureTab('phone-inputs');
            await loadScript('/js/pages/dashboard/analytics.js?v=8', 'dashboard-analytics')
                .catch((error) => console.warn('[TOP GYM] Dashboard analytics failed to load.', error));
        };
        scheduleIdle(() => void start(), immediate ? 700 : 1600);
    }

    function scheduleDashboardEnhancements(immediate = false) {
        if (window.__topGymDashboardEnhancementsScheduled || !dashboardIsRequested()) return;
        window.__topGymDashboardEnhancementsScheduled = true;
        const start = async () => {
            if (window.topGymAuthReady) await window.topGymAuthReady.catch(() => null);
            if (isIndependentTrainer() || !dashboardIsRequested() || !window.topGymAuth?.getUser?.() || !window.topGymAuth?.canAccessTab?.('dashboard')) {
                window.__topGymDashboardEnhancementsScheduled = false;
                return;
            }
            ensureTab('dashboard-enhancements').catch((error) => {
                window.__topGymDashboardEnhancementsScheduled = false;
                console.warn('[TOP GYM] Dashboard enhancements failed to load.', error);
            });
        };
        scheduleIdle(() => void start(), immediate ? 500 : 1400);
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

    function bindLazyPhoneInput() {
        const actionSelector = '#topAddMemberButton, #addMemberButton, #membersList [data-action="edit"]';
        document.addEventListener('click', (event) => {
            const button = event.target.closest?.(actionSelector);
            if (!button || window.LogicFitPhoneInputs || button.dataset.topGymPhoneLoading === 'true') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            button.dataset.topGymPhoneLoading = 'true';
            button.disabled = true;
            ensureTab('phone-inputs').then(() => {
                if (button.isConnected) {
                    button.disabled = false;
                    button.click();
                }
            }).catch((error) => {
                console.warn('[TOP GYM] Phone input feature failed to load.', error);
                window.showToast?.(error.message || 'تعذر تحميل حقل الهاتف.', true, 'error');
            }).finally(() => {
                delete button.dataset.topGymPhoneLoading;
                if (button.isConnected) button.disabled = false;
            });
        }, true);
    }

    function scheduleNotificationCenter() {
        const load = async () => {
            if (window.topGymNotificationCenter || !window.topGymAuth?.getUser?.()) return;
            await loadScript('/js/notification-center.js?v=6', 'notification-center');
        };
        const schedule = () => {
            if ('requestIdleCallback' in window) window.requestIdleCallback(() => void load().catch(() => null), { timeout: 1600 });
            else window.requestAnimationFrame(() => void load().catch(() => null));
        };
        if (window.topGymAuthReady) window.topGymAuthReady.then((user) => { if (user) schedule(); }).catch(() => {});
    }

    function bindLazyWhatsapp() {
        const source = '/js/whatsapp-enhancements.js?v=14';
        const key = 'whatsapp-enhancements';
        const ensureWhatsapp = () => ensureTab('whatsapp-runtime').then(() => loadScript(source, key));
        const actionSelector = '[data-alert-whatsapp], [data-report-whatsapp], [data-day-pass-whatsapp], [data-day-pass-report-whatsapp], [data-portal-code-action="whatsapp"], [data-action="freeze"]';

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
        if (window.__topGymOptionalEnhancementsScheduled) return;
        window.__topGymOptionalEnhancementsScheduled = true;
        const load = async () => {
            if (!window.topGymAuth?.getUser?.()) return;
            // These enhancements decorate already-mounted UI; they are not
            // part of the first authenticated paint. Loading them together
            // after the app controller keeps the critical path deterministic.
            await Promise.allSettled([
                loadScript('/js/dialog-enhancements.js?v=3', 'dialog-enhancements'),
                loadScript('/js/table-cards.js?v=3', 'table-cards'),
                loadExternalAsset('sweetalert')
            ]);
        };
        const schedule = () => {
            if ('requestIdleCallback' in window) window.requestIdleCallback(() => void load(), { timeout: 3000 });
            else window.requestAnimationFrame(() => void load());
        };
        // Auth is the first safe boundary for optional UI decorators. The
        // app controller may still be loading here; the decorators observe
        // later DOM additions, so waiting for a controller promise would
        // create a race where this one-shot schedule silently never runs.
        const ready = window.topGymAuthReady || Promise.resolve(null);
        ready.then((user) => { if (user) schedule(); }).catch(() => {});
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
    bindLazyPhoneInput();
    scheduleOptionalEnhancements();
    scheduleNotificationCenter();
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
