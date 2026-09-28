'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('server jobs are separate, lock-protected and do not carry secrets in arguments', () => {
    const backup = read('scripts/run-server-scheduled-backup.js');
    const checkout = read('scripts/run-server-auto-checkout.js');
    const utils = read('scripts/server-job-utils.js');
    assert.match(backup, /acquireJobLock\('backup'\)/);
    assert.match(checkout, /acquireJobLock\('attendance-auto-checkout'\)/);
    assert.match(backup, /createBackupRecoveryService/);
    assert.match(checkout, /reconcileAutoCheckout/);
    assert.match(checkout, /withTransaction/);
    assert.match(checkout, /recordAudit/);
    assert.match(utils, /open\(lockPath, 'wx'/);
    assert.doesNotMatch(backup, /CRON_SECRET|ACCESS_KEY|PASSWORD|TOKEN/i);
    assert.doesNotMatch(checkout, /CRON_SECRET|ACCESS_KEY|PASSWORD|TOKEN/i);
});

test('production server jobs require an explicit private state directory', () => {
    const utils = require('../../scripts/server-job-utils');
    const previousEnv = process.env.NODE_ENV;
    const previousState = process.env.LOGIC_FIT_JOB_STATE_DIR;
    try {
        process.env.NODE_ENV = 'production';
        delete process.env.LOGIC_FIT_JOB_STATE_DIR;
        assert.throws(() => utils.jobStateDirectory(), /LOGIC_FIT_JOB_STATE_DIR/);
    } finally {
        if (previousEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousEnv;
        if (previousState === undefined) delete process.env.LOGIC_FIT_JOB_STATE_DIR;
        else process.env.LOGIC_FIT_JOB_STATE_DIR = previousState;
    }
});

test('auto checkout update is explicitly constrained through the tenant-owned member relation', () => {
    const source = read('src/services/attendance-service.js');
    assert.match(source, /const tenantId = currentTenantId\(\{ required: true \}\);/);
    assert.match(source, /INNER JOIN dbo\.members AS member/);
    assert.match(source, /member\.tenant_id = @tenantId/);
    assert.match(source, /attendance\.check_out_at IS NULL/);
    assert.match(source, /check_out_source = 'auto'/);
});

test('VPS auto checkout scheduler runs the official job without persisting app secrets', () => {
    const wrapper = read('scripts/run-vps-auto-checkout-job.sh');
    const service = read('infra/systemd/logicfit-attendance-auto-checkout.service');
    const timer = read('infra/systemd/logicfit-attendance-auto-checkout.timer');
    assert.match(wrapper, /docker inspect[\s\S]*\.Config\.Env/);
    assert.match(wrapper, /--env-file \/dev\/stdin/);
    assert.match(wrapper, /run-server-auto-checkout\.js/);
    assert.match(wrapper, /\.production-release-lock/);
    assert.match(service, /ExecStart=.*logicfit-auto-checkout-job\.sh/);
    assert.match(timer, /OnCalendar=.*0\/5/);
    assert.doesNotMatch(wrapper, /PASSWORD|SECRET_VALUE|ACCESS_KEY/i);
});

test('VPS daily backup scheduler reuses the official backup runner and release lock', () => {
    const wrapper = read('scripts/run-vps-scheduled-backup-job.sh');
    const service = read('infra/systemd/logicfit-backup-daily.service');
    const timer = read('infra/systemd/logicfit-backup-daily.timer');
    assert.match(wrapper, /run-server-scheduled-backup\.js/);
    assert.match(wrapper, /docker inspect[\s\S]*\.Config\.Env/);
    assert.match(wrapper, /--env-file \/dev\/stdin/);
    assert.match(wrapper, /BACKUP_RELEASE_DIR='@@BACKUP_RELEASE_DIR@@'/);
    assert.match(wrapper, /-v "\$BACKUP_RELEASE_DIR:\/app:ro"/);
    assert.doesNotMatch(wrapper, /release_dir="\$\(docker inspect/);
    assert.match(wrapper, /\.production-release-lock/);
    assert.match(wrapper, /max-old-space-size=1024/);
    assert.match(service, /ExecStart=.*logicfit-scheduled-backup-job\.sh/);
    assert.match(timer, /OnCalendar=.*02:30:00 UTC/);
    assert.match(timer, /Persistent=true/);
    assert.doesNotMatch(wrapper, /PASSWORD|SECRET_VALUE|ACCESS_KEY/i);
});

test('production release lets the official backup runner apply its bounded heap policy', () => {
    const release = read('scripts/release-production-remote.sh');
    assert.match(release, /node scripts\/run-server-scheduled-backup\.js/);
    assert.match(release, /node --max-old-space-size=1024 scripts\/verify-production-backup\.js/);
    assert.doesNotMatch(release, /node --max-old-space-size=640 scripts\/(?:run-server-scheduled-backup|verify-production-backup)\.js/);
    const backupStart = release.indexOf("STAGE='backup'");
    const applyStart = release.indexOf("STAGE='migration-apply'");
    assert.ok(backupStart >= 0 && applyStart > backupStart);
    const backupSection = release.slice(backupStart, applyStart);
    assert.equal((backupSection.match(/-v "\$RELEASE_DIR:\/app:ro"/g) || []).length, 2);
    assert.doesNotMatch(backupSection, /-v "\$OLD_RELEASE:\/app/);
    assert.match(backupSection, /LOGIC_FIT_BACKUP_PENDING_MIGRATIONS=\$pending_migration_versions/);
    assert.match(backupSection, /run_with_current_env "\$OLD_CONTAINER"/);
    assert.match(backupSection, /new release's backup tools/);
    assert.match(backupSection, /abort_release 76/);
    assert.ok(backupStart < release.indexOf('abort_release 76') && release.indexOf('abort_release 76') < applyStart);
    const verificationSection = release.slice(release.indexOf("STAGE='backup-verification'"), applyStart);
    assert.match(verificationSection, /LOGIC_FIT_BACKUP_PENDING_MIGRATIONS=\$pending_migration_versions/);

    const candidateStart = release.indexOf("STAGE='candidate'");
    const runtimeActivation = release.indexOf("STAGE='cutover-runtime-config'");
    const cutoverStart = release.indexOf("STAGE='cutover'");
    assert.ok(backupStart < applyStart && applyStart < candidateStart && candidateStart < runtimeActivation && runtimeActivation < cutoverStart);
    const preBackup = release.slice(release.indexOf("STAGE='runtime-config-validation'"), backupStart);
    assert.match(preBackup, /PRODUCTION_RUNTIME_CONFIG=UNCHANGED/);
    assert.doesNotMatch(preBackup, /systemctl (?:enable|start|restart) (?:logicfit-|)/);
    assert.doesNotMatch(preBackup, /install -m .*\$JOB_|install -m .*\/etc\/logicfit/);
    assert.doesNotMatch(preBackup, /> "\$JOB_(?:WRAPPER|SERVICE|TIMER)_TARGET"/);
    assert.doesNotMatch(preBackup, /systemctl (?:enable|start|restart) /);
    assert.doesNotMatch(preBackup, /install -m .*APP_SITE_TARGET/);
    assert.match(release, /pending_migration_versions=.*plan\.pending/);
    assert.match(release, /-v "\$RELEASE_DIR:\/app:ro" -w \/app/);

    const candidateCommands = release.slice(candidateStart, runtimeActivation);
    assert.doesNotMatch(candidateCommands, /outbox\.start\(\)/);
    const runtimeActivationCommands = release.slice(runtimeActivation, cutoverStart);
    assert.match(runtimeActivationCommands, /systemctl enable logicfit-attendance-auto-checkout\.timer/);
    assert.match(runtimeActivationCommands, /systemctl enable logicfit-backup-daily\.timer/);
    assert.match(runtimeActivationCommands, /snapshot_host_runtime/);
    assert.match(release, /if \[ "\$HOST_RUNTIME_MUTATED" = '1' \] && \[ "\$CUTOVER_COMMITTED" != '1' \]; then restore_host_runtime/);

    const productionStart = release.slice(cutoverStart);
    assert.equal((productionStart.match(/outbox\.start\(\)/g) || []).length, 2); // bootstrap and normal production branches; never candidate
    assert.match(productionStart, /docker rename "\$OLD_CONTAINER" "\$PREVIOUS_NAME"/);
    assert.match(productionStart, /docker start "\$CONTAINER_NAME"/);
    assert.doesNotMatch(productionStart, /DROP TABLE|docker rm "\$PREVIOUS_NAME"/i);
    assert.match(productionStart, /CUTOVER_COMMITTED=1/);
});

test('release backup execution combines new-release storage fix with tenant-scoped delete', () => {
    const release = read('scripts/release-production-remote.sh');
    const storage = read('src/services/object-storage-service.js');
    const backupStart = release.indexOf("STAGE='backup'");
    const migrationStart = release.indexOf("STAGE='migration-apply'");
    const backupSection = release.slice(backupStart, migrationStart);
    assert.match(backupSection, /-v "\$RELEASE_DIR:\/app:ro"/);
    assert.doesNotMatch(backupSection, /-v "\$OLD_RELEASE:\/app/);
    assert.match(storage, /deletePrivateObject\(\{ tenantId: normalizedTenantId, scope: 'tenant', key: normalizedKey \}\)/);
    assert.match(read('tests/unit/object-storage.test.js'), /tenant object deletion passes the tenant scope to the storage adapter/);
});

test('production app containers start and gracefully stop the durable email outbox worker', () => {
    const release = read('scripts/release-production-remote.sh');
    assert.equal((release.match(/const outbox=require\("\.\/src\/services\/email-outbox-dispatcher"\);/g) || []).length, 2);
    assert.equal((release.match(/outbox\.start\(\)/g) || []).length, 2);
    assert.equal((release.match(/outbox\.stop\(\)/g) || []).length, 2);
    assert.match(release, /outbox\.start\(\); const server=app\.listen\(port,"127\.0\.0\.1"/);
    assert.match(release, /server\.close\(\(\)=>outbox\.stop\(\)\.then\(\(\)=>closePool\(\)\)\.finally\(\(\)=>process\.exit\(0\)\)\)/);
    const candidateStart = release.indexOf('const CANDIDATE_NAME=');
    const cutoverStart = release.indexOf("STAGE='cutover'");
    const candidateCommands = release.slice(candidateStart, cutoverStart);
    assert.doesNotMatch(candidateCommands, /outbox\.start\(\)/);
    assert.ok(release.indexOf('outbox.start()') > cutoverStart);
});

test('migration 039 is additive and the old release remains a rollback source', () => {
    const migration = read('database/migrations/039-durable-email-outbox.sql');
    const manifest = JSON.parse(read('database/migration-manifest.json'));
    assert.match(migration, /CREATE TABLE dbo\.email_outbox/);
    assert.match(migration, /CREATE UNIQUE INDEX UQ_email_outbox_idempotency_key/);
    assert.doesNotMatch(migration, /\b(?:DROP|ALTER|TRUNCATE|DELETE|UPDATE)\b/i);
    assert.equal(manifest.migrations['039-durable-email-outbox.sql'].backwardCompatible, true);
    const release = read('scripts/release-production-remote.sh');
    assert.match(release, /docker rename "\$OLD_CONTAINER" "\$PREVIOUS_NAME"/);
    assert.match(release, /docker rename "\$PREVIOUS_NAME" "\$CONTAINER_NAME"/);
    assert.match(release, /-v "\$RELEASE_DIR:\/app:ro"/); // backup tooling stays forward-compatible after app rollback
});

test('release backup pending migration context is strictly parsed and validated', () => {
    const { pendingMigrationVersionsFromEnv } = require('../../scripts/run-server-scheduled-backup');
    const verifier = read('scripts/verify-production-backup.js');
    const recovery = read('src/services/backup-recovery-service.js');
    assert.deepEqual(pendingMigrationVersionsFromEnv('039'), ['039']);
    assert.deepEqual(pendingMigrationVersionsFromEnv(''), []);
    assert.throws(() => pendingMigrationVersionsFromEnv('39'), { code: 'BACKUP_MIGRATION_CONTEXT_INVALID' });
    assert.throws(() => pendingMigrationVersionsFromEnv('039,039'), { code: 'BACKUP_MIGRATION_CONTEXT_INVALID' });
    assert.match(verifier, /pendingMigrationVersions: pendingMigrationVersionsFromEnv\(\)/);
    assert.match(recovery, /getPlatformBackupCoverageStatus\(\{ readOnly, pendingMigrationVersions \}\)/);
});
