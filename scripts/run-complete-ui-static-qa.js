'use strict';

// Run the comprehensive visual/layout audit against the data-free static QA
// server. Browser API fixtures are installed by qa-complete-ui.js; Express,
// SQL Server, queues and Production are never started or contacted.
const { spawn } = require('node:child_process');

const port = String(process.env.QA_STATIC_PORT || '4173');
const baseUrl = `http://127.0.0.1:${port}`;
const node = process.execPath;
let server;
let runner;
let stopping = false;

function stopServer() {
    if (stopping) return;
    stopping = true;
    if (server && server.exitCode === null) server.kill('SIGTERM');
}

async function waitForServer() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (server.exitCode !== null) throw new Error(`Static QA server exited (${server.exitCode}).`);
        try {
            const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(750) });
            if (response.ok) return;
        } catch (_) {
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
    throw new Error('Static QA server did not become ready within 10 seconds.');
}

(async () => {
    server = spawn(node, ['scripts/serve-browser-qa.js'], {
        cwd: process.cwd(),
        env: { ...process.env, PORT: port },
        stdio: 'inherit',
        windowsHide: true
    });
    server.once('error', (error) => console.error(`[STATIC-QA-SERVER] ${error.message}`));
    await waitForServer();
    runner = spawn(node, ['scripts/qa-complete-ui.js'], {
        cwd: process.cwd(),
        env: { ...process.env, QA_BASE_URL: baseUrl, QA_ALLOW_STATIC_SERVER: '1' },
        stdio: 'inherit',
        windowsHide: true
    });
    const result = await new Promise((resolve, reject) => {
        runner.once('error', reject);
        runner.once('exit', (code, signal) => resolve({ code, signal }));
    });
    stopServer();
    process.exitCode = result.code ?? 1;
})().catch((error) => {
    console.error(`[STATIC-UI-QA] ${error.message}`);
    stopServer();
    process.exitCode = 1;
});

process.once('SIGINT', () => {
    if (runner && runner.exitCode === null) runner.kill('SIGINT');
    stopServer();
});
process.once('SIGTERM', () => {
    if (runner && runner.exitCode === null) runner.kill('SIGTERM');
    stopServer();
});
