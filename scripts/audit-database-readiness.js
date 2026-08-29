'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function maskSql(source) {
    const text = String(source || '');
    let output = '';
    let index = 0;
    let inString = false;
    let inLineComment = false;
    let inBlockComment = false;

    while (index < text.length) {
        const current = text[index];
        const next = text[index + 1];
        if (inLineComment) {
            output += current === '\n' || current === '\r' ? current : ' ';
            if (current === '\n' || current === '\r') inLineComment = false;
            index += 1;
            continue;
        }
        if (inBlockComment) {
            if (current === '*' && next === '/') {
                output += '  ';
                index += 2;
                inBlockComment = false;
            } else {
                output += current === '\n' || current === '\r' ? current : ' ';
                index += 1;
            }
            continue;
        }
        if (inString) {
            if (current === "'" && next === "'") {
                output += '  ';
                index += 2;
            } else if (current === "'") {
                output += ' ';
                index += 1;
                inString = false;
            } else {
                output += current === '\n' || current === '\r' ? current : ' ';
                index += 1;
            }
            continue;
        }
        if (current === '-' && next === '-') {
            output += '  ';
            index += 2;
            inLineComment = true;
            continue;
        }
        if (current === '/' && next === '*') {
            output += '  ';
            index += 2;
            inBlockComment = true;
            continue;
        }
        if (current === "'") {
            output += ' ';
            index += 1;
            inString = true;
            continue;
        }
        output += current;
        index += 1;
    }
    return output;
}

function parseMigrationVersion(fileName) {
    const match = String(fileName || '').match(/^(\d+)-[^/\\]+\.sql$/i);
    return match ? Number(match[1]) : null;
}

function previousText(source, index, length = 600) {
    return source.slice(Math.max(0, index - length), index);
}

function lastMatchIndex(source, pattern) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    let lastIndex = -1;
    for (const match of source.matchAll(globalPattern)) lastIndex = match.index;
    return lastIndex;
}

function hasLatestGuard(source, index, guardPattern, operationPattern, length = 600) {
    const before = previousText(source, index, length);
    const guardIndex = lastMatchIndex(before, guardPattern);
    const operationIndex = lastMatchIndex(before, operationPattern);
    return guardIndex >= 0 && (operationIndex < 0 || guardIndex > operationIndex);
}

function collectMatches(source, pattern) {
    return [...source.matchAll(pattern)].map((match) => ({ match, index: match.index }));
}

function auditMigrationText(fileName, source) {
    const masked = maskSql(source);
    const findings = [];
    const operations = {
        createTables: [],
        alterColumns: [],
        createIndexes: [],
        seedInserts: []
    };

    const dangerousPatterns = [
        ['DROP_TABLE', /\bDROP\s+TABLE\b/i],
        ['TRUNCATE_TABLE', /\bTRUNCATE\s+TABLE\b/i],
        ['DELETE_ROWS', /\bDELETE\s+FROM\b/i],
        ['UPDATE_ROWS', /\bUPDATE\s+(?:\[?dbo\]?\.)?[A-Za-z_][A-Za-z0-9_]*/i],
        ['DROP_INDEX', /\bDROP\s+INDEX\b/i],
        ['DROP_CONSTRAINT', /\bALTER\s+TABLE[\s\S]{0,160}?\bDROP\s+CONSTRAINT\b/i]
    ];
    for (const [code, pattern] of dangerousPatterns) {
        if (pattern.test(masked)) {
            findings.push({ severity: 'CRITICAL', code, message: `${code} is not allowed in a repeatable production migration.` });
        }
    }
    if (/(^|\r?\n)\s*GO\s*(?:$|\r?\n)/im.test(masked)) {
        findings.push({ severity: 'ERROR', code: 'GO_BATCH_SEPARATOR', message: 'GO batch separators are not accepted by mssql batch execution.' });
    }

    for (const { match, index } of collectMatches(masked, /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\[?dbo\]?\.)?\[?([A-Za-z_][A-Za-z0-9_]*)\]?/gi)) {
        const tableName = match[1];
        const guarded = hasLatestGuard(
            masked,
            index,
            /\bIF\s+OBJECT_ID\s*\([\s\S]{0,180}?\)\s+IS\s+NULL/i,
            /\bCREATE\s+TABLE\b/gi
        );
        operations.createTables.push({ name: tableName, guarded });
        if (!guarded) {
            findings.push({ severity: 'ERROR', code: 'UNGUARDED_CREATE_TABLE', message: `CREATE TABLE ${tableName} has no preceding OBJECT_ID guard.` });
        }
    }

    for (const { match, index } of collectMatches(masked, /\bALTER\s+TABLE\s+(?:\[?dbo\]?\.)?\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s+ADD\s+\[?([A-Za-z_][A-Za-z0-9_]*)\]?/gi)) {
        const tableName = match[1];
        const columnName = match[2];
        const guarded = hasLatestGuard(
            masked,
            index,
            /\b(?:COL_LENGTH\s*\([\s\S]{0,180}?\)\s+IS\s+NULL|IF\s+NOT\s+EXISTS\b)/i,
            /\bALTER\s+TABLE\b/gi,
            420
        );
        operations.alterColumns.push({ tableName, columnName, guarded });
        if (!guarded) {
            findings.push({ severity: 'ERROR', code: 'UNGUARDED_ALTER_COLUMN', message: `ALTER TABLE ${tableName} ADD ${columnName} has no column-existence guard.` });
        }
    }

    for (const { match, index } of collectMatches(masked, /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+\[?([A-Za-z_][A-Za-z0-9_]*)\]?\s+[\s\S]{0,480}?\bON\s+(?:\[?dbo\]?\.)?\[?([A-Za-z_][A-Za-z0-9_]*)\]?/gi)) {
        const indexName = match[1];
        const tableName = match[2];
        const guarded = hasLatestGuard(
            masked,
            index,
            /\bIF\s+NOT\s+EXISTS\s*\([\s\S]{0,320}?\bsys\.indexes\b[\s\S]{0,160}?\)/i,
            /\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/gi,
            620
        );
        operations.createIndexes.push({ name: indexName, tableName, guarded });
        if (!guarded) {
            findings.push({ severity: 'ERROR', code: 'UNGUARDED_CREATE_INDEX', message: `CREATE INDEX ${indexName} has no preceding sys.indexes guard.` });
        }
    }

    for (const { match, index } of collectMatches(masked, /\bINSERT\s+INTO\s+(?:\[?dbo\]?\.)?\[?([A-Za-z_][A-Za-z0-9_]*)\]?/gi)) {
        const tableName = match[1];
        const guarded = hasLatestGuard(masked, index, /\bIF\s+NOT\s+EXISTS\b/i, /\bINSERT\s+INTO\b/gi, 420);
        operations.seedInserts.push({ tableName, guarded });
        if (!guarded) {
            findings.push({ severity: 'ERROR', code: 'UNGUARDED_SEED_INSERT', message: `INSERT INTO ${tableName} has no preceding existence guard.` });
        }
    }

    return {
        file: fileName,
        operations,
        findings,
        status: findings.some((finding) => finding.severity === 'CRITICAL' || finding.severity === 'ERROR') ? 'FAIL' : 'PASS'
    };
}

function auditDatabaseReadiness({ rootDir = ROOT } = {}) {
    const migrationDirectory = path.join(rootDir, 'database', 'migrations');
    const migrationFiles = fs.readdirSync(migrationDirectory)
        .filter((fileName) => fileName.toLowerCase().endsWith('.sql'))
        .sort((first, second) => first.localeCompare(second, undefined, { numeric: true }));
    const versions = migrationFiles.map(parseMigrationVersion);
    const duplicateVersions = versions.filter((version, index) => version !== null && versions.indexOf(version) !== index);
    const invalidNames = migrationFiles.filter((fileName) => parseMigrationVersion(fileName) === null);
    const migrations = migrationFiles.map((fileName) => auditMigrationText(
        fileName,
        fs.readFileSync(path.join(migrationDirectory, fileName), 'utf8')
    ));
    const migrationFindings = [];
    if (duplicateVersions.length) migrationFindings.push({ severity: 'ERROR', code: 'DUPLICATE_MIGRATION_VERSION', message: `Duplicate migration version(s): ${[...new Set(duplicateVersions)].join(', ')}` });
    if (invalidNames.length) migrationFindings.push({ severity: 'ERROR', code: 'INVALID_MIGRATION_NAME', message: `Migration filenames must start with a numeric version: ${invalidNames.join(', ')}` });
    for (const migration of migrations) migrationFindings.push(...migration.findings);

    const runnerSource = fs.readFileSync(path.join(rootDir, 'scripts', 'migrate-tenancy.js'), 'utf8');
    const poolSource = fs.readFileSync(path.join(rootDir, 'src', 'database', 'pool.js'), 'utf8');
    const transactionSource = fs.readFileSync(path.join(rootDir, 'src', 'database', 'transaction.js'), 'utf8');
    const tenantServiceSource = fs.readFileSync(path.join(rootDir, 'src', 'services', 'tenant-service.js'), 'utf8');
    const runnerChecks = {
        initializesCanonicalSchema: /initDatabase\s*\(/.test(runnerSource),
        ensuresTenantMetadata: /ensureTenantTables\s*\(/.test(runnerSource),
        ensuresSaasObjects: /ensureSaasTables\s*\(/.test(runnerSource),
        closesPoolOnExit: /\.finally\s*\([\s\S]*closePool\s*\(/.test(runnerSource),
        reportsFailure: /\.catch\s*\(/.test(runnerSource)
    };
    const poolChecks = {
        reusesConnectionPromise: /let\s+poolPromise/.test(poolSource) && /if\s*\(!poolPromise\)/.test(poolSource),
        boundedTimeouts: /connectionTimeout:\s*appConfig\.mssqlConnectionTimeout/.test(poolSource)
            && /requestTimeout:\s*appConfig\.mssqlRequestTimeout/.test(poolSource),
        closesPool: /async\s+function\s+closePool/.test(poolSource) && /await\s+pool\.close\(\)/.test(poolSource)
    };
    const transactionChecks = {
        beginsBeforeWork: /await\s+transaction\.begin\(\)[\s\S]*const\s+result\s*=\s*await\s+work/.test(transactionSource),
        commitsAfterWork: /const\s+result\s*=\s*await\s+work[\s\S]*await\s+transaction\.commit\(\)/.test(transactionSource),
        rollsBackOnlyAfterBegin: /started\s*=\s*true[\s\S]*if\s*\(started\s+&&\s*!committed\)/.test(transactionSource),
        preservesOriginalFailure: /throw\s+error/.test(transactionSource)
    };
    const runtimeSchemaChecks = {
        tenantStatusConstraintOnlyReplacedWhenOutdated: /definition\s+IS\s+NULL[\s\S]*definition\s+NOT\s+LIKE[\s\S]*ALTER\s+TABLE\s+dbo\.gym_tenants\s+DROP\s+CONSTRAINT\s+CK_gym_tenants_status/i.test(tenantServiceSource)
    };
    const schemaSource = fs.readFileSync(path.join(rootDir, 'database', 'schema.sql'), 'utf8');
    const schemaMasked = maskSql(schemaSource);
    const schemaReview = {
        containsLegacyConstraintChanges: /\bALTER\s+TABLE[\s\S]{0,180}?\bDROP\s+CONSTRAINT\b/i.test(schemaMasked),
        containsLegacyDataTransforms: /\b(?:UPDATE|INSERT\s+INTO)\b/i.test(schemaMasked),
        status: 'REQUIRES STAGING VERIFICATION'
    };

    const staticChecks = [
        !migrationFindings.some((finding) => finding.severity === 'CRITICAL' || finding.severity === 'ERROR'),
        Object.values(runnerChecks).every(Boolean),
        Object.values(poolChecks).every(Boolean),
        Object.values(transactionChecks).every(Boolean),
        Object.values(runtimeSchemaChecks).every(Boolean)
    ];
    return {
        generatedAt: new Date().toISOString(),
        migrationFiles,
        duplicateVersions: [...new Set(duplicateVersions)],
        migrations,
        migrationFindings,
        runnerChecks,
        poolChecks,
        transactionChecks,
        runtimeSchemaChecks,
        schemaReview,
        staticStatus: staticChecks.every(Boolean) ? 'PASS' : 'FAIL',
        liveVerification: 'REQUIRES STAGING/PRODUCTION VERIFICATION'
    };
}

function formatReport(report) {
    const lines = [
        'DATABASE_READINESS_AUDIT',
        `STATIC_STATUS: ${report.staticStatus}`,
        `MIGRATIONS: ${report.migrationFiles.join(', ') || 'none'}`,
        `MIGRATION_SAFETY: ${report.migrationFindings.length ? 'REVIEW_REQUIRED' : 'PASS — guarded and non-destructive'}`,
        `RUNNER: ${Object.values(report.runnerChecks).every(Boolean) ? 'PASS' : 'REVIEW_REQUIRED'}`,
        `POOL: ${Object.values(report.poolChecks).every(Boolean) ? 'PASS' : 'REVIEW_REQUIRED'}`,
        `TRANSACTIONS: ${Object.values(report.transactionChecks).every(Boolean) ? 'PASS' : 'REVIEW_REQUIRED'}`,
        `RUNTIME_SCHEMA_SETUP: ${Object.values(report.runtimeSchemaChecks).every(Boolean) ? 'PASS' : 'REVIEW_REQUIRED'}`,
        `SCHEMA_REHEARSAL: ${report.schemaReview.status}`,
        `LIVE_DATABASE_EVIDENCE: ${report.liveVerification}`
    ];
    for (const finding of report.migrationFindings) lines.push(`[${finding.severity}] ${finding.code} — ${finding.message}`);
    return lines.join('\n');
}

if (require.main === module) {
    const report = auditDatabaseReadiness();
    const reportDirectory = path.join(ROOT, 'qa', 'reports');
    fs.mkdirSync(reportDirectory, { recursive: true });
    fs.writeFileSync(path.join(reportDirectory, 'database-readiness-latest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(formatReport(report));
    process.exitCode = report.staticStatus === 'PASS' ? 0 : 1;
}

module.exports = { auditDatabaseReadiness, auditMigrationText, formatReport, maskSql, parseMigrationVersion };
