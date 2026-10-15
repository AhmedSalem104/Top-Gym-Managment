'use strict';

const { test, expect } = require('@playwright/test');

const workoutId = 88401;
const dietId = 88402;
const exerciseId = 88403;
const memberName = 'عضو اختبار التقارير';
const workoutName = 'برنامج قوة اصطناعي';
const dietName = 'خطة تغذية اصطناعية';

function syntheticPdf() {
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Length 47 >>\nstream\nBT /F1 12 Tf 24 96 Td (Synthetic QA PDF) Tj ET\nendstream'
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf, 'binary'));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf, 'binary');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return pdf;
}

function pdfEngineFixture() {
    const source = JSON.stringify(syntheticPdf());
    return `(() => {
        const bytes = ${source};
        window.html2pdf = () => {
            const worker = {
                set() { return this; },
                from() { return this; },
                outputPdf: async () => new Blob([bytes], { type: 'application/pdf' }),
                save: async () => undefined
            };
            return worker;
        };
    })();`;
}

test('Reports coaching and nutrition PDF buttons download synthetic PDFs without external or write requests', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'PDF binary/output verification runs in the desktop Chromium project.');
    const unexpectedWrites = [];
    const blockedExternal = [];
    const apiReads = [];

    await page.context().route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const method = request.method().toUpperCase();

        if (url.origin !== 'http://127.0.0.1:4173') {
            if (url.href === 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js') {
                return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: pdfEngineFixture() });
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
        await button.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(item.file);
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        expect(bytes.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');
        expect(bytes.toString('binary')).toContain('%%EOF');
        expect(bytes.length).toBeGreaterThan(200);
        expect(await button.getAttribute('data-report-coaching-type')).toBe(item.type);
    }

    expect(apiReads).toContain('/api/reports');
    expect(apiReads).toContain(`/api/workoutprograms/${workoutId}`);
    expect(apiReads).toContain(`/api/dietplans/${dietId}`);
    expect(apiReads).toContain(`/api/library/exercises/${exerciseId}`);
    expect(unexpectedWrites).toEqual([]);
    expect(blockedExternal).toEqual([]);
});
