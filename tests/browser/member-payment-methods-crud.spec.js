'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const BASE_URL = process.env.MEMBER_PAYMENT_METHODS_QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/member-payment-methods-crud-20261018');

test('payment method CRUD edits locally, persists only on draft save, and publishes only on explicit publish', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The desktop worker owns isolated payment-method CRUD and screenshot verification.');
  test.setTimeout(90_000);
  const writes = [];
  const config = { identity: { paymentMethods: [
    { id: 'qa-vodafone', typeId: 'vodafone_cash', name: 'محفظة QA', accountReference: '01000000000', recipientName: 'مستلم اختبار', instructions: 'تحويل اختباري', isActive: true, sortOrder: 0 },
    { id: 'qa-legacy', name: 'وسيلة قديمة', accountReference: 'QA-OLD-01', recipientName: '', instructions: '', isActive: true, sortOrder: 1 }
  ] }, assets: {}, themes: { light: {}, dark: {} } };
  let published = structuredClone(config);
  const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let payload = {};
    if (request.method() !== 'GET' && request.method() !== 'HEAD' && request.method() !== 'OPTIONS') {
      const body = request.postDataJSON?.() || {};
      writes.push({ method: request.method(), pathname: url.pathname, body });
      if (url.pathname === '/api/branding/draft') {
        Object.assign(config, structuredClone(body.config));
        payload = { draft: structuredClone(config), published: structuredClone(published), version: 7 };
      } else if (url.pathname === '/api/branding/publish') {
        published = structuredClone(config);
        payload = { draft: structuredClone(config), published: structuredClone(published), version: 8 };
      }
      return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    }
    if (url.pathname === '/api/auth/session') payload = { authenticated: true, user: { id: 99111, name: 'Synthetic CRUD QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
    else if (url.pathname === '/api/saas/entitlements') payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
    else if (url.pathname === '/api/branding/settings') payload = { draft: structuredClone(config), published: structuredClone(published), version: 6 };
    else if (url.pathname === '/api/branding') payload = { branding: { identity: { brandName: 'Synthetic QA Gym' }, assets: {} }, version: 6 };
    else if (url.pathname === '/api/bootstrap' || url.pathname === '/api/branches/bootstrap') {
      const branch = { id: 1, name: 'QA branch', code: 'qa', status: 'active', isMain: true };
      payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
    }
    return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/u, (route) => route.abort());
  page.on('dialog', (dialog) => dialog.accept());
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/index.html#member-payment-methods`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
  const tab = page.locator('[data-page-tab="member-payment-methods"]');
  await expect(tab).toBeVisible({ timeout: 25_000 });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  await expect(page.locator('[data-member-payment-row]')).toHaveCount(2);

  // Cancel discards dialog-only edits and makes no request.
  await page.locator('#memberPaymentMethodAdd').click();
  await page.locator('#memberPaymentTypeSearch').fill('insta');
  await page.locator('#memberPaymentType').selectOption('instapay');
  await expect(page.locator('#memberPaymentName')).toHaveValue('إنستاباي');
  await page.locator('#memberPaymentName').fill('Will be cancelled');
  await page.locator('#memberPaymentReference').fill('CANCEL-01');
  await page.locator('[data-member-payment-dialog-close]').last().click();
  await expect(page.locator('[data-member-payment-row]')).toHaveCount(2);
  expect(writes).toHaveLength(0);

  // Apply commits only to the browser draft. Type remains id-based if name is edited.
  await page.locator('#memberPaymentMethodAdd').click();
  await page.locator('#memberPaymentTypeSearch').fill('insta');
  await page.locator('#memberPaymentType').selectOption('instapay');
  await page.locator('#memberPaymentName').fill('InstaPay edited display');
  await page.locator('#memberPaymentReference').fill('QA-INSTA-02');
  await page.locator('#memberPaymentRecipient').fill('Recipient QA');
  await page.locator('#memberPaymentInstructions').fill('Instructions visible only after publish');
  await fs.mkdir(OUTPUT, { recursive: true });
  await page.locator('#memberPaymentMethodDialog').screenshot({ path: path.join(OUTPUT, 'payment-method-dialog-desktop.png'), animations: 'disabled' });
  await page.locator('#memberPaymentApply').click();
  await expect(page.locator('[data-member-payment-row]')).toHaveCount(3);
  await expect(page.locator('[data-member-payment-row="2"]')).toContainText('InstaPay edited display');
  expect(writes).toHaveLength(0);

  // Edit changes the presentation label only; the stable provider id/logo remains attached.
  await page.locator('[data-member-payment-edit="0"]').click();
  await page.locator('#memberPaymentName').fill('Vodafone custom display');
  await page.locator('#memberPaymentApply').click();
  await expect(page.locator('[data-member-payment-row="0"] .member-payment-method-copy strong')).toHaveText('Vodafone custom display');
  await expect(page.locator('[data-member-payment-row="0"] .payment-method-brand-mark img')).toHaveAttribute('src', /payment-vodafone-cash/u);
  await page.locator('#memberPaymentMethodsSave').click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].pathname).toBe('/api/branding/draft');
  expect(writes[0].body.config.identity.paymentMethods[0].typeId).toBe('vodafone_cash');
  expect(writes[0].body.config.identity.paymentMethods[2].typeId).toBe('instapay');

  await page.locator('#memberPaymentMethodsPublish').click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].pathname).toBe('/api/branding/publish');
  expect(published.identity.paymentMethods[2].name).toBe('InstaPay edited display');

  // Removal remains confirmation-gated and local until a later explicit save.
  await page.locator('[data-member-payment-remove="1"]').click();
  await expect(page.locator('[data-member-payment-row]')).toHaveCount(2);
  expect(writes).toHaveLength(2);

  // Real viewport proof: responsive compact summary cards; no page overflow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.TopGymI18n.set('ar'));
  await expect(page.locator('#memberPaymentMethodsList')).toBeVisible();
  await page.locator('#memberPaymentMethodsSection').screenshot({ path: path.join(OUTPUT, 'payment-methods-mobile-390-ar-light.png'), fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(pageErrors).toEqual([]);
});
