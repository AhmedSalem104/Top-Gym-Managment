const { getPool, sql } = require('./db');
const { addDays, differenceInDays, formatDateOnly, parseDateOnly, todayInTimeZone, toUtcDate } = require('./date-utils');
const { ensurePaymentTransactionsTable, getDashboard } = require('./member-service');
const { ensureExpensesTable } = require('./finance-service');
const { ensureCoachingTables } = require('./coaching-service');
const { ensureLibraryData } = require('./library-service');

function appError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    return error;
}

function normalizeRange(query = {}) {
    const today = todayInTimeZone();
    const defaultFrom = `${today.slice(0, 7)}-01`;
    const from = parseDateOnly(query.from || defaultFrom, 'تاريخ البداية');
    const to = parseDateOnly(query.to || today, 'تاريخ النهاية');
    if (from > to) throw appError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
    if (differenceInDays(from, to) > 730) throw appError('أقصى فترة للتقرير هي 730 يومًا.');
    return { from, to, nextDate: addDays(to, 1), today };
}

function roundMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}

function emptyTimeline(from, to) {
    const rows = [];
    let cursor = from;
    while (cursor <= to) {
        rows.push({ date: cursor, newMembers: 0, newMemberships: 0, collected: 0, expenses: 0 });
        cursor = addDays(cursor, 1);
    }
    return rows;
}

function addTimelineAmount(timelineByDate, rows, dateField, amountField) {
    rows.forEach((row) => {
        const date = formatDateOnly(row[dateField]);
        const target = timelineByDate.get(date);
        if (target) target[amountField] = roundMoney(target[amountField] + Number(row[amountField] || 0));
    });
}

async function getReportData(query = {}) {
    const range = normalizeRange(query);
    await Promise.all([
        ensureExpensesTable(),
        ensurePaymentTransactionsTable(),
        ensureCoachingTables(),
        ensureLibraryData()
    ]);
    const pool = await getPool();
    const baseRequest = () => pool.request()
        .input('fromDate', sql.Date, toUtcDate(range.from))
        .input('nextDate', sql.Date, toUtcDate(range.nextDate))
        .input('todayDate', sql.Date, toUtcDate(range.today));

    const [membersResult, membershipsResult, paymentsResult, expensesResult, paymentMethodsResult, dashboard, debtorsResult, coachingResult, libraryResult] = await Promise.all([
        baseRequest().query(`
            SELECT TOP (1000) m.id, m.full_name, m.phone, m.email, m.registration_date,
                   ms.membership_plan, ms.membership_type, ms.start_date, ms.end_date,
                   CASE WHEN ms.id IS NULL THEN 'none'
                        WHEN ms.start_date > @todayDate THEN 'upcoming'
                        WHEN ms.end_date < @todayDate THEN 'expired'
                        ELSE 'active' END AS membership_status,
                   p.amount_due, p.amount_paid, p.amount_remaining
            FROM dbo.members AS m
            OUTER APPLY (
                SELECT TOP (1) x.id, x.membership_plan, x.membership_type, x.start_date, x.end_date
                FROM dbo.memberships AS x
                WHERE x.member_id = m.id
                ORDER BY x.end_date DESC, x.id DESC
            ) AS ms
            OUTER APPLY (
                SELECT TOP (1) y.amount_due, y.amount_paid, y.amount_remaining
                FROM dbo.gym_payments AS y
                WHERE y.membership_id = ms.id
                ORDER BY y.created_at DESC, y.id DESC
            ) AS p
            WHERE m.registration_date >= @fromDate AND m.registration_date < @nextDate
            ORDER BY m.registration_date DESC, m.id DESC;
        `),
        baseRequest().query(`
            SELECT m.id, m.member_id, b.full_name, b.phone, b.email,
                   m.membership_plan, m.membership_type, m.start_date, m.end_date,
                   CASE WHEN freeze.id IS NOT NULL THEN 'frozen'
                        WHEN DATEADD(day, ISNULL(freeze_totals.freeze_days, 0), m.end_date) < @todayDate THEN 'expired'
                        WHEN DATEDIFF(day, @todayDate, DATEADD(day, ISNULL(freeze_totals.freeze_days, 0), m.end_date)) BETWEEN 0 AND 7 THEN 'expiring_soon'
                        ELSE 'active' END AS membership_status,
                   p.amount_due, p.amount_paid, p.amount_remaining
            FROM dbo.memberships AS m
            INNER JOIN dbo.members AS b ON b.id = m.member_id
            LEFT JOIN dbo.gym_payments AS p ON p.membership_id = m.id
            OUTER APPLY (
                SELECT TOP (1) f.id
                FROM dbo.membership_freezes AS f
                WHERE f.membership_id = m.id
                  AND f.resumed_date IS NULL
                  AND @todayDate BETWEEN f.start_date AND f.end_date
                ORDER BY f.start_date DESC, f.id DESC
            ) AS freeze
            OUTER APPLY (
                SELECT SUM(CASE
                    WHEN f.resumed_date IS NULL THEN DATEDIFF(day, f.start_date, f.end_date) + 1
                    WHEN f.resumed_date <= f.start_date THEN 0
                    WHEN f.resumed_date < f.end_date THEN DATEDIFF(day, f.start_date, f.resumed_date)
                    ELSE DATEDIFF(day, f.start_date, f.end_date) + 1
                END) AS freeze_days
                FROM dbo.membership_freezes AS f
                WHERE f.membership_id = m.id
            ) AS freeze_totals
            WHERE m.start_date >= @fromDate AND m.start_date < @nextDate
            ORDER BY m.start_date DESC, m.id DESC;
        `),
        baseRequest().query(`
            SELECT t.id, t.membership_id, t.transaction_type, t.list_price, t.discount_amount,
                   t.amount_due, t.amount_paid, t.amount_paid AS amount, t.amount_remaining, t.payment_method,
                   t.paid_at AS event_date, t.notes, t.created_at,
                   m.full_name, m.phone, ms.membership_plan, ms.membership_type
            FROM dbo.gym_payment_transactions AS t
            INNER JOIN dbo.memberships AS ms ON ms.id = t.membership_id
            INNER JOIN dbo.members AS m ON m.id = ms.member_id
            WHERE t.paid_at >= @fromDate AND t.paid_at < @nextDate AND t.amount_paid > 0
            ORDER BY t.paid_at DESC, t.id DESC;
        `),
        baseRequest().query(`
            SELECT id, expense_name, expense_date AS event_date, amount, notes, created_at
            FROM dbo.gym_expenses
            WHERE expense_date >= @fromDate AND expense_date < @nextDate
            ORDER BY expense_date DESC, id DESC;
        `),
        baseRequest().query(`
            SELECT payment_method, COUNT(*) AS count, ISNULL(SUM(amount_paid), 0) AS amount
            FROM dbo.gym_payment_transactions
            WHERE paid_at >= @fromDate AND paid_at < @nextDate AND amount_paid > 0
            GROUP BY payment_method ORDER BY amount DESC;
        `),
        getDashboard(),
        pool.request().query(`
            SELECT TOP (1000)
                   m.id, m.full_name, m.phone, m.email,
                   ms.id AS membership_id, ms.membership_plan, ms.membership_type,
                   ms.start_date, ms.end_date,
                   p.amount_due, p.amount_paid, p.amount_remaining
            FROM dbo.gym_payments AS p
            INNER JOIN dbo.memberships AS ms ON ms.id = p.membership_id
            INNER JOIN dbo.members AS m ON m.id = ms.member_id
            WHERE p.amount_remaining > 0
            ORDER BY p.amount_remaining DESC, ms.end_date ASC, m.full_name ASC;
        `),
        baseRequest().batch(`
            SELECT
                (SELECT COUNT_BIG(*) FROM dbo.workout_programs) AS total_workout_programs,
                (SELECT COUNT_BIG(*) FROM dbo.workout_programs WHERE status = 'active') AS active_workout_programs,
                (SELECT COUNT_BIG(*) FROM dbo.diet_plans) AS total_diet_plans,
                (SELECT COUNT_BIG(*) FROM dbo.diet_plans WHERE status = 'active') AS active_diet_plans,
                (SELECT COUNT_BIG(*) FROM dbo.body_measurements WHERE measured_at >= @fromDate AND measured_at < @nextDate) AS measurements_in_period,
                (SELECT COUNT_BIG(*) FROM dbo.workout_sessions WHERE started_at >= @fromDate AND started_at < @nextDate) AS workout_sessions_in_period,
                (SELECT COUNT_BIG(*) FROM dbo.workout_sessions WHERE started_at >= @fromDate AND started_at < @nextDate AND status = 'completed') AS completed_workout_sessions,
                (SELECT COUNT_BIG(*) FROM dbo.meal_logs WHERE consumed_at >= @fromDate AND consumed_at < @nextDate) AS meal_logs_in_period,
                (SELECT COUNT_BIG(*) FROM dbo.athlete_checkins WHERE checkin_date >= @fromDate AND checkin_date < @nextDate) AS checkins_in_period,
                (SELECT COALESCE(SUM(COALESCE(log.weight_kg, 0) * COALESCE(log.reps, 0)), 0)
                 FROM dbo.workout_set_logs AS log
                 INNER JOIN dbo.workout_sessions AS session ON session.id = log.session_id
                 WHERE session.started_at >= @fromDate AND session.started_at < @nextDate) AS workout_volume_in_period,
                (SELECT COALESCE(SUM(calc_calories), 0) FROM dbo.meal_logs WHERE consumed_at >= @fromDate AND consumed_at < @nextDate) AS meal_calories_in_period,
                (SELECT COALESCE(SUM(calc_protein), 0) FROM dbo.meal_logs WHERE consumed_at >= @fromDate AND consumed_at < @nextDate) AS meal_protein_in_period,
                (SELECT COALESCE(SUM(calc_carbs), 0) FROM dbo.meal_logs WHERE consumed_at >= @fromDate AND consumed_at < @nextDate) AS meal_carbs_in_period,
                (SELECT COALESCE(SUM(calc_fats), 0) FROM dbo.meal_logs WHERE consumed_at >= @fromDate AND consumed_at < @nextDate) AS meal_fats_in_period;
            SELECT 'workout' AS category, status, COUNT_BIG(*) AS count
            FROM dbo.workout_programs GROUP BY status
            UNION ALL
            SELECT 'diet' AS category, status, COUNT_BIG(*) AS count
            FROM dbo.diet_plans GROUP BY status;
            SELECT TOP (50) p.id, p.member_id, m.full_name, m.phone, p.name, p.start_date, p.end_date,
                   p.status, p.goal, p.level, p.updated_at,
                   (SELECT COUNT(1) FROM dbo.workout_routines r WHERE r.program_id = p.id) AS routine_count,
                   (SELECT COUNT(1) FROM dbo.workout_exercises e INNER JOIN dbo.workout_routines r ON r.id = e.routine_id WHERE r.program_id = p.id) AS exercise_count
            FROM dbo.workout_programs p
            INNER JOIN dbo.members m ON m.id = p.member_id
            WHERE p.created_at >= @fromDate AND p.created_at < @nextDate
            ORDER BY p.updated_at DESC, p.id DESC;
            SELECT TOP (50) p.id, p.member_id, m.full_name, m.phone, p.name, p.start_date, p.end_date,
                   p.status, p.target_calories, p.target_protein, p.target_carbs, p.target_fats, p.updated_at,
                   (SELECT COUNT(1) FROM dbo.diet_meals meal WHERE meal.diet_plan_id = p.id) AS meal_count,
                   (SELECT COUNT(1) FROM dbo.diet_meal_items item INNER JOIN dbo.diet_meals meal ON meal.id = item.meal_id WHERE meal.diet_plan_id = p.id) AS food_count
            FROM dbo.diet_plans p
            INNER JOIN dbo.members m ON m.id = p.member_id
            WHERE p.created_at >= @fromDate AND p.created_at < @nextDate
            ORDER BY p.updated_at DESC, p.id DESC;
        `),
        baseRequest().batch(`
            SELECT
                (SELECT COUNT_BIG(*) FROM dbo.gym_muscles) AS muscles,
                (SELECT COUNT_BIG(*) FROM dbo.gym_foods) AS foods,
                (SELECT COUNT_BIG(*) FROM dbo.gym_exercises AS e
                 WHERE JSON_VALUE(e.metadata_json, '$.catalogStatus') IS NULL
                    OR JSON_VALUE(e.metadata_json, '$.catalogStatus') <> N'legacy-compatibility') AS exercises,
                (SELECT COUNT_BIG(*) FROM dbo.gym_muscles WHERE created_at >= @fromDate AND created_at < @nextDate) AS new_muscles,
                (SELECT COUNT_BIG(*) FROM dbo.gym_foods WHERE created_at >= @fromDate AND created_at < @nextDate) AS new_foods,
                (SELECT COUNT_BIG(*) FROM dbo.gym_exercises AS e
                 WHERE (JSON_VALUE(e.metadata_json, '$.catalogStatus') IS NULL
                    OR JSON_VALUE(e.metadata_json, '$.catalogStatus') <> N'legacy-compatibility')
                   AND e.created_at >= @fromDate AND e.created_at < @nextDate) AS new_exercises;
        `)
    ]);

    const memberRows = membersResult.recordset || [];
    const membershipRows = membershipsResult.recordset || [];
    const paymentRows = paymentsResult.recordset || [];
    const expenseRows = expensesResult.recordset || [];
    const debtorRows = debtorsResult.recordset || [];
    const coachingRecordsets = coachingResult.recordsets || [];
    const coachingStats = coachingRecordsets[0]?.[0] || {};
    const coachingStatusRows = coachingRecordsets[1] || [];
    const workoutProgramRows = coachingRecordsets[2] || [];
    const dietPlanRows = coachingRecordsets[3] || [];
    const libraryStats = libraryResult.recordset?.[0] || {};
    const collected = roundMoney(paymentRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const expenses = roundMoney(expenseRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    const timeline = emptyTimeline(range.from, range.to);
    const timelineByDate = new Map(timeline.map((row) => [row.date, row]));
    memberRows.forEach((row) => {
        const target = timelineByDate.get(formatDateOnly(row.registration_date));
        if (target) target.newMembers += 1;
    });
        membershipRows.forEach((row) => {
        const target = timelineByDate.get(formatDateOnly(row.start_date));
        if (target) target.newMemberships += 1;
        });
    addTimelineAmount(timelineByDate, paymentRows, 'event_date', 'collected');
    addTimelineAmount(timelineByDate, expenseRows, 'event_date', 'expenses');

    const outstanding = membershipRows.reduce((sum, row) => sum + Number(row.amount_remaining || 0), 0);
    const plans = membershipRows.reduce((result, row) => {
        const key = String(row.membership_plan || 'gym_only');
        result[key] = (result[key] || 0) + 1;
        return result;
    }, {});
    const statuses = {
        active: Number(dashboard.stats?.active || 0),
        expiring_soon: Number(dashboard.stats?.expiringSoon || 0),
        expired: Number(dashboard.stats?.expired || 0),
        frozen: Number(dashboard.stats?.frozen || 0)
    };

    return {
        period: range,
        summary: {
            newMembers: memberRows.length,
            newMemberships: membershipRows.length,
            paidTransactions: paymentRows.length,
            collected,
            expenses,
            expensesCount: expenseRows.length,
            net: roundMoney(collected - expenses),
            outstanding: roundMoney(outstanding),
            outstandingCount: membershipRows.filter((row) => Number(row.amount_remaining || 0) > 0).length,
            debtorsCount: debtorRows.length,
            debtorsTotal: roundMoney(debtorRows.reduce((sum, row) => sum + Number(row.amount_remaining || 0), 0)),
            currentMembers: Number(dashboard.stats?.total || 0),
            activeMembers: Number(dashboard.stats?.active || 0),
            alertsCount: Array.isArray(dashboard.alerts) ? dashboard.alerts.length : 0
        },
        breakdown: {
            plans: Object.entries(plans).map(([key, value]) => ({ key, value })),
            statuses: Object.entries(statuses).map(([key, value]) => ({ key, value })),
            paymentMethods: paymentMethodsResult.recordset.map((row) => ({
                key: row.payment_method,
                count: Number(row.count || 0),
                amount: roundMoney(row.amount)
            }))
        },
        timeline,
        memberships: membershipRows.map((row) => ({
            id: Number(row.id),
            memberId: Number(row.member_id),
            fullName: row.full_name,
            phone: row.phone,
            email: row.email,
            plan: row.membership_plan || null,
            type: row.membership_type || null,
            startDate: formatDateOnly(row.start_date),
            endDate: formatDateOnly(row.end_date),
            amountDue: Number(row.amount_due || 0),
            amountPaid: Number(row.amount_paid || 0),
            amountRemaining: Number(row.amount_remaining || 0),
            status: row.membership_status || 'active'
        })),
        payments: paymentRows.map((row) => ({
            id: Number(row.id),
            membershipId: Number(row.membership_id),
            transactionType: row.transaction_type,
            fullName: row.full_name,
            phone: row.phone,
            plan: row.membership_plan || null,
            type: row.membership_type || null,
            date: formatDateOnly(row.event_date),
            listPrice: Number(row.list_price || 0),
            discountAmount: Number(row.discount_amount || 0),
            amountDue: Number(row.amount_due || 0),
            amountPaid: Number(row.amount_paid || 0),
            amountRemaining: Number(row.amount_remaining || 0),
            paymentMethod: row.payment_method,
            notes: row.notes || null,
            createdAt: row.created_at
        })),
        expenses: expenseRows.map((row) => ({
            id: Number(row.id),
            name: row.expense_name,
            date: formatDateOnly(row.event_date),
            amount: Number(row.amount || 0),
            notes: row.notes || null,
            createdAt: row.created_at
        })),
        coaching: {
            summary: {
                totalWorkoutPrograms: Number(coachingStats.total_workout_programs || 0),
                activeWorkoutPrograms: Number(coachingStats.active_workout_programs || 0),
                totalDietPlans: Number(coachingStats.total_diet_plans || 0),
                activeDietPlans: Number(coachingStats.active_diet_plans || 0),
                measurementsInPeriod: Number(coachingStats.measurements_in_period || 0),
                workoutSessionsInPeriod: Number(coachingStats.workout_sessions_in_period || 0),
                completedWorkoutSessions: Number(coachingStats.completed_workout_sessions || 0),
                mealLogsInPeriod: Number(coachingStats.meal_logs_in_period || 0),
                checkinsInPeriod: Number(coachingStats.checkins_in_period || 0),
                workoutVolumeInPeriod: Number(coachingStats.workout_volume_in_period || 0),
                mealCaloriesInPeriod: Number(coachingStats.meal_calories_in_period || 0),
                mealProteinInPeriod: Number(coachingStats.meal_protein_in_period || 0),
                mealCarbsInPeriod: Number(coachingStats.meal_carbs_in_period || 0),
                mealFatsInPeriod: Number(coachingStats.meal_fats_in_period || 0)
            },
            statuses: coachingStatusRows.map((row) => ({ category: row.category, status: row.status, count: Number(row.count || 0) })),
            workoutPrograms: workoutProgramRows.map((row) => ({
                id: Number(row.id), memberId: Number(row.member_id), fullName: row.full_name, phone: row.phone,
                name: row.name, startDate: formatDateOnly(row.start_date), endDate: row.end_date ? formatDateOnly(row.end_date) : null,
            status: row.status, goal: row.goal, level: row.level, routines: Number(row.routine_count || 0), exercises: Number(row.exercise_count || 0), updatedAt: row.updated_at
            })),
            dietPlans: dietPlanRows.map((row) => ({
                id: Number(row.id), memberId: Number(row.member_id), fullName: row.full_name, phone: row.phone,
                name: row.name, startDate: formatDateOnly(row.start_date), endDate: row.end_date ? formatDateOnly(row.end_date) : null,
                status: row.status, targetCalories: Number(row.target_calories || 0), targetProtein: Number(row.target_protein || 0),
                targetCarbs: Number(row.target_carbs || 0), targetFats: Number(row.target_fats || 0), meals: Number(row.meal_count || 0), foods: Number(row.food_count || 0), updatedAt: row.updated_at
            }))
        },
        library: {
            counts: {
                muscles: Number(libraryStats.muscles || 0), foods: Number(libraryStats.foods || 0), exercises: Number(libraryStats.exercises || 0),
                newMuscles: Number(libraryStats.new_muscles || 0), newFoods: Number(libraryStats.new_foods || 0), newExercises: Number(libraryStats.new_exercises || 0)
            }
        },
        debtors: debtorRows.map((row) => ({
            id: Number(row.id),
            membershipId: Number(row.membership_id),
            fullName: row.full_name,
            phone: row.phone,
            email: row.email,
            plan: row.membership_plan || null,
            type: row.membership_type || null,
            startDate: formatDateOnly(row.start_date),
            endDate: formatDateOnly(row.end_date),
            amountDue: Number(row.amount_due || 0),
            amountPaid: Number(row.amount_paid || 0),
            amountRemaining: Number(row.amount_remaining || 0)
        })),
        members: memberRows.map((row) => ({
            id: Number(row.id),
            fullName: row.full_name,
            phone: row.phone,
            email: row.email,
            registrationDate: formatDateOnly(row.registration_date),
            plan: row.membership_plan || null,
            type: row.membership_type || null,
            startDate: formatDateOnly(row.start_date),
            endDate: formatDateOnly(row.end_date),
            amountDue: Number(row.amount_due || 0),
            amountPaid: Number(row.amount_paid || 0),
            amountRemaining: Number(row.amount_remaining || 0),
            status: row.membership_status || 'none'
        }))
    };
}

module.exports = { getReportData };
