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
    fs.mkdirSync(path.join(publicDir, 'js'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'js', 'pages', 'saas'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'js', 'pages', 'coaching'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'js', 'pages', 'library'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'js', 'pages', 'management'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'js', 'pages', 'attendance'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'css', 'pages'), { recursive: true });
    fs.mkdirSync(path.join(publicDir, 'css', 'components'), { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<meta name="auth-surface-stylesheet" content="/css/login-entry.css?v=old">\n<link rel="stylesheet" href="/css/app-shell.css?v=old">\n<script defer src="/js/branch-context.js?v=old"></script>\n<script defer src="/js/core/feature-manifest.js?v=old"></script>\n<script defer src="/js/core/i18n.js?v=old"></script>\n');
    fs.writeFileSync(path.join(publicDir, 'login.html'), '<script defer src="/js/core/i18n.js?v=old"></script>\n');
    fs.writeFileSync(path.join(publicDir, 'js', 'core', 'feature-manifest.js'), "const features = { 'saas-billing': { scripts: ['/js/pages/saas/saas.js?v=old'] }, 'portal-analytics': { scripts: ['/js/pages/management/portal-analytics.js?v=old'] }, coaching: { scripts: ['/js/pages/coaching/coaching.js?v=old'] }, library: { scripts: ['/js/pages/library/library.js?v=old'] }, attendance: { styles: ['/css/pages/attendance.css?v=old', '/css/components/member-digital-card.css?v=old'], scripts: ['/js/pages/attendance/attendance.js?v=old', '/js/member-digital-card.js?v=old'] }, members: { styles: ['/css/pages/attendance.css?v=old', '/css/components/member-digital-card.css?v=old'], scripts: ['/js/pages/attendance/attendance.js?v=old', '/js/member-digital-card.js?v=old'] }, 'member-details': { styles: ['/css/components/member-digital-card.css?v=old'], scripts: ['/js/member-digital-card.js?v=old'] } };\n");
    fs.writeFileSync(path.join(publicDir, 'js', 'branch-context.js'), 'window.branchContextBuild = 1;\n');
    fs.writeFileSync(path.join(publicDir, 'js', 'core', 'i18n.js'), 'window.localeBuild = 1;\n');
    fs.writeFileSync(path.join(publicDir, 'js', 'pages', 'saas', 'saas.js'), 'window.saasBuild = 1;\n');
    fs.writeFileSync(path.join(publicDir, 'js', 'pages', 'coaching', 'coaching.js'), 'window.coachingBuild = 1;\n');
    fs.writeFileSync(path.join(publicDir, 'js', 'pages', 'library', 'library.js'), 'window.libraryBuild = 1;\n');
    fs.writeFileSync(path.join(publicDir, 'js', 'pages', 'management', 'portal-analytics.js'), 'window.portalAnalyticsBuild = 1;\n');
    fs.writeFileSync(path.join(publicDir, 'js', 'pages', 'attendance', 'attendance.js'), 'window.attendanceBuild = 1;\n');
    fs.writeFileSync(path.join(publicDir, 'js', 'member-digital-card.js'), 'window.memberCardBuild = 1;\n');
    fs.writeFileSync(path.join(publicDir, 'css', 'pages', 'attendance.css'), '.attendance { color: blue; }\n');
    fs.writeFileSync(path.join(publicDir, 'css', 'login-entry.css'), '.auth-screen { display: grid; }\n');
    fs.writeFileSync(path.join(publicDir, 'css', 'app-shell.css'), '.shell { color: blue; }\n');
    fs.writeFileSync(path.join(publicDir, 'css', 'components', 'member-digital-card.css'), '.card { color: blue; }\n');
    return root;
}

test('SaaS asset fingerprint changes with content and remains stable for unchanged content', () => {
    const root = makeFixture();
    try {
        const first = planRuntimeAssetVersions(root);
        const repeated = planRuntimeAssetVersions(root);
        assert.equal(first.saasVersion, repeated.saasVersion);
        assert.equal(first.coachingVersion, repeated.coachingVersion);
        assert.equal(first.libraryVersion, repeated.libraryVersion);
        assert.equal(first.portalAnalyticsVersion, repeated.portalAnalyticsVersion);
        assert.equal(first.branchContextVersion, repeated.branchContextVersion);
        assert.equal(first.appShellStyleVersion, repeated.appShellStyleVersion);
        assert.equal(first.authSurfaceStyleVersion, repeated.authSurfaceStyleVersion);
        assert.equal(first.i18nVersion, repeated.i18nVersion);
        assert.equal(first.manifestVersion, repeated.manifestVersion);

        fs.writeFileSync(path.join(root, 'public', 'js', 'pages', 'saas', 'saas.js'), 'window.saasBuild = 2;\n');
        const changedSaas = planRuntimeAssetVersions(root);
        assert.notEqual(changedSaas.saasVersion, first.saasVersion);
        assert.notEqual(changedSaas.manifestVersion, first.manifestVersion);
        assert.match(changedSaas.generatedManifest, new RegExp(`/js/pages/saas/saas\\.js\\?v=${changedSaas.saasVersion}`));

        fs.writeFileSync(path.join(root, 'public', 'js', 'pages', 'management', 'portal-analytics.js'), 'window.portalAnalyticsBuild = 2;\n');
        const changedPortalAnalytics = planRuntimeAssetVersions(root);
        assert.notEqual(changedPortalAnalytics.portalAnalyticsVersion, first.portalAnalyticsVersion);
        assert.notEqual(changedPortalAnalytics.manifestVersion, first.manifestVersion);
        assert.match(changedPortalAnalytics.generatedManifest, new RegExp(`/js/pages/management/portal-analytics\\.js\\?v=${changedPortalAnalytics.portalAnalyticsVersion}`));

        fs.writeFileSync(path.join(root, 'public', 'js', 'pages', 'coaching', 'coaching.js'), 'window.coachingBuild = 2;\n');
        const changedCoaching = planRuntimeAssetVersions(root);
        assert.notEqual(changedCoaching.coachingVersion, first.coachingVersion);
        assert.notEqual(changedCoaching.manifestVersion, first.manifestVersion);
        assert.match(changedCoaching.generatedManifest, new RegExp(`/js/pages/coaching/coaching\\.js\\?v=${changedCoaching.coachingVersion}`));

        fs.writeFileSync(path.join(root, 'public', 'js', 'pages', 'library', 'library.js'), 'window.libraryBuild = 2;\n');
        const changedLibrary = planRuntimeAssetVersions(root);
        assert.notEqual(changedLibrary.libraryVersion, first.libraryVersion);
        assert.notEqual(changedLibrary.manifestVersion, first.manifestVersion);
        assert.match(changedLibrary.generatedManifest, new RegExp(`/js/pages/library/library\\.js\\?v=${changedLibrary.libraryVersion}`));

        fs.writeFileSync(path.join(root, 'public', 'js', 'core', 'feature-manifest.js'), changedSaas.generatedManifest.replace('saas-billing', 'saas-billing-updated'));
        const changedManifest = planRuntimeAssetVersions(root);
        assert.equal(changedManifest.saasVersion, changedSaas.saasVersion);
        assert.notEqual(changedManifest.manifestVersion, changedSaas.manifestVersion);
        assert.match(changedManifest.generatedIndex, new RegExp(`/js/core/feature-manifest\\.js\\?v=${changedManifest.manifestVersion}`));

        fs.writeFileSync(path.join(root, 'public', 'js', 'branch-context.js'), 'window.branchContextBuild = 2;\n');
        const changedBranchContext = planRuntimeAssetVersions(root);
        assert.notEqual(changedBranchContext.branchContextVersion, first.branchContextVersion);
        assert.match(changedBranchContext.generatedIndex, new RegExp(`/js/branch-context\\.js\\?v=${changedBranchContext.branchContextVersion}`));

        fs.writeFileSync(path.join(root, 'public', 'css', 'app-shell.css'), '.shell { color: navy; }\n');
        const changedAppShellStyle = planRuntimeAssetVersions(root);
        assert.notEqual(changedAppShellStyle.appShellStyleVersion, first.appShellStyleVersion);
        assert.match(changedAppShellStyle.generatedIndex, new RegExp(`/css/app-shell\\.css\\?v=${changedAppShellStyle.appShellStyleVersion}`));

        fs.writeFileSync(path.join(root, 'public', 'css', 'login-entry.css'), '.auth-screen { display: flex; }\n');
        const changedAuthSurfaceStyle = planRuntimeAssetVersions(root);
        assert.notEqual(changedAuthSurfaceStyle.authSurfaceStyleVersion, first.authSurfaceStyleVersion);
        assert.match(changedAuthSurfaceStyle.generatedIndex, new RegExp(`/css/login-entry\\.css\\?v=${changedAuthSurfaceStyle.authSurfaceStyleVersion}`));
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
            'public/css/app-shell.css',
            'public/css/login-entry.css',
            'public/js/branch-context.js',
            'public/js/core/feature-manifest.js',
            'public/js/pages/saas/saas.js',
            'public/js/pages/coaching/coaching.js',
            'public/js/pages/library/library.js',
            'public/js/pages/management/portal-analytics.js',
            'public/js/pages/attendance/attendance.js',
            'public/css/pages/attendance.css',
            'public/js/member-digital-card.js',
            'public/css/components/member-digital-card.css'
        ]) {
            const filePath = path.join(root, relativePath);
            fs.writeFileSync(filePath, fs.readFileSync(filePath, 'utf8').replace(/\n/g, '\r\n'));
        }
        const crlf = planRuntimeAssetVersions(root);

        assert.equal(crlf.saasVersion, first.saasVersion);
        assert.equal(crlf.coachingVersion, first.coachingVersion);
        assert.equal(crlf.libraryVersion, first.libraryVersion);
        assert.equal(crlf.portalAnalyticsVersion, first.portalAnalyticsVersion);
        assert.equal(crlf.branchContextVersion, first.branchContextVersion);
        assert.equal(crlf.appShellStyleVersion, first.appShellStyleVersion);
        assert.equal(crlf.authSurfaceStyleVersion, first.authSurfaceStyleVersion);
        assert.equal(crlf.manifestVersion, first.manifestVersion);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('attendance JS and CSS URLs track content and remain stable for unchanged files', () => {
    const root = makeFixture();
    try {
        const first = planRuntimeAssetVersions(root);
        const repeated = planRuntimeAssetVersions(root);
        assert.equal(first.attendanceScriptVersion, repeated.attendanceScriptVersion);
        assert.equal(first.attendanceStyleVersion, repeated.attendanceStyleVersion);
        assert.equal(first.manifestVersion, repeated.manifestVersion);
        assert.equal((first.generatedManifest.match(new RegExp(`attendance\\.js\\?v=${first.attendanceScriptVersion}`, 'g')) || []).length, 2);
        assert.equal((first.generatedManifest.match(new RegExp(`attendance\\.css\\?v=${first.attendanceStyleVersion}`, 'g')) || []).length, 2);

        fs.writeFileSync(path.join(root, 'public', 'js', 'pages', 'attendance', 'attendance.js'), 'window.attendanceBuild = 2;\n');
        const changedScript = planRuntimeAssetVersions(root);
        assert.notEqual(changedScript.attendanceScriptVersion, first.attendanceScriptVersion);
        assert.notEqual(changedScript.manifestVersion, first.manifestVersion);

        fs.writeFileSync(path.join(root, 'public', 'css', 'pages', 'attendance.css'), '.attendance { color: navy; }\n');
        const changedStyle = planRuntimeAssetVersions(root);
        assert.notEqual(changedStyle.attendanceStyleVersion, first.attendanceStyleVersion);
        assert.notEqual(changedStyle.manifestVersion, changedScript.manifestVersion);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('member digital card JS and CSS URLs track content-derived fingerprints', () => {
    const root = makeFixture();
    try {
        const first = planRuntimeAssetVersions(root);
        assert.equal((first.generatedManifest.match(new RegExp(`member-digital-card\\.js\\?v=${first.memberCardScriptVersion}`, 'g')) || []).length, 3);
        assert.equal((first.generatedManifest.match(new RegExp(`member-digital-card\\.css\\?v=${first.memberCardStyleVersion}`, 'g')) || []).length, 3);
        fs.writeFileSync(path.join(root, 'public', 'js', 'member-digital-card.js'), 'window.memberCardBuild = 2;\n');
        const changed = planRuntimeAssetVersions(root);
        assert.notEqual(changed.memberCardScriptVersion, first.memberCardScriptVersion);
        assert.notEqual(changed.manifestVersion, first.manifestVersion);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Portal Analytics fingerprint is included in the generated feature manifest', () => {
    const root = makeFixture();
    try {
        const first = planRuntimeAssetVersions(root);
        assert.equal((first.generatedManifest.match(new RegExp(`portal-analytics\\.js\\?v=${first.portalAnalyticsVersion}`, 'g')) || []).length, 1);
        fs.writeFileSync(path.join(root, 'public', 'js', 'pages', 'management', 'portal-analytics.js'), 'window.portalAnalyticsBuild = 2;\n');
        const changed = planRuntimeAssetVersions(root);
        assert.notEqual(changed.portalAnalyticsVersion, first.portalAnalyticsVersion);
        assert.notEqual(changed.manifestVersion, first.manifestVersion);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Coaching fingerprint is included in the generated feature manifest', () => {
    const root = makeFixture();
    try {
        const first = planRuntimeAssetVersions(root);
        assert.equal((first.generatedManifest.match(new RegExp(`coaching\\.js\\?v=${first.coachingVersion}`, 'g')) || []).length, 1);
        fs.writeFileSync(path.join(root, 'public', 'js', 'pages', 'coaching', 'coaching.js'), 'window.coachingBuild = 2;\n');
        const changed = planRuntimeAssetVersions(root);
        assert.notEqual(changed.coachingVersion, first.coachingVersion);
        assert.notEqual(changed.manifestVersion, first.manifestVersion);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Library fingerprint is included in the generated feature manifest', () => {
    const root = makeFixture();
    try {
        const first = planRuntimeAssetVersions(root);
        assert.equal((first.generatedManifest.match(new RegExp(`library\\.js\\?v=${first.libraryVersion}`, 'g')) || []).length, 1);
        fs.writeFileSync(path.join(root, 'public', 'js', 'pages', 'library', 'library.js'), 'window.libraryBuild = 2;\n');
        const changed = planRuntimeAssetVersions(root);
        assert.notEqual(changed.libraryVersion, first.libraryVersion);
        assert.notEqual(changed.manifestVersion, first.manifestVersion);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('central i18n fingerprint updates every HTML consumer without changing locale contracts', () => {
    const root = makeFixture();
    try {
        const first = planRuntimeAssetVersions(root);
        assert.equal(first.generatedHtmlFiles.size, 2);
        assert.match(first.generatedIndex, new RegExp(`/js/core/i18n\\.js\\?v=${first.i18nVersion}`));
        assert.match(first.generatedHtmlFiles.get(path.join(root, 'public', 'login.html')), new RegExp(`/js/core/i18n\\.js\\?v=${first.i18nVersion}`));

        fs.writeFileSync(path.join(root, 'public', 'js', 'core', 'i18n.js'), 'window.localeBuild = 2;\n');
        const changed = planRuntimeAssetVersions(root);
        assert.notEqual(changed.i18nVersion, first.i18nVersion);
        assert.match(changed.generatedIndex, new RegExp(`/js/core/i18n\\.js\\?v=${changed.i18nVersion}`));
        assert.match(changed.generatedHtmlFiles.get(path.join(root, 'public', 'login.html')), new RegExp(`/js/core/i18n\\.js\\?v=${changed.i18nVersion}`));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('checked-in HTML and manifest are synchronized to content-derived immutable SaaS asset URLs', () => {
    const plan = planRuntimeAssetVersions();

    assert.match(plan.generatedManifest, new RegExp(`/js/pages/saas/saas\\.js\\?v=${plan.saasVersion}`));
    assert.match(plan.generatedManifest, new RegExp(`/js/pages/management/portal-analytics\\.js\\?v=${plan.portalAnalyticsVersion}`));
    assert.match(plan.generatedManifest, new RegExp(`/js/pages/coaching/coaching\\.js\\?v=${plan.coachingVersion}`));
    assert.match(plan.generatedManifest, new RegExp(`/js/pages/library/library\\.js\\?v=${plan.libraryVersion}`));
    assert.match(plan.generatedIndex, new RegExp(`/js/core/feature-manifest\\.js\\?v=${plan.manifestVersion}`));
    assert.match(plan.generatedIndex, new RegExp(`/js/branch-context\\.js\\?v=${plan.branchContextVersion}`));
    assert.match(plan.generatedIndex, new RegExp(`/css/app-shell\\.css\\?v=${plan.appShellStyleVersion}`));
    assert.match(plan.generatedIndex, new RegExp(`/css/login-entry\\.css\\?v=${plan.authSurfaceStyleVersion}`));
    assert.match(plan.generatedIndex, new RegExp(`/js/core/i18n\\.js\\?v=${plan.i18nVersion}`));
    assert.equal(plan.generatedHtmlFiles.size, 0, 'all HTML consumers of central i18n must match its content fingerprint');
    assert.equal(plan.stale, false, 'run npm run build after changing SaaS runtime source so deployed HTML cannot retain an old immutable URL');
});
