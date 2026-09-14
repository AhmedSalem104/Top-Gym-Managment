(() => {
    'use strict';
    if (window.LogicFitWhatsAppTemplates) return;

    let tenantPromise = null;
    let platformPromise = null;
    const cache = { tenant: new Map(), platform: new Map() };

    function normalizeId(value) {
        return String(value || '').trim().toUpperCase();
    }

    function expand(template, context = {}) {
        const source = String(template || '');
        const values = Object.fromEntries(Object.entries(context || {}).map(([key, value]) => [key, String(value ?? '').trim()]));
        const expanded = source.replace(/\{\{#if\s+([a-z][a-z0-9_]*)\s*\}\}([\s\S]*?)\{\{\/if\s*\}\}/gi, (_match, key, content) => values[key] ? content : '');
        return expanded
            .replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (_match, key) => values[key] ?? '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async function load({ platform = false, force = false } = {}) {
        const key = platform ? 'platform' : 'tenant';
        const endpoint = platform ? '/api/platform/whatsapp-templates' : '/api/whatsapp-templates';
        const promiseKey = platform ? 'platformPromise' : 'tenantPromise';
        if (!force && window[promiseKey]) return window[promiseKey];
        const promise = fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' })
            .then(async (response) => {
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || 'تعذر تحميل قوالب الرسائل.');
                cache[key].clear();
                (payload.templates || []).forEach((item) => cache[key].set(normalizeId(item.id), item));
                return [...cache[key].values()];
            });
        window[promiseKey] = promise;
        try { return await promise; } catch (error) { window[promiseKey] = null; throw error; }
    }

    async function get(templateId, options = {}) {
        const id = normalizeId(templateId);
        const platform = Boolean(options.platform);
        if (!cache[platform ? 'platform' : 'tenant'].has(id)) await load({ platform });
        return cache[platform ? 'platform' : 'tenant'].get(id) || null;
    }

    async function render(templateId, context = {}, options = {}) {
        const template = await get(templateId, options);
        if (!template) throw new Error('قالب الرسالة غير متاح.');
        return expand(template.body, context);
    }

    function getCached(templateId, { platform = false } = {}) {
        return cache[platform ? 'platform' : 'tenant'].get(normalizeId(templateId)) || null;
    }

    window.LogicFitWhatsAppTemplates = Object.freeze({
        expand,
        get,
        getCached,
        load,
        render
    });
})();
