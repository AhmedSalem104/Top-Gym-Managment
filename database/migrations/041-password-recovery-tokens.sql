IF OBJECT_ID(N'dbo.gym_password_recovery_tokens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_password_recovery_tokens (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_password_recovery_tokens PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME2(0) NOT NULL,
        used_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_password_recovery_tokens_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_password_recovery_tokens_hash UNIQUE (token_hash),
        CONSTRAINT FK_gym_password_recovery_tokens_user FOREIGN KEY (user_id)
            REFERENCES dbo.gym_users(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_password_recovery_tokens_user' AND object_id=OBJECT_ID(N'dbo.gym_password_recovery_tokens'))
    CREATE INDEX IX_gym_password_recovery_tokens_user
        ON dbo.gym_password_recovery_tokens(user_id,created_at DESC)
        INCLUDE (expires_at,used_at);
