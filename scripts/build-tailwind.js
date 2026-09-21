'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cssRoot = path.join(root, 'public', 'css');
const tailwindSource = path.join(cssRoot, 'tailwind.source.css');

function banner(label, sourceName) {
    return [
        `/* Logic Fit ${label} stylesheet. */`,
        `/* Generated from public/css/${sourceName} by npm run build:css. */`,
        '/* Edit source layers, then rebuild; do not edit this artifact manually. */',
        ''
    ].join('\n');
}

function runTailwind(outputName, label) {
    const outputPath = path.join(cssRoot, outputName);
    const cliPath = path.join(root, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
    const result = spawnSync(process.execPath, [cliPath, '--input', tailwindSource, '--output', outputPath, '--minify'], {
        cwd: root,
        encoding: 'utf8',
        windowsHide: true
    });
    if (result.status !== 0) {
        throw new Error(`Tailwind build failed for ${outputName}:\n${result.error?.message || result.stderr || result.stdout || 'unknown error'}`);
    }
    const generated = fs.readFileSync(outputPath, 'utf8').replace(/^\s+/u, '');
    fs.writeFileSync(outputPath, `${banner(label, 'tailwind.source.css')}${generated}`, 'utf8');
    const hash = crypto.createHash('sha256').update(generated).digest('hex').slice(0, 12);
    console.log(`[TAILWIND-BUNDLE-OK] generated public/css/${outputName} (${hash})`);
    return hash;
}

function updateAuthenticatedEntryVersion(hash) {
    const indexPath = path.join(root, 'public', 'index.html');
    const source = fs.readFileSync(indexPath, 'utf8');
    if (!/\/css\/app-shell\.css\?v=[^"']+/u.test(source)) throw new Error('index.html app-shell stylesheet link was not found');
    const updated = source.replace(/(\/css\/app-shell\.css\?v=)[^"']+/u, `$1${hash}`);
    fs.writeFileSync(indexPath, updated, 'utf8');
}

function updateStylesheetVersions(fileName, hash) {
    const publicRoot = path.join(root, 'public');
    const htmlFiles = fs.readdirSync(publicRoot)
        .filter((fileName) => fileName.endsWith('.html'))
        .map((fileName) => path.join(publicRoot, fileName));
    const pattern = new RegExp(`(/css/${fileName.replace('.', '\\.') }\\?v=)[^"']+`, 'gu');
    htmlFiles.forEach((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        const updated = source.replace(pattern, `$1${hash}`);
        if (updated !== source) fs.writeFileSync(filePath, updated, 'utf8');
    });
}

function buildAll() {
    if (!fs.existsSync(tailwindSource)) throw new Error('public/css/tailwind.source.css is missing');
    const mainHash = runTailwind('main.css', 'shared application foundation');
    const appShellHash = runTailwind('app-shell.css', 'authenticated app-shell');
    const loginHash = runTailwind('login-entry.css', 'login entry');
    updateStylesheetVersions('main.css', mainHash);
    updateStylesheetVersions('login-entry.css', loginHash);
    updateAuthenticatedEntryVersion(appShellHash);
}

function buildLoginEntryStyles() {
    runTailwind('login-entry.css', 'login entry');
}

if (require.main === module) buildAll();

module.exports = { buildAll, buildLoginEntryStyles };
