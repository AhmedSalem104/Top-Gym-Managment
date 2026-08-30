'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4174';
const artifacts = path.join(root, 'qa', 'artifacts');
const viewports = [
  { name: '375', width: 375, height: 812 },
  { name: '430', width: 430, height: 900 },
  { name: '768', width: 768, height: 900 },
  { name: '1024', width: 1024, height: 900 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 }
];
const screenIds = ['dashboardSection', 'membersSection', 'traineesSection', 'managementSection', 'backupHistorySection', 'attendanceSection', 'expensesSection', 'librarySection', 'reportsSection', 'brandingSection', 'memberPaymentMethodsSection', 'permissionsSection', 'intelligenceSection', 'feedbackSection', 'storeSection', 'memberSubscriptionRequestsSection', 'portalAnalyticsSection'];
const dialogIds = ['actionDialog', 'pricingDialog', 'membershipTypesDialog', 'membershipPlanDialog', 'membershipTypeDialog', 'detailsDialog', 'qrReaderDialog', 'memberQrDialog', 'libraryFormDialog', 'libraryDetailsDialog', 'externalTraineeDialog', 'coachingProfileDialog', 'coachingBuilderDialog', 'authUserDialog', 'backupRestoreDialog', 'expenseDialog', 'memberDialog'];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function prepareShell(page, target) {
  return page.evaluate((targetId) => {
    document.body.classList.remove('auth-pending', 'auth-locked', 'top-gym-navigation-pending');
    document.getElementById('authScreen').hidden = true;
    document.querySelector('.app-shell').style.removeProperty('display');
    const root = document.getElementById('dashboardSection');
    if (!targetId || targetId === 'dashboardSection') return;
    [...root.children].forEach((child) => {
      if (child.id !== targetId && !child.contains(document.getElementById(targetId))) child.hidden = true;
    });
    let current = document.getElementById(targetId);
    while (current && current !== document.body) {
      current.hidden = false;
      current = current.parentElement;
    }
  }, target);
}

async function checkPage(page, target, viewport, saveScreenshot) {
  const requiredFeature = target === 'expensesSection' ? 'finance' : null;
  if (requiredFeature) {
    await page.evaluate(async (feature) => {
      await window.topGymEnsureTab?.(feature);
    }, requiredFeature);
  }
  await prepareShell(page, target);
  const result = await page.evaluate((targetId) => ({
    target: targetId,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    visible: !!document.getElementById(targetId) && !document.getElementById(targetId).hidden
  }), target);
  assert(result.visible, `${target} is not visible in forced browser state`);
  assert(!result.overflow, `${target} overflows at ${viewport.name}px (${result.scrollWidth}/${result.viewport})`);
  if (saveScreenshot) await page.screenshot({ path: path.join(artifacts, `${target}-${viewport.name}.png`), fullPage: true });
  return result;
}

async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const summary = [];
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const pageErrors = [];
      const consoleErrors = [];
      const badResponses = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        // Optional third-party font/CDN failures must not mask application
        // errors in an offline QA environment; app-origin errors are still
        // collected by the response assertion below.
        if (message.text().includes('net::ERR_NAME_NOT_RESOLVED')) return;
        consoleErrors.push(message.text());
      });
      page.on('response', (response) => {
        if (response.status() < 400) return;
        try {
          if (new URL(response.url()).origin === new URL(baseUrl).origin) badResponses.push(`${response.status()} ${response.url()}`);
        } catch (_) { badResponses.push(`${response.status()} ${response.url()}`); }
      });
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      const login = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        stylesheetCount: [...document.styleSheets].filter((sheet) => sheet.href?.includes('/css/main.css')).length,
        authVisible: getComputedStyle(document.getElementById('authScreen')).display !== 'none'
      }));
      assert(!login.overflow, `login overflows at ${viewport.name}px`);
      assert(login.stylesheetCount === 1, `main.css is not loaded exactly once at ${viewport.name}px`);
      assert(login.authVisible, `login is not visible at ${viewport.name}px`);
      assert(pageErrors.length === 0, `page error at ${viewport.name}px: ${pageErrors.join(' | ')}`);
      assert(consoleErrors.length === 0, `console error at ${viewport.name}px: ${consoleErrors.join(' | ')}`);
      assert(badResponses.length === 0, `failed response at ${viewport.name}px: ${badResponses.join(' | ')}`);
      await page.screenshot({ path: path.join(artifacts, `login-${viewport.name}.png`), fullPage: true });
      summary.push(`Login ${viewport.name}: PASS (console 0, failed requests 0)`);
      for (const target of screenIds) {
        const result = await checkPage(page, target, viewport, viewport.name === '430' || viewport.name === '1440');
        summary.push(`${target} ${viewport.name}: PASS (${result.scrollWidth}px)`);
      }
      await page.close();
    }

    for (const width of [375, 430, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
      for (const dialogId of dialogIds) {
        const result = await page.evaluate((id) => {
          const dialog = document.getElementById(id);
          if (!dialog) return { id, exists: false };
          try { dialog.showModal(); } catch (error) { return { id, exists: true, error: error.message }; }
          const rect = dialog.getBoundingClientRect();
          const within = rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth + 1 && rect.bottom <= window.innerHeight + 1;
          dialog.close();
          return { id, exists: true, within, width: Math.round(rect.width), height: Math.round(rect.height) };
        }, dialogId);
        assert(result.exists, `${dialogId} is missing at ${width}px`);
        assert(!result.error && result.within, `${dialogId} exceeds viewport at ${width}px`);
      }
      summary.push(`Dialogs ${width}: PASS`);
      await page.close();
    }

    for (const theme of ['light', 'dark']) {
      for (const viewport of [{ name: '430', width: 430, height: 900 }, { name: '1440', width: 1440, height: 900 }]) {
        const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await page.addInitScript((savedTheme) => {
          window.localStorage.setItem('topgym-theme', savedTheme);
        }, theme);
        await page.goto(`${baseUrl}/member-portal`, { waitUntil: 'networkidle' });
        const portal = await page.evaluate(() => {
          const visibleSurfaces = [...document.querySelectorAll('.portal-login, .portal-result, .portal-tool-card, input, textarea, select')]
            .filter((element) => !element.hidden && getComputedStyle(element).display !== 'none');
          const whiteSurfaces = visibleSurfaces.filter((element) => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)').length;
          return {
            theme: document.documentElement.dataset.theme,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            stylesheetCount: [...document.styleSheets].filter((sheet) => sheet.href?.includes('/css/main.css')).length,
            brandingLoaded: Boolean(window.topGymBranding?.get),
            brandName: document.querySelector('[data-brand-text="brandName"]')?.textContent?.trim() || '',
            appBackground: getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim(),
            whiteSurfaces
          };
        });
        assert(portal.theme === theme, `member portal did not load ${theme} theme at ${viewport.name}px`);
        assert(!portal.overflow, `member portal overflows at ${theme}/${viewport.name}px (${portal.scrollWidth}/${portal.viewport})`);
        assert(portal.stylesheetCount === 1, `member portal loads main.css more than once at ${theme}/${viewport.name}px`);
        assert(portal.brandingLoaded && portal.brandName, `member portal branding did not load at ${theme}/${viewport.name}px`);
        if (theme === 'dark') assert(portal.whiteSurfaces === 0, `member portal exposes ${portal.whiteSurfaces} white surface(s) in dark mode at ${viewport.name}px`);
        if (viewport.name === '430') await page.screenshot({ path: path.join(artifacts, `member-portal-${theme}-${viewport.name}.png`), fullPage: true });
        summary.push(`Member portal ${theme} ${viewport.name}: PASS (${portal.scrollWidth}px, ${portal.appBackground})`);
        await page.close();
      }
    }

    for (const theme of ['light', 'dark']) {
      for (const viewport of [{ name: '430', width: 430, height: 900 }, { name: '1440', width: 1440, height: 900 }]) {
        const gatewayPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
        await gatewayPage.addInitScript((savedTheme) => {
          window.localStorage.setItem('topgym-theme', savedTheme);
        }, theme);
        await gatewayPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
        const gateway = await gatewayPage.evaluate(() => {
          const surfaces = [...document.querySelectorAll('.saas-entry-preview-window, .saas-entry-preview-welcome, .saas-entry-preview-kpis article, .saas-entry-preview-chart, .saas-entry-preview-activity, .saas-entry-action')]
            .filter((element) => !element.hidden && getComputedStyle(element).display !== 'none');
          const whiteSurfaces = surfaces.filter((element) => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)').length;
          return {
            theme: document.documentElement.dataset.theme,
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            viewport: window.innerWidth,
            stage: document.getElementById('authScreen')?.dataset.authStage || '',
            entryVisible: Boolean(document.getElementById('saasEntryCard') && !document.getElementById('saasEntryCard').hidden),
            previewVisible: Boolean(document.querySelector('.saas-entry-preview')),
            whiteSurfaces
          };
        });
        assert(gateway.theme === theme, `pre-login gateway did not load ${theme} theme at ${viewport.name}px`);
        assert(!gateway.overflow, `pre-login gateway overflows at ${theme}/${viewport.name}px (${gateway.scrollWidth}/${gateway.viewport})`);
        assert(gateway.stage === 'gateway' && gateway.entryVisible && gateway.previewVisible, `pre-login gateway is not visible at ${theme}/${viewport.name}px`);
        if (theme === 'dark') assert(gateway.whiteSurfaces === 0, `pre-login gateway exposes ${gateway.whiteSurfaces} white surface(s) in dark mode at ${viewport.name}px`);
        if (viewport.name === '430') await gatewayPage.screenshot({ path: path.join(artifacts, `login-gateway-${theme}-${viewport.name}.png`), fullPage: true });
        summary.push(`Pre-login gateway ${theme} ${viewport.name}: PASS (${gateway.scrollWidth}px)`);
        await gatewayPage.close();
      }
    }

    const printPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await printPage.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
    await prepareShell(printPage, 'dashboardSection');
    await printPage.emulateMedia({ media: 'print' });
    const print = await printPage.evaluate(() => ({
      topbar: getComputedStyle(document.querySelector('.topbar')).display,
      tabs: getComputedStyle(document.querySelector('.page-tabs')).display,
      stylesheetCount: [...document.styleSheets].filter((sheet) => sheet.href?.includes('/css/main.css')).length
    }));
    assert(print.topbar === 'none' && print.tabs === 'none', 'print view exposes navigation');
    assert(print.stylesheetCount === 1, 'print view loses main stylesheet');
    const pdfPath = path.join(artifacts, 'print-qa.pdf');
    await printPage.pdf({ path: pdfPath, format: 'A4', printBackground: true });
    assert(fs.statSync(pdfPath).size > 1000, 'print PDF is empty or too small');
    summary.push('Print media: PASS');
    await printPage.close();
  } finally {
    await browser.close();
  }
  console.log(summary.join('\n'));
  console.log('BROWSER_STYLE_QA_PASSED');
}

main().catch((error) => {
  console.error(`BROWSER_STYLE_QA_FAILED: ${error.message}`);
  process.exitCode = 1;
});
