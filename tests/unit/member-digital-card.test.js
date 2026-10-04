'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');

test('digital card uses tenant-published branding and an attendance-only opaque QR contract', () => {
    const card = read('public/js/member-digital-card.js');
    const endpoint = read('src/routes/attendance.routes.js');
    assert.match(card, /topGymBranding\?\.refresh\?\.\(\{ scope: 'tenant' \}\)/);
    assert.match(card, /\/api\/attendance\/qr\//);
    assert.match(card, /LFQR1/);
    assert.doesNotMatch(card, /membership-code\/reveal/);
    assert.doesNotMatch(card, /Logic Fit Gym|Top Gym|Power Gym|Titan Fitness/);
    assert.match(endpoint, /attendance\/qr\/:id/);
    assert.match(card, /topGymWhatsapp/);
});

test('member card sharing is user-initiated and never claims delivery', () => {
    const card = read('public/js/member-digital-card.js');
    assert.match(card, /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/);
    assert.match(card, /download = 'membership-card\.png'/);
    assert.match(card, /openMessage\(phone, messageForCard\(currentCard\), preparedWindow\)/);
    assert.doesNotMatch(card, /WhatsApp Business|Meta Cloud API|Twilio|360dialog/i);
    assert.doesNotMatch(card, /تم إرسال البطاقة/);
});

test('attendance QR token is independent from the member portal bearer-code reveal flow', () => {
    const attendance = read('src/services/attendance-service.js');
    const card = read('public/js/member-digital-card.js');
    assert.match(attendance, /attendanceQrTokenService\.resolveForCurrentTenant/);
    assert.doesNotMatch(attendance, /membershipCodeService/);
    assert.doesNotMatch(card, /membership-code\/reveal/);
});

test('card QR block stays below the full five-field membership grid', () => {
    const card = read('public/js/member-digital-card.js');
    assert.match(card, /const qrSize = 290;\s*const qrX = \(CARD_WIDTH - qrSize\) \/ 2;\s*const qrY = 930;/);
    assert.match(card, /CARD_WIDTH \/ 2, 1280, 23/);
});
