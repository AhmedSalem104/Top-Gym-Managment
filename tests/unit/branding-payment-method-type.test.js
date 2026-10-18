'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../../public/js/core/payment-method-catalog');
const { DEFAULT_BRANDING, validateConfig } = require('../../src/services/branding-service');

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8');

test('manual transfer method type catalog is fixed, localized, and uses local assets only', () => {
  assert.deepEqual(catalog.types.map(({ id }) => id), ['vodafone_cash', 'instapay', 'other']);
  assert.equal(catalog.label('vodafone_cash', 'ar'), 'فودافون كاش');
  assert.equal(catalog.label('instapay', 'en'), 'InstaPay');
  assert.equal(catalog.get('other').logo, null);
  for (const type of catalog.types) {
    if (!type.logo) continue;
    assert.match(type.logo, /^\/assets\//u);
    assert.equal(fs.existsSync(path.resolve(__dirname, '../..', `public${type.logo}`)), true);
  }
});

test('branding preserves legacy missing type and validates explicit type ids', () => {
  const source = read('src/services/branding-service.js');
  assert.match(source, /\.\.\.\(typeId \? \{ typeId \} : \{\}\)/u);
  assert.match(source, /paymentMethodCatalog\.has\(method\.typeId\)/u);
  assert.match(source, /\.map\(\(\{ id, typeId, name, accountReference, recipientName, instructions, sortOrder \}\)/u);
  assert.match(source, /paymentMethodCatalog\.has\(typeId\) \? \{ typeId \} : \{\}/u);
  assert.match(source, /filter\(\(method\) => method\.isActive\)/u);

  const legacy = structuredClone(DEFAULT_BRANDING);
  legacy.identity.paymentMethods = [{ id: 'legacy', name: 'Old method', accountReference: '123', isActive: true }];
  assert.equal(validateConfig(legacy).errors.some((error) => error.field.endsWith('.typeId')), false);
  const supported = structuredClone(legacy);
  supported.identity.paymentMethods[0].typeId = 'instapay';
  assert.equal(validateConfig(supported).errors.some((error) => error.field.endsWith('.typeId')), false);
  const invalid = structuredClone(legacy);
  invalid.identity.paymentMethods[0].typeId = 'unknown_brand';
  assert.equal(validateConfig(invalid).errors.some((error) => error.field.endsWith('.typeId')), true);
});

test('member portal renders the same neutral-or-catalog mark without changing payment flow', () => {
  const source = read('public/js/member-portal-subscription.js');
  assert.match(source, /LogicFitPaymentMethodCatalog/u);
  assert.match(source, /createMark\?\.\(item\.typeId\)/u);
  assert.match(source, /portalPaymentMethod/u);
  assert.match(source, /data-portal-copy-payment/u);
});

test('Apply remains local while the established draft and publish calls stay explicit', () => {
  const source = read('public/js/pages/management/member-payment-methods.js');
  assert.match(source, /function applyEditor/u);
  assert.match(source, /function saveDraft/u);
  assert.match(source, /\/api\/branding\/draft/u);
  assert.match(source, /\/api\/branding\/publish/u);
  const apply = source.slice(source.indexOf('function applyEditor'), source.indexOf('function onTypeChange'));
  assert.doesNotMatch(apply, /topGymAuth\.api|\/api\//u);
});
