'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'public', 'index.html');
const manifestPath = path.join(root, 'public', 'js', 'core', 'feature-manifest.js');
const saasAssetPath = path.join(root, 'public', 'js', 'pages', 'saas', 'saas.js');
const attendanceScriptPath = path.join(root, 'public', 'js', 'pages', 'attendance', 'attendance.js');
const attendanceStylePath = path.join(root, 'public', 'css', 'pages', 'attendance.css');
const memberCardScriptPath = path.join(root, 'public', 'js', 'member-digital-card.js');
const memberCardStylePath = path.join(root, 'public', 'css', 'components', 'member-digital-card.css');

function sha256File(filePath) {
    // Git checkouts may use CRLF on Windows and LF on Linux. Fingerprints must
    // represent the source text, not the checkout's line-ending convention.
    const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n?/g, '\n');
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
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

function fingerprintManifestAsset(manifest, assetUrl, version, expectedCount) {
    const escapedUrl = assetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(['"])${escapedUrl}(?:\\?v=[^'"]*)?\\1`, 'g');
    let matches = 0;
    const output = manifest.replace(pattern, (_match, quote) => {
        matches += 1;
        return `${quote}${assetUrl}?v=${version}${quote}`;
    });
    if (matches !== expectedCount) {
        throw new Error(`Expected ${expectedCount} references to ${assetUrl}; found ${matches}.`);
    }
    return output;
}

function planRuntimeAssetVersions(projectRoot = root) {
    const resolvedIndexPath = path.join(projectRoot, 'public', 'index.html');
    const resolvedManifestPath = path.join(projectRoot, 'public', 'js', 'core', 'feature-manifest.js');
    const resolvedBranchContextAssetPath = path.join(projectRoot, 'public', 'js', 'branch-context.js');
    const resolvedSaasAssetPath = path.join(projectRoot, 'public', 'js', 'pages', 'saas', 'saas.js');
    const resolvedAttendanceScriptPath = path.join(projectRoot, 'public', 'js', 'pages', 'attendance', 'attendance.js');
    const resolvedAttendanceStylePath = path.join(projectRoot, 'public', 'css', 'pages', 'attendance.css');
    const resolvedMemberCardScriptPath = path.join(projectRoot, 'public', 'js', 'member-digital-card.js');
    const resolvedMemberCardStylePath = path.join(projectRoot, 'public', 'css', 'components', 'member-digital-card.css');
    const index = fs.readFileSync(resolvedIndexPath, 'utf8');
    const manifest = fs.readFileSync(resolvedManifestPath, 'utf8');
    const branchContextVersion = sha256File(resolvedBranchContextAssetPath);
    const saasVersion = sha256File(resolvedSaasAssetPath);
    const attendanceScriptVersion = sha256File(resolvedAttendanceScriptPath);
    const attendanceStyleVersion = sha256File(resolvedAttendanceStylePath);
    const memberCardScriptVersion = sha256File(resolvedMemberCardScriptPath);
    const memberCardStyleVersion = sha256File(resolvedMemberCardStylePath);
    const versionedBranchContextIndex = replaceExactlyOnce(
        index,
        /(<script\b[^>]*\bsrc=["'])\/js\/branch-context\.js(?:\?v=[^"']*)?(["'][^>]*>)/i,
        (match, prefix, suffix) => `${prefix}/js/branch-context.js?v=${branchContextVersion}${suffix}`,
        'branch context script reference'
    );
    const versionedManifest = replaceExactlyOnce(
        manifest,
        /(['"])\/js\/pages\/saas\/saas\.js(?:\?v=[^'"]*)?\1/g,
        (match, quote) => `${quote}/js/pages/saas/saas.js?v=${saasVersion}${quote}`,
        'SaaS feature asset URL'
    );
    const withAttendanceScript = fingerprintManifestAsset(versionedManifest, '/js/pages/attendance/attendance.js', attendanceScriptVersion, 2);
    const withAttendanceStyle = fingerprintManifestAsset(withAttendanceScript, '/css/pages/attendance.css', attendanceStyleVersion, 2);
    const withMemberCardScript = fingerprintManifestAsset(withAttendanceStyle, '/js/member-digital-card.js', memberCardScriptVersion, 3);
    const withMemberCardStyle = fingerprintManifestAsset(withMemberCardScript, '/css/components/member-digital-card.css', memberCardStyleVersion, 3);
    const manifestContent = withMemberCardStyle.replace(/\r\n?/g, '\n');
    const manifestVersion = crypto.createHash('sha256').update(manifestContent, 'utf8').digest('hex').slice(0, 16);
    const versionedIndex = replaceExactlyOnce(
        versionedBranchContextIndex,
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
        generatedManifest: withMemberCardStyle,
        branchContextVersion,
        saasVersion,
        attendanceScriptVersion,
        attendanceStyleVersion,
        memberCardScriptVersion,
        memberCardStyleVersion,
        manifestVersion,
        stale: index !== versionedIndex || manifest !== withMemberCardStyle
    };
}

function run() {
    const plan = planRuntimeAssetVersions();
    if (process.argv.includes('--check')) {
        if (plan.stale) {
            console.error('[ASSET-VERSION-STALE] Run npm run build to synchronize immutable feature asset URLs.');
            process.exitCode = 1;
            return;
        }
        console.log(`[ASSET-VERSION-OK] branch context ${plan.branchContextVersion}; SaaS ${plan.saasVersion}; attendance JS ${plan.attendanceScriptVersion}; attendance CSS ${plan.attendanceStyleVersion}; manifest ${plan.manifestVersion}`);
        return;
    }

    if (plan.stale) {
        fs.writeFileSync(plan.manifestPath, plan.generatedManifest, 'utf8');
        fs.writeFileSync(plan.indexPath, plan.generatedIndex, 'utf8');
    }
    console.log(`[ASSET-VERSION-OK] branch context ${plan.branchContextVersion}; SaaS ${plan.saasVersion}; attendance JS ${plan.attendanceScriptVersion}; attendance CSS ${plan.attendanceStyleVersion}; manifest ${plan.manifestVersion}`);
}

if (require.main === module) run();

module.exports = { planRuntimeAssetVersions };
