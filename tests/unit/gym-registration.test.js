'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('gym registration migration is additive, idempotent and separates public capability from stored data', () => {
    const migration = read('database/migrations/011-commercial-portal-and-registration.sql');
    assert.match(migration, /public_token_hash CHAR\(64\) NULL/);
    assert.match(migration, /IF COL_LENGTH\(N'dbo\.saas_gym_registration_requests', N'public_token_hash'\) IS NULL/);
    assert.match(migration, /UX_saas_registration_public_token/);
    assert.match(migration, /WHERE public_token_hash IS NOT NULL/);
    assert.doesNotMatch(migration, /password/i);
    assert.doesNotMatch(migration, /public_url|public_url/i);
});

test('public registration uses server-side catalog values and a capability token', () => {
    const source = read('src/services/gym-registration-service.js');
    const routes = read('src/routes/gym-registration.routes.js');
    const middleware = read('src/middleware/auth.middleware.js');
    assert.match(source, /getCommercialPlanCatalog\(\{ readOnly: true \}\)/);
    assert.match(source, /listPlatformPaymentMethods\(\{ activeOnly: true, readOnly: true \}\)/);
    assert.match(source, /hashCapability\(key, 'registration-idempotency'\)/);
    assert.match(source, /accessTokenForIdempotency\(key\)/);
    assert.match(source, /public_token_hash/);
    assert.match(source, /storage\.putPrivatePlatformObject/);
    assert.match(source, /verifyPrivatePlatformObject/);
    assert.doesNotMatch(source, /body\.price/);
    assert.doesNotMatch(source, /body\.amountDue/);
    assert.doesNotMatch(source, /body\.tenantId/);
    assert.match(routes, /\/api\/public\/gym-registration\/requests/);
    assert.match(middleware, /publicGymRegistrationPath/);
    assert.match(middleware, /mode: 'public', readOnlyBaseline: readOnlyRequest/);
    assert.doesNotMatch(middleware, /publicGymRegistrationPath[\s\S]{0,500}resolvePublicTenant/);
});

test('registration approval reuses transactional provisioning and never accepts a client login URL', () => {
    const service = read('src/services/gym-registration-service.js');
    const controller = read('src/controllers/gym-registration.controller.js');
    assert.match(service, /saasService\.provisionTenantWithOwner\(\{/);
    assert.match(service, /transaction,\s*authService/);
    assert.match(service, /subscriptionSource: 'manual'/);
    assert.match(service, /ownerPasswordHash: passwordHash/);
    assert.match(service, /REGISTRATION_PROOF_CHANGED|REGISTRATION_PAYMENT_PROOF_CHANGED/);
    assert.match(service, /loginUrl: config\.publicAppUrl \|\| null/);
    assert.doesNotMatch(controller, /request\.body\?\.loginUrl/);
    assert.doesNotMatch(service, /INSERT INTO[\s\S]{0,400}temporaryPassword/);
});

test('proof approval re-checks the locked artifact before financial or tenant mutation', () => {
    const memberService = read('src/services/member-subscription-service.js');
    const registrationService = read('src/services/gym-registration-service.js');
    assert.match(memberService, /WITH \(UPDLOCK,HOLDLOCK\)[\s\S]*PAYMENT_PROOF_CHANGED/);
    assert.match(registrationService, /WITH \(UPDLOCK,HOLDLOCK\)[\s\S]*REGISTRATION_PAYMENT_PROOF_CHANGED/);
    assert.match(registrationService, /verifyStoredProof\(storage, \{ \.\.\.initial, \.\.\.initialProof \}\)/);
});

test('new registration page is independent from the existing landing page', () => {
    const server = read('server.js');
    const landing = read('public/index.html');
    const registration = read('public/register-gym.html');
    assert.match(server, /app\.get\('\/register-gym'/);
    assert.match(registration, /id="gymRegistrationForm"/);
    assert.match(registration, /\/js\/register-gym\.js/);
    assert.doesNotMatch(landing, /register-gym/);
});

test('platform admin exposes a separate gym registration queue with one-time credential handling', () => {
    const html = read('public/platform-admin.html');
    const client = read('public/js/platform-admin.js');
    assert.match(html, /data-platform-view="gym-registrations"/);
    assert.match(html, /data-platform-panel="gym-registrations"/);
    assert.match(html, /id="gymRegistrationTableBody"/);
    assert.match(html, /id="platformRegistrationCredentialsDialog"/);
    assert.match(client, /\/api\/platform-admin\/gym-registration-requests\?/);
    assert.match(client, /gym-registration-approve/);
    assert.match(client, /gym-registration-reject/);
    assert.match(client, /oneTimeCredentials/);
    assert.match(client, /clearRegistrationCredentials/);
    assert.match(client, /registration-payment-proofs|gym-registration-requests\/proofs/);
    assert.doesNotMatch(client, /currentPassword/);
});
