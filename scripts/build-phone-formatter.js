'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'public', 'js', 'vendor');

fs.mkdirSync(outputDirectory, { recursive: true });

esbuild.build({
    entryPoints: [path.join(root, 'scripts', 'phone-formatter-entry.js')],
    bundle: true,
    format: 'iife',
    outfile: path.join(outputDirectory, 'phone-formatter.js'),
    minify: true,
    target: 'es2020',
    legalComments: 'none',
    sourcemap: false
}).then(() => {
    console.log('[PHONE-FORMATTER-BUNDLE-OK] generated public/js/vendor/phone-formatter.js');
}).catch((error) => {
    console.error('[PHONE-FORMATTER-BUNDLE-FAIL]', error);
    process.exitCode = 1;
});
