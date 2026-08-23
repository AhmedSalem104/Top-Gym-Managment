/*
 * Render modern muscle-library previews from a local GLB model.
 *
 * The renderer is intentionally build-time only. The application continues to
 * load the same /assets/muscles/<slug>/<view>.webp files at runtime.
 *
 * Usage:
 *   node scripts/render-muscle-assets.js --model C:\path\to\kas.glb
 *   node scripts/render-muscle-assets.js --model C:\path\to\kas.glb --pilot
 *   node scripts/render-muscle-assets.js --model C:\path\to\kas.glb --all
 *
 * Source model attribution:
 *   BodyParts3D / DBCLS and Z-Anatomy, CC BY-SA 4.0.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { URL } = require('node:url');
const { chromium } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const THREE_ROOT = path.join(ROOT, 'node_modules', 'three');
const OUTPUT_ROOT = path.join(ROOT, 'public', 'assets', 'muscles');
const MANIFEST_PATH = path.join(ROOT, 'public', 'data', 'muscle-assets.json');
const WIDTH = 480;
const HEIGHT = 630;

const PILOT_ASSETS = [
  {
    slug: 'acromial-part-of-deltoid',
    terms: ['acromial part of deltoid muscle'],
    label: 'deltoid',
  },
  {
    slug: 'clavicular-part-of-pectoralis-major',
    terms: ['clavicular head of pectoralis major muscle'],
    label: 'pectoralis',
  },
  {
    slug: 'sternocostal-part-of-pectoralis-major',
    terms: ['sternocostal head of pectoralis major muscle'],
    label: 'pectoralis',
  },
  {
    slug: 'long-head-of-biceps-brachii-short-head-of-biceps-brachii',
    terms: ['long head of biceps brachii', 'short head of biceps brachii'],
    label: 'biceps',
  },
];

// These are documented group aliases used by the existing library catalog.
// They are deliberately explicit so a broad label never maps to a random mesh.
const GROUP_ALIASES = {
  'clavicular-part-of-pectoralis-major': ['clavicular head of pectoralis major muscle'],
  'sternocostal-part-of-pectoralis-major': ['sternocostal head of pectoralis major muscle'],
  'zone-of-trapezius': ['descending part of trapezius muscle', 'transverse part of trapezius muscle', 'ascending part of trapezius muscle'],
  'muscle-of-shoulder': ['acromial part of deltoid muscle', 'clavicular part of deltoid muscle', 'scapular spinal part of deltoid muscle'],
  'rotator-muscle': ['supraspinatus muscle', 'infraspinatus muscle', 'subscapularis muscle', 'teres minor muscle'],
  'muscle-of-abdomen': ['rectus abdominis muscle', 'external abdominal oblique muscle', 'internal abdominal oblique muscle', 'transversus abdominis muscle'],
  'external-oblique': ['external abdominal oblique muscle'],
  'zone-of-quadriceps-femoris': ['rectus femoris muscle', 'vastus lateralis muscle', 'vastus medialis muscle', 'vastus intermedius muscle'],
  'muscle-of-posterior-compartment-of-thigh': ['long head of biceps femoris', 'short head of biceps femoris', 'semimembranosus muscle', 'semitendinosus muscle'],
  'gluteal-muscle': ['gluteus maximus muscle', 'gluteus medius muscle', 'gluteus minimus muscle'],
  'muscle-of-medial-compartment-of-thigh': ['adductor brevis', 'adductor longus', 'adductor magnus', 'gracilis muscle', 'pectineus muscle', 'obturator externus'],
  'superficial-muscle-of-posterior-compartment-of-leg': ['lateral head of gastrocnemius', 'medial head of gastrocnemius', 'soleus muscle', 'plantaris muscle'],
  'scalene-muscle': ['scalenus anterior muscle', 'scalenus medius muscle', 'scalenus posterior muscle'],
  'splenius-cervicis': ['splenius colli muscle'],
  'gemellus-superior': ['superior gemellus muscle'],
  'gemellus-inferior': ['inferior gemellus muscle'],
  'intertransversarius-muscle': ['intertransversarii lumborum muscles'],
  'interspinalis-muscle': ['interspinales colli muscles', 'interspinales lumborum muscles', 'interspinales thoracis muscles'],
  'rectus-capitis-anterior': ['rectus anterior capitis muscle'],
  'rectus-capitis-lateralis': ['rectus lateralis capitis muscle'],
  'rectus-capitis-posterior-major': ['rectus posterior major capitis muscle'],
  'rectus-capitis-posterior-minor': ['rectus posterior minor capitis muscle'],
  'obliquus-capitis-superior': ['obliquus superior capitis muscle'],
  'obliquus-capitis-inferior': ['obliquus inferior capitis muscle'],
  'semispinalis-cervicis': ['semispinalis colli muscle'],
  'flexor-digiti-minimi-brevis-of-hand': ['flexor digiti minimi of hand'],
  'opponens-digiti-minimi-of-hand': ['opponens digiti minimi muscle of hand'],
  'set-of-lumbricals-of-hand': ['lumbrical muscles of hand'],
  'set-of-palmar-interossei-of-hand': ['palmar interossei muscles of hand'],
  'set-of-dorsal-interossei-of-hand': ['dorsal interossei muscles of hand'],
  'flexor-digiti-minimi-brevis-of-foot': ['flexor digiti minimi of foot'],
  'plantar-interosseous-of-foot': ['plantar interossei muscles of foot'],
};

const ALL_VIEWS = [
  { name: 'front', direction: [0, 0, 1] },
  { name: 'back', direction: [0, 0, -1] },
  { name: 'side', direction: [1, 0, 0] },
];

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--pilot') {
      args.pilot = true;
      continue;
    }
    if (value === '--all') {
      args.all = true;
      continue;
    }
    if (value.startsWith('--')) {
      args[value.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function contentType(filePath) {
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.glb')) return 'model/gltf-binary';
  return 'application/octet-stream';
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function assetsFromManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const seen = new Set();
  return (manifest.records || [])
    .filter((record) => record.status === 'mapped' && record.assetSlug && record.canonicalName)
    .filter((record) => {
      if (seen.has(record.assetSlug)) return false;
      seen.add(record.assetSlug);
      return true;
    })
    .map((record) => {
      const terms = GROUP_ALIASES[record.assetSlug]
        || String(record.canonicalName).split(/\s*\+\s*|\s+and\s+/i).map((term) => term.trim()).filter(Boolean);
      return { slug: record.assetSlug, terms, label: record.assetSlug };
    });
}

function glbNodeNames(modelPath) {
  const data = fs.readFileSync(modelPath);
  let offset = 12;
  while (offset < data.length) {
    const chunkLength = data.readUInt32LE(offset);
    const chunkType = data.readUInt32LE(offset + 4);
    offset += 8;
    if (chunkType === 0x4e4f534a) {
      const json = JSON.parse(data.subarray(offset, offset + chunkLength).toString('utf8'));
      return (json.nodes || []).filter((node) => node.mesh != null).map((node) => node.name || '');
    }
    offset += chunkLength;
  }
  return [];
}

function assetMatchesModel(asset, names) {
  const normalizedNames = names.map(normalize);
  return asset.terms.some((term) => {
    const normalizedTerm = normalize(term);
    return normalizedTerm && normalizedNames.some((name) => name.includes(normalizedTerm));
  });
}

function renderPage(config) {
  const serialized = JSON.stringify(config);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}, initial-scale=1">
  <script type="importmap">
  {
    "imports": {
      "three": "/three.module.js",
      "three/addons/": "/three-addons/"
    }
  }
  </script>
</head>
<body style="margin:0;background:#F8FAFC;overflow:hidden">
<canvas id="canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const config = ${serialized};
const canvas = document.querySelector('#canvas');
const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(1);
renderer.setSize(${WIDTH}, ${HEIGHT}, false);
renderer.setClearColor('#F8FAFC', 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#F8FAFC');

const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/model.glb');
const root = gltf.scene;
scene.add(root);
root.updateMatrixWorld(true);

const normalizedTerms = config.terms.map((term) => normalize(term));
const targetMeshes = [];
const allMeshes = [];
const meshNames = [];
root.traverse((object) => {
  if (!object.isMesh) return;
  const objectName = normalize(object.name);
  if (objectName.includes('deltoid') || objectName.includes('pectoralis') || objectName.includes('biceps')) {
    meshNames.push(objectName);
  }
  const isTarget = normalizedTerms.some((term) => objectName.includes(term));
  const material = new THREE.MeshStandardMaterial({
    color: isTarget ? '#2563EB' : '#B8C2D1',
    roughness: isTarget ? 0.42 : 0.72,
    metalness: 0.02,
    transparent: !isTarget,
    opacity: isTarget ? 1 : 0.25,
    depthWrite: isTarget
  });
  object.material = material;
  object.castShadow = false;
  object.receiveShadow = false;
  object.visible = true;
  allMeshes.push(object);
  if (isTarget) targetMeshes.push(object);
});

if (!targetMeshes.length) {
  console.error('Available target-like meshes: ' + meshNames.join(' | '));
  throw new Error('No target mesh matched: ' + config.terms.join(', '));
}

const targetBox = new THREE.Box3();
for (const mesh of targetMeshes) targetBox.expandByObject(mesh);
const targetCenter = targetBox.getCenter(new THREE.Vector3());
const targetSize = targetBox.getSize(new THREE.Vector3());
const maxDimension = Math.max(targetSize.x, targetSize.y, targetSize.z, 0.1);
const direction = new THREE.Vector3(...config.direction).normalize();
const camera = new THREE.PerspectiveCamera(26, ${WIDTH / HEIGHT}, 0.01, 100000);
const distance = (maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(26 / 2)))) * 1.18;
camera.position.copy(targetCenter).addScaledVector(direction, distance);
camera.up.set(0, 1, 0);
camera.lookAt(targetCenter);

scene.add(new THREE.HemisphereLight('#FFFFFF', '#AEB9C8', 2.3));
const keyLight = new THREE.DirectionalLight('#FFFFFF', 3.2);
keyLight.position.set(2, 4, 5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight('#BFD7FF', 1.3);
fillLight.position.set(-3, 1, 2);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight('#FFFFFF', 1.2);
rimLight.position.set(0, -1, -4);
scene.add(rimLight);

renderer.render(scene, camera);
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
renderer.render(scene, camera);
window.__topGymMuscleRender = {
  dataUrl: canvas.toDataURL('image/webp', 0.92),
  targetCount: targetMeshes.length,
  meshCount: allMeshes.length,
  targetNames: targetMeshes.map((mesh) => mesh.name)
};
</script>
</body>
</html>`;
}

function createServer({ modelPath, config }) {
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(requestUrl.pathname);
    let filePath = null;

    if (pathname === '/render.html') {
      const body = renderPage(config);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(body);
      return;
    }
    if (pathname === '/model.glb') filePath = modelPath;
    if (pathname === '/three.module.js' || pathname === '/three.core.js') {
      filePath = path.join(THREE_ROOT, 'build', pathname.slice(1));
    }
    if (pathname.startsWith('/three-addons/')) {
      const relativePath = pathname.replace('/three-addons/', '');
      filePath = path.join(THREE_ROOT, 'examples', 'jsm', relativePath);
    }

    if (!filePath || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    response.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function renderAsset(browser, modelPath, asset, view) {
  const server = createServer({
    modelPath,
    config: { terms: asset.terms, direction: view.direction },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const pageErrors = [];
  const requestErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    // Chromium can report the GLB stream as aborted after GLTFLoader has
    // already completed parsing it. It is not a render failure.
    if (!request.url().endsWith('/model.glb')) {
      requestErrors.push(`${request.url()}: ${request.failure()?.errorText || 'failed'}`);
    }
  });

  try {
    await page.goto(`http://127.0.0.1:${address.port}/render.html`, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(() => Boolean(window.__topGymMuscleRender), null, { timeout: 30000 });
    } catch (error) {
      throw new Error([
        error.message,
        ...consoleErrors,
        ...pageErrors,
        ...requestErrors,
      ].join('\n'));
    }
    const result = await page.evaluate(() => window.__topGymMuscleRender);
    if (consoleErrors.length || pageErrors.length) {
      throw new Error([...consoleErrors, ...pageErrors].join('\n'));
    }
    if (requestErrors.length) {
      console.warn(requestErrors.join('\n'));
    }
    const outputDir = path.join(OUTPUT_ROOT, asset.slug);
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${view.name}.webp`);
    fs.writeFileSync(outputPath, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
    return { outputPath, targetCount: result.targetCount, meshCount: result.meshCount };
  } finally {
    await page.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.model || !fs.existsSync(path.resolve(args.model))) {
    throw new Error('Pass an existing GLB with --model, for example --model C:\\models\\kas.glb');
  }

  const requestedAssets = args.all ? assetsFromManifest() : PILOT_ASSETS;
  const modelNames = glbNodeNames(path.resolve(args.model));
  const assets = requestedAssets.filter((asset) => assetMatchesModel(asset, modelNames));
  const skipped = requestedAssets.filter((asset) => !assetMatchesModel(asset, modelNames));
  if (args.all) {
    console.log(`Rendering ${assets.length} of ${requestedAssets.length} unique mapped asset slugs.`);
    if (skipped.length) console.log(`Skipped without a confirmed GLB match: ${skipped.map((asset) => asset.slug).join(', ')}`);
  }
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });

  try {
    for (const asset of assets) {
      for (const view of ALL_VIEWS) {
        const result = await renderAsset(browser, path.resolve(args.model), asset, view);
        console.log(`${asset.label}/${view.name}: ${result.targetCount} target meshes, ${result.meshCount} total meshes`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
