/* Bar modifiers are tenant-owned menu metadata. Ingredient quantities are
   optional; when present they are consumed transactionally with the sale. */

IF OBJECT_ID(N'dbo.gym_bar_modifiers', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_bar_modifiers (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_bar_modifiers PRIMARY KEY,
        tenant_id INT NOT NULL,
        name NVARCHAR(120) NOT NULL,
        price_delta DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_bar_modifiers_price DEFAULT (0),
        ingredient_variant_id INT NULL,
        ingredient_quantity DECIMAL(12,3) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_gym_bar_modifiers_active DEFAULT (1),
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_bar_modifiers_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_bar_modifiers_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_bar_modifiers_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_bar_modifiers_variant FOREIGN KEY (ingredient_variant_id) REFERENCES dbo.gym_store_product_variants(id),
        CONSTRAINT CK_gym_bar_modifiers_quantity CHECK ((ingredient_variant_id IS NULL AND ingredient_quantity IS NULL) OR (ingredient_variant_id IS NOT NULL AND ingredient_quantity > 0)),
        CONSTRAINT CK_gym_bar_modifiers_price CHECK (price_delta >= -999999999 AND price_delta <= 999999999)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_bar_modifiers_tenant_active' AND object_id=OBJECT_ID(N'dbo.gym_bar_modifiers'))
    CREATE INDEX IX_gym_bar_modifiers_tenant_active ON dbo.gym_bar_modifiers(tenant_id, is_active, id);
