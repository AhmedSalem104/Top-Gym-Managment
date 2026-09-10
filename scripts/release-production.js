'use strict';

const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'production-release.json');
const REMOTE_SCRIPT_PATH = path.join(__dirname, 'release-production-remote.sh');
const RELEASE_CONFIRMATION = 'I_UNDERSTAND_PRODUCTION_RELEASE';
const ALLOWED_DIRTY_PATHS = new Set([
    'docs/COMPLETE-SCREEN-INVENTORY.md',
    'docs/SYSTEM-SCREENS-API-QA-INVENTORY.md'
]);

function fail(message, code = 'PRODUCTION_RELEASE_FAILED') {
    const error = new Error(message);
    error.code = code;
    throw error;
}

function commandName(name) {
    return process.platform === 'win32' && !name.endsWith('.exe') && !name.endsWith('.cmd') ? `${name}.exe` : name;
}

function run(command, args, options = {}) {
    const result = childProcess.spawnSync(commandName(command), args, {
        cwd: ROOT,
        encoding: options.encoding === undefined ? 'utf8' : options.encoding,
        stdio: options.stdio || 'pipe',
        windowsHide: true,
        input: options.input,
        timeout: options.timeout
    });
    if (result.error) fail('Release command could not be started.', options.code || 'RELEASE_COMMAND_START_FAILED');
    return result;
}

function runChecked(command, args, options = {}) {
    const result = run(command, args, options);
    if (result.status !== 0) fail(options.failureMessage || 'Release command failed.', options.code || 'RELEASE_COMMAND_FAILED');
    return result;
}

function expandPath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const userProfile = process.env.USERPROFILE || process.env.HOME || '';
    return raw.replace(/^%USERPROFILE%/i, userProfile).replace(/^~(?=\\|\/|$)/, userProfile);
}

function loadReleaseConfig() {
    let config;
    try {
        config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (_) {
        fail('Production release configuration is unavailable.', 'RELEASE_CONFIG_MISSING');
    }
    const required = ['host', 'user', 'identityPath', 'appRoot', 'containerName', 'nodeImage', 'internalPort', 'candidatePort'];
    for (const key of required) if (config[key] === undefined || config[key] === null || String(config[key]).trim() === '') fail(`Release configuration is missing ${key}.`, 'RELEASE_CONFIG_INVALID');
    const identityPath = expandPath(config.identityPath);
    if (!identityPath || !fs.existsSync(identityPath)) fail('Canonical production SSH identity is unavailable locally.', 'RELEASE_SSH_IDENTITY_MISSING');
    if (!Number.isInteger(Number(config.internalPort)) || !Number.isInteger(Number(config.candidatePort))) fail('Release ports are invalid.', 'RELEASE_CONFIG_INVALID');
    if (Number(config.internalPort) === Number(config.candidatePort)) fail('Release ports must be distinct.', 'RELEASE_CONFIG_INVALID');
    return { ...config, identityPath };
}

function gitOutput(args) {
    return runChecked('git', args, { failureMessage: 'Git preflight failed.', code: 'RELEASE_GIT_PREFLIGHT_FAILED' }).stdout.trim();
}

function resolveReleaseSha(requestedSha) {
    const value = String(requestedSha || '').trim();
    if (value && !/^[0-9a-f]{40}$/i.test(value)) fail('Release SHA must be a full commit SHA.', 'RELEASE_SHA_INVALID');
    const ref = value || 'HEAD';
    return gitOutput(['rev-parse', '--verify', `${ref}^{commit}`]);
}

function dirtyPaths() {
    const output = runChecked('git', ['status', '--porcelain=v1', '--untracked-files=all'], { failureMessage: 'Git worktree inspection failed.', code: 'RELEASE_GIT_PREFLIGHT_FAILED' }).stdout;
    return output ? output.split(/\r?\n/).map((line) => line.slice(3).trim()).filter(Boolean) : [];
}

function assertReleaseWorktreeSafe() {
    const dirty = dirtyPaths();
    const unsafe = dirty.filter((entry) => {
        const file = entry.includes(' -> ') ? entry.split(' -> ').pop() : entry;
        return !ALLOWED_DIRTY_PATHS.has(file.replace(/\\/g, '/'));
    });
    if (unsafe.length) fail('Worktree contains unapproved changes; refusing release.', 'RELEASE_WORKTREE_DIRTY');
    return { cleanForRelease: true, excludedUserChanges: dirty.length };
}

function evaluateReleaseGates(gates = {}) {
    const required = ['backup', 'backupVerification', 'migration', 'security', 'lock', 'sha', 'health'];
    const failed = required.filter((name) => gates[name] !== true);
    return { pass: failed.length === 0, failed, required };
}

function runLocalPreflight() {
    const checks = [
        ['node', ['--check', 'scripts/release-production.js']],
        ['node', ['--check', 'scripts/production-migration-gate.js']],
        ['node', ['--check', 'scripts/production-security-gate.js']],
        ['node', ['--check', 'scripts/verify-production-backup.js']],
        ['node', ['--check', 'scripts/production-smoke.js']],
        ['node', ['scripts/release-pipeline-self-test.js']]
    ];
    for (const [command, args] of checks) runChecked(command, args, { stdio: 'ignore', failureMessage: 'Release pipeline self-check failed.', code: 'RELEASE_LOCAL_PREFLIGHT_FAILED' });
    runChecked('git', ['diff', '--check'], { stdio: 'ignore', failureMessage: 'Git whitespace check failed.', code: 'RELEASE_DIFF_CHECK_FAILED' });
    return true;
}

function archiveCommit(sha, tempDir) {
    const tarName = `logicfit-release-${sha}.tar`;
    const tarPath = path.join(tempDir, tarName);
    const archiveName = `${tarName}.gz`;
    const archivePath = path.join(tempDir, archiveName);
    runChecked('git', ['archive', '--format=tar', '--output', tarPath, sha], { stdio: 'ignore', failureMessage: 'Immutable release archive could not be created.', code: 'RELEASE_ARCHIVE_FAILED' });
    try {
        fs.writeFileSync(archivePath, zlib.gzipSync(fs.readFileSync(tarPath), { level: 6 }));
    } finally {
        fs.unlinkSync(tarPath);
    }
    if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size <= 0) fail('Immutable release archive is empty.', 'RELEASE_ARCHIVE_INVALID');
    return { archiveName, archivePath };
}

function remoteTarget(config, fileName) {
    return `${config.user}@${config.host}:/tmp/${fileName}`;
}

function sshArgs(config) {
    return ['-i', config.identityPath, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', `${config.user}@${config.host}`];
}

function uploadArchive(config, archivePath, archiveName) {
    runChecked('scp', ['-i', config.identityPath, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=15', archivePath, remoteTarget(config, archiveName)], { stdio: 'ignore', timeout: 120000, failureMessage: 'Production release archive upload failed.', code: 'RELEASE_UPLOAD_FAILED' });
}

function renderRemoteScript(config, sha, archiveName) {
    let script;
    try {
        script = fs.readFileSync(REMOTE_SCRIPT_PATH, 'utf8');
    } catch (_) {
        fail('Remote release runner is unavailable.', 'RELEASE_REMOTE_RUNNER_MISSING');
    }
    const replacements = {
        __RELEASE_SHA__: sha,
        __APP_ROOT__: config.appRoot,
        __NODE_IMAGE__: config.nodeImage,
        __CONTAINER_NAME__: config.containerName,
        __INTERNAL_PORT__: String(config.internalPort),
        __CANDIDATE_PORT__: String(config.candidatePort),
        __ARCHIVE_NAME__: archiveName
    };
    for (const [placeholder, value] of Object.entries(replacements)) {
        if (!/^[\w./:@+-]+$/.test(String(value))) fail('Release configuration contains unsafe remote values.', 'RELEASE_CONFIG_UNSAFE');
        script = script.split(placeholder).join(String(value));
    }
    if (/__[A-Z0-9_]+__/.test(script)) fail('Remote release runner has unresolved placeholders.', 'RELEASE_REMOTE_RUNNER_INVALID');
    return script;
}

function runRemoteRelease(config, script) {
    const result = run('ssh', [...sshArgs(config), 'bash', '-s'], { input: script, encoding: 'utf8', timeout: 900000 });
    if (result.error || result.status !== 0) fail('Production release remote gate failed; previous release was preserved where rollback was possible.', 'RELEASE_REMOTE_FAILED');
    const safeLines = String(result.stdout || '').split(/\r?\n/).filter((line) => /^(RELEASE_|BACKUP_|MIGRATION_|RLS_|CANDIDATE_|DEPLOYED_|SHA_|HEALTH=|ROLLBACK_)/.test(line));
    return safeLines;
}

function cleanupDirectory(directory) {
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch (_) { /* best-effort cleanup of local temp archive */ }
}

function parseArgs(argv = process.argv.slice(2)) {
    const shaIndex = argv.indexOf('--sha');
    const sha = shaIndex >= 0 ? argv[shaIndex + 1] : '';
    const known = new Set(['--sha', '--self-test']);
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === '--sha') { index += 1; continue; }
        if (!known.has(argv[index])) fail('Unknown production release argument.', 'RELEASE_ARGUMENT_INVALID');
    }
    return { sha, selfTest: argv.includes('--self-test') };
}

function main() {
    const args = parseArgs();
    if (args.selfTest) {
        process.stdout.write('RELEASE_PIPELINE_SELF_TEST=PASS\n');
        return;
    }
    if (String(process.env.RELEASE_PRODUCTION_CONFIRM || '').trim() !== RELEASE_CONFIRMATION) fail('Production release requires explicit confirmation.', 'RELEASE_CONFIRMATION_MISSING');
    const config = loadReleaseConfig();
    const sha = resolveReleaseSha(args.sha);
    assertReleaseWorktreeSafe();
    runLocalPreflight();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logicfit-release-'));
    try {
        const archive = archiveCommit(sha, tempDir);
        uploadArchive(config, archive.archivePath, archive.archiveName);
        const output = runRemoteRelease(config, renderRemoteScript(config, sha, archive.archiveName));
        process.stdout.write(`RELEASE_SHA=${sha}\n${output.join('\n')}\nPRODUCTION_RELEASE=PASS\n`);
    } finally {
        cleanupDirectory(tempDir);
    }
}

if (require.main === module) {
    try { main(); } catch (error) {
        process.stderr.write(`PRODUCTION_RELEASE_BLOCKED code=${error.code || 'PRODUCTION_RELEASE_FAILED'}\n`);
        process.exitCode = 1;
    }
}

module.exports = { ALLOWED_DIRTY_PATHS, evaluateReleaseGates, expandPath, loadReleaseConfig, parseArgs, resolveReleaseSha };
