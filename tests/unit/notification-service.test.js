'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    EVENT_CATALOG,
    buildRegistrationEmail,
    buildSaasSubscriptionRequestEmail,
    createNotificationService,
    normalizeEvent
} = require('../../src/services/notification-service');
const { createEmailNotificationService } = require('../../src/services/email-notification-service');
const fs = require('node:fs');
const path = require('node:path');

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

test('catalog contains registration, operational and portal notification events', () => {
    assert.deepEqual(Object.keys(EVENT_CATALOG).sort(), [
        'attendance_auto_checked_out',
        'attendance_checked_in',
        'gym_registration_requested',
        'member_created',
        'member_subscription_request_approved',
        'member_subscription_request_created',
        'member_subscription_request_rejected',
        'membership_created',
        'membership_frozen',
        'membership_renewed',
        'membership_resumed',
        'membership_updated',
        'payment_updated',
        'saas_subscription_request_approved',
        'saas_subscription_request_created',
        'saas_subscription_request_rejected',
        'saas_subscription_request_submitted',
        'system_announcement',
        'trainer_plan_published',
        'trainer_registration_requested',
        'trainer_session_scheduled',
        'trainer_session_status_changed',
        'trainer_session_updated'
    ]);
    for (const event of Object.values(EVENT_CATALOG)) {
        assert.equal(event.channels.inApp, true);
        assert.ok(Array.isArray(event.audienceRoles));
    }
    assert.equal(EVENT_CATALOG.gym_registration_requested.channels.audit, true);
    assert.equal(EVENT_CATALOG.saas_subscription_request_created.channels.audit, false);
    assert.equal(EVENT_CATALOG.saas_subscription_request_created.audienceRole, 'PlatformAdmin');
    assert.equal(EVENT_CATALOG.saas_subscription_request_created.channels.email, true);
    assert.deepEqual(EVENT_CATALOG.saas_subscription_request_approved.audienceRoles, ['Owner', 'Assistant']);
    assert.equal(EVENT_CATALOG.gym_registration_requested.channels.email, true);
    assert.equal(EVENT_CATALOG.member_created.channels.email, false);
    assert.deepEqual(EVENT_CATALOG.trainer_plan_published.audienceRoles, ['Member']);
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

test('committed subscription in-app notifications broadcast without invoking SMTP', () => {
    let sends = 0;
    const received = [];
    const service = createNotificationService({
        emailService: { send: async () => { sends += 1; return { status: 'sent' }; } }
    });
    service.subscribe({ kind: 'user', tenantId: null, userId: 7, role: 'PlatformAdmin' }, (item) => received.push(item));
    const result = service.dispatchInAppEvent({
        type: 'saas_subscription_request_created', audienceRole: 'PlatformAdmin',
        entityType: 'saas_subscription_request', entityId: 73, notificationId: 901,
        payload: { gymName: 'Synthetic QA Gym', planName: 'Business', durationMonths: 6, amountDue: 10 }
    });
    assert.equal(result.status, 'broadcast');
    assert.equal(received.length, 1);
    assert.equal(received[0].category, 'subscription');
    assert.equal(received[0].read, false);
    assert.equal(sends, 0);
});

test('default event dedupe keys include scope so tenant events cannot collide', () => {
    const first = normalizeEvent({ type: 'member_created', tenantId: 7, entityId: 55 });
    const second = normalizeEvent({ type: 'member_created', tenantId: 8, entityId: 55 });
    assert.notEqual(first.dedupeKey, second.dedupeKey);
});

test('tenant events fail closed without tenant scope and member events require a member recipient', () => {
    assert.throws(() => normalizeEvent({ type: 'member_created', entityId: 55 }), /requires tenantId/);
    assert.throws(() => normalizeEvent({ type: 'membership_created', tenantId: 7, entityId: 55, audienceRole: 'Member' }), /requires recipientMemberId/);
    assert.throws(() => normalizeEvent({ ...registrationEvent(), tenantId: 7 }), /must not include tenantId/);
});

test('portal subscriber receives only its tenant and member-scoped event', async () => {
    const service = createNotificationService();
    const received = [];
    const unsubscribe = service.subscribe({ kind: 'member', tenantId: 7, memberId: 55 }, (event) => received.push(event));
    await service.dispatchEvent({
        type: 'trainer_plan_published', tenantId: 7, audienceRole: 'Member', recipientMemberId: 55,
        entityType: 'workout_program', entityId: 901, payload: { actionUrl: '/member-portal' }, notificationId: 1
    });
    await service.dispatchEvent({
        type: 'trainer_plan_published', tenantId: 7, audienceRole: 'Member', recipientMemberId: 56,
        entityType: 'workout_program', entityId: 902, payload: { actionUrl: '/member-portal' }, notificationId: 2
    });
    unsubscribe();
    assert.equal(received.length, 1);
    assert.equal(received[0].id, 1);
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
    let attempts = 0;
    const service = createNotificationService({
        emailService: { send: async () => { attempts += 1; throw new Error('synthetic transport failure'); } },
        logger: { warn() {} }
    });
    const result = await service.dispatchEvent(normalizeEvent(registrationEvent()));
    assert.equal(result.channels.email.status, 'failed');
    assert.equal(result.channels.email.attempts, 3);
    assert.equal(attempts, 3);
    assert.equal(result.channels.audit.status, 'recorded');
});

test('email channel retries a transient provider failure without duplicating the event', async () => {
    let attempts = 0;
    const service = createNotificationService({
        emailService: { send: async () => {
            attempts += 1;
            return attempts < 3 ? { status: 'failed', reason: 'delivery_failed' } : { status: 'sent' };
        } },
        logger: { warn() {} }
    });
    const result = await service.dispatchEvent(normalizeEvent(registrationEvent('trainer_registration_requested', 43)));
    assert.equal(result.channels.email.status, 'sent');
    assert.equal(result.channels.email.attempts, 3);
    assert.equal(attempts, 3);
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
    assert.match(message.subject, /\u0637\u0644\u0628 \u0627\u0646\u0636\u0645\u0627\u0645/);
    assert.match(message.text, /\u0645\u0631\u0627\u062c\u0639\u0629.*https:\/\/logicfit\.example\/platform-admin/);
    assert.match(message.html, /href="https:\/\/logicfit\.example\/platform-admin"/);
    assert.match(message.html, /lang="ar" dir="rtl"/);
    assert.match(message.html, /LOGIC <span/);
    assert.doesNotMatch(message.text, /accessToken|publicTokenHash|idempotencyKey/i);
});

test('SaaS subscription request notification is persistent while its branded email is delivered by the outbox adapter', async () => {
    const queries = [];
    let sentEmail;
    let sends = 0;
    const fakeRequest = {
        input() { return this; },
        async query(statement) { queries.push(statement); return { recordset: [{ id: 902 }] }; }
    };
    const fakePool = { request: () => fakeRequest };
    const service = createNotificationService({
        databaseEnabled: true,
        getPool: async () => fakePool,
        emailService: { send: async (input) => { sends += 1; sentEmail = input.email; return { status: 'sent' }; } },
        publicAppUrl: 'https://logicfit.example'
    });
    const event = await service.recordEvent({
        type: 'saas_subscription_request_created', entityType: 'saas_subscription_request', entityId: 84,
        title: 'طلب اشتراك جديد', message: 'طلب جديد من QA Gym.',
        payload: { gymName: 'QA Gym', planName: 'Basic', durationMonths: 6, amountDue: 599, currency: 'EGP', submittedAt: '2026-09-28T10:00:00.000Z', actionUrl: '/platform-admin.html#subscription-requests' },
        dedupeKey: 'saas-subscription-request-created:84'
    }, { executor: fakePool });
    assert.equal(event.tenantId, null);
    assert.equal(event.audienceRole, 'PlatformAdmin');
    assert.equal(event.category, 'subscription');
    assert.equal(event.notificationId, 902);
    assert.match(queries[0], /INSERT INTO dbo\.saas_notifications/i);
    assert.equal(sends, 0, 'recording the event must not contact SMTP');
    const delivery = await service.sendEmailEvent(event);
    assert.equal(delivery.status, 'sent');
    assert.equal(sends, 1);
    assert.match(sentEmail.subject, /\u0637\u0644\u0628 \u0627\u0634\u062a\u0631\u0627\u0643/);
    assert.match(sentEmail.text, /QA Gym/);
    assert.match(sentEmail.text, /Basic/);
    assert.match(sentEmail.text, /6/);
    assert.match(sentEmail.text, /599\.00 EGP/);
    assert.match(sentEmail.text, /\u062a\u062d\u062a \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629/);
    assert.match(sentEmail.text, /https:\/\/logicfit\.example\/platform-admin\.html#subscription-requests/);
    assert.match(sentEmail.html, /lang="ar" dir="rtl"/);
    assert.doesNotMatch(sentEmail.text + sentEmail.html, /storage_key|payment-proof|\.min\.io|proof\.png/i);
    assert.doesNotMatch(sentEmail.text + sentEmail.html, /\{"gymName"/);
});

test('SaaS subscription decisions are tenant-scoped notifications', () => {
    for (const type of ['saas_subscription_request_approved', 'saas_subscription_request_rejected']) {
        const event = normalizeEvent({ type, tenantId: 18, entityType: 'saas_subscription_request', entityId: 84 });
        assert.equal(event.tenantId, 18);
        assert.deepEqual(event.channels, { inApp: true, email: false, audit: false });
    }
});

test('SaaS subscription submission notifications target gym staff independently of the platform event', () => {
    for (const audienceRole of ['Owner', 'Assistant']) {
        const event = normalizeEvent({
            type: 'saas_subscription_request_submitted', tenantId: 18, audienceRole, entityId: 84
        });
        assert.equal(event.tenantScope, 'tenant');
        assert.equal(event.audience, 'tenant-staff');
        assert.equal(event.channels.inApp, true);
        assert.equal(event.channels.email, false);
    }
    assert.throws(() => normalizeEvent({ type: 'saas_subscription_request_submitted', entityId: 84 }), /requires tenantId/);
});

test('SaaS subscription email builder escapes user-controlled content and preserves configured review destination', () => {
    const event = normalizeEvent({
        type: 'saas_subscription_request_created', entityType: 'saas_subscription_request', entityId: 84,
        payload: { gymName: '<img src=x>', planName: 'Basic', amountDue: 599, currency: 'EGP', actionUrl: '/platform-admin.html#subscription-requests' }
    });
    const email = buildSaasSubscriptionRequestEmail(event, 'https://logicfit.example');
    assert.match(email.text, /https:\/\/logicfit\.example\/platform-admin\.html#subscription-requests/);
    assert.match(email.html, /&lt;img src=x&gt;/);
    assert.doesNotMatch(email.html, /<img src=x>/);
});

test('SaaS admin email uses the existing configured recipient chain and server mail wiring', () => {
    const env = fs.readFileSync(path.join(__dirname, '../../src/config/env.js'), 'utf8');
    const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
    assert.match(env, /platformAdminNotificationEmail:\s*getEnv\('PLATFORM_ADMIN_NOTIFICATION_EMAIL',\s*getEnv\('NOTIFICATION_ADMIN_EMAIL',\s*getEnv\('AUTH_PLATFORM_ADMIN_EMAIL'\)\)\)/);
    assert.match(server, /recipients:\s*config\.platformAdminNotificationEmail/);
});

test('notification action URLs fail closed to the platform review path', () => {
    const event = normalizeEvent({ ...registrationEvent(), payload: { ...registrationEvent().payload, actionUrl: 'https://untrusted.example/capture' } });
    assert.equal(event.payload.actionUrl, '/platform-admin');
});
