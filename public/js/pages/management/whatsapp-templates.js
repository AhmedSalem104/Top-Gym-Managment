(() => {
    'use strict';

    if (window.topGymPlatformWhatsappTemplates) return;

    const state = { target: null, templates: [], selectedId: '', dirty: false, loading: false, mounted: false };

    const variableLabels = {
        member_name: 'اسم العضو', gym_name: 'اسم الجيم', plan_name: 'الباقة', membership_type: 'نوع الاشتراك',
        start_date: 'تاريخ البداية', expiry_date: 'تاريخ الانتهاء', days_remaining: 'الأيام المتبقية',
        base_price: 'السعر الأساسي', list_price: 'السعر الأساسي (قديم)', discount_amount: 'الخصم', amount_due: 'المستحق', amount_paid: 'المدفوع',
        remaining_amount: 'المتبقي', payment_method: 'طريقة الدفع', freeze_until: 'تاريخ انتهاء التجميد',
        days_since_last_visit: 'أيام الغياب', visitor_name: 'اسم الزائر', visit_reference: 'رقم الزيارة',
        pass_type: 'نوع الحصة', portal_code: 'كود العضوية', membership_code: 'كود العضوية (قديم)', portal_url: 'رابط البوابة',
        tenant_type: 'نوع الحساب', login_url: 'رابط الدخول', username: 'اسم المستخدم',
        temporary_password: 'كلمة المرور المؤقتة'
    };

    const sampleContext = {
        member_name: 'أحمد محمد', gym_name: 'Top Gym', plan_name: 'الباقة الذهبية', membership_type: 'اشتراك شهري',
        start_date: '01/09/2026', expiry_date: '30/09/2026', days_remaining: '7', base_price: '300 جنيه', list_price: '300 جنيه',
        discount_amount: '50 جنيه', amount_due: '250 جنيه', amount_paid: '200 جنيه', remaining_amount: '50 جنيه',
        payment_method: 'نقدي', freeze_until: '20/09/2026', days_since_last_visit: '14', visitor_name: 'أحمد محمد',
        visit_reference: 'VIS-000123', pass_type: 'حصة يومية', portal_code: 'LF-AB12CD', membership_code: 'LF-AB12CD',
        portal_url: window.location.origin + '/member-portal', tenant_type: 'الجيم',
        login_url: window.location.origin, username: 'owner@example.com', temporary_password: '********'
    };

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));

    const selected = () => state.templates.find((template) => template.id === state.selectedId) || null;

    function showMessage(message, type = 'success') {
        if (window.topGymFeedback?.toast) window.topGymFeedback.toast(message, type);
        else if (window.Swal) void window.Swal.fire({ toast: true, position: 'top-start', icon: type, title: message, showConfirmButton: false, timer: 3200 });
    }

    function statusMarkup() {
        return '<span data-whatsapp-template-status class="whatsapp-template-status platform">قالب النظام · Platform</span>';
    }

    function markup() {
        return [
            '<section class="whatsapp-templates-page platform-whatsapp-management" aria-labelledby="platformWhatsappTemplatesTitle">',
            '<header class="whatsapp-templates-head"><div class="whatsapp-templates-heading">',
            '<span class="whatsapp-templates-kicker">PLATFORM ADMIN · SYSTEM TEMPLATES</span>',
            '<h2 id="platformWhatsappTemplatesTitle">الرسائل وWhatsApp</h2>',
            '<p>إدارة قوالب WhatsApp المركزية المستخدمة لجميع الجيمات والمدربين. يظل فتح WhatsApp والإرسال يدويًا.</p>',
            '</div><div class="whatsapp-templates-head-meta" role="note">',
            '<span class="whatsapp-templates-count-badge" data-whatsapp-template-count>0</span>',
            '<div><strong>قوالب مركزية</strong><small>قالب نظام واحد لكل نوع رسالة.</small></div></div></header>',
            '<div class="whatsapp-templates-layout">',
            '<aside class="whatsapp-templates-list-panel" aria-label="قوالب رسائل WhatsApp">',
            '<header class="whatsapp-templates-list-head"><div><span class="whatsapp-templates-section-kicker">CATALOG</span><h3>القوالب</h3></div><span class="whatsapp-templates-list-count" data-whatsapp-template-list-count>0</span></header>',
            '<p class="whatsapp-templates-list-hint">اختر قالبًا لتحريره ومعاينته. التعديلات المركزية تنطبق على كل الـTenants.</p>',
            '<div class="whatsapp-templates-list" data-whatsapp-template-list role="listbox" aria-label="القوالب المركزية"></div></aside>',
            '<section class="whatsapp-template-editor" data-whatsapp-template-editor hidden aria-labelledby="platformWhatsappTemplateEditorName">',
            '<header class="whatsapp-template-editor-head"><div class="whatsapp-template-editor-title">',
            '<span class="whatsapp-templates-section-kicker">EDITOR</span><h3 data-whatsapp-template-name id="platformWhatsappTemplateEditorName"></h3>',
            '<p data-whatsapp-template-description></p></div><div class="whatsapp-template-status-stack">',
            '<span class="whatsapp-template-category" data-whatsapp-template-category></span><span data-whatsapp-template-status></span></div></header>',
            '<div class="whatsapp-template-editor-body"><div class="whatsapp-template-field">',
            '<div class="whatsapp-template-label-row"><label for="platformWhatsappTemplateBody">نص الرسالة</label><span class="whatsapp-template-character-count" data-whatsapp-template-character-count>0</span></div>',
            '<textarea id="platformWhatsappTemplateBody" data-whatsapp-template-body maxlength="8000" spellcheck="true" aria-describedby="platformWhatsappTemplateVariablesHint"></textarea>',
            '<span class="whatsapp-template-helper" id="platformWhatsappTemplateVariablesHint">اضغط على أي متغير لإضافته عند موضع المؤشر.</span></div>',
            '<div class="whatsapp-template-variables-box"><div class="whatsapp-template-variables-head"><div>',
            '<span class="whatsapp-templates-section-kicker">INSERT</span><h4>المتغيرات المتاحة</h4></div><span class="whatsapp-template-variables-count" data-whatsapp-template-variables-count>0</span></div>',
            '<div class="whatsapp-template-variables" data-whatsapp-template-variables aria-label="المتغيرات المتاحة"></div></div></div>',
            '<footer class="whatsapp-template-actions"><span class="whatsapp-template-dirty-state" data-whatsapp-template-dirty role="status" aria-live="polite">✓ محفوظ</span>',
            '<div class="whatsapp-template-action-buttons"><button class="btn btn-light" type="button" data-whatsapp-action="restore">استعادة الافتراضي</button>',
            '<button class="btn btn-light" type="button" data-whatsapp-action="test">فتح معاينة في WhatsApp</button>',
            '<button class="btn btn-primary" type="button" data-whatsapp-action="save" disabled>حفظ التعديلات</button></div></footer></section>',
            '<aside class="whatsapp-template-preview-panel" data-whatsapp-template-preview-panel hidden aria-label="معاينة الرسالة">',
            '<header class="whatsapp-template-preview-head"><div><span class="whatsapp-templates-section-kicker">LIVE PREVIEW</span><h3>معاينة WhatsApp</h3></div><span class="whatsapp-template-preview-badge">بيانات تجريبية</span></header>',
            '<div class="whatsapp-template-preview-device"><div class="whatsapp-template-preview-toolbar"><span class="whatsapp-preview-avatar" aria-hidden="true">T</span><div><strong>Top Gym</strong><small>WhatsApp</small></div><span class="whatsapp-preview-dot" aria-hidden="true"></span></div>',
            '<div class="whatsapp-template-preview" data-whatsapp-template-preview role="status" aria-live="polite"></div></div>',
            '<p class="whatsapp-template-preview-note">المعاينة لا ترسل رسالة ولا تستخدم بيانات عضو حقيقي.</p></aside></div></section>'
        ].join('');
    }

    function renderList() {
        const list = state.target?.querySelector('[data-whatsapp-template-list]');
        if (!list) return;
        const count = String(state.templates.length).padStart(2, '0');
        const countBadge = state.target.querySelector('[data-whatsapp-template-count]');
        const listCount = state.target.querySelector('[data-whatsapp-template-list-count]');
        if (countBadge) countBadge.textContent = String(state.templates.length);
        if (listCount) listCount.textContent = count;
        list.innerHTML = state.templates.length ? state.templates.map((template, index) =>
            '<button type="button" role="option" aria-selected="' + String(template.id === state.selectedId) + '" class="whatsapp-template-card ' + (template.id === state.selectedId ? 'is-selected' : '') + '" data-template-id="' + escapeHtml(template.id) + '">' +
            '<span class="whatsapp-template-card-index">' + String(index + 1).padStart(2, '0') + '</span>' +
            '<span class="whatsapp-template-card-copy"><strong>' + escapeHtml(template.name) + '</strong><small>' + escapeHtml(template.description || '') + '</small><em>' + escapeHtml(template.category || '') + '</em></span>' +
            '<span class="whatsapp-template-card-state platform">نظامي</span></button>'
        ).join('') : '<div class="whatsapp-template-empty">لا توجد قوالب متاحة.</div>';
    }

    function updateDirty() {
        const dirty = state.target?.querySelector('[data-whatsapp-template-dirty]');
        if (!dirty) return;
        dirty.textContent = state.dirty ? '● تغييرات غير محفوظة' : '✓ محفوظ';
        dirty.classList.toggle('is-dirty', state.dirty);
        const save = state.target.querySelector('[data-whatsapp-action="save"]');
        if (save) save.disabled = !state.dirty;
    }

    function updatePreview() {
        const body = state.target?.querySelector('[data-whatsapp-template-body]');
        const preview = state.target?.querySelector('[data-whatsapp-template-preview]');
        if (!body || !preview || !window.LogicFitWhatsAppTemplates) return;
        preview.textContent = window.LogicFitWhatsAppTemplates.expand(body.value, sampleContext) || '…';
        const counter = state.target.querySelector('[data-whatsapp-template-character-count]');
        if (counter) counter.textContent = String(body.value.length);
    }

    function renderEditor() {
        const template = selected();
        const editor = state.target?.querySelector('[data-whatsapp-template-editor]');
        const previewPanel = state.target?.querySelector('[data-whatsapp-template-preview-panel]');
        if (!editor || !previewPanel || !template) {
            if (editor) editor.hidden = true;
            if (previewPanel) previewPanel.hidden = true;
            return;
        }
        editor.hidden = false;
        previewPanel.hidden = false;
        const body = state.target.querySelector('[data-whatsapp-template-body]');
        state.target.querySelector('[data-whatsapp-template-name]').textContent = template.name || '';
        state.target.querySelector('[data-whatsapp-template-description]').textContent = template.description || '';
        state.target.querySelector('[data-whatsapp-template-category]').textContent = template.category || '';
        state.target.querySelector('[data-whatsapp-template-status]').outerHTML = statusMarkup();
        body.value = template.body || '';
        body.readOnly = false;
        body.disabled = false;
        const variables = Array.isArray(template.variables) ? template.variables : [];
        state.target.querySelector('[data-whatsapp-template-variables-count]').textContent = String(variables.length).padStart(2, '0');
        state.target.querySelector('[data-whatsapp-template-variables]').innerHTML = variables.map((key) =>
            '<button type="button" class="whatsapp-variable-chip" data-variable="' + escapeHtml(key) + '"><span>' + escapeHtml(variableLabels[key] || key) + '</span><code>{{' + escapeHtml(key) + '}}</code></button>'
        ).join('') || '<span class="whatsapp-template-no-variables">لا توجد متغيرات لهذا القالب.</span>';
        updatePreview();
        updateDirty();
    }

    async function load({ force = false } = {}) {
        if (!state.target || state.loading || !window.LogicFitWhatsAppTemplates) return;
        state.loading = true;
        const list = state.target.querySelector('[data-whatsapp-template-list]');
        if (list) list.innerHTML = '<div class="whatsapp-template-loading">جارٍ تحميل القوالب…</div>';
        try {
            const templates = await window.LogicFitWhatsAppTemplates.load({ platform: true, force });
            state.templates = Array.isArray(templates) ? templates : [];
            if (!state.templates.some((template) => template.id === state.selectedId)) state.selectedId = state.templates[0]?.id || '';
            state.dirty = false;
            renderList();
            renderEditor();
        } catch (error) {
            if (list) list.innerHTML = '<div class="whatsapp-template-empty is-error">' + escapeHtml(error.message || 'تعذر تحميل القوالب.') + '</div>';
        } finally {
            state.loading = false;
        }
    }

    function insertVariable(key) {
        const field = state.target?.querySelector('[data-whatsapp-template-body]');
        if (!field || field.disabled || field.readOnly) return;
        const token = '{{' + key + '}}';
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? start;
        field.setRangeText(token, start, end, 'end');
        state.dirty = true;
        updatePreview();
        updateDirty();
        field.focus();
    }

    async function save() {
        const template = selected();
        const body = state.target?.querySelector('[data-whatsapp-template-body]');
        const button = state.target?.querySelector('[data-whatsapp-action="save"]');
        if (!template || !body || !state.dirty) return;
        if (button) button.disabled = true;
        try {
            const response = await fetch('/api/platform/whatsapp-templates/' + encodeURIComponent(template.id), {
                method: 'PUT', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ body: body.value })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'تعذر حفظ القالب.');
            await load({ force: true });
            showMessage('تم حفظ قالب النظام.');
        } catch (error) {
            if (button) button.disabled = false;
            showMessage(error.message, 'error');
        }
    }

    async function restore() {
        const template = selected();
        if (!template || !window.confirm('سيتم استعادة نص قالب النظام الافتراضي. هل تريد المتابعة؟')) return;
        try {
            const response = await fetch('/api/platform/whatsapp-templates/' + encodeURIComponent(template.id) + '/restore-default', {
                method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'تعذر استعادة القالب الافتراضي.');
            await load({ force: true });
            showMessage('تمت استعادة القالب الافتراضي.');
        } catch (error) {
            showMessage(error.message, 'error');
        }
    }

    function sendTest() {
        const template = selected();
        const body = state.target?.querySelector('[data-whatsapp-template-body]');
        if (!template || !body) return;
        const phone = window.prompt('اكتب رقم اختبار لفتح WhatsApp:');
        const digits = String(phone || '').replace(/\D/g, '');
        if (digits.length < 6) return;
        const message = window.LogicFitWhatsAppTemplates.expand(body.value, sampleContext);
        window.open('https://wa.me/' + encodeURIComponent(digits) + '?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
    }

    function bindEvents() {
        state.target.addEventListener('input', (event) => {
            if (!event.target.matches('[data-whatsapp-template-body]')) return;
            state.dirty = true;
            updatePreview();
            updateDirty();
        });
        state.target.addEventListener('click', (event) => {
            const card = event.target.closest('[data-template-id]');
            if (card && state.target.contains(card)) {
                if (state.dirty && !window.confirm('لديك تغييرات غير محفوظة. هل تريد تبديل القالب؟')) return;
                state.selectedId = card.dataset.templateId;
                state.dirty = false;
                renderList();
                renderEditor();
                return;
            }
            const variable = event.target.closest('[data-variable]');
            if (variable) { insertVariable(variable.dataset.variable); return; }
            const action = event.target.closest('[data-whatsapp-action]')?.dataset.whatsappAction;
            if (action === 'save') { void save(); return; }
            if (action === 'restore') { void restore(); return; }
            if (action === 'test') sendTest();
        });
    }

    function mount(target = document.getElementById('platformWhatsappTemplatesMount')) {
        if (!target) return false;
        if (state.target === target && state.mounted) return true;
        state.target = target;
        state.target.innerHTML = markup();
        state.mounted = true;
        if (!state.target.dataset.bound) {
            state.target.dataset.bound = 'true';
            bindEvents();
        }
        void load();
        return true;
    }

    window.addEventListener('beforeunload', (event) => {
        if (!state.dirty) return;
        event.preventDefault();
        event.returnValue = '';
    });

    window.topGymPlatformWhatsappTemplates = Object.freeze({ load, mount });
})();
