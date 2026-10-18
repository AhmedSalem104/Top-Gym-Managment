'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { renderRemoteScript, sanitizeRemoteDiagnostic } = require('../../scripts/release-production');

test('production release diagnostics preserve useful errors while redacting credentials and tokens', () => {
    const safe = sanitizeRemoteDiagnostic([
        'Permission denied (publickey).',
        'PASSWORD=hunter2',
        'Authorization: Bearer secret-value',
        'fatal: https://deploy-user:deploy-pass@example.invalid/repo.git',
        'ghp_123456789012345678901234567890'
    ].join('\n')).join('\n');

    assert.match(safe, /Permission denied \(publickey\)/);
    assert.match(safe, /PASSWORD=\[REDACTED\]/);
    assert.match(safe, /Authorization: Bearer \[REDACTED\]/);
    assert.match(safe, /https:\/\/\[REDACTED\]@example\.invalid/);
    assert.doesNotMatch(safe, /hunter2|secret-value|deploy-pass|ghp_123456789012345678901234567890/);
});

test('production remote runner normalizes Windows line endings before sending the script to Bash', () => {
    const script = renderRemoteScript({
        appRoot: '/opt/logicfit',
        repositoryUrl: 'https://github.com/example/logicfit.git',
        gitCacheDir: '/opt/logicfit/git-cache',
        nodeImage: 'node:24-bookworm-slim',
        containerName: 'logicfit-production',
        internalPort: 3017,
        candidatePort: 3027,
        host: '127.0.0.1',
        bootstrapEnvFile: '/etc/logicfit/production.env'
    }, 'a'.repeat(40));

    assert.doesNotMatch(script, /\r/);
    assert.match(script, /^#!\/usr\/bin\/env bash\nset -Eeuo pipefail\n/);
});
