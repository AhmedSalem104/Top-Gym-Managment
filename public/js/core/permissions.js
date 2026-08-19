(() => {
    if (window.topGymPermissions) return;

    const OWNER_TABS = Object.freeze(['dashboard', 'members', 'trainees', 'management', 'attendance', 'expenses', 'library', 'reports']);
    const ASSISTANT_TABS = Object.freeze(['members', 'trainees', 'attendance', 'library']);

    function tabsForUser(user) {
        return user?.role === 'Owner' ? OWNER_TABS : user?.role === 'Assistant' ? ASSISTANT_TABS : [];
    }

    window.topGymPermissions = Object.freeze({
        ownerTabs: OWNER_TABS,
        assistantTabs: ASSISTANT_TABS,
        tabsForUser,
        canAccessTab: (user, tab) => tabsForUser(user).includes(tab)
    });
})();
