'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const printCssPath = path.join(__dirname, '../../public/css/print.css');

test('V2 A4 print sheet fits the printable page and preserves multipage table content', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Chromium PDF rendering is verified once in the desktop project.');

    const printCss = fs.readFileSync(printCssPath, 'utf8');
    const rows = Array.from({ length: 72 }, (_, index) => `
        <tr>
            <td dir="ltr" data-numeric="true">QA-${String(index + 1).padStart(3, '0')}</td>
            <td>سجل طباعة تجريبي ${index + 1}</td>
            <td dir="ltr" data-numeric="true">${(1250 + index * 25).toLocaleString('en-US')}</td>
        </tr>`).join('');

    await page.setContent(`<!doctype html>
        <html lang="ar" dir="rtl">
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>V2 Print QA</title></head>
        <body style="margin:0">
            <main class="print-sheet print-system-document">
                <header class="print-header">
                    <div class="print-brand"><div class="print-brand-copy"><h1 class="print-brand-title">Logic Fit</h1><span class="print-brand-subtitle">تقرير اختبار الطباعة</span></div></div>
                    <div class="print-document-meta"><strong>تقرير متعدد الصفحات</strong><span dir="ltr">QA-PRINT-2026</span></div>
                </header>
                <div class="print-accent"></div>
                <section class="print-section">
                    <div class="print-section-title"><div><span class="print-section-kicker">سجل الاختبار</span><h2>البيانات المالية</h2></div></div>
                    <table class="print-table">
                        <thead><tr><th>المرجع</th><th>الوصف</th><th>القيمة</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </section>
                <p class="no-print">يجب ألا يظهر هذا النص في الطباعة.</p>
                <p class="print-only">بيان ظاهر للطباعة فقط.</p>
                <footer class="print-footer"><strong>إجمالي السجلات</strong><span dir="ltr" data-numeric="true">72</span></footer>
            </main>
        </body></html>`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: printCss });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts?.ready);

    const printState = await page.locator('.print-sheet').evaluate((sheet) => {
        const body = document.body;
        const tableHead = sheet.querySelector('thead');
        const hiddenText = sheet.querySelector('.no-print');
        const printOnly = sheet.querySelector('.print-only');
        return {
            direction: getComputedStyle(sheet).direction,
            width: getComputedStyle(sheet).width,
            sheetClientWidth: sheet.clientWidth,
            bodyClientWidth: body.clientWidth,
            bodyScrollWidth: body.scrollWidth,
            sheetScrollWidth: sheet.scrollWidth,
            tableHeaderDisplay: getComputedStyle(tableHead).display,
            hiddenControlDisplay: getComputedStyle(hiddenText).display,
            printOnlyDisplay: getComputedStyle(printOnly).display,
            rowCount: sheet.querySelectorAll('tbody tr').length,
            firstReference: sheet.querySelector('tbody tr:first-child td:first-child').textContent.trim(),
            lastReference: sheet.querySelector('tbody tr:last-child td:first-child').textContent.trim(),
            finalTotal: sheet.querySelector('.print-footer [data-numeric="true"]').textContent.trim()
        };
    });

    expect(printCss).toMatch(/@page\s*\{[^}]*size:\s*A4[^}]*margin:\s*12mm/s);
    expect(printState.direction).toBe('rtl');
    expect(Number.parseFloat(printState.width)).toBeLessThanOrEqual(printState.bodyClientWidth);
    expect(printState.sheetClientWidth).toBeLessThanOrEqual(printState.bodyClientWidth);
    expect(printState.sheetScrollWidth).toBeLessThanOrEqual(printState.sheetClientWidth);
    expect(printState.bodyScrollWidth).toBeLessThanOrEqual(printState.bodyClientWidth);
    expect(printState.tableHeaderDisplay).toBe('table-header-group');
    expect(printState.hiddenControlDisplay).toBe('none');
    expect(printState.printOnlyDisplay).not.toBe('none');
    expect(printState.rowCount).toBe(72);
    expect(printState.firstReference).toBe('QA-001');
    expect(printState.lastReference).toBe('QA-072');
    expect(printState.finalTotal).toBe('72');

    const pdfPath = testInfo.outputPath('logic-fit-v2-print-continuation.pdf');
    const screenshotPath = testInfo.outputPath('logic-fit-v2-print-continuation.png');
    const pdf = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(5000);
    const pageCount = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Page\b/g)].length;
    expect(pageCount).toBeGreaterThan(1);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await fs.promises.writeFile(testInfo.outputPath('logic-fit-v2-print-continuation.json'), JSON.stringify({
        source: 'Synthetic, in-memory A4 print sheet styled with the canonical public/css/print.css; no application APIs or persistence used.',
        pdfPath,
        screenshotPath,
        pdfBytes: pdf.byteLength,
        pdfPages: pageCount,
        printState
    }, null, 2), 'utf8');
});
