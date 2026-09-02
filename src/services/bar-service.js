'use strict';

const crypto = require('node:crypto');
const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const branchService = require('./branch-service');
const stockLocationService = require('./stock-location-service');
const saasService = require('./saas-service');
const { currentTenantId } = require('../tenancy/tenant-context');

const PAYMENT_METHODS = new Set(['cash', 'card', 'transfer', 'wallet', 'other']);
const WASTE_TYPES = new Set(['expired', 'damaged', 'spillage', 'preparation_error', 'other']);

function barError(message, statusCode = 400, code = 'BAR_ERROR') {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    error.code = code;
    return error;
}

function id(value, label = 'Identifier') {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) throw barError(`${label} is invalid.`, 400, 'INVALID_ID');
    return parsed;
}

function quantity(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999999999) throw barError('Quantity is invalid.', 400, 'INVALID_QUANTITY');
    return Math.round(parsed * 1000) / 1000;
}

function money(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999999999) throw barError('Amount is invalid.', 400, 'INVALID_AMOUNT');
    return Math.round(parsed * 100) / 100;
}

function text(value, label, max, required = false) {
    const normalized = String(value ?? '').trim();
    if (required && !normalized) throw barError(`${label} is required.`, 400, 'FIELD_REQUIRED');
    if (normalized.length > max) throw barError(`${label} is too long.`, 400, 'FIELD_TOO_LONG');
    return normalized || null;
}

function hashKey(value) {
    const normalized = String(value ?? '').trim();
    return normalized ? crypto.createHash('sha256').update(normalized).digest('hex') : null;
}

async function assertBarLocation(locationId, options = {}) {
    const location = await stockLocationService.assertLocation(locationId, options);
    if (location.location_type !== 'bar') throw barError('This stock location is not configured for Bar operations.', 409, 'BAR_LOCATION_REQUIRED');
    const config = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, currentTenantId({ required: true })).input('branchId', sql.Int, Number(location.branch_id)).query('SELECT TOP (1) bar_enabled FROM dbo.gym_branch_commerce_config WHERE tenant_id=@tenantId AND branch_id=@branchId;'));
    if (!config.recordset[0] || !config.recordset[0].bar_enabled) throw barError('Bar sales are disabled for this branch.', 403, 'BAR_DISABLED');
    return location;
}

async function loadVariant(connection, tenantId, variantId) {
    const result = await connection.request().input('tenantId', sql.Int, tenantId).input('variantId', sql.Int, id(variantId, 'Variant id')).query(`
        SELECT TOP (1) variant.id,variant.variant_name,variant.sku,variant.purchase_cost,variant.selling_price,variant.discount_price,
               product.name_ar AS product_name,product.track_inventory,variant.is_active,product.is_active AS product_active
        FROM dbo.gym_store_product_variants AS variant
        INNER JOIN dbo.gym_store_products AS product ON product.id=variant.product_id AND product.tenant_id=variant.tenant_id
        WHERE variant.tenant_id=@tenantId AND variant.id=@variantId;`);
    const row = result.recordset[0];
    if (!row || !row.is_active || !row.product_active) throw barError('The selected Bar item is unavailable.', 409, 'BAR_ITEM_UNAVAILABLE');
    return row;
}

async function loadRecipe(connection, tenantId, recipeId) {
    const recipeResult = await connection.request().input('tenantId', sql.Int, tenantId).input('recipeId', sql.Int, id(recipeId, 'Recipe id')).query('SELECT TOP (1) * FROM dbo.gym_bar_recipes WHERE tenant_id=@tenantId AND id=@recipeId AND is_active=1;');
    const recipe = recipeResult.recordset[0];
    if (!recipe) throw barError('Recipe was not found or is inactive.', 404, 'RECIPE_NOT_FOUND');
    const items = await connection.request().input('tenantId', sql.Int, tenantId).input('recipeId', sql.Int, Number(recipe.id)).query(`
        SELECT item.ingredient_variant_id,item.quantity,item.unit_code,ingredient.purchase_cost AS ingredient_purchase_cost
        FROM dbo.gym_bar_recipe_items AS item
        INNER JOIN dbo.gym_store_product_variants AS ingredient ON ingredient.id=item.ingredient_variant_id AND ingredient.tenant_id=item.tenant_id
        WHERE item.tenant_id=@tenantId AND item.recipe_id=@recipeId ORDER BY item.id;`);
    if (!items.recordset.length) throw barError('Recipe has no ingredients.', 409, 'RECIPE_EMPTY');
    return { ...recipe, items: items.recordset.map((item) => ({ variantId: Number(item.ingredient_variant_id), quantity: Number(item.quantity), unitCode: item.unit_code, purchaseCost: Number(item.ingredient_purchase_cost || 0) })) };
}

async function listRecipes() {
    const tenantId = currentTenantId({ required: true });
    const pool = await getPool();
    const result = await pool.request().input('tenantId', sql.Int, tenantId).query(`SELECT recipe.*,variant.variant_name,variant.sku,product.name_ar AS product_name
        FROM dbo.gym_bar_recipes AS recipe
        INNER JOIN dbo.gym_store_product_variants AS variant ON variant.id=recipe.sellable_variant_id AND variant.tenant_id=recipe.tenant_id
        INNER JOIN dbo.gym_store_products AS product ON product.id=variant.product_id AND product.tenant_id=variant.tenant_id
        WHERE recipe.tenant_id=@tenantId ORDER BY recipe.name,recipe.id;`);
    const rows = [];
    for (const row of result.recordset) {
        const items = await pool.request().input('tenantId', sql.Int, tenantId).input('recipeId', sql.Int, Number(row.id)).query('SELECT ingredient_variant_id,quantity,unit_code FROM dbo.gym_bar_recipe_items WHERE tenant_id=@tenantId AND recipe_id=@recipeId ORDER BY id;');
        rows.push({ id: Number(row.id), code: row.recipe_code, name: row.name, sellableVariantId: Number(row.sellable_variant_id), sellableName: row.product_name ? `${row.product_name} - ${row.variant_name}` : row.variant_name, active: Boolean(row.is_active), items: items.recordset.map((item) => ({ variantId: Number(item.ingredient_variant_id), quantity: Number(item.quantity), unit: item.unit_code })) });
    }
    return rows;
}

async function createRecipe(body = {}, { actorUserId = null, role = null } = {}) {
    if (String(role || '').toLowerCase() !== 'owner') throw barError('Only the Gym Owner can manage Bar recipes.', 403, 'OWNER_REQUIRED');
    const tenantId = currentTenantId({ required: true });
    const code = text(body.code, 'Recipe code', 60, true).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const name = text(body.name, 'Recipe name', 180, true);
    const sellableVariantId = id(body.sellableVariantId, 'Sellable variant id');
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!requestedItems.length) throw barError('At least one recipe ingredient is required.', 400, 'RECIPE_ITEMS_REQUIRED');
    const items = requestedItems.map((item) => ({ variantId: id(item.variantId, 'Ingredient variant id'), quantity: quantity(item.quantity), unit: String(item.unit || 'piece').toLowerCase() }));
    const validUnits = new Set(['piece', 'gram', 'kilogram', 'milliliter', 'liter', 'serving']);
    if (items.some((item) => !validUnits.has(item.unit))) throw barError('Recipe unit is invalid.', 400, 'RECIPE_UNIT_INVALID');
    let recipeId;
    await withTransaction(async (transaction) => {
        await loadVariant(transaction, tenantId, sellableVariantId);
        for (const item of items) await loadVariant(transaction, tenantId, item.variantId);
        const duplicate = await transaction.request().input('tenantId', sql.Int, tenantId).input('code', sql.VarChar(60), code).query('SELECT TOP (1) id FROM dbo.gym_bar_recipes WHERE tenant_id=@tenantId AND recipe_code=@code;');
        if (duplicate.recordset[0]) throw barError('Recipe code already exists.', 409, 'RECIPE_CODE_EXISTS');
        const inserted = await transaction.request().input('tenantId', sql.Int, tenantId).input('variantId', sql.Int, sellableVariantId).input('code', sql.VarChar(60), code).input('name', sql.NVarChar(180), name).input('actor', sql.Int, actorUserId || null).query('INSERT INTO dbo.gym_bar_recipes(tenant_id,sellable_variant_id,recipe_code,name,created_by_user_id) OUTPUT INSERTED.id VALUES (@tenantId,@variantId,@code,@name,@actor);');
        recipeId = Number(inserted.recordset[0].id);
        for (const item of items) await transaction.request().input('tenantId', sql.Int, tenantId).input('recipeId', sql.Int, recipeId).input('variantId', sql.Int, item.variantId).input('quantity', sql.Decimal(12, 3), item.quantity).input('unit', sql.VarChar(20), item.unit).query('INSERT INTO dbo.gym_bar_recipe_items(tenant_id,recipe_id,ingredient_variant_id,quantity,unit_code) VALUES (@tenantId,@recipeId,@variantId,@quantity,@unit);');
    });
    return (await listRecipes()).find((recipe) => recipe.id === recipeId);
}

async function listModifiers() {
    const tenantId = currentTenantId({ required: true });
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).query('SELECT id,name,price_delta,ingredient_variant_id,ingredient_quantity,is_active FROM dbo.gym_bar_modifiers WHERE tenant_id=@tenantId ORDER BY name,id;'));
    return result.recordset.map((row) => ({ id: Number(row.id), name: row.name, priceDelta: Number(row.price_delta || 0), ingredientVariantId: row.ingredient_variant_id ? Number(row.ingredient_variant_id) : null, ingredientQuantity: row.ingredient_quantity == null ? null : Number(row.ingredient_quantity), active: Boolean(row.is_active) }));
}

async function createModifier(body = {}, { actorUserId = null, role = null } = {}) {
    if (String(role || '').toLowerCase() !== 'owner') throw barError('Only the Gym Owner can manage Bar modifiers.', 403, 'OWNER_REQUIRED');
    const name = text(body.name, 'Modifier name', 120, true);
    const priceDelta = money(body.priceDelta || 0);
    const ingredientVariantId = body.ingredientVariantId == null ? null : id(body.ingredientVariantId, 'Ingredient variant id');
    const ingredientQuantity = ingredientVariantId == null ? null : quantity(body.ingredientQuantity);
    const tenantId = currentTenantId({ required: true });
    if (ingredientVariantId) await loadVariant(await getPool(), tenantId, ingredientVariantId);
    await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('name', sql.NVarChar(120), name).input('priceDelta', sql.Decimal(12, 2), priceDelta).input('variantId', sql.Int, ingredientVariantId).input('quantity', sql.Decimal(12, 3), ingredientQuantity).input('actor', sql.Int, actorUserId || null).query('INSERT INTO dbo.gym_bar_modifiers(tenant_id,name,price_delta,ingredient_variant_id,ingredient_quantity,created_by_user_id) VALUES (@tenantId,@name,@priceDelta,@variantId,@quantity,@actor);'));
    return (await listModifiers()).at(-1);
}

async function listMenu({ locationId, actorUserId = null, role = null } = {}) {
    const location = await assertBarLocation(locationId, { actorUserId, role, requireActive: true });
    const tenantId = currentTenantId({ required: true });
    const pool = await getPool();
    const variants = await pool.request().input('tenantId', sql.Int, tenantId).query(`SELECT variant.id,variant.variant_name,variant.sku,variant.selling_price,variant.discount_price,variant.purchase_cost,variant.track_inventory,product.name_ar AS product_name,product.track_inventory AS product_track_inventory
        FROM dbo.gym_store_product_variants AS variant INNER JOIN dbo.gym_store_products AS product ON product.id=variant.product_id AND product.tenant_id=variant.tenant_id
        WHERE variant.tenant_id=@tenantId AND variant.is_active=1 AND product.is_active=1 ORDER BY product.name_ar,variant.variant_name,variant.id;`);
    const recipes = await listRecipes();
    const recipeByVariant = new Map(recipes.filter((recipe) => recipe.active).map((recipe) => [recipe.sellableVariantId, recipe]));
    const balances = await pool.request().input('tenantId', sql.Int, tenantId).input('locationId', sql.Int, location.id).query('SELECT variant_id,quantity_on_hand FROM dbo.gym_store_location_inventory_balances WHERE tenant_id=@tenantId AND stock_location_id=@locationId;');
    const balanceMap = new Map(balances.recordset.map((row) => [Number(row.variant_id), Number(row.quantity_on_hand || 0)]));
    const modifiers = await listModifiers();
    return {
        branchId: Number(location.branch_id),
        locationId: location.id,
        items: variants.recordset.map((row) => {
            const recipe = recipeByVariant.get(Number(row.id));
            const available = recipe
                ? recipe.items.every((item) => balanceMap.get(item.variantId) >= item.quantity)
                : (!Boolean(row.track_inventory ?? row.product_track_inventory) || balanceMap.get(Number(row.id)) > 0);
            return { variantId: Number(row.id), sku: row.sku, name: row.product_name, variantName: row.variant_name, price: Number(row.discount_price ?? row.selling_price), available, recipeId: recipe?.id || null };
        }),
        modifiers
    };
}

async function getOpenShift(branchId, { actorUserId = null, role = null } = {}) {
    const branch = await branchService.assertBranchAccess(branchId, { userId: actorUserId, role, requireActive: true });
    const tenantId = currentTenantId({ required: true });
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('branchId', sql.Int, branch.id).query("SELECT TOP (1) * FROM dbo.gym_pos_shifts WHERE tenant_id=@tenantId AND branch_id=@branchId AND channel='bar' AND status='open' ORDER BY id DESC;"));
    return result.recordset[0] ? mapShift(result.recordset[0]) : null;
}

function mapShift(row) {
    return { id: Number(row.id), branchId: Number(row.branch_id), locationId: row.stock_location_id ? Number(row.stock_location_id) : null, channel: row.channel, status: row.status, openingCash: Number(row.opening_cash || 0), closingCash: row.closing_cash == null ? null : Number(row.closing_cash), expectedCash: row.expected_cash == null ? null : Number(row.expected_cash), difference: row.difference_amount == null ? null : Number(row.difference_amount), openedAt: row.opened_at, closedAt: row.closed_at || null };
}

async function openShift(body = {}, { actorUserId = null, role = null } = {}) {
    const location = await assertBarLocation(body.locationId, { actorUserId, role, requireActive: true });
    const openingCash = money(body.openingCash || 0);
    const tenantId = currentTenantId({ required: true });
    const existing = await getOpenShift(location.branch_id, { actorUserId, role });
    if (existing) throw barError('A Bar shift is already open for this branch.', 409, 'SHIFT_ALREADY_OPEN');
    const result = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('branchId', sql.Int, location.branch_id).input('locationId', sql.Int, location.id).input('cash', sql.Decimal(12, 2), openingCash).input('actor', sql.Int, actorUserId || null).query("INSERT INTO dbo.gym_pos_shifts(tenant_id,branch_id,stock_location_id,channel,opening_cash,opened_by_user_id) OUTPUT INSERTED.* VALUES (@tenantId,@branchId,@locationId,'bar',@cash,@actor);"));
    return mapShift(result.recordset[0]);
}

async function closeShift(shiftId, body = {}, { actorUserId = null, role = null } = {}) {
    const tenantId = currentTenantId({ required: true });
    let closed;
    await withTransaction(async (transaction) => {
        const shiftResult = await transaction.request().input('tenantId', sql.Int, tenantId).input('shiftId', sql.Int, id(shiftId, 'Shift id')).query("SELECT TOP (1) * FROM dbo.gym_pos_shifts WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND id=@shiftId AND channel='bar';");
        const shift = shiftResult.recordset[0];
        if (!shift) throw barError('Bar shift was not found.', 404, 'SHIFT_NOT_FOUND');
        await branchService.assertBranchAccess(shift.branch_id, { userId: actorUserId, role, requireActive: false });
        if (shift.status !== 'open') throw barError('This shift is already closed.', 409, 'SHIFT_NOT_OPEN');
        const totals = await transaction.request().input('tenantId', sql.Int, tenantId).input('shiftId', sql.Int, Number(shift.id)).query("SELECT ISNULL(SUM(CASE WHEN payment_method='cash' THEN paid_amount ELSE 0 END),0) AS cash_sales FROM dbo.gym_store_sales WHERE tenant_id=@tenantId AND pos_shift_id=@shiftId AND status='completed';");
        const expectedCash = Math.round((Number(shift.opening_cash || 0) + Number(totals.recordset[0]?.cash_sales || 0)) * 100) / 100;
        const actualCash = money(body.closingCash);
        const difference = Math.round((actualCash - expectedCash) * 100) / 100;
        const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('shiftId', sql.Int, Number(shift.id)).input('closingCash', sql.Decimal(12, 2), actualCash).input('expectedCash', sql.Decimal(12, 2), expectedCash).input('difference', sql.Decimal(12, 2), difference).input('actor', sql.Int, actorUserId || null).query("UPDATE dbo.gym_pos_shifts SET status='closed',closing_cash=@closingCash,expected_cash=@expectedCash,difference_amount=@difference,closed_by_user_id=@actor,closed_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId AND id=@shiftId OUTPUT INSERTED.*;");
        closed = mapShift(result.recordset[0]);
    });
    return closed;
}

async function createSale(body = {}, { actorUserId = null, role = null } = {}) {
    const location = await assertBarLocation(body.locationId, { actorUserId, role, requireActive: true });
    const tenantId = currentTenantId({ required: true });
    const requestedItems = Array.isArray(body.items) ? body.items : [];
    if (!requestedItems.length) throw barError('At least one Bar item is required.', 400, 'BAR_ITEMS_REQUIRED');
    const keyHash = hashKey(body.idempotencyKey);
    let saleId;
    let replayed = false;
    await withTransaction(async (transaction) => {
        if (keyHash) {
            const replay = await transaction.request().input('tenantId', sql.Int, tenantId).input('keyHash', sql.Char(64), keyHash).query('SELECT TOP (1) id FROM dbo.gym_store_sales WHERE tenant_id=@tenantId AND idempotency_key_hash=@keyHash;');
            if (replay.recordset[0]) { saleId = Number(replay.recordset[0].id); replayed = true; return; }
        }
        let shiftId = body.shiftId == null ? null : id(body.shiftId, 'Shift id');
        if (shiftId == null) {
            const open = await transaction.request().input('tenantId', sql.Int, tenantId).input('branchId', sql.Int, location.branch_id).query("SELECT TOP (1) id FROM dbo.gym_pos_shifts WITH (UPDLOCK,HOLDLOCK) WHERE tenant_id=@tenantId AND branch_id=@branchId AND stock_location_id=" + Number(location.id) + " AND channel='bar' AND status='open' ORDER BY id DESC;");
            shiftId = open.recordset[0] ? Number(open.recordset[0].id) : null;
        }
        if (shiftId == null) throw barError('Open a Bar shift before accepting a sale.', 409, 'SHIFT_REQUIRED');
        const shift = await transaction.request().input('tenantId', sql.Int, tenantId).input('shiftId', sql.Int, shiftId).query("SELECT TOP (1) id FROM dbo.gym_pos_shifts WHERE tenant_id=@tenantId AND id=@shiftId AND branch_id=" + Number(location.branch_id) + " AND stock_location_id=" + Number(location.id) + " AND channel='bar' AND status='open';");
        if (!shift.recordset[0]) throw barError('The selected Bar shift is not open for this location.', 409, 'SHIFT_INVALID');
        const requirements = new Map();
        const resolvedItems = [];
        for (const requested of requestedItems) {
            const variantId = id(requested.variantId, 'Variant id');
            const variant = await loadVariant(transaction, tenantId, variantId);
            const lineQuantity = quantity(requested.quantity);
            const recipe = requested.recipeId == null ? null : await loadRecipe(transaction, tenantId, requested.recipeId);
            if (recipe && Number(recipe.sellable_variant_id) !== variantId) throw barError('Recipe does not belong to the selected sellable item.', 400, 'RECIPE_VARIANT_MISMATCH');
            const modifierIds = [...new Set((Array.isArray(requested.modifierIds) ? requested.modifierIds : []).map((value) => id(value, 'Modifier id')))];
            const modifiers = [];
            for (const modifierId of modifierIds) {
                const result = await transaction.request().input('tenantId', sql.Int, tenantId).input('modifierId', sql.Int, modifierId).query('SELECT TOP (1) * FROM dbo.gym_bar_modifiers WHERE tenant_id=@tenantId AND id=@modifierId AND is_active=1;');
                const modifier = result.recordset[0];
                if (!modifier) throw barError('A selected Bar modifier is unavailable.', 409, 'MODIFIER_UNAVAILABLE');
                modifiers.push(modifier);
                if (modifier.ingredient_variant_id) requirements.set(Number(modifier.ingredient_variant_id), (requirements.get(Number(modifier.ingredient_variant_id)) || 0) + Number(modifier.ingredient_quantity) * lineQuantity);
            }
            if (recipe) for (const ingredient of recipe.items) requirements.set(ingredient.variantId, (requirements.get(ingredient.variantId) || 0) + ingredient.quantity * lineQuantity);
            else if (Boolean(variant.track_inventory)) requirements.set(variantId, (requirements.get(variantId) || 0) + lineQuantity);
            const unitPrice = Math.round((Number(variant.discount_price ?? variant.selling_price) + modifiers.reduce((sum, modifier) => sum + Number(modifier.price_delta || 0), 0)) * 100) / 100;
            resolvedItems.push({ variant, variantId, lineQuantity, recipe, modifiers, unitPrice, lineTotal: Math.round(unitPrice * lineQuantity * 100) / 100 });
        }
        let subtotal = Math.round(resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
        const discount = money(body.discountAmount || 0);
        if (discount > subtotal) throw barError('Discount cannot exceed the subtotal.', 400, 'DISCOUNT_INVALID');
        const total = Math.round((subtotal - discount) * 100) / 100;
        const paid = body.paidAmount == null ? total : money(body.paidAmount);
        if (paid !== total) throw barError('Bar sales must be paid in full.', 400, 'BAR_PAYMENT_INCOMPLETE');
        const method = String(body.paymentMethod || 'cash').toLowerCase();
        if (!PAYMENT_METHODS.has(method)) throw barError('Payment method is invalid.', 400, 'PAYMENT_METHOD_INVALID');
        const consumptionSnapshots = new Map();
        for (const [variantId, required] of requirements) {
            const current = await stockLocationService.ensureBalance(transaction, { tenantId, locationId: location.id, variantId });
            const before = Number(current.quantity_on_hand || 0);
            const after = Math.round((before - required) * 1000) / 1000;
            if (after < 0) throw barError('One or more Bar ingredients are unavailable.', 409, 'INSUFFICIENT_STOCK');
            await stockLocationService.saveBalance(transaction, { tenantId, locationId: location.id, variantId, quantityOnHand: after, averageCost: Number(current.average_cost || 0) });
            consumptionSnapshots.set(variantId, { before, after, averageCost: Number(current.average_cost || 0) });
        }
        const memberId = body.memberId == null ? null : id(body.memberId, 'Member id');
        if (memberId != null) {
            const member = await transaction.request().input('tenantId', sql.Int, tenantId).input('memberId', sql.Int, memberId)
                .query('SELECT TOP (1) id FROM dbo.members WHERE tenant_id=@tenantId AND id=@memberId;');
            if (!member.recordset[0]) throw barError('The selected member does not belong to this Gym.', 404, 'MEMBER_NOT_FOUND');
        }
        const saleNumber = `BAR-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const customerName = text(body.customerName, 'Customer name', 160) || 'Guest';
        const inserted = await transaction.request().input('tenantId', sql.Int, tenantId).input('saleNumber', sql.VarChar(50), saleNumber).input('memberId', sql.Int, memberId).input('name', sql.NVarChar(160), customerName).input('subtotal', sql.Decimal(12, 2), subtotal).input('discount', sql.Decimal(12, 2), discount).input('total', sql.Decimal(12, 2), total).input('paid', sql.Decimal(12, 2), paid).input('method', sql.VarChar(20), method).input('actor', sql.Int, actorUserId || null).input('branchId', sql.Int, location.branch_id).input('locationId', sql.Int, location.id).input('shiftId', sql.Int, shiftId).input('keyHash', sql.Char(64), keyHash).query(`INSERT INTO dbo.gym_store_sales(tenant_id,sale_number,member_id,customer_name,subtotal,discount_amount,tax_amount,total_amount,paid_amount,payment_method,status,created_by_user_id,branch_id,stock_location_id,pos_shift_id,idempotency_key_hash,sales_channel)
            OUTPUT INSERTED.id VALUES (@tenantId,@saleNumber,@memberId,@name,@subtotal,@discount,0,@total,@paid,@method,'completed',@actor,@branchId,@locationId,@shiftId,@keyHash,'bar');`);
        saleId = Number(inserted.recordset[0].id);
        for (const item of resolvedItems) {
            const modifiers = JSON.stringify(item.modifiers.map((modifier) => ({ id: Number(modifier.id), name: modifier.name, priceDelta: Number(modifier.price_delta || 0) })));
            const cost = item.recipe ? item.recipe.items.reduce((sum, ingredient) => sum + ingredient.quantity * Number(ingredient.purchaseCost || 0), 0) : Number(item.variant.purchase_cost || 0);
            await transaction.request().input('saleId', sql.Int, saleId).input('variantId', sql.Int, item.variantId).input('productName', sql.NVarChar(180), item.variant.product_name).input('variantName', sql.NVarChar(160), item.variant.variant_name).input('sku', sql.VarChar(80), item.variant.sku).input('quantity', sql.Decimal(12, 3), item.lineQuantity).input('unitPrice', sql.Decimal(12, 2), item.unitPrice).input('lineTotal', sql.Decimal(12, 2), item.lineTotal).input('cost', sql.Decimal(12, 2), cost).input('recipeId', sql.Int, item.recipe ? Number(item.recipe.id) : null).input('modifiers', sql.NVarChar(sql.MAX), modifiers).query('INSERT INTO dbo.gym_store_sale_items(sale_id,variant_id,product_name,variant_name,sku,quantity,unit_price,discount_amount,line_total,unit_cost_snapshot,recipe_id,modifier_snapshot_json) VALUES (@saleId,@variantId,@productName,@variantName,@sku,@quantity,@unitPrice,0,@lineTotal,@cost,@recipeId,@modifiers);');
        }
        for (const [variantId, required] of requirements) {
            const snapshot = consumptionSnapshots.get(variantId);
            await stockLocationService.writeMovement(transaction, { tenantId, locationId: location.id, branchId: location.branch_id, variantId, type: 'sale', output: required, previous: snapshot.before, resulting: snapshot.after, unitCost: snapshot.averageCost, referenceType: 'bar_sale', referenceId: saleId, actorUserId });
        }
        await transaction.request().input('saleId', sql.Int, saleId).input('amount', sql.Decimal(12, 2), paid).input('method', sql.VarChar(20), method).input('actor', sql.Int, actorUserId || null).query('INSERT INTO dbo.gym_store_sale_payments(sale_id,amount,payment_method,created_by_user_id) VALUES (@saleId,@amount,@method,@actor);');
        await saasService.recordAudit({ tenantId, actorUserId, action: 'bar_sale_created', entityType: 'store_sale', entityId: saleId, details: 'Bar sale created using the shared Store commerce ledger.', executor: transaction });
    });
    const sale = await getPool().then((pool) => pool.request().input('tenantId', sql.Int, tenantId).input('saleId', sql.Int, saleId).query('SELECT TOP (1) id,sale_number,sales_channel,total_amount,paid_amount,payment_method,branch_id,stock_location_id,pos_shift_id,status FROM dbo.gym_store_sales WHERE tenant_id=@tenantId AND id=@saleId;'));
    return { sale: sale.recordset[0] ? { id: Number(sale.recordset[0].id), saleNumber: sale.recordset[0].sale_number, channel: sale.recordset[0].sales_channel, totalAmount: Number(sale.recordset[0].total_amount), paidAmount: Number(sale.recordset[0].paid_amount), paymentMethod: sale.recordset[0].payment_method, branchId: Number(sale.recordset[0].branch_id), locationId: Number(sale.recordset[0].stock_location_id), shiftId: Number(sale.recordset[0].pos_shift_id), status: sale.recordset[0].status } : null, idempotent: replayed };
}

async function recordWaste(body = {}, { actorUserId = null, role = null } = {}) {
    const location = await assertBarLocation(body.locationId, { actorUserId, role, requireActive: true });
    const variantId = id(body.variantId, 'Variant id');
    const amount = quantity(body.quantity);
    const wasteType = String(body.wasteType || 'other').toLowerCase();
    if (!WASTE_TYPES.has(wasteType)) throw barError('Waste type is invalid.', 400, 'WASTE_TYPE_INVALID');
    const reason = text(body.reason, 'Waste reason', 500, true);
    const tenantId = currentTenantId({ required: true });
    await withTransaction(async (transaction) => {
        await loadVariant(transaction, tenantId, variantId);
        const current = await stockLocationService.ensureBalance(transaction, { tenantId, locationId: location.id, variantId });
        const before = Number(current.quantity_on_hand || 0);
        const after = Math.round((before - amount) * 1000) / 1000;
        if (after < 0) throw barError('Waste quantity exceeds available stock.', 409, 'INSUFFICIENT_STOCK');
        const inserted = await transaction.request().input('tenantId', sql.Int, tenantId).input('branchId', sql.Int, location.branch_id).input('locationId', sql.Int, location.id).input('variantId', sql.Int, variantId).input('quantity', sql.Decimal(12, 3), amount).input('type', sql.VarChar(20), wasteType).input('reason', sql.NVarChar(500), reason).input('actor', sql.Int, actorUserId || null).query('INSERT INTO dbo.gym_commerce_waste(tenant_id,branch_id,stock_location_id,variant_id,quantity,waste_type,reason,created_by_user_id) OUTPUT INSERTED.id VALUES (@tenantId,@branchId,@locationId,@variantId,@quantity,@type,@reason,@actor);');
        await stockLocationService.saveBalance(transaction, { tenantId, locationId: location.id, variantId, quantityOnHand: after, averageCost: Number(current.average_cost || 0) });
        await stockLocationService.writeMovement(transaction, { tenantId, locationId: location.id, branchId: location.branch_id, variantId, type: 'manual', output: amount, previous: before, resulting: after, unitCost: Number(current.average_cost || 0), referenceType: 'bar_waste', referenceId: Number(inserted.recordset[0].id), actorUserId, notes: reason });
    });
    return { locationId: location.id, variantId, quantity: amount, wasteType };
}

module.exports = { closeShift, createModifier, createRecipe, createSale, getOpenShift, listMenu, listModifiers, listRecipes, openShift, recordWaste };
