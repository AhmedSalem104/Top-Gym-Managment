'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/app.js'), 'utf8');

function loadMemberTableRow() {
    const start = source.indexOf('function memberTableRow(member)');
    const end = source.indexOf('\n        function renderMembers', start);
    assert.ok(start >= 0 && end > start, 'members table renderer must remain discoverable');

    return new Function(
        'FREEZE_LIMIT',
        'actionButton',
        'escapeHtml',
        'formatDate',
        'memberPortalCodeMarkup',
        'memberStatusBadge',
        'money',
        'planLabel',
        'typeLabel',
        `${source.slice(start, end)}; return memberTableRow;`
    )(
        3,
        (action, memberId, _classes, extra = '') => `<button data-action="${action}" data-id="${memberId}" ${extra}></button>`,
        (value) => String(value ?? ''),
        (value) => String(value ?? ''),
        () => '',
        () => '',
        (value) => String(value ?? ''),
        (value) => String(value ?? ''),
        (value) => String(value ?? '')
    );
}

function memberWithStatus(status, freezeCount = 0) {
    return {
        id: 42,
        fullName: 'QA member',
        phone: '0000000000',
        registrationDate: '2026-01-01',
        membership: {
            status,
            freezeCount,
            freezeLimit: 3,
            plan: 'gym_only',
            type: 'monthly',
            effectiveEndDate: '2026-12-31',
            daysRemaining: 100,
            amountDue: 0,
            amountRemaining: 0
        }
    };
}

test('members with a subscription always render the freeze action', () => {
    const renderMemberTableRow = loadMemberTableRow();

    for (const status of ['active', 'expiring_soon', 'expired', 'cancelled', 'frozen']) {
        const html = renderMemberTableRow(memberWithStatus(status));
        assert.match(html, /data-action="freeze"/, `${status} membership must keep the freeze action visible`);
    }
});

test('freeze action is disabled only when membership state or usage prevents freezing', () => {
    const renderMemberTableRow = loadMemberTableRow();
    const enabled = renderMemberTableRow(memberWithStatus('active', 0));
    const limitReached = renderMemberTableRow(memberWithStatus('active', 3));
    const expired = renderMemberTableRow(memberWithStatus('expired', 0));
    const cancelled = renderMemberTableRow(memberWithStatus('cancelled', 0));

    assert.match(enabled, /data-action="freeze" data-id="42"\s*><\/button>/);
    assert.match(limitReached, /data-action="freeze" data-id="42" disabled aria-disabled="true"/);
    assert.match(expired, /data-action="freeze" data-id="42" disabled aria-disabled="true"/);
    assert.match(cancelled, /data-action="freeze" data-id="42" disabled aria-disabled="true"/);
});

test('frozen memberships keep resume alongside the visible disabled freeze action', () => {
    const html = loadMemberTableRow()(memberWithStatus('frozen', 1));

    assert.match(html, /data-action="freeze" data-id="42" disabled aria-disabled="true"/);
    assert.match(html, /data-action="resume" data-id="42"/);
});

test('members without a subscription keep a visible disabled freeze action', () => {
    const renderMemberTableRow = loadMemberTableRow();
    const html = renderMemberTableRow({
        id: 42,
        fullName: 'QA member',
        phone: '0000000000',
        registrationDate: '2026-01-01',
        membership: null
    });

    assert.match(html, /data-action="freeze" data-id="42" disabled aria-disabled="true"/);
});

test('member quick-action decoration does not remove freeze for cancelled memberships', () => {
    assert.doesNotMatch(
        source,
        /querySelectorAll\('\[data-action="freeze"\], \[data-action="payment"\]'\)/,
        'the quick-action enhancement must not delete the stable freeze action'
    );
});
