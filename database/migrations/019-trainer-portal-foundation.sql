/* Phase 6: tenant-scoped portal audit metadata. */
IF OBJECT_ID(N'dbo.gym_tenants', N'U') IS NULL
   OR OBJECT_ID(N'dbo.members', N'U') IS NULL
   OR OBJECT_ID(N'dbo.gym_membership_code_audit', N'U') IS NULL
    THROW 51290, 'Phase 6 requires tenant, member and membership-code audit tables.', 1;

IF COL_LENGTH(N'dbo.gym_membership_code_audit', N'tenant_id') IS NULL
    ALTER TABLE dbo.gym_membership_code_audit ADD tenant_id INT NULL;

/* The only data movement is a deterministic, repeatable backfill for legacy
   audit rows. It never changes business values and only fills the new column. */
EXEC sys.sp_executesql N'
    UPDATE audit
    SET tenant_id = member.tenant_id
    FROM dbo.gym_membership_code_audit AS audit
    INNER JOIN dbo.members AS member ON member.id = audit.member_id
    WHERE audit.tenant_id IS NULL;';

IF EXISTS (SELECT 1 FROM dbo.gym_membership_code_audit WHERE tenant_id IS NULL)
    THROW 51291, 'Membership-code audit rows could not be assigned to a tenant.', 1;

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys
    WHERE name=N'FK_gym_membership_code_audit_tenant'
      AND parent_object_id=OBJECT_ID(N'dbo.gym_membership_code_audit')
)
    ALTER TABLE dbo.gym_membership_code_audit
        ADD CONSTRAINT FK_gym_membership_code_audit_tenant
        FOREIGN KEY (tenant_id) REFERENCES dbo.gym_tenants(id) ON DELETE CASCADE;

IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id=OBJECT_ID(N'dbo.gym_membership_code_audit')
      AND name=N'tenant_id'
      AND is_nullable=1
)
    ALTER TABLE dbo.gym_membership_code_audit ALTER COLUMN tenant_id INT NOT NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name=N'IX_gym_membership_code_audit_tenant_date'
      AND object_id=OBJECT_ID(N'dbo.gym_membership_code_audit')
)
    CREATE INDEX IX_gym_membership_code_audit_tenant_date
        ON dbo.gym_membership_code_audit(tenant_id, created_at DESC, id DESC);
