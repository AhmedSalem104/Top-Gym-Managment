'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const branchService = require('./branch-service');
const { currentTenantId } = require('../tenancy/tenant-context');
const { normalizeBranchId, canAcceptNewOperations } = require('../branches/branch-contract');

const LOCATION_TYPES = new Set(['warehouse', 'store', 'bar']);
const TRANSFER_STATUSES = new Set(['draft', 'approved', 'in_transit', 'received', 'cancelled']);

function error(message, statusCode = 400, code = 'STOCK_LOCATION_ERROR') {
    const result = new Error(message);
    result.statusCode = statusCode;
    result.expose = true;
    result.code = code;
    return result;
}

function id(value, label = 'Identifier') {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 1) throw error(`${label} is invalid.`, 400, 'INVALID_ID');
    return normalized;
}

function quantity(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999999999) throw error('Quantity is invalid.', 400, 'INVALID_QUANTITY');
    return Math.round(parsed * 1000) / 1000;
}

function text(value, label, max, required = false) {
    const valueText = String(value ?? '').trim();
    if (required && !valueText) throw error(`${label} is required.`, 400, 'FIELD_REQUIRED');
    if (valueText.length > max) throw error(`${label} is too long.`, 400, 'FIELD_TOO_LONG');
    return valueText || null;
}

function hashIdempotency(value) {
    const normalized = String(value ?? '').trim();
    return normalized ? crypto.createHash('sha256').update(normalized).digest('hex') : null;
}

function mapLocation(row) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        branchId: Number(row.branch_id),
        branchName: row.branch_name || null,
        code: row.location_code,
        name: row.name,
        type: row.location_type,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapTransfer(row, items = []) {
    return {
        id: Number(row.id),
        tenantId: Number(row.tenant_id),
        fromLocationId: Number(row.from_location_id),
        toLocationId: Number(row.to_location_id),
        fromLocationName: row.from_location_name || null,
        toLocationName: row.to_location_name || null,
        status: row.status,
        notes: row.notes || null,
        createdAt: row.created_at,
        approvedAt: row.approved_at || null,
        receivedAt: row.received_at || null,
        items
    };
}

async function assertLocation(locationId, { actorUserId = null, role = null, requireActive = true } = {}) {
    const location = id(locationId, 'Stock location id');
    const tenantId = currentTenantId({ required: true });
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('locationId', sql.Int, location)
        .query(`SELECT TOP (1) location.*,branch.name AS branch_name,branch.status AS branch_status
                FROM dbo.gym_stock_locations AS location
                INNER JOIN dbo.gym_branches AS branch ON branch.id=location.branch_id AND branch.tenant_id=location.tenant_id
                WHERE location.tenant_id=@tenantId AND location.id=@locationId;`));
    const row = result.recordset[0];
    if (!row) throw error('Stock location was not found.', 404, 'STOCK_LOCATION_NOT_FOUND');
    if (requireActive && (!canAcceptNewOperations(row.status) || !canAcceptNewOperations(row.branch_status))) {
        throw error('This stock location is not active.', 409, 'STOCK_LOCATION_NOT_ACTIVE');
    }
    await branchService.assertBranchAccess(row.branch_id, { userId: actorUserId, role, requireActive });
    return row;
}

async function listLocations({ branchId = null, includeArchived = false, actorUserId = null, role = null } = {}) {
    const tenantId = currentTenantId({ required: true });
    if (branchId) await branchService.assertBranchAccess(branchId, { userId: actorUserId, role, requireActive: false });
    const result = await getPool().then((pool) => pool.request()
        .input('tenantId', sql.Int, tenantId)
        .input('branchId', sql.Int, branchId == null ? null : normalizeBranchId(branchId))
        .input('includeArchived', sql.Bit, includeArchived ? 1 : 0)
        .query(`SELECT location.*,branch.name AS branch_name
                FROM dbo.gym_stock_locations AS location
                INNER JOIN dbo.gym_branches AS branch ON branch.id=location.branch_id AND branch.tenant_id=location.tenant_id
                WHERE location.tenant_id=@tenantId
                  AND (@branchId IS NULL OR location.branch_id=@branchId)
                  AND (@includeArchived=1 OR location.status<>'archived')
                ORDER BY branch.is_main_branch DESC,branch.name,location.location_type,location.name,location.id;`));
    const allowed = await branchService.getAllowedBranches({ userId: actorUserId, role, includeArchived });
    const allowedIds = new Set(allowed.map((branch) => branch.id));
    return result.recordset.filter((row) => allowedIds.has(Number(row.branch_id))).map(mapLocation);
}

async function createLocation(body = {}, { actorUserId = null, role = null, request = null } = {}) {
    const branch = await branchService.assertBranchAccess(body.branchId, { userId: actorUserId, role, requireActive: true });
    if (String(role || '').toLowerCase() !== 'owner') throw error('Only the Gym Owner can manage stock locations.', 403, 'OWNER_REQUIRED');
    const code = text(body.code ?? body.locationCode, 'Location code', 40, true).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const name = text(body.name, 'Location name', 160, true);
    const type = String(body.type || 'warehouse').trim().toLowerCase();
    if (!LOCATION_TYPES.has(type)) throw error('Location type is invalid.', 400, 'INVALID_LOCATION_TYPE');
    const tenantId = currentTenantId({ required: true });
    let created;
    await withTransaction(async (transaction) => {
        const duplicate = await transaction.request().input('tenantId', sql.Int, tenantId).input('branchId', sql.Int, branch.id).input('code', sql.VarChar(40), code)
            .query('SELECT TOP (1) id FROM dbo.gym_stock_locations WHERE tenant_id=@tenantId AND branch_id=@branchId AND location_code=@code;');
        if (duplicate.recordset[0]) throw error('A stock location with this code already exists.', 409, 'LOCATION_CODE_EXISTS');
        const inserted = await transaction.request().input('tenantId', sql.Int, tenantId).input('branchId', sql.Int, branch.id).input('code', sql.VarChar(40), code).input('name', sql.NVarChar(160), name).input('type', sql.VarChar(20), type).input('actor', sql.Int, actorUserId || null)
            .query(`INSERT INTO dbo.gym_stock_locations(tenant_id,branch_id,location_code,name,location_type,created_by_user_id)
                    OUTPUT INSERTED.* VALUES (@tenantId,@branchId,@code,@name,@type,@actor);`);
        created = mapLocation({ ...inserted.recordset[0], branch_name: branch.name });
    });
    return created;
}

async function ensureBalance(transaction, { tenantId, locationId, variantId, lock = true }) {
    const lockHint = lock ? ' WITH (UPDLOCK,HOLDLOCK)' : '';
    const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('locationId', sql.Int, locationId).input('variantId', sql.Int, variantId)
        .query(`SELECT TOP (1) quantity_on_hand,average_cost
                FROM dbo.gym_store_location_inventory_balances${lockHint}
                WHERE tenant_id=@tenantId AND stock_location_id=@locationId AND variant_id=@variantId;`);
    return result.recordset[0] || { quantity_on_hand: 0, average_cost: 0 };
}

async function saveBalance(transaction, { tenantId, locationId, variantId, quantityOnHand, averageCost }) {
    const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('locationId', sql.Int, locationId).input('variantId', sql.Int, variantId)
        .input('quantity', sql.Decimal(12, 3), quantityOnHand).input('averageCost', sql.Decimal(12, 2), averageCost)
        .query(`UPDATE dbo.gym_store_location_inventory_balances
                SET quantity_on_hand=@quantity,average_cost=@averageCost,updated_at=SYSUTCDATETIME()
                WHERE tenant_id=@tenantId AND stock_location_id=@locationId AND variant_id=@variantId;
                IF @@ROWCOUNT=0
                    INSERT INTO dbo.gym_store_location_inventory_balances(tenant_id,stock_location_id,variant_id,quantity_on_hand,average_cost)
                    VALUES (@tenantId,@locationId,@variantId,@quantity,@averageCost);`);
    return result;
}

async function assertVariant(transaction, tenantId, variantId) {
    const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('variantId', sql.Int, variantId)
        .query(`SELECT TOP (1) variant.id,variant.purchase_cost,variant.is_active
                FROM dbo.gym_store_product_variants AS variant
                INNER JOIN dbo.gym_store_products AS product ON product.id=variant.product_id AND product.tenant_id=variant.tenant_id
                WHERE variant.id=@variantId AND variant.tenant_id=@tenantId;`);
    const row = result.recordset[0];
    if (!row || !row.is_active) throw error('Product variant is unavailable.', 409, 'VARIANT_UNAVAILABLE');
    return row;
}

async function writeMovement(transaction, { tenantId, locationId, branchId, variantId, type, input = 0, output = 0, previous, resulting, unitCost = null, referenceType, referenceId, actorUserId, notes }) {
    await transaction.request().input('tenantId', sql.Int, tenantId).input('locationId', sql.Int, locationId).input('branchId', sql.Int, branchId).input('variantId', sql.Int, variantId).input('type', sql.VarChar(30), type)
        .input('input', sql.Decimal(12, 3), input).input('output', sql.Decimal(12, 3), output).input('previous', sql.Decimal(12, 3), previous).input('resulting', sql.Decimal(12, 3), resulting)
        .input('unitCost', sql.Decimal(12, 2), unitCost).input('referenceType', sql.VarChar(30), referenceType || null).input('referenceId', sql.Int, referenceId || null).input('actor', sql.Int, actorUserId || null).input('notes', sql.NVarChar(1000), notes || null)
        .query(`INSERT INTO dbo.gym_store_stock_movements
                    (tenant_id,stock_location_id,branch_id,variant_id,movement_type,quantity_in,quantity_out,previous_quantity,resulting_quantity,unit_cost,reference_type,reference_id,created_by_user_id,notes)
                VALUES (@tenantId,@locationId,@branchId,@variantId,@type,@input,@output,@previous,@resulting,@unitCost,@referenceType,@referenceId,@actor,@notes);`);
}

async function adjustInventory({ locationId, variantId, quantity: change, reason = 'manual', actorUserId = null, role = null } = {}) {
    const location = await assertLocation(locationId, { actorUserId, role, requireActive: true });
    const variant = id(variantId, 'Variant id');
    const delta = Number(change);
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 999999999) throw error('Inventory change is invalid.', 400, 'INVALID_INVENTORY_CHANGE');
    let result;
    await withTransaction(async (transaction) => {
        const variantRow = await assertVariant(transaction, currentTenantId({ required: true }), variant);
        const current = await ensureBalance(transaction, { tenantId: currentTenantId({ required: true }), locationId: location.id, variantId: variant });
        const before = Number(current.quantity_on_hand || 0);
        const after = Math.round((before + delta) * 1000) / 1000;
        if (after < 0) throw error('Inventory cannot become negative.', 409, 'INSUFFICIENT_STOCK');
        await saveBalance(transaction, { tenantId: currentTenantId({ required: true }), locationId: location.id, variantId: variant, quantityOnHand: after, averageCost: Number(current.average_cost || variantRow.purchase_cost || 0) });
        await writeMovement(transaction, { tenantId: currentTenantId({ required: true }), locationId: location.id, branchId: location.branch_id, variantId: variant, type: delta > 0 ? 'adjustment' : 'manual', input: delta > 0 ? delta : 0, output: delta < 0 ? Math.abs(delta) : 0, previous: before, resulting: after, unitCost: Number(current.average_cost || variantRow.purchase_cost || 0), referenceType: 'inventory_adjustment', actorUserId, notes: reason });
        result = { locationId: location.id, variantId: variant, previousQuantity: before, quantityOnHand: after };
    });
    return result;
}

async function getTransfer(transferId, { includeItems = true } = {}) {
    const tenantId = currentTenantId({ required: true });
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('transferId', sql.Int, id(transferId, 'Transfer id'))
        .query(`SELECT TOP (1) transfer.*,from_location.name AS from_location_name,to_location.name AS to_location_name
                FROM dbo.gym_stock_transfers AS transfer
                INNER JOIN dbo.gym_stock_locations AS from_location ON from_location.id=transfer.from_location_id
                INNER JOIN dbo.gym_stock_locations AS to_location ON to_location.id=transfer.to_location_id
                WHERE transfer.tenant_id=@tenantId AND transfer.id=@transferId;`));
    const row = result.recordset[0];
    if (!row) throw error('Stock transfer was not found.', 404, 'TRANSFER_NOT_FOUND');
    const items = includeItems ? await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('transferId', sql.Int, Number(row.id)).query('SELECT id,variant_id,quantity,unit_cost FROM dbo.gym_stock_transfer_items WHERE tenant_id=@tenantId AND transfer_id=@transferId ORDER BY id;')) : { recordset: [] };
    return mapTransfer(row, items.recordset.map((item) => ({ id: Number(item.id), variantId: Number(item.variant_id), quantity: Number(item.quantity), unitCost: item.unit_cost == null ? null : Number(item.unit_cost) })));
}

async function createTransfer(body = {}, { actorUserId = null, role = null } = {}) {
    const from = await assertLocation(body.fromLocationId, { actorUserId, role, requireActive: true });
    const to = await assertLocation(body.toLocationId, { actorUserId, role, requireActive: true });
    if (from.id === to.id) throw error('Source and destination must be different.', 400, 'TRANSFER_SAME_LOCATION');
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!requestedItems.length) throw error('At least one transfer item is required.', 400, 'TRANSFER_ITEMS_REQUIRED');
    const items = requestedItems.map((item) => ({ variantId: id(item.variantId, 'Variant id'), quantity: quantity(item.quantity), unitCost: item.unitCost == null ? null : Number(item.unitCost) }));
    const tenantId = currentTenantId({ required: true });
    const keyHash = hashIdempotency(body.idempotencyKey);
    let transferId;
    await withTransaction(async (transaction) => {
        if (keyHash) {
            const existing = await transaction.request().input('tenantId', sql.Int, tenantId).input('keyHash', sql.Char(64), keyHash).query('SELECT TOP (1) id FROM dbo.gym_stock_transfers WHERE tenant_id=@tenantId AND idempotency_key_hash=@keyHash;');
            if (existing.recordset[0]) { transferId = Number(existing.recordset[0].id); return; }
        }
        const inserted = await transaction.request().input('tenantId', sql.Int, tenantId).input('from', sql.Int, from.id).input('to', sql.Int, to.id).input('keyHash', sql.Char(64), keyHash).input('notes', sql.NVarChar(1000), text(body.notes, 'Notes', 1000)).input('actor', sql.Int, actorUserId || null)
            .query(`INSERT INTO dbo.gym_stock_transfers(tenant_id,from_location_id,to_location_id,idempotency_key_hash,notes,created_by_user_id)
                    OUTPUT INSERTED.id VALUES (@tenantId,@from,@to,@keyHash,@notes,@actor);`);
        transferId = Number(inserted.recordset[0].id);
        for (const item of items) await transaction.request().input('tenantId', sql.Int, tenantId).input('transferId', sql.Int, transferId).input('variantId', sql.Int, item.variantId).input('quantity', sql.Decimal(12, 3), item.quantity).input('unitCost', sql.Decimal(12, 2), Number.isFinite(item.unitCost) ? item.unitCost : null)
            .query('INSERT INTO dbo.gym_stock_transfer_items(tenant_id,transfer_id,variant_id,quantity,unit_cost) VALUES (@tenantId,@transferId,@variantId,@quantity,@unitCost);');
    });
    return getTransfer(transferId);
}

async function approveTransfer(transferId, { actorUserId = null, role = null } = {}) {
    const tenantId = currentTenantId({ required: true });
    let result;
    await withTransaction(async (transaction) => {
        const transferResult = await transaction.request().input('tenantId', sql.Int, tenantId).input('transferId', sql.Int, id(transferId, 'Transfer id')).query(`SELECT TOP (1) * FROM dbo.gym_stock_transfers WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND id=@transferId;`);
        const transfer = transferResult.recordset[0];
        if (!transfer) throw error('Stock transfer was not found.', 404, 'TRANSFER_NOT_FOUND');
        const fromLocation = await assertLocation(transfer.from_location_id, { actorUserId, role, requireActive: true });
        await assertLocation(transfer.to_location_id, { actorUserId, role, requireActive: true });
        if (transfer.status !== 'draft') return;
        const items = await transaction.request().input('tenantId', sql.Int, tenantId).input('transferId', sql.Int, Number(transfer.id)).query('SELECT * FROM dbo.gym_stock_transfer_items WHERE tenant_id=@tenantId AND transfer_id=@transferId ORDER BY id;');
        for (const item of items.recordset) {
            const variant = await assertVariant(transaction, tenantId, Number(item.variant_id));
            const current = await ensureBalance(transaction, { tenantId, locationId: Number(transfer.from_location_id), variantId: Number(item.variant_id) });
            const before = Number(current.quantity_on_hand || 0);
            const after = Math.round((before - Number(item.quantity)) * 1000) / 1000;
            if (after < 0) throw error('Insufficient stock for this transfer.', 409, 'INSUFFICIENT_STOCK');
            const cost = item.unit_cost == null ? Number(current.average_cost || variant.purchase_cost || 0) : Number(item.unit_cost);
            await saveBalance(transaction, { tenantId, locationId: Number(transfer.from_location_id), variantId: Number(item.variant_id), quantityOnHand: after, averageCost: cost });
            await writeMovement(transaction, { tenantId, locationId: Number(transfer.from_location_id), branchId: Number(fromLocation.branch_id), variantId: Number(item.variant_id), type: 'transfer_out', output: Number(item.quantity), previous: before, resulting: after, unitCost: cost, referenceType: 'stock_transfer', referenceId: Number(transfer.id), actorUserId, notes: 'Transfer approved.' });
        }
        await transaction.request().input('tenantId', sql.Int, tenantId).input('transferId', sql.Int, Number(transfer.id)).input('actor', sql.Int, actorUserId || null).query("UPDATE dbo.gym_stock_transfers SET status='in_transit',approved_by_user_id=@actor,approved_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@transferId;");
        result = true;
    });
    return getTransfer(transferId);
}

async function receiveTransfer(transferId, { actorUserId = null, role = null } = {}) {
    const tenantId = currentTenantId({ required: true });
    await withTransaction(async (transaction) => {
        const transferResult = await transaction.request().input('tenantId', sql.Int, tenantId).input('transferId', sql.Int, id(transferId, 'Transfer id')).query('SELECT TOP (1) * FROM dbo.gym_stock_transfers WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND id=@transferId;');
        const transfer = transferResult.recordset[0];
        if (!transfer) throw error('Stock transfer was not found.', 404, 'TRANSFER_NOT_FOUND');
        const toLocation = await assertLocation(transfer.to_location_id, { actorUserId, role, requireActive: true });
        if (transfer.status === 'received') return;
        if (transfer.status !== 'in_transit') throw error('Only an in-transit transfer can be received.', 409, 'TRANSFER_NOT_IN_TRANSIT');
        const items = await transaction.request().input('tenantId', sql.Int, tenantId).input('transferId', sql.Int, Number(transfer.id)).query('SELECT * FROM dbo.gym_stock_transfer_items WHERE tenant_id=@tenantId AND transfer_id=@transferId ORDER BY id;');
        for (const item of items.recordset) {
            const variant = await assertVariant(transaction, tenantId, Number(item.variant_id));
            const current = await ensureBalance(transaction, { tenantId, locationId: Number(transfer.to_location_id), variantId: Number(item.variant_id) });
            const before = Number(current.quantity_on_hand || 0);
            const incoming = Number(item.quantity);
            const after = Math.round((before + incoming) * 1000) / 1000;
            const cost = item.unit_cost == null ? Number(current.average_cost || variant.purchase_cost || 0) : Number(item.unit_cost);
            await saveBalance(transaction, { tenantId, locationId: Number(transfer.to_location_id), variantId: Number(item.variant_id), quantityOnHand: after, averageCost: cost });
            await writeMovement(transaction, { tenantId, locationId: Number(transfer.to_location_id), branchId: Number(toLocation.branch_id), variantId: Number(item.variant_id), type: 'transfer_in', input: incoming, previous: before, resulting: after, unitCost: cost, referenceType: 'stock_transfer_receipt', referenceId: Number(transfer.id), actorUserId, notes: 'Transfer received.' });
        }
        await transaction.request().input('tenantId', sql.Int, tenantId).input('transferId', sql.Int, Number(transfer.id)).input('actor', sql.Int, actorUserId || null).query("UPDATE dbo.gym_stock_transfers SET status='received',received_by_user_id=@actor,received_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@transferId;");
    });
    return getTransfer(transferId);
}

async function listTransfers({ status = '', actorUserId = null, role = null } = {}) {
    const tenantId = currentTenantId({ required: true });
    const normalizedStatus = TRANSFER_STATUSES.has(String(status).toLowerCase()) ? String(status).toLowerCase() : '';
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('status', sql.VarChar(20), normalizedStatus || null).query(`SELECT transfer.*,from_location.name AS from_location_name,to_location.name AS to_location_name
        FROM dbo.gym_stock_transfers AS transfer
        INNER JOIN dbo.gym_stock_locations AS from_location ON from_location.id=transfer.from_location_id
        INNER JOIN dbo.gym_stock_locations AS to_location ON to_location.id=transfer.to_location_id
        WHERE transfer.tenant_id=@tenantId AND (@status IS NULL OR transfer.status=@status)
        ORDER BY transfer.created_at DESC,transfer.id DESC;`));
    const branches = await branchService.getAllowedBranches({ userId: actorUserId, role, includeArchived: true });
    const allowed = new Set(branches.map((branch) => branch.id));
    const locations = await listLocations({ includeArchived: true, actorUserId, role });
    const locationMap = new Map(locations.map((location) => [location.id, location.branchId]));
    return result.recordset.filter((row) => allowed.has(locationMap.get(Number(row.from_location_id))) && allowed.has(locationMap.get(Number(row.to_location_id)))).map((row) => mapTransfer(row));
}

module.exports = {
    adjustInventory,
    approveTransfer,
    assertLocation,
    assertVariant,
    createLocation,
    createTransfer,
    getTransfer,
    listLocations,
    listTransfers,
    receiveTransfer,
    ensureBalance,
    saveBalance,
    writeMovement
};
