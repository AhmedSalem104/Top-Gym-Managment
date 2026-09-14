(() => {
    'use strict';
    if (window.__topGymWhatsappTemplatesUiLoaded) return;
    window.__topGymWhatsappTemplatesUiLoaded = true;

    const state = { templates: [], selectedId: '', dirty: false, loading: false };
    const $ = (id) => document.getElementById(id);
    const arabic = (value) => String.fromCodePoint(...value.split('-').map((part) => parseInt(part, 16)));
    const copy = {
        ownerOnly: arabic('0648-0627-0644-0643-0020-0641-0642-0637'),
        templates: arabic('0642-0648-0627-0644-0628-0020-0631-0633-0627-0626-0644-0020-0057-0068-0061-0074-0073-0041-0070-0070'),
        backToSettings: arabic('0627-0644-0639-0648-062f-0629-0020-0625-0644-0649-0020-0625-0639-062f-0627-062f-0627-062a-0020-0627-0644-0645-0646-0635-0629'),
        editor: arabic('0645-062d-0631-0631-0020-0627-0644-0642-0627-0644-0628'),
        messageText: arabic('0646-0635-0020-0627-0644-0631-0633-0627-0644-0629'),
        availableVariables: arabic('0627-0644-0645-062a-063a-064a-0631-0627-062a-0020-0627-0644-0645-062a-0627-062d-0629'),
        preview: arabic('0645-0639-0627-064a-0646-0629-0020-0648-0627-062a-0633-0627-0628-0020-0627-0644-0645-0628-0627-0634-0631-0629'),
        defaultState: arabic('0627-0641-062a-0631-0627-0636-064a'),
        customState: arabic('0645-062e-0635-0635'),
        platformOnly: arabic('0642-0627-0644-0628-0020-062e-0627-0635-0020-0628-0627-0644-0645-0646-0635-0629-0020-2022-0020-0644-0644-0639-0631-0636-0020-0641-0642-0637'),
        save: arabic('062d-0641-0638-0020-0627-0644-062a-0639-062f-064a-0644-0627-062a'),
        restore: arabic('0627-0633-062a-0639-0627-062f-0629-0020-0627-0644-0627-0641-062a-0631-0627-0636-064a'),
        test: arabic('0641-062a-062d-0020-0645-0639-0627-064a-0646-0629-0020-0641-064a-0020-0057-0068-0061-0074-0073-0041-0070-0070'),
        empty: arabic('0644-0627-0020-062a-0648-062c-062f-0020-0642-0648-0627-0644-0628-0020-0645-062a-0627-062d-0629-0020-062d-0627-0644-064a-0627'),
        insertHint: arabic('0627-0636-063a-0637-0020-0639-0644-0649-0020-0623-064a-0020-0645-062a-063a-064a-0631-0020-0644-0625-062f-0631-0627-062c-0647-0020-0639-0646-062f-0020-0645-0648-0636-0639-0020-0627-0644-0645-0624-0634-0631'),
        loading: arabic('062c-0627-0631-0020-062a-062d-0645-064a-0644-0020-0627-0644-0642-0648-0627-0644-0628-002e-002e-002e'),
        unsaved: arabic('062a-0639-062f-064a-0644-0627-062a-0020-063a-064a-0631-0020-0645-062d-0641-0648-0638-0629'),
        saved: arabic('0645-062d-0641-0648-0638-0020-0645-0639-062f-0644'),
        previewSample: arabic('0645-0639-0627-064a-0646-0629-0020-062a-062c-0631-064a-0628-064a-0629'),
        previewHint: arabic('0645-0639-0627-064a-0646-0629-0020-062a-062c-0631-064a-0628-064a-0629-0020-0644-0627-0020-062a-0633-062a-062e-062f-0645-0020-0628-064a-0627-0646-0627-062a-0020-0639-0636-0648-0020-062d-0642-064a-0642-064a')
    };
    const variableLabels = {
        member_name: arabic('0627-0633-0645-0020-0627-0644-0639-0636-0648'), gym_name: arabic('0627-0633-0645-0020-0627-0644-062c-064a-0645'), plan_name: arabic('0627-0644-0628-0627-0642-0629'), membership_type: arabic('0646-0648-0639-0020-0627-0644-0627-0634-062a-0631-0627-0643'),
        start_date: arabic('062a-0627-0631-064a-062e-0020-0627-0644-0628-062f-0627-064a-0629'), expiry_date: arabic('062a-0627-0631-064a-062e-0020-0627-0644-0627-0646-062a-0647-0627-0621'), days_remaining: arabic('0627-0644-0623-064a-0627-0645-0020-0627-0644-0645-062a-0628-0642-064a-0629'), list_price: arabic('0627-0644-0633-0639-0631-0020-0627-0644-0623-0633-0627-0633-064a'),
        discount_amount: arabic('0627-0644-062e-0635-0645'), amount_due: arabic('0627-0644-0645-0633-062a-062d-0642'), amount_paid: arabic('0627-0644-0645-062f-0641-0648-0639'), remaining_amount: arabic('0627-0644-0645-062a-0628-0642-064a'), payment_method: arabic('0637-0631-064a-0642-0629-0020-0627-0644-062f-0641-0639'),
        freeze_until: arabic('062a-0627-0631-064a-062e-0020-0627-0646-062a-0647-0627-0621-0020-0627-0644-062a-062c-0645-064a-062f'), days_since_last_visit: arabic('0623-064a-0627-0645-0020-0627-0644-063a-064a-0627-0628'), visitor_name: arabic('0627-0633-0645-0020-0627-0644-0632-0627-0626-0631'), visit_reference: arabic('0631-0642-0645-0020-0627-0644-0632-064a-0627-0631-0629'),
        pass_type: arabic('0646-0648-0639-0020-0627-0644-062d-0635-0629'), membership_code: arabic('0643-0648-062f-0020-0627-0644-0639-0636-0648-064a-0629'), portal_url: arabic('0631-0627-0628-0637-0020-0627-0644-0628-0648-0627-0628-0629'), tenant_type: arabic('0646-0648-0639-0020-0627-0644-062d-0633-0627-0628'), login_url: arabic('0631-0627-0628-0637-0020-0627-0644-062f-062e-0648-0644'), username: arabic('0627-0633-0645-0020-0627-0644-0645-0633-062a-062e-062f-0645'), temporary_password: arabic('0643-0644-0645-0629-0020-0627-0644-0645-0631-0648-0631-0020-0627-0644-0645-0624-0642-062a-0629')
    };
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    const variableLabel = (key) => variableLabels[key] || key;

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
            <header class="whatsapp-templates-head"><div class="whatsapp-templates-heading"><button type="button" class="whatsapp-settings-back" data-settings-section="overview"><span aria-hidden="true">←</span> ${copy.backToSettings}</button><span class="whatsapp-templates-kicker">${copy.ownerOnly} · ${copy.templates}</span><h2 id="whatsappTemplatesTitle">${copy.templates}</h2><p>تحكم في الرسائل الجاهزة المستخدمة عند التواصل مع الأعضاء والعملاء عبر WhatsApp.</p></div><div class="whatsapp-templates-head-meta" role="note"><span class="whatsapp-templates-count-badge" id="whatsappTemplatesCount">0</span><div><strong>قوالب موحدة</strong><small>يفتح WhatsApp بالرسالة، والإرسال يتم يدويًا.</small></div></div></header>
            <div class="whatsapp-templates-layout">
                <aside class="whatsapp-templates-list-panel" aria-label="قوالب الرسائل"><header class="whatsapp-templates-list-head"><div><span class="whatsapp-templates-section-kicker">CATALOG</span><h3>الرسائل</h3></div><span class="whatsapp-templates-list-count" id="whatsappTemplatesListCount">0</span></header><p class="whatsapp-templates-list-hint">اختر رسالة لتحريرها ومعاينتها.</p><div class="whatsapp-templates-list" id="whatsappTemplatesList" role="listbox" aria-label="قوالب WhatsApp"></div></aside>
                <section class="whatsapp-template-editor" id="whatsappTemplateEditor" hidden aria-labelledby="whatsappTemplateEditorName"><header class="whatsapp-template-editor-head"><div class="whatsapp-template-editor-title"><span class="whatsapp-templates-section-kicker">${copy.editor}</span><h3 id="whatsappTemplateEditorName"></h3><p id="whatsappTemplateEditorDescription"></p></div><div class="whatsapp-template-status-stack"><span class="whatsapp-template-category" id="whatsappTemplateEditorCategory"></span><span class="whatsapp-template-status" id="whatsappTemplateStatus"></span></div></header><div class="whatsapp-template-editor-body"><div class="whatsapp-template-field"><div class="whatsapp-template-label-row"><label for="whatsappTemplateBody">${copy.messageText}</label><span class="whatsapp-template-character-count" id="whatsappTemplateCharacterCount">0</span></div><textarea id="whatsappTemplateBody" spellcheck="true" aria-describedby="whatsappTemplateVariablesHint"></textarea><span class="whatsapp-template-helper" id="whatsappTemplateVariablesHint">${copy.insertHint}</span></div><div class="whatsapp-template-variables-box"><div class="whatsapp-template-variables-head"><div><span class="whatsapp-templates-section-kicker">INSERT</span><h4>${copy.availableVariables}</h4></div><span class="whatsapp-template-variables-count" id="whatsappTemplateVariablesCount">0</span></div><div class="whatsapp-template-variables" id="whatsappTemplateVariables" aria-label="${copy.availableVariables}"></div></div></div><footer class="whatsapp-template-actions"><span class="whatsapp-template-dirty-state" id="whatsappTemplateDirtyState" role="status" aria-live="polite"></span><div class="whatsapp-template-action-buttons"><button class="btn btn-light" id="whatsappTemplateRestore" type="button">${copy.restore}</button><button class="btn btn-light" id="whatsappTemplateTest" type="button">${copy.test}</button><button class="btn btn-primary" id="whatsappTemplateSave" type="button" disabled>${copy.save}</button></div></footer></section>
                <aside class="whatsapp-template-preview-panel" aria-label="معاينة الرسالة"><header class="whatsapp-template-preview-head"><div><span class="whatsapp-templates-section-kicker">LIVE PREVIEW</span><h3>${copy.preview}</h3></div><span class="whatsapp-template-preview-badge">${copy.previewSample}</span></header><div class="whatsapp-template-preview-device"><div class="whatsapp-template-preview-toolbar"><span class="whatsapp-preview-avatar" aria-hidden="true">T</span><div><strong>Top Gym</strong><small>WhatsApp</small></div><span class="whatsapp-preview-dot" aria-hidden="true"></span></div><div class="whatsapp-template-preview" id="whatsappTemplatePreview" role="status" aria-live="polite"></div></div><p class="whatsapp-template-preview-note">${copy.previewHint}</p></aside>
            </div>`;
        $('managementSection')?.after(section);
    }
    ensureMarkup();

    const sampleContext = { member_name: 'أحمد محمد', gym_name: 'Top Gym', plan_name: 'الباقة الذهبية', membership_type: 'اشتراك شهري', start_date: '01/09/2026', expiry_date: '30/09/2026', days_remaining: '7', list_price: '300 جنيه', discount_amount: '50 جنيه', amount_due: '250 جنيه', amount_paid: '200 جنيه', remaining_amount: '50 جنيه', payment_method: 'نقدي', freeze_until: '20/09/2026', days_since_last_visit: '14', visitor_name: 'أحمد محمد', visit_reference: 'VIS-000123', pass_type: 'حصة يومية', membership_code: 'LF-AB12CD', portal_url: `${window.location.origin}/member-portal`, tenant_type: 'الجيم', login_url: `${window.location.origin}/`, username: 'owner@example.com', temporary_password: '********' };

    function notify(message, type = 'success') { if (window.showToast) window.showToast(message, type === 'error', type); else if (window.Swal) void window.Swal.fire({ toast: true, position: 'top-start', icon: type, title: message, showConfirmButton: false, timer: 3200 }); }
    function selected() { return state.templates.find((item) => item.id === state.selectedId) || null; }
    function statusMarkup(template) { if (template.scope === 'platform') return `<span class="whatsapp-template-status platform">${copy.platformOnly}</span>`; return `<span class="whatsapp-template-status ${template.isCustomized ? 'custom' : 'default'}">${template.isCustomized ? copy.customState : copy.defaultState}</span>`; }

    function renderList() {
        const host = $('whatsappTemplatesList');
        if ($('whatsappTemplatesCount')) $('whatsappTemplatesCount').textContent = String(state.templates.length);
        if ($('whatsappTemplatesListCount')) $('whatsappTemplatesListCount').textContent = String(state.templates.length).padStart(2, '0');
        if (!host) return;
        host.innerHTML = state.templates.map((template, index) => `<button type="button" role="option" aria-selected="${template.id === state.selectedId}" class="whatsapp-template-card ${template.id === state.selectedId ? 'is-selected' : ''}" data-template-id="${escapeHtml(template.id)}"><span class="whatsapp-template-card-index">${String(index + 1).padStart(2, '0')}</span><span class="whatsapp-template-card-copy"><strong>${escapeHtml(template.name)}</strong><small>${escapeHtml(template.description || '')}</small><em>${escapeHtml(template.category || '')}</em></span><span class="whatsapp-template-card-state ${template.scope === 'platform' ? 'platform' : template.isCustomized ? 'custom' : ''}">${template.scope === 'platform' ? 'منصة' : template.isCustomized ? copy.customState : copy.defaultState}</span></button>`).join('') || `<div class="whatsapp-template-empty">${copy.empty}</div>`;
    }

    function updateDirtyState() { const dirtyState = $('whatsappTemplateDirtyState'); if (!dirtyState) return; dirtyState.textContent = state.dirty ? `● ${copy.unsaved}` : `✓ ${copy.saved}`; dirtyState.classList.toggle('is-dirty', state.dirty); }
    function renderEditor() {
        const template = selected(); const editor = $('whatsappTemplateEditor'); const previewPanel = document.querySelector('.whatsapp-template-preview-panel');
        if (!editor || !template) { if (editor) editor.hidden = true; if (previewPanel) previewPanel.hidden = true; return; }
        editor.hidden = false; if (previewPanel) previewPanel.hidden = false;
        const locked = template.scope === 'platform';
        $('whatsappTemplateEditorName').textContent = template.name || ''; $('whatsappTemplateEditorDescription').textContent = template.description || ''; $('whatsappTemplateEditorCategory').textContent = template.category || '';
        $('whatsappTemplateStatus').outerHTML = statusMarkup(template).replace('<span ', '<span id="whatsappTemplateStatus" ');
        const body = $('whatsappTemplateBody'); body.value = template.body || ''; body.readOnly = locked; body.disabled = locked; body.setAttribute('aria-readonly', String(locked)); body.classList.toggle('is-readonly', locked);
        $('whatsappTemplateSave').disabled = locked || !state.dirty; $('whatsappTemplateRestore').disabled = locked; $('whatsappTemplateTest').disabled = false;
        const variables = Array.isArray(template.variables) ? template.variables : [];
        $('whatsappTemplateVariablesCount').textContent = String(variables.length).padStart(2, '0');
        $('whatsappTemplateVariables').innerHTML = variables.map((key) => `<button type="button" class="whatsapp-variable-chip" data-variable="${escapeHtml(key)}" ${locked ? 'disabled' : ''}>${escapeHtml(variableLabel(key))}<code>{{${escapeHtml(key)}}}</code></button>`).join('') || '<span class="whatsapp-template-no-variables">لا توجد متغيرات لهذا القالب.</span>';
        updatePreview(); updateDirtyState();
    }
    function updatePreview() { const body = $('whatsappTemplateBody'); const preview = $('whatsappTemplatePreview'); const template = selected(); if (!body || !preview || !template || !window.LogicFitWhatsAppTemplates) return; preview.textContent = window.LogicFitWhatsAppTemplates.expand(body.value, sampleContext) || '…'; if ($('whatsappTemplateCharacterCount')) $('whatsappTemplateCharacterCount').textContent = String(body.value.length); }
    function insertVariable(key) { const field = $('whatsappTemplateBody'); if (!field || field.readOnly) return; const token = `{{${key}}}`; const start = field.selectionStart ?? field.value.length; const end = field.selectionEnd ?? start; field.setRangeText(token, start, end, 'end'); state.dirty = true; updatePreview(); updateDirtyState(); $('whatsappTemplateSave').disabled = false; field.focus(); }

    async function load() {
        if (state.loading || !window.LogicFitWhatsAppTemplates) return; state.loading = true;
        const list = $('whatsappTemplatesList'); if (list) list.innerHTML = `<div class="whatsapp-template-loading">${copy.loading}</div>`;
        try { const templates = await window.LogicFitWhatsAppTemplates.load(); state.templates = Array.isArray(templates) ? templates : []; if (!state.templates.some((item) => item.id === state.selectedId)) state.selectedId = state.templates[0]?.id || ''; state.dirty = false; renderList(); renderEditor(); }
        catch (error) { if (list) list.innerHTML = `<div class="whatsapp-template-empty is-error">${escapeHtml(error.message)}</div>`; }
        finally { state.loading = false; }
    }
    async function save() {
        const template = selected(); const bodyField = $('whatsappTemplateBody'); if (!template || !bodyField || bodyField.readOnly) return; const button = $('whatsappTemplateSave'); button.disabled = true;
        try { const response = await fetch(`/api/whatsapp-templates/${encodeURIComponent(template.id)}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: bodyField.value }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'تعذر حفظ القالب.'); const index = state.templates.findIndex((item) => item.id === template.id); if (index >= 0 && payload.template) state.templates[index] = payload.template; await window.LogicFitWhatsAppTemplates.load({ force: true }); state.dirty = false; renderList(); renderEditor(); notify('تم حفظ قالب الرسالة للجيم.'); }
        catch (error) { button.disabled = false; notify(error.message, 'error'); }
    }
    async function restore() {
        const template = selected(); if (!template || template.scope === 'platform' || !window.confirm('سيتم إلغاء التعديل والعودة للرسالة الافتراضية. هل تريد المتابعة؟')) return;
        try { const response = await fetch(`/api/whatsapp-templates/${encodeURIComponent(template.id)}/restore-default`, { method: 'POST', credentials: 'same-origin' }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || 'تعذر استعادة الرسالة الافتراضية.'); const index = state.templates.findIndex((item) => item.id === template.id); if (index >= 0 && payload.template) state.templates[index] = payload.template; await window.LogicFitWhatsAppTemplates.load({ force: true }); state.dirty = false; renderList(); renderEditor(); notify('تمت استعادة الرسالة الافتراضية.'); }
        catch (error) { notify(error.message, 'error'); }
    }
    function sendTest() { const template = selected(); if (!template) return; const phone = window.prompt('اكتب رقم اختبار لفتح WhatsApp:'); const digits = String(phone || '').replace(/\D/g, ''); if (digits.length < 6) return; const message = window.LogicFitWhatsAppTemplates.expand($('whatsappTemplateBody').value, sampleContext); window.open(`https://wa.me/${encodeURIComponent(digits)}?text=${encodeURIComponent(message)}`, 'logicFitTemplateTest', 'popup=yes,width=480,height=760,resizable=yes,scrollbars=yes'); }

    document.addEventListener('click', (event) => { const card = event.target.closest('[data-template-id]'); if (card && $('whatsappTemplatesList')?.contains(card)) { if (state.dirty && !window.confirm('لديك تعديلات غير محفوظة. هل تريد فتح قالب آخر؟')) return; state.dirty = false; state.selectedId = card.dataset.templateId; renderList(); renderEditor(); return; } const chip = event.target.closest('[data-variable]'); if (chip) return insertVariable(chip.dataset.variable); if (event.target.closest('#whatsappTemplateSave')) return void save(); if (event.target.closest('#whatsappTemplateRestore')) return void restore(); if (event.target.closest('#whatsappTemplateTest')) return sendTest(); });
    $('whatsappTemplateBody')?.addEventListener('input', () => { state.dirty = true; updatePreview(); updateDirtyState(); $('whatsappTemplateSave').disabled = false; });
    document.addEventListener('topgym:tab-changed', (event) => { if (event.detail?.settingsSection === 'whatsapp' || event.detail?.name === 'whatsapp-templates') void load(); });
    async function confirmLeave() { return !state.dirty || window.confirm('لديك تعديلات غير محفوظة. هل تريد مغادرة قوالب الرسائل؟'); }
    window.topGymWhatsappTemplatesUi = { load, confirmLeave };
    if (document.documentElement.dataset.topGymActiveTab === 'settings/whatsapp' || document.documentElement.dataset.topGymActiveTab === 'whatsapp-templates') void load();
})();
