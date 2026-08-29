-- Backup/DR migration 009: platform-scope backup audit metadata.
-- Additive and repeatable. It intentionally contains no data migration,
-- deletion, or secret material.
IF OBJECT_ID(N'dbo.gym_platform_backup_audit_log', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_platform_backup_audit_log (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_platform_backup_audit_log PRIMARY KEY,
        backup_id BIGINT NULL,
        event_type VARCHAR(40) NOT NULL,
        actor_user_id INT NULL,
        reason NVARCHAR(1000) NULL,
        result VARCHAR(20) NOT NULL CONSTRAINT DF_gym_platform_backup_audit_result DEFAULT ('success'),
        safe_metadata_json NVARCHAR(MAX) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_platform_backup_audit_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_platform_backup_audit_result CHECK (result IN ('success', 'failed', 'blocked'))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_platform_backup_audit_date' AND object_id=OBJECT_ID(N'dbo.gym_platform_backup_audit_log'))
    CREATE INDEX IX_gym_platform_backup_audit_date ON dbo.gym_platform_backup_audit_log(created_at DESC, id DESC);
