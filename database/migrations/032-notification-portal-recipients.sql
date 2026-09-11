/*
    Portal notification recipients.

    This is additive: existing staff/platform notifications remain in
    saas_notifications + saas_notification_reads. Member and trainer-client
    portal read state is kept in a separate table because portal sessions are
    keyed to members, not gym_users.
*/
IF COL_LENGTH(N'dbo.saas_notifications', N'recipient_member_id') IS NULL
    ALTER TABLE dbo.saas_notifications ADD recipient_member_id INT NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name=N'FK_saas_notifications_member_recipient'
      AND parent_object_id=OBJECT_ID(N'dbo.saas_notifications')
)
    ALTER TABLE dbo.saas_notifications ADD CONSTRAINT FK_saas_notifications_member_recipient
        FOREIGN KEY (recipient_member_id) REFERENCES dbo.members(id) ON DELETE NO ACTION;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_notifications_member_audience' AND object_id=OBJECT_ID(N'dbo.saas_notifications'))
    CREATE INDEX IX_saas_notifications_member_audience
        ON dbo.saas_notifications(tenant_id,recipient_member_id,audience_role,created_at DESC,id DESC);

IF OBJECT_ID(N'dbo.saas_member_notification_reads', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_member_notification_reads (
        notification_id BIGINT NOT NULL,
        tenant_id INT NOT NULL,
        member_id INT NOT NULL,
        read_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_member_notification_reads_read DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_saas_member_notification_reads PRIMARY KEY (notification_id,member_id),
        CONSTRAINT FK_saas_member_notification_reads_notification FOREIGN KEY (notification_id) REFERENCES dbo.saas_notifications(id) ON DELETE CASCADE,
        CONSTRAINT FK_saas_member_notification_reads_member FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_member_notification_reads_member' AND object_id=OBJECT_ID(N'dbo.saas_member_notification_reads'))
    CREATE INDEX IX_saas_member_notification_reads_member
        ON dbo.saas_member_notification_reads(member_id,tenant_id,read_at,notification_id);
