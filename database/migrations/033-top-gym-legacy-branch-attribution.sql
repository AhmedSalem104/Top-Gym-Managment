/*
  LOGIC_FIT_SAFE_DATA_BACKFILL: legacy-single-branch

  Safe, idempotent legacy branch attribution for Top Gym only.
  This migration changes branch attribution metadata only. It does not alter
  amounts, dates, membership state, or any business transaction content.
  The two legacy stock movements without a location remain intentionally
  untouched because their branch cannot be proven from an ownership relation.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @TenantId INT;
DECLARE @TargetBranchId INT = 1;

IF (SELECT COUNT_BIG(*)
    FROM dbo.gym_tenants
    WHERE slug = 'top-gym'
      AND tenant_type = 'gym'
      AND status = 'active') <> 1
    THROW 51331, 'Top Gym must resolve to exactly one active gym tenant.', 1;

SELECT TOP (1) @TenantId = id
FROM dbo.gym_tenants
WHERE slug = 'top-gym'
  AND tenant_type = 'gym'
  AND status = 'active';

IF (SELECT COUNT_BIG(*)
    FROM dbo.gym_branches
    WHERE tenant_id = @TenantId
      AND status = 'active') <> 1
    THROW 51332, 'Top Gym must have exactly one active branch for this backfill.', 1;

IF NOT EXISTS (
    SELECT 1
    FROM dbo.gym_branches
    WHERE id = @TargetBranchId
      AND tenant_id = @TenantId
      AND status = 'active'
      AND is_main_branch = 1
)
    THROW 51333, 'The approved Top Gym target branch is not the active main branch.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.gym_membership_branch_access
    WHERE tenant_id = @TenantId
      AND branch_id <> @TargetBranchId
)
    THROW 51334, 'Top Gym has an existing membership branch scope conflict.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.memberships AS membership
    LEFT JOIN dbo.members AS member
      ON member.id = membership.member_id
     AND member.tenant_id = membership.tenant_id
    WHERE membership.tenant_id = @TenantId
      AND membership.branch_access_mode <> 'single_branch'
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.gym_membership_branch_access AS access_row
          WHERE access_row.tenant_id = membership.tenant_id
            AND access_row.membership_id = membership.id
      )
)
    THROW 51335, 'An unmapped Top Gym membership has an ambiguous branch mode.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.memberships AS membership
    LEFT JOIN dbo.members AS member
      ON member.id = membership.member_id
    WHERE membership.tenant_id = @TenantId
      AND (member.id IS NULL OR member.tenant_id <> @TenantId)
)
    THROW 51336, 'A Top Gym membership has an invalid member ownership relation.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.gym_payments AS payment
    LEFT JOIN dbo.memberships AS membership
      ON membership.id = payment.membership_id
    WHERE payment.tenant_id = @TenantId
      AND payment.branch_id IS NULL
      AND (membership.id IS NULL OR membership.tenant_id <> @TenantId)
)
    THROW 51337, 'A Top Gym payment has an invalid membership ownership relation.', 1;

IF EXISTS (
    SELECT 1
    FROM dbo.gym_payment_transactions AS transaction_row
    LEFT JOIN dbo.memberships AS membership
      ON membership.id = transaction_row.membership_id
    WHERE transaction_row.tenant_id = @TenantId
      AND transaction_row.branch_id IS NULL
      AND (
          transaction_row.membership_id IS NULL
          OR transaction_row.trainer_package_purchase_id IS NOT NULL
          OR membership.id IS NULL
          OR membership.tenant_id <> @TenantId
      )
)
    THROW 51338, 'A Top Gym transaction has an ambiguous branch ownership relation.', 1;

MERGE dbo.gym_membership_branch_access WITH (HOLDLOCK) AS target
USING (
    SELECT membership.tenant_id,
           membership.id AS membership_id,
           @TargetBranchId AS branch_id
    FROM dbo.memberships AS membership
    INNER JOIN dbo.members AS member
      ON member.id = membership.member_id
     AND member.tenant_id = membership.tenant_id
    WHERE membership.tenant_id = @TenantId
      AND membership.branch_access_mode = 'single_branch'
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.gym_membership_branch_access AS existing_access
          WHERE existing_access.tenant_id = membership.tenant_id
            AND existing_access.membership_id = membership.id
      )
) AS source
ON target.tenant_id = source.tenant_id
AND target.membership_id = source.membership_id
AND target.branch_id = source.branch_id
WHEN NOT MATCHED BY TARGET THEN
    INSERT (tenant_id, membership_id, branch_id)
    VALUES (source.tenant_id, source.membership_id, source.branch_id);

MERGE dbo.gym_payments WITH (HOLDLOCK) AS target
USING (
    SELECT payment.id, @TargetBranchId AS branch_id
    FROM dbo.gym_payments AS payment
    INNER JOIN dbo.memberships AS membership
      ON membership.id = payment.membership_id
     AND membership.tenant_id = payment.tenant_id
    INNER JOIN dbo.gym_membership_branch_access AS access_row
      ON access_row.tenant_id = membership.tenant_id
     AND access_row.membership_id = membership.id
     AND access_row.branch_id = @TargetBranchId
    WHERE payment.tenant_id = @TenantId
      AND payment.branch_id IS NULL
    GROUP BY payment.id
) AS source
ON target.id = source.id
AND target.tenant_id = @TenantId
WHEN MATCHED AND target.branch_id IS NULL THEN
    UPDATE SET branch_id = source.branch_id;

MERGE dbo.gym_payment_transactions WITH (HOLDLOCK) AS target
USING (
    SELECT transaction_row.id, @TargetBranchId AS branch_id
    FROM dbo.gym_payment_transactions AS transaction_row
    INNER JOIN dbo.memberships AS membership
      ON membership.id = transaction_row.membership_id
     AND membership.tenant_id = transaction_row.tenant_id
    INNER JOIN dbo.gym_membership_branch_access AS access_row
      ON access_row.tenant_id = membership.tenant_id
     AND access_row.membership_id = membership.id
     AND access_row.branch_id = @TargetBranchId
    WHERE transaction_row.tenant_id = @TenantId
      AND transaction_row.branch_id IS NULL
      AND transaction_row.membership_id IS NOT NULL
      AND transaction_row.trainer_package_purchase_id IS NULL
    GROUP BY transaction_row.id
) AS source
ON target.id = source.id
AND target.tenant_id = @TenantId
WHEN MATCHED AND target.branch_id IS NULL THEN
    UPDATE SET branch_id = source.branch_id;
