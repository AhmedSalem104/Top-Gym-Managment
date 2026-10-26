'use strict';

const nodemailer = require('nodemailer');

function normalizeRecipients(value) {
    return [...new Set(String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))];
}

function createEmailNotificationService({
    enabled = false,
    smtpHost = '',
    smtpPort = 587,
    smtpSecure = false,
    smtpUser = '',
    smtpPassword = '',
    from = '',
    recipients = '',
    transporter = null,
    logger = console
} = {}) {
    const to = normalizeRecipients(recipients);
    let activeTransporter = transporter;

    function isTransportAvailable() {
        return Boolean(enabled && from && (activeTransporter || (smtpHost && smtpUser && smtpPassword)));
    }

    function canSendTo(recipient) {
        return isTransportAvailable() && normalizeRecipients(recipient).length === 1;
    }

    function isConfigured() {
        return isTransportAvailable() && to.length > 0;
    }

    function getTransporter() {
        if (!activeTransporter) {
            activeTransporter = nodemailer.createTransport({
                host: smtpHost,
                port: Number(smtpPort) || 587,
                secure: Boolean(smtpSecure),
                auth: { user: smtpUser, pass: smtpPassword }
            });
        }
        return activeTransporter;
    }

    async function send(notification = {}) {
        const recipients = notification.recipients == null ? to : normalizeRecipients(notification.recipients);
        if (!isTransportAvailable() || !recipients.length) return { status: 'skipped', reason: 'not_configured' };
        const message = notification.email || {};
        if (!message.subject || !message.text || !message.html) return { status: 'skipped', reason: 'invalid_message' };

        try {
            await getTransporter().sendMail({
                from,
                to: recipients,
                subject: String(message.subject).slice(0, 200),
                text: String(message.text).slice(0, 20_000),
                html: String(message.html).slice(0, 40_000)
            });
            return { status: 'sent' };
        } catch (_) {
            // Delivery failures must never expose recipient, SMTP details or
            // message content, and must not roll back an already committed
            // business event.
            try { logger.warn('[NOTIFICATION_EMAIL_FAILED]', { eventType: notification.type || 'unknown' }); } catch (_) { /* best effort */ }
            return { status: 'failed', reason: 'delivery_failed' };
        }
    }

    return Object.freeze({ canSendTo, isConfigured, isTransportAvailable, send });
}

module.exports = { createEmailNotificationService, normalizeRecipients };
