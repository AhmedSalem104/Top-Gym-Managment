const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const cases = [
    { width: 320, height: 720 },
    { width: 390, height: 844 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 }
];

const fixture = `
  <main dir="rtl" style="display:grid;gap:16px;max-width:1200px;margin:0 auto;padding:16px">
    <section class="permissions-section panel" aria-labelledby="permissionsTitle">
      <header class="permissions-header"><div class="permissions-heading"><div><h3 id="permissionsTitle">صلاحيات حسابات Assistant</h3><p>إدارة الوصول للحسابات</p></div></div><span class="permissions-owner-badge">Owner فقط</span></header>
      <div class="permissions-layout">
        <aside class="permissions-users-panel"><div class="permissions-subheading"><h4>اختر Assistant</h4><span class="permissions-users-count">0</span></div><div class="permissions-user-list">لا توجد حسابات</div></aside>
        <section class="permissions-editor-panel"><header class="permissions-editor-head"><div><h4>اختر حسابًا لعرض صلاحياته</h4><p>تظهر صلاحيات الحساب المحدد هنا.</p></div></header><form><div class="permissions-grid" id="permissionsGrid"><div class="permissions-empty-state" id="permissionsEmpty">لا توجد حسابات Assistant متاحة.</div></div><div class="permissions-editor-footer"><label class="permissions-reason-field">سبب التعديل<textarea></textarea></label><div class="permissions-form-actions"><button class="btn btn-light">استعادة الافتراضي</button><button class="btn btn-primary" disabled>حفظ الصلاحيات</button></div></div></form></section>
      </div>
    </section>
    <section class="backup-history-section backup-history-page panel" aria-labelledby="backupHistoryPageTitle">
      <header class="backup-history-section-head backup-history-page-head"><div class="backup-history-page-heading"><h3 id="backupHistoryPageTitle">سجل النسخ الاحتياطية</h3><p>سجل النسخ والعمليات الأخيرة.</p></div><div class="backup-history-page-actions"><button class="btn btn-primary btn-small">تحديث السجل</button></div></header>
      <div class="backup-history-block"><div class="backup-history-block-head"><strong>النسخ المحفوظة للجيم</strong><span>الاحتفاظ بالنسخ</span></div><div class="backup-history-wrap"><table class="backup-history-table backup-archive-table"><thead><tr><th>الملف</th><th>النوع</th><th>الحالة</th><th>البيانات</th><th>الحجم</th><th>آخر تحقق</th><th>الإجراءات</th></tr></thead><tbody><tr><td><strong>backup-long-name-2026-10-12.json.gz</strong><small>2026/10/12</small></td><td>نسخة يدوية</td><td><span class="backup-history-status verified">تم التحقق</span></td><td>1,250 صف</td><td>18 MB</td><td>2026/10/12</td><td><div class="backup-history-actions"><button class="btn btn-light btn-small">تحميل</button><button class="btn btn-danger btn-small">حذف</button></div></td></tr><tr><td colspan="7">لا توجد نسخ محفوظة لهذا الجيم حتى الآن.</td></tr></tbody></table></div></div>
      <div class="backup-history-block"><div class="backup-history-block-head"><strong>سجل التدقيق</strong><span>عمليات معروضة</span></div><div class="backup-history-wrap"><table class="backup-history-table backup-operations-table"><thead><tr><th>التاريخ</th><th>العملية</th><th>النتيجة</th><th>السبب</th></tr></thead><tbody><tr><td>2026/10/12</td><td>إنشاء نسخة</td><td><span class="backup-history-status success">ناجحة</span></td><td>نسخ يومي طويل لتجربة وضوح الجدول على الشاشة الصغيرة.</td></tr><tr><td colspan="4">لا يوجد سجل عمليات حتى الآن.</td></tr></tbody></table></div></div>
    </section>
  </main>`;

test('permissions empty state and backup history remain legible across viewport and theme fixtures', async ({ page }) => {
    const outputDir = path.join(process.cwd(), 'qa', 'artifacts', 'permissions-backup-v2');
    fs.mkdirSync(outputDir, { recursive: true });
    await page.route('**/*.js', (route) => route.abort());
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ url: '/css/main.css' });
    await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href?.includes('/css/main.css')));

    const populatedFixture = fixture.replace(/<tr><td colspan="\d+">.*?<\/td><\/tr>/g, '');
    for (const viewport of cases) {
        for (const theme of ['light', 'dark']) {
            await page.setViewportSize(viewport);
            await page.emulateMedia({ colorScheme: theme });
            await page.evaluate(({ markup, selectedTheme }) => {
                document.documentElement.lang = 'ar';
                document.documentElement.dir = 'rtl';
                document.documentElement.dataset.theme = selectedTheme;
                document.body.dataset.theme = selectedTheme;
                document.body.innerHTML = markup;
            }, { markup: populatedFixture, selectedTheme: theme });
            await page.evaluate(() => document.fonts.ready);
            const canvas = await page.locator('body').evaluate((element) => getComputedStyle(element).getPropertyValue('--bg-app').trim().toLowerCase());
            expect(canvas, `theme token for ${theme}`).toBe(theme === 'dark' ? '#09090b' : '#f5f7fb');

            const permissions = page.locator('#permissionsEmpty');
            const emptyStyle = await permissions.evaluate((element) => {
                const style = getComputedStyle(element);
                return { borderStyle: style.borderTopStyle, paddingBlock: parseFloat(style.paddingBlockStart) + parseFloat(style.paddingBlockEnd) };
            });
            expect(emptyStyle.borderStyle).toBe('none');
            expect(emptyStyle.paddingBlock).toBeLessThan(64);

            const measurements = await page.locator('.backup-archive-table').evaluate((table) => {
                const wrapper = table.closest('.backup-history-wrap');
                const emptyCell = table.querySelector('td[colspan]');
                return {
                    wrapperBorder: getComputedStyle(wrapper).borderTopStyle,
                    tableMinWidth: parseFloat(getComputedStyle(table).minWidth),
                    wrapperWidth: wrapper.clientWidth,
                    tableWidth: table.scrollWidth,
                    emptyCellText: emptyCell?.textContent.trim() ?? '',
                    pageWidth: document.documentElement.scrollWidth,
                    viewportWidth: document.documentElement.clientWidth,
                    overflowing: [...document.querySelectorAll('body *')].map((element) => ({
                        selector: element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${String(element.className || '').trim().toString().replace(/\s+/g, '.')}`,
                        left: Math.round(element.getBoundingClientRect().left),
                        right: Math.round(element.getBoundingClientRect().right),
                        scrollWidth: element.scrollWidth,
                        clientWidth: element.clientWidth,
                        containedTableOverflow: Boolean(element.closest('.backup-history-wrap'))
                    })).filter((item) => !item.containedTableOverflow
                        && (item.left < -1 || item.right > document.documentElement.clientWidth + 1))
                };
            });
            expect(measurements.wrapperBorder).toBe('none');
            expect(measurements.emptyCellText).toBe('');
            expect(measurements.pageWidth, JSON.stringify(measurements.overflowing)).toBeLessThanOrEqual(measurements.viewportWidth + 1);
            if (viewport.width <= 767) {
                expect(measurements.tableMinWidth).toBe(720);
                expect(measurements.tableWidth).toBeGreaterThan(measurements.wrapperWidth);
            } else {
                expect(measurements.tableMinWidth).toBe(900);
            }

            await page.screenshot({
                path: path.join(outputDir, `${viewport.width}-${theme}.png`),
                fullPage: true
            });

            await page.locator('.backup-archive-table tbody').evaluate((tbody) => {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 7;
                cell.textContent = 'لا توجد نسخ محفوظة لهذا الجيم حتى الآن.';
                row.append(cell);
                tbody.replaceChildren(row);
            });
            const emptyCell = page.locator('.backup-archive-table tbody td[colspan]');
            await expect(emptyCell).toBeVisible();
            const emptyCellStyle = await emptyCell.evaluate((element) => getComputedStyle(element));
            expect(emptyCellStyle.whiteSpace).toBe('normal');
            const emptyTableLayout = await page.locator('.backup-archive-table').evaluate((table) => ({
                minWidth: getComputedStyle(table).minWidth,
                headerDisplay: getComputedStyle(table.tHead).display,
                tableWidth: table.scrollWidth,
                wrapperWidth: table.closest('.backup-history-wrap').clientWidth
            }));
            expect(emptyTableLayout.minWidth).toBe('100%');
            expect(emptyTableLayout.headerDisplay).toBe('none');
            expect(emptyTableLayout.tableWidth).toBeLessThanOrEqual(emptyTableLayout.wrapperWidth + 1);
            await page.screenshot({ path: path.join(outputDir, `${viewport.width}-${theme}-empty.png`), fullPage: true });
        }
    }
});
