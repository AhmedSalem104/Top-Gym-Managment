/*
    Phase 9: make the existing SaaS plan/override model authoritative for
    Gym branch limits. The columns are nullable so legacy subscriptions keep
    their existing meaning until the compatibility backfill runs.
*/
IF COL_LENGTH(N'dbo.saas_plans', N'max_branches') IS NULL
    EXEC(N'ALTER TABLE dbo.saas_plans ADD max_branches INT NULL;');

IF COL_LENGTH(N'dbo.saas_tenant_subscriptions', N'max_branches_snapshot') IS NULL
    EXEC(N'ALTER TABLE dbo.saas_tenant_subscriptions ADD max_branches_snapshot INT NULL;');

IF COL_LENGTH(N'dbo.saas_tenant_overrides', N'max_branches') IS NULL
    EXEC(N'ALTER TABLE dbo.saas_tenant_overrides ADD max_branches INT NULL;');

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_saas_plans_max_branches' AND parent_object_id=OBJECT_ID(N'dbo.saas_plans'))
    ALTER TABLE dbo.saas_plans ADD CONSTRAINT CK_saas_plans_max_branches CHECK (max_branches IS NULL OR max_branches > 0);

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_saas_tenant_subscriptions_max_branches_snapshot' AND parent_object_id=OBJECT_ID(N'dbo.saas_tenant_subscriptions'))
    ALTER TABLE dbo.saas_tenant_subscriptions ADD CONSTRAINT CK_saas_tenant_subscriptions_max_branches_snapshot CHECK (max_branches_snapshot IS NULL OR max_branches_snapshot > 0);

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_saas_tenant_overrides_max_branches' AND parent_object_id=OBJECT_ID(N'dbo.saas_tenant_overrides'))
    ALTER TABLE dbo.saas_tenant_overrides ADD CONSTRAINT CK_saas_tenant_overrides_max_branches CHECK (max_branches IS NULL OR max_branches > 0);

EXEC(N'
    UPDATE p
    SET max_branches=CASE p.code
        WHEN ''starter'' THEN 1
        WHEN ''pro'' THEN 3
        WHEN ''enterprise'' THEN NULL
        ELSE p.max_branches
    END
    FROM dbo.saas_plans AS p
    WHERE p.max_branches IS NULL
      AND p.code IN (''starter'',''pro'',''enterprise'');

    UPDATE s
    SET max_branches_snapshot=p.max_branches
    FROM dbo.saas_tenant_subscriptions AS s
    INNER JOIN dbo.saas_plans AS p ON p.id=s.plan_id
    WHERE s.max_branches_snapshot IS NULL;
');

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_plans_branch_limit' AND object_id=OBJECT_ID(N'dbo.saas_plans'))
    CREATE INDEX IX_saas_plans_branch_limit ON dbo.saas_plans(is_active,max_branches,id);
