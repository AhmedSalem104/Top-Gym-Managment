/*
   Central Assistant permission migration.
   Runtime startup also executes the same idempotent schema from
   src/services/permission-service.js, so existing deployments are upgraded
   without a destructive schema change.
*/
IF OBJECT_ID(N'dbo.gym_user_permissions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_user_permissions (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_user_permissions PRIMARY KEY,
        user_id INT NOT NULL,
        permission_code VARCHAR(100) NOT NULL,
        is_granted BIT NOT NULL CONSTRAINT DF_gym_user_permissions_granted DEFAULT (0),
        updated_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_user_permissions_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_user_permissions_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_user_permissions_user_permission UNIQUE (user_id, permission_code),
        CONSTRAINT FK_gym_user_permissions_user FOREIGN KEY (user_id)
            REFERENCES dbo.gym_users(id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'dbo.gym_permission_audit', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_permission_audit (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_permission_audit PRIMARY KEY,
        target_user_id INT NOT NULL,
        actor_user_id INT NOT NULL,
        permission_code VARCHAR(100) NOT NULL,
        old_is_granted BIT NULL,
        new_is_granted BIT NOT NULL,
        reason NVARCHAR(500) NOT NULL,
        ip_address VARCHAR(64) NULL,
        user_agent NVARCHAR(512) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_permission_audit_created DEFAULT (SYSUTCDATETIME())
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_user_permissions_user' AND object_id=OBJECT_ID(N'dbo.gym_user_permissions'))
    CREATE INDEX IX_gym_user_permissions_user ON dbo.gym_user_permissions(user_id, permission_code, is_granted);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_permission_audit_target_date' AND object_id=OBJECT_ID(N'dbo.gym_permission_audit'))
    CREATE INDEX IX_gym_permission_audit_target_date ON dbo.gym_permission_audit(target_user_id, created_at DESC, id DESC);
