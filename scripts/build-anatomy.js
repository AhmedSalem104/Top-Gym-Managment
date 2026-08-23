'use strict';

const esbuild = require('esbuild');

esbuild.build({
    entryPoints: ['src/client/anatomy/index.ts'],
    bundle: true,
    format: 'iife',
    globalName: 'TopGymAnatomyBundle',
    outfile: 'public/js/member-portal-anatomy.js',
    minify: true,
    target: 'es2020',
    legalComments: 'none',
    sourcemap: false
}).then(() => {
    console.log('[ANATOMY-BUNDLE-OK] generated public/js/member-portal-anatomy.js');
}).catch((error) => {
    console.error('[ANATOMY-BUNDLE-FAIL]', error);
    process.exitCode = 1;
});
