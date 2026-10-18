'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const planCatalog = require('../../src/services/saas-plan-catalog');
const featureCatalog = require('../../src/services/feature-catalog');

const BASE_URL = process.env.MEMBER_PAYMENT_METHODS_QA_BASE_URL || 'http://127.0.0.1:4173';
const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/member-payment-methods-crud-20261018');
const WIDTHS = [320, 390, 768, 1440];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const METHODS_FIXTURE = Object.freeze({
  draft: { identity: { paymentMethods: [
    { id: 'fixture-transfer-1', typeId: 'vodafone_cash', name: 'تحويل محفظة QA', accountReference: 'QA-ACCOUNT-2026', recipientName: 'اسم مستلم عربي غير مترجم', instructions: 'بيانات تجريبية تبقى كما هي عند تبديل اللغة.', isActive: true, sortOrder: 0 },
    { id: 'fixture-transfer-2', name: 'Fixture legacy', accountReference: 'QA-CASH-2026', recipientName: 'Fixture recipient', instructions: '', isActive: false, sortOrder: 1 }
  ] }, assets: {}, themes: { light: {}, dark: {} } },
  published: { identity: { paymentMethods: [] }, assets: {}, themes: { light: {}, dark: {} } }, version: 12, metadata: null, audit: []
});

test('payment-method table and edit dialog stay localized and responsive in both themes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One isolated browser worker captures the complete table presentation matrix.');
  test.setTimeout(150_000);
  const requests = [];
  const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ method: request.method(), pathname: url.pathname });
    let payload = {};
    if (url.pathname === '/api/auth/session') payload = { authenticated: true, user: { id: 98151, name: 'Synthetic Payment Methods QA Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
    else if (url.pathname === '/api/saas/entitlements') payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: plan.code, name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan(plan.code), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }) } };
    else if (url.pathname === '/api/branding/settings') payload = JSON.parse(JSON.stringify(METHODS_FIXTURE));
    else if (url.pathname === '/api/branding') payload = { branding: { identity: { brandName: 'Synthetic Payment Methods Gym' }, assets: {} }, version: METHODS_FIXTURE.version };
    else if (url.pathname === '/api/bootstrap' || url.pathname === '/api/branches/bootstrap') {
      const branch = { id: 1, name: 'QA Main Branch', code: 'qa-main', status: 'active', isMain: true };
      payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [] };
    }
    return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/u, (route) => route.abort());
  await page.goto(`${BASE_URL}/index.html#member-payment-methods`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.topGymAuth?.isReady?.() === true, null, { timeout: 25_000 });
  await expect.poll(() => page.evaluate(() => Boolean(window.TopGymI18n))).toBe(true);
  const tab = page.locator('[data-page-tab="member-payment-methods"]');
  await expect(tab).toBeVisible({ timeout: 25_000 });
  if (await tab.getAttribute('aria-selected') !== 'true') await tab.click();
  const section = page.locator('#memberPaymentMethodsSection');
  await expect(section).toBeVisible();
  await expect(page.locator('[data-member-payment-row]')).toHaveCount(2);
  await expect(page.locator('[data-member-payment-row="0"]')).toContainText('QA-ACCOUNT-2026');
  await expect(page.locator('[data-member-payment-row="1"] .payment-method-brand-mark img')).toHaveCount(0);
  await page.locator('[data-member-payment-row="0"] .payment-method-brand-mark img').evaluate((image) => image.dispatchEvent(new Event('error')));
  await expect.poll(() => page.locator('[data-member-payment-row="0"] .payment-method-brand-mark').getAttribute('class')).toContain('is-fallback');
  await page.evaluate(() => window.TopGymI18n.set('en'));
  await page.locator('[data-member-payment-edit="0"]').click();
  const dialog = page.locator('#memberPaymentMethodDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#memberPaymentType')).toHaveValue('vodafone_cash');
  const revisedRecipient = 'مستلم تجريبي محفوظ داخل المسودة';
  await page.locator('#memberPaymentRecipient').fill(revisedRecipient);
  await page.locator('#memberPaymentApply').click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('[data-member-payment-row="0"]')).toContainText(revisedRecipient);
  const readCountBeforePresentation = requests.length;
  await fs.mkdir(OUTPUT, { recursive: true });
  const evidence = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    for (const theme of THEMES) {
      await page.evaluate((mode) => { window.TopGymTheme?.set?.(mode); document.documentElement.dataset.theme = mode; document.body.dataset.theme = mode; }, theme);
      for (const locale of LOCALES) {
        await page.evaluate((value) => window.TopGymI18n.set(value), locale);
        await expect(page.locator('#memberPaymentMethodsTitle')).toHaveText(locale === 'en' ? 'Gym member payment methods' : 'وسائل دفع أعضاء الجيم');
        await expect(page.locator('.member-payment-table thead')).toContainText(locale === 'en' ? 'Visible to member' : 'الظهور للعضو');
        await expect(page.locator('[data-member-payment-row="0"]')).toContainText(revisedRecipient);
        const snapshot = await page.evaluate(() => ({
          viewport: innerWidth, docWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
          direction: getComputedStyle(document.querySelector('#memberPaymentMethodsSection')).direction,
          locale: window.TopGymI18n.get(), theme: document.documentElement.dataset.theme,
          rowCount: document.querySelectorAll('[data-member-payment-row]').length
        }));
        expect(snapshot.docWidth).toBeLessThanOrEqual(width);
        expect(snapshot.bodyWidth).toBeLessThanOrEqual(width);
        expect(snapshot.direction).toBe(locale === 'ar' ? 'rtl' : 'ltr');
        evidence.push(snapshot);
        if ((width === 390 && locale === 'ar' && theme === 'light') || (width === 1440 && locale === 'en' && theme === 'dark')) {
          await section.screenshot({ path: path.join(OUTPUT, `payment-methods-${width}-${theme}-${locale}.png`), fullPage: true, animations: 'disabled' });
        }
      }
    }
  }
  expect(requests.slice(readCountBeforePresentation).filter(({ pathname }) => pathname !== '/api/notifications/stream')).toEqual([]);
  expect(requests.filter(({ pathname, method }) => pathname === '/api/branding/settings' && method === 'GET')).toHaveLength(1);
  await fs.writeFile(path.join(OUTPUT, 'presentation-matrix.json'), JSON.stringify({ generatedAt: new Date().toISOString(), viewports: WIDTHS, themes: THEMES, locales: LOCALES, evidence }, null, 2));
});
