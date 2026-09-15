const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('phone input contract is Egypt-only, local-first, and cache-busted consistently', () => {
    assert.match(read('public/js/core/feature-manifest.js'), /core\/phone-inputs\.js\?v=13/);
    assert.match(read('public/register-gym.html'), /core\/phone-inputs\.js\?v=13/);
    assert.match(read('public/register-trainer.html'), /core\/phone-inputs\.js\?v=13/);
    assert.match(read('public/trainer-workspace.html'), /core\/phone-inputs\.js\?v=13/);
    assert.match(read('public/member-portal.html'), /core\/phone-inputs\.js\?v=13/);

    const script = read('public/js/core/phone-inputs.js');
    assert.match(script, /const LOCAL_PHONE_COUNTRY = 'EG'/);
    assert.match(script, /const LOCAL_PHONE_EXAMPLE = '01015819700'/);
    assert.match(script, /const NATIVE_PHONE_PATTERN = '\(\?:\[0-9\]\|\\\\s\|\\\\\.\|\\\\\(\|\\\\\)\|-\)\*'/);
    assert.match(script, /phone-egypt-local-only/);
    assert.match(script, /toEgyptLocalInput/);
    assert.match(script, /phoneNational/);
    assert.match(script, /normalizeForTransport/);
    assert.match(script, /function parsePhoneInput/);
    assert.match(script, /input\.placeholder = placeholder/);
    assert.doesNotMatch(script, /TIMEZONE_COUNTRY_MAP/);
    assert.doesNotMatch(script, /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
    assert.doesNotMatch(script, /navigator\.language/);
    assert.doesNotMatch(script, /loadDetectedCountry/);
    assert.doesNotMatch(script, /fetch\(['"]\/api\/phone\/country/);

    const css = read('public/css/components/phone-inputs.css');
    assert.match(css, /phone-egypt-local-only/);
    assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /phone-country-control/);
    assert.match(css, /phone-input-error/);
});

test('phone-bearing screens use local Egyptian mobile inputs', () => {
    const index = read('public/index.html');
    const coachingDialogs = read('public/dialogs/coaching.html');
    const registerGym = read('public/register-gym.html');
    const registerTrainer = read('public/register-trainer.html');
    const trainerWorkspace = read('public/trainer-workspace.html');
    assert.match(index, /id="phone" type="tel"[^>]*data-phone-input/);
    assert.match(index, /id="attendancePhone" type="tel"[^>]*data-phone-input/);
    assert.match(index, /id="dayPassVisitorPhone" type="tel"[^>]*data-phone-input/);
    assert.match(index, /id="storeSupplierPhone" type="tel"[^>]*data-phone-input/);
    assert.doesNotMatch(index, /data-phone-allow-fixed-line/);
    assert.match(coachingDialogs, /id="externalPhone" type="tel"[^>]*data-phone-input/);
    assert.match(registerGym, /name="whatsapp" type="tel"[^>]*data-phone-input/);
    assert.match(registerTrainer, /name="whatsapp" type="tel"[^>]*data-phone-input/);
    assert.match(trainerWorkspace, /id="trainerClientPhone"[^>]*data-phone-input/);
    assert.doesNotMatch(read('public/js/branch-context.js'), /data-phone-allow-fixed-line/);
    assert.match(read('public/js/pages/coaching/coaching.js'), /id="coachingEditPhone"[^>]*type="tel"[^>]*data-phone-input/);
    assert.match(index, /id="amountPaid"[^>]*type="number"/);
});

test('all phone writes and searches use the central Egyptian policy', () => {
    const member = read('src/services/member-service.js');
    const coaching = read('src/services/coaching-service.js');
    const attendance = read('src/services/attendance-service.js');
    const registration = read('src/services/gym-registration-service.js');
    const dayPass = read('src/services/day-pass-service.js');
    const store = read('src/services/store-service.js');
    const branch = read('src/services/branch-service.js');
    const branding = read('src/services/branding-service.js');
    const platformAdmin = read('src/services/platform-admin-service.js');
    assert.match(member, /normalizeEgyptianMobileForSearch/);
    assert.match(member, /country: EGYPT_COUNTRY/);
    assert.match(coaching, /normalizeEgyptianMobile/);
    assert.match(attendance, /normalizeEgyptianMobileForSearch/);
    assert.match(dayPass, /normalizeEgyptianMobile/);
    assert.match(store, /normalizeEgyptianMobile/);
    assert.match(branch, /normalizeEgyptianMobile/);
    assert.match(branding, /normalizeEgyptianMobile/);
    assert.match(platformAdmin, /normalizeEgyptianMobile/);
    assert.match(registration, /normalizeEgyptianMobile/);
    assert.doesNotMatch(registration, /defaultCountryCode\s*=\s*['"]20['"]/);
});
