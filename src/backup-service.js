const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { gzip } = require('node:zlib');
const { getPool } = require('./db');
const { ensureExpensesTable } = require('./finance-service');
const { ensurePaymentTransactionsTable } = require('./member-service');
const { ensureAttendanceTable } = require('./attendance-service');

const gzipAsync = promisify(gzip);

// Keep the backup limited to the tables owned by this application. The shared
// database also contains dbo.Payments, which belongs to another system.
const BACKUP_TABLES = [
    { key: 'members', table: 'members' },
    { key: 'memberships', table: 'memberships' },
    { key: 'membership_pricing', table: 'membership_pricing' },
    { key: 'membership_types', table: 'membership_types' },
    { key: 'membership_freezes', table: 'membership_freezes' },
    { key: 'gym_payments', table: 'gym_payments' },
    { key: 'gym_payment_transactions', table: 'gym_payment_transactions' },
    { key: 'gym_expenses', table: 'gym_expenses' },
    { key: 'gym_attendance', table: 'gym_attendance' },
    { key: 'membership_events', table: 'membership_events' }
];

function getLocalTimeParts(date = new Date()) {
    const timeZone = process.env.APP_TIMEZONE || 'Africa/Cairo';
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, part.value])
    );

    return {
        timeZone,
        stamp: `${values.year}-${values.month}-${values.day}_${values.hour}-${values.minute}`
    };
}

async function readTable(pool, table) {
    const result = await pool.request().query(`SELECT * FROM dbo.[${table}] ORDER BY [id] ASC;`);
    return result.recordset;
}

async function createBackup() {
    await ensureExpensesTable();
    await ensurePaymentTransactionsTable();
    await ensureAttendanceTable();
    const pool = await getPool();
    const generatedAt = new Date();
    const { timeZone, stamp } = getLocalTimeParts(generatedAt);
    const tableRows = await Promise.all(
        BACKUP_TABLES.map(async ({ key, table }) => [key, await readTable(pool, table)])
    );
    const tables = Object.fromEntries(tableRows);
    const schemaSql = fs.readFileSync(
        path.join(__dirname, '..', 'database', 'schema.sql'),
        'utf8'
    );
    const payload = {
        format: 'top-gym-json-backup',
        version: 1,
        generatedAt: generatedAt.toISOString(),
        timeZone,
        tables,
        schemaSql
    };
    const json = JSON.stringify(payload, (_, value) => (
        typeof value === 'bigint' ? value.toString() : value
    ));
    const buffer = await gzipAsync(Buffer.from(json, 'utf8'));

    return {
        buffer,
        filename: `backup_${stamp}.json.gz`,
        rowCounts: Object.fromEntries(
            Object.entries(tables).map(([key, records]) => [key, records.length])
        )
    };
}

module.exports = { createBackup };
