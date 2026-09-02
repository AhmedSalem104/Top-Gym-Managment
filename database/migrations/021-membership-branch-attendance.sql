/*
  Membership eligibility and attendance branch attribution.

  This migration runs after the first tenant-column/RLS pass in the
  canonical runner. Existing memberships and attendance records are safely
  attributed to each Gym tenant's deterministic main branch. Independent
  Trainer tenants are never assigned branch records.
*/

IF COL_LENGTH(N'dbo.memberships', N'branch_access_mode') IS NULL
    ALTER TABLE dbo.memberships
        ADD branch_access_mode VARCHAR(24) NOT NULL
            CONSTRAINT DF_memberships_branch_access_mode DEFAULT ('single_branch');

-- SQL Server binds a static batch before executing its first statement. The
-- column added above therefore cannot be referenced later in the same static
-- batch on a cold schema. Compile the dependent validation/constraint batch
-- only after the conditional ALTER TABLE has completed.
EXEC sys.sp_executesql N'
    IF EXISTS (
        SELECT 1 FROM dbo.memberships
        WHERE branch_access_mode NOT IN (''single_branch'', ''selected_branches'', ''all_branches'')
    )
    BEGIN
        THROW 51301, ''Membership branch access contains an unsupported value.'', 1;
    END;

    IF NOT EXISTS (
        SELECT 1
        FROM sys.check_constraints
        WHERE name=N''CK_memberships_branch_access_mode''
          AND parent_object_id=OBJECT_ID(N''dbo.memberships'')
    )
    BEGIN
        ALTER TABLE dbo.memberships ADD CONSTRAINT CK_memberships_branch_access_mode
            CHECK (branch_access_mode IN (''single_branch'', ''selected_branches'', ''all_branches''));
    END;';

IF OBJECT_ID(N'dbo.gym_membership_branch_access', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.gym_membership_branch_access (
        tenant_id INT NOT NULL,
        membership_id INT NOT NULL,
        branch_id INT NOT NULL,
        created_at DATETIME2(0) NOT NULL CONSTRAINT DF_gym_membership_branch_access_created DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT PK_gym_membership_branch_access PRIMARY KEY (membership_id, branch_id),
        CONSTRAINT FK_gym_membership_branch_access_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id),
        CONSTRAINT FK_gym_membership_branch_access_membership FOREIGN KEY (membership_id) REFERENCES dbo.memberships(id) ON DELETE CASCADE,
        CONSTRAINT FK_gym_membership_branch_access_branch FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_membership_branch_access_tenant_branch'
      AND object_id=OBJECT_ID(N'dbo.gym_membership_branch_access')
)
    CREATE INDEX IX_gym_membership_branch_access_tenant_branch
        ON dbo.gym_membership_branch_access(tenant_id, branch_id, membership_id);

IF COL_LENGTH(N'dbo.gym_attendance', N'branch_id') IS NULL
    ALTER TABLE dbo.gym_attendance ADD branch_id INT NULL;

-- Legacy attendance keeps its historical tenant/member relationship and is
-- attributed to the only operational branch that existed at the time.
EXEC sys.sp_executesql N'
    UPDATE attendance
       SET branch_id = branch.id
    FROM dbo.gym_attendance AS attendance
    INNER JOIN dbo.members AS member ON member.id = attendance.member_id
    INNER JOIN dbo.gym_branches AS branch
            ON branch.tenant_id = member.tenant_id
           AND branch.is_main_branch = 1
    WHERE attendance.branch_id IS NULL;';

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name=N'FK_gym_attendance_branch'
      AND parent_object_id=OBJECT_ID(N'dbo.gym_attendance')
)
    ALTER TABLE dbo.gym_attendance ADD CONSTRAINT FK_gym_attendance_branch
        FOREIGN KEY (branch_id) REFERENCES dbo.gym_branches(id);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_attendance_tenant_branch_date'
      AND object_id=OBJECT_ID(N'dbo.gym_attendance')
)
    CREATE INDEX IX_gym_attendance_tenant_branch_date
        ON dbo.gym_attendance(tenant_id, branch_id, attendance_date DESC, check_in_at DESC, id DESC);

-- A legacy membership has one default branch. Explicit future modes are
-- represented by rows in this table and are not silently expanded.
-- Keep the final backfill in a separate compile scope for the same reason.
EXEC sys.sp_executesql N'
    MERGE dbo.gym_membership_branch_access AS target
    USING (
        SELECT membership.tenant_id, membership.id AS membership_id, branch.id AS branch_id
        FROM dbo.memberships AS membership
        INNER JOIN dbo.gym_branches AS branch
                ON branch.tenant_id = membership.tenant_id
               AND branch.is_main_branch = 1
        WHERE membership.branch_access_mode = ''single_branch''
    ) AS source
    ON target.membership_id=source.membership_id AND target.branch_id=source.branch_id
    WHEN NOT MATCHED THEN
        INSERT (tenant_id, membership_id, branch_id)
        VALUES (source.tenant_id, source.membership_id, source.branch_id);';
