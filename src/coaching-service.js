const { getPool, sql } = require('./db');
const { ensureLibraryData } = require('./library-service');
const {
    addDays,
    formatDateOnly,
    parseDateOnly,
    todayInTimeZone,
    toUtcDate
} = require('./date-utils');

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
        const transaction = new sql.Transaction(pool);
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

async function ensureCoachingTables() {
    if (!coachingTablesPromise) {
        coachingTablesPromise = (async () => {
            await ensureLibraryData();
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
                        CONSTRAINT CK_workout_exercises_rest_runtime CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 7200)
                    );
                END;
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
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_set_logs_session_runtime' AND object_id = OBJECT_ID(N'dbo.workout_set_logs'))
                    CREATE INDEX IX_workout_set_logs_session_runtime ON dbo.workout_set_logs(session_id, id);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_meal_logs_member_consumed_runtime' AND object_id = OBJECT_ID(N'dbo.meal_logs'))
                    CREATE INDEX IX_meal_logs_member_consumed_runtime ON dbo.meal_logs(member_id, consumed_at DESC, id DESC);
            `);
        })().catch((error) => {
            coachingTablesPromise = undefined;
            throw error;
        });
    }
    return coachingTablesPromise;
}

async function ensureReady() {
    await ensureLibraryData();
    await ensureCoachingTables();
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
            WITH candidates AS (
                SELECT
                    m.id, m.full_name, m.phone, m.email, m.registration_date, m.notes,
                    m.created_at, m.updated_at,
                    (SELECT COUNT(1) FROM dbo.workout_programs p WHERE p.member_id = m.id AND p.status <> 'archived') AS workout_count,
                    (SELECT COUNT(1) FROM dbo.diet_plans d WHERE d.member_id = m.id AND d.status <> 'archived') AS diet_count,
                    (SELECT COUNT(1) FROM dbo.body_measurements bm WHERE bm.member_id = m.id) AS measurement_count,
                    (SELECT MAX(activity_date) FROM (
                        SELECT p.updated_at AS activity_date FROM dbo.workout_programs p WHERE p.member_id = m.id
                        UNION ALL SELECT d.updated_at FROM dbo.diet_plans d WHERE d.member_id = m.id
                        UNION ALL SELECT bm.updated_at FROM dbo.body_measurements bm WHERE bm.member_id = m.id
                    ) activity) AS last_activity
                FROM dbo.members m
                WHERE (@search = N'' OR m.full_name LIKE @pattern OR m.phone LIKE @pattern OR ISNULL(m.email, N'') LIKE @pattern)
                  AND (EXISTS (SELECT 1 FROM dbo.workout_programs p WHERE p.member_id = m.id AND p.status <> 'archived')
                       OR EXISTS (SELECT 1 FROM dbo.diet_plans d WHERE d.member_id = m.id AND d.status <> 'archived'))
                  AND NOT EXISTS (
                      SELECT 1 FROM dbo.memberships membership
                      WHERE membership.member_id = m.id
                        AND DATEADD(day, ISNULL((SELECT SUM(CASE WHEN f.resumed_date IS NULL THEN DATEDIFF(day, f.start_date, f.end_date) + 1 WHEN f.resumed_date <= f.start_date THEN 0 WHEN f.resumed_date < f.end_date THEN DATEDIFF(day, f.start_date, f.resumed_date) ELSE DATEDIFF(day, f.start_date, f.end_date) + 1 END) FROM dbo.membership_freezes f WHERE f.membership_id = membership.id), 0), membership.end_date) >= @today
                  )
            )
            SELECT *, COUNT(1) OVER() AS total_count
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
    return {
        id: Number(row.id),
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        registrationDate: formatDateOnly(row.registration_date),
        notes: row.notes,
        workoutCount: Number(row.workout_count || 0),
        dietCount: Number(row.diet_count || 0),
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
            tempo: text(exercise.tempo, 'Tempo', 40),
            supersetGroupId: text(exercise.supersetGroupId, 'مجموعة السوبر سيت', 40),
            notes: text(exercise.notes, 'ملاحظات التمرين', 1000)
        }));
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
                .input('tempo', sql.NVarChar(40), exercise.tempo)
                .input('supersetGroupId', sql.NVarChar(40), exercise.supersetGroupId)
                .input('notes', sql.NVarChar(1000), exercise.notes)
                .query(`INSERT INTO dbo.workout_exercises
                            (routine_id, exercise_id, sort_order, sets, reps_min, reps_max, weight_kg,
                             rest_seconds, tempo, superset_group_id, notes)
                        VALUES (@routineId, @exerciseId, @sortOrder, @sets, @repsMin, @repsMax, @weightKg,
                                @restSeconds, @tempo, @supersetGroupId, @notes);`);
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
    return getWorkoutProgram(programId);
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
        pool.request().input('programId', sql.Int, programId).query(`SELECT we.id, we.routine_id, we.exercise_id, we.sort_order, we.sets, we.reps_min, we.reps_max, we.weight_kg, we.rest_seconds, we.tempo, we.superset_group_id, we.notes, e.name, e.name_ar, e.target_muscle_id, e.difficulty, e.equipment
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
    return getWorkoutProgram(updated);
}

async function deleteWorkoutProgram(id) {
    await ensureCoachingTables();
    const programId = ensureId(id, 'معرّف البرنامج');
    const pool = await getPool();
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
}

async function setWorkoutProgramStatus(id, status) {
    await ensureCoachingTables();
    const programId = ensureId(id, 'معرّف البرنامج');
    const normalized = statusValue(status);
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, programId).input('status', sql.VarChar(20), normalized).query('UPDATE dbo.workout_programs SET status=@status, version=version+1, updated_at=SYSUTCDATETIME() WHERE id=@id;');
    if (!result.rowsAffected[0]) throw appError('برنامج التدريب غير موجود.', 404);
    return getWorkoutProgram(programId);
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
        const result = await transaction.request().input('memberId', sql.Int, data.memberId).input('name', sql.NVarChar(160), data.name).input('description', sql.NVarChar(2000), data.description).input('startDate', sql.Date, toUtcDate(data.startDate)).input('endDate', sql.Date, data.endDate ? toUtcDate(data.endDate) : null).input('mealsPerDay', sql.Int, data.mealsPerDay).input('targetCalories', sql.Decimal(12, 2), data.targetCalories).input('targetProtein', sql.Decimal(12, 2), data.targetProtein).input('targetCarbs', sql.Decimal(12, 2), data.targetCarbs).input('targetFats', sql.Decimal(12, 2), data.targetFats).input('status', sql.VarChar(20), data.status).input('notes', sql.NVarChar(2000), data.notes).query(`INSERT INTO dbo.diet_plans (member_id, name, description, start_date, end_date, meals_per_day, target_calories, target_protein, target_carbs, target_fats, status, notes) OUTPUT INSERTED.id VALUES (@memberId, @name, @description, @startDate, @endDate, @mealsPerDay, @targetCalories, @targetProtein, @targetCarbs, @targetFats, @status, @notes);`);
        const id = Number(result.recordset[0].id);
        await insertDietStructure(transaction, id, data);
        return id;
    });
    return getDietPlan(planId);
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
    return { id: Number(base.id), memberId: Number(base.member_id), memberName: base.member_name, memberPhone: base.member_phone, name: base.name, description: base.description, startDate: formatDateOnly(base.start_date), endDate: formatDateOnly(base.end_date), mealsPerDay: base.meals_per_day == null ? null : Number(base.meals_per_day), targetCalories: base.target_calories == null ? null : Number(base.target_calories), targetProtein: base.target_protein == null ? null : Number(base.target_protein), targetCarbs: base.target_carbs == null ? null : Number(base.target_carbs), targetFats: base.target_fats == null ? null : Number(base.target_fats), status: base.status, notes: base.notes, version: Number(base.version || 1), createdAt: base.created_at, updatedAt: base.updated_at, meals, mealCount: meals.length, itemCount: meals.reduce((sum, meal) => sum + meal.items.length, 0), totals };
}

async function getDietPlans({ memberId, search = '', status = '' } = {}) {
    await ensureCoachingTables();
    const pool = await getPool();
    const normalizedSearch = String(search || '').trim().slice(0, 100);
    const normalizedStatus = status ? statusValue(status) : '';
    const request = pool.request().input('search', sql.NVarChar(100), normalizedSearch).input('pattern', sql.NVarChar(110), `%${normalizedSearch}%`).input('status', sql.VarChar(20), normalizedStatus);
    let memberFilter = '';
    if (memberId) { request.input('memberId', sql.Int, ensureId(memberId, 'معرّف العميل')); memberFilter = 'AND p.member_id=@memberId'; }
    const result = await request.query(`SELECT p.id,p.member_id,m.full_name AS member_name,m.phone AS member_phone,p.name,p.description,p.start_date,p.end_date,p.meals_per_day,p.target_calories,p.target_protein,p.target_carbs,p.target_fats,p.status,p.version,p.created_at,p.updated_at,
        (SELECT COUNT(1) FROM dbo.diet_meals dm WHERE dm.diet_plan_id=p.id) AS meal_count,
        (SELECT COUNT(1) FROM dbo.diet_meal_items di INNER JOIN dbo.diet_meals dm ON dm.id=di.meal_id WHERE dm.diet_plan_id=p.id) AS item_count
        FROM dbo.diet_plans p INNER JOIN dbo.members m ON m.id=p.member_id WHERE (@search=N'' OR p.name LIKE @pattern OR m.full_name LIKE @pattern OR m.phone LIKE @pattern) AND (@status='' OR p.status=@status) ${memberFilter} ORDER BY p.updated_at DESC,p.id DESC;`);
    return result.recordset.map((row) => ({ id: Number(row.id), memberId: Number(row.member_id), memberName: row.member_name, memberPhone: row.member_phone, name: row.name, description: row.description, startDate: formatDateOnly(row.start_date), endDate: formatDateOnly(row.end_date), mealsPerDay: row.meals_per_day == null ? null : Number(row.meals_per_day), targetCalories: row.target_calories == null ? null : Number(row.target_calories), targetProtein: row.target_protein == null ? null : Number(row.target_protein), targetCarbs: row.target_carbs == null ? null : Number(row.target_carbs), targetFats: row.target_fats == null ? null : Number(row.target_fats), status: row.status, version: Number(row.version || 1), createdAt: row.created_at, updatedAt: row.updated_at, mealCount: Number(row.meal_count || 0), itemCount: Number(row.item_count || 0) }));
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
        await transaction.request().input('id', sql.Int, planId).input('name', sql.NVarChar(160), data.name).input('description', sql.NVarChar(2000), data.description).input('startDate', sql.Date, toUtcDate(data.startDate)).input('endDate', sql.Date, data.endDate ? toUtcDate(data.endDate) : null).input('mealsPerDay', sql.Int, data.mealsPerDay).input('targetCalories', sql.Decimal(12, 2), data.targetCalories).input('targetProtein', sql.Decimal(12, 2), data.targetProtein).input('targetCarbs', sql.Decimal(12, 2), data.targetCarbs).input('targetFats', sql.Decimal(12, 2), data.targetFats).input('status', sql.VarChar(20), data.status).input('notes', sql.NVarChar(2000), data.notes).query(`UPDATE dbo.diet_plans SET name=@name,description=@description,start_date=@startDate,end_date=@endDate,meals_per_day=@mealsPerDay,target_calories=@targetCalories,target_protein=@targetProtein,target_carbs=@targetCarbs,target_fats=@targetFats,status=@status,notes=@notes,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@id;`);
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
    return getDietPlan(updated);
}

async function deleteDietPlan(id) {
    await ensureCoachingTables();
    const planId = ensureId(id, 'معرّف خطة التغذية');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, planId).query(`
        UPDATE logs SET meal_item_id = NULL
        FROM dbo.meal_logs logs
        INNER JOIN dbo.diet_meal_items items ON items.id = logs.meal_item_id
        INNER JOIN dbo.diet_meals meals ON meals.id = items.meal_id
        WHERE meals.diet_plan_id = @id;
        DELETE FROM dbo.diet_plans WHERE id=@id;
    `);
    if (!result.rowsAffected.some((count) => Number(count) > 0)) throw appError('خطة التغذية غير موجودة.', 404);
}

async function setDietPlanStatus(id, status) {
    await ensureCoachingTables();
    const planId = ensureId(id, 'معرّف خطة التغذية');
    const normalized = statusValue(status);
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, planId).input('status', sql.VarChar(20), normalized).query('UPDATE dbo.diet_plans SET status=@status,version=version+1,updated_at=SYSUTCDATETIME() WHERE id=@id;');
    if (!result.rowsAffected[0]) throw appError('خطة التغذية غير موجودة.', 404);
    return getDietPlan(planId);
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
    const result = await pool.request().input('memberId', sql.Int, ensureId(memberId, 'معرّف العميل')).query('SELECT * FROM dbo.body_measurements WHERE member_id=@memberId ORDER BY measured_at DESC,id DESC;');
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
    return rows.find((row) => row.id === measurementId) || null;
}

async function updateMeasurement(memberId, measurementId, body = {}) {
    await ensureCoachingTables();
    const clientId = ensureId(memberId, 'معرّف العميل');
    const id = ensureId(measurementId, 'معرّف القياس');
    const data = normalizeMeasurement(body);
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, id).input('memberId', sql.Int, clientId).input('measuredAt', sql.Date, toUtcDate(data.measuredAt)).input('weightKg', sql.Decimal(8, 2), data.weightKg).input('heightCm', sql.Decimal(8, 2), data.heightCm).input('bodyFatPercent', sql.Decimal(5, 2), data.bodyFatPercent).input('chestCm', sql.Decimal(8, 2), data.chestCm).input('waistCm', sql.Decimal(8, 2), data.waistCm).input('hipsCm', sql.Decimal(8, 2), data.hipsCm).input('armsCm', sql.Decimal(8, 2), data.armsCm).input('thighsCm', sql.Decimal(8, 2), data.thighsCm).input('notes', sql.NVarChar(1000), data.notes).query(`UPDATE dbo.body_measurements SET measured_at=@measuredAt,weight_kg=@weightKg,height_cm=@heightCm,body_fat_percent=@bodyFatPercent,chest_cm=@chestCm,waist_cm=@waistCm,hips_cm=@hipsCm,arms_cm=@armsCm,thighs_cm=@thighsCm,notes=@notes,updated_at=SYSUTCDATETIME() WHERE id=@id AND member_id=@memberId;`);
    if (!result.rowsAffected[0]) throw appError('القياس غير موجود.', 404);
    return (await getMeasurements(clientId)).find((row) => row.id === id) || null;
}

async function deleteMeasurement(memberId, measurementId) {
    await ensureCoachingTables();
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, ensureId(measurementId, 'معرّف القياس')).input('memberId', sql.Int, ensureId(memberId, 'معرّف العميل')).query('DELETE FROM dbo.body_measurements WHERE id=@id AND member_id=@memberId;');
    if (!result.rowsAffected[0]) throw appError('القياس غير موجود.', 404);
}

async function getTrainingOverview(memberId) {
    const id = ensureId(memberId, 'معرّف العميل');
    await ensureReady();
    const [member, workoutPrograms, dietPlans, measurements] = await Promise.all([
        getClientBase(id),
        getWorkoutPrograms({ memberId: id }),
        getDietPlans({ memberId: id }),
        getMeasurements(id)
    ]);
    const pool = await getPool();
    const activityResult = await pool.request().input('memberId', sql.Int, id).query(`SELECT (SELECT COUNT(1) FROM dbo.workout_sessions WHERE member_id=@memberId) AS session_count, (SELECT COUNT(1) FROM dbo.workout_sessions WHERE member_id=@memberId AND status='completed') AS completed_sessions, (SELECT COUNT(1) FROM dbo.meal_logs WHERE member_id=@memberId) AS meal_log_count;`);
    const activity = activityResult.recordset[0] || {};
    const orderedMeasurements = [...measurements].sort((a, b) => String(a.measuredAt).localeCompare(String(b.measuredAt)));
    const firstWeight = orderedMeasurements.find((item) => item.weightKg != null)?.weightKg ?? null;
    const currentWeight = measurements.find((item) => item.weightKg != null)?.weightKg ?? null;
    return {
        member,
        workoutPrograms,
        dietPlans,
        measurements,
        progress: {
            firstWeight,
            currentWeight,
            weightChange: firstWeight != null && currentWeight != null ? Math.round((currentWeight - firstWeight) * 100) / 100 : null,
            sessionCount: Number(activity.session_count || 0),
            completedSessions: Number(activity.completed_sessions || 0),
            mealLogCount: Number(activity.meal_log_count || 0),
            lastMeasurementAt: measurements[0]?.measuredAt || null
        }
    };
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
            const result = await transaction.request().input('routineId', sql.Int, routineId).input('programId', sql.Int, programId).query('SELECT id FROM dbo.workout_routines WHERE id=@routineId AND (@programId IS NULL OR program_id=@programId);');
            if (!result.recordset[0]) throw appError('اليوم التدريبي غير صالح.');
        }
        const result = await transaction.request().input('memberId', sql.Int, memberId).input('programId', sql.Int, programId).input('routineId', sql.Int, routineId).input('notes', sql.NVarChar(1000), text(body.notes, 'ملاحظات الجلسة', 1000)).query('INSERT INTO dbo.workout_sessions (member_id, program_id, routine_id, notes) OUTPUT INSERTED.id VALUES (@memberId,@programId,@routineId,@notes);');
        return Number(result.recordset[0].id);
    });
    return getWorkoutSession(sessionId);
}

async function getWorkoutSession(id) {
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, ensureId(id, 'معرّف الجلسة')).query('SELECT * FROM dbo.workout_sessions WHERE id=@id;');
    const row = result.recordset[0];
    if (!row) throw appError('جلسة التمرين غير موجودة.', 404);
    const sets = await pool.request().input('sessionId', sql.Int, Number(row.id)).query('SELECT * FROM dbo.workout_set_logs WHERE session_id=@sessionId ORDER BY id;');
    return { id: Number(row.id), memberId: Number(row.member_id), programId: row.program_id == null ? null : Number(row.program_id), routineId: row.routine_id == null ? null : Number(row.routine_id), startedAt: row.started_at, endedAt: row.ended_at, status: row.status, notes: row.notes, sets: sets.recordset.map((item) => ({ id: Number(item.id), workoutExerciseId: item.workout_exercise_id == null ? null : Number(item.workout_exercise_id), setNumber: Number(item.set_number), weightKg: item.weight_kg == null ? null : Number(item.weight_kg), reps: item.reps == null ? null : Number(item.reps), completedAt: item.completed_at, notes: item.notes })) };
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
        const exercise = await pool.request().input('id', sql.Int, workoutExerciseId).query('SELECT id FROM dbo.workout_exercises WHERE id=@id;');
        if (!exercise.recordset[0]) throw appError('تمرين البرنامج غير موجود.');
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
    return getWorkoutSession(sessionId);
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
    return { id: Number(result.recordset[0].id), memberId, mealItemId, consumedQuantity: quantity, consumedAt };
}

module.exports = {
    addWorkoutSet,
    createDietPlan,
    createExternalTrainee,
    createMealLog,
    createMeasurement,
    createWorkoutProgram,
    deleteDietPlan,
    deleteMeasurement,
    deleteWorkoutProgram,
    endWorkoutSession,
    ensureCoachingTables,
    getClientBase,
    getClientOptions,
    getDietPlan,
    getDietPlans,
    getExternalTrainees,
    getMeasurements,
    getTrainingOverview,
    getWorkoutProgram,
    getWorkoutPrograms,
    startWorkoutSession,
    setDietPlanStatus,
    setWorkoutProgramStatus,
    updateDietPlan,
    updateClientBasic,
    updateMeasurement,
    updateWorkoutProgram
};
