/*
   TOP GYM Store / POS / Inventory migration.
   Safe to execute repeatedly: every object is created only when missing.
   Inventory balance is a cache; gym_store_stock_movements is the audit ledger.
*/

IF COL_LENGTH(N'dbo.gym_expenses', N'expense_source') IS NULL
    ALTER TABLE dbo.gym_expenses ADD expense_source VARCHAR(20) NOT NULL CONSTRAINT DF_gym_expenses_source_store_migration DEFAULT ('gym');
IF COL_LENGTH(N'dbo.gym_expenses', N'expense_category') IS NULL
    ALTER TABLE dbo.gym_expenses ADD expense_category NVARCHAR(80) NULL;
IF COL_LENGTH(N'dbo.gym_expenses', N'payment_method') IS NULL
    ALTER TABLE dbo.gym_expenses ADD payment_method VARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.gym_expenses', N'created_by_user_id') IS NULL
    ALTER TABLE dbo.gym_expenses ADD created_by_user_id INT NULL;
IF COL_LENGTH(N'dbo.gym_expenses', N'is_voided') IS NULL
    ALTER TABLE dbo.gym_expenses ADD is_voided BIT NOT NULL CONSTRAINT DF_gym_expenses_voided_store_migration DEFAULT (0);
IF COL_LENGTH(N'dbo.gym_expenses', N'voided_at') IS NULL
    ALTER TABLE dbo.gym_expenses ADD voided_at DATETIME2(0) NULL;
IF COL_LENGTH(N'dbo.gym_expenses', N'voided_by_user_id') IS NULL
    ALTER TABLE dbo.gym_expenses ADD voided_by_user_id INT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_expenses_source_date' AND object_id = OBJECT_ID(N'dbo.gym_expenses'))
    CREATE INDEX IX_gym_expenses_source_date ON dbo.gym_expenses(expense_source, expense_date DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_store_categories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_categories (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_categories PRIMARY KEY,
        category_code VARCHAR(40) NOT NULL,
        name_ar NVARCHAR(120) NOT NULL,
        name_en NVARCHAR(120) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_gym_store_categories_active DEFAULT (1),
        sort_order INT NOT NULL CONSTRAINT DF_gym_store_categories_sort DEFAULT (0),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_categories_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_categories_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_store_categories_code UNIQUE (category_code)
    );
END;

IF OBJECT_ID(N'dbo.gym_store_suppliers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_suppliers (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_suppliers PRIMARY KEY,
        supplier_name NVARCHAR(160) NOT NULL,
        phone NVARCHAR(40) NULL,
        email NVARCHAR(254) NULL,
        address NVARCHAR(500) NULL,
        tax_reference NVARCHAR(120) NULL,
        notes NVARCHAR(1000) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_gym_store_suppliers_active DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_suppliers_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_suppliers_updated DEFAULT (SYSUTCDATETIME())
    );
END;

IF OBJECT_ID(N'dbo.gym_store_products', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_products (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_products PRIMARY KEY,
        category_id INT NOT NULL,
        sku VARCHAR(80) NOT NULL,
        barcode VARCHAR(120) NULL,
        name_ar NVARCHAR(180) NOT NULL,
        name_en NVARCHAR(180) NULL,
        description NVARCHAR(2000) NULL,
        brand NVARCHAR(120) NULL,
        image_path NVARCHAR(500) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_gym_store_products_active DEFAULT (1),
        track_inventory BIT NOT NULL CONSTRAINT DF_gym_store_products_track_inventory DEFAULT (1),
        minimum_stock DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_store_products_minimum_stock DEFAULT (0),
        tax_rate DECIMAL(6,3) NOT NULL CONSTRAINT DF_gym_store_products_tax_rate DEFAULT (0),
        created_by_user_id INT NULL,
        updated_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_products_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_products_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_products_category FOREIGN KEY (category_id) REFERENCES dbo.gym_store_categories(id),
        CONSTRAINT UQ_gym_store_products_sku UNIQUE (sku),
        CONSTRAINT CK_gym_store_products_minimum_stock CHECK (minimum_stock >= 0),
        CONSTRAINT CK_gym_store_products_tax_rate CHECK (tax_rate >= 0 AND tax_rate <= 100)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_gym_store_products_barcode' AND object_id = OBJECT_ID(N'dbo.gym_store_products'))
    CREATE UNIQUE INDEX UX_gym_store_products_barcode ON dbo.gym_store_products(barcode) WHERE barcode IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_products_category_active' AND object_id = OBJECT_ID(N'dbo.gym_store_products'))
    CREATE INDEX IX_gym_store_products_category_active ON dbo.gym_store_products(category_id, is_active, id DESC);

IF OBJECT_ID(N'dbo.gym_store_product_variants', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_product_variants (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_product_variants PRIMARY KEY,
        product_id INT NOT NULL,
        variant_name NVARCHAR(160) NOT NULL,
        sku VARCHAR(80) NOT NULL,
        barcode VARCHAR(120) NULL,
        size_label NVARCHAR(60) NULL,
        color_label NVARCHAR(60) NULL,
        flavor_label NVARCHAR(80) NULL,
        weight_label NVARCHAR(60) NULL,
        purchase_cost DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_variants_cost DEFAULT (0),
        selling_price DECIMAL(12,2) NOT NULL,
        discount_price DECIMAL(12,2) NULL,
        minimum_stock DECIMAL(12,3) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_gym_store_variants_active DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_variants_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_variants_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_variants_product FOREIGN KEY (product_id) REFERENCES dbo.gym_store_products(id) ON DELETE CASCADE,
        CONSTRAINT UQ_gym_store_variants_sku UNIQUE (sku),
        CONSTRAINT CK_gym_store_variants_cost CHECK (purchase_cost >= 0),
        CONSTRAINT CK_gym_store_variants_price CHECK (selling_price >= 0 AND (discount_price IS NULL OR (discount_price >= 0 AND discount_price <= selling_price))),
        CONSTRAINT CK_gym_store_variants_minimum_stock CHECK (minimum_stock IS NULL OR minimum_stock >= 0)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_gym_store_variants_barcode' AND object_id = OBJECT_ID(N'dbo.gym_store_product_variants'))
    CREATE UNIQUE INDEX UX_gym_store_variants_barcode ON dbo.gym_store_product_variants(barcode) WHERE barcode IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_variants_product_active' AND object_id = OBJECT_ID(N'dbo.gym_store_product_variants'))
    CREATE INDEX IX_gym_store_variants_product_active ON dbo.gym_store_product_variants(product_id, is_active, id);

IF OBJECT_ID(N'dbo.gym_store_customers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_customers (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_customers PRIMARY KEY,
        customer_type VARCHAR(20) NOT NULL CONSTRAINT DF_gym_store_customers_type DEFAULT ('walk_in'),
        member_id INT NULL,
        customer_name NVARCHAR(160) NULL,
        phone NVARCHAR(40) NULL,
        phone_normalized NVARCHAR(40) NULL,
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_customers_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_customers_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_customers_member FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_store_customers_type CHECK (customer_type IN ('member', 'walk_in'))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_gym_store_customers_member' AND object_id = OBJECT_ID(N'dbo.gym_store_customers'))
    CREATE UNIQUE INDEX UX_gym_store_customers_member ON dbo.gym_store_customers(member_id) WHERE member_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_customers_phone' AND object_id = OBJECT_ID(N'dbo.gym_store_customers'))
    CREATE INDEX IX_gym_store_customers_phone ON dbo.gym_store_customers(phone_normalized, id DESC);

IF OBJECT_ID(N'dbo.gym_store_purchases', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_purchases (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_purchases PRIMARY KEY,
        supplier_id INT NULL,
        invoice_number NVARCHAR(120) NULL,
        purchase_date DATE NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL,
        discount_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_purchases_discount DEFAULT (0),
        additional_cost DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_purchases_additional DEFAULT (0),
        total_amount DECIMAL(12,2) NOT NULL,
        paid_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_purchases_paid DEFAULT (0),
        remaining_amount AS (total_amount - paid_amount) PERSISTED,
        payment_method VARCHAR(20) NOT NULL CONSTRAINT DF_gym_store_purchases_method DEFAULT ('cash'),
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_store_purchases_status DEFAULT ('received'),
        notes NVARCHAR(1000) NULL,
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_purchases_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_purchases_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES dbo.gym_store_suppliers(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_store_purchases_amounts CHECK (subtotal >= 0 AND discount_amount >= 0 AND additional_cost >= 0 AND total_amount >= 0 AND paid_amount >= 0 AND paid_amount <= total_amount),
        CONSTRAINT CK_gym_store_purchases_method CHECK (payment_method IN ('cash', 'card', 'transfer', 'wallet', 'other')),
        CONSTRAINT CK_gym_store_purchases_status CHECK (status IN ('draft', 'received', 'cancelled'))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_purchases_date' AND object_id = OBJECT_ID(N'dbo.gym_store_purchases'))
    CREATE INDEX IX_gym_store_purchases_date ON dbo.gym_store_purchases(purchase_date DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_store_purchase_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_purchase_items (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_purchase_items PRIMARY KEY,
        purchase_id INT NOT NULL,
        variant_id INT NOT NULL,
        quantity DECIMAL(12,3) NOT NULL,
        unit_cost DECIMAL(12,2) NOT NULL,
        line_total DECIMAL(12,2) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_purchase_items_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_purchase_items_purchase FOREIGN KEY (purchase_id) REFERENCES dbo.gym_store_purchases(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_store_purchase_items_variant FOREIGN KEY (variant_id) REFERENCES dbo.gym_store_product_variants(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_store_purchase_items_quantity CHECK (quantity > 0),
        CONSTRAINT CK_gym_store_purchase_items_cost CHECK (unit_cost >= 0)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_purchase_items_variant' AND object_id = OBJECT_ID(N'dbo.gym_store_purchase_items'))
    CREATE INDEX IX_gym_store_purchase_items_variant ON dbo.gym_store_purchase_items(variant_id, purchase_id DESC);

IF OBJECT_ID(N'dbo.gym_store_purchase_payments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_purchase_payments (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_purchase_payments PRIMARY KEY,
        purchase_id INT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL,
        paid_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_purchase_payments_paid DEFAULT (SYSUTCDATETIME()),
        created_by_user_id INT NULL,
        CONSTRAINT FK_gym_store_purchase_payments_purchase FOREIGN KEY (purchase_id) REFERENCES dbo.gym_store_purchases(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_store_purchase_payments_amount CHECK (amount > 0),
        CONSTRAINT CK_gym_store_purchase_payments_method CHECK (payment_method IN ('cash', 'card', 'transfer', 'wallet', 'other'))
    );
END;

IF OBJECT_ID(N'dbo.gym_store_inventory_balances', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_inventory_balances (
        variant_id INT NOT NULL CONSTRAINT PK_gym_store_inventory_balances PRIMARY KEY,
        quantity_on_hand DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_store_inventory_balances_quantity DEFAULT (0),
        average_cost DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_inventory_balances_cost DEFAULT (0),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_inventory_balances_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_inventory_balances_variant FOREIGN KEY (variant_id) REFERENCES dbo.gym_store_product_variants(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_store_inventory_balances_quantity CHECK (quantity_on_hand >= 0),
        CONSTRAINT CK_gym_store_inventory_balances_cost CHECK (average_cost >= 0)
    );
END;

IF OBJECT_ID(N'dbo.gym_store_inventory_batches', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_inventory_batches (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_inventory_batches PRIMARY KEY,
        variant_id INT NOT NULL,
        purchase_id INT NULL,
        lot_number NVARCHAR(100) NULL,
        expiry_date DATE NULL,
        quantity_on_hand DECIMAL(12,3) NOT NULL,
        unit_cost DECIMAL(12,2) NOT NULL,
        received_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_inventory_batches_received DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_inventory_batches_variant FOREIGN KEY (variant_id) REFERENCES dbo.gym_store_product_variants(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_store_inventory_batches_purchase FOREIGN KEY (purchase_id) REFERENCES dbo.gym_store_purchases(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_store_inventory_batches_quantity CHECK (quantity_on_hand >= 0),
        CONSTRAINT CK_gym_store_inventory_batches_cost CHECK (unit_cost >= 0)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_inventory_batches_variant_expiry' AND object_id = OBJECT_ID(N'dbo.gym_store_inventory_batches'))
    CREATE INDEX IX_gym_store_inventory_batches_variant_expiry ON dbo.gym_store_inventory_batches(variant_id, expiry_date, received_at, id);

IF OBJECT_ID(N'dbo.gym_store_stock_movements', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_stock_movements (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_stock_movements PRIMARY KEY,
        variant_id INT NOT NULL,
        movement_type VARCHAR(30) NOT NULL,
        quantity_in DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_store_stock_movements_in DEFAULT (0),
        quantity_out DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_store_stock_movements_out DEFAULT (0),
        previous_quantity DECIMAL(12,3) NOT NULL,
        resulting_quantity DECIMAL(12,3) NOT NULL,
        unit_cost DECIMAL(12,2) NULL,
        reference_type VARCHAR(30) NULL,
        reference_id INT NULL,
        created_by_user_id INT NULL,
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_stock_movements_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_stock_movements_variant FOREIGN KEY (variant_id) REFERENCES dbo.gym_store_product_variants(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_store_stock_movements_type CHECK (movement_type IN ('purchase', 'sale', 'sale_return', 'purchase_return', 'adjustment', 'damaged', 'expired', 'manual')),
        CONSTRAINT CK_gym_store_stock_movements_quantities CHECK (quantity_in >= 0 AND quantity_out >= 0 AND ((quantity_in > 0 AND quantity_out = 0) OR (quantity_out > 0 AND quantity_in = 0) OR (quantity_in = 0 AND quantity_out = 0))),
        CONSTRAINT CK_gym_store_stock_movements_balance CHECK (previous_quantity >= 0 AND resulting_quantity >= 0)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_stock_movements_variant_date' AND object_id = OBJECT_ID(N'dbo.gym_store_stock_movements'))
    CREATE INDEX IX_gym_store_stock_movements_variant_date ON dbo.gym_store_stock_movements(variant_id, created_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_stock_movements_reference' AND object_id = OBJECT_ID(N'dbo.gym_store_stock_movements'))
    CREATE INDEX IX_gym_store_stock_movements_reference ON dbo.gym_store_stock_movements(reference_type, reference_id, id DESC);

IF OBJECT_ID(N'dbo.gym_store_sales', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_sales (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_sales PRIMARY KEY,
        sale_number VARCHAR(50) NOT NULL,
        member_id INT NULL,
        customer_id INT NULL,
        customer_name NVARCHAR(160) NULL,
        customer_phone NVARCHAR(40) NULL,
        sale_date DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_sales_date DEFAULT (SYSUTCDATETIME()),
        subtotal DECIMAL(12,2) NOT NULL,
        discount_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_sales_discount DEFAULT (0),
        tax_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_sales_tax DEFAULT (0),
        total_amount DECIMAL(12,2) NOT NULL,
        paid_amount DECIMAL(12,2) NOT NULL,
        remaining_amount AS (total_amount - paid_amount) PERSISTED,
        payment_method VARCHAR(20) NOT NULL CONSTRAINT DF_gym_store_sales_method DEFAULT ('cash'),
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_store_sales_status DEFAULT ('completed'),
        notes NVARCHAR(1000) NULL,
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_sales_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_sales_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_store_sales_number UNIQUE (sale_number),
        CONSTRAINT FK_gym_store_sales_member FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE SET NULL,
        CONSTRAINT FK_gym_store_sales_customer FOREIGN KEY (customer_id) REFERENCES dbo.gym_store_customers(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_store_sales_amounts CHECK (subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND paid_amount >= 0 AND paid_amount <= total_amount),
        CONSTRAINT CK_gym_store_sales_method CHECK (payment_method IN ('cash', 'card', 'transfer', 'wallet', 'other')),
        CONSTRAINT CK_gym_store_sales_status CHECK (status IN ('completed', 'cancelled'))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_sales_date' AND object_id = OBJECT_ID(N'dbo.gym_store_sales'))
    CREATE INDEX IX_gym_store_sales_date ON dbo.gym_store_sales(sale_date DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_sales_member_date' AND object_id = OBJECT_ID(N'dbo.gym_store_sales'))
    CREATE INDEX IX_gym_store_sales_member_date ON dbo.gym_store_sales(member_id, sale_date DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_store_sale_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_sale_items (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_sale_items PRIMARY KEY,
        sale_id INT NOT NULL,
        variant_id INT NOT NULL,
        product_name NVARCHAR(180) NOT NULL,
        variant_name NVARCHAR(160) NOT NULL,
        sku VARCHAR(80) NOT NULL,
        quantity DECIMAL(12,3) NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        discount_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_sale_items_discount DEFAULT (0),
        line_total DECIMAL(12,2) NOT NULL,
        unit_cost_snapshot DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_sale_items_cost DEFAULT (0),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_sale_items_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_sale_items_sale FOREIGN KEY (sale_id) REFERENCES dbo.gym_store_sales(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_store_sale_items_variant FOREIGN KEY (variant_id) REFERENCES dbo.gym_store_product_variants(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_store_sale_items_quantity CHECK (quantity > 0),
        CONSTRAINT CK_gym_store_sale_items_price CHECK (unit_price >= 0 AND discount_amount >= 0 AND line_total >= 0 AND unit_cost_snapshot >= 0)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_sale_items_variant' AND object_id = OBJECT_ID(N'dbo.gym_store_sale_items'))
    CREATE INDEX IX_gym_store_sale_items_variant ON dbo.gym_store_sale_items(variant_id, sale_id DESC);

IF OBJECT_ID(N'dbo.gym_store_sale_payments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_sale_payments (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_sale_payments PRIMARY KEY,
        sale_id INT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL,
        reference NVARCHAR(160) NULL,
        paid_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_sale_payments_paid DEFAULT (SYSUTCDATETIME()),
        created_by_user_id INT NULL,
        CONSTRAINT FK_gym_store_sale_payments_sale FOREIGN KEY (sale_id) REFERENCES dbo.gym_store_sales(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_store_sale_payments_amount CHECK (amount > 0),
        CONSTRAINT CK_gym_store_sale_payments_method CHECK (payment_method IN ('cash', 'card', 'transfer', 'wallet', 'other'))
    );
END;

IF OBJECT_ID(N'dbo.gym_store_returns', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_returns (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_returns PRIMARY KEY,
        return_number VARCHAR(50) NOT NULL,
        sale_id INT NOT NULL,
        refund_amount DECIMAL(12,2) NOT NULL,
        refund_method VARCHAR(20) NOT NULL,
        reason NVARCHAR(1000) NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_store_returns_status DEFAULT ('completed'),
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_returns_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_store_returns_number UNIQUE (return_number),
        CONSTRAINT FK_gym_store_returns_sale FOREIGN KEY (sale_id) REFERENCES dbo.gym_store_sales(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_store_returns_refund CHECK (refund_amount >= 0),
        CONSTRAINT CK_gym_store_returns_method CHECK (refund_method IN ('cash', 'card', 'transfer', 'wallet', 'other')),
        CONSTRAINT CK_gym_store_returns_status CHECK (status IN ('completed', 'voided'))
    );
END;
IF OBJECT_ID(N'dbo.gym_store_return_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_return_items (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_return_items PRIMARY KEY,
        return_id INT NOT NULL,
        sale_item_id INT NOT NULL,
        variant_id INT NOT NULL,
        quantity DECIMAL(12,3) NOT NULL,
        unit_price DECIMAL(12,2) NOT NULL,
        restock BIT NOT NULL CONSTRAINT DF_gym_store_return_items_restock DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_return_items_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_store_return_items_return FOREIGN KEY (return_id) REFERENCES dbo.gym_store_returns(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_store_return_items_sale_item FOREIGN KEY (sale_item_id) REFERENCES dbo.gym_store_sale_items(id) ON DELETE NO ACTION,
        CONSTRAINT FK_gym_store_return_items_variant FOREIGN KEY (variant_id) REFERENCES dbo.gym_store_product_variants(id) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_store_return_items_quantity CHECK (quantity > 0)
    );
END;

IF OBJECT_ID(N'dbo.gym_store_audit_log', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_audit_log (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_store_audit_log PRIMARY KEY,
        action VARCHAR(40) NOT NULL,
        entity_type VARCHAR(40) NOT NULL,
        entity_id INT NULL,
        actor_user_id INT NULL,
        ip_address VARCHAR(64) NULL,
        user_agent NVARCHAR(512) NULL,
        details NVARCHAR(MAX) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_audit_created DEFAULT (SYSUTCDATETIME())
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_store_audit_date' AND object_id = OBJECT_ID(N'dbo.gym_store_audit_log'))
    CREATE INDEX IX_gym_store_audit_date ON dbo.gym_store_audit_log(created_at DESC, id DESC);

IF NOT EXISTS (SELECT 1 FROM dbo.gym_store_categories WHERE category_code = 'supplements') INSERT INTO dbo.gym_store_categories(category_code, name_ar, name_en, sort_order) VALUES ('supplements', N'مكملات غذائية', N'Supplements', 1);
IF NOT EXISTS (SELECT 1 FROM dbo.gym_store_categories WHERE category_code = 'equipment') INSERT INTO dbo.gym_store_categories(category_code, name_ar, name_en, sort_order) VALUES ('equipment', N'معدات الجيم', N'Equipment', 2);
IF NOT EXISTS (SELECT 1 FROM dbo.gym_store_categories WHERE category_code = 'clothing') INSERT INTO dbo.gym_store_categories(category_code, name_ar, name_en, sort_order) VALUES ('clothing', N'ملابس رياضية', N'Clothing', 3);
IF NOT EXISTS (SELECT 1 FROM dbo.gym_store_categories WHERE category_code = 'accessories') INSERT INTO dbo.gym_store_categories(category_code, name_ar, name_en, sort_order) VALUES ('accessories', N'إكسسوارات', N'Accessories', 4);
IF NOT EXISTS (SELECT 1 FROM dbo.gym_store_categories WHERE category_code = 'drinks') INSERT INTO dbo.gym_store_categories(category_code, name_ar, name_en, sort_order) VALUES ('drinks', N'مشروبات', N'Drinks', 5);
IF NOT EXISTS (SELECT 1 FROM dbo.gym_store_categories WHERE category_code = 'food') INSERT INTO dbo.gym_store_categories(category_code, name_ar, name_en, sort_order) VALUES ('food', N'أغذية', N'Food', 6);
IF NOT EXISTS (SELECT 1 FROM dbo.gym_store_categories WHERE category_code = 'other') INSERT INTO dbo.gym_store_categories(category_code, name_ar, name_en, sort_order) VALUES ('other', N'أخرى', N'Other', 7);
