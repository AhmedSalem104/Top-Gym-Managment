(() => {
    'use strict';

    if (window.topGymFeatureManifest) return;

    // Route metadata is kept separate from the loader so adding a feature does
    // not make the runtime loader itself another monolith. The loader remains
    // responsible for ordering, deduplication and failure handling.
    const features = {
        dashboard: { dependencies: [], styles: [], scripts: [] },
        'dashboard-enhancements': { dependencies: ['finance', 'phone-inputs', 'whatsapp-templates'], styles: [], scripts: ['/js/day-passes.js?v=8', '/js/alerts-enhancements.js?v=10'] },
        finance: { dependencies: [], styles: [], scripts: ['/js/pages/finance/monthly-finance.js?v=20'] },
        'member-details': { dependencies: ['phone-inputs'], styles: [], scripts: ['/js/member-details-ui.js?v=6', '/js/member-portal-admin.js?v=4', '/js/member-coaching-summary.js?v=2'] },
        members: {
            dependencies: ['phone-inputs'],
            styles: ['/css/pages/members.css?v=attendance-compact', '/css/pages/memberships.css?v=phase2', '/css/pages/attendance.css?v=attendance-compact'],
            scripts: ['/js/design-enhancements.js?v=4', '/js/pages/members/action-menu.js?v=7', '/js/pagination.js?v=2', '/js/pages/attendance/attendance.js?v=attendance-compact']
        },
        coaching: { dependencies: ['phone-inputs'], dialogs: [{ source: '/dialogs/coaching.html?v=phase4', ids: ['externalTraineeDialog', 'coachingProfileDialog', 'coachingBuilderDialog'] }], styles: [], scripts: ['/js/exercise-assets.js?v=5', '/js/muscle-assets.js?v=3', '/js/pages/coaching/coaching.js?v=19'] },
        print: { dependencies: ['phone-inputs'], styles: [], scripts: ['/js/exercise-assets.js?v=5', '/js/integrations/print-enhancements.js?v=14'] },
        expenses: { dependencies: ['finance'], styles: ['/css/pages/expenses.css?v=phase2'], scripts: [] },
        reports: { dependencies: ['phone-inputs', 'whatsapp-templates'], styles: ['/css/pages/reports.css?v=phase2'], scripts: ['/js/pages/reports/reports.js?v=10', '/js/day-pass-reports.js?v=2'] },
        feedback: { dependencies: ['phone-inputs'], styles: ['/css/pages/member-feedback.css?v=phase2'], scripts: ['/js/pages/management/member-feedback.js?v=1'] },
        management: { dependencies: [], styles: ['/css/pages/memberships.css?v=phase2'], scripts: ['/js/pricing-cards.js?v=1'] },
        branding: { dependencies: [], styles: ['/css/pages/branding.css?v=phase2'], scripts: ['/js/pages/branding/branding.js?v=2'] },
        'member-payment-methods': { dependencies: [], styles: ['/css/pages/member-payment-methods.css?v=phase2'], scripts: ['/js/pages/management/member-payment-methods.js?v=1'] },
        'saas-billing': { dependencies: [], styles: ['/css/pages/saas.css?v=phase2'], scripts: ['/js/pages/saas/saas.js?v=6'] },
        'backup-history': { dependencies: [], dialogs: [{ source: '/dialogs/backup.html?v=phase4', ids: ['backupRestoreDialog'] }], styles: [], scripts: ['/js/pages/management/backup.js?v=11'] },
        'member-subscription-requests': { dependencies: [], styles: ['/css/pages/member-subscription-requests.css?v=phase2'], scripts: ['/js/pages/management/member-subscription-requests.js?v=4'] },
        'portal-analytics': { dependencies: [], styles: ['/css/pages/portal-analytics.css?v=phase2'], scripts: ['/js/pages/management/portal-analytics.js?v=1'] },
        permissions: { dependencies: [], dialogs: [{ source: '/dialogs/permissions.html?v=phase4', ids: ['authUserDialog'] }], styles: ['/css/pages/permissions.css?v=phase2'], scripts: ['/js/pages/management/permissions.js?v=4', '/js/pages/management/auth-users.js?v=3'] },
        attendance: { dependencies: ['phone-inputs'], styles: ['/css/pages/attendance.css?v=attendance-compact'], scripts: ['/js/pages/attendance/attendance.js?v=attendance-compact'] },
        library: { dependencies: [], dialogs: [{ source: '/dialogs/library.html?v=phase4', ids: ['libraryFormDialog', 'libraryDetailsDialog'] }], styles: ['/css/pages/library.css?v=phase2'], scripts: ['/js/exercise-assets.js?v=5', '/js/muscle-assets.js?v=3', '/js/food-assets.js?v=1', '/js/pages/library/library.js?v=13'] },
        trainees: { dependencies: ['coaching'], styles: ['/css/pages/trainees.css?v=phase2', '/css/pages/coaching.css?v=phase2', '/css/pages/nutrition.css?v=phase2'], scripts: [] },
        intelligence: { dependencies: ['phone-inputs'], styles: ['/css/pages/intelligence.css?v=phase2'], scripts: ['/js/pages/intelligence/intelligence.js?v=3'] },
        store: { dependencies: ['phone-inputs'], styles: ['/css/pages/store.css?v=phase2', '/css/components/bar-pos.css?v=phase2'], scripts: ['/js/pages/store/store.js?v=1', '/js/pages/store/bar-pos.js?v=1'] },
        'smart-assistant': { dependencies: [], styles: [], scripts: ['/js/smart-assistant.js?v=5'] },
        'phone-inputs': { dependencies: [], styles: [], scripts: ['/js/core/phone-inputs.js?v=12'] },
        'whatsapp-templates': { dependencies: [], styles: ['/css/pages/whatsapp-templates.css?v=1'], scripts: ['/js/core/whatsapp-templates.js?v=1', '/js/pages/management/whatsapp-templates.js?v=1'] }
    };

    const externalAssets = {
        qrcode: 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js',
        'html5-qrcode': 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
        sweetalert: 'https://cdn.jsdelivr.net/npm/sweetalert2@11'
    };

    window.topGymFeatureManifest = Object.freeze(features);
    window.topGymExternalAssets = Object.freeze(externalAssets);
})();
