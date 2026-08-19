'use strict';

function isAuthorizedCronRequest(request, { config }) {
    const secret = String(config.cronSecret || '').trim();
    const authorization = String(request.get('authorization') || '');
    if (secret) return authorization === `Bearer ${secret}`;
    if (String(request.get('user-agent') || '').toLowerCase() === 'vercel-cron/1.0') return true;
    return config.nodeEnv !== 'production' && request.get('x-top-gym-cron-key') === 'daily-backup';
}

module.exports = { isAuthorizedCronRequest };
