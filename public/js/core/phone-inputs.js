(() => {
    'use strict';

    // The browser only prepares the transport value and selected country.
    // The API remains authoritative for validation and E.164 persistence.
    if (window.__logicFitPhoneInputsLoaded) return;
    window.__logicFitPhoneInputsLoaded = true;

    const DEFAULT_COUNTRY = 'EG';
    const PHONE_FIELD_SELECTOR = '[data-phone-input], input[name="whatsapp"], #branchPhoneInput, #coachingEditPhone';
    const countriesByIso = new Map();
    let countriesPromise = null;

    function latinDigits(value) {
        return String(value ?? '')
            .replace(/[\u0660-\u0669]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
            .replace(/[\u06F0-\u06F9]/gu, (digit) => String(digit.charCodeAt(0) - 0x06F0));
    }

    function compact(value) {
        const raw = latinDigits(value).trim().replace(/[\s().-]/gu, '');
        if (!raw) return '';
        if (raw.startsWith('00')) return `+${raw.slice(2).replace(/\D/g, '')}`;
        if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
        return raw.replace(/\D/g, '');
    }

    function localeCountry() {
        try {
            const region = new Intl.Locale(navigator.language || '').region;
            if (region && countriesByIso.has(region)) return region;
        } catch (_) { /* use the product default below */ }
        return DEFAULT_COUNTRY;
    }

    function selectedCountry(input) {
        const explicit = String(input.dataset.defaultCountry || '').trim().toUpperCase();
        return countriesByIso.has(explicit) ? explicit : localeCountry();
    }

    function countryForValue(value) {
        const compactValue = compact(value);
        if (!compactValue.startsWith('+')) return null;
        const digits = compactValue.slice(1);
        return [...countriesByIso.values()]
            .sort((first, second) => String(second.dialCode).length - String(first.dialCode).length)
            .find((country) => digits.startsWith(String(country.dialCode).replace(/^\+/, '')))?.isoCode || null;
    }

    function countryForInput(input) {
        const select = input.parentElement?.querySelector('[data-phone-country]')
            || input.closest('.phone-input-control')?.querySelector('[data-phone-country]');
        const inferred = countryForValue(input.value);
        const iso = String(inferred || select?.value || input.dataset.phoneCountry || DEFAULT_COUNTRY).toUpperCase();
        if (inferred && select && countriesByIso.has(inferred)) select.value = inferred;
        if (inferred) input.dataset.phoneCountry = inferred;
        return { select, iso };
    }

    function toE164Transport(value, iso) {
        const compactValue = compact(value);
        if (!compactValue) return '';
        if (compactValue.startsWith('+')) return compactValue;
        const country = countriesByIso.get(iso) || countriesByIso.get(DEFAULT_COUNTRY);
        if (!country?.dialCode) return compactValue;
        const dialCode = String(country.dialCode).replace(/^\+/, '');
        const local = compactValue.replace(/^0+/, '');
        return `+${dialCode}${local}`;
    }

    function applyTransportValue(input, select) {
        const raw = input.value;
        if (!String(raw || '').trim()) return;
        const iso = String(select?.value || input.dataset.phoneCountry || DEFAULT_COUNTRY).toUpperCase();
        const normalized = toE164Transport(raw, iso);
        if (normalized) input.value = normalized;
        input.dataset.phoneCountry = countryForValue(input.value) || iso;
    }

    function populateSelect(select, preferred) {
        while (select.firstChild) select.removeChild(select.firstChild);
        [...countriesByIso.values()]
            .sort((a, b) => String(a.country).localeCompare(String(b.country), 'ar'))
            .forEach((country) => {
                const option = new Option(`${country.country} (${country.dialCode})`, country.isoCode);
                select.appendChild(option);
            });
        select.value = countriesByIso.has(preferred) ? preferred : DEFAULT_COUNTRY;
    }

    function decorate(input) {
        if (!input || input.dataset.phoneDecorated === 'true') return;
        input.dataset.phoneDecorated = 'true';
        input.type = 'tel';
        input.inputMode = 'tel';
        input.autocomplete = input.autocomplete || 'tel';
        input.dir = input.dir || 'ltr';

        const wrapper = document.createElement('span');
        wrapper.className = 'phone-input-control';
        input.parentNode?.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const select = document.createElement('select');
        select.dataset.phoneCountry = 'true';
        select.name = input.name ? `${input.name}Country` : `${input.id || 'phone'}Country`;
        select.autocomplete = 'country';
        select.setAttribute('aria-label', 'Country for phone number');
        const preferred = selectedCountry(input);
        select.appendChild(new Option(preferred, preferred));
        wrapper.insertBefore(select, input);
        input.dataset.phoneCountry = preferred;

        select.addEventListener('change', () => {
            input.dataset.phoneCountry = String(select.value || DEFAULT_COUNTRY).toUpperCase();
            input.setCustomValidity('');
        });
        input.addEventListener('input', () => input.setCustomValidity(''));

        loadCountries().then(() => {
            if (!document.contains(select)) return;
            populateSelect(select, String(input.dataset.phoneCountry || preferred).toUpperCase());
        }).catch(() => { /* the API remains authoritative if catalog is unavailable */ });
    }

    function loadCountries() {
        if (countriesPromise) return countriesPromise;
        countriesPromise = fetch('/api/phone/countries', { credentials: 'same-origin', cache: 'force-cache' })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error('country catalog unavailable')))
            .then((payload) => {
                (payload.countries || []).forEach((country) => {
                    if (country?.isoCode && country?.dialCode) countriesByIso.set(String(country.isoCode).toUpperCase(), country);
                });
                if (!countriesByIso.has(DEFAULT_COUNTRY)) throw new Error('default country unavailable');
                return countriesByIso;
            })
            .catch((error) => {
                countriesPromise = null;
                throw error;
            });
        return countriesPromise;
    }

    function decorateAll(root = document) {
        root.querySelectorAll?.(PHONE_FIELD_SELECTOR).forEach(decorate);
    }

    function prepareForm(form) {
        form.querySelectorAll(PHONE_FIELD_SELECTOR).forEach((input) => {
            const { select } = countryForInput(input);
            applyTransportValue(input, select);
        });
    }

    document.addEventListener('submit', (event) => prepareForm(event.target), true);
    document.addEventListener('DOMContentLoaded', () => {
        countriesByIso.set(DEFAULT_COUNTRY, { isoCode: DEFAULT_COUNTRY, dialCode: '+20', country: '\u0645\u0635\u0631' });
        decorateAll();
        loadCountries().then(() => decorateAll()).catch(() => {});
        const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) decorateAll(node);
        })));
        observer.observe(document.body, { childList: true, subtree: true });
    });

    window.LogicFitPhoneInputs = Object.freeze({
        normalizeForTransport: toE164Transport,
        prepareForm,
        countryForInput,
        countryForValue
    });
})();
