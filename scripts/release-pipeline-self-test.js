'use strict';

const assert = require('node:assert/strict');
const { evaluateReleaseGates, parseArgs, renderRemoteScript } = require('./release-production');

const passing = {
    backup: true,
    backupVerification: true,
    migration: true,
    security: true,
    lock: true,
    sha: true,
    health: true
};

function expectFailure(name, override, expectedGate) {
    const result = evaluateReleaseGates({ ...passing, ...override });
    assert.equal(result.pass, false, `${name} must fail closed`);
    assert.deepEqual(result.failed, [expectedGate], `${name} must identify the failed gate`);
}

function main() {
    assert.equal(evaluateReleaseGates(passing).pass, true);

    // A verified ledger with no pending migrations and an already-applied
    // migration are successful no-op plans, not reasons to rerun history.
    assert.equal(evaluateReleaseGates({ ...passing, pendingMigrations: 0 }).pass, true);
    assert.equal(evaluateReleaseGates({ ...passing, alreadyApplied: true }).pass, true);

    expectFailure('backup verification failure', { backupVerification: false }, 'backupVerification');
    expectFailure('checksum mismatch', { migration: false }, 'migration');
    expectFailure('migration execution failure', { migration: false }, 'migration');
    expectFailure('RLS/Tenancy failure', { security: false }, 'security');
    expectFailure('concurrent release', { lock: false }, 'lock');
    expectFailure('health failure', { health: false }, 'health');
    expectFailure('SHA mismatch', { sha: false }, 'sha');

    assert.equal(parseArgs([]).transport, '');
    assert.equal(parseArgs(['--sha', 'a'.repeat(40), '--transport', 'git']).transport, 'git');
    assert.throws(() => parseArgs(['--transport', 'ftp']), /transport is invalid/i);
    const rendered = renderRemoteScript({
        appRoot: '/opt/logicfit-vps',
        repositoryUrl: 'https://github.com/example/logic-fit.git',
        gitCacheDir: '/opt/logicfit-vps/git-cache',
        nodeImage: 'node:24-bookworm-slim',
        containerName: 'logicfit-production-vps',
        internalPort: 3017,
        candidatePort: 3027
    }, 'a'.repeat(40), '', '', 'git');
    assert.match(rendered, /fetch --no-tags origin/);
    assert.match(rendered, /RELEASE_SOURCE=GIT_FETCH_PASS/);
    assert.match(rendered, /run_with_current_env_persistent "\$OLD_CONTAINER"/);
    assert.match(rendered, /run_with_current_env_persistent "\$PREVIOUS_NAME"/);
    assert.doesNotMatch(rendered, /run_with_current_env_persistent "\$OLD_CONTAINER"[^\n]*--network host/);
    assert.doesNotMatch(rendered, /run_with_current_env_persistent "\$PREVIOUS_NAME"[^\n]*--network host/);
    assert.doesNotMatch(rendered, /__[A-Z0-9_]+__/);

    process.stdout.write('RELEASE_PIPELINE_SELF_TEST=PASS\n');
}

if (require.main === module) {
    try { main(); } catch (error) {
        process.stderr.write(`RELEASE_PIPELINE_SELF_TEST=FAIL code=${error.code || 'ASSERTION_FAILED'}\n`);
        process.exitCode = 1;
    }
}

module.exports = { main };
