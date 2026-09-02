/*
  Commerce Core location layer.

  Branches describe operating sites; stock locations describe inventory
  points inside a branch. The existing tenant-wide inventory balance remains
  valid for legacy Store records. Location balances are an additive cache
  used when a branch/location is explicitly selected.
*/

IF OBJECT_ID(N'dbo.gym_stock_locations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_stock_locations (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_stock_locations PRIMARY KEY,
        tenant_id INT NOT NULL,
        branch_id INT NOT NULL,
        location_code VARCHAR(40) NOT NULL,
        name NVARCHAR(160) NOT NULL,
        location_type VARCHAR(20) NOT NULL CONSTRAINT DF_gym_stock_locations_type DEFAULT ('warehouse'),
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_stock_locations_status DEFAULT ('active'),
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_stock_locations_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_stock_locations_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_stock_locations_branch_code UNIQUE (branch_id, location_code),
        CONSTRAINT FK_gym_stock_locations_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_stock_locations_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id),
        CONSTRAINT CK_gym_stock_locations_type CHECK (location_type IN ('warehouse', 'store', 'bar')),
        CONSTRAINT CK_gym_stock_locations_status CHECK (status IN ('active', 'inactive', 'archived'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_stock_locations_tenant_branch' AND object_id=OBJECT_ID(N'dbo.gym_stock_locations'))
    CREATE INDEX IX_gym_stock_locations_tenant_branch ON dbo.gym_stock_locations(tenant_id, branch_id, status, id);

-- Every active branch receives one safe legacy Store location. The seed is
-- deterministic and does not create a location for a disabled Store.
MERGE dbo.gym_stock_locations AS target
USING (
    SELECT b.tenant_id, b.id AS branch_id,
           CASE WHEN b.is_main_branch=1 THEN 'main-store' ELSE CONCAT('store-', b.id) END AS location_code,
           CASE WHEN b.is_main_branch=1 THEN N'Main Store' ELSE CONCAT(N'Store - ', b.name) END AS name
    FROM dbo.gym_branches AS b
    LEFT JOIN dbo.gym_branch_commerce_config AS config ON config.branch_id=b.id AND config.tenant_id=b.tenant_id
    WHERE b.status='active' AND ISNULL(config.store_enabled, 1)=1
) AS source
ON target.branch_id=source.branch_id AND target.location_code=source.location_code
WHEN NOT MATCHED THEN
    INSERT (tenant_id, branch_id, location_code, name, location_type)
    VALUES (source.tenant_id, source.branch_id, source.location_code, source.name, 'store');

IF OBJECT_ID(N'dbo.gym_store_location_inventory_balances', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_store_location_inventory_balances (
        tenant_id INT NOT NULL,
        stock_location_id INT NOT NULL,
        variant_id INT NOT NULL,
        quantity_on_hand DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_store_location_inventory_quantity DEFAULT (0),
        average_cost DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_store_location_inventory_cost DEFAULT (0),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_store_location_inventory_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_gym_store_location_inventory_balances PRIMARY KEY (stock_location_id, variant_id),
        CONSTRAINT FK_gym_store_location_inventory_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_store_location_inventory_location FOREIGN KEY (stock_location_id) REFERENCES dbo.gym_stock_locations(id),
        CONSTRAINT FK_gym_store_location_inventory_variant FOREIGN KEY (variant_id) REFERENCES dbo.gym_store_product_variants(id),
        CONSTRAINT CK_gym_store_location_inventory_quantity CHECK (quantity_on_hand >= 0),
        CONSTRAINT CK_gym_store_location_inventory_cost CHECK (average_cost >= 0)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_store_location_inventory_tenant_variant' AND object_id=OBJECT_ID(N'dbo.gym_store_location_inventory_balances'))
    CREATE INDEX IX_gym_store_location_inventory_tenant_variant ON dbo.gym_store_location_inventory_balances(tenant_id, variant_id, stock_location_id);

IF OBJECT_ID(N'dbo.gym_stock_transfers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_stock_transfers (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_stock_transfers PRIMARY KEY,
        tenant_id INT NOT NULL,
        from_location_id INT NOT NULL,
        to_location_id INT NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_stock_transfers_status DEFAULT ('draft'),
        idempotency_key_hash CHAR(64) NULL,
        notes NVARCHAR(1000) NULL,
        created_by_user_id INT NULL,
        approved_by_user_id INT NULL,
        received_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_stock_transfers_created DEFAULT (SYSUTCDATETIME()),
        approved_at DATETIME2(0) NULL,
        received_at DATETIME2(0) NULL,
        CONSTRAINT FK_gym_stock_transfers_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_stock_transfers_from FOREIGN KEY (from_location_id) REFERENCES dbo.gym_stock_locations(id),
        CONSTRAINT FK_gym_stock_transfers_to FOREIGN KEY (to_location_id) REFERENCES dbo.gym_stock_locations(id),
        CONSTRAINT CK_gym_stock_transfers_different_locations CHECK (from_location_id <> to_location_id),
        CONSTRAINT CK_gym_stock_transfers_status CHECK (status IN ('draft', 'approved', 'in_transit', 'received', 'cancelled'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_gym_stock_transfers_idempotency' AND object_id=OBJECT_ID(N'dbo.gym_stock_transfers'))
    CREATE UNIQUE INDEX UX_gym_stock_transfers_idempotency ON dbo.gym_stock_transfers(tenant_id, idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_stock_transfers_tenant_status' AND object_id=OBJECT_ID(N'dbo.gym_stock_transfers'))
    CREATE INDEX IX_gym_stock_transfers_tenant_status ON dbo.gym_stock_transfers(tenant_id, status, created_at DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_stock_transfer_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_stock_transfer_items (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_stock_transfer_items PRIMARY KEY,
        tenant_id INT NOT NULL,
        transfer_id INT NOT NULL,
        variant_id INT NOT NULL,
        quantity DECIMAL(12,3) NOT NULL,
        unit_cost DECIMAL(12,2) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_stock_transfer_items_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_stock_transfer_items_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_stock_transfer_items_transfer FOREIGN KEY (transfer_id) REFERENCES dbo.gym_stock_transfers(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_stock_transfer_items_variant FOREIGN KEY (variant_id) REFERENCES dbo.gym_store_product_variants(id),
        CONSTRAINT CK_gym_stock_transfer_items_quantity CHECK (quantity > 0),
        CONSTRAINT CK_gym_stock_transfer_items_cost CHECK (unit_cost IS NULL OR unit_cost >= 0)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_stock_transfer_items_tenant_transfer' AND object_id=OBJECT_ID(N'dbo.gym_stock_transfer_items'))
    CREATE INDEX IX_gym_stock_transfer_items_tenant_transfer ON dbo.gym_stock_transfer_items(tenant_id, transfer_id, variant_id);

IF COL_LENGTH(N'dbo.gym_store_stock_movements', N'stock_location_id') IS NULL
    ALTER TABLE dbo.gym_store_stock_movements ADD stock_location_id INT NULL;
IF COL_LENGTH(N'dbo.gym_store_stock_movements', N'branch_id') IS NULL
    ALTER TABLE dbo.gym_store_stock_movements ADD branch_id INT NULL;
IF COL_LENGTH(N'dbo.gym_store_sales', N'stock_location_id') IS NULL
    ALTER TABLE dbo.gym_store_sales ADD stock_location_id INT NULL;
IF COL_LENGTH(N'dbo.gym_store_sales', N'branch_id') IS NULL
    ALTER TABLE dbo.gym_store_sales ADD branch_id INT NULL;
IF COL_LENGTH(N'dbo.gym_store_purchases', N'stock_location_id') IS NULL
    ALTER TABLE dbo.gym_store_purchases ADD stock_location_id INT NULL;
IF COL_LENGTH(N'dbo.gym_store_purchases', N'branch_id') IS NULL
    ALTER TABLE dbo.gym_store_purchases ADD branch_id INT NULL;

EXEC sys.sp_executesql N'
    UPDATE sale
       SET branch_id = branch.id,
           stock_location_id = location.id
    FROM dbo.gym_store_sales AS sale
    INNER JOIN dbo.gym_branches AS branch ON branch.tenant_id=sale.tenant_id AND branch.is_main_branch=1
    INNER JOIN dbo.gym_stock_locations AS location ON location.branch_id=branch.id AND location.location_type=''store'' AND location.status=''active''
    WHERE sale.branch_id IS NULL AND sale.stock_location_id IS NULL;';

EXEC sys.sp_executesql N'
    UPDATE purchase
       SET branch_id = branch.id,
           stock_location_id = location.id
    FROM dbo.gym_store_purchases AS purchase
    INNER JOIN dbo.gym_branches AS branch ON branch.tenant_id=purchase.tenant_id AND branch.is_main_branch=1
    INNER JOIN dbo.gym_stock_locations AS location ON location.branch_id=branch.id AND location.location_type=''store'' AND location.status=''active''
    WHERE purchase.branch_id IS NULL AND purchase.stock_location_id IS NULL;';

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_gym_store_stock_movements_location' AND parent_object_id=OBJECT_ID(N'dbo.gym_store_stock_movements'))
    ALTER TABLE dbo.gym_store_stock_movements ADD CONSTRAINT FK_gym_store_stock_movements_location FOREIGN KEY (stock_location_id) REFERENCES dbo.gym_stock_locations(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_gym_store_stock_movements_branch' AND parent_object_id=OBJECT_ID(N'dbo.gym_store_stock_movements'))
    ALTER TABLE dbo.gym_store_stock_movements ADD CONSTRAINT FK_gym_store_stock_movements_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_gym_store_sales_location' AND parent_object_id=OBJECT_ID(N'dbo.gym_store_sales'))
    ALTER TABLE dbo.gym_store_sales ADD CONSTRAINT FK_gym_store_sales_location FOREIGN KEY (stock_location_id) REFERENCES dbo.gym_stock_locations(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_gym_store_sales_branch' AND parent_object_id=OBJECT_ID(N'dbo.gym_store_sales'))
    ALTER TABLE dbo.gym_store_sales ADD CONSTRAINT FK_gym_store_sales_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_gym_store_purchases_location' AND parent_object_id=OBJECT_ID(N'dbo.gym_store_purchases'))
    ALTER TABLE dbo.gym_store_purchases ADD CONSTRAINT FK_gym_store_purchases_location FOREIGN KEY (stock_location_id) REFERENCES dbo.gym_stock_locations(id);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_gym_store_purchases_branch' AND parent_object_id=OBJECT_ID(N'dbo.gym_store_purchases'))
    ALTER TABLE dbo.gym_store_purchases ADD CONSTRAINT FK_gym_store_purchases_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_store_stock_movements_location_date' AND object_id=OBJECT_ID(N'dbo.gym_store_stock_movements'))
    CREATE INDEX IX_gym_store_stock_movements_location_date ON dbo.gym_store_stock_movements(tenant_id, stock_location_id, created_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_store_sales_branch_date' AND object_id=OBJECT_ID(N'dbo.gym_store_sales'))
    CREATE INDEX IX_gym_store_sales_branch_date ON dbo.gym_store_sales(tenant_id, branch_id, sale_date DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_store_purchases_branch_date' AND object_id=OBJECT_ID(N'dbo.gym_store_purchases'))
    CREATE INDEX IX_gym_store_purchases_branch_date ON dbo.gym_store_purchases(tenant_id, branch_id, purchase_date DESC, id DESC);
