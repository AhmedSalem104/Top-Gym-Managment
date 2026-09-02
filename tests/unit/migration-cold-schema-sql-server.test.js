'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..', '..');
const readMigration = (name) => fs.readFileSync(path.join(root, 'database', 'migrations', name), 'utf8');

test('cold-schema migrations defer filtered indexes that depend on newly created objects', () => {
    const stock = readMigration('023-stock-locations-and-transfers.sql');
    const stockIndex = stock.indexOf("UX_gym_stock_transfers_idempotency");
    assert.ok(stockIndex >= 0);
    assert.match(stock.slice(stockIndex - 120, stockIndex + 500), /sp_executesql/i);
    assert.match(stock.slice(stockIndex), /idempotency_key_hash\s+IS\s+NOT\s+NULL/i);

    const bar = readMigration('024-bar-pos-recipes.sql');
    const salesIndex = bar.indexOf("UX_gym_store_sales_idempotency");
    assert.ok(salesIndex >= 0);
    assert.match(bar.slice(0, salesIndex), /EXEC\s+sys\.sp_executesql\s+N'\s*IF NOT EXISTS[\s\S]*$/i);
    assert.match(bar.slice(salesIndex), /idempotency_key_hash\s+IS\s+NOT\s+NULL/i);
});
