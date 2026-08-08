const DAY_MS = 24 * 60 * 60 * 1000;

function todayInTimeZone() {
    const timeZone = process.env.APP_TIMEZONE || 'Africa/Cairo';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function parseDateOnly(value, fieldName = 'التاريخ') {
    const normalized = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        const error = new Error(`${fieldName} غير صالح.`);
        error.statusCode = 400;
        error.expose = true;
        throw error;
    }
    const date = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
        const error = new Error(`${fieldName} غير صالح.`);
        error.statusCode = 400;
        error.expose = true;
        throw error;
    }
    return normalized;
}

function toUtcDate(dateOnly) {
    return new Date(`${parseDateOnly(dateOnly)}T00:00:00.000Z`);
}

function formatDateOnly(value) {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
}

function addDays(dateOnly, days) {
    const date = toUtcDate(dateOnly);
    date.setUTCDate(date.getUTCDate() + Number(days));
    return date.toISOString().slice(0, 10);
}

function addMonths(dateOnly, months) {
    const [year, month, day] = parseDateOnly(dateOnly).split('-').map(Number);
    const monthIndex = month - 1 + Number(months);
    const targetYear = year + Math.floor(monthIndex / 12);
    const targetMonth = ((monthIndex % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)))
        .toISOString().slice(0, 10);
}

function differenceInDays(fromDate, toDate) {
    return Math.round((toUtcDate(toDate).getTime() - toUtcDate(fromDate).getTime()) / DAY_MS);
}

function membershipEndDate(startDate, membershipType) {
    const months = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[membershipType];
    return addDays(addMonths(startDate, months), -1);
}

module.exports = {
    addDays,
    addMonths,
    differenceInDays,
    formatDateOnly,
    membershipEndDate,
    parseDateOnly,
    todayInTimeZone,
    toUtcDate
};
