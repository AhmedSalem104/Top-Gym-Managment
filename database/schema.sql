IF OBJECT_ID(N'dbo.members', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.members (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_members PRIMARY KEY,
        full_name NVARCHAR(120) NOT NULL,
        phone NVARCHAR(30) NOT NULL,
        email NVARCHAR(254) NULL,
        registration_date DATE NOT NULL,
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_members_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_members_updated_at DEFAULT (SYSUTCDATETIME())
    );
END;

IF OBJECT_ID(N'dbo.memberships', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.memberships (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_memberships PRIMARY KEY,
        member_id INT NOT NULL,
        membership_plan VARCHAR(20) NOT NULL CONSTRAINT DF_memberships_plan DEFAULT ('gym_only'),
        membership_type VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        notes NVARCHAR(1000) NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_memberships_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_memberships_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_memberships_member FOREIGN KEY (member_id)
            REFERENCES dbo.members(id) ON DELETE CASCADE,
        CONSTRAINT CK_memberships_type CHECK (membership_type IN ('monthly', 'quarterly', 'semiannual', 'annual')),
        CONSTRAINT CK_memberships_plan CHECK (membership_plan IN ('gym_only', 'gym_cardio')),
        CONSTRAINT CK_memberships_dates CHECK (end_date >= start_date)
    );
END;

IF OBJECT_ID(N'dbo.membership_pricing', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.membership_pricing (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_membership_pricing PRIMARY KEY,
        plan_code VARCHAR(20) NOT NULL,
        plan_name NVARCHAR(80) NOT NULL,
        monthly_price DECIMAL(12,2) NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_pricing_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_membership_pricing_updated_at DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT UQ_membership_pricing_code UNIQUE (plan_code),
        CONSTRAINT CK_membership_pricing_price CHECK (monthly_price >= 0)
    );
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

-- Safe migrations for databases that were initialized before pricing was added.
IF COL_LENGTH(N'dbo.memberships', N'membership_plan') IS NULL
BEGIN
    ALTER TABLE dbo.memberships
        ADD membership_plan VARCHAR(20) NOT NULL CONSTRAINT DF_memberships_plan_migration DEFAULT ('gym_only');
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name IN (N'CK_memberships_plan', N'CK_memberships_plan_migration')
      AND parent_object_id = OBJECT_ID(N'dbo.memberships')
)
BEGIN
    EXEC(N'ALTER TABLE dbo.memberships ADD CONSTRAINT CK_memberships_plan_migration
        CHECK (membership_plan IN (''gym_only'', ''gym_cardio''));');
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
    WHERE name = N'IX_memberships_member_end' AND object_id = OBJECT_ID(N'dbo.memberships')
)
BEGIN
    CREATE INDEX IX_memberships_member_end ON dbo.memberships(member_id, end_date DESC);
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
