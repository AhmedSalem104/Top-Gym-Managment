'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { getPool, sql } = require('../database');
const { withTransaction } = require('../database/transaction');
const { addDays, formatDateOnly, parseDateOnly, todayInTimeZone, toUtcDate } = require('../utils/date');
const { getTenantContext } = require('../tenancy/tenant-context');

const PAYMENT_METHODS = new Set(['cash', 'card', 'transfer', 'wallet', 'other']);
const MOVEMENT_TYPES = new Set(['purchase', 'sale', 'sale_return', 'purchase_return', 'adjustment', 'damaged', 'expired', 'manual']);
const STORE_SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'migrations', '007-store.sql');
let storeTablesPromise;

function appError(message, statusCode = 400, code = null, details = {}) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.expose = true;
    if (code) error.code = code;
    Object.assign(error, details);
    return error;
}

function ensureId(value, label = 'المعرف') {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw appError(`${label} غير صالح.`);
    return id;
}

function requiredString(value, label, maxLength) {
    const normalized = String(value ?? '').trim();
    if (!normalized) throw appError(`${label} مطلوب.`);
    if (normalized.length > maxLength) throw appError(`${label} أطول من المسموح.`);
    return normalized;
}

function optionalString(value, maxLength) {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    if (normalized.length > maxLength) throw appError('إحدى البيانات النصية أطول من المسموح.');
    return normalized;
}

function money(value, label = 'المبلغ', allowZero = true) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < (allowZero ? 0 : 0) || amount > 9999999999) {
        throw appError(`${label} غير صالح.`);
    }
    if (!allowZero && amount <= 0) throw appError(`${label} يجب أن يكون أكبر من صفر.`);
    return Math.round(amount * 100) / 100;
}

function quantity(value, label = 'الكمية') {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999) throw appError(`${label} غير صالحة.`);
    return Math.round(amount * 1000) / 1000;
}

function nonNegativeQuantity(value, label = 'الكمية') {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || amount > 999999999) throw appError(`${label} غير صالحة.`);
    return Math.round(amount * 1000) / 1000;
}

function paymentMethod(value = 'cash') {
    const method = String(value || 'cash').trim().toLowerCase();
    if (!PAYMENT_METHODS.has(method)) throw appError('طريقة الدفع غير صالحة.');
    return method;
}

function dateOnly(value, label = 'التاريخ', fallback = todayInTimeZone()) {
    return parseDateOnly(value || fallback, label);
}

function rangeFromQuery(query = {}) {
    const today = todayInTimeZone();
    const from = dateOnly(query.from, 'تاريخ البداية', `${today.slice(0, 7)}-01`);
    const to = dateOnly(query.to, 'تاريخ النهاية', today);
    if (from > to) throw appError('تاريخ البداية يجب أن يسبق تاريخ النهاية.');
    if (from < addDays(to, -1095)) throw appError('أقصى فترة للتقرير هي 3 سنوات.');
    return { from, to, nextDate: addDays(to, 1) };
}

function normalizePhone(value) {
    const arabic = '٠١٢٣٤٥٦٧٨٩';
    let phone = String(value ?? '').trim().replace(/[٠-٩]/gu, (digit) => String(arabic.indexOf(digit)));
    phone = phone.replace(/[^0-9]/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    return phone || null;
}

async function ensureStoreTables() {
    if (getTenantContext()?.readOnlyBaseline) return;
    if (!storeTablesPromise) {
        storeTablesPromise = (async () => {
            const schema = fs.readFileSync(STORE_SCHEMA_PATH, 'utf8');
            const pool = await getPool();
            await pool.request().batch(schema);
        })().catch((error) => {
            storeTablesPromise = undefined;
            throw error;
        });
    }
    return storeTablesPromise;
}

function actorMeta(options = {}) {
    return {
        actorUserId: options.actorUserId ? Number(options.actorUserId) : null,
        ipAddress: options.request?.ip || options.ipAddress || null,
        userAgent: options.request?.get?.('user-agent') || options.userAgent || null
    };
}

async function writeAudit(connection, { action, entityType, entityId, details, ...meta }) {
    const request = connection.request()
        .input('action', sql.VarChar(40), action)
        .input('entityType', sql.VarChar(40), entityType)
        .input('entityId', sql.Int, entityId || null)
        .input('actorUserId', sql.Int, meta.actorUserId || null)
        .input('ipAddress', sql.VarChar(64), meta.ipAddress || null)
        .input('userAgent', sql.NVarChar(512), meta.userAgent || null)
        .input('details', sql.NVarChar(sql.MAX), details ? JSON.stringify(details) : null);
    await request.query(`
        INSERT INTO dbo.gym_store_audit_log
            (action, entity_type, entity_id, actor_user_id, ip_address, user_agent, details)
        VALUES (@action, @entityType, @entityId, @actorUserId, @ipAddress, @userAgent, @details);
    `);
}

function mapCategory(row) {
    return {
        id: Number(row.id),
        code: row.category_code,
        nameAr: row.name_ar,
        nameEn: row.name_en,
        active: Boolean(row.is_active),
        sortOrder: Number(row.sort_order || 0)
    };
}

function mapSupplier(row) {
    return {
        id: Number(row.id),
        name: row.supplier_name,
        phone: row.phone || null,
        email: row.email || null,
        address: row.address || null,
        taxReference: row.tax_reference || null,
        notes: row.notes || null,
        active: Boolean(row.is_active),
        createdAt: row.created_at
    };
}

function mapVariant(row, includeCost = false) {
    const result = {
        id: Number(row.variant_id ?? row.id),
        productId: Number(row.product_id),
        variantName: row.variant_name,
        sku: row.variant_sku ?? row.sku,
        barcode: row.variant_barcode ?? row.barcode ?? null,
        size: row.size_label || null,
        color: row.color_label || null,
        flavor: row.flavor_label || null,
        weight: row.weight_label || null,
        sellingPrice: Number(row.selling_price || 0),
        discountPrice: row.discount_price === null || row.discount_price === undefined ? null : Number(row.discount_price),
        minimumStock: row.variant_minimum_stock === null || row.variant_minimum_stock === undefined
            ? null
            : Number(row.variant_minimum_stock),
        active: Boolean(row.variant_active ?? row.is_active)
    };
    if (includeCost) {
        result.purchaseCost = Number(row.purchase_cost || 0);
        result.averageCost = Number(row.average_cost || row.purchase_cost || 0);
        result.quantityOnHand = Number(row.quantity_on_hand || 0);
    }
    return result;
}

function mapProduct(row, includeCost = false) {
    const result = {
        id: Number(row.id),
        categoryId: Number(row.category_id),
        categoryName: row.category_name || null,
        sku: row.sku,
        barcode: row.barcode || null,
        nameAr: row.name_ar,
        nameEn: row.name_en || null,
        description: row.description || null,
        brand: row.brand || null,
        imagePath: row.image_path || null,
        active: Boolean(row.is_active),
        trackInventory: Boolean(row.track_inventory),
        minimumStock: Number(row.minimum_stock || 0),
        taxRate: Number(row.tax_rate || 0),
        // Stock is aggregated from variants by the caller.
        stock: 0,
        lowStock: false,
        variants: row.variant_id ? [mapVariant(row, includeCost)] : []
    };
    if (!includeCost) delete result.taxRate;
    return result;
}

async function listCategories({ includeInactive = false } = {}) {
    await ensureStoreTables();
    const pool = await getPool();
    const result = await pool.request().input('includeInactive', sql.Bit, includeInactive ? 1 : 0).query(`
        SELECT id, category_code, name_ar, name_en, is_active, sort_order
        FROM dbo.gym_store_categories
        WHERE @includeInactive = 1 OR is_active = 1
        ORDER BY sort_order, name_ar, id;
    `);
    return result.recordset.map(mapCategory);
}

async function createCategory(body = {}, options = {}) {
    await ensureStoreTables();
    const code = requiredString(body.code ?? body.categoryCode, 'رمز التصنيف', 40).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const nameAr = requiredString(body.nameAr ?? body.name, 'اسم التصنيف', 120);
    const nameEn = optionalString(body.nameEn, 120);
    const sortOrder = Number.isInteger(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;
    try {
        const result = await getPool().then((pool) => pool.request()
            .input('code', sql.VarChar(40), code)
            .input('nameAr', sql.NVarChar(120), nameAr)
            .input('nameEn', sql.NVarChar(120), nameEn)
            .input('sortOrder', sql.Int, sortOrder)
            .query(`INSERT INTO dbo.gym_store_categories(category_code, name_ar, name_en, sort_order)
                    OUTPUT INSERTED.id, INSERTED.category_code, INSERTED.name_ar, INSERTED.name_en, INSERTED.is_active, INSERTED.sort_order
                    VALUES (@code, @nameAr, @nameEn, @sortOrder);`));
        return mapCategory(result.recordset[0]);
    } catch (error) {
        if (error.number === 2627 || error.number === 2601) throw appError('رمز التصنيف مستخدم من قبل.', 409, 'STORE_CATEGORY_EXISTS');
        throw error;
    }
}

async function updateCategory(id, body = {}, options = {}) {
    await ensureStoreTables();
    const categoryId = ensureId(id, 'التصنيف');
    const nameAr = requiredString(body.nameAr ?? body.name, 'اسم التصنيف', 120);
    const nameEn = optionalString(body.nameEn, 120);
    const active = body.active !== false;
    const result = await getPool().then((pool) => pool.request()
        .input('id', sql.Int, categoryId)
        .input('nameAr', sql.NVarChar(120), nameAr)
        .input('nameEn', sql.NVarChar(120), nameEn)
        .input('active', sql.Bit, active ? 1 : 0)
        .query(`UPDATE dbo.gym_store_categories SET name_ar=@nameAr, name_en=@nameEn, is_active=@active, updated_at=SYSUTCDATETIME()
                OUTPUT INSERTED.id, INSERTED.category_code, INSERTED.name_ar, INSERTED.name_en, INSERTED.is_active, INSERTED.sort_order
                WHERE id=@id;`));
    if (!result.recordset[0]) throw appError('التصنيف غير موجود.', 404, 'STORE_CATEGORY_NOT_FOUND');
    await writeAudit(await getPool(), { action: 'category_updated', entityType: 'category', entityId: categoryId, details: { active }, ...actorMeta(options) });
    return mapCategory(result.recordset[0]);
}

const PRODUCT_SELECT = `
    SELECT p.id, p.category_id, c.name_ar AS category_name, p.sku, p.barcode, p.name_ar, p.name_en,
           p.description, p.brand, p.image_path, p.is_active, p.track_inventory, p.minimum_stock, p.tax_rate,
           v.id AS variant_id, v.variant_name, v.sku AS variant_sku, v.barcode AS variant_barcode,
           v.size_label, v.color_label, v.flavor_label, v.weight_label, v.purchase_cost,
           v.selling_price, v.discount_price, v.minimum_stock AS variant_minimum_stock, v.is_active AS variant_active,
           ISNULL(b.quantity_on_hand, 0) AS quantity_on_hand, ISNULL(b.average_cost, v.purchase_cost) AS average_cost
    FROM dbo.gym_store_products AS p
    INNER JOIN dbo.gym_store_categories AS c ON c.id=p.category_id
    LEFT JOIN dbo.gym_store_product_variants AS v ON v.product_id=p.id
    LEFT JOIN dbo.gym_store_inventory_balances AS b ON b.variant_id=v.id
`;

async function listProducts({ search = '', categoryId = '', page = 1, pageSize = 50, includeInactive = false, includeCost = false } = {}) {
    await ensureStoreTables();
    const safePage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(200, Math.max(1, Number(pageSize) || 50));
    const offset = (safePage - 1) * safePageSize;
    const category = categoryId ? ensureId(categoryId, 'التصنيف') : 0;
    const pool = await getPool();
    const result = await pool.request()
        .input('search', sql.NVarChar(180), String(search || '').trim())
        .input('pattern', sql.NVarChar(190), `%${String(search || '').trim()}%`)
        .input('categoryId', sql.Int, category)
        .input('includeInactive', sql.Bit, includeInactive ? 1 : 0)
        .input('offset', sql.Int, offset)
        .input('pageSize', sql.Int, safePageSize)
        .query(`${PRODUCT_SELECT}
            WHERE (@includeInactive=1 OR p.is_active=1) AND (@categoryId=0 OR p.category_id=@categoryId)
              AND (@search=N'' OR p.name_ar LIKE @pattern OR ISNULL(p.name_en,N'') LIKE @pattern OR p.sku LIKE @pattern OR ISNULL(p.barcode,'') LIKE @pattern OR v.sku LIKE @pattern OR ISNULL(v.barcode,'') LIKE @pattern)
            ORDER BY p.id DESC, v.id
            OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
    const grouped = new Map();
    result.recordset.forEach((row) => {
        if (!grouped.has(row.id)) grouped.set(row.id, mapProduct({ ...row, variant_id: null }, includeCost));
        if (row.variant_id) grouped.get(row.id).variants.push(mapVariant(row, includeCost));
        grouped.get(row.id).stock += Number(row.quantity_on_hand || 0);
    });
    grouped.forEach((product) => {
        product.lowStock = product.stock <= product.minimumStock;
    });
    const countResult = await pool.request()
        .input('search', sql.NVarChar(180), String(search || '').trim())
        .input('pattern', sql.NVarChar(190), `%${String(search || '').trim()}%`)
        .input('categoryId', sql.Int, category)
        .input('includeInactive', sql.Bit, includeInactive ? 1 : 0)
        .query(`SELECT COUNT(DISTINCT p.id) AS total FROM dbo.gym_store_products p
                LEFT JOIN dbo.gym_store_product_variants v ON v.product_id=p.id
                WHERE (@includeInactive=1 OR p.is_active=1) AND (@categoryId=0 OR p.category_id=@categoryId)
                  AND (@search=N'' OR p.name_ar LIKE @pattern OR ISNULL(p.name_en,N'') LIKE @pattern OR p.sku LIKE @pattern OR ISNULL(p.barcode,'') LIKE @pattern OR v.sku LIKE @pattern OR ISNULL(v.barcode,'') LIKE @pattern);`);
    return {
        items: [...grouped.values()],
        pagination: { page: safePage, pageSize: safePageSize, total: Number(countResult.recordset[0]?.total || 0), totalPages: Math.ceil(Number(countResult.recordset[0]?.total || 0) / safePageSize) }
    };
}

function normalizeVariant(input = {}, fallback = {}) {
    return {
        id: input.id ? ensureId(input.id, 'المتغير') : null,
        name: requiredString(input.name ?? input.variantName ?? fallback.name ?? 'النسخة الأساسية', 'اسم النسخة', 160),
        sku: requiredString(input.sku ?? fallback.sku, 'SKU', 80),
        barcode: optionalString(input.barcode, 120),
        size: optionalString(input.size, 60),
        color: optionalString(input.color, 60),
        flavor: optionalString(input.flavor, 80),
        weight: optionalString(input.weight, 60),
        purchaseCost: money(input.purchaseCost ?? fallback.purchaseCost ?? 0, 'تكلفة الشراء'),
        sellingPrice: money(input.sellingPrice ?? fallback.sellingPrice, 'سعر البيع'),
        discountPrice: input.discountPrice === '' || input.discountPrice === null || input.discountPrice === undefined ? null : money(input.discountPrice, 'سعر الخصم'),
        minimumStock: input.minimumStock === '' || input.minimumStock === null || input.minimumStock === undefined ? null : nonNegativeQuantity(input.minimumStock, 'الحد الأدنى للمخزون'),
        active: input.active !== false
    };
}

async function createProduct(body = {}, options = {}) {
    await ensureStoreTables();
    const categoryId = ensureId(body.categoryId, 'التصنيف');
    const product = {
        nameAr: requiredString(body.nameAr ?? body.name, 'اسم المنتج', 180),
        nameEn: optionalString(body.nameEn, 180),
        sku: requiredString(body.sku, 'SKU المنتج', 80),
        barcode: optionalString(body.barcode, 120),
        description: optionalString(body.description, 2000),
        brand: optionalString(body.brand, 120),
        imagePath: optionalString(body.imagePath, 500),
        minimumStock: body.minimumStock === undefined ? 0 : nonNegativeQuantity(body.minimumStock, 'الحد الأدنى للمخزون'),
        taxRate: body.taxRate === undefined ? 0 : money(body.taxRate, 'الضريبة'),
        trackInventory: body.trackInventory !== false
    };
    const fallback = { name: 'النسخة الأساسية', sku: `${product.sku}-STD`, purchaseCost: body.purchaseCost, sellingPrice: body.sellingPrice };
    const variants = Array.isArray(body.variants) && body.variants.length ? body.variants.map((item) => normalizeVariant(item, fallback)) : [normalizeVariant({}, fallback)];
    const result = await withTransaction(async (transaction) => {
        const categoryResult = await transaction.request().input('categoryId', sql.Int, categoryId).query('SELECT id FROM dbo.gym_store_categories WHERE id=@categoryId AND is_active=1;');
        if (!categoryResult.recordset[0]) throw appError('التصنيف غير موجود أو غير فعال.', 400, 'STORE_CATEGORY_NOT_FOUND');
        const insert = await transaction.request()
            .input('categoryId', sql.Int, categoryId).input('sku', sql.VarChar(80), product.sku).input('barcode', sql.VarChar(120), product.barcode)
            .input('nameAr', sql.NVarChar(180), product.nameAr).input('nameEn', sql.NVarChar(180), product.nameEn).input('description', sql.NVarChar(2000), product.description)
            .input('brand', sql.NVarChar(120), product.brand).input('imagePath', sql.NVarChar(500), product.imagePath).input('active', sql.Bit, 1)
            .input('trackInventory', sql.Bit, product.trackInventory ? 1 : 0).input('minimumStock', sql.Decimal(12, 3), product.minimumStock).input('taxRate', sql.Decimal(6, 3), product.taxRate)
            .input('createdByUserId', sql.Int, options.actorUserId || null)
            .query(`INSERT INTO dbo.gym_store_products(category_id, sku, barcode, name_ar, name_en, description, brand, image_path, is_active, track_inventory, minimum_stock, tax_rate, created_by_user_id, updated_by_user_id)
                    OUTPUT INSERTED.id VALUES (@categoryId,@sku,@barcode,@nameAr,@nameEn,@description,@brand,@imagePath,@active,@trackInventory,@minimumStock,@taxRate,@createdByUserId,@createdByUserId);`);
        const productId = Number(insert.recordset[0].id);
        for (const variant of variants) {
            await transaction.request().input('productId', sql.Int, productId).input('name', sql.NVarChar(160), variant.name).input('sku', sql.VarChar(80), variant.sku)
                .input('barcode', sql.VarChar(120), variant.barcode).input('size', sql.NVarChar(60), variant.size).input('color', sql.NVarChar(60), variant.color)
                .input('flavor', sql.NVarChar(80), variant.flavor).input('weight', sql.NVarChar(60), variant.weight).input('cost', sql.Decimal(12, 2), variant.purchaseCost)
                .input('price', sql.Decimal(12, 2), variant.sellingPrice).input('discountPrice', sql.Decimal(12, 2), variant.discountPrice)
                .input('minimumStock', sql.Decimal(12, 3), variant.minimumStock).query(`INSERT INTO dbo.gym_store_product_variants(product_id, variant_name, sku, barcode, size_label, color_label, flavor_label, weight_label, purchase_cost, selling_price, discount_price, minimum_stock)
                    VALUES (@productId,@name,@sku,@barcode,@size,@color,@flavor,@weight,@cost,@price,@discountPrice,@minimumStock);`);
        }
        await writeAudit(transaction, { action: 'product_created', entityType: 'product', entityId: productId, details: { sku: product.sku }, ...actorMeta(options) });
        return productId;
    });
    return getProduct(result, { includeCost: true });
}

async function getProduct(id, { includeCost = true } = {}) {
    await ensureStoreTables();
    const productId = ensureId(id, 'المنتج');
    const pool = await getPool();
    const result = await pool.request().input('id', sql.Int, productId).query(`${PRODUCT_SELECT} WHERE p.id=@id ORDER BY v.id;`);
    if (!result.recordset[0]) throw appError('المنتج غير موجود.', 404, 'STORE_PRODUCT_NOT_FOUND');
    const first = result.recordset[0];
    const product = mapProduct({ ...first, variant_id: null }, includeCost);
    product.variants = result.recordset.filter((row) => row.variant_id).map((row) => mapVariant(row, includeCost));
    product.stock = product.variants.reduce((total, item) => total + Number(item.quantityOnHand || 0), 0);
    return product;
}

async function updateProduct(id, body = {}, options = {}) {
    await ensureStoreTables();
    const productId = ensureId(id, 'المنتج');
    const fields = {
        categoryId: ensureId(body.categoryId, 'التصنيف'), nameAr: requiredString(body.nameAr ?? body.name, 'اسم المنتج', 180), nameEn: optionalString(body.nameEn, 180),
        barcode: optionalString(body.barcode, 120), description: optionalString(body.description, 2000), brand: optionalString(body.brand, 120), imagePath: optionalString(body.imagePath, 500),
        minimumStock: body.minimumStock === undefined ? 0 : nonNegativeQuantity(body.minimumStock, 'الحد الأدنى للمخزون'), taxRate: body.taxRate === undefined ? 0 : money(body.taxRate, 'الضريبة'), trackInventory: body.trackInventory !== false, active: body.active !== false
    };
    const result = await getPool().then((pool) => pool.request().input('id', sql.Int, productId).input('categoryId', sql.Int, fields.categoryId).input('nameAr', sql.NVarChar(180), fields.nameAr)
        .input('nameEn', sql.NVarChar(180), fields.nameEn).input('barcode', sql.VarChar(120), fields.barcode).input('description', sql.NVarChar(2000), fields.description)
        .input('brand', sql.NVarChar(120), fields.brand).input('imagePath', sql.NVarChar(500), fields.imagePath).input('minimumStock', sql.Decimal(12, 3), fields.minimumStock)
        .input('taxRate', sql.Decimal(6, 3), fields.taxRate).input('trackInventory', sql.Bit, fields.trackInventory ? 1 : 0).input('active', sql.Bit, fields.active ? 1 : 0).input('updatedBy', sql.Int, options.actorUserId || null)
        .query(`UPDATE dbo.gym_store_products SET category_id=@categoryId,name_ar=@nameAr,name_en=@nameEn,barcode=@barcode,description=@description,brand=@brand,image_path=@imagePath,minimum_stock=@minimumStock,tax_rate=@taxRate,track_inventory=@trackInventory,is_active=@active,updated_by_user_id=@updatedBy,updated_at=SYSUTCDATETIME() WHERE id=@id;`));
    if (!result.rowsAffected[0]) throw appError('المنتج غير موجود.', 404, 'STORE_PRODUCT_NOT_FOUND');
    await writeAudit(await getPool(), { action: 'product_updated', entityType: 'product', entityId: productId, details: { name: fields.nameAr, active: fields.active }, ...actorMeta(options) });
    return getProduct(productId, { includeCost: true });
}

async function setProductStatus(id, active, options = {}) {
    await ensureStoreTables();
    const productId = ensureId(id, 'المنتج');
    const result = await getPool().then((pool) => pool.request().input('id', sql.Int, productId).input('active', sql.Bit, active ? 1 : 0).input('updatedBy', sql.Int, options.actorUserId || null)
        .query('UPDATE dbo.gym_store_products SET is_active=@active, updated_by_user_id=@updatedBy, updated_at=SYSUTCDATETIME() WHERE id=@id;'));
    if (!result.rowsAffected[0]) throw appError('المنتج غير موجود.', 404, 'STORE_PRODUCT_NOT_FOUND');
    return getProduct(productId, { includeCost: true });
}

async function createVariant(productId, body = {}, options = {}) {
    await ensureStoreTables();
    const id = ensureId(productId, 'product');
    const productResult = await getPool().then((pool) => pool.request().input('id', sql.Int, id).query('SELECT id, sku, is_active FROM dbo.gym_store_products WHERE id=@id;'));
    const product = productResult.recordset[0];
    if (!product) throw appError('Product not found.', 404, 'STORE_PRODUCT_NOT_FOUND');
    if (!product.is_active) throw appError('Cannot add a variant to an inactive product.');
    const variant = normalizeVariant(body, { sku: `${product.sku}-${Date.now()}` });
    const variantId = await withTransaction(async (transaction) => {
        const insert = await transaction.request()
            .input('productId', sql.Int, id).input('name', sql.NVarChar(160), variant.name).input('sku', sql.VarChar(80), variant.sku)
            .input('barcode', sql.VarChar(120), variant.barcode).input('size', sql.NVarChar(60), variant.size).input('color', sql.NVarChar(60), variant.color)
            .input('flavor', sql.NVarChar(80), variant.flavor).input('weight', sql.NVarChar(60), variant.weight).input('cost', sql.Decimal(12, 2), variant.purchaseCost)
            .input('price', sql.Decimal(12, 2), variant.sellingPrice).input('discountPrice', sql.Decimal(12, 2), variant.discountPrice)
            .input('minimumStock', sql.Decimal(12, 3), variant.minimumStock)
            .query(`INSERT INTO dbo.gym_store_product_variants(product_id,variant_name,sku,barcode,size_label,color_label,flavor_label,weight_label,purchase_cost,selling_price,discount_price,minimum_stock)
                    OUTPUT INSERTED.id VALUES (@productId,@name,@sku,@barcode,@size,@color,@flavor,@weight,@cost,@price,@discountPrice,@minimumStock);`);
        await writeAudit(transaction, { action: 'variant_created', entityType: 'product_variant', entityId: insert.recordset[0].id, details: { productId: id, sku: variant.sku }, ...actorMeta(options) });
        return Number(insert.recordset[0].id);
    });
    return { product: await getProduct(id, { includeCost: true }), variantId };
}

async function updateVariant(productId, variantId, body = {}, options = {}) {
    await ensureStoreTables();
    const productKey = ensureId(productId, 'product');
    const id = ensureId(variantId, 'variant');
    const current = await getPool().then((pool) => pool.request().input('id', sql.Int, id).input('productId', sql.Int, productKey).query('SELECT id,sku FROM dbo.gym_store_product_variants WHERE id=@id AND product_id=@productId;'));
    if (!current.recordset[0]) throw appError('Product variant not found.', 404, 'STORE_VARIANT_NOT_FOUND');
    const variant = normalizeVariant(body, { sku: current.recordset[0].sku });
    const result = await getPool().then((pool) => pool.request()
        .input('id', sql.Int, id).input('name', sql.NVarChar(160), variant.name).input('sku', sql.VarChar(80), variant.sku).input('barcode', sql.VarChar(120), variant.barcode)
        .input('size', sql.NVarChar(60), variant.size).input('color', sql.NVarChar(60), variant.color).input('flavor', sql.NVarChar(80), variant.flavor).input('weight', sql.NVarChar(60), variant.weight)
        .input('cost', sql.Decimal(12, 2), variant.purchaseCost).input('price', sql.Decimal(12, 2), variant.sellingPrice).input('discountPrice', sql.Decimal(12, 2), variant.discountPrice)
        .input('minimumStock', sql.Decimal(12, 3), variant.minimumStock).input('active', sql.Bit, variant.active ? 1 : 0)
        .query(`UPDATE dbo.gym_store_product_variants SET variant_name=@name,sku=@sku,barcode=@barcode,size_label=@size,color_label=@color,flavor_label=@flavor,weight_label=@weight,
                purchase_cost=@cost,selling_price=@price,discount_price=@discountPrice,minimum_stock=@minimumStock,is_active=@active,updated_at=SYSUTCDATETIME() WHERE id=@id;`));
    if (!result.rowsAffected[0]) throw appError('Product variant not found.', 404, 'STORE_VARIANT_NOT_FOUND');
    await writeAudit(await getPool(), { action: 'variant_updated', entityType: 'product_variant', entityId: id, details: { productId: productKey, sku: variant.sku }, ...actorMeta(options) });
    return getProduct(productKey, { includeCost: true });
}

async function deactivateVariant(productId, variantId, options = {}) {
    await ensureStoreTables();
    const productKey = ensureId(productId, 'product');
    const id = ensureId(variantId, 'variant');
    const result = await getPool().then((pool) => pool.request().input('id', sql.Int, id).input('productId', sql.Int, productKey).query('UPDATE dbo.gym_store_product_variants SET is_active=0,updated_at=SYSUTCDATETIME() WHERE id=@id AND product_id=@productId;'));
    if (!result.rowsAffected[0]) throw appError('Product variant not found.', 404, 'STORE_VARIANT_NOT_FOUND');
    await writeAudit(await getPool(), { action: 'variant_deactivated', entityType: 'product_variant', entityId: id, details: { productId: productKey }, ...actorMeta(options) });
    return getProduct(productKey, { includeCost: true });
}

async function listSuppliers({ search = '', includeInactive = false } = {}) {
    await ensureStoreTables();
    const result = await getPool().then((pool) => pool.request().input('search', sql.NVarChar(160), String(search || '').trim()).input('pattern', sql.NVarChar(170), `%${String(search || '').trim()}%`).input('includeInactive', sql.Bit, includeInactive ? 1 : 0).query(`
        SELECT id,supplier_name,phone,email,address,tax_reference,notes,is_active,created_at FROM dbo.gym_store_suppliers
        WHERE (@includeInactive=1 OR is_active=1) AND (@search=N'' OR supplier_name LIKE @pattern OR ISNULL(phone,N'') LIKE @pattern OR ISNULL(email,N'') LIKE @pattern)
        ORDER BY supplier_name,id;`));
    return result.recordset.map(mapSupplier);
}

async function createSupplier(body = {}, options = {}) {
    await ensureStoreTables();
    const values = { name: requiredString(body.name ?? body.supplierName, 'اسم المورد', 160), phone: optionalString(body.phone, 40), email: optionalString(body.email, 254), address: optionalString(body.address, 500), taxReference: optionalString(body.taxReference, 120), notes: optionalString(body.notes, 1000) };
    const result = await getPool().then((pool) => pool.request().input('name', sql.NVarChar(160), values.name).input('phone', sql.NVarChar(40), values.phone).input('email', sql.NVarChar(254), values.email).input('address', sql.NVarChar(500), values.address).input('taxReference', sql.NVarChar(120), values.taxReference).input('notes', sql.NVarChar(1000), values.notes).query(`
        INSERT INTO dbo.gym_store_suppliers(supplier_name,phone,email,address,tax_reference,notes) OUTPUT INSERTED.* VALUES (@name,@phone,@email,@address,@taxReference,@notes);`));
    await writeAudit(await getPool(), { action: 'supplier_created', entityType: 'supplier', entityId: result.recordset[0].id, details: values, ...actorMeta(options) });
    return mapSupplier(result.recordset[0]);
}

async function updateSupplier(id, body = {}, options = {}) {
    await ensureStoreTables();
    const supplierId = ensureId(id, 'المورد');
    const values = { name: requiredString(body.name ?? body.supplierName, 'اسم المورد', 160), phone: optionalString(body.phone, 40), email: optionalString(body.email, 254), address: optionalString(body.address, 500), taxReference: optionalString(body.taxReference, 120), notes: optionalString(body.notes, 1000), active: body.active !== false };
    const result = await getPool().then((pool) => pool.request().input('id', sql.Int, supplierId).input('name', sql.NVarChar(160), values.name).input('phone', sql.NVarChar(40), values.phone).input('email', sql.NVarChar(254), values.email).input('address', sql.NVarChar(500), values.address).input('taxReference', sql.NVarChar(120), values.taxReference).input('notes', sql.NVarChar(1000), values.notes).input('active', sql.Bit, values.active ? 1 : 0).query(`UPDATE dbo.gym_store_suppliers SET supplier_name=@name,phone=@phone,email=@email,address=@address,tax_reference=@taxReference,notes=@notes,is_active=@active,updated_at=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE id=@id;`));
    if (!result.recordset[0]) throw appError('المورد غير موجود.', 404, 'STORE_SUPPLIER_NOT_FOUND');
    await writeAudit(await getPool(), { action: 'supplier_updated', entityType: 'supplier', entityId: supplierId, details: { active: values.active }, ...actorMeta(options) });
    return mapSupplier(result.recordset[0]);
}

async function searchCustomers(search = '') {
    await ensureStoreTables();
    const term = String(search || '').trim();
    if (term.length < 2) return [];
    const result = await getPool().then((pool) => pool.request().input('pattern', sql.NVarChar(180), `%${term}%`).query(`
        SELECT TOP (20) m.id, m.full_name, m.phone, m.email, m.registration_date,
               m.membership_code_version, m.membership_code_revoked_at,
               latest.membership_plan, latest.membership_type, latest.end_date
        FROM dbo.members m
        OUTER APPLY (SELECT TOP (1) membership_plan, membership_type, end_date FROM dbo.memberships WHERE member_id=m.id ORDER BY end_date DESC, id DESC) latest
        WHERE m.full_name LIKE @pattern OR m.phone LIKE @pattern OR ISNULL(m.email,N'') LIKE @pattern
        ORDER BY m.full_name, m.id;`));
    return result.recordset.map((row) => ({ id: Number(row.id), type: 'member', name: row.full_name, phone: row.phone, email: row.email || null, membershipPlan: row.membership_plan || null, membershipType: row.membership_type || null, membershipEndDate: formatDateOnly(row.end_date) }));
}

async function listInventory({ search = '', lowStockOnly = false, expiryOnly = false, includeInactive = false } = {}) {
    await ensureStoreTables();
    const result = await getPool().then((pool) => pool.request().input('pattern', sql.NVarChar(180), `%${String(search || '').trim()}%`).input('lowStockOnly', sql.Bit, lowStockOnly ? 1 : 0).input('expiryOnly', sql.Bit, expiryOnly ? 1 : 0).input('includeInactive', sql.Bit, includeInactive ? 1 : 0).query(`
        SELECT v.id AS variant_id, p.id AS product_id, p.name_ar, p.name_en, p.sku AS product_sku, c.name_ar AS category_name,
               v.variant_name, v.sku, v.barcode, v.selling_price, v.purchase_cost, v.minimum_stock AS variant_minimum_stock,
               p.minimum_stock AS product_minimum_stock, p.is_active, p.track_inventory,
               ISNULL(b.quantity_on_hand,0) AS quantity_on_hand, ISNULL(b.average_cost,v.purchase_cost) AS average_cost,
               MIN(CASE WHEN bt.quantity_on_hand > 0 THEN bt.expiry_date END) AS nearest_expiry
        FROM dbo.gym_store_product_variants v
        INNER JOIN dbo.gym_store_products p ON p.id=v.product_id
        INNER JOIN dbo.gym_store_categories c ON c.id=p.category_id
        LEFT JOIN dbo.gym_store_inventory_balances b ON b.variant_id=v.id
        LEFT JOIN dbo.gym_store_inventory_batches bt ON bt.variant_id=v.id
        WHERE (@includeInactive=1 OR p.is_active=1) AND (@pattern=N'' OR p.name_ar LIKE @pattern OR v.variant_name LIKE @pattern OR v.sku LIKE @pattern OR ISNULL(v.barcode,'') LIKE @pattern)
        GROUP BY v.id,p.id,p.name_ar,p.name_en,p.sku,c.name_ar,v.variant_name,v.sku,v.barcode,v.selling_price,v.purchase_cost,v.minimum_stock,p.minimum_stock,p.is_active,p.track_inventory,b.quantity_on_hand,b.average_cost
        HAVING (@lowStockOnly=0 OR ISNULL(b.quantity_on_hand,0) <= ISNULL(v.minimum_stock,p.minimum_stock))
           AND (@expiryOnly=0 OR MIN(CASE WHEN bt.quantity_on_hand > 0 THEN bt.expiry_date END) IS NOT NULL AND MIN(CASE WHEN bt.quantity_on_hand > 0 THEN bt.expiry_date END) <= DATEADD(day,30,CONVERT(date,GETDATE())))
        ORDER BY CASE WHEN ISNULL(b.quantity_on_hand,0) <= ISNULL(v.minimum_stock,p.minimum_stock) THEN 0 ELSE 1 END, nearest_expiry, p.name_ar, v.variant_name;`));
    return result.recordset.map((row) => ({ id: Number(row.variant_id), productId: Number(row.product_id), productName: row.name_ar, productNameEn: row.name_en || null, categoryName: row.category_name, variantName: row.variant_name, sku: row.sku, barcode: row.barcode || null, sellingPrice: Number(row.selling_price || 0), purchaseCost: Number(row.purchase_cost || 0), averageCost: Number(row.average_cost || 0), quantityOnHand: Number(row.quantity_on_hand || 0), minimumStock: Number(row.variant_minimum_stock ?? row.product_minimum_stock ?? 0), lowStock: Number(row.quantity_on_hand || 0) <= Number(row.variant_minimum_stock ?? row.product_minimum_stock ?? 0), nearestExpiry: formatDateOnly(row.nearest_expiry), trackInventory: Boolean(row.track_inventory) }));
}

async function getLockedBalance(transaction, variantId) {
    const result = await transaction.request().input('variantId', sql.Int, variantId).query('SELECT quantity_on_hand, average_cost FROM dbo.gym_store_inventory_balances WITH (UPDLOCK,HOLDLOCK) WHERE variant_id=@variantId;');
    if (result.recordset[0]) return { quantity: Number(result.recordset[0].quantity_on_hand || 0), averageCost: Number(result.recordset[0].average_cost || 0) };
    await transaction.request().input('variantId', sql.Int, variantId).query('INSERT INTO dbo.gym_store_inventory_balances(variant_id) VALUES (@variantId);');
    return { quantity: 0, averageCost: 0 };
}

async function updateBalance(transaction, variantId, nextQuantity, nextAverageCost) {
    await transaction.request().input('variantId', sql.Int, variantId).input('quantity', sql.Decimal(12, 3), nextQuantity).input('averageCost', sql.Decimal(12, 2), nextAverageCost).query('UPDATE dbo.gym_store_inventory_balances SET quantity_on_hand=@quantity, average_cost=@averageCost, updated_at=SYSUTCDATETIME() WHERE variant_id=@variantId;');
}

async function insertMovement(transaction, { variantId, type, inQuantity = 0, outQuantity = 0, previousQuantity, resultingQuantity, unitCost = null, referenceType = null, referenceId = null, notes = null, actorUserId = null }) {
    if (!MOVEMENT_TYPES.has(type)) throw appError('نوع حركة المخزون غير صالح.');
    await transaction.request().input('variantId', sql.Int, variantId).input('type', sql.VarChar(30), type).input('quantityIn', sql.Decimal(12, 3), inQuantity).input('quantityOut', sql.Decimal(12, 3), outQuantity).input('previousQuantity', sql.Decimal(12, 3), previousQuantity).input('resultingQuantity', sql.Decimal(12, 3), resultingQuantity).input('unitCost', sql.Decimal(12, 2), unitCost).input('referenceType', sql.VarChar(30), referenceType).input('referenceId', sql.Int, referenceId).input('actorUserId', sql.Int, actorUserId || null).input('notes', sql.NVarChar(1000), notes).query(`INSERT INTO dbo.gym_store_stock_movements(variant_id,movement_type,quantity_in,quantity_out,previous_quantity,resulting_quantity,unit_cost,reference_type,reference_id,created_by_user_id,notes) VALUES (@variantId,@type,@quantityIn,@quantityOut,@previousQuantity,@resultingQuantity,@unitCost,@referenceType,@referenceId,@actorUserId,@notes);`);
}

async function createPurchase(body = {}, options = {}) {
    await ensureStoreTables();
    const itemsInput = Array.isArray(body.items) ? body.items : [];
    if (!itemsInput.length) throw appError('أضف منتجًا واحدًا على الأقل إلى فاتورة الشراء.');
    const items = itemsInput.map((item) => ({ variantId: ensureId(item.variantId, 'متغير المنتج'), quantity: quantity(item.quantity), unitCost: money(item.unitCost, 'تكلفة الوحدة') }));
    const purchaseDate = dateOnly(body.purchaseDate, 'تاريخ الشراء');
    const discount = money(body.discountAmount || 0, 'الخصم');
    const additional = money(body.additionalCost || 0, 'التكاليف الإضافية');
    const subtotal = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0) * 100) / 100;
    if (discount > subtotal) throw appError('الخصم أكبر من إجمالي الشراء.');
    const total = Math.round((subtotal - discount + additional) * 100) / 100;
    const paid = money(body.paidAmount === undefined ? total : body.paidAmount, 'المبلغ المدفوع');
    if (paid > total) throw appError('المبلغ المدفوع أكبر من إجمالي الشراء.');
    const result = await withTransaction(async (transaction) => {
        const insert = await transaction.request().input('supplierId', sql.Int, body.supplierId ? ensureId(body.supplierId, 'المورد') : null).input('invoiceNumber', sql.NVarChar(120), optionalString(body.invoiceNumber, 120)).input('purchaseDate', sql.Date, toUtcDate(purchaseDate)).input('subtotal', sql.Decimal(12, 2), subtotal).input('discount', sql.Decimal(12, 2), discount).input('additional', sql.Decimal(12, 2), additional).input('total', sql.Decimal(12, 2), total).input('paid', sql.Decimal(12, 2), paid).input('paymentMethod', sql.VarChar(20), paymentMethod(body.paymentMethod)).input('status', sql.VarChar(20), 'received').input('notes', sql.NVarChar(1000), optionalString(body.notes, 1000)).input('actor', sql.Int, options.actorUserId || null).query(`INSERT INTO dbo.gym_store_purchases(supplier_id,invoice_number,purchase_date,subtotal,discount_amount,additional_cost,total_amount,paid_amount,payment_method,status,notes,created_by_user_id) OUTPUT INSERTED.id VALUES (@supplierId,@invoiceNumber,@purchaseDate,@subtotal,@discount,@additional,@total,@paid,@paymentMethod,@status,@notes,@actor);`);
        const purchaseId = Number(insert.recordset[0].id);
        for (const item of items) {
            const variantResult = await transaction.request().input('id', sql.Int, item.variantId).query(`SELECT v.id,v.purchase_cost,p.track_inventory FROM dbo.gym_store_product_variants v INNER JOIN dbo.gym_store_products p ON p.id=v.product_id WHERE v.id=@id AND v.is_active=1 AND p.is_active=1;`);
            const variant = variantResult.recordset[0];
            if (!variant) throw appError('أحد المنتجات غير موجود أو غير فعال.', 400, 'STORE_VARIANT_NOT_FOUND');
            await transaction.request().input('purchaseId', sql.Int, purchaseId).input('variantId', sql.Int, item.variantId).input('quantity', sql.Decimal(12, 3), item.quantity).input('unitCost', sql.Decimal(12, 2), item.unitCost).input('lineTotal', sql.Decimal(12, 2), item.quantity * item.unitCost).query('INSERT INTO dbo.gym_store_purchase_items(purchase_id,variant_id,quantity,unit_cost,line_total) VALUES (@purchaseId,@variantId,@quantity,@unitCost,@lineTotal);');
            if (variant.track_inventory) {
                const current = await getLockedBalance(transaction, item.variantId);
                const nextQuantity = current.quantity + item.quantity;
                const nextCost = nextQuantity > 0 ? ((current.quantity * current.averageCost) + (item.quantity * item.unitCost)) / nextQuantity : item.unitCost;
                await updateBalance(transaction, item.variantId, nextQuantity, nextCost);
                await transaction.request().input('variantId', sql.Int, item.variantId).input('purchaseId', sql.Int, purchaseId).input('quantity', sql.Decimal(12, 3), item.quantity).input('unitCost', sql.Decimal(12, 2), item.unitCost).input('lot', sql.NVarChar(100), optionalString(body.lotNumber, 100)).input('expiry', sql.Date, body.expiryDate ? toUtcDate(dateOnly(body.expiryDate, 'تاريخ الانتهاء')) : null).query('INSERT INTO dbo.gym_store_inventory_batches(variant_id,purchase_id,quantity_on_hand,unit_cost,lot_number,expiry_date) VALUES (@variantId,@purchaseId,@quantity,@unitCost,@lot,@expiry);');
                await insertMovement(transaction, { variantId: item.variantId, type: 'purchase', inQuantity: item.quantity, previousQuantity: current.quantity, resultingQuantity: nextQuantity, unitCost: item.unitCost, referenceType: 'purchase', referenceId: purchaseId, actorUserId: options.actorUserId });
            }
        }
        if (paid > 0) await transaction.request().input('purchaseId', sql.Int, purchaseId).input('amount', sql.Decimal(12, 2), paid).input('method', sql.VarChar(20), paymentMethod(body.paymentMethod)).input('actor', sql.Int, options.actorUserId || null).query('INSERT INTO dbo.gym_store_purchase_payments(purchase_id,amount,payment_method,created_by_user_id) VALUES (@purchaseId,@amount,@method,@actor);');
        await writeAudit(transaction, { action: 'purchase_received', entityType: 'purchase', entityId: purchaseId, details: { total, itemCount: items.length }, ...actorMeta(options) });
        return purchaseId;
    });
    return getPurchase(result);
}

async function getPurchase(id) {
    await ensureStoreTables();
    const purchaseId = ensureId(id, 'فاتورة الشراء');
    const pool = await getPool();
    const head = await pool.request().input('id', sql.Int, purchaseId).query(`SELECT p.*, s.supplier_name FROM dbo.gym_store_purchases p LEFT JOIN dbo.gym_store_suppliers s ON s.id=p.supplier_id WHERE p.id=@id;`);
    if (!head.recordset[0]) throw appError('فاتورة الشراء غير موجودة.', 404, 'STORE_PURCHASE_NOT_FOUND');
    const items = await pool.request().input('id', sql.Int, purchaseId).query(`SELECT i.*, p.name_ar, v.variant_name, v.sku FROM dbo.gym_store_purchase_items i INNER JOIN dbo.gym_store_product_variants v ON v.id=i.variant_id INNER JOIN dbo.gym_store_products p ON p.id=v.product_id WHERE i.purchase_id=@id ORDER BY i.id;`);
    const row = head.recordset[0];
    return { id: Number(row.id), supplierId: row.supplier_id ? Number(row.supplier_id) : null, supplierName: row.supplier_name || null, invoiceNumber: row.invoice_number || null, purchaseDate: formatDateOnly(row.purchase_date), subtotal: Number(row.subtotal), discountAmount: Number(row.discount_amount), additionalCost: Number(row.additional_cost), totalAmount: Number(row.total_amount), paidAmount: Number(row.paid_amount), remainingAmount: Number(row.remaining_amount), paymentMethod: row.payment_method, status: row.status, notes: row.notes || null, items: items.recordset.map((item) => ({ id: Number(item.id), variantId: Number(item.variant_id), productName: item.name_ar, variantName: item.variant_name, sku: item.sku, quantity: Number(item.quantity), unitCost: Number(item.unit_cost), lineTotal: Number(item.line_total) })) };
}

async function createSale(body = {}, options = {}) {
    await ensureStoreTables();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length) throw appError('أضف منتجًا واحدًا على الأقل إلى السلة.');
    const itemMap = new Map();
    rawItems.forEach((item) => {
        const id = ensureId(item.variantId, 'متغير المنتج');
        const current = itemMap.get(id) || { variantId: id, quantity: 0, discountAmount: 0 };
        current.quantity += quantity(item.quantity);
        current.discountAmount += money(item.discountAmount || 0, 'خصم المنتج');
        itemMap.set(id, current);
    });
    const items = [...itemMap.values()];
    const requestedMemberId = body.memberId ? ensureId(body.memberId, 'العضو') : null;
    const discountAmount = money(body.discountAmount || 0, 'خصم الفاتورة');
    const taxAmount = money(body.taxAmount || 0, 'الضريبة');
    const result = await withTransaction(async (transaction) => {
        let member = null;
        if (requestedMemberId) {
            const memberResult = await transaction.request().input('id', sql.Int, requestedMemberId).query('SELECT id,full_name,phone FROM dbo.members WHERE id=@id;');
            member = memberResult.recordset[0];
            if (!member) throw appError('العضو غير موجود.', 404, 'MEMBER_NOT_FOUND');
        }
        const resolvedItems = [];
        for (const item of items) {
            const variantResult = await transaction.request().input('id', sql.Int, item.variantId).query(`SELECT v.id,v.product_id,v.variant_name,v.sku,v.selling_price,v.discount_price,v.purchase_cost,p.name_ar,p.track_inventory,p.is_active AS product_active,v.is_active AS is_active FROM dbo.gym_store_product_variants v INNER JOIN dbo.gym_store_products p ON p.id=v.product_id WHERE v.id=@id AND p.is_active=1;`);
            const variant = variantResult.recordset[0];
            if (!variant || !variant.product_active || !variant.is_active) throw appError('أحد المنتجات غير موجود أو غير فعال.', 400, 'STORE_VARIANT_NOT_FOUND');
            const current = variant.track_inventory ? await getLockedBalance(transaction, item.variantId) : { quantity: 0, averageCost: Number(variant.purchase_cost || 0) };
            if (variant.track_inventory && current.quantity < item.quantity) throw appError(`المخزون غير كافٍ للمنتج: ${variant.name_ar} - ${variant.variant_name}.`, 409, 'STORE_INSUFFICIENT_STOCK');
            const unitPrice = Number(variant.discount_price ?? variant.selling_price ?? 0);
            const lineDiscount = Math.min(item.quantity * unitPrice, item.discountAmount);
            const lineTotal = Math.max(0, item.quantity * unitPrice - lineDiscount);
            resolvedItems.push({ ...item, productId: Number(variant.product_id), productName: variant.name_ar, variantName: variant.variant_name, sku: variant.sku, unitPrice, lineDiscount, lineTotal, unitCost: current.averageCost, trackInventory: Boolean(variant.track_inventory), currentQuantity: current.quantity });
        }
        const subtotal = Math.round(resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
        if (discountAmount > subtotal) throw appError('خصم الفاتورة أكبر من الإجمالي.');
        const total = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;
        const paidAmount = money(body.paidAmount === undefined ? total : body.paidAmount, 'المبلغ المدفوع');
        if (paidAmount > total) throw appError('المبلغ المدفوع أكبر من إجمالي الفاتورة.');
        const phone = member?.phone || optionalString(body.customerPhone, 40);
        const name = member?.full_name || optionalString(body.customerName, 160) || 'عميل نقدي';
        let customerId = null;
        if (!member && (body.customerName || body.customerPhone)) {
            const normalized = normalizePhone(body.customerPhone);
            const existing = normalized ? await transaction.request().input('phone', sql.NVarChar(40), normalized).query('SELECT TOP (1) id FROM dbo.gym_store_customers WHERE phone_normalized=@phone ORDER BY id;') : { recordset: [] };
            if (existing.recordset[0]) customerId = Number(existing.recordset[0].id);
            else {
                const inserted = await transaction.request().input('name', sql.NVarChar(160), name).input('phone', sql.NVarChar(40), phone).input('normalized', sql.NVarChar(40), normalized).query(`INSERT INTO dbo.gym_store_customers(customer_type,customer_name,phone,phone_normalized) OUTPUT INSERTED.id VALUES ('walk_in',@name,@phone,@normalized);`);
                customerId = Number(inserted.recordset[0].id);
            }
        }
        const saleNumber = `ST-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const inserted = await transaction.request().input('saleNumber', sql.VarChar(50), saleNumber).input('memberId', sql.Int, member?.id || null).input('customerId', sql.Int, customerId).input('name', sql.NVarChar(160), name).input('phone', sql.NVarChar(40), phone).input('subtotal', sql.Decimal(12, 2), subtotal).input('discount', sql.Decimal(12, 2), discountAmount).input('tax', sql.Decimal(12, 2), taxAmount).input('total', sql.Decimal(12, 2), total).input('paid', sql.Decimal(12, 2), paidAmount).input('method', sql.VarChar(20), paymentMethod(body.paymentMethod)).input('notes', sql.NVarChar(1000), optionalString(body.notes, 1000)).input('actor', sql.Int, options.actorUserId || null).query(`INSERT INTO dbo.gym_store_sales(sale_number,member_id,customer_id,customer_name,customer_phone,subtotal,discount_amount,tax_amount,total_amount,paid_amount,payment_method,status,notes,created_by_user_id) OUTPUT INSERTED.id VALUES (@saleNumber,@memberId,@customerId,@name,@phone,@subtotal,@discount,@tax,@total,@paid,@method,'completed',@notes,@actor);`);
        const saleId = Number(inserted.recordset[0].id);
        for (const item of resolvedItems) {
            await transaction.request().input('saleId', sql.Int, saleId).input('variantId', sql.Int, item.variantId).input('productName', sql.NVarChar(180), item.productName).input('variantName', sql.NVarChar(160), item.variantName).input('sku', sql.VarChar(80), item.sku).input('quantity', sql.Decimal(12, 3), item.quantity).input('unitPrice', sql.Decimal(12, 2), item.unitPrice).input('discount', sql.Decimal(12, 2), item.lineDiscount).input('lineTotal', sql.Decimal(12, 2), item.lineTotal).input('cost', sql.Decimal(12, 2), item.unitCost).query(`INSERT INTO dbo.gym_store_sale_items(sale_id,variant_id,product_name,variant_name,sku,quantity,unit_price,discount_amount,line_total,unit_cost_snapshot) VALUES (@saleId,@variantId,@productName,@variantName,@sku,@quantity,@unitPrice,@discount,@lineTotal,@cost);`);
            if (item.trackInventory) {
                const nextQuantity = item.currentQuantity - item.quantity;
                await updateBalance(transaction, item.variantId, nextQuantity, item.unitCost);
                let remaining = item.quantity;
                const batches = await transaction.request().input('variantId', sql.Int, item.variantId).query('SELECT id,quantity_on_hand,unit_cost FROM dbo.gym_store_inventory_batches WITH (UPDLOCK,HOLDLOCK) WHERE variant_id=@variantId AND quantity_on_hand>0 ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date, received_at, id;');
                for (const batch of batches.recordset) {
                    if (remaining <= 0) break;
                    const taken = Math.min(remaining, Number(batch.quantity_on_hand));
                    await transaction.request().input('id', sql.Int, batch.id).input('taken', sql.Decimal(12, 3), taken).query('UPDATE dbo.gym_store_inventory_batches SET quantity_on_hand=quantity_on_hand-@taken WHERE id=@id;');
                    remaining -= taken;
                }
                await insertMovement(transaction, { variantId: item.variantId, type: 'sale', outQuantity: item.quantity, previousQuantity: item.currentQuantity, resultingQuantity: nextQuantity, unitCost: item.unitCost, referenceType: 'sale', referenceId: saleId, actorUserId: options.actorUserId });
            }
        }
        if (paidAmount > 0) await transaction.request().input('saleId', sql.Int, saleId).input('amount', sql.Decimal(12, 2), paidAmount).input('method', sql.VarChar(20), paymentMethod(body.paymentMethod)).input('actor', sql.Int, options.actorUserId || null).query('INSERT INTO dbo.gym_store_sale_payments(sale_id,amount,payment_method,created_by_user_id) VALUES (@saleId,@amount,@method,@actor);');
        await writeAudit(transaction, { action: 'sale_created', entityType: 'sale', entityId: saleId, details: { saleNumber, memberId: member?.id || null, total }, ...actorMeta(options) });
        return saleId;
    });
    return getSale(result);
}

async function getSale(id) {
    await ensureStoreTables();
    const saleId = ensureId(id, 'الفاتورة');
    const pool = await getPool();
    const head = await pool.request().input('id', sql.Int, saleId).query(`SELECT s.*, m.full_name AS member_name, m.phone AS member_phone FROM dbo.gym_store_sales s LEFT JOIN dbo.members m ON m.id=s.member_id WHERE s.id=@id;`);
    if (!head.recordset[0]) throw appError('الفاتورة غير موجودة.', 404, 'STORE_SALE_NOT_FOUND');
    const items = await pool.request().input('id', sql.Int, saleId).query('SELECT id,variant_id,product_name,variant_name,sku,quantity,unit_price,discount_amount,line_total,unit_cost_snapshot FROM dbo.gym_store_sale_items WHERE sale_id=@id ORDER BY id;');
    const row = head.recordset[0];
    return { id: Number(row.id), saleNumber: row.sale_number, memberId: row.member_id ? Number(row.member_id) : null, memberName: row.member_name || null, customerName: row.customer_name, customerPhone: row.customer_phone, saleDate: row.sale_date, subtotal: Number(row.subtotal), discountAmount: Number(row.discount_amount), taxAmount: Number(row.tax_amount), totalAmount: Number(row.total_amount), paidAmount: Number(row.paid_amount), remainingAmount: Number(row.remaining_amount), paymentMethod: row.payment_method, status: row.status, notes: row.notes || null, items: items.recordset.map((item) => ({ id: Number(item.id), variantId: Number(item.variant_id), productName: item.product_name, variantName: item.variant_name, sku: item.sku, quantity: Number(item.quantity), unitPrice: Number(item.unit_price), discountAmount: Number(item.discount_amount), lineTotal: Number(item.line_total), unitCost: Number(item.unit_cost_snapshot) })) };
}

async function listPurchases({ from, to, search = '', supplierId = '', page = 1, pageSize = 25 } = {}) {
    await ensureStoreTables();
    const range = rangeFromQuery({ from, to });
    const safePage = Math.max(1, Number(page) || 1);
    const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 25));
    const offset = (safePage - 1) * safeSize;
    const selectedSupplier = supplierId ? ensureId(supplierId, 'supplier') : 0;
    const pool = await getPool();
    const params = (request) => request.input('fromDate', sql.Date, toUtcDate(range.from)).input('nextDate', sql.Date, toUtcDate(range.nextDate))
        .input('pattern', sql.NVarChar(180), `%${String(search || '').trim()}%`).input('supplierId', sql.Int, selectedSupplier);
    const rows = await params(pool.request()).input('offset', sql.Int, offset).input('pageSize', sql.Int, safeSize).query(`
        SELECT p.id,p.invoice_number,p.purchase_date,p.supplier_id,s.supplier_name,p.subtotal,p.discount_amount,p.additional_cost,p.total_amount,p.paid_amount,p.remaining_amount,p.payment_method,p.status,
               (SELECT COUNT(*) FROM dbo.gym_store_purchase_items i WHERE i.purchase_id=p.id) AS item_count
        FROM dbo.gym_store_purchases p LEFT JOIN dbo.gym_store_suppliers s ON s.id=p.supplier_id
        WHERE p.purchase_date>=@fromDate AND p.purchase_date<@nextDate AND (@supplierId=0 OR p.supplier_id=@supplierId)
          AND (@pattern=N'' OR ISNULL(p.invoice_number,N'') LIKE @pattern OR ISNULL(s.supplier_name,N'') LIKE @pattern)
        ORDER BY p.purchase_date DESC,p.id DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
    const count = await params(pool.request()).query(`SELECT COUNT(*) total FROM dbo.gym_store_purchases p LEFT JOIN dbo.gym_store_suppliers s ON s.id=p.supplier_id
        WHERE p.purchase_date>=@fromDate AND p.purchase_date<@nextDate AND (@supplierId=0 OR p.supplier_id=@supplierId)
          AND (@pattern=N'' OR ISNULL(p.invoice_number,N'') LIKE @pattern OR ISNULL(s.supplier_name,N'') LIKE @pattern);`);
    const total = Number(count.recordset[0]?.total || 0);
    return {
        items: rows.recordset.map((row) => ({ id: Number(row.id), invoiceNumber: row.invoice_number || null, purchaseDate: formatDateOnly(row.purchase_date), supplierId: row.supplier_id ? Number(row.supplier_id) : null, supplierName: row.supplier_name || null, subtotal: Number(row.subtotal), discountAmount: Number(row.discount_amount), additionalCost: Number(row.additional_cost), totalAmount: Number(row.total_amount), paidAmount: Number(row.paid_amount), remainingAmount: Number(row.remaining_amount), paymentMethod: row.payment_method, status: row.status, itemCount: Number(row.item_count || 0) })),
        pagination: { page: safePage, pageSize: safeSize, total, totalPages: Math.ceil(total / safeSize) }
    };
}

async function listSales({ from, to, search = '', memberId = '', page = 1, pageSize = 25 } = {}) {
    await ensureStoreTables();
    const range = rangeFromQuery({ from, to });
    const safePage = Math.max(1, Number(page) || 1); const safeSize = Math.min(100, Math.max(1, Number(pageSize) || 25)); const offset = (safePage - 1) * safeSize;
    const selectedMember = memberId ? ensureId(memberId, 'العضو') : 0;
    const pool = await getPool();
    const request = pool.request().input('fromDate', sql.Date, toUtcDate(range.from)).input('nextDate', sql.Date, toUtcDate(range.nextDate)).input('pattern', sql.NVarChar(180), `%${String(search || '').trim()}%`).input('memberId', sql.Int, selectedMember).input('offset', sql.Int, offset).input('pageSize', sql.Int, safeSize);
    const rows = await request.query(`SELECT s.id,s.sale_number,s.sale_date,s.member_id,s.customer_name,s.customer_phone,s.subtotal,s.discount_amount,s.tax_amount,s.total_amount,s.paid_amount,s.remaining_amount,s.payment_method,s.status,m.full_name AS member_name,
        (SELECT COUNT(*) FROM dbo.gym_store_sale_items i WHERE i.sale_id=s.id) AS item_count
        FROM dbo.gym_store_sales s LEFT JOIN dbo.members m ON m.id=s.member_id
        WHERE s.sale_date>=@fromDate AND s.sale_date<@nextDate AND (@memberId=0 OR s.member_id=@memberId)
          AND (@pattern=N'' OR s.sale_number LIKE @pattern OR ISNULL(s.customer_name,N'') LIKE @pattern OR ISNULL(s.customer_phone,N'') LIKE @pattern OR ISNULL(m.full_name,N'') LIKE @pattern)
        ORDER BY s.sale_date DESC,s.id DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
    const count = await pool.request().input('fromDate', sql.Date, toUtcDate(range.from)).input('nextDate', sql.Date, toUtcDate(range.nextDate)).input('pattern', sql.NVarChar(180), `%${String(search || '').trim()}%`).input('memberId', sql.Int, selectedMember).query(`SELECT COUNT(*) total FROM dbo.gym_store_sales s LEFT JOIN dbo.members m ON m.id=s.member_id WHERE s.sale_date>=@fromDate AND s.sale_date<@nextDate AND (@memberId=0 OR s.member_id=@memberId) AND (@pattern=N'' OR s.sale_number LIKE @pattern OR ISNULL(s.customer_name,N'') LIKE @pattern OR ISNULL(s.customer_phone,N'') LIKE @pattern OR ISNULL(m.full_name,N'') LIKE @pattern);`);
    return { items: rows.recordset.map((row) => ({ id: Number(row.id), saleNumber: row.sale_number, saleDate: row.sale_date, memberId: row.member_id ? Number(row.member_id) : null, customerName: row.member_name || row.customer_name, customerPhone: row.customer_phone, subtotal: Number(row.subtotal), discountAmount: Number(row.discount_amount), taxAmount: Number(row.tax_amount), totalAmount: Number(row.total_amount), paidAmount: Number(row.paid_amount), remainingAmount: Number(row.remaining_amount), paymentMethod: row.payment_method, status: row.status, itemCount: Number(row.item_count || 0) })), pagination: { page: safePage, pageSize: safeSize, total: Number(count.recordset[0]?.total || 0), totalPages: Math.ceil(Number(count.recordset[0]?.total || 0) / safeSize) } };
}

async function createReturn(saleId, body = {}, options = {}) {
    await ensureStoreTables();
    const id = ensureId(saleId, 'الفاتورة');
    const requested = Array.isArray(body.items) ? body.items : [];
    if (!requested.length) throw appError('حدد منتجًا واحدًا على الأقل للمرتجع.');
    const result = await withTransaction(async (transaction) => {
        const saleResult = await transaction.request().input('id', sql.Int, id).query("SELECT id,status FROM dbo.gym_store_sales WITH (UPDLOCK,HOLDLOCK) WHERE id=@id;");
        if (!saleResult.recordset[0] || saleResult.recordset[0].status !== 'completed') throw appError('الفاتورة غير متاحة للمرتجع.', 400, 'STORE_SALE_NOT_RETURNABLE');
        let refund = 0; const returnItems = [];
        for (const item of requested) {
            const saleItemId = ensureId(item.saleItemId, 'بند الفاتورة');
            const requestedQty = quantity(item.quantity);
            const saleItemResult = await transaction.request().input('id', sql.Int, saleItemId).input('saleId', sql.Int, id).query('SELECT id,variant_id,quantity,unit_price,unit_cost_snapshot FROM dbo.gym_store_sale_items WHERE id=@id AND sale_id=@saleId;');
            const saleItem = saleItemResult.recordset[0];
            if (!saleItem) throw appError('بند المرتجع غير موجود.', 404);
            const returnedResult = await transaction.request().input('id', sql.Int, saleItemId).query("SELECT ISNULL(SUM(ri.quantity),0) returned FROM dbo.gym_store_return_items ri INNER JOIN dbo.gym_store_returns r ON r.id=ri.return_id WHERE ri.sale_item_id=@id AND r.status='completed';");
            const available = Number(saleItem.quantity) - Number(returnedResult.recordset[0]?.returned || 0);
            if (requestedQty > available) throw appError('كمية المرتجع أكبر من الكمية المتاحة.');
            refund += requestedQty * Number(saleItem.unit_price);
            returnItems.push({ saleItemId, variantId: Number(saleItem.variant_id), quantity: requestedQty, unitPrice: Number(saleItem.unit_price), unitCost: Number(saleItem.unit_cost_snapshot), restock: item.restock !== false });
        }
        const returnNumber = `SR-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const insert = await transaction.request().input('number', sql.VarChar(50), returnNumber).input('saleId', sql.Int, id).input('refund', sql.Decimal(12, 2), refund).input('method', sql.VarChar(20), paymentMethod(body.refundMethod || body.paymentMethod)).input('reason', sql.NVarChar(1000), optionalString(body.reason, 1000)).input('actor', sql.Int, options.actorUserId || null).query(`INSERT INTO dbo.gym_store_returns(return_number,sale_id,refund_amount,refund_method,reason,created_by_user_id) OUTPUT INSERTED.id VALUES (@number,@saleId,@refund,@method,@reason,@actor);`);
        const returnId = Number(insert.recordset[0].id);
        for (const item of returnItems) {
            await transaction.request().input('returnId', sql.Int, returnId).input('saleItemId', sql.Int, item.saleItemId).input('variantId', sql.Int, item.variantId).input('quantity', sql.Decimal(12, 3), item.quantity).input('unitPrice', sql.Decimal(12, 2), item.unitPrice).input('restock', sql.Bit, item.restock ? 1 : 0).query('INSERT INTO dbo.gym_store_return_items(return_id,sale_item_id,variant_id,quantity,unit_price,restock) VALUES (@returnId,@saleItemId,@variantId,@quantity,@unitPrice,@restock);');
            if (item.restock) {
                const current = await getLockedBalance(transaction, item.variantId);
                const nextQuantity = current.quantity + item.quantity;
                const nextCost = nextQuantity ? ((current.quantity * current.averageCost) + (item.quantity * item.unitCost)) / nextQuantity : item.unitCost;
                await updateBalance(transaction, item.variantId, nextQuantity, nextCost);
                await transaction.request().input('variantId', sql.Int, item.variantId).input('quantity', sql.Decimal(12, 3), item.quantity).input('unitCost', sql.Decimal(12, 2), item.unitCost).input('lot', sql.NVarChar(100), null).input('returnId', sql.Int, returnId).query('INSERT INTO dbo.gym_store_inventory_batches(variant_id,quantity_on_hand,unit_cost,lot_number) VALUES (@variantId,@quantity,@unitCost,@lot);');
                await insertMovement(transaction, { variantId: item.variantId, type: 'sale_return', inQuantity: item.quantity, previousQuantity: current.quantity, resultingQuantity: nextQuantity, unitCost: item.unitCost, referenceType: 'return', referenceId: returnId, actorUserId: options.actorUserId });
            }
        }
        await writeAudit(transaction, { action: 'sale_return_created', entityType: 'return', entityId: returnId, details: { saleId: id, refund }, ...actorMeta(options) });
        return returnId;
    });
    return { id: result, saleId: id, refundAmount: refund };
}

async function adjustInventory(body = {}, options = {}) {
    await ensureStoreTables();
    const variantId = ensureId(body.variantId, 'variant');
    const amount = quantity(body.quantity, 'quantity');
    const direction = String(body.direction || body.quantityDirection || 'in').toLowerCase();
    if (!['in', 'out'].includes(direction)) throw appError('Inventory direction is invalid.');
    const movementType = String(body.movementType || 'adjustment').toLowerCase();
    if (!['adjustment', 'damaged', 'expired', 'manual'].includes(movementType)) throw appError('Inventory movement type is invalid.');
    return withTransaction(async (transaction) => {
        const variantResult = await transaction.request().input('id', sql.Int, variantId).query('SELECT v.id,v.purchase_cost,p.track_inventory FROM dbo.gym_store_product_variants v INNER JOIN dbo.gym_store_products p ON p.id=v.product_id WHERE v.id=@id AND v.is_active=1 AND p.is_active=1;');
        if (!variantResult.recordset[0]) throw appError('Product variant not found.', 404, 'STORE_VARIANT_NOT_FOUND');
        const current = await getLockedBalance(transaction, variantId);
        const nextQuantity = direction === 'out' ? current.quantity - amount : current.quantity + amount;
        if (nextQuantity < 0) throw appError('Insufficient stock for this adjustment.', 409, 'STORE_INSUFFICIENT_STOCK');
        await updateBalance(transaction, variantId, nextQuantity, current.averageCost);
        if (direction === 'in') {
            const unitCost = money(body.unitCost ?? current.averageCost, 'unit cost');
            await transaction.request().input('variantId', sql.Int, variantId).input('quantity', sql.Decimal(12, 3), amount).input('unitCost', sql.Decimal(12, 2), unitCost).input('lot', sql.NVarChar(100), optionalString(body.lotNumber, 100)).input('expiry', sql.Date, body.expiryDate ? toUtcDate(dateOnly(body.expiryDate, 'expiry date')) : null).query('INSERT INTO dbo.gym_store_inventory_batches(variant_id,quantity_on_hand,unit_cost,lot_number,expiry_date) VALUES (@variantId,@quantity,@unitCost,@lot,@expiry);');
        } else {
            let remaining = amount;
            const batches = await transaction.request().input('variantId', sql.Int, variantId).query('SELECT id,quantity_on_hand FROM dbo.gym_store_inventory_batches WITH (UPDLOCK,HOLDLOCK) WHERE variant_id=@variantId AND quantity_on_hand>0 ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date, received_at, id;');
            for (const batch of batches.recordset) {
                if (remaining <= 0) break;
                const taken = Math.min(remaining, Number(batch.quantity_on_hand));
                await transaction.request().input('id', sql.Int, batch.id).input('taken', sql.Decimal(12, 3), taken).query('UPDATE dbo.gym_store_inventory_batches SET quantity_on_hand=quantity_on_hand-@taken WHERE id=@id;');
                remaining -= taken;
            }
        }
        await insertMovement(transaction, { variantId, type: movementType, inQuantity: direction === 'in' ? amount : 0, outQuantity: direction === 'out' ? amount : 0, previousQuantity: current.quantity, resultingQuantity: nextQuantity, unitCost: current.averageCost, referenceType: 'inventory_adjustment', actorUserId: options.actorUserId, notes: optionalString(body.notes, 1000) });
        await writeAudit(transaction, { action: 'inventory_adjusted', entityType: 'product_variant', entityId: variantId, details: { direction, quantity: amount, movementType }, ...actorMeta(options) });
        return { variantId, previousQuantity: current.quantity, resultingQuantity: nextQuantity };
    });
}

async function getDashboard({ from, to, includeProfit = false, readOnly = false } = {}) {
    await ensureStoreTables();
    const range = rangeFromQuery({ from, to });
    const report = await getReports({ from: range.from, to: range.to, includeProfit, readOnly });
    const currentDay = todayInTimeZone();
    const todayNext = addDays(currentDay, 1);
    const todayResult = await getPool().then((pool) => pool.request()
        .input('fromDate', sql.Date, toUtcDate(currentDay))
        .input('nextDate', sql.Date, toUtcDate(todayNext))
        .query("SELECT COUNT(*) AS orders, ISNULL(SUM(total_amount),0) AS revenue FROM dbo.gym_store_sales WHERE status='completed' AND sale_date>=@fromDate AND sale_date<@nextDate;"));
    // getReports already loads the complete active inventory. Reuse it for
    // dashboard alerts instead of issuing two more grouped inventory queries.
    // The filtering mirrors listInventory's HAVING clauses and keeps the
    // dashboard response shape unchanged.
    const inventory = report.inventory || [];
    const expiryLimit = addDays(currentDay, 30);
    const lowStock = inventory.filter((item) => item.lowStock);
    const expiring = inventory.filter((item) => item.nearestExpiry && item.nearestExpiry <= expiryLimit);
    const todaySummary = todayResult.recordset[0] || {};
    return {
        period: range,
        summary: report.summary,
        profit: report.profit,
        paymentMethods: report.paymentMethods,
        bestSelling: report.bestSelling,
        byCategory: report.byCategory,
        today: { orders: Number(todaySummary.orders || 0), revenue: Number(todaySummary.revenue || 0) },
        alerts: { lowStock: lowStock.slice(0, 12), expiring: expiring.slice(0, 12) }
    };
}

async function getReports({ from, to, includeProfit = false, readOnly = false } = {}) {
    await ensureStoreTables();
    const range = rangeFromQuery({ from, to });
    const pool = await getPool();
    const base = () => pool.request().input('fromDate', sql.Date, toUtcDate(range.from)).input('nextDate', sql.Date, toUtcDate(range.nextDate));
    const [sales, expense, purchases, inventory] = await Promise.all([
        base().batch(`
        SELECT COUNT(*) order_count, ISNULL(SUM(total_amount),0) revenue, ISNULL(SUM(discount_amount),0) discounts, ISNULL(SUM(paid_amount),0) paid, ISNULL(SUM(remaining_amount),0) remaining FROM dbo.gym_store_sales WHERE status='completed' AND sale_date>=@fromDate AND sale_date<@nextDate;
        SELECT payment_method, COUNT(*) order_count, ISNULL(SUM(total_amount),0) amount FROM dbo.gym_store_sales WHERE status='completed' AND sale_date>=@fromDate AND sale_date<@nextDate GROUP BY payment_method ORDER BY amount DESC;
        SELECT TOP (20) i.product_name, i.variant_name, i.sku, SUM(i.quantity) quantity, SUM(i.line_total) revenue, SUM(i.quantity*i.unit_cost_snapshot) cogs FROM dbo.gym_store_sale_items i INNER JOIN dbo.gym_store_sales s ON s.id=i.sale_id WHERE s.status='completed' AND s.sale_date>=@fromDate AND s.sale_date<@nextDate GROUP BY i.product_name,i.variant_name,i.sku ORDER BY revenue DESC;
        SELECT ISNULL(SUM(ri.quantity*si.unit_cost_snapshot),0) returned_cogs, ISNULL(SUM(r.refund_amount),0) refunds FROM dbo.gym_store_return_items ri INNER JOIN dbo.gym_store_returns r ON r.id=ri.return_id INNER JOIN dbo.gym_store_sale_items si ON si.id=ri.sale_item_id INNER JOIN dbo.gym_store_sales s ON s.id=r.sale_id WHERE r.status='completed' AND s.sale_date>=@fromDate AND s.sale_date<@nextDate;
        SELECT CONVERT(date,s.sale_date) sale_date, COUNT(*) order_count, ISNULL(SUM(s.total_amount),0) revenue FROM dbo.gym_store_sales s WHERE s.status='completed' AND s.sale_date>=@fromDate AND s.sale_date<@nextDate GROUP BY CONVERT(date,s.sale_date) ORDER BY sale_date DESC;
        SELECT c.category_code, c.name_ar category_name, SUM(i.quantity) quantity, ISNULL(SUM(i.line_total),0) revenue, ISNULL(SUM(i.quantity*i.unit_cost_snapshot),0) cogs
        FROM dbo.gym_store_sale_items i INNER JOIN dbo.gym_store_sales s ON s.id=i.sale_id INNER JOIN dbo.gym_store_product_variants v ON v.id=i.variant_id INNER JOIN dbo.gym_store_products p ON p.id=v.product_id INNER JOIN dbo.gym_store_categories c ON c.id=p.category_id
        WHERE s.status='completed' AND s.sale_date>=@fromDate AND s.sale_date<@nextDate GROUP BY c.category_code,c.name_ar ORDER BY revenue DESC;
        SELECT COALESCE(m.full_name,s.customer_name,N'عميل نقدي') customer_name, COALESCE(m.phone,s.customer_phone) customer_phone, COUNT(*) order_count, ISNULL(SUM(s.total_amount),0) revenue
        FROM dbo.gym_store_sales s LEFT JOIN dbo.members m ON m.id=s.member_id
        WHERE s.status='completed' AND s.sale_date>=@fromDate AND s.sale_date<@nextDate GROUP BY COALESCE(m.full_name,s.customer_name,N'عميل نقدي'),COALESCE(m.phone,s.customer_phone) ORDER BY revenue DESC;
        SELECT r.id,r.return_number,r.sale_id,r.refund_amount,r.refund_method,r.reason,r.created_at,s.sale_number
        FROM dbo.gym_store_returns r INNER JOIN dbo.gym_store_sales s ON s.id=r.sale_id
        WHERE r.status='completed' AND r.created_at>=@fromDate AND r.created_at<@nextDate ORDER BY r.created_at DESC,r.id DESC;
    `),
        base().input('source', sql.VarChar(20), 'store').query(`SELECT COUNT(*) expense_count, ISNULL(SUM(amount),0) amount FROM dbo.gym_expenses WHERE expense_source=@source AND ISNULL(is_voided,0)=0 AND expense_date>=@fromDate AND expense_date<@nextDate;`),
        base().query(`SELECT p.id,p.invoice_number,p.purchase_date,s.supplier_name,p.total_amount,p.paid_amount,p.remaining_amount,p.payment_method,p.status,(SELECT COUNT(*) FROM dbo.gym_store_purchase_items i WHERE i.purchase_id=p.id) item_count FROM dbo.gym_store_purchases p LEFT JOIN dbo.gym_store_suppliers s ON s.id=p.supplier_id WHERE p.status='received' AND p.purchase_date>=@fromDate AND p.purchase_date<@nextDate ORDER BY p.purchase_date DESC,p.id DESC;`),
        listInventory({ readOnly })
    ]);
    const summary = sales.recordsets[0]?.[0] || {}; const returns = sales.recordsets[3]?.[0] || {}; const storeExpenses = Number(expense.recordset[0]?.amount || 0);
    const revenue = Number(summary.revenue || 0) - Number(returns.refunds || 0);
    const cogs = includeProfit ? Math.max(0, Number(sales.recordsets[2]?.reduce((sum, row) => sum + Number(row.cogs || 0), 0) || 0) - Number(returns.returned_cogs || 0)) : null;
    const result = {
        period: range,
        summary: { orders: Number(summary.order_count || 0), revenue, paid: Number(summary.paid || 0), remaining: Number(summary.remaining || 0), refunds: Number(returns.refunds || 0), discounts: Number(summary.discounts || 0), storeExpenses },
        paymentMethods: (sales.recordsets[1] || []).map((row) => ({ method: row.payment_method, orders: Number(row.order_count || 0), amount: Number(row.amount || 0) })),
        bestSelling: (sales.recordsets[2] || []).map((row) => ({ productName: row.product_name, variantName: row.variant_name, sku: row.sku, quantity: Number(row.quantity || 0), revenue: Number(row.revenue || 0), ...(includeProfit ? { cogs: Number(row.cogs || 0) } : {}) })),
        dailySales: (sales.recordsets[4] || []).map((row) => ({ date: formatDateOnly(row.sale_date), orders: Number(row.order_count || 0), revenue: Number(row.revenue || 0) })),
        byCategory: (sales.recordsets[5] || []).map((row) => ({ code: row.category_code, name: row.category_name, quantity: Number(row.quantity || 0), revenue: Number(row.revenue || 0), ...(includeProfit ? { cogs: Number(row.cogs || 0) } : {}) })),
        byCustomer: (sales.recordsets[6] || []).map((row) => ({ name: row.customer_name, phone: row.customer_phone || null, orders: Number(row.order_count || 0), revenue: Number(row.revenue || 0) })),
        returns: (sales.recordsets[7] || []).map((row) => ({ id: Number(row.id), returnNumber: row.return_number, saleId: Number(row.sale_id), saleNumber: row.sale_number, refundAmount: Number(row.refund_amount || 0), refundMethod: row.refund_method, reason: row.reason || null, createdAt: row.created_at })),
        purchases: (purchases.recordset || []).map((row) => ({ id: Number(row.id), invoiceNumber: row.invoice_number || null, purchaseDate: formatDateOnly(row.purchase_date), supplierName: row.supplier_name || null, totalAmount: Number(row.total_amount || 0), paidAmount: Number(row.paid_amount || 0), remainingAmount: Number(row.remaining_amount || 0), paymentMethod: row.payment_method, status: row.status, itemCount: Number(row.item_count || 0) })),
        inventory: inventory.map((item) => includeProfit ? item : (({ purchaseCost, averageCost, ...safe }) => safe)(item))
    };
    if (includeProfit) result.expenses = await listStoreExpenses({ from: range.from, to: range.to });
    if (includeProfit) { result.profit = { cogs, grossProfit: revenue - cogs, expenses: storeExpenses, netProfit: revenue - cogs - storeExpenses }; }
    return result;
}

async function listStockMovements({ variantId = '', from, to, page = 1, pageSize = 50 } = {}) {
    await ensureStoreTables();
    const range = rangeFromQuery({ from, to });
    const selectedVariant = variantId ? ensureId(variantId, 'متغير المنتج') : 0;
    const safePage = Math.max(1, Number(page) || 1); const safeSize = Math.min(200, Math.max(1, Number(pageSize) || 50)); const offset = (safePage - 1) * safeSize;
    const pool = await getPool();
    const request = pool.request().input('variantId', sql.Int, selectedVariant).input('fromDate', sql.Date, toUtcDate(range.from)).input('nextDate', sql.Date, toUtcDate(range.nextDate)).input('offset', sql.Int, offset).input('pageSize', sql.Int, safeSize);
    const rows = await request.query(`SELECT sm.id,sm.variant_id,sm.movement_type,sm.quantity_in,sm.quantity_out,sm.previous_quantity,sm.resulting_quantity,sm.unit_cost,sm.reference_type,sm.reference_id,sm.notes,sm.created_at,p.name_ar product_name,v.variant_name,v.sku FROM dbo.gym_store_stock_movements sm INNER JOIN dbo.gym_store_product_variants v ON v.id=sm.variant_id INNER JOIN dbo.gym_store_products p ON p.id=v.product_id WHERE (@variantId=0 OR sm.variant_id=@variantId) AND sm.created_at>=@fromDate AND sm.created_at<@nextDate ORDER BY sm.created_at DESC,sm.id DESC OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;`);
    const count = await pool.request().input('variantId', sql.Int, selectedVariant).input('fromDate', sql.Date, toUtcDate(range.from)).input('nextDate', sql.Date, toUtcDate(range.nextDate)).query('SELECT COUNT_BIG(*) total FROM dbo.gym_store_stock_movements WHERE (@variantId=0 OR variant_id=@variantId) AND created_at>=@fromDate AND created_at<@nextDate;');
    const total = Number(count.recordset[0]?.total || 0);
    return { items: rows.recordset.map((row) => ({ id: Number(row.id), variantId: Number(row.variant_id), productName: row.product_name, variantName: row.variant_name, sku: row.sku, movementType: row.movement_type, quantityIn: Number(row.quantity_in || 0), quantityOut: Number(row.quantity_out || 0), previousQuantity: Number(row.previous_quantity || 0), resultingQuantity: Number(row.resulting_quantity || 0), unitCost: Number(row.unit_cost || 0), referenceType: row.reference_type || null, referenceId: row.reference_id ? Number(row.reference_id) : null, notes: row.notes || null, createdAt: row.created_at })), pagination: { page: safePage, pageSize: safeSize, total, totalPages: Math.ceil(total / safeSize) } };
}

async function listStoreExpenses({ from, to } = {}) {
    await ensureStoreTables();
    const range = rangeFromQuery({ from, to });
    const result = await getPool().then((pool) => pool.request().input('source', sql.VarChar(20), 'store').input('fromDate', sql.Date, toUtcDate(range.from)).input('nextDate', sql.Date, toUtcDate(range.nextDate)).query(`SELECT id,expense_name,amount,expense_date,expense_category,payment_method,notes,created_at FROM dbo.gym_expenses WHERE expense_source=@source AND ISNULL(is_voided,0)=0 AND expense_date>=@fromDate AND expense_date<@nextDate ORDER BY expense_date DESC,id DESC;`));
    return result.recordset.map((row) => ({ id: Number(row.id), name: row.expense_name, amount: Number(row.amount), expenseDate: formatDateOnly(row.expense_date), category: row.expense_category || null, paymentMethod: row.payment_method || 'cash', notes: row.notes || null, createdAt: row.created_at }));
}

async function createStoreExpense(body = {}, options = {}) {
    await ensureStoreTables();
    const values = { name: requiredString(body.name ?? body.expenseName, 'اسم مصروف المتجر', 120), amount: money(body.amount, 'قيمة المصروف', false), expenseDate: dateOnly(body.expenseDate, 'تاريخ المصروف'), category: optionalString(body.category, 80), paymentMethod: paymentMethod(body.paymentMethod), notes: optionalString(body.notes, 500) };
    const result = await getPool().then((pool) => pool.request().input('name', sql.NVarChar(120), values.name).input('amount', sql.Decimal(12, 2), values.amount).input('date', sql.Date, toUtcDate(values.expenseDate)).input('source', sql.VarChar(20), 'store').input('category', sql.NVarChar(80), values.category).input('method', sql.VarChar(20), values.paymentMethod).input('notes', sql.NVarChar(500), values.notes).input('actor', sql.Int, options.actorUserId || null).query(`INSERT INTO dbo.gym_expenses(expense_name,amount,expense_date,expense_source,expense_category,payment_method,notes,created_by_user_id) OUTPUT INSERTED.* VALUES (@name,@amount,@date,@source,@category,@method,@notes,@actor);`));
    await writeAudit(await getPool(), { action: 'store_expense_created', entityType: 'expense', entityId: result.recordset[0].id, details: { amount: values.amount, category: values.category }, ...actorMeta(options) });
    return { id: Number(result.recordset[0].id), name: result.recordset[0].expense_name, amount: Number(result.recordset[0].amount), expenseDate: formatDateOnly(result.recordset[0].expense_date), category: result.recordset[0].expense_category || null, paymentMethod: result.recordset[0].payment_method || 'cash', notes: result.recordset[0].notes || null };
}

async function updateStoreExpense(id, body = {}, options = {}) {
    await ensureStoreTables();
    const expenseId = ensureId(id, 'مصروف المتجر');
    const values = { name: requiredString(body.name ?? body.expenseName, 'اسم مصروف المتجر', 120), amount: money(body.amount, 'قيمة المصروف', false), expenseDate: dateOnly(body.expenseDate, 'تاريخ المصروف'), category: optionalString(body.category, 80), paymentMethod: paymentMethod(body.paymentMethod), notes: optionalString(body.notes, 500) };
    const result = await getPool().then((pool) => pool.request().input('id', sql.Int, expenseId).input('name', sql.NVarChar(120), values.name).input('amount', sql.Decimal(12, 2), values.amount).input('date', sql.Date, toUtcDate(values.expenseDate)).input('category', sql.NVarChar(80), values.category).input('method', sql.VarChar(20), values.paymentMethod).input('notes', sql.NVarChar(500), values.notes).query(`UPDATE dbo.gym_expenses SET expense_name=@name,amount=@amount,expense_date=@date,expense_category=@category,payment_method=@method,notes=@notes,updated_at=SYSUTCDATETIME() OUTPUT INSERTED.* WHERE id=@id AND expense_source='store' AND ISNULL(is_voided,0)=0;`));
    if (!result.recordset[0]) throw appError('مصروف المتجر غير موجود.', 404, 'STORE_EXPENSE_NOT_FOUND');
    await writeAudit(await getPool(), { action: 'store_expense_updated', entityType: 'expense', entityId: expenseId, details: { amount: values.amount, category: values.category }, ...actorMeta(options) });
    return { id: Number(result.recordset[0].id), name: result.recordset[0].expense_name, amount: Number(result.recordset[0].amount), expenseDate: formatDateOnly(result.recordset[0].expense_date), category: result.recordset[0].expense_category || null, paymentMethod: result.recordset[0].payment_method || 'cash', notes: result.recordset[0].notes || null };
}

async function deleteStoreExpense(id, options = {}) {
    await ensureStoreTables();
    const expenseId = ensureId(id, 'مصروف المتجر');
    const result = await getPool().then((pool) => pool.request().input('id', sql.Int, expenseId).input('actor', sql.Int, options.actorUserId || null).query("UPDATE dbo.gym_expenses SET is_voided=1,voided_at=SYSUTCDATETIME(),voided_by_user_id=@actor,updated_at=SYSUTCDATETIME() WHERE id=@id AND expense_source='store' AND ISNULL(is_voided,0)=0;"));
    if (!result.rowsAffected[0]) throw appError('مصروف المتجر غير موجود.', 404, 'STORE_EXPENSE_NOT_FOUND');
    await writeAudit(await getPool(), { action: 'store_expense_voided', entityType: 'expense', entityId: expenseId, details: { reason: 'user_request' }, ...actorMeta(options) });
}

async function getMemberPurchases(memberId, { from, to } = {}) {
    await ensureStoreTables();
    const id = ensureId(memberId, 'العضو');
    const pool = await getPool();
    const memberResult = await pool.request().input('memberId', sql.Int, id).query('SELECT registration_date FROM dbo.members WHERE id=@memberId;');
    if (!memberResult.recordset[0]) throw appError('العضو غير موجود.', 404, 'MEMBER_NOT_FOUND');
    const historyFrom = dateOnly(from || formatDateOnly(memberResult.recordset[0].registration_date), 'تاريخ بداية مشتريات العضو');
    const historyTo = dateOnly(to, 'تاريخ نهاية مشتريات العضو');
    if (historyFrom > historyTo) throw appError('تاريخ بداية المشتريات يجب أن يسبق تاريخ النهاية.');
    const range = { from: historyFrom, to: historyTo, nextDate: addDays(historyTo, 1) };
    const result = await pool.request().input('memberId', sql.Int, id).input('fromDate', sql.Date, toUtcDate(range.from)).input('nextDate', sql.Date, toUtcDate(range.nextDate)).query(`SELECT s.id,s.sale_number,s.sale_date,s.total_amount,s.paid_amount,s.remaining_amount,s.payment_method,s.status,
        (SELECT STRING_AGG(CONCAT(i.product_name,N' - ',i.variant_name,N' × ',CONVERT(nvarchar(30),i.quantity)), N'، ') FROM dbo.gym_store_sale_items i WHERE i.sale_id=s.id) items
        FROM dbo.gym_store_sales s WHERE s.member_id=@memberId AND s.sale_date>=@fromDate AND s.sale_date<@nextDate ORDER BY s.sale_date DESC,s.id DESC;`);
    return result.recordset.map((row) => ({ id: Number(row.id), saleNumber: row.sale_number, saleDate: row.sale_date, totalAmount: Number(row.total_amount), paidAmount: Number(row.paid_amount), remainingAmount: Number(row.remaining_amount), paymentMethod: row.payment_method, status: row.status, items: row.items || '' }));
}

module.exports = {
    adjustInventory,
    createCategory,
    createProduct,
    createVariant,
    createPurchase,
    createReturn,
    createSale,
    createStoreExpense,
    createSupplier,
    deleteStoreExpense,
    ensureStoreTables,
    getDashboard,
    getMemberPurchases,
    getProduct,
    getPurchase,
    getReports,
    getSale,
    listCategories,
    listInventory,
    listPurchases,
    listProducts,
    listSales,
    listStockMovements,
    listStoreExpenses,
    listSuppliers,
    searchCustomers,
    setProductStatus,
    deactivateVariant,
    updateCategory,
    updateProduct,
    updateVariant,
    updateStoreExpense,
    updateSupplier
};
