const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const catalogPath = path.join(ROOT, 'data', 'library', 'muscles.json');
const sourceFiles = [
    path.join(ROOT, 'data', 'anatomy', 'bodyparts3d', 'isa_parts_list_e.txt'),
    path.join(ROOT, 'data', 'anatomy', 'bodyparts3d', 'partof_parts_list_e.txt')
];
const outputPath = path.join(ROOT, 'public', 'data', 'muscle-assets.json');

const SOURCE = {
    provider: 'BodyParts3D / Anatomography',
    datasetVersion: 'LATEST (BodyParts3D 4.0 API kit)',
    api: 'https://lifesciencedb.jp/bp3d/API/image',
    sourceUrl: 'https://lifesciencedb.jp/bp3d/info_en/index.html',
    mappingUrl: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_parts_list_e.txt',
    license: 'CC BY-SA 2.1 Japan',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en',
    attribution: 'BodyParts3D, Copyright 2008 Life Science Integrated Database Center, licensed under CC BY-SA 2.1 Japan.'
};

const IMAGE_STYLE = {
    width: 320,
    height: 420,
    format: 'webp',
    background: '#F8FAFC',
    neutralColor: '#CBD5E1',
    highlightColor: '#E06A2B',
    views: ['front', 'back', 'side']
};

function normalize(value) {
    return String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function slugify(value) {
    return normalize(value).replace(/\s+/g, '-');
}

function readSourceEntries() {
    const entries = [];
    const seen = new Set();
    for (const file of sourceFiles) {
        if (!fs.existsSync(file)) continue;
        for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
            const [fmaId, representationId, name] = line.split('\t');
            if (!fmaId || !name || fmaId === 'concept id') continue;
            const key = `${fmaId}|${name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            entries.push({ fmaId, representationId: representationId || null, name: name.trim(), normalizedName: normalize(name) });
        }
    }
    return entries;
}

const sourceEntries = readSourceEntries();
const sourceByName = new Map();
for (const entry of sourceEntries) {
    if (!sourceByName.has(entry.normalizedName)) sourceByName.set(entry.normalizedName, []);
    sourceByName.get(entry.normalizedName).push(entry);
}

// These aliases intentionally point to names that exist in the downloaded
// BodyParts3D lists. They cover gym terminology and anatomical subdivisions
// without guessing a nearby muscle.
const ALIASES = {
    'Upper Chest': ['clavicular part of pectoralis major'],
    'Lower Chest': ['sternocostal part of pectoralis major'],
    'Lats': ['latissimus dorsi'],
    'Rhomboids': ['rhomboid major', 'rhomboid minor'],
    'Traps': ['zone of trapezius'],
    'Upper Traps': ['ascending part of trapezius'],
    'Middle Traps': ['transverse part of trapezius'],
    'Lower Traps': ['descending part of trapezius'],
    'Shoulders': ['muscle of shoulder'],
    'Front Deltoid': ['clavicular part of deltoid'],
    'Side Deltoid': ['acromial part of deltoid'],
    'Rear Deltoid': ['spinal part of deltoid'],
    'Rotator Cuff': ['rotator muscle'],
    'Biceps': ['long head of biceps brachii', 'short head of biceps brachii'],
    'Long Head Biceps': ['long head of biceps brachii'],
    'Short Head Biceps': ['short head of biceps brachii'],
    'Triceps': ['long head of triceps brachii', 'medial head of triceps brachii', 'lateral head of triceps brachii'],
    'Long Head Triceps': ['long head of triceps brachii'],
    'Lateral Head Triceps': ['lateral head of triceps brachii'],
    'Medial Head Triceps': ['medial head of triceps brachii'],
    'Forearms': ['muscle of forearm'],
    'Thenar Muscles': ['thenar muscle'],
    'Hypothenar Muscles': ['hypothenar muscle'],
    'Abs': ['muscle of abdomen'],
    'Upper Abs': ['muscle of abdomen'],
    'Lower Abs': ['muscle of abdomen'],
    'External Obliques': ['external oblique'],
    'Internal Obliques': ['internal oblique'],
    'External Intercostals': ['external intercostal muscle'],
    'Internal Intercostals': ['internal intercostal muscle'],
    'Quadriceps': ['zone of quadriceps femoris'],
    'Hamstrings': ['muscle of posterior compartment of thigh'],
    'Biceps Femoris': ['head of biceps femoris'],
    'Glutes': ['gluteal muscle'],
    'Adductors': ['muscle of medial compartment of thigh'],
    'Calves': ['superficial muscle of posterior compartment of leg'],
    'Gastrocnemius': ['head of gastrocnemius'],
    'Foot Intrinsics': ['intrinsic muscle of foot'],
    'Neck': ['muscle of neck'],
    'Scalenes': ['scalene muscle'],
    'Suboccipitals': ['posterior suboccipital muscle', 'anterior suboccipital muscle'],
    'Deep Hip Rotators': ['muscle of pelvis'],
    'Intertransversarii': ['intertransversarius muscle'],
    'Interspinales': ['interspinalis muscle'],
    'Rotatores': ['rotator muscle'],
    'Innermost Intercostals': ['innermost intercostal muscle'],
    'Pectoralis Major Clavicular Head': ['clavicular part of pectoralis major'],
    'Pectoralis Major Sternocostal Head': ['sternocostal part of pectoralis major'],
    'Deltoid Anterior Fibers': ['clavicular part of deltoid'],
    'Deltoid Middle Fibers': ['acromial part of deltoid'],
    'Deltoid Posterior Fibers': ['spinal part of deltoid'],
    'Triceps Brachii Long Head': ['long head of triceps brachii'],
    'Triceps Brachii Lateral Head': ['lateral head of triceps brachii'],
    'Triceps Brachii Medial Head': ['medial head of triceps brachii'],
    'Adductor Pollicis': ['oblique head of adductor pollicis', 'transverse head of adductor pollicis'],
    'Palmaris Brevis': ['intrinsic muscle of hand'],
    'Abductor Digiti Minimi Hand': ['abductor digiti minimi of hand'],
    'Flexor Digiti Minimi Brevis Hand': ['flexor digiti minimi brevis of hand'],
    'Opponens Digiti Minimi': ['opponens digiti minimi of hand'],
    'Lumbricals Hand': ['set of lumbricals of hand'],
    'Palmar Interossei Hand': ['set of palmar interossei of hand'],
    'Dorsal Interossei Hand': ['set of dorsal interossei of hand'],
    'Levator Ani': ['zone of levator ani'],
    'External Urethral Sphincter': ['perineal muscle'],
    'Superficial Transverse Perineal': ['superficial perineal muscle'],
    'Deep Transverse Perineal': ['perineal muscle'],
    'Iliopsoas': ['psoas major', 'iliacus'],
    'Gemellus Superior Hip': ['gemellus superior'],
    'Gemellus Inferior Hip': ['gemellus inferior'],
    'Obturator Internus Hip': ['obturator internus'],
    'Obturator Externus Hip': ['obturator externus'],
    'Quadratus Femoris Hip': ['quadratus femoris'],
    'Adductor Magnus Adductor Part': ['adductor magnus'],
    'Adductor Magnus Hamstring Part': ['adductor magnus'],
    'Biceps Femoris Long Head': ['long head of biceps femoris'],
    'Biceps Femoris Short Head': ['short head of biceps femoris'],
    'Flexor Hallucis Longus Foot': ['flexor hallucis longus'],
    'Extensor Digitorum Longus Foot': ['extensor digitorum longus'],
    'Gastrocnemius Medial Head': ['medial head of gastrocnemius'],
    'Gastrocnemius Lateral Head': ['lateral head of gastrocnemius'],
    'Abductor Digiti Minimi Foot': ['abductor digiti minimi of foot'],
    'Lumbricals Foot': ['intrinsic muscle of foot'],
    'Flexor Digiti Minimi Brevis Foot': ['flexor digiti minimi brevis of foot'],
    'Plantar Interossei Foot': ['plantar interosseous of foot'],
    'Dorsal Interossei Foot': ['intrinsic muscle of foot']
};

function directCandidates(name) {
    const candidates = [name];
    const replacements = [
        [/\bPeroneus\b/gi, 'Fibularis'],
        [/\bBiceps\b(?! Femoris)/gi, 'Biceps Brachii'],
        [/\bTriceps\b/gi, 'Triceps Brachii'],
        [/\bExternal Obliques\b/gi, 'External Oblique'],
        [/\bInternal Obliques\b/gi, 'Internal Oblique'],
        [/\bIntercostals\b/gi, 'Intercostal Muscle'],
        [/\bIntertransversarii\b/gi, 'Intertransversarius Muscle'],
        [/\bInterspinales\b/gi, 'Interspinalis Muscle'],
        [/\bExtensor Digitorum Brevis\b/gi, 'Extensor Digitorum Brevis'],
        [/\bPyramidalis Abdominis\b/gi, 'Pyramidalis'],
        [/\bMusculus Uvulae\b/gi, 'Musculus Uvulae']
    ];
    for (const [pattern, replacement] of replacements) candidates.push(name.replace(pattern, replacement));
    if (/s$/i.test(name)) candidates.push(name.replace(/s$/i, ''));
    return candidates;
}

function findEntries(names) {
    const found = [];
    const seen = new Set();
    for (const name of names) {
        const matches = sourceByName.get(normalize(name)) || [];
        for (const match of matches) {
            const key = `${match.fmaId}|${match.normalizedName}`;
            if (!seen.has(key)) {
                seen.add(key);
                found.push(match);
            }
        }
    }
    return found;
}

function chooseMapping(muscle) {
    const explicit = ALIASES[muscle.name];
    const candidates = explicit || directCandidates(muscle.name);
    const entries = findEntries(candidates);
    if (!entries.length) {
        return {
            status: 'manual-review',
            confidence: 'none',
            mappingMethod: 'unmatched',
            sourceAnatomyIds: [],
            sourceRepresentationIds: [],
            canonicalName: null,
            canonicalNameAr: null,
            reviewReason: 'لا توجد بنية عضلية مطابقة مؤكدة في قوائم BodyParts3D المحلية.'
        };
    }
    const unique = [...new Map(entries.map((entry) => [entry.fmaId, entry])).values()];
    const canonicalName = unique.map((entry) => entry.name).join(' + ');
    const isExplicit = Boolean(explicit);
    const isGroup = unique.length > 1 || /group|zone|set of|muscle of|compartment|intrinsic|head of|part of|region/i.test(canonicalName);
    return {
        status: 'mapped',
        confidence: isExplicit && isGroup ? 'medium' : 'high',
        mappingMethod: isExplicit ? (isGroup ? 'documented-group-alias' : 'documented-alias') : 'exact-name',
        sourceAnatomyIds: unique.map((entry) => entry.fmaId),
        sourceRepresentationIds: unique.map((entry) => entry.representationId).filter(Boolean),
        canonicalName,
        canonicalNameAr: null,
        reviewReason: isGroup ? 'المطابقة إلى بنية/مجموعة تشريحية موثقة وليست عضلة مفردة.' : null
    };
}

function build() {
    const muscles = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const records = muscles.map((muscle, index) => {
        const mapping = chooseMapping(muscle);
        const canonicalKey = mapping.sourceAnatomyIds.join('-') || `manual-review-${index + 1}`;
        return {
            systemMuscleId: index + 1,
            systemName: muscle.name,
            systemNameAr: muscle.nameAr || null,
            bodyPart: muscle.bodyPart || null,
            assetSlug: slugify(mapping.canonicalName || muscle.name),
            ...mapping,
            canonicalKey
        };
    });
    const mapped = records.filter((record) => record.status === 'mapped');
    const manualReview = records.filter((record) => record.status === 'manual-review');
    const uniqueCanonical = new Map(mapped.map((record) => [record.canonicalKey, record]));
    const manifest = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: SOURCE,
        imageStyle: IMAGE_STYLE,
        stats: {
            systemRecordsReviewed: records.length,
            mappedRecords: mapped.length,
            manualReviewRecords: manualReview.length,
            uniqueCanonicalStructures: uniqueCanonical.size,
            downloadedImages: 0
        },
        records
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`MUSCLE_MAPPING_OK records=${records.length} mapped=${mapped.length} manualReview=${manualReview.length} uniqueCanonical=${uniqueCanonical.size}`);
    console.log(`MUSCLE_MAPPING_REVIEW ${manualReview.map((record) => `${record.systemMuscleId}:${record.systemName}`).join(' | ')}`);
}

build();
