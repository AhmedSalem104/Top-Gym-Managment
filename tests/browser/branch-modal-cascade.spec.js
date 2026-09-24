const { test, expect } = require('@playwright/test');

async function mountBranchDialog(page) {
    await page.evaluate(() => {
        document.getElementById('branchCreateDialog')?.remove();
        const dialog = document.createElement('dialog');
        dialog.id = 'branchCreateDialog';
        dialog.className = 'branch-create-dialog lf-modal-shell lf-modal--md';
        dialog.innerHTML = `
            <form class="dialog-body branches-form" novalidate>
                <div class="details-dialog-head">
                    <div><span class="branches-card-kicker">NEW BRANCH</span><h3>إضافة فرع</h3><p>سيتم حفظه كفرع تابع لنفس الجيم.</p></div>
                    <button class="btn btn-light btn-small" type="button">إغلاق</button>
                </div>
                <div class="branch-create-fields">
                    <label class="form-label">كود الفرع<input required></label>
                    <label class="form-label">اسم الفرع<input required></label>
                    <label class="form-label">العنوان<input></label>
                    <label class="form-label">الهاتف<input type="tel"></label>
                </div>
                <div class="branch-create-options">
                    <label class="checkbox-field branches-check-field"><input type="checkbox"> تفعيل Store</label>
                    <label class="checkbox-field branches-check-field"><input type="checkbox"> تفعيل Bar</label>
                </div>
                <p class="branches-form-status"></p>
                <div class="dialog-actions"><button class="btn btn-light" type="button">إلغاء</button><button class="btn btn-primary" type="submit">إضافة الفرع</button></div>
            </form>`;
        document.body.append(dialog);
        dialog.showModal();
    });
    await page.locator('#branchCreateDialog').waitFor({ state: 'visible' });
}

async function signature(page) {
    return page.locator('#branchCreateDialog').evaluate((dialog) => {
        const form = dialog.querySelector('.dialog-body');
        const head = dialog.querySelector('.details-dialog-head');
        const fields = dialog.querySelector('.branch-create-fields');
        const footer = dialog.querySelector('.dialog-actions');
        const style = (node) => {
            const computed = getComputedStyle(node);
            return {
                display: computed.display,
                width: computed.width,
                maxWidth: computed.maxWidth,
                maxHeight: computed.maxHeight,
                padding: computed.padding,
                margin: computed.margin,
                gap: computed.gap,
                borderRadius: computed.borderRadius,
                backgroundColor: computed.backgroundColor,
                boxShadow: computed.boxShadow,
                overflowY: computed.overflowY
            };
        };
        return {
            dialog: style(dialog),
            form: style(form),
            head: style(head),
            fields: style(fields),
            footer: style(footer)
        };
    });
}

async function loadLazyMembershipCss(page) {
    await page.evaluate(() => {
        if (document.querySelector('link[data-branch-cascade-test]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `/css/pages/memberships.css?branch-cascade-test=${Date.now()}`;
        link.dataset.branchCascadeTest = '';
        document.head.append(link);
    });
    await page.locator('link[data-branch-cascade-test]').evaluate((link) => new Promise((resolve, reject) => {
        if (link.sheet) return resolve();
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', reject, { once: true });
    }));
}

test.describe('branchCreateDialog cascade contract', () => {
    test('keeps one deterministic shell across dynamic and lazy-load sequences', async ({ page }, testInfo) => {
        // Branch dialogs belong to the authenticated app shell. The server's
        // `/` route intentionally serves the login entry without shell CSS;
        // mounting here would measure the browser's native dialog defaults,
        // not the canonical modal contract.
        await page.goto('/index.html#branches');
        await page.waitForLoadState('domcontentloaded');
        await page.evaluate(() => { document.documentElement.dir = 'rtl'; });

        const snapshots = [];
        await mountBranchDialog(page);
        snapshots.push(await signature(page));

        await page.locator('#branchCreateDialog').evaluate((dialog) => dialog.close());
        await mountBranchDialog(page);
        snapshots.push(await signature(page));

        await loadLazyMembershipCss(page);
        await page.locator('#branchCreateDialog').evaluate((dialog) => dialog.close());
        await mountBranchDialog(page);
        snapshots.push(await signature(page));

        await page.evaluate(() => {
            const other = document.createElement('dialog');
            other.className = 'lf-modal-shell lf-modal--sm';
            other.innerHTML = '<div class="dialog-body">Other dialog</div>';
            document.body.append(other);
            other.showModal();
            other.close();
        });
        await page.locator('#branchCreateDialog').evaluate((dialog) => dialog.close());
        await mountBranchDialog(page);
        snapshots.push(await signature(page));

        expect(snapshots.slice(1)).toEqual(snapshots.slice(0, -1));
        await expect(page.locator('#branchCreateDialog')).toHaveClass(/lf-modal-shell/);
        await expect(page.locator('#branchCreateDialog')).toHaveClass(/lf-modal--md/);

        await page.screenshot({
            path: testInfo.outputPath(`branch-create-${testInfo.project.name}.png`),
            fullPage: false
        });
    });

    test('keeps the shell within the viewport at the supported breakpoints and themes', async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'The breakpoint sweep runs once in the desktop project.');
        for (const theme of ['light', 'dark']) {
            await page.evaluate((value) => {
                document.documentElement.dataset.theme = value;
                document.documentElement.dir = 'rtl';
            }, theme);
            for (const width of [1440, 1024, 768, 390, 320]) {
                await page.setViewportSize({ width, height: width < 600 ? 800 : 900 });
                await mountBranchDialog(page);
                const layout = await page.locator('#branchCreateDialog').evaluate((dialog) => ({
                    viewportWidth: window.innerWidth,
                    scrollWidth: document.documentElement.scrollWidth,
                    dialogWidth: dialog.getBoundingClientRect().width,
                    dialogRight: dialog.getBoundingClientRect().right,
                    dialogLeft: dialog.getBoundingClientRect().left
                }));
                expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth);
                expect(layout.dialogWidth).toBeLessThanOrEqual(layout.viewportWidth);
                expect(layout.dialogLeft).toBeGreaterThanOrEqual(0);
                expect(layout.dialogRight).toBeLessThanOrEqual(layout.viewportWidth);
                await page.locator('#branchCreateDialog').evaluate((dialog) => dialog.close());
            }
        }
    });
});
