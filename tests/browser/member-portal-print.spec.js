'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');

test('Member Portal report print and PDF controls print the existing report using canonical print CSS', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The real A4 PDF artifact is generated once in Desktop Chromium.');

    const apiRequests = [];
    const lookupPayload = {
        tenant: { name: 'نادي اختبار العضوية', slug: 'qa-member-club' },
        member: {
            fullName: 'عضو اختبار بوابة العضوية',
            phone: '+201001234567',
            phoneCountry: 'EG',
            email: 'portal-member@example.test',
            registrationDate: '2024-04-12T00:00:00.000Z'
        },
        currentMembership: {
            id: 55101,
            status: 'active',
            plan: 'باقة القوة للاختبار',
            type: 'شهري',
            startDate: '2026-09-01T00:00:00.000Z',
            endDate: '2026-10-31T00:00:00.000Z',
            daysRemaining: 20
        },
        memberships: [{
            plan: 'باقة القوة للاختبار', type: 'شهري', startDate: '2026-09-01T00:00:00.000Z',
            endDate: '2026-10-31T00:00:00.000Z', status: 'active', amountDue: 1200, amountPaid: 1200, amountRemaining: 0
        }],
        payments: [{
            receiptNumber: 'QA-PORTAL-55101', transactionDate: '2026-09-01T11:30:00.000Z',
            transactionType: 'subscription', amountPaid: 1200, amountRemaining: 0, paymentMethod: 'cash'
        }],
        attendance: [{
            attendanceDate: '2026-10-10T00:00:00.000Z', checkInAt: '2026-10-10T14:30:00.000Z',
            checkOutAt: '2026-10-10T16:00:00.000Z', durationMinutes: 90
        }],
        freezes: [{ startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-07-08T00:00:00.000Z', resumedDate: '2026-07-09T00:00:00.000Z', days: 8 }],
        attendanceSummary: { totalVisits: 42 },
        financialSummary: { totalDue: 1200, totalPaid: 1200, totalRemaining: 0 },
        firstJoinDate: '2024-04-12T00:00:00.000Z',
        reportNumber: 'QA-REPORT-55101',
        issuedAt: '2026-10-11T09:00:00.000Z'
    };

    // The browser QA server serves only static app files; every API request is
    // fulfilled here so this flow cannot write to a database or reach Production.
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        apiRequests.push({ method: request.method(), pathname: url.pathname });

        if (url.pathname === '/api/branding') {
            return route.fulfill({ json: { branding: { identity: { brandName: 'نادي اختبار العضوية' } }, version: 1 } });
        }
        if (url.pathname === '/api/member-portal/lookup' && request.method() === 'POST') {
            const body = request.postDataJSON();
            expect(body.membershipCode).toBe('QA-MEMBER-55101');
            return route.fulfill({ json: lookupPayload });
        }
        if (url.pathname === '/api/member-portal/occupancy' && request.method() === 'POST') {
            return route.fulfill({ json: { presentCount: 7, level: 'quiet', observedAt: '2026-10-11T09:00:00.000Z', staleCheckInsExcluded: 0 } });
        }
        return route.fulfill({ json: {} });
    });

    await page.addInitScript(() => {
        window.__memberPortalPrintCalls = 0;
        window.print = () => { window.__memberPortalPrintCalls += 1; };
    });

    await page.goto('/member-portal', { waitUntil: 'networkidle' });
    await page.locator('#membershipCodeInput').fill('QA-MEMBER-55101');
    await page.locator('#portalLookupForm').locator('button[type="submit"]').click();

    const result = page.locator('#portalResult');
    await expect(result).toBeVisible();
    await expect(result.locator('#portalPrintButton')).toBeHidden();
    await expect(result.locator('#portalPdfButton')).toBeHidden();
    await page.locator('[data-portal-tool="print"]').click();
    await expect(result.locator('#portalReportContent')).toBeVisible();
    const printButton = result.locator('#portalPrintButton');
    const pdfButton = result.locator('#portalPdfButton');
    await expect(printButton).toBeVisible();
    await expect(pdfButton).toBeVisible();

    const report = result.locator('#portalReportContent');
    await expect(report).toContainText('عضو اختبار بوابة العضوية');
    await expect(report).toContainText('نادي اختبار العضوية');
    await expect(report).toContainText('QA-PORTAL-55101');
    await expect(report).toContainText('سجل المدفوعات والإيصالات');
    await expect(report).toContainText('سجل الحضور والزيارات');
    await expect(report).toContainText('حالات التجميد أو الإيقاف');
    await expect(result.locator('#portalIssueMeta')).toContainText('QA-REPORT-55101');
    await expect(result.locator('#portalIssueMeta')).not.toHaveAttribute('data-i18n');
    await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('rtl');

    const printCss = page.locator('link[rel="stylesheet"][href*="main.css"]');
    await expect(printCss).toHaveCount(1);
    await expect.poll(() => printCss.evaluate((link) => Boolean(link.sheet))).toBe(true);
    const canonicalPrintCssResponse = await page.request.get('/css/print.css');
    expect(canonicalPrintCssResponse.ok()).toBeTruthy();
    const canonicalPrintCss = await canonicalPrintCssResponse.text();
    expect(canonicalPrintCss).toContain('@media print');

    await printButton.click();
    await pdfButton.click();
    await expect.poll(() => page.evaluate(() => window.__memberPortalPrintCalls)).toBe(2);
    expect(apiRequests.filter((request) => request.pathname === '/api/member-portal/lookup')).toHaveLength(1);
    expect(apiRequests.some((request) => request.method !== 'GET' && !request.pathname.startsWith('/api/member-portal/'))).toBe(false);

    await page.emulateMedia({ media: 'print' });
    const printState = await page.evaluate(() => {
        const sheet = document.querySelector('#portalReportContent');
        const bounds = sheet.getBoundingClientRect();
        const hiddenControls = [...document.querySelectorAll('[data-no-print], #portalPrintButton, #portalPdfButton')]
            .filter((element) => getComputedStyle(element).display !== 'none')
            .map((element) => element.id || element.className);
        return {
            direction: document.documentElement.dir,
            pageText: sheet.innerText,
            width: Math.round(bounds.width),
            height: Math.round(bounds.height),
            noPrintElements: document.querySelectorAll('[data-no-print]').length,
            hiddenControls,
            stylesheetUrls: [...document.styleSheets].map((stylesheet) => stylesheet.href).filter(Boolean),
            overflowingTables: [...sheet.querySelectorAll('.portal-table-wrap')]
                .filter((element) => element.scrollWidth > element.clientWidth + 1).length
        };
    });
    expect(printState.direction).toBe('rtl');
    expect(printState.width).toBeGreaterThan(0);
    expect(printState.height).toBeGreaterThan(0);
    expect(printState.noPrintElements).toBeGreaterThan(0);
    expect(printState.hiddenControls).toEqual([]);
    expect(printState.overflowingTables).toBe(0);

    await fs.mkdir(testInfo.outputDir, { recursive: true });
    const screenshotPath = testInfo.outputPath('member-portal-report-print.png');
    const pdfPath = testInfo.outputPath('member-portal-report-synthetic.pdf');
    const pdf = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(5000);
    const pdfPageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
    expect(pdfPageCount).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await fs.writeFile(testInfo.outputPath('member-portal-print-summary.json'), JSON.stringify({
        flow: 'Member Portal membership-code lookup → visible member tools → report view → Print and PDF controls → window.print()',
        data: 'Synthetic Playwright fixtures only; every /api request intercepted; no backend/database/Production write',
        sourceContract: 'Both existing controls invoke the same printReport() handler, which calls window.print(); PDF is the browser print output, not an application download endpoint.',
        printCss: { canonicalUrl: '/css/print.css', linkedThrough: await printCss.getAttribute('href'), loaded: true },
        apiRequests,
        printCalls: 2,
        printState,
        artifact: { pdfPath, screenshotPath, pdfBytes: pdf.byteLength, pdfPages: pdfPageCount },
        limits: ['PDF generation is exercised through Chromium page.pdf() after the actual print controls call window.print(); no application-owned PDF download endpoint exists in this flow.']
    }, null, 2), 'utf8');

    // Verify the same existing report in English without issuing another lookup.
    await page.evaluate(() => window.TopGymI18n?.set('en', { persist: false }));
    await expect.poll(() => page.evaluate(() => document.documentElement.dir)).toBe('ltr');
    await expect(report).toContainText('MEMBERSHIP PROFILE');
    await expect(report).toContainText('Memberships and renewals');
    await expect(report).toContainText('Payments and receipts');
    await expect(report.locator('.portal-membership-fact').nth(2).locator('small')).toContainText('20 days remaining');
    await expect(result.locator('.portal-report-signatures [data-i18n="memberPortal.report.issuedBy"]')).toHaveText('Issued by');
    await page.emulateMedia({ media: 'print' });
    const englishPdf = await page.pdf({
        path: testInfo.outputPath('member-portal-report-english.pdf'),
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true
    });
    expect(englishPdf.subarray(0, 4).toString()).toBe('%PDF');
    expect([...englishPdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length).toBeGreaterThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath('member-portal-report-print-english.png'), fullPage: true });
    expect(apiRequests.filter((request) => request.pathname === '/api/member-portal/lookup')).toHaveLength(1);
});
