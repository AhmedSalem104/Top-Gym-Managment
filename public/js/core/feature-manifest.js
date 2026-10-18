(() => {
    'use strict';

    if (window.topGymFeatureManifest) return;

    // Route metadata is kept separate from the loader so adding a feature does
    // not make the runtime loader itself another monolith. The loader remains
    // responsible for ordering, deduplication and failure handling.
    const features = {
        dashboard: { dependencies: [], styles: [], scripts: [] },
        'dashboard-enhancements': { dependencies: ['finance', 'phone-inputs', 'whatsapp-runtime'], styles: [], scripts: ['/js/day-passes.js?v=dc08aea3211454bb', '/js/alerts-enhancements.js?v=2e544843569c67e1'] },
        finance: { dependencies: [], styles: [], scripts: ['/js/pages/finance/monthly-finance.js?v=7babea564de77758'] },
        'member-details': { dependencies: ['phone-inputs'], styles: ['/css/components/member-digital-card.css?v=dc8c1f5431afd8a9'], scripts: ['/js/member-digital-card.js?v=0d790612fb89c91c', '/js/member-details-ui.js?v=d77efb7c54c2101b', '/js/member-portal-admin.js?v=2cfe4527c5945568', '/js/member-coaching-summary.js?v=3a03f0385ae1a7c4'] },
        members: {
            dependencies: ['phone-inputs'],
            styles: ['/css/components/member-digital-card.css?v=dc8c1f5431afd8a9', '/css/pages/members.css?v=10359bb5b637a417', '/css/pages/memberships.css?v=faba33da02e60266', '/css/pages/attendance.css?v=0084361639c8be97'],
            scripts: ['/js/member-digital-card.js?v=0d790612fb89c91c', '/js/design-enhancements.js?v=7cb3534cdb088420', '/js/pages/members/action-menu.js?v=5fbf53dc6091090c', '/js/pagination.js?v=1b3ed821f3d06ef7', '/js/pages/attendance/attendance.js?v=ea2b366f93949e69']
        },
        coaching: { dependencies: ['phone-inputs'], dialogs: [{ source: '/dialogs/coaching.html?v=fd46e3e838a9f25f', ids: ['externalTraineeDialog', 'coachingProfileDialog', 'coachingBuilderDialog'] }], styles: ['/css/pages/coaching.css?v=562410b687a81637'], scripts: ['/js/exercise-assets.js?v=eaa0cc582e5ca1e2', '/js/muscle-assets.js?v=b9a3cbb54908d372', '/js/pages/coaching/coaching.js?v=f4b4ae788110e51d'] },
        print: { dependencies: ['phone-inputs'], styles: [], scripts: ['/js/exercise-assets.js?v=eaa0cc582e5ca1e2', '/js/integrations/print-enhancements.js?v=814c3856bae7d892'] },
        expenses: { dependencies: ['finance'], styles: ['/css/pages/expenses.css?v=6f85206e946ae9aa'], scripts: [] },
        reports: { dependencies: ['phone-inputs', 'whatsapp-runtime'], styles: ['/css/pages/reports.css?v=939eace50aaa371b'], scripts: ['/js/pages/reports/reports.js?v=8a5bee2144b303da', '/js/day-pass-reports.js?v=e2c0f146d5770ddf'] },
        feedback: { dependencies: ['phone-inputs'], styles: ['/css/pages/member-feedback.css?v=a456214d2b03010c'], scripts: ['/js/pages/management/member-feedback.js?v=7dd9c3dfa910e254'] },
        management: { dependencies: [], styles: ['/css/pages/memberships.css?v=faba33da02e60266'], scripts: ['/js/pricing-cards.js?v=1cde4f015c486158'] },
        branding: { dependencies: [], styles: ['/css/pages/branding.css?v=ea39cc8ee328ed3a'], scripts: ['/js/pages/branding/branding.js?v=45d5109ed0894dca'] },
        'member-payment-methods': { dependencies: [], styles: ['/css/pages/member-payment-methods.css?v=2ad87db27d7f7f63'], scripts: ['/js/pages/management/member-payment-methods.js?v=04c55f9eaed5899a'] },
        'saas-billing': { dependencies: [], styles: ['/css/pages/saas.css?v=e6c87e7bfc3d3da5'], scripts: ['/js/pages/saas/saas.js?v=5e467e2ca4cb392b'] },
        'backup-history': { dependencies: [], dialogs: [{ source: '/dialogs/backup.html?v=70e6e8d8ebdf6a5a', ids: ['backupRestoreDialog'] }], styles: [], scripts: ['/js/pages/management/backup.js?v=acf0ccb2fea58125'] },
        'member-subscription-requests': { dependencies: [], styles: ['/css/pages/member-subscription-requests.css?v=b1738b3346037492'], scripts: ['/js/pages/management/member-subscription-requests.js?v=59bdc7a9c38cb326'] },
        'portal-analytics': { dependencies: [], styles: ['/css/pages/portal-analytics.css?v=1c97f396bef6694b'], scripts: ['/js/pages/management/portal-analytics.js?v=6ee02804bcf15ebd'] },
        permissions: { dependencies: [], dialogs: [{ source: '/dialogs/permissions.html?v=607567176d80280e', ids: ['authUserDialog'] }], styles: ['/css/pages/permissions.css?v=bd0a22918e83ac5a'], scripts: ['/js/pages/management/permissions.js?v=4756391c15a9ab22', '/js/pages/management/auth-users.js?v=1a7d17c0eb008225'] },
        attendance: { dependencies: ['phone-inputs'], styles: ['/css/components/member-digital-card.css?v=dc8c1f5431afd8a9', '/css/pages/attendance.css?v=0084361639c8be97'], scripts: ['/js/member-digital-card.js?v=0d790612fb89c91c', '/js/pages/attendance/attendance.js?v=ea2b366f93949e69'] },
        library: { dependencies: [], dialogs: [{ source: '/dialogs/library.html?v=d15a45e867cac198', ids: ['libraryFormDialog', 'libraryDetailsDialog'] }], styles: ['/css/pages/library.css?v=d87b430be323153a'], scripts: ['/js/exercise-assets.js?v=eaa0cc582e5ca1e2', '/js/muscle-assets.js?v=b9a3cbb54908d372', '/js/food-assets.js?v=18fa0c5bae175276', '/js/pages/library/library.js?v=b3f2c18553692b9b'] },
        trainees: { dependencies: ['coaching'], styles: ['/css/pages/trainees.css?v=85501e7dd1dd9bae', '/css/pages/coaching.css?v=562410b687a81637', '/css/pages/nutrition.css?v=21a249b3117a23bd'], scripts: [] },
        intelligence: { dependencies: ['phone-inputs'], styles: ['/css/pages/intelligence.css?v=3b922ec63d5c254b'], scripts: ['/js/pages/intelligence/intelligence.js?v=e1506d50254aa0d4'] },
        store: { dependencies: ['phone-inputs'], styles: ['/css/pages/store.css?v=20477027870a073f', '/css/components/bar-pos.css?v=d45ae279500e2294'], scripts: ['/js/pages/store/store.js?v=47596bcc05fb9954', '/js/pages/store/bar-pos.js?v=dba6b9537485d068'] },
        'smart-assistant': { dependencies: [], styles: [], scripts: ['/js/smart-assistant.js?v=2b9baccaf78d34f7'] },
        'phone-inputs': { dependencies: [], styles: [], scripts: ['/js/core/phone-inputs.js?v=50f9b012b00cdd57'] },
        'whatsapp-runtime': { dependencies: [], styles: [], scripts: ['/js/core/whatsapp-templates.js?v=b3a05b6c3e246d1c'] }
    };

    const externalAssets = {
        qrcode: 'https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js',
        'html5-qrcode': 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',
        sweetalert: 'https://cdn.jsdelivr.net/npm/sweetalert2@11'
    };

    window.topGymFeatureManifest = Object.freeze(features);
    window.topGymExternalAssets = Object.freeze(externalAssets);
})();
