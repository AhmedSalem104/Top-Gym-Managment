(() => {
    'use strict';
    if (window.__topGymWhatsappTemplatesUiLoaded) return;
    window.__topGymWhatsappTemplatesUiLoaded = true;

    const state = { templates: [], selectedId: '', dirty: false, loading: false };
    const $ = (id) => document.getElementById(id);
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    function ensureMarkup() {
        if ($('whatsappTemplatesSection')) return;
        const section = document.createElement('section');
        section.className = 'whatsapp-templates-page';
        section.id = 'whatsappTemplatesSection';
        section.hidden = true;
        section.dataset.ownerOnly = '';
        section.dataset.pageTabPanel = 'whatsapp-templates';
        section.setAttribute('aria-labelledby', 'whatsappTemplatesTitle');
        section.innerHTML = `
            <header class="whatsapp-templates-head">
                <div><span class="management-eyebrow">WhatsApp · Owner فقط</span><h2 id="whatsappTemplatesTitle">قوالب رسائل WhatsApp</h2><p>تحكم في الرسائل الجاهزة التي تستخدم عند التواصل مع الأعضاء والعملاء عبر WhatsApp.</p></div>
                <div class="whatsapp-templates-note" role="note"><span aria-hidden="true">↗</span><span>يتم فتح WhatsApp بالرسالة الجاهزة، والإرسال يتم يدويًا.</span></div>
            </header>
            <div class="whatsapp-templates-layout">
                <section class="whatsapp-templates-list" id="whatsappTemplatesList" aria-label="قوالب الرسائل"></section>
                <section class="whatsapp-template-editor" id="whatsappTemplateEditor" hidden aria-labelledby="whatsappTemplateEditorName">
                    <header class="whatsapp-template-editor-head"><div><span class="management-eyebrow">محرر القالب</span><h3 id="whatsappTemplateEditorName"></h3><p id="whatsappTemplateEditorDescription"></p></div><span class="whatsapp-template-category" id="whatsappTemplateEditorCategory"></span></header>
                    <div class="whatsapp-template-editor-grid">
                        <div class="whatsapp-template-field"><label for="whatsappTemplateBody">نص الرسالة</label><textarea id="whatsappTemplateBody" spellcheck="true" aria-describedby="whatsappTemplateVariablesHint"></textarea><span class="whatsapp-template-section-label" id="whatsappTemplateVariablesHint">اضغط على أي متغير لإدراجه عند موضع المؤشر.</span><div class="whatsapp-template-variables" id="whatsappTemplateVariables" aria-label="البيانات المتاحة"></div></div>
                        <div class="whatsapp-template-preview-wrap"><span class="whatsapp-template-section-label">المعاينة المباشرة</span><div class="whatsapp-template-preview" id="whatsappTemplatePreview" role="status" aria-live="polite"></div></div>
                    </div>
                    <footer class="whatsapp-template-actions"><button class="btn btn-light" id="whatsappTemplateRestore" type="button">استعادة الافتراضي</button><button class="btn btn-light" id="whatsappTemplateTest" type="button">إرسال تجريبي</button><button class="btn btn-primary" id="whatsappTemplateSave" type="button" disabled>حفظ التعديلات</button></footer>
                </section>
            </div>`;
        const management = $('managementSection');
        management?.after(section);
    }
    ensureMarkup();
    const sampleContext = {
        member_name: 'أحمد محمد', gym_name: 'Top Gym', plan_name: 'الباقة الذهبية', membership_type: 'اشتراك شهري',
        start_date: '01/09/2026', expiry_date: '30/09/2026', days_remaining: '7', list_price: '300 جنيه',
        discount_amount: '50 جنيه', amount_due: '250 جنيه', amount_paid: '200 جنيه', remaining_amount: '50 جنيه',
        payment_method: 'نقدي', freeze_until: '20/09/2026', days_since_last_visit: '14', visitor_name: 'أحمد محمد',
        visit_reference: 'VIS-000123', pass_type: 'حصة يومية', membership_code: 'LF-AB12CD', portal_url: `${window.location.origin}/member-portal`,
        tenant_type: 'الجيم', login_url: `${window.location.origin}/`, username: 'owner@example.com', temporary_password: '********'
    };

    function notify(message, type = 'success') {
        if (window.showToast) window.showToast(message, type === 'error', type);
        else if (window.Swal) void window.Swal.fire({ toast: true, position: 'top-start', icon: type, title: message, showConfirmButton: false, timer: 3200 });
    }

    function selected() { return state.templates.find((item) => item.id === state.selectedId) || null; }

    function renderList() {
        const host = $('whatsappTemplatesList');
        if (!host) return;
        host.innerHTML = state.templates.map((template) => `
            <button type="button" class="whatsapp-template-card ${template.id === state.selectedId ? 'is-selected' : ''}" data-template-id="${escapeHtml(template.id)}">
                <span class="whatsapp-template-card-icon" aria-hidden="true">✦</span>
                <span class="whatsapp-template-card-copy"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.description)}</small><em>${escapeHtml(template.category)} · ${template.isCustomized ? 'مخصص للجيم' : 'افتراضي'}</em></span>
                <span class="whatsapp-template-card-state ${template.isCustomized ? 'custom' : ''}">${template.isCustomized ? 'معدل' : 'افتراضي'}</span>
            </button>`).join('') || '<div class="whatsapp-template-empty">لا توجد قوالب متاحة حاليًا.</div>';
    }

    function renderEditor() {
        const template = selected();
        const editor = $('whatsappTemplateEditor');
        if (!editor || !template) { if (editor) editor.hidden = true; return; }
        editor.hidden = false;
        const locked = template.scope === 'platform';
        $('whatsappTemplateEditorName').textContent = template.name;
        $('whatsappTemplateEditorDescription').textContent = locked ? `${template.description} هذا القالب للمنصة فقط.` : template.description;
        $('whatsappTemplateBody').value = template.body;
        $('whatsappTemplateEditorCategory').textContent = template.category;
        $('whatsappTemplateBody').disabled = locked;
        $('whatsappTemplateSave').disabled = locked || !state.dirty;
        $('whatsappTemplateRestore').disabled = locked;
        $('whatsappTemplateTest').disabled = locked;
        $('whatsappTemplateVariables').innerHTML = template.variables.map((key) => `<button type="button" class="whatsapp-variable-chip" data-variable="${escapeHtml(key)}">[${escapeHtml(variableLabel(key))}]</button>`).join('');
        updatePreview();
    }

    function variableLabel(key) {
        const labels = { member_name: 'اسم العضو', gym_name: 'اسم الجيم', plan_name: 'الباقة', membership_type: 'نوع الاشتراك', start_date: 'تاريخ البداية', expiry_date: 'تاريخ الانتهاء', days_remaining: 'الأيام المتبقية', list_price: 'السعر الأساسي', discount_amount: 'الخصم', amount_due: 'المستحق', amount_paid: 'المدفوع', remaining_amount: 'المتبقي', payment_method: 'طريقة الدفع', freeze_until: 'تاريخ انتهاء التجميد', days_since_last_visit: 'أيام الغياب', visitor_name: 'اسم الزائر', visit_reference: 'رقم الزيارة', pass_type: 'نوع الحصة', membership_code: 'كود العضوية', portal_url: 'رابط البوابة', tenant_type: 'نوع الحساب', login_url: 'رابط الدخول', username: 'اسم المستخدم', temporary_password: 'كلمة المرور المؤقتة' };
        return labels[key] || key;
    }

    function updatePreview() {
        const body = $('whatsappTemplateBody');
        const preview = $('whatsappTemplatePreview');
        const template = selected();
        if (!body || !preview || !template || !window.LogicFitWhatsAppTemplates) return;
        preview.textContent = window.LogicFitWhatsAppTemplates.expand(body.value, sampleContext);
    }

    function insertVariable(key) {
        const field = $('whatsappTemplateBody');
        if (!field) return;
        const token = `{{${key}}}`;
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? start;
        field.setRangeText(token, start, end, 'end');
        state.dirty = true;
        updatePreview();
        field.focus();
        $('whatsappTemplateSave').disabled = false;
        field.setSelectionRange(start + token.length, start + token.length);
    }

    async function load() {
        if (state.loading) return;
        state.loading = true;
        const list = $('whatsappTemplatesList');
        if (list) list.innerHTML = '<div class="whatsapp-template-loading">جارٍ تحميل القوالب…</div>';
        try {
            state.templates = await window.LogicFitWhatsAppTemplates.load();
            state.selectedId ||= state.templates[0]?.id || '';
            renderList();
            renderEditor();
        } catch (error) {
            if (list) list.innerHTML = `<div class="whatsapp-template-empty is-error">${escapeHtml(error.message)}</div>`;
        } finally { state.loading = false; }
    }

    async function save() {
        const template = selected();
        if (!template) return;
        const body = $('whatsappTemplateBody').value;
        const button = $('whatsappTemplateSave');
        button.disabled = true;
        try {
            const response = await fetch(`/api/whatsapp-templates/${encodeURIComponent(template.id)}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'تعذر حفظ القالب.');
            const index = state.templates.findIndex((item) => item.id === template.id);
            if (index >= 0) state.templates[index] = payload.template;
            await window.LogicFitWhatsAppTemplates.load({ force: true });
            state.dirty = false;
            renderList();
            renderEditor();
            notify('تم حفظ قالب الرسالة للجيم.');
        } catch (error) { button.disabled = false; notify(error.message, 'error'); }
    }

    async function restore() {
        const template = selected();
        if (!template || !window.confirm('سيتم إلغاء التعديل والعودة للرسالة الافتراضية. هل تريد المتابعة؟')) return;
        try {
            const response = await fetch(`/api/whatsapp-templates/${encodeURIComponent(template.id)}/restore-default`, { method: 'POST', credentials: 'same-origin' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'تعذر استعادة الرسالة الافتراضية.');
            const index = state.templates.findIndex((item) => item.id === template.id);
            if (index >= 0) state.templates[index] = payload.template;
            await window.LogicFitWhatsAppTemplates.load({ force: true });
            state.dirty = false;
            renderList(); renderEditor();
            notify('تمت استعادة الرسالة الافتراضية.');
        } catch (error) { notify(error.message, 'error'); }
    }

    function sendTest() {
        const template = selected();
        if (!template) return;
        const phone = window.prompt('اكتب رقم اختبار لفتح WhatsApp:');
        if (!phone || !/[0-9]{6,}/.test(phone.replace(/\D/g, ''))) return;
        const message = window.LogicFitWhatsAppTemplates.expand($('whatsappTemplateBody').value, sampleContext);
        window.open(`https://wa.me/${encodeURIComponent(phone.replace(/\D/g, ''))}?text=${encodeURIComponent(message)}`, 'logicFitTemplateTest', 'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes');
    }

    document.addEventListener('click', (event) => {
        const card = event.target.closest('[data-template-id]');
        if (card && $('whatsappTemplatesList')?.contains(card)) {
            if (state.dirty && !window.confirm('لديك تعديلات غير محفوظة. هل تريد فتح قالب آخر؟')) return;
            state.dirty = false; state.selectedId = card.dataset.templateId; renderList(); renderEditor(); return;
        }
        const chip = event.target.closest('[data-variable]');
        if (chip) return insertVariable(chip.dataset.variable);
        if (event.target.closest('#whatsappTemplateSave')) return void save();
        if (event.target.closest('#whatsappTemplateRestore')) return void restore();
        if (event.target.closest('#whatsappTemplateTest')) return sendTest();
    });
    $('whatsappTemplateBody')?.addEventListener('input', () => { state.dirty = true; updatePreview(); $('whatsappTemplateSave').disabled = false; });
    document.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.name === 'whatsapp-templates') void load(); });
    window.topGymWhatsappTemplatesUi = { load };
    // A deep link can finish navigation just before this lazy module is
    // evaluated. Reconcile with the already-active tab so the editor never
    // remains on an empty loading surface until the user navigates away/back.
    if (document.documentElement.dataset.topGymActiveTab === 'whatsapp-templates') void load();
})();
