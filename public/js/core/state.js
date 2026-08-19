(() => {
    if (window.topGymState) return;

    const values = new Map();
    const listeners = new Map();
    function set(key, value) {
        values.set(key, value);
        listeners.get(key)?.forEach((listener) => listener(value));
        return value;
    }
    function get(key, fallback = null) {
        return values.has(key) ? values.get(key) : fallback;
    }
    function subscribe(key, listener) {
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key).add(listener);
        return () => listeners.get(key)?.delete(listener);
    }
    window.topGymState = Object.freeze({ get, set, subscribe });
})();
