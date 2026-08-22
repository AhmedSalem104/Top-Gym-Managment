IF OBJECT_ID(N'dbo.members', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.members (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_members PRIMARY KEY,
        full_name NVARCHAR(120) NOT NULL,
        phone NVARCHAR(30) NOT NULL,
        phone_normalized NVARCHAR(30) NULL,
        email NVARCHAR(254) NULL,
        registration_date DATE NOT NULL,
        notes NVARCHAR(1000) NULL,
        membership_code_hash CHAR(64) NULL,
        membership_code_ciphertext NVARCHAR(512) NULL,
        membership_code_version INT NOT NULL CONSTRAINT DF_members_membership_code_version DEFAULT (1),
        membership_code_issued_at DATETIME2(0) NULL,
        membership_code_revoked_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_members_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_members_updated_at DEFAULT (SYSUTCDATETIME())
    );
END;

IF COL_LENGTH(N'dbo.members', N'membership_code_hash') IS NULL
    EXEC(N'ALTER TABLE dbo.members ADD membership_code_hash CHAR(64) NULL;');
IF COL_LENGTH(N'dbo.members', N'membership_code_ciphertext') IS NULL
    EXEC(N'ALTER TABLE dbo.members ADD membership_code_ciphertext NVARCHAR(512) NULL;');
IF COL_LENGTH(N'dbo.members', N'membership_code_version') IS NULL
    EXEC(N'ALTER TABLE dbo.members ADD membership_code_version INT NOT NULL CONSTRAINT DF_members_membership_code_version_migration DEFAULT (1);');
IF COL_LENGTH(N'dbo.members', N'membership_code_issued_at') IS NULL
    EXEC(N'ALTER TABLE dbo.members ADD membership_code_issued_at DATETIME2(0) NULL;');
IF COL_LENGTH(N'dbo.members', N'membership_code_revoked_at') IS NULL
    EXEC(N'ALTER TABLE dbo.members ADD membership_code_revoked_at DATETIME2(0) NULL;');
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_members_membership_code_hash'
      AND object_id = OBJECT_ID(N'dbo.members')
)
BEGIN
    CREATE UNIQUE INDEX UX_members_membership_code_hash
        ON dbo.members(membership_code_hash)
        WHERE membership_code_hash IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.gym_membership_code_audit', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_membership_code_audit (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_membership_code_audit PRIMARY KEY,
        member_id INT NOT NULL,
        action VARCHAR(30) NOT NULL,
        actor_user_id INT NULL,
        ip_address VARCHAR(64) NULL,
        user_agent NVARCHAR(512) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_membership_code_audit_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_membership_code_audit_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_membership_code_audit_action CHECK (action IN ('issued', 'viewed', 'whatsapp_sent', 'rotated', 'portal_viewed'))
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_membership_code_audit_member_date'
      AND object_id = OBJECT_ID(N'dbo.gym_membership_code_audit')
)
BEGIN
    CREATE INDEX IX_gym_membership_code_audit_member_date
        ON dbo.gym_membership_code_audit(member_id, created_at DESC, id DESC);
END;

-- Public member-portal feedback. The membership code is resolved to member_id
-- before insert and is intentionally never stored in this table.
IF OBJECT_ID(N'dbo.gym_member_feedback', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_member_feedback (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_member_feedback PRIMARY KEY,
        member_id INT NOT NULL,
        rating TINYINT NOT NULL,
        note_type VARCHAR(32) NOT NULL,
        message NVARCHAR(4000) NOT NULL,
        submitted_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_member_feedback_submitted DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_member_feedback_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_member_feedback_rating CHECK (rating BETWEEN 1 AND 5),
        CONSTRAINT CK_gym_member_feedback_note_type CHECK (note_type IN ('general', 'problem', 'complaint', 'suggestion', 'feature_request'))
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_member_feedback_submitted'
      AND object_id = OBJECT_ID(N'dbo.gym_member_feedback')
)
    CREATE INDEX IX_gym_member_feedback_submitted
        ON dbo.gym_member_feedback(submitted_at DESC, id DESC);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_member_feedback_member'
      AND object_id = OBJECT_ID(N'dbo.gym_member_feedback')
)
    CREATE INDEX IX_gym_member_feedback_member
        ON dbo.gym_member_feedback(member_id, submitted_at DESC, id DESC);

-- Application authentication is intentionally separate from gym members.
-- Passwords are stored as scrypt hashes and sessions as revocable token hashes.
IF OBJECT_ID(N'dbo.gym_users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_users (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_users PRIMARY KEY,
        full_name NVARCHAR(120) NOT NULL,
        username NVARCHAR(254) NULL,
        email NVARCHAR(254) NOT NULL,
        email_normalized NVARCHAR(254) NOT NULL,
        password_hash NVARCHAR(512) NOT NULL,
        role VARCHAR(20) NOT NULL CONSTRAINT DF_gym_users_role DEFAULT ('Assistant'),
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_users_status DEFAULT ('Active'),
        last_login_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_users_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_users_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_users_email UNIQUE (email_normalized),
        CONSTRAINT CK_gym_users_role CHECK (role IN ('Owner', 'Assistant')),
        CONSTRAINT CK_gym_users_status CHECK ((role = 'Owner' AND status = 'Active') OR (role = 'Assistant' AND status IN ('Active', 'Disabled')))
    );
END;

-- Backward-compatible migration for an older gym_users table that used
-- username/is_active. Existing rows are preserved and can be edited by Owner.
IF OBJECT_ID(N'dbo.gym_users', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.gym_users', N'username') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD username NVARCHAR(254) NULL;');
    IF COL_LENGTH(N'dbo.gym_users', N'email') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD email NVARCHAR(254) NULL;');
    IF COL_LENGTH(N'dbo.gym_users', N'email_normalized') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD email_normalized NVARCHAR(254) NULL;');
    IF COL_LENGTH(N'dbo.gym_users', N'status') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD status VARCHAR(20) NULL;');
    IF COL_LENGTH(N'dbo.gym_users', N'last_login_at') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD last_login_at DATETIME2(0) NULL;');

    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_gym_users_role' AND parent_object_id = OBJECT_ID(N'dbo.gym_users'))
        EXEC(N'ALTER TABLE dbo.gym_users DROP CONSTRAINT CK_gym_users_role;');
    IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_gym_users_status' AND parent_object_id = OBJECT_ID(N'dbo.gym_users'))
        EXEC(N'ALTER TABLE dbo.gym_users DROP CONSTRAINT CK_gym_users_status;');

    IF COL_LENGTH(N'dbo.gym_users', N'is_active') IS NOT NULL
    BEGIN
        EXEC(N'
            UPDATE dbo.gym_users
            SET role = CASE LOWER(LTRIM(RTRIM(role))) WHEN ''owner'' THEN ''Owner'' WHEN ''manager'' THEN ''Owner'' ELSE ''Assistant'' END;
            UPDATE dbo.gym_users
            SET email = COALESCE(NULLIF(LTRIM(RTRIM(email)), ''''), NULLIF(LTRIM(RTRIM(username)), ''''), CONCAT(''legacy-'', CONVERT(VARCHAR(20), id), ''@topgym.local''))
            WHERE email IS NULL OR LTRIM(RTRIM(email)) = '''';
            UPDATE dbo.gym_users
            SET email_normalized = LOWER(LTRIM(RTRIM(email)))
            WHERE email_normalized IS NULL OR LTRIM(RTRIM(email_normalized)) = '''';
            UPDATE dbo.gym_users
            SET status = CASE WHEN role = ''Owner'' OR ISNULL(is_active, 1) = 1 THEN ''Active'' ELSE ''Disabled'' END
            WHERE status IS NULL OR LTRIM(RTRIM(status)) = '''';
        ');
    END
    ELSE
    BEGIN
        EXEC(N'
            UPDATE dbo.gym_users
            SET role = CASE LOWER(LTRIM(RTRIM(role))) WHEN ''owner'' THEN ''Owner'' WHEN ''manager'' THEN ''Owner'' ELSE ''Assistant'' END;
            UPDATE dbo.gym_users
            SET email = COALESCE(NULLIF(LTRIM(RTRIM(email)), ''''), NULLIF(LTRIM(RTRIM(username)), ''''), CONCAT(''legacy-'', CONVERT(VARCHAR(20), id), ''@topgym.local''))
            WHERE email IS NULL OR LTRIM(RTRIM(email)) = '''';
            UPDATE dbo.gym_users
            SET email_normalized = LOWER(LTRIM(RTRIM(email)))
            WHERE email_normalized IS NULL OR LTRIM(RTRIM(email_normalized)) = '''';
            UPDATE dbo.gym_users
            SET status = ''Active''
            WHERE status IS NULL OR LTRIM(RTRIM(status)) = '''';
        ');
    END;

    EXEC(N'ALTER TABLE dbo.gym_users ALTER COLUMN email NVARCHAR(254) NOT NULL;');
    EXEC(N'ALTER TABLE dbo.gym_users ALTER COLUMN email_normalized NVARCHAR(254) NOT NULL;');
    EXEC(N'ALTER TABLE dbo.gym_users ALTER COLUMN status VARCHAR(20) NOT NULL;');
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_gym_users_role' AND parent_object_id = OBJECT_ID(N'dbo.gym_users'))
        EXEC(N'ALTER TABLE dbo.gym_users ADD CONSTRAINT CK_gym_users_role CHECK (role IN (''Owner'', ''Assistant''));');
    IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_gym_users_status' AND parent_object_id = OBJECT_ID(N'dbo.gym_users'))
        EXEC(N'ALTER TABLE dbo.gym_users ADD CONSTRAINT CK_gym_users_status CHECK ((role = ''Owner'' AND status = ''Active'') OR (role = ''Assistant'' AND status IN (''Active'', ''Disabled'')));');
    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'UQ_gym_users_email'
          AND object_id = OBJECT_ID(N'dbo.gym_users')
    )
        EXEC(N'CREATE UNIQUE INDEX UQ_gym_users_email ON dbo.gym_users(email_normalized);');
END;

IF OBJECT_ID(N'dbo.gym_auth_sessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_auth_sessions (
        id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_gym_auth_sessions PRIMARY KEY DEFAULT (NEWID()),
        user_id INT NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME2(0) NOT NULL,
        revoked_at DATETIME2(0) NULL,
        ip_address NVARCHAR(64) NULL,
        user_agent NVARCHAR(512) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_auth_sessions_created_at DEFAULT (SYSUTCDATETIME()),
        last_seen_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_auth_sessions_last_seen_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_auth_sessions_token UNIQUE (token_hash),
        CONSTRAINT FK_gym_auth_sessions_user FOREIGN KEY (user_id)
            REFERENCES dbo.gym_users(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_auth_sessions_user_expiry'
      AND object_id = OBJECT_ID(N'dbo.gym_auth_sessions')
)
BEGIN
    CREATE INDEX IX_gym_auth_sessions_user_expiry
        ON dbo.gym_auth_sessions(user_id, expires_at DESC, revoked_at);
END;

IF OBJECT_ID(N'dbo.memberships', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.memberships (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_memberships PRIMARY KEY,
        member_id INT NOT NULL,
        membership_plan VARCHAR(30) NOT NULL CONSTRAINT DF_memberships_plan DEFAULT ('gym_only'),
        membership_type VARCHAR(30) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_memberships_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_memberships_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_memberships_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_memberships_dates CHECK (end_date >= start_date)
    );
END;

IF OBJECT_ID(N'dbo.membership_pricing', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_pricing (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_membership_pricing PRIMARY KEY,
        plan_code VARCHAR(30) NOT NULL,
        plan_name NVARCHAR(80) NOT NULL,
        monthly_price DECIMAL(12,2) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_membership_pricing_active DEFAULT (1),
        sort_order INT NOT NULL CONSTRAINT DF_membership_pricing_sort DEFAULT (0),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_pricing_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_pricing_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_membership_pricing_code UNIQUE (plan_code),
        CONSTRAINT CK_membership_pricing_price CHECK (monthly_price >= 0)
    );
END;

IF COL_LENGTH(N'dbo.membership_pricing', N'plan_code') IS NOT NULL
BEGIN
    EXEC(N'ALTER TABLE dbo.membership_pricing ALTER COLUMN plan_code VARCHAR(30) NOT NULL;');
END;

IF COL_LENGTH(N'dbo.membership_pricing', N'is_active') IS NULL
BEGIN
    ALTER TABLE dbo.membership_pricing
        ADD is_active BIT NOT NULL CONSTRAINT DF_membership_pricing_active_migration DEFAULT (1);
END;

IF COL_LENGTH(N'dbo.membership_pricing', N'sort_order') IS NULL
BEGIN
    ALTER TABLE dbo.membership_pricing
        ADD sort_order INT NOT NULL CONSTRAINT DF_membership_pricing_sort_migration DEFAULT (0);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.membership_pricing WHERE plan_code = 'gym_only')
BEGIN
    INSERT INTO dbo.membership_pricing (plan_code, plan_name, monthly_price)
    VALUES ('gym_only', N'جيم فقط', 305);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.membership_pricing WHERE plan_code = 'gym_cardio')
BEGIN
    INSERT INTO dbo.membership_pricing (plan_code, plan_name, monthly_price)
    VALUES ('gym_cardio', N'جيم وكارديو', 400);
END;

UPDATE dbo.membership_pricing
SET plan_name = CASE plan_code
    WHEN 'gym_only' THEN N'جيم فقط'
    WHEN 'gym_cardio' THEN N'جيم وكارديو'
    ELSE plan_name
END
WHERE plan_code IN ('gym_only', 'gym_cardio')
  AND plan_name LIKE N'%?%';

IF OBJECT_ID(N'dbo.membership_types', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_types (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_membership_types PRIMARY KEY,
        type_code VARCHAR(30) NOT NULL,
        type_name NVARCHAR(80) NOT NULL,
        duration_mode VARCHAR(10) NOT NULL,
        duration_value DECIMAL(8,2) NOT NULL,
        price_multiplier DECIMAL(8,4) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_membership_types_active DEFAULT (1),
        sort_order INT NOT NULL CONSTRAINT DF_membership_types_sort DEFAULT (0),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_types_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_types_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_membership_types_code UNIQUE (type_code),
        CONSTRAINT CK_membership_types_mode CHECK (duration_mode IN ('months', 'days')),
        CONSTRAINT CK_membership_types_values CHECK (duration_value > 0 AND price_multiplier > 0)
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.membership_types WHERE type_code = 'monthly')
BEGIN
    INSERT INTO dbo.membership_types (type_code, type_name, duration_mode, duration_value, price_multiplier, sort_order)
    VALUES ('monthly', N'شهرية', 'months', 1, 1, 1);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.membership_types WHERE type_code = 'half_month')
BEGIN
    INSERT INTO dbo.membership_types (type_code, type_name, duration_mode, duration_value, price_multiplier, sort_order)
    VALUES ('half_month', N'نصف شهر', 'days', 15, 0.5, 2);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.membership_types WHERE type_code = 'quarterly')
BEGIN
    INSERT INTO dbo.membership_types (type_code, type_name, duration_mode, duration_value, price_multiplier, sort_order)
    VALUES ('quarterly', N'ربع سنوية', 'months', 3, 3, 3);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.membership_types WHERE type_code = 'semiannual')
BEGIN
    INSERT INTO dbo.membership_types (type_code, type_name, duration_mode, duration_value, price_multiplier, sort_order)
    VALUES ('semiannual', N'نصف سنوية', 'months', 6, 6, 4);
END;

IF NOT EXISTS (SELECT 1 FROM dbo.membership_types WHERE type_code = 'annual')
BEGIN
    INSERT INTO dbo.membership_types (type_code, type_name, duration_mode, duration_value, price_multiplier, sort_order)
    VALUES ('annual', N'سنوية', 'months', 12, 12, 5);
END;

IF OBJECT_ID(N'dbo.membership_type_prices', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_type_prices (
        plan_code VARCHAR(30) NOT NULL,
        type_code VARCHAR(30) NOT NULL,
        price DECIMAL(12,2) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_type_prices_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_type_prices_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_membership_type_prices PRIMARY KEY (plan_code, type_code),
        CONSTRAINT FK_membership_type_prices_plan FOREIGN KEY (plan_code)
            REFERENCES dbo.membership_pricing(plan_code) ON DELETE CASCADE,
        CONSTRAINT FK_membership_type_prices_type FOREIGN KEY (type_code)
            REFERENCES dbo.membership_types(type_code) ON DELETE CASCADE,
        CONSTRAINT CK_membership_type_prices_price CHECK (price >= 0)
    );
END;

IF OBJECT_ID(N'dbo.gym_day_pass_types', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_day_pass_types (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_day_pass_types PRIMARY KEY,
        type_code VARCHAR(40) NOT NULL,
        type_name NVARCHAR(120) NOT NULL,
        price DECIMAL(12,2) NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_gym_day_pass_types_active DEFAULT (1),
        sort_order INT NOT NULL CONSTRAINT DF_gym_day_pass_types_sort DEFAULT (0),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_day_pass_types_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_day_pass_types_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_gym_day_pass_types_code UNIQUE (type_code),
        CONSTRAINT CK_gym_day_pass_types_price CHECK (price > 0)
    );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.gym_day_pass_types WHERE type_code = 'day_gym')
    INSERT INTO dbo.gym_day_pass_types (type_code, type_name, price, sort_order)
    VALUES ('day_gym', N'حصة جيم فقط', 30, 1);

IF NOT EXISTS (SELECT 1 FROM dbo.gym_day_pass_types WHERE type_code = 'day_gym_cardio')
    INSERT INTO dbo.gym_day_pass_types (type_code, type_name, price, sort_order)
    VALUES ('day_gym_cardio', N'حصة جيم وكارديو', 40, 2);

IF OBJECT_ID(N'dbo.gym_day_pass_sales', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_day_pass_sales (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_day_pass_sales PRIMARY KEY,
        visitor_name NVARCHAR(120) NOT NULL,
        visitor_phone NVARCHAR(30) NOT NULL,
        visitor_phone_normalized NVARCHAR(30) NOT NULL,
        pass_type_code VARCHAR(40) NOT NULL,
        pass_type_name NVARCHAR(120) NOT NULL,
        amount_due DECIMAL(12,2) NOT NULL,
        amount_paid DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL CONSTRAINT DF_gym_day_pass_sales_method DEFAULT ('cash'),
        visit_date DATE NOT NULL,
        notes NVARCHAR(500) NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_day_pass_sales_status DEFAULT ('completed'),
        created_by_user_id INT NULL,
        whatsapp_opened_at DATETIME2(0) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_day_pass_sales_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_day_pass_sales_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_day_pass_sales_type FOREIGN KEY (pass_type_code)
            REFERENCES dbo.gym_day_pass_types(type_code) ON DELETE NO ACTION,
        CONSTRAINT CK_gym_day_pass_sales_amounts CHECK (amount_due > 0 AND amount_paid = amount_due),
        CONSTRAINT CK_gym_day_pass_sales_method CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
        CONSTRAINT CK_gym_day_pass_sales_status CHECK (status IN ('completed', 'voided'))
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_day_pass_sales_date' AND object_id = OBJECT_ID(N'dbo.gym_day_pass_sales'))
    CREATE INDEX IX_gym_day_pass_sales_date ON dbo.gym_day_pass_sales(visit_date DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_day_pass_sales_type_date' AND object_id = OBJECT_ID(N'dbo.gym_day_pass_sales'))
    CREATE INDEX IX_gym_day_pass_sales_type_date ON dbo.gym_day_pass_sales(pass_type_code, visit_date DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_day_pass_sales_phone' AND object_id = OBJECT_ID(N'dbo.gym_day_pass_sales'))
    CREATE INDEX IX_gym_day_pass_sales_phone ON dbo.gym_day_pass_sales(visitor_phone_normalized, visit_date DESC, id DESC);

IF COL_LENGTH(N'dbo.memberships', N'membership_type') IS NOT NULL
BEGIN
    EXEC(N'ALTER TABLE dbo.memberships ALTER COLUMN membership_type VARCHAR(30) NOT NULL;');
END;

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_memberships_type' AND parent_object_id = OBJECT_ID(N'dbo.memberships')
)
BEGIN
    EXEC(N'ALTER TABLE dbo.memberships DROP CONSTRAINT CK_memberships_type;');
END;

IF OBJECT_ID(N'dbo.membership_freezes', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_freezes (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_membership_freezes PRIMARY KEY,
        membership_id INT NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        resumed_date DATE NULL,
        reason NVARCHAR(500) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_freezes_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_freezes_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_membership_freezes_membership FOREIGN KEY (membership_id)
            REFERENCES dbo.memberships(id) ON DELETE CASCADE,
        CONSTRAINT CK_membership_freezes_dates CHECK (end_date >= start_date),
        CONSTRAINT CK_membership_freezes_resumed_date CHECK (resumed_date IS NULL OR resumed_date >= start_date)
    );
END;

-- The shared database already contains an unrelated dbo.Payments table.
-- Keep it untouched and use a dedicated table for this application.
IF OBJECT_ID(N'dbo.gym_payments', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_payments (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_payments PRIMARY KEY,
        membership_id INT NOT NULL,
        list_price DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_payments_list_price DEFAULT (0),
        discount_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_payments_discount DEFAULT (0),
        amount_due DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_payments_amount_due DEFAULT (0),
        amount_paid DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_payments_amount_paid DEFAULT (0),
        payment_method VARCHAR(20) NOT NULL CONSTRAINT DF_gym_payments_method DEFAULT ('cash'),
        paid_at DATE NULL,
        notes NVARCHAR(500) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_payments_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_payments_updated_at DEFAULT (SYSUTCDATETIME()),
        amount_remaining AS CONVERT(DECIMAL(12,2), amount_due - amount_paid) PERSISTED,
        CONSTRAINT UQ_gym_payments_membership UNIQUE (membership_id),
        CONSTRAINT FK_gym_payments_membership FOREIGN KEY (membership_id)
            REFERENCES dbo.memberships(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_payments_amounts CHECK (amount_due >= 0 AND amount_paid >= 0 AND amount_paid <= amount_due),
        CONSTRAINT CK_gym_payments_discount CHECK (list_price >= 0 AND discount_amount >= 0 AND discount_amount <= list_price AND amount_due = list_price - discount_amount),
        CONSTRAINT CK_gym_payments_method CHECK (payment_method IN ('cash', 'card', 'transfer', 'other'))
    );
END;

-- Immutable payment transactions used for the member financial ledger and receipts.
IF OBJECT_ID(N'dbo.gym_payment_transactions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_payment_transactions (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_payment_transactions PRIMARY KEY,
        membership_id INT NOT NULL,
        transaction_type VARCHAR(20) NOT NULL CONSTRAINT DF_gym_payment_transactions_type DEFAULT ('payment'),
        list_price DECIMAL(12,2) NOT NULL,
        discount_amount DECIMAL(12,2) NOT NULL,
        amount_due DECIMAL(12,2) NOT NULL,
        amount_paid DECIMAL(12,2) NOT NULL,
        amount_remaining DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL CONSTRAINT DF_gym_payment_transactions_method DEFAULT ('cash'),
        paid_at DATE NULL,
        notes NVARCHAR(500) NULL,
        source_payment_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_payment_transactions_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_payment_transactions_membership FOREIGN KEY (membership_id)
            REFERENCES dbo.memberships(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_payment_transactions_type CHECK (transaction_type IN ('subscription', 'payment', 'adjustment')),
        CONSTRAINT CK_gym_payment_transactions_amounts CHECK (
            list_price >= 0 AND discount_amount >= 0 AND discount_amount <= list_price
            AND amount_due = list_price - discount_amount
            AND amount_remaining >= 0 AND amount_remaining <= amount_due
            AND ((transaction_type = 'adjustment' AND amount_paid <> 0) OR (transaction_type <> 'adjustment' AND amount_paid > 0))
        ),
        CONSTRAINT CK_gym_payment_transactions_method CHECK (payment_method IN ('cash', 'card', 'transfer', 'other'))
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_payment_transactions_membership_date'
      AND object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
)
BEGIN
    CREATE INDEX IX_gym_payment_transactions_membership_date
        ON dbo.gym_payment_transactions(membership_id, created_at DESC, id DESC);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_payment_transactions_paid_at'
      AND object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
)
BEGIN
    CREATE INDEX IX_gym_payment_transactions_paid_at
        ON dbo.gym_payment_transactions(paid_at DESC, id DESC);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_gym_payment_transactions_source_payment'
      AND object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
)
BEGIN
    CREATE UNIQUE INDEX UX_gym_payment_transactions_source_payment
        ON dbo.gym_payment_transactions(source_payment_id)
        WHERE source_payment_id IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.gym_expenses', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_expenses (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_expenses PRIMARY KEY,
        expense_name NVARCHAR(120) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        expense_date DATE NOT NULL,
        notes NVARCHAR(500) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_expenses_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_expenses_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_expenses_amount CHECK (amount > 0)
    );
END;

IF OBJECT_ID(N'dbo.gym_attendance', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_attendance (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_attendance PRIMARY KEY,
        member_id INT NOT NULL,
        membership_id INT NULL,
        attendance_date DATE NOT NULL,
        check_in_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_attendance_check_in DEFAULT (SYSUTCDATETIME()),
        check_out_at DATETIME2(0) NULL,
        check_in_source VARCHAR(10) NOT NULL CONSTRAINT DF_gym_attendance_source DEFAULT ('phone'),
        check_out_source VARCHAR(10) NULL,
        notes NVARCHAR(250) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_attendance_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_attendance_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_attendance_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_attendance_check_out CHECK (check_out_at IS NULL OR check_out_at >= check_in_at),
        CONSTRAINT CK_gym_attendance_source CHECK (
            check_in_source IN ('phone', 'qr', 'manual')
            AND (check_out_source IS NULL OR check_out_source IN ('phone', 'qr', 'manual', 'auto'))
        )
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_gym_attendance_member_date'
      AND object_id = OBJECT_ID(N'dbo.gym_attendance')
)
BEGIN
    CREATE UNIQUE INDEX UX_gym_attendance_member_date
        ON dbo.gym_attendance(member_id, attendance_date);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_attendance_date'
      AND object_id = OBJECT_ID(N'dbo.gym_attendance')
)
BEGIN
    CREATE INDEX IX_gym_attendance_date
        ON dbo.gym_attendance(attendance_date DESC, check_in_at DESC, id DESC);
END;

-- Safe migrations for databases that were initialized before pricing was added.
IF COL_LENGTH(N'dbo.memberships', N'membership_plan') IS NULL
BEGIN
    ALTER TABLE dbo.memberships
        ADD membership_plan VARCHAR(30) NOT NULL CONSTRAINT DF_memberships_plan_migration DEFAULT ('gym_only');
END;

IF COL_LENGTH(N'dbo.members', N'phone_normalized') IS NULL
BEGIN
    ALTER TABLE dbo.members ADD phone_normalized NVARCHAR(30) NULL;
END;

EXEC(N'UPDATE dbo.members
       SET phone_normalized = phone
       WHERE phone_normalized IS NULL OR LTRIM(RTRIM(phone_normalized)) = N'''';');

IF COL_LENGTH(N'dbo.memberships', N'membership_plan') IS NOT NULL
BEGIN
    EXEC(N'ALTER TABLE dbo.memberships ALTER COLUMN membership_plan VARCHAR(30) NOT NULL;');
END;

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_memberships_plan' AND parent_object_id = OBJECT_ID(N'dbo.memberships')
)
BEGIN
    EXEC(N'ALTER TABLE dbo.memberships DROP CONSTRAINT CK_memberships_plan;');
END;

IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_memberships_plan_migration' AND parent_object_id = OBJECT_ID(N'dbo.memberships')
)
BEGIN
    EXEC(N'ALTER TABLE dbo.memberships DROP CONSTRAINT CK_memberships_plan_migration;');
END;

IF COL_LENGTH(N'dbo.gym_payments', N'list_price') IS NULL
BEGIN
    ALTER TABLE dbo.gym_payments
        ADD list_price DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_payments_list_price_migration DEFAULT (0);
    EXEC(N'UPDATE dbo.gym_payments SET list_price = amount_due WHERE list_price = 0 AND amount_due > 0;');
END;

IF COL_LENGTH(N'dbo.gym_payments', N'discount_amount') IS NULL
BEGIN
    ALTER TABLE dbo.gym_payments
        ADD discount_amount DECIMAL(12,2) NOT NULL CONSTRAINT DF_gym_payments_discount_migration DEFAULT (0);
END;

-- Preserve existing paid totals as one migrated ledger entry. New payments are
-- appended by the application and never overwrite historical transactions.
IF OBJECT_ID(N'dbo.gym_payment_transactions', N'U') IS NOT NULL
BEGIN
    INSERT INTO dbo.gym_payment_transactions
        (membership_id, transaction_type, list_price, discount_amount, amount_due,
         amount_paid, amount_remaining, payment_method, paid_at, notes, source_payment_id, created_at)
    SELECT p.membership_id, 'subscription', p.list_price, p.discount_amount, p.amount_due,
           p.amount_paid, p.amount_remaining, p.payment_method, p.paid_at,
           CASE WHEN p.notes IS NULL THEN N'تم ترحيله من سجل الدفع السابق.' ELSE p.notes END,
           p.id, p.created_at
    FROM dbo.gym_payments AS p
    WHERE p.amount_paid > 0
      AND NOT EXISTS (
          SELECT 1 FROM dbo.gym_payment_transactions AS t
          WHERE t.source_payment_id = p.id
             OR (t.membership_id = p.membership_id AND t.transaction_type = 'subscription')
      );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name IN (N'CK_gym_payments_discount', N'CK_gym_payments_discount_migration')
      AND parent_object_id = OBJECT_ID(N'dbo.gym_payments')
)
BEGIN
    EXEC(N'ALTER TABLE dbo.gym_payments ADD CONSTRAINT CK_gym_payments_discount_migration
        CHECK (list_price >= 0 AND discount_amount >= 0 AND discount_amount <= list_price AND amount_due = list_price - discount_amount);');
END;

IF OBJECT_ID(N'dbo.membership_events', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_events (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_membership_events PRIMARY KEY,
        member_id INT NOT NULL,
        membership_id INT NULL,
        event_type VARCHAR(30) NOT NULL,
        details NVARCHAR(MAX) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_events_created_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_membership_events_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT FK_membership_events_membership FOREIGN KEY (membership_id)
            REFERENCES dbo.memberships(id) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_members_phone' AND object_id = OBJECT_ID(N'dbo.members')
)
BEGIN
    CREATE INDEX IX_members_phone ON dbo.members(phone);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_members_phone_normalized' AND object_id = OBJECT_ID(N'dbo.members')
)
BEGIN
    EXEC(N'CREATE INDEX IX_members_phone_normalized ON dbo.members(phone_normalized);');
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_memberships_member_end' AND object_id = OBJECT_ID(N'dbo.memberships')
)
BEGIN
    CREATE INDEX IX_memberships_member_end ON dbo.memberships(member_id, end_date DESC);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_memberships_member_latest_cover' AND object_id = OBJECT_ID(N'dbo.memberships')
)
BEGIN
    CREATE INDEX IX_memberships_member_latest_cover
        ON dbo.memberships(member_id, end_date DESC, id DESC)
        INCLUDE (membership_plan, membership_type, start_date, notes);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_membership_freezes_membership_dates' AND object_id = OBJECT_ID(N'dbo.membership_freezes')
)
BEGIN
    CREATE INDEX IX_membership_freezes_membership_dates
        ON dbo.membership_freezes(membership_id, start_date, end_date, resumed_date);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_membership_freezes_active_lookup' AND object_id = OBJECT_ID(N'dbo.membership_freezes')
)
BEGIN
    CREATE INDEX IX_membership_freezes_active_lookup
        ON dbo.membership_freezes(membership_id, resumed_date, start_date, end_date);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_membership_events_member_created' AND object_id = OBJECT_ID(N'dbo.membership_events')
)
BEGIN
    CREATE INDEX IX_membership_events_member_created
        ON dbo.membership_events(member_id, created_at DESC);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_payments_membership' AND object_id = OBJECT_ID(N'dbo.gym_payments')
)
BEGIN
    CREATE INDEX IX_gym_payments_membership ON dbo.gym_payments(membership_id);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_expenses_date' AND object_id = OBJECT_ID(N'dbo.gym_expenses')
)
BEGIN
    CREATE INDEX IX_gym_expenses_date ON dbo.gym_expenses(expense_date DESC, id DESC);
END;

-- Training and nutrition library imported from the LogicFit seed data.
IF OBJECT_ID(N'dbo.gym_muscles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_muscles (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_muscles PRIMARY KEY,
        source_id INT NULL CONSTRAINT UQ_gym_muscles_source UNIQUE,
        name NVARCHAR(120) NOT NULL,
        name_ar NVARCHAR(120) NULL,
        body_part NVARCHAR(80) NULL,
        description NVARCHAR(1000) NULL,
        description_ar NVARCHAR(1000) NULL,
        icon NVARCHAR(20) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_muscles_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_muscles_updated DEFAULT (SYSUTCDATETIME())
    );
END;

IF OBJECT_ID(N'dbo.gym_foods', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_foods (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_foods PRIMARY KEY,
        source_id INT NULL CONSTRAINT UQ_gym_foods_source UNIQUE,
        name_ar NVARCHAR(160) NULL,
        name_en NVARCHAR(160) NULL,
        category NVARCHAR(80) NULL,
        calories DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_calories DEFAULT (0),
        protein DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_protein DEFAULT (0),
        carbs DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_carbs DEFAULT (0),
        fat DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_fat DEFAULT (0),
        fiber DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_fiber DEFAULT (0),
        sugar DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_sugar DEFAULT (0),
        sodium DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_sodium DEFAULT (0),
        serving_size DECIMAL(12,3) NOT NULL CONSTRAINT DF_gym_foods_serving_size DEFAULT (100),
        serving_unit NVARCHAR(40) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_foods_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_foods_updated DEFAULT (SYSUTCDATETIME())
    );
END;

IF OBJECT_ID(N'dbo.gym_exercises', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_exercises (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_exercises PRIMARY KEY,
        source_id INT NULL CONSTRAINT UQ_gym_exercises_source UNIQUE,
        name NVARCHAR(160) NOT NULL,
        name_ar NVARCHAR(160) NULL,
        description NVARCHAR(2000) NULL,
        description_ar NVARCHAR(2000) NULL,
        target_muscle_id INT NULL,
        secondary_muscles_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_secondary DEFAULT (N'[]'),
        equipment NVARCHAR(100) NULL,
        is_high_impact BIT NOT NULL CONSTRAINT DF_gym_exercises_impact DEFAULT (0),
        difficulty NVARCHAR(60) NULL,
        category NVARCHAR(80) NULL,
        movement_pattern NVARCHAR(80) NULL,
        mechanic NVARCHAR(80) NULL,
        force NVARCHAR(80) NULL,
        instructions_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_instructions DEFAULT (N'[]'),
        instructions_ar_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_instructions_ar DEFAULT (N'[]'),
        tips_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_tips DEFAULT (N'[]'),
        tips_ar_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_tips_ar DEFAULT (N'[]'),
        common_mistakes_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_mistakes DEFAULT (N'[]'),
        common_mistakes_ar_json NVARCHAR(MAX) NOT NULL CONSTRAINT DF_gym_exercises_mistakes_ar DEFAULT (N'[]'),
        reps_range NVARCHAR(40) NULL,
        sets_range NVARCHAR(40) NULL,
        rest_seconds INT NULL,
        tempo NVARCHAR(40) NULL,
        icon NVARCHAR(20) NULL,
        video_url NVARCHAR(1000) NULL,
        metadata_json NVARCHAR(MAX) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_exercises_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_exercises_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_exercises_target_muscle FOREIGN KEY (target_muscle_id)
            REFERENCES dbo.gym_muscles(id) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_muscles_body_part' AND object_id = OBJECT_ID(N'dbo.gym_muscles')
)
BEGIN
    CREATE INDEX IX_gym_muscles_body_part ON dbo.gym_muscles(body_part, name_ar, name);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_foods_category' AND object_id = OBJECT_ID(N'dbo.gym_foods')
)
BEGIN
    CREATE INDEX IX_gym_foods_category ON dbo.gym_foods(category, name_ar, name_en);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_exercises_filters' AND object_id = OBJECT_ID(N'dbo.gym_exercises')
)
BEGIN
    CREATE INDEX IX_gym_exercises_filters
        ON dbo.gym_exercises(category, difficulty, equipment, target_muscle_id, name_ar);
END;

-- Client training, nutrition and progress extension. The existing members table
-- remains the single client identity; a client may have zero or more gym
-- memberships and can still own training data without a gym subscription.
IF OBJECT_ID(N'dbo.workout_programs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_programs (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_programs PRIMARY KEY,
        member_id INT NOT NULL,
        name NVARCHAR(160) NOT NULL,
        description NVARCHAR(2000) NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        duration_weeks INT NULL,
        goal NVARCHAR(60) NULL,
        level NVARCHAR(40) NULL,
        days_per_week INT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_workout_programs_status DEFAULT ('active'),
        notes NVARCHAR(2000) NULL,
        version INT NOT NULL CONSTRAINT DF_workout_programs_version DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_programs_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_programs_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_workout_programs_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_workout_programs_dates CHECK (end_date IS NULL OR end_date >= start_date),
        CONSTRAINT CK_workout_programs_duration CHECK (duration_weeks IS NULL OR duration_weeks BETWEEN 1 AND 520),
        CONSTRAINT CK_workout_programs_days CHECK (days_per_week IS NULL OR days_per_week BETWEEN 1 AND 7),
        CONSTRAINT CK_workout_programs_status CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived'))
    );
END;

IF OBJECT_ID(N'dbo.workout_routines', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_routines (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_routines PRIMARY KEY,
        program_id INT NOT NULL,
        name NVARCHAR(160) NOT NULL,
        day_of_week INT NULL,
        sort_order INT NOT NULL CONSTRAINT DF_workout_routines_sort DEFAULT (0),
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_routines_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_routines_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_workout_routines_program FOREIGN KEY (program_id)
            REFERENCES dbo.workout_programs(id) ON DELETE CASCADE,
        CONSTRAINT CK_workout_routines_day CHECK (day_of_week IS NULL OR day_of_week BETWEEN 1 AND 7)
    );
END;

IF OBJECT_ID(N'dbo.workout_exercises', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_exercises (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_exercises PRIMARY KEY,
        routine_id INT NOT NULL,
        exercise_id INT NOT NULL,
        sort_order INT NOT NULL CONSTRAINT DF_workout_exercises_sort DEFAULT (0),
        sets INT NOT NULL CONSTRAINT DF_workout_exercises_sets DEFAULT (3),
        reps_min INT NULL,
        reps_max INT NULL,
        weight_kg DECIMAL(10,2) NULL,
        rest_seconds INT NULL,
        tempo NVARCHAR(40) NULL,
        superset_group_id NVARCHAR(40) NULL,
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_exercises_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_exercises_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_workout_exercises_routine FOREIGN KEY (routine_id)
            REFERENCES dbo.workout_routines(id) ON DELETE CASCADE,
        CONSTRAINT FK_workout_exercises_library FOREIGN KEY (exercise_id)
            REFERENCES dbo.gym_exercises(id) ON DELETE NO ACTION,
        CONSTRAINT CK_workout_exercises_sets CHECK (sets BETWEEN 1 AND 100),
        CONSTRAINT CK_workout_exercises_reps CHECK (reps_min IS NULL OR reps_min BETWEEN 1 AND 1000),
        CONSTRAINT CK_workout_exercises_reps_max CHECK (reps_max IS NULL OR reps_max BETWEEN 1 AND 1000),
        CONSTRAINT CK_workout_exercises_reps_range CHECK (reps_max IS NULL OR reps_min IS NULL OR reps_max >= reps_min),
        CONSTRAINT CK_workout_exercises_weight CHECK (weight_kg IS NULL OR weight_kg >= 0),
        CONSTRAINT CK_workout_exercises_rest CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 7200)
    );
END;

IF OBJECT_ID(N'dbo.diet_plans', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.diet_plans (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_diet_plans PRIMARY KEY,
        member_id INT NOT NULL,
        name NVARCHAR(160) NOT NULL,
        description NVARCHAR(2000) NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        meals_per_day INT NULL,
        target_calories DECIMAL(12,2) NULL,
        target_protein DECIMAL(12,2) NULL,
        target_carbs DECIMAL(12,2) NULL,
        target_fats DECIMAL(12,2) NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_diet_plans_status DEFAULT ('active'),
        notes NVARCHAR(2000) NULL,
        version INT NOT NULL CONSTRAINT DF_diet_plans_version DEFAULT (1),
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_plans_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_plans_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_diet_plans_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_diet_plans_dates CHECK (end_date IS NULL OR end_date >= start_date),
        CONSTRAINT CK_diet_plans_meals CHECK (meals_per_day IS NULL OR meals_per_day BETWEEN 1 AND 12),
        CONSTRAINT CK_diet_plans_calories CHECK (target_calories IS NULL OR target_calories >= 0),
        CONSTRAINT CK_diet_plans_macros CHECK (
            (target_protein IS NULL OR target_protein >= 0) AND
            (target_carbs IS NULL OR target_carbs >= 0) AND
            (target_fats IS NULL OR target_fats >= 0)
        ),
        CONSTRAINT CK_diet_plans_status CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived'))
    );
END;

IF OBJECT_ID(N'dbo.diet_meals', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.diet_meals (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_diet_meals PRIMARY KEY,
        diet_plan_id INT NOT NULL,
        name NVARCHAR(120) NOT NULL,
        meal_time VARCHAR(10) NULL,
        sort_order INT NOT NULL CONSTRAINT DF_diet_meals_sort DEFAULT (0),
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_meals_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_meals_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_diet_meals_plan FOREIGN KEY (diet_plan_id)
            REFERENCES dbo.diet_plans(id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'dbo.diet_meal_items', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.diet_meal_items (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_diet_meal_items PRIMARY KEY,
        meal_id INT NOT NULL,
        food_id INT NOT NULL,
        sort_order INT NOT NULL CONSTRAINT DF_diet_meal_items_sort DEFAULT (0),
        assigned_quantity DECIMAL(12,3) NOT NULL,
        serving_unit NVARCHAR(40) NULL,
        calc_calories DECIMAL(12,3) NOT NULL CONSTRAINT DF_diet_meal_items_calories DEFAULT (0),
        calc_protein DECIMAL(12,3) NOT NULL CONSTRAINT DF_diet_meal_items_protein DEFAULT (0),
        calc_carbs DECIMAL(12,3) NOT NULL CONSTRAINT DF_diet_meal_items_carbs DEFAULT (0),
        calc_fats DECIMAL(12,3) NOT NULL CONSTRAINT DF_diet_meal_items_fats DEFAULT (0),
        notes NVARCHAR(500) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_meal_items_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_diet_meal_items_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_diet_meal_items_meal FOREIGN KEY (meal_id)
            REFERENCES dbo.diet_meals(id) ON DELETE CASCADE,
        CONSTRAINT FK_diet_meal_items_food FOREIGN KEY (food_id)
            REFERENCES dbo.gym_foods(id) ON DELETE NO ACTION,
        CONSTRAINT CK_diet_meal_items_quantity CHECK (assigned_quantity > 0)
    );
END;

IF OBJECT_ID(N'dbo.body_measurements', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.body_measurements (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_body_measurements PRIMARY KEY,
        member_id INT NOT NULL,
        measured_at DATE NOT NULL,
        weight_kg DECIMAL(8,2) NULL,
        height_cm DECIMAL(8,2) NULL,
        body_fat_percent DECIMAL(5,2) NULL,
        chest_cm DECIMAL(8,2) NULL,
        waist_cm DECIMAL(8,2) NULL,
        hips_cm DECIMAL(8,2) NULL,
        arms_cm DECIMAL(8,2) NULL,
        thighs_cm DECIMAL(8,2) NULL,
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_body_measurements_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_body_measurements_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_body_measurements_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE
    );
END;

IF OBJECT_ID(N'dbo.workout_sessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_sessions (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_sessions PRIMARY KEY,
        member_id INT NOT NULL,
        program_id INT NULL,
        routine_id INT NULL,
        started_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_sessions_started DEFAULT (SYSUTCDATETIME()),
        ended_at DATETIME2(0) NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_workout_sessions_status DEFAULT ('started'),
        notes NVARCHAR(1000) NULL,
        CONSTRAINT FK_workout_sessions_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT FK_workout_sessions_program FOREIGN KEY (program_id)
            REFERENCES dbo.workout_programs(id) ON DELETE NO ACTION,
        CONSTRAINT FK_workout_sessions_routine FOREIGN KEY (routine_id)
            REFERENCES dbo.workout_routines(id) ON DELETE NO ACTION,
        CONSTRAINT CK_workout_sessions_status CHECK (status IN ('started', 'completed', 'cancelled'))
    );
END;

IF OBJECT_ID(N'dbo.workout_set_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.workout_set_logs (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_workout_set_logs PRIMARY KEY,
        session_id INT NOT NULL,
        workout_exercise_id INT NULL,
        set_number INT NOT NULL,
        weight_kg DECIMAL(10,2) NULL,
        reps INT NULL,
        completed_at DATETIME2(0) NOT NULL CONSTRAINT DF_workout_set_logs_completed DEFAULT (SYSUTCDATETIME()),
        notes NVARCHAR(500) NULL,
        CONSTRAINT FK_workout_set_logs_session FOREIGN KEY (session_id)
            REFERENCES dbo.workout_sessions(id) ON DELETE CASCADE,
        CONSTRAINT FK_workout_set_logs_exercise FOREIGN KEY (workout_exercise_id)
            REFERENCES dbo.workout_exercises(id) ON DELETE NO ACTION,
        CONSTRAINT CK_workout_set_logs_set CHECK (set_number BETWEEN 1 AND 100),
        CONSTRAINT CK_workout_set_logs_reps CHECK (reps IS NULL OR reps BETWEEN 0 AND 1000),
        CONSTRAINT CK_workout_set_logs_weight CHECK (weight_kg IS NULL OR weight_kg >= 0)
    );
END;

IF OBJECT_ID(N'dbo.meal_logs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.meal_logs (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_meal_logs PRIMARY KEY,
        member_id INT NOT NULL,
        meal_item_id INT NULL,
        consumed_quantity DECIMAL(12,3) NOT NULL,
        consumed_at DATETIME2(0) NOT NULL CONSTRAINT DF_meal_logs_consumed DEFAULT (SYSUTCDATETIME()),
        calc_calories DECIMAL(12,3) NOT NULL CONSTRAINT DF_meal_logs_calories DEFAULT (0),
        calc_protein DECIMAL(12,3) NOT NULL CONSTRAINT DF_meal_logs_protein DEFAULT (0),
        calc_carbs DECIMAL(12,3) NOT NULL CONSTRAINT DF_meal_logs_carbs DEFAULT (0),
        calc_fats DECIMAL(12,3) NOT NULL CONSTRAINT DF_meal_logs_fats DEFAULT (0),
        notes NVARCHAR(500) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_meal_logs_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_meal_logs_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT FK_meal_logs_item FOREIGN KEY (meal_item_id)
            REFERENCES dbo.diet_meal_items(id) ON DELETE NO ACTION,
        CONSTRAINT CK_meal_logs_quantity CHECK (consumed_quantity > 0)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_programs_member_status' AND object_id = OBJECT_ID(N'dbo.workout_programs'))
    CREATE INDEX IX_workout_programs_member_status ON dbo.workout_programs(member_id, status, start_date DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_routines_program_sort' AND object_id = OBJECT_ID(N'dbo.workout_routines'))
    CREATE INDEX IX_workout_routines_program_sort ON dbo.workout_routines(program_id, sort_order, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_exercises_routine_sort' AND object_id = OBJECT_ID(N'dbo.workout_exercises'))
    CREATE INDEX IX_workout_exercises_routine_sort ON dbo.workout_exercises(routine_id, sort_order, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_diet_plans_member_status' AND object_id = OBJECT_ID(N'dbo.diet_plans'))
    CREATE INDEX IX_diet_plans_member_status ON dbo.diet_plans(member_id, status, start_date DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_diet_meals_plan_sort' AND object_id = OBJECT_ID(N'dbo.diet_meals'))
    CREATE INDEX IX_diet_meals_plan_sort ON dbo.diet_meals(diet_plan_id, sort_order, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_diet_meal_items_meal_sort' AND object_id = OBJECT_ID(N'dbo.diet_meal_items'))
    CREATE INDEX IX_diet_meal_items_meal_sort ON dbo.diet_meal_items(meal_id, sort_order, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_body_measurements_member_date' AND object_id = OBJECT_ID(N'dbo.body_measurements'))
    CREATE INDEX IX_body_measurements_member_date ON dbo.body_measurements(member_id, measured_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_sessions_member_started' AND object_id = OBJECT_ID(N'dbo.workout_sessions'))
    CREATE INDEX IX_workout_sessions_member_started ON dbo.workout_sessions(member_id, started_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_workout_set_logs_session' AND object_id = OBJECT_ID(N'dbo.workout_set_logs'))
    CREATE INDEX IX_workout_set_logs_session ON dbo.workout_set_logs(session_id, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_meal_logs_member_consumed' AND object_id = OBJECT_ID(N'dbo.meal_logs'))
    CREATE INDEX IX_meal_logs_member_consumed ON dbo.meal_logs(member_id, consumed_at DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_backup_operations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_backup_operations (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_operations PRIMARY KEY,
        operation_type VARCHAR(20) NOT NULL,
        file_name NVARCHAR(260) NULL,
        source_generated_at DATETIME2(0) NULL,
        row_count INT NOT NULL CONSTRAINT DF_gym_backup_operations_rows DEFAULT (0),
        table_counts NVARCHAR(MAX) NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_backup_operations_status DEFAULT ('success'),
        details NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_operations_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_backup_operations_type CHECK (operation_type IN ('download', 'inspect', 'restore')),
        CONSTRAINT CK_gym_backup_operations_status CHECK (status IN ('success', 'failed'))
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_backup_operations_created' AND object_id = OBJECT_ID(N'dbo.gym_backup_operations'))
    CREATE INDEX IX_gym_backup_operations_created ON dbo.gym_backup_operations(created_at DESC, id DESC);

IF OBJECT_ID(N'dbo.gym_backup_archives', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_backup_archives (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_backup_archives PRIMARY KEY,
        backup_day DATE NOT NULL,
        file_name NVARCHAR(260) NOT NULL,
        backup_format VARCHAR(10) NOT NULL,
        generated_at DATETIME2(0) NOT NULL,
        content VARBINARY(MAX) NOT NULL,
        content_bytes BIGINT NOT NULL,
        row_count INT NOT NULL CONSTRAINT DF_gym_backup_archives_rows DEFAULT (0),
        table_counts NVARCHAR(MAX) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_backup_archives_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT CK_gym_backup_archives_format CHECK (backup_format IN ('json.gz', 'bak')),
        CONSTRAINT UQ_gym_backup_archives_day_format UNIQUE (backup_day, backup_format)
    );
END;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_gym_backup_archives_created' AND object_id = OBJECT_ID(N'dbo.gym_backup_archives'))
    CREATE INDEX IX_gym_backup_archives_created ON dbo.gym_backup_archives(created_at DESC, id DESC);

-- Contact state for recurring member alerts. The alert key is a stable snapshot
-- of the reason for the alert, so the UI can distinguish new alerts from a
-- reminder that was already opened or confirmed as sent.
IF OBJECT_ID(N'dbo.gym_alert_communications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_alert_communications (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_gym_alert_communications PRIMARY KEY,
        member_id INT NOT NULL,
        channel VARCHAR(20) NOT NULL CONSTRAINT DF_gym_alert_communications_channel DEFAULT ('whatsapp'),
        alert_kind VARCHAR(20) NOT NULL,
        alert_key NVARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL CONSTRAINT DF_gym_alert_communications_status DEFAULT ('opened'),
        opened_at DATETIME2(0) NULL,
        sent_at DATETIME2(0) NULL,
        send_count INT NOT NULL CONSTRAINT DF_gym_alert_communications_send_count DEFAULT (0),
        created_by_user_id INT NULL,
        last_action_user_id INT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_alert_communications_created DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_alert_communications_updated DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_gym_alert_communications_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_gym_alert_communications_channel CHECK (channel IN ('whatsapp')),
        CONSTRAINT CK_gym_alert_communications_kind CHECK (alert_kind IN ('membership', 'debt', 'inactive')),
        CONSTRAINT CK_gym_alert_communications_status CHECK (status IN ('opened', 'sent'))
    );
END;
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_gym_alert_communications_identity'
      AND object_id = OBJECT_ID(N'dbo.gym_alert_communications')
)
    CREATE UNIQUE INDEX UQ_gym_alert_communications_identity
        ON dbo.gym_alert_communications(member_id, channel, alert_kind, alert_key);
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_gym_alert_communications_member_updated'
      AND object_id = OBJECT_ID(N'dbo.gym_alert_communications')
)
    CREATE INDEX IX_gym_alert_communications_member_updated
        ON dbo.gym_alert_communications(member_id, updated_at DESC, id DESC);
