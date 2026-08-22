'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const cssRoot = path.join(root, 'public', 'css');
const sourceEntry = path.join(cssRoot, 'main.source.css');
const output = path.join(cssRoot, 'main.css');
const importPattern = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g;

function expand(file, chain = []) {
    const absolute = path.resolve(file);
    if (chain.includes(absolute)) {
        throw new Error(`Circular CSS import: ${[...chain, absolute].map((item) => path.relative(root, item)).join(' -> ')}`);
    }
    const source = fs.readFileSync(absolute, 'utf8');
    return source.replace(importPattern, (_, importPath) => {
        if (/^(?:https?:|data:)/i.test(importPath)) return `@import url("${importPath}");`;
        const target = path.resolve(path.dirname(absolute), importPath);
        if (!fs.existsSync(target)) throw new Error(`${path.relative(root, absolute)} imports missing ${importPath}`);
        return `\n/* TOP GYM layer: ${path.relative(root, target).replaceAll('\\', '/')} */\n${expand(target, [...chain, absolute])}\n/* END TOP GYM layer */\n`;
    });
}

if (!fs.existsSync(sourceEntry)) throw new Error('public/css/main.source.css is missing');

const banner = [
    '/* TOP GYM production stylesheet. */',
    '/* Generated from public/css/main.source.css by npm run build:css. */',
    '/* Edit the layer files, then rebuild; do not edit this artifact manually. */',
    ''
].join('\n');

const bundledCss = `${expand(sourceEntry).replace(/\s+$/u, '')}\n`;
fs.writeFileSync(output, banner + bundledCss, 'utf8');
console.log(`[CSS-BUNDLE-OK] generated ${path.relative(root, output)} from the organized CSS layers`);
