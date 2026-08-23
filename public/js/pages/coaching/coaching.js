(() => {
    if (window.__topGymCoachingLoaded) return;
    window.__topGymCoachingLoaded = true;

    const $ = (id) => document.getElementById(id);
    const state = {
        trainees: [],
        pagination: null,
        page: 1,
        pageSize: 20,
        search: '',
        loaded: false,
        loadingKey: '',
        requestId: 0,
        abortController: null,
        catalog: { exercises: [], foods: [] },
        catalogPromise: null,
        builderClientsPromise: null,
        builder: null,
        profile: null
    };

    const STATUS_LABELS = { active: 'نشط', draft: 'مسودة', paused: 'متوقف', completed: 'مكتمل', archived: 'مؤرشف' };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function number(value, digits = 1) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toLocaleString('ar-EG', { maximumFractionDigits: digits }) : '—';
    }

    function today() {
        const date = new Date();
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
    }

    function openDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
    }

    function closeDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.close === 'function' && dialog.open) dialog.close();
        else dialog.removeAttribute('open');
    }

    async function requestJson(url, options = {}) {
        const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
        if (response.status === 204) return null;
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'تعذر تنفيذ الطلب.');
            Object.assign(error, data);
            throw error;
        }
        return data;
    }

    function notify(message, type = 'success') {
        if (['error', 'warning'].includes(type) && window.topGymShowDialogValidation?.(message, type)) return;
        if (window.Swal) {
            window.Swal.fire({ toast: true, position: 'top-start', icon: type === 'error' ? 'error' : 'success', title: message, showConfirmButton: false, timer: type === 'error' ? 5000 : 2800, customClass: { popup: 'coaching-alert' } });
            return;
        }
        const element = $('coachingMessage');
        if (!element) return;
        element.textContent = message;
        element.className = `coaching-message ${type}`;
        element.hidden = false;
        window.clearTimeout(notify.timer);
        notify.timer = window.setTimeout(() => { element.hidden = true; }, 4000);
    }

    async function ensureCoachingPrintFeature() {
        if (window.topGymPrint?.printCoachingSystem) return window.topGymPrint;
        if (!window.topGymEnsureTab) throw new Error('أداة الطباعة غير جاهزة حاليًا.');
        await window.topGymEnsureTab('print');
        if (!window.topGymPrint?.printCoachingSystem) throw new Error('تعذر تحميل أداة الطباعة.');
        return window.topGymPrint;
    }

    async function runCoachingPrintAction(action, id, type) {
        const printWindow = action === 'print' ? window.open('', '_blank', 'width=980,height=820') : null;
        if (action === 'print' && !printWindow) {
            notify('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة.', 'error');
            return;
        }
        try {
            const printer = await ensureCoachingPrintFeature();
            if (action === 'pdf') return printer.downloadCoachingPdf(id, type);
            return printer.printCoachingSystem(id, type, printWindow);
        } catch (error) {
            printWindow?.close();
            notify(error.message || 'تعذر تنفيذ الطباعة.', 'error');
        }
    }

    async function runCoachingOverviewPrintAction(action, memberId) {
        const printWindow = action === 'print' ? window.open('', '_blank', 'width=980,height=820') : null;
        if (action === 'print' && !printWindow) {
            notify('يرجى السماح بالنوافذ المنبثقة لإتمام الطباعة.', 'error');
            return;
        }
        try {
            const printer = await ensureCoachingPrintFeature();
            if (action === 'pdf') return printer.downloadCoachingOverviewPdf(memberId);
            return printer.printCoachingOverview(memberId, printWindow);
        } catch (error) {
            printWindow?.close();
            notify(error.message || 'تعذر تنفيذ طباعة الملف.', 'error');
        }
    }

    function setLoading(element, message = 'جاري التحميل…') {
        if (element) element.innerHTML = `<div class="loading">${message}</div>`;
    }

    function coachingIcon(name) {
        const paths = {
            users: '<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="7" r="3"/><path d="M16 6.5a3 3 0 0 1 0 5.8M18 15.2a3.5 3.5 0 0 1 2 3.3V20"/>',
            workout: '<path d="M6 7v10M18 7v10M3 9v6M21 9v6M6 12h12"/><path d="M8 5v14M16 5v14"/>',
            diet: '<path d="M4 15.5C4 11.4 7.1 8 11 8s7 3.4 7 7.5c0 1.4-1.1 2.5-2.5 2.5h-9C5.1 18 4 16.9 4 15.5Z"/><path d="M11 8c0-2 1.1-3.5 3-4M8 12h8M7 15h7"/>',
            progress: '<path d="M4 19V5M4 19h16"/><path d="m7 15 3-4 3 2 5-7"/><circle cx="18" cy="6" r="1"/>',
            calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
            ruler: '<path d="m4 20 16-16M7 17l-2-2M10 14l-2-2M13 11l-2-2M16 8l-2-2M19 5l-2-2"/>',
            more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
            profile: '<circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0"/>',
            trash: '<path d="M4 7h16M10 11v5M14 11v5M6 7l1 13h10l1-13M9 7l1-3h4l1 3"/>'
        };
        return `<svg class="coaching-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
    }

    function traineeSkeleton() {
        return `<div class="coaching-skeleton-list" aria-hidden="true">${Array.from({ length: 3 }, () => '<div class="coaching-skeleton-row"><span></span><i></i><b></b><em></em></div>').join('')}</div>`;
    }

    function closeTraineeMoreMenus() {
        document.querySelectorAll('#externalTraineesList .trainee-more-menu:not([hidden])').forEach((panel) => {
            panel.hidden = true;
            panel.classList.remove('is-floating');
            panel.style.removeProperty('top');
            panel.style.removeProperty('left');
            panel.closest('.trainee-more')?.querySelector('[data-coaching-action="toggle-more"]')?.setAttribute('aria-expanded', 'false');
        });
    }

    function positionTraineeMoreMenu(menu, panel) {
        if (!menu || !panel || panel.hidden) return;
        const toggle = menu.querySelector('[data-coaching-action="toggle-more"]');
        if (!toggle) return;
        const toggleRect = toggle.getBoundingClientRect();
        const panelWidth = panel.offsetWidth || 210;
        const panelHeight = panel.offsetHeight || 180;
        const padding = 8;
        const left = Math.min(
            Math.max(padding, toggleRect.right - panelWidth),
            Math.max(padding, window.innerWidth - panelWidth - padding)
        );
        const opensDown = toggleRect.bottom + panelHeight + padding <= window.innerHeight;
        const top = opensDown
            ? toggleRect.bottom + padding
            : Math.max(padding, toggleRect.top - panelHeight - padding);
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(top)}px`;
    }

    function repositionTraineeMoreMenus() {
        document.querySelectorAll('#externalTraineesList .trainee-more-menu.is-floating:not([hidden])').forEach((panel) => {
            positionTraineeMoreMenu(panel.closest('.trainee-more'), panel);
        });
    }

    function shouldFloatTraineeMoreMenu() {
        /*
         * Keep the menu inside its action cell on wide tables. A fixed menu is
         * useful only when the table is constrained by a viewport/scroll
         * container; on desktop it creates a visual layer over adjacent rows.
         */
        return window.matchMedia('(max-width: 1199px)').matches;
    }

    // The legacy delete action is kept intact and moved into a compact menu after
    // rendering, so its API contract and current delete handler remain unchanged.
    function enhanceTraineeActionMenus() {
        const container = $('externalTraineesList');
        if (!container) return;
        container.querySelectorAll('.external-trainee-actions-cell').forEach((cell) => {
            const actions = cell.querySelector('.trainee-actions');
            if (!actions || actions.querySelector('.trainee-more')) return;
            const actionIcons = { workout: 'workout', profile: 'profile', diet: 'diet' };
            Array.from(actions.children).forEach((button) => {
                const iconName = actionIcons[button.dataset.coachingAction];
                if (!iconName || button.querySelector('.coaching-inline-icon')) return;
                button.classList.add('coaching-icon-action', `coaching-action-${iconName}`);
                button.innerHTML = coachingIcon(iconName);
            });
            const legacyDeleteActions = cell.querySelector('.trainee-diet-actions');
            const menu = document.createElement('div');
            menu.className = 'trainee-more';
            const toggle = document.createElement('button');
            toggle.className = 'btn btn-light btn-small trainee-more-toggle';
            toggle.type = 'button';
            toggle.setAttribute('aria-haspopup', 'menu');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'المزيد من الإجراءات');
            toggle.title = 'المزيد من الإجراءات';
            toggle.dataset.coachingAction = 'toggle-more';
            toggle.dataset.id = cell.closest('tr')?.dataset.traineeId || '';
            toggle.classList.add('coaching-icon-action', 'coaching-action-more');
            toggle.innerHTML = coachingIcon('more');

            const panel = document.createElement('div');
            panel.className = 'trainee-more-menu action-menu-panel';
            panel.setAttribute('role', 'menu');
            panel.hidden = true;
            if (legacyDeleteActions?.children.length) {
                Array.from(legacyDeleteActions.children).forEach((item) => {
                    item.setAttribute('role', 'menuitem');
                    item.insertAdjacentHTML('afterbegin', coachingIcon('trash'));
                    panel.append(item);
                });
            } else {
                const empty = document.createElement('span');
                empty.className = 'trainee-more-empty';
                empty.textContent = 'لا توجد خطة تغذية للحذف';
                panel.append(empty);
            }
            legacyDeleteActions?.remove();
            menu.append(toggle, panel);
            actions.append(menu);
        });
    }

    async function confirmAction(title, text, confirmText = 'نعم، احذف') {
        if (window.Swal) {
            const result = await window.Swal.fire({
                position: 'center',
                icon: 'warning',
                title,
                text,
                showCancelButton: true,
                confirmButtonText: confirmText,
                cancelButtonText: 'إلغاء',
                buttonsStyling: false,
                customClass: { popup: 'top-gym-alert delete-confirm-alert', confirmButton: 'btn btn-danger', cancelButton: 'btn btn-light' }
            });
            return result.isConfirmed;
        }
        return window.confirm(`${title}\n${text}`);
    }

    async function deleteDietPlan(planId, memberId = state.profile?.member?.id) {
        if (!planId) return;
        const confirmed = await confirmAction('تأكيد حذف خطة التغذية', 'سيتم حذف الخطة ووجباتها وتسجيلاتها المرتبطة بها نهائيًا.');
        if (!confirmed) return;
        try {
            await requestJson(`/api/dietplans/${encodeURIComponent(planId)}`, { method: 'DELETE' });
            notify('تم حذف خطة التغذية بنجاح.');
            window.dispatchEvent(new CustomEvent('topgym:coaching-data-changed', { detail: { type: 'diet-deleted', memberId: Number(memberId || 0) } }));
        } catch (error) {
            notify(error.message, 'error');
        }
    }

    function itemName(item) { return item?.nameAr || item?.name || item?.nameEn || 'عنصر بدون اسم'; }

    function exerciseImage(item, phase = 'main', options = {}) {
        if (window.TopGymExerciseAssets?.imageMarkup) return window.TopGymExerciseAssets.imageMarkup(item, phase, options);
        return `<span class="exercise-media exercise-media-fallback ${escapeHtml(options.className || '')}" aria-hidden="true"><span class="exercise-media-fallback-icon">${escapeHtml(item?.icon || '🏋️')}</span></span>`;
    }

    function muscleImage(item, options = {}) {
        if (window.TopGymMuscleAssets?.imageMarkup) return window.TopGymMuscleAssets.imageMarkup(item, 'main', options);
        return `<span class="muscle-media muscle-media-fallback ${escapeHtml(options.className || '')}" aria-hidden="true"><span class="muscle-media-fallback-icon">💪</span></span>`;
    }

    async function loadCatalog() {
        if (state.catalog.exercises.length && state.catalog.foods.length) {
            return state.catalog;
        }
        if (state.catalogPromise) return state.catalogPromise;
        state.catalogPromise = (async () => {
            const catalog = await requestJson('/api/coaching/catalog');
            state.catalog.exercises = catalog.exercises || [];
            state.catalog.foods = catalog.foods || [];
            return state.catalog;
        })();
        try {
            return await state.catalogPromise;
        } finally {
            state.catalogPromise = null;
        }
    }

    function activateCoachingSummary() {
        const summary = $('coachingSummary');
        if (!summary) return;
        const workoutCount = state.trainees.reduce((sum, item) => sum + Number(item.workoutCount || 0), 0);
        const dietCount = state.trainees.reduce((sum, item) => sum + Number(item.dietCount || 0), 0);
        const measurements = state.trainees.reduce((sum, item) => sum + Number(item.measurementCount || 0), 0);
        const total = state.pagination?.total ?? state.trainees.length;
        summary.innerHTML = [
            ['المتدربون الخارجيون', total, 'users', 'عملاء بدون عضوية فعالة'],
            ['برامج التدريب', workoutCount, 'workout', 'أنظمة محفوظة'],
            ['خطط التغذية', dietCount, 'diet', 'خطط محفوظة'],
            ['سجلات القياسات', measurements, 'progress', 'متابعة محفوظة']
        ].map(([label, value, tone, caption]) => `<article class="coaching-summary-card ${tone}"><span class="coaching-summary-icon">${coachingIcon(tone)}</span><div class="coaching-summary-copy"><span>${label}</span><strong>${number(value, 0)}</strong><small>${caption}</small></div></article>`).join('');
        const badge = $('externalTraineeCountBadge');
        if (badge) {
            badge.textContent = `${number(total, 0)} متدرب`;
            badge.hidden = false;
        }
    }

    function renderTrainees() {
        const container = $('externalTraineesList');
        if (!container) return;
        if (!state.trainees.length) {
            const hasSearch = Boolean(state.search.trim());
            container.innerHTML = hasSearch
                ? '<div class="coaching-empty coaching-empty-search"><strong>لا يوجد متدربون مطابقون لبحثك</strong><span>جرّب البحث باسم آخر أو رقم هاتف مختلف.</span><button class="btn btn-light btn-small" type="button" data-coaching-action="clear-search">مسح البحث</button></div>'
                : '<div class="coaching-empty"><strong>لا يوجد متدربون خارجيون حاليًا</strong><span>أضف متدربًا، ثم أنشئ له برنامج تدريب أو خطة تغذية ليظهر هنا.</span></div>';
            activateCoachingSummary();
            return;
        }
        const rows = state.trainees.map((trainee) => {
            const dietPlans = (trainee.dietPlans || []).map((plan) => `<span class="external-trainee-diet-plan"><span><strong title="${escapeHtml(plan.name)}">${escapeHtml(plan.name)}</strong><small>${number(plan.targetCalories, 0)} سعر</small></span></span>`).join('');
            const dietDeleteActions = (trainee.dietPlans || []).map((plan) => `<button class="btn btn-danger btn-small trainee-diet-delete" type="button" title="حذف خطة التغذية: ${escapeHtml(plan.name)}" aria-label="حذف خطة التغذية ${escapeHtml(plan.name)}" data-coaching-action="delete-diet" data-id="${plan.id}" data-member-id="${trainee.id}">حذف تغذية</button>`).join('');
            return `<tr data-trainee-id="${trainee.id}">
            <td class="trainee-cell"><div class="external-trainee-primary"><div class="trainee-avatar">${escapeHtml((trainee.fullName || 'م').trim().slice(0, 1))}</div><div><strong title="${escapeHtml(trainee.fullName)}">${escapeHtml(trainee.fullName)}</strong><a href="tel:${escapeHtml(trainee.phone)}" dir="ltr">${escapeHtml(trainee.phone)}</a>${trainee.email ? `<small title="${escapeHtml(trainee.email)}" dir="ltr">${escapeHtml(trainee.email)}</small>` : ''}</div></div></td>
            <td class="trainee-type-cell"><span class="trainee-badge">خارجي</span></td>
            <td class="trainee-systems-cell"><div class="external-trainee-systems"><div class="external-trainee-counts"><span class="external-trainee-count workout"><span class="external-trainee-count-icon">${coachingIcon('workout')}</span><b>${number(trainee.workoutCount, 0)}</b><span>تدريب</span></span><span class="external-trainee-count diet"><span class="external-trainee-count-icon">${coachingIcon('diet')}</span><b>${number(trainee.dietCount, 0)}</b><span>تغذية</span></span></div><div class="external-trainee-diet-list">${dietPlans ? `<span class="external-trainee-diet-list-title">الخطة الحالية</span>${dietPlans}` : '<span class="external-trainee-no-diet">لا توجد خطة تغذية</span>'}</div></div></td>
            <td class="trainee-measurements-cell"><div class="external-trainee-compact-metric">${coachingIcon('ruler')}<span><strong>${number(trainee.measurementCount, 0)}</strong><small>${Number(trainee.measurementCount || 0) > 0 ? 'قياس محفوظ' : 'لا توجد قياسات'}</small></span></div></td>
            <td class="trainee-activity-cell"><div class="external-trainee-compact-metric">${coachingIcon('calendar')}<span class="external-trainee-last-activity" dir="ltr">${trainee.lastActivity ? escapeHtml(new Date(trainee.lastActivity).toLocaleDateString('ar-EG')) : 'لا يوجد نشاط'}</span></div></td>
            <td class="trainee-actions-cell"><div class="external-trainee-actions-cell"><div class="trainee-actions"><button class="btn btn-primary btn-small" type="button" title="إضافة تدريب" aria-label="إضافة تدريب" data-coaching-action="workout" data-id="${trainee.id}">+ تدريب</button><button class="btn btn-light btn-small" type="button" title="فتح الملف" aria-label="فتح الملف" data-coaching-action="profile" data-id="${trainee.id}">فتح الملف</button><button class="btn btn-light btn-small" type="button" title="إضافة تغذية" aria-label="إضافة تغذية" data-coaching-action="diet" data-id="${trainee.id}">+ تغذية</button></div>${dietDeleteActions ? `<div class="trainee-diet-actions" aria-label="إدارة خطط التغذية">${dietDeleteActions}</div>` : ''}</div></td>
        </tr>`;
        }).join('');
        container.innerHTML = `<div class="external-trainees-table-wrap"><table class="external-trainees-table"><thead><tr><th>المتدرب</th><th>النوع</th><th>الأنظمة</th><th>القياسات</th><th>آخر نشاط</th><th>الإجراءات</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        enhanceTraineeActionMenus();
        activateCoachingSummary();
    }

    function renderPagination() {
        const element = $('externalTraineesPagination');
        const pagination = state.pagination;
        if (!element || !pagination || pagination.totalPages <= 1) { if (element) element.hidden = true; return; }
        element.hidden = false;
        element.innerHTML = `<span>صفحة ${number(pagination.page, 0)} من ${number(pagination.totalPages, 0)} · ${number(pagination.total, 0)} متدرب</span><div><button class="btn btn-light btn-small" data-coaching-page="prev" ${pagination.hasPrevious ? '' : 'disabled'}>السابق</button><button class="btn btn-light btn-small" data-coaching-page="next" ${pagination.hasNext ? '' : 'disabled'}>التالي</button></div>`;
    }

    async function loadTrainees(force = false) {
        const requestedSearch = String($('externalTraineeSearch')?.value || '').trim();
        const queryKey = `${state.page}:${requestedSearch}`;
        if (state.loaded && !force && state.search === requestedSearch) return;
        if (state.loadingKey === queryKey && !force) return;
        state.search = requestedSearch;
        state.loadingKey = queryKey;
        if (state.abortController) state.abortController.abort();
        state.abortController = new AbortController();
        const requestId = ++state.requestId;
        setLoading($('externalTraineesList'), traineeSkeleton());
        try {
            const data = await requestJson(`/api/external-trainees?page=${state.page}&pageSize=${state.pageSize}&search=${encodeURIComponent(state.search)}`, { signal: state.abortController.signal });
            if (requestId !== state.requestId) return;
            state.trainees = data.trainees || [];
            state.pagination = data.pagination;
            state.loaded = true;
            renderTrainees();
            renderPagination();
        } catch (error) {
            if (error.name === 'AbortError' || requestId !== state.requestId) return;
            $('externalTraineesList').innerHTML = `<div class="coaching-empty error"><strong>تعذر تحميل قائمة المتدربين</strong><span>${escapeHtml(error.message)}</span><button class="btn btn-light btn-small" type="button" data-coaching-action="retry">إعادة المحاولة</button></div>`;
            notify(error.message, 'error');
        } finally {
            if (requestId === state.requestId) state.loadingKey = '';
        }
    }

    function renderExternalForm() {
        $('externalRegistrationDate').value = today();
        $('externalFullName').value = '';
        $('externalPhone').value = '';
        $('externalEmail').value = '';
        $('externalNotes').value = '';
    }

    async function submitExternalTrainee(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        try {
            const data = await requestJson('/api/external-trainees', { method: 'POST', body: JSON.stringify({ fullName: $('externalFullName').value, phone: $('externalPhone').value, email: $('externalEmail').value, registrationDate: $('externalRegistrationDate').value, notes: $('externalNotes').value }) });
            closeDialog($('externalTraineeDialog'));
            state.builderClients = null;
            state.loaded = false;
            await loadTrainees(true);
            notify('تم إنشاء ملف المتدرب. أنشئ له النظام من زر التدريب أو التغذية.');
            openProfile(data.member.id);
        } catch (error) {
            notify(error.message, 'error');
            if (error.memberId) openProfile(error.memberId);
        } finally { submitButton.disabled = false; }
    }

    async function openProfile(memberId) {
        const dialog = $('coachingProfileDialog');
        setLoading($('coachingProfileContent'), 'جاري تحميل ملف المتدرب…');
        openDialog(dialog);
        try {
            state.profile = await requestJson(`/api/clients/${memberId}/training-overview`);
            renderProfileEnhanced(state.profile);
            decorateProfilePrintActions();
            renderProfileCheckins(state.profile.checkins || [], state.profile.progress?.checkinCount);
            renderProfileTrainingLoad(state.profile);
            renderProfileNutritionLoad(state.profile);
            renderProfileWeeklySummary(state.profile);
            renderProfileActivity(state.profile.activity || []);
            renderProfileCoachingAlerts(state.profile);
        } catch (error) {
            $('coachingProfileContent').innerHTML = `<div class="coaching-empty error"><strong>تعذر فتح الملف</strong><span>${escapeHtml(error.message)}</span></div>`;
            notify(error.message, 'error');
        }
    }

    function renderProfile(overview) {
        const member = overview.member;
        $('coachingProfileTitle').textContent = member.fullName;
        $('coachingProfileSubtitle').textContent = `${member.phone}${member.email ? ` · ${member.email}` : ''}`;
        const workoutCards = (overview.workoutPrograms || []).map((program) => `<article class="profile-system-card"><div><span class="system-type workout">برنامج تدريب</span><strong>${escapeHtml(program.name)}</strong><small>${escapeHtml(program.goal || 'هدف غير محدد')} · ${escapeHtml(program.level || 'مستوى غير محدد')}</small></div><div><span class="system-status ${program.status}">${STATUS_LABELS[program.status] || program.status}</span><button class="btn btn-light btn-small" data-profile-action="edit-workout" data-id="${program.id}">تعديل</button></div></article>`).join('');
        const dietCards = (overview.dietPlans || []).map((plan) => `<article class="profile-system-card"><div><span class="system-type diet">خطة تغذية</span><strong>${escapeHtml(plan.name)}</strong><small>${number(plan.targetCalories, 0)} سعر · ${number(plan.mealCount, 0)} وجبات</small></div><div><span class="system-status ${plan.status}">${STATUS_LABELS[plan.status] || plan.status}</span><button class="btn btn-light btn-small" data-profile-action="edit-diet" data-id="${plan.id}">تعديل</button></div></article>`).join('');
        const measurements = (overview.measurements || []).slice(0, 6).map((item) => `<tr><td>${escapeHtml(item.measuredAt)}</td><td>${item.weightKg == null ? '—' : `${number(item.weightKg, 1)} كجم`}</td><td>${item.bodyFatPercent == null ? '—' : `${number(item.bodyFatPercent, 1)}%`}</td><td><button class="btn btn-light btn-small" data-measurement-action="edit" data-id="${item.id}">تعديل</button><button class="btn btn-danger btn-small" data-measurement-action="delete" data-id="${item.id}">حذف</button></td></tr>`).join('');
        $('coachingProfileContent').innerHTML = `<div class="profile-hero"><div class="trainee-avatar large">${escapeHtml((member.fullName || 'م').trim().slice(0, 1))}</div><div><strong>${escapeHtml(member.fullName)}</strong><span>${escapeHtml(member.phone)}${member.email ? ` · ${escapeHtml(member.email)}` : ''}</span><small>ملف العميل #${member.id} · لا يوجد اشتراك Gym فعال حاليًا</small></div><button class="btn btn-primary btn-small" data-profile-action="subscribe">إضافة اشتراك Gym</button></div>
            <div class="profile-stats"><article><span>الوزن الحالي</span><strong>${overview.progress.currentWeight == null ? '—' : `${number(overview.progress.currentWeight, 1)} كجم`}</strong></article><article><span>تغير الوزن</span><strong>${overview.progress.weightChange == null ? '—' : `${overview.progress.weightChange > 0 ? '+' : ''}${number(overview.progress.weightChange, 1)} كجم`}</strong></article><article><span>الجلسات المكتملة</span><strong>${number(overview.progress.completedSessions, 0)}</strong></article><article><span>تسجيلات الوجبات</span><strong>${number(overview.progress.mealLogCount, 0)}</strong></article></div>
            <div class="profile-actions"><button class="btn btn-primary" data-profile-action="new-workout">+ برنامج تدريب</button><button class="btn btn-light" data-profile-action="new-diet">+ خطة تغذية</button><button class="btn btn-light" data-profile-action="new-measurement">+ قياس جديد</button><button class="btn btn-light" data-profile-action="edit-client">تعديل البيانات الأساسية</button></div>
            <div class="profile-section"><div class="profile-section-head"><h4>الأنظمة الحالية</h4><span>${number((overview.workoutPrograms || []).length + (overview.dietPlans || []).length, 0)} نظام</span></div>${workoutCards || dietCards ? `${workoutCards}${dietCards}` : '<div class="profile-empty">لم يتم إنشاء نظام بعد.</div>'}</div>
            <div class="profile-section"><div class="profile-section-head"><h4>القياسات والمتابعة</h4><span>${number((overview.measurements || []).length, 0)} قياس</span></div>${measurements ? `<div class="profile-table-wrap"><table class="profile-table"><thead><tr><th>التاريخ</th><th>الوزن</th><th>الدهون</th><th>الإجراءات</th></tr></thead><tbody>${measurements}</tbody></table></div>` : '<div class="profile-empty">أضف أول قياس لمتابعة التقدم.</div>'}</div>`;
    }

    function progressPercent(value) {
        return Math.max(0, Math.min(100, Number(value || 0)));
    }

    function renderMeasurementBars(measurements = []) {
        const rows = measurements.filter((item) => item.weightKg != null).slice().reverse().slice(-10);
        if (!rows.length) return '<div class="profile-empty">أضف قياسات لعرض تطور الوزن.</div>';
        const values = rows.map((item) => Number(item.weightKg));
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(1, max - min);
        return `<div class="profile-chart-bars">${rows.map((item) => { const value = Number(item.weightKg); return `<div class="profile-chart-bar" title="${escapeHtml(item.measuredAt)} · ${number(value, 1)} كجم"><span><b>${number(value, 1)}</b></span><small>${escapeHtml(String(item.measuredAt).slice(5))}</small></div>`; }).join('')}</div>`;
    }

    function renderProfileEnhanced(overview) {
        const member = overview.member;
        $('coachingProfileTitle').textContent = member.fullName;
        $('coachingProfileSubtitle').textContent = `${member.phone}${member.email ? ` · ${member.email}` : ''}`;
        const workouts = overview.workoutPrograms || [];
        const diets = overview.dietPlans || [];
        const sessions = overview.workoutSessions || [];
        const mealLogs = overview.mealLogs || [];
        const workoutCards = workouts.map((program) => `<article class="profile-system-card"><div><span class="system-type workout">برنامج تدريب</span><strong>${escapeHtml(program.name)}</strong><small>${escapeHtml(program.goal || 'هدف غير محدد')} · ${number(program.exerciseCount, 0)} تمرين · ${number(program.completedSessions, 0)} جلسة مكتملة</small><div class="profile-inline-progress"><i></i></div></div><div><span class="system-status ${program.status}">${progressPercent(program.progressPercent)}٪ · ${STATUS_LABELS[program.status] || program.status}</span><button class="btn btn-light btn-small" data-profile-action="edit-workout" data-id="${program.id}">تعديل</button></div></article>`).join('');
        const dietCards = diets.map((plan) => `<article class="profile-system-card"><div><span class="system-type diet">خطة تغذية</span><strong>${escapeHtml(plan.name)}</strong><small>${number(plan.targetCalories, 0)} سعر · ${number(plan.mealsPerDay || plan.mealCount, 0)} وجبات · ${number(plan.loggedMeals, 0)} تسجيل</small><div class="profile-inline-progress diet"><i></i></div></div><div><span class="system-status ${plan.status}">${progressPercent(plan.progressPercent)}٪ · ${STATUS_LABELS[plan.status] || plan.status}</span><button class="btn btn-light btn-small" data-profile-action="edit-diet" data-id="${plan.id}">تعديل</button><button class="btn btn-danger btn-small" data-profile-action="delete-diet" data-id="${plan.id}">حذف</button></div></article>`).join('');
        const measurements = (overview.measurements || []).slice(0, 8).map((item) => `<tr><td>${escapeHtml(item.measuredAt)}</td><td>${item.weightKg == null ? '—' : `${number(item.weightKg, 1)} كجم`}</td><td>${item.bodyFatPercent == null ? '—' : `${number(item.bodyFatPercent, 1)}%`}</td><td><button class="btn btn-light btn-small" data-measurement-action="edit" data-id="${item.id}">تعديل</button><button class="btn btn-danger btn-small" data-measurement-action="delete" data-id="${item.id}">حذف</button></td></tr>`).join('');
        const sessionRows = sessions.slice(0, 6).map((session) => `<tr><td>${escapeHtml(session.programName || 'جلسة تدريب')}</td><td>${escapeHtml(session.routineName || '—')}</td><td>${escapeHtml(session.status === 'completed' ? 'مكتملة' : session.status === 'started' ? 'مفتوحة' : 'ملغاة')}</td><td>${number(session.setCount, 0)}</td></tr>`).join('');
        const mealRows = mealLogs.slice(0, 6).map((log) => `<tr><td><strong>${escapeHtml(log.foodName || 'طعام')}</strong><small>${number(log.consumedQuantity, 1)} ${escapeHtml(log.servingUnit || '')}</small></td><td>${escapeHtml(log.mealName || '—')}</td><td><strong>${number(log.calories, 0)}</strong><small class="profile-meal-macros">P ${number(log.protein, 1)} · C ${number(log.carbs, 1)} · F ${number(log.fats, 1)}</small></td><td>${escapeHtml(new Date(log.consumedAt).toLocaleDateString('ar-EG'))}</td></tr>`).join('');
        $('coachingProfileContent').innerHTML = `<div class="profile-hero"><div class="trainee-avatar large">${escapeHtml((member.fullName || 'م').trim().slice(0, 1))}</div><div><strong>${escapeHtml(member.fullName)}</strong><span>${escapeHtml(member.phone)}${member.email ? ` · ${escapeHtml(member.email)}` : ''}</span><small>ملف العميل #${member.id} · التنفيذ والتقدم محفوظان في قاعدة البيانات</small></div><button class="btn btn-primary btn-small" data-profile-action="subscribe">إضافة اشتراك Gym</button></div>
            <div class="profile-stats"><article><span>الوزن الحالي</span><strong>${overview.progress.currentWeight == null ? '—' : `${number(overview.progress.currentWeight, 1)} كجم`}</strong></article><article><span>تغير الوزن</span><strong>${overview.progress.weightChange == null ? '—' : `${overview.progress.weightChange > 0 ? '+' : ''}${number(overview.progress.weightChange, 1)} كجم`}</strong></article><article><span>الجلسات المكتملة</span><strong>${number(overview.progress.completedSessions, 0)}</strong></article><article><span>تسجيلات الوجبات</span><strong>${number(overview.progress.mealLogCount, 0)}</strong></article></div>
            <div class="profile-actions"><button class="btn btn-primary" data-profile-action="new-workout">+ برنامج تدريب</button><button class="btn btn-light" data-profile-action="new-diet">+ خطة تغذية</button><button class="btn btn-light" data-profile-action="start-session">بدء جلسة</button><button class="btn btn-light" data-profile-action="log-meal">تسجيل وجبة</button><button class="btn btn-light" data-profile-action="new-measurement">+ قياس جديد</button><button class="btn btn-light" data-profile-action="edit-client">تعديل البيانات الأساسية</button></div>
            <div class="profile-progress-dashboard"><div class="profile-progress-card"><div class="profile-section-head"><h4>تطور الوزن</h4><span>${escapeHtml(overview.progress.lastMeasurementAt || 'لا توجد قياسات')}</span></div>${renderMeasurementBars(overview.measurements)}</div><div class="profile-progress-card"><div class="profile-section-head"><h4>نسبة تنفيذ الأنظمة</h4><span>تتحدث مع كل جلسة أو وجبة</span></div><div class="profile-progress-meters"><div><span>التدريب</span><b>${progressPercent(overview.progress.workoutCompletionPercent)}٪</b><i><em></em></i></div><div><span>التغذية</span><b>${progressPercent(overview.progress.nutritionCompletionPercent)}٪</b><i><em></em></i></div></div></div></div>
            <div class="profile-section"><div class="profile-section-head"><h4>الأنظمة الحالية</h4><span>${number(workouts.length + diets.length, 0)} نظام</span></div>${workoutCards || dietCards ? `${workoutCards}${dietCards}` : '<div class="profile-empty">لم يتم إنشاء نظام بعد.</div>'}</div>
            <div class="profile-section"><div class="profile-section-head"><h4>القياسات والمتابعة</h4><span>${number((overview.measurements || []).length, 0)} قياس</span></div>${measurements ? `<div class="profile-table-wrap"><table class="profile-table"><thead><tr><th>التاريخ</th><th>الوزن</th><th>الدهون</th><th>الإجراءات</th></tr></thead><tbody>${measurements}</tbody></table></div>` : '<div class="profile-empty">أضف أول قياس لمتابعة التقدم.</div>'}</div>
            <div class="profile-execution-grid"><section class="profile-section"><div class="profile-section-head"><h4>جلسات التدريب الأخيرة</h4><span>${number(overview.progress.sessionCount, 0)} إجمالي</span></div>${sessionRows ? `<div class="profile-table-wrap"><table class="profile-table"><thead><tr><th>البرنامج</th><th>اليوم</th><th>الحالة</th><th>المجموعات</th></tr></thead><tbody>${sessionRows}</tbody></table></div>` : '<div class="profile-empty">لم يتم تسجيل جلسات بعد.</div>'}</section><section class="profile-section"><div class="profile-section-head"><h4>سجل الوجبات</h4><span>${number(overview.progress.mealLogCount, 0)} إجمالي</span></div>${mealRows ? `<div class="profile-table-wrap"><table class="profile-table"><thead><tr><th>الطعام</th><th>الوجبة</th><th>السعرات</th><th>التاريخ</th></tr></thead><tbody>${mealRows}</tbody></table></div>` : '<div class="profile-empty">لم يتم تسجيل وجبات بعد.</div>'}</section></div>`;
    }

    function decorateProfilePrintActions() {
        const content = $('coachingProfileContent');
        if (!content) return;
        const profileActions = content.querySelector('.profile-actions');
        const profileMemberId = state.profile?.member?.id;
        if (profileActions && profileMemberId && !profileActions.querySelector('[data-profile-action="print-overview"]')) {
            [['print-overview', 'طباعة الملف'], ['pdf-overview', 'PDF الملف']].forEach(([action, label]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-light';
                button.dataset.profileAction = action;
                button.dataset.id = profileMemberId;
                button.textContent = label;
                profileActions.append(button);
            });
        }
        content.querySelectorAll('.profile-system-card').forEach((card) => {
            const editButton = card.querySelector('[data-profile-action="edit-workout"], [data-profile-action="edit-diet"]');
            const actions = editButton?.parentElement;
            if (!editButton || !actions || actions.querySelector('[data-profile-action^="print-"]')) return;
            const type = editButton.dataset.profileAction === 'edit-diet' ? 'diet' : 'workout';
            [['print', 'طباعة'], ['pdf', 'PDF']].forEach(([action, label]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-light btn-small profile-print-action';
                button.dataset.profileAction = action + '-' + type;
                button.dataset.id = editButton.dataset.id;
                button.textContent = label;
                button.title = label + (action === 'pdf' ? ' للنظام' : ' النظام');
                actions.append(button);
            });
        });
    }

    function checkinReadiness(checkin) {
        const positive = [checkin.sleepQuality, checkin.mood].filter((value) => value != null).map((value) => Number(value) / 5);
        const inverse = [checkin.fatigue, checkin.soreness, checkin.stress].filter((value) => value != null).map((value) => (6 - Number(value)) / 5);
        const scores = [...positive, ...inverse];
        return scores.length ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100) : null;
    }

    function checkinValue(value, suffix = '') {
        return value == null || value === '' ? '—' : `${number(value, 1)}${suffix}`;
    }

    function checkinInsight(checkin) {
        if (!checkin) return { tone: 'neutral', label: 'لا توجد متابعة', description: 'أضف متابعة يومية حتى تظهر قراءة الاستشفاء.' };
        const readiness = checkinReadiness(checkin);
        const highLoad = [checkin.fatigue, checkin.soreness, checkin.stress].some((value) => Number(value) >= 4);
        const shortSleep = checkin.sleepHours != null && Number(checkin.sleepHours) < 6;
        if (highLoad || shortSleep || (readiness != null && readiness < 50)) return { tone: 'alert', label: 'تحتاج إلى استشفاء', description: 'الإشارات الحالية تستدعي تخفيف الحمل ومراجعة شدة تمرين اليوم.' };
        if (readiness != null && readiness >= 75) return { tone: 'good', label: 'جاهزية جيدة', description: 'مؤشرات المتابعة مناسبة للاستمرار مع الالتزام بالخطة الحالية.' };
        if (readiness != null) return { tone: 'watch', label: 'استشفاء متوسط', description: 'تابع المؤشرات في المتابعة القادمة واضبط الحمل حسب استجابة المتدرب.' };
        return { tone: 'neutral', label: 'بيانات جزئية', description: 'أكمل مؤشرات النوم والمزاج والإجهاد للحصول على قراءة أدق.' };
    }

    function renderCheckinTrend(checkins = []) {
        const rows = checkins.slice(0, 7).filter((checkin) => checkinReadiness(checkin) != null).reverse();
        if (!rows.length) return '<div class="profile-checkin-trend-empty">أكمل مؤشرات المتابعة لعرض اتجاه الجاهزية.</div>';
        const values = rows.map((checkin) => checkinReadiness(checkin));
        const latest = values[values.length - 1];
        const previous = values.slice(0, -1);
        const previousAverage = previous.length ? previous.reduce((sum, value) => sum + value, 0) / previous.length : latest;
        const difference = Math.round(latest - previousAverage);
        const trend = difference >= 8 ? { label: 'تحسن', className: 'up' } : difference <= -8 ? { label: 'انخفاض', className: 'down' } : { label: 'مستقر', className: 'steady' };
        return `<div class="profile-checkin-trend-head"><span>آخر ${number(rows.length, 0)} متابعات مكتملة</span><b class="${trend.className}">${trend.label}${difference === 0 ? '' : ` ${difference > 0 ? '+' : ''}${number(difference, 0)}٪`}</b></div><div class="profile-checkin-trend-bars" role="img" aria-label="اتجاه مؤشر الجاهزية خلال آخر المتابعات">${rows.map((checkin, index) => { const value = values[index]; return `<div class="profile-checkin-trend-bar" title="${escapeHtml(checkin.checkinDate)} · ${number(value, 0)}٪"><span><b>${number(value, 0)}</b></span><small>${escapeHtml(String(checkin.checkinDate).slice(5))}</small></div>`; }).join('')}</div>`;
    }

    function renderProfileCheckins(checkins = [], totalCount = checkins.length) {
        const content = $('coachingProfileContent');
        if (!content) return;
        content.querySelector('.profile-checkin-section')?.remove();
        const items = checkins.slice(0, 7);
        const latest = items[0];
        const insight = checkinInsight(latest);
        const latestReadiness = latest ? checkinReadiness(latest) : null;
        const cards = items.map((checkin) => {
            const readiness = checkinReadiness(checkin);
            return `<article class="profile-checkin-card"><div class="profile-checkin-card-head"><div><strong>${escapeHtml(checkin.checkinDate)}</strong><span>${readiness == null ? 'متابعة يومية' : `جاهزية ${number(readiness, 0)}٪`}</span></div><div class="profile-checkin-card-actions"><button type="button" class="btn btn-light btn-small" data-checkin-action="edit" data-id="${checkin.id}" aria-label="تعديل المتابعة">تعديل</button><button type="button" class="btn btn-danger btn-small" data-checkin-action="delete" data-id="${checkin.id}" aria-label="حذف المتابعة">حذف</button></div></div><div class="profile-checkin-signals"><span>النوم ${checkinValue(checkin.sleepHours, ' س')}</span><span>الإجهاد ${checkinValue(checkin.fatigue, '/5')}</span><span>الألم ${checkinValue(checkin.soreness, '/5')}</span><span>المزاج ${checkinValue(checkin.mood, '/5')}</span>${checkin.restingHr == null ? '' : `<span>نبض ${checkinValue(checkin.restingHr)}</span>`}${checkin.hrv == null ? '' : `<span>HRV ${checkinValue(checkin.hrv)}</span>`}</div>${checkin.notes ? `<p class="profile-checkin-notes">${escapeHtml(checkin.notes)}</p>` : ''}</article>`;
        }).join('');
        const section = document.createElement('section');
        section.className = 'profile-section profile-checkin-section';
        section.innerHTML = `<div class="profile-section-head"><div><h4>المتابعة اليومية والاستشفاء</h4><small class="profile-section-description">نوم، إجهاد، ألم عضلي ومؤشرات تساعدك على ضبط الحمل التدريبي.</small></div><div class="profile-section-head-actions"><span>${number(totalCount, 0)} متابعة</span><button type="button" class="btn btn-light btn-small" data-checkin-action="new">+ إضافة متابعة</button></div></div><div class="profile-checkin-insight ${insight.tone}"><div class="profile-checkin-insight-copy"><strong>${insight.label}</strong><span>${insight.description}</span>${latest ? `<small>آخر متابعة: ${escapeHtml(latest.checkinDate)}</small>` : ''}</div><div class="profile-checkin-insight-score"><b>${latestReadiness == null ? '—' : `${number(latestReadiness, 0)}٪`}</b><small>مؤشر الجاهزية</small></div></div><div class="profile-checkin-trend">${renderCheckinTrend(checkins)}</div><div class="profile-checkin-grid">${cards || '<div class="profile-empty">لم يتم تسجيل متابعة يومية بعد.</div>'}</div>`;
        const anchor = content.querySelector('.profile-progress-dashboard');
        if (anchor) anchor.after(section);
        else content.appendChild(section);
    }

    function renderProfileTrainingLoad(overview) {
        const content = $('coachingProfileContent');
        if (!content) return;
        content.querySelector('.profile-training-load-section')?.remove();
        const progress = overview.progress || {};
        const section = document.createElement('section');
        section.className = 'profile-section profile-training-load-section';
        section.innerHTML = `<div class="profile-section-head"><div><h4>ملخص الحمل التدريبي</h4><small class="profile-section-description">الحجم الفعلي محسوب من الأوزان والتكرارات المسجلة في جلسات التدريب.</small></div><span>${number(progress.sessionCount, 0)} جلسة</span></div><div class="profile-training-load-grid"><article><span>الجلسات المكتملة</span><strong>${number(progress.completedSessions, 0)}</strong></article><article><span>المجموعات المسجلة</span><strong>${number(progress.loggedSetCount, 0)}</strong></article><article><span>التكرارات المسجلة</span><strong>${number(progress.loggedRepCount, 0)}</strong></article><article><span>حجم التدريب</span><strong>${number(progress.trainingVolumeKg, 1)} <small>كجم</small></strong></article></div>`;
        const anchor = content.querySelector('.profile-checkin-section') || content.querySelector('.profile-progress-dashboard');
        if (anchor) anchor.after(section);
        else content.appendChild(section);
    }

    function renderProfileNutritionLoad(overview) {
        const content = $('coachingProfileContent');
        if (!content) return;
        content.querySelector('.profile-nutrition-load-section')?.remove();
        const progress = overview.progress || {};
        const target = progress.nutritionTargetCalories;
        const averageCalories = Number(progress.nutritionAverageDailyCalories || 0);
        const calorieGap = target == null ? null : Math.round(averageCalories - Number(target));
        const gapLabel = calorieGap == null || !progress.nutritionLoggedDays ? 'لا يوجد هدف محفوظ' : `${calorieGap > 0 ? '+' : ''}${number(calorieGap, 0)} سعرة عن الهدف`;
        const section = document.createElement('section');
        section.className = 'profile-section profile-nutrition-load-section';
        section.innerHTML = `<div class="profile-section-head"><div><h4>ملخص التغذية المسجلة</h4><small class="profile-section-description">متوسط السعرات والماكروز محسوب من الوجبات التي تم تسجيلها فعليًا.</small></div><span>${number(progress.mealLogCount, 0)} وجبة</span></div><div class="profile-nutrition-load-grid"><article><span>أيام التسجيل</span><strong>${number(progress.nutritionLoggedDays, 0)}</strong></article><article><span>متوسط السعرات</span><strong>${number(averageCalories, 0)}</strong></article><article><span>الهدف اليومي</span><strong>${target == null ? '—' : number(target, 0)}</strong></article><article><span>الفرق عن الهدف</span><strong>${gapLabel}</strong></article></div><div class="profile-nutrition-macros"><span>بروتين <b>${number(progress.nutritionProteinTotal, 1)} جم</b></span><span>كربوهيدرات <b>${number(progress.nutritionCarbsTotal, 1)} جم</b></span><span>دهون <b>${number(progress.nutritionFatsTotal, 1)} جم</b></span></div>`;
        const anchor = content.querySelector('.profile-training-load-section') || content.querySelector('.profile-checkin-section');
        if (anchor) anchor.after(section);
        else content.appendChild(section);
    }

    function dateKey(value) {
        if (!value) return '';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toISOString().slice(0, 10);
    }

    function dateDaysAgo(days) {
        const value = new Date(`${today()}T00:00:00`);
        value.setDate(value.getDate() - Number(days));
        return value.toISOString().slice(0, 10);
    }

    function renderProfileWeeklySummary(overview) {
        const content = $('coachingProfileContent');
        if (!content) return;
        content.querySelector('.profile-weekly-summary-section')?.remove();
        const endDate = today();
        const startDate = dateDaysAgo(6);
        const inWeek = (value) => { const key = dateKey(value); return key >= startDate && key <= endDate; };
        const sessions = (overview.workoutSessions || []).filter((session) => session.status === 'completed' && inWeek(session.startedAt));
        const meals = (overview.mealLogs || []).filter((log) => inWeek(log.consumedAt));
        const checkins = (overview.checkins || []).filter((checkin) => inWeek(checkin.checkinDate));
        const mealDays = new Set(meals.map((meal) => dateKey(meal.consumedAt)).filter(Boolean));
        const calories = meals.reduce((sum, meal) => sum + Number(meal.calories || 0), 0);
        const averageCalories = mealDays.size ? calories / mealDays.size : 0;
        const section = document.createElement('section');
        section.className = 'profile-section profile-weekly-summary-section';
        section.innerHTML = `<div class="profile-section-head"><div><h4>ملخص آخر 7 أيام</h4><small class="profile-section-description">صورة سريعة عن الالتزام الحالي بالتدريب والتغذية والمتابعة.</small></div><span dir="ltr">${escapeHtml(startDate)} — ${escapeHtml(endDate)}</span></div><div class="profile-weekly-summary-grid"><article><span>جلسات مكتملة</span><strong>${number(sessions.length, 0)}</strong><small>${number(sessions.reduce((sum, session) => sum + Number(session.setCount || 0), 0), 0)} مجموعة</small></article><article><span>وجبات مسجلة</span><strong>${number(meals.length, 0)}</strong><small>${number(mealDays.size, 0)} أيام تسجيل</small></article><article><span>متوسط السعرات</span><strong>${number(averageCalories, 0)}</strong><small>${overview.progress?.nutritionTargetCalories == null ? 'بدون هدف محفوظ' : `الهدف ${number(overview.progress.nutritionTargetCalories, 0)}`}</small></article><article><span>متابعات الاستشفاء</span><strong>${number(checkins.length, 0)}</strong><small>${checkins.length ? 'تم تسجيلها هذا الأسبوع' : 'لا توجد متابعة بعد'}</small></article></div>`;
        const anchor = content.querySelector('.profile-nutrition-load-section') || content.querySelector('.profile-training-load-section');
        if (anchor) anchor.after(section);
        else content.appendChild(section);
    }

    function renderProfileActivity(activity = []) {
        const content = $('coachingProfileContent');
        if (!content) return;
        content.querySelector('.profile-activity-section')?.remove();
        const labels = {
            workout_created: 'إنشاء برنامج تدريب',
            workout_updated: 'تعديل برنامج تدريب',
            workout_deleted: 'حذف برنامج تدريب',
            workout_status_changed: 'تغيير حالة برنامج التدريب',
            diet_created: 'إنشاء خطة تغذية',
            diet_updated: 'تعديل خطة تغذية',
            diet_deleted: 'حذف خطة تغذية',
            diet_status_changed: 'تغيير حالة خطة التغذية',
            measurement_created: 'إضافة قياس',
            measurement_updated: 'تعديل قياس',
            measurement_deleted: 'حذف قياس',
            checkin_created: 'إضافة متابعة يومية',
            checkin_updated: 'تعديل متابعة يومية',
            checkin_deleted: 'حذف متابعة يومية',
            workout_session_started: 'بدء جلسة تدريب',
            workout_session_completed: 'إكمال جلسة تدريب',
            workout_session_cancelled: 'إلغاء جلسة تدريب',
            meal_logged: 'تسجيل وجبة'
        };
        const tones = {
            workout_created: 'workout', workout_updated: 'workout', workout_deleted: 'danger', workout_status_changed: 'workout',
            diet_created: 'diet', diet_updated: 'diet', diet_deleted: 'danger', diet_status_changed: 'diet',
            measurement_created: 'measurement', measurement_updated: 'measurement', measurement_deleted: 'danger',
            checkin_created: 'checkin', checkin_updated: 'checkin', checkin_deleted: 'danger',
            workout_session_started: 'session', workout_session_completed: 'session', workout_session_cancelled: 'danger',
            meal_logged: 'meal'
        };
        const icons = {
            workout: '▦', diet: '◒', measurement: '◌', checkin: '✓', session: '▶', meal: '⌁', danger: '!'
        };
        const rows = activity.slice(0, 12).map((event) => {
            const tone = tones[event.eventType] || 'neutral';
            const label = labels[event.eventType] || 'تحديث على الملف';
            const date = event.createdAt ? new Date(event.createdAt) : null;
            const dateLabel = date && !Number.isNaN(date.getTime())
                ? date.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })
                : 'وقت غير محدد';
            return `<article class="profile-activity-item ${tone}"><span class="profile-activity-marker" aria-hidden="true">${icons[tone] || '•'}</span><div class="profile-activity-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(event.details || 'تم تحديث بيانات الملف.')}</small></div><time datetime="${escapeHtml(event.createdAt || '')}" dir="ltr">${escapeHtml(dateLabel)}</time></article>`;
        }).join('');
        const section = document.createElement('section');
        section.className = 'profile-section profile-activity-section';
        section.innerHTML = `<div class="profile-section-head"><div><h4>آخر نشاط</h4><small class="profile-section-description">سجل مختصر للتغييرات والتنفيذات التي تمت على ملف المتدرب.</small></div><span>${number(activity.length, 0)} عملية</span></div><div class="profile-activity-list">${rows || '<div class="profile-empty">لا توجد عمليات مسجلة على هذا الملف بعد.</div>'}</div>`;
        const anchor = content.querySelector('.profile-weekly-summary-section') || content.querySelector('.profile-nutrition-load-section');
        if (anchor) anchor.after(section);
        else content.appendChild(section);
    }

    function renderProfileCoachingAlerts(overview) {
        const content = $('coachingProfileContent');
        if (!content) return;
        content.querySelector('.profile-coaching-alerts-section')?.remove();
        const endDate = today();
        const startDate = dateDaysAgo(6);
        const inWeek = (value) => { const key = dateKey(value); return key >= startDate && key <= endDate; };
        const sessions = (overview.workoutSessions || []).filter((session) => session.status === 'completed' && inWeek(session.startedAt));
        const meals = (overview.mealLogs || []).filter((log) => inWeek(log.consumedAt));
        const activeWorkout = (overview.workoutPrograms || []).find((program) => program.status === 'active');
        const activeDiet = (overview.dietPlans || []).find((plan) => plan.status === 'active');
        const latestCheckin = overview.checkins?.[0];
        const alerts = [];
        if (activeWorkout && !sessions.length) alerts.push({ tone: 'warning', title: 'لا توجد جلسة مكتملة هذا الأسبوع', detail: `البرنامج «${activeWorkout.name}» نشط، لكن لم يتم تسجيل جلسة مكتملة خلال آخر 7 أيام.`, action: 'start-session', actionLabel: 'بدء جلسة' });
        if (activeDiet && !meals.length) alerts.push({ tone: 'warning', title: 'لا توجد وجبات مسجلة هذا الأسبوع', detail: `الخطة «${activeDiet.name}» نشطة. تسجيل الوجبات يساعد على قياس الالتزام الفعلي.`, action: 'log-meal', actionLabel: 'تسجيل وجبة' });
        if (latestCheckin && checkinInsight(latestCheckin).tone === 'alert') alerts.push({ tone: 'danger', title: 'مؤشر الاستشفاء يحتاج متابعة', detail: 'راجع شدة تمرين اليوم وتفاصيل النوم والإجهاد قبل بدء جلسة جديدة.', action: 'new-checkin', actionLabel: 'إضافة متابعة' });
        const lastMeasurement = overview.measurements?.[0]?.measuredAt;
        if (lastMeasurement && dateKey(lastMeasurement) < dateDaysAgo(30)) alerts.push({ tone: 'info', title: 'القياسات تحتاج تحديثًا', detail: `آخر قياس محفوظ بتاريخ ${lastMeasurement}. إضافة قياس جديد ستجعل متابعة التقدم أدق.`, action: 'new-measurement', actionLabel: 'إضافة قياس' });
        const items = alerts.length ? alerts : [{ tone: 'success', title: 'لا توجد تنبيهات متابعة عاجلة', detail: 'البيانات الحالية لا تحتوي على حالة تحتاج إلى إجراء سريع.', action: '', actionLabel: '' }];
        const section = document.createElement('section');
        section.className = 'profile-section profile-coaching-alerts-section';
        section.innerHTML = `<div class="profile-section-head"><div><h4>تنبيهات المتابعة</h4><small class="profile-section-description">إشارات عملية مبنية على الجلسات والوجبات والقياسات المسجلة.</small></div><span>${alerts.length ? `${number(alerts.length, 0)} تحتاج إجراء` : 'الحالة مستقرة'}</span></div><div class="profile-coaching-alerts-list">${items.map((item) => `<article class="profile-coaching-alert ${item.tone}"><span class="profile-coaching-alert-icon" aria-hidden="true">${item.tone === 'success' ? '✓' : item.tone === 'danger' ? '!' : 'i'}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div>${item.action ? `<button type="button" class="btn btn-light btn-small" data-profile-action="${item.action === 'new-checkin' ? '' : item.action}" data-checkin-action="${item.action === 'new-checkin' ? 'new' : ''}">${escapeHtml(item.actionLabel)}</button>` : ''}</article>`).join('')}</div>`;
        const anchor = content.querySelector('.profile-weekly-summary-section') || content.querySelector('.profile-nutrition-load-section');
        if (anchor) anchor.after(section);
        else content.appendChild(section);
    }

    function blankWorkout(memberId) {
        const exerciseId = state.catalog.exercises[0]?.id || '';
        return { memberId, name: '', description: '', startDate: today(), endDate: '', durationWeeks: 4, goal: 'بناء العضلات', level: 'مبتدئ', daysPerWeek: 3, status: 'active', notes: '', version: null, routines: [{ name: 'اليوم الأول', dayOfWeek: 1, sortOrder: 0, notes: '', exercises: [{ exerciseId, sortOrder: 0, sets: 3, repsMin: 10, repsMax: 12, weightKg: '', restSeconds: 90, tempo: '', supersetGroupId: '', notes: '' }] }] };
    }

    function blankDiet(memberId) {
        const foodId = state.catalog.foods[0]?.id || '';
        const names = ['الفطور', 'وجبة خفيفة', 'الغداء', 'العشاء'];
        return { memberId, name: '', description: '', startDate: today(), endDate: '', mealsPerDay: 4, targetCalories: 2200, targetProtein: 160, targetCarbs: 240, targetFats: 70, status: 'active', notes: '', version: null, meals: names.map((name, index) => ({ name, mealTime: '', sortOrder: index, notes: '', items: [{ foodId, sortOrder: 0, assignedQuantity: 100, servingUnit: '', notes: '' }] })) };
    }

    function valueOf(root, selector, fallback = '') { return root.querySelector(selector)?.value ?? fallback; }

    function readWorkoutDraft() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        draft.name = valueOf(content, '[data-builder-field="name"]');
        draft.description = valueOf(content, '[data-builder-field="description"]');
        draft.startDate = valueOf(content, '[data-builder-field="startDate"]');
        draft.endDate = valueOf(content, '[data-builder-field="endDate"]');
        draft.durationWeeks = Number(valueOf(content, '[data-builder-field="durationWeeks"]')) || null;
        draft.goal = valueOf(content, '[data-builder-field="goal"]');
        draft.level = valueOf(content, '[data-builder-field="level"]');
        draft.daysPerWeek = Number(valueOf(content, '[data-builder-field="daysPerWeek"]')) || null;
        draft.status = valueOf(content, '[data-builder-field="status"]', 'active');
        draft.notes = valueOf(content, '[data-builder-field="notes"]');
        draft.routines = [...content.querySelectorAll('[data-routine-index]')].map((routineElement, routineIndex) => ({
            name: valueOf(routineElement, '[data-routine-field="name"]', `اليوم ${routineIndex + 1}`), dayOfWeek: Number(valueOf(routineElement, '[data-routine-field="dayOfWeek"]')) || null, sortOrder: routineIndex, notes: valueOf(routineElement, '[data-routine-field="notes"]'), exercises: [...routineElement.querySelectorAll('[data-exercise-index]')].map((exerciseElement, exerciseIndex) => ({ exerciseId: Number(valueOf(exerciseElement, '[data-exercise-field="exerciseId"]')) || '', sortOrder: exerciseIndex, sets: Number(valueOf(exerciseElement, '[data-exercise-field="sets"]')) || 3, repsMin: Number(valueOf(exerciseElement, '[data-exercise-field="repsMin"]')) || null, repsMax: Number(valueOf(exerciseElement, '[data-exercise-field="repsMax"]')) || null, weightKg: valueOf(exerciseElement, '[data-exercise-field="weightKg"]'), restSeconds: Number(valueOf(exerciseElement, '[data-exercise-field="restSeconds"]')) || 0, tempo: valueOf(exerciseElement, '[data-exercise-field="tempo"]'), supersetGroupId: valueOf(exerciseElement, '[data-exercise-field="supersetGroupId"]'), notes: valueOf(exerciseElement, '[data-exercise-field="notes"]') }))
        }));
        return draft;
    }

    function readDietDraft() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        draft.name = valueOf(content, '[data-builder-field="name"]');
        draft.description = valueOf(content, '[data-builder-field="description"]');
        draft.startDate = valueOf(content, '[data-builder-field="startDate"]');
        draft.endDate = valueOf(content, '[data-builder-field="endDate"]');
        draft.mealsPerDay = Number(valueOf(content, '[data-builder-field="mealsPerDay"]')) || null;
        for (const field of ['targetCalories', 'targetProtein', 'targetCarbs', 'targetFats']) draft[field] = Number(valueOf(content, `[data-builder-field="${field}"]`)) || 0;
        draft.status = valueOf(content, '[data-builder-field="status"]', 'active');
        draft.notes = valueOf(content, '[data-builder-field="notes"]');
        draft.meals = [...content.querySelectorAll('[data-meal-index]')].map((mealElement, mealIndex) => ({
            name: valueOf(mealElement, '[data-meal-field="name"]', `وجبة ${mealIndex + 1}`), mealTime: valueOf(mealElement, '[data-meal-field="mealTime"]'), sortOrder: mealIndex, notes: valueOf(mealElement, '[data-meal-field="notes"]'), items: [...mealElement.querySelectorAll('[data-food-index]')].map((itemElement, itemIndex) => ({ foodId: Number(valueOf(itemElement, '[data-food-field="foodId"]')) || '', sortOrder: itemIndex, assignedQuantity: Number(valueOf(itemElement, '[data-food-field="assignedQuantity"]')) || 0, servingUnit: valueOf(itemElement, '[data-food-field="servingUnit"]'), notes: valueOf(itemElement, '[data-food-field="notes"]') }))
        }));
        return draft;
    }

    function selectOptions(items, current, label) {
        return `<option value="">${label}</option>${items.map((item) => `<option value="${item.id}" ${String(item.id) === String(current) ? 'selected' : ''}>${escapeHtml(itemName(item))}</option>`).join('')}`;
    }

    function renderWorkoutBuilder() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        const routines = draft.routines.map((routine, routineIndex) => `<article class="builder-routine" data-routine-index="${routineIndex}"><div class="builder-card-head"><div><span>اليوم ${routineIndex + 1}</span><strong>${escapeHtml(routine.name || 'يوم جديد')}</strong></div><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-routine" data-index="${routineIndex}">حذف اليوم</button></div><div class="builder-inline-fields"><label>اسم اليوم<input data-routine-field="name" value="${escapeHtml(routine.name)}"></label><label>اليوم في الأسبوع<select data-routine-field="dayOfWeek"><option value="">—</option>${[1, 2, 3, 4, 5, 6, 7].map((day) => `<option value="${day}" ${Number(routine.dayOfWeek) === day ? 'selected' : ''}>اليوم ${day}</option>`).join('')}</select></label></div><div class="builder-exercises">${routine.exercises.map((exercise, exerciseIndex) => `<div class="builder-exercise" data-exercise-index="${exerciseIndex}"><div class="builder-exercise-head"><strong>تمرين ${exerciseIndex + 1}</strong><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-exercise" data-routine="${routineIndex}" data-index="${exerciseIndex}">حذف</button></div><label class="builder-wide-label">التمرين<select data-exercise-field="exerciseId">${selectOptions(state.catalog.exercises, exercise.exerciseId, 'اختر تمرينًا')}</select></label><div class="builder-mini-grid"><label>مجموعات<input type="number" min="1" max="100" data-exercise-field="sets" value="${escapeHtml(exercise.sets)}"></label><label>تكرارات من<input type="number" min="1" data-exercise-field="repsMin" value="${escapeHtml(exercise.repsMin ?? '')}"></label><label>تكرارات إلى<input type="number" min="1" data-exercise-field="repsMax" value="${escapeHtml(exercise.repsMax ?? '')}"></label><label>الوزن كجم<input type="number" min="0" step="0.5" data-exercise-field="weightKg" value="${escapeHtml(exercise.weightKg ?? '')}"></label><label>الراحة بالثانية<input type="number" min="0" data-exercise-field="restSeconds" value="${escapeHtml(exercise.restSeconds ?? '')}"></label><label>Tempo<input data-exercise-field="tempo" value="${escapeHtml(exercise.tempo || '')}"></label></div></div>`).join('')}</div><button type="button" class="btn btn-light builder-add-item" data-builder-action="add-exercise" data-routine="${routineIndex}">+ إضافة تمرين</button></article>`).join('');
        content.innerHTML = `<div class="builder-switch"><span>برنامج تدريب</span><span class="builder-chip">حفظ ذري داخل قاعدة البيانات</span></div><div class="builder-basic-grid"><label>اسم البرنامج *<input required data-builder-field="name" value="${escapeHtml(draft.name)}"></label><label>البداية *<input required type="date" data-builder-field="startDate" value="${escapeHtml(draft.startDate)}"></label><label>النهاية<input type="date" data-builder-field="endDate" value="${escapeHtml(draft.endDate || '')}"></label><label>المدة بالأسابيع<input type="number" min="1" max="520" data-builder-field="durationWeeks" value="${escapeHtml(draft.durationWeeks || '')}"></label><label>الهدف<select data-builder-field="goal">${['بناء العضلات', 'زيادة القوة', 'حرق الدهون', 'لياقة عامة', 'التحمل'].map((item) => `<option ${item === draft.goal ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label>المستوى<select data-builder-field="level">${['مبتدئ', 'متوسط', 'متقدم'].map((item) => `<option ${item === draft.level ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label>أيام التدريب أسبوعيًا<input type="number" min="1" max="7" data-builder-field="daysPerWeek" value="${escapeHtml(draft.daysPerWeek || '')}"></label><label>الحالة<select data-builder-field="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${draft.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label class="builder-wide-label">وصف البرنامج<textarea data-builder-field="description" rows="2">${escapeHtml(draft.description || '')}</textarea></label><div class="builder-structure-head"><div><h4>بناء أيام التدريب</h4><small>أضف الأيام والتمارين من مكتبة TOP GYM.</small></div><button type="button" class="btn btn-primary btn-small" data-builder-action="add-routine">+ إضافة يوم</button></div><div class="builder-routines">${routines || '<div class="builder-empty">لم تضف أيامًا بعد.</div>'}</div><label class="builder-wide-label">ملاحظات<textarea data-builder-field="notes" rows="2">${escapeHtml(draft.notes || '')}</textarea></label>`;
    }

    function renderDietBuilder() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        const meals = draft.meals.map((meal, mealIndex) => `<article class="builder-meal" data-meal-index="${mealIndex}"><div class="builder-card-head"><div><span>وجبة ${mealIndex + 1}</span><strong>${escapeHtml(meal.name || 'وجبة جديدة')}</strong></div><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-meal" data-index="${mealIndex}">حذف الوجبة</button></div><div class="builder-inline-fields"><label>اسم الوجبة<input data-meal-field="name" value="${escapeHtml(meal.name)}"></label><label>وقت الوجبة<input type="time" data-meal-field="mealTime" value="${escapeHtml(meal.mealTime || '')}"></label></div><div class="builder-foods">${meal.items.map((item, itemIndex) => `<div class="builder-food" data-food-index="${itemIndex}"><label>الطعام<select data-food-field="foodId">${selectOptions(state.catalog.foods, item.foodId, 'اختر طعامًا')}</select></label><label>الكمية<input type="number" min="0.1" step="0.1" data-food-field="assignedQuantity" value="${escapeHtml(item.assignedQuantity)}"></label><label>الوحدة<input data-food-field="servingUnit" value="${escapeHtml(item.servingUnit || '')}" placeholder="جرام"></label><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-food" data-meal="${mealIndex}" data-index="${itemIndex}">حذف</button></div>`).join('')}</div><button type="button" class="btn btn-light builder-add-item" data-builder-action="add-food" data-meal="${mealIndex}">+ إضافة طعام</button></article>`).join('');
        const totals = draft.meals.reduce((total, meal) => meal.items.reduce((sum, item) => { const food = state.catalog.foods.find((candidate) => String(candidate.id) === String(item.foodId)); if (food) { const factor = Number(item.assignedQuantity || 0) / (Number(food.servingSize || 100) || 100); sum.calories += Number(food.calories || 0) * factor; sum.protein += Number(food.protein || 0) * factor; sum.carbs += Number(food.carbs || 0) * factor; sum.fats += Number(food.fat || 0) * factor; } return sum; }, total), { calories: 0, protein: 0, carbs: 0, fats: 0 });
        content.innerHTML = `<div class="builder-switch"><span>خطة تغذية</span><span class="builder-chip">القيم الغذائية Snapshot وقت الحفظ</span></div><div class="builder-basic-grid"><label>اسم الخطة *<input required data-builder-field="name" value="${escapeHtml(draft.name)}"></label><label>البداية *<input required type="date" data-builder-field="startDate" value="${escapeHtml(draft.startDate)}"></label><label>النهاية<input type="date" data-builder-field="endDate" value="${escapeHtml(draft.endDate || '')}"></label><label>عدد الوجبات<input type="number" min="1" max="12" data-builder-field="mealsPerDay" value="${escapeHtml(draft.mealsPerDay || '')}"></label><label>السعرات المستهدفة<input type="number" min="0" data-builder-field="targetCalories" value="${escapeHtml(draft.targetCalories || '')}"></label><label>البروتين المستهدف<input type="number" min="0" data-builder-field="targetProtein" value="${escapeHtml(draft.targetProtein || '')}"></label><label>الكربوهيدرات المستهدفة<input type="number" min="0" data-builder-field="targetCarbs" value="${escapeHtml(draft.targetCarbs || '')}"></label><label>الدهون المستهدفة<input type="number" min="0" data-builder-field="targetFats" value="${escapeHtml(draft.targetFats || '')}"></label><label>الحالة<select data-builder-field="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${draft.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="diet-live-summary"><span>المحسوب الآن <b>${number(totals.calories, 0)} سعر</b></span><span>بروتين <b>${number(totals.protein, 1)} ج</b></span><span>كربوهيدرات <b>${number(totals.carbs, 1)} ج</b></span><span>دهون <b>${number(totals.fats, 1)} ج</b></span></div><label class="builder-wide-label">وصف الخطة<textarea data-builder-field="description" rows="2">${escapeHtml(draft.description || '')}</textarea></label><div class="builder-structure-head"><div><h4>بناء الوجبات</h4><small>اختر الطعام والكمية، وسيحسب النظام القيم ويحفظها مع الخطة.</small></div><button type="button" class="btn btn-primary btn-small" data-builder-action="add-meal">+ إضافة وجبة</button></div><div class="builder-meals">${meals || '<div class="builder-empty">لم تضف وجبات بعد.</div>'}</div><label class="builder-wide-label">ملاحظات<textarea data-builder-field="notes" rows="2">${escapeHtml(draft.notes || '')}</textarea></label>`;
    }

    function renderBuilder() { if (state.builder?.type === 'workout') renderWorkoutBuilder(); else renderDietBuilder(); }

    async function openBuilder(type, memberId, id = null, memberName = '') {
        try {
            await loadCatalog();
            let draft = type === 'workout' ? blankWorkout(memberId) : blankDiet(memberId);
            if (id) draft = type === 'workout' ? await requestJson(`/api/workoutprograms/${id}`).then((data) => data.program) : await requestJson(`/api/dietplans/${id}`).then((data) => data.plan);
            state.builder = { type, memberId: Number(memberId), id: id ? Number(id) : null, draft };
            $('coachingBuilderId').value = id || '';
            $('coachingBuilderMemberId').value = memberId;
            $('coachingBuilderTitle').textContent = `${id ? 'تعديل' : 'إنشاء'} ${type === 'workout' ? 'برنامج تدريب' : 'خطة تغذية'}`;
            $('coachingBuilderSubtitle').textContent = `العميل: ${memberName || draft.memberName || state.profile?.member?.fullName || 'العميل الحالي'} · الحفظ يتم بالكامل داخل Transaction واحدة.`;
            renderBuilder();
            openDialog($('coachingBuilderDialog'));
        } catch (error) { notify(error.message, 'error'); }
    }

    function handleBuilderAction(button) {
        if (!state.builder) return;
        const draft = state.builder.type === 'workout' ? readWorkoutDraft() : readDietDraft();
        const action = button.dataset.builderAction;
        const index = Number(button.dataset.index);
        if (state.builder.type === 'workout') {
            if (action === 'add-routine') draft.routines.push({ name: `اليوم ${draft.routines.length + 1}`, dayOfWeek: draft.routines.length + 1, sortOrder: draft.routines.length, notes: '', exercises: [{ ...blankWorkout(state.builder.memberId).routines[0].exercises[0] }] });
            if (action === 'remove-routine') draft.routines.splice(index, 1);
            if (action === 'add-exercise') draft.routines[Number(button.dataset.routine)]?.exercises.push({ ...blankWorkout(state.builder.memberId).routines[0].exercises[0] });
            if (action === 'remove-exercise') draft.routines[Number(button.dataset.routine)]?.exercises.splice(index, 1);
        } else {
            if (action === 'add-meal') draft.meals.push({ name: `وجبة ${draft.meals.length + 1}`, mealTime: '', sortOrder: draft.meals.length, notes: '', items: [{ ...blankDiet(state.builder.memberId).meals[0].items[0] }] });
            if (action === 'remove-meal') draft.meals.splice(index, 1);
            if (action === 'add-food') draft.meals[Number(button.dataset.meal)]?.items.push({ ...blankDiet(state.builder.memberId).meals[0].items[0] });
            if (action === 'remove-food') draft.meals[Number(button.dataset.meal)]?.items.splice(index, 1);
        }
        state.builder.draft = draft;
        renderBuilder();
    }

    async function saveBuilder(event) {
        event.preventDefault();
        if (!state.builder) return;
        const draft = state.builder.type === 'workout' ? readWorkoutDraft() : readDietDraft();
        draft.memberId = state.builder.memberId;
        if (state.builder.id) draft.version = state.builder.draft.version;
        const button = $('coachingBuilderSave');
        button.disabled = true;
        try {
            const base = state.builder.type === 'workout' ? '/api/workoutprograms' : '/api/dietplans';
            await requestJson(state.builder.id ? `${base}/${state.builder.id}` : base, { method: state.builder.id ? 'PUT' : 'POST', body: JSON.stringify(draft) });
            closeDialog($('coachingBuilderDialog'));
            notify(`تم ${state.builder.id ? 'تعديل' : 'إنشاء'} ${state.builder.type === 'workout' ? 'برنامج التدريب' : 'خطة التغذية'} بنجاح.`);
            const memberId = state.builder.memberId;
            state.builder = null;
            state.loaded = false;
            await loadTrainees(true);
            if ($('coachingProfileDialog')?.open) openProfile(memberId);
            window.dispatchEvent(new CustomEvent('topgym:coaching-updated', { detail: { memberId } }));
        } catch (error) { notify(error.message, 'error'); }
        finally { button.disabled = false; }
    }

    /* Builder v2: staged workflow, live calculations, compact rows and review before save. */
    function builderOptionList(items, current, placeholder, getLabel = itemName) {
        return `<option value="">${escapeHtml(placeholder)}</option>${(items || []).map((item) => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(current) ? 'selected' : ''}>${escapeHtml(getLabel(item))}</option>`).join('')}`;
    }

    async function loadBuilderClients() {
        if (state.builderClients?.length) return state.builderClients;
        if (state.builderClientsPromise) return state.builderClientsPromise;
        state.builderClientsPromise = requestJson('/api/coaching/clients?limit=300')
            .then((data) => {
                state.builderClients = data.clients || [];
                return state.builderClients;
            })
            .catch(() => {
                state.builderClients = [];
                return state.builderClients;
            });
        try {
            return await state.builderClientsPromise;
        } finally {
            state.builderClientsPromise = null;
        }
    }

    function builderClientOptions(selectedId, memberName = '') {
        const clients = [...(state.builderClients || [])];
        if (selectedId && !clients.some((client) => String(client.id) === String(selectedId))) clients.unshift({ id: selectedId, fullName: memberName || 'العميل الحالي', phone: '' });
        return builderOptionList(clients, selectedId, 'اختر العميل', (client) => `${client.fullName || 'عميل'}${client.phone ? ` · ${client.phone}` : ''}`);
    }

    function builderValue(root, selector, fallback = '') {
        return root?.querySelector(selector)?.value ?? fallback;
    }

    function builderNum(value, digits = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed.toLocaleString('ar-EG', { maximumFractionDigits: digits }) : '—';
    }

    function builderDate(value) {
        if (!value) return '—';
        try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'medium' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`)); } catch (_) { return String(value); }
    }

    function blankBuilderWorkout(memberId, memberName = '') {
        const exerciseId = state.catalog.exercises[0]?.id || '';
        return { memberId: Number(memberId), memberName, name: '', description: '', startDate: today(), endDate: '', durationWeeks: 4, goal: 'بناء العضلات', level: 'مبتدئ', daysPerWeek: 3, status: 'active', notes: '', version: null, routines: [{ name: 'اليوم الأول', dayOfWeek: 1, sortOrder: 0, notes: '', exercises: [{ exerciseId, sortOrder: 0, sets: 3, repsMin: 10, repsMax: 12, weightKg: '', restSeconds: 90, tempo: '', supersetGroupId: '', notes: '' }] }] };
    }

    function blankBuilderDiet(memberId, memberName = '') {
        const foodId = state.catalog.foods[0]?.id || '';
        const names = ['الفطور', 'وجبة خفيفة', 'الغداء', 'العشاء'];
        return { memberId: Number(memberId), memberName, name: '', description: '', startDate: today(), endDate: '', mealsPerDay: 4, targetCalories: 2200, targetProtein: 165, targetCarbs: 220, targetFats: 73, calorieGoal: 'maintain', calorieAdjustment: 0, calculator: { weightKg: '', heightCm: '', age: '', gender: 'male', activity: 'moderate', bmr: null, tdee: null, measurementDate: '' }, status: 'active', notes: '', version: null, meals: names.map((name, index) => ({ name, mealTime: '', sortOrder: index, notes: '', items: [{ foodId, sortOrder: 0, assignedQuantity: 100, servingUnit: '', notes: '' }] })) };
    }

    function readBuilderWorkoutDraft() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        const memberId = Number(builderValue(content, '[data-builder-field="memberId"]', draft.memberId));
        if (memberId) draft.memberId = memberId;
        draft.name = builderValue(content, '[data-builder-field="name"]', draft.name);
        draft.description = builderValue(content, '[data-builder-field="description"]', draft.description);
        draft.startDate = builderValue(content, '[data-builder-field="startDate"]', draft.startDate);
        draft.endDate = builderValue(content, '[data-builder-field="endDate"]', draft.endDate);
        draft.durationWeeks = Number(builderValue(content, '[data-builder-field="durationWeeks"]', draft.durationWeeks)) || null;
        draft.goal = builderValue(content, '[data-builder-field="goal"]', draft.goal);
        draft.level = builderValue(content, '[data-builder-field="level"]', draft.level);
        draft.daysPerWeek = Number(builderValue(content, '[data-builder-field="daysPerWeek"]', draft.daysPerWeek)) || null;
        draft.status = builderValue(content, '[data-builder-field="status"]', draft.status || 'active');
        draft.notes = builderValue(content, '[data-builder-field="notes"]', draft.notes);
        const routineElements = [...content.querySelectorAll('[data-routine-index]')];
        if (routineElements.length) draft.routines = routineElements.map((routineElement, routineIndex) => ({
            name: builderValue(routineElement, '[data-routine-field="name"]', `اليوم ${routineIndex + 1}`),
            dayOfWeek: Number(builderValue(routineElement, '[data-routine-field="dayOfWeek"]')) || null,
            sortOrder: routineIndex,
            notes: builderValue(routineElement, '[data-routine-field="notes"]'),
            exercises: [...routineElement.querySelectorAll('[data-exercise-index]')].map((exerciseElement, exerciseIndex) => ({
                exerciseId: Number(builderValue(exerciseElement, '[data-exercise-field="exerciseId"]')) || '',
                sortOrder: exerciseIndex,
                sets: Number(builderValue(exerciseElement, '[data-exercise-field="sets"]')) || 3,
                repsMin: Number(builderValue(exerciseElement, '[data-exercise-field="repsMin"]')) || null,
                repsMax: Number(builderValue(exerciseElement, '[data-exercise-field="repsMax"]')) || null,
                weightKg: builderValue(exerciseElement, '[data-exercise-field="weightKg"]'),
                restSeconds: Number(builderValue(exerciseElement, '[data-exercise-field="restSeconds"]')) || 0,
                rir: builderValue(exerciseElement, '[data-exercise-field="rir"]') === '' ? null : Number(builderValue(exerciseElement, '[data-exercise-field="rir"]')),
                rpe: builderValue(exerciseElement, '[data-exercise-field="rpe"]') === '' ? null : Number(builderValue(exerciseElement, '[data-exercise-field="rpe"]')),
                tempo: builderValue(exerciseElement, '[data-exercise-field="tempo"]'),
                supersetGroupId: builderValue(exerciseElement, '[data-exercise-field="supersetGroupId"]'),
                notes: builderValue(exerciseElement, '[data-exercise-field="notes"]')
            }))
        }));
        return draft;
    }

    function readBuilderDietDraft() {
        const draft = state.builder.draft;
        const content = $('coachingBuilderContent');
        const memberId = Number(builderValue(content, '[data-builder-field="memberId"]', draft.memberId));
        if (memberId) draft.memberId = memberId;
        draft.name = builderValue(content, '[data-builder-field="name"]', draft.name);
        draft.description = builderValue(content, '[data-builder-field="description"]', draft.description);
        draft.startDate = builderValue(content, '[data-builder-field="startDate"]', draft.startDate);
        draft.endDate = builderValue(content, '[data-builder-field="endDate"]', draft.endDate);
        draft.mealsPerDay = Number(builderValue(content, '[data-builder-field="mealsPerDay"]', draft.mealsPerDay)) || null;
        for (const field of ['targetCalories', 'targetProtein', 'targetCarbs', 'targetFats', 'calorieAdjustment']) draft[field] = Number(builderValue(content, `[data-builder-field="${field}"]`, draft[field])) || 0;
        draft.calorieGoal = builderValue(content, '[data-builder-field="calorieGoal"]', draft.calorieGoal || 'maintain');
        draft.status = builderValue(content, '[data-builder-field="status"]', draft.status || 'active');
        draft.notes = builderValue(content, '[data-builder-field="notes"]', draft.notes);
        draft.calculator = { ...(draft.calculator || {}) };
        for (const field of ['weightKg', 'heightCm', 'age', 'gender', 'activity']) draft.calculator[field] = builderValue(content, `[data-calculator-field="${field}"]`, draft.calculator[field] || '');
        const mealElements = [...content.querySelectorAll('[data-meal-index]')];
        if (mealElements.length) draft.meals = mealElements.map((mealElement, mealIndex) => ({
            name: builderValue(mealElement, '[data-meal-field="name"]', `وجبة ${mealIndex + 1}`),
            mealTime: builderValue(mealElement, '[data-meal-field="mealTime"]'),
            sortOrder: mealIndex,
            notes: builderValue(mealElement, '[data-meal-field="notes"]'),
            items: [...mealElement.querySelectorAll('[data-food-index]')].map((itemElement, itemIndex) => ({
                foodId: Number(builderValue(itemElement, '[data-food-field="foodId"]')) || '',
                sortOrder: itemIndex,
                assignedQuantity: Number(builderValue(itemElement, '[data-food-field="assignedQuantity"]')) || 0,
                servingUnit: builderValue(itemElement, '[data-food-field="servingUnit"]'),
                notes: builderValue(itemElement, '[data-food-field="notes"]')
            }))
        }));
        return draft;
    }

    function activeBuilderDraft() {
        return state.builder.type === 'diet' ? readBuilderDietDraft() : readBuilderWorkoutDraft();
    }

    function dietFoodMetrics(item) {
        const food = state.catalog.foods.find((candidate) => String(candidate.id) === String(item.foodId));
        if (!food) return { food: null, calories: 0, protein: 0, carbs: 0, fats: 0 };
        const factor = Number(item.assignedQuantity || 0) / (Number(food.servingSize || 100) || 100);
        return { food, calories: Number(food.calories || 0) * factor, protein: Number(food.protein || 0) * factor, carbs: Number(food.carbs || 0) * factor, fats: Number(food.fat || 0) * factor };
    }

    function dietMealTotals(meal) {
        return meal.items.reduce((total, item) => { const values = dietFoodMetrics(item); total.calories += values.calories; total.protein += values.protein; total.carbs += values.carbs; total.fats += values.fats; return total; }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
    }

    function dietTotals(draft) {
        return draft.meals.reduce((total, meal) => { const values = dietMealTotals(meal); total.calories += values.calories; total.protein += values.protein; total.carbs += values.carbs; total.fats += values.fats; return total; }, { calories: 0, protein: 0, carbs: 0, fats: 0 });
    }

    function syncDietMealCount(draft, count) {
        const desired = Math.min(6, Math.max(3, Number(count) || 4));
        const names = ['Ø§Ù„ÙØ·ÙˆØ±', 'ÙˆØ¬Ø¨Ø© Ø®ÙÙŠÙØ©', 'Ø§Ù„ØºØ¯Ø§Ø¡', 'Ø§Ù„Ø¹Ø´Ø§Ø¡', 'ÙˆØ¬Ø¨Ø© Ø®ÙÙŠÙØ© 2', 'ÙˆØ¬Ø¨Ø© Ø®ÙÙŠÙØ© 3'];
        while (draft.meals.length < desired) {
            const index = draft.meals.length;
            draft.meals.push({ name: names[index] || `ÙˆØ¬Ø¨Ø© ${index + 1}`, mealTime: '', sortOrder: index, notes: '', items: [{ foodId: state.catalog.foods[0]?.id || '', sortOrder: 0, assignedQuantity: 100, servingUnit: '', notes: '' }] });
        }
        if (draft.meals.length > desired) draft.meals = draft.meals.slice(0, desired);
        draft.meals.forEach((meal, index) => { meal.sortOrder = index; if (!meal.name) meal.name = names[index] || `ÙˆØ¬Ø¨Ø© ${index + 1}`; });
        draft.mealsPerDay = desired;
        return draft;
    }

    function calculateDietEnergy(draft) {
        const calculator = draft.calculator || {};
        const weight = Number(calculator.weightKg);
        const height = Number(calculator.heightCm);
        const age = Number(calculator.age);
        if (![weight, height, age].every((value) => Number.isFinite(value) && value > 0)) return null;
        const bmr = (calculator.gender || 'male') === 'female' ? (10 * weight) + (6.25 * height) - (5 * age) - 161 : (10 * weight) + (6.25 * height) - (5 * age) + 5;
        const activityFactors = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, very_high: 1.9 };
        const tdee = bmr * (activityFactors[calculator.activity] || activityFactors.moderate);
        const adjustment = Number(draft.calorieAdjustment || 0);
        return { bmr, tdee, target: Math.max(0, tdee + adjustment) };
    }

    function applyDietCalories() {
        const draft = readBuilderDietDraft();
        const result = calculateDietEnergy(draft);
        if (!result) { notify('أدخل الوزن والطول والعمر أولاً لحساب السعرات.', 'error'); return; }
        draft.calculator.bmr = result.bmr;
        draft.calculator.tdee = result.tdee;
        draft.targetCalories = Math.round(result.target);
        draft.targetProtein = Math.round((draft.targetCalories * 0.30) / 4);
        draft.targetCarbs = Math.round((draft.targetCalories * 0.40) / 4);
        draft.targetFats = Math.round((draft.targetCalories * 0.30) / 9);
        state.builder.draft = draft;
        renderBuilder();
        notify('تم تطبيق السعرات والماكروز بتوزيع 30% بروتين · 40% كارب · 30% دهون.');
    }

    function workoutStats(draft) {
        const muscles = {};
        let exercises = 0;
        let sets = 0;
        let volume = 0;
        draft.routines.forEach((routine) => routine.exercises.forEach((exercise) => {
            exercises += 1;
            sets += Number(exercise.sets || 0);
            const reps = ((Number(exercise.repsMin) || 0) + (Number(exercise.repsMax) || Number(exercise.repsMin) || 0)) / 2;
            volume += Number(exercise.sets || 0) * reps * Number(exercise.weightKg || 0);
            const libraryExercise = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId));
            const muscle = libraryExercise?.targetMuscleNameAr || libraryExercise?.targetMuscleName || 'غير محددة';
            muscles[muscle] = (muscles[muscle] || 0) + Number(exercise.sets || 0);
        }));
        return { exercises, sets, volume, muscles };
    }

    function builderBasicComplete(draft) {
        return Boolean(Number(draft.memberId) > 0 && String(draft.name || '').trim() && draft.startDate);
    }

    function builderStructureComplete(draft) {
        if (state.builder.type === 'diet') return draft.meals.length > 0 && draft.meals.every((meal) => meal.items.length > 0 && meal.items.every((item) => Number(item.foodId) > 0 && Number(item.assignedQuantity) > 0));
        return draft.routines.length > 0 && draft.routines.every((routine) => routine.exercises.length > 0 && routine.exercises.every((exercise) => Number(exercise.exerciseId) > 0));
    }

    function renderBuilderChrome() {
        const step = state.builder.step;
        const steps = state.builder.type === 'diet' ? ['المعلومات وحساب السعرات', 'بناء الوجبات', 'المراجعة والحفظ'] : ['بيانات البرنامج', 'بناء الأيام والتمارين', 'المراجعة والحفظ'];
        $('coachingBuilderStepper').innerHTML = steps.map((label, index) => { const number = index + 1; return `<button type="button" class="builder-step ${number === step ? 'active' : ''} ${number < step ? 'complete' : ''}" data-builder-step-target="${number}" ${number > step ? 'disabled' : ''}><span>${number}</span><strong>${label}</strong></button>`; }).join('');
        const draft = state.builder.draft;
        const basicDone = builderBasicComplete(draft);
        const structureDone = builderStructureComplete(draft);
        const structureCount = state.builder.type === 'diet' ? `${draft.meals.length} وجبات · ${draft.meals.reduce((sum, meal) => sum + meal.items.length, 0)} أطعمة` : `${draft.routines.length} أيام · ${workoutStats(draft).exercises} تمارين`;
        $('coachingBuilderProgress').innerHTML = `<div class="builder-progress-track"><span class="${basicDone ? 'complete' : ''}">١ <b>البيانات الأساسية</b></span><i class="${basicDone ? 'complete' : ''}"></i><span class="${structureDone ? 'complete' : ''}">٢ <b>${structureCount}</b></span><i class="${structureDone ? 'complete' : ''}"></i><span class="${step === 3 ? 'active' : ''}">٣ <b>مراجعة قبل الحفظ</b></span></div>`;
        $('coachingBuilderBack').hidden = step === 1;
        $('coachingBuilderPreview').hidden = step !== 2;
        $('coachingBuilderPrint').hidden = step !== 3;
        $('coachingBuilderPdf').hidden = step !== 3;
        $('coachingBuilderNext').hidden = step === 3;
        $('coachingBuilderSave').hidden = step !== 3;
        if ($('coachingBuilderSave')) $('coachingBuilderSave').dataset.requiredPermission = state.builder.id ? 'coaching.update' : 'coaching.create';
        if ($('coachingBuilderPrint')) $('coachingBuilderPrint').dataset.requiredPermission = 'coaching.read';
        if ($('coachingBuilderPdf')) $('coachingBuilderPdf').dataset.requiredPermission = 'coaching.read';
        $('coachingBuilderNext').textContent = step === 1 ? 'التالي: بناء النظام' : 'التالي: المراجعة';
    }

    function renderBuilderClientField(draft, locked = false) {
        return `<label class="builder-client-field">العميل *<select data-builder-field="memberId" ${locked ? 'disabled' : ''}>${builderClientOptions(draft.memberId, draft.memberName)}</select><small>${draft.memberName ? `الملف الحالي: ${escapeHtml(draft.memberName)}` : 'اختر العميل الذي سيُحفظ النظام باسمه.'}</small></label>`;
    }

    function renderDietStepOne() {
        const draft = state.builder.draft;
        const calculator = draft.calculator || {};
        const energy = calculateDietEnergy(draft);
        const goalLabels = { lose: 'خسارة وزن', maintain: 'تثبيت الوزن', gain: 'زيادة وزن' };
        const activityLabels = { sedentary: 'قليل جدًا', light: 'خفيف', moderate: 'متوسط', high: 'مرتفع', very_high: 'مرتفع جدًا' };
        const latestNote = calculator.measurementDate ? `تم جلب الوزن والطول من آخر قياس بتاريخ ${builderDate(calculator.measurementDate)}.` : 'يمكن تعبئة القياسات يدويًا أو إضافة قياس من ملف العميل.';
        $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-diet-basics"><div class="builder-stage-heading"><div><span>المرحلة الأولى</span><h4>المعلومات الأساسية وحساب السعرات</h4><p>احسب الاحتياج اليومي ثم طبّق الهدف والماكروز على الخطة قبل بناء الوجبات.</p></div><span class="builder-lock-chip">حفظ آمن داخل Transaction</span></div><div class="builder-basic-grid">${renderBuilderClientField(draft, Boolean(state.builder.id))}<label>اسم الخطة *<input required data-builder-field="name" value="${escapeHtml(draft.name)}" placeholder="مثال: خطة بناء العضلات"></label><label>تاريخ البداية *<input required type="date" data-builder-field="startDate" value="${escapeHtml(draft.startDate)}"></label><label>تاريخ النهاية<input type="date" data-builder-field="endDate" value="${escapeHtml(draft.endDate || '')}"></label><label>عدد الوجبات اليومية<select data-builder-field="mealsPerDay">${[3, 4, 5, 6].map((value) => `<option value="${value}" ${Number(draft.mealsPerDay) === value ? 'selected' : ''}>${value} وجبات</option>`).join('')}</select></label><label>الحالة<select data-builder-field="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${draft.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="builder-calculator"><div class="builder-section-title"><div><span>حاسبة BMR / TDEE</span><h4>الاحتياج اليومي للعميل</h4><small>${latestNote}</small></div><span class="builder-formula-chip">Mifflin–St Jeor</span></div><div class="calculator-grid"><label>الوزن كجم<input type="number" min="1" step="0.1" data-calculator-field="weightKg" value="${escapeHtml(calculator.weightKg || '')}"></label><label>الطول سم<input type="number" min="1" step="0.1" data-calculator-field="heightCm" value="${escapeHtml(calculator.heightCm || '')}"></label><label>العمر<input type="number" min="1" max="120" data-calculator-field="age" value="${escapeHtml(calculator.age || '')}"></label><label>النوع<select data-calculator-field="gender"><option value="male" ${calculator.gender === 'male' ? 'selected' : ''}>ذكر</option><option value="female" ${calculator.gender === 'female' ? 'selected' : ''}>أنثى</option></select></label><label>مستوى النشاط<select data-calculator-field="activity">${Object.entries(activityLabels).map(([key, label]) => `<option value="${key}" ${calculator.activity === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>الهدف<select data-builder-field="calorieGoal">${Object.entries(goalLabels).map(([key, label]) => `<option value="${key}" ${draft.calorieGoal === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>العجز / الفائض بالسعرات<input type="number" step="50" data-builder-field="calorieAdjustment" value="${escapeHtml(draft.calorieAdjustment || 0)}"><small>سالب للخسارة وموجب للزيادة</small></label></div><div class="calculator-results"><div><span>BMR</span><strong id="dietBmrValue">${energy ? builderNum(energy.bmr) : '—'}</strong><small>السعرات الأساسية</small></div><div><span>TDEE</span><strong id="dietTdeeValue">${energy ? builderNum(energy.tdee) : '—'}</strong><small>الاحتياج مع النشاط</small></div><div><span>Target</span><strong id="dietTargetValue">${energy ? builderNum(energy.target) : builderNum(draft.targetCalories)}</strong><small>الهدف المقترح</small></div><button type="button" class="btn btn-primary" data-builder-action="apply-calories">تطبيق على الخطة</button></div></div><div class="builder-target-panel"><div class="builder-section-title"><div><span>أهداف الخطة</span><h4>Target Calories & Macros</h4></div><small>التوزيع الافتراضي: 30% بروتين · 40% كارب · 30% دهون</small></div><div class="target-grid"><label>Target Calories<input type="number" min="1" data-builder-field="targetCalories" value="${escapeHtml(draft.targetCalories || '')}"></label><label>Protein (g)<input type="number" min="0" step="0.1" data-builder-field="targetProtein" value="${escapeHtml(draft.targetProtein || '')}"></label><label>Carbs (g)<input type="number" min="0" step="0.1" data-builder-field="targetCarbs" value="${escapeHtml(draft.targetCarbs || '')}"></label><label>Fat (g)<input type="number" min="0" step="0.1" data-builder-field="targetFats" value="${escapeHtml(draft.targetFats || '')}"></label></div></div><label class="builder-wide-label">وصف الخطة<textarea data-builder-field="description" rows="2">${escapeHtml(draft.description || '')}</textarea></label><label class="builder-wide-label">ملاحظات<textarea data-builder-field="notes" rows="2">${escapeHtml(draft.notes || '')}</textarea></label></section>`;
    }

    function renderWorkoutStepOne() {
        const draft = state.builder.draft;
        $('coachingBuilderContent').innerHTML = `<section class="builder-stage"><div class="builder-stage-heading"><div><span>المرحلة الأولى</span><h4>بيانات البرنامج</h4><p>حدد هدف البرنامج ومستواه ومدته قبل توزيع الأيام والتمارين.</p></div><span class="builder-lock-chip">حفظ آمن داخل Transaction</span></div><div class="builder-basic-grid">${renderBuilderClientField(draft, Boolean(state.builder.id))}<label>اسم البرنامج *<input required data-builder-field="name" value="${escapeHtml(draft.name)}" placeholder="مثال: برنامج القوة الأساسي"></label><label>تاريخ البداية *<input required type="date" data-builder-field="startDate" value="${escapeHtml(draft.startDate)}"></label><label>تاريخ النهاية<input type="date" data-builder-field="endDate" value="${escapeHtml(draft.endDate || '')}"></label><label>المدة بالأسابيع<input type="number" min="1" max="520" data-builder-field="durationWeeks" value="${escapeHtml(draft.durationWeeks || '')}"></label><label>الهدف<select data-builder-field="goal">${['بناء العضلات', 'زيادة القوة', 'حرق الدهون', 'لياقة عامة', 'التحمل'].map((item) => `<option ${draft.goal === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label>المستوى<select data-builder-field="level">${['مبتدئ', 'متوسط', 'متقدم'].map((item) => `<option ${draft.level === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label>أيام التدريب أسبوعيًا<input type="number" min="1" max="7" data-builder-field="daysPerWeek" value="${escapeHtml(draft.daysPerWeek || '')}"></label><label>الحالة<select data-builder-field="status">${Object.entries(STATUS_LABELS).map(([key, label]) => `<option value="${key}" ${draft.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><label class="builder-wide-label">وصف البرنامج<textarea data-builder-field="description" rows="3">${escapeHtml(draft.description || '')}</textarea></label><label class="builder-wide-label">ملاحظات المدرب<textarea data-builder-field="notes" rows="2">${escapeHtml(draft.notes || '')}</textarea></label></section>`;
    }

    function renderDietLiveSummary(draft) {
        const totals = dietTotals(draft);
        const target = Number(draft.targetCalories || 0);
        const caloriePercent = target ? Math.min(100, Math.round((totals.calories / target) * 100)) : 0;
        const macro = (current, goal) => goal ? Math.min(100, Math.round((current / goal) * 100)) : 0;
        const summary = $('dietLiveSummary');
        if (!summary) return;
        summary.innerHTML = `<div class="nutrition-summary-head"><div><span>Live Nutrition Totals</span><strong>${builderNum(totals.calories)} <small>/ ${builderNum(target)} سعرة</small></strong></div><b>${caloriePercent}% مكتمل</b></div><div class="nutrition-total-progress"><i></i></div><div class="nutrition-macro-grid"><div><span>Protein</span><strong>${builderNum(totals.protein, 1)} / ${builderNum(draft.targetProtein, 1)}g</strong><i><b></b></i></div><div><span>Carbs</span><strong>${builderNum(totals.carbs, 1)} / ${builderNum(draft.targetCarbs, 1)}g</strong><i><b></b></i></div><div><span>Fat</span><strong>${builderNum(totals.fats, 1)} / ${builderNum(draft.targetFats, 1)}g</strong><i><b></b></i></div></div><div class="nutrition-summary-foot"><span>${draft.meals.length} وجبات</span><span>${draft.meals.reduce((sum, meal) => sum + meal.items.length, 0)} أطعمة</span><span>المتبقي ${builderNum(Math.max(0, target - totals.calories))} سعرة</span></div>`;
    }

    function renderDietStepTwo() {
        const draft = state.builder.draft;
        const meals = draft.meals.map((meal, mealIndex) => {
            const mealTotals = dietMealTotals(meal);
            const rows = meal.items.map((item, itemIndex) => {
                const values = dietFoodMetrics(item);
                return `<div class="builder-food-row" data-food-index="${itemIndex}"><label><span>Food</span><select data-food-field="foodId">${builderOptionList(state.catalog.foods, item.foodId, 'اختر طعامًا')}</select></label><label><span>الكمية</span><input type="number" min="0.1" step="0.1" data-food-field="assignedQuantity" value="${escapeHtml(item.assignedQuantity)}"></label><label><span>الوحدة</span><input data-food-field="servingUnit" value="${escapeHtml(item.servingUnit || '')}" placeholder="جرام"></label><div class="food-live-value"><b>${builderNum(values.calories, 0)}</b><small>سعرة</small></div><div class="food-live-value"><b>${builderNum(values.protein, 1)}g</b><small>Protein</small></div><div class="food-live-value"><b>${builderNum(values.carbs, 1)}g</b><small>Carbs</small></div><div class="food-live-value"><b>${builderNum(values.fats, 1)}g</b><small>Fat</small></div><button type="button" class="btn btn-danger btn-small row-delete-button" data-builder-action="remove-food" data-meal="${mealIndex}" data-index="${itemIndex}" aria-label="حذف الطعام">حذف</button></div>`;
            }).join('');
            return `<section class="builder-meal-row" data-meal-index="${mealIndex}"><div class="builder-meal-row-head"><div class="builder-meal-title"><span>${mealIndex + 1}</span><div><input data-meal-field="name" value="${escapeHtml(meal.name)}" aria-label="اسم الوجبة"><small>${meal.mealTime ? `موعد الوجبة: ${escapeHtml(meal.mealTime)}` : 'حدد موعد الوجبة'}</small></div></div><div class="builder-row-actions"><label class="meal-time-field">الوقت<input type="time" data-meal-field="mealTime" value="${escapeHtml(meal.mealTime || '')}"></label><button type="button" class="btn btn-light btn-small" data-builder-action="move-meal" data-index="${mealIndex}" data-direction="up" ${mealIndex === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn-light btn-small" data-builder-action="move-meal" data-index="${mealIndex}" data-direction="down" ${mealIndex === draft.meals.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-meal" data-index="${mealIndex}">حذف الوجبة</button></div></div><div class="builder-meal-row-summary"><span>${builderNum(mealTotals.calories, 0)} سعرة</span><span>${builderNum(mealTotals.protein, 1)}g Protein</span><span>${builderNum(mealTotals.carbs, 1)}g Carbs</span><span>${builderNum(mealTotals.fats, 1)}g Fat</span></div><div class="builder-food-table"><div class="builder-food-table-head"><span>الطعام</span><span>الكمية</span><span>الوحدة</span><span>Calories</span><span>Protein</span><span>Carbs</span><span>Fat</span><span></span></div>${rows || '<div class="builder-empty">أضف أول طعام لهذه الوجبة.</div>'}</div><label class="builder-row-note">ملاحظات الوجبة<input data-meal-field="notes" value="${escapeHtml(meal.notes || '')}"></label><button type="button" class="btn btn-light builder-add-item" data-builder-action="add-food" data-meal="${mealIndex}">+ إضافة Food</button></section>`;
        }).join('');
        $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-diet-builder"><div class="builder-builder-head"><div><span>المرحلة الثانية</span><h4>بناء الوجبات</h4><p>تتغير القيم فورًا عند تعديل الكمية أو الطعام.</p></div><button type="button" class="btn btn-primary btn-small" data-builder-action="add-meal">+ إضافة وجبة</button></div><div id="dietLiveSummary" class="diet-live-summary enhanced"></div><div class="builder-meals-list">${meals || '<div class="builder-empty">لم تضف وجبات بعد.</div>'}</div></section>`;
        renderDietLiveSummary(draft);
    }

    function exerciseReference(exercise) {
        const item = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId));
        if (!item) return '<span class="builder-reference-muted">اختر تمرينًا لعرض العضلة والتعليمات.</span>';
        const muscle = item.targetMuscleNameAr || item.targetMuscleName || 'غير محددة';
        const muscleRef = { id: item.targetMuscleId, nameAr: item.targetMuscleNameAr, name: item.targetMuscleName };
        const muscleVisual = `<span class="builder-reference-muscle">${muscleImage(muscleRef, { className: 'builder-reference-muscle-image', alt: muscle, icon: '💪' })}<b>${escapeHtml(muscle)}</b></span>`;
        const instruction = item.instructionsAr?.[0] || item.instructions?.[0] || item.descriptionAr || item.description || 'لا توجد تعليمات مسجلة.';
        const tip = item.tipsAr?.[0] || item.tips?.[0] || 'لا توجد نصائح مسجلة.';
        const mistake = item.commonMistakesAr?.[0] || item.commonMistakes?.[0] || 'لا توجد أخطاء شائعة مسجلة.';
        return `<div class="builder-exercise-reference"><div class="builder-reference-media">${exerciseImage(item, 'main', { className: 'exercise-media-builder', alt: itemName(item) })}</div><div class="builder-reference-copy"><span>العضلة المستهدفة: ${muscleVisual}</span><details><summary>التعليمات والنصائح</summary><p><b>التعليمات:</b> ${escapeHtml(instruction)}</p><p><b>نصيحة:</b> ${escapeHtml(tip)}</p><p><b>خطأ شائع:</b> ${escapeHtml(mistake)}</p></details></div></div>`;
    }

    function renderWorkoutMetrics(draft) {
        const stats = workoutStats(draft);
        const distributions = Object.entries(stats.muscles).sort(([, first], [, second]) => second - first).slice(0, 8);
        return `<div class="workout-metrics-grid"><article><span>إجمالي التمارين</span><strong>${builderNum(stats.exercises)}</strong></article><article><span>إجمالي المجموعات</span><strong>${builderNum(stats.sets)}</strong></article><article><span>حجم التدريب التقريبي</span><strong>${builderNum(stats.volume, 0)} <small>كجم</small></strong></article><article><span>الأيام</span><strong>${builderNum(draft.routines.length)}</strong></article></div><div class="muscle-distribution"><div class="builder-section-title"><div><span>Muscle Distribution</span><h4>توزيع الحمل على العضلات</h4></div><small>حسب مجموعات التمارين</small></div>${distributions.length ? distributions.map(([name, value]) => `<div class="muscle-bar"><span>${escapeHtml(name)}</span><b><i></i></b><strong>${value}</strong></div>`).join('') : '<div class="builder-reference-muted">أضف تمارين لعرض التوزيع.</div>'}</div>`;
    }

    function renderWorkoutStepTwo() {
        const draft = state.builder.draft;
        const activeRoutine = Math.min(Math.max(Number(state.builder.activeRoutine || 0), 0), Math.max(draft.routines.length - 1, 0));
        state.builder.activeRoutine = activeRoutine;
        const tabs = draft.routines.map((routine, index) => `<button type="button" class="builder-day-tab ${index === activeRoutine ? 'active' : ''}" data-builder-action="select-routine" data-index="${index}"><span>اليوم ${index + 1}</span><b>${escapeHtml(routine.name || 'يوم جديد')}</b><small>${routine.exercises.length} تمرين</small></button>`).join('');
        const panels = draft.routines.map((routine, routineIndex) => {
            const exerciseRows = routine.exercises.map((exercise, exerciseIndex) => `<div class="builder-exercise-row" data-exercise-index="${exerciseIndex}"><div class="exercise-row-number">${exerciseIndex + 1}</div><label class="exercise-select-field"><span>Exercise</span><select data-exercise-field="exerciseId">${builderOptionList(state.catalog.exercises, exercise.exerciseId, 'اختر تمرينًا', (item) => item.nameAr || item.name || item.nameEn)}</select></label><label><span>Sets</span><input type="number" min="1" max="100" data-exercise-field="sets" value="${escapeHtml(exercise.sets)}"></label><label><span>Reps من</span><input type="number" min="1" data-exercise-field="repsMin" value="${escapeHtml(exercise.repsMin ?? '')}"></label><label><span>Reps إلى</span><input type="number" min="1" data-exercise-field="repsMax" value="${escapeHtml(exercise.repsMax ?? '')}"></label><label><span>Weight kg</span><input type="number" min="0" step="0.5" data-exercise-field="weightKg" value="${escapeHtml(exercise.weightKg ?? '')}"></label><label><span>Rest sec</span><input type="number" min="0" data-exercise-field="restSeconds" value="${escapeHtml(exercise.restSeconds ?? '')}"></label><label><span>Tempo</span><input data-exercise-field="tempo" value="${escapeHtml(exercise.tempo || '')}" placeholder="3-1-2-0"></label><label><span>Superset</span><input data-exercise-field="supersetGroupId" value="${escapeHtml(exercise.supersetGroupId || '')}" placeholder="A"></label><button type="button" class="btn btn-danger btn-small row-delete-button" data-builder-action="remove-exercise" data-routine="${routineIndex}" data-index="${exerciseIndex}">حذف</button><div class="exercise-row-notes"><input data-exercise-field="notes" value="${escapeHtml(exercise.notes || '')}" placeholder="ملاحظات التمرين"><div>${exerciseReference(exercise)}</div></div></div>`).join('');
            return `<section class="builder-day-panel" data-routine-index="${routineIndex}" ${routineIndex === activeRoutine ? '' : 'hidden'}><div class="builder-day-panel-head"><div><label>اسم اليوم<input data-routine-field="name" value="${escapeHtml(routine.name)}"></label><label>يوم الأسبوع<select data-routine-field="dayOfWeek"><option value="">اختر اليوم</option>${[1, 2, 3, 4, 5, 6, 7].map((day) => `<option value="${day}" ${Number(routine.dayOfWeek) === day ? 'selected' : ''}>اليوم ${day}</option>`).join('')}</select></label></div><div class="builder-row-actions"><button type="button" class="btn btn-light btn-small" data-builder-action="move-routine" data-index="${routineIndex}" data-direction="up" ${routineIndex === 0 ? 'disabled' : ''}>↑</button><button type="button" class="btn btn-light btn-small" data-builder-action="move-routine" data-index="${routineIndex}" data-direction="down" ${routineIndex === draft.routines.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="btn btn-danger btn-small" data-builder-action="remove-routine" data-index="${routineIndex}">حذف اليوم</button></div></div><label class="builder-row-note">ملاحظات اليوم<input data-routine-field="notes" value="${escapeHtml(routine.notes || '')}"></label><div class="builder-exercise-table"><div class="builder-exercise-table-head"><span>#</span><span>Exercise</span><span>Sets</span><span>Reps</span><span>Weight</span><span>Rest</span><span>Tempo</span><span>Superset</span><span></span></div>${exerciseRows || '<div class="builder-empty">أضف أول تمرين لهذا اليوم.</div>'}</div><button type="button" class="btn btn-light builder-add-item" data-builder-action="add-exercise" data-routine="${routineIndex}">+ إضافة تمرين</button></section>`;
        }).join('');
        $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-workout-builder"><div class="builder-builder-head"><div><span>المرحلة الثانية</span><h4>Workout Builder</h4><p>أضف الأيام والتمارين، وسيُحسب الحجم وتوزيع العضلات تلقائيًا.</p></div><button type="button" class="btn btn-primary btn-small" data-builder-action="add-routine">+ إضافة يوم</button></div><div class="builder-workout-metrics" id="workoutBuilderMetrics">${renderWorkoutMetrics(draft)}</div><div class="builder-day-tabs">${tabs || '<div class="builder-empty">أضف أول يوم تدريب.</div>'}</div><div class="builder-day-panels">${panels}</div></section>`;
    }

    function renderBuilderReview() {
        const draft = state.builder.draft;
        const clientLabel = draft.memberName || (state.builderClients || []).find((client) => String(client.id) === String(draft.memberId))?.fullName || 'العميل المحدد';
        if (state.builder.type === 'diet') {
            const totals = dietTotals(draft);
            const mealRows = draft.meals.map((meal, index) => `<section class="review-block"><div class="review-block-head"><strong>${index + 1}. ${escapeHtml(meal.name)}</strong><span>${meal.mealTime ? escapeHtml(meal.mealTime) : 'بدون موعد'} · ${builderNum(dietMealTotals(meal).calories)} سعرة</span></div><table class="builder-review-table"><thead><tr><th>الطعام</th><th>الكمية</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>${meal.items.map((item) => { const values = dietFoodMetrics(item); return `<tr><td>${escapeHtml(values.food ? itemName(values.food) : '—')}</td><td>${builderNum(item.assignedQuantity, 1)} ${escapeHtml(item.servingUnit || values.food?.servingUnit || '')}</td><td>${builderNum(values.calories, 1)}</td><td>${builderNum(values.protein, 1)}g</td><td>${builderNum(values.carbs, 1)}g</td><td>${builderNum(values.fats, 1)}g</td></tr>`; }).join('')}</tbody></table></section>`).join('');
            $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-review"><div class="builder-stage-heading"><div><span>المرحلة الثالثة</span><h4>مراجعة خطة التغذية قبل الحفظ</h4><p>راجع بيانات العميل، الأهداف، والقيم الفعلية لكل وجبة.</p></div><span class="builder-ready-chip">جاهز للمراجعة</span></div><div class="review-identity"><strong>${escapeHtml(clientLabel)}</strong><span>${builderDate(draft.startDate)}${draft.endDate ? ` — ${builderDate(draft.endDate)}` : ''}</span></div><div class="review-summary-grid"><div><span>Target Calories</span><strong>${builderNum(draft.targetCalories)} سعرة</strong></div><div><span>Protein</span><strong>${builderNum(draft.targetProtein, 1)}g</strong></div><div><span>Carbs</span><strong>${builderNum(draft.targetCarbs, 1)}g</strong></div><div><span>Fat</span><strong>${builderNum(draft.targetFats, 1)}g</strong></div><div><span>القيم الحالية</span><strong>${builderNum(totals.calories)} سعرة</strong></div><div><span>الوجبات / الأطعمة</span><strong>${draft.meals.length} / ${draft.meals.reduce((sum, meal) => sum + meal.items.length, 0)}</strong></div></div><div class="review-note">الخطة: <b>${escapeHtml(draft.name)}</b> · الهدف: <b>${draft.calorieGoal === 'lose' ? 'خسارة وزن' : draft.calorieGoal === 'gain' ? 'زيادة وزن' : 'تثبيت'}</b> · BMR: <b>${draft.calculator?.bmr ? builderNum(draft.calculator.bmr) : '—'}</b> · TDEE: <b>${draft.calculator?.tdee ? builderNum(draft.calculator.tdee) : '—'}</b></div><div class="review-blocks">${mealRows}</div></section>`;
        } else {
            const stats = workoutStats(draft);
            const routineRows = draft.routines.map((routine, index) => `<section class="review-block"><div class="review-block-head"><strong>${index + 1}. ${escapeHtml(routine.name)}</strong><span>${routine.exercises.length} تمارين · ${routine.exercises.reduce((sum, exercise) => sum + Number(exercise.sets || 0), 0)} مجموعات</span></div><table class="builder-review-table"><thead><tr><th>التمرين</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Rest</th><th>Tempo</th><th>Superset</th></tr></thead><tbody>${routine.exercises.map((exercise) => { const item = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId)); return `<tr><td><div class="builder-review-exercise">${item ? exerciseImage(item, 'main', { className: 'exercise-media-builder', alt: itemName(item) }) : ''}<span>${escapeHtml(item ? itemName(item) : '—')}</span></div></td><td>${exercise.sets}</td><td>${exercise.repsMin || '—'}${exercise.repsMax ? `–${exercise.repsMax}` : ''}</td><td>${exercise.weightKg || '—'} kg</td><td>${exercise.restSeconds || 0}s</td><td>${escapeHtml(exercise.tempo || '—')}</td><td>${escapeHtml(exercise.supersetGroupId || '—')}</td></tr>`; }).join('')}</tbody></table></section>`).join('');
            $('coachingBuilderContent').innerHTML = `<section class="builder-stage builder-review"><div class="builder-stage-heading"><div><span>المرحلة الثالثة</span><h4>مراجعة برنامج التدريب قبل الحفظ</h4><p>راجع الحمل التدريبي وتوزيع العضلات وتفاصيل كل يوم.</p></div><span class="builder-ready-chip">جاهز للمراجعة</span></div><div class="review-identity"><strong>${escapeHtml(clientLabel)}</strong><span>${builderDate(draft.startDate)}${draft.endDate ? ` — ${builderDate(draft.endDate)}` : ''}</span></div><div class="review-summary-grid"><div><span>البرنامج</span><strong>${escapeHtml(draft.name)}</strong></div><div><span>المدة</span><strong>${builderNum(draft.durationWeeks)} أسبوع</strong></div><div><span>الأيام</span><strong>${draft.routines.length}</strong></div><div><span>التمارين</span><strong>${stats.exercises}</strong></div><div><span>المجموعات</span><strong>${stats.sets}</strong></div><div><span>الحجم التقريبي</span><strong>${builderNum(stats.volume)} كجم</strong></div></div><div class="review-note">الهدف: <b>${escapeHtml(draft.goal)}</b> · المستوى: <b>${escapeHtml(draft.level)}</b> · أيام أسبوعيًا: <b>${draft.daysPerWeek}</b></div><div class="review-muscles">${Object.entries(stats.muscles).map(([name, count]) => `<span>${escapeHtml(name)} <b>${count}</b></span>`).join('') || '<span>لم يحدد توزيع بعد</span>'}</div><div class="review-blocks">${routineRows}</div></section>`;
        }
    }

    function enhanceWorkoutIntensityFields() {
        const content = $('coachingBuilderContent');
        if (!content || !state.builder || state.builder.type !== 'workout' || state.builder.step !== 2) return;
        content.querySelectorAll('.builder-exercise-table-head').forEach((head) => {
            const emptyCell = head.lastElementChild;
            if (!head.querySelector('[data-intensity-head="reps-max"]')) {
                const repsHead = [...head.children].find((cell) => cell.textContent.trim() === 'Reps');
                if (repsHead) {
                    repsHead.textContent = 'Reps min';
                    const repsMaxHead = document.createElement('span');
                    repsMaxHead.dataset.intensityHead = 'reps-max';
                    repsMaxHead.textContent = 'Reps max';
                    repsHead.after(repsMaxHead);
                }
            }
            [['rir', 'RIR'], ['rpe', 'RPE']].forEach(([key, label]) => {
                if (head.querySelector(`[data-intensity-head="${key}"]`)) return;
                const cell = document.createElement('span');
                cell.dataset.intensityHead = key;
                cell.textContent = label;
                head.insertBefore(cell, emptyCell);
            });
        });
        content.querySelectorAll('.builder-exercise-row[data-exercise-index]').forEach((row) => {
            if (row.querySelector('[data-exercise-field="rir"]')) return;
            const routineIndex = Number(row.closest('[data-routine-index]')?.dataset.routineIndex);
            const exerciseIndex = Number(row.dataset.exerciseIndex);
            const exercise = state.builder.draft.routines?.[routineIndex]?.exercises?.[exerciseIndex] || {};
            [['rir', 'RIR', '0–10', '0', '10', '1'], ['rpe', 'RPE', '1–10', '1', '10', '0.5']].forEach(([key, label, placeholder, min, max, step]) => {
                const field = document.createElement('label');
                field.innerHTML = `<span>${label}</span><input type="number" min="${min}" max="${max}" step="${step}" data-exercise-field="${key}" placeholder="${placeholder}">`;
                const input = field.querySelector('input');
                input.value = exercise[key] == null ? '' : exercise[key];
                row.insertBefore(field, row.querySelector('.row-delete-button'));
            });
        });
    }

    function enhanceWorkoutReviewIntensity() {
        const content = $('coachingBuilderContent');
        if (!content || !state.builder || state.builder.type !== 'workout' || state.builder.step !== 3) return;
        const exercises = (state.builder.draft.routines || []).flatMap((routine) => routine.exercises || []);
        let cursor = 0;
        content.querySelectorAll('.builder-review-table').forEach((table) => {
            if (table.dataset.intensityReview === 'true') return;
            const headRow = table.querySelector('thead tr');
            if (!headRow) return;
            const rirHead = document.createElement('th');
            rirHead.textContent = 'RIR';
            const rpeHead = document.createElement('th');
            rpeHead.textContent = 'RPE';
            headRow.append(rirHead, rpeHead);
            table.querySelectorAll('tbody tr').forEach((row) => {
                const exercise = exercises[cursor++] || {};
                const rirCell = document.createElement('td');
                rirCell.textContent = exercise.rir == null ? '—' : exercise.rir;
                const rpeCell = document.createElement('td');
                rpeCell.textContent = exercise.rpe == null ? '—' : exercise.rpe;
                row.append(rirCell, rpeCell);
            });
            table.dataset.intensityReview = 'true';
        });
    }

    let builderSearchDismissBound = false;

    function closeBuilderSearchSelects(except = null) {
        document.querySelectorAll('.builder-search-select.is-open').forEach((wrapper) => {
            if (wrapper === except) return;
            wrapper.classList.remove('is-open');
            const trigger = wrapper.querySelector('.builder-search-trigger');
            const popover = wrapper.querySelector('.builder-search-popover');
            trigger?.setAttribute('aria-expanded', 'false');
            if (popover) popover.hidden = true;
        });
    }

    function enhanceBuilderSearchSelects() {
        const content = $('coachingBuilderContent');
        if (!content) return;
        enhanceWorkoutIntensityFields();
        enhanceWorkoutReviewIntensity();
        if (!builderSearchDismissBound) {
            document.addEventListener('click', (event) => {
                if (!event.target.closest('.builder-search-select')) closeBuilderSearchSelects();
            });
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') closeBuilderSearchSelects();
            });
            // The popover now lives inside the builder dialog. Scrolling the dialog
            // must not dismiss the user's search/selection context.
            window.addEventListener('resize', () => closeBuilderSearchSelects());
            builderSearchDismissBound = true;
        }

        const definitions = [
            { selector: 'select[data-builder-field="memberId"]', kind: 'client', placeholder: 'اختر العميل', searchPlaceholder: 'ابحث باسم العميل أو الهاتف', empty: 'لا يوجد عميل مطابق.' },
            { selector: 'select[data-food-field="foodId"]', kind: 'food', placeholder: 'اختر طعامًا', searchPlaceholder: 'ابحث عن الطعام', empty: 'لا يوجد طعام مطابق.' },
            { selector: 'select[data-exercise-field="exerciseId"]', kind: 'exercise', placeholder: 'اختر تمرينًا', searchPlaceholder: 'ابحث عن التمرين أو العضلة', empty: 'لا يوجد تمرين مطابق.' },
            { selector: 'select[data-builder-field]:not([data-builder-field="memberId"]), select[data-calculator-field], select[data-routine-field]', kind: 'option', placeholder: 'اختر من القائمة', searchPlaceholder: 'ابحث في الخيارات', empty: 'لا توجد خيارات مطابقة.' }
        ];

        definitions.forEach(({ selector, kind, placeholder, searchPlaceholder, empty }) => {
            content.querySelectorAll(selector).forEach((select) => {
                if (select.closest('.builder-search-select')) return;
                const parent = select.parentElement;
                if (!parent) return;
                const wrapper = document.createElement('div');
                wrapper.className = 'builder-search-select';
                wrapper.dataset.searchKind = kind;

                const trigger = document.createElement('button');
                trigger.type = 'button';
                trigger.className = 'builder-search-trigger';
                trigger.setAttribute('aria-haspopup', 'listbox');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.disabled = select.disabled;
                const triggerText = document.createElement('span');
                const triggerArrow = document.createElement('b');
                triggerArrow.textContent = '⌄';
                trigger.append(triggerText, triggerArrow);

                const popover = document.createElement('div');
                popover.className = 'builder-search-popover';
                popover.hidden = true;
                const searchLabel = document.createElement('label');
                searchLabel.className = 'builder-search-input-wrap';
                const searchInput = document.createElement('input');
                searchInput.type = 'search';
                searchInput.placeholder = searchPlaceholder;
                searchInput.setAttribute('aria-label', searchPlaceholder);
                searchLabel.append(searchInput);
                const options = document.createElement('div');
                options.className = 'builder-search-options';
                options.setAttribute('role', 'listbox');
                popover.append(searchLabel, options);
                const optionRecords = [...select.options].map((option) => ({
                    value: option.value,
                    label: option.textContent.trim(),
                    searchText: option.textContent.toLocaleLowerCase(),
                    disabled: option.disabled
                }));

                const updateTrigger = () => {
                    const selected = select.selectedOptions?.[0];
                    triggerText.textContent = selected?.value ? selected.textContent.trim() : placeholder;
                    trigger.title = triggerText.textContent;
                };
                const renderOptions = () => {
                    const query = searchInput.value.trim().toLocaleLowerCase();
                    const matchingOptions = optionRecords.filter((option) => !query || option.searchText.includes(query));
                    const fragment = document.createDocumentFragment();
                    if (!matchingOptions.length) {
                        const emptyState = document.createElement('div');
                        emptyState.className = 'builder-search-empty';
                        emptyState.textContent = empty;
                        fragment.append(emptyState);
                        options.replaceChildren(fragment);
                        return;
                    }
                    matchingOptions.forEach((option) => {
                        const optionButton = document.createElement('button');
                        optionButton.type = 'button';
                        optionButton.className = 'builder-search-option';
                        optionButton.setAttribute('role', 'option');
                        optionButton.setAttribute('aria-selected', String(option.value === select.value));
                        optionButton.disabled = option.disabled;
                        optionButton.textContent = option.value ? option.label : placeholder;
                        optionButton.addEventListener('click', () => {
                            const previousValue = select.value;
                            select.value = option.value;
                            updateTrigger();
                            closeBuilderSearchSelects();
                            searchInput.value = '';
                            if (previousValue !== select.value) select.dispatchEvent(new Event('change', { bubbles: true }));
                        });
                        fragment.append(optionButton);
                    });
                    options.replaceChildren(fragment);
                };
                const setOpen = (open) => {
                    if (select.disabled) return;
                    if (open) closeBuilderSearchSelects(wrapper);
                    wrapper.classList.toggle('is-open', open);
                    trigger.setAttribute('aria-expanded', String(open));
                    popover.hidden = !open;
                    if (open) {
                        const rect = trigger.getBoundingClientRect();
                        const dialogBody = trigger.closest('.coaching-builder-dialog')?.querySelector('.dialog-body') || trigger.closest('.dialog-body');
                        const bodyRect = dialogBody?.getBoundingClientRect();
                        const inset = 10;
                        const bodyWidth = dialogBody?.clientWidth || window.innerWidth;
                        const bodyHeight = dialogBody?.clientHeight || window.innerHeight;
                        const bodyScrollTop = dialogBody?.scrollTop || 0;
                        const bodyScrollLeft = dialogBody?.scrollLeft || 0;
                        const bodyLeft = bodyRect?.left || 0;
                        const bodyTop = bodyRect?.top || 0;
                        const availableWidth = Math.max(180, bodyWidth - inset * 2);
                        const width = Math.min(Math.max(rect.width, 230), availableWidth);
                        const rawLeft = rect.left - bodyLeft + bodyScrollLeft;
                        const scrollWidth = Math.max(bodyWidth, dialogBody?.scrollWidth || bodyWidth);
                        const left = Math.min(Math.max(rawLeft, inset), Math.max(inset, scrollWidth - width - inset));
                        const triggerTop = rect.top - bodyTop + bodyScrollTop;
                        const triggerBottom = rect.bottom - bodyTop + bodyScrollTop;
                        const visibleTop = bodyScrollTop + inset;
                        const visibleBottom = bodyScrollTop + bodyHeight - inset;
                        const belowTop = triggerBottom + 6;
                        const belowSpace = visibleBottom - belowTop;
                        const aboveSpace = triggerTop - visibleTop - 6;
                        const opensAbove = belowSpace < 180 && aboveSpace > belowSpace;
                        const availableHeight = Math.max(96, Math.min(360, opensAbove ? aboveSpace : belowSpace));
                        const top = opensAbove
                            ? Math.max(visibleTop, triggerTop - availableHeight - 6)
                            : belowTop;
                        popover.style.width = `${width}px`;
                        popover.style.left = `${left}px`;
                        popover.style.top = `${top}px`;
                        popover.style.maxHeight = `${availableHeight}px`;
                        options.style.maxHeight = `${Math.max(64, availableHeight - 58)}px`;
                        searchInput.value = '';
                        renderOptions();
                        window.requestAnimationFrame(() => searchInput.focus());
                    }
                };

                trigger.addEventListener('click', () => setOpen(!wrapper.classList.contains('is-open')));
                trigger.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); }
                });
                searchInput.addEventListener('input', renderOptions);
                searchInput.addEventListener('keydown', (event) => {
                    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
                    if (event.key === 'Enter') { event.preventDefault(); options.querySelector('.builder-search-option:not(:disabled)')?.click(); }
                });
                select.addEventListener('change', updateTrigger);

                parent.insertBefore(wrapper, select);
                wrapper.append(trigger, popover, select);
                select.classList.add('builder-search-native');
                updateTrigger();
            });
        });
    }

    function renderBuilderV2() {
        if (!state.builder) return;
        renderBuilderChrome();
        if (state.builder.step === 1) state.builder.type === 'diet' ? renderDietStepOne() : renderWorkoutStepOne();
        else if (state.builder.step === 2) state.builder.type === 'diet' ? renderDietStepTwo() : renderWorkoutStepTwo();
        else renderBuilderReview();
        enhanceBuilderSearchSelects();
        window.TopGymExerciseAssets?.hydrate($('coachingBuilderContent'));
    }

    function syncBuilderDraft() {
        if (!state.builder) return null;
        return state.builder.type === 'diet' ? readBuilderDietDraft() : readBuilderWorkoutDraft();
    }

    function builderStepValid(step) {
        const draft = syncBuilderDraft();
        if (draft.endDate && draft.startDate && draft.endDate < draft.startDate) {
            notify('تاريخ النهاية يجب أن يكون بعد تاريخ البداية.', 'error');
            return false;
        }
        if (step !== 1 && state.builder.type === 'workout') {
            const invalidRange = draft.routines.some((routine) => routine.exercises.some((exercise) => Number(exercise.repsMin) > 0 && Number(exercise.repsMax) > 0 && Number(exercise.repsMax) < Number(exercise.repsMin)));
            if (invalidRange) {
                notify('نطاق التكرارات غير صحيح: الحد الأقصى يجب أن يكون أكبر من أو مساويًا للحد الأدنى.', 'error');
                return false;
            }
        }
        if (step === 1) {
            if (!builderBasicComplete(draft)) { notify('أكمل العميل والاسم وتاريخ البداية أولاً.', 'error'); return false; }
            if (state.builder.type === 'diet' && (!(Number(draft.mealsPerDay) >= 3 && Number(draft.mealsPerDay) <= 6) || Number(draft.targetCalories) <= 0)) { notify('حدد عدد الوجبات وأدخل Target Calories صحيحًا.', 'error'); return false; }
            if (state.builder.type === 'workout' && (!(Number(draft.durationWeeks) > 0) || !(Number(draft.daysPerWeek) > 0))) { notify('أدخل مدة البرنامج وعدد أيام التدريب.', 'error'); return false; }
            return true;
        }
        if (!builderStructureComplete(draft)) { notify(state.builder.type === 'diet' ? 'أضف وجبة وطعامًا صحيحًا واحدًا على الأقل لكل وجبة.' : 'أضف يومًا وتمرينًا صحيحًا واحدًا على الأقل.', 'error'); return false; }
        return true;
    }

    function setBuilderStep(step) {
        if (!state.builder) return;
        const next = Math.min(3, Math.max(1, Number(step)));
        if (next > state.builder.step && !builderStepValid(state.builder.step)) return;
        syncBuilderDraft();
        state.builder.step = next;
        renderBuilderV2();
    }

    async function openBuilderV2(type, memberId, id = null, memberName = '') {
        try {
            await Promise.all([loadCatalog(), loadBuilderClients()]);
            let draft = type === 'workout' ? blankBuilderWorkout(memberId, memberName) : blankBuilderDiet(memberId, memberName);
            if (id) draft = type === 'workout' ? await requestJson(`/api/workoutprograms/${id}`).then((data) => data.program) : await requestJson(`/api/dietplans/${id}`).then((data) => data.plan);
            if (type === 'diet') {
                draft.calculator = { ...(draft.calculator || {}) };
                try {
                    const measurementData = await requestJson(`/api/clients/${draft.memberId || memberId}/measurements`);
                    const latest = (measurementData.measurements || []).find((measurement) => measurement.weightKg != null || measurement.heightCm != null);
                    if (latest) {
                        if (!draft.calculator.weightKg) draft.calculator.weightKg = latest.weightKg || '';
                        if (!draft.calculator.heightCm) draft.calculator.heightCm = latest.heightCm || '';
                        draft.calculator.measurementDate = latest.measuredAt || '';
                    }
                } catch (_) { /* القياسات مساعدة فقط ولا تمنع فتح النظام. */ }
            }
            state.builder = { type, memberId: Number(draft.memberId || memberId), id: id ? Number(id) : null, draft, step: 1, activeRoutine: 0 };
            $('coachingBuilderId').value = id || '';
            $('coachingBuilderMemberId').value = state.builder.memberId;
            $('coachingBuilderTitle').textContent = `${id ? 'تعديل' : 'إنشاء'} ${type === 'workout' ? 'برنامج تدريب' : 'خطة تغذية'}`;
            $('coachingBuilderSubtitle').textContent = `العميل: ${draft.memberName || memberName || 'العميل المحدد'} · ثلاث مراحل واضحة حتى الحفظ.`;
            renderBuilderV2();
            openDialog($('coachingBuilderDialog'));
        } catch (error) { notify(error.message, 'error'); }
    }

    function handleBuilderActionV2(button) {
        if (!state.builder) return;
        const draft = syncBuilderDraft();
        const action = button.dataset.builderAction;
        const index = Number(button.dataset.index);
        if (action === 'apply-calories') return applyDietCalories();
        if (action === 'select-routine') { state.builder.activeRoutine = index; return renderBuilderV2(); }
        if (state.builder.type === 'diet') {
            if (action === 'add-meal' && draft.meals.length >= 6) { notify('يمكن أن تحتوي الخطة على 6 وجبات كحد أقصى.', 'error'); return; }
            if (action === 'remove-meal' && draft.meals.length <= 3) { notify('يجب أن تحتوي الخطة على 3 وجبات على الأقل.', 'error'); return; }
            if (action === 'add-meal') draft.meals.push({ name: `وجبة ${draft.meals.length + 1}`, mealTime: '', sortOrder: draft.meals.length, notes: '', items: [{ foodId: state.catalog.foods[0]?.id || '', sortOrder: 0, assignedQuantity: 100, servingUnit: '', notes: '' }] });
            if (action === 'remove-meal') draft.meals.splice(index, 1);
            if (action === 'move-meal') { const target = button.dataset.direction === 'up' ? index - 1 : index + 1; if (draft.meals[target]) [draft.meals[index], draft.meals[target]] = [draft.meals[target], draft.meals[index]]; }
            if (action === 'add-food') draft.meals[Number(button.dataset.meal)]?.items.push({ foodId: state.catalog.foods[0]?.id || '', sortOrder: draft.meals[Number(button.dataset.meal)]?.items.length || 0, assignedQuantity: 100, servingUnit: '', notes: '' });
            if (action === 'remove-food') draft.meals[Number(button.dataset.meal)]?.items.splice(index, 1);
            if (action === 'add-meal' || action === 'remove-meal') draft.mealsPerDay = draft.meals.length;
        } else {
            if (action === 'add-routine') { draft.routines.push({ name: `اليوم ${draft.routines.length + 1}`, dayOfWeek: Math.min(7, draft.routines.length + 1), sortOrder: draft.routines.length, notes: '', exercises: [{ exerciseId: state.catalog.exercises[0]?.id || '', sortOrder: 0, sets: 3, repsMin: 10, repsMax: 12, weightKg: '', restSeconds: 90, tempo: '', supersetGroupId: '', notes: '' }] }); state.builder.activeRoutine = draft.routines.length - 1; }
            if (action === 'remove-routine') { draft.routines.splice(index, 1); state.builder.activeRoutine = Math.max(0, Math.min(state.builder.activeRoutine, draft.routines.length - 1)); }
            if (action === 'move-routine') { const target = button.dataset.direction === 'up' ? index - 1 : index + 1; if (draft.routines[target]) { [draft.routines[index], draft.routines[target]] = [draft.routines[target], draft.routines[index]]; state.builder.activeRoutine = target; } }
            if (action === 'add-exercise') draft.routines[Number(button.dataset.routine)]?.exercises.push({ exerciseId: state.catalog.exercises[0]?.id || '', sortOrder: draft.routines[Number(button.dataset.routine)]?.exercises.length || 0, sets: 3, repsMin: 10, repsMax: 12, weightKg: '', restSeconds: 90, tempo: '', supersetGroupId: '', notes: '' });
            if (action === 'remove-exercise') draft.routines[Number(button.dataset.routine)]?.exercises.splice(index, 1);
        }
        state.builder.draft = draft;
        renderBuilderV2();
    }

    /*
    function buildBuilderPrintDocument() {
        const draft = state.builder.draft;
        const clientLabel = draft.memberName || (state.builderClients || []).find((client) => String(client.id) === String(draft.memberId))?.fullName || 'العميل المحدد';
        const title = state.builder.type === 'diet' ? 'خطة تغذية' : 'برنامج تدريب';
        const content = state.builder.type === 'diet' ? `<div class="print-summary"><b>Target Calories:</b> ${builderNum(draft.targetCalories)} · <b>Protein:</b> ${builderNum(draft.targetProtein, 1)}g · <b>Carbs:</b> ${builderNum(draft.targetCarbs, 1)}g · <b>Fat:</b> ${builderNum(draft.targetFats, 1)}g</div>${draft.meals.map((meal, index) => `<section><h2>${index + 1}. ${escapeHtml(meal.name)} <small>${meal.mealTime || ''}</small></h2><table><thead><tr><th>الطعام</th><th>الكمية</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>${meal.items.map((item) => { const values = dietFoodMetrics(item); return `<tr><td>${escapeHtml(values.food ? itemName(values.food) : '—')}</td><td>${builderNum(item.assignedQuantity, 1)} ${escapeHtml(item.servingUnit || '')}</td><td>${builderNum(values.calories, 1)}</td><td>${builderNum(values.protein, 1)}</td><td>${builderNum(values.carbs, 1)}</td><td>${builderNum(values.fats, 1)}</td></tr>`; }).join('')}</tbody></table></section>`).join('') : `<div class="print-summary"><b>الهدف:</b> ${escapeHtml(draft.goal)} · <b>المستوى:</b> ${escapeHtml(draft.level)} · <b>المدة:</b> ${builderNum(draft.durationWeeks)} أسبوع · <b>الأيام:</b> ${draft.routines.length}</div>${draft.routines.map((routine, index) => `<section><h2>${index + 1}. ${escapeHtml(routine.name)}</h2><table><thead><tr><th>التمرين</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Rest</th><th>Tempo</th><th>Superset</th></tr></thead><tbody>${routine.exercises.map((exercise) => { const item = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId)); return `<tr><td>${escapeHtml(item ? itemName(item) : '—')}</td><td>${exercise.sets}</td><td>${exercise.repsMin || '—'}${exercise.repsMax ? `–${exercise.repsMax}` : ''}</td><td>${exercise.weightKg || '—'}</td><td>${exercise.restSeconds || 0}s</td><td>${escapeHtml(exercise.tempo || '—')}</td><td>${escapeHtml(exercise.supersetGroupId || '—')}</td></tr>`; }).join('')}</tbody></table></section>`).join('')}`;
        return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title} - TOP GYM</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#0f172a;margin:0;line-height:1.6}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #2563eb;padding-bottom:12px;margin-bottom:18px}h1{font-size:27px;margin:0;color:#1d4ed8;letter-spacing:2px}header p{margin:2px 0;color:#64748b;font-size:11px}.meta{text-align:left;color:#475569;font-size:11px}h2{font-size:15px;margin:16px 0 7px;padding:7px 10px;border-right:4px solid #2563eb;background:#eff6ff}h2 small{float:left;color:#64748b;font-size:10px;font-weight:400}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#0f172a;color:#fff;text-align:right;padding:7px}td{border:1px solid #dbe3ef;padding:7px}tr:nth-child(even) td{background:#f8fafc}.print-summary{padding:10px 12px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:8px;font-size:11px}footer{margin-top:25px;border-top:1px solid #dbe3ef;padding-top:10px;color:#64748b;font-size:10px;display:flex;justify-content:space-between}</style></head><body><header><div><h1>TOP GYM</h1><p>${title}</p></div><div class="meta"><b>${escapeHtml(clientLabel)}</b><br>${builderDate(draft.startDate)}${draft.endDate ? ` — ${builderDate(draft.endDate)}` : ''}</div></header>${content}<footer><b>إدارة الجيم</b><span>TOP GYM · ${new Date().toLocaleDateString('ar-EG')}</span></footer><script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`;
    }

    }
    */
    function buildBuilderPrintDocument() {
        const draft = state.builder.draft;
        const clientLabel = draft.memberName || (state.builderClients || []).find((client) => String(client.id) === String(draft.memberId))?.fullName || 'Selected client';
        const title = state.builder.type === 'diet' ? 'Nutrition plan' : 'Workout program';
        const dietSections = (draft.meals || []).map((meal, index) => {
            const rows = (meal.items || []).map((item) => {
                const values = dietFoodMetrics(item);
                const foodLabel = values.food ? itemName(values.food) : '—';
                return `<tr><td>${escapeHtml(foodLabel)}</td><td>${builderNum(item.assignedQuantity, 1)} ${escapeHtml(item.servingUnit || '')}</td><td>${builderNum(values.calories, 1)}</td><td>${builderNum(values.protein, 1)}</td><td>${builderNum(values.carbs, 1)}</td><td>${builderNum(values.fats, 1)}</td></tr>`;
            }).join('');
            return `<section><h2>${index + 1}. ${escapeHtml(meal.name)} <small>${escapeHtml(meal.mealTime || '')}</small></h2><table><thead><tr><th>Food</th><th>Quantity</th><th>Calories</th><th>Protein</th><th>Carbs</th><th>Fat</th></tr></thead><tbody>${rows}</tbody></table></section>`;
        }).join('');
        const workoutSections = (draft.routines || []).map((routine, index) => {
            const rows = (routine.exercises || []).map((exercise) => {
                const item = state.catalog.exercises.find((candidate) => String(candidate.id) === String(exercise.exerciseId));
                const reps = exercise.repsMax ? `${exercise.repsMin || '—'}–${exercise.repsMax}` : (exercise.repsMin || '—');
                return `<tr><td>${escapeHtml(item ? itemName(item) : '—')}</td><td>${builderNum(exercise.sets, 0)}</td><td>${escapeHtml(String(reps))}</td><td>${builderNum(exercise.weightKg, 1) || '—'}</td><td>${builderNum(exercise.restSeconds, 0)}s</td><td>${exercise.rir == null ? '—' : exercise.rir}</td><td>${exercise.rpe == null ? '—' : exercise.rpe}</td><td>${escapeHtml(exercise.tempo || '—')}</td><td>${escapeHtml(exercise.supersetGroupId || '—')}</td></tr>`;
            }).join('');
            return `<section><h2>${index + 1}. ${escapeHtml(routine.name)}</h2><table><thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Rest</th><th>RIR</th><th>RPE</th><th>Tempo</th><th>Superset</th></tr></thead><tbody>${rows}</tbody></table></section>`;
        }).join('');
        const content = state.builder.type === 'diet'
            ? `<div class="print-summary"><b>Target calories:</b> ${builderNum(draft.targetCalories)} · <b>Protein:</b> ${builderNum(draft.targetProtein, 1)}g · <b>Carbs:</b> ${builderNum(draft.targetCarbs, 1)}g · <b>Fat:</b> ${builderNum(draft.targetFats, 1)}g</div>${dietSections}`
            : `<div class="print-summary"><b>Goal:</b> ${escapeHtml(draft.goal)} · <b>Level:</b> ${escapeHtml(draft.level)} · <b>Duration:</b> ${builderNum(draft.durationWeeks)} weeks · <b>Days:</b> ${(draft.routines || []).length}</div>${workoutSections}`;
        return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title} - TOP GYM</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Cairo,Tahoma,Arial,sans-serif;color:#0f172a;margin:0;line-height:1.6}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #2563eb;padding-bottom:12px;margin-bottom:18px}h1{font-size:27px;margin:0;color:#1d4ed8;letter-spacing:2px}header p{margin:2px 0;color:#64748b;font-size:11px}.meta{text-align:left;color:#475569;font-size:11px}h2{font-size:15px;margin:16px 0 7px;padding:7px 10px;border-right:4px solid #2563eb;background:#eff6ff}h2 small{float:left;color:#64748b;font-size:10px;font-weight:400}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#0f172a;color:#fff;text-align:right;padding:7px}td{border:1px solid #dbe3ef;padding:7px}tr:nth-child(even) td{background:#f8fafc}.print-summary{padding:10px 12px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:8px;font-size:11px}footer{margin-top:25px;border-top:1px solid #dbe3ef;padding-top:10px;color:#64748b;font-size:10px;display:flex;justify-content:space-between}</style></head><body><header><div><h1>TOP GYM</h1><p>${title}</p></div><div class="meta"><b>${escapeHtml(clientLabel)}</b><br>${builderDate(draft.startDate)}${draft.endDate ? ` — ${builderDate(draft.endDate)}` : ''}</div></header>${content}<footer><b>Gym management</b><span>TOP GYM · ${new Date().toLocaleDateString('ar-EG')}</span></footer><script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`;
    }

    function printBuilderDraft() {
        if (!state.builder) return;
        syncBuilderDraft();
        if (!builderStructureComplete(state.builder.draft)) { notify('أكمل بناء النظام قبل الطباعة.', 'error'); return; }
        const printWindow = window.open('', '_blank', 'width=980,height=820');
        if (!printWindow) { notify('اسمح بالنوافذ المنبثقة لإتمام الطباعة.', 'error'); return; }
        const draft = state.builder.draft;
        const type = state.builder.type;
        const clientLabel = draft.memberName || (state.builderClients || []).find((client) => String(client.id) === String(draft.memberId))?.fullName || 'العميل المحدد';
        ensureCoachingPrintFeature().then((printer) => {
            printer.printCoachingDraft(draft, type, state.catalog, clientLabel, printWindow);
        }).catch((error) => {
            printWindow.close();
            notify(error.message || 'تعذر تحميل أداة الطباعة.', 'error');
        });
    }

    function downloadBuilderDraftPdf() {
        if (!state.builder) return;
        syncBuilderDraft();
        if (!builderStructureComplete(state.builder.draft)) { notify('أكمل بناء النظام قبل إنشاء ملف PDF.', 'error'); return; }
        const draft = state.builder.draft;
        const type = state.builder.type;
        const clientLabel = draft.memberName || (state.builderClients || []).find((client) => String(client.id) === String(draft.memberId))?.fullName || 'العميل المحدد';
        ensureCoachingPrintFeature().then((printer) => {
            if (!printer.downloadCoachingDraftPdf) throw new Error('أداة إنشاء PDF غير جاهزة.');
            return printer.downloadCoachingDraftPdf(draft, type, state.catalog, clientLabel);
        }).catch((error) => notify(error.message || 'تعذر إنشاء ملف PDF.', 'error'));
    }

    function refreshBuilderDerivedMetrics(draft = activeBuilderDraft()) {
        if (!state.builder || !draft) return;
        const content = $('coachingBuilderContent');
        if (state.builder.type === 'diet') {
            renderDietLiveSummary(draft);
            content?.querySelectorAll('[data-meal-index]').forEach((mealElement, mealIndex) => {
                const meal = draft.meals[mealIndex];
                if (!meal) return;
                const totals = dietMealTotals(meal);
                const summary = mealElement.querySelector('.builder-meal-row-summary');
                if (summary) summary.innerHTML = `<span>${builderNum(totals.calories, 0)} calories</span><span>${builderNum(totals.protein, 1)}g Protein</span><span>${builderNum(totals.carbs, 1)}g Carbs</span><span>${builderNum(totals.fats, 1)}g Fat</span>`;
                mealElement.querySelectorAll('[data-food-index]').forEach((foodElement, itemIndex) => {
                    const item = meal.items[itemIndex];
                    if (!item) return;
                    const values = dietFoodMetrics(item);
                    const liveValues = foodElement.querySelectorAll('.food-live-value');
                    [builderNum(values.calories, 0), `${builderNum(values.protein, 1)}g`, `${builderNum(values.carbs, 1)}g`, `${builderNum(values.fats, 1)}g`].forEach((value, valueIndex) => { if (liveValues[valueIndex]) liveValues[valueIndex].innerHTML = `<b>${value}</b>`; });
                });
            });
        } else {
            const metrics = $('workoutBuilderMetrics');
            if (metrics) metrics.innerHTML = renderWorkoutMetrics(draft);
        }
    }

    function refreshDietEnergyPreview(draft = readBuilderDietDraft()) {
        if (!draft) return;
        const energy = calculateDietEnergy(draft);
        const bmr = $('dietBmrValue');
        const tdee = $('dietTdeeValue');
        const target = $('dietTargetValue');
        if (bmr) bmr.textContent = energy ? builderNum(energy.bmr) : '—';
        if (tdee) tdee.textContent = energy ? builderNum(energy.tdee) : '—';
        if (target) target.textContent = energy ? builderNum(energy.target) : builderNum(draft.targetCalories);
    }

    async function saveBuilderV2(event) {
        event.preventDefault();
        if (!state.builder) return;
        if (state.builder.step !== 3) { setBuilderStep(state.builder.step + 1); return; }
        const draft = syncBuilderDraft();
        if (!builderStepValid(2)) return;
        draft.memberId = state.builder.memberId;
        if (state.builder.id) draft.version = state.builder.draft.version;
        const button = $('coachingBuilderSave');
        button.disabled = true;
        try {
            const base = state.builder.type === 'workout' ? '/api/workoutprograms' : '/api/dietplans';
            await requestJson(state.builder.id ? `${base}/${state.builder.id}` : base, { method: state.builder.id ? 'PUT' : 'POST', body: JSON.stringify(draft) });
            closeDialog($('coachingBuilderDialog'));
            notify(`تم ${state.builder.id ? 'تعديل' : 'إنشاء'} ${state.builder.type === 'workout' ? 'برنامج التدريب' : 'خطة التغذية'} بنجاح.`);
            const memberId = state.builder.memberId;
            state.builder = null;
            state.loaded = false;
            await loadTrainees(true);
            if ($('coachingProfileDialog')?.open) openProfile(memberId);
            window.dispatchEvent(new CustomEvent('topgym:coaching-updated', { detail: { memberId } }));
        } catch (error) { notify(error.message, 'error'); }
        finally { button.disabled = false; }
    }

    function blankWorkout(memberId) { return blankBuilderWorkout(memberId); }
    function blankDiet(memberId) { return blankBuilderDiet(memberId); }
    function readWorkoutDraft() { return readBuilderWorkoutDraft(); }
    function readDietDraft() { return readBuilderDietDraft(); }
    function renderBuilder() { return renderBuilderV2(); }
    function openBuilder(type, memberId, id = null, memberName = '') { return openBuilderV2(type, memberId, id, memberName); }
    function handleBuilderAction(button) { return handleBuilderActionV2(button); }
    function saveBuilder(event) { return saveBuilderV2(event); }

    function ensureMeasurementDialog() {
        if ($('measurementDialog')) return $('measurementDialog');
        const dialog = document.createElement('dialog');
        dialog.id = 'measurementDialog';
        dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
        dialog.innerHTML = `<form class="dialog-body" id="measurementForm"><div class="details-dialog-head"><div><h3 id="measurementTitle">إضافة قياس</h3><p>سجل القياسات لمتابعة التقدم مع مرور الوقت.</p></div><button class="btn btn-light btn-small" type="button" data-close-measurement>إغلاق</button></div><input type="hidden" id="measurementId"><input type="hidden" id="measurementMemberId"><div class="field-grid"><label>التاريخ<input id="measurementDate" type="date" required></label><label>الوزن كجم<input id="measurementWeight" type="number" min="0" step="0.1"></label><label>الطول سم<input id="measurementHeight" type="number" min="0" step="0.1"></label><label>نسبة الدهون %<input id="measurementFat" type="number" min="0" max="100" step="0.1"></label><label>الصدر سم<input id="measurementChest" type="number" min="0" step="0.1"></label><label>الخصر سم<input id="measurementWaist" type="number" min="0" step="0.1"></label><label>الأرداف سم<input id="measurementHips" type="number" min="0" step="0.1"></label><label>الذراع سم<input id="measurementArms" type="number" min="0" step="0.1"></label><label>الفخذ سم<input id="measurementThighs" type="number" min="0" step="0.1"></label></div><label class="builder-wide-label">ملاحظات<textarea id="measurementNotes" rows="2"></textarea></label><div class="dialog-actions"><button class="btn btn-light" type="button" data-close-measurement>إلغاء</button><button class="btn btn-primary" type="submit">حفظ القياس</button></div></form>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', (event) => { if (event.target.matches('[data-close-measurement]')) closeDialog(dialog); });
        dialog.querySelector('form').addEventListener('submit', saveMeasurement);
        return dialog;
    }

    function openMeasurementDialog(memberId, measurement = null) {
        ensureMeasurementDialog();
        $('measurementTitle').textContent = measurement ? 'تعديل القياس' : 'إضافة قياس';
        $('measurementId').value = measurement?.id || '';
        $('measurementMemberId').value = memberId;
        $('measurementDate').value = measurement?.measuredAt || today();
        [['measurementWeight', 'weightKg'], ['measurementHeight', 'heightCm'], ['measurementFat', 'bodyFatPercent'], ['measurementChest', 'chestCm'], ['measurementWaist', 'waistCm'], ['measurementHips', 'hipsCm'], ['measurementArms', 'armsCm'], ['measurementThighs', 'thighsCm'], ['measurementNotes', 'notes']].forEach(([field, key]) => { $(field).value = measurement?.[key] ?? ''; });
        openDialog($('measurementDialog'));
    }

    async function saveMeasurement(event) {
        event.preventDefault();
        const memberId = $('measurementMemberId').value;
        const id = $('measurementId').value;
        const body = { measuredAt: $('measurementDate').value, weightKg: $('measurementWeight').value || null, heightCm: $('measurementHeight').value || null, bodyFatPercent: $('measurementFat').value || null, chestCm: $('measurementChest').value || null, waistCm: $('measurementWaist').value || null, hipsCm: $('measurementHips').value || null, armsCm: $('measurementArms').value || null, thighsCm: $('measurementThighs').value || null, notes: $('measurementNotes').value };
        try {
            await requestJson(id ? `/api/clients/${memberId}/measurements/${id}` : `/api/clients/${memberId}/measurements`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
            closeDialog($('measurementDialog'));
            notify('تم حفظ القياس بنجاح.');
            if ($('coachingProfileDialog')?.open) openProfile(memberId);
        } catch (error) { notify(error.message, 'error'); }
    }

    function selectScaleOptions() {
        return '<option value="">—</option><option value="1">1 — منخفض</option><option value="2">2</option><option value="3">3 — متوسط</option><option value="4">4</option><option value="5">5 — مرتفع</option>';
    }

    function ensureCheckinDialog() {
        if ($('checkinDialog')) return $('checkinDialog');
        const dialog = document.createElement('dialog');
        dialog.id = 'checkinDialog';
        dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
        dialog.innerHTML = `<form class="dialog-body" id="checkinForm"><div class="details-dialog-head"><div><h3 id="checkinTitle">إضافة متابعة يومية</h3><p>سجّل حالة المتدرب اليوم لموازنة الحمل التدريبي والاستشفاء.</p></div><button class="btn btn-light btn-small" type="button" data-close-checkin>إغلاق</button></div><input type="hidden" id="checkinId"><input type="hidden" id="checkinMemberId"><div class="checkin-field-grid"><label>التاريخ<input id="checkinDate" type="date" required></label><label>ساعات النوم<input id="checkinSleepHours" type="number" min="0" max="24" step="0.5" placeholder="7.5"></label><label>جودة النوم<select id="checkinSleepQuality">${selectScaleOptions()}</select></label><label>الإجهاد<select id="checkinFatigue">${selectScaleOptions()}</select></label><label>الألم العضلي<select id="checkinSoreness">${selectScaleOptions()}</select></label><label>الضغط النفسي<select id="checkinStress">${selectScaleOptions()}</select></label><label>المزاج<select id="checkinMood">${selectScaleOptions()}</select></label><label>نبض الراحة<input id="checkinRestingHr" type="number" min="20" max="250" step="1" placeholder="60"></label><label>HRV<input id="checkinHrv" type="number" min="0" max="500" step="0.1" placeholder="50"></label><label>الوزن كجم<input id="checkinBodyweight" type="number" min="0" max="1000" step="0.1"></label></div><label class="builder-wide-label">ملاحظات<textarea id="checkinNotes" rows="2" maxlength="1000" placeholder="كيف كان يوم المتدرب؟"></textarea></label><div class="dialog-actions"><button class="btn btn-light" type="button" data-close-checkin>إلغاء</button><button class="btn btn-primary" type="submit">حفظ المتابعة</button></div></form>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', (event) => { if (event.target.matches('[data-close-checkin]')) closeDialog(dialog); });
        dialog.querySelector('form').addEventListener('submit', saveCheckin);
        return dialog;
    }

    function openCheckinDialog(memberId, checkin = null) {
        ensureCheckinDialog();
        $('checkinTitle').textContent = checkin ? 'تعديل المتابعة اليومية' : 'إضافة متابعة يومية';
        $('checkinId').value = checkin?.id || '';
        $('checkinMemberId').value = memberId;
        $('checkinDate').value = checkin?.checkinDate || today();
        [['checkinSleepHours', 'sleepHours'], ['checkinSleepQuality', 'sleepQuality'], ['checkinFatigue', 'fatigue'], ['checkinSoreness', 'soreness'], ['checkinStress', 'stress'], ['checkinMood', 'mood'], ['checkinRestingHr', 'restingHr'], ['checkinHrv', 'hrv'], ['checkinBodyweight', 'bodyweightKg'], ['checkinNotes', 'notes']].forEach(([field, key]) => { $(field).value = checkin?.[key] ?? ''; });
        openDialog($('checkinDialog'));
    }

    async function saveCheckin(event) {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button[type="submit"]');
        const memberId = $('checkinMemberId').value;
        const id = $('checkinId').value;
        const body = { checkinDate: $('checkinDate').value, sleepHours: $('checkinSleepHours').value || null, sleepQuality: $('checkinSleepQuality').value || null, fatigue: $('checkinFatigue').value || null, soreness: $('checkinSoreness').value || null, stress: $('checkinStress').value || null, mood: $('checkinMood').value || null, restingHr: $('checkinRestingHr').value || null, hrv: $('checkinHrv').value || null, bodyweightKg: $('checkinBodyweight').value || null, notes: $('checkinNotes').value };
        button.disabled = true;
        try {
            await requestJson(id ? `/api/clients/${memberId}/checkins/${id}` : `/api/clients/${memberId}/checkins`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
            closeDialog($('checkinDialog'));
            notify(id ? 'تم تحديث المتابعة اليومية بنجاح.' : 'تم حفظ المتابعة اليومية بنجاح.');
            if ($('coachingProfileDialog')?.open) await openProfile(memberId);
        } catch (error) { notify(error.message, 'error'); }
        finally { button.disabled = false; }
    }

    async function deleteCheckinFromProfile(memberId, checkinId) {
        if (!window.confirm('هل تريد حذف هذه المتابعة اليومية؟')) return;
        try {
            await requestJson(`/api/clients/${memberId}/checkins/${checkinId}`, { method: 'DELETE' });
            notify('تم حذف المتابعة اليومية.');
            if ($('coachingProfileDialog')?.open) await openProfile(memberId);
        } catch (error) { notify(error.message, 'error'); }
    }

    function ensureSubscriptionDialog() {
        if ($('coachingSubscriptionDialog')) return $('coachingSubscriptionDialog');
        const dialog = document.createElement('dialog');
        dialog.id = 'coachingSubscriptionDialog';
        dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
        dialog.innerHTML = `<form class="dialog-body" id="coachingSubscriptionForm"><div class="details-dialog-head"><div><h3>إضافة اشتراك Gym</h3><p>سيتم ربط الاشتراك بنفس ملف العميل الحالي دون إنشاء نسخة جديدة.</p></div><button class="btn btn-light btn-small" type="button" data-close-subscription>إغلاق</button></div><input type="hidden" id="subscriptionMemberId"><div class="field-grid"><label>الباقة<select id="subscriptionPlan"><option value="gym_only">جيم فقط</option><option value="gym_cardio">جيم وكارديو</option></select></label><label>النوع<select id="subscriptionType"><option value="monthly">شهرية</option><option value="half_month">نصف شهر</option><option value="quarterly">ربع سنوية</option><option value="semiannual">نصف سنوية</option><option value="annual">سنوية</option></select></label><label>تاريخ البداية<input id="subscriptionStart" type="date" required></label><label>المبلغ المدفوع<input id="subscriptionPaid" type="number" min="0" step="0.01" value="0"></label><label>الخصم<input id="subscriptionDiscount" type="number" min="0" step="0.01" value="0"></label></div><div class="dialog-actions"><button class="btn btn-light" type="button" data-close-subscription>إلغاء</button><button class="btn btn-primary" type="submit">حفظ الاشتراك</button></div></form>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', (event) => { if (event.target.matches('[data-close-subscription]')) closeDialog(dialog); });
        dialog.querySelector('form').addEventListener('submit', saveSubscription);
        return dialog;
    }

    function ensureClientEditDialog() {
        if ($('coachingClientEditDialog')) return $('coachingClientEditDialog');
        const dialog = document.createElement('dialog');
        dialog.id = 'coachingClientEditDialog';
        dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
        dialog.innerHTML = `<form class="dialog-body" id="coachingClientEditForm"><div class="details-dialog-head"><div><h3>تعديل بيانات العميل</h3><p>يتم تحديث الهوية نفسها، ولن تتأثر البرامج أو الخطط أو القياسات.</p></div><button class="btn btn-light btn-small" type="button" data-close-client-edit>إغلاق</button></div><input type="hidden" id="coachingEditMemberId"><div class="field"><label>الاسم الكامل *<input id="coachingEditName" maxlength="120" required></label></div><div class="field-grid"><label>رقم الهاتف *<input id="coachingEditPhone" inputmode="tel" maxlength="30" required></label><label>البريد الإلكتروني<input id="coachingEditEmail" type="email" maxlength="254"></label></div><div class="field"><label>الملاحظات<textarea id="coachingEditNotes" rows="3" maxlength="1000"></textarea></label></div><div class="dialog-actions"><button class="btn btn-light" type="button" data-close-client-edit>إلغاء</button><button class="btn btn-primary" type="submit">حفظ التعديلات</button></div></form>`;
        document.body.appendChild(dialog);
        dialog.addEventListener('click', (event) => { if (event.target.matches('[data-close-client-edit]')) closeDialog(dialog); });
        dialog.querySelector('form').addEventListener('submit', saveClientEdit);
        return dialog;
    }

    function openClientEditDialog(member) {
        ensureClientEditDialog();
        $('coachingEditMemberId').value = member.id;
        $('coachingEditName').value = member.fullName || '';
        $('coachingEditPhone').value = member.phone || '';
        $('coachingEditEmail').value = member.email || '';
        $('coachingEditNotes').value = member.notes || '';
        openDialog($('coachingClientEditDialog'));
    }

    async function saveClientEdit(event) {
        event.preventDefault();
        const memberId = $('coachingEditMemberId').value;
        try {
            const data = await requestJson(`/api/clients/${memberId}`, { method: 'PUT', body: JSON.stringify({ fullName: $('coachingEditName').value, phone: $('coachingEditPhone').value, email: $('coachingEditEmail').value, notes: $('coachingEditNotes').value }) });
            closeDialog($('coachingClientEditDialog'));
            notify('تم تحديث بيانات العميل.');
            if ($('coachingProfileDialog')?.open) openProfile(data.member.id);
            state.loaded = false;
            loadTrainees(true);
        } catch (error) { notify(error.message, 'error'); }
    }

    function openSubscriptionDialog(memberId) { ensureSubscriptionDialog(); $('subscriptionMemberId').value = memberId; $('subscriptionStart').value = today(); openDialog($('coachingSubscriptionDialog')); }

    async function saveSubscription(event) {
        event.preventDefault();
        try {
            const memberId = $('subscriptionMemberId').value;
            await requestJson(`/api/members/${memberId}/memberships`, { method: 'POST', body: JSON.stringify({ membershipPlan: $('subscriptionPlan').value, membershipType: $('subscriptionType').value, startDate: $('subscriptionStart').value, amountPaid: Number($('subscriptionPaid').value || 0), discountAmount: Number($('subscriptionDiscount').value || 0), paymentMethod: 'cash' }) });
            closeDialog($('coachingSubscriptionDialog'));
            closeDialog($('coachingProfileDialog'));
            state.loaded = false;
            await loadTrainees(true);
            notify('تم ربط الاشتراك بنفس العميل. سيظهر الآن في شاشة المشتركين بدون تكرار.');
            window.topGymActivateTab?.('members');
            window.dispatchEvent(new CustomEvent('topgym:coaching-updated', { detail: { memberId } }));
        } catch (error) { notify(error.message, 'error'); }
    }

    function decorateMemberTrainingPrintActions(panel, memberId) {
        panel?.querySelectorAll('.member-training-systems > div').forEach((system) => {
            const editButton = system.querySelector('[data-member-coaching-action="edit-workout"], [data-member-coaching-action="edit-diet"]');
            if (!editButton || system.querySelector('[data-member-coaching-action^="print-"]')) return;
            const type = editButton.dataset.memberCoachingAction === 'edit-diet' ? 'diet' : 'workout';
            [['print', 'طباعة'], ['pdf', 'PDF']].forEach(([action, label]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-light btn-small profile-print-action';
                button.dataset.memberCoachingAction = action + '-' + type;
                button.dataset.id = editButton.dataset.id;
                button.dataset.memberId = memberId;
                button.textContent = label;
                system.append(button);
            });
        });
    }

    function renderMemberTrainingPanel(memberId) {
        const content = $('detailsContent');
        if (!content || !memberId) return;
        content.querySelector('[data-member-training-panel]')?.remove();
        const panel = document.createElement('section');
        panel.className = 'member-training-panel';
        panel.dataset.memberTrainingPanel = 'true';
        panel.innerHTML = '<div class="loading">جاري تحميل أنظمة التدريب والتغذية…</div>';
        content.appendChild(panel);
        const printObserver = new MutationObserver(() => {
            decorateMemberTrainingPrintActions(panel, memberId);
            if (panel.querySelector('.member-training-systems')) printObserver.disconnect();
        });
        printObserver.observe(panel, { childList: true, subtree: true });
        requestJson(`/api/clients/${memberId}/training-overview`).then((overview) => {
            const workout = overview.workoutPrograms || [];
            const diets = overview.dietPlans || [];
            panel.innerHTML = `<div class="member-training-head"><div><span>امتداد ملف العميل</span><h4>التدريب والتغذية</h4><small>يمكن إنشاء الأنظمة للمشترك بدون تغيير نظام العضوية الحالي.</small></div><div><button class="btn btn-light btn-small" data-member-coaching-action="profile" data-id="${memberId}">فتح المتابعة</button><button class="btn btn-primary btn-small" data-member-coaching-action="new-workout" data-id="${memberId}">+ تدريب</button><button class="btn btn-light btn-small" data-member-coaching-action="new-diet" data-id="${memberId}">+ تغذية</button><button class="btn btn-light btn-small" data-member-coaching-action="start-session" data-id="${memberId}">بدء جلسة</button><button class="btn btn-light btn-small" data-member-coaching-action="log-meal" data-id="${memberId}">تسجيل وجبة</button><button class="btn btn-light btn-small" data-member-coaching-action="new-measurement" data-id="${memberId}">+ قياس</button></div></div><div class="member-training-systems">${[...workout.map((item) => `<div><span class="system-type workout">تدريب</span><strong>${escapeHtml(item.name)}</strong><small>${number(item.exerciseCount, 0)} تمرين · ${STATUS_LABELS[item.status] || item.status}</small><button class="btn btn-light btn-small" data-member-coaching-action="edit-workout" data-id="${item.id}" data-member-id="${memberId}">تعديل</button></div>`), ...diets.map((item) => `<div><span class="system-type diet">تغذية</span><strong>${escapeHtml(item.name)}</strong><small>${number(item.itemCount, 0)} طعام · ${STATUS_LABELS[item.status] || item.status}</small><button class="btn btn-light btn-small" data-member-coaching-action="edit-diet" data-id="${item.id}" data-member-id="${memberId}">تعديل</button><button class="btn btn-danger btn-small" data-member-coaching-action="delete-diet" data-id="${item.id}" data-member-id="${memberId}">حذف</button></div>`)].join('') || '<div class="profile-empty">لا توجد أنظمة مرتبطة بهذا العميل حتى الآن.</div>'}</div><div class="member-progress-line"><span>القياسات: <b>${number(overview.measurements?.length, 0)}</b></span><span>الجلسات المكتملة: <b>${number(overview.progress.completedSessions, 0)}</b></span><span>تسجيلات الوجبات: <b>${number(overview.progress.mealLogCount, 0)}</b></span></div>`;
        }).catch((error) => { panel.innerHTML = `<div class="coaching-empty error">${escapeHtml(error.message)}</div>`; });
    }

    function ensureExecutionDialogs() {
        if (!$('coachingSessionDialog')) {
            const dialog = document.createElement('dialog');
            dialog.id = 'coachingSessionDialog';
            dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
            dialog.innerHTML = `<form class="dialog-body" id="coachingSessionForm"><div class="details-dialog-head"><div><h3>تسجيل جلسة تدريب</h3><p>ابدأ الجلسة ثم احفظ كل مجموعة فعليًا في قاعدة البيانات.</p></div><button class="btn btn-light btn-small" type="button" data-session-action="close">إغلاق</button></div><input type="hidden" id="executionSessionMemberId"><input type="hidden" id="executionSessionId"><div id="executionSessionSetup"><div class="field-grid"><label>برنامج التدريب<select id="executionSessionProgram" required></select></label><label>اليوم التدريبي<select id="executionSessionRoutine"></select></label></div></div><div id="executionSessionActive" hidden></div><div class="dialog-actions"><button class="btn btn-light" type="button" data-session-action="close">إلغاء</button><button class="btn btn-primary" id="executionSessionStart" type="submit">بدء الجلسة</button><button class="btn btn-primary" id="executionSessionEnd" type="button" data-session-action="end" hidden>إنهاء الجلسة</button></div></form>`;
            document.body.appendChild(dialog);
            dialog.querySelector('form').addEventListener('submit', startExecutionSession);
            dialog.addEventListener('click', (event) => {
                const button = event.target.closest('[data-session-action]');
                if (!button) return;
                if (button.dataset.sessionAction === 'close') closeDialog(dialog);
                if (button.dataset.sessionAction === 'end') endExecutionSession();
                if (button.dataset.sessionAction === 'add-set') addExecutionSet();
            });
            $('executionSessionProgram')?.addEventListener('change', () => loadExecutionProgram($('executionSessionProgram').value));
            $('executionSessionRoutine')?.addEventListener('change', renderExecutionExerciseOptions);
            dialog.addEventListener('change', (event) => { if (event.target.id === 'executionSetExercise') renderExecutionExercisePreview(); });
        }
        if (!$('coachingMealLogDialog')) {
            const dialog = document.createElement('dialog');
            dialog.id = 'coachingMealLogDialog';
            dialog.className = 'coaching-small-dialog rounded-lg border-slate-200 shadow-lift';
            dialog.innerHTML = `<form class="dialog-body" id="coachingMealLogForm"><div class="details-dialog-head"><div><h3>تسجيل وجبة</h3><p>سجّل الكمية المستهلكة ليتم حفظ السعرات والماكروز تلقائيًا.</p></div><button class="btn btn-light btn-small" type="button" data-meal-action="close">إغلاق</button></div><input type="hidden" id="executionMealMemberId"><div class="field-grid"><label>خطة التغذية<select id="executionMealPlan" required></select></label><label>الوجبة والطعام<select id="executionMealItem" required></select></label><label>الكمية<input id="executionMealQuantity" type="number" min="0.001" step="0.1" required></label><label>وقت التسجيل<input id="executionMealAt" type="datetime-local" required></label></div><label class="builder-wide-label">ملاحظات<textarea id="executionMealNotes" rows="2"></textarea></label><div class="dialog-actions"><button class="btn btn-light" type="button" data-meal-action="close">إلغاء</button><button class="btn btn-primary" type="submit">حفظ تسجيل الوجبة</button></div></form>`;
            document.body.appendChild(dialog);
            dialog.querySelector('form').addEventListener('submit', saveExecutionMeal);
            dialog.addEventListener('click', (event) => { if (event.target.closest('[data-meal-action="close"]')) closeDialog(dialog); });
            $('executionMealPlan')?.addEventListener('change', renderExecutionMealItems);
            $('executionMealItem')?.addEventListener('change', renderExecutionMealPreview);
            const mealQuantity = dialog.querySelector('#executionMealQuantity');
            const mealPreview = document.createElement('div');
            mealPreview.id = 'executionMealNutritionPreview';
            mealPreview.className = 'execution-nutrition-preview';
            mealPreview.hidden = true;
            mealPreview.setAttribute('aria-live', 'polite');
            mealQuantity?.closest('label')?.after(mealPreview);
            mealQuantity?.addEventListener('input', renderExecutionMealPreview);
        }
    }

    function localDateTimeValue() {
        const date = new Date();
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    }

    function executionExercisesForSelectedRoutine() {
        const program = state.execution?.program;
        if (!program) return [];
        const routineId = $('executionSessionRoutine')?.value;
        if (!routineId) return (program.routines || []).flatMap((routine) => routine.exercises || []);
        return (program.routines || []).find((routine) => String(routine.id) === String(routineId))?.exercises || [];
    }

    function renderExecutionExerciseOptions() {
        const select = $('executionSetExercise');
        if (!select) return;
        const current = select.value;
        const exercises = executionExercisesForSelectedRoutine();
        select.innerHTML = exercises.map((exercise) => `<option value="${exercise.id}">${escapeHtml(exercise.nameAr || exercise.name || 'تمرين')}</option>`).join('');
        if (exercises.some((exercise) => String(exercise.id) === String(current))) select.value = current;
        renderExecutionExercisePreview();
    }

    function renderExecutionExercisePreview() {
        const active = $('executionSessionActive');
        const select = $('executionSetExercise');
        if (!active || !select) return;
        let preview = $('executionSetExercisePreview');
        if (!preview) {
            preview = document.createElement('div');
            preview.id = 'executionSetExercisePreview';
            preview.className = 'execution-exercise-preview';
            preview.setAttribute('aria-live', 'polite');
            active.querySelector('.field-grid')?.after(preview);
        }
        const exercise = executionExercisesForSelectedRoutine().find((item) => String(item.id) === String(select.value));
        if (!exercise) {
            preview.hidden = true;
            preview.replaceChildren();
            return;
        }
        preview.hidden = false;
        preview.innerHTML = `${exerciseImage(exercise, 'main', { className: 'exercise-media-builder', alt: exercise.nameAr || exercise.name || 'تمرين' })}<div><strong>${escapeHtml(exercise.nameAr || exercise.name || 'تمرين')}</strong><small>صورة التمرين المرجعية</small></div>`;
        window.TopGymExerciseAssets?.hydrate(preview);
    }

    async function openSessionDialog(memberId) {
        if (state.profile?.member?.id !== Number(memberId)) {
            try { state.profile = await requestJson(`/api/clients/${memberId}/training-overview`); } catch (error) { return notify(error.message, 'error'); }
        }
        const programs = state.profile?.workoutPrograms || [];
        if (!programs.length) return notify('أنشئ برنامج تدريب أولًا قبل تسجيل جلسة.', 'warning');
        ensureExecutionDialogs();
        await (window.TopGymExerciseAssets?.load ? window.TopGymExerciseAssets.load().catch(() => null) : Promise.resolve());
        state.execution = { memberId: Number(memberId), program: null, session: null };
        $('executionSessionMemberId').value = memberId;
        $('executionSessionId').value = '';
        $('executionSessionProgram').innerHTML = programs.map((program) => `<option value="${program.id}">${escapeHtml(program.name)}</option>`).join('');
        $('executionSessionSetup').hidden = false;
        $('executionSessionActive').hidden = true;
        $('executionSessionStart').hidden = false;
        $('executionSessionEnd').hidden = true;
        await loadExecutionProgram($('executionSessionProgram').value);
        openDialog($('coachingSessionDialog'));
    }

    async function loadExecutionProgram(programId) {
        if (!programId) return;
        try {
            const response = await requestJson(`/api/workoutprograms/${programId}`);
            state.execution.program = response.program;
            $('executionSessionRoutine').innerHTML = `<option value="">كل البرنامج</option>${(state.execution.program.routines || []).map((routine) => `<option value="${routine.id}">${escapeHtml(routine.name)}</option>`).join('')}`;
        } catch (error) { notify(error.message, 'error'); }
    }

    async function startExecutionSession(event) {
        event.preventDefault();
        if (state.execution?.session) return;
        const startButton = $('executionSessionStart');
        if (startButton?.disabled) return;
        if (startButton) startButton.disabled = true;
        try {
            const selectedRoutineId = $('executionSessionRoutine').value ? Number($('executionSessionRoutine').value) : null;
            const response = await requestJson('/api/workoutsessions/start', { method: 'POST', body: JSON.stringify({ memberId: Number($('executionSessionMemberId').value), programId: Number($('executionSessionProgram').value), routineId: selectedRoutineId }) });
            state.execution.session = response.session;
            $('executionSessionId').value = state.execution.session.id;
            const exercises = executionExercisesForSelectedRoutine();
            const routine = (state.execution.program?.routines || []).find((item) => String(item.id) === String(selectedRoutineId));
            $('executionSessionSetup').hidden = true;
            $('executionSessionStart').hidden = true;
            $('executionSessionEnd').hidden = false;
            $('executionSessionActive').hidden = false;
            $('executionSessionActive').innerHTML = `<div class="execution-session-head"><strong>${escapeHtml(state.execution.program?.name || 'جلسة تدريب')}</strong><span>${escapeHtml(routine?.name || 'كل البرنامج')} · بدأت الآن</span></div><div class="field-grid"><label>التمرين<select id="executionSetExercise">${exercises.map((exercise) => `<option value="${exercise.id}">${escapeHtml(exercise.nameAr || exercise.name || 'تمرين')}</option>`).join('')}</select></label><label>رقم المجموعة<input id="executionSetNumber" type="number" min="1" value="1"></label><label>الوزن كجم<input id="executionSetWeight" type="number" min="0" step="0.5"></label><label>التكرارات<input id="executionSetReps" type="number" min="0"></label></div><button class="btn btn-light" type="button" data-session-action="add-set">حفظ المجموعة</button><div id="executionSetLog" class="execution-set-log"><div class="profile-empty">لم تُسجل مجموعات بعد.</div></div>`;
            renderExecutionExercisePreview();
            notify('تم بدء جلسة التدريب.');
        } catch (error) { notify(error.message, 'error'); }
        finally { if (startButton) startButton.disabled = false; }
    }

    async function addExecutionSet() {
        const sessionId = $('executionSessionId')?.value;
        if (!sessionId) return;
        const addButton = document.querySelector('[data-session-action="add-set"]');
        if (addButton?.disabled) return;
        if (addButton) addButton.disabled = true;
        const exerciseSelect = $('executionSetExercise');
        const setNumber = Number($('executionSetNumber').value || 0);
        const weight = $('executionSetWeight').value || null;
        const reps = $('executionSetReps').value || null;
        const exerciseLabel = exerciseSelect?.selectedOptions?.[0]?.textContent || 'تمرين';
        try {
            await requestJson(`/api/workoutsessions/${sessionId}/sets`, { method: 'POST', body: JSON.stringify({ workoutExerciseId: Number(exerciseSelect.value), setNumber, weightKg: weight, reps }) });
            const log = $('executionSetLog');
            if (log.querySelector('.profile-empty')) log.innerHTML = '';
            log.insertAdjacentHTML('beforeend', `<div class="execution-set-row"><span>${escapeHtml(exerciseLabel)} · مجموعة ${setNumber}</span><b>${weight || 0} كجم × ${reps || 0}</b></div>`);
            $('executionSetNumber').value = setNumber + 1;
            notify('تم حفظ المجموعة.');
        } catch (error) { notify(error.message, 'error'); }
        finally { if (addButton) addButton.disabled = false; }
    }

    async function endExecutionSession() {
        const sessionId = $('executionSessionId')?.value;
        if (!sessionId) return;
        const endButton = $('executionSessionEnd');
        if (endButton?.disabled) return;
        if (endButton) endButton.disabled = true;
        try {
            await requestJson(`/api/workoutsessions/${sessionId}/end`, { method: 'POST', body: JSON.stringify({ status: 'completed' }) });
            closeDialog($('coachingSessionDialog'));
            notify('تم إنهاء الجلسة وحفظ التقدم.');
            openProfile(Number($('executionSessionMemberId').value));
        } catch (error) { notify(error.message, 'error'); }
        finally { if (endButton) endButton.disabled = false; }
    }

    async function openMealDialog(memberId) {
        if (state.profile?.member?.id !== Number(memberId)) {
            try { state.profile = await requestJson(`/api/clients/${memberId}/training-overview`); } catch (error) { return notify(error.message, 'error'); }
        }
        const plans = state.profile?.dietPlans || [];
        if (!plans.length) return notify('أنشئ خطة تغذية أولًا قبل تسجيل وجبة.', 'warning');
        ensureExecutionDialogs();
        try {
            state.executionMealPlans = await Promise.all(plans.map((plan) => requestJson(`/api/dietplans/${plan.id}`).then((response) => response.plan)));
        } catch (error) {
            return notify(error.message, 'error');
        }
        $('executionMealMemberId').value = memberId;
        $('executionMealPlan').innerHTML = state.executionMealPlans.map((plan) => `<option value="${plan.id}">${escapeHtml(plan.name)}</option>`).join('');
        $('executionMealAt').value = localDateTimeValue();
        $('executionMealNotes').value = '';
        renderExecutionMealItems();
        openDialog($('coachingMealLogDialog'));
    }

    function renderExecutionMealItems() {
        const plan = state.executionMealPlans?.find((item) => String(item.id) === String($('executionMealPlan')?.value));
        const items = (plan?.meals || []).flatMap((meal) => (meal.items || []).map((item) => ({ ...item, mealName: meal.name })));
        $('executionMealItem').innerHTML = items.map((item) => `<option value="${item.id}" data-quantity="${item.assignedQuantity || 100}">${escapeHtml(item.mealName)} · ${escapeHtml(item.nameAr || item.nameEn || 'طعام')}</option>`).join('');
        $('executionMealQuantity').value = items[0]?.assignedQuantity || 100;
        renderExecutionMealPreview();
    }

    function renderExecutionMealPreview() {
        const preview = $('executionMealNutritionPreview');
        if (!preview) return;
        const plan = state.executionMealPlans?.find((item) => String(item.id) === String($('executionMealPlan')?.value));
        const itemId = $('executionMealItem')?.value;
        const item = (plan?.meals || []).flatMap((meal) => (meal.items || []).map((candidate) => ({ ...candidate, mealName: meal.name }))).find((candidate) => String(candidate.id) === String(itemId));
        if (!item) { preview.hidden = true; preview.innerHTML = ''; return; }
        const assignedQuantity = Number(item.assignedQuantity || 0);
        const consumedQuantity = Number($('executionMealQuantity')?.value || 0);
        const factor = assignedQuantity > 0 ? consumedQuantity / assignedQuantity : 0;
        const value = (amount) => number(Number(amount || 0) * factor, 1);
        preview.hidden = false;
        preview.innerHTML = `<div class="execution-nutrition-preview-head"><strong>${escapeHtml(item.mealName || 'الوجبة')} · ${escapeHtml(item.nameAr || item.nameEn || 'طعام')}</strong><span>المخطط: ${number(assignedQuantity, 1)} ${escapeHtml(item.servingUnit || '')}</span></div><div class="execution-nutrition-preview-grid"><div><span>السعرات</span><b>${value(item.calories)}</b></div><div><span>Protein</span><b>${value(item.protein)}g</b></div><div><span>Carbs</span><b>${value(item.carbs)}g</b></div><div><span>Fat</span><b>${value(item.fats)}g</b></div></div>`;
    }

    async function saveExecutionMeal(event) {
        event.preventDefault();
        const submitButton = event.currentTarget.querySelector('button[type="submit"]');
        if (submitButton?.disabled) return;
        if (submitButton) submitButton.disabled = true;
        try {
            await requestJson('/api/meal-logs', { method: 'POST', body: JSON.stringify({ memberId: Number($('executionMealMemberId').value), mealItemId: Number($('executionMealItem').value), consumedQuantity: Number($('executionMealQuantity').value), consumedAt: new Date($('executionMealAt').value).toISOString(), notes: $('executionMealNotes').value }) });
            closeDialog($('coachingMealLogDialog'));
            notify('تم تسجيل الوجبة وحفظ السعرات والماكروز.');
            openProfile(Number($('executionMealMemberId').value));
        } catch (error) { notify(error.message, 'error'); }
        finally { if (submitButton) submitButton.disabled = false; }
    }

    async function handleProfileAction(action, id) {
        const memberId = state.profile?.member?.id;
        if (!memberId) return;
        if (action === 'new-workout') return openBuilder('workout', memberId);
        if (action === 'new-diet') return openBuilder('diet', memberId);
        if (action === 'edit-workout') return openBuilder('workout', memberId, id);
        if (action === 'edit-diet') return openBuilder('diet', memberId, id);
        if (action === 'print-workout') return runCoachingPrintAction('print', id, 'workout');
        if (action === 'pdf-workout') return runCoachingPrintAction('pdf', id, 'workout');
        if (action === 'print-diet') return runCoachingPrintAction('print', id, 'diet');
        if (action === 'pdf-diet') return runCoachingPrintAction('pdf', id, 'diet');
        if (action === 'print-overview') return runCoachingOverviewPrintAction('print', id || memberId);
        if (action === 'pdf-overview') return runCoachingOverviewPrintAction('pdf', id || memberId);
        if (action === 'delete-diet') return deleteDietPlan(id, memberId);
        if (action === 'new-measurement') return openMeasurementDialog(memberId);
        if (action === 'start-session') return openSessionDialog(memberId);
        if (action === 'log-meal') return openMealDialog(memberId);
        if (action === 'subscribe') return openSubscriptionDialog(memberId);
        if (action === 'edit-client') return openClientEditDialog(state.profile.member);
        if (action === 'delete') return;
        if (action === 'edit-measurement') {
            const item = (state.profile.measurements || []).find((measurement) => String(measurement.id) === String(id));
            return openMeasurementDialog(memberId, item);
        }
        if (action === 'delete-measurement') {
            if (!window.confirm('هل تريد حذف هذا القياس؟')) return;
            try { await requestJson(`/api/clients/${memberId}/measurements/${id}`, { method: 'DELETE' }); notify('تم حذف القياس.'); openProfile(memberId); } catch (error) { notify(error.message, 'error'); }
        }
    }

    function handleMemberCoachingAction(button) {
        const memberId = button.dataset.memberId || button.dataset.id;
        const action = button.dataset.memberCoachingAction;
        if (!memberId || !action) return;
        if (action === 'profile') return openProfile(memberId);
        if (action === 'new-workout') openBuilder('workout', memberId);
        else if (action === 'new-diet') openBuilder('diet', memberId);
        else if (action === 'edit-workout') openBuilder('workout', memberId, button.dataset.id);
        else if (action === 'edit-diet') openBuilder('diet', memberId, button.dataset.id);
        else if (action === 'print-workout') runCoachingPrintAction('print', button.dataset.id, 'workout');
        else if (action === 'pdf-workout') runCoachingPrintAction('pdf', button.dataset.id, 'workout');
        else if (action === 'print-diet') runCoachingPrintAction('print', button.dataset.id, 'diet');
        else if (action === 'pdf-diet') runCoachingPrintAction('pdf', button.dataset.id, 'diet');
        else if (action === 'delete-diet') deleteDietPlan(button.dataset.id, memberId);
        else if (action === 'start-session') openSessionDialog(memberId);
        else if (action === 'log-meal') openMealDialog(memberId);
        else if (action === 'new-measurement') openMeasurementDialog(memberId);
    }

    function initializeCoaching() {
        $('externalTraineeForm')?.addEventListener('submit', submitExternalTrainee);
        $('externalTraineeClose')?.addEventListener('click', () => closeDialog($('externalTraineeDialog')));
        $('externalTraineeCancel')?.addEventListener('click', () => closeDialog($('externalTraineeDialog')));
        $('addExternalTraineeButton')?.addEventListener('click', () => { renderExternalForm(); openDialog($('externalTraineeDialog')); });
        $('externalTraineeRefreshButton')?.addEventListener('click', () => { state.page = 1; state.loaded = false; loadTrainees(true); });
        $('externalTraineeSearch')?.addEventListener('input', () => { window.clearTimeout(state.searchTimer); state.searchTimer = window.setTimeout(() => { state.page = 1; state.loaded = false; loadTrainees(true); }, 300); });
        $('externalTraineesList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-coaching-action]');
            if (!button) return;
            const action = button.dataset.coachingAction;
            const id = button.dataset.id;
            if (action === 'toggle-more') {
                event.preventDefault();
                event.stopPropagation();
                window.topGymStopButtonLoading?.(button);
                const menu = button.closest('.trainee-more');
                const panel = menu?.querySelector('.trainee-more-menu');
                if (!panel) return;
                const shouldOpen = panel.hidden;
                closeTraineeMoreMenus();
                panel.hidden = !shouldOpen;
                const shouldFloat = shouldOpen && shouldFloatTraineeMoreMenu();
                panel.classList.toggle('is-floating', shouldFloat);
                button.setAttribute('aria-expanded', String(shouldOpen));
                if (shouldFloat) positionTraineeMoreMenu(menu, panel);
            } else if (action === 'profile') openProfile(id);
            else if (action === 'workout') openBuilder('workout', id);
            else if (action === 'diet') openBuilder('diet', id);
            else if (action === 'delete-diet') { closeTraineeMoreMenus(); deleteDietPlan(id, button.dataset.memberId); }
            else if (action === 'clear-search') {
                const input = $('externalTraineeSearch');
                if (input) input.value = '';
                state.page = 1;
                state.loaded = false;
                loadTrainees(true);
            } else if (action === 'retry') {
                state.page = 1;
                state.loaded = false;
                loadTrainees(true);
            }
        });
        document.addEventListener('click', (event) => {
            if (event.target.closest('#externalTraineesList .trainee-more')) return;
            closeTraineeMoreMenus();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            closeTraineeMoreMenus();
        });
        window.addEventListener('scroll', repositionTraineeMoreMenus, { passive: true });
        window.addEventListener('resize', repositionTraineeMoreMenus, { passive: true });
        $('externalTraineesPagination')?.addEventListener('click', (event) => { const button = event.target.closest('[data-coaching-page]'); if (!button || button.disabled) return; state.page += button.dataset.coachingPage === 'next' ? 1 : -1; state.loaded = false; loadTrainees(true); });
        $('coachingProfileClose')?.addEventListener('click', () => closeDialog($('coachingProfileDialog')));
        $('coachingBuilderClose')?.addEventListener('click', () => closeDialog($('coachingBuilderDialog')));
        $('coachingBuilderCancel')?.addEventListener('click', () => closeDialog($('coachingBuilderDialog')));
        $('coachingBuilderForm')?.addEventListener('submit', saveBuilder);
        $('coachingBuilderContent')?.addEventListener('click', (event) => { const button = event.target.closest('[data-builder-action]'); if (button) handleBuilderAction(button); });
        $('coachingBuilderBack')?.addEventListener('click', () => setBuilderStep((state.builder?.step || 1) - 1));
        $('coachingBuilderNext')?.addEventListener('click', () => setBuilderStep((state.builder?.step || 1) + 1));
        $('coachingBuilderPreview')?.addEventListener('click', () => setBuilderStep(3));
        $('coachingBuilderPrint')?.addEventListener('click', printBuilderDraft);
        $('coachingBuilderPdf')?.addEventListener('click', downloadBuilderDraftPdf);
        $('coachingBuilderStepper')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-builder-step-target]');
            if (button && !button.disabled) setBuilderStep(button.dataset.builderStepTarget);
        });
        $('coachingBuilderContent')?.addEventListener('input', (event) => {
            if (!state.builder || !event.target.closest('[data-builder-field], [data-calculator-field], [data-meal-field], [data-food-field], [data-routine-field], [data-exercise-field]')) return;
            if (event.target.matches('[data-builder-field="calorieAdjustment"]')) state.builder.calorieAdjustmentTouched = true;
            const draft = syncBuilderDraft();
            if (state.builder.type === 'diet' && state.builder.step === 1) refreshDietEnergyPreview(draft);
            if (state.builder.step === 2) refreshBuilderDerivedMetrics(draft);
        });
        $('coachingBuilderContent')?.addEventListener('change', async (event) => {
            if (!state.builder) return;
            const target = event.target;
            const draft = syncBuilderDraft();
            if (state.builder.type === 'diet' && state.builder.step === 1 && target.matches('[data-builder-field="memberId"]')) {
                draft.calculator = { ...(draft.calculator || {}), weightKg: '', heightCm: '', measurementDate: '' };
                try {
                    const measurementData = await requestJson(`/api/clients/${draft.memberId}/measurements`);
                    const latest = (measurementData.measurements || []).find((measurement) => measurement.weightKg != null || measurement.heightCm != null);
                    if (latest) { draft.calculator.weightKg = latest.weightKg || ''; draft.calculator.heightCm = latest.heightCm || ''; draft.calculator.measurementDate = latest.measuredAt || ''; }
                } catch (_) { /* measurements are optional */ }
                state.builder.draft = draft;
                renderBuilderV2();
                return;
            }
            if (state.builder.type === 'diet' && state.builder.step === 1 && target.matches('[data-builder-field="mealsPerDay"]')) {
                syncDietMealCount(draft, target.value);
                state.builder.draft = draft;
                renderBuilderV2();
                return;
            }
            if (state.builder.type === 'diet' && state.builder.step === 1 && target.matches('[data-builder-field="calorieGoal"]') && !state.builder.calorieAdjustmentTouched) {
                const defaultAdjustments = { lose: -500, maintain: 0, gain: 300 };
                draft.calorieAdjustment = defaultAdjustments[target.value] ?? 0;
                const adjustmentInput = $('coachingBuilderContent')?.querySelector('[data-builder-field="calorieAdjustment"]');
                if (adjustmentInput) adjustmentInput.value = draft.calorieAdjustment;
            }
            if (state.builder.type === 'diet' && state.builder.step === 1) refreshDietEnergyPreview(draft);
            if (state.builder.type === 'diet' && state.builder.step === 2) refreshBuilderDerivedMetrics(draft);
            if (state.builder.type === 'workout' && state.builder.step === 2 && target.matches('[data-exercise-field="exerciseId"]')) {
                const row = target.closest('.builder-exercise-row');
                const routineIndex = Number(row?.closest('[data-routine-index]')?.dataset.routineIndex);
                const exerciseIndex = Number(row?.dataset.exerciseIndex);
                const selectedExercise = draft.routines?.[routineIndex]?.exercises?.[exerciseIndex];
                const reference = row?.querySelector('.exercise-row-notes > div');
                if (reference && selectedExercise) reference.innerHTML = exerciseReference(selectedExercise);
                refreshBuilderDerivedMetrics(draft);
            }
        });
        $('detailsContent')?.addEventListener('click', (event) => { const button = event.target.closest('[data-member-coaching-action]'); if (button) handleMemberCoachingAction(button); });
        $('membersList')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-member-coaching-action]');
            if (!button) return;
            event.preventDefault();
            event.stopPropagation();
            const memberId = button.dataset.memberId || button.dataset.id || button.closest('[data-member-id]')?.dataset.memberId;
            const action = button.dataset.memberCoachingAction;
            if (action === 'workout') openBuilder('workout', memberId, null, button.dataset.memberName || '');
            else if (action === 'diet') openBuilder('diet', memberId, null, button.dataset.memberName || '');
        });
        $('coachingProfileContent')?.addEventListener('click', (event) => { const button = event.target.closest('[data-profile-action], [data-measurement-action]'); if (!button) return; const action = button.dataset.profileAction || (button.dataset.measurementAction === 'edit' ? 'edit-measurement' : 'delete-measurement'); if (!action) return; handleProfileAction(action, button.dataset.id); });
        $('coachingProfileContent')?.addEventListener('click', (event) => {
            const button = event.target.closest('[data-checkin-action]');
            if (!button) return;
            const memberId = state.profile?.member?.id;
            if (!memberId) return;
            const action = button.dataset.checkinAction;
            if (action === 'new') openCheckinDialog(memberId);
            if (action === 'edit') openCheckinDialog(memberId, (state.profile.checkins || []).find((item) => Number(item.id) === Number(button.dataset.id)));
            if (action === 'delete') deleteCheckinFromProfile(memberId, button.dataset.id);
        });
        window.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'trainees') loadTrainees(); });
        window.addEventListener('topgym:member-details-opened', (event) => renderMemberTrainingPanel(event.detail?.member?.id || event.detail?.details?.member?.id));
        window.addEventListener('topgym:coaching-updated', (event) => { if (event.detail?.memberId && $('detailsDialog')?.open) renderMemberTrainingPanel(event.detail.memberId); });
        window.addEventListener('topgym:coaching-data-changed', (event) => {
            state.loaded = false;
            if (!$('traineesSection')?.hidden) loadTrainees(true);
            const memberId = event.detail?.memberId;
            if (memberId && Number(state.profile?.member?.id) === Number(memberId) && $('coachingProfileDialog')?.open) openProfile(memberId);
        });
        if (document.querySelector('[data-page-tab="trainees"]')?.classList.contains('active')) loadTrainees();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeCoaching, { once: true });
    else initializeCoaching();
})();
