/* Phase 5: additive Trainer commercial operations. */
IF OBJECT_ID(N'dbo.gym_tenants', N'U') IS NULL
   OR OBJECT_ID(N'dbo.members', N'U') IS NULL
   OR OBJECT_ID(N'dbo.gym_payment_transactions', N'U') IS NULL
    THROW 51280, 'Phase 5 requires canonical tenant, member and payment ledger tables.', 1;

IF OBJECT_ID(N'dbo.trainer_packages', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.trainer_packages (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_trainer_packages PRIMARY KEY,
        tenant_id INT NOT NULL,
        name NVARCHAR(160) NOT NULL,
        description NVARCHAR(1000) NULL,
        price DECIMAL(12,2) NOT NULL,
        duration_days INT NULL,
        session_count INT NULL,
        service_mode VARCHAR(20) NOT NULL CONSTRAINT DF_trainer_packages_service_mode DEFAULT ('hybrid'),
        status VARCHAR(20) NOT NULL CONSTRAINT DF_trainer_packages_status DEFAULT ('active'),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_trainer_packages_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_trainer_packages_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_trainer_packages_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT CK_trainer_packages_price CHECK (price >= 0),
        CONSTRAINT CK_trainer_packages_shape CHECK (duration_days IS NOT NULL OR session_count IS NOT NULL),
        CONSTRAINT CK_trainer_packages_duration CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 3650),
        CONSTRAINT CK_trainer_packages_sessions CHECK (session_count IS NULL OR session_count BETWEEN 1 AND 10000),
        CONSTRAINT CK_trainer_packages_mode CHECK (service_mode IN ('in_person', 'online', 'hybrid')),
        CONSTRAINT CK_trainer_packages_status CHECK (status IN ('active', 'archived'))
    );
END;

IF OBJECT_ID(N'dbo.trainer_package_purchases', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.trainer_package_purchases (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_trainer_package_purchases PRIMARY KEY,
        tenant_id INT NOT NULL,
        package_id INT NOT NULL,
        member_id INT NOT NULL,
        starts_on DATE NOT NULL,
        ends_on DATE NULL,
        sessions_included INT NULL,
        sessions_remaining INT NULL,
        amount_due DECIMAL(12,2) NOT NULL,
        amount_paid DECIMAL(12,2) NOT NULL CONSTRAINT DF_trainer_package_purchases_paid DEFAULT (0),
        amount_remaining DECIMAL(12,2) NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_trainer_package_purchases_status DEFAULT ('active'),
        idempotency_key_hash CHAR(64) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_trainer_package_purchases_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_trainer_package_purchases_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_trainer_package_purchases_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_trainer_package_purchases_package FOREIGN KEY (package_id) REFERENCES dbo.trainer_packages(id) ON DELETE NO ACTION,
        CONSTRAINT FK_trainer_package_purchases_member FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_trainer_package_purchases_dates CHECK (ends_on IS NULL OR ends_on >= starts_on),
        CONSTRAINT CK_trainer_package_purchases_sessions CHECK (
            (sessions_included IS NULL AND sessions_remaining IS NULL)
            OR (sessions_included BETWEEN 1 AND 10000 AND sessions_remaining BETWEEN 0 AND sessions_included)
        ),
        CONSTRAINT CK_trainer_package_purchases_amounts CHECK (
            amount_due >= 0 AND amount_paid >= 0 AND amount_paid <= amount_due
            AND amount_remaining = amount_due - amount_paid
        ),
        CONSTRAINT CK_trainer_package_purchases_status CHECK (status IN ('active', 'completed', 'expired', 'cancelled'))
    );
END;

IF OBJECT_ID(N'dbo.coaching_sessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.coaching_sessions (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_coaching_sessions PRIMARY KEY,
        tenant_id INT NOT NULL,
        member_id INT NOT NULL,
        trainer_user_id INT NOT NULL,
        scheduled_start DATETIME2(0) NOT NULL,
        scheduled_end DATETIME2(0) NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_coaching_sessions_status DEFAULT ('scheduled'),
        notes NVARCHAR(1000) NULL,
        package_purchase_id INT NULL,
        idempotency_key_hash CHAR(64) NULL,
        completed_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_coaching_sessions_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_coaching_sessions_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_coaching_sessions_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_coaching_sessions_member FOREIGN KEY (member_id) REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT FK_coaching_sessions_package FOREIGN KEY (package_purchase_id) REFERENCES dbo.trainer_package_purchases(id) ON DELETE NO ACTION,
        CONSTRAINT CK_coaching_sessions_window CHECK (scheduled_end > scheduled_start),
        CONSTRAINT CK_coaching_sessions_status CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show'))
    );
END;

IF OBJECT_ID(N'dbo.trainer_package_usage', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.trainer_package_usage (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_trainer_package_usage PRIMARY KEY,
        tenant_id INT NOT NULL,
        package_purchase_id INT NOT NULL,
        coaching_session_id INT NOT NULL,
        quantity INT NOT NULL CONSTRAINT DF_trainer_package_usage_quantity DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_trainer_package_usage_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_trainer_package_usage_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE,
        CONSTRAINT FK_trainer_package_usage_purchase FOREIGN KEY (package_purchase_id) REFERENCES dbo.trainer_package_purchases(id) ON DELETE CASCADE,
        CONSTRAINT FK_trainer_package_usage_session FOREIGN KEY (coaching_session_id) REFERENCES dbo.coaching_sessions(id) ON DELETE CASCADE,
        CONSTRAINT UQ_trainer_package_usage_session UNIQUE (package_purchase_id, coaching_session_id),
        CONSTRAINT CK_trainer_package_usage_quantity CHECK (quantity = 1)
    );
END;

IF COL_LENGTH(N'dbo.gym_payment_transactions', N'membership_id') IS NOT NULL
   AND EXISTS (
       SELECT 1 FROM sys.columns
       WHERE object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
         AND name = N'membership_id'
         AND is_nullable = 0
   )
    ALTER TABLE dbo.gym_payment_transactions ALTER COLUMN membership_id INT NULL;

IF COL_LENGTH(N'dbo.gym_payment_transactions', N'trainer_package_purchase_id') IS NULL
    ALTER TABLE dbo.gym_payment_transactions ADD trainer_package_purchase_id INT NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name = N'FK_gym_payment_transactions_trainer_purchase'
      AND parent_object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
)
    ALTER TABLE dbo.gym_payment_transactions
        ADD CONSTRAINT FK_gym_payment_transactions_trainer_purchase
        FOREIGN KEY (trainer_package_purchase_id) REFERENCES dbo.trainer_package_purchases(id) ON DELETE NO ACTION;

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_gym_payment_transactions_owner_ref'
      AND parent_object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
)
    ALTER TABLE dbo.gym_payment_transactions
        ADD CONSTRAINT CK_gym_payment_transactions_owner_ref CHECK (
            (membership_id IS NOT NULL AND trainer_package_purchase_id IS NULL)
            OR (membership_id IS NULL AND trainer_package_purchase_id IS NOT NULL)
        );

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_trainer_packages_tenant_status'
      AND object_id = OBJECT_ID(N'dbo.trainer_packages')
)
BEGIN
    CREATE INDEX IX_trainer_packages_tenant_status
        ON dbo.trainer_packages(tenant_id, status, updated_at DESC, id DESC);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_trainer_package_purchases_tenant_member'
      AND object_id = OBJECT_ID(N'dbo.trainer_package_purchases')
)
BEGIN
    CREATE INDEX IX_trainer_package_purchases_tenant_member
        ON dbo.trainer_package_purchases(tenant_id, member_id, status, ends_on, id DESC);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_trainer_package_purchases_idempotency'
      AND object_id = OBJECT_ID(N'dbo.trainer_package_purchases')
)
BEGIN
    CREATE UNIQUE INDEX UX_trainer_package_purchases_idempotency
        ON dbo.trainer_package_purchases(idempotency_key_hash)
        WHERE idempotency_key_hash IS NOT NULL;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_coaching_sessions_tenant_schedule'
      AND object_id = OBJECT_ID(N'dbo.coaching_sessions')
)
BEGIN
    CREATE INDEX IX_coaching_sessions_tenant_schedule
        ON dbo.coaching_sessions(tenant_id, scheduled_start, status, id DESC);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_coaching_sessions_member_schedule'
      AND object_id = OBJECT_ID(N'dbo.coaching_sessions')
)
BEGIN
    CREATE INDEX IX_coaching_sessions_member_schedule
        ON dbo.coaching_sessions(member_id, scheduled_start DESC, id DESC);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_coaching_sessions_idempotency'
      AND object_id = OBJECT_ID(N'dbo.coaching_sessions')
)
BEGIN
    CREATE UNIQUE INDEX UX_coaching_sessions_idempotency
        ON dbo.coaching_sessions(idempotency_key_hash)
        WHERE idempotency_key_hash IS NOT NULL;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_trainer_package_usage_tenant_purchase'
      AND object_id = OBJECT_ID(N'dbo.trainer_package_usage')
)
BEGIN
    CREATE INDEX IX_trainer_package_usage_tenant_purchase
        ON dbo.trainer_package_usage(tenant_id, package_purchase_id, created_at DESC, id DESC);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_payment_transactions_trainer_purchase'
      AND object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
)
BEGIN
    CREATE INDEX IX_gym_payment_transactions_trainer_purchase
        ON dbo.gym_payment_transactions(trainer_package_purchase_id, paid_at DESC, id DESC);
END;
