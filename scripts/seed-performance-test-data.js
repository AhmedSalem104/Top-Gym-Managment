require('dotenv').config();

const { getPricingCatalog } = require('../src/services/member-service');
const { closePool, getPool, initDatabase, sql } = require('../src/db');
const { todayInTimeZone } = require('../src/utils/date');

const DEFAULT_COUNT = 1000;
const SEED_TAG = 'PERF_TEST_SEED';
const TYPE_CODES = ['monthly', 'half_month', 'quarterly', 'semiannual', 'annual'];
const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'];

function parseCount() {
    const argument = process.argv.find((value) => value.startsWith('--count='));
    const count = Number(argument ? argument.slice('--count='.length) : DEFAULT_COUNT);
    if (!Number.isInteger(count) || count < 1 || count > 10000) {
        throw new Error('The count must be an integer between 1 and 10000.');
    }
    return count;
}

function addDays(dateOnly, days) {
    const date = new Date(`${dateOnly}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + Number(days));
    return date.toISOString().slice(0, 10);
}

function roundMoney(value) {
    return Math.round(Number(value) * 100) / 100;
}

function statusFor(index, count) {
    const activeCount = Math.floor(count * 0.35);
    const expiringCount = Math.floor(count * 0.2);
    const expiredCount = Math.floor(count * 0.2);
    const frozenCount = Math.floor(count * 0.15);
    if (index < activeCount) return 'active';
    if (index < activeCount + expiringCount) return 'expiring_soon';
    if (index < activeCount + expiringCount + expiredCount) return 'expired';
    if (index < activeCount + expiringCount + expiredCount + frozenCount) return 'frozen';
    return 'without_membership';
}

function createSeedRows(count, today, pricing) {
    const members = [];
    const memberships = [];
    const payments = [];
    const freezes = [];
    const events = [];

    for (let index = 0; index < count; index += 1) {
        const number = index + 1;
        const code = String(number).padStart(4, '0');
        const kind = statusFor(index, count);
        const phone = `011900${String(number).padStart(5, '0')}`;
        const member = {
            index,
            kind,
            phone,
            fullName: `اختبار أداء ${code}`,
            email: `perf-test-${code}@topgym.local`,
            registrationDate: addDays(today, -((number * 7) % 365)),
            notes: SEED_TAG
        };
        members.push(member);

        if (kind === 'without_membership') {
            events.push({
                index,
                eventType: 'created',
                details: JSON.stringify({ seed: SEED_TAG, status: kind })
            });
            continue;
        }

        const membershipPlan = number % 2 === 0 ? 'gym_cardio' : 'gym_only';
        const membershipType = TYPE_CODES[index % TYPE_CODES.length];
        const startDate = kind === 'expired'
            ? addDays(today, -90 - (number % 180))
            : addDays(today, -30 - (number % 90));
        const endDate = kind === 'active'
            ? addDays(today, 30 + (number % 180))
            : kind === 'expiring_soon'
                ? addDays(today, 1 + (number % 7))
                : kind === 'expired'
                    ? addDays(today, -1 - (number % 90))
                    : addDays(today, 45 + (number % 120));
        const membership = {
            index,
            kind,
            membershipPlan,
            membershipType,
            startDate,
            endDate,
            notes: SEED_TAG
        };
        memberships.push(membership);

        if (kind === 'frozen') {
            freezes.push({
                index,
                startDate: addDays(today, -2 - (number % 3)),
                endDate: addDays(today, 3 + (number % 5)),
                reason: 'اختبار أداء - تجميد نشط'
            });
        }

        const plan = pricing.plans[membershipPlan];
        const type = pricing.types[membershipType];
        const listPrice = roundMoney(Number(plan.monthlyPrice) * Number(type.priceMultiplier));
        const discountAmount = number % 5 === 0 ? 10 : number % 3 === 0 ? 5 : 0;
        const amountDue = roundMoney(listPrice - Math.min(discountAmount, listPrice));
        const amountPaid = kind === 'expired'
            ? (number % 4 === 0 ? amountDue : 0)
            : kind === 'expiring_soon'
                ? (number % 2 === 0 ? amountDue : roundMoney(amountDue / 2))
                : kind === 'frozen'
                    ? amountDue
                    : (number % 3 === 0 ? amountDue : roundMoney(amountDue * 0.75));
        payments.push({
            index,
            listPrice,
            discountAmount: roundMoney(listPrice - amountDue),
            amountDue,
            amountPaid,
            paymentMethod: PAYMENT_METHODS[index % PAYMENT_METHODS.length],
            paidAt: amountPaid > 0 ? addDays(today, -(number % 30)) : null,
            notes: SEED_TAG
        });
        events.push({
            index,
            eventType: 'created',
            details: JSON.stringify({
                seed: SEED_TAG,
                status: kind,
                membershipPlan,
                membershipType
            })
        });
    }

    return { members, memberships, payments, freezes, events };
}

async function insertJson(request, parameterName, rows, query) {
    if (!rows.length) return;
    await request
        .input(parameterName, sql.NVarChar(sql.MAX), JSON.stringify(rows))
        .query(query);
}

async function main() {
    const count = parseCount();
    await initDatabase();
    const pool = await getPool();
    const existing = await pool.request()
        .input('seedTag', sql.NVarChar(100), SEED_TAG)
        .query('SELECT COUNT_BIG(*) AS total FROM dbo.members WHERE notes = @seedTag;');
    if (Number(existing.recordset[0]?.total || 0) > 0) {
        throw new Error(`Seed data already exists for ${SEED_TAG}. No duplicate rows were created.`);
    }

    const pricing = await getPricingCatalog(pool);
    const today = todayInTimeZone();
    const rows = createSeedRows(count, today, pricing);
    const transaction = new sql.Transaction(pool);

    await transaction.begin();
    try {
        await insertJson(transaction.request(), 'membersJson', rows.members, `
            INSERT INTO dbo.members (full_name, phone, email, registration_date, notes)
            SELECT fullName, phone, email, registrationDate, notes
            FROM OPENJSON(@membersJson)
            WITH (
                fullName NVARCHAR(120) '$.fullName',
                phone NVARCHAR(30) '$.phone',
                email NVARCHAR(254) '$.email',
                registrationDate DATE '$.registrationDate',
                notes NVARCHAR(1000) '$.notes'
            ) AS seed;
        `);

        const memberResult = await transaction.request()
            .input('seedTag', sql.NVarChar(100), SEED_TAG)
            .query('SELECT id, phone FROM dbo.members WHERE notes = @seedTag;');
        const memberIdsByIndex = new Map(memberResult.recordset.map((row) => [
            Number(String(row.phone).slice(-5)) - 1,
            Number(row.id)
        ]));
        if (memberIdsByIndex.size !== count) throw new Error('Could not map all seeded members.');

        await insertJson(transaction.request(), 'membershipsJson', rows.memberships.map((membership) => ({
            memberId: memberIdsByIndex.get(membership.index),
            membershipPlan: membership.membershipPlan,
            membershipType: membership.membershipType,
            startDate: membership.startDate,
            endDate: membership.endDate,
            notes: membership.notes
        })), `
            INSERT INTO dbo.memberships (member_id, membership_plan, membership_type, start_date, end_date, notes)
            SELECT memberId, membershipPlan, membershipType, startDate, endDate, notes
            FROM OPENJSON(@membershipsJson)
            WITH (
                memberId INT '$.memberId',
                membershipPlan VARCHAR(30) '$.membershipPlan',
                membershipType VARCHAR(30) '$.membershipType',
                startDate DATE '$.startDate',
                endDate DATE '$.endDate',
                notes NVARCHAR(1000) '$.notes'
            ) AS seed;
        `);

        const membershipResult = await transaction.request()
            .input('seedTag', sql.NVarChar(100), SEED_TAG)
            .query('SELECT id, member_id FROM dbo.memberships WHERE notes = @seedTag;');
        const membershipIdsByIndex = new Map();
        const memberIndexesById = new Map([...memberIdsByIndex.entries()].map(([index, id]) => [id, index]));
        for (const row of membershipResult.recordset) {
            const memberId = Number(row.member_id);
            const memberIndex = memberIndexesById.get(memberId);
            if (memberIndex !== undefined) membershipIdsByIndex.set(memberIndex, Number(row.id));
        }
        if (membershipIdsByIndex.size !== rows.memberships.length) throw new Error('Could not map all seeded memberships.');

        await insertJson(transaction.request(), 'paymentsJson', rows.payments.map((payment) => ({
            membershipId: membershipIdsByIndex.get(payment.index),
            listPrice: payment.listPrice,
            discountAmount: payment.discountAmount,
            amountDue: payment.amountDue,
            amountPaid: payment.amountPaid,
            paymentMethod: payment.paymentMethod,
            paidAt: payment.paidAt,
            notes: payment.notes
        })), `
            INSERT INTO dbo.gym_payments
                (membership_id, list_price, discount_amount, amount_due, amount_paid, payment_method, paid_at, notes)
            SELECT membershipId, listPrice, discountAmount, amountDue, amountPaid, paymentMethod, paidAt, notes
            FROM OPENJSON(@paymentsJson)
            WITH (
                membershipId INT '$.membershipId',
                listPrice DECIMAL(12, 2) '$.listPrice',
                discountAmount DECIMAL(12, 2) '$.discountAmount',
                amountDue DECIMAL(12, 2) '$.amountDue',
                amountPaid DECIMAL(12, 2) '$.amountPaid',
                paymentMethod VARCHAR(20) '$.paymentMethod',
                paidAt DATE '$.paidAt',
                notes NVARCHAR(500) '$.notes'
            ) AS seed;
        `);

        await insertJson(transaction.request(), 'freezesJson', rows.freezes.map((freeze) => ({
            membershipId: membershipIdsByIndex.get(freeze.index),
            startDate: freeze.startDate,
            endDate: freeze.endDate,
            resumedDate: null,
            reason: freeze.reason
        })), `
            INSERT INTO dbo.membership_freezes (membership_id, start_date, end_date, resumed_date, reason)
            SELECT membershipId, startDate, endDate, resumedDate, reason
            FROM OPENJSON(@freezesJson)
            WITH (
                membershipId INT '$.membershipId',
                startDate DATE '$.startDate',
                endDate DATE '$.endDate',
                resumedDate DATE '$.resumedDate',
                reason NVARCHAR(500) '$.reason'
            ) AS seed;
        `);

        await insertJson(transaction.request(), 'eventsJson', rows.events.map((event) => ({
            memberId: memberIdsByIndex.get(event.index),
            membershipId: membershipIdsByIndex.get(event.index) || null,
            eventType: event.eventType,
            details: event.details
        })), `
            INSERT INTO dbo.membership_events (member_id, membership_id, event_type, details)
            SELECT memberId, membershipId, eventType, details
            FROM OPENJSON(@eventsJson)
            WITH (
                memberId INT '$.memberId',
                membershipId INT '$.membershipId',
                eventType VARCHAR(30) '$.eventType',
                details NVARCHAR(1000) '$.details'
            ) AS seed;
        `);

        await transaction.commit();
        const summary = rows.members.reduce((result, member) => {
            result[member.kind] = (result[member.kind] || 0) + 1;
            return result;
        }, {});
        console.log(`PERFORMANCE_SEED_OK ${JSON.stringify({ count, today, summary })}`);
    } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
    }
}

main()
    .catch((error) => {
        console.error(`PERFORMANCE_SEED_FAILED: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => closePool());
