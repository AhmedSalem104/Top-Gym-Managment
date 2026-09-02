/*
  Financial branch attribution is additive. NULL branch_id explicitly means
  tenant-wide for expenses and transactions that have no operational branch;
  it never means an unknown tenant. Existing Gym records are attributed from
  their membership or deterministic main branch where that relationship
  exists. Trainer records remain NULL.
*/

IF COL_LENGTH(N'dbo.gym_payments', N'branch_id') IS NULL
    ALTER TABLE dbo.gym_payments ADD branch_id INT NULL;
IF COL_LENGTH(N'dbo.gym_payment_transactions', N'branch_id') IS NULL
    ALTER TABLE dbo.gym_payment_transactions ADD branch_id INT NULL;
IF COL_LENGTH(N'dbo.gym_subscription_refunds', N'branch_id') IS NULL
    ALTER TABLE dbo.gym_subscription_refunds ADD branch_id INT NULL;
IF COL_LENGTH(N'dbo.gym_expenses', N'branch_id') IS NULL
    ALTER TABLE dbo.gym_expenses ADD branch_id INT NULL;
IF COL_LENGTH(N'dbo.gym_day_pass_sales', N'branch_id') IS NULL
    ALTER TABLE dbo.gym_day_pass_sales ADD branch_id INT NULL;

EXEC sys.sp_executesql N'
    UPDATE payment
       SET branch_id = branch.id
    FROM dbo.gym_payments AS payment
    INNER JOIN dbo.memberships AS membership ON membership.id = payment.membership_id
    INNER JOIN dbo.gym_branches AS branch
            ON branch.tenant_id = membership.tenant_id
           AND branch.is_main_branch = 1
    WHERE payment.branch_id IS NULL;';

EXEC sys.sp_executesql N'
    UPDATE transaction_row
       SET branch_id = branch.id
    FROM dbo.gym_payment_transactions AS transaction_row
    INNER JOIN dbo.memberships AS membership ON membership.id = transaction_row.membership_id
    INNER JOIN dbo.gym_branches AS branch
            ON branch.tenant_id = membership.tenant_id
           AND branch.is_main_branch = 1
    WHERE transaction_row.branch_id IS NULL;';

EXEC sys.sp_executesql N'
    UPDATE refund
       SET branch_id = branch.id
    FROM dbo.gym_subscription_refunds AS refund
    INNER JOIN dbo.memberships AS membership ON membership.id = refund.membership_id
    INNER JOIN dbo.gym_branches AS branch
            ON branch.tenant_id = membership.tenant_id
           AND branch.is_main_branch = 1
    WHERE refund.branch_id IS NULL;';

EXEC sys.sp_executesql N'
    UPDATE sale
       SET branch_id = branch.id
    FROM dbo.gym_day_pass_sales AS sale
    INNER JOIN dbo.gym_tenants AS tenant ON tenant.id = sale.tenant_id
    INNER JOIN dbo.gym_branches AS branch
            ON branch.tenant_id = tenant.id
           AND branch.is_main_branch = 1
    WHERE sale.branch_id IS NULL;';

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name=N'FK_gym_payments_branch'
      AND parent_object_id=OBJECT_ID(N'dbo.gym_payments')
)
    ALTER TABLE dbo.gym_payments ADD CONSTRAINT FK_gym_payments_branch
        FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id);
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name=N'FK_gym_payment_transactions_branch'
      AND parent_object_id=OBJECT_ID(N'dbo.gym_payment_transactions')
)
    ALTER TABLE dbo.gym_payment_transactions ADD CONSTRAINT FK_gym_payment_transactions_branch
        FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id);
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name=N'FK_gym_subscription_refunds_branch'
      AND parent_object_id=OBJECT_ID(N'dbo.gym_subscription_refunds')
)
    ALTER TABLE dbo.gym_subscription_refunds ADD CONSTRAINT FK_gym_subscription_refunds_branch
        FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id);
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name=N'FK_gym_expenses_branch'
      AND parent_object_id=OBJECT_ID(N'dbo.gym_expenses')
)
    ALTER TABLE dbo.gym_expenses ADD CONSTRAINT FK_gym_expenses_branch
        FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id);
IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name=N'FK_gym_day_pass_sales_branch'
      AND parent_object_id=OBJECT_ID(N'dbo.gym_day_pass_sales')
)
    ALTER TABLE dbo.gym_day_pass_sales ADD CONSTRAINT FK_gym_day_pass_sales_branch
        FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_payments_branch_date' AND object_id=OBJECT_ID(N'dbo.gym_payments'))
    CREATE INDEX IX_gym_payments_branch_date ON dbo.gym_payments(branch_id, paid_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_payment_transactions_branch_date' AND object_id=OBJECT_ID(N'dbo.gym_payment_transactions'))
    CREATE INDEX IX_gym_payment_transactions_branch_date ON dbo.gym_payment_transactions(branch_id, paid_at DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_subscription_refunds_branch_date' AND object_id=OBJECT_ID(N'dbo.gym_subscription_refunds'))
    CREATE INDEX IX_gym_subscription_refunds_branch_date ON dbo.gym_subscription_refunds(branch_id, refund_date DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_expenses_branch_date' AND object_id=OBJECT_ID(N'dbo.gym_expenses'))
    CREATE INDEX IX_gym_expenses_branch_date ON dbo.gym_expenses(branch_id, expense_date DESC, id DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_gym_day_pass_sales_branch_date' AND object_id=OBJECT_ID(N'dbo.gym_day_pass_sales'))
    CREATE INDEX IX_gym_day_pass_sales_branch_date ON dbo.gym_day_pass_sales(branch_id, visit_date DESC, id DESC);
