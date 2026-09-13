(() => {
    'use strict';

    if (window.__logicFitPhoneInputsLoaded) return;
    window.__logicFitPhoneInputsLoaded = true;

    // The fallback is supplied by the central catalog response. It is only
    // used for initial UX selection and is never copied into a phone value.
    const TIMEZONE_COUNTRY_MAP = Object.freeze({
        'Africa/Cairo': 'EG',
        'Asia/Riyadh': 'SA',
        'Asia/Dubai': 'AE',
        'Asia/Abu_Dhabi': 'AE'
    });
    const PHONE_FIELD_SELECTOR = '[data-phone-input], input[name="whatsapp"], #branchPhoneInput, #coachingEditPhone';
    // Native pattern uses the browser's newer `v` regexp semantics.
    const NATIVE_PHONE_PATTERN = '(?:[0-9]|\\+|\\s|\\.|\\(|\\)|-)*';
    const countriesByIso = new Map();
    const inputStates = new WeakMap();
    let countriesPromise = null;
    let countryDetectionPromise = null;
    let formatterPromise = null;
    let formatterReadyNotified = false;
    let catalogReady = false;
    let fallbackCountry = '';

    const PHONE_FORMATTER_SOURCE = '/js/vendor/phone-formatter.js?v=display-v1';

    function notifyFormatterReady(formatter) {
        if (!formatter || formatterReadyNotified) return formatter;
        formatterReadyNotified = true;
        window.dispatchEvent(new CustomEvent('logicfit:phone-formatter-ready'));
        return formatter;
    }

    function loadPhoneFormatter() {
        if (window.LogicFitPhoneFormatter) return Promise.resolve(notifyFormatterReady(window.LogicFitPhoneFormatter));
        if (formatterPromise) return formatterPromise;
        formatterPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-logicfit-phone-formatter]');
            if (existing) {
                existing.addEventListener('load', () => resolve(notifyFormatterReady(window.LogicFitPhoneFormatter || null)), { once: true });
                existing.addEventListener('error', () => reject(new Error('phone formatter unavailable')), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = PHONE_FORMATTER_SOURCE;
            script.async = true;
            script.dataset.logicfitPhoneFormatter = 'true';
            script.onload = () => resolve(notifyFormatterReady(window.LogicFitPhoneFormatter || null));
            script.onerror = () => { script.remove(); reject(new Error('phone formatter unavailable')); };
            document.head.appendChild(script);
        }).catch(() => null);
        return formatterPromise;
    }

    const PHONE_MESSAGES = Object.freeze({
        examplePrefix: '\u0645\u062b\u0627\u0644: ',
        required: 'رقم الهاتف مطلوب.',
        characters: 'استخدم أرقامًا فقط في حقل الرقم، ويمكن استخدام تنسيق الرقم عند اللصق.',
        country: 'رقم الهاتف لا يطابق الدولة المختارة.',
        countryRequired: 'اختر الدولة قبل إدخال رقم محلي.',
        length: 'أدخل رقمًا بعدد الخانات الصحيح للدولة المختارة.',
        tooLong: (maximum) => `الرقم أطول من الحد الأقصى المسموح (${maximum} رقمًا كحد أقصى).`,
        format: 'أدخل رقم موبايل صحيح للدولة المختارة.',
        localFormat: 'أدخل رقم الموبايل بالصيغة الصحيحة للدولة المختارة.',
        catalog: 'قواعد الهاتف غير جاهزة بعد. حاول مرة أخرى.',
        search: 'ابحث باسم الدولة أو مفتاح الاتصال'
    });

    function latinDigits(value) {
        return String(value ?? '')
            .replace(/[٠-٩]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
            .replace(/[۰-۹]/gu, (digit) => String(digit.charCodeAt(0) - 0x06F0));
    }

    function localDigits(value) {
        return latinDigits(value).replace(/\D/gu, '');
    }

    function compact(value) {
        const raw = latinDigits(value).trim().replace(/[\s().-]/gu, '');
        if (!raw) return '';
        if (raw.startsWith('00')) return `+${raw.slice(2).replace(/\D/g, '')}`;
        if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
        return raw.replace(/\D/g, '');
    }

    function containsOnlyDigits(value) {
        return /^[0-9٠-٩۰-۹]*$/u.test(String(value ?? ''));
    }

    function hasSupportedPhoneSyntax(value) {
        const normalized = latinDigits(value).trim();
        if (!normalized || !/^[+\d\s().-]+$/u.test(normalized)) return false;
        const compactSyntax = normalized.replace(/[\s().-]/gu, '');
        return /^(?:\+?\d+|00\d+)$/u.test(compactSyntax);
    }

    function countryFlag(isoCode) {
        return String(isoCode || '').toUpperCase().replace(/[A-Z]/g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
    }

    function countryFlagUrl(isoCode) {
        const normalized = String(isoCode || '').trim().toLowerCase();
        return /^[a-z]{2}$/u.test(normalized) ? `https://flagcdn.com/w20/${normalized}.png` : '';
    }

    function renderCountryFlag(element, isoCode) {
        if (!element) return;
        const normalized = String(isoCode || '').toUpperCase();
        const fallback = countryFlag(normalized) || normalized;
        element.dataset.isoCode = normalized;
        element.dataset.flagFallback = 'false';
        element.replaceChildren(document.createTextNode(fallback));
        const imageUrl = countryFlagUrl(normalized);
        if (!imageUrl) {
            element.dataset.flagFallback = 'true';
            return;
        }
        const image = document.createElement('img');
        image.className = 'phone-country-flag-image';
        image.src = imageUrl;
        image.alt = '';
        image.width = 20;
        image.height = 15;
        image.decoding = 'async';
        image.loading = 'eager';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('load', () => {
            element.replaceChildren(image);
            element.dataset.flagFallback = 'false';
        }, { once: true });
        image.addEventListener('error', () => {
            element.replaceChildren(document.createTextNode(fallback));
            element.dataset.flagFallback = 'true';
        }, { once: true });
        element.appendChild(image);
    }

    function countryInputExample(country, input) {
        // The catalog example is the natural local representation. Keep the
        // trunk prefix (010 in Egypt) and parser-safe separators; the dial
        // code belongs only to the country selector.
        const exampleNational = String(country?.exampleNational || '').trim();
        if (exampleNational) return exampleNational;
        const international = compact(country?.exampleInternational || '');
        const dialCode = String(country?.dialCode || '').replace(/^\+/, '');
        if (international.startsWith('+') && dialCode && international.slice(1).startsWith(dialCode)) {
            const national = international.slice(1 + dialCode.length);
            const localPrefix = String(country?.mobileRules?.localPrefix || '');
            return localPrefix ? `${localPrefix}${national}` : national;
        }
        // A dial code is selector metadata, never a placeholder.
        return '';
    }

    function centralFallbackCountry() {
        if (countriesByIso.has(fallbackCountry)) return fallbackCountry;
        return [...countriesByIso.keys()][0] || '';
    }

    function countryForInput(input) {
        const select = input?.closest('.phone-input-control')?.querySelector('select[data-phone-country]') || null;
        const stored = String(input?.dataset?.phoneCountry || select?.value || '').trim().toUpperCase();
        return { select, iso: countriesByIso.has(stored) ? stored : '' };
    }

    function countryCodeForInput(input) { return countryForInput(input).iso; }

    function countryForValue(value) {
        const compactValue = compact(value);
        if (!compactValue.startsWith('+')) return null;
        const digits = compactValue.slice(1);
        return [...countriesByIso.values()]
            .sort((first, second) => String(second.dialCode).length - String(first.dialCode).length)
            .find((country) => digits.startsWith(String(country.dialCode).replace(/^\+/, '')))?.isoCode || null;
    }

    function inputLimits(input, rawValue = input?.value) {
        const { iso } = countryForInput(input);
        const country = countriesByIso.get(iso);
        if (!country) return null;
        const allowFixedLine = input?.dataset.phoneAllowFixedLine === 'true';
        const rules = country.mobileRules || {};
        const validLengths = allowFixedLine ? (country.validLengths || []) : (rules.validLengths?.length ? rules.validLengths : (country.validLengths || []));
        if (!validLengths.length) return null;
        const maximumNationalDigits = Math.max(...validLengths);
        const compactValue = compact(rawValue);
        const international = compactValue.startsWith('+');
        const dialCode = String(country.dialCode || '').replace(/^\+/, '');
        const digits = international ? compactValue.slice(1) : compactValue;
        const localPrefix = String(rules.localPrefix || '');
        const hasLocalPrefix = !international && Boolean(localPrefix) && digits.startsWith(localPrefix);
        const maximumInputDigits = international
            ? dialCode.length + maximumNationalDigits
            : maximumNationalDigits + (hasLocalPrefix ? localPrefix.length : 0);
        return { country, maximumNationalDigits, maximumInputDigits, international, dialCode };
    }

    function syncNativeInputLimit(input) {
        const limits = inputLimits(input);
        if (!input || !limits) return;
        input.dataset.phoneMaximumDigits = String(limits.maximumInputDigits);
    }

    function projectedInputValue(input, insertedText) {
        const current = String(input?.value || '');
        const start = Number.isInteger(input?.selectionStart) ? input.selectionStart : current.length;
        const end = Number.isInteger(input?.selectionEnd) ? input.selectionEnd : current.length;
        return `${current.slice(0, start)}${insertedText}${current.slice(end)}`;
    }

    function exceedsInputLimit(input, insertedText) {
        const limits = inputLimits(input, projectedInputValue(input, insertedText));
        if (!limits) return null;
        const projected = compact(projectedInputValue(input, insertedText));
        return projected.replace(/^\+/, '').length > limits.maximumInputDigits ? limits : null;
    }

    function rejectedLimitResult(input) {
        if (input?.dataset.phoneRejectedLimit !== 'true') return null;
        const limits = inputLimits(input);
        if (!limits) return null;
        return { status: 'invalid', valid: false, tooLong: true, message: PHONE_MESSAGES.tooLong(Number(input.dataset.phoneRejectedLimitMaximum) || limits.maximumInputDigits) };
    }

    function validationElement(input) { return input?.closest('.phone-input-control')?.querySelector('.phone-input-error') || null; }

    function resolveCountryForState(input) {
        const { iso } = countryForInput(input);
        const state = inputStates.get(input);
        return iso || state?.countryIso2 || '';
    }

    /**
     * Frontend UX parser. It mirrors the public country catalog and accepts
     * national trunk or national-significant input; final authority remains
     * src/services/phone-service.js on the server.
     */
    function parsePhoneInput(input, value = input?.value) {
        const rawValue = latinDigits(value).trim();
        const iso = resolveCountryForState(input);
        const country = countriesByIso.get(iso);
        const required = input?.required !== false;
        const base = { value: rawValue, iso, country, compactValue: compact(rawValue), status: 'empty', valid: !required, message: required ? PHONE_MESSAGES.required : '' };
        if (!rawValue) return base;
        if (!country) return { ...base, status: 'not_ready', valid: false, message: PHONE_MESSAGES.catalog };
        if (!hasSupportedPhoneSyntax(rawValue)) {
            return { ...base, status: 'invalid', valid: false, message: PHONE_MESSAGES.characters };
        }
        const compactValue = compact(rawValue);
        if (!/^\+?\d+$/u.test(compactValue)) return { ...base, status: 'invalid', valid: false, message: PHONE_MESSAGES.characters };
        const dialCode = String(country.dialCode || '').replace(/^\+/, '');
        const international = compactValue.startsWith('+');
        const digits = international ? compactValue.slice(1) : compactValue;
        if (international) {
            const detectedCountry = countryForValue(compactValue);
            if (!digits.startsWith(dialCode) || (detectedCountry && detectedCountry !== iso)) return { ...base, compactValue, status: 'invalid', valid: false, mismatch: true, message: PHONE_MESSAGES.country };
        }
        const allowFixedLine = input?.dataset.phoneAllowFixedLine === 'true';
        const rules = country.mobileRules || {};
        const localPrefix = String(rules.localPrefix || '');
        const hasLocalPrefix = !international && Boolean(localPrefix) && digits.startsWith(localPrefix);
        const nationalDigits = international ? digits.slice(dialCode.length) : (hasLocalPrefix ? digits.slice(localPrefix.length) : digits);
        const validLengths = allowFixedLine ? (country.validLengths || []) : (rules.validLengths?.length ? rules.validLengths : (country.validLengths || []));
        const maximumNationalDigits = validLengths.length ? Math.max(...validLengths) : null;
        const maximumInputDigits = international
            ? dialCode.length + (maximumNationalDigits || 0)
            : (maximumNationalDigits || 0) + (hasLocalPrefix ? localPrefix.length : 0);
        if (maximumNationalDigits !== null && nationalDigits.length > maximumNationalDigits) return { ...base, compactValue, nationalDigits, status: 'invalid', valid: false, tooLong: true, maximumInputDigits, message: PHONE_MESSAGES.tooLong(maximumInputDigits) };
        if (!validLengths.includes(nationalDigits.length)) return { ...base, compactValue, nationalDigits, status: nationalDigits.length ? 'incomplete' : 'invalid', valid: false, message: PHONE_MESSAGES.length };
        if (!allowFixedLine && rules.nationalPattern) {
            try {
                if (!(new RegExp(`^(?:${rules.nationalPattern})$`, 'u')).test(nationalDigits)) return { ...base, compactValue, nationalDigits, status: 'invalid', valid: false, message: PHONE_MESSAGES.format };
            } catch (_) {
                return { ...base, compactValue, nationalDigits, status: 'not_ready', valid: false, message: PHONE_MESSAGES.catalog };
            }
        }
        const normalized = `+${dialCode}${nationalDigits}`;
        return { ...base, compactValue, nationalDigits, normalized, countryIso2: iso, e164: normalized, status: 'valid', valid: true, message: '' };
    }

    function phoneDisplayCountry(value, iso = '') {
        const explicit = String(iso || '').trim().toUpperCase();
        if (countriesByIso.has(explicit)) return explicit;
        const detected = countryForValue(value);
        return countriesByIso.has(detected) ? detected : '';
    }

    function phoneDisplayCandidate(value, iso) {
        const compactValue = compact(value);
        if (!compactValue || compactValue.startsWith('+')) return compactValue;
        const country = countriesByIso.get(iso);
        const localPrefix = String(country?.mobileRules?.localPrefix || '');
        if (localPrefix && !compactValue.startsWith(localPrefix)) return `${localPrefix}${compactValue}`;
        return compactValue;
    }

    function formatPhoneForDisplay(value, iso = '') {
        const source = String(value ?? '').trim();
        if (!source) return '';
        const formatter = window.LogicFitPhoneFormatter;
        const countryIso = phoneDisplayCountry(source, iso);
        if (!formatter || !countryIso) return source;
        const candidate = phoneDisplayCandidate(source, countryIso);
        let parsed = formatter.parsePhoneNumberFromString(candidate, countryIso);
        if (!parsed && candidate.startsWith('+')) parsed = formatter.parsePhoneNumberFromString(candidate);
        if (!parsed || (parsed.country && parsed.country !== countryIso)) return source;
        return parsed.formatNational() || source;
    }

    function formatMemberDetailsPhone(member) {
        const subtitle = document.getElementById('detailsSubtitle');
        if (!subtitle || !member) return;
        const formatted = formatPhoneForDisplay(member.phone, member.phoneCountry);
        if (!formatted) return;
        subtitle.textContent = `${formatted}${member.email ? ` · ${member.email}` : ''}`;
    }

    function digitCountBefore(value, position) {
        return latinDigits(String(value || '').slice(0, position)).replace(/\D/gu, '').length;
    }

    function positionAfterDigits(value, count) {
        if (count <= 0) return 0;
        let seen = 0;
        const source = String(value || '');
        for (let index = 0; index < source.length; index += 1) {
            if (/\d/u.test(source[index])) {
                seen += 1;
                if (seen >= count) return index + 1;
            }
        }
        return source.length;
    }

    function applyAsYouTypeFormatting(input) {
        const formatter = window.LogicFitPhoneFormatter;
        const iso = resolveCountryForState(input);
        const raw = String(input?.value || '');
        if (!formatter || !input || !iso || !raw || /^[+]/u.test(raw) || /^00/u.test(raw)) return;
        const formatted = formatter.formatIncompletePhoneNumber(latinDigits(raw), iso);
        if (!formatted || formatted === raw) return;
        const start = Number.isInteger(input.selectionStart) ? input.selectionStart : raw.length;
        const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : raw.length;
        const startDigits = digitCountBefore(raw, start);
        const endDigits = digitCountBefore(raw, end);
        input.value = formatted;
        try {
            input.setSelectionRange(positionAfterDigits(formatted, startDigits), positionAfterDigits(formatted, endDigits));
        } catch (_) { /* Some non-text inputs do not expose selection APIs. */ }
    }

    function syncSubmitControls(input, result) {
        const form = input?.form;
        if (!form) return;
        const invalidPhone = [...form.querySelectorAll(PHONE_FIELD_SELECTOR)].some((field) => field === input ? !result.valid : !parsePhoneInput(field).valid);
        form.querySelectorAll('button[type="submit"]').forEach((button) => {
            if (invalidPhone) { button.dataset.phoneValidationBlocked = 'true'; button.disabled = true; }
            else if (button.dataset.phoneValidationBlocked === 'true') { delete button.dataset.phoneValidationBlocked; button.disabled = false; }
        });
    }

    function setValidationState(input, result, { show = true } = {}) {
        if (!input) return result;
        const message = result.valid ? '' : result.message || PHONE_MESSAGES.format;
        input.setCustomValidity(message);
        input.setAttribute('aria-invalid', String(!result.valid));
        input.classList.toggle('is-invalid', !result.valid);
        input.closest('.phone-number-control')?.classList.toggle('is-invalid', !result.valid);
        const error = validationElement(input);
        if (error) { error.textContent = message; error.hidden = !show || !message; }
        const state = inputStates.get(input) || {};
        inputStates.set(input, { ...state, ...result, rawInput: state.rawInput ?? String(input.value || ''), displayValue: String(input.value || ''), countryIso2: result.iso || state.countryIso2 || '' });
        syncSubmitControls(input, result);
        return result;
    }

    function validateInput(input, options = {}) { return setValidationState(input, rejectedLimitResult(input) || parsePhoneInput(input), options); }

    function validateForm(form) {
        for (const input of form.querySelectorAll(PHONE_FIELD_SELECTOR)) {
            const result = validateInput(input, { show: true });
            if (!result.valid) return { ...result, input };
        }
        return { valid: true, input: null };
    }

    function localeCountry() {
        const locales = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
        for (const locale of locales) { try { const region = new Intl.Locale(locale).region; if (region && /^[A-Z]{2}$/u.test(region)) return region; } catch (_) { /* continue */ } }
        return '';
    }

    function timeZoneCountry() { try { return TIMEZONE_COUNTRY_MAP[Intl.DateTimeFormat().resolvedOptions().timeZone] || ''; } catch (_) { return ''; } }
    function approximateCountry() { return timeZoneCountry() || localeCountry() || centralFallbackCountry(); }
    function approximateCountryWithSource() {
        const timezone = timeZoneCountry();
        if (timezone) return { code: timezone, source: 'timezone' };
        const locale = localeCountry();
        if (locale) return { code: locale, source: 'locale' };
        return { code: centralFallbackCountry(), source: 'fallback' };
    }

    function countrySelectionGeneration(input) { return Number(input?.dataset?.phoneCountryGeneration || 0); }
    function bumpCountrySelectionGeneration(input) { const next = countrySelectionGeneration(input) + 1; input.dataset.phoneCountryGeneration = String(next); return next; }
    function canApplyAutomaticCountry(input, generation) {
        return Boolean(input) && document.contains(input) && input.dataset.phoneCountrySource !== 'manual' && !input.dataset.phoneExplicitCountry && !String(input.value || '').trim() && countrySelectionGeneration(input) === generation;
    }

    function applyCountrySelection(input, select, isoCode, source) {
        const iso = String(isoCode || '').trim().toUpperCase();
        if (!countriesByIso.has(iso)) return false;
        input.dataset.phoneCountry = iso;
        input.dataset.phoneCountrySource = source;
        if (select) select.value = iso;
        const state = inputStates.get(input) || {};
        inputStates.set(input, { ...state, countryIso2: iso, userSelectedCountry: source === 'manual', ready: catalogReady || iso === centralFallbackCountry() });
        applyCountryPresentation(input, select);
        return true;
    }

    function selectedCountry(input) {
        const current = String(input?.dataset?.phoneCountry || '').trim().toUpperCase();
        if (countriesByIso.has(current)) return current;
        const explicit = String(input?.dataset?.phoneExplicitCountry || '').trim().toUpperCase();
        return countriesByIso.has(explicit) ? explicit : centralFallbackCountry();
    }

    function applyCountryPresentation(input, select) {
        const iso = resolveCountryForState(input);
        const country = countriesByIso.get(iso);
        if (!input) return;
        if (!country) {
            // A failed catalog must fail closed without leaving stale or
            // feature-owned placeholder/country presentation behind.
            input.placeholder = '';
            delete input.dataset.phonePlaceholderExample;
            input.title = '';
            return;
        }
        const example = countryInputExample(country, input);
        // The placeholder is a local example only; it is never the dial code.
        const placeholder = example ? `${PHONE_MESSAGES.examplePrefix}${example}` : '';
        input.placeholder = placeholder;
        input.dataset.phonePlaceholderExample = example;
        input.title = placeholder || `رقم ${country.country}`;
        syncNativeInputLimit(input);
        const root = input.closest('.phone-input-control');
        const flag = root?.querySelector('[data-phone-country-flag]');
        if (flag) { renderCountryFlag(flag, iso); flag.title = `${country.country} (${country.dialCode})`; }
        const code = root?.querySelector('[data-phone-country-code]');
        if (code) code.textContent = country.dialCode;
        const name = root?.querySelector('[data-phone-country-name]');
        if (name) name.textContent = country.country;
        if (select) { select.title = `${country.country} (${country.dialCode})`; select.setAttribute('aria-label', `${country.country} ${country.dialCode}`); }
    }

    function refreshInput(input) { if (!input) return ''; const { select, iso } = countryForInput(input); applyCountryPresentation(input, select); return iso; }

    function setValue(input, value, iso = '') {
        if (!input) return null;
        const nextIso = String(iso || countryForValue(value) || '').trim().toUpperCase();
        const { select } = countryForInput(input);
        if (nextIso && countriesByIso.has(nextIso)) {
            input.dataset.phoneCountry = nextIso;
            input.dataset.phoneCountrySource = 'explicit';
            if (select) select.value = nextIso;
        }
        input.value = String(value || '');
        applyCountryPresentation(input, select);
        const result = parsePhoneInput(input);
        if (result.valid && result.e164) input.value = formatPhoneForDisplay(result.e164, result.iso) || result.nationalDigits;
        const state = inputStates.get(input) || {};
        inputStates.set(input, { ...state, rawInput: String(value || ''), displayValue: input.value, lastAcceptedInput: input.value });
        validateInput(input, { show: false });
        if (result.valid && result.e164 && !window.LogicFitPhoneFormatter) {
            void loadPhoneFormatter().then(() => {
                if (!input.isConnected || document.activeElement === input) return;
                const latest = parsePhoneInput(input);
                if (!latest.valid || !latest.e164) return;
                input.value = formatPhoneForDisplay(latest.e164, latest.iso) || latest.nationalDigits;
                inputStates.set(input, { ...(inputStates.get(input) || {}), displayValue: input.value, lastAcceptedInput: input.value });
            });
        }
        return getState(input);
    }

    function normalizeForTransport(value, iso = '') {
        const input = document.createElement('input');
        input.required = true;
        input.value = String(value ?? '');
        input.dataset.phoneCountry = String(iso || countryForValue(value) || '').toUpperCase();
        input.dataset.phoneCountrySource = 'explicit';
        const result = parsePhoneInput(input, input.value);
        return result.valid ? result.e164 : '';
    }

    function getState(input) {
        const parsed = parsePhoneInput(input);
        const state = inputStates.get(input) || {};
        return Object.freeze({ countryIso2: parsed.iso || state.countryIso2 || '', rawInput: state.rawInput ?? String(input?.value || ''), displayValue: String(input?.value || ''), nationalNumber: parsed.nationalDigits || null, e164: parsed.e164 || null, status: parsed.status, userSelectedCountry: input?.dataset?.phoneCountrySource === 'manual', ready: Boolean(parsed.iso && countriesByIso.has(parsed.iso) && (catalogReady || parsed.iso === centralFallbackCountry())) });
    }

    function getSubmissionPayload(input) {
        const parsed = parsePhoneInput(input);
        if (!parsed.valid || !parsed.e164 || !parsed.iso) return null;
        return Object.freeze({ phoneCountry: parsed.iso, phoneNational: parsed.nationalDigits, phone: parsed.e164 });
    }

    function prepareForm(form) {
        const payload = {};
        for (const input of form.querySelectorAll(PHONE_FIELD_SELECTOR)) {
            const name = input.name || input.id;
            const value = getSubmissionPayload(input);
            if (name && value) payload[name] = value;
        }
        return payload;
    }

    function populateSelect(select, preferred) {
        select.replaceChildren();
        [...countriesByIso.values()].sort((a, b) => String(a.country).localeCompare(String(b.country), 'ar')).forEach((country) => {
            const option = new Option(`${country.dialCode} · ${country.country}`, country.isoCode);
            option.title = `${country.country} (${country.dialCode})`;
            select.appendChild(option);
        });
        select.value = countriesByIso.has(preferred) ? preferred : (preferred ? centralFallbackCountry() : '');
    }

    function renderCountryOptions(optionsElement, preferred, query = '') {
        if (!optionsElement) return;
        const needle = latinDigits(query).trim().toLocaleLowerCase();
        const countries = [...countriesByIso.values()].filter((country) => {
            if (!needle) return true;
            const dialCode = String(country.dialCode || '').replace(/^\+/, '');
            return String(country.country).toLocaleLowerCase().includes(needle) || String(country.isoCode).toLocaleLowerCase().includes(needle) || dialCode.includes(needle.replace(/^\+/, ''));
        }).sort((a, b) => String(a.country).localeCompare(String(b.country), 'ar'));
        optionsElement.replaceChildren();
        if (!countries.length) { const empty = document.createElement('p'); empty.className = 'phone-country-empty'; empty.textContent = 'لا توجد نتائج'; optionsElement.appendChild(empty); return; }
        countries.forEach((country) => {
            const option = document.createElement('button');
            option.type = 'button'; option.className = 'phone-country-option'; option.dataset.phoneCountryOption = country.isoCode; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(country.isoCode === preferred));
            const optionFlag = document.createElement('span'); optionFlag.className = 'phone-country-option-flag'; optionFlag.setAttribute('aria-hidden', 'true'); renderCountryFlag(optionFlag, country.isoCode);
            const optionName = document.createElement('span'); optionName.className = 'phone-country-option-name'; optionName.textContent = country.country;
            const optionCode = document.createElement('span'); optionCode.className = 'phone-country-option-code'; optionCode.textContent = country.dialCode;
            option.append(optionFlag, optionName, optionCode); optionsElement.appendChild(option);
        });
    }

    function normalizePresentation(input) {
        const result = parsePhoneInput(input);
        if (result.valid && result.e164) input.value = formatPhoneForDisplay(result.e164, result.iso) || result.nationalDigits;
        return validateInput(input, { show: true });
    }

    function refreshLoadedPhoneDisplays() {
        document.querySelectorAll?.(PHONE_FIELD_SELECTOR).forEach((input) => {
            // Let an active editor keep its cursor and raw typing state. The
            // normal blur path will apply the formatter once editing ends.
            if (document.activeElement === input) return;
            const result = parsePhoneInput(input);
            if (!result.valid || !result.e164) return;
            const formatted = formatPhoneForDisplay(result.e164, result.iso);
            if (!formatted || formatted === input.value) return;
            input.value = formatted;
            const state = inputStates.get(input) || {};
            inputStates.set(input, { ...state, rawInput: state.rawInput ?? input.value, displayValue: formatted, lastAcceptedInput: formatted });
        });
    }

    function decorate(input) {
        if (!input || input.dataset.phoneDecorated === 'true') return;
        input.dataset.phoneDecorated = 'true'; input.type = 'tel'; input.inputMode = 'numeric'; input.setAttribute('inputmode', 'numeric'); input.autocomplete = 'tel'; input.setAttribute('pattern', NATIVE_PHONE_PATTERN); input.dir = input.dir || 'ltr';
        const wrapper = document.createElement('span'); wrapper.className = 'phone-input-control'; wrapper.dataset.phoneControl = 'true'; input.parentNode?.insertBefore(wrapper, input); wrapper.appendChild(input);
        const select = document.createElement('select'); select.dataset.phoneCountry = 'true'; select.name = input.name ? `${input.name}Country` : `${input.id || 'phone'}Country`; select.autocomplete = 'country'; select.className = 'phone-country-native-select'; select.tabIndex = -1; select.setAttribute('aria-label', 'Country for phone number'); const preferred = selectedCountry(input); select.appendChild(new Option(preferred, preferred));
        const countryControl = document.createElement('span'); countryControl.className = 'phone-country-control';
        const flag = document.createElement('span'); flag.className = 'phone-country-flag'; flag.dataset.phoneCountryFlag = 'true'; flag.setAttribute('aria-hidden', 'true');
        const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'phone-country-trigger'; trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false');
        const name = document.createElement('span'); name.className = 'phone-country-name'; name.dataset.phoneCountryName = 'true'; const divider = document.createElement('span'); divider.className = 'phone-country-divider'; divider.setAttribute('aria-hidden', 'true'); const code = document.createElement('span'); code.className = 'phone-country-code'; code.dataset.phoneCountryCode = 'true'; const caret = document.createElement('span'); caret.className = 'phone-country-caret'; caret.textContent = '⌄'; trigger.append(flag, name, divider, code, caret);
        const menu = document.createElement('span'); menu.className = 'phone-country-menu'; menu.hidden = true; menu.setAttribute('role', 'listbox'); const searchInput = document.createElement('input'); searchInput.type = 'search'; searchInput.className = 'phone-country-search'; searchInput.placeholder = PHONE_MESSAGES.search; searchInput.autocomplete = 'off'; searchInput.setAttribute('aria-label', PHONE_MESSAGES.search); const options = document.createElement('span'); options.className = 'phone-country-options'; menu.append(searchInput, options); countryControl.append(trigger, select, menu); wrapper.insertBefore(countryControl, input);
        const phoneControl = document.createElement('span'); phoneControl.className = 'phone-number-control'; const phoneIcon = document.createElement('span'); phoneIcon.className = 'phone-number-icon'; phoneIcon.setAttribute('aria-hidden', 'true'); const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('focusable', 'false'); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', 'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.3.57 3.57.57a1 1 0 0 1 1 1v3.49a1 1 0 0 1-1 1C11.72 21 3 12.28 3 2.99a1 1 0 0 1 1-1H7.5a1 1 0 0 1 1 1c0 1.26.2 2.45.57 3.57a1 1 0 0 1-.24 1.02l-2.21 2.21Z'); svg.appendChild(path); phoneIcon.appendChild(svg); const phoneDivider = document.createElement('span'); phoneDivider.className = 'phone-number-divider'; phoneDivider.setAttribute('aria-hidden', 'true'); phoneControl.append(phoneIcon, phoneDivider, input); wrapper.appendChild(phoneControl);
        const help = document.createElement('small'); help.className = 'phone-input-help'; help.dataset.phoneInputHelp = 'true'; help.textContent = 'أدخل الرقم بدون مفتاح الدولة.'; help.id = `${input.id || input.name || 'phone'}InputHelp`; wrapper.appendChild(help); const error = document.createElement('small'); error.className = 'phone-input-error'; error.setAttribute('role', 'alert'); error.hidden = true; error.id = `${input.id || input.name || 'phone'}ValidationError`; wrapper.appendChild(error); input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), help.id, error.id].filter(Boolean).join(' '));
        const initialIso = selectedCountry(input); input.dataset.phoneCountry = initialIso; input.dataset.phoneCountrySource = input.dataset.phoneExplicitCountry ? 'explicit' : 'pending'; input.dataset.phoneCountryGeneration = '0'; inputStates.set(input, { countryIso2: initialIso, rawInput: '', status: 'empty', ready: Boolean(initialIso && initialIso === centralFallbackCountry()) }); applyCountryPresentation(input, select);
        const closeCountryMenu = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); searchInput.value = ''; renderCountryOptions(options, String(input.dataset.phoneCountry || initialIso).toUpperCase()); applyCountryPresentation(input, select); };
        trigger.addEventListener('click', () => { if (!menu.hidden) { closeCountryMenu(); return; } menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); renderCountryOptions(options, String(input.dataset.phoneCountry || initialIso).toUpperCase()); searchInput.focus(); }); searchInput.addEventListener('input', () => renderCountryOptions(options, String(input.dataset.phoneCountry || initialIso).toUpperCase(), searchInput.value)); searchInput.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeCountryMenu(); trigger.focus(); } }); options.addEventListener('click', (event) => { const option = event.target.closest('[data-phone-country-option]'); if (!option) return; select.value = option.dataset.phoneCountryOption; select.dispatchEvent(new Event('change', { bubbles: true })); });
        select.addEventListener('change', () => { bumpCountrySelectionGeneration(input); input.dataset.phoneCountry = String(select.value || '').toUpperCase(); input.dataset.phoneCountrySource = 'manual'; const state = inputStates.get(input) || {}; inputStates.set(input, { ...state, countryIso2: input.dataset.phoneCountry, userSelectedCountry: true }); closeCountryMenu(); applyCountryPresentation(input, select); if (input.value.trim()) validateInput(input, { show: true }); else setValidationState(input, { status: 'empty', valid: true, message: '' }, { show: false }); });
        input.addEventListener('beforeinput', (event) => { if (event.inputType === 'insertFromPaste' || !event.data || containsOnlyDigits(event.data)) return; event.preventDefault(); setValidationState(input, { status: 'invalid', valid: false, message: PHONE_MESSAGES.characters }, { show: true }); }); input.addEventListener('beforeinput', (event) => { if (!event.data || event.inputType === 'insertFromPaste') return; const limits = exceedsInputLimit(input, event.data); if (!limits) return; event.preventDefault(); input.dataset.phoneRejectedLimit = 'true'; input.dataset.phoneRejectedLimitMaximum = String(limits.maximumInputDigits); setValidationState(input, { status: 'invalid', valid: false, tooLong: true, message: PHONE_MESSAGES.tooLong(limits.maximumInputDigits) }, { show: true }); });
        input.addEventListener('paste', (event) => { const pasted = event.clipboardData?.getData('text') || ''; if (!pasted) return; if (!/^[+\d\s().-]+$/u.test(latinDigits(pasted))) { event.preventDefault(); setValidationState(input, { status: 'invalid', valid: false, message: PHONE_MESSAGES.characters }, { show: true }); return; } const candidate = projectedInputValue(input, pasted); const limits = inputLimits(input, candidate); if (limits && compact(candidate).replace(/^\+/, '').length > limits.maximumInputDigits) { event.preventDefault(); input.dataset.phoneRejectedLimit = 'true'; input.dataset.phoneRejectedLimitMaximum = String(limits.maximumInputDigits); setValidationState(input, { status: 'invalid', valid: false, tooLong: true, message: PHONE_MESSAGES.tooLong(limits.maximumInputDigits) }, { show: true }); return; } event.preventDefault(); input.value = compact(candidate); input.dispatchEvent(new Event('input', { bubbles: true })); });
        input.addEventListener('input', () => { delete input.dataset.phoneRejectedLimit; delete input.dataset.phoneRejectedLimitMaximum; const raw = String(input.value || ''); const normalizedDigits = latinDigits(raw); if (normalizedDigits !== raw) input.value = normalizedDigits; const current = String(input.value || ''); const state = inputStates.get(input) || {}; if (!/^[+\d\s().-]*$/u.test(current)) { input.value = state.lastAcceptedInput || ''; setValidationState(input, { status: 'invalid', valid: false, message: PHONE_MESSAGES.characters }, { show: true }); return; } applyAsYouTypeFormatting(input); inputStates.set(input, { ...state, rawInput: current, displayValue: input.value, lastAcceptedInput: input.value }); const result = parsePhoneInput(input); if (result.tooLong) { setValidationState(input, result, { show: true }); return; } setValidationState(input, result, { show: Boolean(result.status === 'invalid' && result.message === PHONE_MESSAGES.characters) }); }); input.addEventListener('blur', () => normalizePresentation(input));
        loadCountries().then(() => {
            if (!document.contains(select)) return;
            void loadPhoneFormatter();
            const explicitIso = String(input.dataset.phoneExplicitCountry || '').trim().toUpperCase();
            const shouldDetectAutomatically = !explicitIso && input.dataset.phoneCountrySource !== 'manual' && !input.value.trim();
            if (explicitIso && countriesByIso.has(explicitIso) && !input.value.trim()) {
                applyCountrySelection(input, select, explicitIso, 'explicit');
            } else if (shouldDetectAutomatically) {
                const detectionGeneration = countrySelectionGeneration(input);
                // Resolve the highest-confidence signal first. Timezone,
                // locale and the catalog fallback are used only when the
                // server-side IP country signal is unavailable.
                loadDetectedCountry().then((detectedIso) => {
                    if (!canApplyAutomaticCountry(input, detectionGeneration)) return;
                    const detected = countriesByIso.has(detectedIso)
                        ? { code: detectedIso, source: 'ip' }
                        : approximateCountryWithSource();
                    const next = countriesByIso.has(detected.code) ? detected.code : centralFallbackCountry();
                    if (!next) return;
                    applyCountrySelection(input, select, next, detected.code === next ? detected.source : 'fallback');
                    renderCountryOptions(options, next, searchInput.value);
                });
            }
            populateSelect(select, String(input.dataset.phoneCountry || initialIso).toUpperCase());
            renderCountryOptions(options, String(input.dataset.phoneCountry || initialIso).toUpperCase());
            applyCountryPresentation(input, select);
            if (input.value.trim()) validateInput(input, { show: false });
        }).catch(() => applyCountryPresentation(input, select));
    }

    function loadDetectedCountry() { if (countryDetectionPromise) return countryDetectionPromise; countryDetectionPromise = fetch('/api/phone/country', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }).then((response) => response.ok ? response.json() : Promise.reject(new Error('country detection unavailable'))).then((payload) => { const code = String(payload?.countryCode || '').trim().toUpperCase(); return /^[A-Z]{2}$/u.test(code) ? code : ''; }).catch(() => ''); return countryDetectionPromise; }
    function loadCountries() { if (countriesPromise) return countriesPromise; countriesPromise = fetch('/api/phone/countries', { credentials: 'same-origin', cache: 'force-cache' }).then((response) => response.ok ? response.json() : Promise.reject(new Error('country catalog unavailable'))).then((payload) => { (payload.countries || []).forEach((country) => { if (country?.isoCode && country?.dialCode) countriesByIso.set(String(country.isoCode).toUpperCase(), country); }); const configuredFallback = String(payload?.fallbackCountry || '').trim().toUpperCase(); fallbackCountry = countriesByIso.has(configuredFallback) ? configuredFallback : centralFallbackCountry(); if (!fallbackCountry) throw new Error('phone fallback unavailable'); catalogReady = true; window.dispatchEvent(new CustomEvent('logicfit:phone-catalog-ready')); return countriesByIso; }).catch((error) => { countriesPromise = null; throw error; }); return countriesPromise; }
    function decorateAll(root = document) { root.querySelectorAll?.(PHONE_FIELD_SELECTOR).forEach(decorate); }

    window.addEventListener('topgym:member-details-opened', (event) => {
        const member = event.detail?.details?.member || event.detail?.member;
        queueMicrotask(() => {
            const dialogMemberId = document.getElementById('detailsDialog')?.dataset.memberId;
            if (member && (!dialogMemberId || String(dialogMemberId) === String(member.id))) formatMemberDetailsPhone(member);
        });
    });

    document.addEventListener('submit', (event) => { const result = validateForm(event.target); if (result.valid) return; event.preventDefault(); event.stopImmediatePropagation(); result.input?.focus({ preventScroll: true }); result.input?.reportValidity?.(); }, true);
    function initializePhoneInputs() {
        if (window.__topGymPhoneInputsInitialized) return;
        window.__topGymPhoneInputsInitialized = true;
        decorateAll();
        void loadPhoneFormatter();
        loadCountries().then(() => decorateAll()).catch(() => {});
        const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === Node.ELEMENT_NODE) decorateAll(node); })));
        observer.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('logicfit:phone-formatter-ready', refreshLoadedPhoneDisplays);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializePhoneInputs, { once: true });
    else initializePhoneInputs();

    window.LogicFitPhoneInputs = Object.freeze({ normalizeForTransport, parsePhoneInput, getState, getSubmissionPayload, prepareForm, validateInput, validateForm, countryForInput, countryCodeForInput, refreshInput, setValue, countryForValue, approximateCountry, loadDetectedCountry, formatForDisplay: formatPhoneForDisplay, loadFormatter: loadPhoneFormatter, loadCatalog: loadCountries });
})();
