'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cssRoot = path.join(root, 'public', 'css');
const entry = path.join(cssRoot, 'main.css');
const sourceEntry = path.join(cssRoot, 'main.source.css');
const errors = [];
const warnings = [];
const allowedImportantFiles = new Set([
  path.join(cssRoot, 'reset.css'),
  path.join(cssRoot, 'responsive.css'),
  path.join(cssRoot, 'print.css')
]);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function importsFrom(source) {
  return [...withoutComments(source).matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g)];
}

function checkCss(file) {
  const source = read(file);
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const opens = (withoutComments.match(/{/g) || []).length;
  const closes = (withoutComments.match(/}/g) || []).length;
  if (opens !== closes) errors.push(`${path.relative(root, file)} has unbalanced braces`);
  for (const importPath of importsFrom(source)) {
    const target = path.resolve(path.dirname(file), importPath[1]);
    if (!fs.existsSync(target)) errors.push(`${path.relative(root, file)} imports missing ${importPath[1]}`);
  }

  for (const media of source.matchAll(/@media\s*([^\{]*)\{/g)) {
    if (!media[1].trim()) errors.push(`${path.relative(root, file)} has an empty media query`);
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entryItem) => {
    const target = path.join(directory, entryItem.name);
    if (entryItem.isDirectory()) return walk(target);
    return entryItem.name.endsWith('.css') ? [target] : [];
  });
}

const cssFiles = walk(cssRoot);
if (!fs.existsSync(entry)) errors.push('public/css/main.css is missing');
for (const file of cssFiles) checkCss(file);

const graph = new Map();
for (const file of cssFiles) {
  const source = read(file);
  graph.set(file, importsFrom(source)
    .map((match) => path.resolve(path.dirname(file), match[1]))
    .filter((target) => fs.existsSync(target)));
}

const visiting = new Set();
const visited = new Set();
function visit(file, chain = []) {
  if (visiting.has(file)) {
    errors.push(`circular CSS import: ${[...chain, file].map((item) => path.relative(root, item)).join(' -> ')}`);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const target of graph.get(file) || []) visit(target, [...chain, file]);
  visiting.delete(file);
  visited.add(file);
}
if (fs.existsSync(sourceEntry)) visit(sourceEntry);

const definitions = new Map();
const uses = new Set();
for (const file of cssFiles) {
  const source = read(file);
  for (const match of source.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
    const name = match[1];
    if (!definitions.has(name)) definitions.set(name, []);
    definitions.get(name).push(file);
  }
  for (const match of source.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) uses.add(match[1]);
  if (!allowedImportantFiles.has(file) && file !== entry && source.includes('!important')) {
    warnings.push(`${path.relative(root, file)} uses !important; review if it is required`);
  }
}
for (const name of uses) if (!definitions.has(name)) errors.push(`undefined CSS variable ${name}`);

const tokenFile = path.join(cssRoot, 'tokens.css');
for (const [name, files] of definitions) {
  const nonTokenFiles = files.filter((file) => file !== tokenFile && file !== entry);
  if (nonTokenFiles.length > 1) warnings.push(`CSS variable ${name} is defined outside tokens.css more than once`);
}

const index = read(path.join(root, 'public', 'index.html'));
if (!index.includes('/css/main.css')) errors.push('public/index.html does not link the central stylesheet');
const stylesheetLinks = index.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi) || [];
if (stylesheetLinks.length !== 1) errors.push(`expected one linked stylesheet, found ${stylesheetLinks.length}`);
if (!fs.existsSync(sourceEntry)) errors.push('public/css/main.source.css is missing');
else if (!read(sourceEntry).includes('./tokens.css')) errors.push('main.source.css does not import tokens.css');
if (fs.existsSync(entry) && importsFrom(read(entry)).length) errors.push('main.css production bundle still contains active @import rules');
if (!read(path.join(cssRoot, 'print.css')).includes('@media print')) errors.push('print.css has no print media block');
if (read(path.join(root, 'package.json')).includes(['Styling', 'layer', 'disabled'].join(' '))) errors.push('stale disabled styling build remains in package.json');

if (errors.length) {
  console.error(`[STYLES-FAIL] ${errors.join('; ')}`);
  process.exitCode = 1;
} else {
  console.log(`[STYLES-OK] validated ${cssFiles.length} CSS files, imports, variables, media queries and stylesheet entrypoint`);
  if (warnings.length) console.warn(`[STYLES-WARN] ${warnings.join('; ')}`);
}
