'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const EXPECTED_EXERCISE_COUNT = 873;

const DATA_FILES = {
    exercises: 'data/library/exercises.json',
    muscles: 'data/library/muscles.json',
    exerciseAssets: 'public/data/exercise-assets.json'
};

// These fields describe the content contract requested for an exercise detail view.
// Optional source fields are still measured, but do not fail the validation by themselves.
const REQUIRED_FIELDS = [
    { name: 'sourceId', kind: 'positiveInteger', label: 'Source ID' },
    { name: 'upstreamId', kind: 'text', label: 'Upstream ID' },
    { name: 'slug', kind: 'text', label: 'Slug' },
    { name: 'name', kind: 'text', label: 'English name' },
    { name: 'nameAr', kind: 'text', label: 'Arabic name' },
    { name: 'description', kind: 'text', label: 'English description' },
    { name: 'descriptionAr', kind: 'text', label: 'Arabic description' },
    { name: 'targetMuscleId', kind: 'positiveInteger', label: 'Target muscle ID' },
    { name: 'equipment', kind: 'text', label: 'Equipment' },
    { name: 'difficulty', kind: 'text', label: 'Difficulty' },
    { name: 'category', kind: 'text', label: 'Category' },
    { name: 'instructions', kind: 'nonEmptyStringArray', label: 'English instructions' },
    { name: 'instructionsAr', kind: 'nonEmptyStringArray', label: 'Arabic instructions' },
    { name: 'tips', kind: 'nonEmptyStringArray', label: 'English tips' },
    { name: 'tipsAr', kind: 'nonEmptyStringArray', label: 'Arabic tips' },
    { name: 'commonMistakes', kind: 'nonEmptyStringArray', label: 'English common mistakes' },
    { name: 'commonMistakesAr', kind: 'nonEmptyStringArray', label: 'Arabic common mistakes' }
];

const OPTIONAL_FIELDS = [
    { name: 'secondaryMuscles', kind: 'array', label: 'Secondary muscles' },
    { name: 'movementPattern', kind: 'text', label: 'Movement pattern' },
    { name: 'mechanic', kind: 'text', label: 'Mechanic' },
    { name: 'force', kind: 'text', label: 'Force' },
    { name: 'repsRange', kind: 'text', label: 'Repetition range' },
    { name: 'setsRange', kind: 'text', label: 'Set range' },
    { name: 'restSeconds', kind: 'number', label: 'Rest seconds' },
    { name: 'tempo', kind: 'text', label: 'Tempo' },
    { name: 'videoUrl', kind: 'text', label: 'Video URL' },
    { name: 'imageAssets', kind: 'object', label: 'Image assets' }
];

const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
const REQUIRED_FIELD_NAMES = new Set(REQUIRED_FIELDS.map((field) => field.name));

function readJson(relativePath) {
    const absolutePath = path.join(ROOT, relativePath);
    try {
        return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    } catch (error) {
        const wrapped = new Error(`Unable to read ${relativePath}: ${error.message}`);
        wrapped.code = 'DATA_READ_FAILED';
        throw wrapped;
    }
}

function isNonEmptyText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}

function isNonEmptyStringArray(value) {
    return Array.isArray(value)
        && value.length > 0
        && value.every((item) => isNonEmptyText(item));
}

function isComplete(value, kind) {
    if (kind === 'positiveInteger') return isPositiveInteger(value);
    if (kind === 'text') return isNonEmptyText(value);
    if (kind === 'nonEmptyStringArray') return isNonEmptyStringArray(value);
    if (kind === 'array') return Array.isArray(value);
    if (kind === 'number') return value == null || (typeof value === 'number' && Number.isFinite(value));
    if (kind === 'object') return value == null || (typeof value === 'object' && !Array.isArray(value));
    return value !== undefined;
}

function normalizeText(value) {
    return String(value)
        .normalize('NFKC')
        .toLocaleLowerCase('ar')
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/ـ/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

function looksLikePlaceholder(value) {
    const normalized = normalizeText(value);
    return !normalized
        || /^(?:n ?a|na|none|null|unknown|no data|not available|لا توجد? بيانات?|غير محدد(?:ة)?|العضلة \d+|muscle \d+)$/.test(normalized);
}

function recordLabel(record, index) {
    if (record && record.sourceId != null) return String(record.sourceId);
    if (record && isNonEmptyText(record.name)) return record.name.trim();
    return `index-${index}`;
}

function toMuscleKeys(muscle, index) {
    const keys = new Set();
    if (isPositiveInteger(muscle?.id)) keys.add(muscle.id);
    if (isPositiveInteger(muscle?.sourceId)) keys.add(muscle.sourceId);

    // muscles.json is a source seed without an explicit id column. The sync layer
    // assigns its source id from the 1-based seed position in that case.
    keys.add(index + 1);
    return [...keys];
}

function buildMuscleIndex(muscles) {
    const byId = new Map();
    const duplicateIds = new Map();

    muscles.forEach((muscle, index) => {
        for (const id of toMuscleKeys(muscle, index)) {
            const previous = byId.get(id);
            if (previous && previous.index !== index) {
                const group = duplicateIds.get(id) || new Set([previous.index]);
                group.add(index);
                duplicateIds.set(id, group);
            } else if (!previous) {
                byId.set(id, { index, name: muscle?.name ?? null, nameAr: muscle?.nameAr ?? null });
            }
        }
    });

    return {
        byId,
        duplicateIds: [...duplicateIds.entries()].map(([id, indexes]) => ({
            id,
            muscleIndexes: [...indexes]
        }))
    };
}

function normalizeMuscleName(value) {
    return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildMuscleNameIndex(muscles) {
    const byName = new Map();
    muscles.forEach((muscle, index) => {
        const name = normalizeMuscleName(muscle?.name);
        if (name) byName.set(name, index + 1);
    });
    byName.set('abdominals', byName.get('abs'));
    return byName;
}

function compareNumericSets(left, right) {
    const normalize = (values) => [...new Set(values.filter((value) => Number.isInteger(Number(value))).map(Number))].sort((a, b) => a - b);
    return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function indexValues(records, field) {
    const groups = new Map();
    records.forEach((record, index) => {
        const value = record?.[field];
        if (value == null || value === '') return;
        const key = String(value);
        const group = groups.get(key) || [];
        group.push({ sourceId: recordLabel(record, index), name: record?.name ?? null });
        groups.set(key, group);
    });
    return [...groups.entries()]
        .filter(([, entries]) => entries.length > 1)
        .map(([value, entries]) => ({ value, records: entries }));
}

function fieldCompleteness(records, field) {
    const missingSourceIds = [];
    let presentCount = 0;
    let completeCount = 0;

    records.forEach((record, index) => {
        const value = record?.[field.name];
        const present = value !== undefined && value !== null && value !== '';
        const complete = isComplete(value, field.kind);
        if (present) presentCount += 1;
        if (complete) completeCount += 1;
        else missingSourceIds.push(recordLabel(record, index));
    });

    return {
        label: field.label,
        required: REQUIRED_FIELD_NAMES.has(field.name),
        presentCount,
        completeCount,
        incompleteCount: records.length - completeCount,
        completionPercent: records.length ? Number(((completeCount / records.length) * 100).toFixed(2)) : 0,
        sampleIncompleteSourceIds: missingSourceIds.slice(0, 25)
    };
}

function collectRepeatedContent(records, fieldName) {
    const groups = new Map();

    records.forEach((record, recordIndex) => {
        const values = record?.[fieldName];
        if (!Array.isArray(values)) return;

        values.forEach((value, valueIndex) => {
            if (!isNonEmptyText(value) || looksLikePlaceholder(value)) return;
            const normalized = normalizeText(value);
            if (!normalized) return;
            const occurrences = groups.get(normalized) || [];
            occurrences.push({
                sourceId: recordLabel(record, recordIndex),
                name: record?.name ?? null,
                itemIndex: valueIndex,
                text: value.trim()
            });
            groups.set(normalized, occurrences);
        });
    });

    return [...groups.entries()]
        .filter(([, occurrences]) => occurrences.length > 1)
        .sort(([, first], [, second]) => second.length - first.length)
        .map(([normalized, occurrences]) => ({
            normalized,
            occurrenceCount: occurrences.length,
            exerciseCount: new Set(occurrences.map((item) => item.sourceId)).size,
            text: occurrences[0].text,
            occurrences
        }));
}

function collectPlaceholders(records, fields) {
    const findings = [];
    for (const field of fields) {
        records.forEach((record, recordIndex) => {
            const value = record?.[field];
            const values = Array.isArray(value) ? value : [value];
            values.forEach((item, itemIndex) => {
                if (!isNonEmptyText(item) || !looksLikePlaceholder(item)) return;
                findings.push({
                    field,
                    sourceId: recordLabel(record, recordIndex),
                    name: record?.name ?? null,
                    itemIndex,
                    value: item.trim()
                });
            });
        });
    }
    return findings;
}

function validate() {
    const exercises = readJson(DATA_FILES.exercises);
    const muscles = readJson(DATA_FILES.muscles);
    const exerciseAssets = readJson(DATA_FILES.exerciseAssets);
    const records = Array.isArray(exercises) ? exercises : [];
    const muscleRecords = Array.isArray(muscles) ? muscles : [];
    const assetRecords = Array.isArray(exerciseAssets?.records) ? exerciseAssets.records : [];
    const muscleIndex = buildMuscleIndex(muscleRecords);
    const muscleNameIndex = buildMuscleNameIndex(muscleRecords);
    const critical = [];
    const warnings = [];

    if (!Array.isArray(exercises)) {
        critical.push({ code: 'EXERCISE_DATA_NOT_ARRAY', message: `${DATA_FILES.exercises} must contain an array.` });
    }
    if (!Array.isArray(muscles)) {
        critical.push({ code: 'MUSCLE_DATA_NOT_ARRAY', message: `${DATA_FILES.muscles} must contain an array.` });
    }
    if (!Array.isArray(exerciseAssets?.records)) {
        critical.push({ code: 'EXERCISE_ASSET_DATA_NOT_ARRAY', message: `${DATA_FILES.exerciseAssets}.records must contain an array.` });
    }
    if (assetRecords.length !== EXPECTED_EXERCISE_COUNT) {
        critical.push({
            code: 'EXERCISE_ASSET_COUNT_MISMATCH',
            expected: EXPECTED_EXERCISE_COUNT,
            actual: assetRecords.length
        });
    }
    if (records.length !== EXPECTED_EXERCISE_COUNT) {
        critical.push({
            code: 'EXERCISE_COUNT_MISMATCH',
            expected: EXPECTED_EXERCISE_COUNT,
            actual: records.length
        });
    }

    const fieldReport = {};
    for (const field of ALL_FIELDS) fieldReport[field.name] = fieldCompleteness(records, field);

    const missingRequiredFields = Object.fromEntries(
        REQUIRED_FIELDS
            .map((field) => [field.name, fieldReport[field.name].incompleteCount])
            .filter(([, count]) => count > 0)
    );
    if (Object.keys(missingRequiredFields).length > 0) {
        critical.push({
            code: 'REQUIRED_CONTENT_INCOMPLETE',
            message: 'One or more required exercise content fields are incomplete.',
            incompleteByField: missingRequiredFields,
            sampleSourceIdsByField: Object.fromEntries(
                Object.entries(fieldReport)
                    .filter(([field]) => REQUIRED_FIELD_NAMES.has(field) && fieldReport[field].incompleteCount > 0)
                    .map(([field, report]) => [field, report.sampleIncompleteSourceIds])
            )
        });
    }

    for (const field of ['sourceId', 'upstreamId', 'slug']) {
        const duplicates = indexValues(records, field);
        if (duplicates.length > 0) {
            critical.push({
                code: 'DUPLICATE_EXERCISE_IDENTIFIER',
                field,
                groups: duplicates
            });
        }
    }

    const malformedRecords = [];
    records.forEach((record, index) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) {
            malformedRecords.push({ index, sourceId: recordLabel(record, index) });
        }
    });
    if (malformedRecords.length > 0) {
        critical.push({ code: 'MALFORMED_EXERCISE_RECORD', records: malformedRecords });
    }

    const unresolvableMuscleReferences = [];
    const invalidSecondaryMuscles = [];
    const duplicateSecondaryMuscles = [];
    const zeroContributionPercent = [];
    const sourceMuscleMismatches = [];

    records.forEach((record, index) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return;
        const sourceId = recordLabel(record, index);

        if (record.targetMuscleId != null) {
            if (!isPositiveInteger(record.targetMuscleId) || !muscleIndex.byId.has(record.targetMuscleId)) {
                unresolvableMuscleReferences.push({
                    type: 'target',
                    sourceId,
                    name: record.name ?? null,
                    muscleId: record.targetMuscleId
                });
            }
        }

        if (!Array.isArray(record.secondaryMuscles)) {
            if (record.secondaryMuscles !== undefined && record.secondaryMuscles !== null) {
                invalidSecondaryMuscles.push({
                    sourceId,
                    name: record.name ?? null,
                    reason: 'secondaryMuscles must be an array',
                    valueType: typeof record.secondaryMuscles
                });
            }
            return;
        }

        const seenSecondaryIds = new Set();
        record.secondaryMuscles.forEach((entry, entryIndex) => {
            const muscleId = entry && typeof entry === 'object' ? entry.muscleId : entry;
            if (!isPositiveInteger(muscleId) || !muscleIndex.byId.has(muscleId)) {
                unresolvableMuscleReferences.push({
                    type: 'secondary',
                    sourceId,
                    name: record.name ?? null,
                    muscleId,
                    itemIndex: entryIndex
                });
            }
            if (isPositiveInteger(muscleId)) {
                if (seenSecondaryIds.has(muscleId)) {
                    duplicateSecondaryMuscles.push({ sourceId, name: record.name ?? null, muscleId });
                }
                seenSecondaryIds.add(muscleId);
            }
            const contributionPercent = entry && typeof entry === 'object' ? entry.contributionPercent : undefined;
            if (contributionPercent != null && (!Number.isFinite(Number(contributionPercent)) || Number(contributionPercent) < 0 || Number(contributionPercent) > 100)) {
                invalidSecondaryMuscles.push({
                    sourceId,
                    name: record.name ?? null,
                    muscleId,
                    itemIndex: entryIndex,
                    reason: 'contributionPercent must be a number between 0 and 100',
                    contributionPercent
                });
            } else if (contributionPercent !== null
                && contributionPercent !== undefined
                && contributionPercent !== ''
                && Number(contributionPercent) === 0) {
                zeroContributionPercent.push({ sourceId, name: record.name ?? null, muscleId });
            }
        });
    });

    const recordsBySourceId = new Map(records.map((record) => [String(record?.sourceId), record]));
    assetRecords.forEach((asset) => {
        const record = recordsBySourceId.get(String(asset?.catalogSourceId));
        if (!record) {
            sourceMuscleMismatches.push({ sourceId: asset?.catalogSourceId, reason: 'exercise record missing' });
            return;
        }
        const expectedPrimary = muscleNameIndex.get(normalizeMuscleName(asset?.primaryMuscles?.[0]));
        const expectedSecondary = (Array.isArray(asset?.secondaryMuscles) ? asset.secondaryMuscles : [])
            .map((name) => muscleNameIndex.get(normalizeMuscleName(name)))
            .filter(Boolean);
        const actualSecondary = Array.isArray(record.secondaryMuscles)
            ? record.secondaryMuscles.map((entry) => entry && typeof entry === 'object' ? entry.muscleId : entry)
            : [];
        if (expectedPrimary && Number(record.targetMuscleId) !== Number(expectedPrimary)) {
            sourceMuscleMismatches.push({
                sourceId: asset.catalogSourceId,
                name: record.name,
                type: 'primary',
                expected: expectedPrimary,
                actual: record.targetMuscleId
            });
        }
        if (!compareNumericSets(expectedSecondary, actualSecondary)) {
            sourceMuscleMismatches.push({
                sourceId: asset.catalogSourceId,
                name: record.name,
                type: 'secondary',
                expected: expectedSecondary,
                actual: actualSecondary
            });
        }
    });

    if (sourceMuscleMismatches.length > 0) {
        critical.push({
            code: 'SOURCE_MUSCLE_MAPPING_MISMATCH',
            count: sourceMuscleMismatches.length,
            records: sourceMuscleMismatches.slice(0, 100)
        });
    }

    if (muscleIndex.duplicateIds.length > 0) {
        critical.push({ code: 'DUPLICATE_MUSCLE_IDENTIFIER', groups: muscleIndex.duplicateIds });
    }
    if (unresolvableMuscleReferences.length > 0) {
        critical.push({ code: 'UNRESOLVABLE_MUSCLE_REFERENCE', references: unresolvableMuscleReferences });
    }
    if (invalidSecondaryMuscles.length > 0) {
        critical.push({ code: 'INVALID_SECONDARY_MUSCLE_DATA', records: invalidSecondaryMuscles });
    }

    const repeatedTips = collectRepeatedContent(records, 'tips');
    const repeatedTipsAr = collectRepeatedContent(records, 'tipsAr');
    const repeatedMistakes = collectRepeatedContent(records, 'commonMistakes');
    const repeatedMistakesAr = collectRepeatedContent(records, 'commonMistakesAr');
    const placeholderContent = collectPlaceholders(records, [
        'nameAr',
        'description',
        'descriptionAr',
        'instructions',
        'instructionsAr',
        'tips',
        'tipsAr',
        'commonMistakes',
        'commonMistakesAr'
    ]);

    if (repeatedTips.length || repeatedTipsAr.length || repeatedMistakes.length || repeatedMistakesAr.length) {
        warnings.push({
            code: 'REPEATED_TIPS_OR_MISTAKES',
            repeatedTips,
            repeatedTipsAr,
            repeatedMistakes,
            repeatedMistakesAr
        });
    }
    if (duplicateSecondaryMuscles.length > 0) {
        warnings.push({ code: 'DUPLICATE_SECONDARY_MUSCLES', records: duplicateSecondaryMuscles });
    }
    if (zeroContributionPercent.length > 0) {
        warnings.push({
            code: 'ZERO_SECONDARY_CONTRIBUTION',
            count: zeroContributionPercent.length,
            sample: zeroContributionPercent.slice(0, 25)
        });
    }
    if (placeholderContent.length > 0) {
        warnings.push({
            code: 'PLACEHOLDER_CONTENT',
            count: placeholderContent.length,
            sample: placeholderContent.slice(0, 50)
        });
    }
    if (muscleIndex.duplicateIds.length === 0 && muscleRecords.length === 0) {
        warnings.push({ code: 'EMPTY_MUSCLE_CATALOG', message: 'No muscle records were available for reference resolution.' });
    }

    const status = critical.length > 0 ? 'failed' : warnings.length > 0 ? 'passed_with_warnings' : 'ok';
    return {
        status,
        checkedAt: new Date().toISOString(),
        expectedExerciseCount: EXPECTED_EXERCISE_COUNT,
        sources: DATA_FILES,
        counts: {
            exercises: records.length,
            muscles: muscleRecords.length,
            exerciseCountMatches: records.length === EXPECTED_EXERCISE_COUNT,
            uniqueSourceIds: new Set(records.map((record) => record?.sourceId).filter((value) => value != null)).size,
            uniqueUpstreamIds: new Set(records.map((record) => record?.upstreamId).filter((value) => value != null && value !== '')).size,
            uniqueSlugs: new Set(records.map((record) => record?.slug).filter((value) => value != null && value !== '')).size,
            resolvableMuscleIds: muscleIndex.byId.size,
            unresolvableMuscleReferences: unresolvableMuscleReferences.length,
            repeatedTipsGroups: repeatedTips.length + repeatedTipsAr.length,
            repeatedMistakesGroups: repeatedMistakes.length + repeatedMistakesAr.length,
            sourceMuscleMismatches: sourceMuscleMismatches.length
        },
        fieldCompleteness: fieldReport,
        identifiers: {
            duplicateSourceIds: indexValues(records, 'sourceId'),
            duplicateUpstreamIds: indexValues(records, 'upstreamId'),
            duplicateSlugs: indexValues(records, 'slug')
        },
        muscleReferences: {
            catalogRecords: muscleRecords.length,
            resolvableIdCount: muscleIndex.byId.size,
            duplicateCatalogIds: muscleIndex.duplicateIds,
            unresolvable: unresolvableMuscleReferences,
            invalidSecondary: invalidSecondaryMuscles,
            zeroContributionPercent: {
                count: zeroContributionPercent.length,
                sample: zeroContributionPercent.slice(0, 25)
            }
        },
        sourceMuscleConsistency: {
            assetRecords: assetRecords.length,
            comparedRecords: assetRecords.filter((asset) => recordsBySourceId.has(String(asset?.catalogSourceId))).length,
            mismatches: sourceMuscleMismatches
        },
        repeatedContent: {
            tips: repeatedTips,
            tipsAr: repeatedTipsAr,
            commonMistakes: repeatedMistakes,
            commonMistakesAr: repeatedMistakesAr
        },
        issues: {
            critical,
            warnings
        },
        summary: {
            criticalFailureCount: critical.length,
            warningCount: warnings.length,
            requiredFieldsIncomplete: Object.keys(missingRequiredFields).length,
            malformedRecordCount: malformedRecords.length,
            placeholderContentCount: placeholderContent.length
        }
    };
}

try {
    const report = validate();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.status === 'failed') process.exitCode = 1;
} catch (error) {
    process.stdout.write(`${JSON.stringify({
        status: 'failed',
        checkedAt: new Date().toISOString(),
        issues: {
            critical: [{ code: error.code || 'VALIDATION_FAILED', message: error.message }],
            warnings: []
        },
        summary: { criticalFailureCount: 1, warningCount: 0 }
    }, null, 2)}\n`);
    process.exitCode = 1;
}
