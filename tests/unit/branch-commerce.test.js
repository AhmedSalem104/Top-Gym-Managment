'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('new branches bootstrap Commerce configuration and deterministic stock locations', () => {
    const source = read('src/services/branch-service.js');
    assert.match(source, /ensureBranchCommerceDefaults/);
    assert.match(source, /location_code='main-store'/);
    assert.match(source, /location_code='main-bar'/);
    assert.match(source, /storeEnabled = booleanValue\(body\.storeEnabled, true\)/);
    assert.match(source, /barEnabled = booleanValue\(body\.barEnabled, false\)/);
});

test('Bar sales stay on shared Store commerce tables and are idempotent', () => {
    const source = read('src/services/bar-service.js');
    assert.match(source, /gym_store_sales/);
    assert.match(source, /gym_store_sale_payments/);
    assert.match(source, /idempotency_key_hash/);
    assert.match(source, /replayed = true/);
    assert.match(source, /idempotent: replayed/);
    assert.match(source, /await saasService\.recordAudit/);
});

test('Bar schema prevents negative inventory and duplicate open shifts', () => {
    const migration = read('database/migrations/024-bar-pos-recipes.sql');
    const locationMigration = read('database/migrations/023-stock-locations-and-transfers.sql');
    assert.match(locationMigration, /CK_gym_store_location_inventory_quantity/);
    assert.match(migration, /UX_gym_pos_shifts_open/);
    assert.match(migration, /UX_gym_store_sales_idempotency/);
    assert.ok(
        /sales_channel IN \('store', 'bar'\)/.test(migration)
        || /sales_channel IN \(''store'', ''bar''\)/.test(migration),
        'sales channel constraint preserves the store/bar domain inside or outside dynamic SQL'
    );
});

test('branch plan limits are additive and constrained', () => {
    const migration = read('database/migrations/026-branch-plan-limits.sql');
    assert.match(migration, /max_branches/);
    assert.match(migration, /CK_saas_plans_max_branches/);
    assert.match(migration, /WHERE p\.max_branches IS NULL/);
});

test('Bar POS is loaded as a Store feature and exposes a touch-safe surface', () => {
    const loader = read('public/js/feature-loader.js');
    const page = read('public/index.html');
    const script = read('public/js/pages/store/bar-pos.js');
    const styles = read('public/css/components/bar-pos.css');
    assert.match(loader, /pages\/store\/bar-pos\.js\?v=1/);
    assert.match(page, /data-store-view="bar"/);
    assert.match(page, /id="barPosView"/);
    assert.match(script, /\/api\/bar\/menu/);
    assert.match(script, /\/api\/bar\/sales/);
    assert.match(styles, /@media \(max-width: 900px\)/);
    assert.match(styles, /@media \(max-width: 560px\)/);
});
