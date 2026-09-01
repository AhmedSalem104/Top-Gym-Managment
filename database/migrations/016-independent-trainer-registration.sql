/*
   Phase 3: additive registration metadata.
   The existing table name is intentionally retained for API compatibility;
   gym_name is the historical business/brand-name field for both customer
   types. Existing requests are ordinary Gym registrations.
*/
IF OBJECT_ID(N'dbo.saas_gym_registration_requests', N'U') IS NULL
    THROW 51030, 'saas_gym_registration_requests must exist before migration 016.', 1;

IF COL_LENGTH(N'dbo.saas_gym_registration_requests', N'tenant_type') IS NULL
    ALTER TABLE dbo.saas_gym_registration_requests ADD tenant_type VARCHAR(32) NULL;

EXEC(N'
    UPDATE dbo.saas_gym_registration_requests
    SET tenant_type=''gym''
    WHERE tenant_type IS NULL OR LTRIM(RTRIM(tenant_type))='''';
');

IF EXISTS (
    SELECT 1
    FROM dbo.saas_gym_registration_requests
    WHERE tenant_type NOT IN ('gym', 'independent_trainer')
)
    THROW 51031, 'saas_gym_registration_requests contains an unsupported tenant_type.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id=OBJECT_ID(N'dbo.saas_gym_registration_requests')
      AND name=N'tenant_type'
      AND (system_type_id<>167 OR max_length<32 OR is_nullable<>0)
)
    THROW 51032, 'saas_gym_registration_requests.tenant_type must remain VARCHAR(32) NULL until backfill is complete.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.saas_gym_registration_requests')
      AND name=N'DF_saas_registration_tenant_type'
)
    ALTER TABLE dbo.saas_gym_registration_requests
        ADD CONSTRAINT DF_saas_registration_tenant_type DEFAULT ('gym') FOR tenant_type;

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.saas_gym_registration_requests')
      AND name=N'CK_saas_registration_tenant_type'
)
    ALTER TABLE dbo.saas_gym_registration_requests
        ADD CONSTRAINT CK_saas_registration_tenant_type CHECK (tenant_type IN ('gym', 'independent_trainer'));

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_saas_registration_tenant_type_queue'
      AND object_id=OBJECT_ID(N'dbo.saas_gym_registration_requests')
)
    CREATE INDEX IX_saas_registration_tenant_type_queue
        ON dbo.saas_gym_registration_requests(tenant_type, status, created_at DESC, id DESC);

/* The starter plan is the existing neutral entry plan. It is the only plan
   exposed to Trainer registration until PlatformAdmin creates a dedicated
   Trainer-compatible plan in the later plan-management phase. */
IF NOT EXISTS (SELECT 1 FROM dbo.saas_plan_tenant_types ptt INNER JOIN dbo.saas_plans p ON p.id=ptt.plan_id WHERE p.code='starter' AND ptt.tenant_type='independent_trainer')
BEGIN
    INSERT INTO dbo.saas_plan_tenant_types(plan_id, tenant_type)
    SELECT TOP (1) id, 'independent_trainer' FROM dbo.saas_plans WHERE code='starter' AND is_active=1;
END;
