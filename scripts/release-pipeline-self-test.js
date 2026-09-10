'use strict';

const assert = require('node:assert/strict');
const { evaluateReleaseGates } = require('./release-production');

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

    process.stdout.write('RELEASE_PIPELINE_SELF_TEST=PASS\n');
}

if (require.main === module) {
    try { main(); } catch (error) {
        process.stderr.write(`RELEASE_PIPELINE_SELF_TEST=FAIL code=${error.code || 'ASSERTION_FAILED'}\n`);
        process.exitCode = 1;
    }
}

module.exports = { main };
