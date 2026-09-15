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
    // Commercial visibility is derived from the same effective-entitlement
    // envelope returned by the server. Permissions still control the user's
    // actions inside a surface; entitlements control whether the surface is
    // part of the current product at all.
    const TAB_FEATURES = Object.freeze({
        dashboard: 'dashboard',
        members: 'members',
        attendance: 'attendance',
        reports: 'reports',
        trainees: 'coaching',
        intelligence: 'ai',
        management: 'pricing',
        branding: 'branding',
        'member-payment-methods': 'payments',
        permissions: 'team',
        expenses: 'finance',
        library: 'library',
        store: 'store',
        branches: 'branches',
        'backup-history': 'backup',
        'member-subscription-requests': 'members',
        'portal-analytics': 'portal'
    });
    const FEATURE_LABELS = Object.freeze({
        dashboard: 'لوحة التحكم',
        members: 'إدارة المشتركين',
        attendance: 'الحضور والانصراف',
        reports: 'التقارير',
        coaching: 'التدريب والتغذية',
        ai: 'الذكاء التشغيلي',
        pricing: 'الأسعار والعضويات',
        branding: 'تخصيص الهوية',
        payments: 'المدفوعات',
        finance: 'المالية',
        library: 'المكتبة',
        store: 'المتجر',
        branches: 'الفروع',
        team: 'إدارة الفريق',
        portal: 'بوابة العضو'
    });
    const entitlementState = {
        status: 'loading',
        tenantStatus: null,
        subscription: null,
        entitlements: null,
        error: null,
        revision: 0
    };
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
        // Independent Trainers use the dedicated trainer workspace. Never
        // expose the Gym application navigation even though their owner role
        // is also named Owner in the shared authentication model.
        if (String(user?.tenantType || '').trim().toLowerCase() === 'independent_trainer') return [];
        if (user?.role === 'Owner') return [...OWNER_TABS];
        return OWNER_TABS.filter((tab) => ['management', 'branding', 'member-payment-methods', 'saas-billing', 'backup-history', 'branches', 'member-subscription-requests', 'portal-analytics'].includes(tab) ? false : TAB_PERMISSION_ALTERNATIVES[tab]
            ? TAB_PERMISSION_ALTERNATIVES[tab].some((code) => hasPermission(user, code))
            : hasPermission(user, TAB_PERMISSION_CODES[tab]));
    }

    function normalizeFeatureKey(featureKey) {
        const key = String(featureKey || '').trim();
        return ({ intelligence: 'ai' }[key] || key);
    }

    function setEntitlements(payload = null, status = 'ready') {
        if (status === 'loading') {
            entitlementState.status = 'loading';
            entitlementState.error = null;
            entitlementState.revision += 1;
            return getEntitlementState();
        }
        entitlementState.status = status === 'ready' && payload ? 'ready' : (status || 'error');
        entitlementState.tenantStatus = payload?.tenantStatus || payload?.entitlements?.tenantStatus || null;
        entitlementState.subscription = payload?.subscription || payload?.entitlements?.subscription || null;
        entitlementState.entitlements = payload?.entitlements || payload || null;
        entitlementState.error = status === 'error' ? (payload?.error || 'ENTITLEMENTS_NOT_READY') : null;
        entitlementState.revision += 1;
        return getEntitlementState();
    }

    function getEntitlementState() {
        return {
            status: entitlementState.status,
            tenantStatus: entitlementState.tenantStatus,
            subscription: entitlementState.subscription,
            entitlements: entitlementState.entitlements,
            error: entitlementState.error,
            revision: entitlementState.revision
        };
    }

    function featureCatalogEntry(featureKey) {
        const key = normalizeFeatureKey(featureKey);
        const catalog = entitlementState.entitlements?.featureCatalog;
        return Array.isArray(catalog) ? catalog.find((feature) => normalizeFeatureKey(feature?.key) === key) || null : null;
    }

    function subscriptionStatus() {
        const value = String(entitlementState.subscription?.status || '').trim().toLowerCase();
        if (value) return value;
        const expiresAt = entitlementState.subscription?.expiresAt || entitlementState.subscription?.expires_at;
        if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return 'expired';
        return '';
    }

    function getFeatureAccess(featureKey, user = null) {
        const key = normalizeFeatureKey(featureKey);
        if (user?.role === 'PlatformAdmin') return { allowed: true, state: 'platform', feature: key, plan: null };
        if (entitlementState.status !== 'ready' || !entitlementState.entitlements) {
            return { allowed: false, state: entitlementState.status === 'error' ? 'not_ready' : 'pending', feature: key, plan: null };
        }
        const status = subscriptionStatus();
        if (['suspended'].includes(status) || ['suspended', 'disabled', 'archived'].includes(String(entitlementState.tenantStatus || '').toLowerCase())) {
            return { allowed: false, state: 'suspended', feature: key, plan: entitlementState.subscription?.plan || null };
        }
        if (!['active', 'trial'].includes(status)) {
            return { allowed: false, state: 'expired', feature: key, plan: entitlementState.subscription?.plan || null };
        }
        const catalogEntry = featureCatalogEntry(key);
        const tenantType = String(entitlementState.entitlements?.tenantType || user?.tenantType || '').toLowerCase();
        if (!catalogEntry || (catalogEntry.tenantTypes && !catalogEntry.tenantTypes.map((item) => String(item).toLowerCase()).includes(tenantType))) {
            return { allowed: false, state: 'not_included', feature: key, plan: entitlementState.subscription?.plan || null, catalogEntry };
        }
        const features = entitlementState.entitlements?.features || {};
        const enabled = features[key] ?? features[featureKey];
        // The server returns a complete, normalized feature map. A missing
        // key is therefore a model/readiness problem, not an implicit grant.
        // Fail closed so a partial or stale envelope can never expose a paid
        // surface in the client.
        if (enabled !== true && enabled !== 1 && enabled !== '1' && String(enabled).toLowerCase() !== 'true') {
            return { allowed: false, state: 'not_included', feature: key, plan: entitlementState.subscription?.plan || null, catalogEntry };
        }
        return { allowed: true, state: 'available', feature: key, plan: entitlementState.subscription?.plan || null, catalogEntry };
    }

    function canUseFeature(featureKey, user = null) {
        return getFeatureAccess(featureKey, user).allowed === true;
    }

    function featureForTab(tab) {
        return TAB_FEATURES[String(tab || '').trim()] || null;
    }

    function firstAccessibleTab(user) {
        return tabsForUser(user)[0] || 'members';
    }

    window.topGymPermissions = Object.freeze({
        ownerTabs: OWNER_TABS,
        platformTabs: PLATFORM_TABS,
        tabPermissionCodes: TAB_PERMISSION_CODES,
        tabPermissionAlternatives: TAB_PERMISSION_ALTERNATIVES,
        tabFeatures: TAB_FEATURES,
        permissionLabels: PERMISSION_LABELS,
        tabsForUser,
        firstAccessibleTab,
        hasPermission,
        canAccessTab: (user, tab) => tabsForUser(user).includes(tab),
        featureForTab,
        featureLabel: (featureKey) => FEATURE_LABELS[normalizeFeatureKey(featureKey)] || featureKey,
        setEntitlements,
        getEntitlementState,
        getFeatureAccess,
        canUseFeature,
        labelFor: (code) => PERMISSION_LABELS[code] || code
    });
})();
