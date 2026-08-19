'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { closePool, getPool, sql } = require('./pool');

async function initDatabase() {
    const pool = await getPool();
    const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
    await pool.request().batch(schema);
}

module.exports = { closePool, getPool, initDatabase, sql };
