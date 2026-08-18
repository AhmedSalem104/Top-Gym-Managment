const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const fail = (message) => {
    console.error(`EXERCISE_CATALOG_VALIDATION_FAILED: ${message}`);
    process.exitCode = 1;
};

const catalog = readJson('data/library/exercises.json');
const manifest = readJson('public/data/exercise-assets.json');
const mapping = readJson('data/library/exercise-catalog-mapping.json');
const expectedCount = 873;
const records = Array.isArray(catalog) ? catalog : [];
const manifestRecords = Array.isArray(manifest.records) ? manifest.records : [];
const unique = (values) => new Set(values.filter((value) => value !== null && value !== undefined && value !== '')).size;

if (records.length !== expectedCount) fail(`catalog count is ${records.length}; expected ${expectedCount}`);
if (manifestRecords.length !== expectedCount) fail(`manifest count is ${manifestRecords.length}; expected ${expectedCount}`);
if (mapping.activeCount !== expectedCount) fail(`mapping activeCount is ${mapping.activeCount}; expected ${expectedCount}`);

for (const [label, values] of [
    ['sourceId', records.map((record) => record.sourceId)],
    ['upstreamId', records.map((record) => record.upstreamId)],
    ['slug', records.map((record) => record.slug)]
]) {
    if (unique(values) !== expectedCount) fail(`${label} values are not unique/complete`);
}

const publicRoot = path.join(root, 'public');
const checkAsset = (assetPath, record, phase) => {
    if (!assetPath) {
        fail(`missing ${phase} image path for ${record.slug}`);
        return;
    }
    const relative = String(assetPath).replace(/^\//, '');
    if (!fs.existsSync(path.join(publicRoot, relative))) fail(`missing ${phase} image file for ${record.slug}: ${assetPath}`);
};

for (const record of records) {
    checkAsset(record.imageAssets?.start, record, 'start');
    checkAsset(record.imageAssets?.end, record, 'end');
}

const manifestBySlug = new Map(manifestRecords.map((record) => [record.slug, record]));
for (const record of records) {
    const manifestRecord = manifestBySlug.get(record.slug);
    if (!manifestRecord) fail(`catalog record is missing from manifest: ${record.slug}`);
    if (manifestRecord?.catalogSourceId !== record.sourceId) fail(`manifest source mismatch: ${record.slug}`);
}

if (!process.exitCode) {
    console.log(JSON.stringify({
        status: 'ok',
        activeExercises: records.length,
        uniqueSourceIds: unique(records.map((record) => record.sourceId)),
        uniqueUpstreamIds: unique(records.map((record) => record.upstreamId)),
        uniqueSlugs: unique(records.map((record) => record.slug)),
        manifestRecords: manifestRecords.length,
        imagePairsVerified: records.length
    }));
}
