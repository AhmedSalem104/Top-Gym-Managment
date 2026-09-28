'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'public', 'index.html');
const manifestPath = path.join(root, 'public', 'js', 'core', 'feature-manifest.js');
const saasAssetPath = path.join(root, 'public', 'js', 'pages', 'saas', 'saas.js');

function sha256File(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
}

function replaceExactlyOnce(source, pattern, replacement, description) {
    let matches = 0;
    const output = source.replace(pattern, (...args) => {
        matches += 1;
        return replacement(...args);
    });
    if (matches !== 1) throw new Error(`Expected exactly one ${description}; found ${matches}.`);
    return output;
}

function planRuntimeAssetVersions(projectRoot = root) {
    const resolvedIndexPath = path.join(projectRoot, 'public', 'index.html');
    const resolvedManifestPath = path.join(projectRoot, 'public', 'js', 'core', 'feature-manifest.js');
    const resolvedSaasAssetPath = path.join(projectRoot, 'public', 'js', 'pages', 'saas', 'saas.js');
    const index = fs.readFileSync(resolvedIndexPath, 'utf8');
    const manifest = fs.readFileSync(resolvedManifestPath, 'utf8');
    const saasVersion = sha256File(resolvedSaasAssetPath);
    const versionedManifest = replaceExactlyOnce(
        manifest,
        /(['"])\/js\/pages\/saas\/saas\.js(?:\?v=[^'"]*)?\1/g,
        (match, quote) => `${quote}/js/pages/saas/saas.js?v=${saasVersion}${quote}`,
        'SaaS feature asset URL'
    );
    const manifestVersion = crypto.createHash('sha256').update(versionedManifest, 'utf8').digest('hex').slice(0, 16);
    const versionedIndex = replaceExactlyOnce(
        index,
        /(<script\b[^>]*\bsrc=["'])\/js\/core\/feature-manifest\.js(?:\?v=[^"']*)?(["'][^>]*>)/i,
        (match, prefix, suffix) => `${prefix}/js/core/feature-manifest.js?v=${manifestVersion}${suffix}`,
        'HTML feature-manifest script reference'
    );

    return {
        indexPath: resolvedIndexPath,
        manifestPath: resolvedManifestPath,
        currentIndex: index,
        generatedIndex: versionedIndex,
        currentManifest: manifest,
        generatedManifest: versionedManifest,
        saasVersion,
        manifestVersion,
        stale: index !== versionedIndex || manifest !== versionedManifest
    };
}

function run() {
    const plan = planRuntimeAssetVersions();
    if (process.argv.includes('--check')) {
        if (plan.stale) {
            console.error('[ASSET-VERSION-STALE] Run npm run build to synchronize immutable SaaS asset URLs.');
            process.exitCode = 1;
            return;
        }
        console.log(`[ASSET-VERSION-OK] SaaS ${plan.saasVersion}; manifest ${plan.manifestVersion}`);
        return;
    }

    if (plan.stale) {
        fs.writeFileSync(plan.manifestPath, plan.generatedManifest, 'utf8');
        fs.writeFileSync(plan.indexPath, plan.generatedIndex, 'utf8');
    }
    console.log(`[ASSET-VERSION-OK] SaaS ${plan.saasVersion}; manifest ${plan.manifestVersion}`);
}

if (require.main === module) run();

module.exports = { planRuntimeAssetVersions };
