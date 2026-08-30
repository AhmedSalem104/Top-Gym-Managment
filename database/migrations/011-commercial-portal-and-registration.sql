/*
   Logic Fit migration 011: commercial portal and self-service registration.
   Additive and repeatable. Tenant-owned tables are added to the runtime RLS
   inventory by tenant-service.js; platform-owned tables remain platform-only.
   No existing records are rewritten by this migration.
*/

IF OBJECT_ID(N'dbo.saas_plan_terms', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_plan_terms (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_plan_terms PRIMARY KEY,
        plan_id INT NOT NULL,
        term_code VARCHAR(20) NOT NULL,
        duration_months INT NOT NULL,
        price DECIMAL(12,2) NOT NULL,
        currency CHAR(3) NOT NULL CONSTRAINT DF_saas_plan_terms_currency DEFAULT ('EGP'),
        discount_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_saas_plan_terms_discount_amount DEFAULT (0),
        discount_percent DECIMAL(5,2) NOT NULL CONSTRAINT DF_saas_plan_terms_discount_percent DEFAULT (0),
        is_active BIT NOT NULL CONSTRAINT DF_saas_plan_terms_active DEFAULT (1),
        sort_order INT NOT NULL CONSTRAINT DF_saas_plan_terms_sort DEFAULT (0),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_plan_terms_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_plan_terms_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_saas_plan_terms_plan FOREIGN KEY (plan_id) REFERENCES dbo.saas_plans(id) ON DELETE CASCADE,
        CONSTRAINT UQ_saas_plan_terms_plan_code UNIQUE (plan_id, term_code),
        CONSTRAINT CK_saas_plan_terms_code CHECK (term_code IN ('monthly', 'quarterly', 'semiannual', 'annual')),
        CONSTRAINT CK_saas_plan_terms_duration CHECK (duration_months > 0 AND duration_months <= 120),
        CONSTRAINT CK_saas_plan_terms_amounts CHECK (price >= 0 AND discount_amount >= 0 AND discount_amount <= price AND discount_percent >= 0 AND discount_percent <= 100)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_plan_terms_catalog' AND object_id=OBJECT_ID(N'dbo.saas_plan_terms'))
    CREATE INDEX IX_saas_plan_terms_catalog ON dbo.saas_plan_terms(is_active, sort_order, plan_id, id);

IF OBJECT_ID(N'dbo.saas_platform_payment_methods', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_platform_payment_methods (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_platform_payment_methods PRIMARY KEY,
        method_code VARCHAR(60) NOT NULL,
        display_name NVARCHAR(120) NOT NULL,
        account_reference NVARCHAR(160) NOT NULL,
        recipient_name NVARCHAR(160) NULL,
        instructions NVARCHAR(1000) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_saas_platform_payment_methods_active DEFAULT (1),
        sort_order INT NOT NULL CONSTRAINT DF_saas_platform_payment_methods_sort DEFAULT (0),
        created_by_user_id INT NULL,
        updated_by_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_platform_payment_methods_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_platform_payment_methods_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_saas_platform_payment_methods_code UNIQUE (method_code),
        CONSTRAINT CK_saas_platform_payment_methods_code CHECK (LEN(LTRIM(RTRIM(method_code))) BETWEEN 2 AND 60)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_platform_payment_methods_active' AND object_id=OBJECT_ID(N'dbo.saas_platform_payment_methods'))
    CREATE INDEX IX_saas_platform_payment_methods_active ON dbo.saas_platform_payment_methods(is_active, sort_order, id);

IF OBJECT_ID(N'dbo.saas_gym_registration_requests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_gym_registration_requests (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_gym_registration_requests PRIMARY KEY,
        gym_name NVARCHAR(160) NOT NULL,
        owner_name NVARCHAR(120) NOT NULL,
        whatsapp NVARCHAR(40) NOT NULL,
        email NVARCHAR(254) NULL,
        city NVARCHAR(120) NULL,
        plan_id INT NOT NULL,
        plan_code_snapshot VARCHAR(40) NOT NULL,
        plan_name_snapshot NVARCHAR(120) NOT NULL,
        term_code_snapshot VARCHAR(20) NOT NULL,
        duration_months_snapshot INT NOT NULL,
        price_snapshot DECIMAL(12,2) NOT NULL,
        discount_amount_snapshot DECIMAL(12,2) NOT NULL CONSTRAINT DF_saas_registration_discount DEFAULT (0),
        amount_due_snapshot DECIMAL(12,2) NOT NULL,
        currency_snapshot CHAR(3) NOT NULL CONSTRAINT DF_saas_registration_currency DEFAULT ('EGP'),
        payment_method_code_snapshot VARCHAR(60) NULL,
        payment_method_name_snapshot NVARCHAR(120) NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_saas_registration_status DEFAULT ('pending'),
        notes NVARCHAR(2000) NULL,
        review_notes NVARCHAR(2000) NULL,
        reviewed_by_user_id INT NULL,
        reviewed_at DATETIME2(0) NULL,
        created_tenant_id INT NULL,
        created_owner_user_id INT NULL,
        idempotency_key_hash CHAR(64) NULL,
        public_token_hash CHAR(64) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_registration_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_registration_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_saas_registration_plan FOREIGN KEY (plan_id) REFERENCES dbo.saas_plans(id) ON DELETE NO ACTION,
        CONSTRAINT CK_saas_registration_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        CONSTRAINT CK_saas_registration_amounts CHECK (price_snapshot >= 0 AND discount_amount_snapshot >= 0 AND discount_amount_snapshot <= price_snapshot AND amount_due_snapshot = price_snapshot - discount_amount_snapshot),
        CONSTRAINT CK_saas_registration_duration CHECK (duration_months_snapshot > 0 AND duration_months_snapshot <= 120)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_registration_review_queue' AND object_id=OBJECT_ID(N'dbo.saas_gym_registration_requests'))
    CREATE INDEX IX_saas_registration_review_queue ON dbo.saas_gym_registration_requests(status, created_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_saas_registration_idempotency' AND object_id=OBJECT_ID(N'dbo.saas_gym_registration_requests'))
    CREATE UNIQUE INDEX UX_saas_registration_idempotency ON dbo.saas_gym_registration_requests(idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;
IF COL_LENGTH(N'dbo.saas_gym_registration_requests', N'public_token_hash') IS NULL
    EXEC(N'ALTER TABLE dbo.saas_gym_registration_requests ADD public_token_hash CHAR(64) NULL;');
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_saas_registration_public_token' AND object_id=OBJECT_ID(N'dbo.saas_gym_registration_requests'))
    CREATE UNIQUE INDEX UX_saas_registration_public_token ON dbo.saas_gym_registration_requests(public_token_hash) WHERE public_token_hash IS NOT NULL;

IF OBJECT_ID(N'dbo.saas_gym_registration_payment_proofs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.saas_gym_registration_payment_proofs (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_saas_gym_registration_payment_proofs PRIMARY KEY,
        request_id BIGINT NOT NULL,
        file_name NVARCHAR(255) NOT NULL,
        mime_type VARCHAR(80) NOT NULL,
        file_size INT NOT NULL,
        sha256 CHAR(64) NOT NULL,
        storage_key NVARCHAR(512) NULL,
        storage_provider VARCHAR(40) NULL,
        storage_verified_at DATETIME2(0) NULL,
        uploaded_at DATETIME2(0) NOT NULL CONSTRAINT DF_saas_registration_proofs_uploaded DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_saas_registration_proofs_request UNIQUE (request_id),
        CONSTRAINT FK_saas_registration_proofs_request FOREIGN KEY (request_id) REFERENCES dbo.saas_gym_registration_requests(id) ON DELETE CASCADE,
        CONSTRAINT CK_saas_registration_proofs_size CHECK (file_size > 0 AND file_size <= 4194304)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_saas_registration_proofs_request' AND object_id=OBJECT_ID(N'dbo.saas_gym_registration_payment_proofs'))
    CREATE INDEX IX_saas_registration_proofs_request ON dbo.saas_gym_registration_payment_proofs(request_id, uploaded_at DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_member_subscription_requests', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_member_subscription_requests (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_member_subscription_requests PRIMARY KEY,
        tenant_id INT NOT NULL,
        member_id INT NOT NULL,
        request_type VARCHAR(40) NOT NULL CONSTRAINT DF_gym_member_subscription_requests_type DEFAULT ('membership'),
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_member_subscription_requests_status DEFAULT ('pending'),
        membership_plan VARCHAR(30) NOT NULL,
        membership_type VARCHAR(30) NOT NULL,
        duration_mode VARCHAR(10) NOT NULL,
        duration_value INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        list_price DECIMAL(12,2) NOT NULL,
        discount_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_member_subscription_requests_discount DEFAULT (0),
        amount_due DECIMAL(12,2) NOT NULL,
        currency CHAR(3) NOT NULL CONSTRAINT DF_gym_member_subscription_requests_currency DEFAULT ('EGP'),
        payment_method_code VARCHAR(60) NULL,
        payment_method_name NVARCHAR(120) NULL,
        notes NVARCHAR(1000) NULL,
        review_notes NVARCHAR(1000) NULL,
        reviewed_by_user_id INT NULL,
        reviewed_at DATETIME2(0) NULL,
        approved_membership_id INT NULL,
        created_payment_id INT NULL,
        created_ledger_transaction_id INT NULL,
        idempotency_key_hash CHAR(64) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_member_subscription_requests_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_member_subscription_requests_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_member_subscription_requests_type CHECK (LEN(LTRIM(RTRIM(request_type))) BETWEEN 2 AND 40),
        CONSTRAINT CK_gym_member_subscription_requests_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        CONSTRAINT CK_gym_member_subscription_requests_duration CHECK (duration_value > 0 AND duration_value <= 1200 AND duration_mode IN ('days', 'months')),
        CONSTRAINT CK_gym_member_subscription_requests_dates CHECK (end_date IS NULL OR end_date >= start_date),
        CONSTRAINT CK_gym_member_subscription_requests_amounts CHECK (list_price >= 0 AND discount_amount >= 0 AND discount_amount <= list_price AND amount_due = list_price - discount_amount)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_member_subscription_requests_tenant_queue' AND object_id=OBJECT_ID(N'dbo.gym_member_subscription_requests'))
    CREATE INDEX IX_gym_member_subscription_requests_tenant_queue ON dbo.gym_member_subscription_requests(tenant_id, status, created_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_gym_member_subscription_requests_pending_kind' AND object_id=OBJECT_ID(N'dbo.gym_member_subscription_requests'))
    CREATE UNIQUE INDEX UX_gym_member_subscription_requests_pending_kind
        ON dbo.gym_member_subscription_requests(tenant_id, member_id, request_type)
        WHERE status='pending';
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'UX_gym_member_subscription_requests_idempotency' AND object_id=OBJECT_ID(N'dbo.gym_member_subscription_requests'))
    CREATE UNIQUE INDEX UX_gym_member_subscription_requests_idempotency ON dbo.gym_member_subscription_requests(tenant_id, idempotency_key_hash) WHERE idempotency_key_hash IS NOT NULL;

IF OBJECT_ID(N'dbo.gym_member_subscription_payment_proofs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_member_subscription_payment_proofs (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_member_subscription_payment_proofs PRIMARY KEY,
        tenant_id INT NOT NULL,
        request_id BIGINT NOT NULL,
        file_name NVARCHAR(255) NOT NULL,
        mime_type VARCHAR(80) NOT NULL,
        file_size INT NOT NULL,
        sha256 CHAR(64) NOT NULL,
        storage_key NVARCHAR(512) NULL,
        storage_provider VARCHAR(40) NULL,
        storage_verified_at DATETIME2(0) NULL,
        uploaded_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_member_subscription_proofs_uploaded DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_member_subscription_proofs_request UNIQUE (request_id),
        CONSTRAINT FK_gym_member_subscription_proofs_request FOREIGN KEY (request_id) REFERENCES dbo.gym_member_subscription_requests(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_member_subscription_proofs_size CHECK (file_size > 0 AND file_size <= 4194304)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_member_subscription_proofs_tenant' AND object_id=OBJECT_ID(N'dbo.gym_member_subscription_payment_proofs'))
    CREATE INDEX IX_gym_member_subscription_proofs_tenant ON dbo.gym_member_subscription_payment_proofs(tenant_id, uploaded_at DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_member_portal_sessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_member_portal_sessions (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_member_portal_sessions PRIMARY KEY,
        tenant_id INT NOT NULL,
        member_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME2(0) NOT NULL,
        revoked_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_member_portal_sessions_created DEFAULT (SYSUTCDATETIME()),
        last_seen_at DATETIME2(0) NULL,
        CONSTRAINT UQ_gym_member_portal_sessions_token UNIQUE (token_hash)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_member_portal_sessions_member' AND object_id=OBJECT_ID(N'dbo.gym_member_portal_sessions'))
    CREATE INDEX IX_gym_member_portal_sessions_member ON dbo.gym_member_portal_sessions(tenant_id, member_id, expires_at DESC, revoked_at);

IF OBJECT_ID(N'dbo.gym_member_portal_visit_daily', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_member_portal_visit_daily (
        tenant_id INT NOT NULL,
        visit_date DATE NOT NULL,
        page_views BIGINT NOT NULL CONSTRAINT DF_gym_member_portal_visit_daily_page_views DEFAULT (0),
        unique_visitors_estimate BIGINT NOT NULL CONSTRAINT DF_gym_member_portal_visit_daily_unique DEFAULT (0),
        authenticated_members BIGINT NOT NULL CONSTRAINT DF_gym_member_portal_visit_daily_authenticated DEFAULT (0),
        last_visit_at DATETIME2(0) NULL,
        CONSTRAINT PK_gym_member_portal_visit_daily PRIMARY KEY (tenant_id, visit_date),
        CONSTRAINT CK_gym_member_portal_visit_daily_counts CHECK (page_views >= 0 AND unique_visitors_estimate >= 0 AND authenticated_members >= 0)
    );
END;

IF OBJECT_ID(N'dbo.gym_member_portal_visit_visitors', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_member_portal_visit_visitors (
        tenant_id INT NOT NULL,
        visit_date DATE NOT NULL,
        visitor_hash CHAR(64) NOT NULL,
        first_seen_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_member_portal_visit_visitors_first_seen DEFAULT (SYSUTCDATETIME()),
        last_seen_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_member_portal_visit_visitors_last_seen DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_gym_member_portal_visit_visitors PRIMARY KEY (tenant_id, visit_date, visitor_hash)
    );
END;
