IF OBJECT_ID(N'dbo.gym_mobile_refresh_sessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_mobile_refresh_sessions (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_gym_mobile_refresh_sessions PRIMARY KEY DEFAULT (NEWID()),
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME2(0) NOT NULL,
        revoked_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_mobile_refresh_sessions_created_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_mobile_refresh_sessions_token UNIQUE (token_hash),
        CONSTRAINT FK_gym_mobile_refresh_sessions_user FOREIGN KEY (user_id)
            REFERENCES dbo.gym_users(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_mobile_refresh_sessions_user_expiry' AND object_id = OBJECT_ID(N'dbo.gym_mobile_refresh_sessions'))
BEGIN
    CREATE INDEX IX_gym_mobile_refresh_sessions_user_expiry
        ON dbo.gym_mobile_refresh_sessions(user_id, expires_at DESC, revoked_at);
END;
