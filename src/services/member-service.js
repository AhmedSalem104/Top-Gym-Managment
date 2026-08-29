const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const memberRepository = require('../repositories/member.repository');
const alertContactService = require('./alert-contact-service');
const membershipCodeService = require('./membership-code-service');
const { MEMBER_ROW_COLUMNS, MEMBER_ROWS_CTE } = memberRepository;
const {
    addDays,
    addMonths,
    differenceInDays,
    formatDateOnly,
    parseDateOnly,
    todayInTimeZone,
    toUtcDate
} = require('../utils/date');
const { ensureAttendanceTable, getMemberAttendanceStatuses } = require('./attendance-service');
const { currentTenantId, getTenantContext } = require('../tenancy/tenant-context');

const DEFAULT_MEMBERSHIP_PLANS = {
    gym_only: { label: 'جيم فقط', monthlyPrice: 305, active: true, sortOrder: 1 },
    gym_cardio: { label: 'جيم وكارديو', monthlyPrice: 400, active: true, sortOrder: 2 }
};
const DEFAULT_MEMBERSHIP_TYPES = {
    monthly: { label: 'شهرية', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true, sortOrder: 1 },
    half_month: { label: 'نصف شهر', mode: 'days', durationValue: 15, priceMultiplier: 0.5, active: true, sortOrder: 2 },
    quarterly: { label: 'ربع سنوية', mode: 'months', durationValue: 3, priceMultiplier: 3, active: true, sortOrder: 3 },
    semiannual: { label: 'نصف سنوية', mode: 'months', durationValue: 6, priceMultiplier: 6, active: true, sortOrder: 4 },
    annual: { label: 'سنوية', mode: 'months', durationValue: 12, priceMultiplier: 12, active: true, sortOrder: 5 }
};
const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];
const MEMBER_STATUSES = ['active', 'expiring_soon', 'expired', 'frozen', 'cancelled'];
const MEMBERSHIP_FREEZE_LIMIT = 3;
const DEFAULT_MEMBER_PAGE_SIZE = 5;
const PRICING_CACHE_TTL_MS = 30_000;
let pricingOverridesPromise;
const pricingCatalogCache = new Map();
let memberIdentityPromise;
let paymentTransactionsTablePromise;
let subscriptionRefundsTablePromise;

function appError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    return error;
}

async function ensurePaymentTransactionsTable({ readOnly = false } = {}) {
    if (readOnly || getTenantContext()?.readOnlyBaseline) return;
    if (!paymentTransactionsTablePromise) {
        paymentTransactionsTablePromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_payment_transactions', N'U') IS NULL
                BEGIN
                    EXEC(N'CREATE TABLE dbo.gym_payment_transactions (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_payment_transactions_runtime PRIMARY KEY,
                        membership_id INT NOT NULL,
                        transaction_type VARCHAR(20) NOT NULL CONSTRAINT DF_gym_payment_transactions_type_runtime DEFAULT (''payment''),
                        list_price DECIMAL(12,2) NOT NULL,
                        discount_amount DECIMAL(12,2) NOT NULL,
                        amount_due DECIMAL(12,2) NOT NULL,
                        amount_paid DECIMAL(12,2) NOT NULL,
                        amount_remaining DECIMAL(12,2) NOT NULL,
                        payment_method VARCHAR(20) NOT NULL CONSTRAINT DF_gym_payment_transactions_method_runtime DEFAULT (''cash''),
                        paid_at DATE NULL,
                        notes NVARCHAR(500) NULL,
                        source_payment_id INT NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_payment_transactions_created_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_gym_payment_transactions_membership_runtime FOREIGN KEY (membership_id)
                            REFERENCES dbo.memberships(id) ON DELETE CASCADE,
                        CONSTRAINT CK_gym_payment_transactions_type_runtime CHECK (transaction_type IN (''subscription'', ''payment'', ''adjustment'')),
                        CONSTRAINT CK_gym_payment_transactions_amounts_runtime CHECK (
                            list_price >= 0 AND discount_amount >= 0 AND discount_amount <= list_price
                            AND amount_due = list_price - discount_amount
                            AND amount_remaining >= 0 AND amount_remaining <= amount_due
                            AND ((transaction_type = ''adjustment'' AND amount_paid <> 0) OR (transaction_type <> ''adjustment'' AND amount_paid > 0))
                        ),
                        CONSTRAINT CK_gym_payment_transactions_method_runtime CHECK (payment_method IN (''cash'', ''card'', ''transfer'', ''other''))
                    );');
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_payment_transactions_membership_date'
                      AND object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
                )
                BEGIN
                    EXEC(N'CREATE INDEX IX_gym_payment_transactions_membership_date
                          ON dbo.gym_payment_transactions(membership_id, created_at DESC, id DESC);');
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_payment_transactions_paid_at'
                      AND object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
                )
                BEGIN
                    EXEC(N'CREATE INDEX IX_gym_payment_transactions_paid_at
                          ON dbo.gym_payment_transactions(paid_at DESC, id DESC);');
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_gym_payment_transactions_source_payment'
                      AND object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
                )
                BEGIN
                    EXEC(N'CREATE UNIQUE INDEX UX_gym_payment_transactions_source_payment
                          ON dbo.gym_payment_transactions(source_payment_id)
                          WHERE source_payment_id IS NOT NULL;');
                END;
                ;WITH duplicate_subscriptions AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               PARTITION BY membership_id
                               ORDER BY CASE WHEN source_payment_id IS NOT NULL THEN 0 ELSE 1 END,
                                        created_at ASC,
                                        id ASC
                           ) AS row_number
                    FROM dbo.gym_payment_transactions
                    WHERE transaction_type = 'subscription'
                )
                DELETE FROM duplicate_subscriptions WHERE row_number > 1;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'UX_gym_payment_transactions_subscription_membership'
                      AND object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
                )
                BEGIN
                    EXEC(N'CREATE UNIQUE INDEX UX_gym_payment_transactions_subscription_membership
                          ON dbo.gym_payment_transactions(membership_id)
                          WHERE transaction_type = ''subscription'';');
                END;
                EXEC(N'INSERT INTO dbo.gym_payment_transactions
                    (membership_id, transaction_type, list_price, discount_amount, amount_due,
                     amount_paid, amount_remaining, payment_method, paid_at, notes, source_payment_id, created_at)
                    SELECT p.membership_id, ''subscription'', p.list_price, p.discount_amount, p.amount_due,
                           p.amount_paid, p.amount_remaining, p.payment_method, p.paid_at,
                           CASE WHEN p.notes IS NULL THEN N''تم ترحيله من سجل الدفع السابق.'' ELSE p.notes END,
                           p.id, p.created_at
                    FROM dbo.gym_payments AS p
                    WHERE p.amount_paid > 0
                      AND NOT EXISTS (
                          SELECT 1 FROM dbo.gym_payment_transactions AS t WITH (UPDLOCK, HOLDLOCK)
                          WHERE t.source_payment_id = p.id
                             OR (t.membership_id = p.membership_id AND t.transaction_type = ''subscription'')
                      );');
            `);
        })().catch((error) => {
            paymentTransactionsTablePromise = undefined;
            throw error;
        });
    }
    return paymentTransactionsTablePromise;
}

async function ensureSubscriptionRefundsTable() {
    if (getTenantContext()?.readOnlyBaseline) return;
    if (!subscriptionRefundsTablePromise) {
        subscriptionRefundsTablePromise = (async () => {
            await ensurePaymentTransactionsTable();
            const pool = await getPool();
            await pool.request().batch(`
                IF COL_LENGTH(N'dbo.memberships', N'cancelled_at') IS NULL
                    ALTER TABLE dbo.memberships ADD cancelled_at DATETIME2(0) NULL;
                IF COL_LENGTH(N'dbo.memberships', N'cancelled_by_user_id') IS NULL
                    ALTER TABLE dbo.memberships ADD cancelled_by_user_id INT NULL;
                IF COL_LENGTH(N'dbo.memberships', N'cancellation_reason') IS NULL
                    ALTER TABLE dbo.memberships ADD cancellation_reason NVARCHAR(500) NULL;
                IF OBJECT_ID(N'dbo.gym_subscription_refunds', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_subscription_refunds (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_subscription_refunds_runtime PRIMARY KEY,
                        membership_id INT NOT NULL,
                        amount_refunded DECIMAL(12,2) NOT NULL,
                        refund_method VARCHAR(20) NOT NULL CONSTRAINT DF_gym_subscription_refunds_method_runtime DEFAULT ('cash'),
                        reason NVARCHAR(500) NOT NULL,
                        notes NVARCHAR(1000) NULL,
                        refund_date DATE NOT NULL,
                        created_by_user_id INT NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_subscription_refunds_created_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_gym_subscription_refunds_membership_runtime FOREIGN KEY (membership_id)
                            REFERENCES dbo.memberships(id) ON DELETE CASCADE,
                        CONSTRAINT CK_gym_subscription_refunds_amount_runtime CHECK (amount_refunded > 0),
                        CONSTRAINT CK_gym_subscription_refunds_method_runtime CHECK (refund_method IN ('cash', 'card', 'transfer', 'other'))
                    );
                END;
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_gym_subscription_refunds_membership_date'
                      AND object_id = OBJECT_ID(N'dbo.gym_subscription_refunds')
                )
                BEGIN
                    CREATE INDEX IX_gym_subscription_refunds_membership_date
                        ON dbo.gym_subscription_refunds(membership_id, refund_date DESC, id DESC);
                END;
            `);
        })().catch((error) => {
            subscriptionRefundsTablePromise = undefined;
            throw error;
        });
    }
    return subscriptionRefundsTablePromise;
}

function requiredString(value, fieldName, maxLength) {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw appError(`${fieldName} مطلوب.`);
    if (normalized.length > maxLength) throw appError(`${fieldName} أطول من المسموح.`);
    return normalized;
}

function optionalString(value, maxLength) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw appError('إحدى البيانات النصية أطول من المسموح.');
    return normalized;
}

function normalizePhone(value) {
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const englishDigits = '0123456789';
    let normalized = String(value ?? '').trim().replace(/[٠-٩]/gu, (digit) => englishDigits[arabicDigits.indexOf(digit)]);
    normalized = normalized.replace(/[^0-9]/g, '');
    if (normalized.startsWith('00')) normalized = normalized.slice(2);
    if (normalized.startsWith('20') && normalized.length === 12) normalized = `0${normalized.slice(2)}`;
    return normalized;
}

async function ensureMemberIdentityFields() {
    if (!memberIdentityPromise) {
        memberIdentityPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF COL_LENGTH(N'dbo.members', N'phone_normalized') IS NULL
                BEGIN
                    ALTER TABLE dbo.members ADD phone_normalized NVARCHAR(30) NULL;
                END;
                EXEC(N'UPDATE dbo.members
                       SET phone_normalized = phone
                       WHERE phone_normalized IS NULL OR LTRIM(RTRIM(phone_normalized)) = N'''';');
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes
                    WHERE name = N'IX_members_phone_normalized_runtime' AND object_id = OBJECT_ID(N'dbo.members')
                )
                BEGIN
                    EXEC(N'CREATE INDEX IX_members_phone_normalized_runtime ON dbo.members(phone_normalized);');
                END;
            `);
        })().catch((error) => {
            memberIdentityPromise = undefined;
            throw error;
        });
    }
    return memberIdentityPromise;
}

async function assertNoDuplicateMember(connection, phoneNormalized, email, excludeId = null) {
    const result = await connection.request().query(`
        SELECT id, full_name, phone, phone_normalized, email
        FROM dbo.members;
    `);
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const duplicate = result.recordset.find((row) => {
        if (excludeId && Number(row.id) === Number(excludeId)) return false;
        const rowPhone = normalizePhone(row.phone_normalized || row.phone);
        const rowEmail = String(row.email || '').trim().toLowerCase();
        return (phoneNormalized && rowPhone && rowPhone === phoneNormalized)
            || (normalizedEmail && rowEmail && rowEmail === normalizedEmail);
    });
    if (!duplicate) return;
    const samePhone = phoneNormalized && normalizePhone(duplicate.phone_normalized || duplicate.phone) === phoneNormalized;
    const error = appError(samePhone
        ? `رقم الهاتف مسجل بالفعل باسم ${duplicate.full_name}.`
        : `البريد الإلكتروني مسجل بالفعل باسم ${duplicate.full_name}.`, 409);
    error.code = samePhone ? 'DUPLICATE_MEMBER_PHONE' : 'DUPLICATE_MEMBER_EMAIL';
    error.field = samePhone ? 'phone' : 'email';
    error.memberName = duplicate.full_name;
    throw error;
}

function money(value, fieldName, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 9999999999) {
        throw appError(`${fieldName} غير صالح.`);
    }
    return Math.round(amount * 100) / 100;
}

function parsePaymentMethod(value, fallback = 'cash') {
    const method = value === undefined || value === null || value === '' ? fallback : String(value).trim();
    if (!PAYMENT_METHODS.includes(method)) throw appError('طريقة الدفع غير صالحة.');
    return method;
}

function has(body, key) {
    return Object.prototype.hasOwnProperty.call(body, key);
}

async function getPricingCatalog(connection = null) {
    const cacheKey = currentTenantId() || 'unscoped';
    const cached = pricingCatalogCache.get(cacheKey);
    if (!connection && cached && Date.now() - cached.cachedAt < PRICING_CACHE_TTL_MS) {
        return cached.catalog;
    }
    await ensurePricingOverrides();
    const pool = connection || await getPool();
    const queryPlan = () => pool.request()
        .query(`SELECT plan_code, plan_name, monthly_price, is_active, sort_order
                FROM dbo.membership_pricing ORDER BY id ASC;`);
    const queryType = () => pool.request()
        .query(`SELECT type_code, type_name, duration_mode, duration_value,
                       price_multiplier, is_active, sort_order
                FROM dbo.membership_types ORDER BY sort_order ASC, id ASC;`);
    const queryPrice = () => pool.request()
        .query(`SELECT plan_code, type_code, price
                FROM dbo.membership_type_prices;`);
    const queryLegacyType = () => pool.request()
        .query(`SELECT m.membership_type AS type_code,
                       MIN(m.start_date) AS start_date,
                       MAX(m.end_date) AS end_date,
                       MIN(m.membership_plan) AS membership_plan,
                       MIN(ISNULL(p.list_price, 0)) AS list_price
                FROM dbo.memberships AS m
                LEFT JOIN dbo.gym_payments AS p ON p.membership_id = m.id
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.membership_types AS current_type
                    WHERE current_type.type_code = m.membership_type
                )
                GROUP BY m.membership_type;`);
    const queryFactories = [queryPlan, queryType, queryPrice, queryLegacyType];
    const queryResults = connection && typeof connection.commit === 'function'
        ? [await queryPlan(), await queryType(), await queryPrice(), await queryLegacyType()]
        : await Promise.all(queryFactories.map((query) => query()));
    const [planResult, typeResult, priceResult, legacyTypeResult] = queryResults;
    const plans = { ...DEFAULT_MEMBERSHIP_PLANS };
    for (const row of planResult.recordset) {
        const fallbackLabel = DEFAULT_MEMBERSHIP_PLANS[row.plan_code]?.label || row.plan_code;
        const storedLabel = String(row.plan_name || '').trim();
        plans[row.plan_code] = {
            label: storedLabel && !storedLabel.includes('?') ? storedLabel : fallbackLabel,
            monthlyPrice: Number(row.monthly_price),
            active: Boolean(row.is_active),
            sortOrder: Number(row.sort_order || 0)
        };
    }
    const types = { ...DEFAULT_MEMBERSHIP_TYPES };
    for (const row of typeResult.recordset) {
        types[row.type_code] = {
            label: row.type_name,
            mode: row.duration_mode,
            durationValue: Number(row.duration_value),
            priceMultiplier: Number(row.price_multiplier),
            active: Boolean(row.is_active),
            sortOrder: Number(row.sort_order || 0)
        };
    }
    const prices = {};
    for (const [planCode, plan] of Object.entries(plans)) {
        prices[planCode] = {};
        for (const [typeCode, type] of Object.entries(types)) {
            prices[planCode][typeCode] = Math.round((Number(plan.monthlyPrice || 0) * Number(type.priceMultiplier || 0)) * 100) / 100;
        }
    }
    for (const row of priceResult.recordset) {
        if (!prices[row.plan_code]) prices[row.plan_code] = {};
        prices[row.plan_code][row.type_code] = Number(row.price || 0);
    }
    const typeAliases = {};
    for (const row of legacyTypeResult.recordset) {
        const legacyCode = String(row.type_code || '').trim();
        if (!legacyCode || types[legacyCode]) continue;
        const startDate = formatDateOnly(row.start_date);
        const endDate = formatDateOnly(row.end_date);
        const spanDays = startDate && endDate ? differenceInDays(startDate, endDate) : null;
        const matchingTypes = Object.entries(types).filter(([, type]) => (
            startDate && endDate && (
                membershipEndDateFromConfig(startDate, type) === endDate
                || (type.mode === 'days' && [Number(type.durationValue), Number(type.durationValue) - 1].includes(spanDays))
            )
        ));
        if (matchingTypes.length === 1) {
            typeAliases[legacyCode] = matchingTypes[0][0];
            continue;
        }
        if (matchingTypes.length > 1) {
            const planCode = String(row.membership_plan || '').trim();
            const listPrice = Number(row.list_price || 0);
            const priceMatches = matchingTypes.filter(([typeCode]) => (
                Number.isFinite(listPrice)
                && Math.abs(Number(prices[planCode]?.[typeCode] ?? Number.NaN) - listPrice) < 0.01
            ));
            if (priceMatches.length === 1) typeAliases[legacyCode] = priceMatches[0][0];
        }
    }
    const catalog = {
        plans: Object.fromEntries(Object.entries(plans).map(([key, value]) => [key, {
            label: value.label,
            monthlyPrice: value.monthlyPrice,
            active: value.active !== false,
            sortOrder: Number(value.sortOrder || 0)
        }])),
        types,
        prices,
        typeAliases,
        durations: Object.fromEntries(Object.entries(types).map(([key, value]) => [key, value.mode === 'months' ? value.durationValue : null]))
    };
    if (!connection) {
        pricingCatalogCache.set(cacheKey, { catalog, cachedAt: Date.now() });
    }
    return catalog;
}

function invalidatePricingCatalog() {
    const tenantId = currentTenantId();
    if (tenantId) pricingCatalogCache.delete(tenantId);
    else pricingCatalogCache.clear();
}

async function ensurePricingOverrides() {
    if (getTenantContext()?.readOnlyBaseline) return;
    if (!pricingOverridesPromise) {
        pricingOverridesPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.membership_type_prices', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.membership_type_prices (
                        plan_code VARCHAR(30) NOT NULL,
                        type_code VARCHAR(30) NOT NULL,
                        price DECIMAL(12,2) NOT NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_type_prices_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_type_prices_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT PK_membership_type_prices_runtime PRIMARY KEY (plan_code, type_code),
                        CONSTRAINT FK_membership_type_prices_plan_runtime FOREIGN KEY (plan_code) REFERENCES dbo.membership_pricing(plan_code) ON DELETE CASCADE,
                        CONSTRAINT FK_membership_type_prices_type_runtime FOREIGN KEY (type_code) REFERENCES dbo.membership_types(type_code) ON DELETE CASCADE,
                        CONSTRAINT CK_membership_type_prices_price_runtime CHECK (price >= 0)
                    );
                END;
            `);
        })().catch((error) => {
            pricingOverridesPromise = undefined;
            throw error;
        });
    }
    return pricingOverridesPromise;
}

function positiveValue(value, fieldName, maximum = 10000) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number > maximum) throw appError(`${fieldName} غير صالح.`);
    return Math.round(number * 10000) / 10000;
}

function membershipEndDateFromConfig(startDate, typeConfig) {
    if (typeConfig.mode === 'days') return addDays(startDate, Math.max(1, Math.round(typeConfig.durationValue)) - 1);
    return addDays(addMonths(startDate, typeConfig.durationValue), -1);
}

function resolvePricingTypeCode(pricing, membershipType) {
    const requestedCode = String(membershipType ?? '').trim();
    return pricing.types[requestedCode]
        ? requestedCode
        : (pricing.typeAliases?.[requestedCode] || requestedCode);
}

async function calculatePricing(membershipType, membershipPlan = 'gym_only', discountAmount = 0, connection = null) {
    const pricing = await getPricingCatalog(connection);
    const plan = pricing.plans[membershipPlan];
    if (!plan) throw appError('باقة العضوية غير صالحة.');
    const resolvedTypeCode = resolvePricingTypeCode(pricing, membershipType);
    const type = pricing.types[resolvedTypeCode];
    if (!type) throw appError('نوع العضوية غير صالح.');
    const configuredPrice = pricing.prices?.[membershipPlan]?.[resolvedTypeCode];
    const listPrice = configuredPrice === undefined
        ? plan.monthlyPrice * type.priceMultiplier
        : Number(configuredPrice);
    const discount = money(discountAmount, 'الخصم');
    if (discount > listPrice) throw appError('الخصم لا يمكن أن يتجاوز قيمة الاشتراك.');
    return { listPrice, discountAmount: discount, amountDue: listPrice - discount, typeConfig: type, typeCode: resolvedTypeCode };
}

function normalizePayload(body = {}, { partial = false } = {}) {
    const output = {};
    if (!partial || has(body, 'fullName')) output.fullName = requiredString(body.fullName, 'الاسم', 120);
    if (!partial || has(body, 'phone')) {
        output.phone = requiredString(body.phone, 'رقم الهاتف', 30);
        if (!/^[0-9٠-٩+()\-\s]{5,30}$/u.test(output.phone)) throw appError('رقم الهاتف غير صالح.');
        output.phoneNormalized = normalizePhone(output.phone);
        if (output.phoneNormalized.length < 5) throw appError('رقم الهاتف غير صالح.');
    }
    if (!partial || has(body, 'email')) {
        output.email = optionalString(body.email, 254);
        if (output.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output.email)) {
            throw appError('البريد الإلكتروني غير صالح.');
        }
    }
    if (!partial || has(body, 'registrationDate')) {
        output.registrationDate = body.registrationDate
            ? parseDateOnly(body.registrationDate, 'تاريخ التسجيل')
            : todayInTimeZone();
    }
    if (!partial || has(body, 'notes')) output.notes = optionalString(body.notes, 1000);

    if (!partial || has(body, 'membershipType')) {
        output.membershipType = requiredString(body.membershipType, 'نوع العضوية', 30);
    }
    if (!partial || has(body, 'membershipPlan')) {
        output.membershipPlan = requiredString(body.membershipPlan || 'gym_only', 'باقة العضوية', 30);
    }
    if (!partial || has(body, 'startDate')) {
        output.startDate = body.startDate
            ? parseDateOnly(body.startDate, 'تاريخ البداية')
            : todayInTimeZone();
    }
    if (!partial || has(body, 'endDate')) {
        output.endDate = body.endDate ? parseDateOnly(body.endDate, 'تاريخ الانتهاء') : null;
    }
    if (!partial || has(body, 'membershipNotes')) {
        output.membershipNotes = optionalString(body.membershipNotes, 1000);
    }

    if (output.startDate && output.endDate && output.endDate < output.startDate) {
        throw appError('تاريخ الانتهاء يجب أن يكون بعد أو مساوياً لتاريخ البداية.');
    }

    if (!partial || has(body, 'amountDue')) output.amountDue = money(body.amountDue, 'قيمة الاشتراك');
    if (!partial || has(body, 'amountPaid')) output.amountPaid = money(body.amountPaid, 'المبلغ المدفوع');
    if (!partial || has(body, 'discountAmount')) output.discountAmount = money(body.discountAmount, 'الخصم');
    if (!partial || has(body, 'paymentMethod')) output.paymentMethod = parsePaymentMethod(body.paymentMethod);
    if (!partial || has(body, 'paymentNotes')) output.paymentNotes = optionalString(body.paymentNotes, 500);
    return output;
}

function normalizePaymentPayload(body = {}, current = {}) {
    let listPrice = has(body, 'listPrice')
        ? money(body.listPrice, 'السعر الأساسي')
        : money(current.list_price ?? current.amount_due, 'السعر الأساسي');
    const discountAmount = has(body, 'discountAmount')
        ? money(body.discountAmount, 'الخصم')
        : money(current.discount_amount, 'الخصم');
    let amountDue;
    if (has(body, 'listPrice') || has(body, 'discountAmount')) {
        amountDue = listPrice - discountAmount;
    } else if (has(body, 'amountDue')) {
        amountDue = money(body.amountDue, 'قيمة الاشتراك');
        listPrice = amountDue + discountAmount;
    } else {
        amountDue = money(current.amount_due, 'قيمة الاشتراك');
    }
    const amountPaid = has(body, 'amountPaid')
        ? money(body.amountPaid, 'المبلغ المدفوع')
        : money(current.amount_paid, 'المبلغ المدفوع');
    if (discountAmount > listPrice) throw appError('الخصم لا يمكن أن يتجاوز قيمة الاشتراك.');
    if (amountPaid > amountDue) throw appError('المبلغ المدفوع لا يمكن أن يتجاوز قيمة الاشتراك.');
    return {
        listPrice,
        discountAmount,
        amountDue,
        amountPaid,
        paymentMethod: parsePaymentMethod(body.paymentMethod, current.payment_method || 'cash'),
        paymentNotes: has(body, 'paymentNotes')
            ? optionalString(body.paymentNotes, 500)
            : (current.notes || null),
        paidAt: amountPaid > 0 ? todayInTimeZone() : null
    };
}

function ensureId(value, label = 'المعرّف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw appError(`${label} غير صالح.`);
    return id;
}

function ensureStatus(value) {
    if (!value) return '';
    if (!MEMBER_STATUSES.includes(value)) throw appError('فلتر الحالة غير صالح.');
    return value;
}

function ensureMemberSort(value) {
    const sort = String(value || 'expiry').trim();
    if (!['expiry', 'newest', 'remaining'].includes(sort)) throw appError('ترتيب القائمة غير صالح.');
    return sort;
}

function mapMember(row) {
    const membershipId = row.membershipId ? Number(row.membershipId) : null;
    return {
        id: Number(row.id),
        qrToken: `TOPGYM-MEMBER:${Number(row.id)}`,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        registrationDate: formatDateOnly(row.registrationDate),
        notes: row.memberNotes,
        createdAt: row.memberCreatedAt,
        updatedAt: row.memberUpdatedAt,
        membership: membershipId ? {
            id: membershipId,
            plan: row.membershipPlan || 'gym_only',
            type: row.membershipType,
            startDate: formatDateOnly(row.startDate),
            endDate: formatDateOnly(row.endDate),
            effectiveEndDate: formatDateOnly(row.effectiveEndDate),
            status: row.computedStatus,
            cancelledAt: row.cancelledAt ? formatDateOnly(row.cancelledAt) : null,
            cancellationReason: row.cancellationReason || null,
            daysRemaining: row.daysRemaining === null ? null : Number(row.daysRemaining),
            notes: row.membershipNotes,
            freezeId: row.freezeId ? Number(row.freezeId) : null,
            freezeStart: formatDateOnly(row.freezeStart),
            freezeEnd: formatDateOnly(row.freezeEnd),
            freezeCount: Number(row.freezeCount || 0),
            freezeLimit: MEMBERSHIP_FREEZE_LIMIT,
            freezesRemaining: Math.max(0, MEMBERSHIP_FREEZE_LIMIT - Number(row.freezeCount || 0)),
            listPrice: Number(row.listPrice || 0),
            discountAmount: Number(row.discountAmount || 0),
            amountDue: Number(row.amountDue || 0),
            amountPaid: Number(row.amountPaid || 0),
            amountRemaining: Number(row.amountRemaining || 0),
            paymentMethod: row.paymentMethod || 'cash',
            paymentPaidAt: formatDateOnly(row.paymentPaidAt)
        } : null
    };
}

async function getMemberById(id, connection = null) {
    const memberId = ensureId(id);
    const result = await memberRepository.findById({
        id: memberId,
        connection,
        today: todayInTimeZone()
    });
    if (!result.recordset[0]) throw appError('العضو غير موجود.', 404);
    const member = mapMember(result.recordset[0]);
    if (!connection) member.membershipCode = await membershipCodeService.getPreview(memberId);
    return member;
}

async function getMembers({ search = '', status = '', sort = 'expiry', page = 1, pageSize = DEFAULT_MEMBER_PAGE_SIZE, readOnly = false } = {}) {
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const normalizedStatus = ensureStatus(status);
    const normalizedSort = ensureMemberSort(sort);
    const requestedPage = Number(page);
    const requestedPageSize = Number(pageSize);
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    const currentPageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, 50) : DEFAULT_MEMBER_PAGE_SIZE;
    const offset = (currentPage - 1) * currentPageSize;
    const result = await memberRepository.list({
        search: normalizedSearch,
        status: normalizedStatus,
        sort: normalizedSort,
        offset,
        pageSize: currentPageSize,
        today: todayInTimeZone()
    });
    const mappedMembers = result.recordset.map(mapMember);
    const memberIds = mappedMembers.map((member) => member.id);
    const [membershipCodePreviews, attendanceByMember] = await Promise.all([
        membershipCodeService.getPreviews(memberIds),
        getMemberAttendanceStatuses(memberIds, undefined, { readOnly })
    ]);
    const members = mappedMembers.map((member) => ({
        ...member,
        membershipCode: membershipCodePreviews.get(member.id) || { active: false, maskedCode: null, issuedAt: null, version: 0 },
        attendance: attendanceByMember.get(member.id) || null
    }));
    const total = result.recordset[0]?.totalCount === undefined
        ? offset
        : Number(result.recordset[0].totalCount || 0);
    const totalPages = total ? Math.ceil(total / currentPageSize) : 0;
    return {
        members,
        pagination: {
            page: currentPage,
            pageSize: currentPageSize,
            total,
            totalPages,
            sort: normalizedSort,
            hasNext: currentPage < totalPages,
            hasPrevious: currentPage > 1
        }
    };
}

function dashboardFromMembers(members, today = todayInTimeZone()) {
    const counts = members.reduce((result, member) => {
        const status = member.membership?.status || 'expired';
        result[status] = (result[status] || 0) + 1;
        return result;
    }, {});
    const alertRows = members.filter((member) => {
        const membership = member.membership;
        if (!membership) return false;
        return membership.status === 'frozen'
            || membership.status === 'expiring_soon'
            || membership.status === 'expired';
    });
    return {
        today,
        stats: {
            total: Object.values(counts).reduce((sum, value) => sum + value, 0),
            active: counts.active || 0,
            expiringSoon: counts.expiring_soon || 0,
            expired: counts.expired || 0,
            frozen: counts.frozen || 0
        },
        alerts: alertRows
    };
}

async function getBootstrap({ readOnly = false } = {}) {
    const [memberPage, dashboard, pricing] = await Promise.all([
        getMembers({ page: 1, pageSize: DEFAULT_MEMBER_PAGE_SIZE, sort: 'expiry', readOnly }),
        getDashboard({ readOnly }),
        getPricingCatalog()
    ]);
    return {
        members: memberPage.members,
        pagination: memberPage.pagination,
        dashboard,
        pricing
    };
}

function normalizePlanCode(value) {
    const code = String(value ?? '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(code)) {
        throw appError('رمز الباقة يجب أن يبدأ بحرف إنجليزي ويحتوي على أحرف أو أرقام أو _.');
    }
    return code;
}

function normalizePricingPlanPayload(body = {}, current = {}) {
    const planCode = normalizePlanCode(body.planCode ?? body.code ?? current.plan_code);
    const planName = body.planName === undefined && body.label === undefined
        ? requiredString(current.plan_name, 'اسم الباقة', 80)
        : requiredString(body.planName ?? body.label, 'اسم الباقة', 80);
    const monthlyPrice = money(
        body.monthlyPrice ?? body.price ?? current.monthly_price,
        'السعر الشهري'
    );
    const rawSortOrder = body.sortOrder ?? body.sort ?? current.sort_order ?? 0;
    const sortOrder = Number(rawSortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
        throw appError('ترتيب الباقة غير صالح.');
    }
    return {
        planCode,
        planName,
        monthlyPrice,
        isActive: booleanValue(body.isActive, current.is_active === undefined ? true : Boolean(current.is_active)),
        sortOrder
    };
}

async function updatePricing(planCode, body = {}) {
    return updatePricingPlan(planCode, body);
}

async function createPricingPlan(body = {}) {
    const planCode = normalizePlanCode(body.planCode ?? body.code);
    const data = normalizePricingPlanPayload({ ...body, planCode });
    const pool = await getPool();
    const exists = await pool.request()
        .input('planCode', sql.VarChar(30), planCode)
        .query('SELECT id FROM dbo.membership_pricing WHERE plan_code = @planCode;');
    if (exists.recordset[0]) throw appError('رمز الباقة مستخدم بالفعل.');
    await pool.request()
        .input('planCode', sql.VarChar(30), data.planCode)
        .input('planName', sql.NVarChar(80), data.planName)
        .input('monthlyPrice', sql.Decimal(12, 2), data.monthlyPrice)
        .input('isActive', sql.Bit, data.isActive)
        .input('sortOrder', sql.Int, data.sortOrder)
        .query(`INSERT INTO dbo.membership_pricing
                (plan_code, plan_name, monthly_price, is_active, sort_order)
                VALUES (@planCode, @planName, @monthlyPrice, @isActive, @sortOrder);`);
    invalidatePricingCatalog();
    return getPricingCatalog();
}

async function updatePricingPlan(planCodeValue, body = {}) {
    const planCode = normalizePlanCode(planCodeValue);
    const pool = await getPool();
    const currentResult = await pool.request()
        .input('planCode', sql.VarChar(30), planCode)
        .query(`SELECT plan_code, plan_name, monthly_price, is_active, sort_order
                FROM dbo.membership_pricing WHERE plan_code = @planCode;`);
    const current = currentResult.recordset[0];
    if (!current) throw appError('بيانات الباقة غير موجودة.', 404);
    const data = normalizePricingPlanPayload({ ...body, planCode }, current);
    await pool.request()
        .input('planCode', sql.VarChar(30), planCode)
        .input('planName', sql.NVarChar(80), data.planName)
        .input('monthlyPrice', sql.Decimal(12, 2), data.monthlyPrice)
        .input('isActive', sql.Bit, data.isActive)
        .input('sortOrder', sql.Int, data.sortOrder)
        .query(`UPDATE dbo.membership_pricing
                SET plan_name = @planName, monthly_price = @monthlyPrice,
                    is_active = @isActive, sort_order = @sortOrder,
                    updated_at = SYSUTCDATETIME()
                WHERE plan_code = @planCode;`);
    invalidatePricingCatalog();
    return getPricingCatalog();
}

async function updatePricingCatalog(body = {}) {
    const plans = Array.isArray(body.plans) ? body.plans : [];
    if (!plans.length) throw appError('أرسل بيانات أسعار الباقات للتحديث.');
    const catalog = await getPricingCatalog();
    const normalized = plans.map((item) => {
        const code = normalizePlanCode(item.planCode || item.code);
        const monthlyPrice = money(item.monthlyPrice ?? item.price, 'السعر الشهري');
        const rawPrices = item.prices || item.typePrices || {};
        const prices = Object.fromEntries(Object.entries(catalog.types).map(([typeCode, type]) => {
            const fallback = catalog.prices?.[code]?.[typeCode]
                ?? monthlyPrice * Number(type.priceMultiplier || 0);
            const value = rawPrices[typeCode] === undefined ? fallback : rawPrices[typeCode];
            return [typeCode, money(value, `سعر ${type.typeName || typeCode}`)];
        }));
        return { code, planName: requiredString(item.planName ?? item.label, 'اسم الباقة', 80), monthlyPrice, prices };
    });
    const seen = new Set();
    for (const item of normalized) {
        if (seen.has(item.code)) throw appError('لا يمكن تكرار الباقة في نفس الطلب.');
        seen.add(item.code);
    }
    await withTransaction(async (transaction) => {
        for (const item of normalized) {
            const result = await transaction.request()
                .input('planCode', sql.VarChar(30), item.code)
                .input('planName', sql.NVarChar(80), item.planName)
                .input('monthlyPrice', sql.Decimal(12, 2), item.monthlyPrice)
                .query(`UPDATE dbo.membership_pricing
                        SET plan_name = @planName, monthly_price = @monthlyPrice, updated_at = SYSUTCDATETIME()
                        WHERE plan_code = @planCode;`);
            if (!result.rowsAffected[0]) throw appError('بيانات الباقة غير موجودة.', 404);
            for (const [typeCode, price] of Object.entries(item.prices)) {
                const updated = await transaction.request()
                    .input('planCode', sql.VarChar(30), item.code)
                    .input('typeCode', sql.VarChar(30), typeCode)
                    .input('price', sql.Decimal(12, 2), price)
                    .query(`UPDATE dbo.membership_type_prices
                            SET price = @price, updated_at = SYSUTCDATETIME()
                            WHERE plan_code = @planCode AND type_code = @typeCode;`);
                if (!updated.rowsAffected[0]) {
                    await transaction.request()
                        .input('planCode', sql.VarChar(30), item.code)
                        .input('typeCode', sql.VarChar(30), typeCode)
                        .input('price', sql.Decimal(12, 2), price)
                        .query(`INSERT INTO dbo.membership_type_prices (plan_code, type_code, price)
                                VALUES (@planCode, @typeCode, @price);`);
                }
            }
        }
    });
    invalidatePricingCatalog();
    return getPricingCatalog();
}

function normalizeTypeCode(value) {
    const code = String(value ?? '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,29}$/.test(code)) {
        throw appError('رمز نوع العضوية يجب أن يبدأ بحرف إنجليزي ويحتوي على أحرف أو أرقام أو _.');
    }
    return code;
}

function booleanValue(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function normalizeMembershipTypePayload(body = {}, current = {}) {
    const typeCode = normalizeTypeCode(body.typeCode ?? body.code ?? current.type_code);
    const typeName = body.typeName === undefined && body.label === undefined
        ? requiredString(current.type_name, 'اسم نوع العضوية', 80)
        : requiredString(body.typeName ?? body.label, 'اسم نوع العضوية', 80);
    const durationMode = String(body.durationMode ?? body.mode ?? current.duration_mode ?? '').trim().toLowerCase();
    if (!['months', 'days'].includes(durationMode)) throw appError('وحدة مدة العضوية غير صالحة.');
    const durationValue = positiveValue(
        body.durationValue ?? body.duration ?? body.days ?? current.duration_value,
        'مدة العضوية',
        12000
    );
    if (!Number.isInteger(durationValue)) {
        throw appError('مدة العضوية يجب أن تكون رقماً صحيحاً بالأيام أو الشهور.');
    }
    const priceMultiplier = positiveValue(
        body.priceMultiplier ?? body.multiplier ?? current.price_multiplier,
        'معامل السعر',
        1000
    );
    const rawSortOrder = body.sortOrder ?? body.sort ?? current.sort_order ?? 0;
    const sortOrder = Number(rawSortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
        throw appError('ترتيب نوع العضوية غير صالح.');
    }
    return {
        typeCode,
        typeName,
        durationMode,
        durationValue,
        priceMultiplier,
        isActive: booleanValue(body.isActive, current.is_active === undefined ? true : Boolean(current.is_active)),
        sortOrder
    };
}

async function createMembershipType(body = {}) {
    const typeCode = normalizeTypeCode(body.typeCode ?? body.code);
    const data = normalizeMembershipTypePayload({ ...body, typeCode });
    const pool = await getPool();
    const exists = await pool.request()
        .input('typeCode', sql.VarChar(30), typeCode)
        .query('SELECT id FROM dbo.membership_types WHERE type_code = @typeCode;');
    if (exists.recordset[0]) throw appError('رمز نوع العضوية مستخدم بالفعل.');
    await pool.request()
        .input('typeCode', sql.VarChar(30), data.typeCode)
        .input('typeName', sql.NVarChar(80), data.typeName)
        .input('durationMode', sql.VarChar(10), data.durationMode)
        .input('durationValue', sql.Decimal(8, 2), data.durationValue)
        .input('priceMultiplier', sql.Decimal(8, 4), data.priceMultiplier)
        .input('isActive', sql.Bit, data.isActive)
        .input('sortOrder', sql.Int, data.sortOrder)
        .query(`INSERT INTO dbo.membership_types
                (type_code, type_name, duration_mode, duration_value, price_multiplier, is_active, sort_order)
                VALUES (@typeCode, @typeName, @durationMode, @durationValue, @priceMultiplier, @isActive, @sortOrder);`);
    invalidatePricingCatalog();
    return getPricingCatalog();
}

async function updateMembershipType(typeCodeValue, body = {}) {
    const typeCode = normalizeTypeCode(typeCodeValue);
    const pool = await getPool();
    const currentResult = await pool.request()
        .input('typeCode', sql.VarChar(30), typeCode)
        .query(`SELECT type_code, type_name, duration_mode, duration_value,
                       price_multiplier, is_active, sort_order
                FROM dbo.membership_types WHERE type_code = @typeCode;`);
    const current = currentResult.recordset[0];
    if (!current) throw appError('نوع العضوية غير موجود.', 404);
    const data = normalizeMembershipTypePayload({ ...body, typeCode }, current);
    await pool.request()
        .input('typeCode', sql.VarChar(30), typeCode)
        .input('typeName', sql.NVarChar(80), data.typeName)
        .input('durationMode', sql.VarChar(10), data.durationMode)
        .input('durationValue', sql.Decimal(8, 2), data.durationValue)
        .input('priceMultiplier', sql.Decimal(8, 4), data.priceMultiplier)
        .input('isActive', sql.Bit, data.isActive)
        .input('sortOrder', sql.Int, data.sortOrder)
        .query(`UPDATE dbo.membership_types
                SET type_name = @typeName, duration_mode = @durationMode,
                    duration_value = @durationValue, price_multiplier = @priceMultiplier,
                    is_active = @isActive, sort_order = @sortOrder,
                    updated_at = SYSUTCDATETIME()
                WHERE type_code = @typeCode;`);
    invalidatePricingCatalog();
    return getPricingCatalog();
}

async function getDashboard({ readOnly = false } = {}) {
    if (!readOnly) await ensureAttendanceTable();
    const pool = await getPool();
    const today = todayInTimeZone();
    const result = await pool.request()
        .input('today', sql.Date, toUtcDate(today))
        .input('inactiveSince', sql.Date, toUtcDate(addDays(today, -7)))
        .batch(`${MEMBER_ROWS_CTE}
            SELECT ${MEMBER_ROW_COLUMNS} INTO #member_rows FROM member_rows;

            SELECT
                COUNT(1) AS total,
                SUM(CASE WHEN computedStatus = 'active' THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN computedStatus = 'expiring_soon' THEN 1 ELSE 0 END) AS expiringSoon,
                SUM(CASE WHEN computedStatus = 'expired' THEN 1 ELSE 0 END) AS expired,
                SUM(CASE WHEN computedStatus = 'frozen' THEN 1 ELSE 0 END) AS frozen,
                (
                    SELECT
                        id, fullName, phone, email, registrationDate, memberNotes,
                        memberCreatedAt, memberUpdatedAt, membershipId, membershipPlan,
                        membershipType, startDate, endDate, membershipNotes,
                        effectiveEndDate, freezeId, freezeStart, freezeEnd, freezeCount,
                        listPrice, discountAmount, amountDue, amountPaid,
                        amountRemaining, paymentMethod, paymentPaidAt,
                        computedStatus, daysRemaining
                    FROM #member_rows
                    WHERE membershipId IS NOT NULL
                      AND computedStatus IN ('frozen', 'expiring_soon', 'expired')
                    ORDER BY effectiveEndDate ASC, fullName ASC, id ASC
                    FOR JSON PATH
                ) AS alertsJson
            FROM #member_rows
            WHERE membershipId IS NOT NULL;

            SELECT TOP (50) ${MEMBER_ROW_COLUMNS} FROM #member_rows
            WHERE membershipId IS NOT NULL AND amountRemaining > 0
            ORDER BY amountRemaining DESC, effectiveEndDate ASC, fullName ASC;

            SELECT TOP (50) ${MEMBER_ROW_COLUMNS},
                   last_visit.lastVisitDate,
                   DATEDIFF(day, last_visit.lastVisitDate, @today) AS daysSinceLastVisit
            FROM #member_rows AS member_rows
            OUTER APPLY (
                SELECT TOP (1) a.attendance_date AS lastVisitDate
                FROM dbo.gym_attendance AS a
                WHERE a.member_id = member_rows.id
                ORDER BY a.attendance_date DESC, a.check_in_at DESC, a.id DESC
            ) AS last_visit
            WHERE member_rows.computedStatus = 'active'
              AND (
                  (last_visit.lastVisitDate IS NULL
                   AND (member_rows.registrationDate < @inactiveSince OR member_rows.startDate < @inactiveSince))
                  OR last_visit.lastVisitDate < @inactiveSince
              )
            ORDER BY CASE WHEN last_visit.lastVisitDate IS NULL THEN 0 ELSE 1 END,
                     last_visit.lastVisitDate ASC, member_rows.fullName ASC;

            DROP TABLE #member_rows;`);
    const recordsets = result.recordsets || [];
    const row = recordsets[0]?.[0] || {};
    const alertRows = row.alertsJson ? JSON.parse(row.alertsJson) : [];
    const membershipAlerts = alertRows.map((item) => ({ ...mapMember(item), alertKind: 'membership' }));
    const debtAlerts = (recordsets[1] || []).map((item) => ({ ...mapMember(item), alertKind: 'debt' }));
    const inactiveAlerts = (recordsets[2] || []).map((item) => ({
        ...mapMember(item),
        alertKind: 'inactive',
        lastVisitDate: formatDateOnly(item.lastVisitDate),
        daysSinceLastVisit: item.daysSinceLastVisit == null ? null : Number(item.daysSinceLastVisit)
    }));
    const alerts = [...membershipAlerts, ...debtAlerts, ...inactiveAlerts]
        .filter((item, index, list) => list.findIndex((candidate) => `${candidate.alertKind}:${candidate.id}` === `${item.alertKind}:${item.id}`) === index);
    const alertContacts = await alertContactService.getLatestForAlerts(alerts, { readOnly });
    const alertsWithContactState = alerts.map((alert) => {
        const alertKey = alertContactService.buildAlertKey(alert);
        return {
            ...alert,
            alertKey,
            alertContact: alertContacts.get(alertContactService.compositeKey(alert.id, alert.alertKind, alertKey)) || null
        };
    });
    return {
        today,
        stats: {
            total: Number(row.total || 0),
            active: Number(row.active || 0),
            expiringSoon: Number(row.expiringSoon || 0),
            expired: Number(row.expired || 0),
            frozen: Number(row.frozen || 0)
        },
        alerts: alertsWithContactState
    };
}

async function markAlertCommunication(memberId, payload = {}, userId = null) {
    return alertContactService.mark(memberId, payload, userId);
}

async function getRawMember(connection, id) {
    const result = await connection.request()
        .input('id', sql.Int, ensureId(id))
        .query(`SELECT id, full_name, phone, phone_normalized, email, registration_date, notes
                FROM dbo.members WHERE id = @id;`);
    return result.recordset[0] || null;
}

async function getRawMembership(connection, memberId) {
    const result = await connection.request()
        .input('memberId', sql.Int, ensureId(memberId))
        .query(`SELECT TOP 1 id, member_id, membership_plan, membership_type, start_date, end_date, notes,
                       cancelled_at, cancelled_by_user_id, cancellation_reason
                FROM dbo.memberships WITH (UPDLOCK, HOLDLOCK) WHERE member_id = @memberId
                ORDER BY CASE WHEN cancelled_at IS NULL THEN 0 ELSE 1 END, end_date DESC, id DESC;`);
    return result.recordset[0] || null;
}

async function getRawPayment(connection, membershipId) {
    const result = await connection.request()
        .input('membershipId', sql.Int, ensureId(membershipId, 'معرّف الاشتراك'))
        .query(`SELECT TOP 1 id, membership_id, list_price, discount_amount, amount_due, amount_paid, payment_method, paid_at, notes
                FROM dbo.gym_payments WHERE membership_id = @membershipId;`);
    return result.recordset[0] || null;
}

async function getFreezeUsage(connection, memberId, membershipId) {
    const result = await connection.request()
        .input('memberId', sql.Int, ensureId(memberId))
        .input('membershipId', sql.Int, ensureId(membershipId, 'معرّف الاشتراك'))
        .query(`SELECT
                    COALESCE((SELECT SUM(CASE
                        WHEN f.resumed_date IS NULL THEN DATEDIFF(day, f.start_date, f.end_date) + 1
                        WHEN f.resumed_date <= f.start_date THEN 0
                        WHEN f.resumed_date < f.end_date THEN DATEDIFF(day, f.start_date, f.resumed_date)
                        ELSE DATEDIFF(day, f.start_date, f.end_date) + 1
                    END) FROM dbo.membership_freezes AS f WHERE f.membership_id = @membershipId), 0) AS freezeDays,
                    COALESCE((SELECT COUNT_BIG(*)
                              FROM dbo.membership_freezes AS f
                              INNER JOIN dbo.memberships AS m ON m.id = f.membership_id
                              WHERE m.member_id = @memberId), 0) AS freezeCount;`);
    return {
        freezeDays: Number(result.recordset[0].freezeDays || 0),
        freezeCount: Number(result.recordset[0].freezeCount || 0)
    };
}

async function getActiveFreeze(connection, membershipId, today) {
    const result = await connection.request()
        .input('membershipId', sql.Int, ensureId(membershipId, 'معرّف الاشتراك'))
        .input('today', sql.Date, toUtcDate(today))
        .query(`SELECT TOP 1 id, start_date, end_date, reason
                FROM dbo.membership_freezes
                WHERE membership_id = @membershipId AND resumed_date IS NULL
                  AND @today BETWEEN start_date AND end_date
                ORDER BY start_date DESC, id DESC;`);
    return result.recordset[0] || null;
}

function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function buildSubscriptionRefundPreview({ membership, payment, refundedAmount = 0, freezeDays = 0, today }) {
    const amountPaid = roundMoney(payment?.amount_paid);
    const amountDue = roundMoney(payment?.amount_due);
    const alreadyRefunded = roundMoney(refundedAmount);
    if (!membership) {
        return {
            eligible: false,
            message: '\u0644\u0627 \u064a\u0648\u062c\u062f \u0627\u0634\u062a\u0631\u0627\u0643 \u0645\u0633\u062c\u0644 \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0636\u0648.',
            policy: 'not_available',
            amountPaid,
            amountDue,
            alreadyRefunded,
            refundableAmount: 0,
            remainingDays: 0,
            totalDays: 0,
            membership: null,
            payment: payment ? { id: Number(payment.id), paymentMethod: payment.payment_method } : null
        };
    }

    const startDate = formatDateOnly(membership.start_date);
    const endDate = formatDateOnly(membership.end_date);
    const effectiveEndDate = addDays(endDate, Math.max(0, Number(freezeDays || 0)));
    const totalDays = Math.max(1, differenceInDays(startDate, effectiveEndDate) + 1);
    const remainingDays = today < startDate
        ? totalDays
        : Math.max(0, Math.min(totalDays, differenceInDays(today, effectiveEndDate) + 1));
    const grossPaid = roundMoney(amountPaid + alreadyRefunded);
    const entitlement = roundMoney(grossPaid * (remainingDays / totalDays));
    const refundableAmount = roundMoney(Math.min(amountPaid, Math.max(0, entitlement - alreadyRefunded)));
    const policy = today < startDate
        ? 'full_before_start'
        : remainingDays > 0
            ? 'prorated_remaining_days'
            : 'expired_no_refund';
    let message = '';
    if (membership.cancelled_at) message = '\u062a\u0645 \u0625\u0644\u063a\u0627\u0621 \u0647\u0630\u0627 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643 \u0645\u0633\u0628\u0642\u064b\u0627.';
    else if (!payment || amountPaid <= 0) message = '\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u0628\u0644\u063a \u0645\u062f\u0641\u0648\u0639 \u0642\u0627\u0628\u0644 \u0644\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639.';
    else if (refundableAmount <= 0) message = '\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u0628\u0644\u063a \u0642\u0627\u0628\u0644 \u0644\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0648\u0641\u0642\u064b\u0627 \u0644\u0644\u0633\u064a\u0627\u0633\u0629.';
    return {
        eligible: !membership.cancelled_at && Boolean(payment) && amountPaid > 0 && refundableAmount > 0,
        message,
        policy,
        amountPaid,
        amountDue,
        alreadyRefunded,
        refundableAmount,
        remainingDays,
        totalDays,
        grossPaid,
        startDate,
        endDate,
        effectiveEndDate,
        membership: {
            id: Number(membership.id),
            startDate,
            endDate,
            effectiveEndDate,
            cancelledAt: membership.cancelled_at ? formatDateOnly(membership.cancelled_at) : null,
            cancellationReason: membership.cancellation_reason || null
        },
        payment: payment ? {
            id: Number(payment.id),
            amountPaid,
            amountDue,
            amountRemaining: roundMoney(payment.amount_remaining),
            paymentMethod: payment.payment_method || 'cash'
        } : null
    };
}

async function getSubscriptionRefundState(connection, memberId) {
    const membership = await getRawMembership(connection, memberId);
    if (!membership) return { membership: null, payment: null, refundedAmount: 0, freezeDays: 0 };
    const payment = await getRawPayment(connection, membership.id);
    const refundsResult = await connection.request()
        .input('membershipId', sql.Int, ensureId(membership.id, '\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643'))
        .query(`SELECT COALESCE(SUM(amount_refunded), 0) AS refundedAmount
                FROM dbo.gym_subscription_refunds
                WHERE membership_id = @membershipId;`);
    const freezeUsage = await getFreezeUsage(connection, memberId, membership.id);
    return {
        membership,
        payment,
        refundedAmount: Number(refundsResult.recordset[0]?.refundedAmount || 0),
        freezeDays: freezeUsage.freezeDays
    };
}

async function getSubscriptionRefundPreview(id) {
    const memberId = ensureId(id);
    await ensureSubscriptionRefundsTable();
    const pool = await getPool();
    const state = await getSubscriptionRefundState(pool, memberId);
    return {
        memberId,
        ...buildSubscriptionRefundPreview({ ...state, today: todayInTimeZone() })
    };
}

async function addEvent(connection, memberId, membershipId, eventType, details) {
    await connection.request()
        .input('memberId', sql.Int, memberId)
        .input('membershipId', sql.Int, membershipId || null)
        .input('eventType', sql.VarChar(30), eventType)
        .input('details', sql.NVarChar(sql.MAX), JSON.stringify(details || {}))
        .query(`INSERT INTO dbo.membership_events (member_id, membership_id, event_type, details)
                VALUES (@memberId, @membershipId, @eventType, @details);`);
}

async function addPaymentTransaction(connection, {
    membershipId,
    transactionType = 'payment',
    listPrice,
    discountAmount,
    amountDue,
    amountPaid,
    amountRemaining,
    paymentMethod = 'cash',
    paidAt = null,
    notes = null,
    sourcePaymentId = null
}) {
    const result = await connection.request()
        .input('membershipId', sql.Int, membershipId)
        .input('transactionType', sql.VarChar(20), transactionType)
        .input('listPrice', sql.Decimal(12, 2), listPrice)
        .input('discountAmount', sql.Decimal(12, 2), discountAmount)
        .input('amountDue', sql.Decimal(12, 2), amountDue)
        .input('amountPaid', sql.Decimal(12, 2), amountPaid)
        .input('amountRemaining', sql.Decimal(12, 2), Math.max(0, amountRemaining))
        .input('paymentMethod', sql.VarChar(20), paymentMethod)
        .input('paidAt', sql.Date, paidAt ? toUtcDate(paidAt) : null)
        .input('notes', sql.NVarChar(500), notes)
        .input('sourcePaymentId', sql.Int, sourcePaymentId || null)
        .query(`INSERT INTO dbo.gym_payment_transactions
                    (membership_id, transaction_type, list_price, discount_amount, amount_due,
                     amount_paid, amount_remaining, payment_method, paid_at, notes, source_payment_id)
                OUTPUT INSERTED.id
                VALUES (@membershipId, @transactionType, @listPrice, @discountAmount, @amountDue,
                        @amountPaid, @amountRemaining, @paymentMethod, @paidAt, @notes, @sourcePaymentId);`);
    return Number(result.recordset[0].id);
}

async function createMember(body, { tenantSlug = '' } = {}) {
    const data = normalizePayload(body);
    const amountPaid = data.amountPaid ?? 0;
    await ensureMemberIdentityFields();
    await ensurePaymentTransactionsTable();
    await membershipCodeService.ensureMembershipCodeStorage();
    let issuedMembershipCode = null;
    const memberId = await withTransaction(async (transaction) => {
        await assertNoDuplicateMember(transaction, data.phoneNormalized, data.email);
        const pricing = await calculatePricing(data.membershipType, data.membershipPlan, data.discountAmount, transaction);
        const membershipType = pricing.typeCode || data.membershipType;
        if (amountPaid > pricing.amountDue) throw appError('المبلغ المدفوع لا يمكن أن يتجاوز قيمة الاشتراك بعد الخصم.');
        const endDate = data.endDate || membershipEndDateFromConfig(data.startDate, pricing.typeConfig);
        const memberResult = await transaction.request()
            .input('fullName', sql.NVarChar(120), data.fullName)
            .input('phone', sql.NVarChar(30), data.phone)
            .input('phoneNormalized', sql.NVarChar(30), data.phoneNormalized)
            .input('email', sql.NVarChar(254), data.email)
            .input('registrationDate', sql.Date, toUtcDate(data.registrationDate))
            .input('notes', sql.NVarChar(1000), data.notes)
            .query(`INSERT INTO dbo.members (full_name, phone, phone_normalized, email, registration_date, notes)
                    OUTPUT INSERTED.id
                    VALUES (@fullName, @phone, @phoneNormalized, @email, @registrationDate, @notes);`);
        const id = Number(memberResult.recordset[0].id);
        issuedMembershipCode = await membershipCodeService.issueForMember(id, transaction, { action: 'issued' });
        const membershipResult = await transaction.request()
            .input('memberId', sql.Int, id)
            .input('membershipPlan', sql.VarChar(30), data.membershipPlan)
            .input('membershipType', sql.VarChar(30), membershipType)
            .input('startDate', sql.Date, toUtcDate(data.startDate))
            .input('endDate', sql.Date, toUtcDate(endDate))
            .input('notes', sql.NVarChar(1000), data.membershipNotes)
            .query(`INSERT INTO dbo.memberships (member_id, membership_plan, membership_type, start_date, end_date, notes)
                    OUTPUT INSERTED.id
                    VALUES (@memberId, @membershipPlan, @membershipType, @startDate, @endDate, @notes);`);
        const membershipId = Number(membershipResult.recordset[0].id);
        await transaction.request()
            .input('membershipId', sql.Int, membershipId)
            .input('listPrice', sql.Decimal(12, 2), pricing.listPrice)
            .input('discountAmount', sql.Decimal(12, 2), pricing.discountAmount)
            .input('amountDue', sql.Decimal(12, 2), pricing.amountDue)
            .input('amountPaid', sql.Decimal(12, 2), amountPaid)
            .input('paymentMethod', sql.VarChar(20), data.paymentMethod)
            .input('paidAt', sql.Date, data.amountPaid > 0 ? toUtcDate(todayInTimeZone()) : null)
            .input('notes', sql.NVarChar(500), data.paymentNotes)
            .query(`INSERT INTO dbo.gym_payments (membership_id, list_price, discount_amount, amount_due, amount_paid, payment_method, paid_at, notes)
                    VALUES (@membershipId, @listPrice, @discountAmount, @amountDue, @amountPaid, @paymentMethod, @paidAt, @notes);`);
        if (amountPaid > 0) {
            await addPaymentTransaction(transaction, {
                membershipId,
                transactionType: 'subscription',
                listPrice: pricing.listPrice,
                discountAmount: pricing.discountAmount,
                amountDue: pricing.amountDue,
                amountPaid,
                amountRemaining: pricing.amountDue - amountPaid,
                paymentMethod: data.paymentMethod,
                paidAt: todayInTimeZone(),
                notes: data.paymentNotes
            });
        }
        await addEvent(transaction, id, membershipId, 'created', {
            membershipPlan: data.membershipPlan,
            membershipType,
            startDate: data.startDate,
            endDate,
            listPrice: pricing.listPrice,
            discountAmount: pricing.discountAmount,
            amountDue: pricing.amountDue,
            amountPaid
        });
        return id;
    });
    const member = await getMemberById(memberId);
    return {
        ...member,
        membershipCode: issuedMembershipCode,
        membershipCodePortalUrl: membershipCodeService.getPortalUrl('', tenantSlug)
    };
}

async function updateMember(id, body) {
    const memberId = ensureId(id);
    await ensureMemberIdentityFields();
    await ensurePaymentTransactionsTable();
    const updatedId = await withTransaction(async (transaction) => {
        const currentMember = await getRawMember(transaction, memberId);
        if (!currentMember) throw appError('العضو غير موجود.', 404);
        const currentMembership = await getRawMembership(transaction, memberId);
        if (!currentMembership) throw appError('لا يوجد اشتراك لهذا العضو.', 400);
        const currentPayment = await getRawPayment(transaction, currentMembership.id);
        const patch = normalizePayload(body, { partial: true });

        const memberData = {
            fullName: patch.fullName ?? currentMember.full_name,
            phone: patch.phone ?? currentMember.phone,
            phoneNormalized: patch.phoneNormalized ?? normalizePhone(currentMember.phone_normalized || currentMember.phone),
            email: patch.email === undefined ? currentMember.email : patch.email,
            registrationDate: patch.registrationDate ?? formatDateOnly(currentMember.registration_date),
            notes: patch.notes === undefined ? currentMember.notes : patch.notes
        };
        await assertNoDuplicateMember(transaction, memberData.phoneNormalized, memberData.email, memberId);
        const membershipData = {
            plan: patch.membershipPlan ?? currentMembership.membership_plan ?? 'gym_only',
            type: patch.membershipType ?? currentMembership.membership_type,
            startDate: patch.startDate ?? formatDateOnly(currentMembership.start_date),
            endDate: patch.endDate ?? formatDateOnly(currentMembership.end_date),
            notes: patch.membershipNotes === undefined ? currentMembership.notes : patch.membershipNotes
        };
        if (membershipData.endDate < membershipData.startDate) {
            throw appError('تاريخ الانتهاء يجب أن يكون بعد أو مساوياً لتاريخ البداية.');
        }
        const pricingChanged = has(body, 'membershipType') || has(body, 'membershipPlan') || has(body, 'discountAmount');
        const paymentChanged = pricingChanged || has(body, 'amountDue') || has(body, 'amountPaid') || has(body, 'paymentMethod') || has(body, 'paymentNotes');
        let pricing = null;
        if (pricingChanged) {
            pricing = await calculatePricing(
                membershipData.type,
                membershipData.plan,
                patch.discountAmount ?? currentPayment?.discount_amount ?? 0,
                transaction
            );
            membershipData.type = pricing.typeCode || membershipData.type;
        }

        await transaction.request()
            .input('id', sql.Int, memberId)
            .input('fullName', sql.NVarChar(120), memberData.fullName)
            .input('phone', sql.NVarChar(30), memberData.phone)
            .input('phoneNormalized', sql.NVarChar(30), memberData.phoneNormalized)
            .input('email', sql.NVarChar(254), memberData.email)
            .input('registrationDate', sql.Date, toUtcDate(memberData.registrationDate))
            .input('notes', sql.NVarChar(1000), memberData.notes)
            .query(`UPDATE dbo.members SET full_name = @fullName, phone = @phone, phone_normalized = @phoneNormalized, email = @email,
                    registration_date = @registrationDate, notes = @notes, updated_at = SYSUTCDATETIME()
                    WHERE id = @id;`);
        await transaction.request()
            .input('id', sql.Int, currentMembership.id)
            .input('membershipPlan', sql.VarChar(30), membershipData.plan)
            .input('membershipType', sql.VarChar(30), membershipData.type)
            .input('startDate', sql.Date, toUtcDate(membershipData.startDate))
            .input('endDate', sql.Date, toUtcDate(membershipData.endDate))
            .input('notes', sql.NVarChar(1000), membershipData.notes)
            .query(`UPDATE dbo.memberships SET membership_plan = @membershipPlan, membership_type = @membershipType, start_date = @startDate,
                    end_date = @endDate, notes = @notes, updated_at = SYSUTCDATETIME() WHERE id = @id;`);

        let payment = null;
        const previousAmountPaid = Number(currentPayment?.amount_paid || 0);
        if (paymentChanged) {
            if (pricingChanged) {
                const amountPaid = patch.amountPaid ?? currentPayment?.amount_paid ?? 0;
                if (amountPaid > pricing.amountDue) throw appError('المبلغ المدفوع لا يمكن أن يتجاوز قيمة الاشتراك بعد الخصم.');
                payment = {
                    ...pricing,
                    amountPaid,
                    paymentMethod: patch.paymentMethod ?? currentPayment?.payment_method ?? 'cash',
                    paymentNotes: patch.paymentNotes === undefined ? (currentPayment?.notes || null) : patch.paymentNotes,
                    paidAt: amountPaid > 0 ? todayInTimeZone() : null
                };
            } else {
                payment = normalizePaymentPayload(body, currentPayment || {});
            }
            if (currentPayment) {
                await transaction.request()
                    .input('id', sql.Int, currentPayment.id)
                    .input('listPrice', sql.Decimal(12, 2), payment.listPrice)
                    .input('discountAmount', sql.Decimal(12, 2), payment.discountAmount)
                    .input('amountDue', sql.Decimal(12, 2), payment.amountDue)
                    .input('amountPaid', sql.Decimal(12, 2), payment.amountPaid)
                    .input('paymentMethod', sql.VarChar(20), payment.paymentMethod)
                    .input('paidAt', sql.Date, payment.paidAt ? toUtcDate(payment.paidAt) : null)
                    .input('notes', sql.NVarChar(500), payment.paymentNotes)
                    .query(`UPDATE dbo.gym_payments SET list_price = @listPrice, discount_amount = @discountAmount,
                            amount_due = @amountDue, amount_paid = @amountPaid,
                            payment_method = @paymentMethod, paid_at = @paidAt, notes = @notes,
                            updated_at = SYSUTCDATETIME() WHERE id = @id;`);
            } else {
                await transaction.request()
                    .input('membershipId', sql.Int, currentMembership.id)
                    .input('listPrice', sql.Decimal(12, 2), payment.listPrice)
                    .input('discountAmount', sql.Decimal(12, 2), payment.discountAmount)
                    .input('amountDue', sql.Decimal(12, 2), payment.amountDue)
                    .input('amountPaid', sql.Decimal(12, 2), payment.amountPaid)
                    .input('paymentMethod', sql.VarChar(20), payment.paymentMethod)
                    .input('paidAt', sql.Date, payment.paidAt ? toUtcDate(payment.paidAt) : null)
                    .input('notes', sql.NVarChar(500), payment.paymentNotes)
                    .query(`INSERT INTO dbo.gym_payments (membership_id, list_price, discount_amount, amount_due, amount_paid, payment_method, paid_at, notes)
                            VALUES (@membershipId, @listPrice, @discountAmount, @amountDue, @amountPaid, @paymentMethod, @paidAt, @notes);`);
            }
            const paymentDelta = Math.round((Number(payment.amountPaid) - previousAmountPaid) * 100) / 100;
            if (paymentDelta !== 0) {
                await addPaymentTransaction(transaction, {
                    membershipId: currentMembership.id,
                    transactionType: paymentDelta > 0 ? 'payment' : 'adjustment',
                    listPrice: payment.listPrice,
                    discountAmount: payment.discountAmount,
                    amountDue: payment.amountDue,
                    amountPaid: paymentDelta,
                    amountRemaining: payment.amountDue - payment.amountPaid,
                    paymentMethod: payment.paymentMethod,
                    paidAt: paymentDelta > 0 ? todayInTimeZone() : null,
                    notes: payment.paymentNotes || (paymentDelta < 0 ? 'تسوية يدوية على الرصيد.' : null)
                });
            }
        }
        await addEvent(transaction, memberId, currentMembership.id, 'updated', {
            fields: Object.keys(body || {}),
            membershipPlan: membershipData.plan,
            membershipType: membershipData.type,
            ...(paymentChanged ? {
                listPrice: payment.listPrice,
                discountAmount: payment.discountAmount,
                amountDue: payment.amountDue,
                amountPaid: payment.amountPaid
            } : {})
        });
        return memberId;
    });
    return getMemberById(updatedId);
}

async function deleteMember(id) {
    const memberId = ensureId(id);
    const result = await withTransaction(async (transaction) => transaction.request()
        .input('id', sql.Int, memberId)
        .query(`
            IF OBJECT_ID(N'dbo.workout_set_logs', N'U') IS NOT NULL
            BEGIN
                UPDATE logs SET workout_exercise_id = NULL
                FROM dbo.workout_set_logs logs
                INNER JOIN dbo.workout_exercises exercises ON exercises.id = logs.workout_exercise_id
                INNER JOIN dbo.workout_routines routines ON routines.id = exercises.routine_id
                INNER JOIN dbo.workout_programs programs ON programs.id = routines.program_id
                WHERE programs.member_id = @id;
            END;
            IF OBJECT_ID(N'dbo.meal_logs', N'U') IS NOT NULL
            BEGIN
                UPDATE logs SET meal_item_id = NULL
                FROM dbo.meal_logs logs
                INNER JOIN dbo.diet_meal_items items ON items.id = logs.meal_item_id
                INNER JOIN dbo.diet_meals meals ON meals.id = items.meal_id
                INNER JOIN dbo.diet_plans plans ON plans.id = meals.diet_plan_id
                WHERE plans.member_id = @id;
            END;
            DELETE FROM dbo.members WHERE id = @id;
        `));
    if (!result.rowsAffected.some((count) => Number(count) > 0)) throw appError('العضو غير موجود.', 404);
}

async function activateMembership(id, body = {}) {
    const memberId = ensureId(id);
    await ensurePaymentTransactionsTable();
    const membershipType = requiredString(body.membershipType || body.type, 'نوع العضوية', 30);
    const today = todayInTimeZone();
    const activatedId = await withTransaction(async (transaction) => {
        const member = await getRawMember(transaction, memberId);
        if (!member) throw appError('العضو غير موجود.', 404);
        const existing = await getRawMembership(transaction, memberId);
        if (existing && !existing.cancelled_at) throw appError('يوجد اشتراك مسجل لهذا العضو بالفعل. استخدم التجديد.', 409);
        const membershipPlan = body.membershipPlan || 'gym_only';
        const pricing = await calculatePricing(membershipType, membershipPlan, money(body.discountAmount, 'الخصم', 0), transaction);
        const resolvedMembershipType = pricing.typeCode || membershipType;
        const startDate = body.startDate ? parseDateOnly(body.startDate, 'تاريخ البداية') : today;
        const configuredEndDate = body.endDate ? parseDateOnly(body.endDate, 'تاريخ الانتهاء') : membershipEndDateFromConfig(startDate, pricing.typeConfig);
        if (configuredEndDate < startDate) throw appError('تاريخ الانتهاء يجب أن يكون بعد أو مساوياً لتاريخ البداية.');
        const amountPaid = money(body.amountPaid, 'المبلغ المدفوع', 0);
        if (amountPaid > pricing.amountDue) throw appError('المبلغ المدفوع لا يمكن أن يتجاوز قيمة الاشتراك بعد الخصم.');
        const paymentMethod = parsePaymentMethod(body.paymentMethod, 'cash');
        const paymentNotes = optionalString(body.paymentNotes, 500);
        const membershipNotes = optionalString(body.membershipNotes, 1000);
        const result = await transaction.request()
            .input('memberId', sql.Int, memberId)
            .input('membershipPlan', sql.VarChar(30), membershipPlan)
            .input('membershipType', sql.VarChar(30), resolvedMembershipType)
            .input('startDate', sql.Date, toUtcDate(startDate))
            .input('endDate', sql.Date, toUtcDate(configuredEndDate))
            .input('notes', sql.NVarChar(1000), membershipNotes)
            .query(`INSERT INTO dbo.memberships (member_id, membership_plan, membership_type, start_date, end_date, notes)
                    OUTPUT INSERTED.id VALUES (@memberId, @membershipPlan, @membershipType, @startDate, @endDate, @notes);`);
        const membershipId = Number(result.recordset[0].id);
        await transaction.request()
            .input('membershipId', sql.Int, membershipId)
            .input('listPrice', sql.Decimal(12, 2), pricing.listPrice)
            .input('discountAmount', sql.Decimal(12, 2), pricing.discountAmount)
            .input('amountDue', sql.Decimal(12, 2), pricing.amountDue)
            .input('amountPaid', sql.Decimal(12, 2), amountPaid)
            .input('paymentMethod', sql.VarChar(20), paymentMethod)
            .input('paidAt', sql.Date, amountPaid > 0 ? toUtcDate(today) : null)
            .input('notes', sql.NVarChar(500), paymentNotes)
            .query(`INSERT INTO dbo.gym_payments (membership_id, list_price, discount_amount, amount_due, amount_paid, payment_method, paid_at, notes)
                    VALUES (@membershipId, @listPrice, @discountAmount, @amountDue, @amountPaid, @paymentMethod, @paidAt, @notes);`);
        if (amountPaid > 0) {
            await addPaymentTransaction(transaction, {
                membershipId,
                transactionType: 'subscription',
                listPrice: pricing.listPrice,
                discountAmount: pricing.discountAmount,
                amountDue: pricing.amountDue,
                amountPaid,
                amountRemaining: pricing.amountDue - amountPaid,
                paymentMethod,
                paidAt: today,
                notes: paymentNotes
            });
        }
        await addEvent(transaction, memberId, membershipId, 'activated', {
            membershipPlan,
            membershipType: resolvedMembershipType,
            startDate,
            endDate: configuredEndDate,
            listPrice: pricing.listPrice,
            discountAmount: pricing.discountAmount,
            amountDue: pricing.amountDue,
            amountPaid
        });
        return memberId;
    });
    return getMemberById(activatedId);
}

async function freezeMember(id, days, reason) {
    const memberId = ensureId(id);
    const freezeDays = Number(days);
    if (!Number.isInteger(freezeDays) || freezeDays < 1 || freezeDays > 365) {
        throw appError('مدة التجميد يجب أن تكون بين يوم و365 يوماً.');
    }
    const today = todayInTimeZone();
    const freezeReason = optionalString(reason, 500);
    const frozenId = await withTransaction(async (transaction) => {
        const membership = await getRawMembership(transaction, memberId);
        if (membership?.cancelled_at) throw appError('لا يمكن تنفيذ هذا الإجراء على اشتراك ملغى.');
        if (!membership) throw appError('لا يوجد اشتراك لهذا العضو.', 400);
        if (await getActiveFreeze(transaction, membership.id, today)) throw appError('العضوية مجمدة بالفعل.');
        const freezeUsage = await getFreezeUsage(transaction, memberId, membership.id);
        if (freezeUsage.freezeCount >= MEMBERSHIP_FREEZE_LIMIT) {
            throw appError(`تم استهلاك الحد الأقصى للتجميد (${MEMBERSHIP_FREEZE_LIMIT} مرات) لهذا العضو.`);
        }
        const effectiveEnd = addDays(formatDateOnly(membership.end_date), freezeUsage.freezeDays);
        if (effectiveEnd < today) throw appError('لا يمكن تجميد اشتراك منتهٍ.');
        const freezeEnd = addDays(today, freezeDays - 1);
        const result = await transaction.request()
            .input('membershipId', sql.Int, membership.id)
            .input('startDate', sql.Date, toUtcDate(today))
            .input('endDate', sql.Date, toUtcDate(freezeEnd))
            .input('reason', sql.NVarChar(500), freezeReason)
            .query(`INSERT INTO dbo.membership_freezes (membership_id, start_date, end_date, reason)
                    OUTPUT INSERTED.id VALUES (@membershipId, @startDate, @endDate, @reason);`);
        const freezeId = Number(result.recordset[0].id);
        await addEvent(transaction, memberId, membership.id, 'frozen', { freezeId, days: freezeDays, freezeNumber: freezeUsage.freezeCount + 1, freezeLimit: MEMBERSHIP_FREEZE_LIMIT, startDate: today, endDate: freezeEnd });
        return memberId;
    });
    return getMemberById(frozenId);
}

async function resumeMember(id) {
    const memberId = ensureId(id);
    const today = todayInTimeZone();
    const resumedId = await withTransaction(async (transaction) => {
        const membership = await getRawMembership(transaction, memberId);
        if (membership?.cancelled_at) throw appError('لا يمكن تنفيذ هذا الإجراء على اشتراك ملغى.');
        if (!membership) throw appError('لا يوجد اشتراك لهذا العضو.', 400);
        const activeFreeze = await getActiveFreeze(transaction, membership.id, today);
        if (!activeFreeze) throw appError('لا يوجد تجميد نشط حالياً.');
        await transaction.request()
            .input('id', sql.Int, activeFreeze.id)
            .input('resumedDate', sql.Date, toUtcDate(today))
            .query(`UPDATE dbo.membership_freezes SET resumed_date = @resumedDate,
                    updated_at = SYSUTCDATETIME() WHERE id = @id;`);
        await addEvent(transaction, memberId, membership.id, 'resumed', {
            freezeId: activeFreeze.id,
            resumedDate: today
        });
        return memberId;
    });
    return getMemberById(resumedId);
}

async function renewMember(id, body = {}) {
    const memberId = ensureId(id);
    await ensurePaymentTransactionsTable();
    const type = body.membershipType || body.type;
    const membershipType = requiredString(type, 'نوع العضوية', 30);
    const today = todayInTimeZone();
    const pool = await getPool();
    const existingMembership = await getRawMembership(pool, memberId);
    if (!existingMembership) return activateMembership(memberId, body);
    if (existingMembership.cancelled_at) return activateMembership(memberId, body);
    const renewedId = await withTransaction(async (transaction) => {
        const current = await getRawMembership(transaction, memberId);
        if (!current) throw appError('لا يوجد اشتراك لهذا العضو.', 400);
        if (await getActiveFreeze(transaction, current.id, today)) throw appError('استأنف العضوية قبل التجديد.');
        const freezeUsage = await getFreezeUsage(transaction, memberId, current.id);
        const effectiveEnd = addDays(formatDateOnly(current.end_date), freezeUsage.freezeDays);
        const startDate = effectiveEnd < today ? today : addDays(effectiveEnd, 1);
        const membershipPlan = body.membershipPlan || current.membership_plan || 'gym_only';
        const pricing = await calculatePricing(membershipType, membershipPlan, money(body.discountAmount, 'الخصم', 0), transaction);
        const resolvedMembershipType = pricing.typeCode || membershipType;
        const endDate = membershipEndDateFromConfig(startDate, pricing.typeConfig);
        const amountPaid = money(body.amountPaid, 'المبلغ المدفوع', 0);
        if (amountPaid > pricing.amountDue) throw appError('المبلغ المدفوع لا يمكن أن يتجاوز قيمة الاشتراك بعد الخصم.');
        const paymentMethod = parsePaymentMethod(body.paymentMethod, 'cash');
        const paymentNotes = optionalString(body.paymentNotes, 500);
        const membershipNotes = optionalString(body.membershipNotes, 1000);
        const result = await transaction.request()
            .input('memberId', sql.Int, memberId)
            .input('membershipPlan', sql.VarChar(30), membershipPlan)
            .input('membershipType', sql.VarChar(30), resolvedMembershipType)
            .input('startDate', sql.Date, toUtcDate(startDate))
            .input('endDate', sql.Date, toUtcDate(endDate))
            .input('notes', sql.NVarChar(1000), membershipNotes)
            .query(`INSERT INTO dbo.memberships (member_id, membership_plan, membership_type, start_date, end_date, notes)
                    OUTPUT INSERTED.id VALUES (@memberId, @membershipPlan, @membershipType, @startDate, @endDate, @notes);`);
        const membershipId = Number(result.recordset[0].id);
        await transaction.request()
            .input('membershipId', sql.Int, membershipId)
            .input('listPrice', sql.Decimal(12, 2), pricing.listPrice)
            .input('discountAmount', sql.Decimal(12, 2), pricing.discountAmount)
            .input('amountDue', sql.Decimal(12, 2), pricing.amountDue)
            .input('amountPaid', sql.Decimal(12, 2), amountPaid)
            .input('paymentMethod', sql.VarChar(20), paymentMethod)
            .input('paidAt', sql.Date, amountPaid > 0 ? toUtcDate(today) : null)
            .input('notes', sql.NVarChar(500), paymentNotes)
            .query(`INSERT INTO dbo.gym_payments (membership_id, list_price, discount_amount, amount_due, amount_paid, payment_method, paid_at, notes)
                    VALUES (@membershipId, @listPrice, @discountAmount, @amountDue, @amountPaid, @paymentMethod, @paidAt, @notes);`);
        if (amountPaid > 0) {
            await addPaymentTransaction(transaction, {
                membershipId,
                transactionType: 'subscription',
                listPrice: pricing.listPrice,
                discountAmount: pricing.discountAmount,
                amountDue: pricing.amountDue,
                amountPaid,
                amountRemaining: pricing.amountDue - amountPaid,
                paymentMethod,
                paidAt: today,
                notes: paymentNotes
            });
        }
        await addEvent(transaction, memberId, membershipId, 'renewed', {
            membershipPlan, membershipType: resolvedMembershipType, startDate, endDate,
            listPrice: pricing.listPrice,
            discountAmount: pricing.discountAmount,
            amountDue: pricing.amountDue,
            amountPaid
        });
        return memberId;
    });
    return getMemberById(renewedId);
}

async function recordPayment(membershipId, body = {}) {
    const id = ensureId(membershipId, 'معرّف الاشتراك');
    await ensurePaymentTransactionsTable();
    const memberId = await withTransaction(async (transaction) => {
        const membershipResult = await transaction.request()
            .input('membershipId', sql.Int, id)
            .query('SELECT member_id, cancelled_at FROM dbo.memberships WHERE id = @membershipId;');
        const membership = membershipResult.recordset[0];
        if (!membership) throw appError('الاشتراك غير موجود.', 404);
        if (membership.cancelled_at) throw appError('لا يمكن تسجيل دفعة على اشتراك ملغى.');
        const current = await getRawPayment(transaction, id);
        const previousAmountPaid = Number(current?.amount_paid || 0);
        const paymentBody = has(body, 'paymentAmount')
            ? { ...body, amountPaid: previousAmountPaid + money(body.paymentAmount, 'قيمة الدفعة الجديدة') }
            : body;
        const payment = normalizePaymentPayload(paymentBody, current || {});
        const paymentDelta = Math.round((Number(payment.amountPaid) - previousAmountPaid) * 100) / 100;
        if (current) {
            await transaction.request()
                .input('id', sql.Int, current.id)
                .input('listPrice', sql.Decimal(12, 2), payment.listPrice)
                .input('discountAmount', sql.Decimal(12, 2), payment.discountAmount)
                .input('amountDue', sql.Decimal(12, 2), payment.amountDue)
                .input('amountPaid', sql.Decimal(12, 2), payment.amountPaid)
                .input('paymentMethod', sql.VarChar(20), payment.paymentMethod)
                .input('paidAt', sql.Date, payment.paidAt ? toUtcDate(payment.paidAt) : null)
                .input('notes', sql.NVarChar(500), payment.paymentNotes)
                .query(`UPDATE dbo.gym_payments SET list_price = @listPrice, discount_amount = @discountAmount,
                        amount_due = @amountDue, amount_paid = @amountPaid,
                        payment_method = @paymentMethod, paid_at = @paidAt, notes = @notes,
                        updated_at = SYSUTCDATETIME() WHERE id = @id;`);
        } else {
            await transaction.request()
                .input('membershipId', sql.Int, id)
                .input('listPrice', sql.Decimal(12, 2), payment.listPrice)
                .input('discountAmount', sql.Decimal(12, 2), payment.discountAmount)
                .input('amountDue', sql.Decimal(12, 2), payment.amountDue)
                .input('amountPaid', sql.Decimal(12, 2), payment.amountPaid)
                .input('paymentMethod', sql.VarChar(20), payment.paymentMethod)
                .input('paidAt', sql.Date, payment.paidAt ? toUtcDate(payment.paidAt) : null)
                .input('notes', sql.NVarChar(500), payment.paymentNotes)
                .query(`INSERT INTO dbo.gym_payments (membership_id, list_price, discount_amount, amount_due, amount_paid, payment_method, paid_at, notes)
                        VALUES (@membershipId, @listPrice, @discountAmount, @amountDue, @amountPaid, @paymentMethod, @paidAt, @notes);`);
        }
        if (paymentDelta !== 0) {
            await addPaymentTransaction(transaction, {
                membershipId: id,
                transactionType: paymentDelta > 0 ? 'payment' : 'adjustment',
                listPrice: payment.listPrice,
                discountAmount: payment.discountAmount,
                amountDue: payment.amountDue,
                amountPaid: paymentDelta,
                amountRemaining: payment.amountDue - payment.amountPaid,
                paymentMethod: payment.paymentMethod,
                paidAt: paymentDelta > 0 ? todayInTimeZone() : null,
                notes: payment.paymentNotes || (paymentDelta < 0 ? 'تسوية يدوية على الرصيد.' : null)
            });
        }
        await addEvent(transaction, Number(membership.member_id), id, 'payment_updated', {
            listPrice: payment.listPrice,
            discountAmount: payment.discountAmount,
            amountDue: payment.amountDue,
            amountPaid: paymentDelta,
            totalPaid: payment.amountPaid,
            amountRemaining: payment.amountDue - payment.amountPaid,
            paymentMethod: payment.paymentMethod
        });
        return Number(membership.member_id);
    });
    return getMemberById(memberId);
}

async function refundSubscription(id, body = {}, userId = null) {
    const memberId = ensureId(id);
    await ensureSubscriptionRefundsTable();
    const reason = requiredString(
        body.reason ?? body.refundReason,
        '\u0633\u0628\u0628 \u0627\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639',
        500
    );
    const notes = optionalString(body.notes, 1000);
    const result = await withTransaction(async (transaction) => {
        const state = await getSubscriptionRefundState(transaction, memberId);
        const preview = buildSubscriptionRefundPreview({ ...state, today: todayInTimeZone() });
        if (!preview.eligible) throw appError(preview.message || 'لا يمكن تنفيذ استرجاع لهذا الاشتراك.');

        const requestedAmount = has(body, 'refundAmount') && body.refundAmount !== ''
            ? money(body.refundAmount, '\u0645\u0628\u0644\u063a \u0627\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639')
            : preview.refundableAmount;
        if (requestedAmount <= 0) throw appError('\u0645\u0628\u0644\u063a \u0627\u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u064a\u062c\u0628 \u0623\u0646 \u064a\u0643\u0648\u0646 \u0623\u0643\u0628\u0631 \u0645\u0646 \u0635\u0641\u0631.');
        if (requestedAmount > preview.refundableAmount + 0.01) {
            throw appError(`\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0623\u0642\u0635\u0649 \u0627\u0644\u0645\u0633\u0645\u0648\u062d \u0628\u0647 \u0647\u0648 ${preview.refundableAmount}.`);
        }
        const refundMethod = parsePaymentMethod(
            body.refundMethod ?? body.paymentMethod,
            state.payment?.payment_method || 'cash'
        );
        const amountPaid = roundMoney(state.payment.amount_paid);
        const amountDue = roundMoney(state.payment.amount_due);
        const newAmountPaid = roundMoney(amountPaid - requestedAmount);
        const newAmountRemaining = roundMoney(amountDue - newAmountPaid);
        const refundDate = todayInTimeZone();
        const refundResult = await transaction.request()
            .input('membershipId', sql.Int, Number(state.membership.id))
            .input('amountRefunded', sql.Decimal(12, 2), requestedAmount)
            .input('refundMethod', sql.VarChar(20), refundMethod)
            .input('reason', sql.NVarChar(500), reason)
            .input('notes', sql.NVarChar(1000), notes)
            .input('refundDate', sql.Date, toUtcDate(refundDate))
            .input('createdByUserId', sql.Int, userId || null)
            .query(`INSERT INTO dbo.gym_subscription_refunds
                        (membership_id, amount_refunded, refund_method, reason, notes, refund_date, created_by_user_id)
                    OUTPUT INSERTED.id
                    VALUES (@membershipId, @amountRefunded, @refundMethod, @reason, @notes, @refundDate, @createdByUserId);`);
        const refundId = Number(refundResult.recordset[0].id);
        const refundNote = `\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0634\u062a\u0631\u0627\u0643: ${reason}${notes ? ` · ${notes}` : ''}`;
        const transactionId = await addPaymentTransaction(transaction, {
            membershipId: Number(state.membership.id),
            transactionType: 'adjustment',
            listPrice: state.payment.list_price,
            discountAmount: state.payment.discount_amount,
            amountDue,
            amountPaid: -requestedAmount,
            amountRemaining: newAmountRemaining,
            paymentMethod: refundMethod,
            paidAt: refundDate,
            notes: refundNote
        });
        await transaction.request()
            .input('paymentId', sql.Int, Number(state.payment.id))
            .input('amountPaid', sql.Decimal(12, 2), newAmountPaid)
            .query(`UPDATE dbo.gym_payments
                    SET amount_paid = @amountPaid, updated_at = SYSUTCDATETIME()
                    WHERE id = @paymentId;`);

        const fullRefund = requestedAmount >= preview.amountPaid - 0.01;
        if (fullRefund) {
            await transaction.request()
                .input('membershipId', sql.Int, Number(state.membership.id))
                .input('actorUserId', sql.Int, userId || null)
                .input('cancellationReason', sql.NVarChar(500), reason)
                .query(`UPDATE dbo.memberships
                        SET cancelled_at = SYSUTCDATETIME(),
                            cancelled_by_user_id = @actorUserId,
                            cancellation_reason = @cancellationReason,
                            updated_at = SYSUTCDATETIME()
                        WHERE id = @membershipId;`);
        }
        await addEvent(transaction, memberId, Number(state.membership.id), 'subscription_refunded', {
            refundId,
            transactionId,
            amountRefunded: requestedAmount,
            refundMethod,
            reason,
            notes,
            refundDate,
            remainingAmountPaid: newAmountPaid,
            remainingAmount: newAmountRemaining,
            cancelled: fullRefund
        });
        return {
            id: refundId,
            transactionId,
            membershipId: Number(state.membership.id),
            amountRefunded: requestedAmount,
            refundMethod,
            reason,
            notes,
            refundDate,
            cancelled: fullRefund
        };
    });
    return { refund: result, member: await getMemberById(memberId) };
}

function parseEventDetails(value) {
    if (!value) return {};
    try { return JSON.parse(value); } catch (_) { return { text: String(value) }; }
}

function freezeDaysFromDates(startDate, endDate, resumedDate) {
    if (!resumedDate) return differenceInDays(startDate, endDate) + 1;
    if (resumedDate <= startDate) return 0;
    if (resumedDate < endDate) return differenceInDays(startDate, resumedDate);
    return differenceInDays(startDate, endDate) + 1;
}

async function getMemberDetails(id) {
    const memberId = ensureId(id);
    await ensurePaymentTransactionsTable();
    const pool = await getPool();
    const today = todayInTimeZone();
    const [memberResult, membershipsResult, freezesResult, eventsResult, paymentsResult] = await Promise.all([
        pool.request()
            .input('memberId', sql.Int, memberId)
            .query(`SELECT id, full_name, phone, email, registration_date, notes, created_at, updated_at
                    FROM dbo.members WHERE id = @memberId;`),
        pool.request()
            .input('memberId', sql.Int, memberId)
            .query(`SELECT m.id, m.membership_plan, m.membership_type, m.start_date, m.end_date, m.notes,
                           m.cancelled_at, m.cancellation_reason,
                           p.list_price, p.discount_amount, p.amount_due, p.amount_paid,
                           p.amount_remaining, p.payment_method, p.paid_at, p.notes AS payment_notes
                    FROM dbo.memberships AS m
                    LEFT JOIN dbo.gym_payments AS p ON p.membership_id = m.id
                    WHERE m.member_id = @memberId
                    ORDER BY m.start_date ASC, m.id ASC;`),
        pool.request()
            .input('memberId', sql.Int, memberId)
            .query(`SELECT f.id, f.membership_id, f.start_date, f.end_date, f.resumed_date,
                           f.reason, f.created_at, f.updated_at
                    FROM dbo.membership_freezes AS f
                    INNER JOIN dbo.memberships AS m ON m.id = f.membership_id
                    WHERE m.member_id = @memberId
                    ORDER BY f.start_date ASC, f.id ASC;`),
        pool.request()
            .input('memberId', sql.Int, memberId)
            .query(`SELECT id, membership_id, event_type, details, created_at
                    FROM dbo.membership_events
                    WHERE member_id = @memberId
                    ORDER BY created_at ASC, id ASC;`),
        pool.request()
            .input('memberId', sql.Int, memberId)
            .query(`SELECT p.id, p.membership_id, p.transaction_type,
                           p.list_price, p.discount_amount, p.amount_due,
                           p.amount_paid, p.amount_remaining,
                           p.payment_method, p.paid_at, p.notes, p.created_at,
                           m.membership_plan, m.membership_type
                    FROM dbo.gym_payment_transactions AS p
                    INNER JOIN dbo.memberships AS m ON m.id = p.membership_id
                    WHERE m.member_id = @memberId
                    ORDER BY p.created_at DESC, p.id DESC;`)
    ]);

    const memberRow = memberResult.recordset[0];
    const membershipCode = await membershipCodeService.getPreview(memberId);
    if (!memberRow) throw appError('العضو غير موجود.', 404);

    const freezeRows = freezesResult.recordset.map((row) => {
        const startDate = formatDateOnly(row.start_date);
        const endDate = formatDateOnly(row.end_date);
        const resumedDate = formatDateOnly(row.resumed_date);
        return {
            id: Number(row.id),
            membershipId: Number(row.membership_id),
            startDate,
            endDate,
            resumedDate,
            reason: row.reason,
            days: freezeDaysFromDates(startDate, endDate, resumedDate),
            active: !resumedDate && today >= startDate && today <= endDate,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    });

    const memberships = membershipsResult.recordset.map((row) => {
        const membershipId = Number(row.id);
        const membershipFreezes = freezeRows.filter((freeze) => freeze.membershipId === membershipId);
        const freezeDays = membershipFreezes.reduce((total, freeze) => total + freeze.days, 0);
        const startDate = formatDateOnly(row.start_date);
        const endDate = formatDateOnly(row.end_date);
        const effectiveEndDate = addDays(endDate, freezeDays);
        const activeFreeze = membershipFreezes.find((freeze) => freeze.active);
        const daysRemaining = differenceInDays(today, effectiveEndDate);
        const status = row.cancelled_at
            ? 'cancelled'
            : activeFreeze
            ? 'frozen'
            : effectiveEndDate < today
                ? 'expired'
                : daysRemaining <= 7
                    ? 'expiring_soon'
                    : 'active';
        return {
            id: membershipId,
            plan: row.membership_plan || 'gym_only',
            planLabel: DEFAULT_MEMBERSHIP_PLANS[row.membership_plan || 'gym_only']?.label || row.membership_plan,
            type: row.membership_type,
            startDate,
            endDate,
            effectiveEndDate,
            status,
            cancelledAt: row.cancelled_at ? formatDateOnly(row.cancelled_at) : null,
            cancellationReason: row.cancellation_reason || null,
            daysRemaining,
            notes: row.notes,
            freezeDays,
            freezeCount: membershipFreezes.length,
            freezeLimit: MEMBERSHIP_FREEZE_LIMIT,
            freezesRemaining: Math.max(0, MEMBERSHIP_FREEZE_LIMIT - membershipFreezes.length),
            activeFreezeId: activeFreeze?.id || null,
            listPrice: Number(row.list_price || 0),
            discountAmount: Number(row.discount_amount || 0),
            amountDue: Number(row.amount_due || 0),
            amountPaid: Number(row.amount_paid || 0),
            amountRemaining: Number(row.amount_remaining || 0),
            paymentMethod: row.payment_method || 'cash',
            paidAt: formatDateOnly(row.paid_at),
            paymentNotes: row.payment_notes,
            freezes: membershipFreezes
        };
    });

    const payments = paymentsResult.recordset.map((row) => ({
        id: Number(row.id),
        membershipId: Number(row.membership_id),
        receiptNumber: `TG-${String(row.id).padStart(6, '0')}`,
        transactionType: row.transaction_type === 'adjustment' && String(row.notes || '').startsWith('\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0634\u062a\u0631\u0627\u0643')
            ? 'refund'
            : (row.transaction_type || 'payment'),
        plan: row.membership_plan || 'gym_only',
        type: row.membership_type,
        listPrice: Number(row.list_price || 0),
        discountAmount: Number(row.discount_amount || 0),
        amountDue: Number(row.amount_due || 0),
        amountPaid: Number(row.amount_paid || 0),
        amountRemaining: Number(row.amount_remaining || 0),
        paymentMethod: row.payment_method || 'cash',
        paidAt: formatDateOnly(row.paid_at),
        transactionDate: row.created_at,
        notes: row.notes,
        createdAt: row.created_at
    }));
    const totalDue = memberships.reduce((sum, item) => sum + item.amountDue, 0);
    const totalPaid = memberships.reduce((sum, item) => sum + item.amountPaid, 0);
    const totalRemaining = memberships.reduce((sum, item) => sum + item.amountRemaining, 0);
    const paidTransactions = payments.filter((item) => item.amountPaid > 0);
    return {
        member: {
            id: Number(memberRow.id),
            fullName: memberRow.full_name,
            phone: memberRow.phone,
            email: memberRow.email,
            registrationDate: formatDateOnly(memberRow.registration_date),
            notes: memberRow.notes,
            createdAt: memberRow.created_at,
            updatedAt: memberRow.updated_at,
            membershipCode
        },
        memberships,
        freezes: freezeRows,
        payments,
        financialSummary: {
            totalDue,
            totalPaid,
            totalRemaining,
            transactionCount: payments.length,
            paidTransactionCount: paidTransactions.length,
            lastPaymentAt: paidTransactions[0]?.transactionDate || null
        },
        events: eventsResult.recordset.map((row) => ({
            id: Number(row.id),
            membershipId: row.membership_id ? Number(row.membership_id) : null,
            eventType: row.event_type,
            details: parseEventDetails(row.details),
            createdAt: row.created_at
        }))
    };
}

module.exports = {
    createMember,
    deleteMember,
    getBootstrap,
    getDashboard,
    getMemberById,
    getMemberDetails,
    ensurePaymentTransactionsTable,
    ensureSubscriptionRefundsTable,
    getSubscriptionRefundPreview,
    getMembers,
    markAlertCommunication,
    getPricingCatalog,
    createPricingPlan,
    createMembershipType,
    freezeMember,
    recordPayment,
    refundSubscription,
    renewMember,
    resumeMember,
    updateMembershipType,
    updatePricingPlan,
    updatePricingCatalog,
    updatePricing,
    updateMember
};
