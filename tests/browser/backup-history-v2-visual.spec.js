const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const LOCALES = ['ar', 'en'];
const ARTIFACT_DIR = path.resolve(process.cwd(), 'qa/artifacts/backup-history-v2-visual');

async function installReadOnlyBackupFixture(page) {
    const writes = [];
    const externalRequests = [];
    const reads = [];
    const plan = planCatalog.PLAN_CONFIGURATIONS.find((item) => item.code === 'business');
    let scenario = 'populated';
    let holdInitialHistory = false;
    let releaseInitialHistory;

    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== 'http://127.0.0.1:4173') {
            externalRequests.push(`${request.method()} ${url.href}`);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });

    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();
        if (url.pathname.endsWith('/stream')) {
            return route.fulfill({ status: 200, contentType: 'text/event-stream; charset=utf-8', body: ': read-only backup fixture\n\n' });
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            writes.push(`${method} ${url.pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Read-only backup visual fixture.' }) });
        }
        reads.push(`${method} ${url.pathname}`);

        let payload = {};
        if (url.pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 98515, name: 'Backup History QA Owner', role: 'Owner', tenantId: 98515, tenantType: 'gym', permissions: [] } };
        } else if (url.pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'Backup History QA Gym' }, assets: {} } };
        } else if (url.pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'business', name: plan.name } },
                entitlements: { tenantType: 'gym', features: planCatalog.featureFlagsForPlan('business'), featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' }), limits: {} }
            };
        } else if (url.pathname === '/api/branches/bootstrap') {
            const branch = { id: 98515, name: 'QA Main Branch', status: 'active', isMain: true };
            payload = { branch, branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 1, hasMultipleActiveBranches: false, canUseAllBranches: false };
        } else if (url.pathname === '/api/bootstrap') {
            payload = { branches: [{ id: 98515, name: 'QA Main Branch', status: 'active' }], sections: [] };
        } else if (url.pathname === '/api/backup/history') {
            if (holdInitialHistory) await new Promise((resolve) => { releaseInitialHistory = resolve; });
            if (scenario === 'error') return route.fulfill({ status: 503, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ error: 'Synthetic read-only QA error', code: 'BACKUP_STORAGE_UNAVAILABLE' }) });
            payload = scenario === 'empty'
                ? { storage: { configured: true }, retention: { tenant_daily: 30 }, records: [], audit: [] }
                : {
                    storage: { configured: true },
                    retention: { tenant_daily: 30 },
                    records: [
                        { id: 'fixture-verified-1', fileName: 'logic-fit-gym-backup-2026-10-12.json.gz', backupType: 'tenant_daily', status: 'VERIFIED', rowCount: 1250, sizeBytes: 18874368, createdAt: '2026-10-12T12:15:00.000Z', verifiedAt: '2026-10-12T12:18:00.000Z' },
                        { id: 'fixture-pending-2', fileName: 'logic-fit-gym-backup-2026-10-11.json.gz', backupType: 'tenant_manual', status: 'PENDING', rowCount: 987, sizeBytes: 5242880, createdAt: '2026-10-11T08:40:00.000Z', verifiedAt: null }
                    ],
                    audit: [
                        { eventType: 'BACKUP_CREATED', result: 'success', reason: 'Scheduled nightly backup', fileName: 'logic-fit-gym-backup-2026-10-12.json.gz', createdAt: '2026-10-12T12:15:00.000Z' },
                        { eventType: 'BACKUP_VERIFIED', result: 'success', reason: 'Checksum and payload verified', fileName: 'logic-fit-gym-backup-2026-10-12.json.gz', createdAt: '2026-10-12T12:18:00.000Z' },
                        { eventType: 'RESTORE_FAILED', result: 'failed', reason: 'A deliberately long audit explanation checks wrapping inside the narrowest layout without exposing real tenant records.', createdAt: '2026-10-10T14:30:00.000Z' }
                    ]
                };
        }

        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    return {
        writes,
        externalRequests,
        reads,
        setScenario(value) { scenario = value; },
        holdHistory() { holdInitialHistory = true; },
        releaseHistory() { holdInitialHistory = false; releaseInitialHistory?.(); releaseInitialHistory = null; }
    };
}

test('Backup history V2 actual screen: read-only viewport, theme and locale visual matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The complete matrix is captured once in the desktop project.');
    test.setTimeout(180_000);
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const runtime = await installReadOnlyBackupFixture(page);
    const featureSource = await fs.readFile(path.resolve(process.cwd(), 'public/js/pages/management/backup.js'), 'utf8');
    const referencedKeys = [...featureSource.matchAll(/translate\(['"]([^'"]+)['"]/gu)].map((match) => match[1]);
    ['pending', 'running', 'uploaded', 'verifying', 'verified', 'failed', 'expired', 'deleted', 'success', 'unknown'].forEach((name) => referencedKeys.push(`backupHistory.status.${name}`));
    ['tenantDaily', 'tenantManual', 'tenantPreRestore', 'unknown'].forEach((name) => referencedKeys.push(`backupHistory.type.${name}`));
    ['created', 'verified', 'downloaded', 'deleted', 'restoreRequested', 'restoreStarted', 'restoreCompleted', 'restoreFailed', 'unknown'].forEach((name) => referencedKeys.push(`backupHistory.event.${name}`));
    ['download', 'inspect', 'restore'].forEach((name) => referencedKeys.push(`backupHistory.operation.${name}`));
    const uniqueReferencedKeys = [...new Set(referencedKeys)];
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('ERR_BLOCKED_BY_CLIENT')) consoleErrors.push(message.text());
    });

    await page.goto('/index.html#backup-history', { waitUntil: 'domcontentloaded' });
    const matrix = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        for (const theme of THEMES) {
            await page.goto('/index.html#backup-history', { waitUntil: 'domcontentloaded' });
            await expect(page.locator('body')).toHaveAttribute('data-top-gym-authenticated', 'true');
            await expect(page.locator('#backupHistorySection')).toBeVisible();
            await expect(page.locator('#backupHistoryList .backup-archive-table tbody tr')).toHaveCount(2);
            await expect(page.locator('#backupHistoryList .backup-operations-table tbody tr')).toHaveCount(3);
            if (width <= 767) {
                await expect(page.locator('#backupHistoryList .backup-archive-table')).toHaveAttribute('data-responsive-cards', 'true');
            }
            await page.evaluate((mode) => window.TopGymTheme?.set(mode), theme);
            await page.evaluate(() => document.fonts.ready);
            const readsBeforeLocaleSwitch = runtime.reads.filter((entry) => entry === 'GET /api/backup/history').length;

            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n?.set(value), locale);
                await expect(page.locator('html')).toHaveAttribute('lang', locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                const missingCatalogKeys = await page.evaluate((keys) => keys.filter((key) => window.TopGymI18n?.t(key) === key), uniqueReferencedKeys);
                expect(missingCatalogKeys, `${locale}: every backup-history presentation key must exist in the central catalog`).toEqual([]);
                await expect(page.locator('#backupHistoryPageTitle')).toHaveText(locale === 'en' ? 'Backup history' : 'سجل النسخ الاحتياطية');
                await expect(page.locator('#backupHistoryRefresh')).toHaveText(locale === 'en' ? 'Refresh history' : 'تحديث السجل');
                await expect(page.locator('#backupToolsTitle')).toHaveText(locale === 'en' ? 'Backup and recovery tools' : 'أدوات النسخ والاسترجاع');
                await expect(page.locator('.backup-history-tools [data-brand-template="backupDescription"]')).toContainText(locale === 'en' ? 'Create a Backup History QA Gym backup' : 'أنشئ نسخة Backup History QA Gym بصيغة');

                const layout = await page.evaluate(() => {
                    const root = document.querySelector('#backupHistorySection');
                    const tables = [...root.querySelectorAll('.backup-history-table')];
                    const rect = (node) => {
                        const box = node.getBoundingClientRect();
                        return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
                    };
                    return {
                        viewport: document.documentElement.clientWidth,
                        documentWidth: document.documentElement.scrollWidth,
                        bodyWidth: document.body.scrollWidth,
                        locale: window.TopGymI18n?.get(),
                        lang: document.documentElement.lang,
                        dir: document.documentElement.dir,
                        theme: document.documentElement.dataset.theme,
                        page: rect(root),
                        heading: rect(root.querySelector('.backup-history-page-head')),
                        blocks: [...root.querySelectorAll('.backup-history-block')].map(rect),
                        tables: tables.map((table) => ({
                            rect: rect(table),
                            minWidth: getComputedStyle(table).minWidth,
                            scrollWidth: table.scrollWidth,
                            wrapperWidth: table.closest('.backup-history-wrap').clientWidth,
                            wrapperScrollWidth: table.closest('.backup-history-wrap').scrollWidth,
                            wrapperOverflowX: getComputedStyle(table.closest('.backup-history-wrap')).overflowX,
                            headers: [...table.querySelectorAll('thead th')].map((cell) => cell.innerText.trim()),
                            rows: table.querySelectorAll('tbody tr').length,
                            spanningCells: table.querySelectorAll('tbody td[colspan]').length,
                            firstRecordLayout: table.tBodies[0]?.rows[0] ? {
                                display: getComputedStyle(table.tBodies[0].rows[0]).display,
                                gridColumnCount: getComputedStyle(table.tBodies[0].rows[0]).gridTemplateColumns.trim().split(/\s+/u).length
                            } : null,
                            rowText: [...table.querySelectorAll('tbody tr')].map((row) => row.innerText.trim())
                        })),
                        visibleActions: [...root.querySelectorAll('.backup-history-actions .btn')].filter((button) => getComputedStyle(button).display !== 'none').length,
                        outsideViewport: [...root.querySelectorAll('*')].filter((node) => !node.closest('.backup-history-wrap')).map((node) => ({
                            name: node.id ? `#${node.id}` : node.className?.baseVal || node.className || node.tagName,
                            rect: rect(node)
                        })).filter((item) => item.rect.width > 0 && (item.rect.x < -1 || item.rect.x + item.rect.width > document.documentElement.clientWidth + 1))
                    };
                });

                expect(layout.locale).toBe(locale);
                expect(layout.theme).toBe(theme);
                expect(layout.documentWidth, `${width}px ${locale}/${theme}: document overflow`).toBeLessThanOrEqual(width);
                expect(layout.bodyWidth, `${width}px ${locale}/${theme}: body overflow`).toBeLessThanOrEqual(width);
                expect(layout.page.width).toBeGreaterThan(0);
                expect(layout.blocks).toHaveLength(2);
                expect(layout.tables.map((table) => table.rows)).toEqual([2, 3]);
                expect(layout.tables.map((table) => table.headers.length)).toEqual([7, 4]);
                expect(layout.tables[0].rowText[0]).toContain('logic-fit-gym-backup-2026-10-12.json.gz');
                expect(layout.tables[1].rowText[2]).toContain('A deliberately long audit explanation');
                expect(layout.tables.every((table) => table.wrapperWidth > 0 && table.wrapperScrollWidth >= table.wrapperWidth)).toBeTruthy();
                expect(layout.visibleActions).toBeGreaterThan(0);
                expect(layout.outsideViewport, `${width}px ${locale}/${theme}: screen content outside viewport`).toEqual([]);
                if (width <= 390) {
                    expect(layout.tables.every((table) => table.firstRecordLayout?.display === 'grid'), `${width}px: responsive table cards must be mounted`).toBeTruthy();
                    expect(layout.tables.every((table) => table.firstRecordLayout.gridColumnCount === 1), `${width}px: backup record fields should use one readable column`).toBeTruthy();
                }
                if (locale === 'en') {
                    expect(layout.dir, 'the central locale switcher should apply LTR direction').toBe('ltr');
                    expect(layout.tables[0].headers).toEqual(['File', 'Type', 'Status', 'Data', 'Size', 'Last verified', 'Actions']);
                    expect(layout.tables[1].headers).toEqual(['Date', 'Operation', 'Result', 'Reason']);
                    await expect(page.locator('.backup-archive-table tbody tr').first()).toContainText('Verified');
                    await expect(page.locator('.backup-archive-table tbody tr').first()).toContainText('Daily backup');
                    await expect(page.locator('.backup-history-download').first()).toHaveText('Download');
                    await expect(page.locator('.backup-history-restore').first()).toHaveText('Restore');
                    await expect(page.locator('.backup-history-delete').first()).toHaveText('Delete');
                    await expect(page.locator('.backup-history-block-head').first()).toContainText('The platform retains daily backups for 30 days');
                } else {
                    expect(layout.dir).toBe('rtl');
                    expect(layout.tables[0].headers).toEqual(['الملف', 'النوع', 'الحالة', 'البيانات', 'الحجم', 'آخر تحقق', 'الإجراءات']);
                    expect(layout.tables[1].headers).toEqual(['التاريخ', 'العملية', 'النتيجة', 'السبب']);
                    await expect(page.locator('.backup-archive-table tbody tr').first()).toContainText('تم التحقق');
                    await expect(page.locator('.backup-archive-table tbody tr').first()).toContainText('نسخة يومية');
                    await expect(page.locator('.backup-history-download').first()).toHaveText('تحميل');
                    await expect(page.locator('.backup-history-restore').first()).toHaveText('استرجاع');
                    await expect(page.locator('.backup-history-delete').first()).toHaveText('حذف');
                }

                matrix.push({ width, locale, theme, ...layout });
                await page.screenshot({ path: path.join(ARTIFACT_DIR, `backup-history-${width}-${locale}-${theme}.png`), fullPage: true });
                expect(runtime.reads.filter((entry) => entry === 'GET /api/backup/history').length, 'switching locale must reuse the loaded backup snapshot').toBe(readsBeforeLocaleSwitch);
            }
        }
    }

    const restoreButton = page.locator('#restoreBackupButton');
    await restoreButton.click();
    const restoreDialog = page.locator('#backupRestoreDialog');
    await expect(restoreDialog).toBeVisible();
    const restoreReason = page.locator('#backupRestoreReason');
    await restoreReason.fill('QA draft reason remains unchanged');
    const dialogMatrix = [];
    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => window.TopGymTheme?.set(mode), theme);
            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n?.set(value, { persist: false }), locale);
                await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
                await expect(page.locator('#backupRestoreTitle')).toHaveText(locale === 'en' ? 'Restore a backup' : 'استرجاع نسخة احتياطية');
                await expect(restoreDialog.locator('.backup-file-field > span')).toHaveText(locale === 'en' ? 'Backup file (.json.gz)' : 'ملف النسخة الاحتياطية (.json.gz)');
                await expect(restoreDialog.locator('.backup-reason-field > span')).toHaveText(locale === 'en' ? 'Reason for restoration *' : 'سبب الاسترجاع *');
                await expect(page.locator('#backupRestoreCancel')).toHaveText(locale === 'en' ? 'Cancel' : 'إلغاء');
                await expect(restoreReason).toHaveValue('QA draft reason remains unchanged');
                const geometry = await restoreDialog.evaluate((dialog) => {
                    const rect = dialog.getBoundingClientRect();
                    return { open: dialog.open, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, clientWidth: dialog.clientWidth, scrollWidth: dialog.scrollWidth, viewportWidth: innerWidth, viewportHeight: innerHeight };
                });
                expect(geometry.open).toBe(true);
                expect(geometry.left).toBeGreaterThanOrEqual(-1);
                expect(geometry.right).toBeLessThanOrEqual(width + 1);
                expect(geometry.top).toBeGreaterThanOrEqual(-1);
                expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
                expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
                expect(geometry.width).toBeGreaterThan(0);
                const screenshot = `backup-restore-dialog-${width}-${locale}-${theme}.png`;
                await restoreDialog.screenshot({ path: path.join(ARTIFACT_DIR, screenshot), animations: 'disabled' });
                dialogMatrix.push({ width, locale, theme, geometry, screenshot });
            }
        }
    }
    await page.keyboard.press('Escape');
    await expect(restoreDialog).not.toBeVisible();
    await expect(restoreButton).toBeFocused();

    const readsBeforeRefresh = runtime.reads.filter((entry) => entry === 'GET /api/backup/history').length;
    await page.locator('#backupHistoryRefresh').click();
    await expect.poll(() => runtime.reads.filter((entry) => entry === 'GET /api/backup/history').length).toBe(readsBeforeRefresh + 1);

    expect(runtime.writes, 'The fixture must block and detect all API writes.').toEqual([]);
    expect(runtime.externalRequests.every((request) => {
        const url = new URL(request.slice(request.indexOf(' ') + 1));
        return url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/sweetalert2@11');
    }), `Only the existing SweetAlert CDN asset may be attempted; all external requests are aborted: ${runtime.externalRequests.join(', ')}`).toBe(true);
    expect(pageErrors, 'Unexpected uncaught browser errors.').toEqual([]);
    expect(consoleErrors, 'Unexpected browser console errors.').toEqual([]);
    await fs.writeFile(path.join(ARTIFACT_DIR, 'matrix.json'), JSON.stringify({ coverage: { widths: WIDTHS, themes: THEMES, locales: LOCALES, cells: matrix.length, dialogCells: dialogMatrix.length }, readOnly: { writes: runtime.writes, blockedExternalRequests: runtime.externalRequests }, matrix, dialogMatrix }, null, 2));
    expect(dialogMatrix).toHaveLength(WIDTHS.length * THEMES.length * LOCALES.length);
});

test('Backup history loading, empty and error states remain localized and usable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'A single desktop project captures all state combinations.');
    test.setTimeout(180_000);
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const runtime = await installReadOnlyBackupFixture(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    runtime.holdHistory();
    await page.goto('/index.html#backup-history', { waitUntil: 'domcontentloaded' });
    const section = page.locator('#backupHistorySection');
    await expect(section).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => runtime.reads.filter((entry) => entry === 'GET /api/backup/history').length).toBeGreaterThan(0);
    const evidence = [];
    try {
        for (const width of [320, 1440]) {
            await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
            for (const theme of THEMES) {
                await page.evaluate((mode) => window.TopGymTheme?.set(mode), theme);
                for (const locale of LOCALES) {
                    await page.evaluate((value) => window.TopGymI18n?.set(value, { persist: false }), locale);
                    const loading = section.locator('.backup-history-loading');
                    await expect(loading).toHaveText(locale === 'en' ? 'Loading backup history…' : 'جارٍ تحميل سجل النسخ…');
                    const screenshot = `backup-history-loading-${width}-${locale}-${theme}.png`;
                    await section.screenshot({ path: path.join(ARTIFACT_DIR, screenshot), animations: 'disabled' });
                    evidence.push({ state: 'loading', width, locale, theme, screenshot });
                }
            }
        }
    } finally {
        runtime.releaseHistory();
    }
    await expect(section.locator('.backup-archive-table tbody tr')).toHaveCount(2);

    const dismissToasts = async () => {
        const closeButtons = page.locator('#toast .toast-close');
        while (await closeButtons.count()) {
            await closeButtons.first().click();
            await expect(page.locator('#toast .toast-item')).toHaveCount(0);
        }
    };
    for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        for (const theme of THEMES) {
            await page.evaluate((mode) => window.TopGymTheme?.set(mode), theme);
            for (const locale of LOCALES) {
                await page.evaluate((value) => window.TopGymI18n?.set(value, { persist: false }), locale);
                runtime.setScenario('empty');
                await page.locator('#backupHistoryRefresh').click();
                await expect(section.locator('.backup-archive-table tbody td[colspan="7"]')).toHaveText(locale === 'en' ? 'No saved backups for this gym yet.' : 'لا توجد نسخ محفوظة لهذا الجيم حتى الآن.');
                await expect(section.locator('.backup-operations-table tbody td[colspan="4"]')).toHaveText(locale === 'en' ? 'No operations have been recorded yet.' : 'لا يوجد سجل عمليات حتى الآن.');
                await dismissToasts();
                const emptyScreenshot = `backup-history-empty-${width}-${locale}-${theme}.png`;
                await section.screenshot({ path: path.join(ARTIFACT_DIR, emptyScreenshot), animations: 'disabled' });
                evidence.push({ state: 'empty', width, locale, theme, screenshot: emptyScreenshot });

                runtime.setScenario('error');
                await page.locator('#backupHistoryRefresh').click();
                const errorText = locale === 'en'
                    ? 'Private backup storage is currently unavailable. Check the provider settings and try again.'
                    : 'التخزين الخاص للنسخ الاحتياطية غير متاح حاليًا. حاول مرة أخرى بعد التحقق من إعدادات مزود التخزين.';
                await expect(section.locator('.backup-history-error')).toHaveText(errorText);
                await dismissToasts();
                const errorScreenshot = `backup-history-error-${width}-${locale}-${theme}.png`;
                await section.screenshot({ path: path.join(ARTIFACT_DIR, errorScreenshot), animations: 'disabled' });
                evidence.push({ state: 'error', width, locale, theme, screenshot: errorScreenshot });
            }
        }
    }

    expect(runtime.writes).toEqual([]);
    expect(runtime.externalRequests.every((request) => {
        const url = new URL(request.slice(request.indexOf(' ') + 1));
        return url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/sweetalert2@11');
    })).toBe(true);
    expect(pageErrors).toEqual([]);
    await fs.writeFile(path.join(ARTIFACT_DIR, 'states-matrix.json'), JSON.stringify({ widths: [320, 1440], themes: THEMES, locales: LOCALES, captures: evidence, writes: runtime.writes, blockedExternalRequests: runtime.externalRequests, pageErrors }, null, 2));
    expect(evidence).toHaveLength(24);
    await testInfo.attach('backup-history-states.json', { body: JSON.stringify({ captures: evidence, writes: runtime.writes, pageErrors }, null, 2), contentType: 'application/json' });
});
