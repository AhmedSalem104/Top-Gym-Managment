(() => {
    if (window.__topGymPageTabsLoaded) return;
    window.__topGymPageTabsLoaded = true;

    function setHidden(element, hidden) {
        if (element) element.hidden = hidden;
    }

    function activateTab(name) {
        const overview = document.querySelector('.overview-grid');
        const workspace = document.querySelector('.workspace');
        const membersSection = document.getElementById('membersSection');
        const expensesSection = document.getElementById('expensesSection');
        const managementSection = document.getElementById('managementSection');
        const analyticsSection = document.getElementById('dashboardAnalytics');
        const isDashboard = name === 'dashboard';
        const isMembers = name === 'members';
        const isExpenses = name === 'expenses';
        const isManagement = name === 'management';

        setHidden(overview, !isDashboard);
        setHidden(expensesSection, !isExpenses);
        setHidden(managementSection, !isManagement);
        setHidden(analyticsSection, !isDashboard);
        setHidden(workspace, isDashboard || isExpenses);
        setHidden(membersSection, !isMembers);

        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            const active = button.dataset.pageTab === name;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        window.history.replaceState(null, '', `#${name}`);
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            button.addEventListener('click', () => activateTab(button.dataset.pageTab));
        });
        document.querySelectorAll('[data-open-dialog-button]').forEach((button) => {
            button.addEventListener('click', () => {
                document.getElementById(button.dataset.openDialogButton)?.click();
            });
        });
        activateTab('members');
    });

    window.topGymActivateTab = activateTab;
})();
