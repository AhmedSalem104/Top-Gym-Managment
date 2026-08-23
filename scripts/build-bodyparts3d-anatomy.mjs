import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Group, Mesh, MeshStandardMaterial, Color } from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_ARCHIVE = path.join(ROOT, '.tmp', 'bodyparts3d', 'isa_BP3D_4.0_obj_99.fresh.zip');
const DEFAULT_ELEMENT_MAP = path.join(ROOT, '.tmp', 'bodyparts3d', 'isa_element_parts.txt');
const OUTPUT_GLb = path.join(ROOT, 'public', 'assets', 'anatomy', 'top-gym-anatomy.glb');
const OUTPUT_MANIFEST = path.join(ROOT, 'public', 'data', 'anatomy-muscle-mapping.json');
const OUTPUT_REPORT = path.join(ROOT, 'docs', 'ANATOMY-BODYPARTS3D-REPORT.json');
const ASSET_MANIFEST = path.join(ROOT, 'public', 'data', 'muscle-assets.json');
const MUSCLE_CATALOG = path.join(ROOT, 'data', 'library', 'muscles.json');

const SOURCE = {
  provider: 'BodyParts3D / Database Center for Life Science (DBCLS)',
  dataset: 'BodyParts3D 4.0, LATEST official OBJ archive, ISA representation, 99% polygon reduction',
  archiveUrl: 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/isa_BP3D_4.0_obj_99.zip',
  downloadPage: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html',
  licensePage: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
  license: 'Creative Commons Attribution 4.0 International (CC BY 4.0), per the current official BodyParts3D license page updated 2025-02-27',
  attribution: 'BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International',
  historicalNotice: 'The OBJ headers in the archive contain the historical CC BY-SA 2.1 Japan notice. The current official license page is authoritative for the current archive; this historical notice is retained in project documentation for provenance.'
};

const METHOD_RANK = {
  'exact-name': 3,
  'documented-alias': 2
};

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function ensureFile(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} not found: ${file}`);
}

function reportPath(file) {
  const relative = path.relative(ROOT, file);
  return relative && !relative.startsWith('..')
    ? relative.split(path.sep).join('/')
    : path.basename(file);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'muscle';
}

function parseElementMap(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const [conceptId, , elementId] = line.split('\t').map((value) => value?.trim());
    if (!conceptId || !elementId || conceptId === 'concept id') continue;
    if (!map.has(conceptId)) map.set(conceptId, new Set());
    map.get(conceptId).add(elementId);
  }
  return map;
}

function readCandidates(elementMap) {
  const source = JSON.parse(fs.readFileSync(ASSET_MANIFEST, 'utf8'));
  const catalog = JSON.parse(fs.readFileSync(MUSCLE_CATALOG, 'utf8'));
  const records = source.records.map((row) => ({
    ...row,
    // The seed catalog is the canonical UTF-8 source for the Arabic label.
    // The older image manifest may contain legacy mojibake in systemNameAr.
    systemNameAr: catalog[row.systemMuscleId - 1]?.nameAr || row.systemNameAr || null
  }));
  source.records = records;
  const rows = records.filter((row) => row.status === 'mapped' && METHOD_RANK[row.mappingMethod]);
  const candidatesByElement = new Map();
  for (const row of rows) {
    for (const conceptId of row.sourceAnatomyIds || []) {
      const elementIds = elementMap.get(conceptId) || [];
      for (const elementId of elementIds) {
        if (!/^FJ\d+$/i.test(elementId)) continue;
        if (!candidatesByElement.has(elementId)) candidatesByElement.set(elementId, []);
        candidatesByElement.get(elementId).push(row);
      }
    }
  }
  return { source, candidatesByElement };
}

function chooseOwner(elementId, candidates) {
  const unique = [...new Map(candidates.map((candidate) => [candidate.systemMuscleId, candidate])).values()];
  if (unique.length === 1) return { owner: unique[0], reason: 'single documented candidate' };
  const maxRank = Math.max(...unique.map((candidate) => METHOD_RANK[candidate.mappingMethod] || 0));
  const ranked = unique.filter((candidate) => METHOD_RANK[candidate.mappingMethod] === maxRank);
  if (ranked.length === 1) return { owner: ranked[0], reason: 'higher-confidence documented candidate' };

  // A candidate is more specific only when all of its source concepts are a
  // strict subset of every competing candidate. Otherwise, do not guess.
  const sets = ranked.map((candidate) => new Set(candidate.sourceAnatomyIds || []));
  const specific = ranked.filter((candidate, index) => {
    const own = sets[index];
    return sets.every((other, otherIndex) => index === otherIndex || [...own].every((id) => other.has(id)))
      && sets.some((other, otherIndex) => otherIndex !== index && other.size > own.size);
  });
  if (specific.length === 1) return { owner: specific[0], reason: 'strictly more specific documented candidate' };
  return {
    owner: null,
    reason: 'ambiguous BodyParts3D element; candidates were intentionally not guessed',
    candidates: ranked.map((candidate) => ({
      systemMuscleId: candidate.systemMuscleId,
      systemName: candidate.systemName,
      mappingMethod: candidate.mappingMethod,
      sourceAnatomyIds: candidate.sourceAnatomyIds
    }))
  };
}

function buildOwnership(source, candidatesByElement) {
  const ownership = new Map();
  const ambiguous = [];
  for (const [elementId, candidates] of candidatesByElement) {
    const result = chooseOwner(elementId, candidates);
    if (result.owner) ownership.set(elementId, result.owner);
    else ambiguous.push({ elementId, ...result });
  }
  const mappedSystemIds = new Set([...ownership.values()].map((row) => row.systemMuscleId));
  const unmapped = source.records
    .filter((row) => !mappedSystemIds.has(row.systemMuscleId))
    .map((row) => ({
      systemMuscleId: row.systemMuscleId,
      systemName: row.systemName,
      systemNameAr: row.systemNameAr,
      mappingMethod: row.mappingMethod,
      sourceAnatomyIds: row.sourceAnatomyIds,
      sourceRepresentationIds: row.sourceRepresentationIds,
      reason: row.status !== 'mapped'
        ? 'No documented BodyParts3D mapping in the existing catalog.'
        : 'All candidate elements were ambiguous or were not present in the official ISA element map.'
    }));
  return { ownership, ambiguous, unmapped };
}

function archiveEntry(elementId) {
  return `isa_BP3D_4.0_obj_99/${elementId}.obj`;
}

function extractSelected(archive, elementIds, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  const listFile = path.join(destination, 'selected-entries.txt');
  fs.writeFileSync(listFile, `${elementIds.map(archiveEntry).join('\n')}\n`, 'utf8');
  const tar = process.platform === 'win32' ? 'tar.exe' : 'tar';
  execFileSync(tar, ['-xf', archive, '-C', destination, '-T', listFile], { stdio: 'inherit' });
  fs.rmSync(listFile, { force: true });
}

function createModel(ownership, extractedRoot) {
  const model = new Group();
  model.name = 'TOP_GYM_BODYPARTS3D_MUSCLES';
  const loader = new OBJLoader();
  const loadedFiles = [];
  const meshManifest = {};
  for (const [elementId, row] of ownership) {
    const file = path.join(extractedRoot, archiveEntry(elementId));
    ensureFile(file, `Extracted BodyParts3D OBJ ${elementId}`);
    const parsed = loader.parse(fs.readFileSync(file, 'utf8'));
    const children = [];
    parsed.traverse((object) => {
      if (!object.isMesh) return;
      const mesh = object;
      mesh.geometry.computeVertexNormals();
      const material = new MeshStandardMaterial({
        name: `TG_MATERIAL_${row.systemMuscleId}_${elementId}`,
        color: new Color('#c98280'),
        roughness: 0.56,
        metalness: 0.02
      });
      mesh.material = material;
      mesh.name = `TG_MUSCLE_${row.systemMuscleId}_${slugify(row.systemName)}_${elementId}`;
      mesh.userData = {};
      model.add(mesh);
      children.push(mesh.name);
    });
    if (!children.length) throw new Error(`BodyParts3D OBJ contains no mesh: ${elementId}`);
    const meshName = children[0];
    meshManifest[meshName] = {
      muscleId: row.systemMuscleId,
      systemName: row.systemName,
      systemNameAr: row.systemNameAr || null,
      bodyParts3dElementId: elementId,
      bodyParts3dConceptIds: row.sourceAnatomyIds || [],
      representationIds: row.sourceRepresentationIds || [],
      mappingMethod: row.mappingMethod,
      confidence: 'documented',
      sourceFile: `${elementId}.obj`
    };
    loadedFiles.push(elementId);
  }
  // BodyParts3D coordinates are millimetres. Keep the unit conversion in the
  // asset, so the viewer remains model-provider agnostic.
  model.scale.setScalar(0.001);
  model.updateMatrixWorld(true);
  return { model, loadedFiles, meshManifest };
}

function exportGlb(model, output) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (typeof globalThis.FileReader !== 'function') {
    globalThis.FileReader = class {
      readAsArrayBuffer(blob) {
        blob.arrayBuffer().then((value) => {
          this.result = value;
          this.onloadend?.();
        }, (error) => this.onerror?.(error));
      }
    };
  }
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(model, (result) => {
      if (!(result instanceof ArrayBuffer)) return reject(new Error('GLTFExporter returned JSON instead of binary GLB.'));
      fs.writeFileSync(output, Buffer.from(result));
      resolve();
    }, reject, { binary: true, trs: false, onlyVisible: true, embedImages: true });
  });
}

async function optimizeAndInspect(file) {
  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const beforeBytes = fs.statSync(file).size;
  const document = await io.read(file);
  await document.transform(
    weld(),
    dedup(),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'high' })
  );
  await io.write(file, document);
  const afterBytes = fs.statSync(file).size;
  const root = document.getRoot();
  let triangles = 0;
  let vertices = 0;
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      vertices += position?.getCount() || 0;
      triangles += indices ? Math.floor(indices.getCount() / 3) : Math.floor((position?.getCount() || 0) / 3);
    }
  }
  return {
    beforeBytes,
    afterBytes,
    meshCount: root.listMeshes().length,
    nodeCount: root.listNodes().length,
    materialCount: root.listMaterials().length,
    vertices,
    triangles,
    meshopt: true
  };
}

function writeManifest(meshManifest, ownership, ambiguous, unmapped, modelStats) {
  const manifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    modelAsset: '/assets/anatomy/top-gym-anatomy.glb',
    meshNameConvention: 'TG_MUSCLE_<gym_muscles.id>_<slug>_<BodyParts3D element id>',
    provider: SOURCE.provider,
    dataset: SOURCE.dataset,
    license: SOURCE.license,
    attribution: SOURCE.attribution,
    mappings: meshManifest,
    stats: {
      mappedSystemMuscles: new Set([...ownership.values()].map((row) => row.systemMuscleId)).size,
      mappedMeshes: Object.keys(meshManifest).length,
      ambiguousElements: ambiguous.length,
      unmappedSystemMuscles: unmapped.length,
      ...modelStats
    },
    review: {
      policy: 'Only exact-name and documented-alias records are eligible. Conflicting BodyParts3D elements are excluded instead of guessed.',
      ambiguous,
      unmapped
    }
  };
  fs.mkdirSync(path.dirname(OUTPUT_MANIFEST), { recursive: true });
  fs.writeFileSync(OUTPUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

async function main() {
  const archive = path.resolve(argValue('--archive', process.env.BODY_PARTS_ARCHIVE || DEFAULT_ARCHIVE));
  const elementMapFile = path.resolve(argValue('--element-map', process.env.BODY_PARTS_ELEMENT_MAP || DEFAULT_ELEMENT_MAP));
  const extractionDir = path.resolve(argValue('--extract-dir', path.join(ROOT, '.tmp', 'bodyparts3d', 'isa-selected')));
  ensureFile(archive, 'Official BodyParts3D ISA archive');
  ensureFile(elementMapFile, 'Official BodyParts3D ISA element map');
  ensureFile(ASSET_MANIFEST, 'Existing muscle asset manifest');
  ensureFile(MUSCLE_CATALOG, 'Canonical muscle catalog');

  const elementMap = parseElementMap(elementMapFile);
  const { source, candidatesByElement } = readCandidates(elementMap);
  const { ownership, ambiguous, unmapped } = buildOwnership(source, candidatesByElement);
  if (!ownership.size) throw new Error('No conservative BodyParts3D mappings are available.');
  const elementIds = [...ownership.keys()].sort();
  console.log(`BODYPARTS3D_SELECTED elements=${elementIds.length} ambiguous=${ambiguous.length} unmapped=${unmapped.length}`);
  extractSelected(archive, elementIds, extractionDir);
  const { model, loadedFiles, meshManifest } = createModel(ownership, extractionDir);
  await exportGlb(model, OUTPUT_GLb);
  const modelStats = await optimizeAndInspect(OUTPUT_GLb);
  const manifest = writeManifest(meshManifest, ownership, ambiguous, unmapped, modelStats);
  const report = {
    generatedAt: manifest.generatedAt,
    source: SOURCE,
    input: {
      archive: reportPath(archive),
      elementMap: reportPath(elementMapFile),
      officialArchiveEntriesUsed: loadedFiles.length
    },
    output: {
      glb: OUTPUT_GLb,
      publicPath: manifest.modelAsset,
      bytes: fs.statSync(OUTPUT_GLb).size,
      ...modelStats
    },
    mapping: manifest.stats,
    unmapped: manifest.review.unmapped,
    ambiguous: manifest.review.ambiguous,
    qualityGate: {
      policy: 'The asset is accepted only as an official BodyParts3D-derived, separate-mesh web model. Anatomical completeness is reported through unmapped/ambiguous lists; no guessed mappings are included.',
      sourceArchiveReduction: '99% polygon-reduced official archive; inspect the rendered model before presenting it as a clinical/anatomical reference.',
      runtimeMaterialIsolation: 'The GLB intentionally deduplicates its single PBR material for size; AnatomyViewer clones materials per mesh before highlighting.',
      passed: modelStats.meshCount > 0 && modelStats.triangles > 0 && modelStats.materialCount > 0
    }
  };
  fs.mkdirSync(path.dirname(OUTPUT_REPORT), { recursive: true });
  fs.writeFileSync(OUTPUT_REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`BODYPARTS3D_GLB_OK path=${manifest.modelAsset} bytes=${modelStats.afterBytes} meshes=${modelStats.meshCount} triangles=${modelStats.triangles} mappedMuscles=${manifest.stats.mappedSystemMuscles}`);
  console.log(`BODYPARTS3D_REPORT ${path.relative(ROOT, OUTPUT_REPORT)}`);
}

main().catch((error) => {
  console.error(`BODYPARTS3D_BUILD_FAILED ${error instanceof Error ? error.stack || error.message : error}`);
  process.exitCode = 1;
});
