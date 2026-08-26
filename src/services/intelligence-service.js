'use strict';

const { getPool, sql } = require('../database');
const { addDays, formatDateOnly, todayInTimeZone, toUtcDate } = require('../utils/date');
const memberService = require('./member-service');
const coachingService = require('./coaching-service');
const brandingService = require('./branding-service');

function appError(message, statusCode = 400, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    if (code) error.code = code;
    return error;
}

function ensureId(value, label = 'المعرّف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw appError(`${label} غير صالح.`, 400, 'INVALID_ID');
    return id;
}

function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function integer(value, min, max, fallback) {
    return Math.round(clamp(value, min, max, fallback));
}

function text(value, fallback = '', maxLength = 2000) {
    return String(value ?? fallback).trim().slice(0, maxLength);
}

function normalizeSearch(value) {
    return String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[إأآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
        .trim();
}

function tokens(value) {
    return normalizeSearch(value).split(/\s+/).filter((item) => item.length > 1);
}

function todayDate() {
    return todayInTimeZone();
}

function dateDifference(from, to) {
    if (!from || !to) return null;
    const left = new Date(`${String(from).slice(0, 10)}T00:00:00Z`);
    const right = new Date(`${String(to).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return null;
    return Math.round((right.getTime() - left.getTime()) / 86400000);
}

const INTELLIGENCE_SCHEMA_SQL = `
IF OBJECT_ID(N'dbo.gym_ai_generation_log', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_ai_generation_log (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_ai_generation_log PRIMARY KEY,
        actor_user_id INT NULL,
        member_id INT NULL,
        feature VARCHAR(40) NOT NULL,
        action VARCHAR(40) NOT NULL,
        instruction NVARCHAR(1200) NULL,
        result_summary NVARCHAR(2000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_ai_generation_log_created DEFAULT (SYSUTCDATETIME())
    );
END;
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_ai_generation_log_member_date'
      AND object_id = OBJECT_ID(N'dbo.gym_ai_generation_log')
)
    CREATE INDEX IX_gym_ai_generation_log_member_date
        ON dbo.gym_ai_generation_log(member_id, created_at DESC, id DESC);
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_ai_generation_log_feature_date'
      AND object_id = OBJECT_ID(N'dbo.gym_ai_generation_log')
)
    CREATE INDEX IX_gym_ai_generation_log_feature_date
        ON dbo.gym_ai_generation_log(feature, created_at DESC, id DESC);
`;

let intelligenceTablesPromise;

async function ensureIntelligenceTables() {
    if (!intelligenceTablesPromise) {
        intelligenceTablesPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(INTELLIGENCE_SCHEMA_SQL);
        })().catch((error) => {
            intelligenceTablesPromise = undefined;
            throw error;
        });
    }
    return intelligenceTablesPromise;
}

async function logGeneration({ actorUserId = null, memberId = null, feature, action, instruction = '', resultSummary = '' }) {
    try {
        await ensureIntelligenceTables();
        const pool = await getPool();
        await pool.request()
            .input('actorUserId', sql.Int, actorUserId ? ensureId(actorUserId, 'معرّف المستخدم') : null)
            .input('memberId', sql.Int, memberId ? ensureId(memberId, 'معرّف العميل') : null)
            .input('feature', sql.VarChar(40), text(feature, 'unknown', 40))
            .input('action', sql.VarChar(40), text(action, 'run', 40))
            .input('instruction', sql.NVarChar(1200), text(instruction, '', 1200) || null)
            .input('resultSummary', sql.NVarChar(2000), text(resultSummary, '', 2000) || null)
            .query(`INSERT INTO dbo.gym_ai_generation_log
                        (actor_user_id, member_id, feature, action, instruction, result_summary)
                    VALUES (@actorUserId, @memberId, @feature, @action, @instruction, @resultSummary);`);
    } catch (error) {
        // Intelligence should never make an otherwise valid read/generation
        // fail because its optional audit table is temporarily unavailable.
        console.warn('[TOP GYM] Intelligence audit was not recorded:', error.message);
    }
}

function memberPublicContext(member, overview) {
    const measurement = overview?.measurements?.[0] || null;
    const latestCheckin = overview?.checkins?.[0] || null;
    return {
        id: Number(member.id),
        fullName: member.fullName,
        phone: member.phone,
        membershipStatus: member.membership?.status || 'none',
        membershipDaysRemaining: member.membership?.daysRemaining ?? null,
        latestMeasurement: measurement ? {
            measuredAt: measurement.measuredAt,
            weightKg: measurement.weightKg,
            heightCm: measurement.heightCm,
            bodyFatPercent: measurement.bodyFatPercent
        } : null,
        latestCheckin: latestCheckin ? {
            checkinDate: latestCheckin.checkinDate,
            sleepHours: latestCheckin.sleepHours,
            fatigue: latestCheckin.fatigue,
            soreness: latestCheckin.soreness,
            stress: latestCheckin.stress,
            mood: latestCheckin.mood
        } : null,
        progress: overview?.progress || {},
        activeWorkout: overview?.workoutPrograms?.find((item) => item.status === 'active') || null,
        activeDiet: overview?.dietPlans?.find((item) => item.status === 'active') || null
    };
}

async function getMemberContext(memberId) {
    const id = ensureId(memberId, 'معرّف العميل');
    const [member, overview] = await Promise.all([
        memberService.getMemberById(id),
        coachingService.getTrainingOverview(id)
    ]);
    return { member, overview, publicMember: memberPublicContext(member, overview) };
}

function churnScore(input = {}) {
    const daysSinceLastVisit = input.daysSinceLastVisit == null ? null : Number(input.daysSinceLastVisit);
    const visitsLast30 = Number(input.visitsLast30 || 0);
    const daysToExpiry = input.daysToExpiry == null ? null : Number(input.daysToExpiry);
    const remaining = Number(input.amountRemaining || 0);
    const completedSessions = Number(input.completedSessions || 0);
    let score = 0;
    const reasons = [];

    if (daysSinceLastVisit == null) {
        score += 42;
        reasons.push('لا يوجد حضور مسجل حتى الآن.');
    } else if (daysSinceLastVisit >= 21) {
        score += 42;
        reasons.push(`آخر حضور منذ ${daysSinceLastVisit} يومًا.`);
    } else if (daysSinceLastVisit >= 14) {
        score += 34;
        reasons.push(`آخر حضور منذ ${daysSinceLastVisit} يومًا.`);
    } else if (daysSinceLastVisit >= 7) {
        score += 23;
        reasons.push(`الحضور متوقف منذ ${daysSinceLastVisit} أيام.`);
    } else if (daysSinceLastVisit >= 4) {
        score += 11;
        reasons.push('انخفضت وتيرة الحضور خلال الأيام الأخيرة.');
    }

    if (visitsLast30 === 0) {
        score += 20;
        reasons.push('لم يسجل أي زيارة خلال آخر 30 يومًا.');
    } else if (visitsLast30 <= 2) {
        score += 12;
        reasons.push(`تم تسجيل ${visitsLast30} زيارة فقط خلال آخر 30 يومًا.`);
    }

    if (daysToExpiry != null && daysToExpiry <= 7) {
        score += 24;
        reasons.push('الاشتراك قريب من الانتهاء.');
    } else if (daysToExpiry != null && daysToExpiry <= 21) {
        score += 12;
        reasons.push('الاشتراك يقترب من تاريخ الانتهاء.');
    }

    if (remaining > 0) {
        score += 8;
        reasons.push('يوجد مبلغ متبقٍ على الاشتراك.');
    }
    if (completedSessions === 0) {
        score += 5;
        reasons.push('لا توجد جلسات تدريب مكتملة مسجلة.');
    }

    const normalizedScore = Math.min(99, Math.max(0, Math.round(score)));
    const level = normalizedScore >= 65 ? 'high' : normalizedScore >= 35 ? 'medium' : 'low';
    const recommendation = level === 'high'
        ? 'تواصل معه اليوم برسالة شخصية واقترح موعد عودة أو جلسة متابعة.'
        : level === 'medium'
            ? 'أضفه إلى قائمة المتابعة وأرسل تذكيرًا مناسبًا خلال 48 ساعة.'
            : 'استمر في مراقبة الحضور مع رسالة تشجيع خفيفة عند الحاجة.';
    return { score: normalizedScore, level, reasons, recommendation };
}

async function getChurnRisks({ limit = 20, actorUserId = null } = {}) {
    const currentLimit = integer(limit, 1, 100, 20);
    const today = todayDate();
    const thirtyDaysAgo = addDays(today, -30);
    await Promise.all([
        memberService.getDashboard(),
        coachingService.ensureCoachingTables({ seedLibrary: false })
    ]);
    const pool = await getPool();
    const result = await pool.request()
        .input('today', sql.Date, toUtcDate(today))
        .input('thirtyDaysAgo', sql.Date, toUtcDate(thirtyDaysAgo))
        .input('limit', sql.Int, currentLimit)
        .query(`
            WITH current_membership AS (
                SELECT id, member_id, end_date, cancelled_at,
                       ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY CASE WHEN cancelled_at IS NULL THEN 0 ELSE 1 END, end_date DESC, id DESC) AS row_number
                FROM dbo.memberships
            )
            SELECT TOP (@limit)
                m.id, m.full_name, m.phone,
                membership.id AS membership_id,
                membership.end_date,
                DATEDIFF(day, @today, membership.end_date) AS days_to_expiry,
                visits.last_visit_date,
                DATEDIFF(day, visits.last_visit_date, @today) AS days_since_last_visit,
                ISNULL(visits.visits_last_30, 0) AS visits_last_30,
                ISNULL(payment.amount_remaining, 0) AS amount_remaining,
                ISNULL((SELECT COUNT_BIG(*) FROM dbo.workout_sessions AS sessions
                        WHERE sessions.member_id = m.id AND sessions.status = 'completed'), 0) AS completed_sessions
            FROM dbo.members AS m
            INNER JOIN current_membership AS membership
                ON membership.member_id = m.id AND membership.row_number = 1
            OUTER APPLY (
                SELECT TOP (1) payment.amount_remaining
                FROM dbo.gym_payments AS payment
                WHERE payment.membership_id = membership.id
                ORDER BY payment.id DESC
            ) AS payment
            OUTER APPLY (
                SELECT MAX(attendance.attendance_date) AS last_visit_date,
                       COUNT(CASE WHEN attendance.attendance_date >= @thirtyDaysAgo THEN 1 END) AS visits_last_30
                FROM dbo.gym_attendance AS attendance
                WHERE attendance.member_id = m.id
            ) AS visits
            WHERE membership.end_date >= @today
              AND membership.cancelled_at IS NULL
            ORDER BY
                CASE WHEN visits.last_visit_date IS NULL THEN 0 ELSE 1 END,
                visits.last_visit_date ASC,
                membership.end_date ASC,
                m.full_name ASC;`);

    const risks = result.recordset.map((row) => {
        const daysSinceLastVisit = row.days_since_last_visit == null ? null : Number(row.days_since_last_visit);
        const daysToExpiry = row.days_to_expiry == null ? null : Number(row.days_to_expiry);
        const score = churnScore({
            daysSinceLastVisit,
            visitsLast30: row.visits_last_30,
            daysToExpiry,
            amountRemaining: row.amount_remaining,
            completedSessions: row.completed_sessions
        });
        return {
            id: Number(row.id),
            fullName: row.full_name,
            phone: row.phone,
            membershipId: Number(row.membership_id),
            expiryDate: formatDateOnly(row.end_date),
            daysToExpiry,
            lastVisitDate: formatDateOnly(row.last_visit_date),
            daysSinceLastVisit,
            visitsLast30: Number(row.visits_last_30 || 0),
            amountRemaining: Number(row.amount_remaining || 0),
            completedSessions: Number(row.completed_sessions || 0),
            ...score
        };
    }).sort((left, right) => right.score - left.score || left.fullName.localeCompare(right.fullName, 'ar'));

    if (actorUserId) await logGeneration({ actorUserId, feature: 'retention', action: 'churn_scan', resultSummary: `${risks.length} members analyzed` });
    return { today, risks, totals: { high: risks.filter((item) => item.level === 'high').length, medium: risks.filter((item) => item.level === 'medium').length, low: risks.filter((item) => item.level === 'low').length } };
}

async function getCoachingMetrics() {
    await coachingService.ensureCoachingTables({ seedLibrary: false });
    const pool = await getPool();
    const result = await pool.request().query(`
        SELECT
            (SELECT COUNT_BIG(*) FROM dbo.workout_programs WHERE status = 'active') AS active_workout_programs,
            (SELECT COUNT_BIG(*) FROM dbo.diet_plans WHERE status = 'active') AS active_diet_plans,
            (SELECT COUNT_BIG(*) FROM dbo.workout_sessions WHERE status = 'completed' AND started_at >= DATEADD(day, -7, SYSUTCDATETIME())) AS completed_sessions_7,
            (SELECT COUNT_BIG(*) FROM dbo.meal_logs WHERE consumed_at >= DATEADD(day, -7, SYSUTCDATETIME())) AS meal_logs_7,
            (SELECT COUNT_BIG(*) FROM dbo.body_measurements WHERE measured_at >= DATEADD(day, -30, CONVERT(date, SYSUTCDATETIME()))) AS measurements_30;`);
    const row = result.recordset[0] || {};
    return {
        activeWorkoutPrograms: Number(row.active_workout_programs || 0),
        activeDietPlans: Number(row.active_diet_plans || 0),
        completedSessions7: Number(row.completed_sessions_7 || 0),
        mealLogs7: Number(row.meal_logs_7 || 0),
        measurements30: Number(row.measurements_30 || 0)
    };
}

function buildPriorities(dashboard, churn, coaching) {
    const priorities = [];
    const expiring = Number(dashboard.stats?.expiringSoon || 0);
    if (expiring) priorities.push({ tone: 'warning', title: `${expiring} اشتراك قريب من الانتهاء`, action: 'مراجعة التجديدات' });
    if (churn.totals.high) priorities.push({ tone: 'danger', title: `${churn.totals.high} أعضاء معرضون للتوقف`, action: 'ابدأ المتابعة اليوم' });
    if (coaching.activeWorkoutPrograms && !coaching.completedSessions7) priorities.push({ tone: 'info', title: 'لا توجد جلسات تدريب مكتملة خلال آخر 7 أيام', action: 'راجع التزام التدريب' });
    if (coaching.activeDietPlans && !coaching.mealLogs7) priorities.push({ tone: 'info', title: 'لا توجد تسجيلات وجبات خلال آخر 7 أيام', action: 'راجع الالتزام الغذائي' });
    return priorities.length ? priorities : [{ tone: 'success', title: 'الوضع التشغيلي مستقر', action: 'استمر في المتابعة الدورية' }];
}

async function getOverview({ actorUserId = null } = {}) {
    const [dashboard, churn, coaching, brandName] = await Promise.all([
        memberService.getDashboard(),
        getChurnRisks({ limit: 20 }),
        getCoachingMetrics(),
        brandingService.getPublicBrandName('الجيم')
    ]);
    const priorities = buildPriorities(dashboard, churn, coaching);
    const response = {
        generatedAt: new Date().toISOString(),
        engine: `${brandName} Intelligence`,
        mode: 'hybrid-rules',
        summary: `تم تحليل حالة الجيم: ${Number(dashboard.stats?.active || 0)} اشتراك نشط، و${churn.totals.high} عضو يحتاج متابعة عاجلة.`,
        stats: {
            totalMembers: Number(dashboard.stats?.total || 0),
            activeMemberships: Number(dashboard.stats?.active || 0),
            expiringMemberships: Number(dashboard.stats?.expiringSoon || 0),
            highRiskMembers: churn.totals.high,
            mediumRiskMembers: churn.totals.medium,
            activeWorkoutPrograms: coaching.activeWorkoutPrograms,
            activeDietPlans: coaching.activeDietPlans,
            sessionsLast7Days: coaching.completedSessions7,
            mealLogsLast7Days: coaching.mealLogs7
        },
        priorities,
        churn: churn.risks.slice(0, 8),
        prompts: [
            'اعرض الأعضاء المعرضين للتوقف',
            'مين اشتراكه هينتهي قريب؟',
            'اعمل ملخص حالة التدريب والتغذية'
        ]
    };
    if (actorUserId) await logGeneration({ actorUserId, feature: 'manager', action: 'overview', resultSummary: response.summary });
    return response;
}

function formatMemberList(items, empty = 'لا توجد نتائج مطابقة.') {
    if (!items.length) return empty;
    return items.map((item, index) => `${index + 1}. ${item.fullName} — ${item.level === 'high' ? 'خطر مرتفع' : item.level === 'medium' ? 'يحتاج متابعة' : 'مستقر'} — ${item.reasons[0] || item.recommendation}`).join('\n');
}

async function answerQuestion(question, { actorUserId = null } = {}) {
    const asked = text(question, '', 500);
    if (!asked) throw appError('اكتب سؤالك للمساعد الذكي أولًا.', 400, 'QUESTION_REQUIRED');
    const normalized = normalizeSearch(asked);
    const dashboard = await memberService.getDashboard();
    let answer;
    let data = {};
    if (/(انتهاء|ينتهي|تنتهي|تجديد|expiry|renew)/.test(normalized)) {
        const alerts = (dashboard.alerts || []).filter((item) => item.membership?.status === 'expiring_soon' || item.alertKind === 'membership');
        data = { members: alerts.slice(0, 20) };
        answer = alerts.length
            ? `وجدت ${alerts.length} عضوًا يحتاج مراجعة الاشتراك.\n${alerts.slice(0, 10).map((item, index) => `${index + 1}. ${item.fullName} — ينتهي خلال ${item.membership?.daysRemaining ?? '—'} يوم`).join('\n')}`
            : 'لا توجد اشتراكات قريبة من الانتهاء في البيانات الحالية.';
    } else if (/(غياب|غائب|توقف|انقطاع|inactive|churn|حضور)/.test(normalized)) {
        const churn = await getChurnRisks({ limit: 30 });
        data = churn;
        answer = `حللت ${churn.risks.length} عضوًا نشطًا. أعلى الحالات خطورة:\n${formatMemberList(churn.risks.slice(0, 10))}`;
    } else if (/(تدريب|تمرين|workout|تغذيه|تغذية|nutrition|وجبات)/.test(normalized)) {
        const coaching = await getCoachingMetrics();
        data = coaching;
        answer = `حالة التدريب والتغذية:\n- ${coaching.activeWorkoutPrograms} برنامج تدريب نشط\n- ${coaching.activeDietPlans} خطة تغذية نشطة\n- ${coaching.completedSessions7} جلسة مكتملة خلال آخر 7 أيام\n- ${coaching.mealLogs7} تسجيل وجبة خلال آخر 7 أيام`;
    } else if (/(ملخص|اليوم|حاله الجيم|حالة الجيم|summary|today)/.test(normalized)) {
        const overview = await getOverview();
        data = overview;
        answer = `${overview.summary}\n${overview.priorities.map((item) => `- ${item.title}: ${item.action}`).join('\n')}`;
    } else {
        answer = 'أقدر أساعدك في الاشتراكات القريبة من الانتهاء، الأعضاء المعرضين للتوقف، أو ملخص التدريب والتغذية. جرّب سؤالًا مثل: «اعرض الأعضاء المعرضين للتوقف». ';
    }
    await logGeneration({ actorUserId, feature: 'manager', action: 'question', instruction: asked, resultSummary: answer.slice(0, 1800) });
    return { question: asked, answer, data, suggestions: ['اعرض الأعضاء المعرضين للتوقف', 'مين اشتراكه هينتهي قريب؟', 'اعمل ملخص حالة التدريب والتغذية'] };
}

function normalizeGoal(value, fallback = 'general') {
    const normalized = normalizeSearch(value);
    if (/(قوه|strength)/.test(normalized)) return 'strength';
    if (/(عضل|تضخيم|hypertrophy|muscle)/.test(normalized)) return 'hypertrophy';
    if (/(خساره|تنشيف|حرق|fat|loss|weight loss)/.test(normalized)) return 'fat_loss';
    if (/(زياده وزن|زيادة وزن|gain)/.test(normalized)) return 'weight_gain';
    if (/(مرونه|مرونة|mobility)/.test(normalized)) return 'mobility';
    return fallback;
}

function normalizeLevel(value, fallback = 'beginner') {
    const normalized = normalizeSearch(value);
    if (/(متوسط|intermediate)/.test(normalized)) return 'intermediate';
    if (/(متقدم|advanced)/.test(normalized)) return 'advanced';
    return fallback;
}

function goalLabel(goal) {
    return ({ strength: 'زيادة القوة', hypertrophy: 'بناء العضلات', fat_loss: 'خسارة الدهون', weight_gain: 'زيادة الكتلة', mobility: 'المرونة والحركة', general: 'اللياقة العامة' })[goal] || 'اللياقة العامة';
}

function exerciseDifficultyScore(exercise, level) {
    const value = normalizeSearch(exercise.difficulty);
    if (level === 'beginner') return value.includes('مبتد') || value.includes('beginner') ? 4 : value.includes('متقدم') || value.includes('advanced') ? 1 : 3;
    if (level === 'advanced') return value.includes('متقدم') || value.includes('advanced') ? 4 : value.includes('مبتد') || value.includes('beginner') ? 2 : 3;
    return value.includes('متوسط') || value.includes('intermediate') ? 4 : 3;
}

function chooseExercises(catalog, { level, excluded = [], count, offset = 0 }) {
    const excludedText = normalizeSearch(excluded.join(' '));
    const filtered = (catalog.exercises || []).filter((exercise) => {
        const searchable = normalizeSearch(`${exercise.nameAr || ''} ${exercise.name || ''} ${exercise.equipment || ''}`);
        return !excludedText || !excludedText.split(' ').some((token) => token.length > 2 && searchable.includes(token));
    });
    // A limitation should influence ranking, but must never produce an empty
    // plan when the catalog is small. The trainer can still remove the item
    // manually before approving the draft.
    const available = filtered.length ? filtered : (catalog.exercises || []);
    const sorted = available
        .map((exercise, index) => ({ exercise, index, score: exerciseDifficultyScore(exercise, level) }))
        .sort((left, right) => right.score - left.score || left.index - right.index);
    const selected = [];
    const muscleKeys = new Set();
    for (let step = 0; step < sorted.length && selected.length < count; step += 1) {
        const candidate = sorted[(step + offset) % sorted.length]?.exercise;
        if (!candidate) break;
        const muscleKey = candidate.targetMuscleId == null ? `item-${candidate.id}` : String(candidate.targetMuscleId);
        if (muscleKeys.has(muscleKey) && sorted.length > count * 2) continue;
        muscleKeys.add(muscleKey);
        selected.push(candidate);
    }
    if (selected.length < count) {
        for (const item of available) {
            if (selected.some((candidate) => Number(candidate.id) === Number(item.id))) continue;
            selected.push(item);
            if (selected.length >= count) break;
        }
    }
    return selected;
}

function workoutRepConfig(goal) {
    if (goal === 'strength') return { sets: 4, repsMin: 5, repsMax: 8, restSeconds: 150 };
    if (goal === 'fat_loss') return { sets: 3, repsMin: 10, repsMax: 15, restSeconds: 60 };
    if (goal === 'mobility') return { sets: 3, repsMin: 10, repsMax: 12, restSeconds: 45 };
    return { sets: 3, repsMin: 8, repsMax: 12, restSeconds: 90 };
}

async function generateWorkoutSuggestion(body = {}, { actorUserId = null } = {}) {
    const memberId = ensureId(body.memberId ?? body.clientId, 'معرّف العميل');
    const { publicMember } = await getMemberContext(memberId);
    const catalog = await coachingService.getBuilderCatalog();
    if (!catalog.exercises?.length) throw appError('لا توجد تمارين في المكتبة لإنشاء الاقتراح.', 409, 'EXERCISE_LIBRARY_EMPTY');
    const goal = normalizeGoal(body.goal, normalizeGoal(publicMember.activeWorkout?.goal, 'general'));
    const level = normalizeLevel(body.level, normalizeLevel(publicMember.activeWorkout?.level, 'beginner'));
    const daysPerWeek = integer(body.daysPerWeek, 2, 6, Number(publicMember.activeWorkout?.daysPerWeek || 3));
    const durationWeeks = integer(body.durationWeeks, 1, 52, 4);
    const exerciseCount = daysPerWeek <= 2 ? 6 : 5;
    const excluded = Array.isArray(body.excludedExercises) ? body.excludedExercises : tokens(body.limitations || '');
    const config = workoutRepConfig(goal);
    const brandName = await brandingService.getPublicBrandName('الجيم');
    const dayNames = ['اليوم الأول', 'اليوم الثاني', 'اليوم الثالث', 'اليوم الرابع', 'اليوم الخامس', 'اليوم السادس'];
    const routines = Array.from({ length: daysPerWeek }, (_, index) => {
        const exercises = chooseExercises(catalog, { level, excluded, count: exerciseCount, offset: index * exerciseCount });
        return {
            name: `${dayNames[index]} — ${goalLabel(goal)}`,
            dayOfWeek: index + 1,
            sortOrder: index,
            notes: 'الاقتراح قابل للتعديل والمراجعة من المدرب قبل اعتماده.',
            exercises: exercises.map((exercise, exerciseIndex) => ({
                exerciseId: Number(exercise.id),
                sortOrder: exerciseIndex,
                sets: config.sets,
                repsMin: config.repsMin,
                repsMax: config.repsMax,
                weightKg: null,
                restSeconds: config.restSeconds,
                rir: level === 'advanced' ? 1 : 2,
                rpe: level === 'advanced' ? 8 : 7,
                tempo: '2-0-2',
                supersetGroupId: '',
                notes: 'زد الحمل تدريجيًا فقط مع الحفاظ على التقنية.'
            }))
        };
    });
    const suggestion = {
        memberId,
        name: `اقتراح ذكي — ${goalLabel(goal)} · From ${brandName} System`,
        description: `برنامج ${goalLabel(goal)} لمدة ${durationWeeks} أسابيع، مبني على مستوى ${level === 'beginner' ? 'مبتدئ' : level === 'intermediate' ? 'متوسط' : 'متقدم'} و${daysPerWeek} أيام تدريب أسبوعيًا.`,
        startDate: todayDate(),
        endDate: addDays(todayDate(), durationWeeks * 7 - 1),
        durationWeeks,
        goal: goalLabel(goal),
        level,
        daysPerWeek,
        status: 'draft',
        notes: `تم إنشاء الاقتراح بواسطة ${brandName} Intelligence. راجع الإصابات والقدرة التدريبية واعتمد الخطة قبل نشرها.`,
        version: null,
        routines
    };
    const response = {
        type: 'workout',
        suggestion,
        member: publicMember,
        explanation: [`تم اختيار ${daysPerWeek} أيام و${exerciseCount} تمارين لكل يوم.`, `نطاق التكرارات مضبوط لهدف ${goalLabel(goal)}.`, 'الأوزان تُحدد يدويًا بعد تقييم التقنية والقدرة الفعلية.'],
        warnings: ['هذا اقتراح تدريبي وليس تشخيصًا طبيًا. يجب مراجعة المدرب وأي قيود صحية قبل الاعتماد.'],
        requiresReview: true
    };
    await logGeneration({ actorUserId, memberId, feature: 'coach', action: 'workout_generate', resultSummary: `${suggestion.name}; ${daysPerWeek} days` });
    return response;
}

function foodSearchText(food) {
    return normalizeSearch(`${food.nameAr || ''} ${food.nameEn || ''} ${food.servingUnit || ''}`);
}

function foodMatchesTerms(food, terms) {
    const searchable = foodSearchText(food);
    return terms.some((term) => {
        const normalized = normalizeSearch(term);
        return normalized.length > 1 && searchable.includes(normalized);
    });
}

function chooseFood(catalog, kind, excluded = [], used = new Set()) {
    const foods = (catalog.foods || []).filter((food) => !foodMatchesTerms(food, excluded) && !used.has(Number(food.id)) && Number(food.servingSize || 0) > 0);
    if (!foods.length) return (catalog.foods || []).find((food) => !foodMatchesTerms(food, excluded) && Number(food.servingSize || 0) > 0) || null;
    const keywords = {
        protein: ['chicken', 'chick', 'tuna', 'egg', 'beef', 'meat', 'fish', 'دجاج', 'فراخ', 'تونه', 'بيض', 'لحمه', 'سمك', 'جبنه', 'لبن'],
        carbs: ['rice', 'oat', 'bread', 'potato', 'pasta', 'banana', 'رُز', 'رز', 'شوفان', 'خبز', 'بطاط', 'مكرونه', 'موز'],
        produce: ['vegetable', 'fruit', 'salad', 'apple', 'orange', 'tomato', 'خضار', 'فاكهه', 'سلطه', 'تفاح', 'برتقال', 'طماطم']
    }[kind] || [];
    return foods.sort((left, right) => {
        const leftMatch = foodMatchesTerms(left, keywords) ? 1 : 0;
        const rightMatch = foodMatchesTerms(right, keywords) ? 1 : 0;
        if (leftMatch !== rightMatch) return rightMatch - leftMatch;
        if (kind === 'protein') return Number(right.protein || 0) - Number(left.protein || 0);
        if (kind === 'carbs') return Number(right.carbs || 0) - Number(left.carbs || 0);
        return Number(left.calories || 0) - Number(right.calories || 0);
    })[0] || null;
}

function foodMetrics(food, quantity) {
    const factor = Number(quantity || 0) / (Number(food?.servingSize || 100) || 100);
    return {
        calories: Number(food?.calories || 0) * factor,
        protein: Number(food?.protein || 0) * factor,
        carbs: Number(food?.carbs || 0) * factor,
        fats: Number(food?.fat || 0) * factor
    };
}

function dietCalories({ weightKg, heightCm, age, gender, activity, goal, explicit }) {
    if (Number(explicit) > 0) return Math.round(Number(explicit));
    const weight = Number(weightKg);
    const height = Number(heightCm);
    const years = Number(age);
    let tdee = 2200;
    let bmr = null;
    if ([weight, height, years].every((value) => Number.isFinite(value) && value > 0)) {
        bmr = (gender === 'female' ? 10 * weight + 6.25 * height - 5 * years - 161 : 10 * weight + 6.25 * height - 5 * years + 5);
        const activityFactor = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725 }[activity] || 1.45;
        tdee = bmr * activityFactor;
    }
    const adjustment = goal === 'fat_loss' ? -400 : goal === 'weight_gain' ? 300 : 0;
    return { calories: Math.round(Math.max(1200, tdee + adjustment)), bmr: bmr == null ? null : Math.round(bmr), tdee: Math.round(tdee) };
}

async function generateDietSuggestion(body = {}, { actorUserId = null } = {}) {
    const memberId = ensureId(body.memberId ?? body.clientId, 'معرّف العميل');
    const { publicMember } = await getMemberContext(memberId);
    const catalog = await coachingService.getBuilderCatalog();
    if (!catalog.foods?.length) throw appError('لا توجد أطعمة في المكتبة لإنشاء الاقتراح.', 409, 'FOOD_LIBRARY_EMPTY');
    const latest = publicMember.latestMeasurement || {};
    const goal = normalizeGoal(body.goal, 'maintain');
    const mealsPerDay = integer(body.mealsPerDay, 3, 6, 4);
    const weightKg = Number(body.weightKg || latest.weightKg || 0) || null;
    const heightCm = Number(body.heightCm || latest.heightCm || 0) || null;
    const age = Number(body.age || 0) || null;
    const gender = text(body.gender, 'male', 10) || 'male';
    const activity = ['sedentary', 'light', 'moderate', 'high'].includes(body.activity) ? body.activity : 'moderate';
    const calculation = dietCalories({ weightKg, heightCm, age, gender, activity, goal, explicit: body.targetCalories });
    const brandName = await brandingService.getPublicBrandName('الجيم');
    const targetCalories = calculation.calories;
    const targetProtein = Math.round((weightKg || 75) * (goal === 'fat_loss' ? 1.9 : 1.6));
    const targetFats = Math.round((targetCalories * 0.27) / 9);
    const targetCarbs = Math.max(0, Math.round((targetCalories - targetProtein * 4 - targetFats * 9) / 4));
    const allergies = Array.isArray(body.allergies) ? body.allergies : tokens(body.allergies || '');
    const names = ['الفطور', 'وجبة خفيفة', 'الغداء', 'وجبة خفيفة', 'العشاء', 'وجبة خفيفة مسائية'];
    const meals = [];
    const selectedIds = new Set();
    for (let index = 0; index < mealsPerDay; index += 1) {
        const protein = chooseFood(catalog, 'protein', allergies, selectedIds);
        if (protein) selectedIds.add(Number(protein.id));
        const carbs = chooseFood(catalog, 'carbs', allergies, selectedIds);
        if (carbs) selectedIds.add(Number(carbs.id));
        const produce = chooseFood(catalog, 'produce', allergies, selectedIds);
        if (produce) selectedIds.add(Number(produce.id));
        const items = [
            protein ? { foodId: Number(protein.id), assignedQuantity: 150, servingUnit: protein.servingUnit || 'جم', sortOrder: 0, notes: 'مصدر البروتين الرئيسي.' } : null,
            carbs ? { foodId: Number(carbs.id), assignedQuantity: 100, servingUnit: carbs.servingUnit || 'جم', sortOrder: 1, notes: 'مصدر الكربوهيدرات.' } : null,
            produce ? { foodId: Number(produce.id), assignedQuantity: 100, servingUnit: produce.servingUnit || 'جم', sortOrder: 2, notes: 'أضف خضارًا أو فاكهة مناسبة.' } : null
        ].filter(Boolean);
        meals.push({ name: names[index] || `وجبة ${index + 1}`, mealTime: '', sortOrder: index, notes: 'يمكن تعديل البدائل والكمية يدويًا.', items });
    }
    const suggestion = {
        memberId,
        name: `اقتراح ذكي — ${goal === 'fat_loss' ? 'خسارة الدهون' : goal === 'weight_gain' ? 'زيادة الكتلة' : 'توازن غذائي'} · From ${brandName} System`,
        description: `خطة تغذية مقترحة من ${mealsPerDay} وجبات يومية بمتوسط ${targetCalories} سعر حراري.`,
        startDate: todayDate(),
        endDate: null,
        mealsPerDay,
        targetCalories,
        targetProtein,
        targetCarbs,
        targetFats,
        calorieGoal: goal === 'fat_loss' ? 'lose' : goal === 'weight_gain' ? 'gain' : 'maintain',
        calorieAdjustment: goal === 'fat_loss' ? -400 : goal === 'weight_gain' ? 300 : 0,
        calculator: { weightKg, heightCm, age, gender, activity, bmr: calculation.bmr, tdee: calculation.tdee },
        status: 'draft',
        notes: `تم إنشاء الاقتراح بواسطة ${brandName} Intelligence. راجع الحساسية والحالة الصحية واعتمد الخطة مع المختص قبل نشرها.`,
        version: null,
        meals
    };
    const response = {
        type: 'diet',
        suggestion,
        member: publicMember,
        explanation: [`تم توزيع الخطة على ${mealsPerDay} وجبات.`, `الهدف اليومي ${targetCalories} سعر حراري تقريبًا.`, `تم ضبط البروتين المبدئي على ${targetProtein} جم.`],
        warnings: ['هذه خطة غذائية إرشادية وليست تشخيصًا أو علاجًا طبيًا. راجع الحساسية والحالات الصحية مع مختص.'],
        requiresReview: true
    };
    await logGeneration({ actorUserId, memberId, feature: 'nutrition', action: 'diet_generate', resultSummary: `${suggestion.name}; ${mealsPerDay} meals` });
    return response;
}

function findCatalogMatch(items, instruction, mapper) {
    const instructionTokens = tokens(instruction);
    if (!instructionTokens.length) return null;
    return items
        .map((item) => {
            const searchable = normalizeSearch(mapper(item));
            const score = instructionTokens.reduce((sum, token) => sum + (searchable.includes(token) ? (token.length >= 4 ? 3 : 1) : 0), 0);
            return { item, score };
        })
        .sort((left, right) => right.score - left.score)[0]?.score > 0
        ? items
            .map((item) => ({ item, score: instructionTokens.reduce((sum, token) => sum + (normalizeSearch(mapper(item)).includes(token) ? (token.length >= 4 ? 3 : 1) : 0), 0) }))
            .sort((left, right) => right.score - left.score)[0].item
        : null;
}

function findTwoCatalogMatches(items, instruction, mapper) {
    return items
        .map((item) => ({ item, score: tokens(instruction).reduce((sum, token) => sum + (normalizeSearch(mapper(item)).includes(token) ? 1 : 0), 0) }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 2)
        .map((entry) => entry.item);
}

function refineWorkoutDraft(draft, instruction, catalog) {
    const next = JSON.parse(JSON.stringify(draft || {}));
    next.routines = Array.isArray(next.routines) ? next.routines : [];
    const changes = [];
    const normalized = normalizeSearch(instruction);
    const mapper = (item) => `${item.nameAr || ''} ${item.name || ''}`;
    const matches = findTwoCatalogMatches(catalog.exercises || [], instruction, mapper);
    const removeIntent = /(احذف|شيل|بدون|من غير|remove|exclude)/.test(normalized);
    const replaceIntent = /(بدل|استبدل|replace|instead)/.test(normalized);
    const addIntent = /(اضف|ضيف|أضف|add|include)/.test(normalized);
    if (replaceIntent && matches.length >= 2) {
        const [oldExercise, newExercise] = matches;
        let replaced = 0;
        next.routines.forEach((routine) => routine.exercises = (routine.exercises || []).map((item) => {
            if (Number(item.exerciseId) !== Number(oldExercise.id)) return item;
            replaced += 1;
            return { ...item, exerciseId: Number(newExercise.id), notes: 'تم استبداله بناءً على تعليمات المستخدم.' };
        }));
        if (replaced) changes.push(`استبدال ${oldExercise.nameAr || oldExercise.name} بـ ${newExercise.nameAr || newExercise.name}`);
    } else if (removeIntent && matches.length) {
        const target = matches[0];
        let removed = 0;
        next.routines.forEach((routine) => {
            const filtered = (routine.exercises || []).filter((item) => Number(item.exerciseId) !== Number(target.id));
            if (filtered.length !== (routine.exercises || []).length) removed += (routine.exercises || []).length - filtered.length;
            routine.exercises = filtered.length ? filtered : routine.exercises;
        });
        if (removed) changes.push(`إزالة ${target.nameAr || target.name} من الخطة`);
    } else if (addIntent && matches.length) {
        const target = matches[0];
        next.routines.forEach((routine) => {
            const exists = (routine.exercises || []).some((item) => Number(item.exerciseId) === Number(target.id));
            if (!exists) routine.exercises.push({ exerciseId: Number(target.id), sortOrder: routine.exercises.length, sets: 3, repsMin: 8, repsMax: 12, weightKg: null, restSeconds: 90, rir: 2, rpe: 7, tempo: '2-0-2', supersetGroupId: '', notes: 'تمت الإضافة بناءً على تعليمات المستخدم.' });
        });
        changes.push(`إضافة ${target.nameAr || target.name} إلى أيام الخطة`);
    }
    const sets = normalized.match(/(\d+)\s*(?:مجموع|مجموعات|sets?)/i)?.[1];
    const reps = normalized.match(/(\d+)\s*(?:تكرار|تكرارات|reps?)/i)?.[1];
    if (sets) {
        next.routines.forEach((routine) => (routine.exercises || []).forEach((item) => { item.sets = integer(sets, 1, 20, 3); }));
        changes.push(`تعديل المجموعات إلى ${sets}`);
    }
    if (reps) {
        next.routines.forEach((routine) => (routine.exercises || []).forEach((item) => { item.repsMin = integer(reps, 1, 100, 10); item.repsMax = integer(reps, 1, 100, 10); }));
        changes.push(`تعديل التكرارات إلى ${reps}`);
    }
    if (!changes.length) changes.push('تم حفظ التعليمات كملاحظة للمراجعة اليدوية؛ اذكر اسم التمرين أو التغيير الرقمي لتطبيقه مباشرة.');
    next.notes = `${text(next.notes, '', 1700)}\nتعديل AI: ${text(instruction, '', 250)}`.trim();
    return { draft: next, changes, warnings: ['راجع التقنية والقيود الصحية قبل اعتماد أي تعديل تدريبي.'] };
}

function refineDietDraft(draft, instruction, catalog) {
    const next = JSON.parse(JSON.stringify(draft || {}));
    next.meals = Array.isArray(next.meals) ? next.meals : [];
    const changes = [];
    const normalized = normalizeSearch(instruction);
    const mapper = (item) => `${item.nameAr || ''} ${item.nameEn || ''}`;
    const matches = findTwoCatalogMatches(catalog.foods || [], instruction, mapper);
    const removeIntent = /(احذف|شيل|بدون|من غير|حساس|حساسيه|remove|exclude)/.test(normalized);
    const replaceIntent = /(بدل|استبدل|replace|instead)/.test(normalized);
    const addIntent = /(اضف|ضيف|أضف|add|include)/.test(normalized);
    if (replaceIntent && matches.length >= 2) {
        const [oldFood, newFood] = matches;
        let replaced = 0;
        next.meals.forEach((meal) => (meal.items || []).forEach((item) => {
            if (Number(item.foodId) === Number(oldFood.id)) { item.foodId = Number(newFood.id); replaced += 1; }
        }));
        if (replaced) changes.push(`استبدال ${oldFood.nameAr || oldFood.nameEn} بـ ${newFood.nameAr || newFood.nameEn}`);
    } else if (removeIntent && matches.length) {
        const target = matches[0];
        let removed = 0;
        next.meals.forEach((meal) => {
            const filtered = (meal.items || []).filter((item) => Number(item.foodId) !== Number(target.id));
            removed += (meal.items || []).length - filtered.length;
            meal.items = filtered.length ? filtered : meal.items;
        });
        if (removed) changes.push(`إزالة ${target.nameAr || target.nameEn} من الخطة`);
    } else if (addIntent && matches.length) {
        const target = matches[0];
        next.meals.forEach((meal) => {
            if (!(meal.items || []).some((item) => Number(item.foodId) === Number(target.id))) meal.items.push({ foodId: Number(target.id), assignedQuantity: 100, servingUnit: target.servingUnit || 'جم', sortOrder: meal.items.length, notes: 'تمت الإضافة بناءً على تعليمات المستخدم.' });
        });
        changes.push(`إضافة ${target.nameAr || target.nameEn} إلى الوجبات`);
    }
    const calories = normalized.match(/(\d{3,5})\s*(?:سعر|سعرة|cal|calorie)/i)?.[1];
    if (calories) {
        next.targetCalories = integer(calories, 800, 10000, Number(next.targetCalories || 2200));
        changes.push(`تعديل السعرات إلى ${next.targetCalories}`);
    }
    const meals = normalized.match(/([3-6])\s*(?:وجبات|وجبه|meals?)/i)?.[1];
    if (meals) {
        const desired = integer(meals, 3, 6, next.meals.length || 4);
        while (next.meals.length < desired) next.meals.push({ name: `وجبة ${next.meals.length + 1}`, mealTime: '', sortOrder: next.meals.length, notes: '', items: [] });
        next.meals = next.meals.slice(0, desired).map((meal, index) => ({ ...meal, sortOrder: index }));
        next.mealsPerDay = desired;
        changes.push(`تعديل عدد الوجبات إلى ${desired}`);
    }
    if (!changes.length) changes.push('تم حفظ التعليمات كملاحظة للمراجعة اليدوية؛ اذكر اسم الطعام أو السعرات أو عدد الوجبات لتطبيقه مباشرة.');
    next.notes = `${text(next.notes, '', 1700)}\nتعديل AI: ${text(instruction, '', 250)}`.trim();
    return { draft: next, changes, warnings: ['راجع الحساسية والحالة الصحية والقيم الغذائية قبل اعتماد التعديل.'] };
}

async function refineSuggestion(body = {}, { actorUserId = null } = {}) {
    const typeValue = text(body.type, '').toLowerCase();
    if (!['workout', 'diet'].includes(typeValue)) throw appError('نوع الاقتراح غير صالح.', 400, 'INVALID_INTELLIGENCE_TYPE');
    const instruction = text(body.instruction, '', 500);
    if (!instruction) throw appError('اكتب التعديل المطلوب أولًا.', 400, 'INSTRUCTION_REQUIRED');
    const memberId = body.memberId ? ensureId(body.memberId, 'معرّف العميل') : ensureId(body.draft?.memberId, 'معرّف العميل');
    const catalog = await coachingService.getBuilderCatalog();
    const result = typeValue === 'workout'
        ? refineWorkoutDraft(body.draft, instruction, catalog)
        : refineDietDraft(body.draft, instruction, catalog);
    await logGeneration({ actorUserId, memberId, feature: typeValue === 'workout' ? 'coach' : 'nutrition', action: 'refine', instruction, resultSummary: result.changes.join(' | ') });
    return { type: typeValue, memberId, ...result, requiresReview: true };
}

module.exports = {
    answerQuestion,
    churnScore,
    ensureIntelligenceTables,
    generateDietSuggestion,
    generateWorkoutSuggestion,
    getChurnRisks,
    getOverview,
    refineSuggestion
};
