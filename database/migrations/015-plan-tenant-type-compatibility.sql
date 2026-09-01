/*
   Logic Fit migration 015: explicit SaaS plan ↔ tenant-type compatibility.

   This is an additive control-plane mapping. It does not duplicate plans or
   subscriptions, and it never rewrites historical subscription snapshots.
*/

IF OBJECT_ID(N'dbo.saas_plans', N'U') IS NULL
    THROW 51020, 'saas_plans must exist before migration 015.', 1;

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID(N'dbo.saas_plan_tenant_types', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_plan_tenant_types (
        plan_id INT NOT NULL,
        tenant_type VARCHAR(32) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_plan_tenant_types_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_saas_plan_tenant_types PRIMARY KEY (plan_id, tenant_type),
        CONSTRAINT FK_saas_plan_tenant_types_plan FOREIGN KEY (plan_id) REFERENCES dbo.saas_plans(id) ON DELETE CASCADE,
        CONSTRAINT CK_saas_plan_tenant_types_type CHECK (tenant_type IN ('gym', 'independent_trainer'))
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_saas_plan_tenant_types_type_plan'
      AND object_id=OBJECT_ID(N'dbo.saas_plan_tenant_types')
)
    CREATE INDEX IX_saas_plan_tenant_types_type_plan ON dbo.saas_plan_tenant_types(tenant_type, plan_id);

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name=N'PK_saas_plan_tenant_types' AND parent_object_id=OBJECT_ID(N'dbo.saas_plan_tenant_types'))
    THROW 51022, 'saas_plan_tenant_types primary key contract is not ready.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name=N'FK_saas_plan_tenant_types_plan' AND parent_object_id=OBJECT_ID(N'dbo.saas_plan_tenant_types'))
    THROW 51023, 'saas_plan_tenant_types foreign key contract is not ready.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_saas_plan_tenant_types_type' AND parent_object_id=OBJECT_ID(N'dbo.saas_plan_tenant_types'))
    THROW 51024, 'saas_plan_tenant_types check contract is not ready.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.saas_plan_tenant_types
    WHERE tenant_type NOT IN ('gym', 'independent_trainer')
)
    THROW 51021, 'saas_plan_tenant_types contains an unsupported tenant type; migration stopped safely.', 1;

MERGE dbo.saas_plan_tenant_types AS target
USING (
    SELECT id AS plan_id, CAST('gym' AS VARCHAR(32)) AS tenant_type
    FROM dbo.saas_plans
) AS source
ON target.plan_id=source.plan_id AND target.tenant_type=source.tenant_type
WHEN NOT MATCHED BY TARGET THEN
    INSERT (plan_id, tenant_type) VALUES (source.plan_id, source.tenant_type);

COMMIT TRANSACTION;
