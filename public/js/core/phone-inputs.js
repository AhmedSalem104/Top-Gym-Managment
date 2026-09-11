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

    const PHONE_MESSAGES = Object.freeze({
        required: '\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641 \u0645\u0637\u0644\u0648\u0628.',
        characters: '\u0627\u0633\u062a\u062e\u062f\u0645 \u0623\u0631\u0642\u0627\u0645\u064b\u0627 \u0641\u0642\u0637 \u0645\u0639 \u0627\u0644\u0645\u0633\u0627\u0641\u0627\u062a \u0623\u0648 \u0627\u0644\u0634\u0631\u0637\u0627\u062a \u0648\u0639\u0644\u0627\u0645\u0629 + \u0641\u064a \u0627\u0644\u0628\u062f\u0627\u064a\u0629.',
        country: '\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641 \u0644\u0627 \u064a\u0637\u0627\u0628\u0642 \u0627\u0644\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
        length: '\u0623\u062f\u062e\u0644 \u0631\u0642\u0645\u064b\u0627 \u0628\u0639\u062f\u062f \u0627\u0644\u062e\u0627\u0646\u0627\u062a \u0627\u0644\u0635\u062d\u064a\u062d \u0644\u0644\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
        format: '\u0623\u062f\u062e\u0644 \u0631\u0642\u0645 \u0645\u0648\u0628\u0627\u064a\u0644 \u0635\u062d\u064a\u062d \u0644\u0644\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
        catalog: '\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0642\u0648\u0627\u0639\u062f \u0627\u0644\u0647\u0627\u062a\u0641. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.'
    });

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

    function phoneInputParts(input) {
        const value = latinDigits(input?.value).trim();
        const { select, iso } = countryForInput(input);
        const country = countriesByIso.get(iso);
        if (!value) return { value, select, iso, country, compactValue: '', valid: !input?.required, message: input?.required ? PHONE_MESSAGES.required : '' };
        if (!/^[+\d\s().-]+$/u.test(value)) return { value, select, iso, country, compactValue: '', valid: false, message: PHONE_MESSAGES.characters };
        if (/^[^\d+]|\+.*\+/u.test(value) || (value.includes('+') && !/^\+|^00/u.test(value))) {
            return { value, select, iso, country, compactValue: '', valid: false, message: PHONE_MESSAGES.characters };
        }
        const compactValue = compact(value);
        if (!/^\+?\d+$/u.test(compactValue)) return { value, select, iso, country, compactValue, valid: false, message: PHONE_MESSAGES.characters };
        if (!country) return { value, select, iso, country, compactValue, valid: false, message: PHONE_MESSAGES.catalog };

        const dialCode = String(country.dialCode || '').replace(/^\+/, '');
        const international = compactValue.startsWith('+');
        const digits = international ? compactValue.slice(1) : compactValue;
        if (international && !digits.startsWith(dialCode)) {
            return { value, select, iso, country, compactValue, valid: false, message: PHONE_MESSAGES.country };
        }
        const nationalDigits = international ? digits.slice(dialCode.length) : digits.replace(/^0/, '');
        const allowFixedLine = input.dataset.phoneAllowFixedLine === 'true';
        const mobileRules = country.mobileRules || {};
        const validLengths = allowFixedLine
            ? (country.validLengths || [])
            : (mobileRules.validLengths?.length ? mobileRules.validLengths : (country.validLengths || []));
        if (!validLengths.includes(nationalDigits.length)) {
            return { value, select, iso, country, compactValue, nationalDigits, valid: false, message: PHONE_MESSAGES.length };
        }
        if (!allowFixedLine && mobileRules.nationalPattern) {
            try {
                if (!(new RegExp(`^(?:${mobileRules.nationalPattern})$`, 'u')).test(nationalDigits)) {
                    return { value, select, iso, country, compactValue, nationalDigits, valid: false, message: PHONE_MESSAGES.format };
                }
            } catch (_) {
                return { value, select, iso, country, compactValue, nationalDigits, valid: false, message: PHONE_MESSAGES.catalog };
            }
        }
        const normalized = international ? compactValue : `+${dialCode}${nationalDigits}`;
        if (normalized.length < 8 || normalized.length > 16) {
            return { value, select, iso, country, compactValue, nationalDigits, valid: false, message: PHONE_MESSAGES.format };
        }
        return { value, select, iso, country, compactValue, nationalDigits, normalized, valid: true, message: '' };
    }

    function validationElement(input) {
        return input?.closest('.phone-input-control')?.querySelector('.phone-input-error') || null;
    }

    function setValidationState(input, result, { show = true } = {}) {
        if (!input) return result;
        const message = result.valid ? '' : result.message || PHONE_MESSAGES.format;
        input.setCustomValidity(message);
        input.setAttribute('aria-invalid', String(!result.valid));
        input.classList.toggle('is-invalid', !result.valid);
        const errorElement = validationElement(input);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.hidden = !show || !message;
        }
        return result;
    }

    function validateInput(input, options = {}) {
        return setValidationState(input, phoneInputParts(input), options);
    }

    function shouldValidateWhileTyping(input) {
        return compact(input?.value || '').replace(/^\+/, '').length >= 7;
    }

    function validateForm(form) {
        for (const input of form.querySelectorAll(PHONE_FIELD_SELECTOR)) {
            const result = validateInput(input, { show: true });
            if (!result.valid) return { ...result, input };
        }
        return { valid: true, input: null };
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

    function countryFlag(isoCode) {
        return String(isoCode || '').toUpperCase().replace(/[A-Z]/g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
    }

    function applyCountryPresentation(input, select) {
        const iso = String(select?.value || input?.dataset.phoneCountry || DEFAULT_COUNTRY).toUpperCase();
        const country = countriesByIso.get(iso);
        if (!country || !input) return;
        const example = country.exampleNational || country.exampleInternational || country.dialCode;
        input.placeholder = example ? `\u0645\u062b\u0627\u0644: ${example}` : `\u0631\u0642\u0645 ${country.country}`;
        if (select) {
            select.title = `${country.country} (${country.dialCode})`;
            select.setAttribute('aria-label', `${country.country} ${country.dialCode}`);
        }
    }

    function countryForInput(input) {
        const select = input.parentElement?.querySelector('[data-phone-country]')
            || input.closest('.phone-input-control')?.querySelector('[data-phone-country]');
        const iso = String(select?.value || input.dataset.phoneCountry || input.dataset.defaultCountry || DEFAULT_COUNTRY).toUpperCase();
        if (select?.value) input.dataset.phoneCountry = iso;
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
        input.dataset.phoneCountry = iso;
    }

    function populateSelect(select, preferred) {
        while (select.firstChild) select.removeChild(select.firstChild);
        [...countriesByIso.values()]
            .sort((a, b) => String(a.country).localeCompare(String(b.country), 'ar'))
            .forEach((country) => {
                const option = new Option(`${countryFlag(country.isoCode)} ${country.dialCode} · ${country.country}`, country.isoCode);
                option.title = `${country.country} (${country.dialCode})`;
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

        const error = document.createElement('small');
        error.className = 'phone-input-error';
        error.setAttribute('role', 'alert');
        error.hidden = true;
        error.id = `${input.id || input.name || 'phone'}ValidationError`;
        wrapper.appendChild(error);
        input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));

        select.addEventListener('change', () => {
            input.dataset.phoneCountry = String(select.value || DEFAULT_COUNTRY).toUpperCase();
            applyCountryPresentation(input, select);
            if (input.value.trim()) validateInput(input, { show: true });
            else setValidationState(input, { valid: true }, { show: false });
        });
        input.addEventListener('input', () => {
            setValidationState(input, { valid: true }, { show: false });
            if (shouldValidateWhileTyping(input)) validateInput(input, { show: false });
        });
        input.addEventListener('blur', () => validateInput(input, { show: true }));

        loadCountries().then(() => {
            if (!document.contains(select)) return;
            populateSelect(select, String(input.dataset.phoneCountry || preferred).toUpperCase());
            applyCountryPresentation(input, select);
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

    document.addEventListener('submit', (event) => {
        const result = validateForm(event.target);
        if (result.valid) {
            prepareForm(event.target);
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        result.input?.focus({ preventScroll: true });
        result.input?.reportValidity?.();
    }, true);
    document.addEventListener('DOMContentLoaded', () => {
        countriesByIso.set(DEFAULT_COUNTRY, {
            isoCode: DEFAULT_COUNTRY,
            dialCode: '+20',
            country: '\u0645\u0635\u0631',
            exampleNational: '01012345678',
            validLengths: [8, 9, 10],
            mobileRules: { validLengths: [10], nationalPattern: '1[0-25]\\d{8}' }
        });
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
        validateInput,
        validateForm,
        countryForInput,
        countryForValue
    });
})();
