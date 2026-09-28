'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { planRuntimeAssetVersions } = require('../../scripts/build-runtime-asset-versions');

function makeFixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'logicfit-runtime-asset-version-'));
    const publicDir = path.join(root, 'public');
    fs.mkdirSync(path.join(publicDir, 'js', 'core'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'js', 'pages', 'saas'), { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<script defer src="/js/core/feature-manifest.js?v=old"></script>\n');
    fs.writeFileSync(path.join(publicDir, 'js', 'core', 'feature-manifest.js'), "const features = { 'saas-billing': { scripts: ['/js/pages/saas/saas.js?v=old'] } };\n");
    fs.writeFileSync(path.join(publicDir, 'js', 'pages', 'saas', 'saas.js'), 'window.saasBuild = 1;\n');
    return root;
}

test('SaaS asset fingerprint changes with content and remains stable for unchanged content', () => {
    const root = makeFixture();
    try {
        const first = planRuntimeAssetVersions(root);
        const repeated = planRuntimeAssetVersions(root);
        assert.equal(first.saasVersion, repeated.saasVersion);
        assert.equal(first.manifestVersion, repeated.manifestVersion);

        fs.writeFileSync(path.join(root, 'public', 'js', 'pages', 'saas', 'saas.js'), 'window.saasBuild = 2;\n');
        const changedSaas = planRuntimeAssetVersions(root);
        assert.notEqual(changedSaas.saasVersion, first.saasVersion);
        assert.notEqual(changedSaas.manifestVersion, first.manifestVersion);
        assert.match(changedSaas.generatedManifest, new RegExp(`/js/pages/saas/saas\\.js\\?v=${changedSaas.saasVersion}`));

        fs.writeFileSync(path.join(root, 'public', 'js', 'core', 'feature-manifest.js'), changedSaas.generatedManifest.replace('saas-billing', 'saas-billing-updated'));
        const changedManifest = planRuntimeAssetVersions(root);
        assert.equal(changedManifest.saasVersion, changedSaas.saasVersion);
        assert.notEqual(changedManifest.manifestVersion, changedSaas.manifestVersion);
        assert.match(changedManifest.generatedIndex, new RegExp(`/js/core/feature-manifest\\.js\\?v=${changedManifest.manifestVersion}`));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('content fingerprints are stable across Windows and Unix line endings', () => {
    const root = makeFixture();
    try {
        const first = planRuntimeAssetVersions(root);
        for (const relativePath of [
            'public/index.html',
            'public/js/core/feature-manifest.js',
            'public/js/pages/saas/saas.js'
        ]) {
            const filePath = path.join(root, relativePath);
            fs.writeFileSync(filePath, fs.readFileSync(filePath, 'utf8').replace(/\n/g, '\r\n'));
        }
        const crlf = planRuntimeAssetVersions(root);

        assert.equal(crlf.saasVersion, first.saasVersion);
        assert.equal(crlf.manifestVersion, first.manifestVersion);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('checked-in HTML and manifest are synchronized to content-derived immutable SaaS asset URLs', () => {
    const plan = planRuntimeAssetVersions();

    assert.match(plan.generatedManifest, new RegExp(`/js/pages/saas/saas\\.js\\?v=${plan.saasVersion}`));
    assert.match(plan.generatedIndex, new RegExp(`/js/core/feature-manifest\\.js\\?v=${plan.manifestVersion}`));
    assert.equal(plan.stale, false, 'run npm run build after changing SaaS runtime source so deployed HTML cannot retain an old immutable URL');
});
