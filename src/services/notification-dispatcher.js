'use strict';

// Business services use this narrow boundary instead of constructing their
// own notification service. The server wires the configured instance once,
// which keeps audit/email delivery consistent without introducing service
// import cycles.
let configuredService = null;

function configureNotificationService(service) {
    configuredService = service || null;
}

function getNotificationService() {
    return configuredService;
}

async function publish(input) {
    if (!configuredService?.publish) return { status: 'skipped', reason: 'not_configured' };
    return configuredService.publish(input);
}

async function publishForRoles(input, roles = ['Owner', 'Assistant']) {
    const uniqueRoles = [...new Set((Array.isArray(roles) ? roles : [roles])
        .map((role) => String(role || '').trim())
        .filter(Boolean))];
    return Promise.all(uniqueRoles.map((audienceRole) => publish({
        ...input,
        audienceRole,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${audienceRole}` : undefined
    })));
}

module.exports = { configureNotificationService, getNotificationService, publish, publishForRoles };
