'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    EVENT_CATALOG,
    buildRegistrationEmail,
    createNotificationService,
    normalizeEvent
} = require('../../src/services/notification-service');
const { createEmailNotificationService } = require('../../src/services/email-notification-service');

function registrationEvent(type = 'gym_registration_requested', entityId = 41) {
    return {
        type,
        tenantId: null,
        entityType: 'gym_registration_request',
        entityId,
        auditDetails: 'Synthetic registration event.',
        payload: {
            registrationType: type === 'trainer_registration_requested' ? 'independent_trainer' : 'gym',
            gymName: 'Synthetic QA Gym',
            ownerName: 'Synthetic Applicant',
            contactEmail: 'qa@example.test',
            planName: 'Starter',
            amountDue: 299,
            currency: 'EGP',
            submittedAt: '2026-09-10T10:00:00.000Z',
            actionUrl: '/platform-admin'
        }
    };
}

test('catalog contains only the existing registration business events', () => {
    assert.deepEqual(Object.keys(EVENT_CATALOG).sort(), [
        'gym_registration_requested',
        'trainer_registration_requested'
    ]);
    for (const event of Object.values(EVENT_CATALOG)) {
        assert.equal(event.audience, 'platform-admin');
        assert.equal(event.tenantScope, 'platform');
        assert.equal(event.requiredPermission, null);
        assert.equal(event.channels.audit, true);
        assert.equal(event.channels.email, true);
        assert.equal(event.channels.inApp, true);
    }
});

test('registration event normalization is platform-scoped and excludes capability data', () => {
    const event = normalizeEvent({
        ...registrationEvent(),
        payload: { ...registrationEvent().payload, accessToken: 'must-not-be-carried' }
    });
    assert.equal(event.tenantId, null);
    assert.equal(event.entityType, 'gym_registration_request');
    assert.equal(event.entityId, 41);
    assert.equal(event.payload.contactEmail, 'qa@example.test');
    assert.equal('accessToken' in event.payload, false);
    assert.equal('publicTokenHash' in event.payload, false);
    assert.equal('idempotencyKey' in event.payload, false);
});

test('recording an event writes audit before delivery and never sends during recording', async () => {
    const audits = [];
    let deliveries = 0;
    const service = createNotificationService({
        auditService: { recordAudit: async (entry) => audits.push(entry) },
        emailService: { send: async () => { deliveries += 1; return { status: 'sent' }; } }
    });

    const event = await service.recordEvent(registrationEvent(), { executor: { transaction: true } });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'gym_registration_requested');
    assert.equal(audits[0].entityId, 41);
    assert.deepEqual(audits[0].executor, { transaction: true });
    assert.equal(deliveries, 0);

    await service.dispatchEvent(event);
    assert.equal(deliveries, 1);
});

test('recording with an executor persists one durable in-app notification atomically', async () => {
    const queries = [];
    const fakeRequest = {
        input() { return this; },
        async query(statement) {
            queries.push(statement);
            return { recordset: [{ id: 901 }] };
        }
    };
    const fakePool = { request: () => fakeRequest };
    const service = createNotificationService({
        databaseEnabled: true,
        getPool: async () => fakePool,
        auditService: { recordAudit: async () => {} }
    });
    const event = await service.recordEvent(registrationEvent(), { executor: fakePool });
    assert.equal(event.channels.inApp, true);
    assert.equal(queries.length, 1);
    assert.match(queries[0], /INSERT INTO dbo\.saas_notifications/i);
    assert.match(queries[0], /dedupe_key=@dedupeKey/i);
});

test('default event dedupe keys include scope so tenant events cannot collide', () => {
    const first = normalizeEvent({ ...registrationEvent(), tenantId: 7, entityId: 55 });
    const second = normalizeEvent({ ...registrationEvent(), tenantId: 8, entityId: 55 });
    assert.notEqual(first.dedupeKey, second.dedupeKey);
});

test('dispatch deduplicates concurrent and repeated delivery for one registration', async () => {
    let deliveries = 0;
    const service = createNotificationService({
        emailService: {
            send: async () => {
                deliveries += 1;
                await new Promise((resolve) => setTimeout(resolve, 5));
                return { status: 'sent' };
            }
        }
    });
    const event = normalizeEvent(registrationEvent('trainer_registration_requested', 42));
    const results = await Promise.all([
        service.dispatchEvent(event),
        service.dispatchEvent(event),
        service.dispatchEvent(event)
    ]);
    assert.equal(deliveries, 1);
    assert.equal(results.every((result) => result.dedupeKey === event.dedupeKey), true);
    const repeated = await service.dispatchEvent(event);
    assert.equal(repeated.deduplicated, true);
});

test('email channel failure is isolated from the saved business event', async () => {
    const service = createNotificationService({
        emailService: { send: async () => { throw new Error('synthetic transport failure'); } },
        logger: { warn() {} }
    });
    const result = await service.dispatchEvent(normalizeEvent(registrationEvent()));
    assert.equal(result.channels.email.status, 'failed');
    assert.equal(result.channels.audit.status, 'recorded');
});

test('configured email adapter sends through the injected transport without exposing transport credentials', async () => {
    const sent = [];
    const email = createEmailNotificationService({
        enabled: true,
        from: 'Logic Fit <no-reply@example.test>',
        recipients: 'admin@example.test',
        transporter: { sendMail: async (message) => { sent.push(message); } }
    });
    const result = await email.send({
        type: 'gym_registration_requested',
        email: { subject: 'Synthetic', text: 'Synthetic body', html: '<p>Synthetic body</p>' }
    });
    assert.equal(result.status, 'sent');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, 'Synthetic');
    assert.equal('auth' in sent[0], false);
});

test('registration email is safe, bounded and contains a review destination', () => {
    const message = buildRegistrationEmail(normalizeEvent(registrationEvent()), 'https://logicfit.example');
    assert.match(message.subject, /New Gym registration request/);
    assert.match(message.text, /Review: \/platform-admin/);
    assert.match(message.html, /href="\/platform-admin"/);
    assert.doesNotMatch(message.text, /accessToken|publicTokenHash|idempotencyKey/i);
});

test('notification action URLs fail closed to the platform review path', () => {
    const event = normalizeEvent({ ...registrationEvent(), payload: { ...registrationEvent().payload, actionUrl: 'https://untrusted.example/capture' } });
    assert.equal(event.payload.actionUrl, '/platform-admin');
});
