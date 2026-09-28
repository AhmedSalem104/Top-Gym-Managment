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
        host: '13.140.170.148',
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
    assert.match(rendered, /production-migration-gate\.js --apply --json/);
    assert.match(rendered, /BOOTSTRAP_MODE=1/);
    assert.match(rendered, /bootstrap-migration-safety/);
    assert.match(rendered, /external-old-production-vps/);
    assert.match(rendered, /if \[ "\$BOOTSTRAP_MODE" != '1' \]; then/);
    assert.match(rendered, /docker run --network host --env-file "\$BOOTSTRAP_ENV_FILE"/);
    assert.match(rendered, /getent ahostsv4 getlogicfit\.com/);
    assert.match(rendered, /infra\/caddy\/sites\/application\.caddy/);
    assert.match(rendered, /RUNTIME_CONFIG_VALIDATION=PASS/);
    assert.match(rendered, /PRODUCTION_RUNTIME_CONFIG=UNCHANGED/);
    assert.match(rendered, /STAGE='backup'/);
    assert.match(rendered, /LOGIC_FIT_BACKUP_PENDING_MIGRATIONS=\$pending_migration_versions/);
    assert.match(rendered, /-v "\$RELEASE_DIR:\/app:ro" -w \/app "\$NODE_IMAGE"/);
    assert.doesNotMatch(rendered, /-v "\$OLD_RELEASE:\/app/);
    assert.match(rendered, /STAGE='cutover-runtime-config'/);
    assert.match(rendered, /snapshot_host_runtime/);
    assert.match(rendered, /restore_host_runtime/);
    assert.match(rendered, /systemctl restart logicfit-caddy/);
    assert.match(rendered, /CADDY_TLS=PASS/);
    assert.match(rendered, /CADDY_APP_SITE=PASS/);
    assert.match(rendered, /caddy validate --config \/etc\/caddy\/Caddyfile/);
    const backupIndex = rendered.indexOf("STAGE='backup'");
    const migrationIndex = rendered.indexOf("STAGE='migration-apply'");
    const candidateIndex = rendered.indexOf("STAGE='candidate'");
    const runtimeActivationIndex = rendered.indexOf("STAGE='cutover-runtime-config'");
    const cutoverIndex = rendered.indexOf("STAGE='cutover'");
    assert.ok(backupIndex < migrationIndex && migrationIndex < candidateIndex
        && candidateIndex < runtimeActivationIndex && runtimeActivationIndex < cutoverIndex);
    const preBackup = rendered.slice(rendered.indexOf("STAGE='runtime-config-validation'"), backupIndex);
    assert.doesNotMatch(preBackup, /systemctl (?:enable|start|restart) /);
    assert.doesNotMatch(preBackup, /install -m .*\/etc\/logicfit/);
    assert.doesNotMatch(rendered, /MIGRATION_PENDING='031-central-notifications\.sql'/);
    assert.match(rendered, /migrationPlan":\$plan_output/);
    assert.doesNotMatch(rendered, /__[A-Z0-9_]+__/);

    const fs = require('node:fs');
    const path = require('node:path');
    const releaseSource = fs.readFileSync(path.join(__dirname, 'release-production.js'), 'utf8');
    assert.match(releaseSource, /StrictHostKeyChecking=yes/);
    assert.match(releaseSource, /UserKnownHostsFile=/);
    assert.doesNotMatch(releaseSource, /StrictHostKeyChecking=no/);

    process.stdout.write('RELEASE_PIPELINE_SELF_TEST=PASS\n');
}

if (require.main === module) {
    try { main(); } catch (error) {
        process.stderr.write(`RELEASE_PIPELINE_SELF_TEST=FAIL code=${error.code || 'ASSERTION_FAILED'}\n`);
        process.exitCode = 1;
    }
}

module.exports = { main };
