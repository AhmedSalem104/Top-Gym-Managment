const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const ORIGIN = 'http://127.0.0.1:4173';
const WIDTHS = [320, 390, 768, 1440];
const LOCALES = ['ar', 'en'];
const THEMES = ['light', 'dark'];
const ARTIFACT_DIR = path.resolve(process.cwd(), 'qa/artifacts/backup-entry-dialog-visual-v2');
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

async function installReadOnlyFixtures(page) {
    const reads = [];
    const writes = [];
    const externalRequests = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    let storageConfigured = true;

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== ORIGIN) {
            if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('sweetalert2')) {
                return route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: '' });
            }
            externalRequests.push(`${request.method()} ${url.origin}`);
            return route.abort('blockedbyclient');
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const method = request.method().toUpperCase();
        if (url.pathname.endsWith('/stream')) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: ': read-only notification fixture\n\n' });
        }
        if (!SAFE_METHODS.has(method)) {
            writes.push({ method, path: url.pathname });
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only backup UI fixture.' }) });
        }
        reads.push({ method, path: url.pathname });
        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98721, name: 'Backup UI QA Owner', role: 'Owner', tenantId: 98721, tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            payload = { identity: { brandName: 'قاعة اختبار النسخ', englishBrandName: 'Backup QA Gym' }, branding: { identity: { brandName: 'قاعة اختبار النسخ', englishBrandName: 'Backup QA Gym' }, assets: {} } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = { tenantStatus: 'active', subscription: { status: 'active', plan: { code: 'business', name: plan.name } }, entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), limits: {} } };
        } else if (url.pathname === '/api/branches/bootstrap') {
            payload = { branches: [], activeBranches: [], sections: [], branchLimit: 1, hasMultipleActiveBranches: false, canUseAllBranches: false };
        } else if (url.pathname === '/api/bootstrap') {
            payload = { branches: [], sections: [] };
        } else if (url.pathname === '/api/backup/history') {
            payload = {
                storage: { configured: storageConfigured },
                retention: { tenant_daily: 30 },
                records: [
                    { id: 'fixture-verified', fileName: 'logic-fit-backup-2026-10-13.json.gz', backupType: 'tenant_daily', status: 'VERIFIED', rowCount: 1250, sizeBytes: 102400, createdAt: '2026-10-13T10:15:00.000Z', verifiedAt: '2026-10-13T10:18:00.000Z' },
                    { id: 'fixture-pending', fileName: 'logic-fit-backup-pending.json.gz', backupType: 'tenant_manual', status: 'PENDING', rowCount: 27, sizeBytes: 2048, createdAt: '2026-10-12T08:20:00.000Z', verifiedAt: null }
                ],
                audit: [
                    { eventType: 'BACKUP_CREATED', result: 'success', reason: 'Fixture audit reason', fileName: 'logic-fit-backup-2026-10-13.json.gz', createdAt: '2026-10-13T10:15:00.000Z' },
                    { eventType: 'BACKUP_VERIFIED', result: 'success', reason: 'Integrity checked', createdAt: '2026-10-13T10:18:00.000Z' }
                ]
            };
        }
        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    return { reads, writes, externalRequests, setStorageConfigured(value) { storageConfigured = Boolean(value); } };
}

test('Backup entry tools and restore dialog are localized, responsive and read-only', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The deterministic 20-case matrix is captured once in the desktop project.');
    test.setTimeout(180_000);
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const runtime = await installReadOnlyFixtures(page);
    const requiredKeys = [
        'backupHistory.page.kicker', 'backupHistory.page.title', 'backupHistory.page.description',
        'backupHistory.tools.title', 'backupHistory.tools.description', 'backupHistory.tools.create',
        'backupHistory.tools.download', 'backupHistory.tools.restore', 'backupHistory.storage.unavailable',
        'backupHistory.dialog.title', 'backupHistory.dialog.description', 'backupHistory.dialog.file',
        'backupHistory.dialog.reason', 'backupHistory.dialog.close', 'backupHistory.dialog.cancel',
        'backupHistory.dialog.restore', 'backupHistory.dialog.reasonPlaceholder',
        'backupHistory.dialog.restoreVerified'
    ];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/index.html#backup-history', { waitUntil: 'domcontentloaded' });
    const screen = page.locator('#backupHistorySection');
    await expect(screen).toBeVisible();
    await expect(page.locator('#backupHistoryList .backup-archive-table tbody tr')).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => Boolean(window.TopGymI18n))).toBe(true);
    const baselineBackupReads = runtime.reads.filter((entry) => entry.path.startsWith('/api/backup/'));
    const historyReads = runtime.reads.filter((entry) => entry.path === '/api/backup/history').length;
    const baselineRoute = new URL(page.url()).hash;
    const screenshotStates = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        for (const theme of THEMES) {
            await page.evaluate((value) => window.TopGymTheme?.set(value), theme);
            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n?.set(value, { persist: false }), locale);
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                const missingKeys = await page.evaluate((keys) => keys.filter((key) => window.TopGymI18n.t(key) === key), requiredKeys);
                expect(missingKeys, `${locale}: backup presentation keys must resolve from the central catalog`).toEqual([]);
                await expect(page.locator('#backupHistoryPageTitle')).toHaveText(locale === 'en' ? 'Backup history' : 'سجل النسخ الاحتياطية');
                const tools = page.locator('.backup-history-tools');
                await expect(tools.locator('#backupToolsTitle')).toHaveText(locale === 'en' ? 'Backup and recovery tools' : 'أدوات النسخ والاسترجاع');
                await expect(tools.locator('#backupManualButton')).toHaveText(locale === 'en' ? 'Create saved backup' : 'إنشاء نسخة محفوظة');
                await expect(tools.locator('#backupJsonButton')).toHaveText(locale === 'en' ? 'Download snapshot .json.gz' : 'تحميل لحظي .json.gz');
                await expect(tools.locator('#restoreBackupButton')).toHaveText(locale === 'en' ? 'Restore a file' : 'استرجاع ملف');

                const state = await page.evaluate(() => ({
                    viewport: document.documentElement.clientWidth,
                    documentWidth: document.documentElement.scrollWidth,
                    bodyWidth: document.body.scrollWidth,
                    locale: window.TopGymI18n?.get(),
                    direction: document.documentElement.dir,
                    theme: document.documentElement.dataset.theme,
                    toolsBounds: (() => { const r = document.querySelector('.backup-history-tools').getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; })(),
                    toolsActions: [...document.querySelectorAll('.backup-history-tools .backup-management-actions > button')].map((node) => ({ text: node.textContent.trim(), disabled: node.disabled }))
                }));
                expect(state.documentWidth).toBeLessThanOrEqual(state.viewport);
                expect(state.bodyWidth).toBeLessThanOrEqual(state.viewport);
                expect(state.toolsBounds.left).toBeGreaterThanOrEqual(-1);
                expect(state.toolsBounds.right).toBeLessThanOrEqual(width + 1);
                expect(state.toolsActions).toHaveLength(3);
                const label = `${width}-${locale}-${theme}`;
                const toolsScreenshot = path.join(ARTIFACT_DIR, `backup-tools-${label}.png`);
                await page.locator('.backup-history-tools').screenshot({ path: toolsScreenshot, animations: 'disabled' });
                screenshotStates.push({ ...state, toolsScreenshot: path.relative(process.cwd(), toolsScreenshot) });
            }
        }
    }

    const restoreTrigger = page.locator('#restoreBackupButton');
    await restoreTrigger.click();
    const dialog = page.locator('#backupRestoreDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#backupValidationBox')).toBeHidden();
    await expect(dialog.locator('#backupRestoreSubmit')).toBeDisabled();
    await expect(dialog.locator('#backupFileInput')).toHaveValue('');
    await expect(dialog.locator('#backupRestoreReason')).toHaveValue('');
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Tab');
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => { window.TopGymTheme?.set('light'); window.TopGymI18n?.set('ar', { persist: false }); });
    const focusedDialogScreenshot = path.join(ARTIFACT_DIR, 'backup-restore-dialog-320-ar-light-keyboard-focus.png');
    await dialog.screenshot({ path: focusedDialogScreenshot, animations: 'disabled' });
    const focusEvidence = await dialog.evaluate((node) => ({
        focusedElement: document.activeElement?.id || document.activeElement?.tagName || '',
        focusVisible: document.activeElement?.matches(':focus-visible') === true,
        outlineStyle: getComputedStyle(document.activeElement).outlineStyle,
        screenshot: 'qa/artifacts/backup-entry-dialog-visual-v2/backup-restore-dialog-320-ar-light-keyboard-focus.png'
    }));
    expect(focusEvidence.focusVisible).toBe(true);
    await page.evaluate(() => document.activeElement?.blur());

    const dialogStates = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 });
        for (const theme of THEMES) {
            await page.evaluate((value) => window.TopGymTheme?.set(value), theme);
            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n?.set(value, { persist: false }), locale);
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(page.locator('#backupRestoreTitle')).toHaveText(locale === 'en' ? 'Restore a backup' : 'استرجاع نسخة احتياطية');
                await expect(dialog.locator('.backup-reason-field span')).toHaveText(locale === 'en' ? 'Reason for restoration *' : 'سبب الاسترجاع *');
                await expect(dialog.locator('#backupRestoreCancel')).toHaveText(locale === 'en' ? 'Cancel' : 'إلغاء');
                await expect(dialog.locator('#backupValidationBox')).toBeHidden();
                await expect(dialog.locator('#backupRestoreSubmit')).toBeDisabled();

                const state = await dialog.evaluate((node) => {
                    const bounds = node.getBoundingClientRect();
                    const controls = [...node.querySelectorAll('button, input, textarea')].map((control) => {
                        const rect = control.getBoundingClientRect();
                        return { id: control.id, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
                    }).filter((control) => control.width > 0 && control.height > 0);
                    return {
                        viewport: document.documentElement.clientWidth,
                        viewportHeight: innerHeight,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        locale: window.TopGymI18n?.get(),
                        direction: document.documentElement.dir,
                        theme: document.documentElement.dataset.theme,
                        open: node.open,
                        selectedFile: node.querySelector('#backupFileInput')?.files?.length || 0,
                        reason: node.querySelector('#backupRestoreReason')?.value,
                        bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth },
                        controls
                    };
                });
                expect(state.documentWidth).toBeLessThanOrEqual(width);
                expect(state.bodyWidth).toBeLessThanOrEqual(width);
                expect(state.open).toBe(true);
                expect(state.selectedFile).toBe(0);
                expect(state.reason).toBe('');
                expect(state.bounds.left).toBeGreaterThanOrEqual(-1);
                expect(state.bounds.right).toBeLessThanOrEqual(width + 1);
                expect(state.bounds.top).toBeGreaterThanOrEqual(-1);
                expect(state.bounds.bottom).toBeLessThanOrEqual(state.viewportHeight + 1);
                expect(state.bounds.scrollWidth).toBeLessThanOrEqual(state.bounds.clientWidth + 1);
                expect(state.bounds.width).toBeGreaterThan(0);
                const controlsOutsideDialog = state.controls.filter((control) => control.left < state.bounds.left - 1 || control.right > state.bounds.right + 1);
                expect(controlsOutsideDialog, `${width}px ${locale}/${theme}: controls outside dialog ${JSON.stringify(controlsOutsideDialog)}`).toEqual([]);
                const screenshot = path.join(ARTIFACT_DIR, `backup-restore-dialog-${width}-${locale}-${theme}.png`);
                await dialog.screenshot({ path: screenshot, animations: 'disabled' });
                dialogStates.push({ ...state, screenshot: path.relative(process.cwd(), screenshot) });
            }
        }
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(restoreTrigger).toBeFocused();
    await restoreTrigger.click();
    await expect(dialog).toBeVisible();
    await page.locator('#backupRestoreCancel').click();
    await expect(dialog).toBeHidden();
    await expect(restoreTrigger).toBeFocused();

    expect(runtime.reads.filter((entry) => entry.path.startsWith('/api/backup/'))).toEqual(baselineBackupReads);
    const readsBeforeAvailabilityRefresh = runtime.reads.filter((entry) => entry.path === '/api/backup/history').length;
    runtime.setStorageConfigured(false);
    await page.locator('#backupHistoryRefresh').click();
    await expect.poll(() => runtime.reads.filter((entry) => entry.path === '/api/backup/history').length)
        .toBe(readsBeforeAvailabilityRefresh + 1);
    await expect(page.locator('#backupManualButton')).toBeDisabled();
    await expect(page.locator('#backupManualButton')).toHaveAttribute('aria-disabled', 'true');
    await expect.poll(() => page.locator('#backupManualButton').getAttribute('title'))
        .toBe(await page.evaluate(() => window.TopGymI18n?.t('backupHistory.storage.unavailable')));
    await page.setViewportSize({ width: 320, height: 844 });
    await page.evaluate(() => { window.TopGymTheme?.set('light'); window.TopGymI18n?.set('ar', { persist: false }); });
    const unavailableStorageScreenshot = path.join(ARTIFACT_DIR, 'backup-tools-320-ar-light-storage-unavailable.png');
    await page.locator('.backup-history-tools').screenshot({ path: unavailableStorageScreenshot, animations: 'disabled' });

    expect(runtime.writes).toEqual([]);
    expect(runtime.reads.filter((entry) => entry.path.startsWith('/api/backup/'))).toHaveLength(baselineBackupReads.length + 1);
    expect(runtime.reads.filter((entry) => entry.path === '/api/backup/history')).toHaveLength(historyReads + 1);
    expect(new URL(page.url()).hash).toBe(baselineRoute);
    expect(runtime.externalRequests).toEqual([]);
    expect(pageErrors).toEqual([]);

    const evidence = {
        result: 'PASS',
        scope: 'screen #2 entry-tools panel and empty restore dialog only; synthetic GET fixtures; no file selected and no create, inspect, restore, delete or download action submitted. Backup-history empty/error content is excluded as screen #15.',
        toolPanelCases: screenshotStates.length,
        dialogCases: dialogStates.length,
        cases: screenshotStates.length + dialogStates.length,
        screenshots: screenshotStates,
        dialogScreenshots: dialogStates,
        keyboardFocus: focusEvidence,
        apiReads: runtime.reads,
        apiWrites: runtime.writes,
        externalRequests: runtime.externalRequests,
        pageErrors,
        fileSelectionAndReasonRemainEmpty: dialogStates.every((entry) => entry.selectedFile === 0 && entry.reason === ''),
        unavailableStorage: {
            manualCreateDisabled: await page.locator('#backupManualButton').isDisabled(),
            ariaDisabled: await page.locator('#backupManualButton').getAttribute('aria-disabled'),
            screenshot: path.relative(process.cwd(), unavailableStorageScreenshot)
        },
        localeTriggeredHistoryRefetches: 0,
        overflowCases: [...screenshotStates, ...dialogStates].filter((entry) => entry.documentWidth > entry.viewport || entry.bodyWidth > entry.viewport).length
    };
    await fs.writeFile(path.join(ARTIFACT_DIR, 'backup-entry-i18n-evidence.json'), JSON.stringify(evidence, null, 2));
    await testInfo.attach('backup-entry-i18n-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});
