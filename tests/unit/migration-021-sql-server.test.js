'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migrationPath = path.join(__dirname, '..', '..', 'database', 'migrations', '021-membership-branch-attendance.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

test('migration 021 compiles new-column dependents in a later SQL Server scope', () => {
    const columnAdd = migration.indexOf("ADD branch_access_mode VARCHAR(24)");
    const validationScope = migration.indexOf("EXEC sys.sp_executesql N'", columnAdd);
    const membershipBackfillScope = migration.lastIndexOf("EXEC sys.sp_executesql N'");

    assert.ok(columnAdd >= 0);
    assert.ok(validationScope > columnAdd);
    assert.ok(membershipBackfillScope > validationScope);

    const staticTail = migration.slice(columnAdd, validationScope);
    assert.doesNotMatch(staticTail, /WHERE\s+branch_access_mode\b/i);
    assert.doesNotMatch(staticTail, /CHECK\s*\(\s*branch_access_mode\b/i);

    const dependentSql = migration.slice(validationScope);
    assert.match(dependentSql, /WHERE\s+branch_access_mode\s+NOT\s+IN/i);
    assert.match(dependentSql, /CHECK\s*\(branch_access_mode\s+IN/i);
    assert.match(dependentSql, /WHERE\s+membership\.branch_access_mode\s*=\s*''single_branch''/i);
});
