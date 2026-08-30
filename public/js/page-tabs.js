(() => {
    if (window.__topGymPageTabsLoaded) return;
    window.__topGymPageTabsLoaded = true;

    const validTabs = new Set(['dashboard', 'members', 'expenses', 'reports', 'management', 'branding', 'saas-billing', 'backup-history', 'permissions', 'attendance', 'library', 'trainees', 'intelligence', 'feedback', 'store', 'member-subscription-requests', 'portal-analytics']);
    let activationToken = 0;
    let activeTabName = null;
    const SIDEBAR_PIN_STORAGE_KEY = 'topgym.sidebar.pinned';

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

    ensureBackupHistoryTab();
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

    function initSidebarPin() {
        const rail = document.getElementById('pageTabs');
        const pinButton = document.getElementById('sidebarPinButton');
        if (!rail || !pinButton) return;

        let pinned = false;
        try {
            pinned = window.localStorage.getItem(SIDEBAR_PIN_STORAGE_KEY) === 'true';
        } catch {
            pinned = false;
        }

        const applyPinnedState = (nextPinned) => {
            pinned = Boolean(nextPinned);
            rail.classList.toggle('is-pinned', pinned);
            pinButton.setAttribute('aria-pressed', String(pinned));
            const label = pinned ? 'إلغاء تثبيت القائمة الجانبية' : 'تثبيت القائمة الجانبية';
            pinButton.setAttribute('aria-label', label);
            pinButton.setAttribute('title', label);
        };

        applyPinnedState(pinned);
        pinButton.addEventListener('click', () => {
            applyPinnedState(!pinned);
            try {
                window.localStorage.setItem(SIDEBAR_PIN_STORAGE_KEY, String(pinned));
            } catch {
                // The sidebar remains usable when storage is unavailable.
            }
        });
    }

    function normalizeTab(name) {
        if (!validTabs.has(name)) return 'dashboard';
        if (window.topGymAuth?.isReady?.()) {
            if (!window.topGymAuth.getUser?.()) return 'dashboard';
            if ((name === 'management' || name === 'branding' || name === 'saas-billing' || name === 'backup-history' || name === 'member-subscription-requests' || name === 'portal-analytics') && !window.topGymAuth.isOwner?.()) return window.topGymPermissions?.firstAccessibleTab?.(window.topGymAuth.getUser?.()) || 'members';
            if (!window.topGymAuth.canAccessTab(name)) return window.topGymPermissions?.firstAccessibleTab?.(window.topGymAuth.getUser?.()) || 'members';
        }
        return name;
    }

    function renderTab(name) {
        const overview = document.querySelector('.overview-grid');
        const dashboardHero = document.querySelector('.dashboard-page-actions');
        const dashboardSectionHeading = document.querySelector('.dashboard-section-heading');
        const workspace = document.querySelector('.workspace');
        const membersSection = document.getElementById('membersSection');
        const expensesSection = document.getElementById('expensesSection');
        const monthlyFinanceSnapshot = document.getElementById('monthlyFinanceSnapshot');
        const managementSection = document.getElementById('managementSection');
        const brandingSection = document.getElementById('brandingSection');
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
        const isDashboard = name === 'dashboard';
        const isMembers = name === 'members';
        const isExpenses = name === 'expenses';
        const isManagement = name === 'management';
        const isBranding = name === 'branding';
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

        setHidden(dashboardHero, !isDashboard);
        setHidden(dashboardSectionHeading, !isDashboard);
        setHidden(overview, !isDashboard);
        setHidden(monthlyFinanceSnapshot, !isDashboard);
        setHidden(expensesSection, !isExpenses);
        setHidden(managementSection, !isManagement);
        setHidden(brandingSection, !isBranding);
        setHidden(saasBillingSection, !isSaasBilling);
        setHidden(backupHistorySection, !isBackupHistory);
        setHidden(memberSubscriptionRequestsSection, !isMemberSubscriptionRequests);
        setHidden(portalAnalyticsSection, !isPortalAnalytics);
        const hideAnalytics = !isDashboard || !window.topGymAuth?.isOwner?.();
        setHidden(analyticsSection, hideAnalytics);
        setHidden(dashboardStoreSummary, !isDashboard);
        analyticsSection?.setAttribute('aria-hidden', String(hideAnalytics));
        setHidden(reportsSection, !isReports);
        setHidden(feedbackSection, !isFeedback);
        setHidden(permissionsSection, !isPermissions);
        setHidden(attendanceSection, !isAttendance);
        setHidden(librarySection, !isLibrary);
        setHidden(traineesSection, !isTrainees);
        setHidden(intelligenceSection, !isIntelligence);
        setHidden(storeSection, !isStore);
        setHidden(workspace, isDashboard || isExpenses || isReports || isManagement || isBranding || isSaasBilling || isBackupHistory || isMemberSubscriptionRequests || isPortalAnalytics || isPermissions || isAttendance || isLibrary || isTrainees || isIntelligence || isFeedback || isStore);
        setHidden(membersSection, !isMembers);

        const tabPanelIds = { 'saas-billing': 'saasBillingSection', 'backup-history': 'backupHistorySection', 'member-subscription-requests': 'memberSubscriptionRequestsSection', 'portal-analytics': 'portalAnalyticsSection' };
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
        if (activeTabName === 'branding' && rawName !== 'branding' && window.topGymBrandingEditor?.confirmLeave) {
            const canLeave = await window.topGymBrandingEditor.confirmLeave();
            if (!canLeave) return;
        }
        const name = normalizeTab(rawName);
        const token = ++activationToken;
        document.body.classList.add('top-gym-navigation-pending');
        if (name === activeTabName) {
            document.body.classList.remove('top-gym-navigation-pending');
            return;
        }
        document.documentElement.setAttribute('data-top-gym-loading-tab', name);
        // Hide the previous screen immediately. Optional feature scripts can
        // take a round-trip to load, but dashboard-only content must never
        // remain visible while the next tab is being prepared.
        renderTab(name);
        const releaseProgress = window.topGymPerformance?.startTask?.('جاري تجهيز الشاشة…');
        try {
            await window.topGymEnsureTab?.(name);
        } catch (error) {
            // The section still opens so one unavailable optional feature cannot lock navigation.
            console.warn(`[TOP GYM] Failed to load the ${name} feature.`, error);
        } finally {
            releaseProgress?.();
        }
        if (token !== activationToken) return;
        renderTab(name);
        activeTabName = name;
        document.documentElement.dataset.topGymActiveTab = name;
        window.history.replaceState(null, '', `#${name}`);
        document.body.classList.remove('top-gym-navigation-pending');
        document.documentElement.removeAttribute('data-top-gym-loading-tab');
        window.dispatchEvent(new CustomEvent('topgym:tab-changed', { detail: { name } }));
    }

    document.addEventListener('DOMContentLoaded', () => {
        ensureBackupHistoryTab();
        initSidebarPin();
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            button.setAttribute('role', 'tab');
        });
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            button.addEventListener('click', () => { void activateTab(button.dataset.pageTab); });
        });
        document.querySelectorAll('[data-page-tab-link]').forEach((button) => {
            button.addEventListener('click', () => { void activateTab(button.dataset.pageTabLink); });
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
