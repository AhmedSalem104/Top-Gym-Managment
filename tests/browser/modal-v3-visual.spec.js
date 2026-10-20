'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const ids = [
  'authRegistrationDialog', 'authRecoveryDialog', 'dashboardScopeDialog', 'memberPaymentMethodDialog',
  'dayPassDialog', 'expenseDialog', 'memberDialog', 'actionDialog', 'membershipPlanDialog',
  'membershipTypeDialog', 'detailsDialog', 'qrReaderDialog', 'memberQrDialog', 'branchCreateDialog',
  'backupRestoreDialog', 'authUserDialog', 'libraryFormDialog', 'libraryDetailsDialog',
  'externalTraineeDialog', 'coachingBuilderDialog', 'coachingProfileDialog', 'measurementDialog',
  'checkinDialog', 'coachingSubscriptionDialog', 'coachingClientEditDialog', 'coachingSessionDialog',
  'coachingMealLogDialog', 'trainerClientDialog', 'trainerClientDetailsDialog', 'trainerTimelineDialog',
  'trainerMeasurementDialog', 'trainerCheckinDialog', 'trainerPackageDialog', 'trainerSessionDialog',
  'trainerPurchaseDialog', 'trainerPaymentDialog', 'platformActionDialog',
  'platformRegistrationCredentialsDialog', 'saasRequestDialog'
];

test('Modal V3 applies only to the 40 approved custom experiences and stays within responsive viewports', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The modal viewport/theme sweep runs once in desktop Chromium.');
  await page.setContent('<!doctype html><html lang="ar" dir="rtl"><head></head><body class="member-portal-page"></body></html>');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addStyleTag({ path: path.join(root, 'public/css/main.css') });
  await page.addScriptTag({ path: path.join(root, 'public/js/dialog-enhancements.js') });
  await page.evaluate((dialogIds) => {
    const rootElement = document.body;
    for (const [index, id] of dialogIds.entries()) {
      const dialog = document.createElement('dialog');
      dialog.id = id;
      dialog.className = 'lf-modal-shell lf-modal--md lf-modal--structured';
      dialog.innerHTML = `<form class="dialog-body"><header class="dialog-header"><div><h2 id="title-${index}">عنوان نافذة اختبار</h2><p>وصف مختصر قابل للالتفاف</p></div><button class="dialog-close" type="button" data-dialog-cancel aria-label="إغلاق">×</button></header><div class="field-grid"><label>اسم تجريبي<input value="بيانات اختبار" /></label><label>نوع البيانات<select><option>اختيار</option></select></label></div><div class="dialog-actions"><button class="btn btn-light" type="button" id="cancel-${index}">إلغاء</button><button class="btn btn-primary" type="submit" id="submit-${index}">حفظ</button></div></form></dialog>`;
      rootElement.append(dialog);
    }
    const portal = document.createElement('div');
    portal.className = 'portal-library-modal';
    portal.id = 'portalFixture';
    portal.setAttribute('role', 'dialog');
    portal.setAttribute('aria-modal', 'true');
    portal.hidden = true;
    portal.innerHTML = '<div class="portal-library-modal-card lf-modal--v3 lf-modal-v3--details"><header><h3>تفاصيل عنصر</h3><button class="portal-library-modal-close">×</button></header><div>محتوى</div></div>';
    const portalHost = document.createElement('div');
    portalHost.className = 'portal-result';
    rootElement.append(portalHost);
    portalHost.append(portal);
    const excluded = document.createElement('div');
    excluded.className = 'swal2-popup';
    excluded.hidden = true;
    excluded.innerHTML = '<div class="swal2-actions"><button class="swal2-confirm">موافق</button></div>';
    rootElement.append(excluded);
  }, ids);

  await expect.poll(() => page.locator('dialog.lf-modal--v3').count()).toBe(ids.length);
  const viewports = [320, 375, 430, 768, 1024, 1440, 1920];
  const modes = [
    { dir: 'rtl', theme: 'light' }, { dir: 'rtl', theme: 'dark' },
    { dir: 'ltr', theme: 'light' }, { dir: 'ltr', theme: 'dark' }
  ];
  const screenshots = path.join(root, 'qa/artifacts/modal-v3');
  fs.mkdirSync(screenshots, { recursive: true });

  const representativeIds = [ids[0], ids[2], ids[6], ids[19], ids[37], ids[38]];
  for (const mode of modes) {
    await page.evaluate(({ dir, theme }) => {
      document.documentElement.dir = dir;
      document.documentElement.lang = dir === 'rtl' ? 'ar' : 'en';
      document.documentElement.dataset.theme = theme;
      document.body.dataset.theme = theme;
    }, mode);
    for (const width of viewports) {
      await page.setViewportSize({ width, height: width <= 430 ? 820 : 980 });
      const idsToExercise = width === 1440 && mode.dir === 'rtl' && mode.theme === 'light'
        ? ids
        : representativeIds;
      for (const id of idsToExercise) {
        const dialog = page.locator(`#${id}`);
        await dialog.evaluate((element) => element.showModal());
        const state = await dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const header = element.querySelector('.dialog-header');
          const footer = element.querySelector('.dialog-actions');
          const cancel = element.querySelector('.dialog-actions button[id^="cancel-"]');
          const primary = element.querySelector('.dialog-actions button[id^="submit-"]');
          return {
            fits: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
            noPageOverflow: document.documentElement.scrollWidth <= innerWidth,
            gradient: getComputedStyle(header).backgroundImage.includes('linear-gradient'),
            footerSurface: getComputedStyle(footer).backgroundColor,
            cancelClass: cancel.classList.contains('lf-modal-v3__cancel'),
            primaryClass: primary.classList.contains('lf-modal-v3__primary'),
            closeCount: element.querySelectorAll('.dialog-close').length
          };
        });
        expect(state.fits, `${id} ${width}px ${mode.dir}/${mode.theme}`).toBeTruthy();
        expect(state.noPageOverflow, `${id} ${width}px must not overflow the page`).toBeTruthy();
        expect(state.gradient, `${id} header must use the approved V3 gradient`).toBeTruthy();
        expect(state.cancelClass).toBeTruthy();
        expect(state.primaryClass).toBeTruthy();
        expect(state.closeCount).toBe(1);
        await dialog.evaluate((element) => element.close());
      }
    }
  }

  const outOfScopeState = await page.locator('.swal2-popup').evaluate((element) => ({
    className: element.className,
    computedBackground: getComputedStyle(element).backgroundColor
  }));
  expect(outOfScopeState.className).toBe('swal2-popup');
  await page.evaluate(() => {
    document.querySelectorAll('dialog').forEach((dialog) => {
      if (dialog.id !== 'dashboardScopeDialog') dialog.remove();
    });
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
    document.documentElement.dataset.theme = 'light';
    document.body.dataset.theme = 'light';
  });
  const desktopDialog = page.locator('#dashboardScopeDialog');
  await page.setViewportSize({ width: 1440, height: 980 });
  await desktopDialog.evaluate((element) => element.showModal());
  await page.screenshot({ path: path.join(screenshots, 'v3-desktop-rtl-light.png') });
  await desktopDialog.evaluate((element) => element.close());
  await page.setViewportSize({ width: 390, height: 820 });
  await desktopDialog.evaluate((element) => element.showModal());
  await expect(desktopDialog).toBeVisible();
  const mobileBounds = await desktopDialog.boundingBox();
  expect(mobileBounds.x).toBeGreaterThanOrEqual(0);
  expect(mobileBounds.x + mobileBounds.width).toBeLessThanOrEqual(390);
  await desktopDialog.screenshot({ path: path.join(screenshots, 'v3-mobile-rtl-light.png') });
  await desktopDialog.evaluate((element) => element.close());
  const portalOverlay = page.locator('#portalFixture');
  await page.locator('#dashboardScopeDialog').evaluate((element) => element.remove());
  await page.waitForTimeout(50);
  await portalOverlay.evaluate((element) => { element.hidden = false; });
  await expect(portalOverlay.locator('.portal-library-modal-card')).toHaveClass(/lf-modal--v3/u);
  const portalGeometry = await portalOverlay.locator('.portal-library-modal-card').evaluate((card) => {
    const overlay = card.closest('.portal-library-modal');
    return {
      card: card.getBoundingClientRect().toJSON(),
      cardAlign: getComputedStyle(card).alignSelf,
      cardHeight: getComputedStyle(card).height,
      overlay: overlay.getBoundingClientRect().toJSON(),
      overlayBackground: getComputedStyle(overlay).backgroundColor
    };
  });
  expect(portalGeometry.card.height).toBeLessThan(400);
  expect(portalGeometry.overlay.left).toBeLessThanOrEqual(0);
  expect(portalGeometry.overlay.right).toBeGreaterThanOrEqual(390);
  expect(portalGeometry.overlay.top).toBeLessThanOrEqual(0);
  expect(portalGeometry.overlay.bottom).toBeGreaterThanOrEqual(820);
  await portalOverlay.locator('.portal-library-modal-card').screenshot({ path: path.join(screenshots, 'v3-portal-details.png') });
});
