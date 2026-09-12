(() => {
    'use strict';

    // The browser only prepares the transport value and selected country.
    // The API remains authoritative for validation and E.164 persistence.
    if (window.__logicFitPhoneInputsLoaded) return;
    window.__logicFitPhoneInputsLoaded = true;

    // Central fallback policy only. It is used when no approximate location signal
    // is available; it is not a per-screen phone default.
    const FALLBACK_COUNTRY = 'EG';
    const TIMEZONE_COUNTRY_MAP = Object.freeze({
        'Africa/Cairo': 'EG',
        'Asia/Riyadh': 'SA',
        'Asia/Dubai': 'AE',
        'Asia/Abu_Dhabi': 'AE'
    });
    const PHONE_FIELD_SELECTOR = '[data-phone-input], input[name="whatsapp"], #branchPhoneInput, #coachingEditPhone';
    const countriesByIso = new Map();
    let countriesPromise = null;
    let countryDetectionPromise = null;

    const PHONE_MESSAGES = Object.freeze({
        required: '\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641 \u0645\u0637\u0644\u0648\u0628.',
        characters: '\u0627\u0633\u062a\u062e\u062f\u0645 \u0623\u0631\u0642\u0627\u0645\u064b\u0627 \u0641\u0642\u0637 \u0641\u064a \u062d\u0642\u0644 \u0627\u0644\u0631\u0642\u0645.',
        country: '\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641 \u0644\u0627 \u064a\u0637\u0627\u0628\u0642 \u0627\u0644\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
        length: '\u0623\u062f\u062e\u0644 \u0631\u0642\u0645\u064b\u0627 \u0628\u0639\u062f\u062f \u0627\u0644\u062e\u0627\u0646\u0627\u062a \u0627\u0644\u0635\u062d\u064a\u062d \u0644\u0644\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
        tooLong: (maximum) => `\u0627\u0644\u0631\u0642\u0645 \u0623\u0637\u0648\u0644 \u0645\u0646 \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u0642\u0635\u0649 \u0627\u0644\u0645\u0633\u0645\u0648\u062d (${maximum} \u0631\u0642\u0645\u064b\u0627 \u0643\u062d\u062f \u0623\u0642\u0635\u0649).`,
        format: '\u0623\u062f\u062e\u0644 \u0631\u0642\u0645 \u0645\u0648\u0628\u0627\u064a\u0644 \u0635\u062d\u064a\u062d \u0644\u0644\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
        localFormat: '\u0627\u0643\u062a\u0628 \u0627\u0644\u0631\u0642\u0645 \u0628\u0627\u0644\u0635\u064a\u063a\u0629 \u0627\u0644\u0645\u062d\u0644\u064a\u0629 \u0627\u0644\u0635\u062d\u064a\u062d\u0629 \u0644\u0644\u062f\u0648\u0644\u0629 \u0627\u0644\u0645\u062e\u062a\u0627\u0631\u0629.',
        catalog: '\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0642\u0648\u0627\u0639\u062f \u0627\u0644\u0647\u0627\u062a\u0641. \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.',
        search: '\u0627\u0628\u062d\u062b \u0628\u0627\u0633\u0645 \u0627\u0644\u062f\u0648\u0644\u0629 \u0623\u0648 \u0645\u0641\u062a\u0627\u062d \u0627\u0644\u0627\u062a\u0635\u0627\u0644'
    });

    function latinDigits(value) {
        return String(value ?? '')
            .replace(/[\u0660-\u0669]/gu, (digit) => String(digit.charCodeAt(0) - 0x0660))
            .replace(/[\u06F0-\u06F9]/gu, (digit) => String(digit.charCodeAt(0) - 0x06F0));
    }

    function localDigits(value) {
        return latinDigits(value).replace(/\D/gu, '');
    }

    function containsOnlyDigits(value) {
        return /^[0-9\u0660-\u0669\u06F0-\u06F9]*$/u.test(String(value ?? ''));
    }

    function inputLimits(input, rawValue = input?.value) {
        const { iso } = countryForInput(input);
        const country = countriesByIso.get(iso);
        if (!country) return null;
        const allowFixedLine = input?.dataset.phoneAllowFixedLine === 'true';
        const mobileRules = country.mobileRules || {};
        const localPrefix = String(mobileRules.localPrefix || '');
        const validLengths = allowFixedLine
            ? (country.validLengths || [])
            : (mobileRules.validLengths?.length ? mobileRules.validLengths : (country.validLengths || []));
        if (!validLengths.length) return null;
        const maximumNationalDigits = Math.max(...validLengths);
        const compactValue = compact(rawValue);
        const international = compactValue.startsWith('+');
        const dialCode = String(country.dialCode || '').replace(/^\+/, '');
        const digits = international ? compactValue.slice(1) : compactValue;
        const hasLocalPrefix = !international
            && !allowFixedLine
            && Boolean(localPrefix)
            && digits.startsWith(localPrefix);
        const maximumInputDigits = maximumNationalDigits
            + (international ? dialCode.length : (hasLocalPrefix ? localPrefix.length : 0));
        return { country, maximumNationalDigits, maximumInputDigits, international };
    }

    function syncNativeInputLimit(input) {
        if (!input) return;
        const limits = inputLimits(input);
        if (!limits) {
            delete input.dataset.phoneMaximumDigits;
            return;
        }
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
        const projectedDigits = localDigits(projectedInputValue(input, insertedText)).length;
        return projectedDigits > limits.maximumInputDigits ? limits : null;
    }

    function rejectedLimitResult(input) {
        if (input?.dataset.phoneRejectedLimit !== 'true') return null;
        const limits = inputLimits(input);
        if (!limits) return null;
        return {
            valid: false,
            tooLong: true,
            message: PHONE_MESSAGES.tooLong(Number(input.dataset.phoneRejectedLimitMaximum)
                || limits.maximumInputDigits + (limits.international ? 1 : 0))
        };
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
        const allowFixedLine = input.dataset.phoneAllowFixedLine === 'true';
        const mobileRules = country.mobileRules || {};
        const localPrefix = String(mobileRules.localPrefix || '');
        const hasLocalPrefix = !international
            && !allowFixedLine
            && Boolean(localPrefix)
            && digits.startsWith(localPrefix);
        const nationalDigits = international
            ? digits.slice(dialCode.length)
            : (allowFixedLine ? digits.replace(/^0/, '') : (hasLocalPrefix ? digits.slice(localPrefix.length) : digits));
        const validLengths = allowFixedLine
            ? (country.validLengths || [])
            : (mobileRules.validLengths?.length ? mobileRules.validLengths : (country.validLengths || []));
        const maximumNationalDigits = validLengths.length ? Math.max(...validLengths) : null;
        const maximumInputDigits = maximumNationalDigits === null
            ? null
            : (international ? dialCode.length + maximumNationalDigits : maximumNationalDigits + (hasLocalPrefix ? localPrefix.length : 0));
        if (maximumNationalDigits !== null && nationalDigits.length > maximumNationalDigits) {
            return {
                value,
                select,
                iso,
                country,
                compactValue,
                nationalDigits,
                valid: false,
                tooLong: true,
                maximumInputDigits,
                message: PHONE_MESSAGES.tooLong(maximumInputDigits)
            };
        }
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
        input.closest('.phone-number-control')?.classList.toggle('is-invalid', !result.valid);
        const errorElement = validationElement(input);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.hidden = !show || !message;
        }
        syncSubmitControls(input, result);
        return result;
    }

    function syncSubmitControls(input, result) {
        const form = input?.form;
        if (!form) return;
        const phoneInputs = [...form.querySelectorAll(PHONE_FIELD_SELECTOR)];
        const invalidPhone = phoneInputs.some((field) => {
            if (field === input) return !result.valid;
            return !phoneInputParts(field).valid;
        });
        form.querySelectorAll('button[type="submit"]').forEach((button) => {
            if (invalidPhone) {
                button.dataset.phoneValidationBlocked = 'true';
                button.disabled = true;
            } else if (button.dataset.phoneValidationBlocked === 'true') {
                delete button.dataset.phoneValidationBlocked;
                button.disabled = false;
            }
        });
    }

    function validateInput(input, options = {}) {
        return setValidationState(input, rejectedLimitResult(input) || phoneInputParts(input), options);
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
        const locales = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
        for (const locale of locales) {
            try {
                const region = new Intl.Locale(locale).region;
                if (region && /^[A-Z]{2}$/u.test(region)) return region;
            } catch (_) { /* continue with the next available locale signal */ }
        }
        return '';
    }

    function timeZoneCountry() {
        try {
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            return TIMEZONE_COUNTRY_MAP[timeZone] || '';
        } catch (_) { /* use the product default below */ }
        return '';
    }

    function approximateCountry() {
        return timeZoneCountry() || localeCountry() || FALLBACK_COUNTRY;
    }

    function approximateCountryWithSource() {
        const timezone = timeZoneCountry();
        if (timezone) return { code: timezone, source: 'timezone' };
        const locale = localeCountry();
        if (locale) return { code: locale, source: 'locale' };
        return { code: FALLBACK_COUNTRY, source: 'fallback' };
    }

    function countrySelectionGeneration(input) {
        return Number(input?.dataset?.phoneCountryGeneration || 0);
    }

    function bumpCountrySelectionGeneration(input) {
        const next = countrySelectionGeneration(input) + 1;
        input.dataset.phoneCountryGeneration = String(next);
        return next;
    }

    function canApplyAutomaticCountry(input, generation) {
        return Boolean(input)
            && document.contains(input)
            && input.dataset.phoneCountrySource !== 'manual'
            && !input.dataset.phoneExplicitCountry
            && !String(input.value || '').trim()
            && countrySelectionGeneration(input) === generation;
    }

    function applyCountrySelection(input, select, isoCode, source) {
        const iso = String(isoCode || '').trim().toUpperCase();
        if (!countriesByIso.has(iso)) return false;
        input.dataset.phoneCountry = iso;
        input.dataset.phoneCountrySource = source;
        if (select) select.value = iso;
        applyCountryPresentation(input, select);
        return true;
    }

    function selectedCountry(input) {
        const current = String(input?.dataset?.phoneCountry || '').trim().toUpperCase();
        if (input?.dataset?.phoneCountrySource === 'manual' && countriesByIso.has(current)) return current;
        const explicit = String(input?.dataset?.phoneExplicitCountry || '').trim().toUpperCase();
        if (explicit && countriesByIso.has(explicit)) return explicit;
        const detected = approximateCountry();
        return countriesByIso.has(detected) ? detected : FALLBACK_COUNTRY;
    }

    function applyInitialCountryDetection(input, select) {
        if (!input || input.dataset.phoneCountrySource === 'manual' || input.value.trim()) return '';
        const explicit = String(input.dataset.phoneExplicitCountry || '').trim().toUpperCase();
        if (explicit) {
            if (countriesByIso.has(explicit)) applyCountrySelection(input, select, explicit, 'explicit');
            return explicit;
        }
        const detected = approximateCountryWithSource();
        const next = countriesByIso.has(detected.code) ? detected.code : FALLBACK_COUNTRY;
        const source = next === detected.code ? detected.source : 'fallback';
        applyCountrySelection(input, select, next, source);
        return next;
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
        element.replaceChildren();
        const imageUrl = countryFlagUrl(normalized);
        if (!imageUrl) {
            element.textContent = fallback;
            element.dataset.flagFallback = 'true';
            return;
        }
        element.textContent = fallback;
        const image = document.createElement('img');
        image.className = 'phone-country-flag-image';
        image.src = imageUrl;
        image.alt = '';
        image.width = 20;
        image.height = 15;
        image.decoding = 'async';
        image.loading = 'eager';
        image.referrerPolicy = 'no-referrer';
        image.style.opacity = '0';
        image.style.transition = 'opacity 120ms ease';
        image.addEventListener('load', () => {
            element.replaceChildren(image);
            element.dataset.flagFallback = 'false';
            image.style.opacity = '1';
        }, { once: true });
        image.addEventListener('error', () => {
            element.replaceChildren(document.createTextNode(fallback));
            element.dataset.flagFallback = 'true';
        }, { once: true });
        element.appendChild(image);
    }

    function countryInputExample(country, input) {
        const mobileRules = country?.mobileRules || {};
        const localPrefix = String(mobileRules.localPrefix || '');
        const formattedNational = localDigits(country?.exampleNational || '');
        if (formattedNational) {
            if (input?.dataset.phoneAllowFixedLine === 'true' || !localPrefix) return formattedNational;
            return formattedNational.startsWith(localPrefix)
                ? formattedNational.slice(localPrefix.length)
                : formattedNational;
        }
        const international = compact(country?.exampleInternational || '');
        const dialCode = String(country?.dialCode || '').replace(/^\+/, '');
        if (international.startsWith('+') && dialCode && international.slice(1).startsWith(dialCode)) {
            const national = international.slice(1 + dialCode.length);
            return input?.dataset.phoneAllowFixedLine === 'true' || !localPrefix
                ? national
                : (national.startsWith(localPrefix) ? national.slice(localPrefix.length) : national);
        }
        // A dial code is country-selector metadata, never a national-number example.
        // Keep the placeholder empty when the catalog has no example rather than
        // presenting a misleading value such as "20" in the phone field.
        return '';
    }

    function resolveCountryIso(input, select) {
        const candidates = [
            select?.value,
            input?.dataset?.phoneCountry,
            input?.dataset?.phoneExplicitCountry,
            selectedCountry(input),
            FALLBACK_COUNTRY
        ];
        const iso = candidates
            .map((value) => String(value || '').trim().toUpperCase())
            .find((value) => countriesByIso.has(value)) || '';
        // A native select can briefly have no option while the remote catalog
        // is being hydrated. Repair that transient state from the same
        // central country selection instead of allowing an empty country to
        // reach the member API.
        if (select && iso && select.value !== iso) select.value = iso;
        if (input && iso) input.dataset.phoneCountry = iso;
        return iso;
    }

    function applyCountryPresentation(input, select) {
        const iso = resolveCountryIso(input, select);
        const country = countriesByIso.get(iso);
        if (!country || !input) return;
        const example = countryInputExample(country, input);
        // The phone field exposes only the national example. Country name and
        // dial code belong to the selector, never to the input placeholder.
        input.placeholder = example;
        input.title = example ? `\u0627\u0643\u062a\u0628 \u0645\u062b\u0627\u0644: ${example}` : `\u0631\u0642\u0645 ${country.country}`;
        syncNativeInputLimit(input);
        const flag = input.closest('.phone-input-control')?.querySelector('[data-phone-country-flag]');
        if (flag) {
            renderCountryFlag(flag, iso);
            flag.title = `${country.country} (${country.dialCode})`;
        }
        const code = input.closest('.phone-input-control')?.querySelector('[data-phone-country-code]');
        if (code) code.textContent = country.dialCode;
        const name = input.closest('.phone-input-control')?.querySelector('[data-phone-country-name]');
        if (name) name.textContent = country.country;
        if (select) {
            select.title = `${country.country} (${country.dialCode})`;
            select.setAttribute('aria-label', `${country.country} ${country.dialCode}`);
        }
    }

    function countryForInput(input) {
        const select = input.parentElement?.querySelector('select[data-phone-country]')
            || input.closest('.phone-input-control')?.querySelector('select[data-phone-country]');
        const iso = resolveCountryIso(input, select);
        return { select, iso };
    }

    function countryCodeForInput(input) {
        return countryForInput(input).iso;
    }

    function toE164Transport(value, iso) {
        const compactValue = compact(value);
        if (!compactValue) return '';
        if (compactValue.startsWith('+')) return compactValue;
        const country = countriesByIso.get(iso) || countriesByIso.get(FALLBACK_COUNTRY);
        if (!country?.dialCode) return compactValue;
        const dialCode = String(country.dialCode).replace(/^\+/, '');
        const localPrefix = String(country.mobileRules?.localPrefix || '');
        const local = localPrefix && compactValue.startsWith(localPrefix)
            ? compactValue.slice(localPrefix.length)
            : compactValue.replace(/^0+/, '');
        return `+${dialCode}${local}`;
    }

    function applyTransportValue(input, select) {
        const raw = input.value;
        if (!String(raw || '').trim()) return;
        const iso = String(select?.value || input.dataset.phoneCountry || FALLBACK_COUNTRY).toUpperCase();
        const normalized = toE164Transport(raw, iso);
        if (normalized) input.value = normalized;
        input.dataset.phoneCountry = iso;
    }

    function populateSelect(select, preferred) {
        while (select.firstChild) select.removeChild(select.firstChild);
        [...countriesByIso.values()]
            .sort((a, b) => String(a.country).localeCompare(String(b.country), 'ar'))
            .forEach((country) => {
                const option = new Option(`${country.dialCode} · ${country.country}`, country.isoCode);
                option.title = `${country.country} (${country.dialCode})`;
                select.appendChild(option);
            });
        select.value = countriesByIso.has(preferred) ? preferred : FALLBACK_COUNTRY;
    }

    function renderCountryOptions(optionsElement, preferred, query = '') {
        if (!optionsElement) return;
        const needle = latinDigits(query).trim().toLocaleLowerCase();
        const countries = [...countriesByIso.values()]
            .filter((country) => {
                if (!needle) return true;
                const dialCode = String(country.dialCode || '').replace(/^\+/, '');
                return String(country.country).toLocaleLowerCase().includes(needle)
                    || String(country.isoCode).toLocaleLowerCase().includes(needle)
                    || dialCode.includes(needle.replace(/^\+/, ''));
            })
            .sort((a, b) => String(a.country).localeCompare(String(b.country), 'ar'));
        optionsElement.replaceChildren();
        if (!countries.length) {
            const empty = document.createElement('p');
            empty.className = 'phone-country-empty';
            empty.textContent = '\u0644\u0627 \u062a\u0648\u062c\u062f \u0646\u062a\u0627\u0626\u062c';
            optionsElement.appendChild(empty);
            return;
        }
        countries.forEach((country) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'phone-country-option';
            option.dataset.phoneCountryOption = country.isoCode;
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', String(country.isoCode === preferred));
            const optionFlag = document.createElement('span');
            optionFlag.className = 'phone-country-option-flag';
            optionFlag.setAttribute('aria-hidden', 'true');
            renderCountryFlag(optionFlag, country.isoCode);
            const optionCode = document.createElement('span');
            optionCode.className = 'phone-country-option-code';
            optionCode.textContent = country.dialCode;
            const optionName = document.createElement('span');
            optionName.className = 'phone-country-option-name';
            optionName.textContent = country.country;
            option.append(optionFlag, optionName, optionCode);
            optionsElement.appendChild(option);
        });
    }

    function decorate(input) {
        if (!input || input.dataset.phoneDecorated === 'true') return;
        input.dataset.phoneDecorated = 'true';
        input.type = 'tel';
        input.inputMode = 'numeric';
        input.setAttribute('inputmode', 'numeric');
        input.autocomplete = 'tel';
        // Keep native validation compatible with stored E.164 values that edit
        // forms assign programmatically; user-entered non-digits are rejected
        // by beforeinput/paste/input and the central validator remains strict.
        input.setAttribute('pattern', '[0-9+\\s().-]*');
        input.dir = input.dir || 'ltr';

        const wrapper = document.createElement('span');
        wrapper.className = 'phone-input-control';
        wrapper.dataset.phoneControl = 'true';
        input.parentNode?.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const select = document.createElement('select');
        select.dataset.phoneCountry = 'true';
        select.name = input.name ? `${input.name}Country` : `${input.id || 'phone'}Country`;
        select.autocomplete = 'country';
        select.setAttribute('aria-label', 'Country for phone number');
        const preferred = selectedCountry(input);
        select.appendChild(new Option(preferred, preferred));
        const countryControl = document.createElement('span');
        countryControl.className = 'phone-country-control';
        const flag = document.createElement('span');
        flag.className = 'phone-country-flag';
        flag.dataset.phoneCountryFlag = 'true';
        flag.setAttribute('aria-hidden', 'true');
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'phone-country-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        const code = document.createElement('span');
        code.className = 'phone-country-code';
        code.dataset.phoneCountryCode = 'true';
        const name = document.createElement('span');
        name.className = 'phone-country-name';
        name.dataset.phoneCountryName = 'true';
        const countryDivider = document.createElement('span');
        countryDivider.className = 'phone-country-divider';
        countryDivider.setAttribute('aria-hidden', 'true');
        const caret = document.createElement('span');
        caret.className = 'phone-country-caret';
        caret.textContent = '⌄';
        trigger.append(flag, name, countryDivider, code, caret);
        const menu = document.createElement('span');
        menu.className = 'phone-country-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'listbox');
        const searchInput = document.createElement('input');
        searchInput.type = 'search';
        searchInput.className = 'phone-country-search';
        searchInput.placeholder = PHONE_MESSAGES.search;
        searchInput.autocomplete = 'off';
        searchInput.setAttribute('aria-label', PHONE_MESSAGES.search);
        const options = document.createElement('span');
        options.className = 'phone-country-options';
        menu.append(searchInput, options);
        select.className = 'phone-country-native-select';
        select.tabIndex = -1;
        countryControl.append(trigger, select, menu);
        wrapper.insertBefore(countryControl, input);
        input.dataset.phoneCountry = preferred;
        input.dataset.phoneCountrySource = input.dataset.phoneExplicitCountry ? 'explicit' : 'pending';
        input.dataset.phoneCountryGeneration = '0';

        const phoneControl = document.createElement('span');
        phoneControl.className = 'phone-number-control';
        const phoneIcon = document.createElement('span');
        phoneIcon.className = 'phone-number-icon';
        phoneIcon.setAttribute('aria-hidden', 'true');
        const phoneIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        phoneIconSvg.setAttribute('viewBox', '0 0 24 24');
        phoneIconSvg.setAttribute('focusable', 'false');
        const phoneIconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        phoneIconPath.setAttribute('d', 'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.3.57 3.57.57a1 1 0 0 1 1 1v3.49a1 1 0 0 1-1 1C11.72 21 3 12.28 3 2.99a1 1 0 0 1 1-1H7.5a1 1 0 0 1 1 1c0 1.26.2 2.45.57 3.57a1 1 0 0 1-.24 1.02l-2.21 2.21Z');
        phoneIconSvg.appendChild(phoneIconPath);
        phoneIcon.appendChild(phoneIconSvg);
        const phoneDivider = document.createElement('span');
        phoneDivider.className = 'phone-number-divider';
        phoneDivider.setAttribute('aria-hidden', 'true');
        phoneControl.append(phoneIcon, phoneDivider, input);
        wrapper.appendChild(phoneControl);

        const help = document.createElement('small');
        help.className = 'phone-input-help';
        help.dataset.phoneInputHelp = 'true';
        help.textContent = '\u0623\u062f\u062e\u0644 \u0627\u0644\u0631\u0642\u0645 \u0628\u062f\u0648\u0646 \u0645\u0641\u062a\u0627\u062d \u0627\u0644\u062f\u0648\u0644\u0629.';
        const helpId = `${input.id || input.name || 'phone'}InputHelp`;
        help.id = helpId;
        wrapper.appendChild(help);

        const error = document.createElement('small');
        error.className = 'phone-input-error';
        error.setAttribute('role', 'alert');
        error.hidden = true;
        error.id = `${input.id || input.name || 'phone'}ValidationError`;
        wrapper.appendChild(error);
        input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), helpId, error.id].filter(Boolean).join(' '));
        // Render the centralized fallback immediately, then replace it with the
        // detected catalog country when metadata arrives. This never changes the
        // input value; it only presents country metadata and the national example.
        applyCountryPresentation(input, select);

        const closeCountryMenu = () => {
            menu.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
            searchInput.value = '';
            populateSelect(select, String(input.dataset.phoneCountry || preferred).toUpperCase());
            renderCountryOptions(options, String(input.dataset.phoneCountry || preferred).toUpperCase());
            applyCountryPresentation(input, select);
        };

        trigger.addEventListener('click', () => {
            const isOpen = !menu.hidden;
            if (isOpen) {
                closeCountryMenu();
                return;
            }
            menu.hidden = false;
            trigger.setAttribute('aria-expanded', 'true');
            renderCountryOptions(options, String(input.dataset.phoneCountry || preferred).toUpperCase());
            searchInput.focus();
        });
        searchInput.addEventListener('input', () => {
            renderCountryOptions(options, String(input.dataset.phoneCountry || preferred).toUpperCase(), searchInput.value);
        });
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeCountryMenu();
                trigger.focus();
            }
        });
        options.addEventListener('click', (event) => {
            const option = event.target.closest('[data-phone-country-option]');
            if (!option) return;
            select.value = option.dataset.phoneCountryOption;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        select.addEventListener('change', () => {
            bumpCountrySelectionGeneration(input);
            input.dataset.phoneCountry = String(select.value || FALLBACK_COUNTRY).toUpperCase();
            input.dataset.phoneCountrySource = 'manual';
            closeCountryMenu();
            applyCountryPresentation(input, select);
            if (input.value.trim()) validateInput(input, { show: true });
            else setValidationState(input, { valid: true }, { show: false });
        });
        input.addEventListener('beforeinput', (event) => {
            if (!event.data || containsOnlyDigits(event.data)) return;
            event.preventDefault();
            setValidationState(input, { valid: false, message: PHONE_MESSAGES.characters }, { show: true });
            return;
        });
        input.addEventListener('beforeinput', (event) => {
            if (!event.data || !containsOnlyDigits(event.data)) return;
            const limits = exceedsInputLimit(input, event.data);
            if (!limits) return;
            event.preventDefault();
            input.dataset.phoneRejectedLimit = 'true';
            input.dataset.phoneRejectedLimitMaximum = String(limits.maximumInputDigits + (limits.international ? 1 : 0));
            setValidationState(input, {
                valid: false,
                tooLong: true,
                message: PHONE_MESSAGES.tooLong(limits.maximumInputDigits + (limits.international ? 1 : 0))
            }, { show: true });
        });
        input.addEventListener('paste', (event) => {
            const pasted = event.clipboardData?.getData('text') || '';
            if (containsOnlyDigits(pasted)) return;
            event.preventDefault();
            setValidationState(input, { valid: false, message: PHONE_MESSAGES.characters }, { show: true });
            return;
        });
        input.addEventListener('paste', (event) => {
            const pasted = event.clipboardData?.getData('text') || '';
            if (!containsOnlyDigits(pasted)) return;
            const limits = exceedsInputLimit(input, pasted);
            if (!limits) return;
            event.preventDefault();
            input.dataset.phoneRejectedLimit = 'true';
            input.dataset.phoneRejectedLimitMaximum = String(limits.maximumInputDigits + (limits.international ? 1 : 0));
            setValidationState(input, {
                valid: false,
                tooLong: true,
                message: PHONE_MESSAGES.tooLong(limits.maximumInputDigits + (limits.international ? 1 : 0))
            }, { show: true });
        });
        input.addEventListener('input', () => {
            const wasRejectedBeforeInput = input.dataset.phoneRejectedLimit === 'true';
            if (wasRejectedBeforeInput && !String(input.value || '').trim()) {
                const rejected = rejectedLimitResult(input);
                if (rejected) {
                    setValidationState(input, rejected, { show: true });
                    return;
                }
            }
            delete input.dataset.phoneRejectedLimit;
            delete input.dataset.phoneRejectedLimitMaximum;
            const raw = String(input.value || '');
            const normalizedDigits = latinDigits(raw);
            const sanitized = localDigits(raw);
            if (sanitized !== normalizedDigits) {
                input.value = sanitized;
                setValidationState(input, { valid: false, message: PHONE_MESSAGES.characters }, { show: true });
                syncNativeInputLimit(input);
                return;
            }
            if (raw !== normalizedDigits) input.value = normalizedDigits;
            const result = phoneInputParts(input);
            if (result.tooLong) {
                const limits = inputLimits(input);
                if (limits) {
                    const prefix = limits.international ? '+' : '';
                    input.value = `${prefix}${localDigits(input.value).slice(0, limits.maximumInputDigits)}`;
                    syncNativeInputLimit(input);
                    input.dataset.phoneRejectedLimit = 'true';
                    input.dataset.phoneRejectedLimitMaximum = String(limits.maximumInputDigits + (limits.international ? 1 : 0));
                    setValidationState(input, {
                        valid: false,
                        tooLong: true,
                        message: PHONE_MESSAGES.tooLong(limits.maximumInputDigits + (limits.international ? 1 : 0))
                    }, { show: true });
                    return;
                }
                setValidationState(input, result, { show: true });
            } else if (!result.valid && result.message === PHONE_MESSAGES.characters) setValidationState(input, result, { show: true });
            else {
                syncNativeInputLimit(input);
                setValidationState(input, { valid: true }, { show: false });
                if (shouldValidateWhileTyping(input)) validateInput(input, { show: false });
            }
        });
        input.addEventListener('blur', () => validateInput(input, { show: true }));

        loadCountries().then(() => {
            if (!document.contains(select)) return;
            applyInitialCountryDetection(input, select);
            populateSelect(select, String(input.dataset.phoneCountry || preferred).toUpperCase());
            renderCountryOptions(options, String(input.dataset.phoneCountry || preferred).toUpperCase());
            applyCountryPresentation(input, select);
            if (input.value.trim()) validateInput(input, { show: false });

            // IP detection is deliberately started only after the catalog is
            // available, so one catalog country object remains the source of
            // truth for ISO, name, flag, dial code and the local example.
            const detectionGeneration = countrySelectionGeneration(input);
            if (!input.dataset.phoneExplicitCountry && input.dataset.phoneCountrySource !== 'manual' && !input.value.trim()) {
                loadDetectedCountry().then((detectedIso) => {
                    if (!detectedIso || !canApplyAutomaticCountry(input, detectionGeneration)) return;
                    applyCountrySelection(input, select, detectedIso, 'ip');
                    renderCountryOptions(options, detectedIso, searchInput.value);
                });
            }
        }).catch(() => { /* the API remains authoritative if catalog is unavailable */ });
    }

    function loadDetectedCountry() {
        if (countryDetectionPromise) return countryDetectionPromise;
        countryDetectionPromise = fetch('/api/phone/country', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error('country detection unavailable')))
            .then((payload) => {
                const code = String(payload?.countryCode || '').trim().toUpperCase();
                return /^[A-Z]{2}$/u.test(code) ? code : '';
            })
            .catch(() => '');
        return countryDetectionPromise;
    }

    function loadCountries() {
        if (countriesPromise) return countriesPromise;
        countriesPromise = fetch('/api/phone/countries', { credentials: 'same-origin', cache: 'force-cache' })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error('country catalog unavailable')))
            .then((payload) => {
                (payload.countries || []).forEach((country) => {
                    if (country?.isoCode && country?.dialCode) countriesByIso.set(String(country.isoCode).toUpperCase(), country);
                });
                if (!countriesByIso.has(FALLBACK_COUNTRY)) throw new Error('fallback country unavailable');
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
        countriesByIso.set(FALLBACK_COUNTRY, {
            isoCode: FALLBACK_COUNTRY,
            dialCode: '+20',
            country: '\u0645\u0635\u0631',
            exampleNational: '01015819700',
            validLengths: [8, 9, 10],
            mobileRules: { validLengths: [10], nationalPattern: '1[0-25]\\d{8}', localPrefix: '0' }
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
        countryCodeForInput,
        countryForValue
    });
})();
