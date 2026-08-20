'use strict';

const dayPassRepository = require('../repositories/day-pass.repository');
const { addDays, differenceInDays, parseDateOnly, todayInTimeZone } = require('../utils/date');

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];

function appError(message, statusCode = 400, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    if (code) error.code = code;
    return error;
}

function requiredString(value, label, maxLength) {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw appError(`${label} مطلوب.`);
    if (normalized.length > maxLength) throw appError(`${label} أطول من المسموح.`);
    return normalized;
}

function optionalString(value, maxLength) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw appError('إحدى البيانات النصية أطول من المسموح.');
    return normalized;
}

function positiveMoney(value, label = 'السعر') {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999) throw appError(`${label} غير صالح.`);
    return Math.round(amount * 100) / 100;
}

function ensureId(value, label = 'المعرّف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw appError(`${label} غير صالح.`);
    return id;
}

function normalizePhone(value) {
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const englishDigits = '0123456789';
    let phone = String(value ?? '').trim().replace(/[٠-٩]/gu, (digit) => englishDigits[arabicDigits.indexOf(digit)]);
    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    if (phone.startsWith('20') && phone.length === 12) return phone;
    if (phone.startsWith('0') && phone.length === 11) return `20${phone.slice(1)}`;
    if (phone.length >= 8 && phone.length <= 15) return phone;
    throw appError('رقم الهاتف غير صالح.', 400, 'INVALID_VISITOR_PHONE');
}

function parsePaymentMethod(value) {
    const method = String(value || 'cash').trim().toLowerCase();
    if (!PAYMENT_METHODS.includes(method)) throw appError('طريقة الدفع غير صالحة.');
    return method;
}

function parseRange(query = {}) {
    const today = todayInTimeZone();
    const from = parseDateOnly(query.from || `${today.slice(0, 7)}-01`, 'تاريخ البداية');
    const to = parseDateOnly(query.to || today, 'تاريخ النهاية');
    if (from > to) throw appError('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
    if (differenceInDays(from, to) > 730) throw appError('أقصى فترة للعرض هي 730 يومًا.');
    return { from, to, nextDate: addDays(to, 1) };
}

async function getPricing() {
    const types = await dayPassRepository.listTypes();
    return { types };
}

async function updatePricing(body = {}) {
    const incoming = Array.isArray(body.types) ? body.types : [];
    if (!incoming.length) throw appError('أدخل أسعار الحصص قبل الحفظ.');
    const current = await dayPassRepository.listTypes();
    const currentCodes = new Set(current.map((item) => item.code));
    const seen = new Set();
    const items = incoming.map((item) => {
        const code = String(item.code || '').trim();
        if (!currentCodes.has(code) || seen.has(code)) throw appError('نوع الحصة غير صالح أو مكرر.');
        seen.add(code);
        return {
            code,
            label: requiredString(item.label, 'اسم الحصة', 120),
            price: positiveMoney(item.price),
            active: item.active !== false,
            sortOrder: Number.isInteger(Number(item.sortOrder)) ? Number(item.sortOrder) : 0
        };
    });
    return { types: await dayPassRepository.updateTypes(items) };
}

async function createDayPass(body = {}, { createdByUserId = null } = {}) {
    const visitorName = requiredString(body.visitorName ?? body.name, 'اسم الزائر', 120);
    const visitorPhone = requiredString(body.visitorPhone ?? body.phone, 'رقم الهاتف', 30);
    const visitorPhoneNormalized = normalizePhone(visitorPhone);
    const passTypeCode = requiredString(body.passTypeCode ?? body.type, 'نوع الحصة', 40);
    const passType = await dayPassRepository.findActiveType(passTypeCode);
    if (!passType) throw appError('نوع الحصة غير متاح حاليًا.', 400, 'DAY_PASS_TYPE_UNAVAILABLE');
    const paymentMethod = parsePaymentMethod(body.paymentMethod);
    const visitDate = parseDateOnly(body.visitDate || todayInTimeZone(), 'تاريخ الحصة');
    const notes = optionalString(body.notes, 500);
    const sale = await dayPassRepository.createSale({
        visitorName,
        visitorPhone,
        visitorPhoneNormalized,
        passType,
        paymentMethod,
        visitDate,
        notes,
        createdByUserId
    });
    return {
        sale,
        whatsapp: {
            phone: visitorPhoneNormalized,
            message: `أهلًا ${visitorName} 👋\n\nشكرًا لحضورك اليوم في TOP GYM، نورتنا جدًا 💙\n\nنوع الحصة: ${passType.label}\nنتمنى نشوفك دائمًا 💪`
        }
    };
}

async function listDayPasses(query = {}) {
    const range = parseRange(query);
    const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
    const pageSize = Math.max(5, Math.min(100, Number.parseInt(query.pageSize, 10) || 20));
    const typeCode = String(query.typeCode || '').trim();
    const paymentMethod = query.paymentMethod ? parsePaymentMethod(query.paymentMethod) : '';
    const search = String(query.search || '').trim().slice(0, 120);
    return dayPassRepository.listSales({ ...range, typeCode, paymentMethod, search, page, pageSize, includeVoided: String(query.includeVoided) === 'true' });
}

async function getSummary(query = {}) {
    const range = parseRange(query);
    const result = await dayPassRepository.getRangeData(range);
    const byType = result.records.reduce((summary, item) => {
        const key = item.passTypeCode;
        const current = summary[key] || { code: key, label: item.passTypeName, count: 0, amount: 0 };
        current.count += 1;
        current.amount += Number(item.amountPaid || 0);
        summary[key] = current;
        return summary;
    }, {});
    return {
        period: range,
        count: result.summary.count,
        amount: Math.round(result.summary.amount * 100) / 100,
        byType: Object.values(byType).map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 }))
    };
}

async function markWhatsappOpened(id) {
    const result = await dayPassRepository.markWhatsappOpened(ensureId(id, 'معرّف الحصة'));
    if (!result.rowsAffected[0]) throw appError('الحصة غير موجودة أو تم إلغاؤها.', 404, 'DAY_PASS_NOT_FOUND');
    return { ok: true };
}

async function voidDayPass(id) {
    const result = await dayPassRepository.voidSale(ensureId(id, 'معرّف الحصة'));
    if (!result.rowsAffected[0]) throw appError('الحصة غير موجودة أو تم إلغاؤها من قبل.', 404, 'DAY_PASS_NOT_FOUND');
    return { ok: true };
}

module.exports = {
    createDayPass,
    ensureDayPassTables: dayPassRepository.ensureDayPassTables,
    getPricing,
    getSummary,
    listDayPasses,
    markWhatsappOpened,
    updatePricing,
    voidDayPass
};
