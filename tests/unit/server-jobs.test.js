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
