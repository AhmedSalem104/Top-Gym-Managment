'use strict';

const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const featureCatalog = require('../../src/services/feature-catalog');
const planCatalog = require('../../src/services/saas-plan-catalog');

const OUTPUT = path.resolve(process.cwd(), process.env.MEMBERS_VISUAL_QA_OUTPUT || 'qa/artifacts/members-v2-screen-continuation');
const WIDTHS = [320, 375, 390, 768, 1024, 1440, 1920];
const LOCALES = ['ar', 'en'];
const THEMES = ['light', 'dark'];
const BUSINESS_PLAN = planCatalog.PLAN_CONFIGURATIONS.find((plan) => plan.code === 'business');

const memberFixture = (id, fullName, status, overrides = {}) => ({
    id,
    fullName,
    phone: `+2010149784${String(id).slice(-2)}`,
    phoneCountry: 'EG',
    membershipCode: { maskedCode: `LF-QA-${id}-******` },
    registrationDate: '2026-09-01',
    membership: {
        id: id + 1000,
        plan: 'gym_only',
        type: 'monthly',
        status,
        startDate: '2026-09-01',
        effectiveEndDate: status === 'expired' ? '2026-08-20' : '2026-11-12',
        daysRemaining: status === 'expired' ? -53 : status === 'expiring_soon' ? 6 : 31,
        freezeCount: 1,
        freezeLimit: 3,
        amountDue: 750,
        amountPaid: 600,
        amountRemaining: 150,
        ...overrides
    },
    attendance: {}
});

const MEMBERS = [
    memberFixture(731, 'أحمد منير الشاذلي – اسم طويل لاختبار التفاف النص ووضوح بيانات العضو', 'active'),
    memberFixture(732, 'حسن مصطفى', 'expiring_soon', { amountDue: 400, amountPaid: 300, amountRemaining: 100 }),
    memberFixture(733, 'عبدالله محمد سالم', 'expired', { amountDue: 180, amountPaid: 180, amountRemaining: 0, freezeCount: 3 }),
    memberFixture(734, 'إسلام أحمد عبدالمقصود', 'frozen', { freezeCount: 0, amountRemaining: 0 })
];

async function installReadOnlyMemberFixtures(page, members = MEMBERS) {
    const requests = [];
    await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const method = request.method().toUpperCase();
        requests.push({ method, pathname });
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            return route.fulfill({
                status: 405,
                contentType: 'application/json; charset=utf-8',
                body: JSON.stringify({ error: 'Read-only visual fixture: writes are blocked.' })
            });
        }

        let payload = {};
        if (pathname === '/api/auth/session') {
            payload = { authenticated: true, user: { id: 9731, name: 'Members V2 QA', role: 'Owner', tenantType: 'gym', permissions: [] } };
        } else if (pathname === '/api/branding') {
            payload = { identity: { brandName: 'Members QA Gym' }, assets: {} };
        } else if (pathname === '/api/saas/entitlements') {
            payload = {
                tenantStatus: 'active',
                subscription: { status: 'active', plan: { code: BUSINESS_PLAN.code, name: BUSINESS_PLAN.name } },
                entitlements: {
                    tenantType: 'gym',
                    features: planCatalog.featureFlagsForPlan(BUSINESS_PLAN.code),
                    featureCatalog: featureCatalog.getFeatureCatalog({ tenantType: 'gym' })
                }
            };
        } else if (pathname === '/api/branches/bootstrap') {
            const branch = { id: 1, name: 'Main Branch', code: 'main', status: 'active', isMain: true };
            payload = { branches: [branch], activeBranches: [branch], defaultBranch: branch, sections: [], branchLimit: 5, hasMultipleActiveBranches: false, canUseAllBranches: true };
        } else if (pathname === '/api/dashboard') {
            payload = { stats: { total: 165, active: 120, expiringSoon: 18, expired: 12 }, alerts: [] };
        } else if (pathname === '/api/pricing') {
            payload = {
                plans: { gym_only: { label: 'جيم', monthlyPrice: 750, active: true } },
                types: { monthly: { label: 'شهري', mode: 'months', durationValue: 1, priceMultiplier: 1, active: true } },
                durations: { monthly: 1 }
            };
        } else if (pathname === '/api/members') {
            payload = {
                members,
                pagination: { page: 1, pageSize: 5, total: 165, totalItems: 165, totalPages: 33, hasPrevious: false, hasNext: true }
            };
        } else if (pathname === `/api/members/${members[0]?.id}/details`) {
            payload = { member: members[0], currentMembership: members[0].membership, memberships: [], freezes: [], events: [] };
        } else if (pathname === `/api/clients/${members[0]?.id}/coaching-summary`) {
            payload = {
                workoutPrograms: [{ id: 881, name: 'QA Strength Plan', status: 'active', exerciseCount: 8 }],
                dietPlans: [{ id: 882, name: 'QA Nutrition Plan', status: 'draft', itemCount: 5 }],
                measurementCount: 6,
                completedSessions: 12,
                mealLogCount: 9
            };
        }

        return route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(payload) });
    });
    return requests;
}

async function getDialogGeometry(dialog) {
    return dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const scroller = node.querySelector('.member-dialog-scroll, .details-content, #detailsContent');
        const footer = node.querySelector('.form-actions, .details-dialog-footer');
        const scrollerRect = scroller?.getBoundingClientRect();
        const footerRect = footer?.getBoundingClientRect();
        return {
            left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            width: rect.width, height: rect.height,
            contentClientWidth: scroller?.clientWidth ?? null,
            contentScrollWidth: scroller?.scrollWidth ?? null,
            footerTop: footerRect?.top ?? null,
            contentBottom: scrollerRect?.bottom ?? null
        };
    });
}

async function openVisibleMemberAction(page, action) {
    let target = page.locator(`#membersList [data-action="${action}"]:visible`).first();
    if (!(await target.count())) {
        await page.locator('#membersList .action-menu-toggle:visible').first().click();
        target = page.locator(`#membersList [data-action="${action}"]:visible`).first();
    }
    await expect(target).toBeVisible();
    await target.click();
}

async function assertDialogFits(dialog, width, viewportHeight, label) {
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box, `${label} dialog has measurable bounds`).not.toBeNull();
    expect(box.x, `${label} dialog left edge at ${width}px`).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width, `${label} dialog right edge at ${width}px`).toBeLessThanOrEqual(width + 1);
    expect(box.y, `${label} dialog top edge`).toBeGreaterThanOrEqual(-1);
    expect(box.y + box.height, `${label} dialog bottom edge`).toBeLessThanOrEqual(viewportHeight + 1);
    const geometry = await getDialogGeometry(dialog);
    if (geometry.contentClientWidth !== null) {
        expect(geometry.contentScrollWidth, `${label} dialog content horizontal overflow at ${width}px`).toBeLessThanOrEqual(geometry.contentClientWidth + 1);
    }
    if (geometry.footerTop !== null && geometry.contentBottom !== null) {
        expect(geometry.contentBottom, `${label} dialog content overlaps footer at ${width}px`).toBeLessThanOrEqual(geometry.footerTop + 1);
    }
    return geometry;
}

async function installCurrentMembersStyles(page, cssSource) {
    // The browser serves the generated main.css bundle. Overlay the canonical
    // feature source in this isolated QA page so unbuilt source edits are tested
    // without writing generated CSS artifacts into the worktree.
    await page.addStyleTag({ content: cssSource });
}

test('member identity, dates, account and member-wide freezes remain aligned in locale/theme/viewport matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The focused visual matrix is captured once using explicit responsive viewports.');
    const output = path.resolve(process.cwd(), 'qa/artifacts/members-alignment-20261018');
    await fs.mkdir(output, { recursive: true });
    const css = await fs.readFile(path.resolve(process.cwd(), 'public/css/pages/members.css'), 'utf8');
    await installReadOnlyMemberFixtures(page);
    await page.goto('/index.html?membersAlignment=1#members', { waitUntil: 'networkidle' });
    await expect(page.locator('#membersList')).toContainText(MEMBERS[0].fullName);
    await installCurrentMembersStyles(page, css);

    for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: width < 400 ? 844 : 960 });
        for (const locale of LOCALES) {
            await page.evaluate((value) => window.TopGymI18n.set(value, { persist: false }), locale);
            for (const theme of THEMES) {
                await page.evaluate((mode) => {
                    document.documentElement.dataset.theme = mode;
                    document.body.dataset.theme = mode;
                }, theme);
                const firstMember = page.locator('#membersList .members-mobile-card[data-member-id="731"]:visible, #membersList .members-table tbody tr[data-member-id="731"]:visible').first();
                await expect(firstMember).toBeVisible();
                if (width >= 768) {
                    const cellAlignment = await firstMember.locator('td').evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).textAlign));
                    expect(cellAlignment).toEqual(['center', 'center', 'center', 'center', 'center', 'center']);
                    const identityGeometry = await firstMember.locator('td:first-child').evaluate((cell) => {
                        const cellRect = cell.getBoundingClientRect();
                        const name = cell.querySelector('.table-member-name');
                        const nameRect = name?.getBoundingClientRect();
                        return {
                            cellWidth: cellRect.width,
                            nameVisible: Boolean(nameRect && nameRect.width > 0 && nameRect.left >= cellRect.left && nameRect.right <= cellRect.right),
                            nameAlignment: name ? getComputedStyle(name).textAlign : null
                        };
                    });
                    expect(identityGeometry.cellWidth).toBeGreaterThanOrEqual(280);
                    expect(identityGeometry.nameVisible).toBe(true);
                    expect(identityGeometry.nameAlignment).toBe('center');
                    if (width < 1600) {
                        const actionsPosition = await firstMember.locator('td:last-child').evaluate((cell) => getComputedStyle(cell).position);
                        expect(actionsPosition).toBe('static');
                    }
                    const compositionAlignment = await firstMember.locator('.member-identity-copy, .table-member-phone, .member-code-preview, .member-last-subscription, .membership-date, .membership-date [dir="ltr"], .member-account-values > span, .member-freeze-cell, .freeze-usage > strong, .freeze-usage > span, .freeze-usage [dir="ltr"], .member-status-detail').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).textAlign));
                    expect(compositionAlignment.every((alignment) => alignment === 'center')).toBe(true);
                    await firstMember.hover();
                    const hoverSurface = await firstMember.evaluate((row) => ({
                        row: getComputedStyle(row).backgroundColor,
                        cells: [...row.cells].map((cell) => getComputedStyle(cell).backgroundColor)
                    }));
                    expect(hoverSurface.cells.every((color) => color === hoverSurface.row), JSON.stringify(hoverSurface)).toBe(true);
                    await page.mouse.move(0, 0);
                } else {
                    const accountSurface = await firstMember.locator('.members-mobile-balance').evaluate((node) => getComputedStyle(node).backgroundColor);
                    expect(accountSurface).not.toBe('rgba(0, 0, 0, 0)');
                    const accountAlignment = await firstMember.locator('.members-mobile-account-values > span').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).textAlign));
                    expect(accountAlignment).toEqual(['center', 'center']);
                }
                const dateTexts = await firstMember.locator('.membership-date time').allTextContents();
                expect(dateTexts).toEqual(['01/09/2026', '12/11/2026']);
                await expect(firstMember).toContainText(locale === 'ar' ? 'إجمالي سجلاته' : 'All records');
                await expect(firstMember).toContainText(locale === 'ar' ? 'المتبقي' : 'Remaining');
                const overflow = await firstMember.evaluate((element) => element.scrollWidth > element.clientWidth);
                expect(overflow, `${width}px ${locale}/${theme}: member record must not overflow`).toBe(false);

                if ((width === 360 && locale === 'ar' && theme === 'light')
                    || (width === 390 && locale === 'en' && theme === 'dark')
                    || (width === 768 && locale === 'ar' && theme === 'dark')
                    || (width === 1440 && locale === 'en' && theme === 'light')) {
                    await page.screenshot({ path: path.join(output, `members-${width}-${locale}-${theme}.png`), fullPage: false });
                }
            }
        }
    }
});

test('member details use accessible tabs on desktop and mobile, including the dedicated training/nutrition panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The focused details layout matrix runs once with explicit responsive viewports.');
    test.setTimeout(180_000);
    const output = path.resolve(process.cwd(), 'qa/artifacts/member-details-tabs-20261018');
    await fs.mkdir(output, { recursive: true });
    const membershipCss = await fs.readFile(path.resolve(process.cwd(), 'public/css/pages/memberships.css'), 'utf8');
    const coachingCss = await fs.readFile(path.resolve(process.cwd(), 'public/css/pages/coaching.css'), 'utf8');
    const requests = await installReadOnlyMemberFixtures(page);

    for (const { width, height } of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize({ width, height });
        for (const [locale, theme] of [['ar', 'light'], ['ar', 'dark'], ['en', 'light'], ['en', 'dark']]) {
            await page.goto(`/index.html?memberDetailsTabs=${width}-${locale}-${theme}#members`, { waitUntil: 'networkidle' });
            await page.addStyleTag({ content: membershipCss });
            await page.addStyleTag({ content: coachingCss });
            await page.evaluate(async ({ locale: selectedLocale, mode }) => {
                await window.TopGymI18n.set(selectedLocale, { persist: false });
                window.TopGymTheme.set(mode);
            }, { locale, mode: theme });
            await openVisibleMemberAction(page, 'details');
            const dialog = page.locator('#detailsDialog');
            await expect(dialog).toBeVisible();
            const fixedFrame = async () => dialog.evaluate((node) => {
                const rect = (element) => {
                    const bounds = element.getBoundingClientRect();
                    return [bounds.x, bounds.y, bounds.width, bounds.height].map((value) => Math.round(value * 10) / 10);
                };
                const body = node.querySelector(':scope > .dialog-body');
                const tabs = node.querySelector('.member-details-tabs');
                const content = node.querySelector('#detailsContent');
                const activePanel = node.querySelector('[data-member-details-panel]:not([hidden])');
                return {
                    dialog: rect(node),
                    header: rect(node.querySelector('.member-details-head')),
                    tabs: rect(tabs),
                    content: rect(content),
                    scrollOwners: {
                        dialog: getComputedStyle(node).overflowY,
                        body: getComputedStyle(body).overflowY,
                        content: getComputedStyle(content).overflowY,
                        panel: getComputedStyle(node.querySelector('[data-member-details-panel]:not([hidden])')).overflowY
                    },
                    widths: [node, body, content, activePanel].map((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }))
                };
            });
            const initialFrame = await fixedFrame();
            const tabs = dialog.locator('[data-member-details-tab]');
            await expect(tabs).toHaveCount(6);
            const tab = dialog.locator('[data-member-details-tab="training"]');
            await expect(tab).toBeVisible();
            await tab.click();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
            const trainingPanel = dialog.locator('[data-member-details-panel="training"]');
            await expect(trainingPanel).toBeVisible();
            const trainingFrame = await fixedFrame();
            expect(trainingFrame.dialog).toEqual(initialFrame.dialog);
            expect(trainingFrame.header).toEqual(initialFrame.header);
            expect(trainingFrame.tabs).toEqual(initialFrame.tabs);
            expect(trainingFrame.content).toEqual(initialFrame.content);
            expect(trainingFrame.scrollOwners).toMatchObject({ dialog: 'hidden', body: 'hidden', content: 'hidden', panel: 'auto' });
            for (const width of trainingFrame.widths) {
                expect(width.scroll, `unexpected horizontal overflow ${JSON.stringify(trainingFrame.widths)}`).toBeLessThanOrEqual(width.client + 1);
            }
            await expect(trainingPanel.locator('[data-member-training-panel]')).toBeVisible();
            await expect(trainingPanel.locator('.member-training-head h4')).toHaveText(locale === 'ar' ? 'التدريب والتغذية' : 'Training and nutrition');
            const trainingLabels = await trainingPanel.locator('.member-training-head, .member-progress-line').allTextContents();
            expect(trainingLabels.join(' ')).toMatch(locale === 'ar' ? /متابعة الأداء|القياسات/ : /Performance tracking|Measurements/);
            await expect(trainingPanel).toContainText('QA Strength Plan');
            await expect(trainingPanel).toContainText('QA Nutrition Plan');
            await expect(trainingPanel).toContainText(locale === 'ar' ? 'نشط' : 'Active');
            await expect(trainingPanel).toContainText(locale === 'ar' ? 'مسودة' : 'Draft');
            const panelGeometry = await trainingPanel.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
            expect(panelGeometry.scrollWidth).toBeLessThanOrEqual(panelGeometry.clientWidth + 1);
            await page.screenshot({ path: path.join(output, `training-${width}-${locale}-${theme}.png`), fullPage: false });

            const overviewTab = dialog.locator('[data-member-details-tab="overview"]');
            await overviewTab.click();
            await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
            const overviewFrame = await fixedFrame();
            expect(overviewFrame.dialog).toEqual(initialFrame.dialog);
            expect(overviewFrame.header).toEqual(initialFrame.header);
            expect(overviewFrame.tabs).toEqual(initialFrame.tabs);
            expect(overviewFrame.content).toEqual(initialFrame.content);
            await expect(trainingPanel).toBeHidden();
            await page.screenshot({ path: path.join(output, `overview-${width}-${locale}-${theme}.png`), fullPage: false });

            await tab.click();
            const longContent = await trainingPanel.evaluate((panel) => {
                const section = document.createElement('section');
                section.className = 'details-section';
                const heading = document.createElement('h4');
                heading.textContent = 'QA long-content scroll check';
                section.append(heading);
                for (let index = 0; index < 18; index += 1) {
                    const paragraph = document.createElement('p');
                    paragraph.textContent = `Long-content fixture ${index + 1}: ${'member training details remain readable and wrap within the available tab panel. '.repeat(8)}`;
                    section.append(paragraph);
                }
                panel.append(section);
                return { scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight };
            });
            expect(longContent.scrollHeight).toBeGreaterThan(longContent.clientHeight);
            await trainingPanel.evaluate((panel) => { panel.scrollTop = panel.scrollHeight; });
            expect(await trainingPanel.evaluate((panel) => panel.scrollTop)).toBeGreaterThan(0);
            expect(await trainingPanel.evaluate((panel) => {
                const lastParagraph = panel.lastElementChild?.lastElementChild;
                return lastParagraph && lastParagraph.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom + 1;
            })).toBe(true);
            await overviewTab.click();
            await tab.click();
            expect(await trainingPanel.evaluate((panel) => panel.scrollTop)).toBe(0);
            const longFrame = await fixedFrame();
            expect(longFrame.dialog).toEqual(initialFrame.dialog);
            expect(longFrame.tabs).toEqual(initialFrame.tabs);
            expect(longFrame.widths.every(({ scroll, client }) => scroll <= client + 1)).toBe(true);
            await page.locator('#detailsClose').click();
        }
    }
    expect(requests.filter(({ method }) => !['GET', 'HEAD', 'OPTIONS'].includes(method))).toEqual([]);
});

test('Members list, search, filters, table and mobile cards render in V2 across viewport and theme matrix', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One deterministic browser captures the full responsive matrix.');
    test.setTimeout(360_000);

    const requests = await installReadOnlyMemberFixtures(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const dialogLocaleAudits = [];
    const membersCssSource = await fs.readFile(path.join(process.cwd(), 'public/css/pages/members.css'), 'utf8');
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });

    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        await page.goto(`/index.html?membersV2Visual=${width}#members`, { waitUntil: 'networkidle' });
        await installCurrentMembersStyles(page, membersCssSource);
        await expect(page.locator('#membersSection')).toBeVisible();
        await expect(page.locator('#searchInput')).toBeVisible();
        await expect(page.locator('#addMemberButton')).toBeVisible();
        await expect(page.locator('#membersList')).toContainText('أحمد منير الشاذلي');
        await expect(page.locator('#statusFilter option')).toHaveCount(5);
        await expect(page.locator('#sortFilter option')).toHaveCount(3);

        const isMobile = width < 768;
        if (isMobile) {
            await expect(page.locator('#membersList .members-mobile-card')).toHaveCount(4);
            await expect(page.locator('#membersList .members-table')).toHaveCount(0);
            await expect(page.locator('.members-mobile-results-count')).toBeVisible();
            const addAction = await page.locator('#addMemberButton').boundingBox();
            const sectionPaddingBottom = await page.locator('#membersSection').evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingBlockEnd));
            expect(addAction.width, `persistent add action spans mobile dock at ${width}px`).toBeGreaterThanOrEqual(width - 24);
            expect(addAction.height, `persistent add action meets touch height at ${width}px`).toBeGreaterThanOrEqual(44);
            expect(sectionPaddingBottom, `member list reserves space below pagination at ${width}px`).toBeGreaterThanOrEqual(68);
        } else {
            await expect(page.locator('#membersList .members-table')).toBeVisible();
            await expect(page.locator('#membersList .members-table tbody > tr')).toHaveCount(4);
            await expect(page.locator('#membersList .members-mobile-card')).toHaveCount(0);
            await expect(page.locator('#membersList .members-table thead th')).toHaveCount(6);
        }

        for (const locale of LOCALES) {
          await page.evaluate((value) => window.TopGymI18n.set(value), locale);
          const direction = locale === 'ar' ? 'rtl' : 'ltr';
          await expect(page.locator('html')).toHaveAttribute('dir', direction);
          await expect(page.locator('.members-panel > .panel-header h3')).toHaveText(locale === 'ar' ? 'المشتركون' : 'Members');
          await expect(page.locator('#searchInput')).toHaveAttribute('placeholder', locale === 'ar' ? 'ابحث بالاسم أو رقم الهاتف أو كود العضوية' : 'Search by name, phone number, or membership code');
          await expect(page.locator('#addMemberButton')).toContainText(locale === 'ar' ? 'إضافة مشترك' : 'Add member');
          for (const theme of THEMES) {
            await page.evaluate((mode) => window.TopGymTheme.set(mode), theme);
            await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe(theme);
            expect(await page.locator('#membersSection').evaluate((node) => getComputedStyle(node).direction)).toBe(direction);

            const bounds = await page.evaluate(() => ({
                viewport: innerWidth,
                document: document.documentElement.scrollWidth,
                body: document.body.scrollWidth,
                section: (() => {
                    const rect = document.querySelector('#membersSection').getBoundingClientRect();
                    return { left: rect.left, right: rect.right };
                })(),
                tableScroller: (() => {
                    const node = document.querySelector('#membersList .table-scroll');
                    const table = node?.querySelector('.members-table');
                    const firstCell = table?.querySelector('tbody tr td:first-child');
                    const wrapperRect = node?.getBoundingClientRect();
                    const firstCellRect = firstCell?.getBoundingClientRect();
                    return node ? {
                        client: node.clientWidth,
                        scroll: node.scrollWidth,
                        overflowX: getComputedStyle(node).overflowX,
                        tableDirection: table ? getComputedStyle(table).direction : null,
                        firstColumnVisible: Boolean(wrapperRect && firstCellRect && firstCellRect.left >= wrapperRect.left - 1 && firstCellRect.right <= wrapperRect.right + 1)
                    } : null;
                })()
            }));
            expect(bounds.document, `document overflow ${width}px ${theme}`).toBeLessThanOrEqual(width);
            expect(bounds.body, `body overflow ${width}px ${theme}`).toBeLessThanOrEqual(width);
            expect(bounds.section.left, `members left edge ${width}px ${theme}`).toBeGreaterThanOrEqual(-1);
            expect(bounds.section.right, `members right edge ${width}px ${theme}`).toBeLessThanOrEqual(width + 1);
            const headerParts = await page.evaluate(() => {
                const heading = document.querySelector('.members-panel > .panel-header .members-page-heading')?.getBoundingClientRect();
                const actions = document.querySelector('.members-panel > .panel-header .header-actions')?.getBoundingClientRect();
                return heading && actions ? { heading: { left: heading.left, right: heading.right, top: heading.top, bottom: heading.bottom }, actions: { left: actions.left, right: actions.right, top: actions.top, bottom: actions.bottom } } : null;
            });
            if (headerParts) {
                const overlapX = Math.min(headerParts.heading.right, headerParts.actions.right) - Math.max(headerParts.heading.left, headerParts.actions.left);
                const overlapY = Math.min(headerParts.heading.bottom, headerParts.actions.bottom) - Math.max(headerParts.heading.top, headerParts.actions.top);
                expect(overlapX > 0 && overlapY > 0, `page heading and actions must not overlap at ${width}px ${locale} ${theme}`).toBe(false);
            }
            if (!isMobile) {
                expect(bounds.tableScroller, `table containment ${width}px ${theme}`).not.toBeNull();
                expect(['auto', 'scroll']).toContain(bounds.tableScroller.overflowX);
                expect(bounds.tableScroller.tableDirection, `table direction follows ${locale} at ${width}px`).toBe(direction);
                expect(bounds.tableScroller.firstColumnVisible, `member identity column is visible at the initial table position at ${width}px ${locale}`).toBe(true);
                const accountCellTextOverflow = await page.locator('#membersList .members-table tbody tr').evaluateAll((rows) => rows.flatMap((row) => {
                    const cell = row.cells[3];
                    if (!cell) return [];
                    const cellRect = cell.getBoundingClientRect();
                    const actionsRect = row.cells[5]?.getBoundingClientRect();
                    return [...cell.querySelectorAll('.member-account-values strong')]
                        .filter((node) => node.getClientRects().length)
                        .map((node) => {
                            const rect = node.getBoundingClientRect();
                            return {
                                text: node.textContent.trim(),
                                cellLeft: cellRect.left,
                                cellRight: cellRect.right,
                                textLeft: rect.left,
                                textRight: rect.right,
                                overlapsActions: Boolean(actionsRect && cellRect.right > actionsRect.left + 1 && cellRect.left < actionsRect.right - 1)
                            };
                        })
                        .filter((item) => item.textLeft < item.cellLeft - 2
                            || item.textRight > item.cellRight + 2
                            || item.overlapsActions);
                }));
                expect(accountCellTextOverflow, `account values stay inside their table cells at ${width}px ${locale} ${theme}`).toEqual([]);
            }

            if (isMobile) {
                const actionGroups = await page.locator('.members-mobile-card .members-mobile-actions').evaluateAll((groups) => groups.map((group) => Array.from(group.querySelectorAll('.table-action-visible:not([hidden]), .action-menu-toggle')).filter((node) => getComputedStyle(node).display !== 'none').map((node) => {
                    const rect = node.getBoundingClientRect();
                    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
                })));
                for (const actionBoxes of actionGroups) {
                    for (const action of actionBoxes) {
                        expect(action.width, `member action touch width at ${width}px`).toBeGreaterThanOrEqual(44);
                        expect(action.height, `member action touch height at ${width}px`).toBeGreaterThanOrEqual(44);
                    }
                    for (let index = 0; index < actionBoxes.length; index += 1) {
                        for (let next = index + 1; next < actionBoxes.length; next += 1) {
                            const a = actionBoxes[index];
                            const b = actionBoxes[next];
                            const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
                            const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
                            expect(overlapX > 0 && overlapY > 0, `mobile actions must not overlap at ${width}px ${locale} ${theme}`).toBe(false);
                        }
                    }
                }
            }

            const search = page.locator('#searchInput');
            await search.focus();
            await page.keyboard.press('Tab');
            const focus = await page.evaluate(() => ({
                id: document.activeElement?.id || '',
                isVisible: document.activeElement?.matches(':focus-visible') || false,
                outline: getComputedStyle(document.activeElement).outlineStyle,
                outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
                boxShadow: getComputedStyle(document.activeElement).boxShadow
            }));
            expect(focus.isVisible, `keyboard focus-visible after search ${width}px ${theme}`).toBe(true);
            expect(focus.outline !== 'none' || focus.outlineWidth !== '0px' || focus.boxShadow !== 'none').toBe(true);

            const screenshotPath = path.join(OUTPUT, `members-${width}-${theme}-${locale}.png`);
            // Capture the full viewport so the global shell, members heading,
            // and mobile action dock can be reviewed together.
            await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
            await page.screenshot({ path: screenshotPath, fullPage: false });

            if (isMobile) {
                const statusGroup = page.locator('.members-filter-tabs-row [data-filter-choices-for="statusFilter"]');
                const sortGroup = page.locator('.members-filter-tabs-row [data-filter-choices-for="sortFilter"]');
                await expect(page.locator('.members-filter-tabs-row')).toBeHidden();
                await expect(page.locator('#statusFilter')).toBeVisible();
                await expect(page.locator('#sortFilter')).toBeVisible();
                await expect(statusGroup.locator('[role="radio"]')).toHaveCount(5);
                await expect(sortGroup.locator('[role="radio"]')).toHaveCount(3);
                await page.locator('#statusFilter').selectOption('');
                await page.locator('#sortFilter').selectOption('expiry');
                await expect(page.locator('#statusFilter')).toHaveValue('');
                const statusOptions = await page.locator('#statusFilter option').allTextContents();
                expect(statusOptions).toEqual(locale === 'ar'
                    ? ['كل الحالات', 'نشطة', 'قريبة الانتهاء', 'منتهية', 'مجمدة']
                    : ['All statuses', 'Active', 'Expiring soon', 'Expired', 'Frozen']);
                await page.locator('#statusFilter').selectOption('active');
                await expect(page.locator('#statusFilter')).toHaveValue('active');
                await expect(statusGroup.locator('[data-filter-value="active"]')).toHaveAttribute('aria-checked', 'true');
                const sortOptions = await page.locator('#sortFilter option').allTextContents();
                expect(sortOptions).toEqual(locale === 'ar'
                    ? ['الأقرب انتهاءً', 'الأحدث تسجيلًا', 'الأعلى مبلغًا متبقيًا']
                    : ['Expiring soonest', 'Recently registered', 'Highest balance due']);
                await page.locator('#sortFilter').selectOption('remaining');
                await expect(page.locator('#sortFilter')).toHaveValue('remaining');
                await page.screenshot({ path: path.join(OUTPUT, `members-filters-${width}-${theme}-${locale}.png`) });
            }

            // Exercise every dialog at each responsive width in Arabic Light,
            // then capture English Dark at the smallest and largest targets.
            // The full list itself remains covered by the complete 7×2×2 matrix.
            const inspectDialogs = (locale === 'ar' && theme === 'light')
                || (width === 320 && locale === 'en' && theme === 'dark')
                || (width === 1440 && locale === 'en' && theme === 'dark');
            if (inspectDialogs) {
            // These are presentation-only openings; no form is submitted.
            await page.locator('#addMemberButton').click();
            const memberDialog = page.locator('#memberDialog');
            const addGeometry = await assertDialogFits(memberDialog, width, await page.evaluate(() => innerHeight), 'add member');
            await page.screenshot({ path: path.join(OUTPUT, `members-add-${width}-${theme}-${locale}.png`) });
            const addValueBeforeLocaleSwitch = await page.locator('#fullName').inputValue();
            if (locale === 'ar' && theme === 'light') {
                const arabicSnapshot = await memberDialog.evaluate((node) => ({
                    title: node.querySelector('#formTitle')?.textContent.trim(),
                    description: node.querySelector('#memberDialogDescription')?.textContent.trim(),
                    profileHeading: node.querySelector('#memberProfileSectionTitle')?.textContent.trim(),
                    fieldLabels: [...node.querySelectorAll('.member-form-section label')].map((item) => item.textContent.trim()),
                    actions: [...node.querySelectorAll('.form-actions button')].map((item) => item.textContent.trim())
                }));
                await page.evaluate(() => window.TopGymI18n.set('en'));
                const englishSnapshot = await memberDialog.evaluate((node) => ({
                    title: node.querySelector('#formTitle')?.textContent.trim(),
                    description: node.querySelector('#memberDialogDescription')?.textContent.trim(),
                    profileHeading: node.querySelector('#memberProfileSectionTitle')?.textContent.trim(),
                    fieldLabels: [...node.querySelectorAll('.member-form-section label')].map((item) => item.textContent.trim()),
                    actions: [...node.querySelectorAll('.form-actions button')].map((item) => item.textContent.trim())
                }));
                const unchanged = Object.keys(arabicSnapshot).filter((key) => JSON.stringify(arabicSnapshot[key]) === JSON.stringify(englishSnapshot[key]));
                dialogLocaleAudits.push({ viewport: width, theme, arabic: arabicSnapshot, english: englishSnapshot, unchangedVisibleLabelGroups: unchanged });
                expect(await page.locator('#fullName').inputValue(), 'language switch must not change form data').toBe(addValueBeforeLocaleSwitch);
                await page.evaluate(() => window.TopGymI18n.set('ar'));
            }
            if (width <= 390) {
                expect(addGeometry.height, `add dialog fits short mobile viewport at ${width}px`).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
            }
            await page.locator('#memberDialogClose').click();
            await expect(memberDialog).toBeHidden();

            await openVisibleMemberAction(page, 'edit');
            const editGeometry = await assertDialogFits(memberDialog, width, await page.evaluate(() => innerHeight), 'edit member');
            await expect(page.locator('#fullName')).toHaveValue(MEMBERS[0].fullName);
            if (width <= 380) {
                const editHeaderTargets = await page.evaluate(() => {
                    const close = document.querySelector('#memberDialogClose').getBoundingClientRect();
                    const cancel = document.querySelector('#cancelEditButton').getBoundingClientRect();
                    return { close: { left: close.left, right: close.right, top: close.top, bottom: close.bottom }, cancel: { left: cancel.left, right: cancel.right, top: cancel.top, bottom: cancel.bottom } };
                });
                const overlapX = Math.min(editHeaderTargets.close.right, editHeaderTargets.cancel.right) - Math.max(editHeaderTargets.close.left, editHeaderTargets.cancel.left);
                const overlapY = Math.min(editHeaderTargets.close.bottom, editHeaderTargets.cancel.bottom) - Math.max(editHeaderTargets.close.top, editHeaderTargets.cancel.top);
                expect(overlapX > 0 && overlapY > 0, `edit cancel and close targets do not overlap at ${width}px`).toBe(false);
            }
            await page.screenshot({ path: path.join(OUTPUT, `members-edit-${width}-${theme}-${locale}.png`) });
            if (width <= 390) {
                expect(editGeometry.height, `edit dialog fits short mobile viewport at ${width}px`).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
            }
            await page.locator('#memberDialogClose').click();
            await expect(memberDialog).toBeHidden();

            // A fresh route load isolates native dialog lifecycle between
            // locale/theme cases; the production close bridge can leave a
            // legacy hidden marker after its second close handler runs.
            await page.goto(`/index.html?membersV2Details=${width}-${theme}-${locale}#members`, { waitUntil: 'networkidle' });
            await installCurrentMembersStyles(page, membersCssSource);
            await expect(page.locator('#membersList')).toContainText(MEMBERS[0].fullName);
            await page.evaluate((value) => window.TopGymI18n.set(value), locale);
            await page.evaluate((mode) => window.TopGymTheme.set(mode), theme);
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
            await expect.poll(() => page.locator('html').getAttribute('data-theme')).toBe(theme);
            await openVisibleMemberAction(page, 'details');
            const detailsDialog = page.locator('#detailsDialog');
            await expect(detailsDialog.locator('#detailsTitle')).toContainText(MEMBERS[0].fullName);
            await assertDialogFits(detailsDialog, width, await page.evaluate(() => innerHeight), 'member details');
            await page.screenshot({ path: path.join(OUTPUT, `members-details-${width}-${theme}-${locale}.png`) });
            if (locale === 'ar' && theme === 'light') {
                const arabicDetails = await detailsDialog.evaluate((node) => ({
                    close: node.querySelector('#detailsClose')?.textContent.trim(),
                    closeAccessible: node.querySelector('#detailsClose')?.getAttribute('aria-label'),
                    badge: node.querySelector('#detailsMemberBadge')?.textContent.trim(),
                    sectionHeadings: [...node.querySelectorAll('#detailsContent h4')].map((item) => item.textContent.trim()),
                    memberName: node.querySelector('#detailsTitle')?.textContent.trim()
                }));
                await page.evaluate(() => window.TopGymI18n.set('en'));
                const englishDetails = await detailsDialog.evaluate((node) => ({
                    close: node.querySelector('#detailsClose')?.textContent.trim(),
                    closeAccessible: node.querySelector('#detailsClose')?.getAttribute('aria-label'),
                    badge: node.querySelector('#detailsMemberBadge')?.textContent.trim(),
                    sectionHeadings: [...node.querySelectorAll('#detailsContent h4')].map((item) => item.textContent.trim()),
                    interfaceLabels: [...node.querySelectorAll([
                        '.member-details-overview-heading span', '.member-details-overview-heading small',
                        '.member-detail-stat-copy small', '.member-detail-stat-copy em',
                        '.member-details-actions h4', '.member-details-action span', '.member-details-more-menu button span',
                        '.member-details-tabs button', '.member-details-overview-financial span',
                        '.member-detail-attendance h4', '.member-detail-attendance-state strong', '.member-detail-attendance-times span',
                        '.member-scope-details h4', '.member-scope-details span', '.member-store-purchases h4',
                        '.member-store-purchases th', '.member-store-purchases-kicker', '.details-section h4', '.details-section th',
                        '.details-summary-card > span', '.history-table th', '.history-table .badge', '.payment-history-section h4',
                        '.financial-summary-card span', '.membership-portal-code-kicker', '.membership-portal-code-card h4',
                        '.membership-portal-code-card p', '.membership-portal-code-status', '.membership-portal-code-value > span',
                        '.membership-portal-code-actions button'
                    ].join(','))].map((item) => item.textContent.trim()).filter(Boolean),
                    memberName: node.querySelector('#detailsTitle')?.textContent.trim()
                }));
                dialogLocaleAudits.push({ viewport: width, theme, surface: 'details', arabic: arabicDetails, english: englishDetails });
                expect(englishDetails.memberName, 'locale switch must preserve member data').toBe(arabicDetails.memberName);
                expect(englishDetails.close).toBe('Close');
                expect(englishDetails.closeAccessible).toBe('Close member details');
                expect(englishDetails.badge).toBe('Active');
                expect(englishDetails.sectionHeadings.every((heading) => !/[\u0621-\u064a]/.test(heading)), 'English details headings must not leave Arabic UI labels untranslated').toBe(true);
                expect(englishDetails.interfaceLabels.filter((label) => /[\u0621-\u064a]/.test(label)), 'English member detail interface labels must not remain Arabic').toEqual([]);
                await page.evaluate(() => window.TopGymI18n.set('ar'));
            }
            await page.locator('#detailsClose').click();
            await expect(detailsDialog).toBeHidden();
            }
          }
        }
    }

    expect(requests.filter(({ method }) => !['GET', 'HEAD', 'OPTIONS'].includes(method)), 'visual fixtures must not issue mutations').toEqual([]);
    expect(requests.some(({ pathname }) => pathname === '/api/members'), 'member list is rendered from the read-only fixture').toBe(true);
    expect(pageErrors, 'Members visual matrix must not produce uncaught browser page errors').toEqual([]);
    await fs.writeFile(path.join(OUTPUT, 'fixture-evidence.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        viewports: WIDTHS,
        themes: THEMES,
        locales: LOCALES,
        fixtureMemberCount: MEMBERS.length,
        requestCount: requests.length,
        mutations: 0
    }, null, 2), 'utf8');
    await fs.writeFile(path.join(OUTPUT, 'dialog-locale-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), audits: dialogLocaleAudits }, null, 2), 'utf8');
});

test('member list presents the newest recorded membership snapshot without changing the operational membership', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One deterministic browser captures the membership record matrix.');
    test.setTimeout(180_000);
    const fixtures = MEMBERS.map((member) => structuredClone(member));
    fixtures[0] = {
        ...fixtures[0],
        membership: { ...fixtures[0].membership, id: 1731, status: 'active', startDate: '2026-10-01', effectiveEndDate: '2026-11-12' },
        latestRecordedMembership: { id: 2731, plan: 'gym_cardio', type: 'quarterly', status: 'expired', startDate: '2026-07-20', endDate: '2026-08-20', effectiveEndDate: '2026-08-20', daysRemaining: -58, freezeCount: 0, freezeLimit: 3, amountPaid: 250, amountRemaining: 150 }
    };
    fixtures[1] = { ...fixtures[1], latestRecordedMembership: { ...fixtures[1].membership, id: 1732 } };
    fixtures[2] = { ...fixtures[2], latestRecordedMembership: { ...fixtures[2].membership, id: 1733, status: 'expired' } };
    fixtures[3] = { ...fixtures[3], latestRecordedMembership: { ...fixtures[3].membership, id: 1734, status: 'active', startDate: '2027-01-01', endDate: '2027-02-01', effectiveEndDate: '2027-02-01', daysRemaining: 107 } };
    fixtures.push({ ...memberFixture(735, 'عضو بلا اشتراك', 'expired'), membership: null, latestRecordedMembership: null });
    fixtures.push({ ...memberFixture(736, 'اشتراك بلا تاريخ متاح', 'expired'), latestRecordedMembership: { id: 2736, plan: 'gym_only', type: 'monthly', status: 'expired', startDate: null, endDate: null, effectiveEndDate: null, daysRemaining: null, freezeCount: 0, freezeLimit: 3, amountPaid: 0, amountRemaining: 0 } });
    await installReadOnlyMemberFixtures(page, fixtures);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const membersCssSource = await fs.readFile(path.join(process.cwd(), 'public/css/pages/members.css'), 'utf8');
    await fs.mkdir(OUTPUT, { recursive: true });
    await page.addInitScript(() => {
        localStorage.setItem('logic-fit-ui-locale', 'ar');
        localStorage.setItem('topgym-theme', 'light');
    });

    for (const width of [320, 360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/index.html?membersLastRecorded=${width}#members`, { waitUntil: 'networkidle' });
        await installCurrentMembersStyles(page, membersCssSource);
        const mobile = width < 768;
        const firstMember = mobile ? page.locator('.members-mobile-card[data-member-id="731"]') : page.locator('.members-table tbody tr[data-member-id="731"]');
        await expect(firstMember).toContainText('جيم وكارديو');
        await expect(firstMember).toContainText('ربع سنوية');
        await expect(firstMember).toContainText('20/07/2026');
        await expect(firstMember).toContainText('20/08/2026');
        await expect(firstMember).toContainText('منتهية');
        const accountValues = await firstMember.locator('.members-mobile-account-values strong, .member-account-values strong').allTextContents();
        const normalizedAccountValues = accountValues.join(' ').replace(/[٠-٩]/gu, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
        expect(normalizedAccountValues).toContain('250');
        expect(normalizedAccountValues).toContain('150');
        await expect(page.locator(mobile ? '.members-mobile-card[data-member-id="735"]' : '.members-table tbody tr[data-member-id="735"]')).toContainText('بدون اشتراك');
        const missingDatesMember = page.locator(mobile ? '.members-mobile-card[data-member-id="736"]' : '.members-table tbody tr[data-member-id="736"]');
        await expect(missingDatesMember.locator('.membership-date time')).toHaveText(['غير متاح', 'غير متاح']);
        await expect(missingDatesMember).not.toContainText('منتهية منذ 0 يوم');
        const isoDateAudit = await firstMember.locator('time').evaluateAll((nodes) => nodes.map((node) => ({ dir: node.getAttribute('dir'), datetime: node.getAttribute('datetime'), text: node.textContent.trim() })));
        expect(isoDateAudit).toEqual([
            { dir: 'ltr', datetime: '2026-07-20', text: '20/07/2026' },
            { dir: 'ltr', datetime: '2026-08-20', text: '20/08/2026' }
        ]);
        if (!mobile) {
            const headers = await page.locator('.members-table thead th').allTextContents();
            expect(headers.slice(0, 3)).toEqual(['العضو', 'آخر اشتراك', 'الحالة']);
            expect(headers[3]).toBe(await page.evaluate(() => window.TopGymI18n.t('members.card.accountLatest')));
            expect(headers.slice(4)).toEqual(['تجميد العضو', 'الإجراءات']);
            await expect(firstMember.locator('.status-badge-with-icon')).toHaveClass(/expired/);
            await expect(firstMember.locator('.member-freeze-cell')).toContainText('إجمالي سجلاته');
            await expect(firstMember.locator('.member-freeze-cell > strong')).toHaveCount(0);
            await expect(firstMember.locator('.freeze-usage')).toContainText('المستخدم');
            await expect(firstMember.locator('.freeze-usage bdi[dir="ltr"]').first()).toContainText('من');
            await expect(firstMember.locator('.freeze-usage')).toContainText('مرات');
            const freezeAction = firstMember.locator('[data-action="freeze"]');
            await expect(freezeAction).toHaveCount(1);
            const actionsMenu = firstMember.locator('.action-menu-toggle');
            if (await actionsMenu.count()) {
                await actionsMenu.click();
                await expect(freezeAction).toBeVisible();
                await actionsMenu.click();
            }
        } else {
            await expect(firstMember.locator('.members-mobile-date-grid .membership-date')).toHaveCount(2);
            await expect(firstMember.locator('.members-mobile-actions [data-action="renew"]')).toBeVisible();
            await expect(firstMember.locator('.members-mobile-actions [data-action="details"]')).toBeVisible();
            await expect(firstMember.locator('.members-mobile-actions .action-menu-toggle')).toBeVisible();
            await expect(firstMember.locator('.members-mobile-freeze .freeze-usage bdi[dir="ltr"]')).toHaveCount(2);
            const freezeColumns = await firstMember.locator('.members-mobile-freeze .freeze-usage').evaluate((node) => getComputedStyle(node).gridTemplateColumns);
            expect(freezeColumns.trim().split(/\s+/)).toHaveLength(2);
            const codeGeometry = await firstMember.locator('.member-code-preview b').evaluate((node) => {
                const box = node.getBoundingClientRect();
                const parent = node.parentElement.getBoundingClientRect();
                return { code: box.width, parent: parent.width, title: node.title, text: node.textContent };
            });
            expect(codeGeometry.code).toBeLessThanOrEqual(codeGeometry.parent);
            expect(codeGeometry.title).toBe(codeGeometry.text);
            const actionOrder = await firstMember.locator('.members-mobile-actions [data-action="renew"], .members-mobile-actions [data-action="details"], .members-mobile-actions .action-menu-toggle').evaluateAll((nodes) => nodes.map((node) => ({ action: node.dataset.action || 'more', x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
            expect(actionOrder.find(({ action }) => action === 'renew').x).toBeGreaterThan(actionOrder.find(({ action }) => action === 'details').x);
            expect(actionOrder.find(({ action }) => action === 'details').x).toBeGreaterThan(actionOrder.find(({ action }) => action === 'more').x);
            const actionY = actionOrder.map(({ y }) => y);
            expect(Math.max(...actionY) - Math.min(...actionY)).toBeLessThanOrEqual(1);
            const geometry = await page.evaluate(() => ({
                document: document.documentElement.scrollWidth,
                body: document.body.scrollWidth,
                viewport: innerWidth,
                dateRects: [...document.querySelectorAll('.members-mobile-card[data-member-id="731"] time')].map((node) => {
                    const rect = node.getBoundingClientRect();
                    return { left: rect.left, right: rect.right, width: rect.width, scroll: node.scrollWidth };
                })
            }));
            expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
            expect(geometry.body).toBeLessThanOrEqual(geometry.viewport);
            expect(geometry.dateRects.every((rect) => rect.width > 0 && rect.scroll <= rect.width + 1)).toBe(true);
        }
        await firstMember.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        if (width === 390 || width === 1440) {
            if (mobile) {
                await firstMember.evaluate((card) => {
                    const bottom = card.getBoundingClientRect().bottom;
                    window.scrollBy(0, Math.max(0, bottom - (window.innerHeight - 104)));
                });
            }
            await firstMember.screenshot({ path: path.join(OUTPUT, `members-last-recorded-${width}-ar-light.png`), animations: 'disabled' });
        }

        for (const locale of ['ar', 'en']) {
            await page.evaluate((value) => window.TopGymI18n.set(value), locale);
            await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
            await expect(firstMember.locator('.members-mobile-subscription-title, .member-subscription-title')).toContainText(locale === 'ar' ? 'جيم وكارديو · ربع سنوية' : 'Gym and cardio · Quarterly');
            await expect(firstMember).toContainText('20/07/2026');
            await expect(firstMember).toContainText('20/08/2026');
            const dateLabels = await firstMember.locator('.membership-date small').allTextContents();
            expect(dateLabels).toEqual(locale === 'ar' ? ['البداية', 'النهاية'] : ['Start', 'End']);
            for (const theme of ['light', 'dark']) {
                await page.evaluate((value) => window.TopGymTheme.set(value), theme);
                await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
                const bounds = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
                expect(bounds.document).toBeLessThanOrEqual(bounds.width);
                expect(bounds.body).toBeLessThanOrEqual(bounds.width);
                if (width === 390 || width === 1440) {
                    if (mobile) {
                        await firstMember.evaluate((card) => {
                            const bottom = card.getBoundingClientRect().bottom;
                            window.scrollBy(0, Math.max(0, bottom - (window.innerHeight - 104)));
                        });
                    }
                    await firstMember.screenshot({ path: path.join(OUTPUT, `members-last-recorded-${width}-${locale}-${theme}.png`), animations: 'disabled' });
                }
            }
        }
    }
    expect(pageErrors).toEqual([]);
});

test('Members more-action menus stay reachable and within the viewport at responsive breakpoints', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'One deterministic browser captures the menu matrix.');
    test.setTimeout(120_000);

    const requests = await installReadOnlyMemberFixtures(page);
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const membersCssSource = await fs.readFile(path.join(process.cwd(), 'public/css/pages/members.css'), 'utf8');
    const states = [
        ...WIDTHS.map((width) => ({ width, locale: 'ar', theme: 'light' })),
        { width: 320, locale: 'en', theme: 'dark' },
        { width: 1440, locale: 'en', theme: 'dark' }
    ];
    await fs.mkdir(OUTPUT, { recursive: true });

    for (const { width, locale, theme } of states) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 1000 });
        await page.goto(`/index.html?membersV2Actions=${width}-${theme}-${locale}#members`, { waitUntil: 'networkidle' });
        await installCurrentMembersStyles(page, membersCssSource);
        await page.evaluate((value) => window.TopGymI18n.set(value), locale);
        await page.evaluate((mode) => window.TopGymTheme.set(mode), theme);
        await expect(page.locator('#membersList')).toContainText(MEMBERS[0].fullName);

        const toggle = page.locator('#membersList .action-menu-toggle:visible').first();
        await expect(toggle).toBeVisible();
        const touchTarget = await toggle.boundingBox();
        if (width < 768) {
            expect(touchTarget.width, `more-actions touch width ${width}px`).toBeGreaterThanOrEqual(44);
            expect(touchTarget.height, `more-actions touch height ${width}px`).toBeGreaterThanOrEqual(44);
        }
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const menu = page.locator('#membersList .action-menu-panel:not([hidden])').first();
        await expect(menu).toBeVisible();
        const menuBox = await menu.boundingBox();
        expect(menuBox.x, `more-actions menu left edge ${width}px`).toBeGreaterThanOrEqual(0);
        expect(menuBox.x + menuBox.width, `more-actions menu right edge ${width}px`).toBeLessThanOrEqual(width);
        expect(menuBox.y, `more-actions menu top edge ${width}px`).toBeGreaterThanOrEqual(0);
        expect(menuBox.y + menuBox.height, `more-actions menu bottom edge ${width}px`).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
        expect(await menu.locator('.action-menu-item').count(), `existing member actions available ${width}px`).toBeGreaterThan(0);
        await page.screenshot({ path: path.join(OUTPUT, `members-actions-${width}-${theme}-${locale}.png`) });
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
    }

    expect(requests.filter(({ method }) => !['GET', 'HEAD', 'OPTIONS'].includes(method)), 'action-menu QA must not issue mutations').toEqual([]);
    expect(pageErrors, 'Members action-menu matrix must not produce uncaught browser page errors').toEqual([]);
});
