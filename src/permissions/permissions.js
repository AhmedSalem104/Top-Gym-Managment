'use strict';

const { ROLES } = require('./roles');

/**
 * The permission catalog is the single source of truth for the API, the
 * Owner permissions screen and the frontend navigation hints.  Only actions
 * that exist in the current application are listed here.
 */
const PERMISSIONS = Object.freeze({
    DASHBOARD_READ: 'dashboard.read',

    MEMBERS_READ: 'members.read',
    MEMBERS_CREATE: 'members.create',
    MEMBERS_UPDATE: 'members.update',
    MEMBERS_DELETE: 'members.delete',
    MEMBERS_ALERTS: 'members.alerts',
    MEMBERS_PRINT: 'members.print',

    MEMBERSHIPS_READ: 'memberships.read',
    MEMBERSHIPS_CREATE: 'memberships.create',
    MEMBERSHIPS_UPDATE: 'memberships.update',
    MEMBERSHIPS_FREEZE: 'memberships.freeze',
    MEMBERSHIPS_RENEW: 'memberships.renew',

    MEMBERSHIP_CODES_READ: 'membership_codes.read',
    MEMBERSHIP_CODES_REVEAL: 'membership_codes.reveal',
    MEMBERSHIP_CODES_RESEND: 'membership_codes.resend',
    MEMBERSHIP_CODES_ROTATE: 'membership_codes.rotate',

    PAYMENTS_CREATE: 'payments.create',
    PAYMENTS_REFUND: 'payments.refund',

    TRAINEES_READ: 'trainees.read',
    TRAINEES_CREATE: 'trainees.create',

    COACHING_READ: 'coaching.read',
    COACHING_CREATE: 'coaching.create',
    COACHING_UPDATE: 'coaching.update',
    COACHING_DELETE: 'coaching.delete',

    ATTENDANCE_READ: 'attendance.read',
    ATTENDANCE_CHECK_IN: 'attendance.check_in',
    ATTENDANCE_CHECK_OUT: 'attendance.check_out',
    ATTENDANCE_REPORT: 'attendance.report',

    FINANCE_READ: 'finance.read',
    FINANCE_CREATE: 'finance.create',
    FINANCE_UPDATE: 'finance.update',
    FINANCE_DELETE: 'finance.delete',

    REPORTS_READ: 'reports.read',
    REPORTS_EXPORT: 'reports.export',

    PRICING_READ: 'pricing.read',
    PRICING_CREATE: 'pricing.create',
    PRICING_UPDATE: 'pricing.update',

    DAY_PASSES_READ: 'day_passes.read',
    DAY_PASSES_CREATE: 'day_passes.create',
    DAY_PASSES_UPDATE: 'day_passes.update',
    DAY_PASSES_DELETE: 'day_passes.delete',
    DAY_PASSES_WHATSAPP: 'day_passes.whatsapp',

    LIBRARY_READ: 'library.read',
    LIBRARY_CREATE: 'library.create',
    LIBRARY_UPDATE: 'library.update',
    LIBRARY_DELETE: 'library.delete',

    MANAGEMENT_USERS_READ: 'management.users.read',
    MANAGEMENT_USERS_CREATE: 'management.users.create',
    MANAGEMENT_USERS_UPDATE: 'management.users.update',
    MANAGEMENT_USERS_STATUS: 'management.users.status',
    MANAGEMENT_USERS_DELETE: 'management.users.delete',
    MANAGEMENT_BACKUP_READ: 'management.backup.read',
    MANAGEMENT_BACKUP_CREATE: 'management.backup.create',
    MANAGEMENT_BACKUP_RESTORE: 'management.backup.restore',
    MANAGEMENT_BACKUP_DELETE: 'management.backup.delete',

    FEEDBACK_READ: 'feedback.read',
    PERMISSIONS_MANAGE: 'permissions.manage',

    BRANDING_VIEW: 'branding.view',
    BRANDING_EDIT: 'branding.edit',
    BRANDING_PUBLISH: 'branding.publish',
    BRANDING_RESET: 'branding.reset',

    SAAS_SUBSCRIPTION_READ: 'saas.subscription.read',
    SAAS_SUBSCRIPTION_REQUEST: 'saas.subscription.request',

    INTELLIGENCE_READ: 'intelligence.read',
    INTELLIGENCE_GENERATE: 'intelligence.generate',

    STORE_VIEW: 'store.view',
    STORE_PRODUCTS_MANAGE: 'store.products.manage',
    STORE_INVENTORY_VIEW: 'store.inventory.view',
    STORE_INVENTORY_ADJUST: 'store.inventory.adjust',
    STORE_SALES_CREATE: 'store.sales.create',
    STORE_SALES_VIEW: 'store.sales.view',
    STORE_RETURNS_MANAGE: 'store.returns.manage',
    STORE_PURCHASES_MANAGE: 'store.purchases.manage',
    STORE_SUPPLIERS_MANAGE: 'store.suppliers.manage',
    STORE_EXPENSES_MANAGE: 'store.expenses.manage',
    STORE_REPORTS_VIEW: 'store.reports.view',
    STORE_PROFIT_VIEW: 'store.profit.view'
});

const CATALOG_DEFINITIONS = [
    ['dashboard.read', 'لوحة التحكم', 'عرض لوحة التحكم والتحليلات التشغيلية.', 'dashboard', 'عرض'],
    ['members.read', 'المشتركون', 'عرض قائمة المشتركين وتفاصيل ملفاتهم.', 'members', 'عرض'],
    ['members.create', 'إضافة مشترك', 'إنشاء ملف المشترك وعضويته الأولية بدون تحصيل دفعة؛ تحصيل المبلغ يحتاج صلاحية تسجيل دفعة.', 'members', 'إضافة'],
    ['members.update', 'تعديل مشترك', 'تعديل بيانات المشترك الأساسية.', 'members', 'تعديل'],
    ['members.delete', 'حذف مشترك', 'حذف ملف المشترك.', 'members', 'حذف'],
    ['members.alerts', 'تسجيل تواصل التنبيهات', 'تسجيل فتح أو إرسال تذكير المشترك.', 'members', 'عملية خاصة'],
    ['members.print', 'طباعة ملف المشترك', 'فتح طباعة ملف المشترك من الواجهة.', 'members', 'تصدير'],
    ['memberships.read', 'عرض العضويات', 'عرض سجل العضويات والتجديدات.', 'memberships', 'عرض'],
    ['memberships.create', 'إنشاء عضوية', 'إنشاء اشتراك جديد للمشترك.', 'memberships', 'إضافة'],
    ['memberships.update', 'تعديل العضوية', 'تحديث بيانات العضوية عبر التدفقات الحالية.', 'memberships', 'تعديل'],
    ['memberships.freeze', 'تجميد العضوية', 'إدارة حالات تجميد العضوية.', 'memberships', 'عملية خاصة'],
    ['memberships.renew', 'تجديد العضوية', 'تجديد العضوية من خلال التدفق الحالي.', 'memberships', 'عملية خاصة'],
    ['membership_codes.read', 'عرض كود بوابة المشترك', 'عرض حالة كود بوابة المشترك من ملف العضو.', 'membership_codes', 'عرض', true],
    ['membership_codes.reveal', 'إظهار كود البوابة', 'إظهار الكود الكامل عند الحاجة.', 'membership_codes', 'عملية خاصة', true],
    ['membership_codes.resend', 'إرسال كود البوابة', 'إعادة إرسال دعوة بوابة المشترك عبر واتساب.', 'membership_codes', 'عملية خاصة', true],
    ['membership_codes.rotate', 'إعادة إصدار كود البوابة', 'إلغاء الكود السابق وإصدار كود جديد.', 'membership_codes', 'عملية خاصة', true],
    ['payments.create', 'تسجيل دفعة', 'إنشاء تحصيل أو دفعة أو اشتراك مدفوع.', 'payments', 'إضافة'],
    ['trainees.read', 'المتدربون الخارجيون', 'عرض المتدربين والملفات المرتبطة بهم.', 'trainees', 'عرض'],
    ['trainees.create', 'إضافة متدرب خارجي', 'إنشاء متدرب خارجي جديد.', 'trainees', 'إضافة'],
    ['coaching.read', 'عرض التدريب والتغذية', 'عرض البرامج وخطط التغذية والقياسات.', 'coaching', 'عرض'],
    ['coaching.create', 'إنشاء تدريب أو تغذية', 'إنشاء برنامج أو خطة أو جلسة أو وجبة.', 'coaching', 'إضافة'],
    ['coaching.update', 'تعديل التدريب والتغذية', 'تعديل البرامج والخطط والقياسات.', 'coaching', 'تعديل'],
    ['coaching.delete', 'حذف التدريب والتغذية', 'حذف البرامج والخطط والقياسات.', 'coaching', 'حذف'],
    ['attendance.read', 'الحضور والانصراف', 'عرض سجل الحضور والانصراف.', 'attendance', 'عرض'],
    ['attendance.check_in', 'تسجيل حضور', 'تسجيل دخول العضو أو الزائر.', 'attendance', 'إضافة'],
    ['attendance.check_out', 'تسجيل انصراف', 'تسجيل انصراف العضو أو الزائر.', 'attendance', 'تعديل'],
    ['attendance.report', 'تقارير الحضور', 'عرض تقارير الحضور التشغيلية.', 'attendance', 'عملية خاصة'],
    ['finance.read', 'البيانات المالية', 'عرض التحصيل والمصروفات والأرصدة والقيم المالية.', 'finance', 'عرض'],
    ['finance.create', 'إضافة مصروف', 'إنشاء مصروف جديد.', 'finance', 'إضافة'],
    ['finance.update', 'تعديل مصروف', 'تعديل مصروف موجود.', 'finance', 'تعديل'],
    ['finance.delete', 'حذف مصروف', 'حذف مصروف موجود.', 'finance', 'حذف'],
    ['reports.read', 'التقارير', 'عرض التقارير غير المالية والتقارير المالية المسموح بها.', 'reports', 'عرض'],
    ['reports.export', 'تصدير التقارير', 'تصدير التقرير الحالي من الواجهة.', 'reports', 'تصدير'],
    ['pricing.read', 'عرض الأسعار', 'عرض كتالوج الباقات وأنواع العضويات.', 'pricing', 'عرض'],
    ['pricing.create', 'إضافة سعر أو نوع', 'إضافة باقة أو نوع عضوية جديد.', 'pricing', 'إضافة'],
    ['pricing.update', 'تعديل الأسعار', 'تعديل أسعار الباقات وأنواع العضويات.', 'pricing', 'تعديل'],
    ['day_passes.read', 'الحصص اليومية', 'عرض الحصص اليومية وأسعارها وملخصها.', 'day_passes', 'عرض'],
    ['day_passes.create', 'إضافة حصة يومية', 'تسجيل دخول حصة يومية جديدة.', 'day_passes', 'إضافة'],
    ['day_passes.update', 'تعديل حصة يومية', 'تعديل حصة يومية موجودة.', 'day_passes', 'تعديل'],
    ['day_passes.delete', 'حذف حصة يومية', 'حذف أو إلغاء حصة يومية.', 'day_passes', 'حذف'],
    ['day_passes.whatsapp', 'رسائل الحصص اليومية', 'فتح أو تسجيل رسالة واتساب للحصة اليومية.', 'day_passes', 'عملية خاصة'],
    ['library.read', 'المكتبة', 'عرض التمارين والأطعمة والعضلات.', 'library', 'عرض'],
    ['library.create', 'إضافة عنصر للمكتبة', 'إضافة تمرين أو طعام أو عضلة.', 'library', 'إضافة'],
    ['library.update', 'تعديل عنصر المكتبة', 'تعديل عنصر موجود في المكتبة.', 'library', 'تعديل'],
    ['library.delete', 'حذف عنصر المكتبة', 'حذف عنصر من المكتبة.', 'library', 'حذف'],
    ['management.users.read', 'عرض حسابات الإدارة', 'عرض حسابات Owner وAssistant.', 'management', 'عرض', true],
    ['management.users.create', 'إضافة Assistant', 'إنشاء حساب Assistant.', 'management', 'إضافة', true],
    ['management.users.update', 'تعديل Assistant', 'تعديل بيانات حساب Assistant.', 'management', 'تعديل', true],
    ['management.users.status', 'تفعيل Assistant', 'تفعيل أو تعطيل حساب Assistant.', 'management', 'عملية خاصة', true],
    ['management.users.delete', 'حذف Assistant', 'حذف حساب Assistant وإلغاء جلساته وصلاحياته.', 'management', 'حذف', true],
    ['management.backup.read', 'عرض النسخ الاحتياطية', 'عرض سجل النسخ الاحتياطية.', 'management', 'عرض', true],
    ['management.backup.create', 'إنشاء نسخة احتياطية', 'إنشاء أو تنزيل نسخة احتياطية.', 'management', 'إضافة', true],
    ['management.backup.restore', 'استعادة نسخة احتياطية', 'استعادة نسخة إلى قاعدة البيانات.', 'management', 'عملية خاصة', true],
    ['management.backup.delete', 'حذف نسخة احتياطية', 'حذف أرشيف نسخة احتياطية.', 'management', 'حذف', true],
    ['feedback.read', 'تقييمات المشتركين', 'عرض تقييمات المشتركين.', 'feedback', 'عرض', true],
    ['permissions.manage', 'إدارة الصلاحيات', 'إدارة صلاحيات حسابات Assistant فقط.', 'permissions', 'إدارة', true],
    ['branding.view', 'عرض تخصيص الهوية', 'عرض إعدادات الهوية ومعاينتها.', 'branding', 'عرض', true],
    ['branding.edit', 'تعديل الهوية', 'تعديل النصوص والألوان والأصول كمسودة.', 'branding', 'تعديل', true],
    ['branding.publish', 'نشر الهوية', 'نشر الهوية المعتمدة على كامل المنصة.', 'branding', 'نشر', true],
    ['branding.reset', 'استعادة الهوية الافتراضية', 'استعادة مسودة الهوية إلى الجيم.', 'branding', 'إدارة', true],
    ['store.view', 'المتجر ونقطة البيع', 'عرض مساحة المتجر ونقطة البيع.', 'store', 'عرض'],
    ['store.products.manage', 'منتجات المتجر', 'إضافة وتعديل وإيقاف المنتجات والتصنيفات.', 'store', 'إدارة'],
    ['store.inventory.view', 'عرض المخزون', 'عرض الأرصدة والتنبيهات الخاصة بالمخزون.', 'store', 'عرض'],
    ['store.inventory.adjust', 'تسويات المخزون', 'تسجيل تسويات مخزون قابلة للتدقيق.', 'store', 'إدارة'],
    ['store.sales.create', 'إنشاء مبيعات المتجر', 'إتمام مبيعات POS للأعضاء والزوار.', 'store', 'إضافة'],
    ['store.sales.view', 'عرض مبيعات المتجر', 'عرض الفواتير وسجل المبيعات.', 'store', 'عرض'],
    ['store.returns.manage', 'مرتجعات المتجر', 'إدارة المرتجعات والاستردادات.', 'store', 'إدارة'],
    ['store.purchases.manage', 'مشتريات المتجر', 'استلام مشتريات الموردين وتحديث المخزون.', 'store', 'إدارة'],
    ['store.suppliers.manage', 'موردو المتجر', 'إدارة بيانات الموردين.', 'store', 'إدارة'],
    ['store.expenses.manage', 'مصروفات المتجر', 'إدارة المصروفات التابعة لمركز تكلفة المتجر.', 'store', 'إدارة'],
    ['store.reports.view', 'تقارير المتجر', 'عرض تقارير المبيعات والمخزون والتشغيل.', 'store', 'عرض'],
    ['store.profit.view', 'ربحية المتجر', 'عرض التكلفة وCOGS والربح الإجمالي والصافي.', 'store', 'حساس'],
    ['intelligence.read', 'عرض الذكاء التشغيلي', 'عرض ملخصات الذكاء التشغيلي وتحليل الأعضاء.', 'intelligence', 'عرض'],
    ['intelligence.generate', 'توليد اقتراحات الذكاء', 'إنشاء أو تعديل اقتراحات التدريب والتغذية بواسطة الذكاء الاصطناعي.', 'intelligence', 'إنشاء']
];

CATALOG_DEFINITIONS.push(
    ['saas.subscription.read', 'اشتراك المنصة', 'عرض حالة اشتراك الجيم في منصة الجيم والخطط المتاحة.', 'saas', 'عرض', true],
    ['saas.subscription.request', 'طلب اشتراك المنصة', 'إنشاء طلب اشتراك ورفع إثبات الدفع للمراجعة.', 'saas', 'إدارة', true]
);

CATALOG_DEFINITIONS.splice(
    CATALOG_DEFINITIONS.findIndex((item) => item[0] === 'trainees.read'),
    0,
    ['payments.refund', '\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0634\u062a\u0631\u0627\u0643', '\u062a\u0633\u062c\u064a\u0644 \u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0645\u0628\u0644\u063a \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0648\u062a\u062d\u062f\u064a\u062b \u0631\u0635\u064a\u062f \u0627\u0644\u0639\u0636\u0648.', 'payments', '\u0639\u0645\u0644\u064a\u0629 \u062e\u0627\u0635\u0629', true]
);

const PERMISSION_CATALOG = Object.freeze(CATALOG_DEFINITIONS.map(([code, label, description, group, operation, ownerOnly = false]) => Object.freeze({
    code,
    label,
    description,
    group,
    operation,
    ownerOnly
})));

const KNOWN_PERMISSION_CODES = new Set(PERMISSION_CATALOG.map((item) => item.code));

// These grants preserve the current Assistant route surface for accounts
// that already existed before this permission system was introduced.
const LEGACY_ASSISTANT_DEFAULT_PERMISSIONS = Object.freeze([
    'members.read', 'members.create', 'members.update', 'members.delete', 'members.alerts', 'members.print',
    'memberships.read', 'memberships.create', 'memberships.update', 'memberships.freeze', 'memberships.renew',
    'payments.create',
    'trainees.read', 'trainees.create',
    'coaching.read', 'coaching.create', 'coaching.update', 'coaching.delete',
    'attendance.read', 'attendance.check_in', 'attendance.check_out', 'attendance.report',
    'pricing.read',
    'day_passes.read', 'day_passes.create', 'day_passes.update', 'day_passes.delete', 'day_passes.whatsapp',
    'library.read', 'library.create', 'library.update', 'library.delete',
    'intelligence.read', 'intelligence.generate'
]);

// New Assistant accounts start with the operational read/create/update path;
// destructive, financial, reporting and configuration capabilities stay off
// until the Owner explicitly grants them.
const SAFE_ASSISTANT_DEFAULT_PERMISSIONS = Object.freeze([
    'members.read', 'members.create', 'members.update', 'members.print',
    'memberships.read', 'memberships.create', 'memberships.update',
    'trainees.read', 'trainees.create',
    'coaching.read', 'coaching.create', 'coaching.update',
    'attendance.read', 'attendance.check_in', 'attendance.check_out', 'attendance.report',
    'pricing.read',
    'day_passes.read',
    'library.read',
    'intelligence.read', 'intelligence.generate'
]);

const OWNER_ONLY_PERMISSION_CODES = new Set(PERMISSION_CATALOG.filter((item) => item.ownerOnly).map((item) => item.code));

const TAB_PERMISSION_CODES = Object.freeze({
    dashboard: PERMISSIONS.DASHBOARD_READ,
    members: PERMISSIONS.MEMBERS_READ,
    trainees: PERMISSIONS.TRAINEES_READ,
    attendance: PERMISSIONS.ATTENDANCE_READ,
    expenses: PERMISSIONS.FINANCE_READ,
    library: PERMISSIONS.LIBRARY_READ,
    reports: PERMISSIONS.REPORTS_READ,
    feedback: PERMISSIONS.FEEDBACK_READ,
    management: 'pricing.read',
    store: PERMISSIONS.STORE_VIEW,
    permissions: PERMISSIONS.PERMISSIONS_MANAGE,
    intelligence: PERMISSIONS.INTELLIGENCE_READ
});

function permissionsForRole(role) {
    if (role === ROLES.OWNER) return ['*'];
    return [...SAFE_ASSISTANT_DEFAULT_PERMISSIONS];
}

function hasPermission(user, permission) {
    if (!user) return false;
    if (Array.isArray(permission)) return permission.every((item) => hasPermission(user, item));
    if (user.role === ROLES.OWNER || user.role === ROLES.PLATFORM_ADMIN) return true;
    const granted = new Set(Array.isArray(user.permissions) ? user.permissions : []);
    return granted.has('*') || granted.has(permission);
}

function permissionCatalog() {
    return PERMISSION_CATALOG.map((item) => ({ ...item }));
}

module.exports = {
    KNOWN_PERMISSION_CODES,
    LEGACY_ASSISTANT_DEFAULT_PERMISSIONS,
    OWNER_ONLY_PERMISSION_CODES,
    PERMISSION_CATALOG,
    PERMISSIONS,
    SAFE_ASSISTANT_DEFAULT_PERMISSIONS,
    TAB_PERMISSION_CODES,
    hasPermission,
    permissionCatalog,
    permissionsForRole
};
