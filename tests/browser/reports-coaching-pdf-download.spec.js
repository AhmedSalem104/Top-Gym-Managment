'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const workoutId = 88401;
const dietId = 88402;
const exerciseId = 88403;
const memberName = 'عضو اختبار التقارير';
const workoutName = 'برنامج قوة اصطناعي';
const dietName = 'خطة تغذية اصطناعية';

test('Reports coaching and nutrition actions generate actual PDFs without external writes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'PDF binary/output verification runs in the desktop Chromium project.');
    const unexpectedWrites = [];
    const blockedExternal = [];
    const apiReads = [];
    const pdfEngineResponses = [];
    const printStylesheetResponses = [];
    page.on('response', (response) => {
        if (response.url() === 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js') {
            pdfEngineResponses.push(response.status());
        }
        if (response.url().includes('/css/print.css?')) printStylesheetResponses.push(response.status());
    });

    await page.context().route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();

        if (url.origin !== 'http://127.0.0.1:4173') {
            if (url.href === 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js') {
                return route.continue();
            }
            if (url.href === 'https://cdn.jsdelivr.net/npm/sweetalert2@11') {
                return route.fulfill({
                    status: 200,
                    contentType: 'text/javascript; charset=utf-8',
                    body: 'window.Swal = window.Swal || { fire: async () => ({ isConfirmed: false }) };'
                });
            }
            blockedExternal.push(url.href);
            return route.abort('blockedbyclient');
        }

        if (url.pathname.startsWith('/api/')) {
            if (!['GET', 'HEAD'].includes(method)) {
                unexpectedWrites.push({ method, pathname: url.pathname });
                return route.abort('blockedbyclient');
            }
            apiReads.push(url.pathname);
            let payload = {};
            if (url.pathname === '/api/auth/session') {
                payload = { authenticated: true, user: { id: 880, name: 'Reports QA Owner', role: 'Owner', tenantType: 'gym', mustChangePassword: false, permissions: [] } };
            } else if (url.pathname === '/api/saas/entitlements') {
                const featureKeys = ['dashboard', 'reports', 'coaching'];
                payload = {
                    tenantStatus: 'active',
                    subscription: { status: 'active', plan: { code: 'qa', name: 'QA' } },
                    entitlements: {
                        tenantType: 'gym',
                        features: Object.fromEntries(featureKeys.map((key) => [key, true])),
                        featureCatalog: featureKeys.map((key) => ({ key, tenantTypes: ['gym'] }))
                    }
                };
            } else if (url.pathname === '/api/branding') {
                payload = { branding: { identity: { brandName: 'Synthetic QA Gym' }, assets: {} }, version: 1 };
            } else if (url.pathname === '/api/reports') {
                payload = {
                    period: { from: '2026-10-01', to: '2026-10-31' },
                    summary: { currentMembers: 1 },
                    coaching: {
                        summary: {},
                        workoutPrograms: [{ id: workoutId, memberId: 881, name: workoutName, fullName: memberName, phone: '01012345678', phoneCountry: 'EG', status: 'active', startDate: '2026-10-01', endDate: '2026-11-26', routines: 1, exercises: 1 }],
                        dietPlans: [{ id: dietId, memberId: 881, name: dietName, fullName: memberName, phone: '01012345678', phoneCountry: 'EG', status: 'active', startDate: '2026-10-01', endDate: '2026-10-31', targetCalories: 2100, meals: 1, foods: 1 }]
                    }
                };
            } else if (url.pathname === `/api/workoutprograms/${workoutId}`) {
                payload = { program: { id: workoutId, name: workoutName, memberName, memberPhone: '01012345678', status: 'active', durationWeeks: 8, daysPerWeek: 3, routines: [{ name: 'اليوم الأول', exercises: [{ exerciseId, sets: 3, repsMin: 8, repsMax: 12, weightKg: 40 }] }] } };
            } else if (url.pathname === `/api/dietplans/${dietId}`) {
                payload = { plan: { id: dietId, name: dietName, memberName, memberPhone: '01012345678', status: 'active', targetCalories: 2100, targetProtein: 140, targetCarbs: 240, targetFats: 65, meals: [{ name: 'الإفطار', items: [{ nameAr: 'شوفان', assignedQuantity: 80, servingUnit: 'جرام', calories: 300 }] }] } };
            } else if (url.pathname === `/api/library/exercises/${exerciseId}`) {
                payload = { item: { id: exerciseId, nameAr: 'تمرين اختبار', equipment: 'Barbell' } };
            }
            return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
        }

        return route.continue();
    });

    await page.goto('/index.html#reports', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveAttribute('data-top-gym-authenticated', 'true');
    await page.locator('[data-page-tab="reports"]').click();
    await expect(page.locator('#reportsSection')).toBeVisible();
    await page.locator('#reportsTabs [data-report-tab="coaching"]').click();
    await expect(page.locator('#reportsCoachingView .reports-coaching-actions [data-report-coaching-action="pdf"]')).toHaveCount(2);

    const expected = [
        { id: workoutId, type: 'workout', name: workoutName, file: /Workout-.*88401\.pdf$/ },
        { id: dietId, type: 'diet', name: dietName, file: /Nutrition-.*88402\.pdf$/ }
    ];
    for (const item of expected) {
        const button = page.locator(`[data-report-coaching-action="pdf"][data-report-coaching-id="${item.id}"][data-report-coaching-type="${item.type}"]`);
        await expect(button).toBeVisible();
        const downloadPromise = page.waitForEvent('download');
        const pdfLayoutPromise = page.waitForFunction(() => {
            const host = document.querySelector('.print-pdf-host');
            const sheet = host?.querySelector('.print-sheet');
            if (!host || !sheet) return false;
            return true;
        }, { timeout: 10_000 }).then(() => page.evaluate(() => {
            const sheet = document.querySelector('.print-pdf-host .print-sheet');
            const rect = sheet.getBoundingClientRect();
            const styles = getComputedStyle(sheet);
            return {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                computedWidth: styles.width,
                fontFamily: styles.fontFamily,
                hasPrintAccent: Boolean(sheet.querySelector('.print-accent')),
                childPositions: [...sheet.children].map((child) => ({
                    className: typeof child.className === 'string' ? child.className : child.tagName,
                    top: Math.round(child.getBoundingClientRect().top - rect.top),
                    height: Math.round(child.getBoundingClientRect().height)
                }))
            };
        }));
        await button.click();
        const pdfLayout = await pdfLayoutPromise;
        expect(pdfLayout.x).toBe(0);
        expect(pdfLayout.y).toBe(0);
        expect(Number.parseFloat(pdfLayout.computedWidth)).toBeCloseTo(718.11, 1);
        expect(pdfLayout.fontFamily).toContain('Logic Fit Print Arabic');
        // The print sheet retains the approved safe top margin; verify content
        // begins within that margin instead of assuming it touches the edge.
        expect(pdfLayout.childPositions[0].top).toBeGreaterThanOrEqual(0);
        expect(pdfLayout.childPositions[0].top).toBeLessThanOrEqual(24);
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(item.file);
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        expect(bytes.subarray(0, 8).toString('ascii')).toMatch(/^%PDF-1\./u);
        expect(bytes.toString('binary')).toContain('%%EOF');
        expect(bytes.length).toBeGreaterThan(20_000);
        const artifactDirectory = path.resolve(process.env.COACHING_DOWNLOAD_EVIDENCE_DIR || 'qa/artifacts/reports-coaching-pdf-real');
        fs.mkdirSync(artifactDirectory, { recursive: true });
        await download.saveAs(path.join(artifactDirectory, download.suggestedFilename()));
        expect(await button.getAttribute('data-report-coaching-type')).toBe(item.type);
    }

    expect(apiReads).toContain('/api/reports');
    expect(apiReads).toContain(`/api/workoutprograms/${workoutId}`);
    expect(apiReads).toContain(`/api/dietplans/${dietId}`);
    expect(apiReads).toContain(`/api/library/exercises/${exerciseId}`);
    expect(pdfEngineResponses).toContain(200);
    expect(printStylesheetResponses).toContain(200);
    expect(unexpectedWrites).toEqual([]);
    expect(blockedExternal).toEqual([]);
});
