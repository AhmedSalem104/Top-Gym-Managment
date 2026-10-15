const fs = require('node:fs/promises');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const ARTIFACTS = path.resolve(process.cwd(), 'qa/artifacts/coaching-v2-screen-continuation');
const VIEWPORTS = [320, 390, 768, 1024, 1440, 1920];

test.describe('Gym coaching and nutrition V2 visual continuation', () => {
    test('read-only route, profile and plan-builder surfaces fit all required viewports/themes', async ({ page }, testInfo) => {
        test.setTimeout(240_000);
        test.skip(testInfo.project.name !== 'desktop', 'The viewport/theme matrix runs once in the desktop project.');

        const mutations = [];
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        await page.route('**/*', async (route) => {
            const method = route.request().method();
            if (new URL(route.request().url()).pathname.startsWith('/api/')) {
                if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
                    mutations.push(`${method} ${route.request().url()}`);
                    await route.abort();
                    return;
                }
                await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
                return;
            }
            if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
                mutations.push(`${method} ${route.request().url()}`);
                await route.abort();
                return;
            }
            await route.continue();
        });

        await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
        await page.addStyleTag({ url: '/css/pages/trainees.css' });
        await page.addStyleTag({ url: '/css/pages/coaching.css' });
        await page.evaluate(async () => {
            document.documentElement.lang = 'ar';
            document.documentElement.dir = 'rtl';
            const stage = document.createElement('main');
            stage.className = 'page';
            stage.id = 'coachingV2QaStage';
            stage.style.cssText = 'width:calc(100% - 24px);max-width:1440px;margin-inline:auto;padding-block:16px;';

            const section = document.querySelector('#traineesSection')?.cloneNode(true);
            if (!section) throw new Error('The real Gym trainees route section was not found.');
            section.hidden = false;
            section.removeAttribute('hidden');
            section.style.display = 'grid';
            section.querySelector('#coachingSummary').innerHTML = `
                <article class="coaching-summary-card users"><span>المتدربون</span><strong>١٢</strong></article>
                <article class="coaching-summary-card workout"><span>برامج التدريب</span><strong>٨</strong></article>
                <article class="coaching-summary-card diet"><span>خطط التغذية</span><strong>٦</strong></article>
                <article class="coaching-summary-card progress"><span>متابعات هذا الأسبوع</span><strong>١٩</strong></article>`;
            section.querySelector('#externalTraineesList').innerHTML = `
                <article class="external-trainee-card">
                  <header class="external-trainee-card-head"><div class="external-trainee-primary"><span class="trainee-avatar">م</span><div><strong>محمد عبد الرحمن — اسم طويل لاختبار الالتفاف</strong><a dir="ltr">+20 100 123 4567</a><small dir="ltr">member-coaching-fixture-2046</small></div></div><span class="trainee-badge">نشط</span></header>
                  <div class="external-trainee-card-grid"><div class="external-trainee-system-item"><span class="system-type workout">تدريب</span><strong>برنامج قوة وتحمل متقدم</strong><small>٣ أيام تدريبية · يتضمن تفاصيل كثيرة للمراجعة</small><div class="external-trainee-system-actions"><button class="btn btn-light btn-small" type="button">عرض الخطة</button><button class="btn btn-light btn-small" type="button">تعديل</button></div></div><div class="external-trainee-system-item"><span class="system-type diet">تغذية</span><strong>خطة غذائية متوازنة</strong><small>٤ وجبات · ٢٢٠٠ سعرة يوميًا</small><div class="external-trainee-system-actions"><button class="btn btn-light btn-small" type="button">عرض الخطة</button><button class="btn btn-light btn-small" type="button">تعديل</button></div></div><div class="external-trainee-counts"><span class="external-trainee-count workout">٨ تمارين</span><span class="external-trainee-count diet">١٦ طعامًا</span></div></div>
                  <footer><button class="btn btn-primary btn-small" type="button">إضافة تدريب</button><button class="btn btn-light btn-small" type="button">فتح الملف</button><button class="btn btn-light btn-small" type="button">إضافة تغذية</button></footer>
                </article>`;
            stage.append(section);
            document.body.replaceChildren(stage);

            const response = await fetch('/dialogs/coaching.html');
            if (!response.ok) throw new Error('Unable to load the existing coaching dialogs.');
            const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
            for (const id of ['externalTraineeDialog', 'coachingProfileDialog', 'coachingBuilderDialog']) {
                const dialog = parsed.getElementById(id);
                if (dialog) document.body.append(dialog);
            }

            const profile = document.querySelector('#coachingProfileContent');
            for (const [id, value] of [
                ['externalFullName', 'متدرب تجريبي لمعاينة الواجهة'],
                ['externalPhone', '+201001234567'],
                ['externalEmail', 'qa.fixture@example.test'],
                ['externalRegistrationDate', '2026-10-12'],
                ['externalNotes', 'بيانات عرض اصطناعية فقط، ولا يتم حفظها أو إرسالها.']
            ]) {
                const field = document.getElementById(id);
                if (field) field.value = value;
            }
            profile.innerHTML = `
              <div class="coaching-profile-content">
                <header class="profile-hero"><span class="trainee-avatar large">م</span><div><strong>محمد عبد الرحمن — اسم طويل لاختبار المساحة</strong><span dir="ltr">+20 100 123 4567</span><small>ملف تدريب وتغذية</small></div><button class="btn btn-light" type="button">إغلاق الملف</button></header>
                <div class="profile-stats"><article><span>جلسات مكتملة</span><strong>١٢</strong></article><article><span>وجبات مسجلة</span><strong>٢٨</strong></article><article><span>قياسات</span><strong>٤</strong></article><article><span>نسبة الالتزام</span><strong>٨٨٪</strong></article></div>
                <div class="profile-actions"><button class="btn btn-primary" type="button">برنامج تدريب</button><button class="btn btn-light" type="button">خطة تغذية</button><button class="btn btn-light" type="button">بدء جلسة</button><button class="btn btn-light" type="button">تسجيل وجبة</button><button class="btn btn-light" type="button">قياس جديد</button></div>
                <section class="profile-section"><header class="profile-section-head"><h4>الأنظمة الحالية</h4><span>نظامان</span></header><article class="profile-system-card"><div><span class="system-type workout">برنامج تدريب</span><strong>برنامج القوة والتوازن — اسم طويل للتأكد من احتواء النص</strong><small>قوة · ١٢ تمرينًا · ٨ جلسات مكتملة</small></div><div><span class="system-status active">نشط</span><button class="btn btn-light btn-small" type="button">تعديل</button></div></article><article class="profile-system-card"><div><span class="system-type diet">برنامج تغذية</span><strong>خطة تغذية متوازنة طويلة المدى</strong><small>١٦ طعامًا · ٤ وجبات</small></div><div><span class="system-status paused">متوقف مؤقتًا</span><button class="btn btn-light btn-small" type="button">تعديل</button></div></article></section>
                <section class="profile-section"><header class="profile-section-head"><h4>القياسات والمتابعة</h4><span>٤ قياسات</span></header><div class="profile-table-wrap"><table class="profile-table"><thead><tr><th>التاريخ</th><th>الوزن</th><th>نسبة الدهون</th><th>ملاحظات</th><th>الإجراءات</th></tr></thead><tbody><tr><td>١٢ أكتوبر ٢٠٢٦</td><td>٨٢ كجم</td><td>١٨٪</td><td>قياس متابعة تجريبي للاختبار</td><td><button class="btn btn-light btn-small" type="button">عرض</button></td></tr></tbody></table></div></section>
              </div>`;
        });

        const snapshots = [
            { id: 'route', locator: '#coachingV2QaStage' },
            { id: 'new-trainee', locator: '#externalTraineeDialog' },
            { id: 'profile', locator: '#coachingProfileDialog', content: '#coachingProfileContent' },
            { id: 'workout-builder', locator: '#coachingBuilderDialog', content: '#coachingBuilderContent', mode: 'workout' },
            { id: 'nutrition-builder', locator: '#coachingBuilderDialog', content: '#coachingBuilderContent', mode: 'diet' }
        ];

        for (const theme of ['light', 'dark']) {
            for (const width of VIEWPORTS) {
                await page.setViewportSize({ width, height: width < 400 ? 800 : 960 });
                await page.evaluate((themeName) => {
                    document.documentElement.dataset.theme = themeName;
                    document.body.dataset.theme = themeName;
                }, theme);

                for (const surface of snapshots) {
                    const target = page.locator(surface.locator);
                    if (surface.id === 'route') {
                        await expect(target).toBeVisible();
                    } else if (surface.id === 'profile' || surface.id === 'new-trainee') {
                        await target.evaluate((dialog) => dialog.showModal());
                    } else {
                        await page.evaluate(({ mode }) => {
                            const dialog = document.querySelector('#coachingBuilderDialog');
                            dialog.classList.remove('builder-mode-workout', 'builder-mode-diet');
                            dialog.classList.add(`builder-mode-${mode}`);
                            const content = dialog.querySelector('#coachingBuilderContent');
                            const steps = ['البيانات الأساسية', 'تفاصيل الخطة', 'المراجعة والحفظ'];
                            dialog.querySelector('#coachingBuilderStepper').innerHTML = steps.map((label, index) => `<button type="button" class="builder-step ${index === 1 ? 'active' : index === 0 ? 'complete' : ''}" role="tab" aria-selected="${index === 1}"><span>${index + 1}</span><strong>${label}</strong></button>`).join('');
                            if (mode === 'workout') {
                                content.innerHTML = `<section class="builder-stage"><header class="builder-builder-head"><div><span>المرحلة الثانية</span><h4>تفاصيل برنامج التدريب</h4><p>بيانات خطة تجريبية للعرض فقط، تشمل أيام التدريب والتمارين.</p></div><button class="btn btn-primary btn-small" type="button">إضافة يوم</button></header><div class="builder-workout-metrics"><article><span>إجمالي التمارين</span><strong>١٢</strong></article><article><span>المجموعات</span><strong>٣٦</strong></article><article><span>الحجم التقريبي</span><strong>٤٨٠٠ <small>كجم</small></strong></article><article><span>الأيام</span><strong>٣</strong></article></div><div class="builder-day-tabs" role="tablist" aria-label="أيام البرنامج"><button class="builder-day-tab active" role="tab" aria-selected="true" type="button"><span>اليوم ١</span><b>تمارين الجزء العلوي</b><small>٤ تمارين</small></button><button class="builder-day-tab" role="tab" aria-selected="false" type="button"><span>اليوم ٢</span><b>تمارين الجزء السفلي</b><small>٤ تمارين</small></button><button class="builder-day-tab" role="tab" aria-selected="false" type="button"><span>اليوم ٣</span><b>لياقة واستشفاء</b><small>٤ تمارين</small></button></div><section class="builder-day-panel"><header class="builder-day-panel-head"><label>اسم اليوم<input value="تمارين الجزء العلوي"></label><button type="button" class="btn btn-light">حذف اليوم</button></header><div class="builder-exercise-table"><div class="builder-exercise-table-head"><span>#</span><span>التمرين</span><span>المجموعات</span><span>التكرارات</span><span>الوزن</span><span>الراحة</span></div><article class="builder-exercise-row"><span class="exercise-row-number">١</span><label class="exercise-select-field">التمرين<input value="ضغط صدر بالبار"></label><label>المجموعات<input value="٤"></label><label>التكرارات<input value="١٠"></label><label>الوزن<input value="٤٠"></label><label>الراحة<input value="٩٠"></label><button class="btn btn-light row-delete-button" type="button">حذف</button></article></div><label class="builder-row-note">ملاحظات اليوم<input value="زيادة الحمل تدريجيًا حسب القدرة"></label></section></section>`;
                            } else {
                                content.innerHTML = `<section class="builder-stage"><header class="builder-builder-head"><div><span>المرحلة الثانية</span><h4>تفاصيل خطة التغذية</h4><p>قيم الوجبات والمغذيات محفوظة ضمن بيانات الخطة الأصلية.</p></div><button class="btn btn-primary btn-small" type="button">إضافة وجبة</button></header><section class="builder-target-panel"><header class="builder-section-title"><div><span>الهدف اليومي</span><h4>السعرات والمغذيات</h4></div><span class="builder-ready-chip">القيم محسوبة</span></header><div class="target-grid"><label>السعرات المستهدفة<input value="٢٢٠٠"></label><label>البروتين<input value="١٤٠ جم"></label><label>الكربوهيدرات<input value="٢٦٠ جم"></label><label>الدهون<input value="٦٠ جم"></label></div><div class="nutrition-summary-head"><div><span>إجمالي اليوم</span><strong>١٨٥٠ <small>/ ٢٢٠٠ سعرة</small></strong></div><b>٨٤٪ مكتمل</b></div><div class="nutrition-total-progress"><i></i></div><div class="nutrition-macro-grid"><div><span>البروتين</span><strong>١٢٠ / ١٤٠ جم</strong><i><b></b></i></div><div><span>الكربوهيدرات</span><strong>٢٢٠ / ٢٦٠ جم</strong><i><b></b></i></div><div><span>الدهون</span><strong>٥٤ / ٦٠ جم</strong><i><b></b></i></div></div></section><article class="builder-meal-row"><header class="builder-meal-row-head"><div class="builder-meal-title"><span>١</span><div><strong>الإفطار</strong><small>وجبة صباحية · وصف طويل لاختبار تجاوب التخطيط</small></div></div><button type="button" class="btn btn-light">حذف الوجبة</button></header><div class="builder-meal-row-summary"><span>٦٢٠ سعرة</span><span>٣٢ جم بروتين</span><span>٧٠ جم كربوهيدرات</span><span>١٨ جم دهون</span></div><div class="builder-foods"><article class="builder-food-row"><label>الطعام<input value="شوفان بالحليب والفواكه"></label><label>الكمية<input value="١٥٠ جم"></label><label>السعرات<input value="٣٢٠"></label><label>البروتين<input value="١٨ جم"></label><button class="btn btn-light row-delete-button" type="button">حذف</button></article></div></article></section>`;
                            }
                            dialog.showModal();
                        }, { mode: surface.mode });
                    }

                    const geometry = await target.evaluate((element) => {
                        const rect = element.getBoundingClientRect();
                        const scrollRoot = element.matches('dialog') ? element.querySelector('.dialog-body') : element;
                        return {
                            left: rect.left,
                            right: rect.right,
                            top: rect.top,
                            bottom: rect.bottom,
                            visible: rect.width > 0 && rect.height > 0,
                            pageWidth: document.documentElement.scrollWidth,
                            stageWidth: document.querySelector('#coachingV2QaStage')?.clientWidth ?? null,
                            contentWidth: scrollRoot?.clientWidth ?? null,
                            contentScrollWidth: scrollRoot?.scrollWidth ?? null
                        };
                    });
                    expect(geometry.visible, `${surface.id} should be visibly laid out at ${width}px ${theme}`).toBeTruthy();
                    if (surface.id !== 'route') {
                        expect(geometry.left, `${surface.id} left edge should fit at ${width}px`).toBeGreaterThanOrEqual(-1);
                        expect(geometry.right, `${surface.id} right edge should fit at ${width}px`).toBeLessThanOrEqual(width + 1);
                    }
                    expect(geometry.pageWidth, `${surface.id} must not cause page overflow at ${width}px ${theme}`).toBeLessThanOrEqual(width);

                    if (surface.id === 'route') {
                        await page.locator('#coachingV2QaStage button:visible, #coachingV2QaStage a:visible').first().focus();
                        await page.keyboard.press('Tab');
                        const focused = await page.evaluate(() => Boolean(document.activeElement?.matches(':focus-visible')));
                        expect(focused, 'route actions should expose visible keyboard focus').toBeTruthy();
                    } else if (surface.id === 'profile' || surface.id === 'new-trainee') {
                        await page.keyboard.press('Tab');
                        const focused = await target.evaluate((dialog) => Boolean(dialog.querySelector(':focus-visible')));
                        expect(focused, 'profile dialog controls should expose visible keyboard focus').toBeTruthy();
                    } else {
                        const activeTab = target.locator('.builder-step[aria-selected="true"]');
                        await expect(activeTab).toHaveCount(1);
                        const dayOrNutritionTab = target.locator('.builder-day-tab[aria-selected="true"]');
                        if (surface.mode === 'workout') await expect(dayOrNutritionTab).toHaveCount(1);
                        await page.keyboard.press('Tab');
                        const focused = await target.evaluate((dialog) => Boolean(dialog.querySelector(':focus-visible')));
                        expect(focused, `${surface.id} controls should expose visible keyboard focus`).toBeTruthy();
                    }

                    await fs.mkdir(ARTIFACTS, { recursive: true });
                    await page.screenshot({ path: path.join(ARTIFACTS, `${surface.id}-${width}-${theme}.png`) });
                    await fs.writeFile(path.join(ARTIFACTS, `${surface.id}-${width}-${theme}.json`), JSON.stringify({ viewport: width, theme, direction: 'rtl', geometry }, null, 2));
                    if (surface.id !== 'route') await target.evaluate((dialog) => dialog.close());
                }
            }
        }

        expect(mutations, 'the visual fixture must not submit mutations').toEqual([]);
        expect(pageErrors, 'the visual fixture should remain free of uncaught runtime errors').toEqual([]);
    });
});
