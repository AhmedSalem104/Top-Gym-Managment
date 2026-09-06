'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function jobStateDirectory() {
    const configured = String(process.env.LOGIC_FIT_JOB_STATE_DIR || '').trim();
    if (!configured && String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
        throw new Error('LOGIC_FIT_JOB_STATE_DIR must be configured for production server jobs.');
    }
    return path.resolve(configured || path.join(process.cwd(), '.runtime', 'logic-fit-jobs'));
}

async function acquireJobLock(name) {
    const directory = jobStateDirectory();
    await fsp.mkdir(directory, { recursive: true, mode: 0o750 });
    const lockPath = path.join(directory, `${name}.lock`);
    let handle;
    try {
        handle = await fsp.open(lockPath, 'wx', 0o640);
    } catch (error) {
        if (error?.code === 'EEXIST') {
            const busy = new Error(`The ${name} job is already running.`);
            busy.code = 'JOB_ALREADY_RUNNING';
            busy.statusCode = 0;
            throw busy;
        }
        throw error;
    }
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
    return async () => {
        await handle.close().catch(() => {});
        await fsp.unlink(lockPath).catch(() => {});
    };
}

function writeJobResult(result) {
    const line = JSON.stringify({ ...result, completedAt: new Date().toISOString() });
    process.stdout.write(`${line}\n`);
    try {
        const directory = jobStateDirectory();
        fs.mkdirSync(directory, { recursive: true, mode: 0o750 });
        const job = String(result.job || 'job').replace(/[^a-z0-9_-]/gi, '-');
        fs.appendFileSync(path.join(directory, `${job}.log`), `${line}\n`, { encoding: 'utf8', mode: 0o640 });
    } catch (error) {
        if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') {
            process.stderr.write(`[server-job-log-failed] ${error.code || 'LOG_WRITE_FAILED'}\n`);
        }
    }
}

module.exports = { acquireJobLock, jobStateDirectory, writeJobResult };
