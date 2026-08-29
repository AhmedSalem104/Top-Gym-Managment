'use strict';

const crypto = require('node:crypto');

function safeSecretMatch(actual, expected) {
    const actualBuffer = Buffer.from(String(actual || ''));
    const expectedBuffer = Buffer.from(String(expected || ''));
    return actualBuffer.length === expectedBuffer.length
        && actualBuffer.length > 0
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function isAuthorizedCronRequest(request, { config }) {
    const secret = String(config.cronSecret || '').trim();
    const authorization = String(request.get('authorization') || '');
    if (secret) return safeSecretMatch(authorization, `Bearer ${secret}`);
    // A User-Agent is caller-controlled and is not an authenticator. In
    // production a missing CRON_SECRET must fail closed instead of allowing
    // an unauthenticated request to create a backup.
    if (String(config.nodeEnv || '').trim().toLowerCase() === 'production') return false;
    if (String(request.get('user-agent') || '').toLowerCase() === 'vercel-cron/1.0') return true;
    return config.nodeEnv !== 'production' && request.get('x-top-gym-cron-key') === 'daily-backup';
}

module.exports = { isAuthorizedCronRequest, safeSecretMatch };
