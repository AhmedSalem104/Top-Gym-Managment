/*
  Logic Fit Branch Foundation
  Additive and idempotent. Branches belong to Gym tenants; they are never
  tenants themselves. Tenant RLS is attached by tenant-service after this
  migration has created the tables.
*/

IF OBJECT_ID(N'dbo.gym_branches', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_branches (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_branches PRIMARY KEY,
        tenant_id INT NOT NULL,
        branch_code VARCHAR(40) NOT NULL,
        name NVARCHAR(160) NOT NULL,
        address NVARCHAR(300) NULL,
        phone NVARCHAR(40) NULL,
        working_hours_json NVARCHAR(MAX) NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_branches_status DEFAULT ('active'),
        is_main_branch BIT NOT NULL CONSTRAINT DF_gym_branches_is_main DEFAULT (0),
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branches_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branches_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_branches_tenant_code UNIQUE (tenant_id, branch_code),
        CONSTRAINT FK_gym_branches_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT CK_gym_branches_status CHECK (status IN ('active', 'inactive', 'archived'))
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'UX_gym_branches_tenant_main'
      AND object_id=OBJECT_ID(N'dbo.gym_branches')
)
    CREATE UNIQUE INDEX UX_gym_branches_tenant_main
        ON dbo.gym_branches(tenant_id)
        WHERE is_main_branch=1;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_branches_tenant_status'
      AND object_id=OBJECT_ID(N'dbo.gym_branches')
)
    CREATE INDEX IX_gym_branches_tenant_status
        ON dbo.gym_branches(tenant_id, status, is_main_branch DESC, id);

IF OBJECT_ID(N'dbo.gym_branch_user_access', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_branch_user_access (
        tenant_id INT NOT NULL,
        branch_id INT NOT NULL,
        user_id INT NOT NULL,
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branch_user_access_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_gym_branch_user_access PRIMARY KEY (branch_id, user_id),
        CONSTRAINT FK_gym_branch_user_access_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_branch_user_access_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id),
        CONSTRAINT FK_gym_branch_user_access_user FOREIGN KEY (user_id) REFERENCES dbo.gym_users(id)
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_branch_user_access_tenant_user'
      AND object_id=OBJECT_ID(N'dbo.gym_branch_user_access')
)
    CREATE INDEX IX_gym_branch_user_access_tenant_user
        ON dbo.gym_branch_user_access(tenant_id, user_id, branch_id);

IF OBJECT_ID(N'dbo.gym_branch_commerce_config', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_branch_commerce_config (
        tenant_id INT NOT NULL,
        branch_id INT NOT NULL CONSTRAINT PK_gym_branch_commerce_config PRIMARY KEY,
        store_enabled BIT NOT NULL CONSTRAINT DF_gym_branch_commerce_store DEFAULT (1),
        bar_enabled BIT NOT NULL CONSTRAINT DF_gym_branch_commerce_bar DEFAULT (0),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branch_commerce_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_branch_commerce_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_branch_commerce_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_branch_commerce_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id)
    );
END;

-- Existing Gym tenants receive one deterministic operational branch. This
-- is intentionally not executed for Independent Trainer tenants. MERGE is
-- used for an explicit per-tenant match so the seed remains idempotent.
MERGE dbo.gym_branches AS target
USING (
    SELECT t.id AS tenant_id
    FROM dbo.gym_tenants t
    WHERE t.tenant_type='gym'
) AS source
ON target.tenant_id=source.tenant_id
   AND (target.is_main_branch=1 OR target.branch_code='main')
WHEN NOT MATCHED THEN
    INSERT (tenant_id, branch_code, name, status, is_main_branch)
    VALUES (source.tenant_id, 'main', N'Main Branch', 'active', 1);

-- Preserve current Assistant usability by assigning the default branch only
-- to active Gym memberships that have no explicit branch mapping yet.
MERGE dbo.gym_branch_user_access AS target
USING (
    SELECT ut.tenant_id, b.id AS branch_id, ut.user_id
    FROM dbo.gym_user_tenants ut
    INNER JOIN dbo.gym_tenants t ON t.id=ut.tenant_id AND t.tenant_type='gym'
    INNER JOIN dbo.gym_branches b ON b.tenant_id=ut.tenant_id AND b.is_main_branch=1
    WHERE ut.status='active' AND ut.role='Assistant'
) AS source
ON target.tenant_id=source.tenant_id
   AND target.branch_id=source.branch_id
   AND target.user_id=source.user_id
WHEN NOT MATCHED THEN
    INSERT (tenant_id, branch_id, user_id)
    VALUES (source.tenant_id, source.branch_id, source.user_id);

MERGE dbo.gym_branch_commerce_config AS target
USING (
    SELECT b.tenant_id, b.id AS branch_id
    FROM dbo.gym_branches b
) AS source
ON target.branch_id=source.branch_id
WHEN NOT MATCHED THEN
    INSERT (tenant_id, branch_id)
    VALUES (source.tenant_id, source.branch_id);
