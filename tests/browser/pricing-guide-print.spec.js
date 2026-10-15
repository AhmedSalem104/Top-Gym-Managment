'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

const pricingFixture = {
    plans: {
        qa_strength: { label: 'باقة القوة الاختبارية', monthlyPrice: 1250, sortOrder: 1, active: true },
        qa_family: { label: 'باقة الأسرة الطويلة للتحقق من عدم قص النصوص', monthlyPrice: 2350, sortOrder: 2, active: true }
    },
    types: {
        qa_month: { label: 'شهري', durationValue: 1, mode: 'months', priceMultiplier: 1, sortOrder: 1, active: true },
        qa_quarter: { label: 'ربع سنوي', durationValue: 3, mode: 'months', priceMultiplier: 2.7, sortOrder: 2, active: true },
        qa_hidden: { label: 'نوع مخفي للاختبار', durationValue: 6, mode: 'months', priceMultiplier: 5, sortOrder: 3, active: false }
    },
    prices: {
        qa_strength: { qa_month: 1250, qa_quarter: 3375, qa_hidden: 6000 },
        qa_family: { qa_month: 2350, qa_quarter: 6200, qa_hidden: 11000 }
    }
};

test('subscription pricing guide opens its Arabic print preview with all catalog data contained', async ({ page }, testInfo) => {
    const apiCalls = [];
    await page.context().route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        apiCalls.push(pathname);
        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 99001, name: 'QA Synthetic Owner', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: 'qa', name: 'QA Synthetic' } },
                entitlements: {
                    tenantType: 'gym',
                    features: { dashboard: true, pricing: true },
                    featureCatalog: [{ key: 'dashboard', tenantTypes: ['gym'] }, { key: 'pricing', tenantTypes: ['gym'] }]
                },
                recovery: false
            };
        } else if (pathname === '/api/branding') {
            payload = { branding: { identity: { brandName: 'نادي اختبار الأسعار' } }, version: 1 };
        } else if (pathname === '/api/pricing') {
            payload = pricingFixture;
        }
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });

    await page.goto('/?pricing-guide-print-contract#dashboard', { waitUntil: 'networkidle' });
    await expect(page.locator('#dashboardPrintPricingButton')).toBeHidden();
    const printButton = page.locator('#dashboardPrintPricingPreviewButton');
    await expect(printButton).toBeVisible();

    const popupPromise = page.waitForEvent('popup');
    await printButton.click();
    const printPage = await popupPromise;
    await expect(printPage.locator('.print-sheet.print-pricing-document')).toBeVisible();
    await expect(printPage.locator('.print-pricing-document')).toContainText('نادي اختبار الأسعار');
    await expect(printPage.locator('.print-pricing-document')).toContainText('باقة القوة الاختبارية');
    await expect(printPage.locator('.print-pricing-document')).toContainText('شهري');
    await expect(printPage.locator('.print-pricing-document')).toContainText('ربع سنوي');
    const formatMoneyValue = (value) => value.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await expect(printPage.locator('.print-pricing-document')).toContainText(formatMoneyValue(1250));
    await expect(printPage.locator('.print-pricing-document')).toContainText(formatMoneyValue(3375));
    const pricingSections = printPage.locator('.print-pricing-section');
    await expect(pricingSections.nth(0)).not.toContainText('نوع مخفي للاختبار');
    await expect(pricingSections.nth(1)).toContainText('نوع مخفي للاختبار');
    await expect(pricingSections.nth(1)).toContainText('غير ظاهر');

    const documentCheck = await printPage.locator('.print-pricing-document').evaluate((sheet) => {
        const bounds = sheet.getBoundingClientRect();
        const textNodes = [...sheet.querySelectorAll('th, td, h1, h2, p, span, strong, footer')];
        const outsideSheet = textNodes.filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1);
        }).map((element) => ({ text: element.textContent.trim(), left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right) }));
        const tables = [...sheet.querySelectorAll('.print-table')].map((table) => ({
            headers: [...table.querySelectorAll('thead th')].map((cell) => cell.innerText.trim()),
            rows: table.querySelectorAll('tbody tr').length,
            scrollWidth: table.scrollWidth,
            clientWidth: table.clientWidth
        }));
        return {
            language: sheet.closest('html')?.lang || document.documentElement.lang,
            direction: sheet.closest('html')?.dir || document.documentElement.dir,
            documentTitle: document.title,
            pageText: sheet.innerText,
            sheetWidth: Math.round(bounds.width),
            sheetHeight: Math.round(bounds.height),
            outsideSheet,
            tables
        };
    });
    expect(documentCheck.direction).toBe('rtl');
    expect(documentCheck.pageText).toContain('مصفوفة أسعار الباقات');
    expect(documentCheck.pageText).toContain('الأسعار بالجنيه المصري');
    expect(documentCheck.pageText).toContain('الحالة');
    expect(documentCheck.tables).toHaveLength(2);
    expect(documentCheck.tables[0].headers).toContain('السعر الشهري');
    expect(documentCheck.tables[0].rows).toBe(2);
    expect(documentCheck.tables[1].rows).toBe(3);
    expect(documentCheck.outsideSheet).toEqual([]);
    expect(apiCalls.filter((pathname) => pathname === '/api/pricing')).toHaveLength(1);

    await fs.mkdir(testInfo.outputDir, { recursive: true });
    const screenshotPath = testInfo.outputPath('subscription-pricing-guide-preview.png');
    const pdfPath = testInfo.outputPath('subscription-pricing-guide-synthetic.pdf');
    const generatedHtml = await printPage.content();
    const previewViewport = printPage.viewportSize();
    await printPage.close();
    const artifactPage = await page.context().newPage();
    await artifactPage.setViewportSize(previewViewport);
    await artifactPage.setContent(generatedHtml, { waitUntil: 'load' });
    await artifactPage.emulateMedia({ media: 'print' });
    await artifactPage.evaluate(() => document.fonts?.ready);
    await artifactPage.screenshot({ path: screenshotPath, fullPage: true });
    const printMediaLayout = await artifactPage.locator('.print-sheet').evaluate((sheet) => {
        const bounds = sheet.getBoundingClientRect();
        const textNodes = [...sheet.querySelectorAll('th, td, h1, h2, p, span, strong, footer')];
        const outsideSheet = textNodes.filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1);
        }).map((element) => element.textContent.trim());
        const tables = [...sheet.querySelectorAll('.print-table')].map((table) => ({
            scrollWidth: table.scrollWidth,
            clientWidth: table.clientWidth
        }));
        return { width: Math.round(bounds.width), height: Math.round(bounds.height), outsideSheet, tables };
    });
    expect(printMediaLayout.outsideSheet).toEqual([]);
    expect(printMediaLayout.tables.every((table) => table.scrollWidth <= table.clientWidth)).toBe(true);
    const pdf = await artifactPage.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(5000);
    const pageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
    expect(pageCount).toBeGreaterThanOrEqual(1);
    await artifactPage.close();

    await fs.writeFile(testInfo.outputPath('subscription-pricing-guide-summary.json'), JSON.stringify({
        source: 'Actual visible #dashboardPrintPricingPreviewButton → feature-loader → window.topGymPrint.printPricing(); PDF rendered from the exact generated popup document after capture',
        data: 'Synthetic Playwright route fixture for GET /api/pricing; no DB or production data',
        pdfPath,
        screenshotPath,
        pdfBytes: pdf.byteLength,
        pdfPages: pageCount,
        viewport: previewViewport,
        sheet: { width: documentCheck.sheetWidth, height: documentCheck.sheetHeight },
        printMedia: printMediaLayout,
        tables: documentCheck.tables,
        checks: { printPreviewHandler: true, actualDownloadHandler: 'not exercised: download button is hidden in dashboard hero by existing CSS', arabicRtl: true, expectedPrices: true, inactiveTypeExcludedFromMatrix: true, inactiveTypeListed: true, noTextOutsideSheet: true }
    }, null, 2), 'utf8');
});
