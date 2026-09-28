IF OBJECT_ID(N'dbo.email_outbox', N'U') IS NULL
BEGIN
CREATE TABLE dbo.email_outbox (
    id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_email_outbox PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id BIGINT NOT NULL,
    recipient_reference VARCHAR(80) NOT NULL,
    template_key VARCHAR(100) NOT NULL,
    payload_json NVARCHAR(MAX) NOT NULL,
    status VARCHAR(16) NOT NULL CONSTRAINT DF_email_outbox_status DEFAULT ('pending'),
    attempts INT NOT NULL CONSTRAINT DF_email_outbox_attempts DEFAULT (0),
    next_attempt_at DATETIME2(0) NOT NULL CONSTRAINT DF_email_outbox_next_attempt DEFAULT (SYSUTCDATETIME()),
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_email_outbox_created DEFAULT (SYSUTCDATETIME()),
    updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_email_outbox_updated DEFAULT (SYSUTCDATETIME()),
    sent_at DATETIME2(0) NULL,
    lease_token UNIQUEIDENTIFIER NULL,
    lease_until DATETIME2(0) NULL,
    last_error VARCHAR(80) NULL,
    idempotency_key NVARCHAR(180) NOT NULL,
    CONSTRAINT CK_email_outbox_status CHECK (status IN ('pending','processing','sent','skipped','failed')),
    CONSTRAINT CK_email_outbox_attempts CHECK (attempts >= 0)
);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UQ_email_outbox_idempotency_key' AND object_id=OBJECT_ID(N'dbo.email_outbox'))
    CREATE UNIQUE INDEX UQ_email_outbox_idempotency_key
    ON dbo.email_outbox(idempotency_key);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_email_outbox_claim' AND object_id=OBJECT_ID(N'dbo.email_outbox'))
    CREATE INDEX IX_email_outbox_claim
    ON dbo.email_outbox(status,next_attempt_at,created_at,id)
    INCLUDE (attempts,lease_until);
