(() => {
    if (window.__topGymPageTabsLoaded) return;
    window.__topGymPageTabsLoaded = true;

    const validTabs = new Set(['dashboard', 'members', 'expenses', 'reports', 'management', 'attendance', 'library', 'trainees']);
    let activationToken = 0;
    let activeTabName = null;

    function setHidden(element, hidden) {
        if (element) element.hidden = hidden;
    }

    function normalizeTab(name) {
        if (!validTabs.has(name)) return 'dashboard';
        if (window.topGymAuth?.isReady?.()) {
            if (!window.topGymAuth.getUser?.()) return 'dashboard';
            if (!window.topGymAuth.canAccessTab(name)) return 'members';
        }
        return name;
    }

    function renderTab(name) {
        const overview = document.querySelector('.overview-grid');
        const workspace = document.querySelector('.workspace');
        const membersSection = document.getElementById('membersSection');
        const expensesSection = document.getElementById('expensesSection');
        const managementSection = document.getElementById('managementSection');
        const analyticsSection = document.getElementById('dashboardAnalytics');
        const reportsSection = document.getElementById('reportsSection');
        const attendanceSection = document.getElementById('attendanceSection');
        const librarySection = document.getElementById('librarySection');
        const traineesSection = document.getElementById('traineesSection');
        const isDashboard = name === 'dashboard';
        const isMembers = name === 'members';
        const isExpenses = name === 'expenses';
        const isManagement = name === 'management';
        const isReports = name === 'reports';
        const isAttendance = name === 'attendance';
        const isLibrary = name === 'library';
        const isTrainees = name === 'trainees';

        setHidden(overview, !isDashboard);
        setHidden(expensesSection, !isExpenses);
        setHidden(managementSection, !isManagement);
        setHidden(analyticsSection, !isDashboard || !window.topGymAuth?.isOwner?.());
        setHidden(reportsSection, !isReports);
        setHidden(attendanceSection, !isAttendance);
        setHidden(librarySection, !isLibrary);
        setHidden(traineesSection, !isTrainees);
        setHidden(workspace, isDashboard || isExpenses || isReports || isManagement || isAttendance || isLibrary || isTrainees);
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
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            button.setAttribute('role', 'tab');
        });
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            button.addEventListener('click', () => { void activateTab(button.dataset.pageTab); });
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
