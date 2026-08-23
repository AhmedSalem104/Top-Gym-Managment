const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'public', 'data', 'muscle-assets.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const records = manifest.records || [];
const errors = [];

function exists(relativePath) {
    return relativePath && fs.existsSync(path.join(root, 'public', relativePath.replace(/^\//, '')));
}

if (records.length !== 297) errors.push(`expected 297 muscle records, got ${records.length}`);
const ids = records.map((record) => record.systemMuscleId);
if (new Set(ids).size !== ids.length) errors.push('duplicate systemMuscleId values');
if (new Set(ids).size !== 297) errors.push('systemMuscleId coverage is incomplete');
if (manifest.source?.license !== 'CC BY-SA 2.1 Japan') errors.push('unexpected anatomy source license');

const mapped = records.filter((record) => record.status === 'mapped');
const manualReview = records.filter((record) => record.status === 'manual-review');
const mappedWithImages = mapped.filter((record) => record.imageAssets);
for (const record of records) {
    if (record.status === 'mapped') {
        if (!record.sourceAnatomyIds?.length) errors.push(`mapped record ${record.systemMuscleId} has no source anatomy id`);
        for (const view of ['front', 'back', 'side', 'main']) {
            const asset = record.imageAssets?.[view];
            if (!asset || !exists(asset)) errors.push(`missing ${view} image for muscle ${record.systemMuscleId}`);
            if (asset && !asset.endsWith('.webp')) errors.push(`non-WebP image for muscle ${record.systemMuscleId}: ${asset}`);
        }
    }
    if (record.status === 'manual-review' && record.imageAssets) errors.push(`manual-review record ${record.systemMuscleId} unexpectedly has images`);
}

const physicalDirectories = fs.existsSync(path.join(root, 'public', 'assets', 'muscles'))
    ? fs.readdirSync(path.join(root, 'public', 'assets', 'muscles'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];
const imageSlugs = new Set(mappedWithImages.map((record) => record.assetSlug));
if (physicalDirectories.length !== imageSlugs.size) errors.push(`physical muscle asset directories ${physicalDirectories.length} != manifest slugs ${imageSlugs.size}`);

const modernization = manifest.modernization || {};
const fallbackSlugs = new Set(modernization.legacyFallbackAssetSlugs || []);
if (modernization.modernizedAssetCount != null && modernization.legacyFallbackAssetCount != null) {
    const expected = Number(modernization.modernizedAssetCount) + Number(modernization.legacyFallbackAssetCount);
    if (expected !== imageSlugs.size) errors.push(`modernization counts ${expected} != unique asset slugs ${imageSlugs.size}`);
}
for (const slug of fallbackSlugs) {
    if (!imageSlugs.has(slug)) errors.push(`modernization fallback slug is not mapped: ${slug}`);
}

console.log(`MUSCLE_ASSET_QA records=${records.length} mapped=${mapped.length} mappedWithImages=${mappedWithImages.length} manualReview=${manualReview.length} uniqueCanonical=${manifest.stats?.uniqueCanonicalStructures || 0} physicalDirectories=${physicalDirectories.length}`);
if (errors.length) {
    console.error(`MUSCLE_ASSET_QA_FAILED count=${errors.length}`);
    errors.slice(0, 30).forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log('MUSCLE_ASSET_QA_OK');
}
