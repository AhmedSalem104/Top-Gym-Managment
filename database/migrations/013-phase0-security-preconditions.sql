/*
   Logic Fit migration 013: Phase 0 security preconditions.

   This migration makes the password-recovery state part of the canonical
   schema. It is additive and idempotent. The runtime auth guard keeps the
   same checks for backward-compatible application boots, while the explicit
   migration runner applies this contract before a deployment is considered
   ready.
*/

IF OBJECT_ID(N'dbo.gym_users', N'U') IS NOT NULL
BEGIN
    IF COL_LENGTH(N'dbo.gym_users', N'must_change_password') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD must_change_password BIT NOT NULL CONSTRAINT DF_gym_users_must_change_password DEFAULT (0) WITH VALUES;');

    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id=OBJECT_ID(N'dbo.gym_users')
          AND name=N'must_change_password'
          AND system_type_id<>104
    )
        THROW 51013, 'gym_users.must_change_password must be BIT; migration stopped safely.', 1;

    IF COL_LENGTH(N'dbo.gym_users', N'password_changed_at') IS NULL
        EXEC(N'ALTER TABLE dbo.gym_users ADD password_changed_at DATETIME2(0) NULL;');

    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id=OBJECT_ID(N'dbo.gym_users')
          AND name=N'password_changed_at'
          AND (system_type_id<>42 OR scale<>0)
    )
        THROW 51014, 'gym_users.password_changed_at must be DATETIME2(0); migration stopped safely.', 1;

    EXEC(N'UPDATE dbo.gym_users SET must_change_password=0 WHERE must_change_password IS NULL;');

    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id=OBJECT_ID(N'dbo.gym_users')
          AND name=N'must_change_password'
          AND is_nullable=1
    )
        ALTER TABLE dbo.gym_users ALTER COLUMN must_change_password BIT NOT NULL;

    IF EXISTS (
        SELECT 1
        FROM sys.columns c
        WHERE c.object_id=OBJECT_ID(N'dbo.gym_users')
          AND c.name=N'password_changed_at'
          AND c.is_nullable=0
    )
        ALTER TABLE dbo.gym_users ALTER COLUMN password_changed_at DATETIME2(0) NULL;
END;
