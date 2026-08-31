const fs = require('node:fs');
const path = require('node:path');
const { getPool, sql } = require('../database');
const { currentTenantId, getTenantContext } = require('../tenancy/tenant-context');

// The canonical catalog lives at the repository root (`data/library`). Keep
// this path independent from the service's source directory so the same
// files are resolved locally and inside the Vercel serverless bundle.
const DATA_DIRECTORY = path.join(__dirname, '..', '..', 'data', 'library');
const LIBRARY_TYPES = new Set(['muscles', 'foods', 'exercises']);
const EXERCISE_CATALOG_SOURCE_ID_OFFSET = 100000;
const CANONICAL_MUSCLE_COUNT = 297;
const CANONICAL_FOOD_COUNT = 367;
const CANONICAL_EXERCISE_COUNT = 873;
let libraryTablesPromise;
// Initialization is keyed by tenant so one gym cannot suppress provisioning
// for another gym on a warm Node/Vercel instance.
const librarySeedPromises = new Map();

function appError(message, statusCode = 400, code = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    if (code) error.code = code;
    return error;
}

function ensureType(value) {
    const type = String(value || '').trim().toLowerCase();
    if (!LIBRARY_TYPES.has(type)) throw appError('نوع المكتبة غير صالح.', 404, 'LIBRARY_TYPE_NOT_FOUND');
    return type;
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

function numberValue(value, field, { min = 0, max = 999999999 } = {}) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
        throw appError(`${field} غير صالح.`);
    }
    return Math.round(number * 1000) / 1000;
}

function optionalId(value, label) {
    if (value === undefined || value === null || value === '') return null;
    return ensureId(value, label);
}

function parseArray(value, field, { object = false, maxItems = 100 } = {}) {
    if (value === undefined || value === null || value === '') return [];
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch (_) {
            parsed = value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
        }
    }
    if (!Array.isArray(parsed)) throw appError(`${field} يجب أن يكون قائمة.`);
    if (parsed.length > maxItems) throw appError(`${field} يحتوي عناصر أكثر من المسموح.`);
    if (object) {
        return parsed.map((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) throw appError(`${field} غير صالح.`);
            return item;
        });
    }
    return parsed.map((item) => text(item, field, 500, true));
}

function parseSecondaryMuscles(value) {
    return parseArray(value, 'العضلات الثانوية', { object: true, maxItems: 30 }).map((item) => {
        const rawContribution = item.contributionPercent ?? item.contribution_percent;
        return {
            muscleId: ensureId(item.muscleId ?? item.muscle_id, 'معرّف العضلة الثانوية'),
            contributionPercent: rawContribution === undefined || rawContribution === null || rawContribution === ''
                ? null
                : numberValue(rawContribution, 'نسبة مساهمة العضلة', { min: 0, max: 100 }),
            role: item.role === 'primary' ? 'primary' : 'secondary'
        };
    });
}

function jsonValue(value, fallback = {}) {
    if (value === undefined || value === null || value === '') return JSON.stringify(fallback);
    if (typeof value === 'string') {
        try { return JSON.stringify(JSON.parse(value)); } catch (_) { return JSON.stringify(fallback); }
    }
    return JSON.stringify(value);
}

function parseStoredJson(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
}

function mapSecondaryMuscleDetails(value) {
    return parseStoredJson(value, []).map((detail) => {
        const rawMuscleId = detail.muscleId ?? detail.muscle_id;
        const rawSourceId = detail.sourceId ?? detail.source_id;
        const rawContribution = detail.contributionPercent ?? detail.contribution_percent;
        return {
            muscleId: rawMuscleId == null ? null : Number(rawMuscleId),
            id: detail.id == null ? null : Number(detail.id),
            sourceId: rawSourceId == null ? null : Number(rawSourceId),
            name: detail.name || null,
            nameAr: detail.nameAr ?? detail.name_ar ?? null,
            contributionPercent: rawContribution == null ? null : Number(rawContribution)
        };
    });
}

function isoDateTime(value) {
    return value instanceof Date ? value.toISOString() : value || null;
}

function mapMuscle(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        sourceId: row.source_id == null ? null : Number(row.source_id),
        name: row.name,
        nameAr: row.name_ar,
        bodyPart: row.body_part,
        description: row.description,
        descriptionAr: row.description_ar,
        icon: row.icon,
        createdAt: isoDateTime(row.created_at),
        updatedAt: isoDateTime(row.updated_at)
    };
}

function mapFood(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        sourceId: row.source_id == null ? null : Number(row.source_id),
        nameAr: row.name_ar,
        nameEn: row.name_en,
        category: row.category,
        calories: Number(row.calories || 0),
        protein: Number(row.protein || 0),
        carbs: Number(row.carbs || 0),
        fat: Number(row.fat || 0),
        fiber: Number(row.fiber || 0),
        sugar: Number(row.sugar || 0),
        sodium: Number(row.sodium || 0),
        servingSize: Number(row.serving_size || 0),
        servingUnit: row.serving_unit,
        createdAt: isoDateTime(row.created_at),
        updatedAt: isoDateTime(row.updated_at)
    };
}

function mapExercise(row) {
    if (!row) return null;
    const metadata = parseStoredJson(row.metadata_json, {});
    return {
        id: Number(row.id),
        sourceId: row.source_id == null ? null : Number(row.source_id),
        name: row.name,
        nameAr: row.name_ar,
        description: row.description,
        descriptionAr: row.description_ar,
        targetMuscleId: row.target_muscle_id == null ? null : Number(row.target_muscle_id),
        targetMuscleName: row.target_muscle_name || null,
        targetMuscleNameAr: row.target_muscle_name_ar || null,
        secondaryMuscles: parseStoredJson(row.secondary_muscles_json, []),
        secondaryMuscleDetails: mapSecondaryMuscleDetails(row.secondary_muscle_details_json),
        equipment: row.equipment,
        isHighImpact: Boolean(row.is_high_impact),
        difficulty: row.difficulty,
        category: row.category,
        movementPattern: row.movement_pattern,
        mechanic: row.mechanic,
        force: row.force,
        instructions: parseStoredJson(row.instructions_json, []),
        instructionsAr: parseStoredJson(row.instructions_ar_json, []),
        tips: parseStoredJson(row.tips_json, []),
        tipsAr: parseStoredJson(row.tips_ar_json, []),
        commonMistakes: parseStoredJson(row.common_mistakes_json, []),
        commonMistakesAr: parseStoredJson(row.common_mistakes_ar_json, []),
        repsRange: row.reps_range,
        setsRange: row.sets_range,
        restSeconds: row.rest_seconds == null ? null : Number(row.rest_seconds),
        tempo: row.tempo,
        icon: row.icon,
        videoUrl: row.video_url,
        upstreamId: metadata.upstreamId || null,
        slug: metadata.slug || null,
        catalogStatus: metadata.catalogStatus || null,
        catalogSourceId: metadata.sourceId == null ? null : Number(metadata.sourceId),
        sourceImagePaths: metadata.sourceImagePaths || [],
        imageAssets: metadata.imageAssets || null,
        imageAudit: metadata.imageAudit || null,
        metadata,
        createdAt: isoDateTime(row.created_at),
        updatedAt: isoDateTime(row.updated_at)
    };
}

function mapItem(type, row) {
    if (type === 'muscles') return mapMuscle(row);
    if (type === 'foods') return mapFood(row);
    return mapExercise(row);
}

async function ensureLibraryTables({ readOnly = false } = {}) {
    if (readOnly || getTenantContext()?.readOnlyBaseline) return;
    if (!libraryTablesPromise) {
        libraryTablesPromise = (async () => {
            const pool = await getPool();
            await pool.request().batch(`
                IF OBJECT_ID(N'dbo.gym_muscles', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_muscles (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_muscles PRIMARY KEY,
                        source_id INT NULL,
                        name NVARCHAR(120) NOT NULL,
                        name_ar NVARCHAR(120) NULL,
                        body_part NVARCHAR(80) NULL,
                        description NVARCHAR(1000) NULL,
                        description_ar NVARCHAR(1000) NULL,
                        icon NVARCHAR(20) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_muscles_created DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_muscles_updated DEFAULT (SYSUTCDATETIME())
                    );
                END;
                IF OBJECT_ID(N'dbo.gym_foods', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_foods (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_foods PRIMARY KEY,
                        source_id INT NULL,
                        name_ar NVARCHAR(160) NULL,
                        name_en NVARCHAR(160) NULL,
                        category NVARCHAR(80) NULL,
                        calories DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_calories DEFAULT (0),
                        protein DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_protein DEFAULT (0),
                        carbs DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_carbs DEFAULT (0),
                        fat DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_fat DEFAULT (0),
                        fiber DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_fiber DEFAULT (0),
                        sugar DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_sugar DEFAULT (0),
                        sodium DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_sodium DEFAULT (0),
                        serving_size DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_serving_size DEFAULT (100),
                        serving_unit NVARCHAR(40) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_foods_created DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_foods_updated DEFAULT (SYSUTCDATETIME())
                    );
                END;
                IF OBJECT_ID(N'dbo.gym_exercises', N'U') IS NULL
                BEGIN
                    CREATE TABLE dbo.gym_exercises (
                        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_exercises PRIMARY KEY,
                        source_id INT NULL,
                        name NVARCHAR(160) NOT NULL,
                        name_ar NVARCHAR(160) NULL,
                        description NVARCHAR(2000) NULL,
                        description_ar NVARCHAR(2000) NULL,
                        target_muscle_id INT NULL,
                        secondary_muscles_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_secondary DEFAULT (N'[]'),
                        equipment NVARCHAR(100) NULL,
                        is_high_impact BIT NOT NULL CONSTRAINT DF_gym_exercises_impact DEFAULT (0),
                        difficulty NVARCHAR(60) NULL,
                        category NVARCHAR(80) NULL,
                        movement_pattern NVARCHAR(80) NULL,
                        mechanic NVARCHAR(80) NULL,
                        force NVARCHAR(80) NULL,
                        instructions_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_instructions DEFAULT (N'[]'),
                        instructions_ar_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_instructions_ar DEFAULT (N'[]'),
                        tips_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_tips DEFAULT (N'[]'),
                        tips_ar_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_tips_ar DEFAULT (N'[]'),
                        common_mistakes_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_mistakes DEFAULT (N'[]'),
                        common_mistakes_ar_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_mistakes_ar DEFAULT (N'[]'),
                        reps_range NVARCHAR(40) NULL,
                        sets_range NVARCHAR(40) NULL,
                        rest_seconds INT NULL,
                        tempo NVARCHAR(40) NULL,
                        icon NVARCHAR(20) NULL,
                        video_url NVARCHAR(1000) NULL,
                        metadata_json NVARCHAR(MAX) NULL,
                        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_exercises_created DEFAULT (SYSUTCDATETIME()),
                        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_exercises_updated DEFAULT (SYSUTCDATETIME()),
                        CONSTRAINT FK_gym_exercises_target_muscle FOREIGN KEY (target_muscle_id)
                            REFERENCES dbo.gym_muscles(id) ON DELETE NO ACTION
                    );
                END;
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_muscles_body_part' AND object_id = OBJECT_ID(N'dbo.gym_muscles'))
                    CREATE INDEX IX_gym_muscles_body_part ON dbo.gym_muscles(body_part, name_ar, name);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_foods_category' AND object_id = OBJECT_ID(N'dbo.gym_foods'))
                    CREATE INDEX IX_gym_foods_category ON dbo.gym_foods(category, name_ar, name_en);
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_exercises_filters' AND object_id = OBJECT_ID(N'dbo.gym_exercises'))
                    CREATE INDEX IX_gym_exercises_filters ON dbo.gym_exercises(category, difficulty, equipment, target_muscle_id, name_ar);
            `);
        })().catch((error) => {
            libraryTablesPromise = undefined;
            throw error;
        });
    }
    return libraryTablesPromise;
}

function readSeedFile(type) {
    const filePath = path.join(DATA_DIRECTORY, `${type}.json`);
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!Array.isArray(parsed)) throw new Error('Seed file must contain an array.');
        return parsed;
    } catch (_) {
        throw appError(`تعذر قراءة بيانات ${type} من ملفات النظام`, 500, 'LIBRARY_SEED_READ_FAILED');
    }
}

function libraryCounts(row = {}) {
    return {
        muscles: Number(row.muscles || 0),
        foods: Number(row.foods || 0),
        exercises: Number(row.exercises || 0),
        canonicalMuscles: Number(row.canonicalMuscles || 0),
        canonicalFoods: Number(row.canonicalFoods || 0),
        canonicalExercises: Number(row.canonicalExercises || 0)
    };
}

async function getLibraryCounts(executor, tenantId) {
    const result = await executor.request()
        .input('tenantId', sql.Int, tenantId)
        .query(`
            SELECT
                (SELECT COUNT_BIG(*) FROM dbo.gym_muscles WHERE tenant_id=@tenantId) AS muscles,
                (SELECT COUNT_BIG(*) FROM dbo.gym_foods WHERE tenant_id=@tenantId) AS foods,
                (SELECT COUNT_BIG(*) FROM dbo.gym_exercises WHERE tenant_id=@tenantId) AS exercises,
                (SELECT COUNT_BIG(*) FROM dbo.gym_muscles WHERE tenant_id=@tenantId AND source_id BETWEEN 1 AND ${CANONICAL_MUSCLE_COUNT}) AS canonicalMuscles,
                (SELECT COUNT_BIG(*) FROM dbo.gym_foods WHERE tenant_id=@tenantId AND source_id BETWEEN 1 AND ${CANONICAL_FOOD_COUNT}) AS canonicalFoods,
                (SELECT COUNT_BIG(*) FROM dbo.gym_exercises
                 WHERE tenant_id=@tenantId
                   AND source_id >= ${EXERCISE_CATALOG_SOURCE_ID_OFFSET + 1}
                   AND source_id < ${EXERCISE_CATALOG_SOURCE_ID_OFFSET + CANONICAL_EXERCISE_COUNT + 1}
                   AND JSON_VALUE(metadata_json, '$.catalogStatus') = N'active') AS canonicalExercises;
        `);
    return libraryCounts(result.recordset[0]);
}

async function lockLibraryTenant(transaction, tenantId) {
    const result = await transaction.request()
        .input('tenantId', sql.Int, tenantId)
        .query(`
            SELECT TOP (1) id
            FROM dbo.gym_tenants WITH (UPDLOCK, HOLDLOCK)
            WHERE id=@tenantId;
        `);
    if (!result.recordset[0]) throw appError('الجيم المطلوب غير موجود لتجهيز المكتبة.', 404, 'LIBRARY_TENANT_NOT_FOUND');
}

async function withLibraryTenantTransaction(tenantId, work, existingTransaction = null) {
    if (existingTransaction) {
        await lockLibraryTenant(existingTransaction, tenantId);
        return work(existingTransaction);
    }
    const pool = await getPool();
    const transaction = pool.transaction();
    await transaction.begin();
    let committed = false;
    try {
        await lockLibraryTenant(transaction, tenantId);
        const result = await work(transaction);
        await transaction.commit();
        committed = true;
        return result;
    } catch (error) {
        if (!committed) await transaction.rollback().catch(() => {});
        throw error;
    }
}

async function ensureTenantLibraryRows(transaction, tenantId) {
    const counts = await getLibraryCounts(transaction, tenantId);
    const hasAnyData = counts.muscles || counts.foods || counts.exercises;
    const incomplete = counts.canonicalMuscles < CANONICAL_MUSCLE_COUNT
        || counts.canonicalFoods < CANONICAL_FOOD_COUNT
        || counts.canonicalExercises < CANONICAL_EXERCISE_COUNT;
    if (!hasAnyData) {
        await syncLibraryRows(transaction, tenantId);
        return { action: 'seeded', counts: await getLibraryCounts(transaction, tenantId) };
    }
    if (incomplete) {
        await syncLibraryRows(transaction, tenantId);
        return { action: 'repaired', counts: await getLibraryCounts(transaction, tenantId) };
    }
    return { action: 'ready', counts };
}

async function seedLibraryIfEmpty({ transaction = null, tenantId = currentTenantId({ required: true }) } = {}) {
    await ensureLibraryTables();
    return withLibraryTenantTransaction(tenantId, async (executor, resolvedTenantId = tenantId) => {
        const counts = await getLibraryCounts(executor, resolvedTenantId);
        if (counts.muscles || counts.foods || counts.exercises) return { action: 'ready', counts };
        const seeded = await syncLibraryRows(executor, resolvedTenantId);
        return { action: 'seeded', ...seeded, counts: await getLibraryCounts(executor, resolvedTenantId) };
    }, transaction);
}

async function ensureLibraryData({ transaction = null, readOnly = false } = {}) {
    const tenantId = currentTenantId({ required: true });
    // A read-only request may inspect the already-provisioned catalog, but it
    // must never create, repair, or synchronize tenant rows as a side effect
    // of reading a screen. Provisioning and explicit repair callers keep the
    // default write-capable path (readOnly=false).
    if (readOnly || getTenantContext()?.readOnlyBaseline) return { action: 'read-only' };
    await ensureLibraryTables();
    if (transaction) return withLibraryTenantTransaction(tenantId, (executor) => ensureTenantLibraryRows(executor, tenantId), transaction);

    const key = String(tenantId);
    if (!librarySeedPromises.has(key)) {
        const promise = withLibraryTenantTransaction(tenantId, (executor) => ensureTenantLibraryRows(executor, tenantId))
            .finally(() => librarySeedPromises.delete(key));
        librarySeedPromises.set(key, promise);
    }
    return librarySeedPromises.get(key);
}

async function prepareLibraryData({ readOnly = false } = {}) {
    // A baseline request must never seed or synchronize catalog rows. The
    // normal application path provisions data explicitly during onboarding or
    // through the repair command, not from a GET request.
    return readOnly ? ensureLibraryTables({ readOnly: true }) : ensureLibraryData();
}

// Synchronize the repository seed files with an existing database without
// recreating rows. Canonical records carry an explicit sourceId in the
// reserved catalog namespace; legacy source ids remain untouched so existing
// workout plans keep resolving to the same exercise rows.
async function syncLibraryRows(transaction, tenantId) {
    const muscles = readSeedFile('muscles');
    const foods = readSeedFile('foods');
    const exercises = readSeedFile('exercises');
    try {
        await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('musclesJson', sql.NVarChar(sql.MAX), JSON.stringify(muscles))
            .query(`
                DECLARE @seed_muscles TABLE (
                    source_id INT NOT NULL PRIMARY KEY,
                    name NVARCHAR(120) NOT NULL,
                    name_ar NVARCHAR(120) NULL,
                    body_part NVARCHAR(80) NULL,
                    description NVARCHAR(1000) NULL,
                    description_ar NVARCHAR(1000) NULL,
                    icon NVARCHAR(20) NULL
                );
                INSERT INTO @seed_muscles (source_id, name, name_ar, body_part, description, description_ar, icon)
                SELECT TRY_CONVERT(INT, item.[key]) + 1, data.name, data.nameAr, data.bodyPart,
                       data.description, data.descriptionAr, data.icon
                FROM OPENJSON(@musclesJson) AS item
                CROSS APPLY OPENJSON(item.[value]) WITH (
                    name NVARCHAR(120) '$.name', nameAr NVARCHAR(120) '$.nameAr',
                    bodyPart NVARCHAR(80) '$.bodyPart', description NVARCHAR(1000) '$.description',
                    descriptionAr NVARCHAR(1000) '$.descriptionAr', icon NVARCHAR(20) '$.icon'
                ) AS data
                WHERE TRY_CONVERT(INT, item.[key]) IS NOT NULL
                  AND NULLIF(LTRIM(RTRIM(data.name)), N'') IS NOT NULL;
                UPDATE target
                SET target.name = source.name, target.name_ar = source.name_ar,
                    target.body_part = source.body_part, target.description = source.description,
                    target.description_ar = source.description_ar, target.icon = source.icon,
                    target.updated_at = SYSUTCDATETIME()
                FROM dbo.gym_muscles AS target
                INNER JOIN @seed_muscles AS source
                    ON source.source_id = target.source_id AND target.tenant_id=@tenantId;
                INSERT INTO dbo.gym_muscles (tenant_id, source_id, name, name_ar, body_part, description, description_ar, icon)
                SELECT @tenantId, source.source_id, source.name, source.name_ar, source.body_part,
                       source.description, source.description_ar, source.icon
                FROM @seed_muscles AS source
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.gym_muscles target
                    WHERE target.tenant_id=@tenantId AND target.source_id = source.source_id
                );
            `);

        await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('foodsJson', sql.NVarChar(sql.MAX), JSON.stringify(foods))
            .query(`
                DECLARE @seed_foods TABLE (
                    source_id INT NOT NULL PRIMARY KEY,
                    name_ar NVARCHAR(160) NULL,
                    name_en NVARCHAR(160) NULL,
                    category NVARCHAR(80) NULL,
                    calories DECIMAL(12,3) NOT NULL,
                    protein DECIMAL(12,3) NOT NULL,
                    carbs DECIMAL(12,3) NOT NULL,
                    fat DECIMAL(12,3) NOT NULL,
                    fiber DECIMAL(12,3) NOT NULL,
                    sugar DECIMAL(12,3) NOT NULL,
                    sodium DECIMAL(12,3) NOT NULL,
                    serving_size DECIMAL(12,3) NOT NULL,
                    serving_unit NVARCHAR(40) NULL
                );
                INSERT INTO @seed_foods
                    (source_id, name_ar, name_en, category, calories, protein, carbs, fat, fiber, sugar, sodium, serving_size, serving_unit)
                SELECT TRY_CONVERT(INT, item.[key]) + 1, data.nameAr, data.nameEn, data.category,
                       COALESCE(data.calories, 0), COALESCE(data.protein, 0), COALESCE(data.carbs, 0),
                       COALESCE(data.fat, 0), COALESCE(data.fiber, 0), COALESCE(data.sugar, 0),
                       COALESCE(data.sodium, 0), COALESCE(data.servingSize, 100), data.servingUnit
                FROM OPENJSON(@foodsJson) AS item
                CROSS APPLY OPENJSON(item.[value]) WITH (
                    nameAr NVARCHAR(160) '$.nameAr', nameEn NVARCHAR(160) '$.nameEn',
                    category NVARCHAR(80) '$.category', calories DECIMAL(12,3) '$.calories',
                    protein DECIMAL(12,3) '$.protein', carbs DECIMAL(12,3) '$.carbs',
                    fat DECIMAL(12,3) '$.fat', fiber DECIMAL(12,3) '$.fiber',
                    sugar DECIMAL(12,3) '$.sugar', sodium DECIMAL(12,3) '$.sodium',
                    servingSize DECIMAL(12,3) '$.servingSize', servingUnit NVARCHAR(40) '$.servingUnit'
                ) AS data
                WHERE TRY_CONVERT(INT, item.[key]) IS NOT NULL;
                UPDATE target
                SET target.name_ar = source.name_ar, target.name_en = source.name_en,
                    target.category = source.category, target.calories = source.calories,
                    target.protein = source.protein, target.carbs = source.carbs, target.fat = source.fat,
                    target.fiber = source.fiber, target.sugar = source.sugar, target.sodium = source.sodium,
                    target.serving_size = source.serving_size, target.serving_unit = source.serving_unit,
                    target.updated_at = SYSUTCDATETIME()
                FROM dbo.gym_foods AS target
                INNER JOIN @seed_foods AS source
                    ON source.source_id = target.source_id AND target.tenant_id=@tenantId;
                INSERT INTO dbo.gym_foods
                    (tenant_id, source_id, name_ar, name_en, category, calories, protein, carbs, fat, fiber, sugar, sodium, serving_size, serving_unit)
                SELECT @tenantId, source.source_id, source.name_ar, source.name_en, source.category, source.calories,
                       source.protein, source.carbs, source.fat, source.fiber, source.sugar, source.sodium,
                       source.serving_size, source.serving_unit
                FROM @seed_foods AS source
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.gym_foods target
                    WHERE target.tenant_id=@tenantId AND target.source_id = source.source_id
                );
            `);

        await transaction.request()
            .input('tenantId', sql.Int, tenantId)
            .input('exercisesJson', sql.NVarChar(sql.MAX), JSON.stringify(exercises))
            .query(`
                DECLARE @seed_exercises TABLE (
                    source_id INT NOT NULL PRIMARY KEY,
                    name NVARCHAR(160) NOT NULL,
                    name_ar NVARCHAR(160) NULL,
                    description NVARCHAR(2000) NULL,
                    description_ar NVARCHAR(2000) NULL,
                    target_muscle_source_id INT NULL,
                    secondary_muscles_json NVARCHAR(MAX) NOT NULL,
                    equipment NVARCHAR(100) NULL,
                    is_high_impact BIT NOT NULL,
                    difficulty NVARCHAR(60) NULL,
                    category NVARCHAR(80) NULL,
                    movement_pattern NVARCHAR(80) NULL,
                    mechanic NVARCHAR(80) NULL,
                    force NVARCHAR(80) NULL,
                    instructions_json NVARCHAR(MAX) NOT NULL,
                    instructions_ar_json NVARCHAR(MAX) NOT NULL,
                    tips_json NVARCHAR(MAX) NOT NULL,
                    tips_ar_json NVARCHAR(MAX) NOT NULL,
                    common_mistakes_json NVARCHAR(MAX) NOT NULL,
                    common_mistakes_ar_json NVARCHAR(MAX) NOT NULL,
                    reps_range NVARCHAR(40) NULL,
                    sets_range NVARCHAR(40) NULL,
                    rest_seconds INT NULL,
                    tempo NVARCHAR(40) NULL,
                    icon NVARCHAR(20) NULL,
                    video_url NVARCHAR(1000) NULL,
                    metadata_json NVARCHAR(MAX) NULL
                );
                INSERT INTO @seed_exercises
                    (source_id, name, name_ar, description, description_ar, target_muscle_source_id,
                     secondary_muscles_json, equipment, is_high_impact, difficulty, category, movement_pattern,
                     mechanic, force, instructions_json, instructions_ar_json, tips_json, tips_ar_json,
                     common_mistakes_json, common_mistakes_ar_json, reps_range, sets_range, rest_seconds, tempo,
                     icon, video_url, metadata_json)
                SELECT COALESCE(data.sourceId, TRY_CONVERT(INT, item.[key]) + 1), data.name, data.nameAr, data.description, data.descriptionAr,
                       data.targetMuscleId,
                       CASE WHEN ISJSON(data.secondaryMuscles) = 1 THEN data.secondaryMuscles ELSE N'[]' END,
                       data.equipment, COALESCE(data.isHighImpact, 0), data.difficulty, data.category,
                       data.movementPattern, data.mechanic, data.force,
                       CASE WHEN ISJSON(data.instructions) = 1 THEN data.instructions ELSE N'[]' END,
                       CASE WHEN ISJSON(data.instructionsAr) = 1 THEN data.instructionsAr ELSE N'[]' END,
                       CASE WHEN ISJSON(data.tips) = 1 THEN data.tips ELSE N'[]' END,
                       CASE WHEN ISJSON(data.tipsAr) = 1 THEN data.tipsAr ELSE N'[]' END,
                       CASE WHEN ISJSON(data.commonMistakes) = 1 THEN data.commonMistakes ELSE N'[]' END,
                       CASE WHEN ISJSON(data.commonMistakesAr) = 1 THEN data.commonMistakesAr ELSE N'[]' END,
                       data.repsRange, data.setsRange, data.restSeconds, data.tempo, data.icon, data.videoUrl,
                       item.[value]
                FROM OPENJSON(@exercisesJson) AS item
                CROSS APPLY OPENJSON(item.[value]) WITH (
                    name NVARCHAR(160) '$.name', sourceId INT '$.sourceId', nameAr NVARCHAR(160) '$.nameAr',
                    description NVARCHAR(2000) '$.description', descriptionAr NVARCHAR(2000) '$.descriptionAr',
                    targetMuscleId INT '$.targetMuscleId', secondaryMuscles NVARCHAR(MAX) '$.secondaryMuscles' AS JSON,
                    equipment NVARCHAR(100) '$.equipment', isHighImpact BIT '$.isHighImpact', difficulty NVARCHAR(60) '$.difficulty',
                    category NVARCHAR(80) '$.category', movementPattern NVARCHAR(80) '$.movementPattern', mechanic NVARCHAR(80) '$.mechanic',
                    force NVARCHAR(80) '$.force', instructions NVARCHAR(MAX) '$.instructions' AS JSON,
                    instructionsAr NVARCHAR(MAX) '$.instructionsAr' AS JSON, tips NVARCHAR(MAX) '$.tips' AS JSON,
                    tipsAr NVARCHAR(MAX) '$.tipsAr' AS JSON, commonMistakes NVARCHAR(MAX) '$.commonMistakes' AS JSON,
                    commonMistakesAr NVARCHAR(MAX) '$.commonMistakesAr' AS JSON, repsRange NVARCHAR(40) '$.repsRange',
                    setsRange NVARCHAR(40) '$.setsRange', restSeconds INT '$.restSeconds', tempo NVARCHAR(40) '$.tempo',
                    icon NVARCHAR(20) '$.icon', videoUrl NVARCHAR(1000) '$.videoUrl'
                ) AS data
                WHERE TRY_CONVERT(INT, item.[key]) IS NOT NULL
                  AND NULLIF(LTRIM(RTRIM(data.name)), N'') IS NOT NULL;
                UPDATE target
                SET target.name = source.name, target.name_ar = source.name_ar,
                    target.description = source.description, target.description_ar = source.description_ar,
                    target.target_muscle_id = muscle.id, target.secondary_muscles_json = source.secondary_muscles_json,
                    target.equipment = source.equipment, target.is_high_impact = source.is_high_impact,
                    target.difficulty = source.difficulty, target.category = source.category,
                    target.movement_pattern = source.movement_pattern, target.mechanic = source.mechanic,
                    target.force = source.force, target.instructions_json = source.instructions_json,
                    target.instructions_ar_json = source.instructions_ar_json, target.tips_json = source.tips_json,
                    target.tips_ar_json = source.tips_ar_json, target.common_mistakes_json = source.common_mistakes_json,
                    target.common_mistakes_ar_json = source.common_mistakes_ar_json, target.reps_range = source.reps_range,
                    target.sets_range = source.sets_range, target.rest_seconds = source.rest_seconds,
                    target.tempo = source.tempo, target.icon = source.icon, target.video_url = source.video_url,
                    target.metadata_json = source.metadata_json, target.updated_at = SYSUTCDATETIME()
                FROM dbo.gym_exercises AS target
                INNER JOIN @seed_exercises AS source
                    ON source.source_id = target.source_id AND target.tenant_id=@tenantId
                LEFT JOIN dbo.gym_muscles AS muscle
                    ON muscle.tenant_id=@tenantId AND muscle.source_id = source.target_muscle_source_id;
                -- Keep every pre-catalog exercise row addressable for old
                -- workout plans, but remove it from the canonical list. The
                -- identity and source_id are never changed.
                UPDATE target
                SET target.metadata_json = JSON_MODIFY(
                        JSON_MODIFY(CASE WHEN ISJSON(target.metadata_json) = 1 THEN target.metadata_json ELSE N'{}' END,
                            '$.catalogStatus', N'legacy-compatibility'),
                        '$.legacySourceId', target.source_id),
                    target.updated_at = SYSUTCDATETIME()
                FROM dbo.gym_exercises AS target
                WHERE target.tenant_id=@tenantId
                  AND target.source_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM @seed_exercises AS source WHERE source.source_id = target.source_id);
                INSERT INTO dbo.gym_exercises
                    (tenant_id, source_id, name, name_ar, description, description_ar, target_muscle_id, secondary_muscles_json,
                     equipment, is_high_impact, difficulty, category, movement_pattern, mechanic, force,
                     instructions_json, instructions_ar_json, tips_json, tips_ar_json, common_mistakes_json,
                     common_mistakes_ar_json, reps_range, sets_range, rest_seconds, tempo, icon, video_url, metadata_json)
                SELECT @tenantId, source.source_id, source.name, source.name_ar, source.description, source.description_ar,
                       muscle.id, source.secondary_muscles_json, source.equipment, source.is_high_impact,
                       source.difficulty, source.category, source.movement_pattern, source.mechanic, source.force,
                       source.instructions_json, source.instructions_ar_json, source.tips_json, source.tips_ar_json,
                       source.common_mistakes_json, source.common_mistakes_ar_json, source.reps_range, source.sets_range,
                       source.rest_seconds, source.tempo, source.icon, source.video_url, source.metadata_json
                FROM @seed_exercises AS source
                LEFT JOIN dbo.gym_muscles AS muscle
                    ON muscle.tenant_id=@tenantId AND muscle.source_id = source.target_muscle_source_id
                WHERE NOT EXISTS (
                    SELECT 1 FROM dbo.gym_exercises target
                    WHERE target.tenant_id=@tenantId AND target.source_id = source.source_id
                );
            `);
    } catch (error) {
        throw error;
    }
    return { muscles: muscles.length, foods: foods.length, exercises: exercises.length };
}

async function syncLibraryData() {
    const tenantId = currentTenantId({ required: true });
    await ensureLibraryTables();
    return withLibraryTenantTransaction(tenantId, (transaction) => syncLibraryRows(transaction, tenantId));
}

function likeValue(value) {
    return `%${String(value || '').replace(/[\\%_\[]/g, (character) => `\\${character}`)}%`;
}

function pageValue(value, fallback, min, max) {
    const number = Number.parseInt(value, 10);
    if (!Number.isInteger(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

function listQuery(type, filters, { includeLegacy = false } = {}) {
    const search = likeValue(filters.search);
    const searchEmpty = !String(filters.search || '').trim();
    const params = [
        ['search', sql.NVarChar(240), search],
        ['searchEmpty', sql.Bit, searchEmpty],
        ['category', sql.NVarChar(80), String(filters.category || '')],
        ['bodyPart', sql.NVarChar(80), String(filters.bodyPart || '')],
        ['difficulty', sql.NVarChar(60), String(filters.difficulty || '')],
        ['equipment', sql.NVarChar(100), String(filters.equipment || '')],
        ['targetMuscleId', sql.Int, filters.targetMuscleId ? Number(filters.targetMuscleId) : null]
    ];
    if (type === 'muscles') {
        return {
            params,
            where: `(@searchEmpty = 1 OR name LIKE @search OR name_ar LIKE @search OR body_part LIKE @search)
                    AND (@bodyPart = N'' OR body_part = @bodyPart)`,
            select: `SELECT id, source_id, name, name_ar, body_part, description, description_ar, icon, created_at, updated_at
                     FROM dbo.gym_muscles`,
            order: 'ORDER BY COALESCE(name_ar, name), name, id'
        };
    }
    if (type === 'foods') {
        return {
            params,
            where: `(@searchEmpty = 1 OR name_ar LIKE @search OR name_en LIKE @search OR category LIKE @search)
                    AND (@category = N'' OR category = @category)`,
            select: `SELECT id, source_id, name_ar, name_en, category, calories, protein, carbs, fat, fiber, sugar, sodium,
                            serving_size, serving_unit, created_at, updated_at
                     FROM dbo.gym_foods`,
            order: 'ORDER BY COALESCE(name_ar, name_en), name_en, id'
        };
    }
    const canonicalFilter = includeLegacy
        ? ''
        : `AND (JSON_VALUE(e.metadata_json, '$.catalogStatus') IS NULL
                OR JSON_VALUE(e.metadata_json, '$.catalogStatus') <> N'legacy-compatibility')`;
    return {
        params,
        where: `(@searchEmpty = 1 OR e.name LIKE @search OR e.name_ar LIKE @search OR e.description LIKE @search OR e.description_ar LIKE @search)
                AND (@category = N'' OR e.category = @category)
                AND (@difficulty = N'' OR e.difficulty = @difficulty)
                AND (@equipment = N'' OR e.equipment = @equipment)
                AND (@targetMuscleId IS NULL OR e.target_muscle_id = @targetMuscleId)
                ${canonicalFilter}`,
        select: `SELECT e.id, e.source_id, e.name, e.name_ar, e.description, e.description_ar, e.target_muscle_id,
                        e.secondary_muscles_json, e.equipment, e.is_high_impact, e.difficulty, e.category,
                        e.movement_pattern, e.mechanic, e.force, e.instructions_json, e.instructions_ar_json,
                        e.tips_json, e.tips_ar_json, e.common_mistakes_json, e.common_mistakes_ar_json,
                        e.reps_range, e.sets_range, e.rest_seconds, e.tempo, e.icon, e.video_url,
                        e.metadata_json, e.created_at, e.updated_at,
                        m.name AS target_muscle_name, m.name_ar AS target_muscle_name_ar,
                        secondary_details.secondary_muscle_details_json
                 FROM dbo.gym_exercises AS e
                  LEFT JOIN dbo.gym_muscles AS m ON m.id = e.target_muscle_id AND m.tenant_id = e.tenant_id
                 OUTER APPLY (
                     SELECT (
                         SELECT TRY_CONVERT(INT, parsed.muscle_source_id) AS muscleId,
                                secondary_muscle.id AS id,
                                secondary_muscle.source_id AS sourceId,
                                secondary_muscle.name AS name,
                                secondary_muscle.name_ar AS nameAr,
                                TRY_CONVERT(DECIMAL(12, 3), parsed.contribution_percent) AS contributionPercent
                         FROM OPENJSON(CASE WHEN ISJSON(e.secondary_muscles_json) = 1 THEN e.secondary_muscles_json ELSE N'[]' END) AS secondary
                         CROSS APPLY (VALUES (
                             COALESCE(JSON_VALUE(secondary.[value], '$.muscleId'), JSON_VALUE(secondary.[value], '$.muscle_id')),
                             COALESCE(JSON_VALUE(secondary.[value], '$.contributionPercent'), JSON_VALUE(secondary.[value], '$.contribution_percent'))
                         )) AS parsed(muscle_source_id, contribution_percent)
                          LEFT JOIN dbo.gym_muscles AS secondary_muscle
                            ON secondary_muscle.tenant_id = e.tenant_id
                           AND secondary_muscle.source_id = TRY_CONVERT(INT, parsed.muscle_source_id)
                         WHERE TRY_CONVERT(INT, parsed.muscle_source_id) IS NOT NULL
                         FOR JSON PATH
                     ) AS secondary_muscle_details_json
                 ) AS secondary_details`,
        order: 'ORDER BY COALESCE(e.name_ar, e.name), e.name, e.id'
    };
}

function addParams(request, params) {
    for (const [name, type, value] of params) request.input(name, type, value);
    return request;
}

async function getLibraryCollection(typeValue, query = {}, { readOnly = false } = {}) {
    const type = ensureType(typeValue);
    await prepareLibraryData({ readOnly });
    const tenantId = currentTenantId({ required: true });
    const page = pageValue(query.page, 1, 1, 1000000);
    const pageSize = pageValue(query.pageSize, 12, 5, 100);
    const offset = (page - 1) * pageSize;
    const filters = { ...query, targetMuscleId: query.targetMuscleId ? ensureId(query.targetMuscleId, 'العضلة المستهدفة') : null };
    const specification = listQuery(type, filters);
    const pool = await getPool();
    const countRequest = addParams(pool.request(), specification.params)
        .input('tenantId', sql.Int, tenantId);
    const dataRequest = addParams(pool.request(), specification.params)
        .input('tenantId', sql.Int, tenantId)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, pageSize);
    /*
     * Keep the count query independent from the projection used by the data
     * query. The exercise projection contains LEFT JOIN/OUTER APPLY and a
     * nested FOR JSON expression for secondary-muscle names. Deriving a
     * COUNT(*) query by string-replacing that projection is fragile on SQL
     * Server and caused large-page requests to fail with a 500.
     */
    const countFrom = type === 'exercises'
        ? 'FROM dbo.gym_exercises AS e'
        : type === 'foods'
            ? 'FROM dbo.gym_foods'
            : 'FROM dbo.gym_muscles';
    const tenantWhere = type === 'exercises' ? 'e.tenant_id=@tenantId' : 'tenant_id=@tenantId';
    const [countResult, dataResult] = await Promise.all([
        countRequest.query(`SELECT COUNT_BIG(*) AS total ${countFrom} WHERE ${tenantWhere} AND (${specification.where});`),
        dataRequest.query(`${specification.select} WHERE ${tenantWhere} AND (${specification.where}) ${specification.order} OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`)
    ]);
    const total = Number(countResult.recordset[0]?.total || 0);
    return {
        items: dataResult.recordset.map((row) => mapItem(type, row)),
        pagination: { page, pageSize, totalItems: total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
    };
}

async function getLibraryOptions({ readOnly = false } = {}) {
    await prepareLibraryData({ readOnly });
    const tenantId = currentTenantId({ required: true });
    const pool = await getPool();
    const result = await pool.request()
        .input('tenantId', sql.Int, tenantId)
        .batch(`
        SELECT
            (SELECT COUNT_BIG(*) FROM dbo.gym_muscles WHERE tenant_id=@tenantId) AS muscles,
            (SELECT COUNT_BIG(*) FROM dbo.gym_foods WHERE tenant_id=@tenantId) AS foods,
            (SELECT COUNT_BIG(*) FROM dbo.gym_exercises AS e
             WHERE e.tenant_id=@tenantId
               AND (JSON_VALUE(e.metadata_json, '$.catalogStatus') IS NULL
                    OR JSON_VALUE(e.metadata_json, '$.catalogStatus') <> N'legacy-compatibility')) AS exercises;
        SELECT DISTINCT body_part AS value FROM dbo.gym_muscles WHERE tenant_id=@tenantId AND NULLIF(LTRIM(RTRIM(body_part)), N'') IS NOT NULL ORDER BY body_part;
        SELECT DISTINCT category AS value FROM dbo.gym_foods WHERE tenant_id=@tenantId AND NULLIF(LTRIM(RTRIM(category)), N'') IS NOT NULL ORDER BY category;
        SELECT DISTINCT e.category AS value FROM dbo.gym_exercises AS e
         WHERE e.tenant_id=@tenantId AND NULLIF(LTRIM(RTRIM(e.category)), N'') IS NOT NULL
           AND (JSON_VALUE(e.metadata_json, '$.catalogStatus') IS NULL OR JSON_VALUE(e.metadata_json, '$.catalogStatus') <> N'legacy-compatibility')
         ORDER BY e.category;
        SELECT DISTINCT e.difficulty AS value FROM dbo.gym_exercises AS e
         WHERE e.tenant_id=@tenantId AND NULLIF(LTRIM(RTRIM(e.difficulty)), N'') IS NOT NULL
           AND (JSON_VALUE(e.metadata_json, '$.catalogStatus') IS NULL OR JSON_VALUE(e.metadata_json, '$.catalogStatus') <> N'legacy-compatibility')
         ORDER BY e.difficulty;
        SELECT DISTINCT e.equipment AS value FROM dbo.gym_exercises AS e
         WHERE e.tenant_id=@tenantId AND NULLIF(LTRIM(RTRIM(e.equipment)), N'') IS NOT NULL
           AND (JSON_VALUE(e.metadata_json, '$.catalogStatus') IS NULL OR JSON_VALUE(e.metadata_json, '$.catalogStatus') <> N'legacy-compatibility')
         ORDER BY e.equipment;
        SELECT id, name, name_ar FROM dbo.gym_muscles WHERE tenant_id=@tenantId ORDER BY COALESCE(name_ar, name), name, id;
    `);
    const [counts = [], bodyParts = [], categories = [], exerciseCategories = [], difficulties = [], equipment = [], muscles = []] = result.recordsets || [];
    const countRow = counts[0] || {};
    return {
        counts: { muscles: Number(countRow.muscles || 0), foods: Number(countRow.foods || 0), exercises: Number(countRow.exercises || 0) },
        filters: {
            bodyParts: bodyParts.map((row) => row.value),
            categories: categories.map((row) => row.value),
            exerciseCategories: exerciseCategories.map((row) => row.value),
            difficulties: difficulties.map((row) => row.value),
            equipment: equipment.map((row) => row.value),
            muscles: muscles.map((row) => ({ id: Number(row.id), name: row.name, nameAr: row.name_ar }))
        }
    };
}

async function getLibraryItem(typeValue, idValue, { readOnly = false } = {}) {
    const type = ensureType(typeValue);
    const id = ensureId(idValue);
    await prepareLibraryData({ readOnly });
    const tenantId = currentTenantId({ required: true });
    const specification = listQuery(type, { search: '', category: '', bodyPart: '', difficulty: '', equipment: '', targetMuscleId: null }, { includeLegacy: true });
    const pool = await getPool();
    const request = addParams(pool.request(), specification.params)
        .input('tenantId', sql.Int, tenantId)
        .input('id', sql.Int, id);
    const tableAlias = type === 'exercises' ? 'e.id' : 'id';
    const tenantWhere = type === 'exercises' ? 'e.tenant_id=@tenantId' : 'tenant_id=@tenantId';
    const result = await request.query(`${specification.select} WHERE ${tenantWhere} AND ${tableAlias} = @id;`);
    if (!result.recordset[0]) throw appError('العنصر غير موجود.', 404, 'LIBRARY_ITEM_NOT_FOUND');
    return mapItem(type, result.recordset[0]);
}

async function ensureTargetMuscles(pool, ids) {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (!uniqueIds.length) return;
    const tenantId = currentTenantId({ required: true });
    const request = pool.request().input('tenantId', sql.Int, tenantId);
    const names = uniqueIds.map((id, index) => {
        const name = `muscle${index}`;
        request.input(name, sql.Int, id);
        return `@${name}`;
    });
    const result = await request.query(`SELECT id FROM dbo.gym_muscles WHERE tenant_id=@tenantId AND id IN (${names.join(',')});`);
    const existing = new Set(result.recordset.map((row) => Number(row.id)));
    if (uniqueIds.some((id) => !existing.has(id))) throw appError('يوجد معرّف عضلة غير موجود.', 400, 'MUSCLE_NOT_FOUND');
}

function normalizeMuscle(body = {}) {
    return {
        name: text(body.name, 'اسم العضلة', 120, true),
        nameAr: text(body.nameAr ?? body.name_ar, 'الاسم العربي', 120),
        bodyPart: text(body.bodyPart ?? body.body_part, 'منطقة الجسم', 80),
        description: text(body.description, 'الوصف', 1000),
        descriptionAr: text(body.descriptionAr ?? body.description_ar, 'الوصف العربي', 1000),
        icon: text(body.icon, 'الأيقونة', 20)
    };
}

function normalizeFood(body = {}) {
    return {
        nameAr: text(body.nameAr ?? body.name_ar, 'اسم الطعام بالعربية', 160),
        nameEn: text(body.nameEn ?? body.name_en, 'اسم الطعام بالإنجليزية', 160),
        category: text(body.category, 'التصنيف', 80),
        calories: numberValue(body.calories ?? 0, 'السعرات'),
        protein: numberValue(body.protein ?? 0, 'البروتين'),
        carbs: numberValue(body.carbs ?? 0, 'الكربوهيدرات'),
        fat: numberValue(body.fat ?? 0, 'الدهون'),
        fiber: numberValue(body.fiber ?? 0, 'الألياف'),
        sugar: numberValue(body.sugar ?? 0, 'السكريات'),
        sodium: numberValue(body.sodium ?? 0, 'الصوديوم'),
        servingSize: numberValue(body.servingSize ?? body.serving_size ?? 100, 'حجم الحصة', { min: 0.001 }),
        servingUnit: text(body.servingUnit ?? body.serving_unit, 'وحدة الحصة', 40)
    };
}

function normalizeExercise(body = {}) {
    const instructions = parseArray(body.instructions, 'التعليمات');
    const instructionsAr = parseArray(body.instructionsAr ?? body.instructions_ar, 'التعليمات العربية');
    const tips = parseArray(body.tips, 'النصائح');
    const tipsAr = parseArray(body.tipsAr ?? body.tips_ar, 'النصائح العربية');
    const commonMistakes = parseArray(body.commonMistakes ?? body.common_mistakes, 'الأخطاء الشائعة');
    const commonMistakesAr = parseArray(body.commonMistakesAr ?? body.common_mistakes_ar, 'الأخطاء الشائعة العربية');
    const secondaryMuscles = parseSecondaryMuscles(body.secondaryMuscles ?? body.secondary_muscles);
    const targetMuscleId = optionalId(body.targetMuscleId ?? body.target_muscle_id, 'العضلة المستهدفة');
    const restSeconds = body.restSeconds === undefined || body.restSeconds === '' || body.restSeconds === null
        ? null
        : Math.round(numberValue(body.restSeconds, 'وقت الراحة', { min: 0, max: 3600 }));
    const isHighImpact = body.isHighImpact === true || ['true', '1', 'yes'].includes(String(body.isHighImpact).toLowerCase());
    const name = text(body.name, 'اسم التمرين', 160, true);
    return {
        name,
        nameAr: text(body.nameAr ?? body.name_ar, 'الاسم العربي', 160),
        description: text(body.description, 'الوصف', 2000),
        descriptionAr: text(body.descriptionAr ?? body.description_ar, 'الوصف العربي', 2000),
        targetMuscleId,
        secondaryMuscles,
        equipment: text(body.equipment, 'الأداة', 100),
        isHighImpact,
        difficulty: text(body.difficulty, 'المستوى', 60),
        category: text(body.category, 'التصنيف', 80),
        movementPattern: text(body.movementPattern ?? body.movement_pattern, 'نمط الحركة', 80),
        mechanic: text(body.mechanic, 'الميكانيكية', 80),
        force: text(body.force, 'القوة', 80),
        instructions,
        instructionsAr,
        tips,
        tipsAr,
        commonMistakes,
        commonMistakesAr,
        repsRange: text(body.repsRange ?? body.reps_range, 'مدى التكرارات', 40),
        setsRange: text(body.setsRange ?? body.sets_range, 'مدى المجموعات', 40),
        restSeconds,
        tempo: text(body.tempo, 'الإيقاع', 40),
        icon: text(body.icon, 'الأيقونة', 20),
        videoUrl: text(body.videoUrl ?? body.video_url, 'رابط الفيديو', 1000),
        metadataJson: body.metadata === undefined ? null : jsonValue(body.metadata, {})
    };
}

function handleDuplicate(error) {
    if (error && (error.number === 2601 || error.number === 2627)) {
        throw appError('يوجد عنصر بنفس المصدر أو المعرّف بالفعل.', 409, 'LIBRARY_DUPLICATE');
    }
    throw error;
}

async function createLibraryItem(typeValue, body = {}) {
    const type = ensureType(typeValue);
    const tenantId = currentTenantId({ required: true });
    await ensureLibraryData();
    const pool = await getPool();
    try {
        if (type === 'muscles') {
            const item = normalizeMuscle(body);
            const result = await pool.request()
                .input('tenantId', sql.Int, tenantId)
                .input('name', sql.NVarChar(120), item.name)
                .input('nameAr', sql.NVarChar(120), item.nameAr)
                .input('bodyPart', sql.NVarChar(80), item.bodyPart)
                .input('description', sql.NVarChar(1000), item.description)
                .input('descriptionAr', sql.NVarChar(1000), item.descriptionAr)
                .input('icon', sql.NVarChar(20), item.icon)
                .query(`INSERT INTO dbo.gym_muscles (tenant_id, name, name_ar, body_part, description, description_ar, icon)
                        OUTPUT INSERTED.* VALUES (@tenantId, @name, @nameAr, @bodyPart, @description, @descriptionAr, @icon);`);
            return mapMuscle(result.recordset[0]);
        }
        if (type === 'foods') {
            const item = normalizeFood(body);
            if (!item.nameAr && !item.nameEn) throw appError('أدخل اسم الطعام بالعربية أو الإنجليزية.');
            const result = await pool.request()
                .input('tenantId', sql.Int, tenantId)
                .input('nameAr', sql.NVarChar(160), item.nameAr)
                .input('nameEn', sql.NVarChar(160), item.nameEn)
                .input('category', sql.NVarChar(80), item.category)
                .input('calories', sql.Decimal(12, 3), item.calories)
                .input('protein', sql.Decimal(12, 3), item.protein)
                .input('carbs', sql.Decimal(12, 3), item.carbs)
                .input('fat', sql.Decimal(12, 3), item.fat)
                .input('fiber', sql.Decimal(12, 3), item.fiber)
                .input('sugar', sql.Decimal(12, 3), item.sugar)
                .input('sodium', sql.Decimal(12, 3), item.sodium)
                .input('servingSize', sql.Decimal(12, 3), item.servingSize)
                .input('servingUnit', sql.NVarChar(40), item.servingUnit)
                .query(`INSERT INTO dbo.gym_foods
                            (tenant_id, name_ar, name_en, category, calories, protein, carbs, fat, fiber, sugar, sodium, serving_size, serving_unit)
                        OUTPUT INSERTED.*
                        VALUES (@tenantId, @nameAr, @nameEn, @category, @calories, @protein, @carbs, @fat, @fiber, @sugar, @sodium, @servingSize, @servingUnit);`);
            return mapFood(result.recordset[0]);
        }
        const item = normalizeExercise(body);
        await ensureTargetMuscles(pool, [item.targetMuscleId, ...item.secondaryMuscles.map((muscle) => muscle.muscleId)]);
            const result = await pool.request()
                .input('tenantId', sql.Int, tenantId)
                .input('name', sql.NVarChar(160), item.name)
            .input('nameAr', sql.NVarChar(160), item.nameAr)
            .input('description', sql.NVarChar(2000), item.description)
            .input('descriptionAr', sql.NVarChar(2000), item.descriptionAr)
            .input('targetMuscleId', sql.Int, item.targetMuscleId)
            .input('secondaryMuscles', sql.NVarChar(sql.MAX), JSON.stringify(item.secondaryMuscles))
            .input('equipment', sql.NVarChar(100), item.equipment)
            .input('isHighImpact', sql.Bit, item.isHighImpact)
            .input('difficulty', sql.NVarChar(60), item.difficulty)
            .input('category', sql.NVarChar(80), item.category)
            .input('movementPattern', sql.NVarChar(80), item.movementPattern)
            .input('mechanic', sql.NVarChar(80), item.mechanic)
            .input('force', sql.NVarChar(80), item.force)
            .input('instructions', sql.NVarChar(sql.MAX), JSON.stringify(item.instructions))
            .input('instructionsAr', sql.NVarChar(sql.MAX), JSON.stringify(item.instructionsAr))
            .input('tips', sql.NVarChar(sql.MAX), JSON.stringify(item.tips))
            .input('tipsAr', sql.NVarChar(sql.MAX), JSON.stringify(item.tipsAr))
            .input('commonMistakes', sql.NVarChar(sql.MAX), JSON.stringify(item.commonMistakes))
            .input('commonMistakesAr', sql.NVarChar(sql.MAX), JSON.stringify(item.commonMistakesAr))
            .input('repsRange', sql.NVarChar(40), item.repsRange)
            .input('setsRange', sql.NVarChar(40), item.setsRange)
            .input('restSeconds', sql.Int, item.restSeconds)
            .input('tempo', sql.NVarChar(40), item.tempo)
            .input('icon', sql.NVarChar(20), item.icon)
            .input('videoUrl', sql.NVarChar(1000), item.videoUrl)
            .input('metadata', sql.NVarChar(sql.MAX), item.metadataJson)
            .query(`INSERT INTO dbo.gym_exercises
                        (tenant_id, name, name_ar, description, description_ar, target_muscle_id, secondary_muscles_json,
                         equipment, is_high_impact, difficulty, category, movement_pattern, mechanic, force,
                         instructions_json, instructions_ar_json, tips_json, tips_ar_json, common_mistakes_json,
                         common_mistakes_ar_json, reps_range, sets_range, rest_seconds, tempo, icon, video_url, metadata_json)
                    OUTPUT INSERTED.*
                    VALUES (@tenantId, @name, @nameAr, @description, @descriptionAr, @targetMuscleId, @secondaryMuscles,
                            @equipment, @isHighImpact, @difficulty, @category, @movementPattern, @mechanic, @force,
                            @instructions, @instructionsAr, @tips, @tipsAr, @commonMistakes, @commonMistakesAr,
                            @repsRange, @setsRange, @restSeconds, @tempo, @icon, @videoUrl, @metadata);`);
        return getLibraryItem(type, result.recordset[0].id);
    } catch (error) {
        handleDuplicate(error);
    }
}

async function updateLibraryItem(typeValue, idValue, body = {}) {
    const type = ensureType(typeValue);
    const id = ensureId(idValue);
    const tenantId = currentTenantId({ required: true });
    await ensureLibraryData();
    const pool = await getPool();
    try {
        if (type === 'muscles') {
            const item = normalizeMuscle(body);
            const result = await pool.request()
                .input('id', sql.Int, id)
                .input('tenantId', sql.Int, tenantId)
                .input('name', sql.NVarChar(120), item.name)
                .input('nameAr', sql.NVarChar(120), item.nameAr)
                .input('bodyPart', sql.NVarChar(80), item.bodyPart)
                .input('description', sql.NVarChar(1000), item.description)
                .input('descriptionAr', sql.NVarChar(1000), item.descriptionAr)
                .input('icon', sql.NVarChar(20), item.icon)
                .query(`UPDATE dbo.gym_muscles
                        SET name = @name, name_ar = @nameAr, body_part = @bodyPart, description = @description,
                            description_ar = @descriptionAr, icon = @icon, updated_at = SYSUTCDATETIME()
                        OUTPUT INSERTED.* WHERE id = @id AND tenant_id = @tenantId;`);
            if (!result.recordset[0]) throw appError('العنصر غير موجود.', 404, 'LIBRARY_ITEM_NOT_FOUND');
            return mapMuscle(result.recordset[0]);
        }
        if (type === 'foods') {
            const item = normalizeFood(body);
            if (!item.nameAr && !item.nameEn) throw appError('أدخل اسم الطعام بالعربية أو الإنجليزية.');
            const result = await pool.request()
                .input('id', sql.Int, id)
                .input('tenantId', sql.Int, tenantId)
                .input('nameAr', sql.NVarChar(160), item.nameAr)
                .input('nameEn', sql.NVarChar(160), item.nameEn)
                .input('category', sql.NVarChar(80), item.category)
                .input('calories', sql.Decimal(12, 3), item.calories)
                .input('protein', sql.Decimal(12, 3), item.protein)
                .input('carbs', sql.Decimal(12, 3), item.carbs)
                .input('fat', sql.Decimal(12, 3), item.fat)
                .input('fiber', sql.Decimal(12, 3), item.fiber)
                .input('sugar', sql.Decimal(12, 3), item.sugar)
                .input('sodium', sql.Decimal(12, 3), item.sodium)
                .input('servingSize', sql.Decimal(12, 3), item.servingSize)
                .input('servingUnit', sql.NVarChar(40), item.servingUnit)
                .query(`UPDATE dbo.gym_foods
                        SET name_ar = @nameAr, name_en = @nameEn, category = @category, calories = @calories,
                            protein = @protein, carbs = @carbs, fat = @fat, fiber = @fiber, sugar = @sugar,
                            sodium = @sodium, serving_size = @servingSize, serving_unit = @servingUnit,
                            updated_at = SYSUTCDATETIME()
                        OUTPUT INSERTED.* WHERE id = @id AND tenant_id = @tenantId;`);
            if (!result.recordset[0]) throw appError('العنصر غير موجود.', 404, 'LIBRARY_ITEM_NOT_FOUND');
            return mapFood(result.recordset[0]);
        }
        const item = normalizeExercise(body);
        await ensureTargetMuscles(pool, [item.targetMuscleId, ...item.secondaryMuscles.map((muscle) => muscle.muscleId)]);
        const result = await pool.request()
            .input('id', sql.Int, id)
            .input('tenantId', sql.Int, tenantId)
            .input('name', sql.NVarChar(160), item.name)
            .input('nameAr', sql.NVarChar(160), item.nameAr)
            .input('description', sql.NVarChar(2000), item.description)
            .input('descriptionAr', sql.NVarChar(2000), item.descriptionAr)
            .input('targetMuscleId', sql.Int, item.targetMuscleId)
            .input('secondaryMuscles', sql.NVarChar(sql.MAX), JSON.stringify(item.secondaryMuscles))
            .input('equipment', sql.NVarChar(100), item.equipment)
            .input('isHighImpact', sql.Bit, item.isHighImpact)
            .input('difficulty', sql.NVarChar(60), item.difficulty)
            .input('category', sql.NVarChar(80), item.category)
            .input('movementPattern', sql.NVarChar(80), item.movementPattern)
            .input('mechanic', sql.NVarChar(80), item.mechanic)
            .input('force', sql.NVarChar(80), item.force)
            .input('instructions', sql.NVarChar(sql.MAX), JSON.stringify(item.instructions))
            .input('instructionsAr', sql.NVarChar(sql.MAX), JSON.stringify(item.instructionsAr))
            .input('tips', sql.NVarChar(sql.MAX), JSON.stringify(item.tips))
            .input('tipsAr', sql.NVarChar(sql.MAX), JSON.stringify(item.tipsAr))
            .input('commonMistakes', sql.NVarChar(sql.MAX), JSON.stringify(item.commonMistakes))
            .input('commonMistakesAr', sql.NVarChar(sql.MAX), JSON.stringify(item.commonMistakesAr))
            .input('repsRange', sql.NVarChar(40), item.repsRange)
            .input('setsRange', sql.NVarChar(40), item.setsRange)
            .input('restSeconds', sql.Int, item.restSeconds)
            .input('tempo', sql.NVarChar(40), item.tempo)
            .input('icon', sql.NVarChar(20), item.icon)
            .input('videoUrl', sql.NVarChar(1000), item.videoUrl)
            .input('metadata', sql.NVarChar(sql.MAX), item.metadataJson)
            .query(`UPDATE dbo.gym_exercises
                    SET name = @name, name_ar = @nameAr, description = @description, description_ar = @descriptionAr,
                        target_muscle_id = @targetMuscleId, secondary_muscles_json = @secondaryMuscles,
                        equipment = @equipment, is_high_impact = @isHighImpact, difficulty = @difficulty,
                        category = @category, movement_pattern = @movementPattern, mechanic = @mechanic, force = @force,
                        instructions_json = @instructions, instructions_ar_json = @instructionsAr, tips_json = @tips,
                        tips_ar_json = @tipsAr, common_mistakes_json = @commonMistakes,
                        common_mistakes_ar_json = @commonMistakesAr, reps_range = @repsRange, sets_range = @setsRange,
                        rest_seconds = @restSeconds, tempo = @tempo, icon = @icon, video_url = @videoUrl,
                        metadata_json = COALESCE(@metadata, metadata_json), updated_at = SYSUTCDATETIME()
                    OUTPUT INSERTED.id WHERE id = @id AND tenant_id = @tenantId;`);
        if (!result.recordset[0]) throw appError('العنصر غير موجود.', 404, 'LIBRARY_ITEM_NOT_FOUND');
        return getLibraryItem(type, id);
    } catch (error) {
        handleDuplicate(error);
    }
}

async function deleteLibraryItem(typeValue, idValue) {
    const type = ensureType(typeValue);
    const id = ensureId(idValue);
    const tenantId = currentTenantId({ required: true });
    await ensureLibraryData();
    const pool = await getPool();
    if (type === 'muscles') {
        const reference = await pool.request()
            .input('id', sql.Int, id)
            .input('tenantId', sql.Int, tenantId)
            .query(`
            SELECT TOP 1 e.id
            FROM dbo.gym_exercises AS e
            WHERE e.tenant_id=@tenantId
              AND e.target_muscle_id = @id
               OR EXISTS (
                    SELECT 1 FROM OPENJSON(e.secondary_muscles_json) AS secondary
                    WHERE e.tenant_id=@tenantId
                      AND TRY_CONVERT(INT, JSON_VALUE(secondary.[value], '$.muscleId')) = @id
               );
        `);
        if (reference.recordset[0]) throw appError('لا يمكن حذف العضلة لأنها مرتبطة بتمرين.', 409, 'LIBRARY_MUSCLE_IN_USE');
    }
    const table = type === 'muscles' ? 'gym_muscles' : type === 'foods' ? 'gym_foods' : 'gym_exercises';
    const result = await pool.request()
        .input('id', sql.Int, id)
        .input('tenantId', sql.Int, tenantId)
        .query(`DELETE FROM dbo.[${table}] WHERE id = @id AND tenant_id = @tenantId;`);
    if (!result.rowsAffected[0]) throw appError('العنصر غير موجود.', 404, 'LIBRARY_ITEM_NOT_FOUND');
}

module.exports = {
    createLibraryItem,
    deleteLibraryItem,
    ensureLibraryData,
    ensureLibraryTables,
    getLibraryCollection,
    getLibraryItem,
    getLibraryOptions,
    prepareLibraryData,
    syncLibraryData,
    updateLibraryItem
};
