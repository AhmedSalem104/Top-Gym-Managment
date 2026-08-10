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
        const reportsSection = document.getElementById('reportsSection');
        const attendanceSection = document.getElementById('attendanceSection');
        const librarySection = document.getElementById('librarySection');
        const isDashboard = name === 'dashboard';
        const isMembers = name === 'members';
        const isExpenses = name === 'expenses';
        const isManagement = name === 'management';
        const isReports = name === 'reports';
        const isAttendance = name === 'attendance';
        const isLibrary = name === 'library';

        setHidden(overview, !isDashboard);
        setHidden(expensesSection, !isExpenses);
        setHidden(managementSection, !isManagement);
        setHidden(analyticsSection, !isDashboard);
        setHidden(reportsSection, !isReports);
        setHidden(attendanceSection, !isAttendance);
        setHidden(librarySection, !isLibrary);
        setHidden(workspace, isDashboard || isExpenses || isReports || isManagement || isAttendance || isLibrary);
        setHidden(membersSection, !isMembers);

        document.querySelectorAll('[data-page-tab]').forEach((button) => {
            const active = button.dataset.pageTab === name;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        window.history.replaceState(null, '', `#${name}`);
        window.dispatchEvent(new CustomEvent('topgym:tab-changed', { detail: { name } }));
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
