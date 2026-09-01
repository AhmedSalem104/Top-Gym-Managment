'use strict';

const { PERMISSIONS } = require('./permissions');

const ROUTE_PERMISSION_RULES = Object.freeze([
    { pattern: /^\/saas\/subscription$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.SAAS_SUBSCRIPTION_READ] },
    { pattern: /^\/saas\/plans$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.SAAS_SUBSCRIPTION_READ] },
    { pattern: /^\/saas\/subscription-requests$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.SAAS_SUBSCRIPTION_READ] },
    { pattern: /^\/saas\/subscription-requests$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.SAAS_SUBSCRIPTION_REQUEST] },
    { pattern: /^\/saas\/subscription-requests\/\d+\/proof$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.SAAS_SUBSCRIPTION_REQUEST] },
    { pattern: /^\/portal\/analytics$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.PORTAL_ANALYTICS_READ] },
    { pattern: /^\/member-subscription-requests$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.MEMBER_SUBSCRIPTION_REQUESTS_READ] },
    { pattern: /^\/member-subscription-requests\/proofs\/\d+\/file$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.MEMBER_SUBSCRIPTION_REQUESTS_READ] },
    { pattern: /^\/member-subscription-requests\/\d+\/(?:approve|reject)$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.MEMBER_SUBSCRIPTION_REQUESTS_REVIEW] },
    { pattern: /^\/auth\/permissions(?:\/|$)/, methods: ['GET', 'PUT', 'POST'], all: [PERMISSIONS.PERMISSIONS_MANAGE], ownerOnly: true },
    { pattern: /^\/branding\/settings$/, methods: ['GET'], all: [PERMISSIONS.BRANDING_VIEW], ownerOnly: true },
    { pattern: /^\/branding\/draft-assets\/[^/]+$/, methods: ['GET'], all: [PERMISSIONS.BRANDING_VIEW], ownerOnly: true },
    { pattern: /^\/branding\/draft$/, methods: ['PUT'], all: [PERMISSIONS.BRANDING_EDIT], ownerOnly: true },
    { pattern: /^\/branding\/publish$/, methods: ['POST'], all: [PERMISSIONS.BRANDING_PUBLISH], ownerOnly: true },
    { pattern: /^\/branding\/reset$/, methods: ['POST'], all: [PERMISSIONS.BRANDING_RESET], ownerOnly: true },
    { pattern: /^\/branding\/assets$/, methods: ['POST'], all: [PERMISSIONS.BRANDING_EDIT], ownerOnly: true },
    { pattern: /^\/branding\/assets\/[^/]+$/, methods: ['DELETE'], all: [PERMISSIONS.BRANDING_EDIT], ownerOnly: true },
    { pattern: /^\/auth\/users(?:\/|$)/, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], ownerOnly: true, byMethod: {
        GET: [PERMISSIONS.MANAGEMENT_USERS_READ],
        POST: [PERMISSIONS.MANAGEMENT_USERS_CREATE],
        PUT: [PERMISSIONS.MANAGEMENT_USERS_UPDATE],
        PATCH: [PERMISSIONS.MANAGEMENT_USERS_STATUS],
        DELETE: [PERMISSIONS.MANAGEMENT_USERS_DELETE]
    } },
    { pattern: /^\/members\/\d+\/membership-code$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.MEMBERSHIP_CODES_READ] },
    { pattern: /^\/members\/\d+\/membership-code\/reveal$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.MEMBERSHIP_CODES_REVEAL] },
    { pattern: /^\/members\/\d+\/membership-code\/resend$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.MEMBERSHIP_CODES_RESEND] },
    { pattern: /^\/members\/\d+\/membership-code\/rotate$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.MEMBERSHIP_CODES_ROTATE] },
    { pattern: /^\/member-feedback(?:\/|$)/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.FEEDBACK_READ] },
    { pattern: /^\/backup\/archives\/\d+$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_READ] },
    { pattern: /^\/backup\/archives\/\d+$/, methods: ['DELETE'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_DELETE] },
    { pattern: /^\/backup\/history(?:\/|$)/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_READ] },
    { pattern: /^\/backup\/download(?:\/|$)/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_CREATE] },
    { pattern: /^\/backup\/status$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_READ] },
    { pattern: /^\/backup\/records$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_CREATE] },
    { pattern: /^\/backup\/records\/\d+\/download$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_READ] },
    { pattern: /^\/backup\/records\/\d+\/restore$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_RESTORE] },
    { pattern: /^\/backup\/records\/\d+$/, methods: ['DELETE'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_DELETE] },
    { pattern: /^\/backup\/daily(?:\/|$)/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_CREATE] },
    { pattern: /^\/backup\/inspect(?:\/|$)/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_READ] },
    { pattern: /^\/backup\/restore(?:\/|$)/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.MANAGEMENT_BACKUP_RESTORE] },

    { pattern: /^\/dashboard(?:-analytics)?(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.DASHBOARD_READ] },
    { pattern: /^\/bootstrap(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.DASHBOARD_READ] },

    { pattern: /^\/members\/\d+\/refund-preview$/, methods: ['GET'], ownerOnly: true, all: [PERMISSIONS.PAYMENTS_REFUND] },
    { pattern: /^\/members\/\d+\/refund$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.PAYMENTS_REFUND] },
    { pattern: /^\/members(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.MEMBERS_READ, PERMISSIONS.MEMBERSHIPS_READ] },
    // Registering a new member is one operational action. The initial
    // membership is created as part of that atomic onboarding flow, while
    // collecting money remains conditional on payments.create below.
    { pattern: /^\/members(?:\/|$)/, methods: ['POST'], all: [PERMISSIONS.MEMBERS_CREATE] },
    { pattern: /^\/members\/\d+\/alert-communications$/, methods: ['POST'], all: [PERMISSIONS.MEMBERS_ALERTS] },
    { pattern: /^\/members\/\d+\/(?:freeze|resume)$/, methods: ['POST'], all: [PERMISSIONS.MEMBERSHIPS_FREEZE] },
    { pattern: /^\/members\/\d+\/renew$/, methods: ['POST'], all: [PERMISSIONS.MEMBERSHIPS_RENEW, PERMISSIONS.PAYMENTS_CREATE] },
    { pattern: /^\/members\/\d+\/memberships$/, methods: ['POST'], all: [PERMISSIONS.MEMBERSHIPS_CREATE, PERMISSIONS.PAYMENTS_CREATE] },
    { pattern: /^\/memberships\/\d+\/payments$/, methods: ['POST'], all: [PERMISSIONS.PAYMENTS_CREATE] },
    { pattern: /^\/members\/\d+$/, methods: ['PUT'], all: [PERMISSIONS.MEMBERS_UPDATE, PERMISSIONS.MEMBERSHIPS_UPDATE] },
    { pattern: /^\/members\/\d+$/, methods: ['DELETE'], all: [PERMISSIONS.MEMBERS_DELETE] },

    { pattern: /^\/external-trainees(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.TRAINEES_READ] },
    { pattern: /^\/external-trainees(?:\/|$)/, methods: ['POST'], all: [PERMISSIONS.TRAINEES_CREATE] },
    { pattern: /^\/(?:coaching\/clients|coaching\/catalog|clients\/\d+\/(?:coaching-summary|training-overview))(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/clients\/\d+$/, methods: ['PUT'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/clients\/\d+\/(?:measurements|checkins)(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/clients\/\d+\/(?:measurements|checkins)(?:\/|$)/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/clients\/\d+\/(?:measurements|checkins)\/\d+$/, methods: ['PUT'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/clients\/\d+\/(?:measurements|checkins)\/\d+$/, methods: ['DELETE'], all: [PERMISSIONS.COACHING_DELETE] },
    { pattern: /^\/(?:workoutprograms|workout-programs|dietplans|diet-plans)(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/(?:workoutprograms|workout-programs|dietplans|diet-plans)(?:\/|$)/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/(?:workoutprograms|workout-programs|dietplans|diet-plans)\/\d+$/, methods: ['PUT', 'PATCH'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/(?:workoutprograms|workout-programs|dietplans|diet-plans)\/\d+\/status$/, methods: ['PATCH'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/(?:workoutprograms|workout-programs|dietplans|diet-plans)\/\d+$/, methods: ['DELETE'], all: [PERMISSIONS.COACHING_DELETE] },
    { pattern: /^\/workoutsessions(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/workoutsessions(?:\/|$)/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/workoutsessions\/start$/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/workoutsessions\/\d+$/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/workoutsessions\/\d+\/sets$/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/workoutsessions\/\d+\/end$/, methods: ['POST'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/meal-logs(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },

    // Independent Trainer workspace APIs use the same coaching permission
    // vocabulary. Tenant type and capability enforcement still happen in the
    // authentication/SaaS middleware; these rules only cover user actions.
    { pattern: /^\/trainer\/workspace$/, methods: ['GET'], all: [PERMISSIONS.DASHBOARD_READ] },
    { pattern: /^\/trainer\/follow-up$/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/trainer\/reports\/summary$/, methods: ['GET'], all: [PERMISSIONS.REPORTS_READ] },
    { pattern: /^\/trainer\/clients(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/trainer\/clients(?:\/|$)/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/trainer\/clients(?:\/|$)/, methods: ['PATCH', 'PUT'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/trainer\/clients(?:\/|$)/, methods: ['DELETE'], all: [PERMISSIONS.COACHING_DELETE] },
    { pattern: /^\/trainer\/(?:training-plans|nutrition-plans)(?:\/|$)/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/trainer\/(?:training-plans|nutrition-plans)(?:\/|$)/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/trainer\/(?:training-plans|nutrition-plans)(?:\/|$)/, methods: ['PATCH', 'PUT'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/trainer\/(?:training-plans|nutrition-plans)(?:\/|$)/, methods: ['DELETE'], all: [PERMISSIONS.COACHING_DELETE] },
    { pattern: /^\/trainer\/packages$/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/trainer\/packages$/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/trainer\/packages\/\d+$/, methods: ['PATCH', 'PUT'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/trainer\/package-purchases$/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/trainer\/package-purchases$/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/trainer\/payments$/, methods: ['GET'], all: [PERMISSIONS.FINANCE_READ] },
    { pattern: /^\/trainer\/package-purchases\/\d+\/payments$/, methods: ['POST'], all: [PERMISSIONS.PAYMENTS_CREATE] },
    { pattern: /^\/trainer\/package-purchases\/\d+\/refunds$/, methods: ['POST'], all: [PERMISSIONS.PAYMENTS_REFUND] },
    { pattern: /^\/trainer\/sessions$/, methods: ['GET'], all: [PERMISSIONS.COACHING_READ] },
    { pattern: /^\/trainer\/sessions$/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },
    { pattern: /^\/trainer\/sessions\/\d+$/, methods: ['PATCH', 'PUT'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/trainer\/sessions\/\d+\/status$/, methods: ['PATCH', 'POST'], all: [PERMISSIONS.COACHING_UPDATE] },
    { pattern: /^\/meal-logs(?:\/|$)/, methods: ['POST'], all: [PERMISSIONS.COACHING_CREATE] },

    { pattern: /^\/attendance\/report$/, methods: ['GET'], all: [PERMISSIONS.ATTENDANCE_REPORT] },
    { pattern: /^\/attendance\/member\/\d+$/, methods: ['GET'], all: [PERMISSIONS.ATTENDANCE_READ] },
    { pattern: /^\/attendance$/, methods: ['GET'], all: [PERMISSIONS.ATTENDANCE_READ] },
    { pattern: /^\/attendance\/check-in$/, methods: ['POST'], all: [PERMISSIONS.ATTENDANCE_CHECK_IN] },
    { pattern: /^\/attendance\/check-out$/, methods: ['POST'], all: [PERMISSIONS.ATTENDANCE_CHECK_OUT] },

    { pattern: /^\/monthly-finance$/, methods: ['GET'], all: [PERMISSIONS.FINANCE_READ] },
    { pattern: /^\/expenses$/, methods: ['POST'], all: [PERMISSIONS.FINANCE_CREATE] },
    { pattern: /^\/expenses\/\d+$/, methods: ['PUT'], all: [PERMISSIONS.FINANCE_UPDATE] },
    { pattern: /^\/expenses\/\d+$/, methods: ['DELETE'], all: [PERMISSIONS.FINANCE_DELETE] },
    { pattern: /^\/reports$/, methods: ['GET'], all: [PERMISSIONS.REPORTS_READ] },

    { pattern: /^\/pricing$/, methods: ['GET'], all: [PERMISSIONS.PRICING_READ] },
    { pattern: /^\/pricing(?:\/[^/]+)?$/, methods: ['PUT'], ownerOnly: true, all: [PERMISSIONS.PRICING_UPDATE] },
    { pattern: /^\/pricing-plans$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.PRICING_CREATE] },
    { pattern: /^\/pricing-plans\/[^/]+$/, methods: ['PUT'], ownerOnly: true, all: [PERMISSIONS.PRICING_UPDATE] },
    { pattern: /^\/membership-types$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.PRICING_CREATE] },
    { pattern: /^\/membership-types\/[^/]+$/, methods: ['PUT'], ownerOnly: true, all: [PERMISSIONS.PRICING_UPDATE] },

    { pattern: /^\/day-passes\/pricing$/, methods: ['GET'], all: [PERMISSIONS.DAY_PASSES_READ] },
    { pattern: /^\/day-passes\/pricing$/, methods: ['PUT'], ownerOnly: true, all: [PERMISSIONS.PRICING_UPDATE] },
    { pattern: /^\/day-passes$/, methods: ['GET'], all: [PERMISSIONS.DAY_PASSES_READ] },
    { pattern: /^\/day-passes\/summary$/, methods: ['GET'], all: [PERMISSIONS.DAY_PASSES_READ] },
    { pattern: /^\/day-passes$/, methods: ['POST'], all: [PERMISSIONS.DAY_PASSES_CREATE, PERMISSIONS.PAYMENTS_CREATE] },
    { pattern: /^\/day-passes\/\d+$/, methods: ['PUT'], ownerOnly: true, all: [PERMISSIONS.DAY_PASSES_UPDATE] },
    { pattern: /^\/day-passes\/\d+$/, methods: ['DELETE'], ownerOnly: true, all: [PERMISSIONS.DAY_PASSES_DELETE] },
    { pattern: /^\/day-passes\/\d+\/void$/, methods: ['POST'], ownerOnly: true, all: [PERMISSIONS.DAY_PASSES_DELETE] },
    { pattern: /^\/day-passes\/\d+\/whatsapp-opened$/, methods: ['POST'], all: [PERMISSIONS.DAY_PASSES_WHATSAPP] },

    { pattern: /^\/intelligence\/(?:overview|churn)$/, methods: ['GET'], all: [PERMISSIONS.INTELLIGENCE_READ] },
    { pattern: /^\/intelligence\/query$/, methods: ['POST'], all: [PERMISSIONS.INTELLIGENCE_READ] },
    { pattern: /^\/intelligence\/(?:workout-suggestions|diet-suggestions|refine)$/, methods: ['POST'], all: [PERMISSIONS.INTELLIGENCE_GENERATE] },

    { pattern: /^\/library\/options$/, methods: ['GET'], all: [PERMISSIONS.LIBRARY_READ] },
    { pattern: /^\/library\/(?:foods|exercises|muscles)(?:\/\d+)?$/, methods: ['GET'], all: [PERMISSIONS.LIBRARY_READ] },
    { pattern: /^\/library\/(?:foods|exercises|muscles)$/, methods: ['POST'], all: [PERMISSIONS.LIBRARY_CREATE] },
    { pattern: /^\/library\/(?:foods|exercises|muscles)\/\d+$/, methods: ['PUT'], all: [PERMISSIONS.LIBRARY_UPDATE] },
    { pattern: /^\/library\/(?:foods|exercises|muscles)\/\d+$/, methods: ['DELETE'], all: [PERMISSIONS.LIBRARY_DELETE] },

    { pattern: /^\/members\/\d+\/store-purchases$/, methods: ['GET'], all: [PERMISSIONS.MEMBERS_READ, PERMISSIONS.STORE_SALES_VIEW] },
    { pattern: /^\/store\/bootstrap$/, methods: ['GET'], all: [PERMISSIONS.STORE_VIEW] },
    { pattern: /^\/store\/dashboard$/, methods: ['GET'], all: [PERMISSIONS.STORE_VIEW] },
    { pattern: /^\/store\/reports$/, methods: ['GET'], all: [PERMISSIONS.STORE_REPORTS_VIEW] },
    { pattern: /^\/store\/categories$/, methods: ['GET'], all: [PERMISSIONS.STORE_VIEW] },
    { pattern: /^\/store\/categories$/, methods: ['POST'], all: [PERMISSIONS.STORE_PRODUCTS_MANAGE] },
    { pattern: /^\/store\/categories\/\d+$/, methods: ['PUT'], all: [PERMISSIONS.STORE_PRODUCTS_MANAGE] },
    { pattern: /^\/store\/products$/, methods: ['GET'], all: [PERMISSIONS.STORE_VIEW] },
    { pattern: /^\/store\/products\/\d+$/, methods: ['GET'], all: [PERMISSIONS.STORE_VIEW] },
    { pattern: /^\/store\/products$/, methods: ['POST'], all: [PERMISSIONS.STORE_PRODUCTS_MANAGE] },
    { pattern: /^\/store\/products\/\d+$/, methods: ['PUT', 'DELETE'], all: [PERMISSIONS.STORE_PRODUCTS_MANAGE] },
    { pattern: /^\/store\/products\/\d+\/variants$/, methods: ['POST'], all: [PERMISSIONS.STORE_PRODUCTS_MANAGE] },
    { pattern: /^\/store\/products\/\d+\/variants\/\d+$/, methods: ['PUT', 'DELETE'], all: [PERMISSIONS.STORE_PRODUCTS_MANAGE] },
    { pattern: /^\/store\/suppliers$/, methods: ['GET'], all: [PERMISSIONS.STORE_VIEW] },
    { pattern: /^\/store\/suppliers$/, methods: ['POST'], all: [PERMISSIONS.STORE_SUPPLIERS_MANAGE] },
    { pattern: /^\/store\/suppliers\/\d+$/, methods: ['PUT'], all: [PERMISSIONS.STORE_SUPPLIERS_MANAGE] },
    { pattern: /^\/store\/inventory$/, methods: ['GET'], all: [PERMISSIONS.STORE_INVENTORY_VIEW] },
    { pattern: /^\/store\/inventory\/movements$/, methods: ['GET'], all: [PERMISSIONS.STORE_INVENTORY_VIEW] },
    { pattern: /^\/store\/inventory\/adjustments$/, methods: ['POST'], all: [PERMISSIONS.STORE_INVENTORY_ADJUST] },
    { pattern: /^\/store\/customers\/search$/, methods: ['GET'], all: [PERMISSIONS.STORE_SALES_CREATE] },
    { pattern: /^\/store\/purchases$/, methods: ['GET'], all: [PERMISSIONS.STORE_PURCHASES_MANAGE] },
    { pattern: /^\/store\/purchases\/\d+$/, methods: ['GET'], all: [PERMISSIONS.STORE_PURCHASES_MANAGE] },
    { pattern: /^\/store\/purchases$/, methods: ['POST'], all: [PERMISSIONS.STORE_PURCHASES_MANAGE] },
    { pattern: /^\/store\/sales$/, methods: ['GET'], all: [PERMISSIONS.STORE_SALES_VIEW] },
    { pattern: /^\/store\/sales\/\d+$/, methods: ['GET'], all: [PERMISSIONS.STORE_SALES_VIEW] },
    { pattern: /^\/store\/sales$/, methods: ['POST'], all: [PERMISSIONS.STORE_SALES_CREATE] },
    { pattern: /^\/store\/sales\/\d+\/returns$/, methods: ['POST'], all: [PERMISSIONS.STORE_RETURNS_MANAGE] },
    { pattern: /^\/store\/expenses$/, methods: ['GET', 'POST'], all: [PERMISSIONS.STORE_EXPENSES_MANAGE] },
    { pattern: /^\/store\/expenses\/\d+$/, methods: ['PUT', 'DELETE'], all: [PERMISSIONS.STORE_EXPENSES_MANAGE] }
]);

function requirementForRule(rule, method) {
    if (rule.byMethod?.[method]) return { all: rule.byMethod[method], ownerOnly: Boolean(rule.ownerOnly) };
    return { all: rule.all || [], ownerOnly: Boolean(rule.ownerOnly) };
}

function memberCreateRequiresPaymentPermission(request) {
    const body = request?.body && typeof request.body === 'object' ? request.body : {};
    const amountPaid = Number(body.amountPaid);
    const discountAmount = Number(body.discountAmount);
    const paymentMethod = String(body.paymentMethod || 'cash').trim().toLowerCase();
    const paymentNotes = String(body.paymentNotes || '').trim();

    // Empty values and the default cash method represent an unpaid initial
    // membership. They must not force a financial permission just because
    // the browser serializes optional form fields.
    return (Number.isFinite(amountPaid) && amountPaid > 0)
        || (Number.isFinite(discountAmount) && discountAmount > 0)
        || Boolean(paymentNotes)
        || (paymentMethod && paymentMethod !== 'cash');
}

function permissionForRequest(request) {
    const path = String(request?.path || '');
    const method = String(request?.method || 'GET').toUpperCase();
    if (method === 'POST' && /^\/members\/?$/.test(path)) {
        return {
            all: [
                PERMISSIONS.MEMBERS_CREATE,
                ...(memberCreateRequiresPaymentPermission(request) ? [PERMISSIONS.PAYMENTS_CREATE] : [])
            ],
            ownerOnly: false
        };
    }
    if (method === 'PUT' && /^\/members\/\d+$/.test(path)) {
        const body = request?.body && typeof request.body === 'object' ? request.body : {};
        const hasField = (field) => Object.prototype.hasOwnProperty.call(body, field);
        const membershipFields = ['membershipPlan', 'membershipType', 'startDate', 'endDate', 'membershipNotes'];
        // Changing the plan/type or discount recalculates the payment snapshot
        // in member-service, so those fields need the financial permission too.
        const pricingFields = ['membershipPlan', 'membershipType', 'discountAmount'];
        const paymentFields = ['amountDue', 'amountPaid', 'paymentMethod', 'paymentNotes'];
        const changesMembership = membershipFields.some(hasField);
        const changesPayment = [...pricingFields, ...paymentFields].some(hasField);
        return {
            all: [
                PERMISSIONS.MEMBERS_UPDATE,
                ...(changesMembership ? [PERMISSIONS.MEMBERSHIPS_UPDATE] : []),
                ...(changesPayment ? [PERMISSIONS.PAYMENTS_CREATE] : [])
            ],
            ownerOnly: false
        };
    }
    const rule = ROUTE_PERMISSION_RULES
        .filter((candidate) => candidate.pattern.test(path) && (!candidate.methods || candidate.methods.includes(method)))
        .sort((first, second) => second.pattern.source.length - first.pattern.source.length)[0];
    return rule ? requirementForRule(rule, method) : null;
}

module.exports = { ROUTE_PERMISSION_RULES, permissionForRequest };
