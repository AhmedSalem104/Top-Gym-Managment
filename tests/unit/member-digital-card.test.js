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

test('card branding uses separate logo and tenant-name zones and adapts the QR position to real fields', () => {
    const card = read('public/js/member-digital-card.js');
    assert.match(card, /roundedRect\(92, 88, 176, 142, 24, CARD_COLORS\.surfaceMuted/);
    assert.match(card, /drawText\(gymName, 970, 126, 46, CARD_COLORS\.text, 800, 'right', 640\)/);
    assert.match(card, /const rowCount = Math\.ceil\(fields\.length \/ 2\)/);
    assert.match(card, /const qrSize = 350/);
    assert.match(card, /const qrY = Math\.max\(574, Math\.min\(790, gridTop \+ rowCount \* \(tileHeight \+ rowGap\) \+ 24\)\)/);
    assert.doesNotMatch(card, /\['الحالة', membershipStatus\(membership\)\]/);
});

test('a card QR is consumed by the current attendance scanner and resolved before check-in/out', () => {
    const card = read('public/js/member-digital-card.js');
    const scanner = read('public/js/pages/attendance/attendance.js');
    const service = read('src/services/attendance-service.js');
    assert.match(card, /const validCode = .*LFQR1/);
    assert.match(scanner, /function isSecureMembershipQr\(value\)/);
    assert.match(scanner, /request\('\/api\/attendance\/resolve-qr', \{ method: 'POST', body: JSON\.stringify\(\{ qrToken: decodedText \}\) \}\)/);
    assert.match(scanner, /checkOut\(\{ qrToken: decodedText \}\)/);
    assert.match(scanner, /checkIn\(\{ qrToken: decodedText \}\)/);
    assert.match(service, /attendanceQrTokenService\.resolveForCurrentTenant/);
    assert.match(service, /resolveQrMember\(qrToken/);
});
