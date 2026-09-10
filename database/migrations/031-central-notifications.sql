/*
    Central notification center.

    The service also performs an idempotent startup check so a deployment can
    fail closed when this migration has not yet been applied. This migration
    is intentionally additive and does not alter existing business tables.
*/
IF OBJECT_ID(N'dbo.saas_notifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_notifications (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_notifications PRIMARY KEY,
        tenant_id INT NULL,
        audience_role VARCHAR(32) NULL,
        recipient_user_id INT NULL,
        actor_user_id INT NULL,
        type VARCHAR(80) NOT NULL,
        category VARCHAR(80) NOT NULL,
        severity VARCHAR(16) NOT NULL CONSTRAINT DF_saas_notifications_severity DEFAULT ('info'),
        title NVARCHAR(200) NOT NULL,
        message NVARCHAR(2000) NOT NULL,
        action_url NVARCHAR(500) NULL,
        entity_type VARCHAR(80) NULL,
        entity_id BIGINT NULL,
        dedupe_key VARCHAR(180) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_notifications_created DEFAULT (SYSUTCDATETIME()),
        expires_at DATETIME2(0) NULL,
        CONSTRAINT CK_saas_notifications_severity CHECK (severity IN ('info', 'success', 'warning', 'critical')),
        CONSTRAINT FK_saas_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_notifications_recipient FOREIGN KEY (recipient_user_id) REFERENCES dbo.gym_users(id) ON DELETE SET NULL,
        CONSTRAINT FK_saas_notifications_actor FOREIGN KEY (actor_user_id) REFERENCES dbo.gym_users(id) ON DELETE SET NULL
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_notifications_audience' AND object_id=OBJECT_ID(N'dbo.saas_notifications'))
    CREATE INDEX IX_saas_notifications_audience ON dbo.saas_notifications(tenant_id,audience_role,recipient_user_id,created_at DESC,id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_notifications_dedupe' AND object_id=OBJECT_ID(N'dbo.saas_notifications'))
    CREATE INDEX IX_saas_notifications_dedupe ON dbo.saas_notifications(dedupe_key,tenant_id,audience_role,recipient_user_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_saas_notifications_dedupe_key' AND object_id=OBJECT_ID(N'dbo.saas_notifications'))
    CREATE UNIQUE INDEX UQ_saas_notifications_dedupe_key ON dbo.saas_notifications(dedupe_key);

IF OBJECT_ID(N'dbo.saas_notification_reads', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_notification_reads (
        notification_id BIGINT NOT NULL,
        tenant_id INT NULL,
        user_id INT NOT NULL,
        read_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_notification_reads_read DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_saas_notification_reads PRIMARY KEY (notification_id,user_id),
        CONSTRAINT FK_saas_notification_reads_notification FOREIGN KEY (notification_id) REFERENCES dbo.saas_notifications(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_notification_reads_user FOREIGN KEY (user_id) REFERENCES dbo.gym_users(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_notification_reads_user' AND object_id=OBJECT_ID(N'dbo.saas_notification_reads'))
    CREATE INDEX IX_saas_notification_reads_user ON dbo.saas_notification_reads(user_id,tenant_id,read_at,notification_id);
