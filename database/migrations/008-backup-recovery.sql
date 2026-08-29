/*
   Logic Fit migration 008: backup metadata and recovery audit.
   Additive and repeatable. Artifacts remain in private object storage; these
   tables contain metadata, checksums and safe status only.
*/
IF OBJECT_ID(N'dbo.gym_backup_records', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_backup_records (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_records PRIMARY KEY,
        tenant_id INT NOT NULL,
        backup_type VARCHAR(32) NOT NULL,
        backup_day DATE NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_backup_records_status DEFAULT ('PENDING'),
        backup_version INT NOT NULL CONSTRAINT DF_gym_backup_records_version DEFAULT (1),
        schema_version VARCHAR(64) NULL,
        backup_format VARCHAR(20) NOT NULL CONSTRAINT DF_gym_backup_records_format DEFAULT ('json.gz'),
        file_name NVARCHAR(260) NOT NULL,
        storage_key NVARCHAR(512) NULL,
        content_type VARCHAR(100) NULL,
        size_bytes BIGINT NULL,
        checksum_sha256 CHAR(64) NULL,
        manifest_json NVARCHAR(MAX) NULL,
        row_count BIGINT NOT NULL CONSTRAINT DF_gym_backup_records_rows DEFAULT (0),
        table_counts_json NVARCHAR(MAX) NULL,
        attempt_count INT NOT NULL CONSTRAINT DF_gym_backup_records_attempts DEFAULT (0),
        error_code VARCHAR(100) NULL,
        started_at DATETIME2(0) NULL,
        completed_at DATETIME2(0) NULL,
        verified_at DATETIME2(0) NULL,
        expires_at DATETIME2(0) NULL,
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_records_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_records_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_backup_records_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT CK_gym_backup_records_type CHECK (backup_type IN ('tenant_daily', 'tenant_manual', 'tenant_pre_restore')),
        CONSTRAINT CK_gym_backup_records_status CHECK (status IN ('PENDING', 'RUNNING', 'UPLOADED', 'VERIFYING', 'VERIFIED', 'FAILED', 'EXPIRED', 'DELETED')),
        CONSTRAINT CK_gym_backup_records_format CHECK (backup_format IN ('json.gz', 'bak')),
        CONSTRAINT CK_gym_backup_records_size CHECK (size_bytes IS NULL OR size_bytes >= 0)
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_backup_records_tenant_status_date'
      AND object_id=OBJECT_ID(N'dbo.gym_backup_records')
)
    CREATE INDEX IX_gym_backup_records_tenant_status_date
        ON dbo.gym_backup_records(tenant_id, status, backup_day DESC, id DESC);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'UQ_gym_backup_records_tenant_daily_day'
      AND object_id=OBJECT_ID(N'dbo.gym_backup_records')
)
    CREATE UNIQUE INDEX UQ_gym_backup_records_tenant_daily_day
        ON dbo.gym_backup_records(tenant_id, backup_type, backup_day)
        WHERE backup_type='tenant_daily';

IF OBJECT_ID(N'dbo.gym_backup_audit_log', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_backup_audit_log (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_audit_log PRIMARY KEY,
        tenant_id INT NOT NULL,
        backup_id BIGINT NULL,
        event_type VARCHAR(40) NOT NULL,
        actor_user_id INT NULL,
        reason NVARCHAR(1000) NULL,
        result VARCHAR(20) NOT NULL CONSTRAINT DF_gym_backup_audit_result DEFAULT ('success'),
        safe_metadata_json NVARCHAR(MAX) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_audit_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_backup_audit_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT CK_gym_backup_audit_result CHECK (result IN ('success', 'failed', 'blocked'))
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_backup_audit_tenant_date'
      AND object_id=OBJECT_ID(N'dbo.gym_backup_audit_log')
)
    CREATE INDEX IX_gym_backup_audit_tenant_date
        ON dbo.gym_backup_audit_log(tenant_id, created_at DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_platform_backup_records', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_platform_backup_records (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_platform_backup_records PRIMARY KEY,
        backup_type VARCHAR(32) NOT NULL,
        backup_day DATE NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_platform_backup_status DEFAULT ('PENDING'),
        backup_version INT NOT NULL CONSTRAINT DF_gym_platform_backup_version DEFAULT (1),
        schema_version VARCHAR(64) NULL,
        backup_format VARCHAR(20) NOT NULL CONSTRAINT DF_gym_platform_backup_format DEFAULT ('json.gz'),
        file_name NVARCHAR(260) NOT NULL,
        storage_key NVARCHAR(512) NULL,
        content_type VARCHAR(100) NULL,
        size_bytes BIGINT NULL,
        checksum_sha256 CHAR(64) NULL,
        manifest_json NVARCHAR(MAX) NULL,
        row_count BIGINT NOT NULL CONSTRAINT DF_gym_platform_backup_rows DEFAULT (0),
        table_counts_json NVARCHAR(MAX) NULL,
        attempt_count INT NOT NULL CONSTRAINT DF_gym_platform_backup_attempts DEFAULT (0),
        error_code VARCHAR(100) NULL,
        started_at DATETIME2(0) NULL,
        completed_at DATETIME2(0) NULL,
        verified_at DATETIME2(0) NULL,
        expires_at DATETIME2(0) NULL,
        created_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_platform_backup_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_platform_backup_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_platform_backup_type CHECK (backup_type IN ('platform_daily', 'platform_weekly', 'platform_monthly', 'platform_manual')),
        CONSTRAINT CK_gym_platform_backup_status CHECK (status IN ('PENDING', 'RUNNING', 'UPLOADED', 'VERIFYING', 'VERIFIED', 'FAILED', 'EXPIRED', 'DELETED')),
        CONSTRAINT CK_gym_platform_backup_format CHECK (backup_format IN ('json.gz', 'bak')),
        CONSTRAINT CK_gym_platform_backup_size CHECK (size_bytes IS NULL OR size_bytes >= 0)
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_platform_backup_status_date'
      AND object_id=OBJECT_ID(N'dbo.gym_platform_backup_records')
)
    CREATE INDEX IX_gym_platform_backup_status_date
        ON dbo.gym_platform_backup_records(status, backup_day DESC, id DESC);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'UQ_gym_platform_backup_daily_day'
      AND object_id=OBJECT_ID(N'dbo.gym_platform_backup_records')
)
    CREATE UNIQUE INDEX UQ_gym_platform_backup_daily_day
        ON dbo.gym_platform_backup_records(backup_type, backup_day)
        WHERE backup_type IN ('platform_daily', 'platform_weekly', 'platform_monthly');
