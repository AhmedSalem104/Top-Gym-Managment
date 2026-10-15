const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const BASE_ORIGIN = 'http://127.0.0.1:4173';
const SCREENSHOTS = path.resolve(process.cwd(), 'qa/artifacts/library-v2-responsive');

test.describe('Gym library mobile table V2', () => {
    for (const width of [320, 390, 768, 1440]) {
        for (const theme of ['light', 'dark']) test(`library record cards keep long values separated at ${width}px (${theme})`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.route('**/api/**', (route) => route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: true, user: { id: 1, role: 'Owner', tenantType: 'gym' }, items: [], stats: { total: 0 } })
            }));
            await page.goto(`${BASE_ORIGIN}/index.html`, { waitUntil: 'domcontentloaded' });
            await page.evaluate(async () => { await document.fonts.ready; });
            await page.evaluate((activeTheme) => {
                document.documentElement.dir = 'rtl';
                document.documentElement.dataset.theme = activeTheme;
                document.body.dataset.theme = activeTheme;
                document.body.innerHTML = `<main class="library-section"><div class="library-list"><div class="library-table-wrap"><table class="library-data-table foods table-card-layout"><thead><tr><th>الطعام</th><th>التصنيف</th><th>السعرات</th><th>البروتين</th><th>الكربوهيدرات</th><th>الدهون</th><th>الحصة</th><th>الإجراءات</th></tr></thead><tbody><tr>${[
                    '<td data-label="الطعام"><div class="library-table-primary"><span class="library-table-icon">طعام</span><div><strong>وجبة اختبار طويلة</strong><small dir="ltr">Long meal fixture</small></div></div></td>',
                    '<td data-label="التصنيف"><span class="library-table-badge foods">وجبات صحية</span></td>',
                    '<td data-label="السعرات"><strong>725</strong><small>سعرة</small></td>',
                    '<td data-label="البروتين"><strong>38 جرام</strong><small>بروتين</small></td>',
                    '<td data-label="الكربوهيدرات"><strong>64 جرام</strong><small>كارب</small></td>',
                    '<td data-label="الدهون"><strong>22 جرام</strong><small>دهون</small></td>',
                    '<td data-label="الحصة">350 جرام</td>',
                    '<td data-label="الإجراءات"><div class="library-row-actions"><button class="btn btn-light library-action-button" aria-label="التفاصيل">عرض</button><button class="btn btn-light library-action-button" aria-label="تعديل">تعديل</button><button class="btn library-delete library-action-button" aria-label="حذف">حذف</button></div></td>'
                ].join('')}</tr></tbody></table></div></div></main>`;
            }, theme);

            const result = await page.locator('.library-data-table td').evaluateAll((cells) => {
                const first = cells[0];
                const row = first.closest('tr');
                const values = [...cells].map((cell) => ({
                    width: cell.getBoundingClientRect().width,
                    display: getComputedStyle(cell).display,
                    columns: getComputedStyle(cell).gridTemplateColumns,
                    primary: cell.classList.contains('mobile-card-primary'),
                    actions: cell.classList.contains('mobile-card-actions'),
                    label: cell.dataset.label,
                    contentText: cell.textContent.trim()
                }));
                return {
                    documentWidth: document.documentElement.scrollWidth,
                    viewportWidth: window.innerWidth,
                    first: values[0],
                    rowColumns: getComputedStyle(row).gridTemplateColumns,
                    valueColumns: values.filter((item) => !item.primary && !item.actions).map((item) => item.columns),
                    allHaveLabelsAndValues: values.every((item) => item.label && item.contentText),
                    columns: getComputedStyle(first).gridTemplateColumns
                };
            });

            expect(result.documentWidth).toBeLessThanOrEqual(result.viewportWidth);
            expect(result.allHaveLabelsAndValues).toBeTruthy();
            if (width <= 767) {
                expect(result.rowColumns.trim().split(/\s+/)).toHaveLength(1);
                for (const columns of result.valueColumns) expect(columns.trim().split(/\s+/)).toHaveLength(1);
            }
            else expect(result.first.display).toBe('table-cell');

            if (width <= 390) {
                await fs.mkdir(SCREENSHOTS, { recursive: true });
                await page.screenshot({ path: path.join(SCREENSHOTS, `library-${width}-${theme}.png`), fullPage: true });
            }
        });
    }
});
