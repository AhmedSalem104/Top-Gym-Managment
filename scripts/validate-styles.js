'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cssRoot = path.join(root, 'public', 'css');
const errors = [];
const warnings = [];
const expectedFiles = new Set([
  'app-shell.css',
  'app-shell.source.css',
  'functional-state.css',
  'main.css',
  'main.source.css',
  'tailwind.source.css',
  'shared-components.source.css'
]);
const allowedFiles = new Set([...expectedFiles, 'login-entry.css']);

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function importsFrom(source) {
  return [...source.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g)];
}

const cssFiles = fs.readdirSync(cssRoot, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.css'))
  .map((entry) => entry.name)
  .sort();

for (const file of cssFiles) {
  if (!allowedFiles.has(file)) errors.push(`legacy stylesheet remains active: public/css/${file}`);
}
for (const file of expectedFiles) {
  if (!cssFiles.includes(file)) errors.push(`required reset stylesheet is missing: public/css/${file}`);
}

for (const file of cssFiles) {
  const absolute = path.join(cssRoot, file);
  const source = read(absolute);
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  if ((withoutComments.match(/{/g) || []).length !== (withoutComments.match(/}/g) || []).length) {
    errors.push(`${relative(absolute)} has unbalanced braces`);
  }
  for (const importPath of importsFrom(source)) {
    if (importPath[1] === 'tailwindcss') continue;
    const target = path.resolve(path.dirname(absolute), importPath[1]);
    if (!fs.existsSync(target)) errors.push(`${relative(absolute)} imports missing ${importPath[1]}`);
  }
  if (file === 'functional-state.css' && /(?:--[\w-]+\s*:|#[0-9a-f]{3,8}\b|rgb\(|hsl\(|font-family\s*:|background\s*:|color\s*:)/i.test(withoutComments)) {
    errors.push('functional-state.css contains visual design declarations');
  }
}

const sourceEntry = path.join(cssRoot, 'main.source.css');
const shellSourceEntry = path.join(cssRoot, 'app-shell.source.css');
const tailwindSourceEntry = path.join(cssRoot, 'tailwind.source.css');
const tailwindImport = '@import url("./tailwind.source.css");';
if (read(sourceEntry).trim().split(/\r?\n/).filter(Boolean).at(-1) !== tailwindImport) {
  errors.push(`${relative(sourceEntry)} does not point to the shared Tailwind source`);
}
if (read(shellSourceEntry).trim().split(/\r?\n/).filter(Boolean).at(-1) !== tailwindImport) {
  errors.push(`${relative(shellSourceEntry)} does not point to the shared Tailwind source`);
}
if (!read(tailwindSourceEntry).includes('@import "tailwindcss"') || !read(tailwindSourceEntry).includes('./functional-state.css')) {
  errors.push('tailwind.source.css must include Tailwind and the functional state contract');
}

for (const file of ['main.css', 'app-shell.css', 'login-entry.css']) {
  const source = read(path.join(cssRoot, file));
  if (importsFrom(source).length) errors.push(`${file} contains active @import rules`);
}

const index = read(path.join(root, 'public', 'index.html'));
const login = read(path.join(root, 'public', 'login.html'));
if (!/href=["']\/css\/app-shell\.css(?:\?|["'])/i.test(index)) errors.push('index.html does not link app-shell.css');
if ((index.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi) || []).length !== 1) errors.push('index.html must load one stylesheet during reset');
if (!/href=["']\/css\/login-entry\.css(?:\?|["'])/i.test(login)) errors.push('login.html does not link login-entry.css');
if (/\/css\/(?:pages|components)|\/css\/(?:tokens|theme|responsive|print|layout|reset|typography|utilities)\.css/i.test(`${index}\n${login}`)) errors.push('HTML links a removed legacy stylesheet');

const manifest = read(path.join(root, 'public/js/core/feature-manifest.js'));
if (/styles\s*:\s*\[[^\]]*\/css\//s.test(manifest)) errors.push('feature manifest still lazy-loads legacy CSS');

if (errors.length) {
  console.error(`[STYLES-RESET-FAIL] ${errors.join('; ')}`);
  process.exitCode = 1;
} else {
    console.log(`[STYLES-OK] ${cssFiles.length} CSS artifacts are generated entrypoints plus the Tailwind source and functional-state.css`);
  if (warnings.length) console.warn(`[STYLES-RESET-WARN] ${warnings.join('; ')}`);
}
