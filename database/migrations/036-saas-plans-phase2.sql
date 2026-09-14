/*
   Logic Fit migration 036: SaaS Plans Phase 2 commercial catalog.

   LOGIC_FIT_CONTROLLED_PLAN_CONFIGURATION: saas-plan-catalog
   This is a controlled, idempotent control-plane configuration migration.
   It does not delete plans, subscriptions, tenants, members, payments, or
   historical snapshots. Enterprise remains an independent legacy plan and is
   disabled only for new subscriptions.
*/

IF OBJECT_ID(N'dbo.saas_plans', N'U') IS NULL
    THROW 51036, 'saas_plans must exist before migration 036.', 1;
IF OBJECT_ID(N'dbo.saas_plan_terms', N'U') IS NULL
    THROW 51036, 'saas_plan_terms must exist before migration 036.', 1;
IF OBJECT_ID(N'dbo.saas_plan_features', N'U') IS NULL
    THROW 51036, 'saas_plan_features must exist before migration 036.', 1;
IF OBJECT_ID(N'dbo.saas_plan_tenant_types', N'U') IS NULL
    THROW 51036, 'saas_plan_tenant_types must exist before migration 036.', 1;
IF OBJECT_ID(N'dbo.saas_tenant_subscriptions', N'U') IS NULL
    THROW 51036, 'saas_tenant_subscriptions must exist before migration 036.', 1;

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH(N'dbo.saas_plans', N'available_for_new_subscriptions') IS NULL
        EXEC(N'ALTER TABLE dbo.saas_plans ADD available_for_new_subscriptions BIT NOT NULL CONSTRAINT DF_saas_plans_available_for_new DEFAULT (1);');

    IF COL_LENGTH(N'dbo.saas_tenant_subscriptions', N'term_code_snapshot') IS NULL
        EXEC(N'ALTER TABLE dbo.saas_tenant_subscriptions ADD term_code_snapshot VARCHAR(20) NULL;');
    IF COL_LENGTH(N'dbo.saas_tenant_subscriptions', N'duration_months_snapshot') IS NULL
        EXEC(N'ALTER TABLE dbo.saas_tenant_subscriptions ADD duration_months_snapshot INT NULL;');
    IF OBJECT_ID(N'dbo.saas_subscription_requests', N'U') IS NOT NULL
    BEGIN
        IF COL_LENGTH(N'dbo.saas_subscription_requests', N'term_code') IS NULL
            EXEC(N'ALTER TABLE dbo.saas_subscription_requests ADD term_code VARCHAR(20) NULL;');
        IF COL_LENGTH(N'dbo.saas_subscription_requests', N'duration_months') IS NULL
            EXEC(N'ALTER TABLE dbo.saas_subscription_requests ADD duration_months INT NULL;');
    END;
    IF OBJECT_ID(N'dbo.saas_subscription_changes', N'U') IS NOT NULL
    BEGIN
        IF COL_LENGTH(N'dbo.saas_subscription_changes', N'new_term_code') IS NULL
            EXEC(N'ALTER TABLE dbo.saas_subscription_changes ADD new_term_code VARCHAR(20) NULL;');
        IF COL_LENGTH(N'dbo.saas_subscription_changes', N'new_duration_months') IS NULL
            EXEC(N'ALTER TABLE dbo.saas_subscription_changes ADD new_duration_months INT NULL;');
    END;

    CREATE TABLE #official (
        plan_code VARCHAR(40) NOT NULL PRIMARY KEY,
        plan_name NVARCHAR(120) NOT NULL,
        description NVARCHAR(500) NOT NULL,
        monthly_price DECIMAL(12,2) NOT NULL,
        max_members INT NULL,
        max_clients INT NULL,
        max_users INT NULL,
        max_ai_generations INT NULL,
        max_storage_mb INT NULL,
        max_branches INT NULL,
        sort_order INT NOT NULL
    );
    INSERT INTO #official (plan_code,plan_name,description,monthly_price,max_members,max_clients,max_users,max_ai_generations,max_storage_mb,max_branches,sort_order)
    VALUES
        ('starter',N'Starter',N'بداية وتشغيل أساسي للجيم والمدرب المستقل.',299,150,50,2,50,1024,1,1),
        ('basic',N'Basic',N'تشغيل كامل للمكان الصغير والمتوسط.',599,500,150,5,200,5120,2,2),
        ('pro',N'Pro',N'تشغيل متقدم مع الذكاء الاصطناعي والتوسع.',999,1500,500,15,750,20480,5,3),
        ('business',N'Business',N'أعلى مستوى مع كل الإمكانيات والدعم ذي الأولوية.',1499,NULL,NULL,NULL,2000,51200,NULL,4);

    DECLARE @existingOfficial TABLE (plan_code VARCHAR(40) PRIMARY KEY, plan_id INT NOT NULL);
    INSERT INTO @existingOfficial (plan_code,plan_id)
    SELECT o.plan_code,p.id
    FROM #official o
    INNER JOIN dbo.saas_plans p ON p.code=o.plan_code;

    -- The additive columns above may be created on an older database. Keep
    -- every later reference to them in a dynamic batch so SQL Server cannot
    -- bind the column before the guarded ALTER has run.
    EXEC(N'
        UPDATE p
        SET name=o.plan_name,
            description=o.description,
            billing_period=''monthly'',
            price=o.monthly_price,
            currency=''EGP'',
            max_members=o.max_members,
            max_clients=o.max_clients,
            max_users=o.max_users,
            max_ai_generations=o.max_ai_generations,
            max_storage_mb=o.max_storage_mb,
            max_branches=o.max_branches,
            is_active=1,
            lifecycle_status=''active'',
            available_for_new_subscriptions=1,
            sort_order=o.sort_order,
            updated_at=SYSUTCDATETIME()
        FROM dbo.saas_plans p
        INNER JOIN (VALUES
            (''starter'',N''Starter'',N''Basic operation for a gym or independent trainer.'',CONVERT(DECIMAL(12,2),299),150,50,2,50,1024,1,1),
            (''basic'',N''Basic'',N''Full operation for a small or medium business.'',CONVERT(DECIMAL(12,2),599),500,150,5,200,5120,2,2),
            (''pro'',N''Pro'',N''Advanced operation with AI and room to grow.'',CONVERT(DECIMAL(12,2),999),1500,500,15,750,20480,5,3),
            (''business'',N''Business'',N''Full capabilities with priority support.'',CONVERT(DECIMAL(12,2),1499),NULL,NULL,NULL,2000,51200,NULL,4)
        ) o(plan_code,plan_name,description,monthly_price,max_members,max_clients,max_users,max_ai_generations,max_storage_mb,max_branches,sort_order)
          ON o.plan_code=p.code;

        INSERT INTO dbo.saas_plans (code,name,description,billing_period,price,currency,max_members,max_clients,max_users,max_ai_generations,max_storage_mb,max_branches,features_json,is_active,lifecycle_status,available_for_new_subscriptions,sort_order)
        SELECT o.plan_code,o.plan_name,o.description,''monthly'',o.monthly_price,''EGP'',o.max_members,o.max_clients,o.max_users,o.max_ai_generations,o.max_storage_mb,o.max_branches,N''{}'',1,''active'',1,o.sort_order
        FROM (VALUES
            (''starter'',N''Starter'',N''Basic operation for a gym or independent trainer.'',CONVERT(DECIMAL(12,2),299),150,50,2,50,1024,1,1),
            (''basic'',N''Basic'',N''Full operation for a small or medium business.'',CONVERT(DECIMAL(12,2),599),500,150,5,200,5120,2,2),
            (''pro'',N''Pro'',N''Advanced operation with AI and room to grow.'',CONVERT(DECIMAL(12,2),999),1500,500,15,750,20480,5,3),
            (''business'',N''Business'',N''Full capabilities with priority support.'',CONVERT(DECIMAL(12,2),1499),NULL,NULL,NULL,2000,51200,NULL,4)
        ) o(plan_code,plan_name,description,monthly_price,max_members,max_clients,max_users,max_ai_generations,max_storage_mb,max_branches,sort_order)
        WHERE NOT EXISTS (SELECT 1 FROM dbo.saas_plans p WHERE p.code=o.plan_code);
    ');

    -- Re-apply the strongly typed source table after the compatibility batch.
    -- This keeps the migration's persisted text deterministic even when the
    -- guarded dynamic batch had to create a missing official plan.
    UPDATE p
    SET name=o.plan_name,
        description=o.description,
        billing_period='monthly',
        price=o.monthly_price,
        currency='EGP',
        max_members=o.max_members,
        max_clients=o.max_clients,
        max_users=o.max_users,
        max_ai_generations=o.max_ai_generations,
        max_storage_mb=o.max_storage_mb,
        max_branches=o.max_branches,
        is_active=1,
        lifecycle_status='active',
        sort_order=o.sort_order,
        updated_at=SYSUTCDATETIME()
    FROM dbo.saas_plans p
    INNER JOIN #official o ON o.plan_code=p.code;

    -- Enterprise is deliberately not part of @official: preserve its identity,
    -- price, snapshots, and lifecycle while preventing new subscriptions.
    EXEC(N'UPDATE dbo.saas_plans SET available_for_new_subscriptions=0,updated_at=SYSUTCDATETIME() WHERE code=''enterprise'';');

    DECLARE @terms TABLE (
        plan_code VARCHAR(40) NOT NULL,
        term_code VARCHAR(20) NOT NULL,
        duration_months INT NOT NULL,
        price DECIMAL(12,2) NOT NULL,
        sort_order INT NOT NULL,
        PRIMARY KEY (plan_code,term_code)
    );
    INSERT INTO @terms (plan_code,term_code,duration_months,price,sort_order)
    VALUES
        ('starter','monthly',1,299,1),('starter','quarterly',3,799,2),('starter','semiannual',6,1499,3),('starter','annual',12,2699,4),
        ('basic','monthly',1,599,1),('basic','quarterly',3,1599,2),('basic','semiannual',6,2999,3),('basic','annual',12,5499,4),
        ('pro','monthly',1,999,1),('pro','quarterly',3,2699,2),('pro','semiannual',6,4999,3),('pro','annual',12,8999,4),
        ('business','monthly',1,1499,1),('business','quarterly',3,3999,2),('business','semiannual',6,7499,3),('business','annual',12,13499,4);

    MERGE dbo.saas_plan_terms AS target
    USING (
        SELECT p.id,t.term_code,t.duration_months,t.price,t.sort_order
        FROM @terms t
        INNER JOIN dbo.saas_plans p ON p.code=t.plan_code
    ) AS source
    ON target.plan_id=source.id AND target.term_code=source.term_code
    WHEN MATCHED THEN UPDATE SET duration_months=source.duration_months,price=source.price,currency='EGP',discount_amount=0,discount_percent=0,is_active=1,sort_order=source.sort_order,updated_at=SYSUTCDATETIME()
    WHEN NOT MATCHED BY TARGET THEN INSERT (plan_id,term_code,duration_months,price,currency,discount_amount,discount_percent,is_active,sort_order)
        VALUES (source.id,source.term_code,source.duration_months,source.price,'EGP',0,0,1,source.sort_order);

    MERGE dbo.saas_plan_tenant_types AS target
    USING (
        SELECT p.id AS plan_id,CAST('gym' AS VARCHAR(32)) AS tenant_type FROM dbo.saas_plans p INNER JOIN #official o ON o.plan_code=p.code
        UNION ALL
        SELECT p.id,CAST('independent_trainer' AS VARCHAR(32)) FROM dbo.saas_plans p INNER JOIN #official o ON o.plan_code=p.code
    ) AS source
    ON target.plan_id=source.plan_id AND target.tenant_type=source.tenant_type
    WHEN NOT MATCHED BY TARGET THEN INSERT (plan_id,tenant_type) VALUES (source.plan_id,source.tenant_type);

    DECLARE @featureSeed TABLE (plan_code VARCHAR(40) NOT NULL PRIMARY KEY, enabled_features NVARCHAR(MAX) NOT NULL);
    INSERT INTO @featureSeed (plan_code,enabled_features)
    VALUES
        ('starter',N'dashboard,members,attendance,pricing,coaching,nutrition,library,payments,reports,portal,branding,team,clients,notifications'),
        ('basic',N'dashboard,members,attendance,pricing,coaching,nutrition,library,payments,reports,portal,branding,team,clients,notifications,ai,finance,day_passes,branches,backup,assessments,progress,goals,sessions,packages,tasks,templates'),
        ('pro',N'dashboard,members,attendance,pricing,coaching,nutrition,library,payments,reports,portal,branding,team,clients,notifications,ai,finance,day_passes,branches,backup,assessments,progress,goals,sessions,packages,tasks,templates,store,inventory,bar,audit'),
        ('business',N'dashboard,members,attendance,pricing,coaching,nutrition,library,payments,reports,portal,branding,team,clients,notifications,ai,finance,day_passes,branches,backup,assessments,progress,goals,sessions,packages,tasks,templates,store,inventory,bar,audit,prioritySupport');

    MERGE dbo.saas_plan_features AS target
    USING (
        SELECT p.id AS plan_id,CAST(LTRIM(RTRIM(s.value)) AS VARCHAR(80)) AS feature_key,CAST(1 AS BIT) AS is_enabled
        FROM @featureSeed seed
        INNER JOIN dbo.saas_plans p ON p.code=seed.plan_code
        CROSS APPLY STRING_SPLIT(seed.enabled_features,',') s
    ) AS source
    ON target.plan_id=source.plan_id AND target.feature_key=source.feature_key
    WHEN MATCHED THEN UPDATE SET is_enabled=source.is_enabled,updated_at=SYSUTCDATETIME()
    WHEN NOT MATCHED BY TARGET THEN INSERT (plan_id,feature_key,is_enabled) VALUES (source.plan_id,source.feature_key,source.is_enabled);

    UPDATE f
    SET is_enabled=0,updated_at=SYSUTCDATETIME()
    FROM dbo.saas_plan_features f
    INNER JOIN dbo.saas_plans p ON p.id=f.plan_id
    INNER JOIN @featureSeed seed ON seed.plan_code=p.code
    WHERE NOT EXISTS (
        SELECT 1 FROM STRING_SPLIT(seed.enabled_features,',') enabled
        WHERE LTRIM(RTRIM(enabled.value))=f.feature_key
    );

    UPDATE p
    SET features_json=CONCAT(N'{',COALESCE((
        SELECT STRING_AGG(CONCAT(N'"',REPLACE(f.feature_key,N'"',N''),N'":',CASE WHEN f.is_enabled=1 THEN N'true' ELSE N'false' END),N',')
        FROM dbo.saas_plan_features f
        WHERE f.plan_id=p.id
    ),N''),N'}'),
        updated_at=SYSUTCDATETIME()
    FROM dbo.saas_plans p
    INNER JOIN @featureSeed seed ON seed.plan_code=p.code;

    -- Additive snapshot metadata only. Existing monetary/feature snapshots are
    -- untouched; legacy monthly/yearly values are mapped to a term identity.
    EXEC(N'
        UPDATE s
        SET term_code_snapshot=CASE WHEN s.billing_period_snapshot=''yearly'' THEN ''annual'' ELSE ''monthly'' END,
            duration_months_snapshot=CASE WHEN s.billing_period_snapshot=''yearly'' THEN 12 ELSE 1 END,
            updated_at=SYSUTCDATETIME()
        FROM dbo.saas_tenant_subscriptions s
        WHERE s.term_code_snapshot IS NULL OR s.duration_months_snapshot IS NULL;
    ');

    IF NOT EXISTS (SELECT 1 FROM dbo.saas_plans WHERE code='enterprise')
        THROW 51037, 'Enterprise legacy plan is missing; migration stopped fail-closed.', 1;
    IF (SELECT COUNT_BIG(*) FROM dbo.saas_plans WHERE code IN ('starter','basic','pro','business')) <> 4
        THROW 51038, 'Official SaaS plan catalog is incomplete.', 1;
    IF EXISTS (SELECT 1 FROM @existingOfficial e INNER JOIN dbo.saas_plans p ON p.code=e.plan_code WHERE p.id<>e.plan_id)
        THROW 51039, 'Existing official plan identity changed unexpectedly.', 1;
    IF EXISTS (
        SELECT plan_code FROM @terms t
        INNER JOIN dbo.saas_plans p ON p.code=t.plan_code
        LEFT JOIN dbo.saas_plan_terms actual ON actual.plan_id=p.id AND actual.term_code=t.term_code
        WHERE actual.id IS NULL OR actual.duration_months<>t.duration_months OR actual.price<>t.price OR actual.currency<>'EGP' OR actual.is_active<>1
    )
        THROW 51040, 'One or more official billing terms failed validation.', 1;
    IF EXISTS (
        SELECT p.code FROM dbo.saas_plans p INNER JOIN #official o ON o.plan_code=p.code
        WHERE (SELECT COUNT_BIG(*) FROM dbo.saas_plan_terms t WHERE t.plan_id=p.id AND t.term_code IN ('monthly','quarterly','semiannual','annual'))<>4
    )
        THROW 51041, 'Each official plan must have exactly four active billing terms.', 1;
    IF EXISTS (
        SELECT p.code FROM dbo.saas_plans p INNER JOIN #official o ON o.plan_code=p.code
        WHERE EXISTS (
            SELECT 1 FROM dbo.saas_plan_features f
            WHERE f.plan_id=p.id AND f.feature_key IN ('dashboard','members','attendance','coaching','nutrition','ai','library','pricing','payments','finance','day_passes','reports','store','inventory','branches','bar','portal','branding','team','backup','audit','clients','assessments','progress','goals','sessions','packages','notifications','tasks','templates','prioritySupport')
              AND f.is_enabled<>CASE WHEN EXISTS (SELECT 1 FROM STRING_SPLIT((SELECT enabled_features FROM @featureSeed WHERE plan_code=p.code),',') e WHERE LTRIM(RTRIM(e.value))=f.feature_key) THEN 1 ELSE 0 END
        )
    )
        THROW 51042, 'Official feature entitlement matrix failed validation.', 1;
    EXEC(N'
        IF EXISTS (SELECT 1 FROM dbo.saas_plans WHERE code=''enterprise'' AND available_for_new_subscriptions<>0)
            THROW 51043, ''Enterprise must remain legacy-only for new subscriptions.'', 1;
    ');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
