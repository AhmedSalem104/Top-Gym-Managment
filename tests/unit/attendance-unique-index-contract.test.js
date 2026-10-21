'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('attendance source schema and runtime readiness both enforce one member/day record', () => {
    const schema = read('database/schema.sql');
    const service = read('src/services/attendance-service.js');
    for (const source of [schema, service]) {
        assert.match(source, /UX_gym_attendance_member_date/);
        assert.match(source, /UNIQUE\s+INDEX[\s\S]{0,160}member_id\s*,\s*attendance_date/i);
    }
    assert.match(service, /error\.number\s*===?\s*2601|number\s*===?\s*2601/);
    assert.match(service, /error\.number\s*===?\s*2627|number\s*===?\s*2627/);
    assert.match(service, /ATTENDANCE_ALREADY_CHECKED_IN/);
});
