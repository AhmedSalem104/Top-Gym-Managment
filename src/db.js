const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');

let poolPromise;

function parseBoolean(value, fallback) {
    if (value === undefined || value === '') return fallback;
    return ['true', '1', 'yes'].includes(String(value).trim().toLowerCase());
}

function parseConnectionString(connectionString) {
    if (!connectionString) throw new Error('MSSQL_CONNECTION_STRING is not configured.');
    const values = {};
    for (const segment of connectionString.split(';')) {
        const separator = segment.indexOf('=');
        if (separator < 0) continue;
        const key = segment.slice(0, separator).trim().toLowerCase().replace(/\s+/g, '');
        values[key] = segment.slice(separator + 1).trim();
    }

    const serverValue = values.server || values.datasource || values.data_source || values.address;
    const databaseValue = values.database || values.initialcatalog;
    const userValue = values.userid || values.user || values.uid;
    const passwordValue = values.password || values.pwd;
    if (!serverValue || !databaseValue || !userValue || passwordValue === undefined) {
        throw new Error('The SQL Server connection string is incomplete.');
    }

    const serverParts = serverValue.split(',');
    const config = {
        server: serverParts[0],
        database: databaseValue,
        user: userValue,
        password: passwordValue,
        options: {
            encrypt: parseBoolean(values.encrypt, true),
            trustServerCertificate: parseBoolean(values.trustservercertificate, false)
        },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
    };
    if (serverParts[1]) config.port = Number(serverParts[1]);
    return config;
}

async function getPool() {
    if (!poolPromise) {
        const config = parseConnectionString(process.env.MSSQL_CONNECTION_STRING || process.env.DATABASE_URL);
        poolPromise = sql.connect(config).catch((error) => {
            poolPromise = undefined;
            throw error;
        });
    }
    return poolPromise;
}

async function initDatabase() {
    const pool = await getPool();
    const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
    await pool.request().batch(schema);
}

async function closePool() {
    if (!poolPromise) return;
    const pool = await poolPromise;
    poolPromise = undefined;
    await pool.close();
}

module.exports = { closePool, getPool, initDatabase, sql };
