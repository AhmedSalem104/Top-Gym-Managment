(() => {
    if (window.topGymPermissions) return;

    const OWNER_TABS = Object.freeze(['dashboard', 'members', 'trainees', 'intelligence', 'management', 'branding', 'member-payment-methods', 'saas-billing', 'backup-history', 'permissions', 'attendance', 'expenses', 'library', 'reports', 'feedback', 'store', 'branches', 'member-subscription-requests', 'portal-analytics']);
    const PLATFORM_TABS = Object.freeze([]);
    const TAB_PERMISSION_CODES = Object.freeze({
        dashboard: 'dashboard.read',
        members: ['members.read', 'memberships.read'],
        trainees: 'trainees.read',
        intelligence: 'intelligence.read',
        management: 'pricing.read',
        branding: 'branding.view',
        'saas-billing': 'saas.subscription.read',
        'backup-history': 'management.backup.read',
        permissions: 'permissions.manage',
        attendance: 'attendance.read',
        expenses: 'finance.read',
        library: 'library.read',
        reports: 'reports.read',
        feedback: 'feedback.read',
        store: 'store.view',
        branches: 'branches.manage',
        'member-subscription-requests': 'member.subscription_requests.read',
        'portal-analytics': 'portal.analytics.read'
    });
    const TAB_PERMISSION_ALTERNATIVES = Object.freeze({});
    const LEGACY_GROUPS = Object.freeze({
        members: 'members.read',
        trainees: 'trainees.read',
        attendance: 'attendance.read',
        library: 'library.read'
    });

    // This catalog is intentionally kept in the browser as a navigation and
    // affordance hint only. The backend remains the security boundary.
    const PERMISSION_LABELS = Object.freeze({
        'dashboard.read': 'عرض لوحة التحكم',
        'members.read': 'عرض المشتركين',
        'members.create': 'إضافة مشترك',
        'members.update': 'تعديل مشترك',
        'members.delete': 'حذف مشترك',
        'memberships.freeze': 'تجميد العضوية',
        'members.alerts': 'تسجيل تواصل التنبيهات',
        'members.print': 'طباعة ملف المشترك',
        'memberships.read': 'عرض العضويات',
        'memberships.create': 'إنشاء عضوية',
        'memberships.update': 'تعديل العضوية',
        'memberships.freeze': 'تجميد العضوية',
        'memberships.renew': 'تجديد العضوية',
        'payments.create': 'تسجيل دفعة',
        'trainees.read': 'عرض المتدربين',
        'trainees.create': 'إضافة متدرب',
        'coaching.read': 'عرض التدريب والتغذية',
        'coaching.create': 'إنشاء تدريب أو تغذية',
        'coaching.update': 'تعديل التدريب والتغذية',
        'coaching.delete': 'حذف التدريب والتغذية',
        'attendance.read': 'عرض الحضور',
        'attendance.check_in': 'تسجيل حضور',
        'attendance.check_out': 'تسجيل انصراف',
        'attendance.report': 'تقارير الحضور',
        'finance.read': 'عرض البيانات المالية',
        'finance.create': 'إضافة مصروف',
        'finance.update': 'تعديل مصروف',
        'finance.delete': 'حذف مصروف',
        'reports.read': 'عرض التقارير',
        'reports.export': 'تصدير التقارير',
        'pricing.read': 'عرض الأسعار',
        'pricing.create': 'إضافة سعر أو نوع',
        'pricing.update': 'تعديل الأسعار',
        'day_passes.read': 'عرض الحصص اليومية',
        'day_passes.create': 'إضافة حصة يومية',
        'day_passes.update': 'تعديل حصة يومية',
        'day_passes.delete': 'حذف حصة يومية',
        'day_passes.whatsapp': 'رسائل الحصص اليومية',
        'library.read': 'عرض المكتبة',
        'library.create': 'إضافة عنصر للمكتبة',
        'library.update': 'تعديل عنصر المكتبة',
        'library.delete': 'حذف عنصر المكتبة',
        'intelligence.read': 'عرض الذكاء التشغيلي',
        'intelligence.generate': 'توليد اقتراحات التدريب والتغذية بالذكاء'
    });

    function grantedSet(user) {
        return new Set(Array.isArray(user?.permissions) ? user.permissions : []);
    }

    function hasPermission(user, code) {
        if (user?.role === 'Owner' || user?.role === 'PlatformAdmin') return true;
        if (Array.isArray(code)) return code.every((item) => hasPermission(user, item));
        const granted = grantedSet(user);
        const resource = String(code || '').split('.')[0];
        return granted.has('*') || granted.has(code) || granted.has(resource) || (LEGACY_GROUPS[code] && granted.has(LEGACY_GROUPS[code]));
    }

    function tabsForUser(user) {
        if (user?.role === 'PlatformAdmin') return [...PLATFORM_TABS];
        if (user?.role === 'Owner') return [...OWNER_TABS];
        return OWNER_TABS.filter((tab) => ['management', 'branding', 'member-payment-methods', 'saas-billing', 'backup-history', 'branches', 'member-subscription-requests', 'portal-analytics'].includes(tab) ? false : TAB_PERMISSION_ALTERNATIVES[tab]
            ? TAB_PERMISSION_ALTERNATIVES[tab].some((code) => hasPermission(user, code))
            : hasPermission(user, TAB_PERMISSION_CODES[tab]));
    }

    function firstAccessibleTab(user) {
        return tabsForUser(user)[0] || 'members';
    }

    window.topGymPermissions = Object.freeze({
        ownerTabs: OWNER_TABS,
        platformTabs: PLATFORM_TABS,
        tabPermissionCodes: TAB_PERMISSION_CODES,
        tabPermissionAlternatives: TAB_PERMISSION_ALTERNATIVES,
        permissionLabels: PERMISSION_LABELS,
        tabsForUser,
        firstAccessibleTab,
        hasPermission,
        canAccessTab: (user, tab) => tabsForUser(user).includes(tab),
        labelFor: (code) => PERMISSION_LABELS[code] || code
    });
})();
