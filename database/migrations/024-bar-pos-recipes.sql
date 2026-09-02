/*
  Bar/POS extension over the existing Store sale, payment, and movement
  tables. Bar has a faster operational API, but it does not own a second
  financial ledger or a second product catalog.
*/

IF OBJECT_ID(N'dbo.gym_bar_recipes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_bar_recipes (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_bar_recipes PRIMARY KEY,
        tenant_id INT NOT NULL,
        sellable_variant_id INT NOT NULL,
        recipe_code VARCHAR(60) NOT NULL,
        name NVARCHAR(180) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_gym_bar_recipes_active DEFAULT (1),
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_bar_recipes_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_bar_recipes_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_bar_recipes_code UNIQUE (tenant_id, recipe_code),
        CONSTRAINT UQ_gym_bar_recipes_variant UNIQUE (tenant_id, sellable_variant_id),
        CONSTRAINT FK_gym_bar_recipes_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_bar_recipes_variant FOREIGN KEY (sellable_variant_id) REFERENCES dbo.gym_store_product_variants(id)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_bar_recipes_tenant_active' AND object_id=OBJECT_ID(N'dbo.gym_bar_recipes'))
    CREATE INDEX IX_gym_bar_recipes_tenant_active ON dbo.gym_bar_recipes(tenant_id, is_active, id DESC);

IF OBJECT_ID(N'dbo.gym_bar_recipe_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_bar_recipe_items (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_bar_recipe_items PRIMARY KEY,
        tenant_id INT NOT NULL,
        recipe_id INT NOT NULL,
        ingredient_variant_id INT NOT NULL,
        quantity DECIMAL(12,3) NOT NULL,
        unit_code VARCHAR(20) NOT NULL CONSTRAINT DF_gym_bar_recipe_items_unit DEFAULT ('piece'),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_bar_recipe_items_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_bar_recipe_items_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_bar_recipe_items_recipe FOREIGN KEY (recipe_id) REFERENCES dbo.gym_bar_recipes(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_bar_recipe_items_variant FOREIGN KEY (ingredient_variant_id) REFERENCES dbo.gym_store_product_variants(id),
        CONSTRAINT CK_gym_bar_recipe_items_quantity CHECK (quantity > 0),
        CONSTRAINT CK_gym_bar_recipe_items_unit CHECK (unit_code IN ('piece', 'gram', 'kilogram', 'milliliter', 'liter', 'serving'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_bar_recipe_items_recipe' AND object_id=OBJECT_ID(N'dbo.gym_bar_recipe_items'))
    CREATE INDEX IX_gym_bar_recipe_items_recipe ON dbo.gym_bar_recipe_items(tenant_id, recipe_id, ingredient_variant_id);

IF OBJECT_ID(N'dbo.gym_pos_shifts', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_pos_shifts (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_pos_shifts PRIMARY KEY,
        tenant_id INT NOT NULL,
        branch_id INT NOT NULL,
        stock_location_id INT NULL,
        channel VARCHAR(20) NOT NULL CONSTRAINT DF_gym_pos_shifts_channel DEFAULT ('store'),
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_pos_shifts_status DEFAULT ('open'),
        opening_cash DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_pos_shifts_opening_cash DEFAULT (0),
        closing_cash DECIMAL(12,2) NULL,
        expected_cash DECIMAL(12,2) NULL,
        difference_amount DECIMAL(12,2) NULL,
        opened_by_user_id INT NOT NULL,
        closed_by_user_id INT NULL,
        opened_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_pos_shifts_opened DEFAULT (SYSUTCDATETIME()),
        closed_at DATETIME2(0) NULL,
        notes NVARCHAR(1000) NULL,
        CONSTRAINT FK_gym_pos_shifts_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_pos_shifts_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id),
        CONSTRAINT FK_gym_pos_shifts_location FOREIGN KEY (stock_location_id) REFERENCES dbo.gym_stock_locations(id),
        CONSTRAINT CK_gym_pos_shifts_channel CHECK (channel IN ('store', 'bar')),
        CONSTRAINT CK_gym_pos_shifts_status CHECK (status IN ('open', 'closed', 'cancelled')),
        CONSTRAINT CK_gym_pos_shifts_cash CHECK (opening_cash >= 0 AND (closing_cash IS NULL OR closing_cash >= 0))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_gym_pos_shifts_open' AND object_id=OBJECT_ID(N'dbo.gym_pos_shifts'))
    CREATE UNIQUE INDEX UX_gym_pos_shifts_open ON dbo.gym_pos_shifts(tenant_id, branch_id, channel) WHERE status='open';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_pos_shifts_tenant_date' AND object_id=OBJECT_ID(N'dbo.gym_pos_shifts'))
    CREATE INDEX IX_gym_pos_shifts_tenant_date ON dbo.gym_pos_shifts(tenant_id, branch_id, opened_at DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_commerce_waste', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_commerce_waste (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_commerce_waste PRIMARY KEY,
        tenant_id INT NOT NULL,
        branch_id INT NOT NULL,
        stock_location_id INT NOT NULL,
        variant_id INT NOT NULL,
        quantity DECIMAL(12,3) NOT NULL,
        waste_type VARCHAR(20) NOT NULL,
        reason NVARCHAR(500) NOT NULL,
        created_by_user_id INT NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_commerce_waste_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_commerce_waste_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_commerce_waste_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id),
        CONSTRAINT FK_gym_commerce_waste_location FOREIGN KEY (stock_location_id) REFERENCES dbo.gym_stock_locations(id),
        CONSTRAINT FK_gym_commerce_waste_variant FOREIGN KEY (variant_id) REFERENCES dbo.gym_store_product_variants(id),
        CONSTRAINT CK_gym_commerce_waste_quantity CHECK (quantity > 0),
        CONSTRAINT CK_gym_commerce_waste_type CHECK (waste_type IN ('expired', 'damaged', 'spillage', 'preparation_error', 'other'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_commerce_waste_location_date' AND object_id=OBJECT_ID(N'dbo.gym_commerce_waste'))
    CREATE INDEX IX_gym_commerce_waste_location_date ON dbo.gym_commerce_waste(tenant_id, stock_location_id, created_at DESC, id DESC);

IF COL_LENGTH(N'dbo.gym_store_sales', N'sales_channel') IS NULL
    ALTER TABLE dbo.gym_store_sales ADD sales_channel VARCHAR(20) NOT NULL CONSTRAINT DF_gym_store_sales_channel DEFAULT ('store');
IF COL_LENGTH(N'dbo.gym_store_sales', N'pos_shift_id') IS NULL
    ALTER TABLE dbo.gym_store_sales ADD pos_shift_id INT NULL;
IF COL_LENGTH(N'dbo.gym_store_sales', N'idempotency_key_hash') IS NULL
    ALTER TABLE dbo.gym_store_sales ADD idempotency_key_hash CHAR(64) NULL;
IF COL_LENGTH(N'dbo.gym_store_sale_items', N'recipe_id') IS NULL
    ALTER TABLE dbo.gym_store_sale_items ADD recipe_id INT NULL;
IF COL_LENGTH(N'dbo.gym_store_sale_items', N'modifier_snapshot_json') IS NULL
    ALTER TABLE dbo.gym_store_sale_items ADD modifier_snapshot_json NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_gym_store_sales_shift' AND parent_object_id=OBJECT_ID(N'dbo.gym_store_sales'))
    ALTER TABLE dbo.gym_store_sales ADD CONSTRAINT FK_gym_store_sales_shift FOREIGN KEY (pos_shift_id) REFERENCES dbo.gym_pos_shifts(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_gym_store_sale_items_recipe' AND parent_object_id=OBJECT_ID(N'dbo.gym_store_sale_items'))
    ALTER TABLE dbo.gym_store_sale_items ADD CONSTRAINT FK_gym_store_sale_items_recipe FOREIGN KEY (recipe_id) REFERENCES dbo.gym_bar_recipes(id);
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_gym_store_sales_channel' AND parent_object_id=OBJECT_ID(N'dbo.gym_store_sales'))
    ALTER TABLE dbo.gym_store_sales ADD CONSTRAINT CK_gym_store_sales_channel CHECK (sales_channel IN ('store', 'bar'));
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_gym_store_sales_idempotency' AND object_id=OBJECT_ID(N'dbo.gym_store_sales'))
    CREATE UNIQUE INDEX UX_gym_store_sales_idempotency ON dbo.gym_store_sales(tenant_id, idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_store_sales_channel_date' AND object_id=OBJECT_ID(N'dbo.gym_store_sales'))
    CREATE INDEX IX_gym_store_sales_channel_date ON dbo.gym_store_sales(tenant_id, sales_channel, branch_id, sale_date DESC, id DESC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_store_stock_movements_waste' AND object_id=OBJECT_ID(N'dbo.gym_store_stock_movements'))
    CREATE INDEX IX_gym_store_stock_movements_waste ON dbo.gym_store_stock_movements(tenant_id, reference_type, reference_id, created_at DESC);
