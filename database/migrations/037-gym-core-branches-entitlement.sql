/*
   Logic Fit migration 037: Gym branch context is a core entitlement.

   LOGIC_FIT_CONTROLLED_PLAN_CONFIGURATION: saas-plan-catalog
   PLAN_TABLE_GUARD: dbo.saas_plans
   TERM_TABLE_GUARD: dbo.saas_plan_terms (read-only; no term changes)
   COMPATIBILITY_TABLE_GUARD: dbo.saas_plan_tenant_types (read-only; no compatibility changes)
   FEATURE_TABLE_GUARD: dbo.saas_plan_features
   LEGACY_ENTERPRISE_GUARD: code='enterprise' is not touched by this migration.

   This is a control-plane-only, idempotent migration. It updates the
   official plan definitions so new subscriptions and the Plan UI agree with
   the runtime compatibility floor. It does not rewrite subscription
   snapshots, prices, tenants, branches, members, memberships, payments, or
   any other tenant data.
*/

IF OBJECT_ID(N'dbo.saas_plans', N'U') IS NULL
    THROW 51037, 'saas_plans must exist before migration 037.', 1;
IF OBJECT_ID(N'dbo.saas_plan_features', N'U') IS NULL
    THROW 51037, 'saas_plan_features must exist before migration 037.', 1;

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @official TABLE (code VARCHAR(40) NOT NULL PRIMARY KEY, plan_id INT NOT NULL);
    INSERT INTO @official (code, plan_id)
    SELECT code, MIN(id)
    FROM dbo.saas_plans
    WHERE code IN ('starter', 'basic', 'pro', 'business')
    GROUP BY code;

    IF (SELECT COUNT(*) FROM @official) <> 4
        THROW 51038, 'The four official SaaS plans are required; migration 037 stopped fail-closed.', 1;

    IF EXISTS (
        SELECT code
        FROM dbo.saas_plans
        WHERE code IN ('starter', 'basic', 'pro', 'business')
        GROUP BY code
        HAVING COUNT(*) <> 1
    )
        THROW 51039, 'Duplicate official SaaS plan codes detected; migration 037 stopped fail-closed.', 1;

    MERGE dbo.saas_plan_features AS target
    USING (SELECT plan_id, CAST('branches' AS VARCHAR(80)) AS feature_key, CAST(1 AS BIT) AS is_enabled FROM @official) AS source
      ON target.plan_id=source.plan_id AND target.feature_key=source.feature_key
    WHEN MATCHED THEN
        UPDATE SET is_enabled=source.is_enabled, updated_at=SYSUTCDATETIME()
    WHEN NOT MATCHED BY TARGET THEN
        INSERT (plan_id, feature_key, is_enabled)
        VALUES (source.plan_id, source.feature_key, source.is_enabled);

    -- Keep the denormalized plan projection aligned for readers that have not
    -- joined saas_plan_features yet. Preserve every other JSON property.
    UPDATE p
    SET features_json=JSON_MODIFY(
            CASE WHEN ISJSON(p.features_json)=1 THEN p.features_json ELSE N'{}' END,
            '$.branches', CAST(1 AS BIT)
        ),
        updated_at=SYSUTCDATETIME()
    FROM dbo.saas_plans AS p
    INNER JOIN @official AS o ON o.plan_id=p.id;

    -- Branches are available to every Gym plan; this is the creation limit,
    -- not a switch that removes the existing/default branch context.
    UPDATE p
    SET max_branches = CASE p.code
        WHEN 'starter' THEN 1
        WHEN 'basic' THEN 2
        WHEN 'pro' THEN 5
        WHEN 'business' THEN NULL
    END,
        updated_at=SYSUTCDATETIME()
    FROM dbo.saas_plans AS p
    INNER JOIN @official AS o ON o.plan_id=p.id;

    IF EXISTS (
        SELECT 1
        FROM @official AS o
        LEFT JOIN dbo.saas_plan_features AS f
          ON f.plan_id=o.plan_id AND f.feature_key='branches'
        WHERE f.plan_id IS NULL OR f.is_enabled<>1
    )
        THROW 51040, 'The Gym core branches entitlement failed validation.', 1;

    IF EXISTS (
        SELECT 1
        FROM @official AS o
        INNER JOIN dbo.saas_plans AS p ON p.id=o.plan_id
        WHERE JSON_VALUE(p.features_json, '$.branches') <> 'true'
    )
        THROW 51041, 'The denormalized plan feature projection failed validation.', 1;

    IF EXISTS (
        SELECT 1
        FROM dbo.saas_plans AS p
        INNER JOIN @official AS o ON o.plan_id=p.id
        WHERE (p.code='starter' AND (p.max_branches IS NULL OR p.max_branches<>1))
           OR (p.code='basic' AND (p.max_branches IS NULL OR p.max_branches<>2))
           OR (p.code='pro' AND (p.max_branches IS NULL OR p.max_branches<>5))
           OR (p.code='business' AND p.max_branches IS NOT NULL)
    )
        THROW 51042, 'The Gym core branch limits failed validation.', 1;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
