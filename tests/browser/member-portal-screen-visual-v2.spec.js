'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '../..');
const cssRoot = path.join(projectRoot, 'public/css');
const importPattern = /@import\s+(?:url\()?['"]([^'"]+)['"]\)?\s*;/g;
const widths = [320, 390, 768, 1024, 1440];
const modes = [
  { theme: 'light', locale: 'ar', dir: 'rtl' },
  { theme: 'dark', locale: 'ar', dir: 'rtl' },
  { theme: 'light', locale: 'en', dir: 'ltr' },
  { theme: 'dark', locale: 'en', dir: 'ltr' }
];

function expandCss(file, chain = []) {
  const absolute = path.resolve(file);
  if (chain.includes(absolute)) throw new Error(`Circular CSS import: ${absolute}`);
  const source = fs.readFileSync(absolute, 'utf8');
  return source.replace(importPattern, (_, importPath) => {
    if (/^(?:https?:|data:)/i.test(importPath)) return `@import url("${importPath}");`;
    const target = path.resolve(path.dirname(absolute), importPath);
    if (!target.startsWith(`${cssRoot}${path.sep}`)) throw new Error(`CSS import escaped source root: ${importPath}`);
    return expandCss(target, [...chain, absolute]);
  });
}

const fixtureCss = esbuild.transformSync(
  expandCss(path.join(cssRoot, 'main.source.css')),
  { loader: 'css', minify: true, legalComments: 'none' }
).code;

test('Member Portal mounted visual roots: safe modal, 5 viewports, both themes and locales (read-only fixtures)', async ({ page }) => {
  test.setTimeout(240_000);
  const apiRequests = [];
  const pageErrors = [];
  const artifacts = path.join(projectRoot, 'qa/artifacts/member-portal-screen-visual-v2');
  await fsp.mkdir(artifacts, { recursive: true });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/css/main.css*', route => route.fulfill({
    status: 200, contentType: 'text/css; charset=utf-8', body: fixtureCss
  }));
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    apiRequests.push({ method: request.method(), path: url.pathname });
    if (request.method() !== 'GET') return route.abort('blockedbyclient');
    if (url.pathname === '/api/branding') {
      return route.fulfill({ json: { branding: { identity: { brandName: 'QA Member Club' } }, version: 1 } });
    }
    if (url.pathname === '/api/member-portal/library/options') {
      return route.fulfill({ json: { filters: { categories: [], difficulties: [], equipment: [] } } });
    }
    if (/^\/api\/member-portal\/library\/(exercises|foods)$/.test(url.pathname)) {
      if (url.pathname.endsWith('/foods')) return route.fulfill({ json: { items: [], pagination: { page: 1, pageSize: 18, totalItems: 0, totalPages: 0 } } });
      return route.fulfill({ json: { items: [exercise], pagination: { page: 1, pageSize: 18, totalItems: 1, totalPages: 1 } } });
    }
    if (url.pathname === '/api/member-portal/library/exercises/qa-long-detail') {
      return route.fulfill({ json: { item: exercise } });
    }
    if (url.pathname === '/api/member-portal/membership-catalog') {
      return route.fulfill({ json: { plans: [], types: [], prices: {}, currency: 'EGP' } });
    }
    if (url.pathname === '/api/member-portal/payment-methods') return route.fulfill({ json: { paymentMethods: [] } });
    if (url.pathname === '/api/member-portal/subscription-requests') return route.fulfill({ json: { requests: [] } });
    return route.fulfill({ json: {} });
  });

  await page.goto('/member-portal', { waitUntil: 'networkidle' });
  await expect(page.locator('#portalLoginPanel')).toBeVisible();

  // Mount a synthetic successful portal view without running the lookup endpoint.
  // This exercises the real HTML/CSS/controllers while making all API access read-only.
  await page.evaluate(() => {
    document.querySelector('#portalLoginPanel').hidden = true;
    document.querySelector('#portalResult').hidden = false;
    document.querySelector('#portalHomeView').hidden = false;
  });

  const measurements = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 390 ? 800 : 1000 });
    for (const mode of modes) {
      await page.evaluate(({ theme, locale }) => {
        window.TopGymTheme?.set(theme);
        window.TopGymI18n?.set(locale, { persist: false });
      }, mode);
      await expect.poll(() => page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        bodyTheme: document.body.dataset.theme,
        locale: window.TopGymI18n?.get(),
        dir: document.documentElement.dir
      }))).toEqual({ theme: mode.theme, bodyTheme: mode.theme, locale: mode.locale, dir: mode.dir });

      await assertNoPageOverflow(page, width, `home ${mode.theme}/${mode.locale}`);
      await expect(page.locator('[data-portal-tool]')).toHaveCount(5);
      const homeGeometry = await page.locator('#portalHomeView').evaluate(rectInfo);
      expect(homeGeometry.left).toBeGreaterThanOrEqual(-1);
      expect(homeGeometry.right).toBeLessThanOrEqual(width + 1);
      await capture(page, artifacts, `home-${width}-${mode.theme}-${mode.locale}`);

      await page.locator('[data-portal-tool="exercises"]').click();
      await expect(page.locator('#portalLibrarySection')).toBeVisible();
      const detailsButton = page.locator('[data-library-details="exercises"]');
      await expect(detailsButton).toBeVisible();
      await detailsButton.click();
      const modal = page.locator('#portalLibraryModal');
      await expect(modal).toBeVisible();
      const modalCloseButton = page.locator('[data-library-modal-close]');
      await expect(modalCloseButton).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(modalCloseButton, 'Tab remains inside the one-control details dialog').toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(modalCloseButton, 'Shift+Tab remains inside the details dialog').toBeFocused();
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden();
      await expect(detailsButton, 'Escape restores focus to the opening exercise action').toBeFocused();
      await detailsButton.click();
      await expect(modal).toBeVisible();
      await expect(modalCloseButton).toBeFocused();
      const modalState = await page.evaluate(() => {
        const overlay = document.querySelector('#portalLibraryModal');
        const card = overlay.querySelector('.portal-library-modal-card');
        const close = overlay.querySelector('[data-library-modal-close]');
        const overlayRect = overlay.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const closeRect = close.getBoundingClientRect();
        return {
          overlayRect: { top: overlayRect.top, right: overlayRect.right, bottom: overlayRect.bottom, left: overlayRect.left },
          backdropCoversViewportCorner: document.elementFromPoint(1, 1) === overlay,
          overlayBackground: getComputedStyle(overlay).backgroundColor,
          overlayPosition: getComputedStyle(overlay).position,
          overlayInset: getComputedStyle(overlay).inset,
          overlayToken: getComputedStyle(document.body).getPropertyValue('--overlay').trim(),
          viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight, scrollX: window.scrollX, scrollY: window.scrollY },
          ancestors: (() => { const items = []; for (let node = overlay.parentElement; node; node = node.parentElement) { const style = getComputedStyle(node); items.push({ tag: node.tagName, id: node.id, className: String(node.className || ''), position: style.position, transform: style.transform, filter: style.filter, contain: style.contain, overflow: style.overflow, rect: (() => { const rect = node.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; })() }); } return items; })(),
          parent: { tag: overlay.parentElement?.tagName, id: overlay.parentElement?.id, className: overlay.parentElement?.className, position: getComputedStyle(overlay.parentElement).position, overflow: getComputedStyle(overlay.parentElement).overflow },
          overlay: { clientHeight: overlay.clientHeight, scrollHeight: overlay.scrollHeight, clientWidth: overlay.clientWidth, scrollWidth: overlay.scrollWidth },
          card: { top: cardRect.top, bottom: cardRect.bottom, left: cardRect.left, right: cardRect.right, clientHeight: card.clientHeight, scrollHeight: card.scrollHeight },
          close: { width: closeRect.width, height: closeRect.height },
          activeElement: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || ''
        };
      });
      expect(modalState.overlayRect.left, JSON.stringify(modalState)).toBeLessThanOrEqual(0);
      expect(modalState.overlayRect.top).toBeLessThanOrEqual(0);
      expect(modalState.overlayRect.right).toBeGreaterThanOrEqual(width);
      expect(modalState.overlayRect.bottom).toBeGreaterThanOrEqual(width <= 390 ? 800 : 1000);
      expect(modalState.backdropCoversViewportCorner, 'backdrop is not clipped by the result surface').toBe(true);
      expect(modalState.overlayBackground).not.toBe('rgba(0, 0, 0, 0)');
      expect(modalState.card.left, 'dialog stays within viewport').toBeGreaterThanOrEqual(-1);
      expect(modalState.card.right, 'dialog stays within viewport').toBeLessThanOrEqual(width + 1);
      expect(modalState.card.top).toBeGreaterThanOrEqual(-1);
      expect(modalState.card.bottom).toBeLessThanOrEqual((width <= 390 ? 800 : 1000) + 1);
      expect(modalState.close.width).toBeGreaterThanOrEqual(44);
      expect(modalState.close.height).toBeGreaterThanOrEqual(44);
      expect(modalState.overlay.scrollHeight).toBeLessThanOrEqual(modalState.overlay.clientHeight + 1);
      expect(modalState.overlay.scrollWidth).toBeLessThanOrEqual(modalState.overlay.clientWidth + 1);
      expect(modalState.card.scrollHeight).toBeGreaterThan(modalState.card.clientHeight);
      await assertNoPageOverflow(page, width, `exercise detail dialog ${mode.theme}/${mode.locale}`);
      await capture(page, artifacts, `exercise-dialog-${width}-${mode.theme}-${mode.locale}`, false);
      measurements.push({ width, ...mode, modalState });

      const closeButton = page.locator('[data-library-modal-close]');
      await page.locator('.portal-library-modal-card').evaluate(card => { card.scrollTop = card.scrollHeight; });
      await expect(closeButton).toBeVisible();
      await closeButton.focus({ focusVisible: true });
      await expect(closeButton).toBeFocused();
      const focusIsVisible = await closeButton.evaluate(element => {
        const style = getComputedStyle(element);
        return parseFloat(style.outlineWidth) >= 2 || style.boxShadow !== 'none';
      });
      expect(focusIsVisible).toBe(true);
      await page.keyboard.press('Enter');
      await expect(modal).toBeHidden();
      await expect(detailsButton, 'button close also restores focus to the opening action').toBeFocused();
      await page.locator('#portalLibraryMount [data-library-close]').click();
      await expect(page.locator('#portalHomeView')).toBeVisible();

      const toolRoots = [
        { tool: 'print', root: '#portalReportContent', focus: '#portalPrintButton' },
        { tool: 'feedback', root: '#portalFeedbackSection', focus: '#portalFeedbackStars button' },
        { tool: 'foods', root: '#portalLibrarySection', focus: '#portalLibrarySearch' },
        { tool: 'subscription', root: '#portalSubscriptionSection', focus: '#portalSubscriptionPlan' }
      ];
      for (const tool of toolRoots) {
        await page.locator(`[data-portal-tool="${tool.tool}"]`).click();
        await expect(page.locator(tool.root)).toBeVisible();
        await expect(page.locator(tool.focus).first()).toBeVisible();
        if (tool.tool === 'foods' || tool.tool === 'exercises') {
          await expect(page.locator('#portalViewToolbar')).toBeHidden();
          await expect(page.locator('#portalLibraryTitle')).toHaveText(mode.locale === 'en'
            ? (tool.tool === 'foods' ? 'Nutrition guide' : 'Exercise guide')
            : (tool.tool === 'foods' ? 'دليل التغذية' : 'دليل التمارين'));
        }
        if (tool.tool === 'subscription' && mode.locale === 'en') {
          const visibleCopy = await page.locator(tool.root).innerText();
          expect(visibleCopy, 'English subscription UI should not contain untranslated Arabic static copy').not.toMatch(/[\u0600-\u06FF]/);
        }
        const footerText = await page.locator('[data-portal-brand-footer]').textContent();
        expect(footerText.trim()).toBe(mode.locale === 'en' ? 'Smarter management, better performance.' : 'إدارة أذكى، أداء أفضل.');
        if (tool.tool === 'print') {
          await expect(page.locator('.portal-report-signatures [data-i18n="memberPortal.report.issuedBy"]'))
            .toHaveText(mode.locale === 'en' ? 'Issued by' : 'صادر من إدارة');
        }
        await assertNoPageOverflow(page, width, `${tool.tool} root ${mode.theme}/${mode.locale}`);
        await capture(page, artifacts, `${tool.tool}-${width}-${mode.theme}-${mode.locale}`);
        if (tool.tool === 'foods') await page.locator('#portalLibraryMount [data-library-close]').click();
        else await page.locator('[data-portal-back]').click();
        await expect(page.locator('#portalHomeView')).toBeVisible();
      }
    }
  }

  expect(apiRequests.every(request => request.method === 'GET')).toBe(true);
  expect(apiRequests.some(request => request.path === '/api/member-portal/lookup')).toBe(false);
  expect(apiRequests.some(request => request.path.includes('feedback'))).toBe(false);
  expect(pageErrors).toEqual([]);
  await fsp.writeFile(path.join(artifacts, 'matrix.json'), JSON.stringify({
    widths,
    modes,
    roots: ['portalResult', 'portalHomeView', 'portalLibrarySection', 'portalLibraryModal'],
    toolsPreserved: 5,
    api: { policy: 'GET-only fixture interception; lookup and all write endpoints blocked; no POST submitted', requests: apiRequests },
    assertions: ['page overflow', 'dialog viewport containment', 'single dialog scroll container', '44px close target', 'keyboard close', 'five original tool actions'],
    cases: measurements,
    pageErrors
  }, null, 2), 'utf8');
});

test('Member Portal library headings and tenant footer follow the active locale without duplicate titles', async ({ page }) => {
  const requests = [];
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({ method: request.method(), path: url.pathname });
    if (request.method() !== 'GET') return route.abort('blockedbyclient');
    if (url.pathname === '/api/branding') {
      return route.fulfill({ json: { branding: { identity: { brandName: 'QA Member Club' } }, version: 1 } });
    }
    if (url.pathname === '/api/member-portal/library/options') {
      return route.fulfill({ json: { filters: { categories: [], difficulties: [], equipment: [] } } });
    }
    if (url.pathname === '/api/member-portal/library/foods') {
      return route.fulfill({ json: { items: [], pagination: { page: 1, pageSize: 18, totalItems: 0, totalPages: 0 } } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto('/member-portal', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.querySelector('#portalLoginPanel').hidden = true;
    document.querySelector('#portalResult').hidden = false;
    document.querySelector('#portalHomeView').hidden = false;
    window.TopGymTheme?.set('dark');
    window.TopGymI18n?.set('en', { persist: false });
  });
  await page.locator('[data-portal-tool="foods"]').click();
  await expect(page.locator('#portalLibrarySearch')).toBeVisible();
  await expect(page.locator('#portalViewToolbar')).toBeHidden();
  await expect(page.locator('#portalLibraryTitle')).toHaveText('Nutrition guide');
  await expect(page.locator('[data-portal-brand-footer]')).toHaveText('Smarter management, better performance.');
  await expect(page.locator('#portalLibraryTitle')).toBeVisible();
  await page.evaluate(() => window.TopGymI18n?.set('ar', { persist: false }));
  await expect(page.locator('#portalLibraryTitle')).toHaveText('دليل التغذية');
  await expect(page.locator('[data-portal-brand-footer]')).toHaveText('إدارة أذكى، أداء أفضل.');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  await page.locator('#portalLibraryMount [data-library-close]').click();
  await page.locator('[data-portal-tool="print"]').click();
  await expect(page.locator('#portalViewTitle')).toHaveText('بياناتي وطباعتها');
  await expect(page.locator('.portal-report-signatures [data-i18n="memberPortal.report.issuedBy"]')).toHaveText('صادر من إدارة');
  await page.evaluate(() => window.TopGymI18n?.set('en', { persist: false }));
  await expect(page.locator('#portalViewTitle')).toHaveText('My details and report');
  await expect(page.locator('.portal-report-signatures [data-i18n="memberPortal.report.issuedBy"]')).toHaveText('Issued by');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  expect(requests.every(request => request.method === 'GET')).toBe(true);
  expect(requests.some(request => request.path === '/api/member-portal/lookup')).toBe(false);
  await page.screenshot({ path: path.join(projectRoot, 'qa/artifacts/member-portal-screen-visual-v2/locale-and-title-390-dark-en.png'), fullPage: true });
});

const exercise = {
  id: 'qa-long-detail',
  name: 'QA Long Exercise Details',
  nameAr: 'تمرين تجريبي لاختبار تفاصيل طويلة',
  targetMuscleNameAr: 'عضلات الظهر والكتفين',
  difficulty: 'beginner',
  equipment: 'bodyweight',
  setsRange: '3–4',
  repsRange: '10–12',
  restSeconds: 60,
  tempo: '2-1-2',
  descriptionAr: 'تفاصيل اختبارية طويلة للتأكد من احتواء الحوار والتمرير داخل البطاقة دون خروجها عن حدود الشاشة. '.repeat(4),
  instructionsAr: Array.from({ length: 18 }, (_, index) => `تعليمات اختبارية للخطوة ${index + 1} مع وصف ممتد يختبر طول المحتوى داخل نافذة التفاصيل.`),
  tipsAr: ['حافظ على ثبات الحركة أثناء الأداء.'],
  commonMistakesAr: ['تجنب السرعة الزائدة أثناء التمرين.'],
  sets: 3,
  reps: 12
};

async function assertNoPageOverflow(page, width, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(dimensions.document, `${label} at ${width}px has no horizontal page overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function capture(page, directory, name, fullPage = true) {
  await page.screenshot({ path: path.join(directory, `${name}.png`), fullPage });
}

function rectInfo(element) {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, right: rect.right, width: rect.width };
}
