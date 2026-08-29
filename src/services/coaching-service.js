const { getPool, sql } = require('../database');
const { ensureLibraryData, ensureLibraryTables } = require('./library-service');
const { getTenantContext } = require('../tenancy/tenant-context');
const { safeErrorCode } = require('../utils/error-response');
const {
    addDays,
    differenceInDays,
    formatDateOnly,
    parseDateOnly,
    todayInTimeZone,
    toUtcDate
} = require('../utils/date');

let coachingTablesPromise;
let memberIdentityPromise;

function appError(message, statusCode = 400, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    if (code) error.code = code;
    return error;
}

function ensureId(value, label = 'المعرّف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw appError(`${label} غير صالح.`);
    return id;
}

function text(value, field, maxLength, required = false) {
    const normalized = String(value ?? '').trim();
    if (required && !normalized) throw appError(`${field} مطلوب.`);
    if (normalized.length > maxLength) throw appError(`${field} أطول من المسموح.`);
    return normalized || null;
}

function numberValue(value, field, { min = 0, max = 999999, integer = false, fallback = null } = {}) {
    if (value === undefined || value === null || value === '') return fallback;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
        throw appError(`${field} غير صالح.`);
    }
    return Math.round(number * 1000) / 1000;
}

function dateValue(value, field, fallback = todayInTimeZone()) {
    return parseDateOnly(value || fallback, field);
}

function optionalDateValue(value, field) {
    return value === undefined || value === null || value === '' ? null : parseDateOnly(value, field);
}

function listValue(value, field) {
    if (!Array.isArray(value)) throw appError(`${field} يجب أن يكون قائمة.`);
    return value;
}

function statusValue(value, fallback = 'active') {
    const status = String(value || fallback).trim().toLowerCase();
    if (!['draft', 'active', 'paused', 'completed', 'archived'].includes(status)) {
        throw appError('حالة النظام غير صالحة.');
    }
    return status;
}

function dietGoalValue(value, fallback = 'maintain') {
    const goal = String(value || fallback).trim().toLowerCase();
    if (!['lose', 'maintain', 'gain'].includes(goal)) {
        throw appError('Invalid calorie goal.');
    }
    return goal;
}

function normalizePhone(value) {
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    let normalized = String(value ?? '').trim().replace(/[٠-٩]/gu, (digit) => String(arabicDigits.indexOf(digit)));
    normalized = normalized.replace(/[^0-9]/g, '');
    if (normalized.startsWith('00')) normalized = normalized.slice(2);
    if (normalized.startsWith('20') && normalized.length === 12) normalized = `0${normalized.slice(2)}`;
    return normalized;
}

function withTransaction(work) {
    return getPool().then(async (pool) => {
        const transaction = pool.transaction();
        await transaction.begin();
        try {
            const result = await work(transaction);
            await transaction.commit();
            return result;
        } catch (error) {
            try { await transaction.rollback(); } catch (_) { /* keep original error */ }
            throw error;
        }
    });
}

async function ensureCoachingTables({ seedLibrary = true } = {}) {
    if (getTenantContext()?.readOnlyBaseline) return;
    if (!coachingTablesPromise) {
        coachingTablesPromise = (async () => {
            // The coaching schema only needs the library tables to exist. The
            // large catalog seed is deferred until a feature actually needs
            // exercise/food options (builder or library screen).
            await ensureLibraryTables();
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.workout_programs', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.workout_programs (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_programs_runtime PRIMARY KEY,
                        member_id INT NOT NULL,
                        name NVARCHAR(160) NOT NULL,
                        description NVARCHAR(2000) NULL,
                        start_date DATE NOT NULL,
                        end_date DATE NULL,
                        duration_weeks INT NULL,
                        goal NVARCHAR(60) NULL,
                        level NVARCHAR(40) NULL,
                        days_per_week INT NULL,
                        status VARCHAR(20) NOT NULL CONSTRAINT DF_workout_programs_status_runtime DEFAULT ('active'),
                        notes NVARCHAR(2000) NULL,
                        version INT NOT NULL CONSTRAINT DF_workout_programs_version_runtime DEFAULT (1),
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_programs_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_programs_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_workout_programs_member_runtime FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
                        CONSTRAINT CK_workout_programs_dates_runtime CHECK (end_date IS NULL OR end_date >= start_date),
                        CONSTRAINT CK_workout_programs_duration_runtime CHECK (duration_weeks IS NULL OR duration_weeks BETWEEN 1 AND 520),
                        CONSTRAINT CK_workout_programs_days_runtime CHECK (days_per_week IS NULL OR days_per_week BETWEEN 1 AND 7),
                        CONSTRAINT CK_workout_programs_status_runtime CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived'))
                    );
                END;
                IF OBJECT_ID(N'dbo.workout_routines', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.workout_routines (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_routines_runtime PRIMARY KEY,
                        program_id INT NOT NULL,
                        name NVARCHAR(160) NOT NULL,
                        day_of_week INT NULL,
                        sort_order INT NOT NULL CONSTRAINT DF_workout_routines_sort_runtime DEFAULT (0),
                        notes NVARCHAR(1000) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_routines_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_routines_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_workout_routines_program_runtime FOREIGN KEY (program_id) REFERENCES dbo.workout_programs(id) ON DELETE CASCADE,
                        CONSTRAINT CK_workout_routines_day_runtime CHECK (day_of_week IS NULL OR day_of_week BETWEEN 1 AND 7)
                    );
                END;
                IF OBJECT_ID(N'dbo.workout_exercises', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.workout_exercises (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_exercises_runtime PRIMARY KEY,
                        routine_id INT NOT NULL,
                        exercise_id INT NOT NULL,
                        sort_order INT NOT NULL CONSTRAINT DF_workout_exercises_sort_runtime DEFAULT (0),
                        sets INT NOT NULL CONSTRAINT DF_workout_exercises_sets_runtime DEFAULT (3),
                        reps_min INT NULL,
                        reps_max INT NULL,
                        weight_kg DECIMAL(10,2) NULL,
                        rest_seconds INT NULL,
                        rir INT NULL,
                        rpe DECIMAL(4,1) NULL,
                        tempo NVARCHAR(40) NULL,
                        superset_group_id NVARCHAR(40) NULL,
                        notes NVARCHAR(1000) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_exercises_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_exercises_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_workout_exercises_routine_runtime FOREIGN KEY (routine_id) REFERENCES dbo.workout_routines(id) ON DELETE CASCADE,
                        CONSTRAINT FK_workout_exercises_library_runtime FOREIGN KEY (exercise_id) REFERENCES dbo.gym_exercises(id) ON DELETE NO ACTION,
                        CONSTRAINT CK_workout_exercises_sets_runtime CHECK (sets BETWEEN 1 AND 100),
                        CONSTRAINT CK_workout_exercises_reps_runtime CHECK (reps_min IS NULL OR reps_min BETWEEN 1 AND 1000),
                        CONSTRAINT CK_workout_exercises_reps_max_runtime CHECK (reps_max IS NULL OR reps_max BETWEEN 1 AND 1000),
                        CONSTRAINT CK_workout_exercises_reps_range_runtime CHECK (reps_max IS NULL OR reps_min IS NULL OR reps_max >= reps_min),
                        CONSTRAINT CK_workout_exercises_weight_runtime CHECK (weight_kg IS NULL OR weight_kg >= 0),
                        CONSTRAINT CK_workout_exercises_rest_runtime CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 7200),
                        CONSTRAINT CK_workout_exercises_rir_runtime CHECK (rir IS NULL OR rir BETWEEN 0 AND 10),
                        CONSTRAINT CK_workout_exercises_rpe_runtime CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10)
                    );
                END;
                /* Optional intensity metadata; existing workout programs remain valid. */
                IF COL_LENGTH(N'dbo.workout_exercises', N'rir') IS NULL
                    ALTER TABLE dbo.workout_exercises ADD rir INT NULL;
                IF COL_LENGTH(N'dbo.workout_exercises', N'rpe') IS NULL
                    ALTER TABLE dbo.workout_exercises ADD rpe DECIMAL(4,1) NULL;
                IF OBJECT_ID(N'dbo.diet_plans', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.diet_plans (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_diet_plans_runtime PRIMARY KEY,
                        member_id INT NOT NULL,
                        name NVARCHAR(160) NOT NULL,
                        description NVARCHAR(2000) NULL,
                        start_date DATE NOT NULL,
                        end_date DATE NULL,
                        meals_per_day INT NULL,
                        target_calories DECIMAL(12,2) NULL,
                        target_protein DECIMAL(12,2) NULL,
                        target_carbs DECIMAL(12,2) NULL,
                        target_fats DECIMAL(12,2) NULL,
                        calorie_goal VARCHAR(20) NULL,
                        calorie_adjustment DECIMAL(12,2) NULL,
                        calculator_weight_kg DECIMAL(8,2) NULL,
                        calculator_height_cm DECIMAL(8,2) NULL,
                        calculator_age INT NULL,
                        calculator_gender VARCHAR(10) NULL,
                        calculator_activity VARCHAR(20) NULL,
                        bmr DECIMAL(12,2) NULL,
                        tdee DECIMAL(12,2) NULL,
                        status VARCHAR(20) NOT NULL CONSTRAINT DF_diet_plans_status_runtime DEFAULT ('active'),
                        notes NVARCHAR(2000) NULL,
                        version INT NOT NULL CONSTRAINT DF_diet_plans_version_runtime DEFAULT (1),
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_plans_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_plans_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_diet_plans_member_runtime FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
                        CONSTRAINT CK_diet_plans_dates_runtime CHECK (end_date IS NULL OR end_date >= start_date),
                        CONSTRAINT CK_diet_plans_meals_runtime CHECK (meals_per_day IS NULL OR meals_per_day BETWEEN 1 AND 12),
                        CONSTRAINT CK_diet_plans_calories_runtime CHECK (target_calories IS NULL OR target_calories >= 0),
                        CONSTRAINT CK_diet_plans_macros_runtime CHECK ((target_protein IS NULL OR target_protein >= 0) AND (target_carbs IS NULL OR target_carbs >= 0) AND (target_fats IS NULL OR target_fats >= 0)),
                        CONSTRAINT CK_diet_plans_status_runtime CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived'))
                    );
                END;
                /* Backward-compatible columns for the nutrition calculator metadata. */
                IF COL_LENGTH(N'dbo.diet_plans', N'calorie_goal') IS NULL
                    ALTER TABLE dbo.diet_plans ADD calorie_goal VARCHAR(20) NULL;
                IF COL_LENGTH(N'dbo.diet_plans', N'calorie_adjustment') IS NULL
                    ALTER TABLE dbo.diet_plans ADD calorie_adjustment DECIMAL(12,2) NULL;
                IF COL_LENGTH(N'dbo.diet_plans', N'calculator_weight_kg') IS NULL
                    ALTER TABLE dbo.diet_plans ADD calculator_weight_kg DECIMAL(8,2) NULL;
                IF COL_LENGTH(N'dbo.diet_plans', N'calculator_height_cm') IS NULL
                    ALTER TABLE dbo.diet_plans ADD calculator_height_cm DECIMAL(8,2) NULL;
                IF COL_LENGTH(N'dbo.diet_plans', N'calculator_age') IS NULL
                    ALTER TABLE dbo.diet_plans ADD calculator_age INT NULL;
                IF COL_LENGTH(N'dbo.diet_plans', N'calculator_gender') IS NULL
                    ALTER TABLE dbo.diet_plans ADD calculator_gender VARCHAR(10) NULL;
                IF COL_LENGTH(N'dbo.diet_plans', N'calculator_activity') IS NULL
                    ALTER TABLE dbo.diet_plans ADD calculator_activity VARCHAR(20) NULL;
                IF COL_LENGTH(N'dbo.diet_plans', N'bmr') IS NULL
                    ALTER TABLE dbo.diet_plans ADD bmr DECIMAL(12,2) NULL;
                IF COL_LENGTH(N'dbo.diet_plans', N'tdee') IS NULL
                    ALTER TABLE dbo.diet_plans ADD tdee DECIMAL(12,2) NULL;
                IF OBJECT_ID(N'dbo.diet_meals', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.diet_meals (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_diet_meals_runtime PRIMARY KEY,
                        diet_plan_id INT NOT NULL,
                        name NVARCHAR(120) NOT NULL,
                        meal_time VARCHAR(10) NULL,
                        sort_order INT NOT NULL CONSTRAINT DF_diet_meals_sort_runtime DEFAULT (0),
                        notes NVARCHAR(1000) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_meals_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_meals_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_diet_meals_plan_runtime FOREIGN KEY (diet_plan_id) REFERENCES dbo.diet_plans(id) ON DELETE CASCADE
                    );
                END;
                IF OBJECT_ID(N'dbo.diet_meal_items', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.diet_meal_items (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_diet_meal_items_runtime PRIMARY KEY,
                        meal_id INT NOT NULL,
                        food_id INT NOT NULL,
                        sort_order INT NOT NULL CONSTRAINT DF_diet_meal_items_sort_runtime DEFAULT (0),
                        assigned_quantity DECIMAL(12,3) NOT NULL,
                        serving_unit NVARCHAR(40) NULL,
                        calc_calories DECIMAL(12,3) NOT NULL CONSTRAINT DF_diet_meal_items_calories_runtime DEFAULT (0),
                        calc_protein DECIMAL(12,3) NOT NULL CONSTRAINT DF_diet_meal_items_protein_runtime DEFAULT (0),
                        calc_carbs DECIMAL(12,3) NOT NULL CONSTRAINT DF_diet_meal_items_carbs_runtime DEFAULT (0),
                        calc_fats DECIMAL(12,3) NOT NULL CONSTRAINT DF_diet_meal_items_fats_runtime DEFAULT (0),
                        notes NVARCHAR(500) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_meal_items_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_meal_items_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_diet_meal_items_meal_runtime FOREIGN KEY (meal_id) REFERENCES dbo.diet_meals(id) ON DELETE CASCADE,
                        CONSTRAINT FK_diet_meal_items_food_runtime FOREIGN KEY (food_id) REFERENCES dbo.gym_foods(id) ON DELETE NO ACTION,
                        CONSTRAINT CK_diet_meal_items_quantity_runtime CHECK (assigned_quantity > 0)
                    );
                END;
                IF OBJECT_ID(N'dbo.body_measurements', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.body_measurements (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_body_measurements_runtime PRIMARY KEY,
                        member_id INT NOT NULL,
                        measured_at DATE NOT NULL,
                        weight_kg DECIMAL(8,2) NULL,
                        height_cm DECIMAL(8,2) NULL,
                        body_fat_percent DECIMAL(5,2) NULL,
                        chest_cm DECIMAL(8,2) NULL,
                        waist_cm DECIMAL(8,2) NULL,
                        hips_cm DECIMAL(8,2) NULL,
                        arms_cm DECIMAL(8,2) NULL,
                        thighs_cm DECIMAL(8,2) NULL,
                        notes NVARCHAR(1000) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_body_measurements_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_body_measurements_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_body_measurements_member_runtime FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE
                    );
                END;
                IF OBJECT_ID(N'dbo.athlete_checkins', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.athlete_checkins (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_athlete_checkins_runtime PRIMARY KEY,
                        member_id INT NOT NULL,
                        checkin_date DATE NOT NULL,
                        sleep_hours DECIMAL(4,1) NULL,
                        sleep_quality INT NULL,
                        fatigue INT NULL,
                        soreness INT NULL,
                        stress INT NULL,
                        mood INT NULL,
                        resting_hr INT NULL,
                        hrv DECIMAL(8,2) NULL,
                        bodyweight_kg DECIMAL(8,2) NULL,
                        notes NVARCHAR(1000) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_athlete_checkins_created_runtime DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_athlete_checkins_updated_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_athlete_checkins_member_runtime FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
                        CONSTRAINT UQ_athlete_checkins_member_date_runtime UNIQUE (member_id, checkin_date),
                        CONSTRAINT CK_athlete_checkins_sleep_hours_runtime CHECK (sleep_hours IS NULL OR sleep_hours BETWEEN 0 AND 24),
                        CONSTRAINT CK_athlete_checkins_scale_runtime CHECK ((sleep_quality IS NULL OR sleep_quality BETWEEN 1 AND 5) AND (fatigue IS NULL OR fatigue BETWEEN 1 AND 5) AND (soreness IS NULL OR soreness BETWEEN 1 AND 5) AND (stress IS NULL OR stress BETWEEN 1 AND 5) AND (mood IS NULL OR mood BETWEEN 1 AND 5)),
                        CONSTRAINT CK_athlete_checkins_vitals_runtime CHECK ((resting_hr IS NULL OR resting_hr BETWEEN 20 AND 250) AND (hrv IS NULL OR hrv BETWEEN 0 AND 500) AND (bodyweight_kg IS NULL OR bodyweight_kg BETWEEN 0 AND 1000))
                    );
                END;
                IF OBJECT_ID(N'dbo.coaching_activity_events', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.coaching_activity_events (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_coaching_activity_events_runtime PRIMARY KEY,
                        member_id INT NOT NULL,
                        event_type VARCHAR(50) NOT NULL,
                        entity_type VARCHAR(40) NULL,
                        entity_id INT NULL,
                        details NVARCHAR(1000) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_coaching_activity_events_created_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_coaching_activity_events_member_runtime FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE
                    );
                END;
                IF OBJECT_ID(N'dbo.workout_sessions', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.workout_sessions (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_sessions_runtime PRIMARY KEY,
                        member_id INT NOT NULL,
                        program_id INT NULL,
                        routine_id INT NULL,
                        started_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_sessions_started_runtime DEFAULT (SYSUTCDATETIME()),
                        ended_at DATETIME2(0) NULL,
                        status VARCHAR(20) NOT NULL CONSTRAINT DF_workout_sessions_status_runtime DEFAULT ('started'),
                        notes NVARCHAR(1000) NULL,
                        CONSTRAINT FK_workout_sessions_member_runtime FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
                        CONSTRAINT FK_workout_sessions_program_runtime FOREIGN KEY (program_id) REFERENCES dbo.workout_programs(id) ON DELETE NO ACTION,
                        CONSTRAINT FK_workout_sessions_routine_runtime FOREIGN KEY (routine_id) REFERENCES dbo.workout_routines(id) ON DELETE NO ACTION,
                        CONSTRAINT CK_workout_sessions_status_runtime CHECK (status IN ('started', 'completed', 'cancelled'))
                    );
                END;
                IF OBJECT_ID(N'dbo.workout_set_logs', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.workout_set_logs (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_set_logs_runtime PRIMARY KEY,
                        session_id INT NOT NULL,
                        workout_exercise_id INT NULL,
                        set_number INT NOT NULL,
                        weight_kg DECIMAL(10,2) NULL,
                        reps INT NULL,
                        completed_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_set_logs_completed_runtime DEFAULT (SYSUTCDATETIME()),
                        notes NVARCHAR(500) NULL,
                        CONSTRAINT FK_workout_set_logs_session_runtime FOREIGN KEY (session_id) REFERENCES dbo.workout_sessions(id) ON DELETE CASCADE,
                        CONSTRAINT FK_workout_set_logs_exercise_runtime FOREIGN KEY (workout_exercise_id) REFERENCES dbo.workout_exercises(id) ON DELETE NO ACTION,
                        CONSTRAINT CK_workout_set_logs_set_runtime CHECK (set_number BETWEEN 1 AND 100),
                        CONSTRAINT CK_workout_set_logs_reps_runtime CHECK (reps IS NULL OR reps BETWEEN 0 AND 1000),
                        CONSTRAINT CK_workout_set_logs_weight_runtime CHECK (weight_kg IS NULL OR weight_kg >= 0)
                    );
                END;
                IF OBJECT_ID(N'dbo.meal_logs', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.meal_logs (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_meal_logs_runtime PRIMARY KEY,
                        member_id INT NOT NULL,
                        meal_item_id INT NULL,
                        consumed_quantity DECIMAL(12,3) NOT NULL,
                        consumed_at DATETIME2(0) NOT NULL CONSTRAINT DF_meal_logs_consumed_runtime DEFAULT (SYSUTCDATETIME()),
                        calc_calories DECIMAL(12,3) NOT NULL CONSTRAINT DF_meal_logs_calories_runtime DEFAULT (0),
                        calc_protein DECIMAL(12,3) NOT NULL CONSTRAINT DF_meal_logs_protein_runtime DEFAULT (0),
                        calc_carbs DECIMAL(12,3) NOT NULL CONSTRAINT DF_meal_logs_carbs_runtime DEFAULT (0),
                        calc_fats DECIMAL(12,3) NOT NULL CONSTRAINT DF_meal_logs_fats_runtime DEFAULT (0),
                        notes NVARCHAR(500) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_meal_logs_created_runtime DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_meal_logs_member_runtime FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
                        CONSTRAINT FK_meal_logs_item_runtime FOREIGN KEY (meal_item_id) REFERENCES dbo.diet_meal_items(id) ON DELETE NO ACTION,
                        CONSTRAINT CK_meal_logs_quantity_runtime CHECK (consumed_quantity > 0)
                    );
                END;
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_programs_member_status_runtime' AND object_id = OBJECT_ID(N'dbo.workout_programs'))
                    CREATE INDEX IX_workout_programs_member_status_runtime ON dbo.workout_programs(member_id, status, start_date DESC, id DESC);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_routines_program_sort_runtime' AND object_id = OBJECT_ID(N'dbo.workout_routines'))
                    CREATE INDEX IX_workout_routines_program_sort_runtime ON dbo.workout_routines(program_id, sort_order, id);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_exercises_routine_sort_runtime' AND object_id = OBJECT_ID(N'dbo.workout_exercises'))
                    CREATE INDEX IX_workout_exercises_routine_sort_runtime ON dbo.workout_exercises(routine_id, sort_order, id);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_diet_plans_member_status_runtime' AND object_id = OBJECT_ID(N'dbo.diet_plans'))
                    CREATE INDEX IX_diet_plans_member_status_runtime ON dbo.diet_plans(member_id, status, start_date DESC, id DESC);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_diet_meals_plan_sort_runtime' AND object_id = OBJECT_ID(N'dbo.diet_meals'))
                    CREATE INDEX IX_diet_meals_plan_sort_runtime ON dbo.diet_meals(diet_plan_id, sort_order, id);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_diet_meal_items_meal_sort_runtime' AND object_id = OBJECT_ID(N'dbo.diet_meal_items'))
                    CREATE INDEX IX_diet_meal_items_meal_sort_runtime ON dbo.diet_meal_items(meal_id, sort_order, id);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_body_measurements_member_date_runtime' AND object_id = OBJECT_ID(N'dbo.body_measurements'))
                    CREATE INDEX IX_body_measurements_member_date_runtime ON dbo.body_measurements(member_id, measured_at DESC, id DESC);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_sessions_member_started_runtime' AND object_id = OBJECT_ID(N'dbo.workout_sessions'))
                    CREATE INDEX IX_workout_sessions_member_started_runtime ON dbo.workout_sessions(member_id, started_at DESC, id DESC);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_sessions_member_program_status_runtime' AND object_id = OBJECT_ID(N'dbo.workout_sessions'))
                    CREATE INDEX IX_workout_sessions_member_program_status_runtime ON dbo.workout_sessions(member_id, program_id, status);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_set_logs_session_runtime' AND object_id = OBJECT_ID(N'dbo.workout_set_logs'))
                    CREATE INDEX IX_workout_set_logs_session_runtime ON dbo.workout_set_logs(session_id, id);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_meal_logs_member_consumed_runtime' AND object_id = OBJECT_ID(N'dbo.meal_logs'))
                    CREATE INDEX IX_meal_logs_member_consumed_runtime ON dbo.meal_logs(member_id, consumed_at DESC, id DESC);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_meal_logs_member_item_runtime' AND object_id = OBJECT_ID(N'dbo.meal_logs'))
                    CREATE INDEX IX_meal_logs_member_item_runtime ON dbo.meal_logs(member_id, meal_item_id);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_coaching_activity_events_member_created_runtime' AND object_id = OBJECT_ID(N'dbo.coaching_activity_events'))
                    CREATE INDEX IX_coaching_activity_events_member_created_runtime ON dbo.coaching_activity_events(member_id, created_at DESC, id DESC);
            `);
        })().catch((error) => {
            coachingTablesPromise = undefined;
            throw error;
        });
    }
    await coachingTablesPromise;
    if (seedLibrary) await ensureLibraryData();
    return coachingTablesPromise;
}

async function ensureReady() {
    await ensureLibraryData();
    await ensureCoachingTables();
}

async function recordCoachingEvent(memberId, eventType, { entityType = null, entityId = null, details = null } = {}) {
    try {
        const id = ensureId(memberId);
        const normalizedType = String(eventType || 'updated').trim().slice(0, 50) || 'updated';
        const normalizedEntityType = entityType == null ? null : String(entityType).trim().slice(0, 40) || null;
        const normalizedDetails = details == null
            ? null
            : String(typeof details === 'string' ? details : JSON.stringify(details)).slice(0, 1000);
        await ensureCoachingTables();
        const pool = await getPool();
        await pool.request()
            .input('memberId', sql.Int, id)
            .input('eventType', sql.VarChar(50), normalizedType)
            .input('entityType', sql.VarChar(40), normalizedEntityType)
            .input('entityId', sql.Int, entityId == null ? null : ensureId(entityId))
            .input('details', sql.NVarChar(1000), normalizedDetails)
            .query('INSERT INTO dbo.coaching_activity_events (member_id, event_type, entity_type, entity_id, details) VALUES (@memberId, @eventType, @entityType, @entityId, @details);');
    } catch (error) {
        // Activity history is supplementary; a logging failure must not break a completed coaching operation.
        console.warn('[coaching-activity]', safeErrorCode(error, 'activity_recording_failed'));
    }
}

async function getCoachingActivity(memberId, options = {}) {
    await ensureCoachingTables();
    const id = ensureId(memberId, 'معرّف العميل');
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 12));
    const result = await getPool().then((pool) => pool.request()
        .input('memberId', sql.Int, id)
        .input('limit', sql.Int, limit)
        .query('SELECT TOP (@limit) id, member_id, event_type, entity_type, entity_id, details, created_at FROM dbo.coaching_activity_events WHERE member_id=@memberId ORDER BY created_at DESC, id DESC;'));
    return result.recordset.map((row) => ({
        id: Number(row.id),
        memberId: Number(row.member_id),
        eventType: row.event_type,
        entityType: row.entity_type,
        entityId: row.entity_id == null ? null : Number(row.entity_id),
        details: row.details,
        createdAt: row.created_at
    }));
}

async function ensureMemberIdentityColumn() {
    if (!memberIdentityPromise) {
        memberIdentityPromise = getPool().then((pool) => pool.request().batch(`
            IF COL_LENGTH(N'dbo.members', N'phone_normalized') IS NULL
                ALTER TABLE dbo.members ADD phone_normalized NVARCHAR(30) NULL;
            UPDATE dbo.members SET phone_normalized = phone
            WHERE phone_normalized IS NULL OR LTRIM(RTRIM(phone_normalized)) = N'';
        `)).catch((error) => {
            memberIdentityPromise = undefined;
            throw error;
        });
    }
    return memberIdentityPromise;
}

async function assertMember(connection, memberId) {
    const result = await connection.request()
        .input('memberId', sql.Int, memberId)
        .query('SELECT id, full_name, phone, email, registration_date, notes FROM dbo.members WHERE id = @memberId;');
    if (!result.recordset[0]) throw appError('العميل غير موجود.', 404, 'CLIENT_NOT_FOUND');
    return result.recordset[0];
}

async function assertNoDuplicatePhone(connection, phoneNormalized, email, excludeId = null) {
    const result = await connection.request().query('SELECT id, full_name, phone, phone_normalized, email FROM dbo.members;');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const duplicate = result.recordset.find((row) => {
        if (excludeId && Number(row.id) === Number(excludeId)) return false;
        return (phoneNormalized && normalizePhone(row.phone_normalized || row.phone) === phoneNormalized)
            || (normalizedEmail && String(row.email || '').trim().toLowerCase() === normalizedEmail);
    });
    if (!duplicate) return;
    const samePhone = phoneNormalized && normalizePhone(duplicate.phone_normalized || duplicate.phone) === phoneNormalized;
    const error = appError(
        samePhone ? `رقم الهاتف مستخدم من قبل لدى العميل ${duplicate.full_name}.` : `البريد الإلكتروني مستخدم من قبل لدى العميل ${duplicate.full_name}.`,
        409,
        samePhone ? 'DUPLICATE_MEMBER_PHONE' : 'DUPLICATE_MEMBER_EMAIL'
    );
    error.field = samePhone ? 'phone' : 'email';
    error.memberName = duplicate.full_name;
    error.memberId = Number(duplicate.id);
    throw error;
}

async function createExternalTrainee(body = {}) {
    await ensureMemberIdentityColumn();
    await ensureCoachingTables();
    const fullName = text(body.fullName, 'اسم المتدرب', 120, true);
    const phone = text(body.phone, 'رقم الهاتف', 30, true);
    const phoneNormalized = normalizePhone(phone);
    if (phoneNormalized.length < 5) throw appError('رقم الهاتف غير صالح.');
    const email = text(body.email, 'البريد الإلكتروني', 254);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw appError('البريد الإلكتروني غير صالح.');
    const registrationDate = dateValue(body.registrationDate, 'تاريخ التسجيل');
    const notes = text(body.notes, 'الملاحظات', 1000);
    const memberId = await withTransaction(async (transaction) => {
        await assertNoDuplicatePhone(transaction, phoneNormalized, email);
        const result = await transaction.request()
            .input('fullName', sql.NVarChar(120), fullName)
            .input('phone', sql.NVarChar(30), phone)
            .input('phoneNormalized', sql.NVarChar(30), phoneNormalized)
            .input('email', sql.NVarChar(254), email)
            .input('registrationDate', sql.Date, toUtcDate(registrationDate))
            .input('notes', sql.NVarChar(1000), notes)
            .query(`INSERT INTO dbo.members (full_name, phone, phone_normalized, email, registration_date, notes)
                    OUTPUT INSERTED.id
                    VALUES (@fullName, @phone, @phoneNormalized, @email, @registrationDate, @notes);`);
        return Number(result.recordset[0].id);
    });
    return getClientBase(memberId);
}

async function getClientBase(memberId, connection = null) {
    const pool = connection || await getPool();
    const result = await pool.request()
        .input('memberId', sql.Int, ensureId(memberId, 'معرّف العميل'))
        .query('SELECT id, full_name, phone, email, registration_date, notes, created_at, updated_at FROM dbo.members WHERE id = @memberId;');
    const row = result.recordset[0];
    if (!row) throw appError('العميل غير موجود.', 404, 'CLIENT_NOT_FOUND');
    return {
        id: Number(row.id),
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        registrationDate: formatDateOnly(row.registration_date),
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function updateClientBasic(memberIdValue, body = {}) {
    await ensureMemberIdentityColumn();
    const memberId = ensureId(memberIdValue, 'معرّف العميل');
    const current = await getClientBase(memberId);
    const fullName = body.fullName === undefined ? current.fullName : text(body.fullName, 'اسم المتدرب', 120, true);
    const phone = body.phone === undefined ? current.phone : text(body.phone, 'رقم الهاتف', 30, true);
    const phoneNormalized = normalizePhone(phone);
    if (phoneNormalized.length < 5) throw appError('رقم الهاتف غير صالح.');
    const email = body.email === undefined ? current.email : text(body.email, 'البريد الإلكتروني', 254);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw appError('البريد الإلكتروني غير صالح.');
    const registrationDate = body.registrationDate === undefined ? current.registrationDate : dateValue(body.registrationDate, 'تاريخ التسجيل');
    const notes = body.notes === undefined ? current.notes : text(body.notes, 'الملاحظات', 1000);
    await withTransaction(async (transaction) => {
        await assertMember(transaction, memberId);
        await assertNoDuplicatePhone(transaction, phoneNormalized, email, memberId);
        await transaction.request().input('id', sql.Int, memberId).input('fullName', sql.NVarChar(120), fullName).input('phone', sql.NVarChar(30), phone).input('phoneNormalized', sql.NVarChar(30), phoneNormalized).input('email', sql.NVarChar(254), email).input('registrationDate', sql.Date, toUtcDate(registrationDate)).input('notes', sql.NVarChar(1000), notes).query('UPDATE dbo.members SET full_name=@fullName,phone=@phone,phone_normalized=@phoneNormalized,email=@email,registration_date=@registrationDate,notes=@notes,updated_at=SYSUTCDATETIME() WHERE id=@id;');
    });
    return getClientBase(memberId);
}

async function getExternalTrainees({ search = '', page = 1, pageSize = 12 } = {}) {
    await ensureCoachingTables();
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const requestedPage = Number(page);
    const requestedSize = Number(pageSize);
    const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100000) : 1;
    const currentPageSize = Number.isInteger(requestedSize) && requestedSize > 0 ? Math.min(requestedSize, 50) : 12;
    const offset = (currentPage - 1) * currentPageSize;
    const pool = await getPool();
    const result = await pool.request()
        .input('today', sql.Date, toUtcDate(todayInTimeZone()))
        .input('search', sql.NVarChar(100), normalizedSearch)
        .input('pattern', sql.NVarChar(110), `%${normalizedSearch}%`)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, currentPageSize)
        .query(`
            WITH program_stats AS (
                SELECT member_id,
                       COUNT(CASE WHEN status <> 'archived' THEN 1 END) AS workout_count,
                       MAX(updated_at) AS last_activity
                FROM dbo.workout_programs
                GROUP BY member_id
            ),
            diet_stats AS (
                SELECT member_id,
                       COUNT(CASE WHEN status <> 'archived' THEN 1 END) AS diet_count,
                       MAX(updated_at) AS last_activity
                FROM dbo.diet_plans
                GROUP BY member_id
            ),
            measurement_stats AS (
                SELECT member_id,
                       COUNT(1) AS measurement_count,
                       MAX(updated_at) AS last_activity
                FROM dbo.body_measurements
                GROUP BY member_id
            ),
            active_memberships AS (
                SELECT DISTINCT membership.member_id
                FROM dbo.memberships AS membership
                OUTER APPLY (
                    SELECT SUM(CASE
                        WHEN freeze.resumed_date IS NULL THEN DATEDIFF(day, freeze.start_date, freeze.end_date) + 1
                        WHEN freeze.resumed_date <= freeze.start_date THEN 0
                        WHEN freeze.resumed_date < freeze.end_date THEN DATEDIFF(day, freeze.start_date, freeze.resumed_date)
                        ELSE DATEDIFF(day, freeze.start_date, freeze.end_date) + 1
                    END) AS freeze_days
                    FROM dbo.membership_freezes AS freeze
                    WHERE freeze.membership_id = membership.id
                ) AS freeze_totals
                WHERE DATEADD(day, ISNULL(freeze_totals.freeze_days, 0), membership.end_date) >= @today
            ),
            candidates AS (
                SELECT
                    m.id, m.full_name, m.phone, m.email, m.registration_date, m.notes,
                    m.created_at, m.updated_at,
                    ISNULL(program_stats.workout_count, 0) AS workout_count,
                    ISNULL(diet_stats.diet_count, 0) AS diet_count,
                    JSON_QUERY((SELECT p.id, p.name, p.status, p.goal, p.level, p.duration_weeks, p.days_per_week,
                                       (SELECT COUNT(1) FROM dbo.workout_routines AS r WHERE r.program_id = p.id) AS routine_count,
                                       (SELECT COUNT(1) FROM dbo.workout_exercises AS e INNER JOIN dbo.workout_routines AS r ON r.id = e.routine_id WHERE r.program_id = p.id) AS exercise_count
                        FROM dbo.workout_programs AS p
                        WHERE p.member_id = m.id AND p.status <> 'archived'
                        ORDER BY p.updated_at DESC, p.id DESC
                        FOR JSON PATH)) AS workout_plans_json,
                    JSON_QUERY((SELECT p.id, p.name, p.status, p.target_calories,
                                       (SELECT COUNT(1) FROM dbo.diet_meals AS dm WHERE dm.diet_plan_id = p.id) AS meal_count,
                                       (SELECT COUNT(1) FROM dbo.diet_meal_items AS di INNER JOIN dbo.diet_meals AS dm ON dm.id = di.meal_id WHERE dm.diet_plan_id = p.id) AS item_count
                        FROM dbo.diet_plans AS p
                        WHERE p.member_id = m.id AND p.status <> 'archived'
                        ORDER BY p.updated_at DESC, p.id DESC
                        FOR JSON PATH)) AS diet_plans_json,
                    ISNULL(measurement_stats.measurement_count, 0) AS measurement_count,
                    (SELECT MAX(activity_date) FROM (VALUES
                        (program_stats.last_activity),
                        (diet_stats.last_activity),
                        (measurement_stats.last_activity)
                    ) AS activities(activity_date)) AS last_activity
                FROM dbo.members AS m
                LEFT JOIN program_stats ON program_stats.member_id = m.id
                LEFT JOIN diet_stats ON diet_stats.member_id = m.id
                LEFT JOIN measurement_stats ON measurement_stats.member_id = m.id
                LEFT JOIN active_memberships ON active_memberships.member_id = m.id
                WHERE (@search = N'' OR m.full_name LIKE @pattern OR m.phone LIKE @pattern OR ISNULL(m.email, N'') LIKE @pattern)
                  AND (ISNULL(program_stats.workout_count, 0) > 0 OR ISNULL(diet_stats.diet_count, 0) > 0)
                  AND active_memberships.member_id IS NULL
            )
            SELECT id, full_name, phone, email, registration_date, notes,
                   created_at, updated_at, workout_count, diet_count,
                   workout_plans_json, diet_plans_json, measurement_count,
                   last_activity, COUNT(1) OVER() AS total_count
            FROM candidates
            ORDER BY last_activity DESC, full_name ASC, id ASC
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
        `);
    const trainees = result.recordset.map(mapExternalTrainee);
    const total = result.recordset[0] ? Number(result.recordset[0].total_count || 0) : 0;
    return {
        trainees,
        pagination: {
            page: currentPage,
            pageSize: currentPageSize,
            total,
            totalPages: total ? Math.ceil(total / currentPageSize) : 0,
            hasNext: currentPage < (total ? Math.ceil(total / currentPageSize) : 0),
            hasPrevious: currentPage > 1
        }
    };
}

function mapExternalTrainee(row) {
    let workoutPlans = [];
    let dietPlans = [];
    try {
        workoutPlans = JSON.parse(row.workout_plans_json || '[]').map((program) => ({
            id: Number(program.id),
            name: program.name,
            status: program.status,
            goal: program.goal,
            level: program.level,
            durationWeeks: program.duration_weeks == null ? null : Number(program.duration_weeks),
            daysPerWeek: program.days_per_week == null ? null : Number(program.days_per_week),
            routines: Number(program.routine_count || 0),
            exerciseCount: Number(program.exercise_count || 0)
        }));
    } catch (_) {
        workoutPlans = [];
    }
    try {
        dietPlans = JSON.parse(row.diet_plans_json || '[]').map((plan) => ({
            id: Number(plan.id),
            name: plan.name,
            status: plan.status,
            targetCalories: plan.target_calories == null ? null : Number(plan.target_calories),
            meals: Number(plan.meal_count || 0),
            itemCount: Number(plan.item_count || 0)
        }));
    } catch (_) {
        dietPlans = [];
    }
    return {
        id: Number(row.id),
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        registrationDate: formatDateOnly(row.registration_date),
        notes: row.notes,
        workoutCount: Number(row.workout_count || 0),
        dietCount: Number(row.diet_count || 0),
        workoutPlans,
        dietPlans,
        measurementCount: Number(row.measurement_count || 0),
        lastActivity: row.last_activity || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function getClientOptions({ search = '', limit = 100 } = {}) {
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const currentLimit = Math.min(Math.max(Number(limit) || 100, 1), 300);
    const pool = await getPool();
    const result = await pool.request()
        .input('search', sql.NVarChar(100), normalizedSearch)
        .input('pattern', sql.NVarChar(110), `%${normalizedSearch}%`)
        .input('limit', sql.Int, currentLimit)
        .query(`SELECT TOP (@limit) id, full_name, phone, email
                FROM dbo.members
                WHERE (@search = N'' OR full_name LIKE @pattern OR phone LIKE @pattern OR ISNULL(email, N'') LIKE @pattern)
                ORDER BY full_name ASC, id ASC;`);
    return result.recordset.map((row) => ({ id: Number(row.id), fullName: row.full_name, phone: row.phone, email: row.email }));
}

async function getBuilderCatalog() {
    await ensureCoachingTables();
    const pool = await getPool();
    const result = await pool.request().batch(`
        SELECT id, name, name_ar, target_muscle_id, difficulty, equipment
        FROM dbo.gym_exercises
        WHERE JSON_VALUE(metadata_json, '$.catalogStatus') IS NULL
           OR JSON_VALUE(metadata_json, '$.catalogStatus') <> N'legacy-compatibility'
        ORDER BY COALESCE(name_ar, name), name, id;

        SELECT id, name_ar, name_en, serving_size, serving_unit,
               calories, protein, carbs, fat
        FROM dbo.gym_foods
        ORDER BY COALESCE(name_ar, name_en), name_en, id;
    `);
    return {
        exercises: (result.recordsets?.[0] || []).map((row) => ({
            id: Number(row.id),
            name: row.name,
            nameAr: row.name_ar,
            targetMuscleId: row.target_muscle_id == null ? null : Number(row.target_muscle_id),
            difficulty: row.difficulty,
            equipment: row.equipment
        })),
        foods: (result.recordsets?.[1] || []).map((row) => ({
            id: Number(row.id),
            nameAr: row.name_ar,
            nameEn: row.name_en,
            servingSize: Number(row.serving_size || 0),
            servingUnit: row.serving_unit,
            calories: Number(row.calories || 0),
            protein: Number(row.protein || 0),
            carbs: Number(row.carbs || 0),
            fat: Number(row.fat || 0)
        }))
    };
}

function normalizeWorkoutPayload(body = {}, { requireStructure = true } = {}) {
    const startDate = dateValue(body.startDate, 'تاريخ بداية البرنامج');
    let endDate = optionalDateValue(body.endDate, 'تاريخ نهاية البرنامج');
    const durationWeeks = numberValue(body.durationWeeks, 'مدة البرنامج', { min: 1, max: 520, integer: true });
    if (!endDate && durationWeeks) endDate = addDays(startDate, durationWeeks * 7 - 1);
    if (endDate && endDate < startDate) throw appError('تاريخ نهاية البرنامج يجب أن يكون بعد البداية.');
    const routines = listValue(body.routines || [], 'أيام التدريب').map((routine, routineIndex) => {
        const exercises = listValue(routine.exercises || [], `تمارين اليوم ${routineIndex + 1}`).map((exercise, exerciseIndex) => ({
            exerciseId: ensureId(exercise.exerciseId ?? exercise.id, 'معرّف التمرين'),
            sortOrder: numberValue(exercise.sortOrder ?? exerciseIndex, 'ترتيب التمرين', { min: 0, max: 9999, integer: true }),
            sets: numberValue(exercise.sets ?? 3, 'عدد المجموعات', { min: 1, max: 100, integer: true }),
            repsMin: numberValue(exercise.repsMin ?? exercise.reps, 'الحد الأدنى للتكرارات', { min: 1, max: 1000, integer: true }),
            repsMax: numberValue(exercise.repsMax ?? exercise.reps, 'الحد الأقصى للتكرارات', { min: 1, max: 1000, integer: true }),
            weightKg: numberValue(exercise.weightKg ?? exercise.weight, 'الوزن', { min: 0, max: 10000 }),
            restSeconds: numberValue(exercise.restSeconds ?? exercise.restSec, 'وقت الراحة', { min: 0, max: 7200, integer: true }),
            rir: numberValue(exercise.rir, 'RIR', { min: 0, max: 10, integer: true }),
            rpe: numberValue(exercise.rpe, 'RPE', { min: 1, max: 10 }),
            tempo: text(exercise.tempo, 'Tempo', 40),
            supersetGroupId: text(exercise.supersetGroupId, 'مجموعة السوبر سيت', 40),
            notes: text(exercise.notes, 'ملاحظات التمرين', 1000)
        }));
        exercises.forEach((exercise) => {
            if (exercise.repsMin != null && exercise.repsMax != null && exercise.repsMax < exercise.repsMin) {
                throw appError('Reps max must be greater than or equal to reps min.');
            }
        });
        return {
            name: text(routine.name, `اسم يوم التدريب ${routineIndex + 1}`, 160, true),
            dayOfWeek: numberValue(routine.dayOfWeek, 'يوم الأسبوع', { min: 1, max: 7, integer: true }),
            sortOrder: numberValue(routine.sortOrder ?? routineIndex, 'ترتيب اليوم', { min: 0, max: 9999, integer: true }),
            notes: text(routine.notes, 'ملاحظات اليوم', 1000),
            exercises
        };
    });
    const exerciseCount = routines.reduce((total, routine) => total + routine.exercises.length, 0);
    if (requireStructure && (!routines.length || !exerciseCount)) throw appError('أضف يوم تدريب وتمرينًا واحدًا على الأقل قبل الحفظ.');
    return {
        memberId: ensureId(body.memberId ?? body.clientId, 'معرّف العميل'),
        name: text(body.name, 'اسم البرنامج', 160, true),
        description: text(body.description, 'وصف البرنامج', 2000),
        startDate,
        endDate,
        durationWeeks,
        goal: text(body.goal, 'هدف البرنامج', 60),
        level: text(body.level, 'مستوى البرنامج', 40),
        daysPerWeek: numberValue(body.daysPerWeek, 'عدد أيام التدريب أسبوعيًا', { min: 1, max: 7, integer: true }),
        status: statusValue(body.status),
        notes: text(body.notes, 'ملاحظات البرنامج', 2000),
        version: numberValue(body.version, 'إصدار البرنامج', { min: 1, max: 100000, integer: true }),
        routines
    };
}

function normalizeDietPayload(body = {}, { requireStructure = true } = {}) {
    const calculator = body.calculator && typeof body.calculator === 'object' ? body.calculator : {};
    const calculatorData = {
        weightKg: numberValue(calculator.weightKg, 'Calculator weight', { min: 0, max: 1000 }),
        heightCm: numberValue(calculator.heightCm, 'Calculator height', { min: 0, max: 300 }),
        age: numberValue(calculator.age, 'Calculator age', { min: 0, max: 120, integer: true }),
        gender: text(calculator.gender, 'Calculator gender', 10) || 'male',
        activity: text(calculator.activity, 'Calculator activity', 20) || 'moderate',
        bmr: numberValue(calculator.bmr, 'BMR', { min: 0, max: 100000 }),
        tdee: numberValue(calculator.tdee, 'TDEE', { min: 0, max: 100000 })
    };
    const startDate = dateValue(body.startDate, 'تاريخ بداية الخطة');
    const endDate = optionalDateValue(body.endDate, 'تاريخ نهاية الخطة');
    if (endDate && endDate < startDate) throw appError('تاريخ نهاية الخطة يجب أن يكون بعد البداية.');
    const meals = listValue(body.meals || [], 'وجبات الخطة').map((meal, mealIndex) => {
        const items = listValue(meal.items || [], `أطعمة الوجبة ${mealIndex + 1}`).map((item, itemIndex) => ({
            foodId: ensureId(item.foodId ?? item.id, 'معرّف الطعام'),
            sortOrder: numberValue(item.sortOrder ?? itemIndex, 'ترتيب الطعام', { min: 0, max: 9999, integer: true }),
            assignedQuantity: numberValue(item.assignedQuantity ?? item.quantity, 'كمية الطعام', { min: 0.001, max: 100000 }),
            servingUnit: text(item.servingUnit ?? item.unit, 'وحدة الطعام', 40),
            notes: text(item.notes, 'ملاحظات الطعام', 500)
        }));
        return {
            name: text(meal.name, `اسم الوجبة ${mealIndex + 1}`, 120, true),
            mealTime: text(meal.mealTime ?? meal.time, 'وقت الوجبة', 10),
            sortOrder: numberValue(meal.sortOrder ?? mealIndex, 'ترتيب الوجبة', { min: 0, max: 9999, integer: true }),
            notes: text(meal.notes, 'ملاحظات الوجبة', 1000),
            items
        };
    });
    const itemCount = meals.reduce((total, meal) => total + meal.items.length, 0);
    if (requireStructure && (!meals.length || !itemCount)) throw appError('أضف وجبة وطعامًا واحدًا على الأقل قبل الحفظ.');
    return {
        memberId: ensureId(body.memberId ?? body.clientId, 'معرّف العميل'),
        name: text(body.name, 'اسم خطة التغذية', 160, true),
        description: text(body.description, 'وصف الخطة', 2000),
        startDate,
        endDate,
        mealsPerDay: numberValue(body.mealsPerDay ?? meals.length, 'عدد الوجبات اليومية', { min: 1, max: 12, integer: true }),
        targetCalories: numberValue(body.targetCalories, 'السعرات المستهدفة', { min: 0, max: 100000 }),
        targetProtein: numberValue(body.targetProtein, 'البروتين المستهدف', { min: 0, max: 10000 }),
        targetCarbs: numberValue(body.targetCarbs, 'الكربوهيدرات المستهدفة', { min: 0, max: 10000 }),
        targetFats: numberValue(body.targetFats, 'الدهون المستهدفة', { min: 0, max: 10000 }),
        status: statusValue(body.status),
        notes: text(body.notes, 'ملاحظات الخطة', 2000),
        version: numberValue(body.version, 'إصدار الخطة', { min: 1, max: 100000, integer: true }),
        calorieGoal: dietGoalValue(body.calorieGoal),
        calorieAdjustment: numberValue(body.calorieAdjustment, 'Calorie adjustment', { min: -10000, max: 10000, fallback: 0 }),
        calculator: calculatorData,
        meals
    };
}

async function validateLibraryIds(connection, table, ids, label) {
    const uniqueIds = [...new Set(ids.map((id) => ensureId(id, label)))];
    if (!uniqueIds.length) return new Map();
    const request = connection.request();
    const placeholders = uniqueIds.map((id, index) => {
        request.input(`libraryId${index}`, sql.Int, id);
        return `@libraryId${index}`;
    });
    const result = await request.query(`SELECT id FROM dbo.${table} WHERE id IN (${placeholders.join(', ')});`);
    const found = new Set(result.recordset.map((row) => Number(row.id)));
    const missing = uniqueIds.find((id) => !found.has(id));
    if (missing) throw appError(`${label} رقم ${missing} غير موجود في المكتبة.`);
    return found;
}

async function insertWorkoutStructure(transaction, programId, data) {
    const exerciseIds = data.routines.flatMap((routine) => routine.exercises.map((exercise) => exercise.exerciseId));
    await validateLibraryIds(transaction, 'gym_exercises', exerciseIds, 'معرّف التمرين');
    for (const routine of data.routines) {
        const routineResult = await transaction.request()
            .input('programId', sql.Int, programId)
            .input('name', sql.NVarChar(160), routine.name)
            .input('dayOfWeek', sql.Int, routine.dayOfWeek)
            .input('sortOrder', sql.Int, routine.sortOrder)
            .input('notes', sql.NVarChar(1000), routine.notes)
            .query(`INSERT INTO dbo.workout_routines (program_id, name, day_of_week, sort_order, notes)
                    OUTPUT INSERTED.id VALUES (@programId, @name, @dayOfWeek, @sortOrder, @notes);`);
        const routineId = Number(routineResult.recordset[0].id);
        for (const exercise of routine.exercises) {
            await transaction.request()
                .input('routineId', sql.Int, routineId)
                .input('exerciseId', sql.Int, exercise.exerciseId)
                .input('sortOrder', sql.Int, exercise.sortOrder)
                .input('sets', sql.Int, exercise.sets)
                .input('repsMin', sql.Int, exercise.repsMin)
                .input('repsMax', sql.Int, exercise.repsMax)
                .input('weightKg', sql.Decimal(10, 2), exercise.weightKg)
                .input('restSeconds', sql.Int, exercise.restSeconds)
                .input('rir', sql.Int, exercise.rir)
                .input('rpe', sql.Decimal(4, 1), exercise.rpe)
                .input('tempo', sql.NVarChar(40), exercise.tempo)
                .input('supersetGroupId', sql.NVarChar(40), exercise.supersetGroupId)
                .input('notes', sql.NVarChar(1000), exercise.notes)
                .query(`INSERT INTO dbo.workout_exercises
                            (routine_id, exercise_id, sort_order, sets, reps_min, reps_max, weight_kg,
                             rest_seconds, rir, rpe, tempo, superset_group_id, notes)
                        VALUES (@routineId, @exerciseId, @sortOrder, @sets, @repsMin, @repsMax, @weightKg,
                                @restSeconds, @rir, @rpe, @tempo, @supersetGroupId, @notes);`);
        }
    }
}

async function createWorkoutProgram(body = {}) {
    await ensureReady();
    const data = normalizeWorkoutPayload(body, { requireStructure: true });
    const programId = await withTransaction(async (transaction) => {
        await assertMember(transaction, data.memberId);
        const result = await transaction.request()
            .input('memberId', sql.Int, data.memberId)
            .input('name', sql.NVarChar(160), data.name)
            .input('description', sql.NVarChar(2000), data.description)
            .input('startDate', sql.Date, toUtcDate(data.startDate))
            .input('endDate', sql.Date, data.endDate ? toUtcDate(data.endDate) : null)
            .input('durationWeeks', sql.Int, data.durationWeeks)
            .input('goal', sql.NVarChar(60), data.goal)
            .input('level', sql.NVarChar(40), data.level)
            .input('daysPerWeek', sql.Int, data.daysPerWeek)
            .input('status', sql.VarChar(20), data.status)
            .input('notes', sql.NVarChar(2000), data.notes)
            .query(`INSERT INTO dbo.workout_programs
                        (member_id, name, description, start_date, end_date, duration_weeks, goal, level, days_per_week, status, notes)
                    OUTPUT INSERTED.id
                    VALUES (@memberId, @name, @description, @startDate, @endDate, @durationWeeks, @goal, @level, @daysPerWeek, @status, @notes);`);
        const id = Number(result.recordset[0].id);
        await insertWorkoutStructure(transaction, id, data);
        return id;
    });
    const program = await getWorkoutProgram(programId);
    await recordCoachingEvent(data.memberId, 'workout_created', { entityType: 'workout_program', entityId: programId, details: `تم إنشاء برنامج التدريب: ${data.name}` });
    return program;
}

async function getWorkoutProgram(id, expectedMemberId = null) {
    await ensureCoachingTables();
    const programId = ensureId(id, 'معرّف البرنامج');
    const pool = await getPool();
    const baseResult = await pool.request()
        .input('id', sql.Int, programId)
        .query(`SELECT p.*, m.full_name AS member_name, m.phone AS member_phone
                FROM dbo.workout_programs p INNER JOIN dbo.members m ON m.id = p.member_id
                WHERE p.id = @id;`);
    const base = baseResult.recordset[0];
    if (!base) throw appError('برنامج التدريب غير موجود.', 404);
    if (expectedMemberId && Number(base.member_id) !== Number(expectedMemberId)) throw appError('البرنامج لا يتبع هذا العميل.', 403);
    const [routineResult, exerciseResult] = await Promise.all([
        pool.request().input('programId', sql.Int, programId).query(`SELECT id, program_id, name, day_of_week, sort_order, notes FROM dbo.workout_routines WHERE program_id = @programId ORDER BY sort_order, id;`),
        pool.request().input('programId', sql.Int, programId).query(`SELECT we.id, we.routine_id, we.exercise_id, we.sort_order, we.sets, we.reps_min, we.reps_max, we.weight_kg, we.rest_seconds, we.rir, we.rpe, we.tempo, we.superset_group_id, we.notes, e.name, e.name_ar, e.target_muscle_id, e.difficulty, e.equipment
            FROM dbo.workout_exercises we INNER JOIN dbo.workout_routines r ON r.id = we.routine_id INNER JOIN dbo.gym_exercises e ON e.id = we.exercise_id WHERE r.program_id = @programId ORDER BY we.routine_id, we.sort_order, we.id;`)
    ]);
    const routines = routineResult.recordset.map((row) => ({
        id: Number(row.id),
        name: row.name,
        dayOfWeek: row.day_of_week == null ? null : Number(row.day_of_week),
        sortOrder: Number(row.sort_order || 0),
        notes: row.notes,
        exercises: exerciseResult.recordset.filter((exercise) => Number(exercise.routine_id) === Number(row.id)).map((exercise) => ({
            id: Number(exercise.id),
            exerciseId: Number(exercise.exercise_id),
            name: exercise.name,
            nameAr: exercise.name_ar,
            targetMuscleId: exercise.target_muscle_id == null ? null : Number(exercise.target_muscle_id),
            difficulty: exercise.difficulty,
            equipment: exercise.equipment,
            sortOrder: Number(exercise.sort_order || 0),
            sets: Number(exercise.sets || 0),
            repsMin: exercise.reps_min == null ? null : Number(exercise.reps_min),
            repsMax: exercise.reps_max == null ? null : Number(exercise.reps_max),
            weightKg: exercise.weight_kg == null ? null : Number(exercise.weight_kg),
            restSeconds: exercise.rest_seconds == null ? null : Number(exercise.rest_seconds),
            rir: exercise.rir == null ? null : Number(exercise.rir),
            rpe: exercise.rpe == null ? null : Number(exercise.rpe),
            tempo: exercise.tempo,
            supersetGroupId: exercise.superset_group_id,
            notes: exercise.notes
        }))
    }));
    return {
        id: Number(base.id),
        memberId: Number(base.member_id),
        memberName: base.member_name,
        memberPhone: base.member_phone,
        name: base.name,
        description: base.description,
        startDate: formatDateOnly(base.start_date),
        endDate: formatDateOnly(base.end_date),
        durationWeeks: base.duration_weeks == null ? null : Number(base.duration_weeks),
        goal: base.goal,
        level: base.level,
        daysPerWeek: base.days_per_week == null ? null : Number(base.days_per_week),
        status: base.status,
        notes: base.notes,
        version: Number(base.version || 1),
        createdAt: base.created_at,
        updatedAt: base.updated_at,
        routines,
        routineCount: routines.length,
        exerciseCount: routines.reduce((total, routine) => total + routine.exercises.length, 0),
        setCount: routines.reduce((total, routine) => total + routine.exercises.reduce((sum, exercise) => sum + exercise.sets, 0), 0)
    };
}

async function getWorkoutPrograms({ memberId, search = '', status = '', level = '' } = {}) {
    await ensureCoachingTables();
    const pool = await getPool();
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const normalizedStatus = status ? statusValue(status) : '';
    const normalizedLevel = String(level || '').trim().slice(0, 40);
    const request = pool.request()
        .input('search', sql.NVarChar(100), normalizedSearch)
        .input('pattern', sql.NVarChar(110), `%${normalizedSearch}%`)
        .input('status', sql.VarChar(20), normalizedStatus)
        .input('level', sql.NVarChar(40), normalizedLevel);
    let memberFilter = '';
    if (memberId) { request.input('memberId', sql.Int, ensureId(memberId, 'معرّف العميل')); memberFilter = 'AND p.member_id = @memberId'; }
    const result = await request.query(`SELECT p.id, p.member_id, m.full_name AS member_name, m.phone AS member_phone, p.name, p.description, p.start_date, p.end_date, p.duration_weeks, p.goal, p.level, p.days_per_week, p.status, p.version, p.created_at, p.updated_at,
            (SELECT COUNT(1) FROM dbo.workout_routines r WHERE r.program_id = p.id) AS routine_count,
            (SELECT COUNT(1) FROM dbo.workout_exercises e INNER JOIN dbo.workout_routines r ON r.id = e.routine_id WHERE r.program_id = p.id) AS exercise_count,
            (SELECT SUM(e.sets) FROM dbo.workout_exercises e INNER JOIN dbo.workout_routines r ON r.id = e.routine_id WHERE r.program_id = p.id) AS set_count
        FROM dbo.workout_programs p INNER JOIN dbo.members m ON m.id = p.member_id
        WHERE (@search = N'' OR p.name LIKE @pattern OR m.full_name LIKE @pattern OR m.phone LIKE @pattern)
          AND (@status = '' OR p.status = @status) AND (@level = N'' OR ISNULL(p.level, N'') = @level) ${memberFilter}
        ORDER BY p.updated_at DESC, p.id DESC;`);
    return result.recordset.map((row) => ({
        id: Number(row.id), memberId: Number(row.member_id), memberName: row.member_name, memberPhone: row.member_phone,
        name: row.name, description: row.description, startDate: formatDateOnly(row.start_date), endDate: formatDateOnly(row.end_date),
        durationWeeks: row.duration_weeks == null ? null : Number(row.duration_weeks), goal: row.goal, level: row.level, daysPerWeek: row.days_per_week == null ? null : Number(row.days_per_week), status: row.status, version: Number(row.version || 1), createdAt: row.created_at, updatedAt: row.updated_at,
        routineCount: Number(row.routine_count || 0), exerciseCount: Number(row.exercise_count || 0), setCount: Number(row.set_count || 0)
    }));
}

async function updateWorkoutProgram(id, body = {}) {
    await ensureReady();
    const programId = ensureId(id, 'معرّف البرنامج');
    const data = normalizeWorkoutPayload(body, { requireStructure: true });
    const updated = await withTransaction(async (transaction) => {
        const currentResult = await transaction.request().input('id', sql.Int, programId).query('SELECT * FROM dbo.workout_programs WITH (UPDLOCK, HOLDLOCK) WHERE id = @id;');
        const current = currentResult.recordset[0];
        if (!current) throw appError('برنامج التدريب غير موجود.', 404);
        if (Number(current.member_id) !== data.memberId) throw appError('لا يمكن نقل البرنامج إلى عميل آخر أثناء التعديل.');
        if (data.version && Number(current.version) !== data.version) throw appError('تم تعديل البرنامج من شاشة أخرى. حدّث البيانات ثم حاول مرة أخرى.', 409, 'VERSION_CONFLICT');
        await validateLibraryIds(transaction, 'gym_exercises', data.routines.flatMap((routine) => routine.exercises.map((exercise) => exercise.exerciseId)), 'معرّف التمرين');
        await transaction.request().input('id', sql.Int, programId).input('name', sql.NVarChar(160), data.name).input('description', sql.NVarChar(2000), data.description).input('startDate', sql.Date, toUtcDate(data.startDate)).input('endDate', sql.Date, data.endDate ? toUtcDate(data.endDate) : null).input('durationWeeks', sql.Int, data.durationWeeks).input('goal', sql.NVarChar(60), data.goal).input('level', sql.NVarChar(40), data.level).input('daysPerWeek', sql.Int, data.daysPerWeek).input('status', sql.VarChar(20), data.status).input('notes', sql.NVarChar(2000), data.notes)
            .query(`UPDATE dbo.workout_programs SET name=@name, description=@description, start_date=@startDate, end_date=@endDate, duration_weeks=@durationWeeks, goal=@goal, level=@level, days_per_week=@daysPerWeek, status=@status, notes=@notes, version=version+1, updated_at=SYSUTCDATETIME() WHERE id=@id;`);
        await transaction.request().input('programId', sql.Int, programId).query(`
            UPDATE logs SET workout_exercise_id = NULL
            FROM dbo.workout_set_logs logs
            INNER JOIN dbo.workout_exercises exercises ON exercises.id = logs.workout_exercise_id
            INNER JOIN dbo.workout_routines routines ON routines.id = exercises.routine_id
            WHERE routines.program_id = @programId;
            UPDATE dbo.workout_sessions SET routine_id = NULL WHERE program_id = @programId;
            DELETE FROM dbo.workout_routines WHERE program_id = @programId;
        `);
        await insertWorkoutStructure(transaction, programId, data);
        return programId;
    });
    const program = await getWorkoutProgram(updated);
    await recordCoachingEvent(data.memberId, 'workout_updated', { entityType: 'workout_program', entityId: updated, details: `تم تعديل برنامج التدريب: ${data.name}` });
    return program;
}

async function deleteWorkoutProgram(id) {
    await ensureCoachingTables();
    const programId = ensureId(id, 'معرّف البرنامج');
    const pool = await getPool();
    const owner = await pool.request().input('id', sql.Int, programId).query('SELECT TOP (1) member_id FROM dbo.workout_programs WHERE id=@id;');
    const result = await pool.request().input('id', sql.Int, programId).query(`
        UPDATE logs SET workout_exercise_id = NULL
        FROM dbo.workout_set_logs logs
        INNER JOIN dbo.workout_exercises exercises ON exercises.id = logs.workout_exercise_id
        INNER JOIN dbo.workout_routines routines ON routines.id = exercises.routine_id
        WHERE routines.program_id = @id;
        UPDATE dbo.workout_sessions SET program_id = NULL, routine_id = NULL WHERE program_id = @id;
        DELETE FROM dbo.workout_programs WHERE id = @id;
    `);
    if (!result.rowsAffected.some((count) => Number(count) > 0)) throw appError('برنامج التدريب غير موجود.', 404);
    const ownerId = owner.recordset[0]?.member_id;
    if (ownerId) await recordCoachingEvent(ownerId, 'workout_deleted', { entityType: 'workout_program', entityId: programId, details: 'تم حذف برنامج التدريب.' });
}

async function setWorkoutProgramStatus(id, status) {
    await ensureCoachingTables();
    const programId = ensureId(id, 'معرّف البرنامج');
    const normalized = statusValue(status);
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, programId).input('status', sql.VarChar(20), normalized).query('UPDATE dbo.workout_programs SET status=@status, version=version+1, updated_at=SYSUTCDATETIME() WHERE id=@id;');
    if (!result.rowsAffected[0]) throw appError('برنامج التدريب غير موجود.', 404);
    const program = await getWorkoutProgram(programId);
    await recordCoachingEvent(program.memberId, 'workout_status_changed', { entityType: 'workout_program', entityId: programId, details: `تم تغيير حالة برنامج التدريب إلى: ${normalized}` });
    return program;
}

async function readFoods(connection, ids) {
    const uniqueIds = [...new Set(ids.map((id) => ensureId(id, 'معرّف الطعام')))];
    const request = connection.request();
    const placeholders = uniqueIds.map((id, index) => { request.input(`foodId${index}`, sql.Int, id); return `@foodId${index}`; });
    const result = await request.query(`SELECT id, name_ar, name_en, calories, protein, carbs, fat, serving_size, serving_unit FROM dbo.gym_foods WHERE id IN (${placeholders.join(', ')});`);
    const map = new Map(result.recordset.map((row) => [Number(row.id), row]));
    const missing = uniqueIds.find((id) => !map.has(id));
    if (missing) throw appError(`معرّف الطعام رقم ${missing} غير موجود في المكتبة.`);
    return map;
}

function foodSnapshot(food, quantity) {
    const base = Number(food.serving_size || 100) || 100;
    const factor = Number(quantity) / base;
    return {
        calories: Math.round(Number(food.calories || 0) * factor * 1000) / 1000,
        protein: Math.round(Number(food.protein || 0) * factor * 1000) / 1000,
        carbs: Math.round(Number(food.carbs || 0) * factor * 1000) / 1000,
        fats: Math.round(Number(food.fat || 0) * factor * 1000) / 1000
    };
}

async function insertDietStructure(transaction, planId, data) {
    const foodMap = await readFoods(transaction, data.meals.flatMap((meal) => meal.items.map((item) => item.foodId)));
    for (const meal of data.meals) {
        const mealResult = await transaction.request().input('planId', sql.Int, planId).input('name', sql.NVarChar(120), meal.name).input('mealTime', sql.VarChar(10), meal.mealTime).input('sortOrder', sql.Int, meal.sortOrder).input('notes', sql.NVarChar(1000), meal.notes).query(`INSERT INTO dbo.diet_meals (diet_plan_id, name, meal_time, sort_order, notes) OUTPUT INSERTED.id VALUES (@planId, @name, @mealTime, @sortOrder, @notes);`);
        const mealId = Number(mealResult.recordset[0].id);
        for (const item of meal.items) {
            const snapshot = foodSnapshot(foodMap.get(item.foodId), item.assignedQuantity);
            await transaction.request().input('mealId', sql.Int, mealId).input('foodId', sql.Int, item.foodId).input('sortOrder', sql.Int, item.sortOrder).input('quantity', sql.Decimal(12, 3), item.assignedQuantity).input('servingUnit', sql.NVarChar(40), item.servingUnit || foodMap.get(item.foodId).serving_unit).input('calories', sql.Decimal(12, 3), snapshot.calories).input('protein', sql.Decimal(12, 3), snapshot.protein).input('carbs', sql.Decimal(12, 3), snapshot.carbs).input('fats', sql.Decimal(12, 3), snapshot.fats).input('notes', sql.NVarChar(500), item.notes).query(`INSERT INTO dbo.diet_meal_items (meal_id, food_id, sort_order, assigned_quantity, serving_unit, calc_calories, calc_protein, calc_carbs, calc_fats, notes) VALUES (@mealId, @foodId, @sortOrder, @quantity, @servingUnit, @calories, @protein, @carbs, @fats, @notes);`);
        }
    }
}

async function createDietPlan(body = {}) {
    await ensureReady();
    const data = normalizeDietPayload(body, { requireStructure: true });
    const planId = await withTransaction(async (transaction) => {
        await assertMember(transaction, data.memberId);
        const result = await transaction.request().input('memberId', sql.Int, data.memberId).input('name', sql.NVarChar(160), data.name).input('description', sql.NVarChar(2000), data.description).input('startDate', sql.Date, toUtcDate(data.startDate)).input('endDate', sql.Date, data.endDate ? toUtcDate(data.endDate) : null).input('mealsPerDay', sql.Int, data.mealsPerDay).input('targetCalories', sql.Decimal(12, 2), data.targetCalories).input('targetProtein', sql.Decimal(12, 2), data.targetProtein).input('targetCarbs', sql.Decimal(12, 2), data.targetCarbs).input('targetFats', sql.Decimal(12, 2), data.targetFats).input('calorieGoal', sql.VarChar(20), data.calorieGoal).input('calorieAdjustment', sql.Decimal(12, 2), data.calorieAdjustment).input('calculatorWeightKg', sql.Decimal(8, 2), data.calculator.weightKg).input('calculatorHeightCm', sql.Decimal(8, 2), data.calculator.heightCm).input('calculatorAge', sql.Int, data.calculator.age).input('calculatorGender', sql.VarChar(10), data.calculator.gender).input('calculatorActivity', sql.VarChar(20), data.calculator.activity).input('bmr', sql.Decimal(12, 2), data.calculator.bmr).input('tdee', sql.Decimal(12, 2), data.calculator.tdee).input('status', sql.VarChar(20), data.status).input('notes', sql.NVarChar(2000), data.notes).query(`INSERT INTO dbo.diet_plans (member_id, name, description, start_date, end_date, meals_per_day, target_calories, target_protein, target_carbs, target_fats, calorie_goal, calorie_adjustment, calculator_weight_kg, calculator_height_cm, calculator_age, calculator_gender, calculator_activity, bmr, tdee, status, notes) OUTPUT INSERTED.id VALUES (@memberId, @name, @description, @startDate, @endDate, @mealsPerDay, @targetCalories, @targetProtein, @targetCarbs, @targetFats, @calorieGoal, @calorieAdjustment, @calculatorWeightKg, @calculatorHeightCm, @calculatorAge, @calculatorGender, @calculatorActivity, @bmr, @tdee, @status, @notes);`);
        const id = Number(result.recordset[0].id);
        await insertDietStructure(transaction, id, data);
        return id;
    });
    const plan = await getDietPlan(planId);
    await recordCoachingEvent(data.memberId, 'diet_created', { entityType: 'diet_plan', entityId: planId, details: `تم إنشاء خطة التغذية: ${data.name}` });
    return plan;
}

async function getDietPlan(id, expectedMemberId = null) {
    await ensureCoachingTables();
    const planId = ensureId(id, 'معرّف خطة التغذية');
    const pool = await getPool();
    const baseResult = await pool.request().input('id', sql.Int, planId).query(`SELECT p.*, m.full_name AS member_name, m.phone AS member_phone FROM dbo.diet_plans p INNER JOIN dbo.members m ON m.id = p.member_id WHERE p.id=@id;`);
    const base = baseResult.recordset[0];
    if (!base) throw appError('خطة التغذية غير موجودة.', 404);
    if (expectedMemberId && Number(base.member_id) !== Number(expectedMemberId)) throw appError('الخطة لا تتبع هذا العميل.', 403);
    const [mealResult, itemResult] = await Promise.all([
        pool.request().input('planId', sql.Int, planId).query('SELECT id, diet_plan_id, name, meal_time, sort_order, notes FROM dbo.diet_meals WHERE diet_plan_id=@planId ORDER BY sort_order, id;'),
        pool.request().input('planId', sql.Int, planId).query(`SELECT i.id, i.meal_id, i.food_id, i.sort_order, i.assigned_quantity, i.serving_unit, i.calc_calories, i.calc_protein, i.calc_carbs, i.calc_fats, i.notes, f.name_ar, f.name_en, f.serving_unit AS catalog_serving_unit FROM dbo.diet_meal_items i INNER JOIN dbo.diet_meals dm ON dm.id=i.meal_id INNER JOIN dbo.gym_foods f ON f.id=i.food_id WHERE dm.diet_plan_id=@planId ORDER BY i.meal_id, i.sort_order, i.id;`)
    ]);
    const meals = mealResult.recordset.map((row) => ({
        id: Number(row.id), name: row.name, mealTime: row.meal_time, sortOrder: Number(row.sort_order || 0), notes: row.notes,
        items: itemResult.recordset.filter((item) => Number(item.meal_id) === Number(row.id)).map((item) => ({
            id: Number(item.id), foodId: Number(item.food_id), nameAr: item.name_ar, nameEn: item.name_en, sortOrder: Number(item.sort_order || 0), assignedQuantity: Number(item.assigned_quantity || 0), servingUnit: item.serving_unit || item.catalog_serving_unit, calories: Number(item.calc_calories || 0), protein: Number(item.calc_protein || 0), carbs: Number(item.calc_carbs || 0), fats: Number(item.calc_fats || 0), notes: item.notes
        }))
    }));
    const totals = meals.reduce((total, meal) => meal.items.reduce((sum, item) => ({ calories: sum.calories + item.calories, protein: sum.protein + item.protein, carbs: sum.carbs + item.carbs, fats: sum.fats + item.fats }), total), { calories: 0, protein: 0, carbs: 0, fats: 0 });
    return { id: Number(base.id), memberId: Number(base.member_id), memberName: base.member_name, memberPhone: base.member_phone, name: base.name, description: base.description, startDate: formatDateOnly(base.start_date), endDate: formatDateOnly(base.end_date), mealsPerDay: base.meals_per_day == null ? null : Number(base.meals_per_day), targetCalories: base.target_calories == null ? null : Number(base.target_calories), targetProtein: base.target_protein == null ? null : Number(base.target_protein), targetCarbs: base.target_carbs == null ? null : Number(base.target_carbs), targetFats: base.target_fats == null ? null : Number(base.target_fats), calorieGoal: base.calorie_goal || 'maintain', calorieAdjustment: base.calorie_adjustment == null ? 0 : Number(base.calorie_adjustment), calculator: { weightKg: base.calculator_weight_kg == null ? '' : Number(base.calculator_weight_kg), heightCm: base.calculator_height_cm == null ? '' : Number(base.calculator_height_cm), age: base.calculator_age == null ? '' : Number(base.calculator_age), gender: base.calculator_gender || 'male', activity: base.calculator_activity || 'moderate', bmr: base.bmr == null ? null : Number(base.bmr), tdee: base.tdee == null ? null : Number(base.tdee), measurementDate: '' }, status: base.status, notes: base.notes, version: Number(base.version || 1), createdAt: base.created_at, updatedAt: base.updated_at, meals, mealCount: meals.length, itemCount: meals.reduce((sum, meal) => sum + meal.items.length, 0), totals };
}

async function getDietPlans({ memberId, search = '', status = '' } = {}) {
    await ensureCoachingTables();
    const pool = await getPool();
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const normalizedStatus = status ? statusValue(status) : '';
    const request = pool.request().input('search', sql.NVarChar(100), normalizedSearch).input('pattern', sql.NVarChar(110), `%${normalizedSearch}%`).input('status', sql.VarChar(20), normalizedStatus);
    let memberFilter = '';
    if (memberId) { request.input('memberId', sql.Int, ensureId(memberId, 'معرّف العميل')); memberFilter = 'AND p.member_id=@memberId'; }
    const result = await request.query(`SELECT p.id,p.member_id,m.full_name AS member_name,m.phone AS member_phone,p.name,p.description,p.start_date,p.end_date,p.meals_per_day,p.target_calories,p.target_protein,p.target_carbs,p.target_fats,p.calorie_goal,p.calorie_adjustment,p.bmr,p.tdee,p.status,p.version,p.created_at,p.updated_at,
        (SELECT COUNT(1) FROM dbo.diet_meals dm WHERE dm.diet_plan_id=p.id) AS meal_count,
        (SELECT COUNT(1) FROM dbo.diet_meal_items di INNER JOIN dbo.diet_meals dm ON dm.id=di.meal_id WHERE dm.diet_plan_id=p.id) AS item_count
        FROM dbo.diet_plans p INNER JOIN dbo.members m ON m.id=p.member_id WHERE (@search=N'' OR p.name LIKE @pattern OR m.full_name LIKE @pattern OR m.phone LIKE @pattern) AND (@status='' OR p.status=@status) ${memberFilter} ORDER BY p.updated_at DESC,p.id DESC;`);
    return result.recordset.map((row) => ({ id: Number(row.id), memberId: Number(row.member_id), memberName: row.member_name, memberPhone: row.member_phone, name: row.name, description: row.description, startDate: formatDateOnly(row.start_date), endDate: formatDateOnly(row.end_date), mealsPerDay: row.meals_per_day == null ? null : Number(row.meals_per_day), targetCalories: row.target_calories == null ? null : Number(row.target_calories), targetProtein: row.target_protein == null ? null : Number(row.target_protein), targetCarbs: row.target_carbs == null ? null : Number(row.target_carbs), targetFats: row.target_fats == null ? null : Number(row.target_fats), calorieGoal: row.calorie_goal || 'maintain', calorieAdjustment: row.calorie_adjustment == null ? 0 : Number(row.calorie_adjustment), bmr: row.bmr == null ? null : Number(row.bmr), tdee: row.tdee == null ? null : Number(row.tdee), status: row.status, version: Number(row.version || 1), createdAt: row.created_at, updatedAt: row.updated_at, mealCount: Number(row.meal_count || 0), itemCount: Number(row.item_count || 0) }));
}

async function updateDietPlan(id, body = {}) {
    await ensureReady();
    const planId = ensureId(id, 'معرّف خطة التغذية');
    const data = normalizeDietPayload(body, { requireStructure: true });
    const updated = await withTransaction(async (transaction) => {
        const currentResult = await transaction.request().input('id', sql.Int, planId).query('SELECT * FROM dbo.diet_plans WITH (UPDLOCK, HOLDLOCK) WHERE id=@id;');
        const current = currentResult.recordset[0];
        if (!current) throw appError('خطة التغذية غير موجودة.', 404);
        if (Number(current.member_id) !== data.memberId) throw appError('لا يمكن نقل الخطة إلى عميل آخر أثناء التعديل.');
        if (data.version && Number(current.version) !== data.version) throw appError('تم تعديل الخطة من شاشة أخرى. حدّث البيانات ثم حاول مرة أخرى.', 409, 'VERSION_CONFLICT');
        await readFoods(transaction, data.meals.flatMap((meal) => meal.items.map((item) => item.foodId)));
        await transaction.request().input('id', sql.Int, planId).input('name', sql.NVarChar(160), data.name).input('description', sql.NVarChar(2000), data.description).input('startDate', sql.Date, toUtcDate(data.startDate)).input('endDate', sql.Date, data.endDate ? toUtcDate(data.endDate) : null).input('mealsPerDay', sql.Int, data.mealsPerDay).input('targetCalories', sql.Decimal(12, 2), data.targetCalories).input('targetProtein', sql.Decimal(12, 2), data.targetProtein).input('targetCarbs', sql.Decimal(12, 2), data.targetCarbs).input('targetFats', sql.Decimal(12, 2), data.targetFats).input('calorieGoal', sql.VarChar(20), data.calorieGoal).input('calorieAdjustment', sql.Decimal(12, 2), data.calorieAdjustment).input('calculatorWeightKg', sql.Decimal(8, 2), data.calculator.weightKg).input('calculatorHeightCm', sql.Decimal(8, 2), data.calculator.heightCm).input('calculatorAge', sql.Int, data.calculator.age).input('calculatorGender', sql.VarChar(10), data.calculator.gender).input('calculatorActivity', sql.VarChar(20), data.calculator.activity).input('bmr', sql.Decimal(12, 2), data.calculator.bmr).input('tdee', sql.Decimal(12, 2), data.calculator.tdee).input('status', sql.VarChar(20), data.status).input('notes', sql.NVarChar(2000), data.notes).query(`UPDATE dbo.diet_plans SET name=@name,description=@description,start_date=@startDate,end_date=@endDate,meals_per_day=@mealsPerDay,target_calories=@targetCalories,target_protein=@targetProtein,target_carbs=@targetCarbs,target_fats=@targetFats,calorie_goal=@calorieGoal,calorie_adjustment=@calorieAdjustment,calculator_weight_kg=@calculatorWeightKg,calculator_height_cm=@calculatorHeightCm,calculator_age=@calculatorAge,calculator_gender=@calculatorGender,calculator_activity=@calculatorActivity,bmr=@bmr,tdee=@tdee,status=@status,notes=@notes,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
        await transaction.request().input('planId', sql.Int, planId).query(`
            UPDATE logs SET meal_item_id = NULL
            FROM dbo.meal_logs logs
            INNER JOIN dbo.diet_meal_items items ON items.id = logs.meal_item_id
            INNER JOIN dbo.diet_meals meals ON meals.id = items.meal_id
            WHERE meals.diet_plan_id = @planId;
            DELETE FROM dbo.diet_meals WHERE diet_plan_id=@planId;
        `);
        await insertDietStructure(transaction, planId, data);
        return planId;
    });
    const plan = await getDietPlan(updated);
    await recordCoachingEvent(data.memberId, 'diet_updated', { entityType: 'diet_plan', entityId: updated, details: `تم تعديل خطة التغذية: ${data.name}` });
    return plan;
}

async function deleteDietPlan(id) {
    await ensureCoachingTables();
    const planId = ensureId(id, 'معرّف خطة التغذية');
    const pool = await getPool();
    const owner = await pool.request().input('id', sql.Int, planId).query('SELECT TOP (1) member_id FROM dbo.diet_plans WHERE id=@id;');
    const result = await pool.request().input('id', sql.Int, planId).query(`
        UPDATE logs SET meal_item_id = NULL
        FROM dbo.meal_logs logs
        INNER JOIN dbo.diet_meal_items items ON items.id = logs.meal_item_id
        INNER JOIN dbo.diet_meals meals ON meals.id = items.meal_id
        WHERE meals.diet_plan_id = @id;
        DELETE FROM dbo.diet_plans WHERE id=@id;
    `);
    if (!result.rowsAffected.some((count) => Number(count) > 0)) throw appError('خطة التغذية غير موجودة.', 404);
    const ownerId = owner.recordset[0]?.member_id;
    if (ownerId) await recordCoachingEvent(ownerId, 'diet_deleted', { entityType: 'diet_plan', entityId: planId, details: 'تم حذف خطة التغذية.' });
}

async function setDietPlanStatus(id, status) {
    await ensureCoachingTables();
    const planId = ensureId(id, 'معرّف خطة التغذية');
    const normalized = statusValue(status);
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, planId).input('status', sql.VarChar(20), normalized).query('UPDATE dbo.diet_plans SET status=@status,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@id;');
    if (!result.rowsAffected[0]) throw appError('خطة التغذية غير موجودة.', 404);
    const plan = await getDietPlan(planId);
    await recordCoachingEvent(plan.memberId, 'diet_status_changed', { entityType: 'diet_plan', entityId: planId, details: `تم تغيير حالة خطة التغذية إلى: ${normalized}` });
    return plan;
}

function normalizeMeasurement(body = {}, { partial = false } = {}) {
    const data = {};
    if (!partial || Object.prototype.hasOwnProperty.call(body, 'measuredAt')) data.measuredAt = dateValue(body.measuredAt, 'تاريخ القياس');
    if (!partial || Object.prototype.hasOwnProperty.call(body, 'weightKg')) data.weightKg = numberValue(body.weightKg, 'الوزن', { min: 0, max: 1000 });
    if (!partial || Object.prototype.hasOwnProperty.call(body, 'heightCm')) data.heightCm = numberValue(body.heightCm, 'الطول', { min: 0, max: 300 });
    if (!partial || Object.prototype.hasOwnProperty.call(body, 'bodyFatPercent')) data.bodyFatPercent = numberValue(body.bodyFatPercent, 'نسبة الدهون', { min: 0, max: 100 });
    for (const [key, label] of [['chestCm', 'محيط الصدر'], ['waistCm', 'محيط الخصر'], ['hipsCm', 'محيط الأرداف'], ['armsCm', 'محيط الذراع'], ['thighsCm', 'محيط الفخذ']]) {
        if (!partial || Object.prototype.hasOwnProperty.call(body, key)) data[key] = numberValue(body[key], label, { min: 0, max: 500 });
    }
    if (!partial || Object.prototype.hasOwnProperty.call(body, 'notes')) data.notes = text(body.notes, 'ملاحظات القياس', 1000);
    if (!Object.values(data).some((value) => value !== null && value !== undefined && value !== '')) throw appError('أدخل قيمة قياس واحدة على الأقل.');
    return data;
}

function mapMeasurement(row) {
    return { id: Number(row.id), memberId: Number(row.member_id), measuredAt: formatDateOnly(row.measured_at), weightKg: row.weight_kg == null ? null : Number(row.weight_kg), heightCm: row.height_cm == null ? null : Number(row.height_cm), bodyFatPercent: row.body_fat_percent == null ? null : Number(row.body_fat_percent), chestCm: row.chest_cm == null ? null : Number(row.chest_cm), waistCm: row.waist_cm == null ? null : Number(row.waist_cm), hipsCm: row.hips_cm == null ? null : Number(row.hips_cm), armsCm: row.arms_cm == null ? null : Number(row.arms_cm), thighsCm: row.thighs_cm == null ? null : Number(row.thighs_cm), notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at };
}

async function getMeasurements(memberId) {
    await ensureCoachingTables();
    const pool = await getPool();
    const result = await pool.request().input('memberId', sql.Int, ensureId(memberId, 'معرّف العميل')).query(`SELECT id, member_id, measured_at,
                       weight_kg, height_cm, body_fat_percent, chest_cm,
                       waist_cm, hips_cm, arms_cm, thighs_cm, notes,
                       created_at, updated_at
                FROM dbo.body_measurements
                WHERE member_id=@memberId
                ORDER BY measured_at DESC,id DESC;`);
    return result.recordset.map(mapMeasurement);
}

async function createMeasurement(memberId, body = {}) {
    await ensureCoachingTables();
    const id = ensureId(memberId, 'معرّف العميل');
    const data = normalizeMeasurement(body);
    const measurementId = await withTransaction(async (transaction) => {
        await assertMember(transaction, id);
        const result = await transaction.request().input('memberId', sql.Int, id).input('measuredAt', sql.Date, toUtcDate(data.measuredAt)).input('weightKg', sql.Decimal(8, 2), data.weightKg).input('heightCm', sql.Decimal(8, 2), data.heightCm).input('bodyFatPercent', sql.Decimal(5, 2), data.bodyFatPercent).input('chestCm', sql.Decimal(8, 2), data.chestCm).input('waistCm', sql.Decimal(8, 2), data.waistCm).input('hipsCm', sql.Decimal(8, 2), data.hipsCm).input('armsCm', sql.Decimal(8, 2), data.armsCm).input('thighsCm', sql.Decimal(8, 2), data.thighsCm).input('notes', sql.NVarChar(1000), data.notes).query(`INSERT INTO dbo.body_measurements (member_id, measured_at, weight_kg, height_cm, body_fat_percent, chest_cm, waist_cm, hips_cm, arms_cm, thighs_cm, notes) OUTPUT INSERTED.id VALUES (@memberId,@measuredAt,@weightKg,@heightCm,@bodyFatPercent,@chestCm,@waistCm,@hipsCm,@armsCm,@thighsCm,@notes);`);
        return Number(result.recordset[0].id);
    });
    const rows = await getMeasurements(id);
    const measurement = rows.find((row) => row.id === measurementId) || null;
    await recordCoachingEvent(id, 'measurement_created', { entityType: 'measurement', entityId: measurementId, details: `تمت إضافة قياس بتاريخ ${data.measuredAt}` });
    return measurement;
}

async function updateMeasurement(memberId, measurementId, body = {}) {
    await ensureCoachingTables();
    const clientId = ensureId(memberId, 'معرّف العميل');
    const id = ensureId(measurementId, 'معرّف القياس');
    const data = normalizeMeasurement(body);
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, id).input('memberId', sql.Int, clientId).input('measuredAt', sql.Date, toUtcDate(data.measuredAt)).input('weightKg', sql.Decimal(8, 2), data.weightKg).input('heightCm', sql.Decimal(8, 2), data.heightCm).input('bodyFatPercent', sql.Decimal(5, 2), data.bodyFatPercent).input('chestCm', sql.Decimal(8, 2), data.chestCm).input('waistCm', sql.Decimal(8, 2), data.waistCm).input('hipsCm', sql.Decimal(8, 2), data.hipsCm).input('armsCm', sql.Decimal(8, 2), data.armsCm).input('thighsCm', sql.Decimal(8, 2), data.thighsCm).input('notes', sql.NVarChar(1000), data.notes).query(`UPDATE dbo.body_measurements SET measured_at=@measuredAt,weight_kg=@weightKg,height_cm=@heightCm,body_fat_percent=@bodyFatPercent,chest_cm=@chestCm,waist_cm=@waistCm,hips_cm=@hipsCm,arms_cm=@armsCm,thighs_cm=@thighsCm,notes=@notes,updated_at=SYSUTCDATETIME() WHERE id=@id AND member_id=@memberId;`);
    if (!result.rowsAffected[0]) throw appError('القياس غير موجود.', 404);
    const measurement = (await getMeasurements(clientId)).find((row) => row.id === id) || null;
    await recordCoachingEvent(clientId, 'measurement_updated', { entityType: 'measurement', entityId: id, details: `تم تعديل القياس بتاريخ ${data.measuredAt}` });
    return measurement;
}

async function deleteMeasurement(memberId, measurementId) {
    await ensureCoachingTables();
    const clientId = ensureId(memberId, 'معرّف العميل');
    const id = ensureId(measurementId, 'معرّف القياس');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, id).input('memberId', sql.Int, clientId).query('DELETE FROM dbo.body_measurements WHERE id=@id AND member_id=@memberId;');
    if (!result.rowsAffected[0]) throw appError('القياس غير موجود.', 404);
    await recordCoachingEvent(clientId, 'measurement_deleted', { entityType: 'measurement', entityId: id, details: 'تم حذف القياس.' });
}

function normalizeCheckin(body = {}) {
    const data = {
        checkinDate: dateValue(body.checkinDate ?? body.date, 'تاريخ المتابعة'),
        sleepHours: numberValue(body.sleepHours, 'ساعات النوم', { min: 0, max: 24 }),
        sleepQuality: numberValue(body.sleepQuality, 'جودة النوم', { min: 1, max: 5, integer: true }),
        fatigue: numberValue(body.fatigue, 'الإجهاد', { min: 1, max: 5, integer: true }),
        soreness: numberValue(body.soreness, 'الألم العضلي', { min: 1, max: 5, integer: true }),
        stress: numberValue(body.stress, 'الضغط النفسي', { min: 1, max: 5, integer: true }),
        mood: numberValue(body.mood, 'المزاج', { min: 1, max: 5, integer: true }),
        restingHr: numberValue(body.restingHr, 'نبض الراحة', { min: 20, max: 250, integer: true }),
        hrv: numberValue(body.hrv, 'HRV', { min: 0, max: 500 }),
        bodyweightKg: numberValue(body.bodyweightKg, 'وزن المتابعة', { min: 0, max: 1000 }),
        notes: text(body.notes, 'ملاحظات المتابعة', 1000)
    };
    const metrics = ['sleepHours', 'sleepQuality', 'fatigue', 'soreness', 'stress', 'mood', 'restingHr', 'hrv', 'bodyweightKg'];
    if (!metrics.some((key) => data[key] !== null && data[key] !== undefined && data[key] !== '')) throw appError('أدخل قيمة متابعة واحدة على الأقل.');
    return data;
}

function mapCheckin(row) {
    return {
        id: Number(row.id),
        memberId: Number(row.member_id),
        checkinDate: formatDateOnly(row.checkin_date),
        sleepHours: row.sleep_hours == null ? null : Number(row.sleep_hours),
        sleepQuality: row.sleep_quality == null ? null : Number(row.sleep_quality),
        fatigue: row.fatigue == null ? null : Number(row.fatigue),
        soreness: row.soreness == null ? null : Number(row.soreness),
        stress: row.stress == null ? null : Number(row.stress),
        mood: row.mood == null ? null : Number(row.mood),
        restingHr: row.resting_hr == null ? null : Number(row.resting_hr),
        hrv: row.hrv == null ? null : Number(row.hrv),
        bodyweightKg: row.bodyweight_kg == null ? null : Number(row.bodyweight_kg),
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function getCheckins(memberId, options = {}) {
    await ensureCoachingTables();
    const id = ensureId(memberId, 'معرّف العميل');
    const limit = Math.min(200, Math.max(1, Number(options.limit) || 60));
    const pool = await getPool();
    const result = await pool.request()
        .input('memberId', sql.Int, id)
        .input('limit', sql.Int, limit)
        .query('SELECT TOP (@limit) * FROM dbo.athlete_checkins WHERE member_id=@memberId ORDER BY checkin_date DESC,id DESC;');
    return result.recordset.map(mapCheckin);
}

async function createCheckin(memberId, body = {}) {
    await ensureCoachingTables();
    const id = ensureId(memberId, 'معرّف العميل');
    const data = normalizeCheckin(body);
    const checkinId = await withTransaction(async (transaction) => {
        await assertMember(transaction, id);
        const duplicate = await transaction.request().input('memberId', sql.Int, id).input('checkinDate', sql.Date, toUtcDate(data.checkinDate)).query('SELECT TOP (1) id FROM dbo.athlete_checkins WITH (UPDLOCK, HOLDLOCK) WHERE member_id=@memberId AND checkin_date=@checkinDate;');
        if (duplicate.recordset[0]) throw appError('تم تسجيل متابعة لهذا العميل في نفس التاريخ بالفعل.', 409, 'CHECKIN_ALREADY_EXISTS');
        const result = await transaction.request()
            .input('memberId', sql.Int, id)
            .input('checkinDate', sql.Date, toUtcDate(data.checkinDate))
            .input('sleepHours', sql.Decimal(4, 1), data.sleepHours)
            .input('sleepQuality', sql.Int, data.sleepQuality)
            .input('fatigue', sql.Int, data.fatigue)
            .input('soreness', sql.Int, data.soreness)
            .input('stress', sql.Int, data.stress)
            .input('mood', sql.Int, data.mood)
            .input('restingHr', sql.Int, data.restingHr)
            .input('hrv', sql.Decimal(8, 2), data.hrv)
            .input('bodyweightKg', sql.Decimal(8, 2), data.bodyweightKg)
            .input('notes', sql.NVarChar(1000), data.notes)
            .query(`INSERT INTO dbo.athlete_checkins
                        (member_id, checkin_date, sleep_hours, sleep_quality, fatigue, soreness, stress, mood, resting_hr, hrv, bodyweight_kg, notes)
                    OUTPUT INSERTED.id
                    VALUES (@memberId, @checkinDate, @sleepHours, @sleepQuality, @fatigue, @soreness, @stress, @mood, @restingHr, @hrv, @bodyweightKg, @notes);`);
        return Number(result.recordset[0].id);
    });
    const checkin = (await getCheckins(id)).find((item) => item.id === checkinId) || null;
    await recordCoachingEvent(id, 'checkin_created', { entityType: 'checkin', entityId: checkinId, details: `تمت إضافة متابعة بتاريخ ${data.checkinDate}` });
    return checkin;
}

async function updateCheckin(memberId, checkinId, body = {}) {
    await ensureCoachingTables();
    const member = ensureId(memberId, 'معرّف العميل');
    const id = ensureId(checkinId, 'معرّف المتابعة');
    const data = normalizeCheckin(body);
    const pool = await getPool();
    const duplicate = await pool.request().input('id', sql.Int, id).input('memberId', sql.Int, member).input('checkinDate', sql.Date, toUtcDate(data.checkinDate)).query('SELECT TOP (1) id FROM dbo.athlete_checkins WHERE member_id=@memberId AND checkin_date=@checkinDate AND id<>@id;');
    if (duplicate.recordset[0]) throw appError('يوجد تسجيل متابعة آخر في نفس التاريخ.', 409, 'CHECKIN_ALREADY_EXISTS');
    const result = await pool.request()
        .input('id', sql.Int, id)
        .input('memberId', sql.Int, member)
        .input('checkinDate', sql.Date, toUtcDate(data.checkinDate))
        .input('sleepHours', sql.Decimal(4, 1), data.sleepHours)
        .input('sleepQuality', sql.Int, data.sleepQuality)
        .input('fatigue', sql.Int, data.fatigue)
        .input('soreness', sql.Int, data.soreness)
        .input('stress', sql.Int, data.stress)
        .input('mood', sql.Int, data.mood)
        .input('restingHr', sql.Int, data.restingHr)
        .input('hrv', sql.Decimal(8, 2), data.hrv)
        .input('bodyweightKg', sql.Decimal(8, 2), data.bodyweightKg)
        .input('notes', sql.NVarChar(1000), data.notes)
        .query(`UPDATE dbo.athlete_checkins SET checkin_date=@checkinDate, sleep_hours=@sleepHours, sleep_quality=@sleepQuality, fatigue=@fatigue, soreness=@soreness, stress=@stress, mood=@mood, resting_hr=@restingHr, hrv=@hrv, bodyweight_kg=@bodyweightKg, notes=@notes, updated_at=SYSUTCDATETIME() WHERE id=@id AND member_id=@memberId;`);
    if (!result.rowsAffected[0]) throw appError('المتابعة اليومية غير موجودة.', 404);
    const checkin = (await getCheckins(member)).find((item) => item.id === id) || null;
    await recordCoachingEvent(member, 'checkin_updated', { entityType: 'checkin', entityId: id, details: `تم تعديل المتابعة بتاريخ ${data.checkinDate}` });
    return checkin;
}

async function deleteCheckin(memberId, checkinId) {
    await ensureCoachingTables();
    const member = ensureId(memberId, 'معرّف العميل');
    const id = ensureId(checkinId, 'معرّف المتابعة');
    const result = await getPool().then((pool) => pool.request().input('id', sql.Int, id).input('memberId', sql.Int, member).query('DELETE FROM dbo.athlete_checkins WHERE id=@id AND member_id=@memberId;'));
    if (!result.rowsAffected[0]) throw appError('المتابعة اليومية غير موجودة.', 404);
    await recordCoachingEvent(member, 'checkin_deleted', { entityType: 'checkin', entityId: id, details: 'تم حذف المتابعة اليومية.' });
}

async function getTrainingExecutionSummary(memberId) {
    await ensureCoachingTables();
    const id = ensureId(memberId);
    const pool = await getPool();
    const result = await pool.request()
        .input('memberId', sql.Int, id)
        .batch(`
            SELECT
                (SELECT COUNT_BIG(*) FROM dbo.workout_sessions WHERE member_id=@memberId) AS session_count,
                (SELECT COUNT_BIG(*) FROM dbo.workout_sessions WHERE member_id=@memberId AND status='completed') AS completed_session_count,
                (SELECT COALESCE(SUM(COALESCE(log.weight_kg, 0) * COALESCE(log.reps, 0)), 0)
                 FROM dbo.workout_set_logs AS log
                 INNER JOIN dbo.workout_sessions AS session ON session.id=log.session_id
                 WHERE session.member_id=@memberId) AS training_volume_kg,
                (SELECT COUNT_BIG(*)
                 FROM dbo.workout_set_logs AS log
                 INNER JOIN dbo.workout_sessions AS session ON session.id=log.session_id
                 WHERE session.member_id=@memberId) AS logged_set_count,
                (SELECT COALESCE(SUM(COALESCE(log.reps, 0)), 0)
                 FROM dbo.workout_set_logs AS log
                 INNER JOIN dbo.workout_sessions AS session ON session.id=log.session_id
                 WHERE session.member_id=@memberId) AS logged_rep_count,
                (SELECT COUNT_BIG(*) FROM dbo.meal_logs WHERE member_id=@memberId) AS meal_log_count,
                (SELECT COUNT(DISTINCT CONVERT(date, consumed_at)) FROM dbo.meal_logs WHERE member_id=@memberId) AS nutrition_logged_days,
                (SELECT COALESCE(SUM(calc_calories), 0) FROM dbo.meal_logs WHERE member_id=@memberId) AS nutrition_calories_total,
                (SELECT COALESCE(SUM(calc_protein), 0) FROM dbo.meal_logs WHERE member_id=@memberId) AS nutrition_protein_total,
                (SELECT COALESCE(SUM(calc_carbs), 0) FROM dbo.meal_logs WHERE member_id=@memberId) AS nutrition_carbs_total,
                (SELECT COALESCE(SUM(calc_fats), 0) FROM dbo.meal_logs WHERE member_id=@memberId) AS nutrition_fats_total,
                (SELECT COUNT_BIG(*) FROM dbo.athlete_checkins WHERE member_id=@memberId) AS checkin_count;
            SELECT program_id, COUNT_BIG(*) AS completed_sessions
            FROM dbo.workout_sessions
            WHERE member_id=@memberId AND status='completed'
            GROUP BY program_id;
            SELECT plan_id, COUNT_BIG(*) AS logged_meals
            FROM (
                SELECT dp.id AS plan_id
                FROM dbo.meal_logs AS log
                INNER JOIN dbo.diet_meal_items AS item ON item.id=log.meal_item_id
                INNER JOIN dbo.diet_meals AS meal ON meal.id=item.meal_id
                INNER JOIN dbo.diet_plans AS dp ON dp.id=meal.diet_plan_id
                WHERE log.member_id=@memberId
            ) AS plan_logs
            GROUP BY plan_id;
        `);
    const recordsets = result.recordsets || [];
    const totals = recordsets[0]?.[0] || {};
    const completedByProgram = new Map((recordsets[1] || []).map((row) => [
        row.program_id == null ? null : Number(row.program_id),
        Number(row.completed_sessions || 0)
    ]));
    const loggedByPlan = new Map((recordsets[2] || []).map((row) => [
        row.plan_id == null ? null : Number(row.plan_id),
        Number(row.logged_meals || 0)
    ]));
    return {
        sessionCount: Number(totals.session_count || 0),
        completedSessions: Number(totals.completed_session_count || 0),
        trainingVolumeKg: Number(totals.training_volume_kg || 0),
        loggedSetCount: Number(totals.logged_set_count || 0),
        loggedRepCount: Number(totals.logged_rep_count || 0),
        mealLogCount: Number(totals.meal_log_count || 0),
        nutritionLoggedDays: Number(totals.nutrition_logged_days || 0),
        nutritionCaloriesTotal: Number(totals.nutrition_calories_total || 0),
        nutritionProteinTotal: Number(totals.nutrition_protein_total || 0),
        nutritionCarbsTotal: Number(totals.nutrition_carbs_total || 0),
        nutritionFatsTotal: Number(totals.nutrition_fats_total || 0),
        checkinCount: Number(totals.checkin_count || 0),
        completedByProgram,
        loggedByPlan
    };
}

async function getTrainingSummary(memberId) {
    await ensureCoachingTables({ seedLibrary: false });
    const id = ensureId(memberId, 'معرّف العميل');
    const pool = await getPool();
    const result = await pool.request()
        .input('memberId', sql.Int, id)
        .batch(`
            SELECT p.id, p.name, p.status,
                   (SELECT COUNT_BIG(*) FROM dbo.workout_exercises e
                    INNER JOIN dbo.workout_routines r ON r.id = e.routine_id
                    WHERE r.program_id = p.id) AS exercise_count
            FROM dbo.workout_programs AS p
            WHERE p.member_id = @memberId AND p.status <> 'archived'
            ORDER BY p.updated_at DESC, p.id DESC;

            SELECT p.id, p.name, p.status,
                   (SELECT COUNT_BIG(*) FROM dbo.diet_meal_items i
                    INNER JOIN dbo.diet_meals m ON m.id = i.meal_id
                    WHERE m.diet_plan_id = p.id) AS item_count
            FROM dbo.diet_plans AS p
            WHERE p.member_id = @memberId AND p.status <> 'archived'
            ORDER BY p.updated_at DESC, p.id DESC;

            SELECT
                (SELECT COUNT_BIG(*) FROM dbo.body_measurements WHERE member_id = @memberId) AS measurement_count,
                (SELECT COUNT_BIG(*) FROM dbo.workout_sessions WHERE member_id = @memberId AND status = 'completed') AS completed_sessions,
                (SELECT COUNT_BIG(*) FROM dbo.meal_logs WHERE member_id = @memberId) AS meal_log_count;
        `);
    const [workoutRows = [], dietRows = [], countRows = []] = result.recordsets || [];
    const counts = countRows[0] || {};
    return {
        workoutPrograms: workoutRows.map((row) => ({
            id: Number(row.id),
            name: row.name,
            status: row.status,
            exerciseCount: Number(row.exercise_count || 0)
        })),
        dietPlans: dietRows.map((row) => ({
            id: Number(row.id),
            name: row.name,
            status: row.status,
            itemCount: Number(row.item_count || 0)
        })),
        measurementCount: Number(counts.measurement_count || 0),
        completedSessions: Number(counts.completed_sessions || 0),
        mealLogCount: Number(counts.meal_log_count || 0)
    };
}

async function getTrainingOverview(memberId) {
    const id = ensureId(memberId, 'معرّف العميل');
    await ensureReady();
    const [member, workoutProgramsBase, dietPlansBase, measurements, workoutSessions, mealLogs, checkins, executionSummary, activity] = await Promise.all([
        getClientBase(id),
        getWorkoutPrograms({ memberId: id }),
        getDietPlans({ memberId: id }),
        getMeasurements(id),
        getWorkoutSessions(id, { limit: 40 }),
        getMealLogs(id, { limit: 120 }),
        getCheckins(id, { limit: 30 }),
        getTrainingExecutionSummary(id),
        getCoachingActivity(id, { limit: 12 })
    ]);
    const workoutPrograms = workoutProgramsBase.map((program) => {
        const completedSessions = executionSummary.completedByProgram.get(program.id) || 0;
        return { ...program, completedSessions, progressPercent: executionProgress(program.startDate, program.endDate, program.daysPerWeek, completedSessions) };
    });
    const dietPlans = dietPlansBase.map((plan) => {
        const loggedMeals = executionSummary.loggedByPlan.get(plan.id) || 0;
        return { ...plan, loggedMeals, progressPercent: executionProgress(plan.startDate, plan.endDate, plan.mealsPerDay, loggedMeals) };
    });
    const orderedMeasurements = [...measurements].sort((a, b) => String(a.measuredAt).localeCompare(String(b.measuredAt)));
    const firstWeight = orderedMeasurements.find((item) => item.weightKg != null)?.weightKg ?? null;
    const currentWeight = measurements.find((item) => item.weightKg != null)?.weightKg ?? null;
    const average = (items) => items.length ? Math.round(items.reduce((sum, item) => sum + Number(item.progressPercent || 0), 0) / items.length) : 0;
    const activeDiet = dietPlans.find((plan) => plan.status === 'active') || dietPlans[0] || null;
    const nutritionDayCount = executionSummary.nutritionLoggedDays;
    return {
        member,
        workoutPrograms,
        dietPlans,
        measurements,
        checkins,
        activity,
        workoutSessions,
        mealLogs,
        progress: {
            firstWeight,
            currentWeight,
            weightChange: firstWeight != null && currentWeight != null ? Math.round((currentWeight - firstWeight) * 100) / 100 : null,
            sessionCount: executionSummary.sessionCount,
            completedSessions: executionSummary.completedSessions,
            trainingVolumeKg: Math.round(executionSummary.trainingVolumeKg * 100) / 100,
            loggedSetCount: executionSummary.loggedSetCount,
            loggedRepCount: executionSummary.loggedRepCount,
            mealLogCount: executionSummary.mealLogCount,
            nutritionLoggedDays: nutritionDayCount,
            nutritionCaloriesTotal: Math.round(executionSummary.nutritionCaloriesTotal * 10) / 10,
            nutritionProteinTotal: Math.round(executionSummary.nutritionProteinTotal * 10) / 10,
            nutritionCarbsTotal: Math.round(executionSummary.nutritionCarbsTotal * 10) / 10,
            nutritionFatsTotal: Math.round(executionSummary.nutritionFatsTotal * 10) / 10,
            nutritionAverageDailyCalories: nutritionDayCount ? Math.round((executionSummary.nutritionCaloriesTotal / nutritionDayCount) * 10) / 10 : 0,
            nutritionTargetCalories: activeDiet?.targetCalories == null ? null : Number(activeDiet.targetCalories),
            checkinCount: executionSummary.checkinCount,
            latestCheckin: checkins[0] || null,
            workoutCompletionPercent: average(workoutPrograms),
            nutritionCompletionPercent: average(dietPlans),
            lastMeasurementAt: measurements[0]?.measuredAt || null
        }
    };
}

function executionProgress(startDate, endDate, unitsPerWeek, completedUnits) {
    const todayValue = todayInTimeZone();
    const totalDays = endDate ? Math.max(1, differenceInDays(startDate, endDate) + 1) : 84;
    const elapsedDays = Math.min(totalDays, Math.max(1, differenceInDays(startDate, todayValue) + 1));
    const expectedUnits = Math.max(1, (elapsedDays / 7) * Math.max(1, Number(unitsPerWeek || 1)));
    return Math.max(0, Math.min(100, Math.round((Number(completedUnits || 0) / expectedUnits) * 100)));
}

async function getWorkoutSessions(memberId, options = {}) {
    await ensureCoachingTables();
    const id = ensureId(memberId, 'معرّف العميل');
    const limit = Math.min(200, Math.max(1, Number(options.limit) || 100));
    const pool = await getPool();
    const result = await pool.request()
        .input('memberId', sql.Int, id)
        .input('limit', sql.Int, limit)
        .query(`SELECT TOP (@limit) s.id, s.member_id, s.program_id, s.routine_id,
                       s.started_at, s.ended_at, s.status, s.notes,
                       p.name AS program_name, r.name AS routine_name,
                       (SELECT COUNT(1) FROM dbo.workout_set_logs AS l WHERE l.session_id = s.id) AS set_count,
                       (SELECT COALESCE(SUM(COALESCE(l.weight_kg, 0) * COALESCE(l.reps, 0)), 0) FROM dbo.workout_set_logs AS l WHERE l.session_id = s.id) AS volume_kg,
                       (SELECT COALESCE(SUM(COALESCE(l.reps, 0)), 0) FROM dbo.workout_set_logs AS l WHERE l.session_id = s.id) AS rep_count
                FROM dbo.workout_sessions AS s
                LEFT JOIN dbo.workout_programs AS p ON p.id = s.program_id
                LEFT JOIN dbo.workout_routines AS r ON r.id = s.routine_id
                WHERE s.member_id = @memberId
                ORDER BY s.started_at DESC, s.id DESC;`);
    return result.recordset.map((row) => ({
        id: Number(row.id), memberId: Number(row.member_id), programId: row.program_id == null ? null : Number(row.program_id), routineId: row.routine_id == null ? null : Number(row.routine_id),
        programName: row.program_name, routineName: row.routine_name, startedAt: row.started_at, endedAt: row.ended_at, status: row.status, notes: row.notes, setCount: Number(row.set_count || 0), volumeKg: Number(row.volume_kg || 0), repCount: Number(row.rep_count || 0)
    }));
}

async function getMealLogs(memberId, options = {}) {
    await ensureCoachingTables();
    const id = ensureId(memberId, 'معرّف العميل');
    const from = optionalDateValue(options.from, 'تاريخ البداية');
    const to = optionalDateValue(options.to, 'تاريخ النهاية');
    if (from && to && from > to) throw appError('تاريخ بداية سجل الوجبات يجب أن يكون قبل تاريخ النهاية.');
    const limit = Math.min(500, Math.max(1, Number(options.limit) || 500));
    const pool = await getPool();
    const result = await pool.request()
        .input('memberId', sql.Int, id)
        .input('limit', sql.Int, limit)
        .input('fromDate', sql.Date, from ? toUtcDate(from) : null)
        .input('toDate', sql.Date, to ? toUtcDate(to) : null)
        .query(`SELECT TOP (@limit) l.id, l.member_id, l.meal_item_id, l.consumed_quantity, l.consumed_at,
                       l.calc_calories, l.calc_protein, l.calc_carbs, l.calc_fats, l.notes,
                       dp.id AS plan_id, dp.name AS plan_name, dm.name AS meal_name,
                       i.assigned_quantity, i.serving_unit, f.name_ar AS food_name_ar, f.name_en AS food_name_en
                FROM dbo.meal_logs AS l
                LEFT JOIN dbo.diet_meal_items AS i ON i.id = l.meal_item_id
                LEFT JOIN dbo.diet_meals AS dm ON dm.id = i.meal_id
                LEFT JOIN dbo.diet_plans AS dp ON dp.id = dm.diet_plan_id
                LEFT JOIN dbo.gym_foods AS f ON f.id = i.food_id
                WHERE l.member_id = @memberId
                  AND (@fromDate IS NULL OR l.consumed_at >= @fromDate)
                  AND (@toDate IS NULL OR l.consumed_at < DATEADD(day, 1, @toDate))
                ORDER BY l.consumed_at DESC, l.id DESC;`);
    return result.recordset.map((row) => ({
        id: Number(row.id), memberId: Number(row.member_id), mealItemId: row.meal_item_id == null ? null : Number(row.meal_item_id), planId: row.plan_id == null ? null : Number(row.plan_id), planName: row.plan_name, mealName: row.meal_name,
        foodName: row.food_name_ar || row.food_name_en || 'طعام', consumedQuantity: Number(row.consumed_quantity || 0), assignedQuantity: row.assigned_quantity == null ? null : Number(row.assigned_quantity), servingUnit: row.serving_unit, consumedAt: row.consumed_at,
        calories: Number(row.calc_calories || 0), protein: Number(row.calc_protein || 0), carbs: Number(row.calc_carbs || 0), fats: Number(row.calc_fats || 0), notes: row.notes
    }));
}

async function startWorkoutSession(body = {}) {
    await ensureCoachingTables();
    const memberId = ensureId(body.memberId ?? body.clientId, 'معرّف العميل');
    const programId = body.programId ? ensureId(body.programId, 'معرّف البرنامج') : null;
    const routineId = body.routineId ? ensureId(body.routineId, 'معرّف اليوم') : null;
    const sessionId = await withTransaction(async (transaction) => {
        await assertMember(transaction, memberId);
        if (programId) {
            const result = await transaction.request().input('programId', sql.Int, programId).input('memberId', sql.Int, memberId).query('SELECT id FROM dbo.workout_programs WHERE id=@programId AND member_id=@memberId;');
            if (!result.recordset[0]) throw appError('البرنامج لا يتبع هذا العميل.');
        }
        if (routineId) {
            const result = await transaction.request().input('routineId', sql.Int, routineId).input('programId', sql.Int, programId).input('memberId', sql.Int, memberId).query(`SELECT r.id FROM dbo.workout_routines AS r INNER JOIN dbo.workout_programs AS p ON p.id = r.program_id WHERE r.id=@routineId AND p.member_id=@memberId AND (@programId IS NULL OR r.program_id=@programId);`);
            if (!result.recordset[0]) throw appError('اليوم التدريبي غير صالح.');
        }
        const activeSession = await transaction.request().input('memberId', sql.Int, memberId).query("SELECT TOP (1) id FROM dbo.workout_sessions WHERE member_id=@memberId AND status='started' ORDER BY started_at DESC, id DESC;");
        if (activeSession.recordset[0]) throw appError('يوجد جلسة تدريب مفتوحة لهذا العميل بالفعل.', 409, 'WORKOUT_SESSION_ALREADY_OPEN');
        const result = await transaction.request().input('memberId', sql.Int, memberId).input('programId', sql.Int, programId).input('routineId', sql.Int, routineId).input('notes', sql.NVarChar(1000), text(body.notes, 'ملاحظات الجلسة', 1000)).query('INSERT INTO dbo.workout_sessions (member_id, program_id, routine_id, notes) OUTPUT INSERTED.id VALUES (@memberId,@programId,@routineId,@notes);');
        return Number(result.recordset[0].id);
    });
    const session = await getWorkoutSession(sessionId);
    await recordCoachingEvent(memberId, 'workout_session_started', { entityType: 'workout_session', entityId: sessionId, details: 'تم بدء جلسة تدريب.' });
    return session;
}

async function getWorkoutSession(id) {
    await ensureCoachingTables();
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, ensureId(id, 'معرّف الجلسة')).query(`SELECT id, member_id, program_id, routine_id,
                       started_at, ended_at, status, notes
                FROM dbo.workout_sessions
                WHERE id=@id;`);
    const row = result.recordset[0];
    if (!row) throw appError('جلسة التمرين غير موجودة.', 404);
    const sets = await pool.request().input('sessionId', sql.Int, Number(row.id)).query(`SELECT id, workout_exercise_id,
                       set_number, weight_kg, reps, completed_at, notes
                FROM dbo.workout_set_logs
                WHERE session_id=@sessionId
                ORDER BY id;`);
    const mappedSets = sets.recordset.map((item) => ({ id: Number(item.id), workoutExerciseId: item.workout_exercise_id == null ? null : Number(item.workout_exercise_id), setNumber: Number(item.set_number), weightKg: item.weight_kg == null ? null : Number(item.weight_kg), reps: item.reps == null ? null : Number(item.reps), completedAt: item.completed_at, notes: item.notes }));
    return { id: Number(row.id), memberId: Number(row.member_id), programId: row.program_id == null ? null : Number(row.program_id), routineId: row.routine_id == null ? null : Number(row.routine_id), startedAt: row.started_at, endedAt: row.ended_at, status: row.status, notes: row.notes, volumeKg: mappedSets.reduce((sum, item) => sum + Number(item.weightKg || 0) * Number(item.reps || 0), 0), repCount: mappedSets.reduce((sum, item) => sum + Number(item.reps || 0), 0), sets: mappedSets };
}

async function addWorkoutSet(sessionId, body = {}) {
    await ensureCoachingTables();
    const id = ensureId(sessionId, 'معرّف الجلسة');
    const setNumber = numberValue(body.setNumber, 'رقم المجموعة', { min: 1, max: 100, integer: true });
    const workoutExerciseId = body.workoutExerciseId ? ensureId(body.workoutExerciseId, 'معرّف تمرين البرنامج') : null;
    const pool = await getPool();
    const session = await pool.request().input('id', sql.Int, id).query("SELECT id, status FROM dbo.workout_sessions WHERE id=@id;");
    if (!session.recordset[0]) throw appError('جلسة التمرين غير موجودة.', 404);
    if (session.recordset[0].status !== 'started') throw appError('جلسة التمرين مغلقة بالفعل.');
    if (workoutExerciseId) {
        const exercise = await pool.request().input('id', sql.Int, workoutExerciseId).input('sessionId', sql.Int, id).query(`SELECT we.id
            FROM dbo.workout_exercises AS we
            INNER JOIN dbo.workout_routines AS r ON r.id = we.routine_id
            INNER JOIN dbo.workout_programs AS p ON p.id = r.program_id
            INNER JOIN dbo.workout_sessions AS s ON s.id = @sessionId
            WHERE we.id=@id AND p.member_id=s.member_id
              AND (s.program_id IS NULL OR r.program_id=s.program_id)
              AND (s.routine_id IS NULL OR r.id=s.routine_id);`);
        if (!exercise.recordset[0]) throw appError('تمرين البرنامج غير موجود.');
        const duplicateSet = await pool.request().input('sessionId', sql.Int, id).input('workoutExerciseId', sql.Int, workoutExerciseId).input('setNumber', sql.Int, setNumber).query('SELECT TOP (1) id FROM dbo.workout_set_logs WHERE session_id=@sessionId AND workout_exercise_id=@workoutExerciseId AND set_number=@setNumber;');
        if (duplicateSet.recordset[0]) throw appError('تم تسجيل هذه المجموعة من قبل لهذا التمرين.', 409, 'WORKOUT_SET_ALREADY_LOGGED');
    }
    const result = await pool.request().input('sessionId', sql.Int, id).input('workoutExerciseId', sql.Int, workoutExerciseId).input('setNumber', sql.Int, setNumber).input('weightKg', sql.Decimal(10, 2), numberValue(body.weightKg, 'الوزن', { min: 0, max: 10000 })).input('reps', sql.Int, numberValue(body.reps, 'التكرارات', { min: 0, max: 1000, integer: true })).input('notes', sql.NVarChar(500), text(body.notes, 'ملاحظات المجموعة', 500)).query('INSERT INTO dbo.workout_set_logs (session_id, workout_exercise_id, set_number, weight_kg, reps, notes) OUTPUT INSERTED.id VALUES (@sessionId,@workoutExerciseId,@setNumber,@weightKg,@reps,@notes);');
    return { id: Number(result.recordset[0].id), sessionId: id };
}

async function endWorkoutSession(id, body = {}) {
    await ensureCoachingTables();
    const sessionId = ensureId(id, 'معرّف الجلسة');
    const status = body.status === 'cancelled' ? 'cancelled' : 'completed';
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, sessionId).input('status', sql.VarChar(20), status).input('notes', sql.NVarChar(1000), text(body.notes, 'ملاحظات الجلسة', 1000)).query("UPDATE dbo.workout_sessions SET ended_at=SYSUTCDATETIME(), status=@status, notes=COALESCE(@notes, notes) WHERE id=@id AND status='started';");
    if (!result.rowsAffected[0]) throw appError('الجلسة غير موجودة أو مغلقة بالفعل.', 404);
    const session = await getWorkoutSession(sessionId);
    await recordCoachingEvent(session.memberId, status === 'completed' ? 'workout_session_completed' : 'workout_session_cancelled', { entityType: 'workout_session', entityId: sessionId, details: status === 'completed' ? 'تم إنهاء جلسة التدريب.' : 'تم إلغاء جلسة التدريب.' });
    return session;
}

async function createMealLog(body = {}) {
    await ensureCoachingTables();
    const memberId = ensureId(body.memberId ?? body.clientId, 'معرّف العميل');
    const mealItemId = ensureId(body.mealItemId, 'معرّف عنصر الوجبة');
    const quantity = numberValue(body.consumedQuantity, 'الكمية المستهلكة', { min: 0.001, max: 100000 });
    const consumedAt = body.consumedAt ? new Date(body.consumedAt) : new Date();
    if (Number.isNaN(consumedAt.getTime())) throw appError('وقت تسجيل الوجبة غير صالح.');
    const pool = await getPool();
    const itemResult = await pool.request().input('itemId', sql.Int, mealItemId).input('memberId', sql.Int, memberId).query(`SELECT i.assigned_quantity, i.calc_calories, i.calc_protein, i.calc_carbs, i.calc_fats FROM dbo.diet_meal_items i INNER JOIN dbo.diet_meals dm ON dm.id=i.meal_id INNER JOIN dbo.diet_plans dp ON dp.id=dm.diet_plan_id WHERE i.id=@itemId AND dp.member_id=@memberId;`);
    const item = itemResult.recordset[0];
    if (!item) throw appError('عنصر الوجبة لا يتبع هذا العميل.', 403);
    const factor = quantity / Number(item.assigned_quantity || 1);
    const result = await pool.request().input('memberId', sql.Int, memberId).input('mealItemId', sql.Int, mealItemId).input('quantity', sql.Decimal(12, 3), quantity).input('consumedAt', sql.DateTime2(0), consumedAt).input('calories', sql.Decimal(12, 3), Number(item.calc_calories || 0) * factor).input('protein', sql.Decimal(12, 3), Number(item.calc_protein || 0) * factor).input('carbs', sql.Decimal(12, 3), Number(item.calc_carbs || 0) * factor).input('fats', sql.Decimal(12, 3), Number(item.calc_fats || 0) * factor).input('notes', sql.NVarChar(500), text(body.notes, 'ملاحظات الوجبة', 500)).query('INSERT INTO dbo.meal_logs (member_id, meal_item_id, consumed_quantity, consumed_at, calc_calories, calc_protein, calc_carbs, calc_fats, notes) OUTPUT INSERTED.id VALUES (@memberId,@mealItemId,@quantity,@consumedAt,@calories,@protein,@carbs,@fats,@notes);');
    const mealLogId = Number(result.recordset[0].id);
    await recordCoachingEvent(memberId, 'meal_logged', { entityType: 'meal_log', entityId: mealLogId, details: `تم تسجيل وجبة بكمية ${quantity}.` });
    return { id: mealLogId, memberId, mealItemId, consumedQuantity: quantity, consumedAt };
}

module.exports = {
    addWorkoutSet,
    createDietPlan,
    createExternalTrainee,
    createMealLog,
    createMeasurement,
    createCheckin,
    createWorkoutProgram,
    deleteDietPlan,
    deleteCheckin,
    deleteMeasurement,
    deleteWorkoutProgram,
    endWorkoutSession,
    ensureCoachingTables,
    getClientBase,
    getClientOptions,
    getBuilderCatalog,
    getDietPlan,
    getDietPlans,
    getExternalTrainees,
    getCheckins,
    getMealLogs,
    getMeasurements,
    getTrainingSummary,
    getTrainingOverview,
    getWorkoutProgram,
    getWorkoutPrograms,
    getWorkoutSession,
    getWorkoutSessions,
    startWorkoutSession,
    setDietPlanStatus,
    setWorkoutProgramStatus,
    updateDietPlan,
    updateClientBasic,
    updateCheckin,
    updateMeasurement,
    updateWorkoutProgram
};
