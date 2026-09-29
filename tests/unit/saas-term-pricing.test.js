'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { priceSaasTerm } = require('../../src/services/saas-term-pricing');
const saasService = require('../../src/services/saas-service');

const root = path.join(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('registration and in-app SaaS requests share catalog term discount calculation', () => {
    const term = { code: 'semiannual', durationMonths: 6, price: 2999, discountAmount: 300, currency: 'egp' };
    const price = priceSaasTerm(term);
    assert.deepEqual(price, { price: 2999, discountAmount: 300, amountDue: 2699, currency: 'EGP' });
    assert.match(read('src/services/gym-registration-service.js'), /priceSaasTerm\(term\)/);
    assert.match(read('src/services/saas-service.js'), /priceSaasTerm\(term\)\.amountDue/);
});

test('SaaS request backend resolves submitted term and price from active plan catalog, not client amount', () => {
    const service = read('src/services/saas-service.js');
    const submit = service.slice(service.indexOf('async function submitSubscriptionRequest'), service.indexOf('\nasync function listPlatformRequests'));
    assert.match(submit, /selectPlanTerm\(plan, termCode, \{ allowLegacy: false \}\)/);
    assert.match(submit, /priceSaasTerm\(term\)\.amountDue/);
    assert.doesNotMatch(submit, /body\.amount|fields\.amount|submittedAmount/);
    assert.match(service, /durationMonths: row\.duration_months/);
    assert.match(service, /calculateApprovedSubscriptionExpiry\(now, currentPaidSubscription, term\)/);
    assert.match(service, /WHERE tenant_id=@tenantId AND status IN \('active','suspended'\) AND source='manual'[\s\S]*?price_snapshot>0 AND expires_at>@approvalTime/);
    assert.match(service, /expectedPricing\.amountDue/);
});

test('registration and in-app catalogs read allowed terms from the same SQL plan-term source', () => {
    const registration = read('src/services/commercial-service.js');
    const inApp = read('src/services/saas-service.js');
    assert.match(registration, /FROM dbo\.saas_plans p\s+LEFT JOIN dbo\.saas_plan_terms t ON t\.plan_id=p\.id AND t\.is_active=1/);
    assert.match(inApp, /FROM dbo\.saas_plan_terms WHERE plan_id IN/);
    const plan = { terms: [{ code: 'quarterly', durationMonths: 3, price: 900, currency: 'EGP', isActive: true }] };
    assert.equal(saasService.selectPlanTerm(plan, 'quarterly', { allowLegacy: false }).durationMonths, 3);
    assert.throws(() => saasService.selectPlanTerm(plan, 'annual', { allowLegacy: false }), (error) => error.code === 'SAAS_TERM_NOT_AVAILABLE');
});

test('Gym history and Platform Admin request table include the persisted request duration', () => {
    assert.match(read('src/services/saas-service.js'), /durationMonths: row\.duration_months/);
    assert.match(read('public/js/pages/saas/saas.js'), /state\.requests\[index\]\?\.durationMonths/);
    assert.match(read('public/js/platform-admin.js'), /state\.requests\[index\]\?\.durationMonths/);
    assert.match(read('public/js/platform-admin.js'), /registrationTermLabel\(\{ durationMonths: request\.durationMonths \}\)/);
    assert.match(read('src/services/saas-service.js'), /term\.durationMonths\);/);
});
