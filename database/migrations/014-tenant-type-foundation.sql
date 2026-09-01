/*
   Logic Fit migration 014: additive tenant-type foundation.

   Tenant type is metadata on the existing tenant aggregate. Tenant isolation
   remains tenant_id + SESSION_CONTEXT + SQL Server RLS. This migration does
   not create trainer business tables or rewrite business data.
*/

IF OBJECT_ID(N'dbo.gym_tenants', N'U') IS NULL
    THROW 51015, 'gym_tenants must exist before migration 014.', 1;

SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH(N'dbo.gym_tenants', N'tenant_type') IS NULL
    ALTER TABLE dbo.gym_tenants ADD tenant_type VARCHAR(32) NULL;

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id=OBJECT_ID(N'dbo.gym_tenants')
      AND name=N'tenant_type'
      AND (system_type_id<>167 OR max_length<32)
)
    THROW 51016, 'gym_tenants.tenant_type must be VARCHAR(32) or wider; migration stopped safely.', 1;

/* Existing tenants are the current Gym product unless explicitly classified
   later by a controlled provisioning flow. Empty legacy values are equivalent
   to NULL and are the only values backfilled here. */
EXEC sys.sp_executesql N'
    UPDATE dbo.gym_tenants
    SET tenant_type=''gym''
    WHERE tenant_type IS NULL OR LTRIM(RTRIM(tenant_type))='''';';

IF EXISTS (
    SELECT 1
    FROM dbo.gym_tenants
    WHERE tenant_type NOT IN ('gym', 'independent_trainer')
)
    THROW 51017, 'gym_tenants contains an unsupported tenant_type; migration stopped safely.', 1;

IF EXISTS (
    SELECT 1
    FROM sys.columns
    WHERE object_id=OBJECT_ID(N'dbo.gym_tenants')
      AND name=N'tenant_type'
      AND is_nullable=1
)
    ALTER TABLE dbo.gym_tenants ALTER COLUMN tenant_type VARCHAR(32) NOT NULL;

IF EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id=dc.object_id
    WHERE dc.parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
      AND c.name=N'tenant_type'
      AND LOWER(dc.definition) NOT LIKE '%gym%'
)
    THROW 51018, 'gym_tenants.tenant_type has an incompatible default; migration stopped safely.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON c.default_object_id=dc.object_id
    WHERE dc.parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
      AND c.name=N'tenant_type'
)
    ALTER TABLE dbo.gym_tenants ADD CONSTRAINT DF_gym_tenants_tenant_type DEFAULT ('gym') FOR tenant_type;

IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
      AND definition LIKE '%tenant_type%'
      AND (definition NOT LIKE '%gym%' OR definition NOT LIKE '%independent_trainer%')
)
    THROW 51019, 'gym_tenants.tenant_type has an incompatible check constraint; migration stopped safely.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name=N'CK_gym_tenants_tenant_type'
      AND parent_object_id=OBJECT_ID(N'dbo.gym_tenants')
)
    ALTER TABLE dbo.gym_tenants ADD CONSTRAINT CK_gym_tenants_tenant_type CHECK (tenant_type IN ('gym', 'independent_trainer'));

COMMIT TRANSACTION;
