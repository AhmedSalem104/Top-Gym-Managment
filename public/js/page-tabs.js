(() => {
    if (window.__topGymPageTabsLoaded) return;
    window.__topGymPageTabsLoaded = true;

    const validTabs = new Set(['dashboard', 'members', 'expenses', 'reports', 'management', 'permissions', 'attendance', 'library', 'trainees', 'intelligence', 'feedback', 'store']);
    let activationToken = 0;
    let activeTabName = null;
    const SIDEBAR_PIN_STORAGE_KEY = 'topgym.sidebar.pinned';

    function setHidden(element, hidden) {
        if (element) element.hidden = hidden;
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
            if (name === 'management' && !window.topGymAuth.isOwner?.()) return window.topGymPermissions?.firstAccessibleTab?.(window.topGymAuth.getUser?.()) || 'members';
            if (!window.topGymAuth.canAccessTab(name)) return window.topGymPermissions?.firstAccessibleTab?.(window.topGymAuth.getUser?.()) || 'members';
        }
        return name;
    }

    function renderTab(name) {
        const overview = document.querySelector('.overview-grid');
        const dashboardHero = document.querySelector('.dashboard-page-actions');
        const workspace = document.querySelector('.workspace');
        const membersSection = document.getElementById('membersSection');
        const expensesSection = document.getElementById('expensesSection');
        const managementSection = document.getElementById('managementSection');
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
        const isPermissions = name === 'permissions';
        const isReports = name === 'reports';
        const isFeedback = name === 'feedback';
        const isAttendance = name === 'attendance';
        const isLibrary = name === 'library';
        const isTrainees = name === 'trainees';
        const isIntelligence = name === 'intelligence';
        const isStore = name === 'store';

        setHidden(dashboardHero, !isDashboard);
        setHidden(overview, !isDashboard);
        setHidden(expensesSection, !isExpenses);
        setHidden(managementSection, !isManagement);
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
        setHidden(workspace, isDashboard || isExpenses || isReports || isManagement || isPermissions || isAttendance || isLibrary || isTrainees || isIntelligence || isFeedback || isStore);
        setHidden(membersSection, !isMembers);

        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            const active = button.dataset.pageTab === name;
            button.classList.toggle('active', active);
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-selected', String(active));
            button.toggleAttribute('aria-current', active);
            button.setAttribute('aria-controls', `${button.dataset.pageTab}Section`);
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
        try {
            await window.topGymEnsureTab?.(name);
        } catch (error) {
            // The section still opens so one unavailable optional feature cannot lock navigation.
            console.warn(`[TOP GYM] Failed to load the ${name} feature.`, error);
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
