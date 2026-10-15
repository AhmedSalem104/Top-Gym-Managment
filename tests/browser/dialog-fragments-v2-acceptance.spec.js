'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const OUTPUT = path.resolve(process.cwd(), 'qa/artifacts/dialog-fragments-v2-acceptance');
const VIEWPORTS = [320, 375, 390, 768, 1024, 1440, 1920];
const THEMES = ['light', 'dark'];
const DIRECTIONS = ['rtl', 'ltr'];
const STATES = ['empty', 'populated', 'loading', 'error'];
const FRAGMENTS = [
    {
        source: '/dialogs/backup.html?v=phase4',
        ids: ['backupRestoreDialog'],
        dialogs: [{ id: 'backupRestoreDialog', host: '#backupValidationBox', close: '#backupRestoreClose' }]
    },
    {
        source: '/dialogs/coaching.html?v=phase4',
        ids: ['externalTraineeDialog', 'coachingProfileDialog', 'coachingBuilderDialog'],
        dialogs: [
            { id: 'externalTraineeDialog', host: '#externalNotes', close: '#externalTraineeClose', formHost: true },
            { id: 'coachingProfileDialog', host: '#coachingProfileContent', close: '#coachingProfileClose' },
            { id: 'coachingBuilderDialog', host: '#coachingBuilderContent', close: '#coachingBuilderClose' }
        ]
    },
    {
        source: '/dialogs/library.html?v=phase4',
        ids: ['libraryFormDialog', 'libraryDetailsDialog'],
        dialogs: [
            { id: 'libraryFormDialog', host: '#libraryFormFields', close: '#libraryFormClose' },
            { id: 'libraryDetailsDialog', host: '#libraryDetailsContent', close: '#libraryDetailsClose' }
        ]
    },
    {
        source: '/dialogs/permissions.html?v=phase4',
        ids: ['authUserDialog'],
        dialogs: [{ id: 'authUserDialog', host: '.auth-form-grid', close: '#authUserDialogClose' }]
    }
];

test('V2 dialogs: read-only actual-fragment visual and interaction acceptance matrix', async ({ page }, testInfo) => {
    test.setTimeout(900_000);
    test.skip(testInfo.project.name !== 'desktop', 'The complete viewport/theme/direction matrix runs once in the desktop project.');

    const attemptedWrites = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            attemptedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`);
            return route.fulfill({ status: 405, contentType: 'application/json', body: '{"error":"read_only_visual_fixture"}' });
        }
        return route.abort();
    });
    await page.route('**/js/**', (route) => {
        if (new URL(route.request().url()).pathname.endsWith('/js/core/dialog-loader.js')) return route.continue();
        return route.abort();
    });

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const hasMainStyles = await page.locator('link[rel="stylesheet"]').evaluateAll((nodes) =>
        nodes.some((node) => node.href.includes('/css/main.css')));
    if (!hasMainStyles) {
        await page.addStyleTag({ url: '/css/main.css' });
    }
    await page.waitForFunction(() => Boolean(window.topGymDialogLoader?.load));
    // This isolated fragment test deliberately blocks auth-ui.js and all API
    // requests, so session restoration cannot clear the first-paint gate.
    // Release only the fixture's pending-auth overlay before exercising the
    // synthetic focus-return trigger; no app authentication behavior is tested.
    await page.evaluate(() => document.body.classList.remove('auth-pending'));
    await page.evaluate(() => document.fonts.ready);
    await fs.mkdir(OUTPUT, { recursive: true });

    for (const fragment of FRAGMENTS) {
        const loadedIds = await page.evaluate(async ({ source, ids }) =>
            (await window.topGymDialogLoader.load(source, ids)).map((dialog) => dialog.id), fragment);
        expect(loadedIds).toEqual(fragment.ids);
    }

    await page.evaluate(() => {
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.id = 'dialog-fragment-acceptance-trigger';
        trigger.textContent = 'QA focus return trigger';
        Object.assign(trigger.style, {
            position: 'fixed',
            insetBlockStart: '1px',
            insetInlineStart: '1px',
            zIndex: '2147483647',
            minWidth: '180px',
            minHeight: '44px'
        });
        document.body.append(trigger);
    });

    const missingAccessibleNames = new Set();
    const geometryFailures = [];
    for (let viewportIndex = 0; viewportIndex < VIEWPORTS.length; viewportIndex += 1) {
        const width = VIEWPORTS[viewportIndex];
        await page.setViewportSize({ width, height: width <= 390 ? 780 : 1000 });

        for (let themeIndex = 0; themeIndex < THEMES.length; themeIndex += 1) {
            const theme = THEMES[themeIndex];
            for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
                const direction = DIRECTIONS[directionIndex];
                const state = STATES[(viewportIndex + (themeIndex * 2) + directionIndex) % STATES.length];
                await page.evaluate(({ activeTheme, activeDirection }) => {
                    document.documentElement.dataset.theme = activeTheme;
                    document.body.dataset.theme = activeTheme;
                    document.documentElement.dir = activeDirection;
                    document.body.dir = activeDirection;
                    document.documentElement.lang = activeDirection === 'rtl' ? 'ar' : 'en';
                }, { activeTheme: theme, activeDirection: direction });

                for (const dialogSpec of FRAGMENTS.flatMap((item) => item.dialogs)) {
                    const dialog = page.locator(`#${dialogSpec.id}`);
                    await dialog.evaluate((element, { hostSelector, formHost, state, id }) => {
                        const host = element.querySelector(hostSelector);
                        if (!host) throw new Error(`Missing safe visual-state host: ${id} ${hostSelector}`);

                        if (id === 'backupRestoreDialog') {
                            host.replaceChildren();
                            host.hidden = state === 'empty';
                        } else if (id === 'coachingProfileDialog' || id === 'coachingBuilderDialog'
                            || id === 'libraryFormDialog' || id === 'libraryDetailsDialog') {
                            host.replaceChildren();
                        } else if (!formHost) {
                            host.querySelectorAll('[data-qa-dialog-state]').forEach((node) => node.remove());
                        }

                        if (formHost || id === 'authUserDialog') {
                            const form = element.querySelector('form');
                            form.querySelectorAll('input:not([type="hidden"]):not([type="file"]), textarea').forEach((input) => {
                                input.value = state === 'populated' ? 'قيمة اختبار مرئية' : '';
                            });
                        }

                        const target = formHost ? element.querySelector('form') : host;
                        if (state === 'populated' || state === 'loading' || state === 'error') {
                            const panel = document.createElement('div');
                            panel.dataset.qaDialogState = state;
                            panel.innerHTML = state === 'populated'
                                ? '<section class="panel"><h4>بيانات اختبار العرض</h4><p>نص عربي طويل لاختبار الالتفاف، مع <bdi dir="ltr">Long English fixture 0123456789</bdi>؛ لا توجد بيانات حقيقية.</p></section>'
                                : state === 'loading'
                                    ? '<div class="loading" role="status" aria-live="polite">جارٍ تحميل بيانات اختبار العرض…</div>'
                                    : '<div class="alert alert-danger" role="alert">تعذر تحميل بيانات اختبار العرض. لم يُرسل أي طلب حفظ.</div>';
                            if (formHost) target.insertBefore(panel, element.querySelector('.dialog-actions'));
                            else target.append(panel);
                        }
                    }, { hostSelector: dialogSpec.host, formHost: Boolean(dialogSpec.formHost), state, id: dialogSpec.id });

                    await page.evaluate((id) => {
                        const trigger = document.getElementById('dialog-fragment-acceptance-trigger');
                        const dialog = document.getElementById(id);
                        trigger.onclick = () => dialog.showModal();
                    }, dialogSpec.id);
                    await page.locator('#dialog-fragment-acceptance-trigger').focus();
                    await page.locator('#dialog-fragment-acceptance-trigger').click();
                    await expect(dialog).toBeVisible();
                    const closeButton = dialog.locator(dialogSpec.close);
                    await expect(closeButton, `${dialogSpec.id} visible close control`).toBeVisible();
                    await expect(closeButton, `${dialogSpec.id} close control has a name`).toContainText('إغلاق');

                    const measurements = await dialog.evaluate((element) => {
                        const rect = element.getBoundingClientRect();
                        const body = element.querySelector('.dialog-body');
                        const bodyRect = body?.getBoundingClientRect();
                        const labelId = element.getAttribute('aria-labelledby');
                        const label = labelId ? document.getElementById(labelId) : null;
                        const close = element.querySelector('button[id$="Close"]');
                        const closeRect = close?.getBoundingClientRect();
                        return {
                            dialog: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
                            body: bodyRect ? { left: bodyRect.left, right: bodyRect.right, scrollWidth: body.scrollWidth, clientWidth: body.clientWidth, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight } : null,
                            pageScrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                            viewport: { width: innerWidth, height: innerHeight },
                            accessibleName: Boolean(label?.textContent.trim()),
                            labelledBy: labelId,
                            closeTarget: closeRect ? { width: closeRect.width, height: closeRect.height } : null,
                            focusedInsideDialog: element.contains(document.activeElement) || document.activeElement === element,
                            state: element.querySelector('[data-qa-dialog-state]')?.dataset.qaDialogState || 'empty'
                        };
                    });

                    const caseId = `${dialogSpec.id}-${width}-${theme}-${direction}-${state}`;
                    if (!measurements.accessibleName) missingAccessibleNames.add(dialogSpec.id);
                    if (measurements.pageScrollWidth > width + 1
                        || measurements.dialog.left < -1
                        || measurements.dialog.right > width + 1
                        || measurements.dialog.top < -1
                        || measurements.dialog.bottom > measurements.viewport.height + 1
                        || (measurements.body && measurements.body.scrollWidth > measurements.body.clientWidth + 1)
                        || !measurements.focusedInsideDialog) {
                        geometryFailures.push({ caseId, measurements });
                    }

                    expect(measurements.pageScrollWidth, `${caseId} page width`).toBeLessThanOrEqual(width + 1);
                    expect(measurements.dialog.left, `${caseId} dialog left`).toBeGreaterThanOrEqual(-1);
                    expect(measurements.dialog.right, `${caseId} dialog right`).toBeLessThanOrEqual(width + 1);
                    expect(measurements.dialog.top, `${caseId} dialog top`).toBeGreaterThanOrEqual(-1);
                    expect(measurements.dialog.bottom, `${caseId} dialog bottom`).toBeLessThanOrEqual(measurements.viewport.height + 1);
                    expect(measurements.body?.scrollWidth ?? 0, `${caseId} content inline overflow`).toBeLessThanOrEqual((measurements.body?.clientWidth ?? 0) + 1);
                    expect(measurements.focusedInsideDialog, `${caseId} focus enters dialog`).toBeTruthy();
                    if (width <= 767) {
                        expect(measurements.closeTarget?.width ?? 0, `${caseId} close target width`).toBeGreaterThanOrEqual(44);
                        expect(measurements.closeTarget?.height ?? 0, `${caseId} close target height`).toBeGreaterThanOrEqual(44);
                    }

                    const title = (await dialog.locator('h1[id], h2[id], h3[id], [role="heading"][id]').first().textContent().catch(() => ''))
                        ?.trim().replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 32) || 'dialog';
                    await page.screenshot({ path: path.join(OUTPUT, `${caseId}-${title}.png`), fullPage: false });
                    await page.keyboard.press('Escape');
                    await expect(dialog).not.toBeVisible();
                    await expect(page.locator('#dialog-fragment-acceptance-trigger')).toBeFocused();
                }
            }
        }
    }

    expect([...missingAccessibleNames].sort(), 'all dialogs need an accessible name from their visible heading').toEqual([]);
    expect(geometryFailures, 'visual geometry and focus measurements should remain within acceptance bounds').toEqual([]);
    expect(attemptedWrites, 'dialog visual acceptance must not issue mutation requests').toEqual([]);
});
