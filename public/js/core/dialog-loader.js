(() => {
    'use strict';

    if (window.topGymDialogLoader) return;

    const loadPromises = new Map();

    function prepare(dialog) {
        if (!dialog) return dialog;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        const title = dialog.querySelector('h1[id], h2[id], h3[id], [role="heading"][id]');
        const description = dialog.querySelector('p[id]');
        if (title?.id && !dialog.hasAttribute('aria-labelledby')) dialog.setAttribute('aria-labelledby', title.id);
        if (description?.id && !dialog.hasAttribute('aria-describedby')) dialog.setAttribute('aria-describedby', description.id);
        dialog.dataset.topGymDialogHydrated = 'true';
        return dialog;
    }

    async function load(source, expectedIds = []) {
        const key = String(source || '').trim();
        if (!key) throw new Error('Lazy dialog source is missing.');
        if (loadPromises.has(key)) return loadPromises.get(key);

        const promise = fetch(key, { credentials: 'same-origin', cache: 'force-cache', headers: { Accept: 'text/html' } })
            .then((response) => {
                if (!response.ok) throw new Error(`Lazy dialog request failed (${response.status}).`);
                return response.text();
            })
            .then((html) => {
                const template = document.createElement('template');
                template.innerHTML = html;
                const dialogs = [...template.content.querySelectorAll('dialog')];
                if (!dialogs.length) throw new Error('Lazy dialog fragment contains no dialog.');
                const expected = expectedIds.map((id) => String(id));
                for (const id of expected) {
                    if (!dialogs.some((dialog) => dialog.id === id)) throw new Error(`Lazy dialog ${id} is missing.`);
                }
                const existingIds = new Set([...document.querySelectorAll('dialog[id]')].map((dialog) => dialog.id));
                const mounted = dialogs.filter((dialog) => !existingIds.has(dialog.id));
                mounted.forEach(prepare);
                document.body.append(template.content);
                // `prepare` runs before append so the fragment cannot trigger a
                // paint with incomplete accessibility metadata.
                mounted.forEach((dialog) => prepare(document.getElementById(dialog.id)));
                return expected.length ? expected.map((id) => document.getElementById(id)).filter(Boolean) : mounted;
            })
            .catch((error) => {
                loadPromises.delete(key);
                throw error;
            });

        loadPromises.set(key, promise);
        return promise;
    }

    window.topGymDialogLoader = Object.freeze({ load, prepare });
})();
