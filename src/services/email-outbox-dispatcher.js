'use strict';

let configuredService = null;

function configureEmailOutboxService(service) {
    configuredService = service || null;
}

function isConfigured() {
    return Boolean(configuredService?.enqueue);
}

async function enqueue(event, options) {
    if (!configuredService?.enqueue) {
        const error = new Error('Email outbox is unavailable.');
        error.code = 'EMAIL_OUTBOX_UNAVAILABLE';
        throw error;
    }
    return configuredService.enqueue(event, options);
}

function start() {
    if (typeof configuredService?.start !== 'function') {
        throw new Error('Email outbox worker is unavailable.');
    }
    return configuredService.start();
}

async function stop() {
    if (typeof configuredService?.stop === 'function') await configuredService.stop();
}

module.exports = { configureEmailOutboxService, enqueue, isConfigured, start, stop };
