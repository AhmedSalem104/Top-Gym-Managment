/*
   Logic Fit migration 012: payment-ledger integrity.

   Payment transactions are append-only financial facts. A correction must
   preserve the original row and mark it void with an auditable reason; it
   must never silently delete or rewrite a collected amount.

   The idempotency hash is optional for backward compatibility with existing
   callers, but every new payment mutation in the application supplies it.
*/

IF OBJECT_ID(N'dbo.gym_payment_transactions', N'U') IS NULL
    THROW 51212, 'gym_payment_transactions must exist before migration 012.', 1;

IF COL_LENGTH(N'dbo.gym_payment_transactions', N'is_voided') IS NULL
    ALTER TABLE dbo.gym_payment_transactions
        ADD is_voided BIT NOT NULL CONSTRAINT DF_gym_payment_transactions_voided DEFAULT (0);

IF COL_LENGTH(N'dbo.gym_payment_transactions', N'voided_at') IS NULL
    ALTER TABLE dbo.gym_payment_transactions ADD voided_at DATETIME2(0) NULL;

IF COL_LENGTH(N'dbo.gym_payment_transactions', N'voided_by_user_id') IS NULL
    ALTER TABLE dbo.gym_payment_transactions ADD voided_by_user_id INT NULL;

IF COL_LENGTH(N'dbo.gym_payment_transactions', N'void_reason') IS NULL
    ALTER TABLE dbo.gym_payment_transactions ADD void_reason NVARCHAR(500) NULL;

IF COL_LENGTH(N'dbo.gym_payment_transactions', N'idempotency_key_hash') IS NULL
    ALTER TABLE dbo.gym_payment_transactions ADD idempotency_key_hash CHAR(64) NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE name = N'CK_gym_payment_transactions_void_state'
      AND parent_object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
)
BEGIN
    EXEC(N'ALTER TABLE dbo.gym_payment_transactions
        ADD CONSTRAINT CK_gym_payment_transactions_void_state
        CHECK (is_voided = 0 OR (voided_at IS NOT NULL AND void_reason IS NOT NULL AND LEN(LTRIM(RTRIM(void_reason))) > 0));');
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_gym_payment_transactions_idempotency'
      AND object_id = OBJECT_ID(N'dbo.gym_payment_transactions')
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX UX_gym_payment_transactions_idempotency
          ON dbo.gym_payment_transactions(idempotency_key_hash)
          WHERE idempotency_key_hash IS NOT NULL;');
END;
