'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const apiSource = fs.readFileSync(path.join(__dirname, '../../public/js/core/api.js'), 'utf8');

function createApi(fetchImpl, storage = {}) {
    const sessionStorage = {
        getItem(key) { return storage[key] ?? null; },
        setItem(key, value) { storage[key] = String(value); },
        removeItem(key) { delete storage[key]; }
    };
    const window = { fetch: fetchImpl, sessionStorage };
    window.window = window;
    const context = vm.createContext({ window, Headers, FormData, Blob });
    vm.runInContext(apiSource, context, { filename: 'public/js/core/api.js' });
    return window.topGymApi;
}

function jsonResponse(payload) {
    return { ok: true, status: 200, json: async () => payload };
}

test('frontend API shares identical in-flight GET requests only', async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const api = createApi(async () => {
        calls += 1;
        await gate;
        return jsonResponse({ branches: [{ id: 1 }] });
    });

    const first = api.get('/api/branches');
    const second = api.get('/api/branches');
    assert.equal(calls, 1);
    release();
    assert.deepEqual(await Promise.all([first, second]), [
        { branches: [{ id: 1 }] },
        { branches: [{ id: 1 }] }
    ]);

    await api.get('/api/branches');
    assert.equal(calls, 2, 'settled GETs must not become a stale response cache');
});

test('frontend API keeps branch-scoped GET requests isolated', async () => {
    const storage = { 'logicfit.branchId': '10' };
    const requests = [];
    const api = createApi(async (_path, options) => {
        requests.push([...options.headers.entries()]);
        return jsonResponse({ ok: true });
    }, storage);

    await api.get('/api/sections');
    storage['logicfit.branchId'] = '11';
    await api.get('/api/sections');

    assert.equal(requests.length, 2);
    assert.equal(requests[0].find(([key]) => key === 'x-branch-id')?.[1], '10');
    assert.equal(requests[1].find(([key]) => key === 'x-branch-id')?.[1], '11');
});

test('frontend API never coalesces writes', async () => {
    let calls = 0;
    const api = createApi(async () => {
        calls += 1;
        return jsonResponse({ saved: true });
    });

    await Promise.all([
        api.post('/api/example', { value: 1 }),
        api.post('/api/example', { value: 1 })
    ]);
    assert.equal(calls, 2);
});
