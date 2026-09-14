(() => {
    if (window.__topGymPageTabsLoaded) return;
    window.__topGymPageTabsLoaded = true;

    const validTabs = new Set(['dashboard', 'members', 'expenses', 'reports', 'management', 'whatsapp-templates', 'branding', 'member-payment-methods', 'saas-billing', 'backup-history', 'permissions', 'attendance', 'library', 'trainees', 'intelligence', 'feedback', 'store', 'branches', 'member-subscription-requests', 'portal-analytics']);
    const SETTINGS_TAB_TO_SECTION = new Map([
        ['management', 'billing'],
        ['branding', 'branding'],
        ['member-payment-methods', 'payments'],
        ['permissions', 'permissions'],
        ['backup-history', 'backups'],
        ['whatsapp-templates', 'whatsapp'],
        ['saas-billing', 'saas']
    ]);
    const SETTINGS_SECTION_TO_TAB = new Map([...SETTINGS_TAB_TO_SECTION].map(([tab, section]) => [section, tab]));
    let activationToken = 0;
    let activeTabName = null;
    let activeSettingsSection = 'overview';
    let requestedSettingsSection = 'overview';

    function ensureBackupHistoryTab() {
        const rail = document.getElementById('pageTabs');
        if (!rail || rail.querySelector('[data-page-tab="backup-history"]')) return;

        const button = document.createElement('button');
        button.className = 'page-tab page-tab-backup-history';
        button.type = 'button';
        button.dataset.pageTab = 'backup-history';
        button.dataset.ownerOnly = '';
        button.setAttribute('aria-selected', 'false');
        button.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20v14H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 7.5v14M8 9h7M8 13h8"/><path d="M17 16h.01"/></svg><span>\u0633\u062c\u0644 \u0627\u0644\u0646\u0633\u062e</span>';

        const feedbackTab = rail.querySelector('[data-page-tab="feedback"]');
        rail.insertBefore(button, feedbackTab || null);
    }

    function ensurePlatformSettingsShell() {
        const management = document.getElementById('managementSection');
        const host = management?.parentElement;
        if (!management || !host || document.getElementById('platformSettingsShell')) return;

        const shell = document.createElement('section');
        shell.id = 'platformSettingsShell';
        shell.className = 'platform-settings-shell panel';
        shell.hidden = true;
        shell.setAttribute('aria-labelledby', 'platformSettingsTitle');
        shell.innerHTML = `
            <header class="platform-settings-header">
                <div class="platform-settings-heading">
                    <span class="platform-settings-eyebrow">CONTROL CENTER · OWNER ONLY</span>
                    <h2 id="platformSettingsTitle">إعدادات المنصة</h2>
                    <p>إدارة إعدادات التشغيل والتخصيص الخاصة بالمنصة من مكان واحد.</p>
                </div>
                <span class="platform-settings-mark" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="9"/></svg></span>
            </header>
            <div class="platform-settings-shell-layout">
                <nav class="platform-settings-nav" id="platformSettingsNav" aria-label="أقسام إعدادات المنصة" role="tablist">
                    <div class="platform-settings-nav-label">الأقسام</div>
                    <button class="platform-settings-nav-item is-active" type="button" role="tab" aria-selected="true" data-settings-section="overview"><span class="settings-nav-icon" aria-hidden="true">01</span><span><strong>نظرة عامة</strong><small>كل الإعدادات في مكان واحد</small></span></button>
                    <button class="platform-settings-nav-item" type="button" role="tab" aria-selected="false" data-settings-section="billing"><span class="settings-nav-icon" aria-hidden="true">02</span><span><strong>الأسعار والعضويات</strong><small>الباقات وأنواع العضويات</small></span></button>
                    <button class="platform-settings-nav-item" type="button" role="tab" aria-selected="false" data-settings-section="branding"><span class="settings-nav-icon" aria-hidden="true">03</span><span><strong>الهوية والمظهر</strong><small>الشعار والألوان وشاشة الدخول</small></span></button>
                    <button class="platform-settings-nav-item" type="button" role="tab" aria-selected="false" data-settings-section="payments"><span class="settings-nav-icon" aria-hidden="true">04</span><span><strong>وسائل الدفع</strong><small>طرق الدفع الخاصة بالجيم</small></span></button>
                    <button class="platform-settings-nav-item" type="button" role="tab" aria-selected="false" data-settings-section="permissions"><span class="settings-nav-icon" aria-hidden="true">05</span><span><strong>الصلاحيات والأمان</strong><small>حسابات الفريق والوصول</small></span></button>
                    <button class="platform-settings-nav-item" type="button" role="tab" aria-selected="false" data-settings-section="backups"><span class="settings-nav-icon" aria-hidden="true">06</span><span><strong>النسخ الاحتياطي</strong><small>الحماية والاستعادة</small></span></button>
                    <button class="platform-settings-nav-item" type="button" role="tab" aria-selected="false" data-settings-section="whatsapp"><span class="settings-nav-icon" aria-hidden="true">07</span><span><strong>الرسائل وWhatsApp</strong><small>9 قوالب قابلة للتخصيص</small></span></button>
                    <button class="platform-settings-nav-item" type="button" role="tab" aria-selected="false" data-settings-section="saas"><span class="settings-nav-icon" aria-hidden="true">08</span><span><strong>اشتراك المنصة</strong><small>حالة الباقة والفوترة</small></span></button>
                </nav>
                <div class="platform-settings-overview" id="platformSettingsOverview" role="tabpanel" aria-labelledby="platformSettingsTitle">
                    <div class="platform-settings-overview-head"><div><span class="platform-settings-eyebrow">SETTINGS HUB</span><h3>اختَر قسمًا لإدارته</h3><p>الإعدادات المنظمة هنا تستخدم الشاشات الحالية نفسها، مع الحفاظ على الصلاحيات وسياق الجيم.</p></div><span class="platform-settings-overview-count">08 أقسام</span></div>
                    <div class="platform-settings-card-grid">
                        <button type="button" class="platform-settings-card" data-settings-section="billing"><span class="platform-settings-card-index">02</span><span class="platform-settings-card-copy"><strong>الأسعار والعضويات</strong><small>إدارة الباقات وأنواع العضويات والأسعار.</small></span><span class="platform-settings-card-arrow" aria-hidden="true">←</span></button>
                        <button type="button" class="platform-settings-card" data-settings-section="branding"><span class="platform-settings-card-index">03</span><span class="platform-settings-card-copy"><strong>الهوية والمظهر</strong><small>الشعار، الألوان، الخطوط، وشاشة الدخول.</small></span><span class="platform-settings-card-arrow" aria-hidden="true">←</span></button>
                        <button type="button" class="platform-settings-card" data-settings-section="payments"><span class="platform-settings-card-index">04</span><span class="platform-settings-card-copy"><strong>وسائل الدفع</strong><small>طرق التحويل التي تظهر لأعضاء الجيم.</small></span><span class="platform-settings-card-arrow" aria-hidden="true">←</span></button>
                        <button type="button" class="platform-settings-card" data-settings-section="permissions"><span class="platform-settings-card-index">05</span><span class="platform-settings-card-copy"><strong>الصلاحيات والأمان</strong><small>إدارة حسابات الفريق والوصول المسموح.</small></span><span class="platform-settings-card-arrow" aria-hidden="true">←</span></button>
                        <button type="button" class="platform-settings-card" data-settings-section="backups"><span class="platform-settings-card-index">06</span><span class="platform-settings-card-copy"><strong>النسخ الاحتياطي</strong><small>مراجعة النسخ والاستعادة الآمنة.</small></span><span class="platform-settings-card-arrow" aria-hidden="true">←</span></button>
                        <button type="button" class="platform-settings-card platform-settings-card-featured" data-settings-section="whatsapp"><span class="platform-settings-card-index">07</span><span class="platform-settings-card-copy"><strong>الرسائل وWhatsApp</strong><small>تحرير 9 رسائل مع متغيرات ومعاينة مباشرة.</small></span><span class="platform-settings-card-meta">9 قوالب</span><span class="platform-settings-card-arrow" aria-hidden="true">←</span></button>
                        <button type="button" class="platform-settings-card" data-settings-section="saas"><span class="platform-settings-card-index">08</span><span class="platform-settings-card-copy"><strong>اشتراك المنصة</strong><small>عرض الباقة الحالية وحالة الاشتراك.</small></span><span class="platform-settings-card-arrow" aria-hidden="true">←</span></button>
                    </div>
                </div>
                <div class="platform-settings-context" id="platformSettingsContext" hidden role="status" aria-live="polite"><button type="button" class="platform-settings-back" data-settings-section="overview"><span aria-hidden="true">→</span> العودة إلى إعدادات المنصة</button><div><span class="platform-settings-eyebrow">إعدادات المنصة</span><strong id="platformSettingsContextTitle">القسم الحالي</strong><small id="platformSettingsContextDescription">إدارة إعدادات هذا القسم من الشاشة الحالية.</small></div></div>
            </div>`;
        host.insertBefore(shell, management);

        const settingsTabNames = new Set(SETTINGS_TAB_TO_SECTION.keys());
        settingsTabNames.delete('management');
        settingsTabNames.forEach((tabName) => document.querySelector(`[data-page-tab="${tabName}"]`)?.remove());
    }

    ensureBackupHistoryTab();
    ensurePlatformSettingsShell();
    // Platform Admin has its own application at /platform-admin. Remove the
    // legacy in-shell entry so gym users never see a second control plane.
    document.querySelector('[data-page-tab="platform"]')?.remove();
    document.getElementById('platformSection')?.remove();

    function setHidden(element, hidden) {
        if (!element) return;
        element.hidden = hidden;
        if (element.hasAttribute('data-page-tab-panel')) {
            element.setAttribute('aria-hidden', String(hidden));
            element.toggleAttribute('inert', hidden);
        }
    }

    function syncSidebarTooltips(rail) {
        if (!rail) return;

        const targets = [
            ...rail.querySelectorAll('.page-tab'),
            rail.querySelector('.smart-assistant-launcher'),
            rail.querySelector('.sidebar-pin-toggle'),
            rail.querySelector('.auth-logout-button')
        ].filter(Boolean);

        targets.forEach((element) => {
            const label = (element.querySelector('span:not(.visually-hidden)')?.textContent || element.getAttribute('aria-label') || element.title || '').trim();
            if (!label) return;
            element.dataset.sidebarLabel = label;
            if (!element.getAttribute('aria-label')) element.setAttribute('aria-label', label);
            if (!element.title) element.title = label;
        });
    }

    function initSidebarTooltip(rail) {
        if (!rail || document.querySelector('.sidebar-floating-tooltip')) return null;

        const shell = rail.closest('.app-shell');
        const tooltip = document.createElement('div');
        tooltip.className = 'sidebar-floating-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.setAttribute('aria-hidden', 'true');
        tooltip.hidden = true;
        document.body.appendChild(tooltip);

        let target = null;
        let hideTimer = null;

        const position = () => {
            if (!target || tooltip.hidden) return;
            const rect = target.getBoundingClientRect();
            const gap = 12;
            const direction = getComputedStyle(rail).direction;

            tooltip.style.top = `${Math.round(rect.top + (rect.height / 2))}px`;
            tooltip.style.maxWidth = `${Math.min(220, Math.max(140, window.innerWidth - 24))}px`;
            if (direction === 'rtl') {
                tooltip.style.right = `${Math.max(8, Math.round(window.innerWidth - rect.left + gap))}px`;
                tooltip.style.left = 'auto';
            } else {
                tooltip.style.left = `${Math.max(8, Math.round(rect.right + gap))}px`;
                tooltip.style.right = 'auto';
            }
        };

        const hide = () => {
            target = null;
            tooltip.classList.remove('is-visible');
            if (hideTimer) window.clearTimeout(hideTimer);
            hideTimer = window.setTimeout(() => {
                if (target) return;
                tooltip.hidden = true;
                tooltip.setAttribute('aria-hidden', 'true');
            }, 180);
        };

        const show = (element) => {
            if (window.matchMedia('(max-width: 1199px)').matches) return;
            if (rail.classList.contains('is-hovered') || shell?.classList.contains('sidebar-expanded')) return;
            const label = element?.dataset.sidebarLabel;
            if (!label) return;

            if (hideTimer) window.clearTimeout(hideTimer);
            target = element;
            tooltip.textContent = label;
            tooltip.hidden = false;
            tooltip.setAttribute('aria-hidden', 'false');
            position();
            window.requestAnimationFrame(() => {
                if (target === element) tooltip.classList.add('is-visible');
            });
        };

        const targets = [
            ...rail.querySelectorAll('.page-tab, .smart-assistant-launcher'),
        ].filter(Boolean);
        targets.forEach((element) => {
            element.addEventListener('pointerenter', () => show(element));
            element.addEventListener('pointerleave', hide);
            element.addEventListener('focusin', () => show(element));
            element.addEventListener('focusout', (event) => {
                if (!element.contains(event.relatedTarget)) hide();
            });
        });

        rail.addEventListener('scroll', position, { passive: true });
        window.addEventListener('resize', position, { passive: true });
        return { hide };
    }

    function initSidebarPin() {
        const rail = document.getElementById('pageTabs');
        if (!rail) return;

        syncSidebarTooltips(rail);
        const tooltip = initSidebarTooltip(rail);

        const shell = rail.closest('.app-shell');
        const desktopMediaQuery = window.matchMedia('(min-width: 1200px)');
        const pinToggle = rail.querySelector('#sidebarPinToggle');
        const pinStorageKey = 'logic-fit.sidebar-pinned';

        let hoverOpenTimer = null;
        let hoverReleaseTimer = null;
        let isPinned = false;

        try {
            isPinned = window.localStorage.getItem(pinStorageKey) === 'true';
        } catch {
            isPinned = false;
        }

        const updatePinState = (nextPinned) => {
            isPinned = Boolean(nextPinned);
            rail.classList.toggle('sidebar-pinned', isPinned);
            rail.classList.toggle('is-hovered', isPinned);
            shell?.classList.toggle('sidebar-expanded', isPinned);
            pinToggle?.setAttribute('aria-pressed', String(isPinned));
            pinToggle?.setAttribute('aria-label', isPinned ? 'إلغاء تثبيت القائمة' : 'تثبيت القائمة');
            pinToggle?.setAttribute('title', isPinned ? 'إلغاء تثبيت القائمة' : 'تثبيت القائمة');
            try {
                window.localStorage.setItem(pinStorageKey, String(isPinned));
            } catch {
                // A storage restriction should not disable navigation.
            }
        };

        updatePinState(isPinned);

        const revealRail = () => {
            if (!desktopMediaQuery.matches) return;
            if (hoverOpenTimer) window.clearTimeout(hoverOpenTimer);
            if (hoverReleaseTimer) window.clearTimeout(hoverReleaseTimer);
            hoverOpenTimer = null;
            hoverReleaseTimer = null;
            rail.classList.add('is-hovered');
            shell?.classList.add('sidebar-expanded');
            tooltip?.hide();
        };
        const openRail = (reason = 'pointer') => {
            if (!desktopMediaQuery.matches) return;
            if (isPinned) return;
            if (hoverReleaseTimer) window.clearTimeout(hoverReleaseTimer);
            if (reason === 'focus') {
                revealRail();
                return;
            }
            if (rail.classList.contains('is-hovered')) return;
            if (hoverOpenTimer) window.clearTimeout(hoverOpenTimer);
            hoverOpenTimer = window.setTimeout(revealRail, 120);
        };
        const scheduleRailClose = () => {
            if (isPinned) return;
            if (hoverOpenTimer) window.clearTimeout(hoverOpenTimer);
            hoverOpenTimer = null;
            if (hoverReleaseTimer) window.clearTimeout(hoverReleaseTimer);
            if (!desktopMediaQuery.matches) {
                rail.classList.remove('is-hovered');
                shell?.classList.remove('sidebar-expanded');
                return;
            }
            hoverReleaseTimer = window.setTimeout(() => {
                rail.classList.remove('is-hovered');
                shell?.classList.remove('sidebar-expanded');
                hoverReleaseTimer = null;
            }, 180);
        };

        pinToggle?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const nextPinned = !isPinned;
            updatePinState(nextPinned);
            if (nextPinned) {
                revealRail();
            } else if (rail.matches(':hover')) {
                openRail();
            } else {
                scheduleRailClose();
            }
        });

        rail.addEventListener('pointerenter', openRail);
        rail.addEventListener('pointerleave', scheduleRailClose);
        rail.addEventListener('focusin', () => openRail('focus'));
        rail.addEventListener('focusout', (event) => {
            if (!rail.contains(event.relatedTarget)) scheduleRailClose();
        });

        const handleDesktopViewportChange = () => {
            if (desktopMediaQuery.matches) return;
            if (hoverOpenTimer) window.clearTimeout(hoverOpenTimer);
            if (hoverReleaseTimer) window.clearTimeout(hoverReleaseTimer);
            rail.classList.remove('is-hovered');
            shell?.classList.remove('sidebar-expanded');
            tooltip?.hide();
            hoverOpenTimer = null;
            hoverReleaseTimer = null;
        };
        if (typeof desktopMediaQuery.addEventListener === 'function') {
            desktopMediaQuery.addEventListener('change', handleDesktopViewportChange);
        } else if (typeof desktopMediaQuery.addListener === 'function') {
            desktopMediaQuery.addListener(handleDesktopViewportChange);
        }

        // The shell can be hidden while authentication/branding is settling.
        // Mark it ready after the first paint so the first reveal is stable;
        // only real pointer/focus changes should animate the rail afterward.
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                document.querySelector('.app-shell')?.classList.add('sidebar-ready');
            });
        });

    }

    function initMobileNavigation() {
        const rail = document.getElementById('pageTabs');
        const shell = rail?.closest('.app-shell');
        const toggle = document.getElementById('mobileNavToggle');
        const closeButton = document.getElementById('mobileNavClose');
        const backdrop = document.getElementById('mobileNavBackdrop');
        if (!rail || !shell || !toggle) return;

        const mediaQuery = window.matchMedia('(max-width: 1199px)');
        const openLabel = '\u0641\u062a\u062d \u0627\u0644\u0642\u0627\u0626\u0645\u0629';

        const syncNavigationAria = () => {
            // On small screens the navigation is an always-visible tab rail,
            // not an off-canvas drawer. It must remain exposed to keyboard and
            // screen-reader users even while the legacy toggle is hidden.
            rail.removeAttribute('aria-hidden');
        };

        const resetNavigationPresentation = () => {
            shell.classList.remove('mobile-nav-open');
            document.body.classList.remove('mobile-nav-open');
            rail.classList.remove('is-mobile-open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', openLabel);
            toggle.setAttribute('title', openLabel);
            const toggleLabel = toggle.querySelector('[data-mobile-nav-label]');
            if (toggleLabel) toggleLabel.textContent = openLabel;

            if (backdrop) {
                backdrop.hidden = true;
                backdrop.setAttribute('aria-hidden', 'true');
            }
            syncNavigationAria();
        };

        const setOpen = () => {
            // Keep the old event hooks harmless for cached markup or a stale
            // script, while the canonical mobile presentation remains a
            // visible four-column tab grid.
            resetNavigationPresentation();
        };

        toggle.addEventListener('click', () => setOpen());
        closeButton?.addEventListener('click', () => setOpen());
        backdrop?.addEventListener('click', () => setOpen());
        rail.addEventListener('click', (event) => {
            if (event.target.closest('[data-page-tab]')) setOpen();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && shell.classList.contains('mobile-nav-open')) setOpen();
        });

        const handleViewportChange = () => setOpen();
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleViewportChange);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(handleViewportChange);
        }

        setOpen();
    }

    function settingsSectionForRoute(rawName) {
        const raw = String(rawName || '').replace(/^#/, '').trim();
        if (raw === 'settings' || raw === 'management') return 'overview';
        if (raw.startsWith('settings/')) return SETTINGS_SECTION_TO_TAB.has(raw.slice('settings/'.length)) ? raw.slice('settings/'.length) : 'overview';
        return SETTINGS_TAB_TO_SECTION.get(raw) || null;
    }

    function resolveTabRoute(rawName) {
        const raw = String(rawName || '').replace(/^#/, '').trim();
        const settingsSection = settingsSectionForRoute(raw);
        if (settingsSection) {
            requestedSettingsSection = settingsSection;
            return 'management';
        }
        requestedSettingsSection = 'overview';
        return raw || 'dashboard';
    }

    function renderPlatformSettingsShell(section = 'overview') {
        const shell = document.getElementById('platformSettingsShell');
        if (!shell) return;
        const normalized = section === 'overview' || SETTINGS_SECTION_TO_TAB.has(section) ? section : 'overview';
        shell.dataset.activeSection = normalized;
        const overview = document.getElementById('platformSettingsOverview');
        const context = document.getElementById('platformSettingsContext');
        if (overview) overview.hidden = normalized !== 'overview';
        if (context) context.hidden = normalized === 'overview';
        const titles = {
            billing: ['الأسعار والعضويات', 'إدارة الباقات وأنواع العضويات والأسعار.'],
            branding: ['الهوية والمظهر', 'الشعار والألوان والخطوط وشاشة الدخول.'],
            payments: ['وسائل الدفع', 'طرق الدفع الخاصة التي تظهر لأعضاء الجيم.'],
            permissions: ['الصلاحيات والأمان', 'حسابات الفريق والصلاحيات المسموح بها.'],
            backups: ['النسخ الاحتياطي', 'مراجعة النسخ والاستعادة الآمنة.'],
            whatsapp: ['الرسائل وWhatsApp', 'تحرير قوالب الرسائل مع المعاينة والمتغيرات.'],
            saas: ['اشتراك المنصة', 'حالة باقة المنصة والفوترة.']
        };
        const copy = titles[normalized] || titles.billing;
        const title = document.getElementById('platformSettingsContextTitle');
        const description = document.getElementById('platformSettingsContextDescription');
        if (title) title.textContent = copy[0];
        if (description) description.textContent = copy[1];
        document.querySelectorAll('[data-settings-section]').forEach((button) => {
            const active = button.dataset.settingsSection === normalized;
            button.classList.toggle('is-active', active);
            if (button.matches('[role="tab"]')) button.setAttribute('aria-selected', String(active));
        });
    }

    function normalizeTab(rawName) {
        const name = resolveTabRoute(rawName);
        if (!validTabs.has(name)) return 'dashboard';
        if (window.topGymAuth?.isReady?.()) {
            const user = window.topGymAuth.getUser?.();
            if (!user) return 'dashboard';
            // Branch management is a Gym-only surface. The backend remains
            // authoritative, but the client must not route an independent
            // trainer into a dynamically injected Gym panel during startup.
            if (name === 'branches' && user.tenantType !== 'gym') return window.topGymPermissions?.firstAccessibleTab?.(user) || 'members';
            if ((name === 'management' || name === 'whatsapp-templates' || name === 'branding' || name === 'member-payment-methods' || name === 'saas-billing' || name === 'backup-history' || name === 'branches' || name === 'member-subscription-requests' || name === 'portal-analytics') && !window.topGymAuth.isOwner?.()) return window.topGymPermissions?.firstAccessibleTab?.(window.topGymAuth.getUser?.()) || 'members';
            if (!window.topGymAuth.canAccessTab(name)) return window.topGymPermissions?.firstAccessibleTab?.(window.topGymAuth.getUser?.()) || 'members';
        }
        return name;
    }

    function renderTab(name, settingsSection = requestedSettingsSection) {
        const overview = document.querySelector('.overview-grid');
        const dashboardHero = document.querySelector('.dashboard-page-actions');
        const dashboardSectionHeading = document.querySelector('.dashboard-section-heading');
        const dashboardInitialSkeleton = document.getElementById('dashboardInitialSkeleton');
        const workspace = document.querySelector('.workspace');
        const membersSection = document.getElementById('membersSection');
        const expensesSection = document.getElementById('expensesSection');
        const monthlyFinanceSnapshot = document.getElementById('monthlyFinanceSnapshot');
        const managementSection = document.getElementById('managementSection');
        const whatsappTemplatesSection = document.getElementById('whatsappTemplatesSection');
        const brandingSection = document.getElementById('brandingSection');
        const memberPaymentMethodsSection = document.getElementById('memberPaymentMethodsSection');
        const saasBillingSection = document.getElementById('saasBillingSection');
        const backupHistorySection = document.getElementById('backupHistorySection');
        const memberSubscriptionRequestsSection = document.getElementById('memberSubscriptionRequestsSection');
        const portalAnalyticsSection = document.getElementById('portalAnalyticsSection');
        const analyticsSection = document.getElementById('dashboardAnalytics');
        const dashboardStoreSummary = document.getElementById('dashboardStoreSummary');
        const reportsSection = document.getElementById('reportsSection');
        const feedbackSection = document.getElementById('feedbackSection');
        const permissionsSection = document.getElementById('permissionsSection');
        const attendanceSection = document.getElementById('attendanceSection');
        const librarySection = document.getElementById('librarySection');
        const traineesSection = document.getElementById('traineesSection');
        const intelligenceSection = document.getElementById('intelligenceSection');
        const storeSection = document.getElementById('storeSection');
        const branchesSection = document.getElementById('branchesSection');
        const isDashboard = name === 'dashboard';
        const isMembers = name === 'members';
        const isExpenses = name === 'expenses';
        const isManagement = name === 'management';
        const isSettingsPermissions = isManagement && settingsSection === 'permissions';
        const isWhatsappTemplates = name === 'whatsapp-templates';
        const isBranding = name === 'branding';
        const isMemberPaymentMethods = name === 'member-payment-methods';
        const isSaasBilling = name === 'saas-billing';
        const isBackupHistory = name === 'backup-history';
        const isMemberSubscriptionRequests = name === 'member-subscription-requests';
        const isPortalAnalytics = name === 'portal-analytics';
        const isPermissions = name === 'permissions';
        const isReports = name === 'reports';
        const isFeedback = name === 'feedback';
        const isAttendance = name === 'attendance';
        const isLibrary = name === 'library';
        const isTrainees = name === 'trainees';
        const isIntelligence = name === 'intelligence';
        const isStore = name === 'store';
        const isBranches = name === 'branches';

        setHidden(dashboardHero, !isDashboard);
        setHidden(dashboardSectionHeading, !isDashboard);
        setHidden(overview, !isDashboard);
        setHidden(dashboardInitialSkeleton, !isDashboard);
        dashboardInitialSkeleton?.setAttribute('aria-hidden', String(!isDashboard));
        setHidden(monthlyFinanceSnapshot, !isDashboard);
        const settingsView = isManagement ? settingsSection : '';
        const inSettings = isManagement;
        const showSettingsPanel = (section) => inSettings && settingsView === section;
        setHidden(expensesSection, !isExpenses);
        setHidden(document.getElementById('platformSettingsShell'), !inSettings);
        setHidden(managementSection, !showSettingsPanel('billing'));
        setHidden(whatsappTemplatesSection, !showSettingsPanel('whatsapp') && !isWhatsappTemplates);
        setHidden(brandingSection, !showSettingsPanel('branding') && !isBranding);
        setHidden(memberPaymentMethodsSection, !showSettingsPanel('payments') && !isMemberPaymentMethods);
        setHidden(saasBillingSection, !showSettingsPanel('saas') && !isSaasBilling);
        setHidden(backupHistorySection, !showSettingsPanel('backups') && !isBackupHistory);
        setHidden(memberSubscriptionRequestsSection, !isMemberSubscriptionRequests);
        setHidden(portalAnalyticsSection, !isPortalAnalytics);
        const hideAnalytics = !isDashboard || !window.topGymAuth?.isOwner?.();
        setHidden(analyticsSection, hideAnalytics);
        // Dashboard data can finish after the user has already moved to a
        // different tab. Only reveal the optional store summary when both
        // conditions are true; the dashboard renderer owns availability.
        // The Store summary is mounted inside the Store workspace and must
        // never appear on Dashboard, even when a legacy dashboard payload
        // still contains Store aggregates.
        setHidden(dashboardStoreSummary, true);
        analyticsSection?.setAttribute('aria-hidden', String(hideAnalytics));
        setHidden(reportsSection, !isReports);
        setHidden(feedbackSection, !isFeedback);
        setHidden(permissionsSection, !isPermissions && !isSettingsPermissions);
        setHidden(attendanceSection, !isAttendance);
        setHidden(librarySection, !isLibrary);
        setHidden(traineesSection, !isTrainees);
        setHidden(intelligenceSection, !isIntelligence);
        setHidden(storeSection, !isStore);
        setHidden(branchesSection, !isBranches);
        setHidden(workspace, isDashboard || isExpenses || isReports || isManagement || isWhatsappTemplates || isBranding || isMemberPaymentMethods || isSaasBilling || isBackupHistory || isMemberSubscriptionRequests || isPortalAnalytics || isPermissions || isAttendance || isLibrary || isTrainees || isIntelligence || isFeedback || isStore || isBranches);
        setHidden(membersSection, !isMembers);

        renderPlatformSettingsShell(inSettings ? settingsView : 'overview');
        const tabPanelIds = { management: 'platformSettingsShell', 'whatsapp-templates': 'whatsappTemplatesSection', 'saas-billing': 'saasBillingSection', 'backup-history': 'backupHistorySection', 'member-payment-methods': 'memberPaymentMethodsSection', 'member-subscription-requests': 'memberSubscriptionRequestsSection', 'portal-analytics': 'portalAnalyticsSection' };
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            const active = button.dataset.pageTab === name;
            button.classList.toggle('active', active);
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', String(active));
            button.toggleAttribute('aria-current', active);
            button.setAttribute('aria-controls', tabPanelIds[button.dataset.pageTab] || `${button.dataset.pageTab}Section`);
        });

        // A direct link such as #library can activate a tab that is outside
        // the initial RTL scroll position on tablet widths. Reveal it without
        // changing the page's vertical scroll or the tab data flow.
        const tabRail = document.getElementById('pageTabs');
        const activeTab = tabRail?.querySelector(`[data-page-tab="${name}"]`);
        if (tabRail && activeTab && tabRail.scrollWidth > tabRail.clientWidth) {
            activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }

    async function activateTab(rawName) {
        if (window.topGymAuthReady) await window.topGymAuthReady.catch(() => null);
        const targetSettingsSection = settingsSectionForRoute(rawName);
        if (activeSettingsSection === 'branding' && targetSettingsSection !== 'branding' && window.topGymBrandingEditor?.confirmLeave) {
            const canLeave = await window.topGymBrandingEditor.confirmLeave();
            if (!canLeave) return;
        }
        if (activeSettingsSection === 'payments' && targetSettingsSection !== 'payments' && window.topGymMemberPaymentMethodsEditor?.confirmLeave) {
            const canLeave = await window.topGymMemberPaymentMethodsEditor.confirmLeave();
            if (!canLeave) return;
        }
        if (activeSettingsSection === 'whatsapp' && targetSettingsSection !== 'whatsapp' && window.topGymWhatsappTemplatesUi?.confirmLeave) {
            const canLeave = await window.topGymWhatsappTemplatesUi.confirmLeave();
            if (!canLeave) return;
        }
        const name = normalizeTab(rawName);
        const settingsSection = name === 'management' ? requestedSettingsSection : 'overview';
        const token = ++activationToken;
        document.body.classList.add('top-gym-navigation-pending');
        if (name === activeTabName && settingsSection === activeSettingsSection) {
            document.body.classList.remove('top-gym-navigation-pending');
            return;
        }
        document.documentElement.setAttribute('data-top-gym-loading-tab', name);
        // Hide the previous screen immediately. Optional feature scripts can
        // take a round-trip to load, but dashboard-only content must never
        // remain visible while the next tab is being prepared.
        renderTab(name, settingsSection);
        const releaseProgress = window.topGymPerformance?.startTask?.('جاري تجهيز الشاشة…');
        try {
            const settingsFeature = SETTINGS_SECTION_TO_TAB.get(settingsSection);
            const features = name === 'management' && settingsSection !== 'overview'
                ? ['management', ...(settingsFeature && settingsFeature !== 'management' ? [settingsFeature] : [])]
                : [name];
            for (const feature of features) {
                await window.topGymEnsureTab?.(feature);
            }
        } catch (error) {
            // The section still opens so one unavailable optional feature cannot lock navigation.
            console.warn(`[TOP GYM] Failed to load the ${name} feature.`, error);
        } finally {
            releaseProgress?.();
        }
        if (token !== activationToken) return;
        renderTab(name, settingsSection);
        activeTabName = name;
        activeSettingsSection = settingsSection;
        const route = settingsSection === 'overview' ? name : `settings/${settingsSection}`;
        document.documentElement.dataset.topGymActiveTab = route;
        window.history.replaceState(null, '', `#${route}`);
        document.body.classList.remove('top-gym-navigation-pending');
        document.documentElement.removeAttribute('data-top-gym-loading-tab');
        window.dispatchEvent(new CustomEvent('topgym:tab-changed', { detail: { name, settingsSection } }));
    }

    document.addEventListener('DOMContentLoaded', () => {
        ensureBackupHistoryTab();
        initSidebarPin();
        initMobileNavigation();
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            button.setAttribute('role', 'tab');
        });
        // Use one delegated listener so tabs injected by optional modules
        // (for example the Gym-only Branches tab) remain navigable even when
        // they are created after this bootstrap handler runs.
        const tabRail = document.getElementById('pageTabs');
        tabRail?.addEventListener('click', (event) => {
            const button = event.target.closest?.('[data-page-tab]');
            if (!button || !tabRail.contains(button)) return;
            void activateTab(button.dataset.pageTab);
        });
        document.querySelectorAll('[data-page-tab-link]').forEach((button) => {
            button.addEventListener('click', () => {
                const target = button.dataset.pageTabLink;
                const settingsSection = SETTINGS_TAB_TO_SECTION.get(target);
                void activateTab(settingsSection ? `settings/${settingsSection}` : target);
            });
        });
        document.addEventListener('click', (event) => {
            const button = event.target.closest?.('[data-settings-section]');
            const shell = document.getElementById('platformSettingsShell');
            if (!button || !shell?.contains(button)) return;
            void activateTab(`settings/${button.dataset.settingsSection}`);
        });
        document.querySelectorAll('[data-open-dialog-button]').forEach((button) => {
            button.addEventListener('click', () => {
                document.getElementById(button.dataset.openDialogButton)?.click();
            });
        });
        void activateTab(window.location.hash.slice(1) || 'dashboard');
    });

    window.addEventListener('hashchange', () => {
        void activateTab(window.location.hash.slice(1) || 'dashboard');
    });

    window.topGymActivateTab = activateTab;
})();
