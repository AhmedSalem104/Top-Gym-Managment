(() => {
    if (window.topGymApi) return;

    function headersFor(options = {}) {
        const headers = new Headers(options.headers || {});
        const body = options.body;
        const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
        const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
        if (body !== undefined && body !== null && !isFormData && !isBlob && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
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
        const response = await raw(path, options);
        if (response.status === 204) return null;
        return response.json().catch(() => ({}));
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
