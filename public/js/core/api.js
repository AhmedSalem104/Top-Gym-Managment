(() => {
    if (window.topGymApi) return;

    // Share only identical in-flight GET requests. This is intentionally not
    // a response cache: SQL Server remains the source of truth and every
    // later request still reaches the server after the current promise settles.
    const inFlightGetRequests = new Map();

    function headersFor(options = {}) {
        const headers = new Headers(options.headers || {});
        const body = options.body;
        const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
        const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
        if (body !== undefined && body !== null && !isFormData && !isBlob && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }
        // Branch context is only a request hint. Every server endpoint still
        // resolves tenant ownership and branch access before using it.
        const branchId = window.sessionStorage?.getItem('logicfit.branchId');
        if (branchId && /^\d+$/.test(branchId) && !headers.has('x-branch-id')) {
            headers.set('x-branch-id', branchId);
        }
        const sectionId = window.sessionStorage?.getItem('logicfit.sectionId');
        if (sectionId && /^\d+$/.test(sectionId) && !headers.has('x-section-id')) {
            headers.set('x-section-id', sectionId);
        }
        return headers;
    }

    async function parseError(response) {
        const data = await response.json().catch(() => ({}));
        const error = new Error(data.error || `تعذر تنفيذ الطلب (${response.status}).`);
        error.status = response.status;
        error.code = data.code || null;
        error.field = data.field || null;
        error.memberName = data.memberName || null;
        error.memberId = data.memberId || null;
        error.attendance = data.attendance || null;
        return error;
    }

    async function raw(path, options = {}) {
        const response = await window.fetch(path, {
            ...options,
            credentials: options.credentials || 'same-origin',
            headers: headersFor(options)
        });
        if (!response.ok) throw await parseError(response);
        return response;
    }

    async function request(path, options = {}) {
        const method = String(options.method || 'GET').toUpperCase();
        const canShare = method === 'GET'
            && !options.signal
            && options.body == null;

        if (!canShare) {
            const response = await raw(path, options);
            if (response.status === 204) return null;
            return response.json().catch(() => ({}));
        }

        const headers = headersFor(options);
        const headerEntries = [...headers.entries()].sort(([first], [second]) => first.localeCompare(second));
        const key = JSON.stringify([
            String(path),
            String(options.credentials || 'same-origin'),
            String(options.cache || ''),
            headerEntries
        ]);
        const existing = inFlightGetRequests.get(key);
        if (existing) return existing;

        const pending = (async () => {
            const response = await raw(path, { ...options, headers });
            if (response.status === 204) return null;
            return response.json().catch(() => ({}));
        })();
        inFlightGetRequests.set(key, pending);
        pending.finally(() => {
            if (inFlightGetRequests.get(key) === pending) inFlightGetRequests.delete(key);
        }).catch(() => {});
        return pending;
    }

    window.topGymApi = Object.freeze({
        raw,
        request,
        get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
        post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body: JSON.stringify(body) }),
        put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body: JSON.stringify(body) }),
        patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
        del: (path, options = {}) => request(path, { ...options, method: 'DELETE' })
    });
})();
