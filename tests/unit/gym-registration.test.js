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
    assert.match(middleware, /mode: 'public', readOnlyBaseline: Boolean\(request\.readOnlyBaseline\)/);
    assert.doesNotMatch(middleware, /publicGymRegistrationPath[\s\S]{0,500}resolvePublicTenant/);
});

test('public registration responses do not expose internal review, tenant, user or storage references', () => {
    const service = require('../../src/services/gym-registration-service');
    const projected = service.publicRequestFromRow({
        id: 41,
        status: 'pending',
        gym_name: 'Synthetic Gym',
        owner_name: 'Synthetic Owner',
        plan_id: 2,
        plan_code_snapshot: 'growth',
        plan_name_snapshot: 'Growth',
        term_code_snapshot: 'annual',
        duration_months_snapshot: 12,
        price_snapshot: 1200,
        discount_amount_snapshot: 100,
        amount_due_snapshot: 1100,
        currency_snapshot: 'EGP',
        payment_method_code_snapshot: 'transfer',
        payment_method_name_snapshot: 'Transfer',
        reviewed_by_user_id: 99,
        created_tenant_id: 77,
        created_owner_user_id: 88,
        storage_key: 'payment-proofs/internal-secret.json.gz',
        proof_id: 5,
        proof_file_name: 'proof.png',
        proof_mime_type: 'image/png',
        proof_file_size: 10,
        proof_storage_verified_at: new Date()
    });
    assert.equal(projected.id, 41);
    assert.equal(projected.status, 'pending');
    assert.equal('reviewedByUserId' in projected, false);
    assert.equal('createdTenantId' in projected, false);
    assert.equal('createdOwnerUserId' in projected, false);
    assert.equal('storageKey' in projected, false);
    assert.equal('storage_key' in projected, false);
    assert.equal(projected.proof.id, undefined);
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

test('registration wizard keeps its functional hooks while using the responsive product onboarding layout', () => {
    const registration = read('public/register-gym.html');
    const styles = read('public/css/pages/register-gym.css');
    assert.match(registration, /class="registration-progress"/);
    assert.equal((registration.match(/data-step-indicator="[1-6]"/g) || []).length, 6);
    assert.match(registration, /class="registration-return"[^>]+href="\//);
    assert.match(registration, /registration-aside-visual["]?[^>]*>[\s\S]*?gym-background\.webp/);
    assert.match(registration, /id="gymRegistrationForm"/);
    assert.match(styles, /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(styles, /\.registration-main\s*\{[\s\S]*?grid-template-columns:\s*minmax\(300px,\s*\.82fr\)\s+minmax\(0,\s*1\.35fr\)/);
    assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.registration-card\s*\{[\s\S]*?grid-row:\s*1/);
    assert.match(styles, /html\[data-theme="dark"\] \.registration-aside-visual img/);
});

test('public registration fails safely when the catalog shape or API response is invalid', () => {
    const registration = read('public/js/register-gym.js');
    assert.match(registration, /function normalizeCatalog\(data\)/);
    assert.match(registration, /CATALOG_INVALID/);
    assert.match(registration, /PRIVATE_OBJECT_STORAGE_NOT_CONFIGURED/);
    assert.match(registration, /Number\(error\?\.status\) >= 500/);
    assert.doesNotMatch(registration, /return text\(error\?\.message\) \|\| fallback/);
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
