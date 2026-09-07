/*
   Plan entitlements foundation.
   Additive and idempotent: legacy plan columns/features_json remain available
   as compatibility snapshots while saas_plan_features becomes the canonical
   per-feature entitlement map for new reads and writes.
*/

IF OBJECT_ID(N'dbo.saas_plans', N'U') IS NULL
    THROW 51030, 'saas_plans must exist before plan entitlements.', 1;

IF COL_LENGTH(N'dbo.saas_plans', N'max_clients') IS NULL
    EXEC(N'ALTER TABLE dbo.saas_plans ADD max_clients INT NULL;');

IF COL_LENGTH(N'dbo.saas_plans', N'lifecycle_status') IS NULL
BEGIN
    EXEC(N'ALTER TABLE dbo.saas_plans ADD lifecycle_status VARCHAR(20) NULL;');
    EXEC(N'UPDATE dbo.saas_plans SET lifecycle_status=CASE WHEN is_active=1 THEN ''active'' ELSE ''archived'' END WHERE lifecycle_status IS NULL;');
END;

IF OBJECT_ID(N'dbo.saas_plans', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.saas_plans', N'lifecycle_status') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_saas_plans_lifecycle_status' AND parent_object_id=OBJECT_ID(N'dbo.saas_plans'))
BEGIN
    EXEC(N'UPDATE dbo.saas_plans SET lifecycle_status=CASE WHEN is_active=1 THEN ''active'' ELSE ''archived'' END WHERE lifecycle_status IS NULL OR lifecycle_status NOT IN (''active'',''disabled'',''archived'');');
    EXEC(N'ALTER TABLE dbo.saas_plans ADD CONSTRAINT CK_saas_plans_lifecycle_status CHECK (lifecycle_status IN (''active'',''disabled'',''archived''));');
END;

IF COL_LENGTH(N'dbo.saas_tenant_subscriptions', N'max_clients_snapshot') IS NULL
   AND OBJECT_ID(N'dbo.saas_tenant_subscriptions', N'U') IS NOT NULL
    EXEC(N'ALTER TABLE dbo.saas_tenant_subscriptions ADD max_clients_snapshot INT NULL;');

IF COL_LENGTH(N'dbo.saas_tenant_overrides', N'max_clients') IS NULL
   AND OBJECT_ID(N'dbo.saas_tenant_overrides', N'U') IS NOT NULL
    EXEC(N'ALTER TABLE dbo.saas_tenant_overrides ADD max_clients INT NULL;');

IF OBJECT_ID(N'dbo.saas_plans', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_saas_plans_max_clients' AND parent_object_id=OBJECT_ID(N'dbo.saas_plans'))
    EXEC(N'ALTER TABLE dbo.saas_plans ADD CONSTRAINT CK_saas_plans_max_clients CHECK (max_clients IS NULL OR max_clients > 0);');

IF OBJECT_ID(N'dbo.saas_tenant_overrides', N'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_saas_overrides_max_clients' AND parent_object_id=OBJECT_ID(N'dbo.saas_tenant_overrides'))
    EXEC(N'ALTER TABLE dbo.saas_tenant_overrides ADD CONSTRAINT CK_saas_overrides_max_clients CHECK (max_clients IS NULL OR max_clients > 0);');

IF OBJECT_ID(N'dbo.saas_plan_features', N'U') IS NULL
BEGIN
    EXEC(N'
        CREATE TABLE dbo.saas_plan_features (
            plan_id INT NOT NULL,
            feature_key VARCHAR(80) NOT NULL,
            is_enabled BIT NOT NULL CONSTRAINT DF_saas_plan_features_enabled DEFAULT (1),
            updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_plan_features_updated DEFAULT (SYSUTCDATETIME()),
            CONSTRAINT PK_saas_plan_features PRIMARY KEY (plan_id, feature_key),
            CONSTRAINT FK_saas_plan_features_plan FOREIGN KEY (plan_id) REFERENCES dbo.saas_plans(id) ON DELETE NO ACTION,
            CONSTRAINT CK_saas_plan_features_key CHECK (LEN(feature_key) BETWEEN 2 AND 80)
        );
        CREATE INDEX IX_saas_plan_features_key ON dbo.saas_plan_features(feature_key, plan_id, is_enabled);
    ');
END;

/*
   Everything below runs in a separate dynamic batch. SQL Server otherwise
   may compile references to columns/tables before the additive ALTER/CREATE
   statements above have executed on a cold schema.
*/
EXEC(N'
    DECLARE @seed TABLE (feature_key VARCHAR(80) NOT NULL, default_enabled BIT NOT NULL);
    INSERT INTO @seed(feature_key, default_enabled) VALUES
        (''dashboard'',1),(''members'',1),(''attendance'',1),(''coaching'',1),(''nutrition'',1),
        (''ai'',1),(''library'',1),(''pricing'',1),(''payments'',1),(''finance'',1),(''day_passes'',1),
        (''reports'',1),(''store'',1),(''inventory'',1),(''branches'',1),(''bar'',1),(''portal'',1),
        (''branding'',1),(''backup'',1),(''audit'',1),(''clients'',1),(''assessments'',1),(''progress'',1),
        (''goals'',1),(''sessions'',1),(''packages'',1),(''notifications'',1),(''tasks'',1),
        (''templates'',1),(''prioritySupport'',0);

    INSERT INTO dbo.saas_plan_features(plan_id, feature_key, is_enabled)
    SELECT p.id,
           s.feature_key,
           CONVERT(BIT, CASE s.feature_key
               WHEN ''ai'' THEN CASE LOWER(COALESCE(JSON_VALUE(p.features_json, ''$.ai''), JSON_VALUE(p.features_json, ''$.intelligence'')))
                   WHEN ''true'' THEN 1 WHEN ''1'' THEN 1 WHEN ''false'' THEN 0 WHEN ''0'' THEN 0 ELSE s.default_enabled END
               WHEN ''coaching'' THEN CASE LOWER(JSON_VALUE(p.features_json, ''$.coaching''))
                   WHEN ''true'' THEN 1 WHEN ''1'' THEN 1 WHEN ''false'' THEN 0 WHEN ''0'' THEN 0 ELSE s.default_enabled END
               WHEN ''store'' THEN CASE LOWER(JSON_VALUE(p.features_json, ''$.store''))
                   WHEN ''true'' THEN 1 WHEN ''1'' THEN 1 WHEN ''false'' THEN 0 WHEN ''0'' THEN 0 ELSE s.default_enabled END
               WHEN ''reports'' THEN CASE LOWER(JSON_VALUE(p.features_json, ''$.reports''))
                   WHEN ''true'' THEN 1 WHEN ''1'' THEN 1 WHEN ''false'' THEN 0 WHEN ''0'' THEN 0 ELSE s.default_enabled END
               WHEN ''portal'' THEN CASE LOWER(JSON_VALUE(p.features_json, ''$.portal''))
                   WHEN ''true'' THEN 1 WHEN ''1'' THEN 1 WHEN ''false'' THEN 0 WHEN ''0'' THEN 0 ELSE s.default_enabled END
               WHEN ''prioritySupport'' THEN CASE LOWER(JSON_VALUE(p.features_json, ''$.prioritySupport''))
                   WHEN ''true'' THEN 1 WHEN ''1'' THEN 1 WHEN ''false'' THEN 0 WHEN ''0'' THEN 0 ELSE s.default_enabled END
               ELSE s.default_enabled
           END)
    FROM dbo.saas_plans p
    CROSS JOIN @seed s
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.saas_plan_features existing
        WHERE existing.plan_id=p.id AND existing.feature_key=s.feature_key
    );

    UPDATE p
    SET max_clients = COALESCE(p.max_clients, p.max_members)
    FROM dbo.saas_plans p
    WHERE p.max_clients IS NULL
      AND EXISTS (SELECT 1 FROM dbo.saas_plan_tenant_types pt WHERE pt.plan_id=p.id AND pt.tenant_type=''independent_trainer'');

    UPDATE s
    SET max_clients_snapshot = COALESCE(s.max_clients_snapshot, s.max_members_snapshot)
    FROM dbo.saas_tenant_subscriptions s
    INNER JOIN dbo.gym_tenants t ON t.id=s.tenant_id
    WHERE t.tenant_type=''independent_trainer'' AND s.max_clients_snapshot IS NULL;
');
